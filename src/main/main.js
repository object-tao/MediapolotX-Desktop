const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } = require('electron');
const config = require('../config/default');
const { createDatabase } = require('../modules/db');
const { createStorageManager } = require('../modules/storageManager');
const { createFileScanner } = require('../modules/fileScanner');
const { createTaskManager } = require('../modules/taskManager');
const { createTaskSync } = require('../modules/taskSync');
const { createSettingsManager } = require('../modules/settingsManager');
const aiMarkRemover = require('../modules/aiMarkRemover');
const imageDuplicator = require('../modules/imageDuplicator');
const wechatMpMarkdown = require('../modules/wechatMpMarkdown');
const { createAiConfigManager } = require('../modules/aiConfigManager');
const { createLogger } = require('../utils/logger');

let mainWindow;
let db;
let storageManager;
let fileScanner;
let taskManager;
let settingsManager;
let aiConfigManager;
let logger;
const watchers = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: config.appName,
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

async function bootstrapServices() {
  const userData = app.getPath('userData') || config.userDataFallback;
  logger = createLogger(path.join(userData, 'logs'));
  db = await createDatabase(path.join(userData, 'mediapolotx.sqlite'));
  storageManager = createStorageManager(db);
  fileScanner = createFileScanner(db, logger);
  taskManager = createTaskManager(db, logger, fileScanner);
  settingsManager = createSettingsManager(db);
  aiConfigManager = createAiConfigManager(settingsManager, safeStorage);
}

function registerIpc() {
  ipcMain.handle('app:getStatus', () => ({
    name: config.appName,
    version: app.getVersion(),
    userDataPath: app.getPath('userData')
  }));

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('app:openPath', async (_event, targetPath) => {
    if (!targetPath) return { opened: false };
    const errorMessage = await shell.openPath(targetPath);
    return { opened: !errorMessage, errorMessage };
  });

  ipcMain.handle('storage:add', (_event, payload) => {
    const storage = storageManager.addStorage(payload.name, payload.type, payload.basePath);
    return storage;
  });

  ipcMain.handle('storage:list', () => storageManager.getStorageList());

  ipcMain.handle('storage:checkOnline', (_event, storageId) => storageManager.checkStorageOnline(storageId));

  ipcMain.handle('storage:updatePath', (_event, payload) => (
    storageManager.updateStoragePath(payload.storageId, payload.newBasePath)
  ));

  ipcMain.handle('scanner:scanStorage', async (_event, storage) => fileScanner.scanStorage(storage));

  ipcMain.handle('scanner:listFiles', (_event, payload) => (
    fileScanner.getRecentFiles(payload.storageId, payload.limit)
  ));

  ipcMain.handle('scanner:listAllFiles', (_event, payload) => (
    fileScanner.getAllFiles(payload.storageId)
  ));

  ipcMain.handle('scanner:watchStorage', (_event, storage) => {
    if (watchers.has(storage.id)) {
      return { watching: true };
    }

    const watcher = fileScanner.watchStorage(storage, (event) => {
      mainWindow?.webContents.send('scanner:event', { storageId: storage.id, ...event });
    });
    watchers.set(storage.id, watcher);
    return { watching: true };
  });

  ipcMain.handle('scanner:unwatchStorage', async (_event, storageId) => {
    const watcher = watchers.get(storageId);
    if (!watcher) return { watching: false };
    await watcher.close();
    watchers.delete(storageId);
    return { watching: false };
  });

  ipcMain.handle('tasks:list', (_event, payload = {}) => taskManager.getRecentTasks(payload.limit));

  ipcMain.handle('tasks:imageBatch', async (_event, payload) => (
    taskManager.runImageBatch(payload.files, payload.options)
  ));

  ipcMain.handle('tasks:videoCoverBatch', async (_event, payload) => (
    taskManager.runVideoCoverBatch(payload.files, payload.options)
  ));

  ipcMain.handle('tasks:thumbnailBatch', async (_event, payload) => (
    taskManager.generateImageThumbnails(payload.files, payload.outputDir, payload.options)
  ));

  ipcMain.handle('tools:scanAiMarks', async (_event, payload) => (
    aiMarkRemover.scanFolder(payload.folderPath, payload.options)
  ));

  ipcMain.handle('tools:removeAiMarks', async (_event, payload) => (
    aiMarkRemover.processFolder(payload.folderPath, payload.options, (progress) => {
      mainWindow?.webContents.send('tools:aiMarkProgress', progress);
    })
  ));

  ipcMain.handle('tools:scanImageDuplicate', async (_event, payload) => (
    imageDuplicator.scanFolder(payload.folderPath)
  ));

  ipcMain.handle('tools:duplicateImages', async (_event, payload) => (
    imageDuplicator.duplicateImages(payload.folderPath, payload.options, (progress) => {
      mainWindow?.webContents.send('tools:imageDuplicateProgress', progress);
    })
  ));

  ipcMain.handle('tools:downloadWechatArticle', async (_event, payload) => (
    wechatMpMarkdown.downloadArticle(payload.url, payload.options)
  ));

  ipcMain.handle('settings:getAll', () => settingsManager.all());

  ipcMain.handle('settings:set', (_event, payload) => settingsManager.set(payload.key, payload.value));

  ipcMain.handle('aiConfig:get', () => aiConfigManager.getConfig());

  ipcMain.handle('aiConfig:save', (_event, payload) => aiConfigManager.saveConfig(payload));

  ipcMain.handle('aiConfig:test', async (_event, payload) => aiConfigManager.testConfig(payload));

  ipcMain.handle('aiConfig:providers', () => aiConfigManager.getProviders());

  ipcMain.handle('sync:fetchQueue', async (_event, payload = {}) => {
    const sync = createTaskSync(payload);
    const queue = await sync.fetchTaskQueue(payload.params);
    const stored = taskManager.storeRemoteTasks(queue);
    return { queue, stored };
  });

  ipcMain.handle('sync:uploadIndex', async (_event, payload) => {
    const sync = createTaskSync(payload);
    const files = fileScanner.getAllFiles(payload.storageId);
    return sync.uploadIndex({
      storageId: payload.storageId,
      generatedAt: new Date().toISOString(),
      files
    });
  });

  ipcMain.handle('sync:reportTaskStatus', async (_event, payload) => {
    const sync = createTaskSync(payload);
    return sync.reportTaskStatus(payload.taskId, payload.status, payload.detail);
  });

  ipcMain.handle('sync:uploadThumbnails', async (_event, payload) => {
    const sync = createTaskSync(payload);
    const files = fileScanner.getAllFiles(payload.storageId).filter((file) => file.thumbnailPath);
    const results = [];
    for (const file of files) {
      results.push(await sync.uploadThumbnail(file.id, {
        storageId: payload.storageId,
        relativePath: file.relativePath,
        thumbnailPath: file.thumbnailPath
      }));
    }
    return { count: results.length, results };
  });
}

app.whenReady().then(async () => {
  await bootstrapServices();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await Promise.all([...watchers.values()].map((watcher) => watcher.close()));
  db?.close();
});
