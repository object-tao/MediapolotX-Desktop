const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const chokidar = require('chokidar');
const config = require('../config/default');
const { nowIso } = require('./db');

function createFileScanner(db, logger) {
  const upsertFile = db.prepare(`
    INSERT INTO files (
      id, storage_id, relative_path, absolute_path, file_type, size_bytes, mtime_ms,
      created_at, updated_at
    )
    VALUES (
      @id, @storageId, @relativePath, @absolutePath, @fileType, @sizeBytes, @mtimeMs,
      @createdAt, @updatedAt
    )
    ON CONFLICT(storage_id, relative_path) DO UPDATE SET
      absolute_path = excluded.absolute_path,
      file_type = excluded.file_type,
      size_bytes = excluded.size_bytes,
      mtime_ms = excluded.mtime_ms,
      updated_at = excluded.updated_at
  `);
  const removeFile = db.prepare('DELETE FROM files WHERE storage_id = ? AND relative_path = ?');
  const listFiles = db.prepare('SELECT * FROM files WHERE storage_id = ? ORDER BY updated_at DESC LIMIT ?');

  async function scanStorage(storage) {
    const results = [];
    await walk(storage.basePath, async (absolutePath, stats) => {
      const fileType = getFileType(absolutePath);
      if (!fileType) return;

      const indexed = indexFile(storage, absolutePath, stats, fileType);
      results.push(indexed);
    });
    logger?.info('storage scanned', { storageId: storage.id, count: results.length });
    return results;
  }

  function indexFile(storage, absolutePath, stats, fileType = getFileType(absolutePath)) {
    if (!fileType) return null;

    const timestamp = nowIso();
    const record = {
      id: randomUUID(),
      storageId: storage.id,
      relativePath: normalizeRelativePath(path.relative(storage.basePath, absolutePath)),
      absolutePath,
      fileType,
      sizeBytes: stats.size,
      mtimeMs: Math.trunc(stats.mtimeMs),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    upsertFile.run(record);
    return record;
  }

  function watchStorage(storage, onEvent) {
    const watcher = chokidar.watch(storage.basePath, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 800,
        pollInterval: 100
      }
    });

    watcher.on('add', async (filePath) => {
      const fileType = getFileType(filePath);
      if (!fileType) return;
      const stats = await fs.stat(filePath);
      const record = indexFile(storage, filePath, stats, fileType);
      onEvent?.({ type: 'add', file: record });
    });

    watcher.on('change', async (filePath) => {
      const fileType = getFileType(filePath);
      if (!fileType) return;
      const stats = await fs.stat(filePath);
      const record = indexFile(storage, filePath, stats, fileType);
      onEvent?.({ type: 'change', file: record });
    });

    watcher.on('unlink', (filePath) => {
      const relativePath = normalizeRelativePath(path.relative(storage.basePath, filePath));
      removeFile.run(storage.id, relativePath);
      onEvent?.({ type: 'unlink', relativePath });
    });

    watcher.on('error', (error) => logger?.error('storage watcher error', { error }));
    return watcher;
  }

  function getRecentFiles(storageId, limit = 100) {
    return listFiles.all(storageId, limit).map(mapFile);
  }

  return {
    scanStorage,
    watchStorage,
    getRecentFiles
  };
}

async function walk(root, onFile) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
      continue;
    }
    if (entry.isFile()) {
      const stats = await fs.stat(fullPath);
      await onFile(fullPath, stats);
    }
  }
}

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (config.supportedImageExtensions.includes(ext)) return 'image';
  if (config.supportedVideoExtensions.includes(ext)) return 'video';
  return null;
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function mapFile(row) {
  return {
    id: row.id,
    storageId: row.storage_id,
    relativePath: row.relative_path,
    absolutePath: row.absolute_path,
    fileType: row.file_type,
    sizeBytes: row.size_bytes,
    mtimeMs: row.mtime_ms,
    thumbnailPath: row.thumbnail_path,
    processingStatus: row.processing_status,
    updatedAt: row.updated_at
  };
}

module.exports = {
  createFileScanner,
  getFileType,
  normalizeRelativePath
};
