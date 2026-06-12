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
  return rows.map((row) => ({
    id: row.id,
    serialNo: Number(row.serial_no || 0),
    title: row.title,
    folderName: row.folder_name,
    folderPath: row.folder_path,
    mdFile: row.md_file || '',
    imagePaths: parseImagePaths(row.image_paths),
    publishStatus: row.publish_status,
    children: childMap.get(row.id) || []
  }));
}

async function importScannedWorks(db, { sourceRoot, targetRoot }) {
  if (!sourceRoot) throw new Error('请先选择目录导入并完成扫描');
  if (!targetRoot) throw new Error('请先设置作品路径');

  await fs.mkdir(targetRoot, { recursive: true });
  const scanned = await scanLocalWorks(sourceRoot);
  const now = nowIso();

  const insertWork = db.prepare(`
    INSERT OR REPLACE INTO local_works (
      id, title, folder_name, folder_path, md_file, image_paths, publish_status, source_root, created_at, updated_at
    ) VALUES (
      @id, @title, @folderName, @folderPath, @mdFile, @imagePaths, @publishStatus, @sourceRoot, @createdAt, @updatedAt
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
    const destinationPath = await uniqueFolderPath(targetRoot, sourceWork.folderName);
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
      publishStatus: '未发布'
    };

    insertWork.run({
      id: workId,
      title: importedWork.title,
      folderName: importedWork.folderName,
      folderPath: importedWork.folderPath,
      mdFile: importedWork.mdFile,
      imagePaths: JSON.stringify(importedWork.imagePaths),
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

module.exports = {
  scanLocalWorks,
  importScannedWorks,
  listImportedWorks
};
