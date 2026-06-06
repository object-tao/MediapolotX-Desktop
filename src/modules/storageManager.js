const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { nowIso } = require('./db');

const STORAGE_TYPES = new Set(['local', 'removable', 'nas']);

function createStorageManager(db) {
  const insertStorage = db.prepare(`
    INSERT INTO storages (id, name, type, base_path, status, created_at, updated_at)
    VALUES (@id, @name, @type, @basePath, @status, @createdAt, @updatedAt)
  `);
  const listStorages = db.prepare('SELECT * FROM storages ORDER BY created_at DESC');
  const getStorage = db.prepare('SELECT * FROM storages WHERE id = ?');
  const updatePath = db.prepare(`
    UPDATE storages
    SET base_path = @basePath, status = @status, updated_at = @updatedAt
    WHERE id = @id
  `);
  const updateStatus = db.prepare('UPDATE storages SET status = ?, updated_at = ? WHERE id = ?');

  function addStorage(name, type, basePath) {
    if (!STORAGE_TYPES.has(type)) {
      throw new Error(`Unsupported storage type: ${type}`);
    }

    const resolvedPath = path.resolve(basePath);
    const createdAt = nowIso();
    const storage = {
      id: randomUUID(),
      name,
      type,
      basePath: resolvedPath,
      status: isPathOnline(resolvedPath) ? 'online' : 'offline',
      createdAt,
      updatedAt: createdAt
    };
    insertStorage.run(storage);
    return storage;
  }

  function getStorageList() {
    return listStorages.all().map(mapStorage);
  }

  function updateStoragePath(storageId, newBasePath) {
    const storage = getStorage.get(storageId);
    if (!storage) {
      throw new Error(`Storage not found: ${storageId}`);
    }

    const basePath = path.resolve(newBasePath);
    const status = isPathOnline(basePath) ? 'online' : 'offline';
    updatePath.run({ id: storageId, basePath, status, updatedAt: nowIso() });
    return checkStorageOnline(storageId);
  }

  function checkStorageOnline(storageId) {
    const storage = getStorage.get(storageId);
    if (!storage) {
      throw new Error(`Storage not found: ${storageId}`);
    }

    const status = isPathOnline(storage.base_path) ? 'online' : 'offline';
    updateStatus.run(status, nowIso(), storageId);
    return { ...mapStorage(storage), status };
  }

  return {
    addStorage,
    getStorageList,
    updateStoragePath,
    checkStorageOnline
  };
}

function isPathOnline(basePath) {
  try {
    fs.accessSync(basePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function mapStorage(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    basePath: row.base_path,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  createStorageManager,
  isPathOnline
};
