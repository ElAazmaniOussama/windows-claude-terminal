# Claude Terminal for Windows

A custom Electron terminal built specifically around [Claude Code](https://claude.ai/code). It opens your shell, lets you pick a session, and gives you one-click buttons and keyboard shortcuts to handle every Claude interaction without touching the keyboard.

---

## Features

- **Session picker** on every startup — New session, Resume last, or choose from history
- **Smart approval bar** — detects Claude's permission prompts and surfaces the right buttons instantly (2-choice and 3-choice variants)
- **Speech-to-text (STT)** — offline, no internet required, uses Windows' built-in speech engine
- **Paste anything** — Ctrl+V for text and images; drag-and-drop images from Explorer
- **Folder picker** — open any folder via the titlebar, Explorer right-click, or a CLI argument
- **Shell switcher** — Git Bash, PowerShell, or CMD on the fly
- Dark purple theme

---

## Requirements

| Requirement | Notes |
|---|---|
| **Windows 10 / 11** | Windows-only (uses ConPTY and Windows SAPI) |
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` |
| **Git for Windows** *(optional)* | Enables Git Bash. [git-scm.com](https://git-scm.com) |
| **Windows Speech pack** *(for STT)* | Settings → Time & Language → Speech → Add voices |

No Visual Studio Build Tools needed — all native modules ship with pre-built Windows binaries.

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

## Session Picker

Every time the terminal opens (or restarts), a panel appears before Claude launches:

```
            ⚡  Start Claude

  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │     ✦      │  │     ↩      │  │     ☰      │
  │    New     │  │  Resume    │  │   Pick     │
  │  session   │  │   last     │  │  session   │
  └────────────┘  └────────────┘  └────────────┘
              1  ·  2  ·  3  to choose
```

| Option | Keyboard | Claude command |
|---|---|---|
| New session | `1` | `claude` |
| Resume last | `2` | `claude --continue` |
| Pick session | `3` | `claude --resume` (interactive list) |

The shell starts in the background while the panel is shown, so there is no delay after picking.
The panel reappears on every terminal restart and after changing the working folder.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Y` | **Yes** — accept Claude's prompt (once) |
| `Ctrl+Shift+S` | **Yes, session** — accept and don't ask again this session |
| `Ctrl+Shift+N` | **No** — refuse Claude's prompt |
| `Ctrl+Shift+T` | Toggle speech-to-text on / off |
| `Ctrl+Shift+O` | Open folder picker |
| `Ctrl+Shift+R` | Restart the terminal |
| `Ctrl+Shift+Enter` | Send Enter key |
| `Ctrl+V` | Paste text or image from clipboard |
| `Ctrl+[` | Send Escape |

---

## Approval Bar

When Claude asks for permission the bottom bar shows the relevant buttons automatically.

**2-choice prompt** (`Yes / No`):

```
  ✗ No      ✓ Yes
```

**3-choice prompt** (`Yes / Yes, don't ask again / No`):

```
  ✗ No    ↻ Yes, session    ✓ Yes
```

The status dot pulses amber while waiting. Buttons disappear as soon as you respond (via button, keyboard, or by typing directly).

The bar also has always-visible quick-send buttons: `y` · `n` · `↑` · `↓` · `⏎` · `Esc`

---

## Speech-to-Text (STT)

Click **🎤 STT** in the bottom bar or press `Ctrl+Shift+T` to toggle. The button pulses purple when active.

- **Fully offline** — uses `System.Speech.Recognition` (Windows .NET / SAPI). No internet, no API key.
- **Language selector** — choose from English (US/UK), French, German, Spanish, Italian, Portuguese, Dutch, Japanese, Chinese, Arabic.
- Speak naturally; when you pause, the recognised text is typed into the terminal at the cursor.
- The last recognised phrase is shown in the action bar for 1.5 seconds.

> **If STT fails to start:** a Windows speech language pack must be installed.  
> Go to *Settings → Time & Language → Speech → Add voices* and install the language matching your selection.

---

## Paste & Images

### Text — `Ctrl+V`
Pastes clipboard text directly into the terminal. (Chromium normally sends `^V` — this is intercepted.)

### Images — `Ctrl+V` or drag-and-drop
When the clipboard contains an image (screenshot, copied photo, etc.):
1. The image is saved as a `.png` in `%TEMP%`
2. The file path is typed into the terminal — Claude Code can read it
3. A thumbnail preview appears in the bottom-left corner for 6 seconds

Drag any image file from Explorer onto the window for the same result.

---

## Setting the Working Folder

### 1. Windows Explorer right-click *(recommended)*

Run **`install-context-menu.bat`** once — no administrator rights needed.

Right-click any folder (or the background inside a folder) → **"Open Claude Terminal here"**.

To remove: run **`uninstall-context-menu.bat`**.

### 2. Folder picker in the titlebar

Click the **📁** button or press `Ctrl+Shift+O`. Native folder dialog opens; terminal restarts in the chosen folder with the session picker shown again.

### 3. Command-line argument

```bat
start.bat "C:\path\to\project"
```

Works with Windows desktop shortcuts — add the path in the shortcut's *Target* field.

---

## Project Structure

```
windows-claude-terminal/
├── main.js                     # Electron main process — window, PTY, STT, IPC
├── preload.js                  # Secure context bridge (main ↔ renderer)
├── stt.ps1                     # PowerShell STT script (Windows SAPI)
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
2. **node-pty** spawns a real Windows PTY (ConPTY) running the selected shell.
3. **xterm.js** renders the terminal with full ANSI/VT support.
4. On startup a **session panel** overlays the terminal; the user picks how to launch Claude (`claude`, `claude --continue`, or `claude --resume`).
5. Every PTY output chunk is scanned with regex patterns for Claude's approval prompts; when matched, the approval buttons slide into view.
6. **STT**: clicking the STT button spawns `stt.ps1` via `child_process.spawn`. PowerShell loads `System.Speech.Recognition.SpeechRecognitionEngine` with a `DictationGrammar`, listens on the default mic, and writes each recognised phrase to stdout. Node.js reads it and writes it to the PTY.
7. **Image paste**: `Ctrl+V` is intercepted with `term.attachCustomKeyEventHandler`; if the clipboard contains an image it is saved to `%TEMP%` via an IPC call to the main process, and the path is inserted at the terminal cursor.

---

## Planned Features

- [ ] Packaged `.exe` installer (electron-builder)
- [ ] Multiple tabs
- [ ] Session history / scrollback export

---

## Contributing

Pull requests are welcome. Open an issue first for large changes.

---

## License

MIT
