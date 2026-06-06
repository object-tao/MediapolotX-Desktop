const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { createDatabase } = require('../src/modules/db');
const { createStorageManager } = require('../src/modules/storageManager');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mediapolotx-smoke-'));
const dbPath = path.join(tempRoot, 'smoke.sqlite');

(async () => {
try {
  const db = await createDatabase(dbPath);
  const storageManager = createStorageManager(db);
  const storage = storageManager.addStorage('Smoke Library', 'local', tempRoot);
  const list = storageManager.getStorageList();

  if (!storage.id || list.length !== 1) {
    throw new Error('Storage smoke test failed.');
  }

  db.close();
  console.log('Smoke test passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
})();
