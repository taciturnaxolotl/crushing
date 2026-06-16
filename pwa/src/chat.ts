import { state, escapeHTML, renderPart, deferHighlightAll } from './state';
import { handleDisconnect } from './connect';
import type { Message } from './types';
import { updateSidebarYolo } from './palette';

declare const lucide: { createIcons: () => void } | undefined;
export function initIcons() { try { lucide?.createIcons(); } catch {} }

const app = () => document.querySelector('#app')!;

export function renderChat(): void {
  const session = state.sessions.find((s) => s.id === state.activeSessionID);

  app().innerHTML = `
    <div class="chat-layout">
      <main class="chat-main">
        <div class="messages" id="messages"></div>
        <div id="permission-area"></div>
        <div class="input-bar" id="input-bar"></div>
      </main>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <img src="/icon-192.png" alt="" class="logo-img-sm">
          <span class="logo-meta"><span class="charm">Charm™</span> crush</span>
        </div>
        ${session ? `
        <div class="sidebar-section">
          <div class="sidebar-title">${escapeHTML(session.title || 'Untitled')}</div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Model</div>
          <div class="sidebar-value" id="sidebar-model">${state.modelInfo ? `${escapeHTML(state.modelInfo.name)} (${escapeHTML(state.modelInfo.provider)})` : '—'}</div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Mode</div>
          <div class="sidebar-value ${state.permissionMode !== 'normal' ? `yolo-active ${state.permissionMode}` : ''}" id="sidebar-yolo">${state.permissionMode === 'normal' ? 'Normal' : state.permissionMode === 'yolo' ? 'YOLO' : 'Super YOLO'}</div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-label">Tokens</div>
          <div class="sidebar-value">${(session.prompt_tokens + session.completion_tokens).toLocaleString()}</div>
        </div>
        ${session.cost > 0 ? `
        <div class="sidebar-section">
          <div class="sidebar-label">Cost</div>
          <div class="sidebar-value">$${session.cost.toFixed(4)}</div>
        </div>` : ''}
        <div class="sidebar-section">
          <div class="sidebar-label">Messages</div>
          <div class="sidebar-value">${session.message_count}</div>
        </div>
        ` : ''}
        <div class="sidebar-spacer"></div>
        <div class="sidebar-actions">
          <button id="new-session-btn">+ New Session</button>
          <button id="disconnect-btn">Disconnect</button>
        </div>
      </aside>
    </div>
  `;

  document.getElementById('new-session-btn')!.onclick = handleNewSession;
  document.getElementById('disconnect-btn')!.onclick = () => handleDisconnect();

  renderMessages();
  renderPermission();
  renderInputBar();
  scrollToBottom();
  initIcons();
}

let renderedUpTo = 0; // index from bottom: how many messages are rendered
const INITIAL_COUNT = 50;
const BATCH_SIZE = 50;

export function renderMessages(): void {
  const container = document.getElementById('messages');
  if (!container) return;

  const msgs = state.messages;
  renderedUpTo = Math.min(INITIAL_COUNT, msgs.length);
  const startIdx = msgs.length - renderedUpTo;

  container.innerHTML = '';

  const fragment = document.createDocumentFragment();
  for (let i = startIdx; i < msgs.length; i++) {
    fragment.appendChild(createMessageEl(msgs[i]));
  }
  container.appendChild(fragment);

  initIcons();
  deferHighlightAll();

  // Preload remaining messages in background batches
  if (startIdx > 0) {
    schedulePreload(container, startIdx);
  }
}

function schedulePreload(container: HTMLElement, nextStartIdx: number): void {
  requestIdleCallback(() => {
    if (!container.isConnected || nextStartIdx <= 0) return;

    const endIdx = nextStartIdx;
    const startIdx = Math.max(0, endIdx - BATCH_SIZE);
    const batch = state.messages.slice(startIdx, endIdx);

    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    const fragment = document.createDocumentFragment();
    for (const msg of batch) {
      fragment.appendChild(createMessageEl(msg));
    }
    container.prepend(fragment);
    renderedUpTo += batch.length;

    // Preserve scroll position
    const newScrollHeight = container.scrollHeight;
    container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);

    initIcons();
    deferHighlightAll();

    if (startIdx > 0) {
      schedulePreload(container, startIdx);
    }
  }, { timeout: 200 });
}

function createMessageEl(msg: Message): HTMLElement {
  const div = document.createElement('div');
  div.className = `msg ${msg.role}`;
  div.dataset.msgId = msg.id;
  const parts = (msg.parts || []).map((p) => renderPart(p)).join('');
  div.innerHTML = `<div class="role">${msg.role}</div>${parts}`;
  return div;
}

