// Built-in capabilities stay available to the native runtime, but do not need
// personal-agent cards. Paths are relative to the distributed ecosystem root.
const BUILTIN_SKILLS = [
  { name: "playwright-cli", directory: "node_modules/@playwright/cli/skills/playwright-cli" },
  { name: "context7-docs", directory: "node_modules/@upstash/context7-pi/skills/context7-docs" },
  { name: "council-mode", directory: "node_modules/pi-subagents/skills/council-mode" },
  { name: "pi-subagents", directory: "node_modules/pi-subagents/skills/pi-subagents" },
  { name: "mcp-scripting", directory: "node_modules/pi-mcp-adapter/skills/mcp-scripting" },
  ...["pi-lens-ast-grep", "pi-lens-lsp-navigation", "pi-lens-write-ast-grep-rule", "pi-lens-write-tree-sitter-rule"]
    .map((name) => ({ name, directory: `node_modules/pi-lens/skills/${name}` })),
];

// Local installations are preserved. These skills are excluded only from
// publication artifacts, including reused resource staging directories.
const EXCLUDED_RELEASE_SKILLS = ["winui-design"];
function isExcludedReleasePath(file) {
  return file.split(/[\\/]/).some((part) => EXCLUDED_RELEASE_SKILLS.includes(part.toLowerCase()));
}

module.exports = { BUILTIN_SKILLS, EXCLUDED_RELEASE_SKILLS, isExcludedReleasePath };
