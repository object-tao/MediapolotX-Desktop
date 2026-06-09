const fs = require('node:fs/promises');
const path = require('node:path');
const { sanitizeFilename } = require('./wechatMpMarkdown');

const ARTICLE_TYPES = {
  customs_notice: '海关公告',
  industry_news: '行业资讯',
  peer_article: '同行文章',
  general: '普通文章'
};

async function readMarkdownFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return {
    filePath,
    filename: path.basename(filePath),
    content
  };
}

async function rewriteArticle(payload, generateText) {
  const inputText = normalizeText(payload.inputText);
  if (!inputText) throw new Error('原文内容不能为空');
  if (!payload.outputDir) throw new Error('请选择保存目录');

  await fs.mkdir(payload.outputDir, { recursive: true });
  const messages = buildRewriteMessages(payload);
  const response = await generateText({
    modelId: payload.modelId,
    messages,
    temperature: Number(payload.temperature ?? 0.6),
    maxTokens: Number(payload.maxTokens ?? 4096)
  });
  const markdown = normalizeMarkdown(response.content);
  const title = extractMarkdownTitle(markdown) || payload.targetTopic || 'rewritten-article';
  const timestamp = createTimestamp();
  const basename = `${timestamp}-${sanitizeFilename(title)}`;
  const originalPath = path.join(payload.outputDir, `${basename}-原文.md`);
  const rewrittenPath = path.join(payload.outputDir, `${basename}-生成文.md`);

  await fs.writeFile(originalPath, buildOriginalMarkdown(payload), 'utf8');
  await fs.writeFile(rewrittenPath, markdown, 'utf8');

  return {
    title,
    markdown,
    originalPath,
    rewrittenPath,
    modelId: response.modelId,
    modelName: response.modelName
  };
}

function buildRewriteMessages(payload) {
  const articleType = ARTICLE_TYPES[payload.articleType] || ARTICLE_TYPES.general;
  const targetAudience = payload.targetAudience || '外贸企业、跨境电商、货代、报关行和企业经营者';
  const style = payload.style || '专业、通俗、适合公众号发布';
  const length = payload.length || '深度长文';
  const instructions = payload.instructions || '在不改变核心事实的前提下，重写并补充背景、影响和操作建议。';

  return [
    {
      role: 'system',
      content: [
        '你是 MediapolotX Desktop 的中文内容创作助手，擅长海关政策、外贸合规、行业资讯解读和公众号文章写作。',
        '必须基于用户提供的原文事实进行深度改写，不能编造具体法规编号、日期、数据或出处。',
        '如果需要补充背景，请使用稳健表达，并清楚区分“原文事实”和“延伸解读”。',
        '输出必须是 Markdown，直接输出正文，不要包裹代码块。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `文章类型：${articleType}`,
        `目标主题：${payload.targetTopic || '根据原文提炼'}`,
        `目标读者：${targetAudience}`,
        `文章风格：${style}`,
        `文章长度：${length}`,
        `额外要求：${instructions}`,
        '',
        '请按以下结构输出：',
        '# 标题',
        '',
        '## 摘要',
        '',
        '## 背景与原文要点',
        '',
        '## 深度解读',
        '',
        '## 对企业的影响',
        '',
        '## 操作建议',
        '',
        '## 结论',
        '',
        '要求：',
        '- 不要照搬原文表达，要重写语言、结构和角度。',
        '- 保留原文中的关键事实、时间、主体、政策动作和限制条件。',
        '- 适合直接保存为 Markdown 发布前编辑。',
        '',
        '原文如下：',
        payload.inputText
      ].join('\n')
    }
  ];
}

function buildOriginalMarkdown(payload) {
  return [
    `# ${payload.sourceTitle || '原文'}`,
    '',
    payload.sourceFile ? `> 来源文件：${payload.sourceFile}` : null,
    `> 保存时间：${new Date().toISOString()}`,
    '',
    payload.inputText.trim(),
    ''
  ].filter(Boolean).join('\n');
}

function extractMarkdownTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function normalizeMarkdown(value) {
  const markdown = String(value || '').trim();
  if (!markdown) throw new Error('AI 未返回有效内容');
  return `${markdown}\n`;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function createTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

module.exports = {
  ARTICLE_TYPES,
  buildRewriteMessages,
  readMarkdownFile,
  rewriteArticle
};
