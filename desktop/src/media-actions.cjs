const { clipboard, ClipboardItem, nativeImage, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { imageBytes, inspectImage, MAX_OUTPUT_BYTES } = require("./images.cjs");
const { MAX_VIDEO_BYTES } = require("./videos.cjs");

async function localMedia(file, extensions, limit) {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.includes("\0")) throw new Error("本地文件路径无效。");
  const resolved = await fs.realpath(file).catch(() => { throw new Error("文件已移动、删除或无法访问，请检查显示的本地路径。"); });
  if (!extensions.includes(path.extname(resolved).toLowerCase())) throw new Error("文件类型与生成结果不符。");
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || !stat.size || stat.size > limit) throw new Error("本地文件为空、过大或已不可用。");
  return resolved;
}

async function readImage(input) {
  const file = input?.path ? await localMedia(input.path, [".png", ".jpg", ".jpeg", ".webp"], MAX_OUTPUT_BYTES) : null;
  const bytes = file ? await fs.readFile(file) : imageBytes(input?.data, MAX_OUTPUT_BYTES);
  inspectImage(bytes, nativeImage, MAX_OUTPUT_BYTES);
  return { file, bytes };
}

async function openFile(file) {
  const error = await shell.openPath(file);
  if (error) throw new Error(`无法本地打开：${error}。请检查系统默认打开方式。`);
}

async function openImage(input) {
  if (!input?.path) throw new Error("这张图片没有可打开的本地文件。");
  const { file } = await readImage(input);
  await openFile(file);
}

async function copyImage(input) {
  const { file, bytes } = await readImage(input);
  const png = nativeImage.createFromBuffer(bytes).toPNG();
  // Electron 44 maps text/uri-list to native CF_HDROP on Windows. Offer both
  // pixels and the original file, so editors and file managers can choose.
  await clipboard.write([new ClipboardItem({
    "image/png": new Blob([png], { type: "image/png" }),
    ...(file ? { "text/uri-list": `${pathToFileURL(file).href}\r\n` } : {}),
  })]);
}

async function videoFile(file) {
  const resolved = await localMedia(file.path, [".mp4"], MAX_VIDEO_BYTES);
  const handle = await fs.open(resolved, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || header.toString("ascii", 4, 8) !== "ftyp") throw new Error("本地视频文件已损坏，请继续获取原任务。");
  } finally { await handle.close(); }
  return resolved;
}

async function openVideo(file) {
  await openFile(await videoFile(file));
}

async function copyVideo(file) {
  const resolved = await videoFile(file);
  await clipboard.write([new ClipboardItem({ "text/uri-list": `${pathToFileURL(resolved).href}\r\n` })]);
}

module.exports = { openImage, copyImage, openVideo, copyVideo };
