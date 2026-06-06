const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createDatabase } = require('../src/modules/db');
const { createFileScanner } = require('../src/modules/fileScanner');
const { createStorageManager } = require('../src/modules/storageManager');
const { createSettingsManager } = require('../src/modules/settingsManager');
const { createTaskManager } = require('../src/modules/taskManager');
const aiMarkRemover = require('../src/modules/aiMarkRemover');

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
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
  );
  const aiFiles = await aiMarkRemover.scanFolder(tempRoot, { includeJpg: false, includePng: true });
  const aiResult = await aiMarkRemover.processFolder(tempRoot, {
    includeJpg: false,
    includePng: true,
    files: aiFiles,
    selectedPaths: aiFiles.map((file) => file.absolutePath),
    outputDir: path.join(tempRoot, 'cleaned'),
    watermark: { enabled: true, text: 'qtddp', color: 'rgb(80,80,80)', opacity: 0.45, fontSize: 12 }
  });
  if (aiResult.count !== 1 || !fs.existsSync(aiResult.files[0].outputPath)) {
    throw new Error('AI mark remover smoke test failed.');
  }

  db.close();
  console.log('Smoke test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
})();
