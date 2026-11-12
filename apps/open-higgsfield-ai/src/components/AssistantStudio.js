// Assistant: a chat agent that plans generations with the app's own models,
// presets and workflows, optimizes the prompt, and — once the user approves
// the plan — runs it through the same bridge the studios use (results land
// in the Library the normal way). Falls back to a deterministic local
// planner (src/lib/agent.js) when the AI chat backend cannot be reached.
import { kie } from '../lib/kie.js';
import { chatWithAgent, parsePlan, localPlan, detectKind, modelById } from '../lib/agent.js';
import { getVideoSpec } from '../lib/videoSpecs.js';
import { startGenerationJob, getPendingJobs, removePendingJob } from '../lib/pendingJobs.js';
import { esc } from '../lib/resultCards.js';

const STARTERS = [
    'A cinematic product video of my coffee brand for Instagram',
    'A realistic portrait photo, warm studio light',
    'A cartoon-style video of a cat astronaut, 5 seconds',
    'What can Seedance 2.0 do that Kling cannot?',
];

export function AssistantStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center bg-app-bg relative p-4 md:p-6 overflow-y-auto custom-scrollbar';

    const history = []; // { role, text } — text is the plain chat text (no plan block)
    let mode = 'ai'; // 'ai' | 'local' — decided by the first chat call
    let modeNoticeShown = false;
    let busy = false;
    let pendingBrief = null; // local mode: brief waiting on the image/video answer

    // --- Header ---
    const hero = document.createElement('div');
    hero.className = 'assistant-hero flex flex-col items-center mb-10 md:mb-20 animate-fade-in-up transition-all duration-700 text-center';
    hero.innerHTML = `
        <div class="mb-10 relative group">
            <div class="absolute inset-0 bg-primary/20 blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
            <div class="relative w-24 h-24 md:w-32 md:h-32 bg-primary/5 rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" class="text-primary opacity-20 absolute -right-4 -bottom-4"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"/></svg>
                <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow relative z-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" class="text-primary"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"/><path d="M18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>
                </div>
                <div class="absolute top-4 right-4 text-primary animate-pulse">✨</div>
            </div>
        </div>
        <h1 class="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-primary selection:text-black text-center px-4">Assistant</h1>
        <p class="text-secondary text-sm font-medium tracking-wide opacity-60 max-w-xl">Tell me what you want to make. I'll pick the model, set it up, rewrite your prompt, and generate it for you.</p>
        <span id="agent-mode" class="mt-3 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/10 text-secondary">AI planner</span>
    `;
    container.appendChild(hero);

    // --- Messages ---
    const thread = document.createElement('div');
    thread.className = 'w-full max-w-3xl flex flex-col gap-4 flex-1';
    container.appendChild(thread);

    const scrollDown = () => requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });

    function addBubble(role, text) {
        const row = document.createElement('div');
        row.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start items-end gap-2'} animate-fade-in-up`;
        if (role === 'assistant') {
            const avatar = document.createElement('span');
            avatar.className = 'w-7 h-7 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0';
            avatar.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z"/><path d="M18.5 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z"/></svg>';
            row.appendChild(avatar);
        }
        const bubble = document.createElement('div');
        bubble.className = role === 'user'
            ? 'max-w-[85%] bg-primary text-black font-medium text-sm leading-relaxed px-4 py-3 rounded-2xl rounded-br-md whitespace-pre-wrap'
            : 'max-w-[85%] bg-card-bg border border-white/10 text-white/90 text-sm leading-relaxed px-4 py-3 rounded-2xl rounded-bl-md whitespace-pre-wrap';
        bubble.textContent = text;
        row.appendChild(bubble);
        thread.appendChild(row);
        scrollDown();
        return bubble;
    }

    function addNote(text) {
        const note = document.createElement('div');
        note.className = 'text-center text-[11px] text-secondary/80 py-1';
        note.textContent = text;
        thread.appendChild(note);
        scrollDown();
    }

    // In-chat placeholder while a generation runs in the background queue.
    function addGenerating(plan) {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-3 bg-card-bg border border-white/10 rounded-2xl px-4 py-3 animate-fade-in-up';
        row.innerHTML = `<span class="w-5 h-5 shrink-0 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            <span class="text-xs text-white/80 leading-relaxed">Generating your ${esc(plan.kind)} with <b>${esc(plan.modelName || plan.model || '')}</b> — it keeps running in the background and lands in your Library. Keep chatting, or open the Library and I'll dock to the side.</span>`;
        thread.appendChild(row);
        scrollDown();
        return row;
    }

    // --- Plan card ---
    function addPlanCard(plan) {
        const model = modelById(plan.model);
        const card = document.createElement('div');
        card.className = 'bg-card-bg border border-primary/30 rounded-2xl p-4 md:p-5 flex flex-col gap-3 animate-fade-in-up shadow-3xl';

        const title = document.createElement('div');
        title.innerHTML = `<div class="text-[10px] font-bold uppercase tracking-widest text-primary">Plan — ready when you are</div>
            <div class="text-white font-black text-base mt-1">${esc(plan.kind === 'video' ? '🎬' : '🖼️')} ${esc(plan.modelName)} <span class="text-secondary font-bold text-xs">(${esc(plan.model)})</span></div>`;
        card.appendChild(title);

        const promptLabel = document.createElement('label');
        promptLabel.className = 'text-[10px] font-bold uppercase tracking-widest text-secondary';
        promptLabel.textContent = 'Optimized prompt (edit freely)';
        card.appendChild(promptLabel);
        const promptBox = document.createElement('textarea');
        promptBox.className = 'w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white leading-relaxed outline-none focus:border-primary/60 resize-y min-h-[90px]';
        promptBox.value = plan.prompt;
        card.appendChild(promptBox);

        // Settings selects, limited to what this model actually supports.
        const settings = document.createElement('div');
        settings.className = 'flex flex-wrap gap-2';
        const mkSelect = (label, values, current) => {
            const wrap = document.createElement('label');
            wrap.className = 'flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2';
            wrap.innerHTML = `<span class="text-[10px] font-bold uppercase tracking-widest text-secondary">${esc(label)}</span>`;
            const sel = document.createElement('select');
            sel.className = 'bg-transparent text-sm font-bold text-white outline-none [&>option]:bg-[#141414]';
            (values || []).forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = label === 'Duration' ? `${v}s` : v;
                if (String(v) === String(current)) opt.selected = true;
                sel.appendChild(opt);
            });
            wrap.appendChild(sel);
            settings.appendChild(wrap);
            return sel;
        };
        const arSel = mkSelect('Ratio', model?.aspects || [plan.aspect_ratio], plan.aspect_ratio);
        const resSel = model?.resolutions?.length ? mkSelect('Quality', model.resolutions, plan.resolution) : null;
        let durSel = null;
        if (plan.kind === 'video') {
            const durations = getVideoSpec(plan.model)?.durations || model?.durations || [plan.duration || 5];
            durSel = mkSelect('Duration', durations, plan.duration || durations[0]);
        }
        card.appendChild(settings);

        // Optional start/reference image.
        let imageUrl = null;
        const attachRow = document.createElement('div');
        attachRow.className = 'flex items-center gap-3';
        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.className = 'text-xs font-bold px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:border-primary/50 hover:text-white transition-all';
        attachBtn.textContent = plan.kind === 'video' ? '＋ Add a start image (optional)' : '＋ Add a reference image (optional)';
        const attachState = document.createElement('span');
        attachState.className = 'text-[11px] text-secondary';
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.className = 'hidden';
        attachBtn.onclick = () => fileInput.click();
        fileInput.onchange = async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            attachBtn.disabled = true; attachState.textContent = 'Uploading…';
            try {
                imageUrl = await kie.uploadFile(file);
                attachState.textContent = `Attached: ${file.name}`;
                attachBtn.textContent = 'Change image';
            } catch (e) {
                attachState.textContent = `Upload failed: ${e.message.slice(0, 60)}`;
            } finally { attachBtn.disabled = false; }
        };
        attachRow.append(attachBtn, attachState, fileInput);
        card.appendChild(attachRow);

        // Actions.
        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-3 pt-1';
        const goBtn = document.createElement('button');
        goBtn.type = 'button';
        goBtn.className = 'px-6 py-2.5 bg-primary text-black font-black text-sm uppercase tracking-wide rounded-xl hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100';
        goBtn.textContent = 'Generate ✨';
        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'text-xs font-bold text-secondary hover:text-white transition-colors';
        dismissBtn.textContent = 'Not now';
        dismissBtn.onclick = () => { card.remove(); addNote('Plan dismissed — tell me what to change, or describe something new.'); };
        const status = document.createElement('span');
        status.className = 'text-[11px] text-secondary';
        actions.append(goBtn, dismissBtn, status);
        card.appendChild(actions);

        goBtn.onclick = () => {
            const finalPlan = {
                ...plan,
                prompt: promptBox.value.trim(),
                aspect_ratio: arSel.value,
                resolution: resSel ? resSel.value : plan.resolution,
                duration: durSel ? Number(durSel.value) : plan.duration,
            };
            if (!finalPlan.prompt) { status.textContent = 'Add a prompt first.'; return; }
            goBtn.disabled = true; dismissBtn.disabled = true;
            status.textContent = 'Queued — running in the background. The result shows up here and in your Library.';

            // Run through the shared background queue (same mechanism the
            // studios use): the job is registered in the pending-jobs store,
            // so it keeps going while the chat is docked beside the Library,
            // its result lands in the Library via the bridge, and it can be
            // resumed by a later Assistant mount even if this chat closed.
            const historyMeta = {
                prompt: finalPlan.prompt, model: finalPlan.model, modelName: finalPlan.modelName,
                kind: finalPlan.kind, aspect_ratio: finalPlan.aspect_ratio,
                duration: finalPlan.duration, resolution: finalPlan.resolution,
            };
            const genRow = addGenerating(finalPlan);
            const failInChat = (e) => {
                genRow.remove();
                status.textContent = `Failed: ${String(e.message || e).slice(0, 110)}`;
                goBtn.disabled = false; dismissBtn.disabled = false;
            };
            const run = (queueRequest) => {
                const onRequestId = queueRequest;
                if (finalPlan.kind === 'image') {
                    return imageUrl
                        ? kie.generateI2I({ model: finalPlan.model, prompt: finalPlan.prompt, image_url: imageUrl, aspect_ratio: finalPlan.aspect_ratio, resolution: finalPlan.resolution, onRequestId })
                        : kie.generateImage({ model: finalPlan.model, prompt: finalPlan.prompt, aspect_ratio: finalPlan.aspect_ratio, resolution: finalPlan.resolution, onRequestId });
                }
                const params = { model: finalPlan.model, prompt: finalPlan.prompt, aspect_ratio: finalPlan.aspect_ratio, resolution: finalPlan.resolution, duration: finalPlan.duration, advanced: { generate_audio: finalPlan.generate_audio !== false }, onRequestId };
                return imageUrl ? kie.generateI2V({ ...params, image_url: imageUrl }) : kie.generateVideo(params);
            };
            startGenerationJob(
                { studioType: 'assistant', historyMeta, maxAttempts: 900, interval: 2000 },
                run,
                {
                    onDone: (res) => {
                        genRow.remove();
                        if (!res?.url) { status.textContent = 'Finished without a result URL.'; goBtn.disabled = false; dismissBtn.disabled = false; return; }
                        card.remove();
                        addResult(finalPlan, res.url);
                        history.push({ role: 'assistant', text: `Generated a ${finalPlan.kind} with ${finalPlan.modelName}. It is saved in the Library.` });
                    },
                    onFail: failInChat,
                }
            ).catch(failInChat);
        };

        thread.appendChild(card);
        scrollDown();
    }

    function addResult(plan, url) {
        const wrap = document.createElement('div');
        wrap.className = 'bg-card-bg border border-white/10 rounded-2xl p-3 flex flex-col gap-3 animate-fade-in-up';
        const media = plan.kind === 'video'
            ? Object.assign(document.createElement('video'), { src: url, controls: true, playsInline: true, className: 'w-full rounded-xl max-h-[420px] bg-black' })
            : Object.assign(document.createElement('img'), { src: url, alt: plan.prompt, className: 'w-full rounded-xl max-h-[420px] object-contain bg-black' });
        wrap.appendChild(media);
        const meta = document.createElement('div');
        meta.className = 'flex items-center justify-between gap-3 px-1';
        meta.innerHTML = `<span class="text-[11px] text-secondary font-bold">${esc(plan.modelName)} · ${esc(plan.aspect_ratio)}${plan.kind === 'video' ? ` · ${esc(String(plan.duration))}s` : ''} — saved to your Library</span>`;
        const libBtn = document.createElement('button');
        libBtn.type = 'button';
        libBtn.className = 'text-[11px] font-black text-primary hover:text-white transition-colors whitespace-nowrap';
        libBtn.textContent = 'Open Library →';
        libBtn.onclick = () => window.dispatchEvent(new CustomEvent('navigate', { detail: { page: 'library' } }));
        meta.appendChild(libBtn);
        wrap.appendChild(meta);
        thread.appendChild(wrap);
        addBubble('assistant', 'Done! Want a variation, a different look, or something new?');
        scrollDown();
    }

    // --- Input bar ---
    const bar = document.createElement('div');
    bar.className = 'w-full max-w-3xl sticky bottom-0 pt-3 pb-1';
    const barInner = document.createElement('div');
    barInner.className = 'bg-panel-bg/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-3 flex items-end gap-3 shadow-3xl';
    const input = document.createElement('textarea');
    input.className = 'flex-1 bg-transparent text-white text-sm leading-relaxed outline-none resize-none max-h-32 placeholder:text-secondary/60 px-2 py-2';
    input.placeholder = 'Describe what you want to make…';
    input.rows = 1;
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'px-5 py-2.5 bg-primary text-black font-black text-sm uppercase tracking-wide rounded-xl hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 shrink-0';
    sendBtn.textContent = 'Send';
    barInner.append(input, sendBtn);
    bar.appendChild(barInner);
    container.appendChild(bar);

    // Starter chips.
    const chips = document.createElement('div');
    chips.className = 'assistant-starters w-full max-w-3xl flex flex-wrap gap-2 justify-center mt-3';
    STARTERS.forEach(s => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/70 hover:border-primary/50 hover:text-white transition-all';
        chip.textContent = s;
        chip.onclick = () => { input.value = s; send(); };
        chips.appendChild(chip);
    });
    container.appendChild(chips);

    function setModeBadge() {
        const badge = hero.querySelector('#agent-mode');
        if (badge) {
            badge.textContent = mode === 'ai' ? 'AI planner' : 'Built-in planner (AI chat unavailable)';
            badge.classList.toggle('text-primary', mode === 'local');
            badge.classList.toggle('border-primary/40', mode === 'local');
        }
    }

    function answerLocally(text) {
        // Local planner: one clarifying question at most, then a plan.
        if (pendingBrief) {
            const kind = detectKind(text);
            const out = localPlan(pendingBrief, kind ? { kind } : {});
            pendingBrief = null;
            if (out.plan) { addBubble('assistant', out.note); addPlanCard(out.plan); history.push({ role: 'assistant', text: out.note }); return; }
        }
        const out = localPlan(text);
        if (out.needs === 'kind') {
            pendingBrief = text;
            addBubble('assistant', out.question);
            history.push({ role: 'assistant', text: out.question });
            return;
        }
        if (out.plan) { addBubble('assistant', out.note); addPlanCard(out.plan); history.push({ role: 'assistant', text: out.note }); }
        else addBubble('assistant', out.question || 'Tell me a bit more about what you want to make.');
    }

    async function send() {
        const text = input.value.trim();
        if (!text || busy) return;
        input.value = '';
        busy = true; sendBtn.disabled = true; sendBtn.textContent = '…';
        addBubble('user', text);
        history.push({ role: 'user', text });

        if (mode === 'local') { answerLocally(text); busy = false; sendBtn.disabled = false; sendBtn.textContent = 'Send'; return; }

        const thinking = addBubble('assistant', 'Thinking…');
        try {
            const reply = await chatWithAgent(history);
            const { cleanText, plan } = parsePlan(reply);
            thinking.textContent = cleanText || (plan ? 'Here\'s my plan:' : '…');
            history.push({ role: 'assistant', text: cleanText || 'Proposed a generation plan.' });
            if (plan) addPlanCard(plan);
        } catch (e) {
            mode = 'local';
            setModeBadge();
            thinking.remove();
            if (!modeNoticeShown) {
                modeNoticeShown = true;
                addNote(`AI chat is unavailable right now (${e.message.slice(0, 80)}) — I've switched to the built-in planner. It still picks models and writes prompts, just without the conversation.`);
            }
            answerLocally(text);
        } finally {
            busy = false; sendBtn.disabled = false; sendBtn.textContent = 'Send';
            input.focus();
        }
    }

    sendBtn.onclick = send;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    addBubble('assistant', 'Hey! What are we making today — an image or a video? Describe it in your own words and I\'ll handle the model, settings and prompt.');

    // Resume generations started in an earlier chat that are still running:
    // they kept going in the background (and into the Library) while this
    // chat was closed; pick their results up here, like the studios do.
    (async () => {
        const pending = getPendingJobs('assistant');
        if (!pending.length) return;
        addNote(`Picking up ${pending.length} background generation${pending.length > 1 ? 's' : ''} from before…`);
        for (const job of pending) {
            const meta = job.historyMeta || {};
            const plan = {
                kind: meta.kind || 'video', model: meta.model, modelName: meta.modelName || meta.model || '',
                prompt: meta.prompt || '', aspect_ratio: meta.aspect_ratio, duration: meta.duration, resolution: meta.resolution,
            };
            const row = addGenerating(plan);
            const elapsed = Math.floor((Date.now() - (job.submittedAt || Date.now())) / (job.interval || 2000));
            const attemptsLeft = Math.max(1, (job.maxAttempts || 900) - elapsed);
            try {
                const result = await kie.pollForResult(job.requestId, localStorage.getItem('kie_key'), attemptsLeft, job.interval || 2000);
                const url = result?.resultUrls?.[0] || result?.url || result?.output?.url;
                row.remove();
                if (url) addResult(plan, url);
                else addNote('A background generation finished without a result.');
            } catch (e) {
                row.remove();
                addNote(`A background generation failed: ${String(e.message || e).slice(0, 80)}`);
            } finally {
                removePendingJob(job.requestId);
            }
        }
    })();

    return container;
}
