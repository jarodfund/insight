const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Worker } = require("node:worker_threads");
const { runtimeDirectory } = require("./product-paths.cjs");
const { SessionManager, getDefaultSessionDir } = require(path.join(runtimeDirectory, "node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"));
const { readJson, writeJson } = require("./agent-config.cjs");
let indexWorker;
const indexRequests = new Map();

function scanInWorker(data) {
  if (!indexWorker) {
    const worker = new Worker(path.join(__dirname, "history-index-worker.cjs"));
    indexWorker = worker;
    worker.on("message", ({ id, result, error }) => {
      const request = indexRequests.get(id);
      indexRequests.delete(id);
      if (error) request?.reject(new Error(error));
      else request?.resolve(result);
      if (!indexRequests.size) worker.unref();
    });
    worker.on("error", (error) => {
      for (const request of indexRequests.values()) request.reject(error);
      indexRequests.clear(); indexWorker = null;
    });
    worker.on("exit", () => {
      if (indexWorker !== worker) return;
      for (const request of indexRequests.values()) request.reject(new Error("会话索引进程已退出。"));
      indexRequests.clear(); indexWorker = null;
    });
  }
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    indexRequests.set(id, { resolve, reject });
    indexWorker.ref();
    indexWorker.postMessage({ id, data });
  });
}

