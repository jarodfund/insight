const fs = require("node:fs");
const path = require("node:path");

// Only these reviewed, pinned desktop packages reuse their module factory across
// workspaces. Pi still invokes each factory with a fresh API and reads resources.
const PACKAGES = [
  ["pi-web-access", "0.29.0", "index.ts"],
  ["@upstash/context7-pi", "0.1.2", "extensions/context7.ts"],
  ["pi-subagents", "0.68.0", "index.ts"],
  ["pi-mcp-adapter", "2.34.0", "index.ts"],
  ["pi-lens", "4.1.6", "dist/index.js"],
  ["@juicesharp/rpiv-todo", "2.10.1", "index.ts"],
  ["@juicesharp/rpiv-ask-user-question", "2.10.1", "index.ts"],
  ["pi-background-tasks", "2.5.0", "extensions/anthropic-attribution.ts", "extensions/background-tasks.ts"],
];

function reusableExtensionPaths(agentDirectory, npmDirectory = "npm") {
  const entries = [];
  for (const [name, version, ...packageEntries] of PACKAGES) {
    const directory = path.join(agentDirectory, npmDirectory, "node_modules", name);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
      if (manifest.name !== name || manifest.version !== version) continue;
      for (const entry of packageEntries) {
        const file = path.join(directory, entry);
        if (fs.statSync(file).isFile()) entries.push(file);
      }
    } catch { /* Missing, modified or upgraded packages use native cache rules. */ }
  }
  return entries;
}

const CACHE_ORIGINAL = `const extensionCache = new Map();
export function clearExtensionCache() {
    extensionCache.clear();`;
const CACHE_PATCHED = `const extensionCache = new Map();
// pi-desktop: keep reviewed installed module factories across cwd changes.
const desktopExtensionCache = new Map();
function extensionFactoryCache(extensionPath) {
    try {
        const entries = JSON.parse(process.env.PI_DESKTOP_EXTENSION_CACHE || "[]");
        if (process.env.PI_SUBAGENT_CHILD !== "1" && process.env.PI_SUBAGENTS_HERDR_BRIDGE !== "1" &&
            Array.isArray(entries) && entries.includes(extensionPath)) return desktopExtensionCache;
    } catch { /* Invalid opt-in falls back to native cache rules. */ }
    return extensionCache;
}
export function clearExtensionCache() {
    desktopExtensionCache.clear();
    extensionCache.clear();`;

const CWD_ORIGINAL = `    if (extensionCacheCwd !== undefined && extensionCacheCwd !== resolvedCwd) {
        clearExtensionCache();
    }`;
const CWD_PATCHED = `    if (extensionCacheCwd !== undefined && extensionCacheCwd !== resolvedCwd) {
        extensionCache.clear();
        extensionCacheGeneration++;
    }`;

const LOOKUP_ORIGINAL = `async function loadExtensionModule(extensionPath, cacheToken) {
    if (isCurrentCacheToken(cacheToken)) {
        const cachedFactory = extensionCache.get(extensionPath);`;
const LOOKUP_PATCHED = `async function loadExtensionModule(extensionPath, cacheToken) {
    const factoryCache = extensionFactoryCache(extensionPath);
    // In-process subagents may temporarily change these flags. Never return a
    // parent factory to a child, or a child factory to the parent.
    const factoryKey = JSON.stringify([extensionPath, process.env.PI_SUBAGENT_CHILD, process.env.PI_SUBAGENTS_HERDR_BRIDGE]);
    if (isCurrentCacheToken(cacheToken)) {
        const cachedFactory = factoryCache.get(factoryKey);`;

const BIND_ORIGINAL = `    const rebindSession = async () => {
        session = runtimeHost.session;
        await session.bindExtensions({`;
const BIND_PATCHED = `    // pi-desktop: runtime replacement already invokes this callback once.
    let desktopBoundSession;
    const rebindSession = async () => {
        session = runtimeHost.session;
        if (desktopBoundSession === session) return;
        await session.bindExtensions({`;
const SUBSCRIBE_ORIGINAL = `        unsubscribeBackpressure = session.agent.subscribe(async () => {
            await waitForRawStdoutBackpressure();
        });`;
const SUBSCRIBE_PATCHED = `${SUBSCRIBE_ORIGINAL}
        desktopBoundSession = session;`;

function patchNavigationSource(source, version, kind) {
  if (version !== "0.85.1") throw new Error(`Unsupported Pi ${version}: review the desktop navigation patch before upgrading.`);
  const replacements = kind === "loader" ? [
    [CACHE_ORIGINAL, CACHE_PATCHED],
    [CWD_ORIGINAL, CWD_PATCHED],
    [LOOKUP_ORIGINAL, LOOKUP_PATCHED],
    ["        extensionCache.set(extensionPath, factory);", "        factoryCache.set(factoryKey, factory);"],
  ] : kind === "rpc" ? [
    [BIND_ORIGINAL, BIND_PATCHED],
    [SUBSCRIBE_ORIGINAL, SUBSCRIBE_PATCHED],
  ] : [];
  if (!replacements.length) throw new Error(`Unknown navigation patch: ${kind}`);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let patched = source.replaceAll("\r\n", "\n");
  if (replacements.every(([, after]) => patched.split(after).length === 2)) {
    const remainder = replacements.reduce((value, [, after]) => value.replace(after, ""), patched);
    if (replacements.some(([before]) => remainder.includes(before))) throw new Error(`Pi ${kind} navigation patch contains mixed original and patched code.`);
    return source;
  }
  for (const [before, after] of replacements) {
    if (patched.split(before).length !== 2 || patched.includes(after)) {
      throw new Error(`Pi ${kind} navigation patch does not match this installation. Reinstall the supported Pi runtime.`);
    }
    patched = patched.replace(before, after);
  }
  return patched.replaceAll("\n", newline);
}

function ensureNavigationPatches(cli) {
  const directory = path.dirname(path.dirname(cli));
  const { version } = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  // Validate both files before modifying either one.
  const files = [
    ["loader", "dist/core/extensions/loader.js"],
    ["rpc", "dist/modes/rpc/rpc-mode.js"],
  ].map(([kind, relative]) => {
    const file = path.join(directory, relative);
    const original = fs.readFileSync(file, "utf8");
    return { file, original, patched: patchNavigationSource(original, version, kind) };
  });
  for (const { file, original, patched } of files) {
    if (original === patched) continue;
    try { fs.writeFileSync(`${file}.pi-desktop-original`, original, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, patched);
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
}

module.exports = { ensureNavigationPatches, patchNavigationSource, reusableExtensionPaths, PACKAGES };
