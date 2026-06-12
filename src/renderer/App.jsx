import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Clapperboard,
  Copy,
  FileText,
  FolderOpen,
  GalleryVerticalEnd,
  Image as ImageIcon,
  Library,
  Megaphone,
  PenLine,
  RefreshCw,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UserRoundCog,
  Wrench
} from 'lucide-react';
import { promptLibraryItems } from './data/promptLibrary';

const storageTypes = [
  { value: 'local', label: '本机目录' },
  { value: 'removable', label: '移动硬盘' },
  { value: 'nas', label: 'NAS' }
];

const imageModes = [
  { value: 'resize', label: '调整尺寸' },
  { value: 'compress', label: '压缩' },
  { value: 'clean-exif', label: '清理 EXIF' },
  { value: 'template', label: '模板渲染' }
];

const articleTypeOptions = [
  { value: 'customs_notice', label: '海关公告' },
  { value: 'industry_news', label: '行业资讯' },
  { value: 'peer_article', label: '同行文章' },
  { value: 'general', label: '普通文章' }
];

const articleLengthOptions = [
  { value: '中等文章', label: '中等文章' },
  { value: '深度长文', label: '深度长文' },
  { value: '短文', label: '短文' }
];

const socialPlatformFallbacks = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'wechat', label: '公众号' }
];

const mediaPlatformCards = [
  { value: 'xiaohongshu', label: '小红书', icon: '小', enabled: true },
  { value: 'wechat', label: '公众号', icon: '公', enabled: true },
  { value: 'douyin', label: '抖音', icon: '抖', enabled: false },
  { value: 'shipinhao', label: '视频号', icon: '视', enabled: false },
  { value: 'kuaishou', label: '快手', icon: '快', enabled: false },
  { value: 'bilibili', label: '哔哩哔哩', icon: 'B', enabled: false },
  { value: 'toutiao', label: '头条号', icon: '头', enabled: false },
  { value: 'baijiahao', label: '百家号', icon: '百', enabled: false },
  { value: 'zhihu', label: '知乎', icon: '知', enabled: false },
  { value: 'custom', label: '自定义平台', icon: '+', enabled: false }
];

const primaryNavItems = [];

const groupedNavItems = [
  {
    key: 'contentAssets',
    title: '内容与素材',
    shortTitle: '材',
    items: [
      { view: 'library', label: '素材库', shortLabel: '素', icon: 'L' },
      { view: 'image', label: '图片处理', shortLabel: '图', icon: 'I' },
      { view: 'video', label: '视频封面', shortLabel: '视', icon: 'V' },
      { view: 'sync', label: '任务同步', shortLabel: '同', icon: 'S' }
    ]
  },
  {
    key: 'socialManagement',
    title: '自媒体管理',
    shortTitle: '媒',
    items: [
      { view: 'socialAccounts', label: '账号管理', shortLabel: '账', icon: 'A' },
      { view: 'socialWorks', label: '作品管理', shortLabel: '作', icon: 'O' },
      { view: 'localWorks', label: '本地作品管理', shortLabel: '本', icon: 'B' },
      { view: 'oneClickPublish', label: '一键发布', shortLabel: '发', icon: 'P' }
    ]
  },
  {
    key: 'toolkit',
    title: '工具集',
    shortTitle: '工',
    items: [
      { view: 'removeAiMark', label: '去AI标识', shortLabel: 'AI', icon: 'AI' },
      { view: 'imageDuplicate', label: '图片复制', shortLabel: '复', icon: 'C' },
      { view: 'wechatMarkdown', label: '公众号转MD', shortLabel: 'MD', icon: 'M' },
      { view: 'articleRewrite', label: '文章重写', shortLabel: '文', icon: 'W' }
    ]
  },
  {
    key: 'baseConfig',
    title: '基础配置',
    shortTitle: '配',
    items: [
      { view: 'aiModelConfig', label: 'AI模型配置', shortLabel: '模', icon: 'G' },
      { view: 'aiParamLibrary', label: 'AI提示词库', shortLabel: '词', icon: 'P' }
    ]
  }
];

function providerLabel(providers, value) {
  return providers.find((provider) => provider.value === value)?.label || value;
}

