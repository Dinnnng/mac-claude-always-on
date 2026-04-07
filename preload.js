const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  startServer: (opts) => ipcRenderer.invoke('start-server', opts),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getStatus: () => ipcRenderer.invoke('get-status'),
});
