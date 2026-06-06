const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediapolotx', {
  getStatus: () => ipcRenderer.invoke('app:getStatus'),
  openPath: (targetPath) => ipcRenderer.invoke('app:openPath', targetPath),
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
    listAllFiles: (payload) => ipcRenderer.invoke('scanner:listAllFiles', payload),
    watchStorage: (storage) => ipcRenderer.invoke('scanner:watchStorage', storage),
    unwatchStorage: (storageId) => ipcRenderer.invoke('scanner:unwatchStorage', storageId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('scanner:event', listener);
      return () => ipcRenderer.removeListener('scanner:event', listener);
    }
  },
  tasks: {
    list: (payload) => ipcRenderer.invoke('tasks:list', payload),
    imageBatch: (payload) => ipcRenderer.invoke('tasks:imageBatch', payload),
    videoCoverBatch: (payload) => ipcRenderer.invoke('tasks:videoCoverBatch', payload),
    thumbnailBatch: (payload) => ipcRenderer.invoke('tasks:thumbnailBatch', payload)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (payload) => ipcRenderer.invoke('settings:set', payload)
  },
  sync: {
    fetchQueue: (payload) => ipcRenderer.invoke('sync:fetchQueue', payload),
    uploadIndex: (payload) => ipcRenderer.invoke('sync:uploadIndex', payload),
    uploadThumbnails: (payload) => ipcRenderer.invoke('sync:uploadThumbnails', payload),
    reportTaskStatus: (payload) => ipcRenderer.invoke('sync:reportTaskStatus', payload)
  }
});
