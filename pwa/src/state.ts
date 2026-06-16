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
  messageCache: Map<string, Message[]>;
  permissionMode: 'normal' | 'yolo' | 'super_yolo';
  modelInfo: { name: string; provider: string } | null;
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
  messageCache: new Map(),
  permissionMode: 'normal',
  modelInfo: null,
};

import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Highlighter | null = null;
let highlighterReady: Promise<Highlighter> | null = null;

const LANGS = ['typescript', 'javascript', 'python', 'go', 'rust', 'css', 'json', 'bash', 'html', 'yaml', 'sql', 'markdown', 'swift'] as const;

function getHighlighter(): Promise<Highlighter> {
  if (highlighter) return Promise.resolve(highlighter);
  if (!highlighterReady) {
    highlighterReady = createHighlighter({
      themes: ['vitesse-dark'],
      langs: [...LANGS],
    }).then((h) => { highlighter = h; return h; });
  }
  return highlighterReady;
}

// Synchronous fallback — returns escaped HTML without highlighting
function highlightCodeSync(code: string): string {
  return escapeHTML(code);
}

// Async highlighting — use for deferred rendering
export async function highlightCodeAsync(code: string, lang?: string): Promise<string> {
  try {
    const h = await getHighlighter();
    const l = lang && h.getLoadedLanguages().includes(lang) ? lang : undefined;
    return h.codeToHtml(code, { lang: l || 'text', theme: 'vitesse-dark' });
  } catch {
    return `<pre><code>${escapeHTML(code)}</code></pre>`;
  }
}

// Queue for deferred highlighting of code blocks
const pendingHighlights: Array<{ el: HTMLElement; code: string; lang?: string }> = [];
let highlightBatchScheduled = false;

export function queueHighlight(el: HTMLElement, code: string, lang?: string): void {
  pendingHighlights.push({ el, code, lang });
  if (!highlightBatchScheduled) {
    highlightBatchScheduled = true;
    requestIdleCallback(processHighlightBatch, { timeout: 100 });
  }
}

// Scan DOM for un-highlighted code blocks and queue them
export function deferHighlightAll(): void {
  const els = document.querySelectorAll<HTMLElement>('pre[data-code]');
  els.forEach((el) => {
    if (el.dataset.highlighted === 'true') return;
    const code = decodeURIComponent(el.dataset.code || '');
    const lang = el.dataset.highlight || undefined;
    el.dataset.highlighted = 'true';
    queueHighlight(el, code, lang);
  });
}

function processHighlightBatch(deadline?: IdleDeadline): void {
  const batchSize = 5;
  let processed = 0;
  while (pendingHighlights.length > 0 && processed < batchSize && (!deadline || deadline.timeRemaining() > 2)) {
    const item = pendingHighlights.shift()!;
    getHighlighter().then((h) => {
      const l = item.lang && h.getLoadedLanguages().includes(item.lang) ? item.lang : undefined;
      try {
        const html = h.codeToHtml(item.code, { lang: l || 'text', theme: 'vitesse-dark' });
        // Extract inner content from shiki's <pre><code> wrapper
        const match = html.match(/<code[^>]*>([\s\S]*)<\/code>/);
        if (match && item.el.isConnected) {
          item.el.innerHTML = `<code>${match[1]}</code>`;
        }
      } catch {}
    });
    processed++;
  }
  if (pendingHighlights.length > 0) {
    requestIdleCallback(processHighlightBatch, { timeout: 100 });
  } else {
    highlightBatchScheduled = false;
  }
}

function guessLang(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust', css: 'css', scss: 'css',
    json: 'json', sh: 'bash', bash: 'bash', zsh: 'bash',
    html: 'html', xml: 'xml', svg: 'xml', yml: 'yaml', yaml: 'yaml',
    sql: 'sql', md: 'markdown', swift: 'swift', rb: 'ruby',
  };
  return ext ? map[ext] : undefined;
}

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

