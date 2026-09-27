const fs = require("node:fs");
const path = require("node:path");
const { createHash, verify, randomUUID } = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const yauzl = require("yauzl");
const { promisify } = require("node:util");
const { readJson, writeJson } = require("./agent-config.cjs");
const { resourceSources, fetchResource } = require("./resource-fetch.cjs");

function safeRelative(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("资源包含不安全的路径。");
  return value;
}

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function extractArchive(file, directory, signal) {
  const zip = await promisify(yauzl.open)(file, { lazyEntries: true, strictFileNames: true });
  try {
    await new Promise((resolve, reject) => {
      let total = 0;
      let count = 0;
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", (entry) => {
        void (async () => {
          signal.throwIfAborted();
          const relative = safeRelative(entry.fileName.replace(/\/$/, ""));
          const type = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (![0, 0x4000, 0x8000].includes(type)) throw new Error("资源包不能包含链接或特殊文件。");
          total += entry.uncompressedSize;
          if (++count > 150000 || total > 12 * 1024 ** 3) throw new Error("资源包解压大小超限。");
          const target = path.join(directory, relative);
          if (entry.fileName.endsWith("/")) await fs.promises.mkdir(target, { recursive: true });
          else {
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            const stream = await promisify(zip.openReadStream.bind(zip))(entry);
            await pipeline(stream, fs.createWriteStream(target, { flags: "wx" }), { signal });
            if (process.platform !== "win32") await fs.promises.chmod(target, ((entry.externalFileAttributes >>> 16) & 0o111) ? 0o755 : 0o644);
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
}

function readManifest(envelope, publicKey) {
  if (typeof envelope?.payload !== "string" || typeof envelope.signature !== "string") throw new Error("资源清单格式无效。");
  const bytes = Buffer.from(envelope.payload, "base64");
  if (!publicKey || !verify(null, bytes, publicKey, Buffer.from(envelope.signature, "base64"))) throw new Error("资源清单签名校验失败。");
  const data = JSON.parse(bytes.toString("utf8"));
  if (data.schema !== 1 || !Number.isSafeInteger(data.release) || data.release < 1 || !Array.isArray(data.packages) || data.packages.length > 100) throw new Error("资源清单版本无效。");
  const ids = new Set();
  for (const item of data.packages) {
    if (!/^[a-z][a-z0-9-]{0,80}$/.test(item.id) || ids.has(item.id) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > 4 * 1024 ** 3 || !Array.isArray(item.required) || !item.required.length) throw new Error("资源包信息无效。");
    if (item.archive !== `packages/${item.sha256}.zip`) throw new Error("资源下载路径无效。");
    if (item.assetName !== undefined && (typeof item.assetName !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(item.assetName))) throw new Error("资源资产名称无效。");
    item.required.forEach(safeRelative);
    ids.add(item.id);
  }
  return data;
}

class Components {
  constructor(directory, { url, publicKey, fetcher = fetch, onChange = () => {}, allowLocalhost = false } = {}) {
    this.directory = directory;
    this.sources = resourceSources(url, allowLocalhost);
    this.url = this.sources[0] || "";
    this.publicKey = publicKey;
    this.fetcher = fetcher;
    this.onChange = onChange;
    this.active = readJson(path.join(directory, "active.json"), { release: 0, packages: {} });
    this.state = { status: this.url && publicKey ? "idle" : "disabled", message: this.url && publicKey ? "可安装或更新内置智能体资源。" : "此版本尚未配置资源服务器。", release: this.active.release };
  }

  set(value) { this.state = { ...this.state, ...value }; this.onChange(this.state); }

  async fetchResource(relative, options = {}) {
    if (!this.sources.length) throw new Error("此版本尚未配置资源服务器。");
    let failure;
    for (const source of this.sources) {
      options.signal?.throwIfAborted();
      try {
        const response = await fetchResource(source, relative, { ...options, fetcher: this.fetcher });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`资源 HTTP ${response.status}`); }
        return response;
      } catch (error) { failure = error; }
    }
    throw failure;
  }

  paths() {
    return Object.fromEntries(Object.entries(this.active.packages).map(([id, item]) => {
      if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error("本地资源索引损坏。");
      return [id, path.join(this.directory, "installed", item.sha256)];
    }));
  }

  async check() {
    if (["disabled", "ready"].includes(this.state.status) || this.pending) return this.state;
    this.set({ status: "checking", message: "正在检查智能体资源…" });
    this.pending = (async () => {
      const response = await this.fetchResource("manifest.json", { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`资源清单 HTTP ${response.status}`);
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) { length += chunk.length; if (length > 2 * 1024 * 1024) throw new Error("资源清单过大。"); chunks.push(chunk); }
      const manifest = readManifest(JSON.parse(Buffer.concat(chunks).toString("utf8")), this.publicKey);
      if (manifest.release < this.active.release) throw new Error("服务器资源版本过旧，已保留本地版本。");
      this.manifest = manifest;
      const changed = manifest.packages.filter((item) => this.active.packages[item.id]?.sha256 !== item.sha256 || !item.required.every((file) => fs.existsSync(path.join(this.directory, "installed", item.sha256, file))));
      const revised = manifest.release > this.active.release || Object.keys(this.active.packages).some((id) => !manifest.packages.some((item) => item.id === id));
      this.set({ status: changed.length || revised ? "available" : "idle", count: changed.length, bytes: changed.reduce((sum, item) => sum + item.bytes, 0), message: changed.length ? `${changed.length} 个资源包待安装或更新` : revised ? "资源目录有更新，可复用已下载文件。" : "内置智能体资源已是最新版本。" });
    })();
    try { await this.pending; }
    catch (error) { this.set({ status: "error", message: error.message }); }
    finally { this.pending = null; }
    return this.state;
  }

  async downloadArchive(item, signal) {
    const cache = path.join(this.directory, "downloads");
    await fs.promises.mkdir(cache, { recursive: true });
    const file = path.join(cache, `${item.sha256}.zip`);
    if (fs.existsSync(file) && await hashFile(file) === item.sha256) return file;
    const partial = `${file}.part`;
    let offset = fs.existsSync(partial) ? (await fs.promises.stat(partial)).size : 0;
    if (offset > item.bytes) { await fs.promises.unlink(partial); offset = 0; }
    if (offset < item.bytes) {
      const response = await this.fetchResource(item.archive, { headers: { "Accept-Encoding": "identity", ...(offset ? { Range: `bytes=${offset}-` } : {}) }, signal, assetName: item.assetName });
      if (!response.ok) throw new Error(`资源下载 HTTP ${response.status}`);
      if (response.status === 206) {
        const match = response.headers.get("content-range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (!match || Number(match[1]) !== offset || Number(match[3]) !== item.bytes) throw new Error("断点续传响应不匹配。");
      } else if (response.status === 200) offset = 0;
      else throw new Error("资源下载响应无效。");
      let received = offset;
      let notified = 0;
      const meter = new Transform({ transform: (chunk, _encoding, callback) => {
        received += chunk.length;
        if (Date.now() - notified > 250) { notified = Date.now(); this.set({ status: "downloading", message: `正在下载 ${item.name || item.id} · ${Math.floor(received / item.bytes * 100)}%` }); }
        callback(received > item.bytes ? new Error("资源大小与清单不匹配。") : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(partial, { flags: offset ? "a" : "w" }), { signal });
    }
    if ((await fs.promises.stat(partial)).size !== item.bytes || await hashFile(partial) !== item.sha256) { await fs.promises.unlink(partial); throw new Error("资源校验失败，请重试下载。"); }
    await fs.promises.rename(partial, file);
    return file;
  }

  async install() {
    if (this.pending || ["disabled", "ready"].includes(this.state.status)) return this.state;
    if (!this.manifest) throw new Error("请先检查资源更新。");
    this.controller = new AbortController();
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(60 * 60 * 1000)]);
    this.pending = (async () => {
      const packages = {};
      for (const item of this.manifest.packages) {
        signal.throwIfAborted();
        const destination = path.join(this.directory, "installed", item.sha256);
        if (!item.required.every((relative) => fs.existsSync(path.join(destination, relative)))) {
          this.set({ status: "downloading", message: `正在准备 ${item.name || item.id}…` });
          const archive = await this.downloadArchive(item, signal);
          this.set({ status: "downloading", message: `正在解压安装 ${item.name || item.id}…` });
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
      // Publication is one atomic pointer update. Existing tasks keep their
      // original immutable component paths until the application restarts.
      writeJson(path.join(this.directory, "active.json"), { release: this.manifest.release, packages });
      this.set({ status: "ready", release: this.manifest.release, message: "资源已安装，重启学术派后生效；当前任务可以继续。" });
    })();
    try { await this.pending; }
    catch (error) { this.set({ status: "error", message: this.controller.signal.aborted ? "下载已暂停，下次将继续获取未完成的资源。" : error.message }); }
    finally { this.pending = null; this.controller = null; }
    return this.state;
  }
}

module.exports = { Components, readManifest, safeRelative, hashFile, extractArchive };
