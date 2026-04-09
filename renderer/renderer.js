/* ── Claude Terminal — renderer process ────────────────────────────────────
   Depends on: xterm.js, @xterm/addon-fit, @xterm/addon-web-links (loaded via
   <script> tags in index.html from node_modules)
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

// ── xterm setup ─────────────────────────────────────────────────────────────

const term = new Terminal({
  fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
  fontSize: 14,
  lineHeight: 1.25,
  letterSpacing: 0.3,
  cursorBlink: true,
  cursorStyle: 'bar',
  allowTransparency: false,
  scrollback: 5000,
  theme: {
    background:  '#0d0d1a',
    foreground:  '#e2e8f0',
    cursor:      '#a78bfa',
    cursorAccent:'#0d0d1a',
    black:       '#1e1e2e',
    red:         '#f38ba8',
    green:       '#a6e3a1',
    yellow:      '#f9e2af',
    blue:        '#89b4fa',
    magenta:     '#cba6f7',
    cyan:        '#89dceb',
    white:       '#cdd6f4',
    brightBlack: '#585b70',
    brightRed:   '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow:'#f9e2af',
    brightBlue:  '#89b4fa',
    brightMagenta:'#cba6f7',
    brightCyan:  '#89dceb',
    brightWhite: '#cdd6f4',
  },
});

const fitAddon = new FitAddon.FitAddon();
const webLinksAddon = new WebLinksAddon.WebLinksAddon();
term.loadAddon(fitAddon);
term.loadAddon(webLinksAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();

// ── Elements ─────────────────────────────────────────────────────────────────

const elStatus        = document.getElementById('claude-status');
const elHint          = document.getElementById('prompt-hint');
const elApprovalGroup = document.getElementById('approval-group');
const elBtnAccept     = document.getElementById('btn-accept');
const elBtnSession    = document.getElementById('btn-session');
const elBtnRefuse     = document.getElementById('btn-refuse');
const elBtnEscape     = document.getElementById('btn-escape');
const elBtnSendYes    = document.getElementById('btn-send-yes');
const elBtnSendNo     = document.getElementById('btn-send-no');
const elBtnSendEnter  = document.getElementById('btn-send-enter');
const elBtnRestart    = document.getElementById('btn-restart');
const elBtnPickFolder = document.getElementById('btn-pick-folder');
const elCwdDisplay    = document.getElementById('cwd-display');
const elShellSelect   = document.getElementById('shell-select');

// ── State ────────────────────────────────────────────────────────────────────

let claudeRunning    = false;
let waitingApproval  = false;
let hasSessionOption = false;  // true when Claude shows the 3-choice prompt

// Rolling buffer of last ~4 KB of stripped text to detect prompts
const BUFFER_SIZE = 4096;
let outputBuffer  = '';

// ── Prompt detection ─────────────────────────────────────────────────────────
//
// Claude Code outputs several kinds of approval prompts. We watch for these
// patterns and surface the Accept / Refuse buttons when detected.

// Three-choice pattern: Claude Code shows "Yes / Yes, don't ask again / No"
const SESSION_PATTERNS = [
  /don'?t ask again/i,
  /yes,?\s+and\s+don'?t/i,
  /yes for this session/i,
  /always allow/i,
];

const APPROVAL_PATTERNS = [
  // Standard yes/no
  /\?\s*\(y\/n\)/i,
  /\?\s*\[y\/n\]/i,
  // "Do you want to…"
  /do you want to\b/i,
  // Tool-use approvals
  /allow this (action|tool|command)\?/i,
  /proceed\?\s*$/im,
  // Claude Code specific
  /\(Yes\/No\)/i,
  /\[Yes\/No\]/i,
  /Press Enter to confirm/i,
  // Three-choice variant also triggers general approval
  ...SESSION_PATTERNS,
];

const CLAUDE_RUNNING_PATTERNS = [
  /claude\s+v?\d+\.\d+/i,   // "Claude v1.x.x"
  />\s*$/m,                  // generic shell prompt from within claude
];

/** Strip ANSI escape codes from a string */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKHFJA-Za-z]/g, '')
            .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
            .replace(/\x1b[()][B0]/g, '')
            .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function updateBuffer(raw) {
  outputBuffer = (outputBuffer + stripAnsi(raw)).slice(-BUFFER_SIZE);
}

function detectApproval(raw) {
  const text = stripAnsi(raw);
  return APPROVAL_PATTERNS.some((p) => p.test(text));
}

function detectSession(raw) {
  const text = stripAnsi(raw);
  return SESSION_PATTERNS.some((p) => p.test(text));
}

function setApprovalVisible(visible, hint = '', sessionOption = false) {
  waitingApproval  = visible;
  hasSessionOption = visible && sessionOption;

  elApprovalGroup.classList.toggle('hidden', !visible);
  // Show "Yes, session" button only when the 3-choice prompt is detected
  elBtnSession.classList.toggle('hidden', !hasSessionOption);
  elHint.textContent = hint;

  if (visible) {
    setStatus('waiting', '● Waiting for approval');
  } else {
    setStatus(claudeRunning ? 'running' : 'idle',
              claudeRunning ? '● Claude' : '● Claude');
  }
}

