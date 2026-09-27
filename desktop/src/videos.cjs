const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { setTimeout: delay } = require("node:timers/promises");
const { videoRequest } = require("./video-models.cjs");

const VIDEO_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const validTaskId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(id);
const accountId = (key) => createHash("sha256").update(key).digest("hex");
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function safeVideoError(value, key) {
  let text = typeof value === "string" ? value : JSON.stringify(value || "服务未提供详情");
  if (key) text = text.split(key).join("[REDACTED]");
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]").replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]").replace(/data:[^\s"'<>]+/gi, "[DATA]")
    .replace(/[A-Za-z0-9+/=_-]{180,}/g, "[DATA]").replace(/[\r\n\t]+/g, " ").slice(0, 700);
}

async function readJsonResponse(response, key) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 256 * 1024) throw new Error("视频任务响应过大。");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let data;
  try { data = JSON.parse(raw); } catch { /* Handled with status below. */ }
  const requestId = response.headers.get("x-request-id") || response.headers.get("request-id") || data?.request_id;
  if (!response.ok || !data || data.error && !data.id && data.status !== "failed") {
    const error = new Error(`视频接口 HTTP ${response.status}${requestId ? ` · 请求 ID：${safeVideoError(requestId, key)}` : ""}：${safeVideoError(data?.error?.message || data?.error || data?.message || raw, key)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

class VideoJobs {
  constructor(directory, { verify, fetcher = fetch, pollMs = 5000, retryMs = 2000, timeoutMs = VIDEO_TIMEOUT_MS, onProgress = () => {} } = {}) {
    this.directory = directory;
    this.verify = verify;
    this.fetcher = fetcher;
    this.pollMs = pollMs;
    this.retryMs = retryMs;
    this.timeoutMs = timeoutMs;
    this.onProgress = onProgress;
    this.records = new Map();
    this.active = new Set();
  }

  async initialize() {
    await fs.promises.mkdir(this.directory, { recursive: true });
    for (const entry of await fs.promises.readdir(this.directory)) {
      if (!entry.endsWith(".json")) continue;
      const record = JSON.parse(await fs.promises.readFile(path.join(this.directory, entry), "utf8"));
      if (!validTaskId(record.id) || !/^[a-f0-9]{64}$/.test(record.account) || typeof record.cwd !== "string") throw new Error("视频任务记录损坏，请保留记录以便恢复。");
      this.records.set(`${record.account}:${record.id}`, record);
    }
  }

  view(record) {
    return { id: record.id, model: record.model, options: record.options, status: record.status,
      sessionFile: record.sessionFile, createdAt: record.createdAt, file: record.file,
      warnings: record.warnings || [], error: record.error, active: this.active.has(`${record.account}:${record.id}`) };
  }

  list(key, cwd, sessionFile) {
    if (!key) return [];
    return [...this.records.values()].filter((record) => record.account === accountId(key) && samePath(record.cwd, cwd) &&
      (sessionFile === undefined || record.sessionFile === sessionFile)).sort((a, b) => a.createdAt - b.createdAt).map((record) => this.view(record));
  }

  get(id, key, cwd) {
    if (!key || !validTaskId(id)) throw new Error("视频任务 ID 无效。");
    const record = this.records.get(`${accountId(key)}:${id}`);
    if (!record || !samePath(record.cwd, cwd)) throw new Error("当前账户和工作区没有这个视频任务。");
    return record;
  }

  async save(record) {
    this.records.set(`${record.account}:${record.id}`, record);
    const file = path.join(this.directory, `${record.account}-${record.id}.json`);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(record), { flag: "wx", mode: 0o600 });
      await fs.promises.rename(temporary, file);
    } finally { await fs.promises.unlink(temporary).catch(() => {}); }
    this.onProgress(this.view(record));
  }

  async localFile(id, key, cwd) {
    const record = this.get(id, key, cwd);
    const file = record.file;
    if (!file || record.status !== "completed" || ![path.join(record.cwd, "outputs", "Jarod-Pi", "videos"), path.join(record.cwd, "outputs", "pi-videos")].some((directory) => samePath(path.dirname(file.path), directory))) throw new Error("视频尚未下载完成。");
    const stat = await fs.promises.stat(file.path);
    if (!stat.isFile() || stat.size <= 0 || stat.size !== file.bytes) throw new Error("视频文件缺失或已改变，请继续获取原任务。");
    return file;
  }

  async query(url, key, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.fetcher(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
        return await readJsonResponse(response, key);
      } catch (error) {
        if (signal.aborted || attempt === 2 || error.status && error.status < 500 && error.status !== 429) throw error;
        await delay(this.retryMs * (attempt + 1), undefined, { signal });
      }
    }
  }

  async download(record, baseUrl, key, signal) {
    const directory = path.join(record.cwd, "outputs", "Jarod-Pi", "videos");
    await fs.promises.mkdir(directory, { recursive: true });
    for (let attempt = 0; ; attempt++) {
      const file = path.join(directory, `generated-${record.id}-${randomUUID()}.mp4`);
      let created = false;
      try {
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5 * 60 * 1000)]);
        let url = new URL(`${baseUrl}/videos/${encodeURIComponent(record.id)}/content`);
        const origin = url.origin;
        let response;
        for (let hop = 0; hop < 6; hop++) {
          response = await this.fetcher(url.href, { headers: url.origin === origin ? { Authorization: `Bearer ${key}` } : {}, redirect: "manual", signal: requestSignal });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          await response.body?.cancel();
          const location = response.headers.get("location");
          if (!location || hop === 5) throw new Error("视频下载重定向无效。");
          url = new URL(location, url);
          if (url.protocol !== "https:" && !(url.origin === origin && url.hostname === "127.0.0.1")) throw new Error("视频下载地址无效。");
          if (url.username || url.password) throw new Error("视频下载地址不能包含凭据。");
        }
        if (!response.ok) { await readJsonResponse(response, key); throw new Error(`视频下载 HTTP ${response.status}`); }
        const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        if (!["video/mp4", "application/octet-stream"].includes(type)) { await response.body?.cancel(); throw new Error("下载接口没有返回 MP4 视频。"); }
        if (Number(response.headers.get("content-length")) > MAX_VIDEO_BYTES) { await response.body?.cancel(); throw new Error("视频文件超过 512 MB。"); }
        let bytes = 0;
        const limiter = new Transform({ transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > MAX_VIDEO_BYTES ? new Error("视频文件超过 512 MB。") : null, chunk);
        } });
        const output = fs.createWriteStream(file, { flags: "wx", mode: 0o600 });
        output.once("open", () => { created = true; });
        await pipeline(Readable.fromWeb(response.body), limiter, output, { signal: requestSignal });
        const stat = await fs.promises.stat(file);
        if (!bytes || stat.size !== bytes) throw new Error("视频文件为空或写入不完整。");
        const info = await this.verify(file);
        if (!Number.isFinite(info.duration) || info.duration <= 0 || !(info.width > 0) || !(info.height > 0)) throw new Error("视频无法解码。");
        return { path: file, bytes, mimeType: "video/mp4", width: info.width, height: info.height, duration: info.duration };
      } catch (error) {
        if (created) await fs.promises.unlink(file).catch(() => {});
        if (signal.aborted || attempt === 2 || error.status && error.status < 500 && error.status !== 429) throw error;
        await delay(this.retryMs * (attempt + 1), undefined, { signal });
      }
    }
  }

  async run({ args, model, preferences, cwd, sessionFile, key, baseUrl, signal: callerSignal }) {
    if (!key) throw new Error("请先连接 JarodFund Key。");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("视频请求无效。");
    const signal = AbortSignal.any([...(callerSignal ? [callerSignal] : []), AbortSignal.timeout(this.timeoutMs)]);
    signal.throwIfAborted();
    let record;
    if (args.task_id != null && args.task_id !== "") {
      record = this.get(args.task_id, key, cwd);
      if (record.status === "failed") return this.view(record);
      if (record.status === "completed") {
        try { await this.localFile(record.id, key, cwd); return this.view(record); }
        catch { /* Re-download the existing remote task, never regenerate. */ }
      }
    } else {
      const request = videoRequest(model, args, preferences);
      // A submit timeout/5xx can still mean accepted. Only GETs are retried.
      let data;
      try {
        const response = await this.fetcher(`${baseUrl}/videos`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(request.body), redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]) });
        data = await readJsonResponse(response, key);
      } catch (error) {
        throw new Error(`${safeVideoError(error.message, key)}。未获得任务 ID，未自动重提；不能据此判断是否计费。`);
      }
      if (!validTaskId(data.id)) throw new Error("视频提交未返回有效任务 ID，不能视为生成成功；未自动重提。");
      record = { id: data.id, account: accountId(key), model, options: request.options, warnings: request.warnings, cwd: path.resolve(cwd), sessionFile, createdAt: Date.now(), status: "queued" };
      // Persist the public ID before the first poll, including if cancellation arrived.
      try { await this.save(record); }
      catch { throw new Error(`视频任务 ${record.id} 已创建，但任务记录写入失败。请保留此 ID，勿重新提交。`); }
    }
    const recordKey = `${record.account}:${record.id}`;
    if (this.active.has(recordKey)) return { ...this.view(record), error: "原任务正在查询，请等待。" };
    this.active.add(recordKey);
    try {
      for (;;) {
        signal.throwIfAborted();
        const data = await this.query(`${baseUrl}/videos/${encodeURIComponent(record.id)}`, key, signal);
        if (data.id && data.id !== record.id) throw new Error("查询返回了不同的视频任务 ID。");
        if (data.status === "failed") {
          record.status = "failed";
          record.error = safeVideoError(data.error?.message || data.error || data.message || "视频生成失败。", key);
          break;
        }
        if (data.status === "completed") {
          record.status = "downloading";
          record.error = undefined;
          await this.save(record);
          record.file = await this.download(record, baseUrl, key, signal);
          record.status = "completed";
          record.error = undefined;
          if (Math.abs(record.file.duration - record.options.duration) > 0.15) {
            const warning = `请求 ${record.options.duration} 秒，实际 ${record.file.duration.toFixed(2)} 秒；视频已原样保存。`;
            if (!record.warnings.includes(warning)) record.warnings.push(warning);
          }
          break;
        }
        if (!["queued", "in_progress", "processing"].includes(data.status)) throw new Error(`任务状态未知：${safeVideoError(data.status, key)}。`);
        record.status = data.status;
        record.error = undefined;
        await this.save(record);
        await delay(this.pollMs, undefined, { signal });
      }
    } catch (error) {
      record.status = "paused";
      record.error = signal.aborted ? "已停止本地等待，上游任务未取消。可继续获取原任务。" : `${safeVideoError(error.message, key)}。任务 ID 已保留，可继续获取。`;
    } finally {
      this.active.delete(recordKey);
      await this.save(record);
    }
    return this.view(record);
  }
}

module.exports = { VideoJobs, VIDEO_TIMEOUT_MS, MAX_VIDEO_BYTES, safeVideoError };
