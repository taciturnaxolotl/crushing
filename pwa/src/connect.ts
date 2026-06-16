import { state, escapeHTML, renderPart } from './state';
import { APIClient } from './api';
import { SSEClient } from './sse';
import type { Message, Session, PermissionRequest } from './types';
import { renderChat, renderMessages as _renderMessages, renderPermission as _renderPermission, renderInputBar as _renderInputBar, initIcons, appendMessage, updateMessage } from './chat';

const app = () => document.querySelector('#app')!;

export function renderConnect(): void {
  app().innerHTML = `
    <div class="connect-screen">
      <div class="logo-area">
        <img src="/icon-192.png" alt="Crush" class="logo-img">
        <div class="logo-meta"><span class="charm">Charm™</span> crush</div>
      </div>
      <div class="connect-form">
        <div class="field">
          <label>Server</label>
          <input id="server-url" type="url" placeholder="host:port" value="${escapeHTML(state.serverURL)}" inputmode="url" autocomplete="off" spellcheck="false">
        </div>
        <div class="field">
          <label>Workspace</label>
          <input id="workspace-path" type="text" placeholder="/path/to/project" value="${escapeHTML(state.workspacePath)}" autocomplete="off" spellcheck="false">
        </div>
        ${state.error ? `<div class="error-msg">${escapeHTML(state.error)}</div>` : ''}
        <button id="connect-btn" class="btn btn-primary" ${state.isConnecting ? 'disabled' : ''}>
          ${state.isConnecting ? '<span class="spinner"></span>' : 'Connect'}
        </button>
      </div>
    </div>
  `;

  document.getElementById('connect-btn')!.onclick = handleConnect;
  document.getElementById('server-url')!.onkeydown = (e) => { if (e.key === 'Enter') handleConnect(); };
}

async function handleConnect(): Promise<void> {
  const t0 = performance.now();
  const urlEl = document.getElementById('server-url') as HTMLInputElement;
  const pathEl = document.getElementById('workspace-path') as HTMLInputElement;
  const url = urlEl.value.trim();
  const wsPath = pathEl.value.trim();
  if (!url) return;

  state.serverURL = url;
  state.workspacePath = wsPath;
  state.isConnecting = true;
  state.error = null;
  renderConnect();

  const baseURL = url.includes('://') ? url : `http://${url}`;
  const isDev = import.meta.env.DEV;
  const api = new APIClient(isDev ? '' : baseURL);

  try {
    const t1 = performance.now();
    const ok = await api.healthCheck();
    console.log(`[perf] healthCheck: ${(performance.now() - t1).toFixed(0)}ms`);
    if (!ok) throw new Error('Health check failed');
  } catch (e) {
    state.error = `Cannot reach server: ${(e as Error).message}`;
    state.isConnecting = false;
    renderConnect();
    return;
  }

  state.api = api;

  try {
    const t2 = performance.now();
    const ws = await api.createWorkspace(wsPath || '.');
    console.log(`[perf] createWorkspace: ${(performance.now() - t2).toFixed(0)}ms`);
    state.workspace = ws;

    localStorage.setItem('serverURL', url);
    localStorage.setItem('workspacePath', wsPath);

    const sse = new SSEClient(isDev ? '' : baseURL, ws.id, api.clientID);
    setupSSE(sse);
    sse.connect();
    state.sse = sse;

    const t3 = performance.now();
    const sessions = await api.listSessions(ws.id);
    console.log(`[perf] listSessions: ${(performance.now() - t3).toFixed(0)}ms (${sessions.length} sessions)`);
    state.sessions = sessions.sort((a, b) => b.updated_at - a.updated_at);

    if (sessions.length > 0) {
      state.activeSessionID = sessions[0].id;
    }

    state.isConnected = true;
    state.isConnecting = false;
    console.log(`[perf] connect → first render: ${(performance.now() - t0).toFixed(0)}ms`);
    renderChat();

    // Load messages async after first render
    if (state.activeSessionID) {
      const t4 = performance.now();
      await loadMessages(state.activeSessionID);
      console.log(`[perf] loadMessages: ${(performance.now() - t4).toFixed(0)}ms (${state.messages.length} msgs)`);
      console.log(`[perf] total connect → messages rendered: ${(performance.now() - t0).toFixed(0)}ms`);
    }
  } catch (e) {
    state.error = `Setup failed: ${(e as Error).message}`;
    state.isConnecting = false;
    renderConnect();
  }
}

