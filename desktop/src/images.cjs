const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { IMAGE_PROFILES, imageRequestOptions, buildImageRequest } = require("./image-models.cjs");
const { directoryName } = require("./branding.js");
const { IMAGE_TIMEOUT_MS, imageDispatcher } = require("./image-http.cjs");

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 48 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

function imageModelsFromCatalog(entries) {
  const available = new Set(entries.map((entry) => entry?.id));
  return IMAGE_PROFILES.filter((profile) => available.has(profile.id));
}

function imageBytes(data, limit = MAX_IMAGE_BYTES) {
  if (typeof data !== "string" || !data.length || data.length > Math.ceil(limit / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error(`图片内容无效或超过 ${limit / 1024 / 1024} MB。`);
  }
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > limit) throw new Error(`图片内容为空或超过 ${limit / 1024 / 1024} MB。`);
  return bytes;
}

function inspectImage(bytes, nativeImage, limit = MAX_IMAGE_BYTES) {
  if (!bytes.length || bytes.length > limit) throw new Error(`图片为空或超过 ${limit / 1024 / 1024} MB。`);
  let mimeType;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mimeType = "image/jpeg";
  else if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") mimeType = "image/webp";
  else throw new Error("请使用有效的 PNG、JPEG 或 WebP 图片。");
  const decoded = nativeImage.createFromBuffer(bytes);
  const { width, height } = decoded.getSize();
  if (decoded.isEmpty() || !width || !height || width * height > 64_000_000) throw new Error("图片无法解码或像素过大（最多 6400 万像素）。");
  return { mimeType, width, height, extension: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType] };
}

async function saveVerifiedImage(bytes, directory, nativeImage, prefix, limit = MAX_IMAGE_BYTES) {
  const info = inspectImage(bytes, nativeImage, limit);
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${prefix}-${randomUUID()}.${info.extension}`);
  // A failed write is retried against this exact file; never select an older output.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await fs.writeFile(file, bytes, { flag: attempt ? "w" : "wx" });
      const stored = await fs.readFile(file);
      const verified = inspectImage(stored, nativeImage, limit);
      if (!stored.equals(bytes)) throw new Error("图片写入验证失败。");
      return { ...verified, path: file, data: stored.toString("base64"), bytes: stored.length };
    } catch (error) {
      if (error.code === "EEXIST") throw error;
      if (attempt === 2) { await fs.unlink(file).catch(() => {}); throw error; }
    }
  }
}

async function readLimited(response, limit, truncate = false) {
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    if (truncate && length + chunk.length > limit) {
      chunks.push(chunk.subarray(0, limit - length));
      break;
    }
    length += chunk.length;
    if (length > limit) throw new Error("图片服务返回的数据过大。");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function resultImages(payload) {
  if (Array.isArray(payload?.data) && payload.data.length) return payload.data;
  const message = payload?.choices?.[0]?.message;
  const result = [];
  for (const item of Array.isArray(message?.images) ? message.images : []) result.push({ url: typeof item?.image_url === "string" ? item.image_url : item?.image_url?.url || item?.url });
  for (const part of Array.isArray(message?.content) ? message.content : []) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "image_url") result.push({ url: typeof part.image_url === "string" ? part.image_url : part.image_url?.url });
    if (part.type === "image" && part.data) result.push({ b64_json: part.data });
    if (part.inlineData?.data) result.push({ url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` });
  }
  const text = typeof message?.content === "string" ? message.content
    : Array.isArray(message?.content) ? message.content.filter((part) => part?.type === "text").map((part) => part.text).join("\n") : "";
  for (const match of text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)\)/g)) result.push({ url: match[1] });
  if (!result.length && /^data:image\/(?:png|jpeg|webp);base64,/.test(text.trim())) result.push({ url: text.trim() });
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) result.push({ url: `data:${inline.mimeType || inline.mime_type};base64,${inline.data}` });
    }
  }
  return [...new Map(result.filter((item) => item.b64_json || item.url).map((item) => [item.b64_json || item.url, item])).values()];
}

