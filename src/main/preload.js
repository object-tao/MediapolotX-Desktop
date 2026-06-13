const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediapolotx', {
  getStatus: () => ipcRenderer.invoke('app:getStatus'),
  openPath: (targetPath) => ipcRenderer.invoke('app:openPath', targetPath),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  selectMarkdownFile: () => ipcRenderer.invoke('dialog:selectMarkdownFile'),
  selectMediaFiles: () => ipcRenderer.invoke('dialog:selectMediaFiles'),
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
  tools: {
    scanAiMarks: (payload) => ipcRenderer.invoke('tools:scanAiMarks', payload),
    removeAiMarks: (payload) => ipcRenderer.invoke('tools:removeAiMarks', payload),
    scanImageDuplicate: (payload) => ipcRenderer.invoke('tools:scanImageDuplicate', payload),
    duplicateImages: (payload) => ipcRenderer.invoke('tools:duplicateImages', payload),
    downloadWechatArticle: (payload) => ipcRenderer.invoke('tools:downloadWechatArticle', payload),
    onAiMarkProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tools:aiMarkProgress', listener);
      return () => ipcRenderer.removeListener('tools:aiMarkProgress', listener);
    },
    onImageDuplicateProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tools:imageDuplicateProgress', listener);
      return () => ipcRenderer.removeListener('tools:imageDuplicateProgress', listener);
    }
  },
  content: {
    readMarkdownFile: (filePath) => ipcRenderer.invoke('content:readMarkdownFile', filePath),
    rewriteArticle: (payload) => ipcRenderer.invoke('content:rewriteArticle', payload)
  },
  knowledge: {
    list: (payload) => ipcRenderer.invoke('knowledge:list', payload),
    read: (nodeId) => ipcRenderer.invoke('knowledge:read', nodeId),
    save: (payload) => ipcRenderer.invoke('knowledge:save', payload),
    delete: (payload) => ipcRenderer.invoke('knowledge:delete', payload),
    importDirectory: (payload) => ipcRenderer.invoke('knowledge:importDirectory', payload)
  },
  localWorks: {
    scanImportDirectory: (rootPath) => ipcRenderer.invoke('localWorks:scanImportDirectory', rootPath),
    importScannedWorks: (payload) => ipcRenderer.invoke('localWorks:importScannedWorks', payload),
    listImported: () => ipcRenderer.invoke('localWorks:listImported'),
    organizeImported: (payload) => ipcRenderer.invoke('localWorks:organizeImported', payload),
    updateTags: (payload) => ipcRenderer.invoke('localWorks:updateTags', payload),
    updateWorkStatus: (payload) => ipcRenderer.invoke('localWorks:updateWorkStatus', payload),
    updateChildStatus: (payload) => ipcRenderer.invoke('localWorks:updateChildStatus', payload),
    updatePublishRecord: (payload) => ipcRenderer.invoke('localWorks:updatePublishRecord', payload),
    getCopyPromptTemplate: (payload) => ipcRenderer.invoke('localWorks:getCopyPromptTemplate', payload),
    getSpeechPromptTemplate: (payload) => ipcRenderer.invoke('localWorks:getSpeechPromptTemplate', payload),
    getPodcastPromptTemplate: (payload) => ipcRenderer.invoke('localWorks:getPodcastPromptTemplate', payload),
    generateCopy: (payload) => ipcRenderer.invoke('localWorks:generateCopy', payload),
    generateSpeech: (payload) => ipcRenderer.invoke('localWorks:generateSpeech', payload),
    generatePodcast: (payload) => ipcRenderer.invoke('localWorks:generatePodcast', payload),
    delete: (payload) => ipcRenderer.invoke('localWorks:delete', payload),
    onCopyProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('localWorks:copyProgress', listener);
      return () => ipcRenderer.removeListener('localWorks:copyProgress', listener);
    },
    onSpeechProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('localWorks:speechProgress', listener);
      return () => ipcRenderer.removeListener('localWorks:speechProgress', listener);
    },
    onPodcastProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('localWorks:podcastProgress', listener);
      return () => ipcRenderer.removeListener('localWorks:podcastProgress', listener);
    }
  },
  social: {
    platforms: () => ipcRenderer.invoke('social:platforms'),
    listAccounts: () => ipcRenderer.invoke('social:listAccounts'),
    saveAccount: (payload) => ipcRenderer.invoke('social:saveAccount', payload),
    startLoginAccount: (payload) => ipcRenderer.invoke('social:startLoginAccount', payload),
    deleteAccount: (accountId) => ipcRenderer.invoke('social:deleteAccount', accountId),
    openAccount: (payload) => ipcRenderer.invoke('social:openAccount', payload),
    navigate: (payload) => ipcRenderer.invoke('social:navigate', payload),
    setBounds: (bounds) => ipcRenderer.invoke('social:setBounds', bounds),
    hideBrowser: () => ipcRenderer.invoke('social:hideBrowser'),
    browserCommand: (payload) => ipcRenderer.invoke('social:browserCommand', payload),
    exportCookies: (accountId) => ipcRenderer.invoke('social:exportCookies', accountId),
    importCookies: (payload) => ipcRenderer.invoke('social:importCookies', payload),
    clearCookies: (accountId) => ipcRenderer.invoke('social:clearCookies', accountId),
    fillPublishForm: (payload) => ipcRenderer.invoke('social:fillPublishForm', payload)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (payload) => ipcRenderer.invoke('settings:set', payload)
  },
  proxy: {
    list: () => ipcRenderer.invoke('proxy:list'),
    save: (payload) => ipcRenderer.invoke('proxy:save', payload),
    delete: (proxyId) => ipcRenderer.invoke('proxy:delete', proxyId)
  },
  aiConfig: {
    get: () => ipcRenderer.invoke('aiConfig:get'),
    saveModel: (payload) => ipcRenderer.invoke('aiConfig:saveModel', payload),
    deleteModel: (modelId) => ipcRenderer.invoke('aiConfig:deleteModel', modelId),
    setDefault: (payload) => ipcRenderer.invoke('aiConfig:setDefault', payload),
    testModel: (payload) => ipcRenderer.invoke('aiConfig:testModel', payload),
    template: (provider) => ipcRenderer.invoke('aiConfig:template', provider),
    providers: () => ipcRenderer.invoke('aiConfig:providers')
  },
  sync: {
    fetchQueue: (payload) => ipcRenderer.invoke('sync:fetchQueue', payload),
    uploadIndex: (payload) => ipcRenderer.invoke('sync:uploadIndex', payload),
    uploadThumbnails: (payload) => ipcRenderer.invoke('sync:uploadThumbnails', payload),
    reportTaskStatus: (payload) => ipcRenderer.invoke('sync:reportTaskStatus', payload)
  }
});