const TOOL_LABELS: Record<string, string> = {
  bash: 'Bash', edit: 'Edit', multiedit: 'Multi-Edit', write: 'Write',
  view: 'View', glob: 'Glob', grep: 'Grep', ls: 'List',
  fetch: 'Fetch', agentic_fetch: 'Agentic Fetch', web_fetch: 'Web Fetch',
  web_search: 'Search', download: 'Download', sourcegraph: 'Sourcegraph',
  todos: 'To-Do', question: 'Question', agent: 'Agent',
  lsp_diagnostics: 'Diagnostics', lsp_definition: 'Definition',
  lsp_references: 'References', lsp_symbols: 'Symbols',
  lsp_rename: 'Rename', lsp_replace_symbol: 'Replace Symbol',
  lsp_call_hierarchy: 'Call Hierarchy', lsp_restart: 'LSP Restart',
  job_output: 'Job Output', job_kill: 'Job Kill',
  crush_logs: 'Crush Logs', crush_info: 'Crush Info',
  read_mcp_resource: 'MCP Read', list_mcp_resources: 'MCP List',
};

const TOOL_ICONS: Record<string, string> = {
  bash: 'terminal', edit: 'file-pen', multiedit: 'files', write: 'file-plus',
  view: 'eye', glob: 'search', grep: 'regex', ls: 'folder-tree',
  fetch: 'globe', agentic_fetch: 'bot', web_fetch: 'globe', web_search: 'search',
  download: 'download', todos: 'list-checks', question: 'circle-help',
  agent: 'bot', sourcegraph: 'code',
  lsp_diagnostics: 'stethoscope', lsp_definition: 'arrow-right-from-line',
  lsp_references: 'list-filter', lsp_symbols: 'braces',
  lsp_rename: 'text-cursor-input', lsp_replace_symbol: 'replace',
  lsp_call_hierarchy: 'git-branch', lsp_restart: 'refresh-cw',
  job_output: 'scroll-text', job_kill: 'x',
  crush_logs: 'file-text', crush_info: 'info',
  read_mcp_resource: 'book-open', list_mcp_resources: 'list',
};

