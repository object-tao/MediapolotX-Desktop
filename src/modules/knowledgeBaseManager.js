const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { nowIso } = require('./db');

const industries = ['外贸行业', '集运行业', '国际物流', '国际清关'];

function createKnowledgeBaseManager(db, baseDir) {
  async function listNodes(industry = 'all') {
    await ensureBaseDir();
    const rows = industry && industry !== 'all'
      ? db.prepare(`
        SELECT * FROM knowledge_base_nodes
        WHERE industry = @industry
        ORDER BY sort_order ASC, created_at ASC, title ASC
      `).all({ industry })
      : db.prepare(`
        SELECT * FROM knowledge_base_nodes
        ORDER BY sort_order ASC, created_at ASC, title ASC
      `).all();
    const nodes = [];
    for (const row of rows) {
      nodes.push(await rowToUi(row));
    }
    return {
      industries,
      nodes
    };
  }

  async function readNode(nodeId) {
    const row = db.prepare('SELECT * FROM knowledge_base_nodes WHERE id = @nodeId').get({ nodeId });
    if (!row) throw new Error('知识库节点不存在');
    return rowToUi(row);
  }

  async function saveNode(payload = {}) {
    await ensureBaseDir();
    const id = payload.id || `kb-${randomUUID()}`;
    const now = nowIso();
    const existing = payload.id
      ? db.prepare('SELECT * FROM knowledge_base_nodes WHERE id = @id').get({ id: payload.id })
      : null;
    if (payload.parentId && payload.parentId === id) throw new Error('父级节点不能选择自己');
    if (payload.parentId && payload.id) {
      const rows = db.prepare('SELECT id, parent_id FROM knowledge_base_nodes').all();
      if (collectDescendantIds(rows, id).includes(payload.parentId)) {
        throw new Error('父级节点不能选择当前节点的子节点');
      }
    }
    if (payload.parentId) {
      const parent = db.prepare('SELECT id FROM knowledge_base_nodes WHERE id = @parentId').get({ parentId: payload.parentId });
      if (!parent) throw new Error('父级节点不存在');
    }

    const title = normalizeTitle(payload.title);
    const industry = normalizeIndustry(payload.industry);
    const filePath = existing?.file_path || path.join(baseDir, `${id}.md`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, String(payload.contentMarkdown || ''), 'utf8');

    db.prepare(`
      INSERT INTO knowledge_base_nodes (
        id, parent_id, title, industry, node_type, file_path, sort_order, created_at, updated_at
      ) VALUES (
        @id, @parentId, @title, @industry, @nodeType, @filePath, @sortOrder, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id,
        title = excluded.title,
        industry = excluded.industry,
        node_type = excluded.node_type,
        file_path = excluded.file_path,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `).run({
      id,
      parentId: payload.parentId || '',
      title,
      industry,
      nodeType: payload.nodeType || 'content',
      filePath,
      sortOrder: Number(payload.sortOrder || existing?.sort_order || 0),
      createdAt: existing?.created_at || now,
      updatedAt: now
    });
    return listNodes(payload.filterIndustry || 'all');
  }

  async function deleteNode(nodeId, filterIndustry = 'all') {
    const rows = db.prepare('SELECT * FROM knowledge_base_nodes').all();
    const deleteIds = collectDescendantIds(rows, nodeId);
    for (const id of deleteIds) {
      const row = rows.find((item) => item.id === id);
      if (row?.file_path) {
        await fs.rm(row.file_path, { force: true });
      }
      db.prepare('DELETE FROM knowledge_base_nodes WHERE id = @id').run({ id });
    }
    return listNodes(filterIndustry);
  }

  async function importDirectory(payload = {}) {
    await ensureBaseDir();
    const sourceRoot = String(payload.sourceRoot || '').trim();
    const industry = normalizeIndustry(payload.industry);
    if (!sourceRoot) throw new Error('请选择知识库导入目录');
    const stat = await fs.stat(sourceRoot).catch(() => null);
    if (!stat?.isDirectory()) throw new Error('知识库导入目录不存在');

    const rootTitle = normalizeTitle(payload.rootTitle || path.basename(sourceRoot));
    if (payload.replaceExisting !== false) {
      const existingRoots = db.prepare(`
        SELECT id FROM knowledge_base_nodes
        WHERE parent_id = '' AND title = @rootTitle AND industry = @industry
      `).all({ rootTitle, industry });
      for (const root of existingRoots) {
        await deleteNode(root.id, 'all');
      }
    }

    const importRoot = path.join(baseDir, 'imports', sanitizePathPart(rootTitle));
    await fs.rm(importRoot, { recursive: true, force: true });
    await fs.mkdir(importRoot, { recursive: true });
    const imported = { directories: 0, files: 0 };
    await importFolder({
      sourceFolder: sourceRoot,
      destinationRoot: importRoot,
      sourceRoot,
      parentId: '',
      title: rootTitle,
      industry,
      sortOrder: Number(payload.sortOrder || 0),
      imported
    });
    return {
      imported,
      ...(await listNodes(payload.filterIndustry || industry))
    };
  }

  async function importFolder({ sourceFolder, destinationRoot, sourceRoot, parentId, title, industry, sortOrder, imported }) {
    const now = nowIso();
    const id = `kb-${randomUUID()}`;
    db.prepare(`
      INSERT INTO knowledge_base_nodes (
        id, parent_id, title, industry, node_type, file_path, sort_order, created_at, updated_at
      ) VALUES (
        @id, @parentId, @title, @industry, 'directory', '', @sortOrder, @createdAt, @updatedAt
      )
    `).run({
      id,
      parentId,
      title,
      industry,
      sortOrder,
      createdAt: now,
      updatedAt: now
    });
    imported.directories += 1;

    const entries = (await fs.readdir(sourceFolder, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith('.'))
      .sort(compareImportEntries);
    let childOrder = 0;
    for (const entry of entries) {
      const sourcePath = path.join(sourceFolder, entry.name);
      if (entry.isDirectory()) {
        await importFolder({
          sourceFolder: sourcePath,
          destinationRoot,
          sourceRoot,
          parentId: id,
          title: cleanTitle(entry.name),
          industry,
          sortOrder: childOrder,
          imported
        });
        childOrder += 1;
      } else if (isMarkdownFile(entry.name)) {
        await importMarkdownFile({
          sourcePath,
          destinationRoot,
          sourceRoot,
          parentId: id,
          title: cleanTitle(path.basename(entry.name, path.extname(entry.name))),
          industry,
          sortOrder: childOrder
        });
        imported.files += 1;
        childOrder += 1;
      }
    }
    return id;
  }

  async function importMarkdownFile({ sourcePath, destinationRoot, sourceRoot, parentId, title, industry, sortOrder }) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const destinationPath = path.join(destinationRoot, ...relativePath.split(path.sep).map(sanitizePathPart));
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
    const now = nowIso();
    db.prepare(`
      INSERT INTO knowledge_base_nodes (
        id, parent_id, title, industry, node_type, file_path, sort_order, created_at, updated_at
      ) VALUES (
        @id, @parentId, @title, @industry, 'content', @filePath, @sortOrder, @createdAt, @updatedAt
      )
    `).run({
      id: `kb-${randomUUID()}`,
      parentId,
      title,
      industry,
      filePath: destinationPath,
      sortOrder,
      createdAt: now,
      updatedAt: now
    });
  }

  async function ensureSeedData() {
    const count = db.prepare('SELECT COUNT(*) AS count FROM knowledge_base_nodes').get()?.count || 0;
    if (Number(count) > 0) return listNodes('all');
    await saveNode({
      title: '外贸术语基础',
      industry: '外贸行业',
      contentMarkdown: '# 外贸术语基础\n\n这里可以维护常用外贸术语、业务流程和写作素材。\n\n- FOB / CIF / CFR\n- 报关资料\n- 交付与结算节点'
    });
    await saveNode({
      title: '国际清关要点',
      industry: '国际清关',
      contentMarkdown: '# 国际清关要点\n\n用于沉淀清关流程、申报规范、风险提醒和案例素材。'
    });
    return listNodes('all');
  }

  async function rowToUi(row) {
    const contentMarkdown = row.file_path ? await safeReadFile(row.file_path) : '';
    return {
      id: row.id,
      parentId: row.parent_id || '',
      title: row.title,
      industry: row.industry,
      nodeType: row.node_type || 'content',
      filePath: row.file_path || '',
      sortOrder: Number(row.sort_order || 0),
      contentMarkdown,
      contentHtml: markdownToHtml(contentMarkdown),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async function ensureBaseDir() {
    await fs.mkdir(baseDir, { recursive: true });
  }

  return {
    industries: () => industries,
    listNodes,
    readNode,
    saveNode,
    deleteNode,
    importDirectory,
    ensureSeedData
  };
}

function collectDescendantIds(rows, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (ids.has(row.parent_id) && !ids.has(row.id)) {
        ids.add(row.id);
        changed = true;
      }
    }
  }
  return [...ids];
}

