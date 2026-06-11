function workImage(title, primary, secondary) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="840" height="1120" viewBox="0 0 840 1120">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${primary}"/>
          <stop offset="100%" stop-color="${secondary}"/>
        </linearGradient>
      </defs>
      <rect width="840" height="1120" rx="40" fill="url(#bg)"/>
      <rect x="72" y="90" width="696" height="940" rx="32" fill="rgba(255,255,255,0.88)"/>
      <text x="112" y="190" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="34" font-weight="700" fill="#18212f">MediapolotX</text>
      <text x="112" y="300" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="58" font-weight="800" fill="#18212f">${title}</text>
      <rect x="112" y="430" width="470" height="18" rx="9" fill="#18212f" opacity="0.18"/>
      <rect x="112" y="486" width="560" height="18" rx="9" fill="#18212f" opacity="0.14"/>
      <rect x="112" y="542" width="390" height="18" rx="9" fill="#18212f" opacity="0.12"/>
      <circle cx="640" cy="810" r="88" fill="rgba(255,255,255,0.56)"/>
      <circle cx="202" cy="830" r="128" fill="rgba(255,255,255,0.38)"/>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const localWorks = [
  {
    id: 'work-customs-001',
    serialNo: 1,
    title: '海关公告解读：企业如何快速应对',
    folderName: '20260611-customs-notice',
    mdFile: 'index.md',
    publishStatus: '部分发布',
    children: [
      {
        id: 'xhs-customs-001',
        platform: '小红书',
        title: '这条海关新规，外贸企业要注意',
        content: '最近的海关公告对申报、单证和企业内部合规提出了更细要求。外贸企业可以先从商品归类、申报要素、留存资料和供应链协同四个方向排查，避免因为信息不一致影响通关效率。',
        tags: ['海关公告', '外贸合规', '小红书'],
        publishStatus: '未发布',
        imagePaths: [
          workImage('海关新规', '#f5b041', '#5dade2'),
          workImage('合规清单', '#48c9b0', '#34495e')
        ]
      },
      {
        id: 'wechat-customs-001',
        platform: '公众号',
        title: '从一则海关公告看企业合规动作',
        content: '这篇文章适合公众号长文发布，重点拆解公告背景、政策变化、企业风险和执行建议，适合作为专业内容沉淀。',
        tags: ['公众号', '深度文章'],
        publishStatus: '已发布',
        imagePaths: [workImage('公众号长文', '#af7ac5', '#5499c7')]
      }
    ]
  },
  {
    id: 'work-ai-image-001',
    serialNo: 2,
    title: 'AI 图片发布前处理流程',
    folderName: '20260610-ai-image-publish',
    mdFile: 'index.md',
    publishStatus: '未发布',
    children: [
      {
        id: 'xhs-ai-image-001',
        platform: '小红书',
        title: 'AI 图发布前，先做这 5 步',
        content: '发布图片前建议检查 C2PA、EXIF、可见水印、压缩质量和尺寸比例。处理完成后再重新扫描一次，确认平台可能识别的元数据和明显痕迹已经减少。',
        tags: ['AI图片', '去AI标识', '发布检查'],
        publishStatus: '未发布',
        imagePaths: [workImage('AI图片检查', '#85929e', '#45b39d')]
      }
    ]
  },
  {
    id: 'work-video-cover-001',
    serialNo: 3,
    title: '短视频封面生成规范',
    folderName: '20260609-video-cover-guide',
    mdFile: 'index.md',
    publishStatus: '发布失败',
    children: []
  }
];
