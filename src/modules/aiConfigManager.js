const { randomUUID } = require('node:crypto');
const axios = require('axios');

const SETTING_KEY = 'aiModelConfig';

const PROVIDERS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', visionModel: 'gpt-4o-mini', auth: 'bearer' },
  gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', visionModel: 'gemini-2.0-flash', auth: 'bearer' },
  qwen: { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', visionModel: 'qwen-vl-plus', auth: 'bearer' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', visionModel: 'deepseek-chat', auth: 'bearer' },
  zhipu: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', visionModel: 'glm-4v-flash', auth: 'bearer' },
  doubao: { label: '豆包/火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-1-6', visionModel: 'doubao-vision-pro', resourceId: '', auth: 'bearer', testMode: 'chat' },
  hunyuan: { label: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbos-latest', visionModel: 'hunyuan-vision', auth: 'bearer' },
  ollama: { label: 'Ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5', visionModel: 'llava', auth: 'optional' },
  compatible: { label: 'OpenAI Compatible', baseUrl: 'https://api.example.com/v1', model: 'model-name', visionModel: 'vision-model-name', auth: 'bearer' }
};

function createAiConfigManager(settingsManager, safeStorage) {
  function getConfig() {
    const stored = normalizeStore(settingsManager.get(SETTING_KEY, null));
    return {
      ...stored,
      models: stored.models.map(maskModel)
    };
  }

  function saveModel(model) {
    const store = normalizeStore(settingsManager.get(SETTING_KEY, null));
    const normalized = normalizeModel(model);
    const existing = store.models.find((item) => item.id === normalized.id);
    const encryptedApiKey = normalized.apiKey
      ? encryptApiKey(normalized.apiKey)
      : existing?.encryptedApiKey || normalized.encryptedApiKey || '';
    const savedModel = {
      ...normalized,
      encryptedApiKey
    };
    delete savedModel.apiKey;

    const index = store.models.findIndex((item) => item.id === savedModel.id);
    if (index >= 0) store.models[index] = savedModel;
    else store.models.push(savedModel);

    if (!store.defaultTextModelId && savedModel.enabled && ['text', 'both'].includes(savedModel.type)) {
      store.defaultTextModelId = savedModel.id;
    }
    if (!store.defaultVisionModelId && savedModel.enabled && ['vision', 'both'].includes(savedModel.type)) {
      store.defaultVisionModelId = savedModel.id;
    }

    persistStore(store);
    return maskModel(savedModel);
  }

  function deleteModel(modelId) {
    const store = normalizeStore(settingsManager.get(SETTING_KEY, null));
    store.models = store.models.filter((model) => model.id !== modelId);
    if (store.defaultTextModelId === modelId) store.defaultTextModelId = '';
    if (store.defaultVisionModelId === modelId) store.defaultVisionModelId = '';
    persistStore(store);
    return getConfig();
  }

  function setDefault(kind, modelId) {
    const store = normalizeStore(settingsManager.get(SETTING_KEY, null));
    if (!store.models.some((model) => model.id === modelId)) throw new Error('模型不存在');
    if (kind === 'vision') store.defaultVisionModelId = modelId;
    else store.defaultTextModelId = modelId;
    persistStore(store);
    return getConfig();
  }

  async function testModel(model) {
    const normalized = normalizeModel(model);
    const store = normalizeStore(settingsManager.get(SETTING_KEY, null));
    const existing = store.models.find((item) => item.id === normalized.id);
    const provider = getProviderDefaults(normalized.provider);
    const apiKey = normalized.apiKey || decryptApiKey(normalized.encryptedApiKey || existing?.encryptedApiKey);
    const headers = { 'Content-Type': 'application/json' };
    if (provider.auth !== 'optional' && !apiKey) throw new Error('API Key 不能为空');
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const modelName = normalized.resourceId || normalized.model;
    if (!modelName) throw new Error('模型 ID 或资源 ID 不能为空');
    try {
      const response = await axios.post(`${trimTrailingSlash(normalized.baseUrl)}/chat/completions`, {
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        temperature: 0
      }, { timeout: 20000, headers });
      return {
        ok: true,
        message: `连接成功，模型返回：${response.data?.choices?.[0]?.message?.content || response.data?.id || 'ok'}`
      };
    } catch (error) {
      throw new Error(formatTestError(error, normalized));
    }
  }

  function getProviders() {
    return Object.entries(PROVIDERS).map(([value, provider]) => ({ value, ...provider }));
  }

  function getModelTemplate(provider = 'qwen') {
    return maskModel(normalizeModel({ provider }));
  }

  function persistStore(store) {
    settingsManager.set(SETTING_KEY, {
      version: 2,
      models: store.models,
      defaultTextModelId: store.defaultTextModelId || '',
      defaultVisionModelId: store.defaultVisionModelId || ''
    });
  }

  function encryptApiKey(apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统不支持 safeStorage 加密，未保存 API Key');
    }
    return safeStorage.encryptString(apiKey).toString('base64');
  }

  function decryptApiKey(encryptedApiKey) {
    if (!encryptedApiKey || !safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'));
    } catch {
      return '';
    }
  }

  return {
    getConfig,
    saveModel,
    deleteModel,
    setDefault,
    testModel,
    getProviders,
    getModelTemplate
  };
}

