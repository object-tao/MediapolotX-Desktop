const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createDatabase } = require('../src/modules/db');
const { createStorageManager } = require('../src/modules/storageManager');
const { createSettingsManager } = require('../src/modules/settingsManager');
const { createTaskManager } = require('../src/modules/taskManager');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mediapolotx-smoke-'));
const dbPath = path.join(tempRoot, 'smoke.sqlite');

(async () => {
try {
  const db = await createDatabase(dbPath);
  const storageManager = createStorageManager(db);
  const settingsManager = createSettingsManager(db);
  const taskManager = createTaskManager(db);
  const storage = storageManager.addStorage('Smoke Library', 'local', tempRoot);
  const list = storageManager.getStorageList();

  if (!storage.id || list.length !== 1) {
    throw new Error('Storage smoke test failed.');
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

  db.close();
  console.log('Smoke test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
})();