function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name.startsWith('mcp_')) return name.replace(/^mcp_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toolIcon(name: string): string {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (name.startsWith('mcp_')) return 'puzzle';
  return 'wrench';
}

function parseInput(input: string): Record<string, unknown> | null {
  try { return JSON.parse(input); } catch { return null; }
}

function renderToolCallHeader(name: string, params: Record<string, unknown> | null, finished: boolean | undefined): string {
  const label = toolLabel(name);
  const icon = toolIcon(name);
  const spinner = finished ? '' : ' <span class="spinner"></span>';
  let detail = '';

  switch (name) {
    case 'bash': {
      const cmd = ((params?.command as string) || '').replace(/\n/g, ' ').replace(/\t/g, '    ');
      detail = cmd ? ` <span class="tool-detail">${escapeHTML(cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd)}</span>` : '';
      break;
    }
    case 'edit':
    case 'write':
    case 'view': {
      const fp = params?.file_path as string;
      if (fp) detail = ` <span class="tool-detail">${escapeHTML(fp)}</span>`;
      break;
    }
    case 'multiedit': {
      const fp = params?.file_path as string;
      const count = Array.isArray(params?.edits) ? (params.edits as unknown[]).length : 0;
      if (fp) detail = ` <span class="tool-detail">${escapeHTML(fp)}${count ? ` (${count} edits)` : ''}</span>`;
      break;
    }
    case 'grep': {
      const pat = params?.pattern as string;
      const path = params?.path as string;
      if (pat) detail = ` <span class="tool-detail">"${escapeHTML(pat)}"${path ? ' in ' + escapeHTML(path) : ''}</span>`;
      break;
    }
    case 'glob': {
      const pat = params?.pattern as string;
      if (pat) detail = ` <span class="tool-detail">${escapeHTML(pat)}</span>`;
      break;
    }
    case 'ls': {
      const path = (params?.path as string) || '.';
      detail = ` <span class="tool-detail">${escapeHTML(path)}</span>`;
      break;
    }
    case 'fetch':
    case 'web_fetch':
    case 'agentic_fetch': {
      const url = params?.url as string;
      if (url) detail = ` <span class="tool-detail">${escapeHTML(url.length > 60 ? url.slice(0, 60) + '…' : url)}</span>`;
      break;
    }
    case 'web_search': {
      const q = params?.query as string;
      if (q) detail = ` <span class="tool-detail">"${escapeHTML(q)}"</span>`;
      break;
    }
    case 'todos': {
      const todos = params?.todos as Array<{ status?: string }>;
      if (Array.isArray(todos)) {
        const done = todos.filter(t => t.status === 'completed').length;
        detail = ` <span class="tool-detail">${done}/${todos.length}</span>`;
      }
      break;
    }
    default: {
      // For LSP/MCP/generic tools, show first meaningful param
      if (params) {
        const keys = Object.keys(params).filter(k => !['description'].includes(k));
        const first = keys[0];
        if (first && typeof params[first] === 'string') {
          const v = params[first] as string;
          detail = ` <span class="tool-detail">${escapeHTML(v.length > 60 ? v.slice(0, 60) + '…' : v)}</span>`;
        }
      }
    }
  }

  return `<div class="tool-call-header"><i data-lucide="${icon}"></i> <span class="name">${escapeHTML(label)}</span>${detail}${spinner}</div>`;
}

function renderToolResultBody(name: string, content: string, metadata: string | undefined): string {
  if (!content && !metadata) return '';

  let meta: Record<string, unknown> | null = null;
  if (metadata) {
    try { meta = JSON.parse(metadata); } catch {}
  }

  switch (name) {
    case 'bash': {
      const output = (meta?.output as string) || content;
      if (!output || output === 'no output') return '<div class="tool-output-empty">no output</div>';
      const code = output.slice(0, 3000);
      return `<pre class="tool-output" data-highlight="bash" data-code="${encodeURIComponent(code)}"><code>${escapeHTML(code)}</code></pre>`;
    }
    case 'edit':
    case 'multiedit': {
      const oldContent = meta?.old_content as string;
      const newContent = meta?.new_content as string;
      const filePath = (meta?.file_path as string) || '';
      const lang = filePath ? guessLang(filePath) : undefined;
      if (oldContent && newContent) {
        return `<div class="tool-diff">${renderColoredDiff(oldContent, newContent, lang)}</div>`;
      }
      if (content) {
        const code = content.slice(0, 1500);
        return `<pre class="tool-output" data-highlight="${lang || ''}" data-code="${encodeURIComponent(code)}"><code>${escapeHTML(code)}</code></pre>`;
      }
      return '';
    }
    case 'write': {
      if (content && content !== 'File successfully written.') {
        const code = content.slice(0, 2000);
        return `<pre class="tool-output" data-highlight="" data-code="${encodeURIComponent(code)}"><code>${escapeHTML(code)}</code></pre>`;
      }
      return '';
    }
    case 'view': {
      const viewContent = (meta?.content as string) || content;
      if (viewContent) {
        const code = viewContent.slice(0, 3000);
        return `<pre class="tool-output" data-highlight="" data-code="${encodeURIComponent(code)}"><code>${escapeHTML(code)}</code></pre>`;
      }
      return '';
    }
    case 'todos': {
      if (meta?.todos) {
        const todos = meta.todos as Array<{ content: string; status: string; active_form?: string }>;
        const lines = todos.map(t => {
          const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : '○';
          const cls = t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'active' : '';
          const text = t.status === 'in_progress' && t.active_form ? t.active_form : t.content;
          return `<div class="todo-item ${cls}"><span class="todo-icon">${icon}</span> ${escapeHTML(text)}</div>`;
        }).join('');
        return `<div class="todo-list">${lines}</div>`;
      }
      if (content) return `<pre class="tool-output"><code>${escapeHTML(content.slice(0, 1000))}</code></pre>`;
      return '';
    }
    default: {
      if (!content) return '';
      const maxLen = 2000;
      const truncated = content.length > maxLen ? content.slice(0, maxLen) + '\n…' : content;
      return `<pre class="tool-output" data-highlight="" data-code="${encodeURIComponent(truncated)}"><code>${escapeHTML(truncated)}</code></pre>`;
    }
  }
}

function renderColoredDiff(oldStr: string, newStr: string, lang?: string): string {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  // Render plain text diff first — highlighting deferred via data attrs
  const lcs = computeLCS(oldLines, newLines);
  const result: string[] = [];
  let oi = 0, ni = 0, li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li] && ni < newLines.length && newLines[ni] === lcs[li]) {
      result.push(`<span class="diff-ctx">  ${escapeHTML(lcs[li])}</span>`);
      oi++; ni++; li++;
    } else if (li < lcs.length && ni < newLines.length && newLines[ni] === lcs[li]) {
      result.push(`<span class="diff-del">- ${escapeHTML(oldLines[oi])}</span>`);
      oi++;
    } else if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li]) {
      result.push(`<span class="diff-add">+ ${escapeHTML(newLines[ni])}</span>`);
      ni++;
    } else {
      if (oi < oldLines.length && (ni >= newLines.length || li >= lcs.length)) {
        result.push(`<span class="diff-del">- ${escapeHTML(oldLines[oi])}</span>`);
        oi++;
      } else if (ni < newLines.length) {
        result.push(`<span class="diff-add">+ ${escapeHTML(newLines[ni])}</span>`);
        ni++;
      }
    }
  }

  // Collapse context
  const CONTEXT = 3;
  const raw = result.map(html => {
    if (html.includes('diff-ctx')) return { type: 'ctx' as const, html };
    if (html.includes('diff-add')) return { type: 'add' as const, html };
    return { type: 'del' as const, html };
  });

  const collapsed: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i].type === 'ctx') {
      let end = i;
      while (end < raw.length && raw[end].type === 'ctx') end++;
      const ctxLen = end - i;
      const hasChangeAfter = end < raw.length;
      const hasChangeBefore = i > 0;

      if (!hasChangeAfter && !hasChangeBefore) {
        for (let j = i; j < end; j++) collapsed.push(raw[j].html);
      } else if (ctxLen <= CONTEXT * 2 + 1) {
        for (let j = i; j < end; j++) collapsed.push(raw[j].html);
      } else {
        const headEnd = hasChangeBefore ? i + CONTEXT : i;
        const tailStart = hasChangeAfter ? end - CONTEXT : end;
        if (hasChangeBefore) for (let j = i; j < headEnd; j++) collapsed.push(raw[j].html);
        const hidden = tailStart - headEnd;
        if (hidden > 0) collapsed.push(`<span class="diff-fold">${hidden} unchanged lines</span>`);
        if (hasChangeAfter) for (let j = tailStart; j < end; j++) collapsed.push(raw[j].html);
      }
      i = end;
    } else {
      collapsed.push(raw[i].html);
      i++;
    }
  }

  return `<pre class="tool-output diff"><code>${collapsed.join('\n')}</code></pre>`;
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  // Cap to avoid OOM on huge files
  if (m * n > 500000) {
    // Fallback: line-by-line comparison for large files
    const result: string[] = [];
    const max = Math.max(m, n);
    for (let i = 0; i < max; i++) {
      if (i < m && i < n && a[i] === b[i]) result.push(a[i]);
    }
    return result;
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}