function pathKey(value) {
  let normalized = path.resolve(value);
  try { normalized = fs.realpathSync.native(normalized); } catch { /* Keep missing paths addressable. */ }
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

class Library {
  constructor(file, sessionRoots) {
    this.file = file;
    this.roots = [...new Set(sessionRoots.map((root) => path.resolve(root)))];
    this.data = { workspaces: [], dismissed: [], sessions: {}, ...readJson(file) };
    this.indexFile = `${file}.index.json`;
    try { this.index = readJson(this.indexFile).entries || {}; } catch { this.index = {}; }
    this.catalog = Object.values(this.index).map((entry) => entry.info).filter((info) => info && typeof info.path === "string" && typeof info.cwd === "string");
    this.parsedFiles = 0;
    this.scanning = null;
    this.scannedAt = 0;
    this.scanCacheMs = 15000;
    this.onRefresh = () => {};
    this.onError = () => {};
    this.revision = 0;
    this.deleted = new Set();
  }

  save() {
    writeJson(this.file, this.data);
  }

  workspace(cwd) {
    return this.data.workspaces.find((item) => pathKey(item.cwd) === pathKey(cwd));
  }

  add(cwd) {
    if (typeof cwd !== "string" || !path.isAbsolute(cwd)) throw new Error("请选择工作区目录。");
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("工作区目录不存在或无法访问。");
    const resolved = fs.realpathSync.native(cwd);
    const existing = this.workspace(resolved);
    if (existing) return existing;
    const workspace = { id: randomUUID(), cwd: resolved };
    this.data.workspaces.push(workspace);
    this.data.dismissed = this.data.dismissed.filter((item) => item !== pathKey(resolved));
    this.save();
    return workspace;
  }

  remove(id, activeCwd) {
    const workspace = this.data.workspaces.find((item) => item.id === id);
    if (!workspace) throw new Error("工作区已不在列表中。");
    if (pathKey(workspace.cwd) === pathKey(activeCwd)) throw new Error("请先切换到其他工作区再移除。");
    this.data.workspaces = this.data.workspaces.filter((item) => item.id !== id);
    this.data.dismissed.push(pathKey(workspace.cwd));
    this.save();
  }

  select(cwd, sessionPath) {
    const workspace = this.workspace(cwd);
    if (!workspace) return;
    if (sessionPath && this.isArchived(sessionPath)) sessionPath = null;
    if (workspace.lastSession === (sessionPath || null)) return;
    workspace.lastSession = sessionPath || null;
    this.save();
  }

  lastSession(cwd) {
    const file = this.workspace(cwd)?.lastSession;
    return file && !this.isArchived(file) && fs.existsSync(file) && (!this.scannedAt || this.catalog.some((item) => pathKey(item.path) === pathKey(file) && pathKey(item.cwd) === pathKey(cwd))) ? file : undefined;
  }

  createSession(cwd) {
    const session = SessionManager.create(cwd, getDefaultSessionDir(cwd, path.dirname(this.roots[0])));
    // Pi normally writes on the first reply. A header alone lets its native
    // switch_session establish the target cwd without restarting the process.
    const file = session.getSessionFile();
    fs.writeFileSync(file, `${JSON.stringify(session.getHeader())}\n`, { flag: "wx" });
    this.invalidate();
    return file;
  }

  preserveEmptySession(cwd, state) {
    // Call only after the native runtime leaves this session: its first reply
    // uses exclusive creation. Keep unsent drafts addressable without racing
    // that writer or adding a message to the model context.
    const header = SessionManager.inMemory(cwd, { id: state.sessionId }).getHeader();
    try { fs.writeFileSync(state.sessionFile, `${JSON.stringify(header)}\n`, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    this.invalidate();
  }

  invalidate() {
    this.scannedAt = 0;
    this.revision++;
  }

  recordTask(sessionPath, task) {
    if (!sessionPath || !task || task.status === "running") return;
    const key = pathKey(sessionPath);
    const metadata = this.data.sessions[key] ??= {};
    const tasks = metadata.tasks ??= [];
    const index = tasks.findIndex((item) => item.id === task.id);
    if (index >= 0 && JSON.stringify(tasks[index]) === JSON.stringify(task)) return false;
    if (index < 0) tasks.push(task);
    else tasks[index] = task;
    this.save();
    this.invalidate();
    return true;
  }

  tasks(sessionPath) {
    return sessionPath ? this.data.sessions[pathKey(sessionPath)]?.tasks || [] : [];
  }

  rename(sessionPath, name) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) throw new Error("对话名称需要 1 到 120 个字符。");
    const metadata = this.data.sessions[pathKey(sessionPath)] ??= {};
    metadata.name = name.trim();
    this.save();
  }

  isArchived(sessionPath) {
    return this.data.sessions[pathKey(sessionPath)]?.archived === true;
  }

  async setArchived(file, archived) {
    const session = await this.findSession(file);
    const previous = structuredClone(this.data);
    const metadata = this.data.sessions[pathKey(session.path)] ??= {};
    metadata.archived = archived;
    if (archived) for (const workspace of this.data.workspaces) {
      if (workspace.lastSession && pathKey(workspace.lastSession) === pathKey(session.path)) workspace.lastSession = null;
    }
    try { this.save(); }
    catch (error) { this.data = previous; throw error; }
  }

  async deleteSession(file) {
    const session = await this.findSession(file);
    const key = pathKey(session.path);
    const stat = fs.lstatSync(session.path);
    // Never let a renderer-supplied path, symlink, or stale catalog entry
    // turn a conversation deletion into removal of an arbitrary user file.
    const insideRoot = this.roots.some((root) => {
      const relative = path.relative(pathKey(root), key);
      return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
    if (!insideRoot || !stat.isFile() || stat.isSymbolicLink() || path.extname(session.path) !== ".jsonl") throw new Error("只能删除会话目录中的原生会话记录。");
    const previous = structuredClone(this.data);
    delete this.data.sessions[key];
    for (const workspace of this.data.workspaces) {
      if (workspace.lastSession && pathKey(workspace.lastSession) === key) workspace.lastSession = null;
    }
    try { this.save(); }
    catch (error) { this.data = previous; throw error; }
    try { fs.unlinkSync(session.path); }
    catch (error) { this.data = previous; this.save(); throw error; }
    this.deleted.add(key);
    this.catalog = this.catalog.filter((item) => pathKey(item.path) !== key);
    this.invalidate();
  }

  async scan(force = true) {
    if (this.scanning) return force ? this.scanning : this.catalog;
    if (!force && this.scannedAt && Date.now() - this.scannedAt < this.scanCacheMs) return this.catalog;
    const revision = this.revision;
    const scan = (async () => {
      // Native parsing stays in a worker. Only changed files are parsed, and no
      // message bodies or images cross back into the window's main process.
      const result = await scanInWorker({ roots: this.roots, previous: this.index });
      this.index = result.entries;
      this.parsedFiles = result.parsed;
      this.catalog = Object.values(this.index).map((entry) => entry.info).filter((item) => !this.deleted.has(item.key)).sort((a, b) => b.modified - a.modified);
      const temporary = `${this.indexFile}.tmp`;
      await fs.promises.writeFile(temporary, JSON.stringify({ entries: this.index }), { mode: 0o600 });
      await fs.promises.rename(temporary, this.indexFile);
      if (revision === this.revision) this.scannedAt = Date.now();
      return this.catalog;
    })();
    this.scanning = scan;
    if (!force) {
      // Library reads are on the navigation path. Return the cached catalog
      // immediately and refresh it in the worker; the UI receives a change
      // event when the new index is ready.
      void scan.then(() => this.onRefresh(), (error) => this.onError(error)).finally(() => {
        if (this.scanning === scan) this.scanning = null;
      });
      return this.catalog;
    }
    try { return await scan; }
    finally { if (this.scanning === scan) this.scanning = null; }
  }

  async initialize(cwd, { background = false, onRefresh = () => {}, onError = () => {} } = {}) {
    this.add(cwd);
    if (background) {
      this.onRefresh = onRefresh;
      this.onError = onError;
      void this.initialize(cwd).then(onRefresh, onError);
      return;
    }
    await this.scan();
    const known = new Set([...this.data.workspaces.map((item) => pathKey(item.cwd)), ...this.data.dismissed]);
    for (const session of this.catalog) {
      const key = process.platform === "win32" ? session.cwd.toLowerCase() : session.cwd;
      if (known.has(key)) continue;
      this.data.workspaces.push({ id: randomUUID(), cwd: session.cwd });
      known.add(key);
    }
    this.save();
  }

  async findSession(file) {
    if (typeof file !== "string") throw new Error("请选择历史对话。");
    // Mutating a session must see the completed index, even when a background
    // refresh is still parsing history files.
    await this.scan(true);
    const key = pathKey(file);
    const session = this.catalog.find((item) => (item.key || pathKey(item.path)) === key);
    if (!session || this.deleted.has(pathKey(session.path)) || !fs.existsSync(session.path)) throw new Error("对话文件已不存在，请刷新列表。");
    return session;
  }

  async snapshot(cwd, activeSession) {
    await this.scan(false);
    const activeKey = activeSession && pathKey(activeSession);
    const sessions = this.catalog.filter((item) => item.messageCount || this.data.sessions[item.key || pathKey(item.path)]?.archived !== undefined).map((item) => ({
      ...item,
      title: this.data.sessions[item.key || pathKey(item.path)]?.name || item.title,
      archived: this.data.sessions[item.key || pathKey(item.path)]?.archived === true,
      active: Boolean(activeKey && (item.key || pathKey(item.path)) === activeKey),
    }));
    return {
      workspaces: this.data.workspaces.map((item) => ({
        id: item.id, cwd: item.cwd, name: path.basename(item.cwd) || item.cwd,
        active: pathKey(item.cwd) === pathKey(cwd), missing: !fs.existsSync(item.cwd),
      })),
      sessions,
    };
  }
}

module.exports = { Library, pathKey };