function setStatus(type, label) {
  elStatus.className = `status-${type}`;
  elStatus.textContent = label;
}

// ── PTY data flow ─────────────────────────────────────────────────────────────

window.electronAPI.onPtyData((data) => {
  term.write(data);
  updateBuffer(data);

  if (detectApproval(data)) {
    // Extract a short hint from the last non-empty line
    const lines   = stripAnsi(data).split('\n').filter((l) => l.trim());
    const hint    = lines[lines.length - 1]?.trim().slice(0, 80) || '';
    // Check both the new chunk AND the rolling buffer for the session option
    const session = detectSession(data) || detectSession(outputBuffer);
    setApprovalVisible(true, hint, session);
  }
});

window.electronAPI.onPtyExit((code) => {
  term.writeln(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m`);
  claudeRunning = false;
  setApprovalVisible(false);
  setStatus('idle', '● Offline');
});

// ── Keyboard input ────────────────────────────────────────────────────────────

term.onData((data) => {
  window.electronAPI.writePty(data);

  // If user typed anything, assume approval was handled
  if (waitingApproval) setApprovalVisible(false, '', false);
});

// ── Button actions ────────────────────────────────────────────────────────────

function send(text) {
  window.electronAPI.writePty(text);
  term.focus();
}

elBtnAccept.addEventListener('click', () => {
  // "Yes" is the first (default) option — just press Enter
  send('\r');
  setApprovalVisible(false);
});

elBtnSession.addEventListener('click', () => {
  // "Yes, don't ask again" is the second option — Down arrow then Enter
  send('\x1b[B\r');
  setApprovalVisible(false);
});

elBtnRefuse.addEventListener('click', () => {
  // "No" — if 3-choice: Down twice then Enter; if 2-choice: send 'n'
  if (hasSessionOption) {
    send('\x1b[B\x1b[B\r');
  } else {
    send('n\r');
  }
  setApprovalVisible(false);
});

elBtnEscape.addEventListener('click',    () => send('\x1b'));
elBtnSendYes.addEventListener('click',   () => { send('y\r'); setApprovalVisible(false); });
elBtnSendNo.addEventListener('click',    () => { send('n\r'); setApprovalVisible(false); });
elBtnSendEnter.addEventListener('click', () => send('\r'));

elBtnRestart.addEventListener('click', restartPty);

elShellSelect.addEventListener('change', restartPty);

// ── Global keyboard shortcuts ─────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+Y → Yes (accept once)
  if (e.ctrlKey && e.shiftKey && e.key === 'Y') {
    e.preventDefault();
    elBtnAccept.click();
  }
  // Ctrl+Shift+S → Yes, don't ask again (session)
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    elBtnSession.click();
  }
  // Ctrl+Shift+N → No / Refuse
  if (e.ctrlKey && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    elBtnRefuse.click();
  }
  // Ctrl+Shift+R → Restart terminal
  if (e.ctrlKey && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    restartPty();
  }
  // Ctrl+Shift+Enter → Send Enter (useful inside Claude prompts)
  if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
    e.preventDefault();
    send('\r');
  }
});

// ── Resize handling ───────────────────────────────────────────────────────────

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  window.electronAPI.resizePty({ cols: term.cols, rows: term.rows });
});
resizeObserver.observe(document.getElementById('terminal-container'));

// ── CWD helpers ───────────────────────────────────────────────────────────────

let pendingCwd = null;  // set by folder picker before restart

function setCwdDisplay(cwd) {
  if (!cwd) return;
  // Show last 2 path segments to keep it short
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  const short = parts.length > 2 ? '…/' + parts.slice(-2).join('/') : parts.join('/');
  elCwdDisplay.textContent = short;
  elCwdDisplay.title = cwd;
}

elBtnPickFolder.addEventListener('click', async () => {
  const folder = await window.electronAPI.pickFolder();
  if (folder) {
    pendingCwd = folder;
    setCwdDisplay(folder);
    await restartPty();
  }
});

// Ctrl+Shift+O → open folder picker
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'O') {
    e.preventDefault();
    elBtnPickFolder.click();
  }
});

// ── Start PTY ─────────────────────────────────────────────────────────────────

async function startPty() {
  const shell = elShellSelect.value === 'auto' ? undefined : elShellSelect.value;
  const cwd   = pendingCwd || undefined;
  pendingCwd  = null;
  const resolvedCwd = await window.electronAPI.startPty({ cols: term.cols, rows: term.rows, shell, cwd });
  if (resolvedCwd) setCwdDisplay(resolvedCwd);
  claudeRunning = true;
  setStatus('running', '● Claude');
}

async function restartPty() {
  window.electronAPI.killPty();
  claudeRunning = false;
  setApprovalVisible(false, '', false);
  term.reset();
  await new Promise((r) => setTimeout(r, 300));
  await startPty();
  term.focus();
}

// Boot — read startup cwd from main process, then start
(async () => {
  const startupCwd = await window.electronAPI.getStartupCwd();
  if (startupCwd) {
    pendingCwd = startupCwd;
    setCwdDisplay(startupCwd);
  }
  await startPty();
  term.focus();
})();
