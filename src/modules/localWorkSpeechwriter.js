const fs = require('node:fs/promises');
const { normalizeSourceText } = require('./localWorkCopywriter');

async function generateLocalWorkSpeech(work, options, generateText, onProgress = () => {}) {
  if (!work?.id) throw new Error('缺少作品信息');
  if (!work.mdFile) throw new Error('当前作品没有 MD 文件，无法生成口播脚本');

  const sourceMarkdown = await fs.readFile(work.mdFile, 'utf8');
  const sourceText = normalizeSourceText(sourceMarkdown);
  if (!sourceText) throw new Error('MD 文件内容为空，无法生成口播脚本');

  const speakerCount = normalizeSpeakerCount(options.speakerCount);
  const promptTemplate = options.promptTemplate || buildPromptTemplate({
    sourceTitle: work.title,
    copyTitle: work.title,
    copyContent: work.content || '',
    speakerCount
  });

  onProgress({ stage: 'requesting', current: 0, total: 1, label: '正在调用 AI 生成口播脚本' });
  const response = await generateText({
    modelId: options.modelId,
    messages: buildMessages({
      sourceTitle: work.title,
      copyTitle: work.title,
      copyContent: work.content || '',
      sourceText,
      speakerCount
    }, promptTemplate),
    temperature: Number(options.temperature ?? 0.65),
    maxTokens: Math.min(Number(options.maxTokens ?? 4096), 12000),
    timeout: Number(options.timeout ?? 600000)
  });

  const script = normalizeScript(response.content);
  if (!script) throw new Error('AI 未返回口播脚本内容');
  onProgress({ stage: 'done', current: 1, total: 1, label: '口播脚本生成完成' });

  return {
    workId: work.id,
    script,
    status: '已生成',
    modelId: response.modelId || options.modelId || '',
    modelName: response.modelName || '',
    promptTemplate,
    speakerCount
  };
}

function buildMessages(payload, promptTemplate = buildPromptTemplate(payload)) {
  return [
    {
      role: 'system',
      content: [
        '你是 MediapolotX Desktop 的短视频口播脚本助手。',
        '你擅长把 Markdown 文章整理成适合自媒体录制的中文口播脚本。',
        '必须基于源文章事实生成，不得编造具体政策编号、日期、金额、机构名称或数据。',
        '只输出口播脚本正文，不要输出 JSON，不要解释生成过程。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        promptTemplate.trim(),
        '',
        payload.copyContent ? `已有图文正文参考：\n${payload.copyContent}` : '',
        '',
        '源 Markdown 文章内容：',
        payload.sourceText
      ].filter(Boolean).join('\n')
    }
  ];
}

function buildPromptTemplate(payload) {
  const speakerCount = normalizeSpeakerCount(payload.speakerCount);
  const roles = Array.from({ length: speakerCount }, (_, index) => String.fromCharCode(65 + index));
  return [
    `作品标题：${payload.sourceTitle || payload.copyTitle || '未命名作品'}`,
    `人物数：${speakerCount}`,
    '',
    '请根据源文章生成短视频口播脚本。',
    '要求：',
    '- 单段口播控制在 1 分钟以内，语言简洁、自然、适合直接朗读。',
    '- 如果内容超过 1 分钟，请拆成“第1段 / 第2段 / 第3段...”多段口播脚本。',
    '- 每段都要有清晰开头、核心信息和收尾提示。',
    '- 不要做长篇文章式复述，优先提炼重点、背景、影响和行动建议。',
    '- 不要编造源文章没有的信息，不要承诺绝对收益，不要制造焦虑。',
    speakerCount > 1
      ? `- 使用 ${roles.join('/')} 作为人物标识，按“${roles[0]}：...”格式分角色写台词。`
      : '- 单人口播直接写台词，不需要角色名。',
    '- 只输出口播脚本正文，不要输出 JSON、Markdown 代码块或说明文字。'
  ].join('\n');
}

function normalizeSpeakerCount(value) {
  const count = Math.round(Number(value || 1));
  return Math.min(Math.max(count, 1), 4);
}

function normalizeScript(value) {
  return String(value || '')
    .replace(/^```(?:markdown|md|text)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

module.exports = {
  buildPromptTemplate,
  buildMessages,
  generateLocalWorkSpeech,
  normalizeSpeakerCount,
  normalizeScript
};
