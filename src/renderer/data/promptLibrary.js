function promptCover(title, primary, secondary) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${primary}"/>
          <stop offset="100%" stop-color="${secondary}"/>
        </linearGradient>
      </defs>
      <rect width="720" height="900" rx="36" fill="url(#bg)"/>
      <rect x="56" y="72" width="608" height="756" rx="28" fill="rgba(255,255,255,0.84)"/>
      <circle cx="576" cy="154" r="54" fill="rgba(255,255,255,0.56)"/>
      <circle cx="126" cy="736" r="86" fill="rgba(255,255,255,0.42)"/>
      <text x="88" y="164" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="34" font-weight="700" fill="#18212f">MediapolotX</text>
      <text x="88" y="238" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="48" font-weight="700" fill="#18212f">${title}</text>
      <text x="88" y="318" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="26" fill="#4b5870">AI Prompt Library</text>
      <rect x="88" y="610" width="316" height="12" rx="6" fill="#18212f" opacity="0.18"/>
      <rect x="88" y="646" width="454" height="12" rx="6" fill="#18212f" opacity="0.14"/>
      <rect x="88" y="682" width="382" height="12" rx="6" fill="#18212f" opacity="0.12"/>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const promptLibraryItems = [
  {
    serialNo: 1,
    category: '文章重写',
    tags: ['海关公告', '深度改写', '公众号'],
    prompt: '请基于我提供的海关公告内容，重写成一篇适合公众号发布的深度文章。要求先解释政策背景，再拆解对外贸企业、跨境电商、报关行和供应链管理的影响，最后给出可执行的合规建议。不要照抄原文，保留关键事实和政策口径，语言专业但通俗。',
    imagePath: promptCover('海关公告重写', '#f5b041', '#5dade2')
  },
  {
    serialNo: 2,
    category: '文章重写',
    tags: ['行业资讯', '小红书', '案例化'],
    prompt: '请把以下行业资讯改写成小红书风格的知识型笔记。开头用一个具体痛点引入，中间用 3 到 5 个小标题讲清楚事件、原因和影响，结尾给出行动建议。语气要自然、可信，不夸张营销。',
    imagePath: promptCover('小红书资讯笔记', '#ff7f7f', '#f7dc6f')
  },
  {
    serialNo: 3,
    category: '图片处理',
    tags: ['封面文案', '小红书', '标题'],
    prompt: '请根据文章主题生成 10 组适合小红书封面的中文短标题。每组标题控制在 8 到 16 个字，要求具体、有信息量、避免夸张承诺，并适合放在图片封面上。',
    imagePath: promptCover('封面标题', '#58d68d', '#48c9b0')
  },
  {
    serialNo: 4,
    category: '去AI标识',
    tags: ['图片说明', '平台发布', '风险提示'],
    prompt: '请根据我提供的图片用途，生成一段平台发布前的检查清单。重点关注图片元数据、C2PA/Content Credentials、EXIF、可见水印、压缩质量和平台可能触发的 AI 内容提示，输出可执行步骤。',
    imagePath: promptCover('图片发布检查', '#85929e', '#45b39d')
  },
  {
    serialNo: 5,
    category: '视频封面',
    tags: ['短视频', '封面', '标题结构'],
    prompt: '请为以下短视频主题设计 8 个封面方案。每个方案包含主标题、副标题、画面主体、背景建议和适合横屏/竖屏的构图说明。风格要清晰、专业、适合自媒体平台点击。',
    imagePath: promptCover('视频封面方案', '#af7ac5', '#5499c7')
  },
  {
    serialNo: 6,
    category: '文章重写',
    tags: ['同行文章', '差异化', 'SEO'],
    prompt: '请参考我提供的同行文章，重新组织为一篇差异化原创文章。要求保留主题方向，但重构逻辑、补充行业背景、加入实际场景和常见误区，并优化标题、小标题和搜索关键词布局。',
    imagePath: promptCover('同行文章改写', '#ec7063', '#52be80')
  },
  {
    serialNo: 7,
    category: '公众号',
    tags: ['Markdown', '排版', '摘要'],
    prompt: '请把以下文章整理成适合 Markdown 保存和公众号二次编辑的格式。要求生成标题、摘要、正文分级标题、重点提示、引用段落和结尾行动建议，保留事实信息但优化阅读节奏。',
    imagePath: promptCover('公众号MD整理', '#5dade2', '#f4d03f')
  },
  {
    serialNo: 8,
    category: 'AI模型',
    tags: ['系统提示词', '稳定输出', '结构化'],
    prompt: '请作为专业内容编辑助手工作。你需要严格根据用户提供的资料生成内容，不编造事实；输出前先判断资料类型，再按照背景、要点、影响、建议的结构生成；遇到不确定内容必须标注为待确认。',
    imagePath: promptCover('系统提示词', '#48c9b0', '#34495e')
  }
];
