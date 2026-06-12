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
const articleRewriter = require('../src/modules/articleRewriter');
const localWorkImporter = require('../src/modules/localWorkImporter');
const localWorkCopywriter = require('../src/modules/localWorkCopywriter');
const localWorkSpeechwriter = require('../src/modules/localWorkSpeechwriter');
const { createAiConfigManager } = require('../src/modules/aiConfigManager');
const { createSocialAccountManager } = require('../src/modules/socialAccountManager');

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
  const aiMarkerDetection = await aiMarkRemover.detectAiMarkers(pngPath);
  if (
    !aiMarkerDetection.frequencyAnalysis
    || typeof aiMarkerDetection.frequencyAnalysis.score !== 'number'
    || typeof aiMarkerDetection.platformAiRisk !== 'boolean'
  ) {
    throw new Error('AI frequency analysis smoke test failed.');
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

  const qwenWithStaleResource = aiConfigManager.saveModel({
    name: 'Smoke Qwen Stale Resource',
    provider: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'test-key',
    resourceId: 'ep-should-not-be-used',
    model: 'qwen-plus',
    type: 'text',
    enabled: true
  });
  let qwenRequestModel = '';
  let qwenRequestUrl = '';
  const originalAxiosPost = require('axios').post;
  require('axios').post = async (url, body) => {
    qwenRequestUrl = url;
    qwenRequestModel = body.model;
    return { data: { output: [{ type: 'message', content: [{ text: 'pong' }] }] } };
  };
  try {
    await aiConfigManager.testModel(qwenWithStaleResource);
  } finally {
    require('axios').post = originalAxiosPost;
  }
  if (
    qwenRequestModel !== 'qwen3.7-plus'
    || qwenRequestUrl !== 'https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses'
  ) {
    throw new Error('Qwen stale resource ID smoke test failed.');
  }

  const localWorkMd = path.join(tempRoot, 'local-work.md');
  fs.writeFileSync(localWorkMd, '# 源文章\n\n这是一篇关于海关公告的源文章。');
  const localWorkId = 'local-work-smoke';
  const childId = 'local-work-smoke-child';
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO local_works (
      id, title, folder_name, folder_path, md_file, image_paths, tags, content, publish_status, source_root, created_at, updated_at
    ) VALUES (
      @id, @title, @folderName, @folderPath, @mdFile, @imagePaths, @tags, @content, @publishStatus, @sourceRoot, @createdAt, @updatedAt
    )
  `).run({
    id: localWorkId,
    title: '源文章标题',
    folderName: 'source',
    folderPath: tempRoot,
    mdFile: localWorkMd,
    imagePaths: '[]',
    tags: '[]',
    content: '',
    publishStatus: '未发布',
    sourceRoot: tempRoot,
    createdAt: now,
    updatedAt: now
  });
  db.prepare(`
    INSERT INTO local_work_children (
      id, parent_id, title, variant_name, folder_path, image_paths, content, publish_status, created_at, updated_at
    ) VALUES (
      @id, @parentId, @title, @variantName, @folderPath, @imagePaths, @content, @publishStatus, @createdAt, @updatedAt
    )
  `).run({
    id: childId,
    parentId: localWorkId,
    title: '源文章标题',
    variantName: 'q99',
    folderPath: tempRoot,
    imagePaths: '[]',
    content: '',
    publishStatus: '未发布',
    createdAt: now,
    updatedAt: now
  });
  const localWork = localWorkImporter.listImportedWorks(db).find((work) => work.id === localWorkId);
  const promptTemplate = localWorkCopywriter.buildPromptTemplate({
    titleLimit: 20,
    contentLimit: 1000,
    childCount: localWork.children.length,
    children: localWork.children,
    sourceTitle: localWork.title
  });
  const repairedGeneratedCopy = localWorkCopywriter.parseGeneratedCopy(`{
    "main": { "title": "json repair", "content": "line one
line two" },
    "variants": []
  }`);
  if (repairedGeneratedCopy.main.content !== 'line one\nline two') {
    throw new Error('Local work copywriter JSON repair smoke test failed.');
  }
  const generatedCopy = await localWorkCopywriter.generateLocalWorkCopy(
    localWork,
    { modelId: qwenWithStaleResource.id, promptTemplate: `${promptTemplate}\n自定义测试提示词。` },
    async (options) => {
      if (!options.messages[1].content.includes('自定义测试提示词。')) {
        throw new Error('Local work copywriter prompt template smoke test failed.');
      }
      return {
        modelId: qwenWithStaleResource.id,
        modelName: 'Smoke Qwen',
        content: JSON.stringify({
          main: { title: '海关公告解读', content: '这是一段可发布的小红书正文。' },
          variants: [{ title: '申报重点提醒', content: '这是另一段差异化子作品正文。' }]
        })
      };
    }
  );
  const updatedLocalWorks = localWorkImporter.updateWorkCopy(db, generatedCopy);
  const updatedLocalWork = updatedLocalWorks.find((work) => work.id === localWorkId);
  if (
    updatedLocalWork.title !== '海关公告解读'
    || updatedLocalWork.content !== '这是一段可发布的小红书正文。'
    || updatedLocalWork.children[0].title !== '申报重点提醒'
    || updatedLocalWork.children[0].content !== '这是另一段差异化子作品正文。'
  ) {
    throw new Error('Local work copywriter smoke test failed.');
  }
  const speechPromptTemplate = localWorkSpeechwriter.buildPromptTemplate({
    sourceTitle: updatedLocalWork.title,
    copyContent: updatedLocalWork.content,
    speakerCount: 2
  });
  const generatedSpeech = await localWorkSpeechwriter.generateLocalWorkSpeech(
    updatedLocalWork,
    { modelId: qwenWithStaleResource.id, promptTemplate: speechPromptTemplate, speakerCount: 2 },
    async (options) => {
      if (!options.messages[1].content.includes('人物数：2')) {
        throw new Error('Local work speechwriter prompt smoke test failed.');
      }
      return {
        modelId: qwenWithStaleResource.id,
        modelName: 'Smoke Qwen',
        content: '第1段\nA：今天聊一个海关公告重点。\nB：企业要先关注申报规范。'
      };
    }
  );
  const speechWorks = localWorkImporter.updateWorkSpeechScript(db, generatedSpeech);
  const speechWork = speechWorks.find((work) => work.id === localWorkId);
  if (
    speechWork.speechScriptStatus !== '已生成'
    || !speechWork.speechScript.includes('海关公告重点')
    || speechWork.speechScriptSpeakerCount !== 2
  ) {
    throw new Error('Local work speechwriter smoke test failed.');
  }
  const publishRecordWorks = localWorkImporter.updatePublishRecord(db, {
    targetType: 'child',
    targetId: childId,
    platform: 'xiaohongshu',
    accountId: 'account-1',
    status: '已发布',
    publishUrl: 'https://example.com/post',
    publishedAt: now
  });
  const publishRecordWork = publishRecordWorks.find((work) => work.id === localWorkId);
  if (
    publishRecordWork.children[0].publishRecords.length !== 1
    || publishRecordWork.children[0].publishRecords[0].platform !== 'xiaohongshu'
    || publishRecordWork.children[0].publishRecords[0].accountId !== 'account-1'
    || publishRecordWork.children[0].publishRecords[0].status !== '已发布'
  ) {
    throw new Error('Local work publish record smoke test failed.');
  }

  const rewriteDir = path.join(tempRoot, 'rewrite-output');
  const rewriteResult = await articleRewriter.rewriteArticle({
    inputText: '海关发布一则测试公告，提醒企业关注申报规范。',
    sourceTitle: '测试公告',
    outputDir: rewriteDir,
    articleType: 'customs_notice',
    targetTopic: '海关公告解读',
    targetAudience: '外贸企业',
    style: '专业通俗',
    length: '中等文章',
    instructions: '生成企业应对建议。'
  }, async (options) => {
    if (!options.messages[1].content.includes('海关发布一则测试公告')) {
      throw new Error('Article rewrite prompt smoke test failed.');
    }
    return {
      modelId: 'mock-model',
      modelName: 'Mock Model',
      content: '# 海关公告解读\n\n## 摘要\n\n测试摘要。'
    };
  });
  if (
    !fs.existsSync(rewriteResult.originalPath)
    || !fs.existsSync(rewriteResult.rewrittenPath)
    || !rewriteResult.markdown.includes('测试摘要')
  ) {
    throw new Error('Article rewrite smoke test failed.');
  }

  const socialAccountManager = createSocialAccountManager(settingsManager);
  const socialAccount = socialAccountManager.saveAccount({
    platform: 'xiaohongshu',
    nickname: 'Smoke XHS',
    platformUserId: 'xhs-1',
    groupName: 'Smoke',
    remark: 'test'
  });
  if (
    !socialAccount.id
    || socialAccountManager.listAccounts().length !== 1
    || socialAccountManager.getPlatform('wechat').label !== '公众号'
  ) {
    throw new Error('Social account smoke test failed.');
  }
  socialAccountManager.deleteAccount(socialAccount.id);
  if (socialAccountManager.listAccounts().length !== 0) {
    throw new Error('Social account delete smoke test failed.');
  }

  db.close();
  console.log('Smoke test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
})();
