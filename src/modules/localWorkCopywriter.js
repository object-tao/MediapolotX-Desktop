const fs = require('node:fs/promises');

const CHILD_BATCH_SIZE = 6;

async function generateLocalWorkCopy(work, options, generateText, onProgress = () => {}) {
  if (!work?.id) throw new Error('缺少作品信息');
  if (!work.mdFile) throw new Error('当前作品没有 MD 文件，无法生成文案');

  const sourceMarkdown = await fs.readFile(work.mdFile, 'utf8');
  const sourceText = normalizeSourceText(sourceMarkdown);
  if (!sourceText) throw new Error('MD 文件内容为空，无法生成文案');

  const children = Array.isArray(work.children) ? work.children : [];
  const payload = {
    titleLimit: 20,
    contentLimit: 1000,
    childCount: children.length,
    children: children.map((child, index) => ({
      id: child.id,
      variantName: child.variantName || `子作品${index + 1}`
    })),
    sourceTitle: work.title,
    sourceText
  };
  const promptTemplate = options.promptTemplate || buildPromptTemplate(payload);

  onProgress({ stage: 'requesting', current: 0, total: children.length + 1, label: '正在调用 AI 生成主作品文案' });
  const mainResponse = await generateText({
    modelId: options.modelId,
    messages: buildMessages(payload, buildMainOnlyPrompt(promptTemplate)),
    temperature: Number(options.temperature ?? 0.75),
    maxTokens: Math.min(Number(options.maxTokens ?? 4096), 4096),
    timeout: Number(options.timeout ?? 600000)
  });

  onProgress({ stage: 'parsing', current: 1, total: children.length + 1, label: '正在解析主作品文案' });
  const mainParsed = parseGeneratedCopy(mainResponse.content);
  const main = normalizeCopyItem(mainParsed.main, work.title);
  const generatedChildren = [];

  for (const [batchIndex, batchChildren] of chunkArray(children, CHILD_BATCH_SIZE).entries()) {
    const batchStart = batchIndex * CHILD_BATCH_SIZE;
    const batchPayload = {
      ...payload,
      childCount: batchChildren.length,
      children: batchChildren.map((child, index) => ({
        id: child.id,
        variantName: child.variantName || `子作品${batchStart + index + 1}`
      }))
    };
    onProgress({
      stage: 'requesting',
      current: batchStart + 1,
      total: children.length + 1,
      label: `正在生成子作品 ${batchStart + 1}-${Math.min(batchStart + batchChildren.length, children.length)}/${children.length}`
    });
    const batchResponse = await generateText({
      modelId: options.modelId,
      messages: buildMessages(batchPayload, buildChildBatchPrompt(promptTemplate, batchPayload)),
      temperature: Number(options.temperature ?? 0.75),
      maxTokens: Math.min(Number(options.maxTokens ?? Math.max(4096, batchChildren.length * 900)), Math.max(4096, batchChildren.length * 1200)),
      timeout: Number(options.timeout ?? 600000)
    });
    const parsedBatch = parseGeneratedCopy(batchResponse.content);
    const variants = Array.isArray(parsedBatch.variants) ? parsedBatch.variants : [];
    batchChildren.forEach((child, index) => {
      const variant = variants[index] || {};
      generatedChildren.push({
        id: child.id,
        ...normalizeCopyItem(variant, main.title)
      });
      onProgress({
        stage: 'mapping',
        current: batchStart + index + 2,
        total: children.length + 1,
        label: `正在整理子作品 ${batchStart + index + 1}/${children.length}`
      });
    });
  }

  onProgress({ stage: 'done', current: children.length + 1, total: children.length + 1, label: '文案生成完成' });
  return {
    workId: work.id,
    title: main.title,
    content: main.content,
    children: generatedChildren,
    modelId: mainResponse.modelId,
    modelName: mainResponse.modelName
  };
}

