const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediapolotx', {
  getStatus: () => ipcRenderer.invoke('app:getStatus'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  storage: {
    add: (payload) => ipcRenderer.invoke('storage:add', payload),
    list: () => ipcRenderer.invoke('storage:list'),
    checkOnline: (storageId) => ipcRenderer.invoke('storage:checkOnline', storageId),
    updatePath: (payload) => ipcRenderer.invoke('storage:updatePath', payload)
  },
  scanner: {
    scanStorage: (storage) => ipcRenderer.invoke('scanner:scanStorage', storage),
    listFiles: (payload) => ipcRenderer.invoke('scanner:listFiles', payload),
    watchStorage: (storage) => ipcRenderer.invoke('scanner:watchStorage', storage),
    unwatchStorage: (storageId) => ipcRenderer.invoke('scanner:unwatchStorage', storageId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('scanner:event', listener);
      return () => ipcRenderer.removeListener('scanner:event', listener);
    }
  }
});
