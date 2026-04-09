const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // PTY
  startPty: (opts) => ipcRenderer.invoke('pty:start', opts),
  writePty: (data) => ipcRenderer.send('pty:write', data),
  resizePty: (size) => ipcRenderer.send('pty:resize', size),
  killPty: () => ipcRenderer.send('pty:kill'),

  // Folder
  pickFolder:      ()  => ipcRenderer.invoke('dialog:pickFolder'),
  getStartupCwd:   ()  => ipcRenderer.invoke('app:getStartupCwd'),

  // Events from main → renderer
  onPtyData: (cb) => ipcRenderer.on('pty:data', (_e, d)    => cb(d)),
  onPtyExit: (cb) => ipcRenderer.on('pty:exit', (_e, code) => cb(code)),
});
