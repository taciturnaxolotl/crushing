import { state, escapeHTML, renderPart } from './state';
import { handleDisconnect } from './connect';

const app = () => document.querySelector('#app')!;

export function renderChat(): void {
  const session = state.sessions.find((s) => s.id === state.activeSessionID);
  const title = session?.title || 'Chat';

  app().innerHTML = `
    <div class="chat-header">
      <div class="title">${escapeHTML(title)}</div>
      <div style="display:flex;gap:0.5rem;">
        <button id="new-session-btn">+ New</button>
        <button id="disconnect-btn">Disconnect</button>
      </div>
    </div>
    <div class="messages" id="messages"></div>
    <div id="permission-area"></div>
    <div class="input-bar" id="input-bar"></div>
  `;

  document.getElementById('new-session-btn')!.onclick = handleNewSession;
  document.getElementById('disconnect-btn')!.onclick = () => handleDisconnect();

  renderMessages();
  renderPermission();
  renderInputBar();
  scrollToBottom();
}

export function renderMessages(): void {
  const container = document.getElementById('messages');
  if (!container) return;

  container.innerHTML = state.messages.map((msg) => {
    const parts = (msg.parts || []).map((p) => renderPart(p)).join('');
    return `<div class="msg ${msg.role}"><div class="role">${msg.role}</div>${parts}</div>`;
  }).join('');
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

  if (state.agentBusy) {
    bar.innerHTML = `
      <textarea id="msg-input" rows="1" placeholder="Agent is working..." disabled></textarea>
      <button class="stop-btn" id="stop-btn">■</button>
    `;
    document.getElementById('stop-btn')!.onclick = handleCancel;
  } else {
    bar.innerHTML = `
      <textarea id="msg-input" rows="1" placeholder="Message..."></textarea>
      <button id="send-btn" disabled>↑</button>
    `;
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
