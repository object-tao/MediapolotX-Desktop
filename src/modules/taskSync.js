const axios = require('axios');
const config = require('../config/default');

function createTaskSync(options = {}) {
  const client = axios.create({
    baseURL: options.baseUrl || config.defaultApiBaseUrl,
    timeout: options.timeout || 30000,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    }
  });

  async function fetchTaskQueue(params = {}) {
    const response = await client.get('/desktop/tasks', { params });
    return response.data;
  }

  async function uploadIndex(payload) {
    const response = await client.post('/desktop/indexes', payload);
    return response.data;
  }

  async function uploadThumbnail(fileId, thumbnail) {
    const response = await client.post(`/desktop/files/${fileId}/thumbnail`, thumbnail);
    return response.data;
  }

  async function reportTaskStatus(taskId, status, detail = {}) {
    const response = await client.patch(`/desktop/tasks/${taskId}`, { status, detail });
    return response.data;
  }

  return {
    fetchTaskQueue,
    uploadIndex,
    uploadThumbnail,
    reportTaskStatus
  };
}

module.exports = {
  createTaskSync
};
