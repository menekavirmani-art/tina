// Assistant brain glue: builds the app context the chat model reasons over
// (straight from the live registries, so it can never go stale), parses the
// model's plan blocks, and provides a deterministic local planner that takes
// over when the AI chat backend cannot be reached.
import { t2iModels, i2iModels, t2vModels, i2vModels, lipsyncModels } from './models.js';
import { fitModels, fitInfo, VIDEO_STYLES, IMAGE_STYLES, joinPrompt } from './modelStyles.js';
import { getVideoSpec, advancedFieldsFor } from './videoSpecs.js';
import { CAMERA_PRESETS, RESTYLE_PRESETS } from './presets.js';

const uniq = (list) => [...new Map(list.map(m => [m.id, m])).values()];

function modelLine(m, kind) {
    const fit = fitInfo(m.id);
    const parts = [`${m.id} — ${m.name || m.label || m.id} (${kind})`];
    if (fit?.note) parts.push(fit.note);
    if (fit) parts.push(`tier: ${fit.tier}, reference photos: ${fit.refs || 0}${fit.voice ? ', takes a voiceover' : ''}`);
    if (m.aspects?.length) parts.push(`aspect ratios: ${m.aspects.join(', ')}`);
    if (m.resolutions?.length) parts.push(`resolutions: ${m.resolutions.join(', ')}`);
    if (kind === 'video') {
        const spec = getVideoSpec(m.id);
        const durations = spec?.durations || m.durations;
        if (durations?.length) parts.push(`durations (sec): ${durations.join(', ')}`);
        const adv = advancedFieldsFor(m.id, false).concat(advancedFieldsFor(m.id, true)).map(f => f.key);
        if (adv.length) parts.push(`extra settings: ${[...new Set(adv)].join(', ')}`);
    }
    if (m.images) parts.push(m.images.required ? 'REQUIRES a reference/start image' : 'accepts an optional reference/start image');
    return '- ' + parts.join(' · ');
}

// Compact, current picture of the whole app for the chat model. Built at
// runtime from the same registries the studios use.
export function buildAgentContext() {
    const lines = [];
    lines.push('IMAGE MODELS (text-to-image / image edit):');
    uniq([...t2iModels, ...i2iModels]).forEach(m => lines.push(modelLine(m, 'image')));
    lines.push('VIDEO MODELS (text-to-video / image-to-video):');
    uniq([...t2vModels, ...i2vModels]).forEach(m => lines.push(modelLine(m, 'video')));
    if (lipsyncModels.length) {
        lines.push('LIP-SYNC / TALKING MODELS (portrait + audio -> talking video, in the Lip Sync tool):');
        lipsyncModels.forEach(m => lines.push(modelLine(m, 'talk')));
    }
    lines.push(`VIDEO LOOKS: ${VIDEO_STYLES.map(s => `${s.id} (${s.label})`).join(', ')}`);
    lines.push(`IMAGE LOOKS: ${IMAGE_STYLES.map(s => `${s.id} (${s.label})`).join(', ')}`);
    lines.push(`CAMERA PRESETS for video: ${CAMERA_PRESETS.filter(p => p.id !== 'none').map(p => p.label).join(', ')}`);
    lines.push(`RESTYLE LOOKS (Remix video edit): ${RESTYLE_PRESETS.map(p => p.label).join(', ')}`);
    lines.push('WORKFLOWS / TOOLS IN THE APP: Create image (text or photos -> image, with look + character/item locks), Create video (text or image -> video, camera presets, sound: model audio / ElevenLabs voiceover / silent), Cinema still (film camera, lens, lighting controls), Lip sync / talking (photo or video + audio), Motion transfer (a character performs a source video\'s moves), Character swap and Item swap / edit (Remix), Content factory (one brief -> a batch of video scenes), Characters (save a person once, lock them into generations), Library (every generation is saved there automatically; any item can be animated, edited or redone).');
    lines.push('RULES: Generation runs only after the user approves a plan. Results are saved to the Library automatically.');
    return lines.join('\n');
}

// ---- Plan blocks ------------------------------------------------------------
export function parsePlan(text) {
    const match = String(text || '').match(/```plan\s*([\s\S]*?)```/);
    if (!match) return { cleanText: String(text || '').trim(), plan: null };
    let plan = null;
    try {
        const raw = JSON.parse(match[1].trim());
        const all = uniq([...t2iModels, ...i2iModels, ...t2vModels, ...i2vModels, ...lipsyncModels]);
        const model = all.find(m => m.id === raw.model);
        if (model && (raw.kind === 'image' || raw.kind === 'video') && typeof raw.prompt === 'string' && raw.prompt.trim()) {
            plan = {
                kind: raw.kind,
                model: model.id,
                modelName: model.name || model.label || model.id,
                prompt: raw.prompt.trim(),
                aspect_ratio: model.aspects?.includes(raw.aspect_ratio) ? raw.aspect_ratio : (model.aspects?.[0] || '16:9'),
                resolution: model.resolutions?.includes(raw.resolution) ? raw.resolution : (model.resolutionDefault || model.resolutions?.[0] || ''),
                duration: Number(raw.duration) || null,
                generate_audio: raw.generate_audio !== false,
            };
            if (plan.kind === 'video') {
                const durations = getVideoSpec(model.id)?.durations || model.durations || [];
                plan.duration = durations.includes(plan.duration) ? plan.duration : (getVideoSpec(model.id)?.durationDefault || durations[0] || 5);
            }
        }
    } catch { /* malformed plan -> plain chat reply */ }
    return { cleanText: String(text).replace(match[0], '').trim(), plan };
}

