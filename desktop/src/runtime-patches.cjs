const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

// Jiti 2.7.0 otherwise sends plain JS through native import/require even when
// Pi sets moduleCache:false. Node's ESM cache then survives context.reload().
// Keep package imports native: re-evaluating the SDK breaks its shared state.
const ORIGINAL = 'S=n.forceTranspile??(!C&&!(w&&n.async)&&(E||w||t.isTransformRe.test(c)||hasESMSyntax(i)))';
const PATCHED = String.raw`S=n.forceTranspile??(!1===t.opts.moduleCache&&!/(^|[\\/])node_modules([\\/]|$)/i.test(c)||!C&&!(w&&n.async)&&(E||w||t.isTransformRe.test(c)||hasESMSyntax(i)))`;

function patchJitiSource(source, version) {
  if (version !== "2.7.0") throw new Error(`Unsupported Jiti ${version}: review the desktop extension reload patch before upgrading Pi.`);
  if (source.includes(PATCHED) && !source.includes(ORIGINAL)) return source;
  if (source.split(ORIGINAL).length !== 2 || source.includes(PATCHED)) {
    throw new Error("Jiti reload patch does not match this installation. Reinstall the supported Pi runtime.");
  }
  return source.replace(ORIGINAL, PATCHED);
}

function ensureExtensionReloadPatch(cli) {
  const packageFile = createRequire(cli).resolve("jiti/package.json");
  const { version } = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  const file = path.join(path.dirname(packageFile), "dist", "jiti.cjs");
  const original = fs.readFileSync(file, "utf8");
  const patched = patchJitiSource(original, version);
  if (patched === original) return;
  // Preserve the exact installed file and replace atomically before Pi starts.
  const backup = `${file}.insight-original`;
  try { fs.writeFileSync(backup, original, { flag: "wx" }); }
  catch (error) { if (error.code !== "EEXIST") throw error; }
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, patched);
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = { ensureExtensionReloadPatch, patchJitiSource };
