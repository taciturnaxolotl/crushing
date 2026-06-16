import type { SSEEnvelope } from './types';

type EventHandler = (data: unknown) => void;

export class SSEClient {
  private baseURL: string;
  private workspaceID: string;
  private clientID: string;
  private abortController: AbortController | null = null;
  private handlers: Record<string, EventHandler> = {};
  private retryDelay = 1000;
  private shouldReconnect = true;

  connected = false;

  constructor(baseURL: string, workspaceID: string, clientID: string) {
    this.baseURL = baseURL ? baseURL.replace(/\/+$/, '') : '';
    this.workspaceID = workspaceID;
    this.clientID = clientID;
  }

  on(event: string, handler: EventHandler): this {
    this.handlers[event] = handler;
    return this;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.startStream();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.abortController?.abort();
    this.connected = false;
  }

  private async startStream(): Promise<void> {
    if (!this.shouldReconnect) return;

    this.abortController = new AbortController();
    const url = `${this.baseURL}/v1/workspaces/${this.workspaceID}/events?client_id=${this.clientID}`;

    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: this.abortController.signal,
      });

      if (!res.ok) throw new Error(`SSE ${res.status}`);

      this.connected = true;
      this.retryDelay = 1000;
      this.handlers._connected?.({});

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop()!;

        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const envelope: SSEEnvelope = JSON.parse(line.slice(6));
              this.dispatch(envelope);
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (e) {
      if (!this.shouldReconnect) return;
      this.connected = false;
      this.handlers._disconnected?.(e);
    }

    if (this.shouldReconnect) {
      setTimeout(() => this.startStream(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 30000);
    }
  }

  private dispatch(envelope: SSEEnvelope): void {
    const inner = envelope.payload as { type: string; payload: unknown };
    switch (envelope.type) {
      case 'message': this.handlers.message?.(inner); break;
      case 'session': this.handlers.session?.(inner); break;
      case 'permission_request': this.handlers.permissionRequest?.(inner); break;
      case 'run_complete': this.handlers.runComplete?.(inner); break;
      case 'agent_event': this.handlers.agentEvent?.(inner); break;
      case 'config_changed': this.handlers.configChanged?.(inner); break;
    }
  }
}
