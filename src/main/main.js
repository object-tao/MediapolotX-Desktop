const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserView, BrowserWindow, dialog, ipcMain, protocol, shell, safeStorage, session } = require('electron');
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
const articleRewriter = require('../modules/articleRewriter');
const localWorkImporter = require('../modules/localWorkImporter');
const localWorkCopywriter = require('../modules/localWorkCopywriter');
const { createAiConfigManager } = require('../modules/aiConfigManager');
const { createSocialAccountManager } = require('../modules/socialAccountManager');
const { createProxyManager } = require('../modules/proxyManager');
const { createLogger } = require('../utils/logger');

let mainWindow;
let db;
let storageManager;
let fileScanner;
let taskManager;
let settingsManager;
let aiConfigManager;
let socialAccountManager;
let proxyManager;
let logger;
const watchers = new Map();
const socialBrowserViews = new Map();
let activeSocialViewId = null;

function assetPath(...segments) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...segments)
    : path.join(__dirname, '../..', ...segments);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: config.appName,
    icon: assetPath('assets', 'icons', process.platform === 'win32' ? 'app.ico' : 'app.png'),
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
  const userData = getBusinessDataPath();
  logger = createLogger(path.join(userData, 'logs'));
  db = await createDatabase(path.join(userData, 'mediapolotx.sqlite'));
  storageManager = createStorageManager(db);
  fileScanner = createFileScanner(db, logger);
  taskManager = createTaskManager(db, logger, fileScanner);
  settingsManager = createSettingsManager(db);
  aiConfigManager = createAiConfigManager(settingsManager, safeStorage);
  socialAccountManager = createSocialAccountManager(settingsManager);
  proxyManager = createProxyManager(settingsManager);
}

