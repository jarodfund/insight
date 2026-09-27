const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { Components, readManifest, extractArchive } = require("./components.cjs");
const { readJson, writeJson } = require("./agent-config.cjs");
const { RUNTIME_PARTS, BASE_COMPONENTS } = require("./component-plan.cjs");
const { portablePlatform } = require("./portable-platform.cjs");

class OnDemandComponents extends Components {
  constructor(directory, options) {
    super(directory, options);
    this.bundle = options.bundle;
    this.target = options.target || portablePlatform();
    this.onActivate = options.onActivate || (() => {});
    this.embedded = readManifest(readJson(path.join(this.bundle, "catalog.json")), this.publicKey);
    if (this.embedded.target && this.embedded.target !== this.target.id) throw new Error("内置资源与当前平台不一致。");
    this.manifest = this.embedded;
    try {
      const saved = readManifest(readJson(path.join(directory, "catalog.json")), this.publicKey);
      if (saved.target && saved.target !== this.target.id) throw new Error("缓存资源属于其他平台。");
      if (saved.release >= this.embedded.release) this.manifest = saved;
    } catch { /* An absent or damaged cache never disables the bundled base. */ }
    this.requested = new Set(readJson(path.join(directory, "requested.json"), BASE_COMPONENTS));
    this.queue = Promise.resolve();
    this.queued = 0;
    this.set({ status: "idle", message: "基础能力已内置；选择智能体时按需下载，已下载资源自动复用。" });
  }

  paths() {
    if (!this.embedded) return {};
    const paths = {};
    for (const item of this.embedded.packages) {
      const directory = path.join(this.bundle, "installed", item.sha256);
      if (item.required.every((file) => fs.existsSync(path.join(directory, file)))) paths[item.id] = directory;
    }
    for (const [id, item] of Object.entries(this.active.packages)) {
      if (!/^[a-f0-9]{64}$/.test(item.sha256)) continue;
      const directory = path.join(this.directory, "installed", item.sha256);
      if (fs.existsSync(directory)) paths[id] = directory;
    }
    // Legacy adapters receive a single runtime directory. Project immutable
    // component directories without copying Python/browser trees or changing
    // a directory which a running conversation might still be using.
    const parts = Object.entries(RUNTIME_PARTS).filter(([id]) => paths[id]);
    if (paths["runtime-layout"]) {
      const key = createHash("sha256").update(JSON.stringify(parts.map(([id]) => [id, paths[id]]))).digest("hex").slice(0, 24);
      const projection = path.join(this.directory, "runtimes", key);
      if (this.projectionKey !== key || !fs.existsSync(path.join(projection, ".complete"))) {
        fs.mkdirSync(projection, { recursive: true });
        for (const [id, entries] of parts) for (const relative of entries) {
          const source = path.join(paths[id], relative);
          const destination = path.join(projection, relative);
          if (fs.existsSync(destination)) continue;
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          if (fs.statSync(source).isDirectory()) fs.symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
          else fs.copyFileSync(source, destination);
        }
        fs.writeFileSync(path.join(projection, ".complete"), key);
        this.projectionKey = key;
      }
      paths["specialist-runtime"] = projection;
    }
    return paths;
  }

  missing(ids) {
    const paths = this.paths();
    return ids.map((id) => {
      const item = this.manifest.packages.find((entry) => entry.id === id);
      if (!item) throw new Error(`资源目录缺少 ${id}，请检查资源更新。`);
      return item;
    }).filter((item) => !paths[item.id] || path.basename(paths[item.id]) !== item.sha256 || !item.required.every((file) => fs.existsSync(path.join(paths[item.id], file))));
  }

