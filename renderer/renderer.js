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
const elBtnStt          = document.getElementById('btn-stt');
const elSttLang         = document.getElementById('stt-lang');
const elSttInterim      = document.getElementById('stt-interim');
const elImgPreview      = document.getElementById('img-preview');
const elImgThumb        = document.getElementById('img-preview-thumb');
const elImgPath         = document.getElementById('img-preview-path');
const elImgClose        = document.getElementById('img-preview-close');
const elSessionPanel    = document.getElementById('session-panel');

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

// ── Paste & drag-drop ─────────────────────────────────────────────────────────
//
// Ctrl+V  → text: write to PTY directly
//         → image: save to temp file, show preview, insert path into terminal
// Drag image file onto window → same as image paste

let imgPreviewTimer = null;

function showImagePreview(imgPath) {
  clearTimeout(imgPreviewTimer);
  elImgThumb.src = 'file://' + imgPath.replace(/\\/g, '/');
  elImgPath.textContent = imgPath;
  elImgPreview.classList.remove('hidden');
  // Auto-hide after 6 s
  imgPreviewTimer = setTimeout(hideImagePreview, 6000);
}

function hideImagePreview() {
  clearTimeout(imgPreviewTimer);
  elImgPreview.classList.add('hidden');
  elImgThumb.src = '';
}

elImgClose.addEventListener('click', hideImagePreview);

/** Save an image Blob to a temp file and type its path into the terminal */
async function pasteImageBlob(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const imgPath  = await window.electronAPI.saveImage(arrayBuf);
  // Insert the path at the current cursor position
  send(imgPath);
  showImagePreview(imgPath);
  term.focus();
}

/** Save a file path as-is (drag-drop of an existing image file) */
async function pasteImagePath(filePath) {
  send(filePath);
  // Show preview using the original file directly
  elImgThumb.src = 'file://' + filePath.replace(/\\/g, '/');
  elImgPath.textContent = filePath;
  clearTimeout(imgPreviewTimer);
  elImgPreview.classList.remove('hidden');
  imgPreviewTimer = setTimeout(hideImagePreview, 6000);
  term.focus();
}

// Intercept Ctrl+V before xterm can treat it as ^V (ASCII 22)
term.attachCustomKeyEventHandler(async (e) => {
  if (e.type !== 'keydown') return true;
  if (!e.ctrlKey || e.key !== 'v' || e.shiftKey || e.altKey) return true;

  // Ctrl+V pressed — check clipboard for image first, then text
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        await pasteImageBlob(blob);
        return false; // consumed
      }
    }
    // No image — paste as text
    const text = await navigator.clipboard.readText();
    if (text) send(text);
  } catch {
    // Clipboard API denied (e.g. focus issue) — let xterm handle it
    return true;
  }
  return false;
});

// Drag-and-drop image files onto the terminal window
document.addEventListener('dragover', (e) => { e.preventDefault(); });
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer?.files || [])];
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      // file.path is an Electron-only property with the real FS path
      if (file.path) {
        await pasteImagePath(file.path);
      } else {
        await pasteImageBlob(file);
      }
      break; // one image at a time
    }
  }
});

