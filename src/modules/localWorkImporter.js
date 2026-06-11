const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

async function scanImages(folderPath, entries) {
  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => pathToFileURL(path.join(folderPath, entry.name)).href);
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
  const imagePaths = await scanImages(childPath, entries);
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
    imagePaths
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

module.exports = {
  scanLocalWorks
};