function normalizeStore(stored) {
  if (!stored) return { version: 2, models: [], defaultTextModelId: '', defaultVisionModelId: '' };
  if (Array.isArray(stored.models)) {
    return {
      version: 2,
      models: stored.models.map(normalizeModel),
      defaultTextModelId: stored.defaultTextModelId || '',
      defaultVisionModelId: stored.defaultVisionModelId || ''
    };
  }

  const migrated = normalizeModel({
    name: `${getProviderDefaults(stored.provider).label} 默认模型`,
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    encryptedApiKey: stored.encryptedApiKey,
    resourceId: stored.resourceId,
    model: stored.textModel,
    type: 'both',
    temperature: stored.temperature,
    maxTokens: stored.maxTokens,
    enabled: stored.enabled
  });
  return {
    version: 2,
    models: [migrated],
    defaultTextModelId: migrated.id,
    defaultVisionModelId: migrated.id
  };
}

function normalizeModel(model = {}) {
  const provider = model.provider || 'qwen';
  const defaults = getProviderDefaults(provider);
  return {
    id: model.id || randomUUID(),
    name: model.name || `${defaults.label} ${model.model || defaults.model}`,
    provider,
    baseUrl: trimTrailingSlash(model.baseUrl || defaults.baseUrl),
    encryptedApiKey: model.encryptedApiKey || '',
    apiKey: model.apiKey || '',
    resourceId: model.resourceId || defaults.resourceId || '',
    model: model.model || defaults.model,
    type: model.type || 'both',
    temperature: Number(model.temperature ?? 0.2),
    maxTokens: Number(model.maxTokens ?? 4096),
    enabled: model.enabled !== false
  };
}

function maskModel(model) {
  const { encryptedApiKey, ...safeModel } = model;
  return {
    ...safeModel,
    apiKey: '',
    hasApiKey: Boolean(encryptedApiKey)
  };
}

function getProviderDefaults(provider) {
  return PROVIDERS[provider] || PROVIDERS.compatible;
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function formatTestError(error, model) {
  const status = error.response?.status;
  const remoteMessage = error.response?.data?.error?.message
    || error.response?.data?.message
    || error.response?.data?.error
    || error.message;
  if (status === 404) {
    const hint = model.provider === 'doubao'
      ? '豆包/火山方舟请确认 API Base URL 为 https://ark.cn-beijing.volces.com/api/v3，资源 ID 应使用控制台里的 Endpoint ID，通常以 ep- 开头，不是 API Key。'
      : '请确认 API Base URL 以 /v1 或供应商兼容路径结尾，并确认模型 ID 正确。';
    return `接口返回 404：${hint}`;
  }
  if (status === 401 || status === 403) {
    return `鉴权失败 ${status}：请检查 API Key 是否正确、是否有该模型权限。`;
  }
  if (status) {
    return `接口返回 ${status}：${remoteMessage}`;
  }
  return `连接失败：${remoteMessage}`;
}

module.exports = {
  createAiConfigManager,
  PROVIDERS
};
