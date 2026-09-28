const path = require("node:path");
const fs = require("node:fs");
const { reusableExtensionPaths } = require("./navigation-patches.cjs");
const { portablePlatform } = require("./portable-platform.cjs");

function createRuntimeEnvironment(environment, { node, cli, agentDirectory, key, specialistDirectory }) {
  const env = { ...environment };
  const ecosystem = JSON.parse(environment.INSIGHT_COMPONENTS || "{}").ecosystem;
  const pathKeys = Object.keys(env).filter((name) => process.platform === "win32" ? name.toLowerCase() === "path" : name === "PATH");
  const pathKey = pathKeys[0] || "PATH";
  const inheritedPath = env[pathKey];
  const portable = specialistDirectory && fs.existsSync(path.join(specialistDirectory, "portable.json"));
  const pythonBin = portable ? path.dirname(portablePlatform().python) : process.platform === "win32" ? ".venv/Scripts" : ".venv/bin";
  for (const name of pathKeys) delete env[name];
  env[pathKey] = [
    ...(path.isAbsolute(node) ? [path.dirname(node)] : []),
    ...(specialistDirectory ? [path.join(specialistDirectory, pythonBin), path.join(specialistDirectory, "bin"), path.join(specialistDirectory, "media-node", "node_modules", ".bin"), path.join(specialistDirectory, "creator-node", "node_modules", ".bin")] : []),
    path.join(agentDirectory, "npm", "node_modules", ".bin"),
    ...(ecosystem ? [path.join(ecosystem, "node_modules/.bin")] : []),
    inheritedPath,
  ].filter(Boolean).join(path.delimiter);
  env.PI_CODING_AGENT_DIR = agentDirectory;
  env.INSIGHT_SHARED_MODULES = "1";
  env.JARODFUND_API_KEY = key;
  env.PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT = path.dirname(path.dirname(cli));
  // Do not import MCP connections or credentials from other desktop applications.
  env.PI_MCP_CONFIG_MODE = "exclusive";
  if (specialistDirectory) env.MCPORTER_CONFIG = path.join(specialistDirectory, "mcporter.json");
  env.INSIGHT_EXTENSION_CACHE = JSON.stringify([...reusableExtensionPaths(agentDirectory), ...(ecosystem ? reusableExtensionPaths(path.dirname(ecosystem), path.basename(ecosystem)) : [])]);
  if (specialistDirectory) {
    if (portable) {
      const layout = JSON.parse(fs.readFileSync(path.join(specialistDirectory, "portable.json"), "utf8"));
      const hyperframesBrowser = path.join(specialistDirectory, layout.hyperframesBrowser || (process.platform === "win32" ? "hyperframes-browser/chrome-headless-shell.exe" : "hyperframes-browser/chrome-headless-shell"));
      if (fs.existsSync(hyperframesBrowser)) env.HYPERFRAMES_BROWSER_PATH = hyperframesBrowser;
      const chromium = layout.chromiumBrowser && path.join(specialistDirectory, layout.chromiumBrowser);
      if (chromium && fs.existsSync(chromium)) env.PLAYWRIGHT_MCP_EXECUTABLE_PATH = chromium;
      env.PYTHONUTF8 = "1";
      delete env.PYTHONHOME;
      delete env.PYTHONPATH;
    }
    env.PLAYWRIGHT_BROWSERS_PATH = path.join(specialistDirectory, "browsers");
    if (!fs.existsSync(env.PLAYWRIGHT_BROWSERS_PATH)) delete env.PLAYWRIGHT_BROWSERS_PATH;
  }
  return env;
}

module.exports = { createRuntimeEnvironment };
