const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

let mainWindow;

// ── Resolve the startup CWD ───────────────────────────────────────────────────
// Priority: CLI arg  >  env var set by context-menu  >  home dir
//
// Supported CLI forms:
//   electron . "C:\some\path"
//   electron . --cwd "C:\some\path"
function resolveStartupCwd() {
  const args = process.argv.slice(2); // strip node + script
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) return args[i + 1];
    // bare path argument (not a flag)
    if (!args[i].startsWith('-') && fs.existsSync(args[i])) return args[i];
  }
  // Context-menu launcher sets this env var
  if (process.env.CLAUDE_TERMINAL_CWD && fs.existsSync(process.env.CLAUDE_TERMINAL_CWD)) {
    return process.env.CLAUDE_TERMINAL_CWD;
  }
  return os.homedir();
}

let startupCwd = resolveStartupCwd();

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#e0e0e0',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ── PTY management ────────────────────────────────────────────────────────────

let ptyProcess = null;
let currentCwd = startupCwd;

function resolveShell(shellOverride) {
  const candidates =
    shellOverride === 'powershell'
      ? ['powershell.exe']
      : shellOverride === 'cmd'
      ? ['cmd.exe']
      : [
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
          process.env.COMSPEC || 'cmd.exe',
        ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

ipcMain.handle('pty:start', (_event, { cols, rows, shell: shellOverride, cwd, sessionMode }) => {
  if (ptyProcess) return;

  const pty      = require('node-pty');
  const shellPath = resolveShell(shellOverride);
  const isGitBash = shellPath.toLowerCase().includes('bash');
  const spawnCwd  = cwd || currentCwd;

  currentCwd = spawnCwd;

  ptyProcess = pty.spawn(shellPath, [], {
    name: 'xterm-256color',
    cols: cols || 120,
    rows: rows || 30,
    cwd: spawnCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:data', data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    ptyProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pty:exit', exitCode);
    }
  });

  // Auto-launch claude after shell initialises
  // sessionMode: 'new' | 'continue' | 'resume' | 'none'
  setTimeout(() => {
    if (!ptyProcess) return;
    const nl  = isGitBash ? '\n' : '\r\n';
    const cmd =
      sessionMode === 'continue' ? `claude --continue${nl}` :
      sessionMode === 'resume'   ? `claude --resume${nl}`   :
      sessionMode === 'none'     ? ''                        :
                                   `claude${nl}`;            // 'new' or default
    if (cmd) ptyProcess.write(cmd);
  }, 800);

  // Send the resolved cwd back so the renderer can display it
  return spawnCwd;
});

ipcMain.on('pty:write',  (_event, data)         => ptyProcess?.write(data));
ipcMain.on('pty:resize', (_event, { cols, rows }) => ptyProcess?.resize(cols, rows));
ipcMain.on('pty:kill',   ()                      => { ptyProcess?.kill(); ptyProcess = null; });

// ── STT via Windows SAPI ─────────────────────────────────────────────────────

let sttProcess = null;

ipcMain.handle('stt:start', (_event, lang = 'en-US') => {
  if (sttProcess) return 'already_running';

  const { spawn } = require('child_process');
  const scriptPath = path.join(__dirname, 'stt.ps1');

  sttProcess = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath, '-Lang', lang,
  ]);

  sttProcess.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      const text = line.trim();
      if (!text || text === 'READY') continue;
      // Write recognised text directly to the PTY
      if (ptyProcess) ptyProcess.write(text);
      // Also notify renderer (for interim display)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stt:result', text);
      }
    }
  });

  sttProcess.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stt:error', msg);
    }
  });

  sttProcess.on('exit', () => {
    sttProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stt:stopped');
    }
  });

  return 'started';
});

ipcMain.handle('stt:stop', () => {
  sttProcess?.kill();
  sttProcess = null;
});

// ── Clipboard image save ──────────────────────────────────────────────────────

ipcMain.handle('clipboard:saveImage', async (_event, buffer) => {
  const tmpDir  = require('os').tmpdir();
  const imgPath = path.join(tmpDir, `claude-paste-${Date.now()}.png`);
  fs.writeFileSync(imgPath, Buffer.from(buffer));
  return imgPath;
});

// ── Folder picker ─────────────────────────────────────────────────────────────

ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title:       'Choose working folder',
    defaultPath: currentCwd,
    properties:  ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  currentCwd = result.filePaths[0];
  return currentCwd;
});

// ── Expose startup cwd to renderer ───────────────────────────────────────────

ipcMain.handle('app:getStartupCwd', () => startupCwd);

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Grant microphone permission for SpeechRecognition (STT)
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'microphone');
  });
  createWindow();
});

app.on('window-all-closed', () => {
  ptyProcess?.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
