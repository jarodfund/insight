const fs = require("node:fs");
const path = require("node:path");
const { readJson, writeJson } = require("./agent-config.cjs");
const { PACKAGES } = require("./navigation-patches.cjs");
const { BUILTIN_SKILLS } = require("./skill-policy.cjs");

function applyManagedResources(agentDirectory, components, node) {
  const directory = components.ecosystem;
  if (!directory) return;
  const file = path.join(agentDirectory, "settings.json");
  const settings = readJson(file);
  const oldPaths = settings.jarodManagedPaths || [];
  const extensions = PACKAGES.flatMap(([name, , ...entries]) => entries.map((entry) => path.join(directory, "node_modules", name, entry)));
  const skills = BUILTIN_SKILLS.map((skill) => path.join(directory, skill.directory));
  for (const entry of [...extensions, ...skills]) if (!fs.existsSync(entry)) throw new Error("智能体工具资源不完整，请在设置中重新安装资源。");
  for (const entry of skills) if (!fs.existsSync(path.join(entry, "SKILL.md"))) throw new Error("基础能力的技能资料不完整，请在设置中重新安装资源。");
  const builtinPackages = new Set(PACKAGES.map(([name, version]) => `npm:${name}@${version}`));
  const builtinSkillPaths = new Set(["npm/node_modules/pi-lens/skills", ...BUILTIN_SKILLS.map((skill) => `npm/${skill.directory}`)]);
  settings.packages = (settings.packages || []).filter((item) => typeof item !== "string" || !builtinPackages.has(item));
  settings.extensions = [...(settings.extensions || []).filter((item) => !oldPaths.includes(item)), ...extensions];
  settings.skills = [...(settings.skills || []).filter((item) => !oldPaths.includes(item) && !builtinSkillPaths.has(item)), ...skills];
  settings.jarodManagedPaths = [...extensions, ...skills];
  settings.npmCommand = [node, path.join(path.dirname(node), process.platform === "win32" ? "node_modules/npm/bin/npm-cli.js" : "../lib/node_modules/npm/bin/npm-cli.js"), "--ignore-scripts", "--save-exact"];
  writeJson(file, settings);
  // Only known non-secret defaults are distributed. Never mirror credentials,
  // accounts, cookies or the developer's MCP connections into user installs.
  for (const name of ["web-search.json", "mcp.json", "extensions/subagent/config.json"]) {
    const source = path.join(directory, name);
    const target = path.join(agentDirectory, name);
    if (fs.existsSync(source) && !fs.existsSync(target)) writeJson(target, readJson(source));
  }
}

module.exports = { applyManagedResources };
