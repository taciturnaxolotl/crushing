import type { Message, Session, Workspace, PermissionRequest, ContentPart } from './types';
import { APIClient } from './api';
import { SSEClient } from './sse';

export interface AppState {
  serverURL: string;
  workspacePath: string;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  api: APIClient | null;
  sse: SSEClient | null;
  workspace: Workspace | null;
  sessions: Session[];
  activeSessionID: string | null;
  messages: Message[];
  pendingPermission: PermissionRequest | null;
  agentBusy: boolean;
}

export const state: AppState = {
  serverURL: localStorage.getItem('serverURL') || '',
  workspacePath: localStorage.getItem('workspacePath') || '',
  isConnected: false,
  isConnecting: false,
  error: null,
  api: null,
  sse: null,
  workspace: null,
  sessions: [],
  activeSessionID: null,
  messages: [],
  pendingPermission: null,
  agentBusy: false,
};

export function escapeHTML(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function renderMarkdown(text: string): string {
  let html = escapeHTML(text);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function renderPart(part: ContentPart): string {
  const { type, data } = part;

  switch (type) {
    case 'text':
      return `<div>${renderMarkdown((data.text as string) || '')}</div>`;

    case 'reasoning': {
      const thinking = (data.thinking as string) || '';
      if (!thinking) return '';
      return `<details class="thinking-block"><summary>Thinking</summary><div>${renderMarkdown(thinking)}</div></details>`;
    }

    case 'tool_call': {
      const name = (data.name as string) || 'tool';
      const input = (data.input as string) || '';
      const finished = data.finished as boolean | undefined;
      let inputPreview = '';
      if (input) {
        try {
          const parsed = JSON.parse(input);
          inputPreview = escapeHTML(JSON.stringify(parsed, null, 2).slice(0, 300));
        } catch {
          inputPreview = escapeHTML(input.slice(0, 300));
        }
      }
      return `<div class="tool-call">
        <div class="tool-call-header"><span class="name">🔧 ${escapeHTML(name)}</span>${finished ? '' : ' <span class="spinner"></span>'}</div>
        ${inputPreview ? `<pre class="tool-input">${inputPreview}</pre>` : ''}
      </div>`;
    }

    case 'tool_result': {
      const name = (data.name as string) || 'result';
      const content = (data.content as string) || '';
      const isError = data.is_error as boolean | undefined;
      const cls = isError ? 'err' : 'ok';
      const icon = isError ? '✗' : '✓';
      return `<div class="tool-result ${cls}">
        <div class="tool-result-header">${icon} ${escapeHTML(name)}</div>
        ${content ? `<pre>${escapeHTML(content.slice(0, 800))}</pre>` : ''}
      </div>`;
    }

    case 'finish': {
      const reason = data.reason as string;
      if (!reason || reason === 'end_turn') return '';
      return `<div class="finish-reason">${escapeHTML(reason)}</div>`;
    }

    case 'image_url': {
      const url = data.url as string;
      if (!url) return '';
      return `<img src="${escapeHTML(url)}" class="msg-image" loading="lazy">`;
    }

    default:
      return '';
  }
}