function registerIpc() {
  ipcMain.handle('app:getStatus', () => ({
    name: config.appName,
    version: app.getVersion(),
    userDataPath: getBusinessDataPath()
  }));

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:selectMarkdownFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown/Text', extensions: ['md', 'markdown', 'txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:selectMediaFiles', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('app:openPath', async (_event, targetPath) => {
    if (!targetPath) return { opened: false };
    const errorMessage = await shell.openPath(targetPath);
    return { opened: !errorMessage, errorMessage };
  });

  ipcMain.handle('localWorks:scanImportDirectory', async (_event, rootPath) => (
    localWorkImporter.scanLocalWorks(rootPath)
  ));

  ipcMain.handle('localWorks:importScannedWorks', async (_event, payload) => (
    localWorkImporter.importScannedWorks(db, payload)
  ));

  ipcMain.handle('localWorks:listImported', () => (
    localWorkImporter.listImportedWorks(db)
  ));

  ipcMain.handle('localWorks:organizeImported', async (_event, payload) => (
    localWorkImporter.organizeImportedWorks(db, payload)
  ));

  ipcMain.handle('localWorks:updateTags', async (_event, payload) => (
    localWorkImporter.updateWorkTags(db, payload)
  ));

  ipcMain.handle('localWorks:updateWorkStatus', async (_event, payload) => (
    localWorkImporter.updateWorkPublishStatus(db, payload)
  ));

  ipcMain.handle('localWorks:updateChildStatus', async (_event, payload) => (
    localWorkImporter.updateChildPublishStatus(db, payload)
  ));

  ipcMain.handle('localWorks:updatePublishRecord', async (_event, payload) => (
    localWorkImporter.updatePublishRecord(db, payload)
  ));

  ipcMain.handle('localWorks:delete', async (_event, payload) => (
    localWorkImporter.deleteImportedWork(db, payload)
  ));

  ipcMain.handle('localWorks:getCopyPromptTemplate', (_event, payload) => {
    const works = localWorkImporter.listImportedWorks(db);
    const work = works.find((item) => item.id === payload.workId);
    if (!work) throw new Error('作品不存在');
    const children = Array.isArray(work.children) ? work.children : [];
    return localWorkCopywriter.buildPromptTemplate({
      titleLimit: 20,
      contentLimit: 1000,
      childCount: children.length,
      children: children.map((child, index) => ({
        id: child.id,
        variantName: child.variantName || `子作品${index + 1}`
      })),
      sourceTitle: work.title
    });
  });

  ipcMain.handle('localWorks:generateCopy', async (event, payload) => {
    const works = localWorkImporter.listImportedWorks(db);
    const work = works.find((item) => item.id === payload.workId);
    if (!work) throw new Error('作品不存在');
    const generated = await localWorkCopywriter.generateLocalWorkCopy(
      work,
      payload,
      (options) => aiConfigManager.completeText(options),
      (progress) => event.sender.send('localWorks:copyProgress', progress)
    );
    const updatedWorks = localWorkImporter.updateWorkCopy(db, generated);
    return {
      generated,
      works: updatedWorks
    };
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

  ipcMain.handle('content:readMarkdownFile', async (_event, filePath) => (
    articleRewriter.readMarkdownFile(filePath)
  ));

  ipcMain.handle('content:rewriteArticle', async (_event, payload) => (
    articleRewriter.rewriteArticle(payload, (options) => aiConfigManager.completeText(options))
  ));

  ipcMain.handle('social:platforms', () => socialAccountManager.platforms());

  ipcMain.handle('social:listAccounts', () => socialAccountManager.listAccounts());

  ipcMain.handle('social:saveAccount', (_event, payload) => socialAccountManager.saveAccount(payload));

  ipcMain.handle('social:startLoginAccount', async (_event, payload) => (
    startSocialLoginAccount(payload)
  ));

  ipcMain.handle('social:deleteAccount', async (_event, accountId) => {
    hideSocialBrowser(accountId);
    const view = socialBrowserViews.get(accountId);
    view?.webContents.close();
    socialBrowserViews.delete(accountId);
    return socialAccountManager.deleteAccount(accountId);
  });

  ipcMain.handle('social:openAccount', async (_event, payload) => {
    const account = socialAccountManager.getAccount(payload.accountId);
    if (!account) throw new Error('账号不存在');
    const platform = socialAccountManager.getPlatform(account.platform);
    await applyAccountProxy(account);
    const view = getSocialBrowserView(account.id);
    activeSocialViewId = account.id;
    mainWindow.setBrowserView(view);
    applySocialBrowserBounds(payload.bounds);
    await view.webContents.loadURL(payload.url || platform.homeUrl);
    return getSocialBrowserState(view);
  });

  ipcMain.handle('social:navigate', async (_event, payload) => {
    const account = socialAccountManager.getAccount(payload.accountId);
    if (!account) throw new Error('账号不存在');
    const platform = socialAccountManager.getPlatform(account.platform);
    await applyAccountProxy(account);
    const view = getSocialBrowserView(account.id);
    const targetUrl = platform[payload.target] || payload.url || platform.homeUrl;
    activeSocialViewId = account.id;
    mainWindow.setBrowserView(view);
    applySocialBrowserBounds(payload.bounds);
    await view.webContents.loadURL(targetUrl);
    return getSocialBrowserState(view);
  });

  ipcMain.handle('social:setBounds', (_event, bounds) => {
    applySocialBrowserBounds(bounds);
    return { ok: true };
  });

  ipcMain.handle('social:hideBrowser', () => {
    if (activeSocialViewId) hideSocialBrowser(activeSocialViewId);
    return { ok: true };
  });

  ipcMain.handle('social:browserCommand', (_event, payload) => {
    const view = getSocialBrowserView(payload.accountId);
    if (payload.command === 'back' && view.webContents.canGoBack()) view.webContents.goBack();
    if (payload.command === 'forward' && view.webContents.canGoForward()) view.webContents.goForward();
    if (payload.command === 'reload') view.webContents.reload();
    return getSocialBrowserState(view);
  });

  ipcMain.handle('social:exportCookies', async (_event, accountId) => {
    const accountSession = session.fromPartition(getSocialPartition(accountId));
    return accountSession.cookies.get({});
  });

  ipcMain.handle('social:importCookies', async (_event, payload) => {
    const accountSession = session.fromPartition(getSocialPartition(payload.accountId));
    const cookies = Array.isArray(payload.cookies) ? payload.cookies : JSON.parse(payload.cookies || '[]');
    for (const cookie of cookies) {
      await accountSession.cookies.set(normalizeCookieForSet(cookie));
    }
    return { count: cookies.length };
  });

  ipcMain.handle('social:clearCookies', async (_event, accountId) => {
    const accountSession = session.fromPartition(getSocialPartition(accountId));
    await accountSession.clearStorageData();
    return { ok: true };
  });

  ipcMain.handle('social:fillPublishForm', async (_event, payload) => {
    const view = getSocialBrowserView(payload.accountId);
    return view.webContents.executeJavaScript(buildPublishFillScript(payload.form || {}), true);
  });

  ipcMain.handle('proxy:list', () => proxyManager.listProxies());

  ipcMain.handle('proxy:save', (_event, payload) => proxyManager.saveProxy(payload));

  ipcMain.handle('proxy:delete', (_event, proxyId) => proxyManager.deleteProxy(proxyId));

  ipcMain.handle('settings:getAll', () => settingsManager.all());

  ipcMain.handle('settings:set', (_event, payload) => settingsManager.set(payload.key, payload.value));

  ipcMain.handle('aiConfig:get', () => aiConfigManager.getConfig());

  ipcMain.handle('aiConfig:saveModel', (_event, payload) => aiConfigManager.saveModel(payload));

  ipcMain.handle('aiConfig:deleteModel', (_event, modelId) => aiConfigManager.deleteModel(modelId));

  ipcMain.handle('aiConfig:setDefault', (_event, payload) => aiConfigManager.setDefault(payload.kind, payload.modelId));

  ipcMain.handle('aiConfig:testModel', async (_event, payload) => aiConfigManager.testModel(payload));

  ipcMain.handle('aiConfig:template', (_event, provider) => aiConfigManager.getModelTemplate(provider));

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

function getBusinessDataPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'data');
  }
  return app.getPath('userData') || config.userDataFallback;
}

