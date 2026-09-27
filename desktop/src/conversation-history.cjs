// The model context drops old messages after compaction. The transcript must
// follow the session tree instead, including the ancestors before compaction.
function conversationHistory(entries, leafId) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const branch = [];
  const visited = new Set();
  let id = leafId;
  while (id) {
    if (visited.has(id)) throw new Error("会话记录存在循环，无法读取完整历史。");
    const entry = byId.get(id);
    if (!entry) throw new Error("会话记录缺少上级节点，无法读取完整历史。");
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

module.exports = { conversationHistory };
