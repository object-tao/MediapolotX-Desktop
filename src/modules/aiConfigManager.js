const { randomUUID } = require('node:crypto');
const axios = require('axios');

const SETTING_KEY = 'aiModelConfig';

const PROVIDERS = {
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', visionModel: 'gpt-4o-mini', auth: 'bearer' },
  gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', visionModel: 'gemini-2.0-flash', auth: 'bearer' },
  qwen: { label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', visionModel: 'qwen-vl-plus', auth: 'bearer' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', visionModel: 'deepseek-chat', auth: 'bearer' },
  zhipu: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', visionModel: 'glm-4v-flash', auth: 'bearer' },
  doubao: { label: '豆包/火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-0-pro-260215', visionModel: 'doubao-seed-2-0-pro-260215', resourceId: '', auth: 'raw', testMode: 'responses' },
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
    if (provider.auth !== 'optional' && !apiKey) throw new Error('API Key 不能为空');
    const headers = createRequestHeaders(provider, apiKey);

    const modelName = getRequestModelName(normalized);
    if (!modelName) throw new Error('模型 ID 不能为空');
    try {
      const response = normalized.provider === 'doubao'
        ? await postResponsesRequest(normalized, headers, [{ role: 'user', content: 'ping' }], { maxTokens: 32, temperature: 0, timeout: 20000 })
        : await axios.post(buildChatCompletionsUrl(normalized.baseUrl), {
          model: modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
          temperature: 0
        }, { timeout: 20000, headers });
      return {
        ok: true,
        message: `连接成功，模型返回：${extractResponseText(response.data) || response.data?.choices?.[0]?.message?.content || response.data?.id || 'ok'}`
      };
    } catch (error) {
      throw new Error(formatTestError(error, normalized));
    }
  }

  async function completeText(options = {}) {
    const store = normalizeStore(settingsManager.get(SETTING_KEY, null));
    const model = findTextModel(store, options.modelId);
    if (!model) throw new Error('请先在“基础配置 > AI模型配置”中保存并设置默认文本模型');
    const provider = getProviderDefaults(model.provider);
    const apiKey = decryptApiKey(model.encryptedApiKey);
    if (provider.auth !== 'optional' && !apiKey) throw new Error('默认文本模型缺少 API Key');
    const headers = createRequestHeaders(provider, apiKey);

    try {
      if (model.provider === 'doubao') {
        const response = await postResponsesRequest(model, headers, options.messages, {
          temperature: Number(options.temperature ?? model.temperature ?? 0.5),
          maxTokens: Number(options.maxTokens ?? model.maxTokens ?? 4096),
          timeout: Number(options.timeout ?? 120000)
        });
        return {
          modelId: model.id,
          modelName: model.name,
          content: extractResponseText(response.data)
        };
      }
      const response = await axios.post(buildChatCompletionsUrl(model.baseUrl), {
        model: getRequestModelName(model),
        messages: options.messages,
        temperature: Number(options.temperature ?? model.temperature ?? 0.5),
        max_tokens: Number(options.maxTokens ?? model.maxTokens ?? 4096)
      }, { timeout: Number(options.timeout ?? 120000), headers });
      return {
        modelId: model.id,
        modelName: model.name,
        content: response.data?.choices?.[0]?.message?.content || ''
      };
    } catch (error) {
      throw new Error(formatTestError(error, model));
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
    completeText,
    getProviders,
    getModelTemplate
  };
}

function findTextModel(store, modelId) {
  if (modelId) return store.models.find((model) => model.id === modelId && model.enabled !== false);
  if (store.defaultTextModelId) {
    const defaultModel = store.models.find((model) => model.id === store.defaultTextModelId && model.enabled !== false);
    if (defaultModel) return defaultModel;
  }
  return store.models.find((model) => model.enabled !== false && ['text', 'both'].includes(model.type));
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
    baseUrl: normalizeProviderBaseUrl(provider, model.baseUrl || defaults.baseUrl),
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

function getRequestModelName(model) {
  return model.model;
}

function normalizeProviderBaseUrl(provider, baseUrl) {
  const normalized = trimTrailingSlash(baseUrl);
  if (provider === 'qwen' && /dashscope\.aliyuncs\.com/i.test(normalized)) {
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }
  return normalized.replace(/\/chat\/completions$/i, '');
}

function buildChatCompletionsUrl(baseUrl) {
  const normalized = trimTrailingSlash(baseUrl);
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

function createRequestHeaders(provider, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (!apiKey) return headers;
  headers.Authorization = provider.auth === 'raw' || /^Bearer\s+/i.test(apiKey)
    ? apiKey
    : `Bearer ${apiKey}`;
  return headers;
}

function messagesToResponsesInput(messages = []) {
  return messages.map((message) => ({
    role: message.role || 'user',
    content: Array.isArray(message.content)
      ? message.content
      : [{ type: 'input_text', text: String(message.content || '') }]
  }));
}

function postResponsesRequest(model, headers, messages, options = {}) {
  return axios.post(`${trimTrailingSlash(model.baseUrl)}/responses`, {
    model: getRequestModelName(model),
    input: messagesToResponsesInput(messages),
    temperature: Number(options.temperature ?? model.temperature ?? 0.5),
    max_output_tokens: Number(options.maxTokens ?? model.maxTokens ?? 4096)
  }, { timeout: Number(options.timeout ?? 120000), headers });
}

function extractResponseText(data) {
  if (!data) return '';
  if (typeof data.output_text === 'string') return data.output_text;
  if (Array.isArray(data.output)) {
    return data.output.flatMap((item) => (
      Array.isArray(item.content) ? item.content : []
    )).map((content) => content.text || '').filter(Boolean).join('\n');
  }
  return '';
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
    let hint = '请确认 API Base URL 以 /v1 或供应商兼容路径结尾，并确认模型 ID 正确。';
    if (model.provider === 'doubao') {
      hint = '豆包/火山方舟请确认 API Base URL 为 https://ark.cn-beijing.volces.com/api/v3，模型 ID 例如 doubao-seed-2-0-pro-260215，当前使用 /responses 接口。';
    }
    if (model.provider === 'qwen') {
      hint = '通义千问请确认 API Base URL 为 https://dashscope.aliyuncs.com/compatible-mode/v1，模型 ID 例如 qwen-plus、qwen-turbo、qwen-max，不要填写资源 ID。';
    }
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
