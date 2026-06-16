import type { Workspace, Session, Message, PermissionRequest } from './types';

export class APIClient {
  private baseURL: string;
  readonly clientID: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL ? baseURL.replace(/\/+$/, '') : '';
    this.clientID = crypto.randomUUID();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const base = this.baseURL || '';
    const sep = path.includes('?') ? '&' : '?';
    const url = `${base}/v1/${path}${sep}client_id=${this.clientID}`;
    const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  healthCheck(): Promise<boolean> {
    return this.request('GET', 'health').then(() => true).catch(() => false);
  }

  createWorkspace(path: string): Promise<Workspace> {
    return this.request('POST', 'workspaces', { path, client_id: this.clientID });
  }

  listSessions(wsID: string): Promise<Session[]> {
    return this.request('GET', `workspaces/${wsID}/sessions`);
  }

  createSession(wsID: string, title?: string): Promise<Session> {
    return this.request('POST', `workspaces/${wsID}/sessions`, { title });
  }

  getSessionMessages(wsID: string, sid: string): Promise<Message[]> {
    return this.request('GET', `workspaces/${wsID}/sessions/${sid}/messages`);
  }

  sendMessage(wsID: string, msg: { session_id: string; run_id: string; prompt: string }): Promise<void> {
    return this.request('POST', `workspaces/${wsID}/agent`, msg);
  }

  cancelAgent(wsID: string, sid: string): Promise<void> {
    return this.request('POST', `workspaces/${wsID}/agent/sessions/${sid}/cancel`);
  }

  grantPermission(wsID: string, grant: { permission: PermissionRequest; action: string }): Promise<void> {
    return this.request('POST', `workspaces/${wsID}/permissions/grant`, grant);
  }

  getAgentInfo(wsID: string): Promise<AgentInfo> {
    return this.request('GET', `workspaces/${wsID}/agent`);
  }

  setPermissionMode(wsID: string, mode: 'normal' | 'yolo' | 'super_yolo'): Promise<void> {
    return this.request('POST', `workspaces/${wsID}/permissions/mode`, { mode });
  }
}

export interface AgentInfo {
  is_busy: boolean;
  is_ready: boolean;
  model: {
    id: string;
    name: string;
    can_reason: boolean;
    context_window: number;
  };
  model_cfg: {
    model: string;
    provider: string;
    reasoning_effort: string;
  };
}
