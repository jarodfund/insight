const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const productEntries = ["agent", "desktop-settings.json", "desktop-library.json", "desktop-specialists.json", "desktop-permissions.json", "jarodfund-key.enc", "jarodfund-key.enc.managed", "video-tasks"];

function prepareProfileEncryption(previous, next) {
  // Chromium reads this encryption state early. Seed it before app.ready or
  // creating a window, otherwise safeStorage would generate a different key.
  if (path.dirname(previous) !== path.dirname(next) || previous === next) throw new Error("无效的数据迁移目录。");
  const source = path.join(previous, "Local State");
  if (fs.existsSync(source) && !productEntries.some((name) => fs.existsSync(path.join(next, name)))) {
    fs.mkdirSync(next, { recursive: true });
    fs.copyFileSync(source, path.join(next, "Local State"));
  }
}

function relocate(value, previous, next) {
  const from = previous.replaceAll("\\", "/").toLowerCase();
  if (typeof value === "string") {
    const normalized = value.replaceAll("\\", "/");
    return normalized.toLowerCase() === from || normalized.toLowerCase().startsWith(`${from}/`)
      ? next + normalized.slice(from.length).split("/").join(path.sep) : value;
  }
  if (Array.isArray(value)) return value.map((item) => relocate(item, previous, next));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [relocate(key, previous, key === key.toLowerCase() ? next.toLowerCase() : next), relocate(item, previous, next)]));
  return value;
}

async function finishMigration(next, journal) {
  const { temporary, entries } = JSON.parse(await fs.promises.readFile(journal, "utf8"));
  if (path.dirname(temporary) !== path.dirname(next) || !temporary.startsWith(`${next}.migration-`) || !Array.isArray(entries) || entries.some((name) => path.basename(name) !== name || name === "..")) throw new Error("迁移记录无效，原数据仍保留。");
  for (const name of entries) {
    const source = path.join(temporary, name);
    const target = path.join(next, name);
    if (fs.existsSync(source)) await fs.promises.rename(source, target);
    else if (!fs.existsSync(target)) throw new Error("迁移文件缺失，原数据仍保留。");
  }
  await fs.promises.rmdir(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await fs.promises.unlink(journal);
}

// The original profile remains recoverable. A journal resumes interrupted
// publication before any conversation can open or change the new profile.
async function migrateProfile(previous, next) {
  const retained = [...productEntries, "Local State"];
  if (path.dirname(previous) !== path.dirname(next) || previous === next) throw new Error("无效的数据迁移目录。");
  const journal = path.join(next, ".profile-migration.json");
  if (fs.existsSync(journal)) { await finishMigration(next, journal); return true; }
  if (productEntries.some((name) => fs.existsSync(path.join(next, name))) || !fs.existsSync(previous)) return false;
  const temporary = `${next}.migration-${randomUUID()}`;
  await fs.promises.mkdir(temporary);
  try {
    for (const name of retained) {
      const source = path.join(previous, name);
      if (fs.existsSync(source)) await fs.promises.cp(source, path.join(temporary, name), { recursive: true, dereference: false, verbatimSymlinks: true });
    }
    const configurations = ["desktop-settings.json", "desktop-library.json", "desktop-specialists.json", "desktop-permissions.json", "agent/settings.json"];
    const tasks = path.join(temporary, "video-tasks");
    if (fs.existsSync(tasks)) for (const entry of await fs.promises.readdir(tasks)) if (entry.endsWith(".json")) configurations.push(`video-tasks/${entry}`);
    for (const relative of configurations) {
      const file = path.join(temporary, relative);
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(await fs.promises.readFile(file, "utf8"));
      await fs.promises.writeFile(file, `${JSON.stringify(relocate(data, previous, next), null, 2)}\n`, { mode: 0o600 });
    }
    await fs.promises.writeFile(path.join(temporary, "migration.json"), JSON.stringify({ from: previous, completedAt: new Date().toISOString() }));
    if (!fs.existsSync(next)) await fs.promises.rename(temporary, next);
    else {
      const entries = await fs.promises.readdir(temporary);
      await fs.promises.writeFile(journal, JSON.stringify({ temporary, entries }), { flag: "wx", mode: 0o600 });
      await finishMigration(next, journal);
    }
    return true;
  } catch (error) {
    // Only the exact, newly created staging directory belongs to this operation.
    if (!fs.existsSync(journal)) await fs.promises.rm(temporary, { recursive: true, force: true });
    throw new Error(`学术派数据迁移未完成，原数据仍保留：${error.message}`);
  }
}

module.exports = { migrateProfile, prepareProfileEncryption, relocate };
