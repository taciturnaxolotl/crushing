import { state, escapeHTML } from './state';
import { APIClient } from './api';
import { SSEClient } from './sse';
import type { Message, Session, PermissionRequest } from './types';
import { renderChat, renderMessages as _renderMessages, renderPermission as _renderPermission, renderInputBar as _renderInputBar } from './chat';

const app = () => document.querySelector('#app')!;

export function renderConnect(): void {
  app().innerHTML = `
    <div class="connect-screen">
      <h1><span>♥</span> Crush</h1>
      <div class="field">
        <label>Server</label>
        <input id="server-url" type="url" placeholder="host:port" value="${escapeHTML(state.serverURL)}" inputmode="url" autocomplete="off">
      </div>
      <div class="field">
        <label>Workspace Path</label>
        <input id="workspace-path" type="text" placeholder="/path/to/project" value="${escapeHTML(state.workspacePath)}" autocomplete="off">
      </div>
      ${state.error ? `<div class="error-msg">${escapeHTML(state.error)}</div>` : ''}
      <button id="connect-btn" class="btn btn-primary" ${state.isConnecting ? 'disabled' : ''}>
        ${state.isConnecting ? '<span class="spinner"></span>' : 'Connect'}
      </button>
    </div>
  `;

  document.getElementById('connect-btn')!.onclick = handleConnect;
  document.getElementById('server-url')!.onkeydown = (e) => { if (e.key === 'Enter') handleConnect(); };
}

async function handleConnect(): Promise<void> {
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
  // In dev mode with vite proxy, use relative /v1 paths to avoid CORS
  const isDev = import.meta.env.DEV;
  const api = new APIClient(isDev ? '' : baseURL);

  try {
    const ok = await api.healthCheck();
    if (!ok) throw new Error('Health check failed');
  } catch (e) {
    state.error = `Cannot reach server: ${(e as Error).message}`;
    state.isConnecting = false;
    renderConnect();
    return;
  }

  state.api = api;

  try {
    const ws = await api.createWorkspace(wsPath || '.');
    state.workspace = ws;

    localStorage.setItem('serverURL', url);
    localStorage.setItem('workspacePath', wsPath);

    const sse = new SSEClient(isDev ? '' : baseURL, ws.id, api.clientID);
    setupSSE(sse);
    sse.connect();
    state.sse = sse;

    const sessions = await api.listSessions(ws.id);
    state.sessions = sessions.sort((a, b) => b.updated_at - a.updated_at);

    if (sessions.length > 0) {
      state.activeSessionID = sessions[0].id;
      await loadMessages(sessions[0].id);
    }

    state.isConnected = true;
    state.isConnecting = false;
    renderChat();
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
    console.log('[SSE message]', e.type, msg);
    if (e.type === 'created') state.messages.push(msg);
    else if (e.type === 'updated') {
      const idx = state.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) state.messages[idx] = msg;
    } else if (e.type === 'deleted') {
      state.messages = state.messages.filter((m) => m.id !== msg.id);
    }
    // Re-render messages in place
    const container = document.getElementById('messages');
    if (container) {
      _renderMessages();
      container.scrollTop = container.scrollHeight;
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
  try {
    state.messages = await state.api.getSessionMessages(state.workspace.id, sessionID);
    console.log('[loadMessages]', state.messages.length, 'messages');
    if (state.messages.length > 0) {
      const sample = state.messages[state.messages.length - 1];
      console.log('[sample message]', JSON.stringify(sample.parts?.slice(0, 3), null, 2));
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
  state.isConnected = false;
  renderConnect();
}
