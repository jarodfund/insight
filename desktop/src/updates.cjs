function httpsDirectory(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("更新地址必须是 HTTPS 目录。");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

class Updates {
  constructor(updater, { url, packaged, version, busy, onChange = () => {} }) {
    this.updater = updater;
    this.busy = busy;
    this.onChange = onChange;
    this.state = { version, status: url && packaged ? "idle" : "disabled", message: !url ? "此版本尚未配置更新服务器。" : !packaged ? "开发模式不安装程序更新。" : "可检查学术派的新版本。" };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.logger = null;
    if (url && packaged) updater.setFeedURL({ provider: "generic", url: httpsDirectory(url), useMultipleRangeRequest: false });
    updater.on("update-available", (info) => this.set({ status: "available", nextVersion: info.version, message: `发现新版本 ${info.version}` }));
    updater.on("update-not-available", () => this.set({ status: "idle", message: "当前已是最新版本。" }));
    updater.on("download-progress", (progress) => this.set({ status: "downloading", percent: Math.floor(progress.percent), message: `正在下载更新 ${Math.floor(progress.percent)}%` }));
    updater.on("update-downloaded", () => this.set({ status: "ready", message: "更新已下载，结束任务后可重启安装。" }));
    updater.on("error", () => this.set({ status: "error", message: "更新暂时不可用，请检查网络后重试；当前版本可继续使用。" }));
  }

  set(value) { this.state = { ...this.state, ...value }; this.onChange(this.state); }

  async check() {
    if (this.state.status === "disabled" || this.pending || this.state.status === "ready") return this.state;
    this.set({ status: "checking", message: "正在检查更新…" });
    this.pending = this.updater.checkForUpdates();
    try { await this.pending; } catch { /* The updater's error event supplies a bounded message. */ }
    finally { this.pending = null; }
    return this.state;
  }

  async download() {
    if (this.pending) return this.state;
    if (this.state.status !== "available") throw new Error("请先检查可用更新。");
    this.set({ status: "downloading", message: "正在下载更新…" });
    this.pending = this.updater.downloadUpdate();
    try { await this.pending; } catch { /* Keep the current application usable. */ }
    finally { this.pending = null; }
    return this.state;
  }

  install() {
    if (this.state.status !== "ready") throw new Error("更新尚未下载完成。");
    if (this.busy()) throw new Error("请先结束所有窗口中的任务和待处理操作，再重启更新。");
    this.updater.quitAndInstall(false, true);
  }
}

module.exports = { Updates, httpsDirectory };
