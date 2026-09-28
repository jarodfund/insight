const fs = require("node:fs");
const path = require("node:path");

// Reuse the SDK instances that Pi has already loaded, including legacy aliases.
// Each extension still gets its own factory/API and keeps native reload behavior.
const SHARED_BEFORE = "                : { alias: getAliases() }),";
const SHARED_AFTER = "                : { alias: getAliases(), ...(process.env.INSIGHT_SHARED_MODULES === \"1\" ? { virtualModules: VIRTUAL_MODULES } : {}) }),";
const LEGACY_SHARED_AFTER = SHARED_AFTER.replace("INSIGHT_SHARED_MODULES", "JAROD_PI_SHARED_MODULES");
const MODELS_BEFORE = `            case "get_available_models": {
                const models = session.modelRuntime.getAvailableSnapshot();`;
const MODELS_AFTER = `            case "get_available_models": {
                // Insight refreshes only local provider metadata, never the session.
                if (command.refresh === true) {
                    await session.modelRuntime.refresh({ allowNetwork: false, providers: ["jarodfund"] });
                    const configurationError = session.modelRuntime.getError();
                    if (configurationError) return error(id, "get_available_models", configurationError);
                }
                const models = session.modelRuntime.getAvailableSnapshot();`;
const LEGACY_MODELS_AFTER = MODELS_AFTER.replace("Insight refreshes", "Jarod-Pi refreshes");

function patchStartupSource(source, version, kind) {
  if (version !== "0.85.1") throw new Error(`Unsupported Pi ${version}: review desktop startup patches before upgrading.`);
  const [before, after] = kind === "loader" ? [SHARED_BEFORE, SHARED_AFTER] : kind === "rpc" ? [MODELS_BEFORE, MODELS_AFTER] : [];
  if (!before) throw new Error(`Unknown startup patch: ${kind}`);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let normalized = source.replaceAll("\r\n", "\n");
  const legacyAfter = kind === "loader" ? LEGACY_SHARED_AFTER : LEGACY_MODELS_AFTER;
  if (normalized.includes(legacyAfter)) normalized = normalized.replace(legacyAfter, after);
  if (normalized.split(after).length === 2 && !normalized.replace(after, "").includes(before)) return normalized.replaceAll("\n", newline);
  if (normalized.split(before).length !== 2 || normalized.includes(after)) throw new Error(`Pi ${kind} startup patch does not match this installation.`);
  return normalized.replace(before, after).replaceAll("\n", newline);
}

function ensureStartupPatches(cli) {
  const directory = path.dirname(path.dirname(cli));
  const { version } = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const files = [["loader", "dist/core/extensions/loader.js"], ["rpc", "dist/modes/rpc/rpc-mode.js"]].map(([kind, relative]) => {
    const file = path.join(directory, relative);
    const original = fs.readFileSync(file, "utf8");
    return { file, original, patched: patchStartupSource(original, version, kind) };
  });
  for (const { file, original, patched } of files) {
    if (original === patched) continue;
    try { fs.writeFileSync(`${file}.insight-original`, original, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const temporary = `${file}.${process.pid}.tmp`;
    try { fs.writeFileSync(temporary, patched); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}

module.exports = { ensureStartupPatches, patchStartupSource };