// ── STT engine ───────────────────────────────────────────────────────────────
//
// Uses the Web Speech API (SpeechRecognition) — built into Chromium/Electron,
// uses the OS speech engine on Windows. No API key required.

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const stt = (() => {
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not available in this environment');
    return { enabled: false, toggle() {}, stop() {} };
  }

  const rec = new SpeechRecognition();
  rec.continuous      = true;   // keep listening after each result
  rec.interimResults  = true;   // show partial results while speaking
  rec.maxAlternatives = 1;

  let enabled = false;

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        // Send the final recognised text to the terminal
        const text = transcript.trim();
        if (text) send(text);
        elSttInterim.textContent = '';
      } else {
        interim += transcript;
      }
    }
    elSttInterim.textContent = interim;
  };

  rec.onerror = (e) => {
    // 'no-speech' fires after silence — just restart quietly
    if (e.error === 'no-speech' && enabled) {
      rec.stop(); // onend will restart it
      return;
    }
    console.error('STT error:', e.error);
    if (enabled) _disable();
  };

  rec.onend = () => {
    // Restart automatically if still supposed to be on
    if (enabled) {
      try { rec.lang = elSttLang.value; rec.start(); } catch {}
    }
  };

  function _enable() {
    enabled = true;
    rec.lang = elSttLang.value;
    try { rec.start(); } catch {}
    elBtnStt.textContent = '🎙 STT';
    elBtnStt.className   = 'action-btn stt-on';
  }

  function _disable() {
    enabled = false;
    try { rec.stop(); } catch {}
    elSttInterim.textContent = '';
    elBtnStt.textContent = '🎤 STT';
    elBtnStt.className   = 'action-btn stt-off';
  }

  // Update lang immediately if the user changes it while active
  elSttLang.addEventListener('change', () => {
    if (enabled) { rec.stop(); } // onend restarts with new lang
  });

  return {
    get enabled() { return enabled; },
    toggle() { enabled ? _disable() : _enable(); },
    stop()   { if (enabled) _disable(); },
  };
})();

elBtnStt.addEventListener('click', () => stt.toggle());

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
  // Ctrl+Shift+T → Toggle STT
  if (e.ctrlKey && e.shiftKey && e.key === 'T') {
    e.preventDefault();
    stt.toggle();
  }
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
    await restartPty(); // shows session panel after shell restarts
  }
});

// Ctrl+Shift+O → open folder picker
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'O') {
    e.preventDefault();
    elBtnPickFolder.click();
  }
});

// ── Session startup panel ─────────────────────────────────────────────────────

function showSessionPanel() {
  elSessionPanel.classList.remove('hidden');
  // Focus the first button for keyboard navigation
  document.getElementById('sess-new').focus();
}

function hideSessionPanel() {
  elSessionPanel.classList.add('hidden');
}

function launchClaude(mode) {
  // PTY is already running — just write the right command
  const nl  = '\r\n';
  const cmd =
    mode === 'continue' ? `claude --continue${nl}` :
    mode === 'resume'   ? `claude --resume${nl}`   :
                          `claude${nl}`;
  window.electronAPI.writePty(cmd);
  hideSessionPanel();
  term.focus();
}

// Button clicks
document.querySelectorAll('.session-opt').forEach((btn) => {
  btn.addEventListener('click', () => launchClaude(btn.dataset.mode));
});

// Keyboard shortcuts 1 / 2 / 3 while panel is visible
document.addEventListener('keydown', (e) => {
  if (elSessionPanel.classList.contains('hidden')) return;
  const map = { '1': 'new', '2': 'continue', '3': 'resume' };
  if (map[e.key]) {
    e.preventDefault();
    launchClaude(map[e.key]);
  }
});

// ── Start PTY ─────────────────────────────────────────────────────────────────

async function restartPty() {
  stt.stop();
  window.electronAPI.killPty();
  claudeRunning = false;
  setApprovalVisible(false, '', false);
  term.reset();
  await new Promise((r) => setTimeout(r, 300));
  await bootShell();
}

/** Start the underlying shell (no claude yet), then show session picker */
async function bootShell() {
  const shell = elShellSelect.value === 'auto' ? undefined : elShellSelect.value;
  const resolvedCwd = await window.electronAPI.startPty({
    cols: term.cols, rows: term.rows,
    shell,
    cwd: pendingCwd || undefined,
    sessionMode: 'none',  // shell only, no claude
  });
  pendingCwd = null;
  if (resolvedCwd) setCwdDisplay(resolvedCwd);
  claudeRunning = true;
  setStatus('running', '● Claude');
  showSessionPanel();
}

// Boot
(async () => {
  const startupCwd = await window.electronAPI.getStartupCwd();
  if (startupCwd) {
    pendingCwd = startupCwd;
    setCwdDisplay(startupCwd);
  }
  await bootShell();
})();
