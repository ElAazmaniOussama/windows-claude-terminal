const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // PTY
  startPty: (opts) => ipcRenderer.invoke('pty:start', opts),
  writePty: (data) => ipcRenderer.send('pty:write', data),
  resizePty: (size) => ipcRenderer.send('pty:resize', size),
  killPty: () => ipcRenderer.send('pty:kill'),

  // Folder
  pickFolder:      ()       => ipcRenderer.invoke('dialog:pickFolder'),
  getStartupCwd:   ()       => ipcRenderer.invoke('app:getStartupCwd'),

  // Clipboard image
  saveImage: (buffer) => ipcRenderer.invoke('clipboard:saveImage', buffer),

  // STT
  sttStart: (lang) => ipcRenderer.invoke('stt:start', lang),
  sttStop:  ()     => ipcRenderer.invoke('stt:stop'),
  onSttResult:  (cb) => ipcRenderer.on('stt:result',  (_e, t) => cb(t)),
  onSttStopped: (cb) => ipcRenderer.on('stt:stopped', ()      => cb()),
  onSttError:   (cb) => ipcRenderer.on('stt:error',   (_e, m) => cb(m)),

  // Events from main → renderer
  onPtyData: (cb) => ipcRenderer.on('pty:data', (_e, d)    => cb(d)),
  onPtyExit: (cb) => ipcRenderer.on('pty:exit', (_e, code) => cb(code)),
});
