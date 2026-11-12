import './style.css';
import { Header } from './components/Header.js';
import { BackendModal } from './components/BackendModal.js';

const app = document.querySelector('#app');
let contentArea;
let pageSlot;
let dockSlot;
let dockBody;
let booted = false;

// --- Assistant open/dock/close -------------------------------------------
// The Assistant is its own full page. Pressing Library while it is open
// docks it into a side panel (same live element, chat intact) with the
// Library as the main area; pressing Library again leaves both as they are
// (the dock has its own Expand and Close controls). Opening any other tab
// closes the Assistant. Header listens for 'assistant-state' to light the
// avatar button.
let assistantEl = null;
let assistantState = 'closed'; // 'closed' | 'full' | 'docked'

function setAssistantState(state) {
  assistantState = state;
  window.dispatchEvent(new CustomEvent('assistant-state', { detail: { state } }));
}

function showDock(show) {
  dockSlot.classList.toggle('hidden', !show);
  dockSlot.classList.toggle('flex', show);
}

function closeAssistant() {
  if (assistantEl) { assistantEl.remove(); assistantEl = null; }
  if (dockSlot) showDock(false);
  if (assistantState !== 'closed') setAssistantState('closed');
}

function dockAssistant() {
  if (!assistantEl) return;
  assistantEl.remove(); // detaches the live element; its chat state survives
  assistantEl.dataset.docked = '1';
  dockBody.appendChild(assistantEl);
  showDock(true);
  setAssistantState('docked');
}

// Router. Pages load on demand; a navigation token makes sure only the most
// recent page is shown even if an older page's code finishes loading later.
const videoHub = (tool) => () => import('./components/ToolHub.js').then(m => () => m.ToolHub({ tools: m.VIDEO_TOOLS, storageKey: 'video_tool', initial: tool, label: 'Tool' }));
const imageHub = (tool) => () => import('./components/ToolHub.js').then(m => () => m.ToolHub({ tools: m.IMAGE_TOOLS, storageKey: 'image_tool', initial: tool, label: 'Tool' }));
// Video and Image are hubs with a Tool menu; the old page names open the matching tool.
const PAGES = {
  video: videoHub(),
  image: imageHub(),
  remix: videoHub('motion'),
  lipsync: videoHub('lipsync'),
  factory: videoHub('factory'),
  cinema: imageHub('cinema'),
  'video-create': videoHub('create'),
  'image-create': imageHub('create'),
  characters: () => import('./components/CharactersPage.js').then(m => m.CharactersPage),
  assistant: () => import('./components/AssistantStudio.js').then(m => m.AssistantStudio),
  library: () => import('./components/LibraryPage.js').then(m => m.LibraryPage),
};
let navToken = 0;

function mountPage(page) {
  if (!pageSlot) return;
  const token = ++navToken;
  pageSlot.innerHTML = '';

  const load = PAGES[page];
  if (!load) return;
  load().then((Page) => {
    if (token !== navToken) return; // a newer navigation happened meanwhile
    pageSlot.innerHTML = '';
    pageSlot.appendChild(Page());
  });
}

function openAssistant() {
  if (!pageSlot) return;
  if (assistantState === 'full') return;
  if (assistantState === 'docked' && assistantEl) {
    // Expand the live chat back to its full page — same element, so the
    // conversation and any on-screen results come along untouched.
    navToken++;
    assistantEl.remove();
    delete assistantEl.dataset.docked;
    showDock(false);
    pageSlot.innerHTML = '';
    pageSlot.appendChild(assistantEl);
    setAssistantState('full');
    return;
  }
  const token = ++navToken;
  PAGES.assistant().then((Page) => {
    if (token !== navToken || assistantState !== 'closed') return; // superseded
    assistantEl = Page();
    pageSlot.innerHTML = '';
    pageSlot.appendChild(assistantEl);
    setAssistantState('full');
  });
}

function navigate(page) {
  if (!contentArea) return;

  if (page === 'assistant') { openAssistant(); return; }

  if (page === 'library' && assistantState === 'full') {
    // Library with the Assistant open: dock the chat to the side instead of
    // closing it, and show the Library as the main area.
    dockAssistant();
    mountPage('library');
    return;
  }
  if (page === 'library' && assistantState === 'docked') {
    // Already docked beside the Library — leave both exactly as they are.
    // (Undock with the dock's Expand button, close with its ✕.)
    return;
  }

  // Any other tab (and Library when the Assistant is closed) closes it.
  closeAssistant();
  mountPage(page);
}

