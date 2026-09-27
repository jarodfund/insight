const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_FILES = 50;
const FILE_MARKER = "\n\n[本地文件路径 / 按需读取，选择文件时未上传内容]\n";

class LocalFiles {
  entries = new Map();

  async add(paths) {
    if (!Array.isArray(paths) || paths.length > MAX_FILES) throw new Error(`每次最多选择 ${MAX_FILES} 个文件。`);
    const files = await Promise.all([...new Set(paths)].map(async (file) => {
      if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("请选择磁盘上的文件。");
      const stat = await fs.promises.stat(file).catch(() => { throw new Error(`文件不存在或无法访问：${file}`); });
      if (!stat.isFile()) throw new Error(`请选择文件，而不是文件夹：${file}`);
      return { id: randomUUID(), kind: "file", name: path.basename(file), path: file, bytes: stat.size };
    }));
    for (const file of files) this.entries.set(file.id, file);
    return files;
  }

  async resolve(ids = []) {
    if (!Array.isArray(ids) || ids.length > MAX_FILES) throw new Error("文件附件列表无效。");
    return Promise.all([...new Set(ids)].map(async (id) => {
      const file = this.entries.get(id);
      if (!file) throw new Error("文件附件已失效，请重新选择。");
      const stat = await fs.promises.stat(file.path).catch(() => null);
      if (!stat?.isFile()) throw new Error(`文件已移动、删除或无法访问，请重新选择：${file.path}`);
      return file;
    }));
  }
}

function appendFilePaths(message, files) {
  return files.length ? `${message.trim() || "请查看这些文件。"}${FILE_MARKER}${files.map((file) => JSON.stringify(file.path)).join("\n")}` : message;
}

module.exports = { LocalFiles, appendFilePaths, FILE_MARKER, MAX_FILES };