export function renderPart(part: ContentPart): string {
  const { type, data } = part;

  switch (type) {
    case 'text':
      return `<div>${renderMarkdown((data.text as string) || '')}</div>`;

    case 'reasoning': {
      const thinking = (data.thinking as string) || '';
      if (!thinking) return '';
      return `<details class="thinking-block"><summary><i data-lucide="brain"></i> Thinking</summary><div>${renderMarkdown(thinking)}</div></details>`;
    }

    case 'tool_call': {
      const name = (data.name as string) || 'tool';
      const input = (data.input as string) || '';
      const finished = data.finished as boolean | undefined;
      const params = parseInput(input);
      const header = renderToolCallHeader(name, params, finished);
      return `<div class="tool-call">${header}</div>`;
    }

    case 'tool_result': {
      const name = (data.name as string) || 'result';
      const content = (data.content as string) || '';
      const metadata = data.metadata as string | undefined;
      const isError = data.is_error as boolean | undefined;
      const cls = isError ? 'err' : 'ok';
      const icon = isError ? 'circle-x' : 'circle-check';
      const label = toolLabel(name);
      const body = renderToolResultBody(name, content, metadata);
      return `<div class="tool-result ${cls}">
        <div class="tool-result-header"><i data-lucide="${icon}"></i> ${escapeHTML(label)}</div>
        ${body}
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
