const path = require("node:path");
const { Components, readManifest } = require("./components.cjs");
const { portablePlatform } = require("./portable-platform.cjs");

class PortableUpdates extends Components {
  constructor(directory, options) {
    super(directory, options);
    this.reveal = options.reveal;
    this.version = options.version;
    this.target = options.target || portablePlatform();
    this.state = { version: options.version, status: options.url ? "idle" : "disabled", message: "免安装版：可检查新版压缩包；解压到新目录后继续使用原账户和会话。" };
  }

  async check() {
    if (this.pending || this.state.status === "disabled") return this.state;
    this.set({ status: "checking", message: "正在检查免安装版更新…" });
    this.pending = (async () => {
      const response = await this.fetchResource(this.target.manifest, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`更新目录 HTTP ${response.status}`);
      let count = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        count += chunk.length;
        if (count > 128 * 1024) throw new Error("更新目录过大。");
        chunks.push(chunk);
      }
      const manifest = readManifest(JSON.parse(Buffer.concat(chunks).toString("utf8")), this.publicKey);
      if (manifest.target && manifest.target !== this.target.id) throw new Error("更新包平台与当前系统不一致。");
      const item = manifest.packages.find((entry) => entry.id === this.target.updateId);
      if (!item || !/^\d+\.\d+\.\d+$/.test(item.version)) throw new Error("免安装版更新信息无效。");
      const current = this.version.split(".").map(Number);
      const next = item.version.split(".").map(Number);
      const firstDifference = next.findIndex((part, index) => part !== current[index]);
      this.item = firstDifference >= 0 && next[firstDifference] > current[firstDifference] ? item : null;
      this.set({ status: this.item ? "available" : "idle", message: this.item ? `发现免安装版 ${item.version} · ${(item.bytes / 1e6).toFixed(1)} MB；下载后解压到新目录使用。` : "当前已是最新免安装版。" });
    })();
    try { await this.pending; }
    catch (error) { this.set({ status: "error", message: `${error.message}，当前版本可继续使用。` }); }
    finally { this.pending = null; }
    return this.state;
  }

  async download() {
    if (this.pending) return this.state;
    if (!this.item) throw new Error("请先检查免安装版更新。");
    this.controller = new AbortController();
    this.set({ status: "downloading", message: "正在下载新版压缩包…" });
    this.pending = this.downloadArchive(this.item, AbortSignal.any([this.controller.signal, AbortSignal.timeout(60 * 60 * 1000)]));
    try {
      const file = await this.pending;
      this.set({ status: "available", message: `新版已下载并校验：${path.basename(file)}。请退出旧版后，将压缩包解压到新目录；再次点击下载可重新定位文件。` });
      this.reveal(file);
    } catch (error) { this.set({ status: "available", message: `更新下载未完成：${error.message}。再次点击下载将继续。` }); }
    finally { this.pending = null; this.controller = null; }
    return this.state;
  }

  install() { throw new Error("免安装版请解压新版压缩包，不使用安装器。"); }
}

module.exports = { PortableUpdates };
