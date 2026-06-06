import { useCallback, useEffect, useMemo, useState } from 'react';

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

function App() {
  const [appStatus, setAppStatus] = useState(null);
  const [activeView, setActiveView] = useState('library');
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

  useEffect(() => {
    window.mediapolotx.getStatus().then(setAppStatus);
    window.mediapolotx.settings.getAll().then((settings) => {
      if (settings.syncOptions) setSyncOptions(settings.syncOptions);
      if (settings.imageOptions) setImageOptions((current) => ({ ...current, ...settings.imageOptions }));
      if (settings.videoOptions) setVideoOptions((current) => ({ ...current, ...settings.videoOptions }));
    });
    refreshStorages();
    refreshTasks();

    const off = window.mediapolotx.scanner.onEvent((event) => {
      setMessage(`监听事件：${event.type}`);
      if (event.storageId === selectedStorageId) {
        loadFiles(event.storageId);
      }
    });
    return off;
  }, [loadFiles, refreshStorages, refreshTasks, selectedStorageId]);

  async function selectDirectory(setter) {
    const basePath = await window.mediapolotx.selectDirectory();
    if (basePath) setter(basePath);
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

  async function openPath(targetPath) {
    const result = await window.mediapolotx.openPath(targetPath);
    if (!result.opened) setMessage(result.errorMessage || '无法打开路径');
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
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>MediapolotX</strong>
          <span>Desktop</span>
        </div>
        <nav>
          <button className={`navItem ${activeView === 'library' ? 'active' : ''}`} onClick={() => setActiveView('library')}>素材库</button>
          <button className={`navItem ${activeView === 'image' ? 'active' : ''}`} onClick={() => setActiveView('image')}>图片处理</button>
          <button className={`navItem ${activeView === 'video' ? 'active' : ''}`} onClick={() => setActiveView('video')}>视频封面</button>
          <button className={`navItem ${activeView === 'sync' ? 'active' : ''}`} onClick={() => setActiveView('sync')}>任务同步</button>
          <div className="navGroup">
            <div className="navGroupTitle">工具集</div>
            <button className={`navItem subItem ${activeView === 'removeAiMark' ? 'active' : ''}`} onClick={() => setActiveView('removeAiMark')}>去AI标识</button>
          </div>
        </nav>
        <div className="runtime">
          <span>版本 {appStatus?.version || '-'}</span>
          <span>{appStatus?.userDataPath || ''}</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewTitle(activeView)}</h1>
            <p>{viewSubtitle(activeView)}</p>
          </div>
          <div className="actions">
            <button onClick={scanSelectedStorage} disabled={!selectedStorage || busy}>扫描</button>
            <button onClick={watchSelectedStorage} disabled={!selectedStorage}>监听</button>
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

        {activeView === 'removeAiMark' && (
          <section className="contentGrid">
            <div className="panel">
              <h2>去AI标识</h2>
              <div className="toolIntro">
                <p>用于处理图片中的 AI 生成标识、水印或平台痕迹。当前已接入菜单入口，后续会在这里加入检测、预览、批量处理和结果导出。</p>
              </div>
              <div className="form">
                <button disabled>选择图片区域</button>
                <button disabled>批量去除</button>
              </div>
            </div>
            <SelectionSummary selectedImages={selectedImages} selectedVideos={selectedVideos} />
          </section>
        )}

        <FileTable
          files={files}
          selectedFileIds={selectedFileIds}
          selectedStorage={selectedStorage}
          onToggle={toggleFile}
          onSelectAll={selectAllVisible}
          onClear={clearSelection}
        />

        {activeView !== 'sync' && <TaskList tasks={tasks} compact onOpenPath={openPath} />}
        {message && <div className="toast">{message}</div>}
      </main>
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

function viewTitle(activeView) {
  if (activeView === 'image') return '图片批量处理';
  if (activeView === 'video') return '视频封面处理';
  if (activeView === 'sync') return 'Web 协同';
  if (activeView === 'removeAiMark') return '去AI标识';
  return '本地素材库';
}

function viewSubtitle(activeView) {
  if (activeView === 'image') return '对选中的图片执行尺寸调整、压缩、EXIF 清理和模板渲染。';
  if (activeView === 'video') return '从选中的视频中截取封面，并生成横竖屏适配结果。';
  if (activeView === 'sync') return '连接 MediapolotX Web，获取任务队列并回传处理状态。';
  if (activeView === 'removeAiMark') return '工具集能力：面向图片中的 AI 标识、水印和平台痕迹处理。';
  return '管理本机目录、移动硬盘和 NAS，建立本地 SQLite 索引。';
}

function lastPathSegment(basePath) {
  return basePath.split(/[\\/]/).filter(Boolean).at(-1) || '素材库';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default App;
