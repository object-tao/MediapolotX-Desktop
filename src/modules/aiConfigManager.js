const axios = require('axios');

const SETTING_KEY = 'aiModelConfig';

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    textModel: 'gpt-4.1-mini',
    visionModel: 'gpt-4o-mini',
    modelsPath: '/models',
    auth: 'bearer'
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    textModel: 'gemini-2.0-flash',
    visionModel: 'gemini-2.0-flash',
    modelsPath: '/models',
    auth: 'bearer'
  },
  qwen: {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    textModel: 'qwen-plus',
    visionModel: 'qwen-vl-plus',
    modelsPath: '/models',
    auth: 'bearer'
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    textModel: 'deepseek-chat',
    visionModel: 'deepseek-chat',
    modelsPath: '/models',
    auth: 'bearer'
  },
  zhipu: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    textModel: 'glm-4-flash',
    visionModel: 'glm-4v-flash',
    modelsPath: '/models',
    auth: 'bearer'
  },
  doubao: {
    label: '豆包/火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    textModel: 'doubao-seed-1-6',
    visionModel: 'doubao-vision-pro',
    modelsPath: '/models',
    auth: 'bearer'
  },
  hunyuan: {
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    textModel: 'hunyuan-turbos-latest',
    visionModel: 'hunyuan-vision',
    modelsPath: '/models',
    auth: 'bearer'
  },
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    textModel: 'qwen2.5',
    visionModel: 'llava',
    modelsPath: '/models',
    auth: 'optional'
  },
  compatible: {
    label: 'OpenAI Compatible',
    baseUrl: 'https://api.example.com/v1',
    textModel: 'model-name',
    visionModel: 'vision-model-name',
    modelsPath: '/models',
    auth: 'bearer'
  }
};

function createAiConfigManager(settingsManager, safeStorage) {
  function getConfig() {
    const stored = settingsManager.get(SETTING_KEY, null);
    if (!stored) return getDefaultConfig();
    return {
      ...getDefaultConfig(stored.provider),
      ...stored,
      apiKey: decryptApiKey(stored.encryptedApiKey)
    };
  }

  function saveConfig(config) {
    const providerDefaults = getProviderDefaults(config.provider);
    const encryptedApiKey = config.apiKey ? encryptApiKey(config.apiKey) : config.encryptedApiKey || '';
    const stored = {
      enabled: Boolean(config.enabled),
      provider: config.provider || 'qwen',
      baseUrl: trimTrailingSlash(config.baseUrl || providerDefaults.baseUrl),
      textModel: config.textModel || providerDefaults.textModel,
      visionModel: config.visionModel || providerDefaults.visionModel,
      temperature: Number(config.temperature ?? 0.2),
      maxTokens: Number(config.maxTokens ?? 4096),
      encryptedApiKey
    };
    settingsManager.set(SETTING_KEY, stored);
    return { ...stored, apiKey: encryptedApiKey ? '********' : '' };
  }

  async function testConfig(config) {
    const merged = { ...getDefaultConfig(config.provider), ...config };
    const provider = getProviderDefaults(merged.provider);
    const apiKey = merged.apiKey || decryptApiKey(merged.encryptedApiKey);
    const headers = {};
    if (provider.auth !== 'optional' && !apiKey) {
      throw new Error('API Key 不能为空');
    }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await axios.get(`${trimTrailingSlash(merged.baseUrl)}${provider.modelsPath}`, {
      timeout: 15000,
      headers
    });
    const modelCount = Array.isArray(response.data?.data) ? response.data.data.length : 0;
    return {
      ok: true,
      provider: merged.provider,
      message: `连接成功${modelCount ? `，发现 ${modelCount} 个模型` : ''}`,
      modelCount
    };
  }

  function getProviders() {
    return Object.entries(PROVIDERS).map(([value, provider]) => ({ value, ...provider }));
  }

  function getDefaultConfig(provider = 'qwen') {
    const defaults = getProviderDefaults(provider);
    return {
      enabled: true,
      provider,
      baseUrl: defaults.baseUrl,
      textModel: defaults.textModel,
      visionModel: defaults.visionModel,
      temperature: 0.2,
      maxTokens: 4096,
      apiKey: '',
      encryptedApiKey: ''
    };
  }

  function encryptApiKey(apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统不支持 safeStorage 加密，未保存 API Key');
    }
    return safeStorage.encryptString(apiKey).toString('base64');
  }

  function decryptApiKey(encryptedApiKey) {
    if (!encryptedApiKey) return '';
    if (!safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'));
    } catch {
      return '';
    }
  }

  return {
    getConfig,
    saveConfig,
    testConfig,
    getProviders,
    getDefaultConfig
  };
}

function getProviderDefaults(provider) {
  return PROVIDERS[provider] || PROVIDERS.compatible;
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

module.exports = {
  createAiConfigManager,
  PROVIDERS
};