// Event Listener for Navigation
window.addEventListener('navigate', (e) => {
  navigate(e.detail.page);
});

// --- Sign-in gate -------------------------------------------------------
// Nothing in the app renders until the visitor is signed in with their
// content-factory account (first name + PIN). The session cookie is
// httpOnly, so the only way to know is to ask the backend's /session
// endpoint, which answers 401 when there is no valid session.
async function hasValidSession() {
  try {
    const res = await fetch('/.netlify/functions/session', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data && data.ok ? String(data.sub || 'account') : false;
  } catch {
    return false;
  }
}

function showCheckingScreen() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'flex-1 flex items-center justify-center';
  screen.innerHTML = '<p class="text-muted text-xs font-bold uppercase tracking-widest animate-pulse">Loading…</p>';
  app.appendChild(screen);
}

function showSignInGate() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center';
  screen.innerHTML = `
    <h1 class="text-3xl md:text-5xl font-black text-white tracking-widest uppercase">MATAI</h1>
    <p class="text-secondary text-sm font-medium tracking-wide opacity-60">AI Image &amp; Video Studio — sign in to continue.</p>
  `;
  app.appendChild(screen);

  // BackendModal renders the name + PIN sign-in form and calls back on
  // success. Remove its Cancel button: behind the gate there is nothing
  // to cancel back to.
  const modal = BackendModal(() => bootApp());
  modal.querySelector('#cf-cancel-btn')?.remove();
}

function bootApp() {
  if (booted) return;
  booted = true;

  app.innerHTML = '';
  // Pass navigate to Header so links work
  app.appendChild(Header(navigate));

  contentArea = document.createElement('main');
  contentArea.id = 'content-area';
  contentArea.className = 'flex-1 relative w-full overflow-hidden flex bg-app-bg';
  app.appendChild(contentArea);

  // Pages mount in the slot; the Assistant docks into the side slot.
  pageSlot = document.createElement('div');
  pageSlot.id = 'page-slot';
  pageSlot.className = 'flex-1 relative min-w-0 overflow-hidden flex flex-col bg-app-bg';
  contentArea.appendChild(pageSlot);

  dockSlot = document.createElement('aside');
  dockSlot.id = 'assistant-dock';
  dockSlot.className = 'hidden flex-col w-[380px] max-w-[88vw] shrink-0 border-l border-white/10 bg-app-bg z-40';
  const dockHeader = document.createElement('div');
  dockHeader.className = 'h-11 shrink-0 flex items-center justify-between px-3 border-b border-white/10 bg-black/40';
  dockHeader.innerHTML = '<span class="text-[11px] font-black uppercase tracking-widest text-white">MATAI Assistant</span>';
  const dockBtns = document.createElement('div');
  dockBtns.className = 'flex items-center gap-1';
  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.title = 'Expand the Assistant to a full page';
  expandBtn.className = 'p-1.5 text-secondary hover:text-white transition-colors';
  expandBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  expandBtn.onclick = () => openAssistant();
  const dockCloseBtn = document.createElement('button');
  dockCloseBtn.type = 'button';
  dockCloseBtn.title = 'Close the Assistant';
  dockCloseBtn.className = 'p-1.5 text-secondary hover:text-white transition-colors';
  dockCloseBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>';
  dockCloseBtn.onclick = () => closeAssistant();
  dockBtns.append(expandBtn, dockCloseBtn);
  dockHeader.appendChild(dockBtns);
  dockBody = document.createElement('div');
  dockBody.className = 'flex-1 relative overflow-hidden flex flex-col min-h-0';
  dockSlot.append(dockHeader, dockBody);
  contentArea.appendChild(dockSlot);

  // Initial Route
  navigate('library');
}

// Boot sequence: confirm the session before rendering anything (the check is
// a signature check on the backend, so it is quick), otherwise show only the
// sign-in screen. The Library cache is tied to the signed-in account.
showCheckingScreen();
hasValidSession().then((sub) => {
  if (sub) {
    if (localStorage.getItem('library_cache_owner') !== sub) localStorage.removeItem('library_cache');
    localStorage.setItem('library_cache_owner', sub);
    localStorage.setItem('cf_backend', '1');
    bootApp();
  } else {
    localStorage.removeItem('cf_backend');
    localStorage.removeItem('library_cache');
    showSignInGate();
  }
});