function imageErrorSummary(value, key) {
  let text = String(value || "服务未提供错误详情");
  if (key) text = text.split(key).join("[REDACTED]");
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/data:image\/[^\s"'<>]+/gi, "[IMAGE DATA]")
    .replace(/[A-Za-z0-9+/=_-]{120,}/g, "[DATA]").replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

async function generateImage({ args, model, preferences, cwd, key, baseUrl, nativeImage, signal, fetcher = fetch }) {
  if (!key) throw new Error("请先连接 JarodFund Key。");
  const warnings = [];
  const options = imageRequestOptions(model.id, args, preferences, warnings);
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(IMAGE_TIMEOUT_MS)]);
  const references = [];
  for (const file of args.images || []) {
    if (typeof file !== "string") throw new Error("参考图片路径无效。");
    const resolved = path.resolve(cwd, file);
    const stat = await fs.stat(resolved);
    if (!stat.isFile() || stat.size > MAX_OUTPUT_BYTES) throw new Error("参考图片不存在或超过 48 MB。");
    const bytes = await fs.readFile(resolved);
    const { mimeType } = inspectImage(bytes, nativeImage, MAX_OUTPUT_BYTES);
    references.push(`data:${mimeType};base64,${bytes.toString("base64")}`);
  }
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
  const { endpoint, body } = buildImageRequest(model.id, args.prompt, options, references);
  // Never replay a generation POST after an ambiguous network failure: it may
  // already have been billed. Retrying downloads does not create another image.
  let response;
  let raw;
  let requestId;
  try {
    response = await fetcher(`${baseUrl}${endpoint}`, { method: "POST", headers, body: JSON.stringify(body), signal, redirect: "error", dispatcher: imageDispatcher });
    requestId = response.headers?.get("x-request-id") || response.headers?.get("request-id") || response.headers?.get("x-amzn-requestid");
    raw = (await readLimited(response, response.ok ? 256 * 1024 * 1024 : 65536, !response.ok)).toString("utf8");
  } catch (error) {
    throw new Error(`生图请求中断${response ? `（HTTP ${response.status}）` : ""}${requestId ? ` · 请求 ID：${imageErrorSummary(requestId, key)}` : ""}：${imageErrorSummary(error.message, key)}。上游可能已生成或计费，未自动重新提交。`);
  }
  let payload;
  try { payload = JSON.parse(raw); } catch { /* Report status and bounded details below. */ }
  requestId ||= payload?.request_id || payload?.error?.request_id;
  const diagnostic = `HTTP ${response.status}${requestId ? ` · 请求 ID：${imageErrorSummary(requestId, key)}` : ""}`;
  if (!response.ok || !payload || payload.error) {
    const reason = payload?.error?.message || payload?.message || (typeof payload?.error === "string" ? payload.error : null) || raw;
    throw new Error(`生图服务返回 ${diagnostic}：${imageErrorSummary(reason, key)}。未自动重新提交。`);
  }
  const items = resultImages(payload);
  if (!items.length || items.length > 10) throw new Error(`服务商未返回有效的图片列表（${diagnostic}），不能视为生成成功。`);
  const files = [];
  const failures = [];
  for (const [index, item] of items.entries()) {
    try {
      let bytes;
      for (let attempt = 0; attempt < 3; attempt++) {
        signal.throwIfAborted();
        try {
          if (item?.b64_json) bytes = imageBytes(item.b64_json.replace(/^data:image\/[^;]+;base64,/, ""), MAX_OUTPUT_BYTES);
          else if (typeof item?.url === "string" && item.url.startsWith("data:")) bytes = imageBytes(item.url.replace(/^data:image\/(?:png|jpeg|webp);base64,/, ""), MAX_OUTPUT_BYTES);
          else {
            const url = new URL(item?.url);
            if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("图片下载地址无效。");
            // Signed image/CDN URLs never receive the account credential.
            const download = await fetcher(url, { signal, redirect: "error", dispatcher: imageDispatcher });
            if (!download.ok) { await download.body?.cancel(); throw new Error(`生成结果下载失败（HTTP ${download.status}）。`); }
            bytes = await readLimited(download, MAX_OUTPUT_BYTES);
          }
          inspectImage(bytes, nativeImage, MAX_OUTPUT_BYTES);
          break;
        } catch (error) { if (attempt === 2 || signal.aborted) throw error; }
      }
      signal.throwIfAborted();
      const saved = await saveVerifiedImage(bytes, path.join(cwd, "outputs", directoryName, "images"), nativeImage, "generated", MAX_OUTPUT_BYTES);
      files.push(saved);
      if (options.size && options.size !== "auto" && options.size !== `${saved.width}x${saved.height}`) warnings.push(`第 ${index + 1} 张请求 ${options.size}，实际返回 ${saved.width}x${saved.height}；已原样保存，未缩放。`);
      if (options.background === "transparent" && saved.mimeType === "image/jpeg") warnings.push(`第 ${index + 1} 张返回 JPEG，不支持透明通道；已原样保存。`);
    } catch (error) {
      failures.push(`第 ${index + 1} 张未保存：${imageErrorSummary(error.message, key)}`);
    }
  }
  if (!files.length) throw new Error(`${diagnostic}；${failures.join("；")}。未自动重新生成。`);
  if (items.length !== (options.n || 1)) warnings.push(`请求 ${options.n || 1} 张，服务返回 ${items.length} 项；已验证保存 ${files.length} 张。`);
  return { model: model.id, files, options, warnings: [...warnings, ...failures], partial: failures.length > 0 || files.length < (options.n || 1), requestId: requestId && imageErrorSummary(requestId, key) };
}

module.exports = { MAX_IMAGE_BYTES, MAX_OUTPUT_BYTES, MAX_ATTACHMENTS, imageModelsFromCatalog, imageBytes, inspectImage, saveVerifiedImage, generateImage, resultImages };
