const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { nowIso } = require('./db');

const imageExtensions = new Set(['.png', '.jpg', '.jpeg']);

function isImageFile(fileName) {
  return imageExtensions.has(path.extname(fileName).toLowerCase());
}

async function safeReadDir(folderPath) {
  try {
    return await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function imageFileUrl(filePath) {
  return `mediapolotx-local://image/${Buffer.from(filePath).toString('base64url')}`;
}

function normalizeImageUrl(value) {
  if (!value) return value;
  if (value.startsWith('mediapolotx-local://')) return value;
  if (value.startsWith('file://')) return imageFileUrl(fileURLToPath(value));
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) return imageFileUrl(value);
  return value;
}

function parseImagePaths(value) {
  return JSON.parse(value || '[]').map(normalizeImageUrl);
}

async function scanImages(folderPath, entries) {
  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => imageFileUrl(path.join(folderPath, entry.name)));
}

function findFirstMarkdown(folderPath, entries) {
  const markdown = entries.find((entry) => (
    entry.isFile() && ['.md', '.markdown'].includes(path.extname(entry.name).toLowerCase())
  ));
  return markdown ? path.join(folderPath, markdown.name) : '';
}

async function scanChildWork(parentWork, childEntry) {
  const childPath = path.join(parentWork.folderPath, childEntry.name);
  const entries = await safeReadDir(childPath);
  return {
    id: `${parentWork.id}-${childEntry.name}`,
    parentId: parentWork.id,
    platform: '本地子作品',
    title: parentWork.title,
    variantName: childEntry.name,
    folderPath: childPath,
    content: '',
    tags: [],
    publishStatus: '未发布',
    imagePaths: await scanImages(childPath, entries)
  };
}

async function scanLocalWorks(rootPath) {
  if (!rootPath) return { rootPath: '', works: [] };
  const rootEntries = await safeReadDir(rootPath);
  const workDirs = rootEntries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  const works = [];
  for (const [index, workEntry] of workDirs.entries()) {
    const folderPath = path.join(rootPath, workEntry.name);
    const entries = await safeReadDir(folderPath);
    const childDirs = entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    const work = {
      id: `imported-work-${index + 1}`,
      serialNo: index + 1,
      title: workEntry.name,
      folderName: workEntry.name,
      folderPath,
      mdFile: findFirstMarkdown(folderPath, entries),
      imagePaths: await scanImages(folderPath, entries),
      tags: [],
      content: '',
      publishStatus: '未发布',
      children: []
    };
    work.children = await Promise.all(childDirs.map((childEntry) => scanChildWork(work, childEntry)));
    works.push(work);
  }

  return { rootPath, works };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueFolderPath(targetRoot, folderName) {
  let candidate = path.join(targetRoot, folderName);
  if (!(await pathExists(candidate))) return candidate;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  candidate = path.join(targetRoot, `${folderName}_${stamp}`);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(targetRoot, `${folderName}_${stamp}_${index}`);
    index += 1;
  }
  return candidate;
}

function sanitizeFolderName(value) {
  return String(value || 'work')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replaceAll('\u0000', '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'work';
}

function dateFolderParts(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { year, month, day };
}

function localWorksRoot(targetRoot) {
  return path.join(targetRoot, 'local-works');
}

async function uniqueDatedWorkPath(targetRoot, title, date = new Date()) {
  const { year, month, day } = dateFolderParts(date);
  const baseRoot = path.join(localWorksRoot(targetRoot), year, month);
  await fs.mkdir(baseRoot, { recursive: true });
  return uniqueFolderPath(baseRoot, `${year}${month}${day}_${sanitizeFolderName(title)}`);
}

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath).toLowerCase();
  const child = path.resolve(childPath).toLowerCase();
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isInOrganizedLocalWorks(targetRoot, folderPath) {
  return isPathInside(localWorksRoot(targetRoot), folderPath);
}

function childRowToUi(child) {
  return {
    id: child.id,
    parentId: child.parent_id,
    platform: '本地子作品',
    title: child.title,
    variantName: child.variant_name,
    folderPath: child.folder_path,
    content: child.content,
    tags: [],
    publishStatus: child.publish_status,
    imagePaths: parseImagePaths(child.image_paths)
  };
}

