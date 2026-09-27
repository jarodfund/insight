const fs = require("node:fs");
const path = require("node:path");
const { parentPort } = require("node:worker_threads");
const { runtimeDirectory } = require("./product-paths.cjs");
const { loadEntriesFromFile } = require(path.join(runtimeDirectory, "node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"));

async function scan({ roots, previous }) {
  const entries = {};
  let parsed = 0;
  for (const root of roots) {
    let directories;
    try {
      directories = [root, ...(await fs.promises.readdir(root, { withFileTypes: true })).filter((item) => item.isDirectory()).map((item) => path.join(root, item.name))];
    } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const directory of directories) {
      for (const item of await fs.promises.readdir(directory, { withFileTypes: true })) {
        if (!item.isFile() || !item.name.endsWith(".jsonl")) continue;
        const file = path.join(directory, item.name);
        let stat;
        try { stat = await fs.promises.stat(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
        const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
        if (previous[file]?.signature === signature && previous[file].info.key) { entries[file] = previous[file]; continue; }
        const records = loadEntriesFromFile(file);
        const header = records.find((entry) => entry.type === "session");
        if (!header?.cwd) continue;
        parsed++;
        let title = "";
        let name;
        let modified = 0;
        let messageCount = 0;
        for (const entry of records) {
          if (entry.type === "session_info") name = entry.name?.trim();
          if (entry.type !== "message") continue;
          messageCount++;
          const message = entry.message;
          if (!["user", "assistant"].includes(message?.role)) continue;
          modified = Math.max(modified, Number(message.timestamp) || Date.parse(entry.timestamp) || 0);
          if (!title && message.role === "user") title = (typeof message.content === "string" ? message.content : (message.content || []).filter((part) => part.type === "text").map((part) => part.text).join(" ")).slice(0, 512);
        }
        let cwd = path.resolve(header.cwd);
        try { cwd = await fs.promises.realpath(cwd); } catch { /* Missing workspaces remain in history. */ }
        const canonical = await fs.promises.realpath(file);
        entries[file] = { signature, info: { path: file, key: process.platform === "win32" ? canonical.toLowerCase() : canonical, id: header.id, cwd, title: (name || title || "未命名对话").slice(0, 512), modified: modified || Date.parse(header.timestamp) || stat.mtimeMs, messageCount } };
      }
    }
  }
  return { entries, parsed };
}

let queue = Promise.resolve();
parentPort.on("message", ({ id, data }) => {
  queue = queue.then(() => scan(data)).then((result) => parentPort.postMessage({ id, result }), (error) => parentPort.postMessage({ id, error: error.message }));
});
