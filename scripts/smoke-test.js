const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createDatabase } = require('../src/modules/db');
const { createFileScanner } = require('../src/modules/fileScanner');
const { createStorageManager } = require('../src/modules/storageManager');
const { createSettingsManager } = require('../src/modules/settingsManager');
const { createTaskManager } = require('../src/modules/taskManager');
const aiMarkRemover = require('../src/modules/aiMarkRemover');
const imageDuplicator = require('../src/modules/imageDuplicator');
const wechatMpMarkdown = require('../src/modules/wechatMpMarkdown');
const { createAiConfigManager } = require('../src/modules/aiConfigManager');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mediapolotx-smoke-'));
const dbPath = path.join(tempRoot, 'smoke.sqlite');

(async () => {
try {
  const db = await createDatabase(dbPath);
  const storageManager = createStorageManager(db);
  const fileScanner = createFileScanner(db);
  const settingsManager = createSettingsManager(db);
  const taskManager = createTaskManager(db);
  const storage = storageManager.addStorage('Smoke Library', 'local', tempRoot);
  const list = storageManager.getStorageList();

  if (!storage.id || list.length !== 1) {
    throw new Error('Storage smoke test failed.');
  }

  const imagePath = path.join(tempRoot, 'sample.jpg');
  fs.writeFileSync(imagePath, 'not-a-real-image');
  const stats = fs.statSync(imagePath);
  await fileScanner.scanStorage(storage);
  await fileScanner.scanStorage(storage);
  const files = fileScanner.getAllFiles(storage.id);
  if (files.length !== 1 || files[0].sizeBytes !== stats.size) {
    throw new Error('File scanner smoke test failed.');
  }

  settingsManager.set('syncOptions', { baseUrl: 'http://localhost/api' });
  if (settingsManager.get('syncOptions').baseUrl !== 'http://localhost/api') {
    throw new Error('Settings smoke test failed.');
  }

  const stored = taskManager.storeRemoteTasks([
    { id: 'remote-1', type: 'image_batch', payload: { fileIds: [] } },
    { id: 'remote-1', type: 'image_batch', payload: { fileIds: [] } }
  ]);
  if (stored.received !== 2 || stored.inserted !== 1 || taskManager.getRecentTasks().length !== 1) {
    throw new Error('Remote task smoke test failed.');
  }

  const pngPath = path.join(tempRoot, 'ai-test.png');
  fs.writeFileSync(
    pngPath,
    Buffer.concat([
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
      Buffer.from('c2pa')
    ])
  );
  if (!(await aiMarkRemover.detectAiMarkers(pngPath)).hasAiMarkers) {
    throw new Error('AI marker fixture smoke test failed.');
  }
  const aiFiles = await aiMarkRemover.scanFolder(tempRoot, { includeJpg: false, includePng: true });
  const ignoredBackupDir = path.join(tempRoot, '_mediapolotx_backup');
  fs.mkdirSync(ignoredBackupDir, { recursive: true });
  fs.copyFileSync(pngPath, path.join(ignoredBackupDir, 'ignored.png'));
  const aiFilesWithoutBackup = await aiMarkRemover.scanFolder(tempRoot, { includeJpg: false, includePng: true });
  if (aiFilesWithoutBackup.length !== aiFiles.length) {
    throw new Error('AI mark backup exclusion smoke test failed.');
  }
  const aiResult = await aiMarkRemover.processFolder(tempRoot, {
    includeJpg: false,
    includePng: true,
    files: aiFiles,
    selectedPaths: aiFiles.map((file) => file.absolutePath),
    replaceOriginal: true,
    backupOriginal: true,
    backupDir: path.join(tempRoot, 'backup'),
    watermark: { enabled: true, text: 'qtddp', color: 'rgb(80,80,80)', opacity: 0.45, fontSize: 54 }
  });
  if (
    aiResult.count !== 1
    || !fs.existsSync(aiResult.files[0].outputPath)
    || !fs.existsSync(path.join(tempRoot, 'backup', 'ai-test.png'))
    || (await aiMarkRemover.detectAiMarkers(pngPath)).hasAiMarkers
  ) {
    throw new Error('AI mark remover smoke test failed.');
  }

  const duplicateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mediapolotx-duplicate-'));
  const nestedDuplicateDir = path.join(duplicateRoot, 'CTPAT认证');
  fs.mkdirSync(nestedDuplicateDir, { recursive: true });
  const duplicateImage = path.join(nestedDuplicateDir, 'image.png');
  fs.copyFileSync(pngPath, duplicateImage);
  const duplicateFiles = await imageDuplicator.scanFolder(duplicateRoot);
  const combinations = imageDuplicator.buildCombinations({
    qualities: '99,98',
    sizes: '1x1,2x2',
    brightnessValues: '0,0.001'
  });
  const duplicateResult = await imageDuplicator.duplicateImages(duplicateRoot, {
    files: duplicateFiles,
    selectedPaths: duplicateFiles.map((file) => file.absolutePath),
    qualities: '99,98',
    sizes: '1x1,2x2',
    brightnessValues: '0,0.001',
    watermark: { enabled: true, text: 'qtddp', color: 'rgb(80,80,80)', opacity: 0.45, fontSize: 54 }
  });
  if (
    combinations.length !== 8
    || duplicateResult.totalCombinations !== 8
    || duplicateResult.totalOutputs !== 8
    || fs.readdirSync(nestedDuplicateDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length !== 8
  ) {
    throw new Error('Image duplicator smoke test failed.');
  }
  const generatedDir = fs.readdirSync(nestedDuplicateDir, { withFileTypes: true }).find((entry) => entry.isDirectory());
  const generatedEntries = fs.readdirSync(path.join(nestedDuplicateDir, generatedDir.name), { withFileTypes: true });
  if (!generatedEntries.some((entry) => entry.isFile() && entry.name === 'image.png')) {
    throw new Error('Image duplicator output layout smoke test failed.');
  }
  const rescannedDuplicateFiles = await imageDuplicator.scanFolder(duplicateRoot);
  if (rescannedDuplicateFiles.length !== 1) {
    throw new Error('Image duplicator generated directory exclusion smoke test failed.');
  }
  fs.rmSync(duplicateRoot, { recursive: true, force: true });

  const article = wechatMpMarkdown.parseArticle(`
    <h1 id="activity-name"> 测试文章 </h1>
    <span id="js_name">测试作者</span>
    <em id="publish_time">2026-06-09</em>
    <div id="js_content"><p>正文</p><img data-src="//example.com/a.png"></div>
  `, 'https://mp.weixin.qq.com/s/test');
  if (
    article.title !== '测试文章'
    || article.author !== '测试作者'
    || !article.contentHtml.includes('https://example.com/a.png')
    || wechatMpMarkdown.sanitizeFilename('a/b:c') !== 'a_b_c'
  ) {
    throw new Error('Wechat markdown smoke test failed.');
  }

  const safeStorageMock = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (buffer) => buffer.toString().replace(/^encrypted:/, '')
  };
  const aiConfigManager = createAiConfigManager(settingsManager, safeStorageMock);
  const savedAiModel = aiConfigManager.saveModel({
    name: 'Smoke Qwen',
    provider: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'test-key',
    resourceId: 'ep-test-resource',
    model: 'qwen-plus',
    type: 'both',
    temperature: 0.2,
    maxTokens: 4096,
    enabled: true
  });
  const storedAiConfig = settingsManager.get('aiModelConfig');
  const listedAiConfig = aiConfigManager.getConfig();
  if (
    !storedAiConfig.models[0].encryptedApiKey
    || listedAiConfig.models.length !== 1
    || listedAiConfig.models[0].apiKey !== ''
    || listedAiConfig.models[0].hasApiKey !== true
    || listedAiConfig.models[0].resourceId !== 'ep-test-resource'
  ) {
    throw new Error('AI config encryption smoke test failed.');
  }
  const defaultStore = aiConfigManager.setDefault('vision', savedAiModel.id);
  if (defaultStore.defaultTextModelId !== savedAiModel.id || defaultStore.defaultVisionModelId !== savedAiModel.id) {
    throw new Error('AI config default model smoke test failed.');
  }
  const deletedStore = aiConfigManager.deleteModel(savedAiModel.id);
  if (deletedStore.models.length !== 0) {
    throw new Error('AI config delete model smoke test failed.');
  }
  if (!aiConfigManager.getProviders().some((provider) => provider.value === 'openai')) {
    throw new Error('AI providers smoke test failed.');
  }

  db.close();
  console.log('Smoke test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
})();