async function safeReadFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function normalizeTitle(value) {
  const title = String(value || '').trim();
  if (!title) throw new Error('知识库标题不能为空');
  return title.slice(0, 120);
}

function normalizeIndustry(value) {
  return industries.includes(value) ? value : industries[0];
}

function isMarkdownFile(fileName) {
  return ['.md', '.markdown'].includes(path.extname(fileName).toLowerCase());
}

function compareImportEntries(a, b) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  const aKey = sortKeyForKnowledgeEntry(a.name);
  const bKey = sortKeyForKnowledgeEntry(b.name);
  if (aKey.group !== bKey.group) return aKey.group - bKey.group;
  if (aKey.order !== bKey.order) return aKey.order - bKey.order;
  return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
}

function sortKeyForKnowledgeEntry(name) {
  const normalized = cleanTitle(name).replace(/\s+/g, '');
  if (/^(卷首语|序言|前言|导读)/.test(normalized)) return { group: 0, order: 0 };
  if (/^(目录|大纲|详细大纲)/.test(normalized)) return { group: 1, order: 0 };
  const volume = normalized.match(/^第([一二三四五六七八九十百千万零〇两\d]+)[卷章节篇部]/);
  if (volume) return { group: 2, order: parseOrdinalNumber(volume[1]) };
  const leadingNumber = normalized.match(/^(\d+)[._、-]?/);
  if (leadingNumber) return { group: 2, order: Number(leadingNumber[1]) };
  return { group: 3, order: Number.MAX_SAFE_INTEGER };
}

function parseOrdinalNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = {
    零: 0,
    '〇': 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  let total = 0;
  let section = 0;
  let number = 0;
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  for (const char of String(value)) {
    if (Object.prototype.hasOwnProperty.call(digits, char)) {
      number = digits[char];
      continue;
    }
    const unit = units[char];
    if (!unit) continue;
    if (unit === 10000) {
      section = (section + number) * unit;
      total += section;
      section = 0;
    } else {
      section += (number || 1) * unit;
    }
    number = 0;
  }
  return total + section + number;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\.md$/i, '')
    .replace(/\.markdown$/i, '')
    .trim() || '未命名';
}

function sanitizePathPart(value) {
  return cleanTitle(value)
    .replace(/[<>:"/\\|?*]/g, '_')
    .replaceAll('\u0000', '_')
    .slice(0, 120) || 'node';
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const html = [];
  let listOpen = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      html.push('<hr>');
      continue;
    }
    const quote = trimmed.match(/^>\s*(.+)$/);
    if (quote) {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    if (isTableRow(trimmed) && isTableSeparator(lines[index + 1]?.trim())) {
      if (listOpen) {
        html.push('</ul>');
        listOpen = false;
      }
      const headers = parseTableCells(trimmed);
      html.push('<div class="knowledgeTableWrap"><table><thead><tr>');
      for (const header of headers) html.push(`<th>${inlineMarkdown(header)}</th>`);
      html.push('</tr></thead><tbody>');
      index += 2;
      while (index < lines.length && isTableRow(lines[index].trim())) {
        html.push('<tr>');
        for (const cell of parseTableCells(lines[index].trim())) html.push(`<td>${inlineMarkdown(cell)}</td>`);
        html.push('</tr>');
        index += 1;
      }
      index -= 1;
      html.push('</tbody></table></div>');
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  if (listOpen) html.push('</ul>');
  return html.join('\n');
}

function isTableRow(value) {
  return /^\|.+\|$/.test(value) && value.split('|').length >= 3;
}

function isTableSeparator(value) {
  return /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(value || '');
}

function parseTableCells(value) {
  return value
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = {
  createKnowledgeBaseManager,
  markdownToHtml,
  industries
};