function setupSSE(sse: SSEClient): void {
  sse.on('message', (event: unknown) => {
    const e = event as { type: string; payload: Message };
    const msg = e.payload;
    const sid = msg.session_id;

    // Update cache
    let cached = state.messageCache.get(sid);
    if (!cached) { cached = []; state.messageCache.set(sid, cached); }

    if (e.type === 'created') {
      cached.push(msg);
    } else if (e.type === 'updated') {
      const idx = cached.findIndex((m) => m.id === msg.id);
      if (idx >= 0) cached[idx] = msg; else cached.push(msg);
    } else if (e.type === 'deleted') {
      cached = cached.filter((m) => m.id !== msg.id);
      state.messageCache.set(sid, cached);
    }

    // Only touch DOM if this is the active session
    if (sid === state.activeSessionID) {
      state.messages = cached;
      if (e.type === 'created') {
        appendMessage(msg);
        const container = document.getElementById('messages');
        if (container) container.scrollTop = container.scrollHeight;
      } else if (e.type === 'updated') {
        updateMessage(msg);
      } else {
        _renderMessages();
      }
    }
  });

  sse.on('session', (event: unknown) => {
    const e = event as { type: string; payload: Session };
    const s = e.payload;
    if (e.type === 'created') state.sessions.unshift(s);
    else if (e.type === 'updated') {
      const idx = state.sessions.findIndex((x) => x.id === s.id);
      if (idx >= 0) state.sessions[idx] = s;
    } else if (e.type === 'deleted') {
      state.sessions = state.sessions.filter((x) => x.id !== s.id);
    }
  });

  sse.on('permissionRequest', (event: unknown) => {
    const e = event as { payload: PermissionRequest };
    state.pendingPermission = e.payload;
    _renderPermission();
  });

  sse.on('runComplete', () => {
    state.agentBusy = false;
    _renderInputBar();
  });

  sse.on('agentEvent', (event: unknown) => {
    const e = event as { payload?: { type?: string; error?: string } };
    if (e.payload?.type === 'error') state.error = e.payload.error ?? null;
  });
}

async function loadMessages(sessionID: string): Promise<void> {
  if (!state.api || !state.workspace) return;

  // Check cache first
  const cached = state.messageCache.get(sessionID);
  if (cached) {
    state.messages = cached;
    const t0 = performance.now();
    _renderMessages();
    console.log(`[perf] renderMessages (cached ${cached.length}): ${(performance.now() - t0).toFixed(0)}ms`);
    const container = document.getElementById('messages');
    if (container) container.scrollTop = container.scrollHeight;
    return;
  }

  try {
    const t1 = performance.now();
    const msgs = await state.api.getSessionMessages(state.workspace.id, sessionID);
    console.log(`[perf] fetch messages: ${(performance.now() - t1).toFixed(0)}ms (${msgs.length} msgs)`);

    state.messageCache.set(sessionID, msgs);
    if (state.activeSessionID === sessionID) {
      state.messages = msgs;
      const t2 = performance.now();
      _renderMessages();
      console.log(`[perf] renderMessages: ${(performance.now() - t2).toFixed(0)}ms`);
      const container = document.getElementById('messages');
      if (container) container.scrollTop = container.scrollHeight;
    }
  } catch (e) { console.error('[loadMessages] failed', e); }
}

export async function handleDisconnect(): Promise<void> {
  state.sse?.disconnect();
  state.sse = null;
  state.api = null;
  state.workspace = null;
  state.sessions = [];
  state.messages = [];
  state.activeSessionID = null;
  state.pendingPermission = null;
  state.messageCache.clear();
  state.isConnected = false;
  renderConnect();
}