// ---- AI chat call -----------------------------------------------------------
export async function chatWithAgent(history) {
    const response = await fetch('/.netlify/functions/agent-chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            context: buildAgentContext(),
            messages: history.map(m => ({ role: m.role, content: m.text })),
        }),
    });
    let data = {};
    try { data = await response.json(); } catch { /* empty */ }
    if (!response.ok || !data.reply) throw new Error(data.error || `Assistant chat failed (${response.status})`);
    return data.reply;
}

// ---- Deterministic local planner (fallback) ---------------------------------
const VIDEO_WORDS = /\b(video|clip|animate|animation|motion|reel|tiktok|shorts|film|movie|footage)\b/i;
const IMAGE_WORDS = /\b(image|photo|picture|poster|thumbnail|logo|portrait|still|drawing|artwork|headshot)\b/i;

const STYLE_KEYWORDS = [
    ['cinematic', /\bcinematic|film look|movie\b/i],
    ['ugc', /\bugc|selfie|tiktok style|handheld phone\b/i],
    ['cartoon', /\bcartoon|anime|animated style|pixar\b/i],
    ['product', /\bproduct|ad\b|advert|commercial|promo\b/i],
    ['realistic', /\brealistic|photoreal|real life|lifelike\b/i],
    ['design', /\bposter|graphic|typography|text\b/i],
];

const CAMERA_KEYWORDS = [
    ['orbit', /\borbit|360|around\b/i],
    ['dolly-in', /\bdolly in|push[- ]?in|zoom in slowly\b/i],
    ['dolly-out', /\bdolly out|pull back|reveal\b/i],
    ['aerial', /\baerial|drone|from above\b/i],
    ['fpv', /\bfpv\b/i],
    ['handheld', /\bhandheld\b/i],
    ['tracking', /\btracking|follow the\b/i],
    ['static', /\bstatic|locked|no movement|still camera\b/i],
    ['crane-up', /\bcrane up|rising shot\b/i],
    ['low-angle', /\blow angle|hero shot\b/i],
];

export function detectKind(text) {
    if (VIDEO_WORDS.test(text)) return 'video';
    if (IMAGE_WORDS.test(text)) return 'image';
    return null;
}

// Returns { question } when one essential is missing, otherwise { plan, note }.
export function localPlan(brief, known = {}) {
    const text = String(brief || '').trim();
    const kind = known.kind || detectKind(text);
    if (!kind) {
        return { question: 'Happy to make that. Do you want an image or a video?', needs: 'kind' };
    }
    const styles = kind === 'video' ? VIDEO_STYLES : IMAGE_STYLES;
    const styleId = (STYLE_KEYWORDS.find(([id, re]) => styles.some(s => s.id === id) && re.test(text)) || ['any'])[0];
    const style = styles.find(s => s.id === styleId) || styles[0];

    const list = kind === 'video' ? uniq([...t2vModels, ...i2vModels]) : uniq([...t2iModels, ...i2iModels]);
    const best = fitModels(list, { style: styleId })[0]?.model || list[0];
    if (!best) return { question: 'No model in the app fits that right now. Try describing it a little differently.', needs: null };

    let prompt = text.replace(/\b(make|create|generate|please|an?\s+image\s+of|an?\s+video\s+of)\b/gi, '').trim() || text;
    prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);
    const extras = [];
    if (style.hint) extras.push(style.hint);
    let camera = null;
    if (kind === 'video') {
        const hit = CAMERA_KEYWORDS.find(([, re]) => re.test(text));
        camera = CAMERA_PRESETS.find(p => p.id === (hit ? hit[0] : 'dolly-in'));
        if (camera?.text) extras.push(camera.text);
        extras.push('Smooth, continuous motion, consistent subject throughout, no flicker or warping.');
    } else {
        extras.push('Sharp detail, clean composition, no artifacts or distorted text.');
    }
    const optimized = joinPrompt(prompt.endsWith('.') ? prompt : `${prompt}.`, ...extras);

    const durations = kind === 'video' ? (getVideoSpec(best.id)?.durations || best.durations || [5]) : [];
    let duration = kind === 'video' ? (getVideoSpec(best.id)?.durationDefault || durations[0] || 5) : null;
    const dm = text.match(/(\d{1,2})\s*(?:s|sec|seconds)\b/i);
    if (kind === 'video' && dm) {
        const want = Number(dm[1]);
        duration = durations.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), durations[0]);
    }
    const ar = /vertical|9:16|tiktok|reel|portrait orientation|portrait mode/i.test(text) ? '9:16' : /square|1:1/i.test(text) ? '1:1' : '16:9';

    return {
        plan: {
            kind,
            model: best.id,
            modelName: best.name || best.label || best.id,
            prompt: optimized,
            aspect_ratio: best.aspects?.includes(ar) ? ar : (best.aspects?.[0] || '16:9'),
            resolution: best.resolutionDefault || best.resolutions?.[0] || '',
            duration,
            generate_audio: true,
        },
        note: `Here's my plan — ${best.name || best.label} for a ${style.label.toLowerCase()} ${kind}. You can edit the prompt or settings before it runs.`,
    };
}

export function modelById(id) {
    return uniq([...t2iModels, ...i2iModels, ...t2vModels, ...i2vModels, ...lipsyncModels]).find(m => m.id === id) || null;
}
