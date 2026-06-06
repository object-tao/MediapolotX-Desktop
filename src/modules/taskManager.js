const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { nowIso } = require('./db');
const imageProcessor = require('./imageProcessor');
const videoProcessor = require('./videoProcessor');

function createTaskManager(db, logger, fileRepository = null) {
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, remote_id, task_type, payload, result, status, error_message, created_at, updated_at)
    VALUES (@id, @remoteId, @taskType, @payload, @result, @status, @errorMessage, @createdAt, @updatedAt)
  `);
  const updateTask = db.prepare(`
    UPDATE tasks
    SET status = @status, result = @result, error_message = @errorMessage, updated_at = @updatedAt
    WHERE id = @id
  `);
  const listTasks = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?');
  const findRemoteTask = db.prepare('SELECT * FROM tasks WHERE remote_id = ?');

  async function runImageBatch(files, options) {
    return runLocalTask('image_batch', { files, options }, async () => {
      const outputDir = options.outputDir;
      const results = [];

      for (const file of files.filter((item) => item.fileType === 'image')) {
        fileRepository?.markFileStatus(file.id, 'processing');
        const baseName = path.basename(file.absolutePath, path.extname(file.absolutePath));
        const ext = normalizeFormatExtension(options.format || path.extname(file.absolutePath).slice(1));
        const outputPath = path.join(outputDir, `${baseName}.${ext}`);

        if (options.mode === 'template') {
          results.push(await imageProcessor.renderTemplate(file.absolutePath, outputPath, options.template));
        } else if (options.mode === 'clean-exif') {
          results.push(await imageProcessor.cleanExif(file.absolutePath, outputPath));
        } else if (options.mode === 'compress') {
          results.push(await imageProcessor.compressImage(file.absolutePath, outputPath, options));
        } else {
          results.push(await imageProcessor.resizeImage(file.absolutePath, outputPath, options));
        }
        fileRepository?.markFileStatus(file.id, 'processed');
      }

      return { count: results.length, outputDir, files: results };
    });
  }

  async function runVideoCoverBatch(files, options) {
    return runLocalTask('video_cover_batch', { files, options }, async () => {
      const outputDir = options.outputDir;
      const results = [];

      for (const file of files.filter((item) => item.fileType === 'video')) {
        fileRepository?.markFileStatus(file.id, 'processing');
        const baseName = path.basename(file.absolutePath, path.extname(file.absolutePath));
        const outputPath = path.join(outputDir, `${baseName}.cover.jpg`);
        const result = await videoProcessor.createVideoCover(file.absolutePath, outputPath, options);
        fileRepository?.setFileThumbnail(file.id, result.outputPath, 'cover_ready');
        results.push({ fileId: file.id, ...result });
      }

      return { count: results.length, outputDir, files: results };
    });
  }

  async function generateImageThumbnails(files, outputDir, options = {}) {
    return runLocalTask('thumbnail_batch', { files, outputDir, options }, async () => {
      const results = [];
      for (const file of files.filter((item) => item.fileType === 'image')) {
        fileRepository?.markFileStatus(file.id, 'processing');
        const outputPath = path.join(outputDir, `${file.id}.jpg`);
        const result = await imageProcessor.generateThumbnail(file.absolutePath, outputPath, options);
        fileRepository?.setFileThumbnail(file.id, result.outputPath);
        results.push({ fileId: file.id, ...result });
      }
      return { count: results.length, outputDir, files: results };
    });
  }

  function storeRemoteTasks(remoteTasks) {
    const tasks = normalizeRemoteTasks(remoteTasks);
    let inserted = 0;

    for (const remoteTask of tasks) {
      if (remoteTask.remoteId && findRemoteTask.get(remoteTask.remoteId)) continue;
      const task = createPendingTask(remoteTask.taskType || 'remote_task', remoteTask.payload || remoteTask);
      insertTask.run({
        ...task,
        remoteId: remoteTask.remoteId || null,
        status: remoteTask.status || 'pending'
      });
      inserted += 1;
    }

    return { received: tasks.length, inserted };
  }

  async function runLocalTask(taskType, payload, runner) {
    const task = createPendingTask(taskType, payload);
    insertTask.run(task);

    try {
      const result = await runner();
      updateTask.run({
        id: task.id,
        status: 'completed',
        result: JSON.stringify(result),
        errorMessage: null,
        updatedAt: nowIso()
      });
      return { ...task, status: 'completed', result };
    } catch (error) {
      logger?.error('task failed', { taskId: task.id, taskType, error });
      updateTask.run({
        id: task.id,
        status: 'failed',
        result: null,
        errorMessage: error.message,
        updatedAt: nowIso()
      });
      return { ...task, status: 'failed', errorMessage: error.message };
    }
  }

  function getRecentTasks(limit = 50) {
    return listTasks.all(limit).map(mapTask);
  }

  return {
    runImageBatch,
    runVideoCoverBatch,
    generateImageThumbnails,
    storeRemoteTasks,
    getRecentTasks
  };
}

function createPendingTask(taskType, payload) {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    remoteId: null,
    taskType,
    payload: JSON.stringify(payload),
    result: null,
    status: 'pending',
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function mapTask(row) {
  return {
    id: row.id,
    remoteId: row.remote_id,
    taskType: row.task_type,
    payload: parseJson(row.payload),
    result: parseJson(row.result),
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeFormatExtension(format) {
  if (!format) return 'jpg';
  if (format === 'jpeg') return 'jpg';
  return format.toLowerCase();
}

function normalizeRemoteTasks(remoteTasks) {
  if (Array.isArray(remoteTasks)) return remoteTasks.map(normalizeRemoteTask);
  if (Array.isArray(remoteTasks?.tasks)) return remoteTasks.tasks.map(normalizeRemoteTask);
  if (Array.isArray(remoteTasks?.data)) return remoteTasks.data.map(normalizeRemoteTask);
  if (remoteTasks) return [normalizeRemoteTask(remoteTasks)];
  return [];
}

function normalizeRemoteTask(task) {
  return {
    remoteId: String(task.id || task.remoteId || task.taskId || ''),
    taskType: task.type || task.taskType || 'remote_task',
    payload: task.payload || task,
    status: task.status || 'pending'
  };
}

module.exports = {
  createTaskManager
};
