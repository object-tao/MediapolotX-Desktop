const fs = require('node:fs/promises');
const { normalizeSourceText } = require('./localWorkCopywriter');

async function generateLocalWorkPodcast(work, options, generateText, onProgress = () => {}) {
  if (!work?.id) throw new Error('缺少作品信息');
  if (!work.mdFile) throw new Error('当前作品没有 MD 文件，无法生成播客文案');

  const sourceMarkdown = await fs.readFile(work.mdFile, 'utf8');
  const sourceText = normalizeSourceText(sourceMarkdown);
  if (!sourceText) throw new Error('MD 文件内容为空，无法生成播客文案');

  const speakerCount = normalizeSpeakerCount(options.speakerCount);
  const promptTemplate = options.promptTemplate || buildPromptTemplate({
    sourceTitle: work.title,
    copyTitle: work.title,
    copyContent: work.content || '',
    speakerCount
  });

  onProgress({ stage: 'requesting', current: 0, total: 1, label: '正在调用 AI 生成播客文案' });
  const response = await generateText({
    modelId: options.modelId,
    messages: buildMessages({
      sourceTitle: work.title,
      copyTitle: work.title,
      copyContent: work.content || '',
      sourceText,
      speakerCount
    }, promptTemplate),
    temperature: Number(options.temperature ?? 0.7),
    maxTokens: Math.min(Number(options.maxTokens ?? 12000), 24000),
    timeout: Number(options.timeout ?? 900000)
  });

  const script = normalizePodcastScript(response.content);
  if (!script) throw new Error('AI 未返回播客文案内容');
  onProgress({ stage: 'done', current: 1, total: 1, label: '播客文案生成完成' });

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
        '你是 MediapolotX Desktop 的中文播客节目策划和脚本助手。',
        '你擅长把 Markdown 文章整理、总结、延展成适合双人或多人播客录制的对话脚本。',
        '必须基于源文章事实生成，不得编造具体政策编号、日期、金额、机构名称或数据。',
        '只输出播客文案正文，不要输出 JSON，不要解释生成过程。'
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
  const roles = buildRoles(speakerCount);
  return [
    `作品标题：${payload.sourceTitle || payload.copyTitle || '未命名作品'}`,
    `人物数：${speakerCount}`,
    '',
    '请根据源文章生成一份中文播客节目文案。',
    '节目目标：把文章内容整理、总结并扩展成可录制的播客对话，适合后续通过 TTS/AI 配音转成音频发布。',
    '时长要求：平台规则要求音频至少 10 分钟以上，请按 10-15 分钟播客节奏编写，不要只写短口播。',
    '结构要求：',
    '- 开场：节目主题、听众为什么要关注。',
    '- 背景：用通俗语言解释文章背景和核心事实。',
    '- 深入讨论：围绕重点信息做多轮追问、解释、举例和风险提醒。',
    '- 实操建议：给出企业/创作者/读者可以采取的行动建议。',
    '- 收尾：总结核心观点，并自然结束。',
    '写作要求：',
    '- 采用自然对话形式，不要写成文章，不要写成短视频口播。',
    '- 每个角色都要有明显职责：主持、追问、解释、补充或总结。',
    '- 不要编造源文章没有的信息，不要承诺绝对收益，不要制造焦虑。',
    '- 可以合理补充常识性背景，但必须避免虚构具体数据、日期、政策编号。',
    speakerCount > 1
      ? `- 使用 ${roles.join('/')} 作为人物标识，按“${roles[0]}：...”格式逐句写台词。`
      : '- 单人播客直接写独白式节目稿，不需要角色名。',
    '- 只输出播客文案正文，不要输出 JSON、Markdown 代码块或说明文字。'
  ].join('\n');
}

function buildRoles(speakerCount) {
  return Array.from({ length: speakerCount }, (_, index) => String.fromCharCode(65 + index));
}

function normalizeSpeakerCount(value) {
  const count = Math.round(Number(value || 2));
  return Math.min(Math.max(count, 1), 5);
}

function normalizePodcastScript(value) {
  return String(value || '')
    .replace(/^```(?:markdown|md|text)?/i, '')
    .replace(/```$/i, '')
    .trim();
}

module.exports = {
  buildPromptTemplate,
  buildMessages,
  generateLocalWorkPodcast,
  normalizeSpeakerCount,
  normalizePodcastScript
};
