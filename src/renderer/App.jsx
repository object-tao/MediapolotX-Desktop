import { useCallback, useEffect, useMemo, useState } from 'react';

const storageTypes = [
  { value: 'local', label: '本机目录' },
  { value: 'removable', label: '移动硬盘' },
  { value: 'nas', label: 'NAS' }
];

function App() {
  const [appStatus, setAppStatus] = useState(null);
  const [storages, setStorages] = useState([]);
  const [selectedStorageId, setSelectedStorageId] = useState('');
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'local', basePath: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedStorage = useMemo(
    () => storages.find((storage) => storage.id === selectedStorageId),
    [storages, selectedStorageId]
  );

  const loadFiles = useCallback(async (storageId = selectedStorageId) => {
    if (!storageId) return;
    const list = await window.mediapolotx.scanner.listFiles({ storageId, limit: 200 });
    setFiles(list);
  }, [selectedStorageId]);

  const refreshStorages = useCallback(async () => {
    const list = await window.mediapolotx.storage.list();
    setStorages(list);
    if (!selectedStorageId && list[0]) {
      setSelectedStorageId(list[0].id);
      loadFiles(list[0].id);
    }
  }, [loadFiles, selectedStorageId]);

  useEffect(() => {
    window.mediapolotx.getStatus().then(setAppStatus);
    refreshStorages();

    const off = window.mediapolotx.scanner.onEvent((event) => {
      setMessage(`监听事件：${event.type}`);
      if (event.storageId === selectedStorageId) {
        loadFiles(event.storageId);
      }
    });
    return off;
  }, [loadFiles, refreshStorages, selectedStorageId]);

  async function selectDirectory() {
    const basePath = await window.mediapolotx.selectDirectory();
    if (basePath) {
      setForm((current) => ({
        ...current,
        basePath,
        name: current.name || basePath.split(/[\\/]/).filter(Boolean).at(-1) || '素材库'
      }));
    }
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>MediapolotX</strong>
          <span>Desktop</span>
        </div>
        <nav>
          <button className="navItem active">素材库</button>
          <button className="navItem">图片处理</button>
          <button className="navItem">视频封面</button>
          <button className="navItem">任务同步</button>
        </nav>
        <div className="runtime">
          <span>版本 {appStatus?.version || '-'}</span>
          <span>{appStatus?.userDataPath || ''}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>本地素材库</h1>
            <p>管理本机目录、移动硬盘和 NAS，建立本地 SQLite 索引。</p>
          </div>
          <div className="actions">
            <button onClick={scanSelectedStorage} disabled={!selectedStorage || busy}>扫描</button>
            <button onClick={watchSelectedStorage} disabled={!selectedStorage}>监听</button>
          </div>
        </header>

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
                  <button type="button" onClick={selectDirectory}>选择</button>
                </div>
              </label>
              <button type="submit" disabled={busy}>添加</button>
            </form>
          </div>

          <div className="panel">
            <h2>素材库列表</h2>
            <div className="storageList">
              {storages.map((storage) => (
                <button
                  className={`storageItem ${storage.id === selectedStorageId ? 'selected' : ''}`}
                  key={storage.id}
                  onClick={() => {
                    setSelectedStorageId(storage.id);
                    loadFiles(storage.id);
                  }}
                >
                  <span>
                    <strong>{storage.name}</strong>
                    <small>{storage.basePath}</small>
                  </span>
                  <em className={storage.status}>{storage.status}</em>
                  <span className="storageActions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => checkOnline(storage)}>检测</button>
                  </span>
                </button>
              ))}
              {storages.length === 0 && <div className="empty">暂无素材库</div>}
            </div>
          </div>
        </section>

        <section className="panel filesPanel">
          <div className="panelHeader">
            <h2>最近索引文件</h2>
            <span>{files.length} 个</span>
          </div>
          <div className="fileTable">
            <div className="fileRow head">
              <span>类型</span>
              <span>路径</span>
              <span>大小</span>
              <span>状态</span>
            </div>
            {files.map((file) => (
              <div className="fileRow" key={file.id}>
                <span>{file.fileType}</span>
                <span title={file.absolutePath}>{file.relativePath}</span>
                <span>{formatBytes(file.sizeBytes)}</span>
                <span>{file.processingStatus}</span>
              </div>
            ))}
            {files.length === 0 && <div className="empty">选择素材库后执行扫描</div>}
          </div>
        </section>

        {message && <div className="toast">{message}</div>}
      </main>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default App;
