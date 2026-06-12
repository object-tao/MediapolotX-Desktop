const { randomUUID } = require('node:crypto');

const SETTING_KEY = 'networkProxies';

function createProxyManager(settingsManager) {
  function getStore() {
    const stored = settingsManager.get(SETTING_KEY, null);
    return {
      version: 1,
      proxies: Array.isArray(stored?.proxies) ? stored.proxies.map(normalizeProxy) : []
    };
  }

  function persist(store) {
    settingsManager.set(SETTING_KEY, {
      version: 1,
      proxies: store.proxies
    });
  }

  function listProxies() {
    return getStore().proxies;
  }

  function saveProxy(proxy) {
    const store = getStore();
    const normalized = normalizeProxy(proxy);
    const index = store.proxies.findIndex((item) => item.id === normalized.id);
    if (index >= 0) store.proxies[index] = normalized;
    else store.proxies.push(normalized);
    persist(store);
    return normalized;
  }

  function deleteProxy(proxyId) {
    const store = getStore();
    store.proxies = store.proxies.filter((proxy) => proxy.id !== proxyId);
    persist(store);
    return store.proxies;
  }

  function getProxy(proxyId) {
    if (!proxyId || proxyId === 'none') return null;
    return getStore().proxies.find((proxy) => proxy.id === proxyId) || null;
  }

  return {
    listProxies,
    saveProxy,
    deleteProxy,
    getProxy
  };
}

function normalizeProxy(proxy = {}) {
  const now = new Date().toISOString();
  return {
    id: proxy.id || randomUUID(),
    name: String(proxy.name || proxy.host || '新代理').trim(),
    type: ['http', 'https', 'socks5'].includes(proxy.type) ? proxy.type : 'http',
    host: String(proxy.host || '').trim(),
    port: Number(proxy.port || 0),
    username: String(proxy.username || '').trim(),
    password: String(proxy.password || ''),
    enabled: proxy.enabled !== false,
    remark: String(proxy.remark || '').trim(),
    createdAt: proxy.createdAt || now,
    updatedAt: now
  };
}

module.exports = {
  createProxyManager
};
