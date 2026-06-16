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

import hljs from 'highlight.js/lib/core';
// Register common languages
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import swift from 'highlight.js/lib/languages/swift';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('swift', swift);

function highlightCode(code: string, lang?: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try { return hljs.highlight(code, { language: lang }).value; } catch {}
  }
  try { return hljs.highlightAuto(code).value; } catch {}
  return escapeHTML(code);
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
      return `<pre class="tool-output"><code>${highlightCode(output.slice(0, 3000), 'bash')}</code></pre>`;
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
      if (content) return `<pre class="tool-output"><code>${highlightCode(content.slice(0, 1500), lang)}</code></pre>`;
      return '';
    }
    case 'write': {
      // Try to get file path from the matching tool_call to guess language
      if (content && content !== 'File successfully written.') {
        return `<pre class="tool-output"><code>${highlightCode(content.slice(0, 2000))}</code></pre>`;
      }
      return '';
    }
    case 'view': {
      const viewContent = (meta?.content as string) || content;
      if (viewContent) {
        return `<pre class="tool-output"><code>${highlightCode(viewContent.slice(0, 3000))}</code></pre>`;
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
      return `<pre class="tool-output"><code>${highlightCode(truncated)}</code></pre>`;
    }
  }
}

function renderColoredDiff(oldStr: string, newStr: string, lang?: string): string {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  const hlOld = oldLines.map(l => highlightCode(l, lang));
  const hlNew = newLines.map(l => highlightCode(l, lang));

  const lcs = computeLCS(oldLines, newLines);
  const raw: Array<{ type: 'ctx' | 'add' | 'del'; html: string }> = [];
  let oi = 0, ni = 0, li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li] && ni < newLines.length && newLines[ni] === lcs[li]) {
      raw.push({ type: 'ctx', html: `<span class="diff-ctx">  ${hlOld[oi]}</span>` });
      oi++; ni++; li++;
    } else if (li < lcs.length && ni < newLines.length && newLines[ni] === lcs[li]) {
      raw.push({ type: 'del', html: `<span class="diff-del">- ${hlOld[oi]}</span>` });
      oi++;
    } else if (li < lcs.length && oi < oldLines.length && oldLines[oi] === lcs[li]) {
      raw.push({ type: 'add', html: `<span class="diff-add">+ ${hlNew[ni]}</span>` });
      ni++;
    } else {
      if (oi < oldLines.length && (ni >= newLines.length || li >= lcs.length)) {
        raw.push({ type: 'del', html: `<span class="diff-del">- ${hlOld[oi]}</span>` });
        oi++;
      } else if (ni < newLines.length) {
        raw.push({ type: 'add', html: `<span class="diff-add">+ ${hlNew[ni]}</span>` });
        ni++;
      }
    }
  }

  // Collapse consecutive context lines, keeping 3 lines of context around changes
  const CONTEXT = 3;
  const result: string[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i].type === 'ctx') {
      // Find the extent of this context run
      let end = i;
      while (end < raw.length && raw[end].type === 'ctx') end++;
      const ctxLen = end - i;

      // Is there a change after this context block?
      const hasChangeAfter = end < raw.length;
      // Was there a change before this context block?
      const hasChangeBefore = i > 0;

      if (!hasChangeAfter && !hasChangeBefore) {
        // Entire diff is context — show all
        for (let j = i; j < end; j++) result.push(raw[j].html);
      } else if (ctxLen <= CONTEXT * 2 + 1) {
        // Small enough to show entirely
        for (let j = i; j < end; j++) result.push(raw[j].html);
      } else {
        // Show head + fold + tail
        const headEnd = hasChangeBefore ? i + CONTEXT : i;
        const tailStart = hasChangeAfter ? end - CONTEXT : end;

        if (hasChangeBefore) {
          for (let j = i; j < headEnd; j++) result.push(raw[j].html);
        }
        const hidden = tailStart - headEnd;
        if (hidden > 0) {
          result.push(`<span class="diff-fold">${hidden} unchanged lines</span>`);
        }
        if (hasChangeAfter) {
          for (let j = tailStart; j < end; j++) result.push(raw[j].html);
        }
      }
      i = end;
    } else {
      result.push(raw[i].html);
      i++;
    }
  }

  return `<pre class="tool-output diff"><code>${result.join('\n')}</code></pre>`;
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
