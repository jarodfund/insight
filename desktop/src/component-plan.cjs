// Shared by the portable packager and the desktop. Packages are immutable and
// shared between agents; selecting a card never requests the entire catalog.
const { portablePlatform } = require("./portable-platform.cjs");
const BASE_COMPONENTS = ["ecosystem", "runtime-layout", "perspectives", "research", "grill-me"];
const RUNTIME_PARTS = {
  "runtime-layout": ["portable.json", "installed.json", "creators.json"],
  "research-python": ["python"],
  "creator-python": ["creator-python"],
  "research-cli": [portablePlatform().orx],
  "media-tools": portablePlatform().tools,
  "web-reach": ["media-node", "mcporter.json"],
  "creator-tools": ["creator-node"],
  "creator-browser": ["browsers"],
  "hyperframes-browser": ["hyperframes-browser"],
};
const CREATOR = ["creator-python", "media-tools", "creator-tools", "hyperframes-browser"];
const AGENT_COMPONENTS = {
  "ppt-master": ["research-python"], "codex-ppt": ["research-python"],
  "paper-qa": ["research-python"], "book-to-skill": ["research-python"],
  openresearch: ["research-cli"], feynman: ["research-python", "research-cli"],
  academic: [], "grill-me": [],
  "yt-dlp": ["research-python", "media-tools"],
  "agent-reach": ["research-python", "media-tools", "web-reach"],
  easel: [...CREATOR, "creator-browser", "hyperframes"], hyperframes: CREATOR,
};

function agentComponents(agent) {
  if (agent.kind === "research") return ["research"];
  if (agent.kind === "perspective") return ["perspectives"];
  if (!Object.hasOwn(AGENT_COMPONENTS, agent.id)) throw new Error("未知的内置智能体。");
  return ["runtime-layout", agent.id, ...AGENT_COMPONENTS[agent.id]];
}

module.exports = { BASE_COMPONENTS, RUNTIME_PARTS, AGENT_COMPONENTS, agentComponents };