function listImportedWorks(db) {
  const rows = db.prepare(`
    SELECT
      ROW_NUMBER() OVER (ORDER BY created_at DESC, title ASC) AS serial_no,
      *
    FROM local_works
    ORDER BY created_at DESC, title ASC
  `).all();
  const childRows = db.prepare(`
    SELECT * FROM local_work_children
    ORDER BY variant_name ASC
  `).all();
  const childMap = new Map();
  for (const child of childRows) {
    const children = childMap.get(child.parent_id) || [];
    children.push(childRowToUi(child));
    childMap.set(child.parent_id, children);
  }
  const publishRows = db.prepare(`
    SELECT * FROM local_work_publish_records
    ORDER BY platform ASC, updated_at DESC
  `).all();
  const publishMap = new Map();
  for (const record of publishRows) {
    const key = `${record.target_type}:${record.target_id}`;
    const records = publishMap.get(key) || [];
    records.push(publishRecordToUi(record));
    publishMap.set(key, records);
  }
  return rows.map((row) => ({
    id: row.id,
    serialNo: Number(row.serial_no || 0),
    title: row.title,
    folderName: row.folder_name,
    folderPath: row.folder_path,
    mdFile: row.md_file || '',
    imagePaths: parseImagePaths(row.image_paths),
    tags: JSON.parse(row.tags || '[]'),
    content: row.content || '',
    speechScript: row.speech_script || '',
    speechScriptStatus: row.speech_script_status || (row.speech_script ? '已生成' : '未生成'),
    speechScriptModelId: row.speech_script_model_id || '',
    speechScriptPrompt: row.speech_script_prompt || '',
    speechScriptSpeakerCount: Number(row.speech_script_speaker_count || 1),
    speechScriptUpdatedAt: row.speech_script_updated_at || '',
    podcastScript: row.podcast_script || '',
    podcastScriptStatus: row.podcast_script_status || (row.podcast_script ? '已生成' : '未生成'),
    podcastScriptModelId: row.podcast_script_model_id || '',
    podcastScriptPrompt: row.podcast_script_prompt || '',
    podcastSpeakerCount: Number(row.podcast_speaker_count || 2),
    podcastScriptUpdatedAt: row.podcast_script_updated_at || '',
    publishStatus: row.publish_status,
    publishRecords: publishMap.get(`main:${row.id}`) || [],
    children: (childMap.get(row.id) || []).map((child) => ({
      ...child,
      publishRecords: publishMap.get(`child:${child.id}`) || []
    }))
  }));
}

