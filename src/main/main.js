const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const config = require('../config/default');
const { createDatabase } = require('../modules/db');
const { createStorageManager } = require('../modules/storageManager');
const { createFileScanner } = require('../modules/fileScanner');
const { createLogger } = require('../utils/logger');

let mainWindow;
let db;
let storageManager;
let fileScanner;
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