export function appendMessage(msg: Message): void {
  const container = document.getElementById('messages');
  if (!container) return;
  container.appendChild(createMessageEl(msg));
  renderedUpTo++;
  initIcons();
  deferHighlightAll();
}

export function updateMessage(msg: Message): void {
  const container = document.getElementById('messages');
  if (!container) return;
  const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
  if (existing) {
    const parts = (msg.parts || []).map((p) => renderPart(p)).join('');
    existing.innerHTML = `<div class="role">${msg.role}</div>${parts}`;
    initIcons();
    deferHighlightAll();
  }
}

export function renderPermission(): void {
  const area = document.getElementById('permission-area');
  if (!area) return;

  if (!state.pendingPermission) { area.innerHTML = ''; return; }

  const p = state.pendingPermission;
  area.innerHTML = `
    <div class="permission-banner">
      <div class="tool-name">${escapeHTML(p.tool_name)}</div>
      <div class="desc">${escapeHTML(p.description)}</div>
      <div class="actions">
        <button class="allow" data-action="allow">Allow</button>
        <button data-action="allow_session">Allow Session</button>
        <button class="deny" data-action="deny">Deny</button>
      </div>
    </div>
  `;

  area.querySelectorAll('.actions button').forEach((btn) => {
    (btn as HTMLElement).onclick = () => handlePermission((btn as HTMLElement).dataset.action!);
  });
}

export function renderInputBar(): void {
  const bar = document.getElementById('input-bar');
  if (!bar) return;

  const yoloBadge = state.permissionMode !== 'normal'
    ? `<div class="yolo-badge ${state.permissionMode}">${state.permissionMode === 'yolo' ? '!' : '#'}</div>`
    : '';

  if (state.agentBusy) {
    bar.innerHTML = `
      ${yoloBadge}
      <textarea id="msg-input" rows="1" placeholder="${state.permissionMode !== 'normal' ? 'Yolo mode!' : 'Agent is working...'}" disabled></textarea>
      <button class="stop-btn" id="stop-btn"><i data-lucide="circle-stop"></i></button>
    `;
    document.getElementById('stop-btn')!.onclick = handleCancel;
    initIcons();
  } else {
    bar.innerHTML = `
      ${yoloBadge}
      <textarea id="msg-input" rows="1" placeholder="${state.permissionMode !== 'normal' ? 'Yolo mode!' : 'Message...'}"></textarea>
      <button id="send-btn" disabled><i data-lucide="arrow-up"></i></button>
    `;
    initIcons();
    const input = document.getElementById('msg-input') as HTMLTextAreaElement;
    const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

    input.oninput = () => {
      sendBtn.disabled = !input.value.trim();
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };
    sendBtn.onclick = () => handleSend();
    input.focus();
  }
}

function scrollToBottom(): void {
  const container = document.getElementById('messages');
  if (container) requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
}

async function handleSend(): Promise<void> {
  const input = document.getElementById('msg-input') as HTMLTextAreaElement | null;
  const text = input?.value?.trim();
  if (!text || !state.api || !state.workspace || !state.activeSessionID) return;

  input.value = '';
  input.style.height = 'auto';
  state.agentBusy = true;
  renderInputBar();

  try {
    await state.api.sendMessage(state.workspace.id, {
      session_id: state.activeSessionID,
      run_id: crypto.randomUUID(),
      prompt: text,
    });
  } catch (e) {
    state.error = `Send failed: ${(e as Error).message}`;
    state.agentBusy = false;
    renderInputBar();
  }
}

async function handleCancel(): Promise<void> {
  if (!state.api || !state.workspace || !state.activeSessionID) return;
  try { await state.api.cancelAgent(state.workspace.id, state.activeSessionID); } catch { /* noop */ }
}

async function handlePermission(action: string): Promise<void> {
  if (!state.api || !state.workspace || !state.pendingPermission) return;
  try {
    await state.api.grantPermission(state.workspace.id, {
      permission: state.pendingPermission,
      action,
    });
  } catch { /* noop */ }
  state.pendingPermission = null;
  renderPermission();
}

async function handleNewSession(): Promise<void> {
  if (!state.api || !state.workspace) return;
  try {
    const session = await state.api.createSession(state.workspace.id);
    state.sessions.unshift(session);
    state.activeSessionID = session.id;
    state.messages = [];
    renderChat();
  } catch { /* noop */ }
}