function cleanRemoteError(error) {
  return String(error?.message || error || '').replace(/^Error invoking remote method '[^']+':\s*/, '');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

const navIconByView = {
  library: Library,
  image: ImageIcon,
  video: Clapperboard,
  sync: RefreshCw,
  socialAccounts: UserRoundCog,
  socialWorks: GalleryVerticalEnd,
  localWorks: FolderOpen,
  oneClickPublish: Send,
  removeAiMark: Sparkles,
  imageDuplicate: Copy,
  wechatMarkdown: FileText,
  articleRewrite: PenLine,
  aiModelConfig: Bot,
  aiParamLibrary: SlidersHorizontal
};

const navIconByGroup = {
  contentAssets: FolderOpen,
  socialManagement: Megaphone,
  toolkit: Wrench,
  baseConfig: Settings
};

function NavIcon({ icon, view, groupKey }) {
  const Icon = view ? navIconByView[view] : navIconByGroup[groupKey];
  return (
    <span className="navIcon">
      {Icon ? <Icon size={17} strokeWidth={2.1} /> : icon}
    </span>
  );
}

function createDefaultAiToolOptions() {
  return {
    folderPath: '',
    includeJpg: true,
    includePng: true,
    selectedPaths: [],
    replaceOriginal: true,
    backupOriginal: true,
    outputDir: '',
    backupDir: '',
    watermark: {
      enabled: true,
      text: 'qtddp',
      color: 'rgb(80,80,80)',
      opacity: 0.45,
      fontSize: 54
    },
    jpegQuality: 95
  };
}

function createDefaultDuplicateOptions() {
  return {
    folderPath: '',
    qualityStart: 99,
    qualityEnd: 70,
    qualityStep: 1,
    widthStart: 5,
    widthEnd: 5,
    widthStep: 1,
    heightStart: 5,
    heightEnd: 5,
    heightStep: 1,
    brightnessStart: 0,
    brightnessEnd: 0.01,
    brightnessStep: 0.01,
    selectedPaths: [],
    watermark: {
      enabled: true,
      text: 'qtddp',
      color: 'rgb(80,80,80)',
      opacity: 0.45,
      fontSize: 54
    }
  };
}

function App() {
  const socialBrowserRef = useRef(null);
  const [appStatus, setAppStatus] = useState(null);
  const [activeView, setActiveView] = useState('library');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navGroupExpanded, setNavGroupExpanded] = useState(() => (
    Object.fromEntries(groupedNavItems.map((group) => [group.key, true]))
  ));
  const [storages, setStorages] = useState([]);
  const [selectedStorageId, setSelectedStorageId] = useState('');
  const [files, setFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'local', basePath: '' });
  const [imageOptions, setImageOptions] = useState({
    mode: 'resize',
    width: 1200,
    height: 1200,
    quality: 82,
    format: 'jpg',
    outputDir: ''
  });
  const [videoOptions, setVideoOptions] = useState({
    width: 1280,
    height: 720,
    timestamp: '00:00:01',
    mode: 'blur-background',
    outputDir: ''
  });
  const [syncOptions, setSyncOptions] = useState({ baseUrl: 'http://127.0.0.1:3000/api', token: '' });
  const [aiToolOptions, setAiToolOptions] = useState(createDefaultAiToolOptions);
  const [aiToolFiles, setAiToolFiles] = useState([]);
  const [aiToolProgress, setAiToolProgress] = useState(null);
  const [duplicateOptions, setDuplicateOptions] = useState(createDefaultDuplicateOptions);
  const [duplicateFiles, setDuplicateFiles] = useState([]);
  const [duplicateProgress, setDuplicateProgress] = useState(null);
  const [wechatOptions, setWechatOptions] = useState({
    url: '',
    outputDir: '',
    imageMode: 'save'
  });
  const [wechatResult, setWechatResult] = useState(null);
  const [articleOptions, setArticleOptions] = useState({
    inputText: '',
    sourceFile: '',
    sourceTitle: '',
    outputDir: '',
    articleType: 'customs_notice',
    targetTopic: '',
    targetAudience: '外贸企业、跨境电商、货代、报关行和企业经营者',
    style: '专业、通俗、适合公众号发布',
    length: '深度长文',
    instructions: '不要照抄原文，结合海关监管、外贸合规和企业应对建议进行深度重写。',
    modelId: '',
    temperature: 0.6,
    maxTokens: 4096
  });
  const [articleResult, setArticleResult] = useState(null);
  const [socialPlatforms, setSocialPlatforms] = useState(socialPlatformFallbacks);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [selectedSocialAccountId, setSelectedSocialAccountId] = useState('');
  const [socialBrowserState, setSocialBrowserState] = useState({ url: '', title: '', canGoBack: false, canGoForward: false });
  const [cookieText, setCookieText] = useState('');
  const [addAccountModal, setAddAccountModal] = useState({
    open: false,
    platform: 'xiaohongshu',
    groupName: '默认分组',
    proxyMode: 'none',
    cookieText: '',
    showCookieInput: false
  });
  const [publishForm, setPublishForm] = useState({
    title: '',
    content: '',
    tags: '',
    mediaPaths: []
  });
  const [aiProviders, setAiProviders] = useState([]);
  const [aiStore, setAiStore] = useState({ models: [], defaultTextModelId: '', defaultVisionModelId: '' });
  const [editingAiModel, setEditingAiModel] = useState(null);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [promptFilters, setPromptFilters] = useState({ category: 'all', tag: 'all' });
  const [promptPage, setPromptPage] = useState(1);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [localWorksPath, setLocalWorksPath] = useState(() => localStorage.getItem('mediapolotx.localWorksPath') || '');
  const [localWorksList, setLocalWorksList] = useState([]);
  const [localWorksImportPath, setLocalWorksImportPath] = useState('');
  const [localWorksMode, setLocalWorksMode] = useState('imported');
  const [localWorkTagFilter, setLocalWorkTagFilter] = useState('all');
  const [localWorkTagEditor, setLocalWorkTagEditor] = useState(null);
  const [workPathModalOpen, setWorkPathModalOpen] = useState(false);
  const [workPathDraft, setWorkPathDraft] = useState('');
  const [selectedLocalWork, setSelectedLocalWork] = useState(null);
  const [selectedChildWork, setSelectedChildWork] = useState(null);
  const [selectedMainWork, setSelectedMainWork] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedStorage = useMemo(
    () => storages.find((storage) => storage.id === selectedStorageId),
    [storages, selectedStorageId]
  );

  const selectedFiles = useMemo(
    () => files.filter((file) => selectedFileIds.includes(file.id)),
    [files, selectedFileIds]
  );

  const selectedImages = selectedFiles.filter((file) => file.fileType === 'image');
  const selectedVideos = selectedFiles.filter((file) => file.fileType === 'video');
  const selectedSocialAccount = useMemo(
    () => socialAccounts.find((account) => account.id === selectedSocialAccountId) || null,
    [socialAccounts, selectedSocialAccountId]
  );
  const promptCategories = useMemo(
    () => Array.from(new Set(promptLibraryItems.map((item) => item.category))),
    []
  );
  const promptTags = useMemo(
    () => Array.from(new Set(promptLibraryItems.flatMap((item) => item.tags))),
    []
  );
  const filteredPrompts = useMemo(() => promptLibraryItems.filter((item) => {
    const categoryMatched = promptFilters.category === 'all' || item.category === promptFilters.category;
    const tagMatched = promptFilters.tag === 'all' || item.tags.includes(promptFilters.tag);
    return categoryMatched && tagMatched;
  }), [promptFilters]);
  const promptPageSize = 6;
  const promptPageCount = Math.max(1, Math.ceil(filteredPrompts.length / promptPageSize));
  const pagedPrompts = useMemo(() => {
    const normalizedPage = Math.min(promptPage, promptPageCount);
    const start = (normalizedPage - 1) * promptPageSize;
    return filteredPrompts.slice(start, start + promptPageSize);
  }, [filteredPrompts, promptPage, promptPageCount]);
  const localWorkTags = useMemo(
    () => Array.from(new Set(localWorksList.flatMap((work) => work.tags || []))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [localWorksList]
  );
  const filteredLocalWorks = useMemo(() => (
    localWorkTagFilter === 'all'
      ? localWorksList
      : localWorksList.filter((work) => (work.tags || []).includes(localWorkTagFilter))
  ), [localWorkTagFilter, localWorksList]);

  useEffect(() => {
    if (localWorkTagFilter !== 'all' && !localWorkTags.includes(localWorkTagFilter)) {
      setLocalWorkTagFilter('all');
    }
  }, [localWorkTagFilter, localWorkTags]);

  const loadFiles = useCallback(async (storageId = selectedStorageId) => {
    if (!storageId) return;
    const list = await window.mediapolotx.scanner.listFiles({ storageId, limit: 500 });
    setFiles(list);
    setSelectedFileIds((current) => current.filter((id) => list.some((file) => file.id === id)));
  }, [selectedStorageId]);

  const refreshStorages = useCallback(async () => {
    const list = await window.mediapolotx.storage.list();
    setStorages(list);
    if (!selectedStorageId && list[0]) {
      setSelectedStorageId(list[0].id);
      loadFiles(list[0].id);
    }
  }, [loadFiles, selectedStorageId]);

  const refreshTasks = useCallback(async () => {
    const list = await window.mediapolotx.tasks.list({ limit: 50 });
    setTasks(list);
  }, []);

  const refreshSocialAccounts = useCallback(async () => {
    const list = await window.mediapolotx.social.listAccounts();
    setSocialAccounts(list);
    setSelectedSocialAccountId((current) => current || list[0]?.id || '');
  }, []);

  const loadAiStore = useCallback(async () => {
    const store = await window.mediapolotx.aiConfig.get();
    setAiStore(store);
    setEditingAiModel((current) => {
      if (current?.id) {
        return store.models.find((model) => model.id === current.id) || current;
      }
      return store.models[0] || null;
    });
  }, []);

  const loadImportedLocalWorks = useCallback(async () => {
    const works = await window.mediapolotx.localWorks.listImported();
    setLocalWorksList(works);
    setLocalWorksMode('imported');
  }, []);

  const getSocialBrowserBounds = useCallback(() => {
    const rect = socialBrowserRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  }, []);

  useEffect(() => {
    window.mediapolotx.getStatus().then(setAppStatus);
    window.mediapolotx.aiConfig.providers().then(setAiProviders);
    window.mediapolotx.social.platforms().then(setSocialPlatforms).catch(() => setSocialPlatforms(socialPlatformFallbacks));
    loadAiStore();
    window.mediapolotx.settings.getAll().then((settings) => {
      if (settings.syncOptions) setSyncOptions(settings.syncOptions);
      if (settings.imageOptions) setImageOptions((current) => ({ ...current, ...settings.imageOptions }));
      if (settings.videoOptions) setVideoOptions((current) => ({ ...current, ...settings.videoOptions }));
      if (settings.aiToolOptions) setAiToolOptions((current) => ({ ...current, ...settings.aiToolOptions }));
      if (settings.duplicateOptions) setDuplicateOptions((current) => ({ ...current, ...settings.duplicateOptions }));
      if (settings.wechatOptions) setWechatOptions((current) => ({ ...current, ...settings.wechatOptions }));
      if (settings.articleOptions) setArticleOptions((current) => ({ ...current, ...settings.articleOptions }));
    });
    refreshStorages();
    refreshTasks();
    refreshSocialAccounts();
    loadImportedLocalWorks();

    const off = window.mediapolotx.scanner.onEvent((event) => {
      setMessage(`监听事件：${event.type}`);
      if (event.storageId === selectedStorageId) {
        loadFiles(event.storageId);
      }
    });
    const offAiProgress = window.mediapolotx.tools.onAiMarkProgress((progress) => {
      setAiToolProgress(progress);
    });
    const offDuplicateProgress = window.mediapolotx.tools.onImageDuplicateProgress((progress) => {
      setDuplicateProgress(progress);
    });
    return () => {
      off();
      offAiProgress();
      offDuplicateProgress();
    };
  }, [loadAiStore, loadFiles, loadImportedLocalWorks, refreshSocialAccounts, refreshStorages, refreshTasks, selectedStorageId]);

  useEffect(() => {
    if (!['socialAccounts', 'socialWorks', 'oneClickPublish'].includes(activeView)) {
      window.mediapolotx.social.hideBrowser();
    }
  }, [activeView]);

  useEffect(() => {
    setPromptPage((current) => Math.min(current, promptPageCount));
  }, [promptPageCount]);

  useEffect(() => {
    function syncBounds() {
      const bounds = getSocialBrowserBounds();
      if (bounds && ['socialAccounts', 'socialWorks', 'oneClickPublish'].includes(activeView)) {
        window.mediapolotx.social.setBounds(bounds);
      }
    }
    syncBounds();
    window.addEventListener('resize', syncBounds);
    return () => window.removeEventListener('resize', syncBounds);
  }, [activeView, getSocialBrowserBounds, selectedSocialAccountId]);

  async function selectDirectory(setter) {
    const basePath = await window.mediapolotx.selectDirectory();
    if (basePath) setter(basePath);
  }

  async function selectSocialMediaFiles() {
    const mediaPaths = await window.mediapolotx.selectMediaFiles();
    if (mediaPaths.length) setPublishForm((current) => ({ ...current, mediaPaths }));
  }

  async function addSocialAccountByLogin() {
    setBusy(true);
    setMessage('请在弹出的登录窗口中完成登录，系统会自动识别账号...');
    try {
      const account = await window.mediapolotx.social.startLoginAccount({
        platform: addAccountModal.platform,
        groupName: addAccountModal.groupName,
        proxyMode: addAccountModal.proxyMode
      });
      await refreshSocialAccounts();
      setSelectedSocialAccountId(account.id);
      setAddAccountModal((current) => ({ ...current, open: false, showCookieInput: false, cookieText: '' }));
      setMessage(`账号已添加：${account.nickname}`);
      await openSocialAccount(account);
    } catch (error) {
      setMessage(`添加账号失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addSocialAccountByCookie() {
    if (!addAccountModal.cookieText.trim()) return;
    setBusy(true);
    try {
      const platform = socialPlatforms.find((item) => item.value === addAccountModal.platform);
      const account = await window.mediapolotx.social.saveAccount({
        platform: addAccountModal.platform,
        nickname: `${platform?.label || '媒体'}账号`,
        groupName: addAccountModal.groupName,
        status: 'unknown'
      });
      await window.mediapolotx.social.importCookies({
        accountId: account.id,
        cookies: addAccountModal.cookieText
      });
      await refreshSocialAccounts();
      setSelectedSocialAccountId(account.id);
      setAddAccountModal((current) => ({ ...current, open: false, showCookieInput: false, cookieText: '' }));
      setMessage(`Cookie 已导入：${account.nickname}`);
      await openSocialAccount(account);
    } catch (error) {
      setMessage(`Cookie 添加失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSocialAccount(accountId) {
    if (!accountId) return;
    setBusy(true);
    try {
      const list = await window.mediapolotx.social.deleteAccount(accountId);
      setSocialAccounts(list);
      setSelectedSocialAccountId(list[0]?.id || '');
      setMessage('账号已删除');
    } catch (error) {
      setMessage(`删除账号失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openSocialAccount(account = selectedSocialAccount, target = 'homeUrl') {
    if (!account) return;
    const bounds = getSocialBrowserBounds();
    if (!bounds) return;
    const state = target === 'homeUrl'
      ? await window.mediapolotx.social.openAccount({ accountId: account.id, bounds })
      : await window.mediapolotx.social.navigate({ accountId: account.id, target, bounds });
    setSelectedSocialAccountId(account.id);
    setSocialBrowserState(state);
  }

  async function socialBrowserCommand(command) {
    if (!selectedSocialAccount) return;
    const state = await window.mediapolotx.social.browserCommand({ accountId: selectedSocialAccount.id, command });
    setSocialBrowserState(state);
  }

  async function exportSocialCookies() {
    if (!selectedSocialAccount) return;
    const cookies = await window.mediapolotx.social.exportCookies(selectedSocialAccount.id);
    setCookieText(JSON.stringify(cookies, null, 2));
    setMessage(`已导出 ${cookies.length} 条 Cookie`);
  }

  async function importSocialCookies() {
    if (!selectedSocialAccount || !cookieText.trim()) return;
    try {
      const result = await window.mediapolotx.social.importCookies({
        accountId: selectedSocialAccount.id,
        cookies: cookieText
      });
      setMessage(`已导入 ${result.count} 条 Cookie`);
      await openSocialAccount(selectedSocialAccount);
    } catch (error) {
      setMessage(`Cookie 导入失败：${cleanRemoteError(error)}`);
    }
  }

  async function clearSocialCookies() {
    if (!selectedSocialAccount) return;
    await window.mediapolotx.social.clearCookies(selectedSocialAccount.id);
    setCookieText('');
    setMessage('Cookie/session 已清理');
    await openSocialAccount(selectedSocialAccount);
  }

  async function openPublishPageAndFill() {
    if (!selectedSocialAccount) return;
    await openSocialAccount(selectedSocialAccount, 'publishUrl');
    const result = await window.mediapolotx.social.fillPublishForm({
      accountId: selectedSocialAccount.id,
      form: publishForm
    });
    setMessage(`已尝试填充：标题 ${result.titleFilled ? '成功' : '未匹配'}，正文 ${result.contentFilled ? '成功' : '未匹配'}，标签 ${result.tagsFilled ? '成功' : '未匹配'}。请人工确认后发布。`);
  }

  async function addStorage(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const storage = await window.mediapolotx.storage.add(form);
      setForm({ name: '', type: 'local', basePath: '' });
      await refreshStorages();
      setSelectedStorageId(storage.id);
      setMessage('素材库已添加');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function scanSelectedStorage() {
    if (!selectedStorage) return;
    setBusy(true);
    setMessage('扫描中...');
    try {
      const indexed = await window.mediapolotx.scanner.scanStorage(selectedStorage);
      await loadFiles(selectedStorage.id);
      setMessage(`扫描完成，索引 ${indexed.length} 个文件`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function watchSelectedStorage() {
    if (!selectedStorage) return;
    await window.mediapolotx.scanner.watchStorage(selectedStorage);
    setMessage('文件夹监听已启动');
  }

  async function checkOnline(storage) {
    await window.mediapolotx.storage.checkOnline(storage.id);
    await refreshStorages();
  }

  async function runImageBatch() {
    if (selectedImages.length === 0 || !imageOptions.outputDir) return;
    await window.mediapolotx.settings.set({ key: 'imageOptions', value: imageOptions });
    await runTask(() => window.mediapolotx.tasks.imageBatch({
      files: selectedImages,
      options: {
        ...imageOptions,
        width: Number(imageOptions.width),
        height: Number(imageOptions.height),
        quality: Number(imageOptions.quality),
        template: {
          width: Number(imageOptions.width),
          height: Number(imageOptions.height),
          padding: 48
        }
      }
    }));
  }

  async function runVideoCoverBatch() {
    if (selectedVideos.length === 0 || !videoOptions.outputDir) return;
    await window.mediapolotx.settings.set({ key: 'videoOptions', value: videoOptions });
    await runTask(() => window.mediapolotx.tasks.videoCoverBatch({
      files: selectedVideos,
      options: {
        ...videoOptions,
        width: Number(videoOptions.width),
        height: Number(videoOptions.height)
      }
    }));
  }

  async function runThumbnailBatch() {
    if (selectedImages.length === 0 || !imageOptions.outputDir) return;
    await window.mediapolotx.settings.set({ key: 'imageOptions', value: imageOptions });
    await runTask(() => window.mediapolotx.tasks.thumbnailBatch({
      files: selectedImages,
      outputDir: imageOptions.outputDir,
      options: { width: 512, height: 512, quality: 78 }
    }));
  }

  async function fetchWebQueue() {
    setBusy(true);
    setMessage('正在获取 Web 任务队列...');
    try {
      await window.mediapolotx.settings.set({ key: 'syncOptions', value: syncOptions });
      const result = await window.mediapolotx.sync.fetchQueue(syncOptions);
      await refreshTasks();
      setMessage(`Web 队列获取成功：收到 ${result.stored.received} 条，新增 ${result.stored.inserted} 条`);
    } catch (error) {
      setMessage(`同步失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadCurrentIndex() {
    if (!selectedStorage) return;
    setBusy(true);
    setMessage('正在上传当前素材索引...');
    try {
      await window.mediapolotx.settings.set({ key: 'syncOptions', value: syncOptions });
      await window.mediapolotx.sync.uploadIndex({ ...syncOptions, storageId: selectedStorage.id });
      setMessage('当前素材索引已上传');
    } catch (error) {
      setMessage(`索引上传失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadThumbnails() {
    if (!selectedStorage) return;
    setBusy(true);
    setMessage('正在上传已生成缩略图...');
    try {
      await window.mediapolotx.settings.set({ key: 'syncOptions', value: syncOptions });
      const result = await window.mediapolotx.sync.uploadThumbnails({ ...syncOptions, storageId: selectedStorage.id });
      setMessage(`缩略图上传完成：${result.count} 个`);
    } catch (error) {
      setMessage(`缩略图上传失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function scanAiToolFolder(nextOptions = aiToolOptions) {
    if (!nextOptions.folderPath) return;
    setBusy(true);
    setMessage('正在递归扫描 JPG/PNG 文件...');
    try {
      await window.mediapolotx.settings.set({ key: 'aiToolOptions', value: nextOptions });
      const list = await window.mediapolotx.tools.scanAiMarks({
        folderPath: nextOptions.folderPath,
        options: nextOptions
      });
      setAiToolFiles(list);
      setAiToolOptions((current) => ({
        ...current,
        selectedPaths: list.map((file) => file.absolutePath),
        outputDir: current.outputDir || `${nextOptions.folderPath}\\_mediapolotx_no_ai`,
        backupDir: current.backupDir || getSiblingBackupDir(nextOptions.folderPath)
      }));
      setMessage(`扫描完成：${list.length} 个文件`);
    } catch (error) {
      setMessage(`扫描失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function processAiToolFiles() {
    if (!aiToolOptions.folderPath || aiToolOptions.selectedPaths.length === 0) return;
    setBusy(true);
    setAiToolProgress({ phase: 'start', total: aiToolOptions.selectedPaths.length, completed: 0, percent: 0 });
    setMessage('正在去除 AI 标识并处理图片...');
    try {
      await window.mediapolotx.settings.set({ key: 'aiToolOptions', value: aiToolOptions });
      const result = await window.mediapolotx.tools.removeAiMarks({
        folderPath: aiToolOptions.folderPath,
        options: {
          ...aiToolOptions,
          files: aiToolFiles,
          selectedPaths: aiToolOptions.selectedPaths,
          jpegQuality: Number(aiToolOptions.jpegQuality),
          watermark: {
            ...aiToolOptions.watermark,
            opacity: Number(aiToolOptions.watermark.opacity),
            fontSize: Number(aiToolOptions.watermark.fontSize)
          }
        }
      });
      setAiToolProgress({ phase: 'completed', total: result.count, completed: result.count, percent: 100 });
      const remaining = result.files.filter((file) => file.stillHasAiMarkers).length;
      const rescanned = await window.mediapolotx.tools.scanAiMarks({
        folderPath: aiToolOptions.folderPath,
        options: aiToolOptions
      });
      setAiToolFiles(rescanned);
      setAiToolOptions((current) => ({
        ...current,
        selectedPaths: rescanned.map((file) => file.absolutePath)
      }));
      setMessage(`处理完成：${result.count} 个文件，处理后仍疑似 ${remaining} 个`);
      await openPath(result.outputDir);
    } catch (error) {
      setMessage(`处理失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleAiToolFile(filePath) {
    setAiToolOptions((current) => ({
      ...current,
      selectedPaths: current.selectedPaths.includes(filePath)
        ? current.selectedPaths.filter((item) => item !== filePath)
        : [...current.selectedPaths, filePath]
    }));
  }

  async function scanDuplicateFolder(nextOptions = duplicateOptions) {
    if (!nextOptions.folderPath) return;
    setBusy(true);
    setMessage('正在扫描可复制图片...');
    try {
      await window.mediapolotx.settings.set({ key: 'duplicateOptions', value: nextOptions });
      const list = await window.mediapolotx.tools.scanImageDuplicate({ folderPath: nextOptions.folderPath });
      setDuplicateFiles(list);
      setDuplicateOptions((current) => ({
        ...current,
        selectedPaths: list.map((file) => file.absolutePath)
      }));
      setMessage(`扫描完成：${list.length} 个文件`);
    } catch (error) {
      setMessage(`扫描失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runImageDuplicate() {
    if (!duplicateOptions.folderPath || duplicateOptions.selectedPaths.length === 0) return;
    setBusy(true);
    setDuplicateProgress({ phase: 'start', total: 0, completed: 0, percent: 0 });
    setMessage('正在生成图片副本...');
    try {
      await window.mediapolotx.settings.set({ key: 'duplicateOptions', value: duplicateOptions });
      const result = await window.mediapolotx.tools.duplicateImages({
        folderPath: duplicateOptions.folderPath,
        options: {
          ...duplicateOptions,
          qualities: buildQualityRange(duplicateOptions),
          sizes: buildSizeRange(duplicateOptions),
          brightnessValues: buildBrightnessRange(duplicateOptions),
          files: duplicateFiles,
          selectedPaths: duplicateOptions.selectedPaths,
          watermark: {
            ...duplicateOptions.watermark,
            opacity: Number(duplicateOptions.watermark.opacity),
            fontSize: Number(duplicateOptions.watermark.fontSize)
          }
        }
      });
      setDuplicateProgress({ phase: 'completed', total: result.totalOutputs, completed: result.totalOutputs, percent: 100 });
      setMessage(`生成完成：${result.totalCombinations} 套，共 ${result.totalOutputs} 张`);
      await openPath(result.outputRoot);
    } catch (error) {
      setMessage(`生成失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleDuplicateFile(filePath) {
    setDuplicateOptions((current) => ({
      ...current,
      selectedPaths: current.selectedPaths.includes(filePath)
        ? current.selectedPaths.filter((item) => item !== filePath)
        : [...current.selectedPaths, filePath]
    }));
  }

  async function downloadWechatArticle() {
    if (!wechatOptions.url || !wechatOptions.outputDir) return;
    setBusy(true);
    setMessage('正在下载公众号文章并转换 Markdown...');
    try {
      await window.mediapolotx.settings.set({ key: 'wechatOptions', value: wechatOptions });
      const result = await window.mediapolotx.tools.downloadWechatArticle({
        url: wechatOptions.url,
        options: {
          outputDir: wechatOptions.outputDir,
          imageMode: wechatOptions.imageMode
        }
      });
      setWechatResult(result);
      setMessage(`转换完成：${result.title || result.mdPath}`);
      await openPath(wechatOptions.outputDir);
    } catch (error) {
      setMessage(`转换失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function importArticleMarkdown() {
    const filePath = await window.mediapolotx.selectMarkdownFile();
    if (!filePath) return;
    setBusy(true);
    setMessage('正在读取 Markdown 文件...');
    try {
      const file = await window.mediapolotx.content.readMarkdownFile(filePath);
      setArticleOptions((current) => ({
        ...current,
        inputText: file.content,
        sourceFile: file.filePath,
        sourceTitle: current.sourceTitle || file.filename.replace(/\.[^.]+$/, '')
      }));
      setMessage('Markdown 文件已导入');
    } catch (error) {
      setMessage(`导入失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function rewriteArticle() {
    if (!articleOptions.inputText.trim() || !articleOptions.outputDir) return;
    setBusy(true);
    setArticleResult(null);
    setMessage('正在调用 AI 生成重写文章...');
    try {
      await window.mediapolotx.settings.set({
        key: 'articleOptions',
        value: {
          ...articleOptions,
          inputText: '',
          sourceFile: ''
        }
      });
      const result = await window.mediapolotx.content.rewriteArticle(articleOptions);
      setArticleResult(result);
      setMessage(`文章生成完成：${result.title}`);
      await openPath(articleOptions.outputDir);
    } catch (error) {
      setMessage(`生成失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function addAiModel(provider = 'qwen') {
    const template = await window.mediapolotx.aiConfig.template(provider);
    setEditingAiModel({
      ...template,
      name: template.name || '新模型'
    });
    setAiTestResult(null);
  }

  async function saveAiModel() {
    if (!editingAiModel) return;
    setBusy(true);
    setMessage('正在保存 AI 模型配置...');
    try {
      const saved = await window.mediapolotx.aiConfig.saveModel(editingAiModel);
      const store = await window.mediapolotx.aiConfig.get();
      setAiStore(store);
      setEditingAiModel(store.models.find((model) => model.id === saved.id) || saved);
      setMessage('AI 模型配置已保存');
    } catch (error) {
      setMessage(`保存失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAiModel(modelId) {
    if (!modelId) return;
    setBusy(true);
    setMessage('正在删除 AI 模型配置...');
    try {
      const store = await window.mediapolotx.aiConfig.deleteModel(modelId);
      setAiStore(store);
      setEditingAiModel(store.models[0] || null);
      setAiTestResult(null);
      setMessage('AI 模型配置已删除');
    } catch (error) {
      setMessage(`删除失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function setDefaultAiModel(kind, modelId) {
    if (!modelId) return;
    setBusy(true);
    try {
      const store = await window.mediapolotx.aiConfig.setDefault({ kind, modelId });
      setAiStore(store);
      setMessage(kind === 'vision' ? '默认视觉模型已更新' : '默认文本模型已更新');
    } catch (error) {
      setMessage(`设置失败：${cleanRemoteError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function testAiModel() {
    if (!editingAiModel) return;
    setBusy(true);
    setAiTestResult(null);
    setMessage('正在测试 AI 模型连接...');
    try {
      const result = await window.mediapolotx.aiConfig.testModel(editingAiModel);
      setAiTestResult(result);
      setMessage(result.message);
    } catch (error) {
      const errorMessage = cleanRemoteError(error);
      const result = { ok: false, message: errorMessage };
      setAiTestResult(result);
      setMessage(`测试失败：${errorMessage}`);
    } finally {
      setBusy(false);
    }
  }

  async function applyAiProvider(providerValue) {
    const template = await window.mediapolotx.aiConfig.template(providerValue);
    setEditingAiModel((current) => ({
      ...current,
      provider: providerValue,
      baseUrl: template.baseUrl,
      resourceId: template.resourceId || '',
      model: template.model,
      name: current?.name || template.name,
      type: current?.type || template.type,
      temperature: current?.temperature ?? template.temperature,
      maxTokens: current?.maxTokens ?? template.maxTokens
    }));
    setAiTestResult(null);
  }

  async function openPath(targetPath) {
    const result = await window.mediapolotx.openPath(targetPath);
    if (!result.opened) setMessage(result.errorMessage || '无法打开路径');
  }

  async function refreshView(view) {
    try {
      if (view === 'library') {
        await refreshStorages();
        if (selectedStorageId) await loadFiles(selectedStorageId);
        return;
      }
      if (['image', 'video'].includes(view)) {
        if (selectedStorageId) await loadFiles(selectedStorageId);
        return;
      }
      if (view === 'sync') {
        await refreshTasks();
        return;
      }
      if (view === 'socialAccounts') {
        await refreshSocialAccounts();
        return;
      }
      if (['socialWorks', 'oneClickPublish'].includes(view)) {
        if (selectedSocialAccountId) await socialBrowserCommand('reload');
        return;
      }
      if (view === 'localWorks') {
        await loadImportedLocalWorks();
        return;
      }
      if (view === 'removeAiMark') {
        setAiToolOptions(createDefaultAiToolOptions());
        setAiToolFiles([]);
        setAiToolProgress(null);
        setMessage('已清空去AI标识页面，请重新选择处理文件夹');
        return;
      }
      if (view === 'imageDuplicate') {
        setDuplicateOptions(createDefaultDuplicateOptions());
        setDuplicateFiles([]);
        setDuplicateProgress(null);
        setMessage('已清空图片复制页面，请重新选择源目录');
        return;
      }
      if (view === 'aiModelConfig') {
        await loadAiStore();
      }
    } catch (error) {
      setMessage(`刷新失败：${error.message}`);
    }
  }

  function handleNavClick(view) {
    setActiveView(view);
    refreshView(view);
  }

  function openWorkPathModal() {
    setWorkPathDraft(localWorksPath);
    setWorkPathModalOpen(true);
  }

  async function chooseLocalWorksPath() {
    const folderPath = await window.mediapolotx.selectDirectory();
    if (folderPath) setWorkPathDraft(folderPath);
  }

  function saveLocalWorksPath() {
    const nextPath = workPathDraft.trim();
    setLocalWorksPath(nextPath);
    localStorage.setItem('mediapolotx.localWorksPath', nextPath);
    setWorkPathModalOpen(false);
    setMessage(nextPath ? '作品路径已保存' : '作品路径已清空');
  }

  async function importLocalWorksDirectory() {
    const folderPath = await window.mediapolotx.selectDirectory();
    if (!folderPath) return;
    try {
      setBusy(true);
      setMessage('正在扫描导入目录...');
      const result = await window.mediapolotx.localWorks.scanImportDirectory(folderPath);
      setLocalWorksImportPath(result.rootPath);
      setLocalWorksList(result.works);
      setLocalWorksMode('scanned');
      setSelectedLocalWork(null);
      setSelectedChildWork(null);
      setSelectedMainWork(null);
      setMessage(`扫描完成：${result.works.length} 个主作品`);
    } catch (error) {
      setMessage(`扫描失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmImportLocalWorks() {
    if (!localWorksImportPath) {
      setMessage('请先选择目录导入并完成扫描');
      return;
    }
    if (!localWorksPath) {
      setMessage('请先设置作品路径');
      openWorkPathModal();
      return;
    }
    try {
      setBusy(true);
      setMessage('正在导入本地作品...');
      const result = await window.mediapolotx.localWorks.importScannedWorks({
        sourceRoot: localWorksImportPath,
        targetRoot: localWorksPath,
        works: localWorksList.map((work) => ({
          folderName: work.folderName,
          tags: work.tags || []
        }))
      });
      setLocalWorksList(result.works);
      setLocalWorksMode('imported');
      setSelectedLocalWork(null);
      setSelectedChildWork(null);
      setSelectedMainWork(null);
      setMessage(`导入完成：${result.importedCount} 个主作品`);
    } catch (error) {
      setMessage(`导入失败：${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function openLocalWorkTagEditor(work) {
    setLocalWorkTagEditor({
      workId: work.id,
      title: work.title,
      value: (work.tags || []).join('，')
    });
  }

  async function saveLocalWorkTags() {
    if (!localWorkTagEditor) return;
    const tags = parseTagInput(localWorkTagEditor.value);
    setLocalWorksList((current) => current.map((work) => (
      work.id === localWorkTagEditor.workId ? { ...work, tags } : work
    )));
    if (localWorksMode === 'imported') {
      const works = await window.mediapolotx.localWorks.updateTags({
        workId: localWorkTagEditor.workId,
        tags
      });
      setLocalWorksList(works);
    }
    setLocalWorkTagFilter((current) => (current !== 'all' && !tags.includes(current) ? 'all' : current));
    setLocalWorkTagEditor(null);
    setMessage('标签已保存');
  }

  async function runTask(taskRunner) {
    setBusy(true);
    setMessage('任务执行中...');
    try {
      const task = await taskRunner();
      await refreshTasks();
      if (selectedStorage) await loadFiles(selectedStorage.id);
      setMessage(task.status === 'completed' ? `任务完成：${task.result.count} 个文件` : `任务失败：${task.errorMessage}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleFile(fileId) {
    setSelectedFileIds((current) => (
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]
    ));
  }

  function selectAllVisible() {
    setSelectedFileIds(files.map((file) => file.id));
  }

  function clearSelection() {
    setSelectedFileIds([]);
  }

  return (
    <div className={`shell ${sidebarCollapsed ? 'sidebarCollapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div>
            <strong>{sidebarCollapsed ? 'MX' : 'MediapolotX'}</strong>
            {!sidebarCollapsed && <span>Desktop</span>}
          </div>
          <button
            type="button"
            className="sidebarToggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            title={sidebarCollapsed ? '展开菜单' : '收起菜单'}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>
        <nav>
          {groupedNavItems.map((group) => (
            <div className="navGroup" key={group.title}>
              <button
                type="button"
                className="navGroupTitle"
                title={group.title}
                onClick={() => setNavGroupExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))}
              >
                <span className="navGroupLabel">
                  <NavIcon groupKey={group.key} />
                  <span className="navGroupText">{sidebarCollapsed ? group.shortTitle : group.title}</span>
                </span>
                <em>{navGroupExpanded[group.key] ? '▾' : '▸'}</em>
              </button>
              {navGroupExpanded[group.key] && group.items.map((item) => (
                  <button
                    key={item.view}
                    className={`navItem subItem ${activeView === item.view ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.view)}
                  title={item.label}
                >
                  <NavIcon icon={item.icon} view={item.view} />
                  <span className="navText">{item.label}</span>
                </button>
                ))}
            </div>
          ))}
          {primaryNavItems.map((item) => (
            <button
              key={item.view}
              className={`navItem ${activeView === item.view ? 'active' : ''}`}
              onClick={() => handleNavClick(item.view)}
              title={item.label}
            >
              <NavIcon icon={item.icon} view={item.view} />
              <span className="navText">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="runtime">
          <span>{sidebarCollapsed ? `v${appStatus?.version || '-'}` : `版本 ${appStatus?.version || '-'}`}</span>
          {!sidebarCollapsed && <span>{appStatus?.userDataPath || ''}</span>}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(activeView)}</h1>
            <p>{viewSubtitle(activeView)}</p>
          </div>
          <div className="actions">
            {activeView === 'localWorks' ? (
              <>
                <button type="button" onClick={openWorkPathModal}>设置作品路径</button>
                <button type="button" onClick={importLocalWorksDirectory} disabled={busy}>选择目录导入</button>
                {localWorksMode === 'scanned' && localWorksList.length > 0 && (
                  <button type="button" onClick={confirmImportLocalWorks} disabled={busy}>确认导入</button>
                )}
              </>
            ) : (
              <>
                <button onClick={scanSelectedStorage} disabled={!selectedStorage || busy}>扫描</button>
                <button onClick={watchSelectedStorage} disabled={!selectedStorage}>监听</button>
              </>
            )}
          </div>
        </header>

        {activeView === 'library' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>添加素材库</h2>
              <form onSubmit={addStorage} className="form">
                <label>
                  名称
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="例如：产品图 NAS"
                    required
                  />
                </label>
                <label>
                  类型
                  <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                    {storageTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  路径
                  <div className="pathRow">
                    <input value={form.basePath} readOnly placeholder="选择本地或挂载路径" required />
                    <button
                      type="button"
                      onClick={() => selectDirectory((basePath) => setForm((current) => ({
                        ...current,
                        basePath,
                        name: current.name || lastPathSegment(basePath)
                      })))}
                    >
                      选择
                    </button>
                  </div>
                </label>
                <button type="submit" disabled={busy}>添加</button>
              </form>
            </div>

            <StorageList
              storages={storages}
              selectedStorageId={selectedStorageId}
              onSelect={(storage) => {
                setSelectedStorageId(storage.id);
                loadFiles(storage.id);
              }}
              onCheck={checkOnline}
            />
          </section>
        )}

        {activeView === 'image' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>图片批处理</h2>
              <div className="form">
                <label>
                  模式
                  <select value={imageOptions.mode} onChange={(event) => setImageOptions({ ...imageOptions, mode: event.target.value })}>
                    {imageModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label>
                <div className="splitInputs">
                  <label>
                    宽度
                    <input type="number" min="1" value={imageOptions.width} onChange={(event) => setImageOptions({ ...imageOptions, width: event.target.value })} />
                  </label>
                  <label>
                    高度
                    <input type="number" min="1" value={imageOptions.height} onChange={(event) => setImageOptions({ ...imageOptions, height: event.target.value })} />
                  </label>
                </div>
                <div className="splitInputs">
                  <label>
                    质量
                    <input type="number" min="1" max="100" value={imageOptions.quality} onChange={(event) => setImageOptions({ ...imageOptions, quality: event.target.value })} />
                  </label>
                  <label>
                    格式
                    <select value={imageOptions.format} onChange={(event) => setImageOptions({ ...imageOptions, format: event.target.value })}>
                      <option value="jpg">JPG</option>
                      <option value="png">PNG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </label>
                </div>
                <DirectoryPicker
                  label="输出目录"
                  value={imageOptions.outputDir}
                  onPick={(outputDir) => setImageOptions({ ...imageOptions, outputDir })}
                  selectDirectory={selectDirectory}
                />
                <button onClick={runImageBatch} disabled={busy || selectedImages.length === 0 || !imageOptions.outputDir}>
                  处理 {selectedImages.length} 张图片
                </button>
                <button onClick={runThumbnailBatch} disabled={busy || selectedImages.length === 0 || !imageOptions.outputDir}>
                  生成缩略图
                </button>
              </div>
            </div>
            <SelectionSummary selectedImages={selectedImages} selectedVideos={selectedVideos} />
          </section>
        )}

        {activeView === 'video' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>视频封面生成</h2>
              <div className="form">
                <div className="splitInputs">
                  <label>
                    宽度
                    <input type="number" min="1" value={videoOptions.width} onChange={(event) => setVideoOptions({ ...videoOptions, width: event.target.value })} />
                  </label>
                  <label>
                    高度
                    <input type="number" min="1" value={videoOptions.height} onChange={(event) => setVideoOptions({ ...videoOptions, height: event.target.value })} />
                  </label>
                </div>
                <label>
                  截取时间
                  <input value={videoOptions.timestamp} onChange={(event) => setVideoOptions({ ...videoOptions, timestamp: event.target.value })} />
                </label>
                <label>
                  适配模式
                  <select value={videoOptions.mode} onChange={(event) => setVideoOptions({ ...videoOptions, mode: event.target.value })}>
                    <option value="blur-background">模糊背景</option>
                    <option value="crop">居中裁剪</option>
                  </select>
                </label>
                <DirectoryPicker
                  label="输出目录"
                  value={videoOptions.outputDir}
                  onPick={(outputDir) => setVideoOptions({ ...videoOptions, outputDir })}
                  selectDirectory={selectDirectory}
                />
                <button onClick={runVideoCoverBatch} disabled={busy || selectedVideos.length === 0 || !videoOptions.outputDir}>
                  生成 {selectedVideos.length} 个封面
                </button>
              </div>
            </div>
            <SelectionSummary selectedImages={selectedImages} selectedVideos={selectedVideos} />
          </section>
        )}

        {activeView === 'sync' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>Web 协同</h2>
              <div className="form">
                <label>
                  API 地址
                  <input value={syncOptions.baseUrl} onChange={(event) => setSyncOptions({ ...syncOptions, baseUrl: event.target.value })} />
                </label>
                <label>
                  Token
                  <input type="password" value={syncOptions.token} onChange={(event) => setSyncOptions({ ...syncOptions, token: event.target.value })} />
                </label>
                <button onClick={fetchWebQueue} disabled={busy}>获取任务队列</button>
                <button onClick={uploadCurrentIndex} disabled={busy || !selectedStorage}>上传当前索引</button>
                <button onClick={uploadThumbnails} disabled={busy || !selectedStorage}>上传缩略图</button>
              </div>
            </div>
            <TaskList tasks={tasks} onOpenPath={openPath} />
          </section>
        )}

        {activeView === 'socialAccounts' && (
          <section className="socialShell">
            <div className="panel socialAccountPanel">
              <div className="panelHeader">
                <h2>媒体账号</h2>
                <button type="button" onClick={() => setAddAccountModal((current) => ({ ...current, open: true }))}>+ 添加账号</button>
              </div>
              <SocialAccountList
                accounts={socialAccounts}
                platforms={socialPlatforms}
                selectedId={selectedSocialAccountId}
                onSelect={(account) => {
                  setSelectedSocialAccountId(account.id);
                  openSocialAccount(account);
                }}
                onDelete={deleteSocialAccount}
              />
            </div>
            <div className="panel socialBrowserPanel">
              <SocialBrowserToolbar
                account={selectedSocialAccount}
                state={socialBrowserState}
                onHome={() => openSocialAccount(selectedSocialAccount, 'homeUrl')}
                onPublish={() => openSocialAccount(selectedSocialAccount, 'publishUrl')}
                onWorks={() => openSocialAccount(selectedSocialAccount, 'worksUrl')}
                onData={() => openSocialAccount(selectedSocialAccount, 'dataUrl')}
                onBack={() => socialBrowserCommand('back')}
                onForward={() => socialBrowserCommand('forward')}
                onReload={() => socialBrowserCommand('reload')}
              />
              <div className="socialBrowserHost" ref={socialBrowserRef}>
                {!selectedSocialAccount && <div className="empty">请选择或添加账号</div>}
              </div>
              <div className="cookiePanel">
                <div className="actions actionWrap">
                  <button type="button" onClick={exportSocialCookies} disabled={!selectedSocialAccount}>导出 Cookie</button>
                  <button type="button" onClick={importSocialCookies} disabled={!selectedSocialAccount || !cookieText.trim()}>导入 Cookie</button>
                  <button type="button" className="dangerButton" onClick={clearSocialCookies} disabled={!selectedSocialAccount}>清理登录态</button>
                </div>
                <textarea value={cookieText} onChange={(event) => setCookieText(event.target.value)} placeholder="Cookie JSON，导出后可保存，导入时粘贴到这里" />
              </div>
            </div>
          </section>
        )}

        {activeView === 'socialWorks' && (
          <section className="contentGrid wideRight">
            <div className="panel">
              <h2>作品管理</h2>
              <div className="toolIntro">
                <p>选择账号后打开平台作品管理页。当前版本先承载真实后台页面，后续可继续接入作品列表抓取和数据同步。</p>
              </div>
              <div className="form">
                <label>
                  管理账号
                  <select value={selectedSocialAccountId} onChange={(event) => setSelectedSocialAccountId(event.target.value)}>
                    <option value="">请选择账号</option>
                    {socialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.nickname} / {platformLabel(socialPlatforms, account.platform)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => openSocialAccount(selectedSocialAccount, 'worksUrl')} disabled={!selectedSocialAccount}>打开作品管理</button>
              </div>
            </div>
            <div className="panel socialBrowserPanel">
              <SocialBrowserToolbar
                account={selectedSocialAccount}
                state={socialBrowserState}
                onHome={() => openSocialAccount(selectedSocialAccount, 'homeUrl')}
                onPublish={() => openSocialAccount(selectedSocialAccount, 'publishUrl')}
                onWorks={() => openSocialAccount(selectedSocialAccount, 'worksUrl')}
                onData={() => openSocialAccount(selectedSocialAccount, 'dataUrl')}
                onBack={() => socialBrowserCommand('back')}
                onForward={() => socialBrowserCommand('forward')}
                onReload={() => socialBrowserCommand('reload')}
              />
              <div className="socialBrowserHost" ref={socialBrowserRef}>
                {!selectedSocialAccount && <div className="empty">请选择账号后打开作品管理</div>}
              </div>
            </div>
          </section>
        )}

        {activeView === 'localWorks' && (
          <LocalWorksView
            works={filteredLocalWorks}
            worksPath={localWorksPath}
            importPath={localWorksImportPath}
            busy={busy}
            tagOptions={localWorkTags}
            tagFilter={localWorkTagFilter}
            onTagFilterChange={setLocalWorkTagFilter}
            onEditTags={openLocalWorkTagEditor}
            onOpenMainWork={setSelectedMainWork}
            onOpenPath={openPath}
            onOpenChildren={(work) => {
              setSelectedLocalWork(work);
              setSelectedChildWork(null);
            }}
          />
        )}

        {activeView === 'oneClickPublish' && (
          <section className="contentGrid wideRight">
            <div className="panel">
              <h2>一键发布辅助</h2>
              <div className="toolIntro">
                <p>选择账号后打开对应平台发布页，自动尝试填充标题、正文和标签；最终发布由你人工确认。</p>
              </div>
              <div className="form">
                <label>
                  发布账号
                  <select value={selectedSocialAccountId} onChange={(event) => setSelectedSocialAccountId(event.target.value)}>
                    <option value="">请选择账号</option>
                    {socialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.nickname} / {platformLabel(socialPlatforms, account.platform)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  标题
                  <input value={publishForm.title} onChange={(event) => setPublishForm({ ...publishForm, title: event.target.value })} />
                </label>
                <label>
                  正文
                  <textarea className="largeTextarea" value={publishForm.content} onChange={(event) => setPublishForm({ ...publishForm, content: event.target.value })} />
                </label>
                <label>
                  标签/话题
                  <input value={publishForm.tags} onChange={(event) => setPublishForm({ ...publishForm, tags: event.target.value })} placeholder="#外贸 #海关" />
                </label>
                <div className="actions actionWrap">
                  <button type="button" onClick={selectSocialMediaFiles}>选择图片/视频</button>
                  <button type="button" onClick={openPublishPageAndFill} disabled={!selectedSocialAccount || busy}>打开发布页并填充</button>
                </div>
                <div className="resultList">
                  <span><strong>已选素材</strong>{publishForm.mediaPaths.length ? publishForm.mediaPaths.join('\n') : '暂未选择。当前版本会打开发布页并填充文本，素材上传请在平台页面人工选择。'}</span>
                </div>
              </div>
            </div>
            <div className="panel socialBrowserPanel">
              <SocialBrowserToolbar
                account={selectedSocialAccount}
                state={socialBrowserState}
                onHome={() => openSocialAccount(selectedSocialAccount, 'homeUrl')}
                onPublish={() => openSocialAccount(selectedSocialAccount, 'publishUrl')}
                onWorks={() => openSocialAccount(selectedSocialAccount, 'worksUrl')}
                onData={() => openSocialAccount(selectedSocialAccount, 'dataUrl')}
                onBack={() => socialBrowserCommand('back')}
                onForward={() => socialBrowserCommand('forward')}
                onReload={() => socialBrowserCommand('reload')}
              />
              <div className="socialBrowserHost" ref={socialBrowserRef}>
                {!selectedSocialAccount && <div className="empty">请选择账号后打开发布页</div>}
              </div>
            </div>
          </section>
        )}

        {activeView === 'removeAiMark' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>去AI标识</h2>
              <div className="toolIntro">
                <p>递归扫描文件夹中的 JPG/PNG，检测并去除 C2PA、Content Credentials 等 AI 特征元数据。默认直接替换原文件，可选择替换前备份。</p>
              </div>
              <div className="form">
                <DirectoryPicker
                  label="处理文件夹"
                  value={aiToolOptions.folderPath}
                  onPick={(folderPath) => {
                    const nextOptions = {
                      ...aiToolOptions,
                      folderPath,
                      outputDir: `${folderPath}\\_mediapolotx_no_ai`,
                      backupDir: getSiblingBackupDir(folderPath)
                    };
                    setAiToolOptions(nextOptions);
                    scanAiToolFolder(nextOptions);
                  }}
                  selectDirectory={selectDirectory}
                />
                <div className="checkRow">
                  <label><input type="checkbox" checked={aiToolOptions.includeJpg} onChange={(event) => setAiToolOptions({ ...aiToolOptions, includeJpg: event.target.checked })} /> JPG</label>
                  <label><input type="checkbox" checked={aiToolOptions.includePng} onChange={(event) => setAiToolOptions({ ...aiToolOptions, includePng: event.target.checked })} /> PNG</label>
                </div>
                <button onClick={() => scanAiToolFolder()} disabled={busy || !aiToolOptions.folderPath}>重新扫描</button>
                <div className="watermarkBox">
                  <label><input type="checkbox" checked={aiToolOptions.replaceOriginal} onChange={(event) => setAiToolOptions({ ...aiToolOptions, replaceOriginal: event.target.checked })} /> 直接替换原文件</label>
                  <label><input type="checkbox" checked={aiToolOptions.backupOriginal} onChange={(event) => setAiToolOptions({ ...aiToolOptions, backupOriginal: event.target.checked })} /> 替换前备份原文件</label>
                  {aiToolOptions.backupOriginal && (
                    <label>
                      备份目录
                      <input value={aiToolOptions.backupDir} onChange={(event) => setAiToolOptions({ ...aiToolOptions, backupDir: event.target.value })} />
                    </label>
                  )}
                  {!aiToolOptions.replaceOriginal && (
                    <label>
                      输出目录
                      <input value={aiToolOptions.outputDir} onChange={(event) => setAiToolOptions({ ...aiToolOptions, outputDir: event.target.value })} />
                    </label>
                  )}
                </div>
                <label>
                  JPEG 质量
                  <input type="number" min="70" max="100" value={aiToolOptions.jpegQuality} onChange={(event) => setAiToolOptions({ ...aiToolOptions, jpegQuality: event.target.value })} />
                </label>
                <div className="watermarkBox">
                  <label><input type="checkbox" checked={aiToolOptions.watermark.enabled} onChange={(event) => setAiToolOptions({ ...aiToolOptions, watermark: { ...aiToolOptions.watermark, enabled: event.target.checked } })} /> 添加文字水印（默认开启）</label>
                  <label>
                    水印文字
                    <input value={aiToolOptions.watermark.text} onChange={(event) => setAiToolOptions({ ...aiToolOptions, watermark: { ...aiToolOptions.watermark, text: event.target.value } })} />
                  </label>
                  <div className="splitInputs">
                    <label>
                      颜色
                      <input value={aiToolOptions.watermark.color} onChange={(event) => setAiToolOptions({ ...aiToolOptions, watermark: { ...aiToolOptions.watermark, color: event.target.value } })} />
                    </label>
                    <label>
                      字号
                      <input type="number" min="8" max="200" value={aiToolOptions.watermark.fontSize} onChange={(event) => setAiToolOptions({ ...aiToolOptions, watermark: { ...aiToolOptions.watermark, fontSize: event.target.value } })} />
                    </label>
                  </div>
                  <label>
                    透明度 {Math.round(Number(aiToolOptions.watermark.opacity) * 100)}%
                    <input type="range" min="0.05" max="1" step="0.05" value={aiToolOptions.watermark.opacity} onChange={(event) => setAiToolOptions({ ...aiToolOptions, watermark: { ...aiToolOptions.watermark, opacity: event.target.value } })} />
                  </label>
                </div>
                <button onClick={processAiToolFiles} disabled={busy || aiToolOptions.selectedPaths.length === 0}>
                  处理 {aiToolOptions.selectedPaths.length} 个文件
                </button>
                {aiToolProgress && (
                  <ProgressBar
                    progress={aiToolProgress.percent}
                    label={`${aiToolProgress.completed || 0}/${aiToolProgress.total || 0}`}
                    detail={aiToolProgress.currentFile || (aiToolProgress.phase === 'completed' ? '处理完成' : '准备处理')}
                  />
                )}
              </div>
            </div>
            <AiToolFileList
              files={aiToolFiles}
              selectedPaths={aiToolOptions.selectedPaths}
              onToggle={toggleAiToolFile}
              onSelectAll={() => setAiToolOptions({ ...aiToolOptions, selectedPaths: aiToolFiles.map((file) => file.absolutePath) })}
              onClear={() => setAiToolOptions({ ...aiToolOptions, selectedPaths: [] })}
            />
          </section>
        )}

        {activeView === 'imageDuplicate' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>图片复制</h2>
              <div className="toolIntro">
                <p>通过质量、尺寸、亮度和水印的参数组合，生成多套轻微不同的图片副本。输出目录为源目录下的参数命名目录，源文件不变。</p>
              </div>
              <div className="form">
                <DirectoryPicker
                  label="源目录"
                  value={duplicateOptions.folderPath}
                  onPick={(folderPath) => {
                    const nextOptions = { ...duplicateOptions, folderPath };
                    setDuplicateOptions(nextOptions);
                    scanDuplicateFolder(nextOptions);
                  }}
                  selectDirectory={selectDirectory}
                />
                <button onClick={() => scanDuplicateFolder()} disabled={busy || !duplicateOptions.folderPath}>重新扫描</button>
                <label>
                  图片质量范围
                  <div className="tripleInputs">
                    <input aria-label="起始质量" type="number" min="60" max="99" value={duplicateOptions.qualityStart} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, qualityStart: event.target.value })} />
                    <input aria-label="结束质量" type="number" min="60" max="99" value={duplicateOptions.qualityEnd} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, qualityEnd: event.target.value })} />
                    <input aria-label="步长" type="number" min="1" max="39" value={duplicateOptions.qualityStep} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, qualityStep: event.target.value })} />
                  </div>
                  <small>起始 / 结束 / 步长，例如 99、70、1 会生成 99 到 70 共 30 个质量值。</small>
                </label>
                <div className="rangePanel">
                  <strong>缩小尺寸范围</strong>
                  <label>
                    宽度 起始 / 结束 / 步长
                    <div className="tripleInputs">
                      <input type="number" min="1" max="120" value={duplicateOptions.widthStart} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, widthStart: event.target.value })} />
                      <input type="number" min="1" max="120" value={duplicateOptions.widthEnd} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, widthEnd: event.target.value })} />
                      <input type="number" min="1" max="120" value={duplicateOptions.widthStep} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, widthStep: event.target.value })} />
                    </div>
                  </label>
                  <label>
                    高度 起始 / 结束 / 步长
                    <div className="tripleInputs">
                      <input type="number" min="1" max="120" value={duplicateOptions.heightStart} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, heightStart: event.target.value })} />
                      <input type="number" min="1" max="120" value={duplicateOptions.heightEnd} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, heightEnd: event.target.value })} />
                      <input type="number" min="1" max="120" value={duplicateOptions.heightStep} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, heightStep: event.target.value })} />
                    </div>
                  </label>
                </div>
                <label>
                  亮度范围
                  <div className="tripleInputs">
                    <input type="number" min="-0.5" max="0.5" step="0.001" value={duplicateOptions.brightnessStart} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, brightnessStart: event.target.value })} />
                    <input type="number" min="-0.5" max="0.5" step="0.001" value={duplicateOptions.brightnessEnd} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, brightnessEnd: event.target.value })} />
                    <input type="number" min="0.001" max="1" step="0.001" value={duplicateOptions.brightnessStep} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, brightnessStep: event.target.value })} />
                  </div>
                  <small>起始 / 结束 / 步长，例如 0、0.010、0.001 会生成 0.000 到 0.010 共 11 个亮度值。</small>
                </label>
                <DuplicateCombinationSummary options={duplicateOptions} fileCount={duplicateOptions.selectedPaths.length} />
                <div className="watermarkBox">
                  <label><input type="checkbox" checked={duplicateOptions.watermark.enabled} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, watermark: { ...duplicateOptions.watermark, enabled: event.target.checked } })} /> 添加文字水印</label>
                  <label>
                    水印文字
                    <input value={duplicateOptions.watermark.text} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, watermark: { ...duplicateOptions.watermark, text: event.target.value } })} />
                  </label>
                  <div className="splitInputs">
                    <label>
                      颜色
                      <input value={duplicateOptions.watermark.color} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, watermark: { ...duplicateOptions.watermark, color: event.target.value } })} />
                    </label>
                    <label>
                      字号
                      <input type="number" min="8" max="200" value={duplicateOptions.watermark.fontSize} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, watermark: { ...duplicateOptions.watermark, fontSize: event.target.value } })} />
                    </label>
                  </div>
                  <label>
                    透明度 {Math.round(Number(duplicateOptions.watermark.opacity) * 100)}%
                    <input type="range" min="0.05" max="1" step="0.05" value={duplicateOptions.watermark.opacity} onChange={(event) => setDuplicateOptions({ ...duplicateOptions, watermark: { ...duplicateOptions.watermark, opacity: event.target.value } })} />
                  </label>
                </div>
                <button onClick={runImageDuplicate} disabled={busy || duplicateOptions.selectedPaths.length === 0}>
                  生成图片副本
                </button>
                {duplicateProgress && (
                  <ProgressBar
                    progress={duplicateProgress.percent}
                    label={`${duplicateProgress.completed || 0}/${duplicateProgress.total || 0}`}
                    detail={duplicateProgress.currentFile || (duplicateProgress.phase === 'completed' ? '生成完成' : '准备生成')}
                  />
                )}
              </div>
            </div>
            <SimpleImageFileList
              title="待复制图片"
              files={duplicateFiles}
              selectedPaths={duplicateOptions.selectedPaths}
              onToggle={toggleDuplicateFile}
              onSelectAll={() => setDuplicateOptions({ ...duplicateOptions, selectedPaths: duplicateFiles.map((file) => file.absolutePath) })}
              onClear={() => setDuplicateOptions({ ...duplicateOptions, selectedPaths: [] })}
            />
          </section>
        )}

        {activeView === 'wechatMarkdown' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>公众号转MD</h2>
              <div className="toolIntro">
                <p>输入微信公众号文章 URL，将正文转换为 Markdown 文件。图片可保存到本地、保留远程 URL，或以 base64 写入 Markdown。</p>
              </div>
              <div className="form">
                <label>
                  文章 URL
                  <input value={wechatOptions.url} onChange={(event) => setWechatOptions({ ...wechatOptions, url: event.target.value })} placeholder="https://mp.weixin.qq.com/s/..." />
                </label>
                <DirectoryPicker
                  label="保存目录"
                  value={wechatOptions.outputDir}
                  onPick={(outputDir) => setWechatOptions({ ...wechatOptions, outputDir })}
                  selectDirectory={selectDirectory}
                />
                <label>
                  图片处理
                  <select value={wechatOptions.imageMode} onChange={(event) => setWechatOptions({ ...wechatOptions, imageMode: event.target.value })}>
                    <option value="save">保存到本地目录</option>
                    <option value="url">保留远程 URL</option>
                    <option value="base64">写入 base64</option>
                  </select>
                </label>
                <button onClick={downloadWechatArticle} disabled={busy || !wechatOptions.url || !wechatOptions.outputDir}>下载为 Markdown</button>
              </div>
            </div>
            <div className="panel">
              <h2>转换结果</h2>
              {wechatResult ? (
                <div className="resultList">
                  <span><strong>标题</strong>{wechatResult.title || '-'}</span>
                  <span><strong>作者</strong>{wechatResult.author || '-'}</span>
                  <span><strong>Markdown</strong>{wechatResult.mdPath}</span>
                  {wechatResult.imageDir && <span><strong>图片目录</strong>{wechatResult.imageDir}</span>}
                  <button onClick={() => openPath(wechatResult.mdPath)}>打开 Markdown</button>
                </div>
              ) : (
                <div className="empty">尚未转换</div>
              )}
            </div>
          </section>
        )}

        {activeView === 'articleRewrite' && (
          <section className="contentGrid wideRight">
            <div className="panel">
              <h2>文章重写</h2>
              <div className="toolIntro">
                <p>导入 Markdown 或粘贴原文，按文章类型、读者和要求生成一篇新的 Markdown 文章，并同时保存原文备份。</p>
              </div>
              <div className="form">
                <label>
                  原文标题
                  <input value={articleOptions.sourceTitle} onChange={(event) => setArticleOptions({ ...articleOptions, sourceTitle: event.target.value })} placeholder="可选，用于原文备份标题" />
                </label>
                <div className="actions actionWrap">
                  <button type="button" onClick={importArticleMarkdown} disabled={busy}>导入 MD/TXT</button>
                  {articleOptions.sourceFile && <button type="button" onClick={() => openPath(articleOptions.sourceFile)}>打开源文件</button>}
                </div>
                <label>
                  原文内容
                  <textarea className="largeTextarea" value={articleOptions.inputText} onChange={(event) => setArticleOptions({ ...articleOptions, inputText: event.target.value })} placeholder="粘贴资讯、公告、同行文章，或导入 .md/.txt 文件" />
                </label>
                <DirectoryPicker
                  label="保存目录"
                  value={articleOptions.outputDir}
                  onPick={(outputDir) => setArticleOptions({ ...articleOptions, outputDir })}
                  selectDirectory={selectDirectory}
                />
                <div className="splitInputs">
                  <label>
                    文章类型
                    <select value={articleOptions.articleType} onChange={(event) => setArticleOptions({ ...articleOptions, articleType: event.target.value })}>
                      {articleTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    文章长度
                    <select value={articleOptions.length} onChange={(event) => setArticleOptions({ ...articleOptions, length: event.target.value })}>
                      {articleLengthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
                <label>
                  目标主题
                  <input value={articleOptions.targetTopic} onChange={(event) => setArticleOptions({ ...articleOptions, targetTopic: event.target.value })} placeholder="不填则由 AI 根据原文提炼" />
                </label>
                <label>
                  目标读者
                  <input value={articleOptions.targetAudience} onChange={(event) => setArticleOptions({ ...articleOptions, targetAudience: event.target.value })} />
                </label>
                <label>
                  文章风格
                  <input value={articleOptions.style} onChange={(event) => setArticleOptions({ ...articleOptions, style: event.target.value })} />
                </label>
                <label>
                  改写要求
                  <textarea value={articleOptions.instructions} onChange={(event) => setArticleOptions({ ...articleOptions, instructions: event.target.value })} />
                </label>
                <label>
                  使用模型
                  <select value={articleOptions.modelId} onChange={(event) => setArticleOptions({ ...articleOptions, modelId: event.target.value })}>
                    <option value="">默认文本模型</option>
                    {aiStore.models.filter((model) => model.enabled !== false && ['text', 'both'].includes(model.type)).map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                </label>
                <div className="splitInputs">
                  <label>
                    Temperature
                    <input type="number" min="0" max="2" step="0.1" value={articleOptions.temperature} onChange={(event) => setArticleOptions({ ...articleOptions, temperature: event.target.value })} />
                  </label>
                  <label>
                    Max Tokens
                    <input type="number" min="1024" max="200000" step="512" value={articleOptions.maxTokens} onChange={(event) => setArticleOptions({ ...articleOptions, maxTokens: event.target.value })} />
                  </label>
                </div>
                <button onClick={rewriteArticle} disabled={busy || !articleOptions.inputText.trim() || !articleOptions.outputDir}>生成文章</button>
              </div>
            </div>
            <div className="panel">
              <div className="panelHeader">
                <h2>生成结果</h2>
                {articleResult && <button type="button" onClick={() => openPath(articleResult.rewrittenPath)}>打开文件</button>}
              </div>
              {articleResult ? (
                <div className="resultList">
                  <span><strong>标题</strong>{articleResult.title}</span>
                  <span><strong>模型</strong>{articleResult.modelName || articleResult.modelId}</span>
                  <span><strong>原文备份</strong>{articleResult.originalPath}</span>
                  <span><strong>生成文</strong>{articleResult.rewrittenPath}</span>
                  <pre className="markdownPreview">{articleResult.markdown}</pre>
                </div>
              ) : (
                <div className="empty">尚未生成文章</div>
              )}
            </div>
          </section>
        )}

        {activeView === 'aiModelConfig' && (
          <section className="contentGrid">
            <div className="panel">
              <div className="panelHeader">
                <h2>AI模型列表</h2>
                <button type="button" onClick={() => addAiModel('qwen')}>新增模型</button>
              </div>
              <div className="toolIntro">
                <p>可保存多个文本或视觉模型。API Key 使用 Electron safeStorage 加密后保存到本机 SQLite。</p>
              </div>
              <div className="modelList">
                {aiStore.models.map((model) => (
                  <button
                    type="button"
                    key={model.id}
                    className={`modelItem ${editingAiModel?.id === model.id ? 'selected' : ''}`}
                    onClick={() => {
                      setEditingAiModel(model);
                      setAiTestResult(null);
                    }}
                  >
                    <span>
                      <strong>{model.name}</strong>
                      <small>{providerLabel(aiProviders, model.provider)} / {model.provider === 'doubao' && model.resourceId ? model.resourceId : model.model}</small>
                    </span>
                    <em>{model.enabled ? model.type : 'disabled'}</em>
                    <div className="modelBadges">
                      {aiStore.defaultTextModelId === model.id && <small>默认文本</small>}
                      {aiStore.defaultVisionModelId === model.id && <small>默认视觉</small>}
                      {model.hasApiKey && <small>已保存 Key</small>}
                    </div>
                  </button>
                ))}
                {aiStore.models.length === 0 && <div className="empty">暂无模型，请新增后保存。</div>}
              </div>
            </div>
            <div className="panel">
              <h2>编辑模型</h2>
              {editingAiModel ? (
                <div className="form">
                  <label>
                    配置名称
                    <input value={editingAiModel.name || ''} onChange={(event) => setEditingAiModel({ ...editingAiModel, name: event.target.value })} />
                  </label>
                  <label className="inlineCheck">
                    <input type="checkbox" checked={editingAiModel.enabled !== false} onChange={(event) => setEditingAiModel({ ...editingAiModel, enabled: event.target.checked })} />
                    启用此模型
                  </label>
                  <label>
                    模型供应商
                    <select value={editingAiModel.provider} onChange={(event) => applyAiProvider(event.target.value)}>
                      {aiProviders.map((provider) => (
                        <option key={provider.value} value={provider.value}>{provider.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    API Base URL
                    <input value={editingAiModel.baseUrl || ''} onChange={(event) => setEditingAiModel({ ...editingAiModel, baseUrl: event.target.value })} />
                  </label>
                  <label>
                    API Key
                    <input type="password" value={editingAiModel.apiKey || ''} onChange={(event) => setEditingAiModel({ ...editingAiModel, apiKey: event.target.value })} placeholder={editingAiModel.hasApiKey ? '已加密保存，输入新 Key 可替换' : '请输入 API Key'} />
                  </label>
                  {editingAiModel.provider === 'doubao' && (
                    <label>
                      资源 ID
                      <input value={editingAiModel.resourceId || ''} onChange={(event) => setEditingAiModel({ ...editingAiModel, resourceId: event.target.value })} placeholder="火山方舟 Endpoint ID / 资源 ID，例如 ep-xxxxxxxx" />
                    </label>
                  )}
                  <div className="splitInputs">
                    <label>
                      模型 ID
                      <input value={editingAiModel.model || ''} onChange={(event) => setEditingAiModel({ ...editingAiModel, model: event.target.value })} />
                    </label>
                    <label>
                      用途
                      <select value={editingAiModel.type || 'both'} onChange={(event) => setEditingAiModel({ ...editingAiModel, type: event.target.value })}>
                        <option value="both">文本 + 视觉</option>
                        <option value="text">仅文本</option>
                        <option value="vision">仅视觉</option>
                      </select>
                    </label>
                  </div>
                  <div className="splitInputs">
                    <label>
                      Temperature
                      <input type="number" min="0" max="2" step="0.1" value={editingAiModel.temperature} onChange={(event) => setEditingAiModel({ ...editingAiModel, temperature: event.target.value })} />
                    </label>
                    <label>
                      Max Tokens
                      <input type="number" min="256" max="200000" step="256" value={editingAiModel.maxTokens} onChange={(event) => setEditingAiModel({ ...editingAiModel, maxTokens: event.target.value })} />
                    </label>
                  </div>
                  <div className="actions actionWrap">
                    <button onClick={saveAiModel} disabled={busy}>保存模型</button>
                    <button onClick={testAiModel} disabled={busy}>测试连接</button>
                    <button type="button" onClick={() => setDefaultAiModel('text', editingAiModel.id)} disabled={busy || !editingAiModel.id}>设为默认文本</button>
                    <button type="button" onClick={() => setDefaultAiModel('vision', editingAiModel.id)} disabled={busy || !editingAiModel.id}>设为默认视觉</button>
                    <button type="button" className="dangerButton" onClick={() => deleteAiModel(editingAiModel.id)} disabled={busy || !editingAiModel.id}>删除</button>
                  </div>
                  {aiTestResult && (
                    <div className={`statusBox ${aiTestResult.ok ? 'success' : 'failed'}`}>
                      <strong>{aiTestResult.ok ? '连接成功' : '连接失败'}</strong>
                      <span>{aiTestResult.message}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty">请选择或新增一个模型。</div>
              )}
              <div className="toolIntro">
                <p>国内供应商默认包含通义千问、DeepSeek、智谱 GLM、豆包/火山方舟、腾讯混元，也支持 OpenAI、Gemini、Ollama 和 OpenAI Compatible 接口。</p>
              </div>
            </div>
          </section>
        )}

        {activeView === 'aiParamLibrary' && (
          <PromptLibraryView
            categories={promptCategories}
            tags={promptTags}
            filters={promptFilters}
            onFilterChange={(nextFilters) => {
              setPromptFilters(nextFilters);
              setPromptPage(1);
            }}
            prompts={pagedPrompts}
            totalCount={filteredPrompts.length}
            page={Math.min(promptPage, promptPageCount)}
            pageCount={promptPageCount}
            onPageChange={setPromptPage}
            onOpenPrompt={setSelectedPrompt}
          />
        )}

        {!['socialAccounts', 'socialWorks', 'localWorks', 'oneClickPublish', 'aiParamLibrary'].includes(activeView) && (
          <FileTable
            files={files}
            selectedFileIds={selectedFileIds}
            selectedStorage={selectedStorage}
            onToggle={toggleFile}
            onSelectAll={selectAllVisible}
            onClear={clearSelection}
          />
        )}

        {!['sync', 'socialAccounts', 'socialWorks', 'localWorks', 'oneClickPublish', 'aiParamLibrary'].includes(activeView) && <TaskList tasks={tasks} compact onOpenPath={openPath} />}
        {addAccountModal.open && (
          <AddMediaAccountModal
            modal={addAccountModal}
            platforms={mediaPlatformCards}
            busy={busy}
            onChange={setAddAccountModal}
            onClose={() => setAddAccountModal((current) => ({ ...current, open: false }))}
            onLoginAdd={addSocialAccountByLogin}
            onCookieAdd={addSocialAccountByCookie}
          />
        )}
        {workPathModalOpen && (
          <WorkPathModal
            value={workPathDraft}
            onChange={setWorkPathDraft}
            onChoose={chooseLocalWorksPath}
            onSave={saveLocalWorksPath}
            onClose={() => setWorkPathModalOpen(false)}
          />
        )}
        {selectedLocalWork && (
          <LocalWorkChildrenModal
            work={selectedLocalWork}
            selectedChild={selectedChildWork}
            onSelectChild={setSelectedChildWork}
            onBack={() => setSelectedChildWork(null)}
            onClose={() => {
              setSelectedLocalWork(null);
              setSelectedChildWork(null);
            }}
          />
        )}
        {selectedMainWork && (
          <LocalWorkPreviewModal
            title={selectedMainWork.title}
            subtitle={`主作品 · ${selectedMainWork.publishStatus}`}
            item={mainWorkPreviewItem(selectedMainWork)}
            onClose={() => setSelectedMainWork(null)}
          />
        )}
        {localWorkTagEditor && (
          <LocalWorkTagModal
            editor={localWorkTagEditor}
            onChange={setLocalWorkTagEditor}
            onSave={saveLocalWorkTags}
            onClose={() => setLocalWorkTagEditor(null)}
          />
        )}
        {selectedPrompt && (
          <PromptDetailModal
            prompt={selectedPrompt}
            onClose={() => setSelectedPrompt(null)}
            onCopy={async () => {
              await copyTextToClipboard(selectedPrompt.prompt);
              setMessage('提示词已复制');
            }}
          />
        )}
        {message && <div className="toast">{message}</div>}
      </main>
    </div>
  );
}

function PromptLibraryView({
  categories,
  tags,
  filters,
  onFilterChange,
  prompts,
  totalCount,
  page,
  pageCount,
  onPageChange,
  onOpenPrompt
}) {
  function updateFilter(key, value) {
    onFilterChange({ ...filters, [key]: value });
  }

  return (
    <section className="promptLibraryPage">
      <div className="panel promptFilterPanel">
        <div>
          <h2>AI提示词库</h2>
          <p>按分类和标签筛选常用提示词，点击卡片查看完整内容并复制复用。</p>
        </div>
        <div className="promptFilters">
          <label>
            分类
            <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>
              <option value="all">全部分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            标签
            <select value={filters.tag} onChange={(event) => updateFilter('tag', event.target.value)}>
              <option value="all">全部标签</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>
          <button className="secondaryButton" onClick={() => onFilterChange({ category: 'all', tag: 'all' })}>
            清空筛选
          </button>
        </div>
      </div>

      <div className="panel promptLibraryPanel">
        <div className="panelHeader">
          <h2>提示词瀑布流</h2>
          <span>共 {totalCount} 条，当前第 {page} / {pageCount} 页</span>
        </div>
        {prompts.length > 0 ? (
          <div className="promptMasonry">
            {prompts.map((item) => (
              <button className="promptCard" key={item.serialNo} onClick={() => onOpenPrompt(item)}>
                <img src={item.imagePath} alt={`${item.category} 提示词封面`} />
                <div className="promptCardBody">
                  <div className="promptMeta">
                    <span>#{String(item.serialNo).padStart(3, '0')}</span>
                    <em>{item.category}</em>
                  </div>
                  <p>{item.prompt}</p>
                  <div className="promptTagList">
                    {item.tags.map((tag) => (
                      <small key={tag}>{tag}</small>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">没有匹配的提示词</div>
        )}
        <div className="promptPagination">
          <button className="secondaryButton" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            上一页
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
            <button
              className={`pageButton ${pageNumber === page ? 'active' : ''}`}
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button className="secondaryButton" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            下一页
          </button>
        </div>
      </div>
    </section>
  );
}

function LocalWorksView({
  works,
  worksPath,
  importPath,
  busy,
  tagOptions,
  tagFilter,
  onTagFilterChange,
  onEditTags,
  onOpenMainWork,
  onOpenPath,
  onOpenChildren
}) {
  function workMdPath(work) {
    if (!work.mdFile) return '未找到 MD 文件';
    if (/^[a-zA-Z]:[\\/]/.test(work.mdFile) || work.mdFile.startsWith('\\\\')) return work.mdFile;
    if (!worksPath) return work.mdFile;
    return `${worksPath}\\${work.folderName}\\${work.mdFile}`;
  }

  return (
    <section className="panel localWorksPanel">
      <div className="panelHeader localWorksHeader">
        <div>
          <h2>本地作品列表</h2>
          <span>作品存放路径：{worksPath || '尚未设置'}{importPath ? `；当前导入来源：${importPath}` : ''}</span>
        </div>
        <div className="tableActions">
          <select value={tagFilter} onChange={(event) => onTagFilterChange(event.target.value)} disabled={busy}>
            <option value="all">全部标签</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </div>
      {works.length > 0 ? (
        <div className="localWorkTable">
          <div className="localWorkRow head">
            <span>序号</span>
            <span>图片数</span>
            <span>标题</span>
            <span>标签</span>
            <span>子作品数量</span>
            <span>发布状态</span>
            <span>操作</span>
          </div>
          {works.map((work) => (
            <div className="localWorkRow" key={work.id}>
              <span>{work.serialNo}</span>
              <span>{work.imagePaths?.length || 0} 张</span>
              <span title={work.title}>
                <button type="button" className="linkButton titleLink" onClick={() => onOpenMainWork(work)}>
                  {work.title}
                </button>
              </span>
              <span className="localWorkTags">
                {(work.tags || []).length > 0 ? (work.tags || []).map((tag) => <small key={tag}>{tag}</small>) : <small>未设置</small>}
                <button type="button" className="linkButton" onClick={() => onEditTags(work)}>编辑</button>
              </span>
              <span>
                {work.children.length > 0 ? (
                  <button type="button" className="linkButton" onClick={() => onOpenChildren(work)}>
                    {work.children.length} 个
                  </button>
                ) : (
                  '0 个'
                )}
              </span>
              <span><em className={`publishStatus ${statusClassName(work.publishStatus)}`}>{work.publishStatus}</em></span>
              <span className="rowActions">
                <button type="button" onClick={() => onOpenPath(workMdPath(work))} disabled={!work.mdFile}>打开MD</button>
                <button type="button" onClick={() => onOpenPath(work.folderPath || `${worksPath}\\${work.folderName}`)}>打开目录</button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">尚未导入本地作品。点击“选择目录导入”，选择包含作品文件夹的来源目录。</div>
      )}
    </section>
  );
}

function WorkPathModal({ value, onChange, onChoose, onSave, onClose }) {
  return (
    <div className="modalBackdrop">
      <div className="mediaAccountModal workPathModal">
        <div className="modalHeader">
          <h2>设置作品路径</h2>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>
        <div className="modalSection">
          <label>
            作品存放路径
            <div className="pathRow">
              <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="请选择本地作品根目录" />
              <button type="button" onClick={onChoose}>选择</button>
            </div>
          </label>
          <div className="toolIntro">
            <p>后续本地作品会统一存放到此目录下面，例如：作品路径 / 作品目录 / index.md / children。</p>
          </div>
        </div>
        <div className="modalActions">
          <button type="button" className="secondaryButton" onClick={onClose}>取消</button>
          <button type="button" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

function LocalWorkChildrenModal({ work, selectedChild, onSelectChild, onBack, onClose }) {
  return (
    <div className="modalBackdrop">
      <div className="mediaAccountModal localChildrenModal">
        <div className="modalHeader">
          <div>
            <h2>{selectedChild ? selectedChild.title : work.title}</h2>
            <p>{selectedChild ? `${selectedChild.platform} · ${selectedChild.publishStatus}` : `子作品 ${work.children.length} 个`}</p>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>
        {selectedChild ? (
          <LocalWorkPostPreview item={selectedChild} />
        ) : (
          <div className="localChildMasonry">
            {work.children.map((child) => (
              <button className="localChildCard" key={child.id} onClick={() => onSelectChild(child)}>
                {child.imagePaths[0] ? (
                  <img src={child.imagePaths[0]} alt={child.title} />
                ) : (
                  <div className="imagePlaceholder">暂无图片</div>
                )}
                <div>
                  <strong>{child.title}</strong>
                  <p>{child.content || `子作品目录：${child.variantName}`}</p>
                  <span>
                    <small>{child.platform}</small>
                    <em className={`publishStatus ${statusClassName(child.publishStatus)}`}>{child.publishStatus}</em>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="modalActions">
          {selectedChild && <button type="button" className="secondaryButton" onClick={onBack}>返回子作品</button>}
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

function LocalWorkPreviewModal({ title, subtitle, item, onClose }) {
  return (
    <div className="modalBackdrop">
      <div className="mediaAccountModal localChildrenModal">
        <div className="modalHeader">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>
        <LocalWorkPostPreview item={item} />
        <div className="modalActions">
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

function LocalWorkTagModal({ editor, onChange, onSave, onClose }) {
  return (
    <div className="modalBackdrop">
      <div className="mediaAccountModal workPathModal">
        <div className="modalHeader">
          <div>
            <h2>编辑作品标签</h2>
            <p>{editor.title}</p>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>
        <div className="modalSection">
          <label>
            标签
            <input
              value={editor.value}
              onChange={(event) => onChange({ ...editor, value: event.target.value })}
              placeholder="多个标签用逗号、顿号或空格分隔"
            />
          </label>
        </div>
        <div className="modalActions">
          <button type="button" className="secondaryButton" onClick={onClose}>取消</button>
          <button type="button" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

function LocalWorkPostPreview({ item }) {
  return (
    <div className="xhsPreview">
      <div className="xhsImageStrip">
        {item.imagePaths.length > 0 ? (
          item.imagePaths.map((imagePath, index) => (
            <img key={`${imagePath}-${index}`} src={imagePath} alt={`${item.title} ${index + 1}`} />
          ))
        ) : (
          <div className="imagePlaceholder">暂无图片</div>
        )}
      </div>
      <article className="xhsPostBody">
        <div className="promptTagList">
          <small>{item.platform}</small>
          <small className={statusClassName(item.publishStatus)}>{item.publishStatus}</small>
        </div>
        <h3>{item.title}</h3>
        <p>{item.content || '暂无正文内容'}</p>
        <div className="promptTagList">
          {item.tags.map((tag) => (
            <small key={tag}>#{tag}</small>
          ))}
        </div>
      </article>
    </div>
  );
}

function PromptDetailModal({ prompt, onClose, onCopy }) {
  return (
    <div className="modalBackdrop">
      <div className="modal promptDetailModal">
        <div className="modalHeader">
          <div>
            <h2>提示词详情</h2>
            <p>#{String(prompt.serialNo).padStart(3, '0')} · {prompt.category}</p>
          </div>
          <button className="iconButton" onClick={onClose}>×</button>
        </div>
        <img className="promptDetailImage" src={prompt.imagePath} alt={`${prompt.category} 提示词封面`} />
        <div className="promptTagList">
          {prompt.tags.map((tag) => (
            <small key={tag}>{tag}</small>
          ))}
        </div>
        <textarea className="largeTextarea" value={prompt.prompt} readOnly />
        <div className="modalActions">
          <button className="secondaryButton" onClick={onClose}>关闭</button>
          <button onClick={onCopy}>
            <Copy size={16} />
            复制提示词
          </button>
        </div>
      </div>
    </div>
  );
}

function StorageList({ storages, selectedStorageId, onSelect, onCheck }) {
  return (
    <div className="panel">
      <h2>素材库列表</h2>
      <div className="storageList">
        {storages.map((storage) => (
          <button
            className={`storageItem ${storage.id === selectedStorageId ? 'selected' : ''}`}
            key={storage.id}
            onClick={() => onSelect(storage)}
          >
            <span>
              <strong>{storage.name}</strong>
              <small>{storage.basePath}</small>
            </span>
            <em className={storage.status}>{storage.status}</em>
            <span className="storageActions" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => onCheck(storage)}>检测</button>
            </span>
          </button>
        ))}
        {storages.length === 0 && <div className="empty">暂无素材库</div>}
      </div>
    </div>
  );
}

function DirectoryPicker({ label, value, onPick, selectDirectory }) {
  return (
    <label>
      {label}
      <div className="pathRow">
        <input value={value} readOnly placeholder="选择输出目录" />
        <button type="button" onClick={() => selectDirectory(onPick)}>选择</button>
      </div>
    </label>
  );
}

function SelectionSummary({ selectedImages, selectedVideos }) {
  return (
    <div className="panel metricPanel">
      <h2>当前选择</h2>
      <div className="metrics">
        <span><strong>{selectedImages.length}</strong>图片</span>
        <span><strong>{selectedVideos.length}</strong>视频</span>
      </div>
      <p>先在下方文件表勾选素材，再执行批处理任务。</p>
    </div>
  );
}

function FileTable({ files, selectedFileIds, selectedStorage, onToggle, onSelectAll, onClear }) {
  return (
    <section className="panel filesPanel">
      <div className="panelHeader">
        <h2>索引文件</h2>
        <div className="tableActions">
          <span>{selectedStorage ? files.length : 0} 个文件，已选 {selectedFileIds.length} 个</span>
          <button onClick={onSelectAll} disabled={files.length === 0}>全选</button>
          <button onClick={onClear} disabled={selectedFileIds.length === 0}>清空</button>
        </div>
      </div>
      <div className="fileTable">
        <div className="fileRow head">
          <span>选择</span>
          <span>类型</span>
          <span>路径</span>
          <span>大小</span>
          <span>状态</span>
        </div>
        {files.map((file) => (
          <button className="fileRow selectable" key={file.id} onClick={() => onToggle(file.id)}>
            <span><input type="checkbox" readOnly checked={selectedFileIds.includes(file.id)} /></span>
            <span>{file.fileType}</span>
            <span title={file.absolutePath}>{file.relativePath}</span>
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>{file.processingStatus}</span>
          </button>
        ))}
        {files.length === 0 && <div className="empty">选择素材库后执行扫描</div>}
      </div>
    </section>
  );
}

function TaskList({ tasks, compact = false, onOpenPath }) {
  return (
    <section className={`panel taskPanel ${compact ? 'compact' : ''}`}>
      <div className="panelHeader">
        <h2>最近任务</h2>
        <span>{tasks.length} 条</span>
      </div>
      <div className="taskList">
        {tasks.map((task) => (
          <div className="taskItem" key={task.id}>
            <span>
              <strong>{task.taskType}</strong>
              <small>{task.errorMessage || task.result?.outputDir || task.updatedAt}</small>
            </span>
            <em className={task.status}>{task.status}</em>
            {task.result?.outputDir && (
              <button type="button" onClick={() => onOpenPath(task.result.outputDir)}>打开</button>
            )}
          </div>
        ))}
        {tasks.length === 0 && <div className="empty">暂无任务</div>}
      </div>
    </section>
  );
}

function AiToolFileList({ files, selectedPaths, onToggle, onSelectAll, onClear }) {
  const aiCount = files.filter((file) => file.hasAiMarkers).length;

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2>扫描结果</h2>
        <div className="tableActions">
          <span>{files.length} 个文件，疑似含 AI 标识 {aiCount} 个</span>
          <button onClick={onSelectAll} disabled={files.length === 0}>全选</button>
          <button onClick={onClear} disabled={selectedPaths.length === 0}>清空</button>
        </div>
      </div>
      <div className="aiFileList">
        {files.map((file) => (
          <button className="aiFileItem" key={file.absolutePath} onClick={() => onToggle(file.absolutePath)}>
            <input type="checkbox" readOnly checked={selectedPaths.includes(file.absolutePath)} />
            <span>
              <strong>{file.relativePath}</strong>
              <small>{formatAiDetectionSummary(file)}</small>
              {file.frequencyAnalysis && (
                <small className={`frequencyRisk ${file.frequencyAnalysis.level}`}>
                  频域风险 {file.frequencyAnalysis.score}/100：{file.frequencyAnalysis.reasons?.[0]}
                </small>
              )}
              <small>{file.hasAiMarkers ? `检测到：${file.markers.join(', ')}` : '未检测到明显 AI 标识，仍会清理图片元数据'}</small>
            </span>
            <em className={file.hasAiMarkers ? 'detected' : 'clean'}>{file.extension.toUpperCase()}</em>
          </button>
        ))}
        {files.length === 0 && <div className="empty">请选择文件夹并扫描</div>}
      </div>
    </div>
  );
}

function formatAiDetectionSummary(file) {
  const parts = [];
  if (file.markers?.length) parts.push(`显式标识：${file.markers.join(', ')}`);
  if (file.platformAiRisk) parts.push('频域分析：小红书等平台可能提示“含 AI 生成内容”');
  if (parts.length) return parts.join('；');
  return '频域分析未发现明显平台 AI 风险';
}

function SocialAccountList({ accounts, platforms, selectedId, onSelect, onDelete }) {
  const groups = accounts.reduce((map, account) => {
    const groupName = account.groupName || '默认分组';
    if (!map.has(groupName)) map.set(groupName, []);
    map.get(groupName).push(account);
    return map;
  }, new Map());

  return (
    <div className="socialAccountList">
      {[...groups.entries()].map(([groupName, groupAccounts]) => (
        <div key={groupName} className="socialGroup">
          <strong>{groupName} ({groupAccounts.length})</strong>
          {groupAccounts.map((account) => (
            <button
              type="button"
              key={account.id}
              className={`socialAccountItem ${selectedId === account.id ? 'selected' : ''}`}
              onClick={() => onSelect(account)}
            >
              <span className="socialAvatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : platformLabel(platforms, account.platform).slice(0, 1)}</span>
              <span>
                <strong>{account.nickname}</strong>
                <small>{platformLabel(platforms, account.platform)} {account.platformUserId || ''}</small>
                {account.remark && <small>{account.remark}</small>}
              </span>
              <em onClick={(event) => {
                event.stopPropagation();
                onDelete(account.id);
              }}>删除</em>
            </button>
          ))}
        </div>
      ))}
      {accounts.length === 0 && <div className="empty">暂无账号</div>}
    </div>
  );
}

function AddMediaAccountModal({ modal, platforms, busy, onChange, onClose, onLoginAdd, onCookieAdd }) {
  const selectedPlatform = platforms.find((platform) => platform.value === modal.platform);

  return (
    <div className="modalBackdrop">
      <div className="mediaAccountModal">
        <div className="modalHeader">
          <h2>添加媒体账号</h2>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <section className="modalSection">
          <h3>选择媒体平台</h3>
          <div className="platformGrid">
            {platforms.map((platform) => (
              <button
                type="button"
                key={platform.value}
                className={`platformCard ${modal.platform === platform.value ? 'selected' : ''}`}
                disabled={!platform.enabled}
                onClick={() => onChange((current) => ({ ...current, platform: platform.value }))}
              >
                <span>{platform.icon}</span>
                <strong>{platform.label}</strong>
                {!platform.enabled && <em>暂未支持</em>}
              </button>
            ))}
          </div>
        </section>
        <section className="modalSection">
          <h3>添加到分组</h3>
          <input value={modal.groupName} onChange={(event) => onChange((current) => ({ ...current, groupName: event.target.value }))} />
        </section>
        <section className="modalSection">
          <h3>使用代理IP</h3>
          <select value={modal.proxyMode} onChange={(event) => onChange((current) => ({ ...current, proxyMode: event.target.value }))}>
            <option value="none">不使用</option>
          </select>
          <small>代理服务器管理后续在设置中补充。</small>
        </section>
        {modal.showCookieInput && (
          <section className="modalSection">
            <h3>导入 CK(cookie)</h3>
            <textarea value={modal.cookieText} onChange={(event) => onChange((current) => ({ ...current, cookieText: event.target.value }))} placeholder="粘贴 Cookie JSON 数组" />
          </section>
        )}
        <div className="modalActions">
          <button type="button" onClick={onClose}>取消</button>
          <button
            type="button"
            onClick={() => {
              if (modal.showCookieInput) onCookieAdd();
              else onChange((current) => ({ ...current, showCookieInput: true }));
            }}
            disabled={busy || !selectedPlatform?.enabled}
          >
            导入CK(cookie)添加
          </button>
          <button type="button" className="primaryButton" onClick={onLoginAdd} disabled={busy || !selectedPlatform?.enabled}>打开登录页面添加</button>
        </div>
      </div>
    </div>
  );
}

function SocialBrowserToolbar({ account, state, onHome, onPublish, onWorks, onData, onBack, onForward, onReload }) {
  return (
    <div className="socialToolbar">
      <div className="actions actionWrap">
        <button type="button" onClick={onBack} disabled={!account || !state.canGoBack}>后退</button>
        <button type="button" onClick={onForward} disabled={!account || !state.canGoForward}>前进</button>
        <button type="button" onClick={onReload} disabled={!account}>刷新</button>
        <button type="button" onClick={onHome} disabled={!account}>主页</button>
        <button type="button" onClick={onPublish} disabled={!account}>发布</button>
        <button type="button" onClick={onWorks} disabled={!account}>作品</button>
        <button type="button" onClick={onData} disabled={!account}>数据</button>
      </div>
      <div className="socialAddress">{state.url || '未打开平台后台'}</div>
    </div>
  );
}

function platformLabel(platforms, value) {
  return platforms.find((platform) => platform.value === value)?.label || value;
}

function SimpleImageFileList({ title, files, selectedPaths, onToggle, onSelectAll, onClear }) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <h2>{title}</h2>
        <div className="tableActions">
          <span>{files.length} 个文件，已选 {selectedPaths.length} 个</span>
          <button onClick={onSelectAll} disabled={files.length === 0}>全选</button>
          <button onClick={onClear} disabled={selectedPaths.length === 0}>清空</button>
        </div>
      </div>
      <div className="aiFileList">
        {files.map((file) => (
          <button className="aiFileItem" key={file.absolutePath} onClick={() => onToggle(file.absolutePath)}>
            <input type="checkbox" readOnly checked={selectedPaths.includes(file.absolutePath)} />
            <span>
              <strong>{file.relativePath}</strong>
              <small>{formatBytes(file.sizeBytes)}</small>
            </span>
            <em className="clean">{file.extension.toUpperCase()}</em>
          </button>
        ))}
        {files.length === 0 && <div className="empty">请选择目录并扫描</div>}
      </div>
    </div>
  );
}

function DuplicateCombinationSummary({ options, fileCount }) {
  const quality = parseQualityValues(buildQualityRange(options));
  const size = parseSizeValues(buildSizeRange(options));
  const brightness = parseBrightnessValues(buildBrightnessRange(options));
  const qualityCount = quality.values.length;
  const sizeCount = size.values.length;
  const brightnessCount = brightness.values.length;
  const combinations = qualityCount * sizeCount * brightnessCount;
  const errors = [quality.error, size.error, brightness.error].filter(Boolean);

  return (
    <>
      <div className="combinationSummary">
        <span>质量 {qualityCount}</span>
        <span>尺寸 {sizeCount}</span>
        <span>亮度 {brightnessCount}</span>
        <strong>{combinations} 套 / {combinations * fileCount} 张</strong>
      </div>
      {errors.length > 0 && <div className="inputError">{errors.join('；')}</div>}
    </>
  );
}

function ProgressBar({ progress, label, detail }) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));

  return (
    <div className="progressBox">
      <div className="progressMeta">
        <span>{label}</span>
        <strong>{safeProgress}%</strong>
      </div>
      <div className="progressTrack">
        <div className="progressFill" style={{ width: `${safeProgress}%` }} />
      </div>
      <small title={detail}>{detail}</small>
    </div>
  );
}

function viewTitle(activeView) {
  if (activeView === 'image') return '图片批量处理';
  if (activeView === 'video') return '视频封面处理';
  if (activeView === 'sync') return 'Web 协同';
  if (activeView === 'socialAccounts') return '账号管理';
  if (activeView === 'socialWorks') return '作品管理';
  if (activeView === 'localWorks') return '本地作品管理';
  if (activeView === 'oneClickPublish') return '一键发布';
  if (activeView === 'removeAiMark') return '去AI标识';
  if (activeView === 'imageDuplicate') return '图片复制';
  if (activeView === 'wechatMarkdown') return '公众号转MD';
  if (activeView === 'articleRewrite') return '文章重写';
  if (activeView === 'aiModelConfig') return 'AI模型配置';
  if (activeView === 'aiParamLibrary') return 'AI提示词库';
  return '本地素材库';
}

function viewSubtitle(activeView) {
  if (activeView === 'image') return '对选中的图片执行尺寸调整、压缩、EXIF 清理和模板渲染。';
  if (activeView === 'video') return '从选中的视频中截取封面，并生成横竖屏适配结果。';
  if (activeView === 'sync') return '连接 MediapolotX Web，获取任务队列并回传处理状态。';
  if (activeView === 'socialAccounts') return '管理公众号和小红书账号，使用独立 Cookie/session 打开真实平台后台。';
  if (activeView === 'socialWorks') return '打开公众号和小红书作品管理页，后续接入作品数据抓取。';
  if (activeView === 'localWorks') return '管理本机 Markdown 主作品和拆分后的自媒体子作品。';
  if (activeView === 'oneClickPublish') return '打开平台发布页并自动填充标题、正文和标签，最终发布由人工确认。';
  if (activeView === 'removeAiMark') return '工具集能力：面向图片中的 AI 标识、水印和平台痕迹处理。';
  if (activeView === 'imageDuplicate') return '按参数组合批量生成多套轻微不同的图片副本。';
  if (activeView === 'wechatMarkdown') return '下载微信公众号文章并保存为 Markdown 文件。';
  if (activeView === 'articleRewrite') return '导入资讯、公告或同行文章，调用 AI 深度重写并保存 Markdown。';
  if (activeView === 'aiModelConfig') return '集中管理后续 AI 功能共用的模型、密钥和连接参数。';
  if (activeView === 'aiParamLibrary') return '管理 AI 功能常用提示词模板，便于后续批量复用。';
  return '管理本机目录、移动硬盘和 NAS，建立本地 SQLite 索引。';
}

function lastPathSegment(basePath) {
  return basePath.split(/[\\/]/).filter(Boolean).at(-1) || '素材库';
}

function getSiblingBackupDir(folderPath) {
  const parts = folderPath.split(/[\\/]/).filter(Boolean);
  const name = parts.at(-1) || 'backup';
  const parent = folderPath.slice(0, Math.max(0, folderPath.length - name.length)).replace(/[\\/]$/, '');
  return `${parent}\\${name}_mediapolotx_backup`;
}

function statusClassName(status) {
  if (status === '已发布') return 'published';
  if (status === '部分发布') return 'partial';
  if (status === '发布失败') return 'failed';
  return 'draft';
}

function mainWorkPreviewItem(work) {
  return {
    id: work.id,
    platform: '主作品',
    title: work.title,
    content: '',
    tags: [],
    publishStatus: work.publishStatus,
    imagePaths: work.imagePaths || []
  };
}

function parseTagInput(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[\s,，、;；]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function parseQualityValues(value) {
  try {
    const values = parseNumberList(value).map((item) => Math.min(99, Math.max(60, Math.round(item))));
    return { values: [...new Set(values)] };
  } catch (error) {
    return { values: [], error: error.message };
  }
}

function buildQualityRange(options) {
  return buildNumericRange(options.qualityStart ?? 99, options.qualityEnd ?? 70, options.qualityStep ?? 1, 60, 99, 0)
    .map((value) => Math.round(value))
    .join(',');
}

function buildSizeRange(options) {
  const widths = buildNumericRange(options.widthStart ?? 5, options.widthEnd ?? 5, options.widthStep ?? 1, 1, 120, 0);
  const heights = buildNumericRange(options.heightStart ?? 5, options.heightEnd ?? 5, options.heightStep ?? 1, 1, 120, 0);
  const sizes = [];

  for (const width of widths) {
    for (const height of heights) {
      sizes.push(`${Math.round(width)}x${Math.round(height)}`);
    }
  }

  return [...new Set(sizes)].join(',');
}

function buildBrightnessRange(options) {
  return buildNumericRange(options.brightnessStart ?? 0, options.brightnessEnd ?? 0.01, options.brightnessStep ?? 0.01, -0.5, 0.5, 3)
    .map((value) => value.toFixed(3))
    .join(',');
}

function buildNumericRange(startValue, endValue, stepValue, min, max, decimals) {
  const start = clampNumber(Number(startValue), min, max);
  const end = clampNumber(Number(endValue), min, max);
  const step = Math.max(Math.abs(Number(stepValue) || 1), decimals > 0 ? 0.001 : 1);
  const values = [];
  const factor = 10 ** decimals;

  if (start >= end) {
    for (let value = start; value >= end; value -= step) values.push(roundTo(value, factor));
    if (values.at(-1) !== roundTo(end, factor)) values.push(roundTo(end, factor));
  } else {
    for (let value = start; value <= end; value += step) values.push(roundTo(value, factor));
    if (values.at(-1) !== roundTo(end, factor)) values.push(roundTo(end, factor));
  }

  return [...new Set(values)];
}

function clampNumber(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, factor) {
  return Math.round(value * factor) / factor;
}

function parseSizeValues(value) {
  try {
    const values = String(value).split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      const match = item.match(/^(\d{1,3})(?:x(\d{1,3}))?$/i);
      if (!match) throw new Error(`尺寸格式错误：${item}`);
      const width = Math.min(120, Math.max(1, Number(match[1])));
      const height = Math.min(120, Math.max(1, Number(match[2] || match[1])));
      return `${width}x${height}`;
    });
    return { values: [...new Set(values)] };
  } catch (error) {
    return { values: [], error: error.message };
  }
}

function parseBrightnessValues(value) {
  try {
    const values = parseNumberList(value).map((item) => Number(Math.min(0.5, Math.max(-0.5, item)).toFixed(3)));
    return { values: [...new Set(values)] };
  } catch (error) {
    return { values: [], error: error.message };
  }
}

function parseNumberList(value) {
  const items = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new Error('参数不能为空');
  return items.map((item) => {
    const number = Number(item);
    if (Number.isNaN(number)) throw new Error(`数字格式错误：${item}`);
    return number;
  });
}

export default App;
