import { state } from './state';
import { handleDisconnect } from './connect';
import { renderChat, renderInputBar } from './chat';
import { updateSidebarYolo } from './palette';

interface CommandItem {
  id: string;
  label: string;
  icon: string;
  category: string;
  action: () => void | Promise<void>;
}

const CATEGORIES = ['Actions', 'Sessions'] as const;
type Category = typeof CATEGORIES[number];

let paletteOpen = false;

export function initCommandPalette(): void {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      togglePalette();
    }
    if (e.key === 'Escape' && paletteOpen) {
      closePalette();
    }
  });
}

function togglePalette(): void {
  if (paletteOpen) closePalette();
  else openPalette();
}

function getCommands(): CommandItem[] {
  const cmds: CommandItem[] = [];

  // Actions
  cmds.push({
    id: 'new-session', label: 'New Session', icon: 'plus', category: 'Actions',
    action: async () => {
      if (!state.api || !state.workspace) return;
      const session = await state.api.createSession(state.workspace.id);
      state.sessions.unshift(session);
      state.activeSessionID = session.id;
      state.messages = [];
      renderChat();
    },
  });

  const yoloLabel = state.permissionMode === 'normal' ? 'Enable YOLO Mode'
    : state.permissionMode === 'yolo' ? 'Enable Super YOLO'
    : 'Disable YOLO';
  const nextMode = state.permissionMode === 'normal' ? 'yolo'
    : state.permissionMode === 'yolo' ? 'super_yolo'
    : 'normal';
  cmds.push({
    id: 'yolo-toggle', label: yoloLabel,
    icon: state.permissionMode !== 'normal' ? 'zap' : 'shield',
    category: 'Actions',
    action: async () => {
      if (!state.api || !state.workspace) return;
      await state.api.setPermissionMode(state.workspace.id, nextMode);
      state.permissionMode = nextMode;
      updateSidebarYolo();
      renderInputBar();
    },
  });

  cmds.push({
    id: 'disconnect', label: 'Disconnect', icon: 'log-out', category: 'Actions',
    action: () => handleDisconnect(),
  });

  // Sessions
  for (const s of state.sessions) {
    cmds.push({
      id: `session-${s.id}`,
      label: s.title || 'Untitled',
      icon: 'message-square',
      category: 'Sessions',
      action: async () => {
        state.activeSessionID = s.id;
        state.messages = [];
        renderChat();
        if (state.api && state.workspace) {
          try {
            state.messages = await state.api.getSessionMessages(state.workspace.id, s.id);
            state.messageCache.set(s.id, state.messages);
            renderChat();
          } catch {}
        }
      },
    });
  }

  return cmds;
}

function openPalette(): void {
  paletteOpen = true;
  const allCommands = getCommands();
  let activeCategory: Category = 'Actions';

  const overlay = document.createElement('div');
  overlay.className = 'palette-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) closePalette(); };

  overlay.innerHTML = `
    <div class="palette">
      <div class="palette-tabs"></div>
      <div class="palette-input-wrap">
        <i data-lucide="search"></i>
        <input type="text" placeholder="Type a command..." autofocus spellcheck="false">
      </div>
      <div class="palette-list"></div>
    </div>
  `;

  document.body.appendChild(overlay);
  try { (window as any).lucide?.createIcons(); } catch {}

  const input = overlay.querySelector('input')!;
  requestAnimationFrame(() => input.focus());
  const list = overlay.querySelector('.palette-list')!;
  const tabs = overlay.querySelector('.palette-tabs')!;

  let filtered: CommandItem[] = [];
  let selectedIdx = 0;

  function renderTabs() {
    tabs.innerHTML = CATEGORIES.map((cat) => `
      <button class="palette-tab ${cat === activeCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');

    tabs.querySelectorAll('.palette-tab').forEach((btn) => {
      (btn as HTMLElement).onclick = () => {
        activeCategory = (btn as HTMLElement).dataset.cat as Category;
        input.value = '';
        filterAndRender();
        renderTabs();
        input.focus();
      };
    });
  }

  function filterAndRender() {
    const q = input.value.toLowerCase();
    const catCmds = allCommands.filter(c => c.category === activeCategory);
    filtered = q ? catCmds.filter(c => c.label.toLowerCase().includes(q)) : catCmds;
    selectedIdx = 0;
    renderList();
  }

  function renderList() {
    if (filtered.length === 0) {
      list.innerHTML = '<div class="palette-empty">No commands</div>';
      return;
    }
    list.innerHTML = filtered.map((cmd, i) => `
      <div class="palette-item ${i === selectedIdx ? 'selected' : ''}" data-idx="${i}">
        <i data-lucide="${cmd.icon}"></i>
        <span>${escapeForPalette(cmd.label)}</span>
      </div>
    `).join('');
    try { (window as any).lucide?.createIcons(); } catch {}

    // Scroll selected into view
    const sel = list.querySelector('.palette-item.selected');
    sel?.scrollIntoView({ block: 'nearest' });

    list.querySelectorAll('.palette-item').forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const idx = parseInt((el as HTMLElement).dataset.idx!);
        executeCommand(filtered[idx]);
      };
    });
  }

  renderTabs();
  filterAndRender();

  input.oninput = () => filterAndRender();

  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIdx]) executeCommand(filtered[selectedIdx]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      const catIdx = CATEGORIES.indexOf(activeCategory);
      const nextIdx = (catIdx + dir + CATEGORIES.length) % CATEGORIES.length;
      activeCategory = CATEGORIES[nextIdx];
      input.value = '';
      filterAndRender();
      renderTabs();
    }
  };
}

function executeCommand(cmd: CommandItem): void {
  closePalette();
  cmd.action();
}

function closePalette(): void {
  paletteOpen = false;
  document.querySelector('.palette-overlay')?.remove();
}

function escapeForPalette(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function updateSidebarYolo(): void {
  const el = document.getElementById('sidebar-yolo');
  if (el) {
    const mode = state.permissionMode;
    el.textContent = mode === 'normal' ? 'Normal' : mode === 'yolo' ? 'YOLO' : 'Super YOLO';
    el.className = `sidebar-value ${mode !== 'normal' ? `yolo-active ${mode}` : ''}`;
  }
}
