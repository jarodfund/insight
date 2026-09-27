const path = require("node:path");
const { parentPort } = require("node:worker_threads");
const { runtimeDirectory } = require("./product-paths.cjs");
const { loadEntriesFromFile } = require(path.join(runtimeDirectory, "node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js"));

function toMessages(entries, leafId) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const branch = [];
  const visited = new Set();
  let id = leafId;
  while (id) {
    if (visited.has(id)) throw new Error("Session history contains a cycle.");
    const entry = byId.get(id);
    if (!entry) throw new Error("Session history is missing a parent entry.");
    visited.add(id);
    branch.push(entry);
    id = entry.parentId;
  }
  return branch.reverse().flatMap((entry) => {
    if (entry.type === "message") return [entry.message];
    if (entry.type === "compaction") return [{ role: "desktopCompaction", timestamp: Date.parse(entry.timestamp) }];
    return [];
  });
}

parentPort.on("message", ({ id, file }) => {
  try {
    const entries = loadEntriesFromFile(file);
    const leafId = entries.at(-1)?.id || null;
    parentPort.postMessage({ id, file, messages: toMessages(entries, leafId) });
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message || String(error) });
  }
});