  async check() {
    if (this.pending || this.checking) return this.state;
    this.checking = true;
    this.set({ status: "checking", message: "正在检查已使用的智能体资源…" });
    try {
      const response = await this.fetchResource(this.target.manifest, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`资源目录 HTTP ${response.status}`);
      let bytes = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 ** 2) throw new Error("资源目录过大。");
        chunks.push(chunk);
      }
      const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const manifest = readManifest(envelope, this.publicKey);
      if (manifest.target !== this.embedded.target) throw new Error("资源清单平台不一致。");
      if (manifest.release < Math.max(this.manifest.release, this.active.release)) throw new Error("服务器资源版本过旧，已保留当前资源。");
      for (const id of this.requested) if (!manifest.packages.some((item) => item.id === id)) throw new Error(`新版目录缺少已使用的资源 ${id}。`);
      writeJson(path.join(this.directory, "catalog.json"), envelope);
      this.manifest = manifest;
      const changed = this.missing([...this.requested]);
      this.set({ status: changed.length ? "available" : "idle", bytes: changed.reduce((sum, item) => sum + item.bytes, 0), message: changed.length ? `${changed.length} 个已使用资源可更新或继续下载` : "已使用的资源都是最新版本；其他智能体按需下载。" });
    } catch (error) { this.set({ status: "error", message: `${error.message}，已下载的资源仍可使用。` }); }
    finally { this.checking = false; }
    return this.state;
  }

  ensure(ids) {
    if (this.checking) throw new Error("正在检查资源更新，请稍后选择智能体。");
    this.missing(ids); // Validate before persisting or joining the queue.
    for (const id of ids) this.requested.add(id);
    writeJson(path.join(this.directory, "requested.json"), [...this.requested]);
    const generation = this.cancelGeneration || 0;
    this.queued++;
    const next = this.queue.then(async () => {
      if (generation !== (this.cancelGeneration || 0)) throw new Error("资源下载已暂停，可从卡片或设置中继续。");
      this.controller = new AbortController();
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(60 * 60 * 1000)]);
      try {
        const changed = this.missing(ids);
        const packages = { ...this.active.packages };
        for (const item of changed) {
          signal.throwIfAborted();
          const destination = path.join(this.directory, "installed", item.sha256);
          if (!item.required.every((file) => fs.existsSync(path.join(destination, file)))) {
            this.set({ status: "downloading", packageId: item.id, message: `正在准备 ${item.name || item.id}…` });
            const archive = await this.downloadArchive(item, signal);
            this.set({ status: "downloading", message: `正在解压 ${item.name || item.id}…` });
            const staging = path.join(this.directory, "installed", `.staging-${randomUUID()}`);
            await fs.promises.mkdir(staging, { recursive: true });
            try {
              await extractArchive(archive, staging, signal);
              for (const relative of item.required) {
                const stat = await fs.promises.stat(path.join(staging, relative));
                if (!stat.isFile() || !stat.size) throw new Error(`资源不完整：${item.id}/${relative}`);
              }
              signal.throwIfAborted();
              if (fs.existsSync(destination)) await fs.promises.rename(destination, `${destination}.damaged-${randomUUID()}`);
              await fs.promises.rename(staging, destination);
            } finally { await fs.promises.rm(staging, { recursive: true, force: true }); }
          }
          packages[item.id] = { sha256: item.sha256, version: item.version };
        }
        signal.throwIfAborted();
        if (changed.length) {
          const active = { release: this.manifest.release, packages };
          writeJson(path.join(this.directory, "active.json"), active);
          this.active = active;
        }
        this.onActivate(this.paths());
        this.set({ status: "idle", packageId: null, message: "资源已就绪，可以选择智能体使用，无需重启。" });
      } catch (error) {
        this.set({ status: "error", message: this.controller.signal.aborted ? "下载已暂停，可从卡片或设置中继续；已下载部分会保留。" : error.message });
        throw new Error(this.state.message);
      } finally { this.controller = null; }
    });
    this.queue = next.catch(() => {}).finally(() => { this.queued--; if (!this.queued) this.pending = null; });
    this.pending = this.queue;
    return next;
  }

  pause() { this.cancelGeneration = (this.cancelGeneration || 0) + 1; this.controller?.abort(); }
  async install() { await this.ensure([...this.requested]); return this.state; }
}

module.exports = { OnDemandComponents };