function publishRecordToUi(record) {
  return {
    id: record.id,
    targetType: record.target_type,
    targetId: record.target_id,
    platform: record.platform,
    accountId: record.account_id || '',
    status: record.status,
    publishUrl: record.publish_url || '',
    platformWorkId: record.platform_work_id || '',
    publishedAt: record.published_at || '',
    errorMessage: record.error_message || '',
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

async function importScannedWorks(db, { sourceRoot, targetRoot, works = [] }) {
  if (!sourceRoot) throw new Error('请先选择目录导入并完成扫描');
  if (!targetRoot) throw new Error('请先设置作品路径');

  await fs.mkdir(localWorksRoot(targetRoot), { recursive: true });
  const scanned = await scanLocalWorks(sourceRoot);
  const tagMap = new Map(
    works
      .filter((work) => work && work.folderName)
      .map((work) => [work.folderName, Array.isArray(work.tags) ? work.tags : []])
  );
  const now = nowIso();

  const insertWork = db.prepare(`
    INSERT OR REPLACE INTO local_works (
      id, title, folder_name, folder_path, md_file, image_paths, tags, content, publish_status, source_root, created_at, updated_at
    ) VALUES (
      @id, @title, @folderName, @folderPath, @mdFile, @imagePaths, @tags, @content, @publishStatus, @sourceRoot, @createdAt, @updatedAt
    )
  `);
  const deleteChildren = db.prepare('DELETE FROM local_work_children WHERE parent_id = @parentId');
  const insertChild = db.prepare(`
    INSERT OR REPLACE INTO local_work_children (
      id, parent_id, title, variant_name, folder_path, image_paths, content, publish_status, created_at, updated_at
    ) VALUES (
      @id, @parentId, @title, @variantName, @folderPath, @imagePaths, @content, @publishStatus, @createdAt, @updatedAt
    )
  `);

  let importedCount = 0;
  for (const sourceWork of scanned.works) {
    const destinationPath = await uniqueDatedWorkPath(targetRoot, sourceWork.title);
    await fs.cp(sourceWork.folderPath, destinationPath, { recursive: true });
    const copiedEntries = await safeReadDir(destinationPath);
    const childDirs = copiedEntries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    const workId = `local-work-${Buffer.from(destinationPath).toString('base64url')}`;
    const importedWork = {
      id: workId,
      title: sourceWork.title,
      folderName: path.basename(destinationPath),
      folderPath: destinationPath,
      mdFile: findFirstMarkdown(destinationPath, copiedEntries),
      imagePaths: await scanImages(destinationPath, copiedEntries),
      tags: tagMap.get(sourceWork.folderName) || sourceWork.tags || [],
      content: '',
      publishStatus: '未发布'
    };

    insertWork.run({
      id: workId,
      title: importedWork.title,
      folderName: importedWork.folderName,
      folderPath: importedWork.folderPath,
      mdFile: importedWork.mdFile,
      imagePaths: JSON.stringify(importedWork.imagePaths),
      tags: JSON.stringify(importedWork.tags),
      content: importedWork.content,
      publishStatus: importedWork.publishStatus,
      sourceRoot,
      createdAt: now,
      updatedAt: now
    });
    deleteChildren.run({ parentId: workId });

    for (const childDir of childDirs) {
      const childPath = path.join(destinationPath, childDir.name);
      const childEntries = await safeReadDir(childPath);
      insertChild.run({
        id: `${workId}-${Buffer.from(childDir.name).toString('base64url')}`,
        parentId: workId,
        title: importedWork.title,
        variantName: childDir.name,
        folderPath: childPath,
        imagePaths: JSON.stringify(await scanImages(childPath, childEntries)),
        content: '',
        publishStatus: '未发布',
        createdAt: now,
        updatedAt: now
      });
    }

    importedCount += 1;
  }

  return {
    importedCount,
    works: listImportedWorks(db)
  };
}

async function organizeImportedWorks(db, { targetRoot }) {
  if (!targetRoot) return { movedCount: 0, works: listImportedWorks(db) };

  await fs.mkdir(localWorksRoot(targetRoot), { recursive: true });
  const rows = db.prepare('SELECT * FROM local_works ORDER BY created_at ASC').all();
  const updateWork = db.prepare(`
    UPDATE local_works
    SET folder_name = @folderName,
        folder_path = @folderPath,
        md_file = @mdFile,
        image_paths = @imagePaths,
        updated_at = @updatedAt
    WHERE id = @id
  `);
  const deleteChildren = db.prepare('DELETE FROM local_work_children WHERE parent_id = @parentId');
  const insertChild = db.prepare(`
    INSERT OR REPLACE INTO local_work_children (
      id, parent_id, title, variant_name, folder_path, image_paths, content, publish_status, created_at, updated_at
    ) VALUES (
      @id, @parentId, @title, @variantName, @folderPath, @imagePaths, @content, @publishStatus, @createdAt, @updatedAt
    )
  `);

  let movedCount = 0;
  for (const row of rows) {
    if (!row.folder_path || !isPathInside(targetRoot, row.folder_path) || isInOrganizedLocalWorks(targetRoot, row.folder_path)) {
      continue;
    }
    if (!(await pathExists(row.folder_path))) continue;

    const destinationPath = await uniqueDatedWorkPath(targetRoot, row.title, new Date(row.created_at || Date.now()));
    await fs.rename(row.folder_path, destinationPath);
    const entries = await safeReadDir(destinationPath);
    const childDirs = entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    const now = nowIso();

    const existingChildren = new Map(db.prepare(`
      SELECT * FROM local_work_children
      WHERE parent_id = @parentId
    `).all({ parentId: row.id }).map((child) => [child.variant_name, child]));

    updateWork.run({
      id: row.id,
      folderName: path.basename(destinationPath),
      folderPath: destinationPath,
      mdFile: findFirstMarkdown(destinationPath, entries),
      imagePaths: JSON.stringify(await scanImages(destinationPath, entries)),
      updatedAt: now
    });
    deleteChildren.run({ parentId: row.id });

    for (const childDir of childDirs) {
      const childPath = path.join(destinationPath, childDir.name);
      const childEntries = await safeReadDir(childPath);
      const existingChild = existingChildren.get(childDir.name);
      insertChild.run({
        id: existingChild?.id || `${row.id}-${Buffer.from(childDir.name).toString('base64url')}`,
        parentId: row.id,
        title: row.title,
        variantName: childDir.name,
        folderPath: childPath,
        imagePaths: JSON.stringify(await scanImages(childPath, childEntries)),
        content: existingChild?.content || '',
        publishStatus: existingChild?.publish_status || row.publish_status || '未发布',
        createdAt: existingChild?.created_at || row.created_at || now,
        updatedAt: now
      });
    }
    movedCount += 1;
  }

  return {
    movedCount,
    works: listImportedWorks(db)
  };
}

function updateWorkTags(db, { workId, tags }) {
  db.prepare(`
    UPDATE local_works
    SET tags = @tags, updated_at = @updatedAt
    WHERE id = @workId
  `).run({
    workId,
    tags: JSON.stringify(Array.isArray(tags) ? tags : []),
    updatedAt: nowIso()
  });
  return listImportedWorks(db);
}

function updateWorkPublishStatus(db, { workId, publishStatus }) {
  db.prepare(`
    UPDATE local_works
    SET publish_status = @publishStatus, updated_at = @updatedAt
    WHERE id = @workId
  `).run({
    workId,
    publishStatus: normalizePublishStatus(publishStatus),
    updatedAt: nowIso()
  });
  return listImportedWorks(db);
}

function updateChildPublishStatus(db, { childId, publishStatus }) {
  db.prepare(`
    UPDATE local_work_children
    SET publish_status = @publishStatus, updated_at = @updatedAt
    WHERE id = @childId
  `).run({
    childId,
    publishStatus: normalizePublishStatus(publishStatus),
    updatedAt: nowIso()
  });
  return listImportedWorks(db);
}

function updatePublishRecord(db, payload) {
  const targetType = payload.targetType === 'child' ? 'child' : 'main';
  const targetId = String(payload.targetId || '');
  const platform = String(payload.platform || '').trim();
  if (!targetId) throw new Error('缺少发布对象 ID');
  if (!platform) throw new Error('缺少发布平台');
  ensurePublishTargetExists(db, targetType, targetId);

  const now = nowIso();
  const id = `publish-${targetType}-${Buffer.from(targetId).toString('base64url')}-${platform}`;
  db.prepare(`
    INSERT INTO local_work_publish_records (
      id, target_type, target_id, platform, account_id, status, publish_url, platform_work_id, published_at, error_message, created_at, updated_at
    ) VALUES (
      @id, @targetType, @targetId, @platform, @accountId, @status, @publishUrl, @platformWorkId, @publishedAt, @errorMessage, @createdAt, @updatedAt
    )
    ON CONFLICT(target_type, target_id, platform) DO UPDATE SET
      account_id = excluded.account_id,
      status = excluded.status,
      publish_url = excluded.publish_url,
      platform_work_id = excluded.platform_work_id,
      published_at = excluded.published_at,
      error_message = excluded.error_message,
      updated_at = excluded.updated_at
  `).run({
    id,
    targetType,
    targetId,
    platform,
    accountId: payload.accountId || '',
    status: normalizePlatformPublishStatus(payload.status),
    publishUrl: payload.publishUrl || '',
    platformWorkId: payload.platformWorkId || '',
    publishedAt: payload.publishedAt || '',
    errorMessage: payload.errorMessage || '',
    createdAt: now,
    updatedAt: now
  });
  return listImportedWorks(db);
}

function ensurePublishTargetExists(db, targetType, targetId) {
  const table = targetType === 'child' ? 'local_work_children' : 'local_works';
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = @targetId`).get({ targetId });
  if (!row) throw new Error('发布对象不存在');
}

function updateWorkCopy(db, { workId, title, content, children = [] }) {
  if (!workId) throw new Error('缺少作品 ID');
  const now = nowIso();
  const work = db.prepare('SELECT * FROM local_works WHERE id = @workId').get({ workId });
  if (!work) throw new Error('作品不存在');

  db.prepare(`
    UPDATE local_works
    SET title = @title,
        content = @content,
        updated_at = @updatedAt
    WHERE id = @workId
  `).run({
    workId,
    title: normalizeTitle(title || work.title),
    content: String(content || ''),
    updatedAt: now
  });

  const updateChild = db.prepare(`
    UPDATE local_work_children
    SET title = @title,
        content = @content,
        updated_at = @updatedAt
    WHERE id = @childId
      AND parent_id = @workId
  `);
  for (const child of children) {
    if (!child?.id) continue;
    updateChild.run({
      workId,
      childId: child.id,
      title: normalizeTitle(child.title),
      content: String(child.content || ''),
      updatedAt: now
    });
  }

  return listImportedWorks(db);
}

function updateWorkSpeechScript(db, {
  workId,
  script,
  status = '已生成',
  modelId = '',
  promptTemplate = '',
  speakerCount = 1
}) {
  if (!workId) throw new Error('缺少作品 ID');
  const work = db.prepare('SELECT id FROM local_works WHERE id = @workId').get({ workId });
  if (!work) throw new Error('作品不存在');
  const now = nowIso();
  db.prepare(`
    UPDATE local_works
    SET speech_script = @script,
        speech_script_status = @status,
        speech_script_model_id = @modelId,
        speech_script_prompt = @promptTemplate,
        speech_script_speaker_count = @speakerCount,
        speech_script_updated_at = @updatedAt,
        updated_at = @updatedAt
    WHERE id = @workId
  `).run({
    workId,
    script: String(script || ''),
    status: normalizeSpeechScriptStatus(status, script),
    modelId: modelId || '',
    promptTemplate: promptTemplate || '',
    speakerCount: Math.min(Math.max(Math.round(Number(speakerCount || 1)), 1), 4),
    updatedAt: now
  });
  return listImportedWorks(db);
}

function updateWorkPodcastScript(db, {
  workId,
  script,
  status = '已生成',
  modelId = '',
  promptTemplate = '',
  speakerCount = 2
}) {
  if (!workId) throw new Error('缺少作品 ID');
  const work = db.prepare('SELECT id FROM local_works WHERE id = @workId').get({ workId });
  if (!work) throw new Error('作品不存在');
  const now = nowIso();
  db.prepare(`
    UPDATE local_works
    SET podcast_script = @script,
        podcast_script_status = @status,
        podcast_script_model_id = @modelId,
        podcast_script_prompt = @promptTemplate,
        podcast_speaker_count = @speakerCount,
        podcast_script_updated_at = @updatedAt,
        updated_at = @updatedAt
    WHERE id = @workId
  `).run({
    workId,
    script: String(script || ''),
    status: normalizeScriptStatus(status, script),
    modelId: modelId || '',
    promptTemplate: promptTemplate || '',
    speakerCount: Math.min(Math.max(Math.round(Number(speakerCount || 2)), 1), 5),
    updatedAt: now
  });
  return listImportedWorks(db);
}

async function deleteImportedWork(db, { workId, targetRoot }) {
  if (!workId) throw new Error('缺少作品 ID');
  if (!targetRoot) throw new Error('请先设置作品路径');

  const row = db.prepare('SELECT * FROM local_works WHERE id = @workId').get({ workId });
  if (!row) return listImportedWorks(db);
  if (!row.folder_path || !isPathInside(targetRoot, row.folder_path)) {
    throw new Error('作品目录不在当前作品路径内，已阻止删除文件');
  }

  await fs.rm(row.folder_path, { recursive: true, force: true });
  db.prepare('DELETE FROM local_work_children WHERE parent_id = @workId').run({ workId });
  db.prepare('DELETE FROM local_works WHERE id = @workId').run({ workId });
  return listImportedWorks(db);
}

function normalizePublishStatus(status) {
  const allowed = new Set(['未发布', '已发布', '部分发布', '发布失败']);
  return allowed.has(status) ? status : '未发布';
}

function normalizePlatformPublishStatus(status) {
  const allowed = new Set(['未发布', '待发布', '发布中', '已发布', '发布失败', '已下架']);
  return allowed.has(status) ? status : '未发布';
}

function normalizeSpeechScriptStatus(status, script) {
  return normalizeScriptStatus(status, script);
}

function normalizeScriptStatus(status, script) {
  if (script) return '已生成';
  const allowed = new Set(['未生成', '生成中', '已生成', '生成失败']);
  return allowed.has(status) ? status : '未生成';
}

function normalizeTitle(value) {
  return String(value || '').trim().slice(0, 20) || '未命名作品';
}

module.exports = {
  scanLocalWorks,
  importScannedWorks,
  listImportedWorks,
  organizeImportedWorks,
  updateWorkTags,
  updateWorkPublishStatus,
  updateChildPublishStatus,
  updatePublishRecord,
  updateWorkCopy,
  updateWorkSpeechScript,
  updateWorkPodcastScript,
  deleteImportedWork
};
