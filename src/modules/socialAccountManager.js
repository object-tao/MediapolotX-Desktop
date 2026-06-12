const { randomUUID } = require('node:crypto');

const SETTING_KEY = 'socialAccounts';

const PLATFORMS = {
  xiaohongshu: {
    label: '小红书',
    homeUrl: 'https://creator.xiaohongshu.com/new/home',
    publishUrl: 'https://creator.xiaohongshu.com/new/publish',
    worksUrl: 'https://creator.xiaohongshu.com/new/creator/post',
    dataUrl: 'https://creator.xiaohongshu.com/new/data'
  },
  wechat: {
    label: '公众号',
    homeUrl: 'https://mp.weixin.qq.com/',
    publishUrl: 'https://mp.weixin.qq.com/',
    worksUrl: 'https://mp.weixin.qq.com/',
    dataUrl: 'https://mp.weixin.qq.com/'
  },
  douyin: {
    label: '抖音',
    homeUrl: 'https://creator.douyin.com/',
    publishUrl: 'https://creator.douyin.com/creator-micro/content/upload',
    worksUrl: 'https://creator.douyin.com/creator-micro/content/manage',
    dataUrl: 'https://creator.douyin.com/creator-micro/data'
  },
  shipinhao: {
    label: '视频号',
    homeUrl: 'https://channels.weixin.qq.com/platform',
    publishUrl: 'https://channels.weixin.qq.com/platform/post/create',
    worksUrl: 'https://channels.weixin.qq.com/platform/post/list',
    dataUrl: 'https://channels.weixin.qq.com/platform/data'
  }
};

function createSocialAccountManager(settingsManager) {
  function listAccounts() {
    return getStore().accounts;
  }

  function saveAccount(account) {
    const store = getStore();
    const normalized = normalizeAccount(account);
    const index = store.accounts.findIndex((item) => item.id === normalized.id);
    if (index >= 0) store.accounts[index] = normalized;
    else store.accounts.push(normalized);
    persist(store);
    return normalized;
  }

  function deleteAccount(accountId) {
    const store = getStore();
    store.accounts = store.accounts.filter((account) => account.id !== accountId);
    persist(store);
    return store.accounts;
  }

  function getAccount(accountId) {
    return getStore().accounts.find((account) => account.id === accountId) || null;
  }

  function getPlatform(platform) {
    return PLATFORMS[platform] || PLATFORMS.xiaohongshu;
  }

  function getStore() {
    const stored = settingsManager.get(SETTING_KEY, null);
    return {
      version: 1,
      accounts: Array.isArray(stored?.accounts) ? stored.accounts.map(normalizeAccount) : []
    };
  }

  function persist(store) {
    settingsManager.set(SETTING_KEY, {
      version: 1,
      accounts: store.accounts
    });
  }

  return {
    listAccounts,
    saveAccount,
    deleteAccount,
    getAccount,
    getPlatform,
    platforms: () => Object.entries(PLATFORMS).map(([value, platform]) => ({ value, ...platform }))
  };
}

function normalizeAccount(account = {}) {
  const platform = account.platform || 'xiaohongshu';
  const defaults = PLATFORMS[platform] || PLATFORMS.xiaohongshu;
  const now = new Date().toISOString();
  return {
    id: account.id || randomUUID(),
    platform,
    nickname: account.nickname || defaults.label,
    platformUserId: account.platformUserId || '',
    groupName: account.groupName || '默认分组',
    remark: account.remark || '',
    avatarUrl: account.avatarUrl || '',
    proxyId: account.proxyId || '',
    status: account.status || 'unknown',
    createdAt: account.createdAt || now,
    updatedAt: now
  };
}

module.exports = {
  createSocialAccountManager,
  PLATFORMS
};