function registerLocalResourceProtocol() {
  protocol.handle('mediapolotx-local', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'image') return new Response('Not found', { status: 404 });
      const filePath = Buffer.from(url.pathname.replace(/^\/+/, ''), 'base64url').toString('utf8');
      return await netFetchFile(filePath);
    } catch (error) {
      return new Response(error.message, { status: 500 });
    }
  });
}

async function netFetchFile(filePath) {
  const { net } = require('electron');
  return net.fetch(pathToFileURL(filePath).href);
}

app.whenReady().then(async () => {
  await bootstrapServices();
  registerLocalResourceProtocol();
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

function getSocialBrowserView(accountId) {
  const existing = socialBrowserViews.get(accountId);
  if (existing && !existing.webContents.isDestroyed()) return existing;

  const view = new BrowserView({
    webPreferences: {
      partition: getSocialPartition(accountId),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url);
    return { action: 'deny' };
  });
  socialBrowserViews.set(accountId, view);
  return view;
}

async function startSocialLoginAccount(payload = {}) {
  const platformKey = payload.platform || 'xiaohongshu';
  const platform = socialAccountManager.getPlatform(platformKey);
  const accountId = payload.accountId || `login-${Date.now()}`;
  const partition = getSocialPartition(accountId);
  const accountSession = session.fromPartition(partition);
  await applySessionProxy(accountSession, proxyManager.getProxy(payload.proxyId));
  const loginWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    title: `登录 ${platform.label}`,
    parent: mainWindow,
    modal: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  let settled = false;
  let interval = null;

  const cleanup = () => {
    if (interval) clearInterval(interval);
    interval = null;
  };

  const finish = async (profile) => {
    if (settled) return null;
    settled = true;
    cleanup();
    const account = socialAccountManager.saveAccount({
      id: accountId,
      platform: platformKey,
      nickname: profile.nickname || platform.label,
      platformUserId: profile.platformUserId || '',
      avatarUrl: profile.avatarUrl || '',
      groupName: payload.groupName || '默认分组',
      remark: payload.remark || '',
      proxyId: payload.proxyId || '',
      status: 'online'
    });
    if (!loginWindow.isDestroyed()) loginWindow.close();
    return account;
  };

  loginWindow.webContents.on('did-finish-load', () => {
    injectSocialLoginBanner(loginWindow, platform.label);
  });

  const loginUrl = platform.homeUrl;
  await loginWindow.loadURL(loginUrl);

  return new Promise((resolve, reject) => {
    interval = setInterval(async () => {
      if (loginWindow.isDestroyed() || settled) return;
      try {
        const profile = await loginWindow.webContents.executeJavaScript(buildSocialProfileScript(platformKey), true);
        if (profile?.loggedIn) {
          const account = await finish(profile);
          resolve(account);
        }
      } catch {
        // Pages may navigate across origins while logging in; keep polling.
      }
    }, 3000);

    loginWindow.on('closed', () => {
      cleanup();
      if (!settled) {
        settled = true;
        reject(new Error('登录识别窗口已关闭，未识别到账号'));
      }
    });
  });
}

function getSocialPartition(accountId) {
  return `persist:social-account-${accountId}`;
}

async function applyAccountProxy(account) {
  const accountSession = session.fromPartition(getSocialPartition(account.id));
  await applySessionProxy(accountSession, proxyManager.getProxy(account.proxyId));
}

async function applySessionProxy(accountSession, proxy) {
  accountSession.removeAllListeners('login');
  if (!proxy || !proxy.enabled || !proxy.host || !proxy.port) {
    await accountSession.setProxy({ mode: 'direct' });
    return;
  }
  accountSession.on('login', (_event, _webContents, _request, authInfo, callback) => {
    if (authInfo.isProxy && proxy.username) {
      callback(proxy.username, proxy.password || '');
    } else {
      callback();
    }
  });
  await accountSession.setProxy({
    proxyRules: `${proxy.type}://${proxy.host}:${proxy.port}`
  });
}

function applySocialBrowserBounds(bounds = {}) {
  if (!activeSocialViewId) return;
  const view = socialBrowserViews.get(activeSocialViewId);
  if (!view) return;
  const normalized = {
    x: Math.max(0, Math.round(Number(bounds.x || 0))),
    y: Math.max(0, Math.round(Number(bounds.y || 0))),
    width: Math.max(320, Math.round(Number(bounds.width || 900))),
    height: Math.max(240, Math.round(Number(bounds.height || 600)))
  };
  view.setBounds(normalized);
  view.setAutoResize({ width: true, height: true });
}

function hideSocialBrowser(accountId) {
  const view = socialBrowserViews.get(accountId);
  if (view && mainWindow?.getBrowserView() === view) {
    mainWindow.removeBrowserView(view);
  }
  if (activeSocialViewId === accountId) activeSocialViewId = null;
}

function getSocialBrowserState(view) {
  return {
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    canGoBack: view.webContents.canGoBack(),
    canGoForward: view.webContents.canGoForward()
  };
}

function normalizeCookieForSet(cookie) {
  const protocol = cookie.secure ? 'https://' : 'http://';
  const domain = String(cookie.domain || '').replace(/^\./, '');
  return {
    url: cookie.url || `${protocol}${domain}${cookie.path || '/'}`,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    expirationDate: cookie.expirationDate
  };
}

function buildPublishFillScript(form) {
  const safeForm = JSON.stringify({
    title: form.title || '',
    content: form.content || '',
    tags: form.tags || ''
  });
  return `
    (() => {
      const form = ${safeForm};
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const setNativeValue = (element, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
        if (descriptor?.set) descriptor.set.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const fillInput = (keywords, value) => {
        if (!value) return false;
        const elements = [...document.querySelectorAll('input, textarea')].filter(visible);
        const target = elements.find((element) => {
          const text = [element.placeholder, element.ariaLabel, element.name, element.id].join(' ').toLowerCase();
          return keywords.some((keyword) => text.includes(keyword));
        }) || elements.find((element) => !element.value);
        if (!target) return false;
        setNativeValue(target, value);
        return true;
      };
      const fillEditable = (value) => {
        if (!value) return false;
        const editable = [...document.querySelectorAll('[contenteditable="true"]')].filter(visible)[0];
        if (!editable) return false;
        editable.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, value);
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      const titleFilled = fillInput(['title', '标题', '请输入标题'], form.title);
      const contentFilled = fillEditable(form.content) || fillInput(['content', '正文', '描述', '请输入正文'], form.content);
      const tagsFilled = fillInput(['tag', '话题', '标签'], form.tags);
      return { titleFilled, contentFilled, tagsFilled };
    })();
  `;
}

function injectSocialLoginBanner(loginWindow, platformLabel) {
  if (loginWindow.isDestroyed()) return;
  const script = `
    (() => {
      if (document.getElementById('mediapolotx-login-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'mediapolotx-login-banner';
      banner.style.cssText = [
        'position:fixed',
        'z-index:2147483647',
        'left:0',
        'right:0',
        'top:0',
        'background:#fff8db',
        'border-bottom:1px solid #f0cf6b',
        'color:#f03b32',
        'font-size:15px',
        'line-height:1.8',
        'padding:8px 18px',
        'font-family:Arial,Microsoft YaHei,sans-serif',
        'box-shadow:0 2px 8px rgba(0,0,0,.08)'
      ].join(';');
      banner.innerHTML = '<strong>请登录 ${escapeJs(platformLabel)}。</strong> 登录后会自动识别平台账号，识别过程大概需要几秒到十几秒，请勿关闭窗口；识别完成后将自动关闭。';
      document.documentElement.appendChild(banner);
      document.body.style.paddingTop = '56px';
    })();
  `;
  loginWindow.webContents.executeJavaScript(script, true).catch(() => {});
}

function buildSocialProfileScript(platform) {
  if (platform === 'wechat') {
    return `
      (() => {
        const text = document.body?.innerText || '';
        const loggedIn = /首页|新的创作|群发|草稿箱|公众号设置|账号详情/.test(text) && !/扫码登录|登录/.test(text.slice(0, 500));
        const img = [...document.querySelectorAll('img')].find((item) => item.src && item.width >= 24 && item.height >= 24);
        const title = document.title.replace(/微信公众平台|公众平台/g, '').trim();
        return {
          loggedIn,
          nickname: title || '公众号账号',
          platformUserId: '',
          avatarUrl: img?.src || ''
        };
      })();
    `;
  }

  return `
    (() => {
      const text = document.body?.innerText || '';
      const hasLoginForm = /手机号|验证码|登录|扫码登录/.test(text) && /用户协议|隐私政策/.test(text);
      const xhsIdMatch = text.match(/小红书号[：:\\s]+([A-Za-z0-9_-]{4,})/) || text.match(/RED ID[：:\\s]+([A-Za-z0-9_-]{4,})/i);
      const accountOk = /账号状态正常|账号正常|创作服务平台|笔记管理|数据看板/.test(text);
      const avatar = [...document.querySelectorAll('img')]
        .filter((img) => img.src && img.width >= 32 && img.height >= 32)
        .map((img) => img.src)
        .find((src) => !/logo|icon|svg/i.test(src)) || '';
      const candidates = [...document.querySelectorAll('span,div,p,strong')]
        .map((node) => (node.innerText || '').trim())
        .filter((value) => value && value.length <= 24 && !/[：:]/.test(value));
      const blocked = new Set(['首页', '笔记管理', '数据看板', '活动中心', '创作学院', '创作百科', '发布笔记', '登录', '账号状态正常']);
      const nickname = candidates.find((value) => !blocked.has(value) && !/^\\d+$/.test(value)) || '';
      return {
        loggedIn: !hasLoginForm && Boolean(accountOk || xhsIdMatch),
        nickname: nickname || '小红书账号',
        platformUserId: xhsIdMatch?.[1] || '',
        avatarUrl: avatar
      };
    })();
  `;
}

function escapeJs(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}
