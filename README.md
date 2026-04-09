# Claude Terminal for Windows

A custom Electron terminal for Windows built specifically around [Claude Code](https://claude.ai/code). It opens your shell, launches `claude` automatically, and gives you one-click / one-shortcut buttons to handle Claude's approval prompts without touching the keyboard.

![Claude Terminal](assets/screenshot.png)

---

## Features

- **Auto-launches Claude Code** on startup inside Git Bash, PowerShell, or CMD
- **Smart approval bar** — detects when Claude asks for permission and surfaces buttons instantly
  - Handles both 2-choice (`Yes / No`) and 3-choice (`Yes / Yes, don't ask again / No`) prompts
- **Folder picker** — open any folder from the titlebar or via a Windows Explorer right-click
- **Keyboard shortcuts** for everything — no mouse required
- **Shell switcher** — switch between Git Bash, PowerShell, and CMD on the fly
- Dark purple theme with a Catppuccin-inspired color palette

---

## Requirements

| Requirement | Notes |
|---|---|
| **Windows 10 / 11** | Windows-only (uses ConPTY) |
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **Claude Code** | Install globally: `npm install -g @anthropic-ai/claude-code` |
| **Git for Windows** *(optional)* | Enables Git Bash shell. [git-scm.com](https://git-scm.com) |

No Visual Studio Build Tools needed — `node-pty` ships with pre-built Windows binaries.

---

## Installation

```bash
git clone https://github.com/ElAazmaniOussama/windows-claude-terminal.git
cd windows-claude-terminal
npm install
```

---

## Running

```bash
npm start
```

Or double-click **`start.bat`**.

To open in a specific folder:

```bash
start.bat "C:\Users\you\projects\myapp"
```

---

## Setting the Working Folder

There are three ways to control which folder the terminal opens in:

### 1. Windows Explorer right-click (recommended)

Run **`install-context-menu.bat`** once — no administrator rights needed.

After that, right-click any folder (or the background inside a folder) in Explorer and choose **"Open Claude Terminal here"**.

To remove the menu entry, run **`uninstall-context-menu.bat`**.

### 2. Folder picker in the titlebar

Click the **📁** button (or press `Ctrl+Shift+O`). A native folder picker opens. The terminal restarts in the chosen folder and the path is displayed in the titlebar.

### 3. Command-line argument

Pass a path directly to `start.bat` or to the Electron binary:

```bat
start.bat "C:\path\to\project"
```

Works with Windows desktop shortcuts — just append the folder path in the shortcut's *Target* field.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Y` | **Yes** — accept Claude's prompt (once) |
| `Ctrl+Shift+S` | **Yes, session** — accept and don't ask again this session |
| `Ctrl+Shift+N` | **No** — refuse Claude's prompt |
| `Ctrl+Shift+T` | Toggle text-to-speech on/off |
| `Ctrl+Shift+O` | Open folder picker |
| `Ctrl+Shift+R` | Restart the terminal |
| `Ctrl+Shift+Enter` | Send Enter key |
| `Ctrl+[` | Send Escape |

---

## Text-to-Speech

Click **🔇 TTS** in the bottom bar (or press `Ctrl+Shift+T`) to toggle. When active the button glows purple (🔊 TTS).

- **Offline** — uses Windows built-in SAPI voices (Microsoft David, Zira, etc.) via the Web Speech API. No internet or API key needed.
- **Voice selector** — choose any installed Windows voice from the dropdown next to the button.
- **Speed slider** — drag the slider (0.5× – 2×) to adjust reading speed.
- **Smart cleaning** — strips markdown, fenced code blocks, URLs, box-drawing characters, and shell noise before speaking, so responses sound natural.
- **Sentence chunking** — long responses are split at sentence boundaries and queued, so speech starts quickly and doesn't sound robotic.
- Stops automatically when the terminal restarts.

---

## Approval Bar

When Claude Code asks for permission (tool use, file edits, shell commands, etc.) the bottom bar automatically shows the relevant buttons:

**2-choice prompt** (`Yes / No`):

```
✗ No    ✓ Yes
```

**3-choice prompt** (`Yes / Yes, don't ask again / No`):

```
✗ No    ↻ Yes, session    ✓ Yes
```

The buttons disappear as soon as you respond (via button or keyboard). The status dot in the bottom-left pulses amber while waiting.

---

## Project Structure

```
windows-claude-terminal/
├── main.js                     # Electron main process — window, PTY, IPC
├── preload.js                  # Secure context bridge (main ↔ renderer)
├── renderer/
│   ├── index.html              # App shell
│   ├── renderer.js             # xterm.js, prompt detection, button logic
│   └── styles.css              # Dark purple theme
├── assets/                     # Icons
├── install-context-menu.bat    # Add Explorer right-click entry
├── uninstall-context-menu.bat  # Remove Explorer right-click entry
├── start.bat                   # Quick launcher (accepts optional path arg)
└── package.json
```

---

## How It Works

1. **Electron** creates a frameless window with a custom titlebar.
2. **node-pty** spawns a real Windows PTY (ConPTY) running your shell of choice.
3. **xterm.js** renders the terminal output with full ANSI/VT support.
4. The renderer listens to every chunk of PTY output, strips ANSI escape codes, and scans it against a set of regex patterns for Claude's approval prompts.
5. When a match is found, the approval buttons slide in. Clicking a button sends the appropriate key sequence back to the PTY (`Enter`, `↓ Enter`, `↓↓ Enter`, or `n`).
6. The folder picker uses Electron's native `dialog.showOpenDialog` and passes the chosen path as the `cwd` when the PTY is restarted.

---

## Planned Features

- [x] Text-to-speech (TTS) readout of Claude responses — offline via Web Speech API
- [ ] Session history / scrollback export
- [ ] Packaged `.exe` installer (electron-builder)
- [ ] Multiple tabs

---

## Contributing

Pull requests are welcome. Open an issue first for large changes.

---

## License

MIT