function buildMessages(payload, promptTemplate = buildPromptTemplate(payload)) {
  return [
    {
      role: 'system',
      content: [
        '你是 MediapolotX Desktop 的小红书图文文案助手。',
        '你擅长把一篇源文章拆成多个差异明显、适合发布的小红书图文标题和正文。',
        '必须基于源文章事实生成，不得编造具体政策编号、日期、金额、机构名称或数据。',
        '子作品之间必须在标题角度、开头切入、段落顺序、表达语气、重点信息和结尾建议上明显不同，降低平台重复检测风险。',
        '只输出 JSON，不要输出 Markdown 代码块，不要解释。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        promptTemplate.trim(),
        '',
        '源文章内容：',
        payload.sourceText
      ].join('\n')
    }
  ];
}

function buildPromptTemplate(payload) {
  return [
    `主作品原标题：${payload.sourceTitle}`,
    `标题限制：每个 title 必须在 ${payload.titleLimit} 个中文字符以内。`,
    `正文限制：每个 content 必须在 ${payload.contentLimit} 个中文字符以内。`,
    `子作品数量：${payload.childCount}`,
    `子作品目录标识：${payload.children.map((child) => child.variantName).join('、') || '无'}`,
    '',
    '请生成以下 JSON 结构：',
    '{',
    '  "main": { "title": "主作品标题", "content": "主作品小红书正文" },',
    '  "variants": [',
    '    { "title": "子作品标题1", "content": "子作品小红书正文1" }',
    '  ]',
    '}',
    '',
    '写作要求：',
    '- 标题不要超过20个中文字符，不使用夸张符号堆砌。',
    '- 正文可以分段，但必须是纯文本，可直接发布到小红书。',
    '- 主作品正文要完整覆盖源文核心信息。',
    '- 每个子作品正文都要能独立发布，不能只是同义词替换。',
    '- 子作品之间必须在标题角度、开头切入、段落顺序、表达语气、重点信息和结尾建议上明显不同，降低平台重复检测风险。',
    '- 不要承诺绝对收益，不要制造焦虑，不要编造来源。',
    '- variants 数量必须等于子作品数量。',
    '- 只输出 JSON，不要输出 Markdown 代码块，不要解释。'
  ].join('\n');
}

function buildMainOnlyPrompt(promptTemplate) {
  return [
    promptTemplate.trim(),
    '',
    '本次任务：只生成主作品 main。',
    '要求 variants 返回空数组 []，不要生成子作品文案。'
  ].join('\n');
}

function buildChildBatchPrompt(promptTemplate, payload) {
  return [
    promptTemplate.trim(),
    '',
    '本次任务：只生成当前这一批子作品 variants。',
    '要求 main 可以返回空对象 {}，不要重新生成主作品正文。',
    `本批子作品数量：${payload.childCount}`,
    `本批子作品目录标识：${payload.children.map((child) => child.variantName).join('、') || '无'}`,
    `variants 数量必须等于本批子作品数量：${payload.childCount}`
  ].join('\n');
}

function parseGeneratedCopy(content) {
  const text = String(content || '').trim();
  if (!text) throw new Error('AI 未返回文案内容');
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const jsonText = extractJsonObject(cleaned);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`AI 返回内容不是有效 JSON：${error.message}`);
  }
}

function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return text;
  return text.slice(start, end + 1);
}

function normalizeCopyItem(item = {}, fallbackTitle = '未命名作品') {
  return {
    title: limitChineseTitle(item.title || fallbackTitle, 20),
    content: limitText(item.content || '', 1000)
  };
}

function limitChineseTitle(value, maxLength) {
  const title = String(value || '').replace(/\s+/g, '').trim();
  return Array.from(title).slice(0, maxLength).join('') || '未命名作品';
}

function limitText(value, maxLength) {
  return Array.from(String(value || '').trim()).slice(0, maxLength).join('');
}

function normalizeSourceText(markdown) {
  return String(markdown || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ''))
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[`*_>#-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 16000);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

module.exports = {
  buildPromptTemplate,
  buildMessages,
  generateLocalWorkCopy,
  normalizeSourceText,
  parseGeneratedCopy
};
