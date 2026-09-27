const { BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Use Electron's own decoder so a verified result can also play in the desktop.
async function verifyVideo(file) {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || header.toString("ascii", 4, 8) !== "ftyp") throw new Error("文件不是有效的 MP4 容器。");
  } finally { await handle.close(); }
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  try {
    await window.loadFile(path.join(__dirname, "video-verifier.html"));
    return await window.webContents.executeJavaScript(`(${decodeVideo.toString()})(${JSON.stringify(pathToFileURL(file).href)})`);
  } finally { window.destroy(); }
}

function decodeVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timeout = setTimeout(() => finish(new Error("视频解码超时。")), 20000);
    function finish(error, info) {
      clearTimeout(timeout);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      video.remove();
      if (error) reject(error); else resolve(info);
    }
    video.onloadeddata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) { finish(new Error("视频没有有效时长或画面。")); return; }
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      try {
        canvas.getContext("2d").drawImage(video, 0, 0, 1, 1);
        finish(null, { duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      } catch { finish(new Error("视频画面无法解码。")); }
    };
    video.onerror = () => finish(new Error("视频无法解码为可播放的文件。"));
    video.preload = "auto";
    video.muted = true;
    document.body.append(video);
    video.src = url;
  });
}

module.exports = { verifyVideo };
