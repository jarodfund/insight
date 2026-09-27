const fs = require("node:fs");
const path = require("node:path");
const { withThinkingLevels } = require("./reasoning-profiles.js");

const BASE_URL = "https://jarodfund.xyz/v1";
const RETRY_SETTINGS = {
  enabled: true,
  maxRetries: 10,
  baseDelayMs: 2000,
  maxAgentDelayMs: 30000,
  provider: { maxRetries: 0, timeoutMs: 300000, maxRetryDelayMs: 60000 },
};

function withApiBaseUrl(model) {
  // Anthropic's SDK appends /v1/messages; OpenAI's SDK appends /responses
  // or /chat/completions. Preserve independently configured custom hosts.
  if (model.baseUrl && ![BASE_URL, `${BASE_URL}/`, "https://jarodfund.xyz", "https://jarodfund.xyz/"].includes(model.baseUrl)) return model;
  if (model.api === "anthropic-messages") return { ...model, baseUrl: "https://jarodfund.xyz" };
  return model.baseUrl ? { ...model, baseUrl: BASE_URL } : model;
}

function withImageInput(model) {
  // JarodFund's catalog omits input modalities. Supply the known multimodal
  // families, preserving explicit provider/user overrides for all models.
  const id = model.id.replace(/^(cursor-|max-)/, "");
  const multimodal = /^(gpt-(4o|4\.1|5)(-|\.|$)|claude-(3|opus-4|opus-5|sonnet-4|sonnet-5)|gemini-)/.test(id);
  return !model.input && multimodal ? { ...model, input: ["text", "image"] } : model;
}

function resolveWindowsShellPath() {
  if (process.platform !== "win32") return undefined;
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path");
  const searchDirectories = (process.env[pathKey] || "").split(path.delimiter).filter(Boolean);
  const candidates = [
    process.env.GIT_BASH_PATH,
    ...[process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean).map((directory) => path.join(directory, "Git", "bin", "bash.exe")),
    ...searchDirectories.flatMap((directory) => [
      path.join(directory, "bash.exe"),
      ...(fs.existsSync(path.join(directory, "git.exe")) ? [path.resolve(directory, "../bin/bash.exe")] : []),
    ]),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

const DESKTOP_EXTENSION = `const { adaptReasoningPayload } = require("../jarod-reasoning.cjs");
module.exports = function desktopCommands(pi) {
  pi.on("before_provider_request", (event, context) => adaptReasoningPayload(event.payload, context.model));
  pi.registerCommand("reload", {
    description: "Reload settings, extensions, skills, prompts, themes, and context files",
    handler: async (_args, context) => { await context.reload(); },
  });
};
`;

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Cannot read configuration: ${path.basename(file)}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function prepareAgentDirectory(directory, globalDirectory) {
  const file = path.join(directory, "models.json");
  const catalog = readJson(fs.existsSync(file) ? file : path.join(globalDirectory, "models.json"));
  catalog.providers ??= {};
  const existing = catalog.providers.jarodfund ?? {};
  catalog.providers.jarodfund = {
    ...existing,
    baseUrl: BASE_URL,
    api: existing.api || "openai-completions",
    apiKey: "$JARODFUND_API_KEY",
    headers: { "x-openai-actor-authorization": "1" },
    models: (existing.models?.length ? existing.models : [{
      id: "gpt-5.6-sol",
      api: "openai-responses",
    }]).map(withImageInput).map(withThinkingLevels).map(withApiBaseUrl),
  };
  writeJson(file, catalog);
  const settingsFile = path.join(directory, "settings.json");
  const settings = readJson(settingsFile);
  const globalSettings = readJson(path.join(globalDirectory, "settings.json"));
  const shellPath = settings.shellPath ?? globalSettings.shellPath ?? resolveWindowsShellPath();
  const defaultTools = settings.defaultTools ?? globalSettings.defaultTools ??
    ["read", "bash", ...(process.platform === "win32" ? ["powershell"] : []), "edit", "write", "grep", "find", "ls"];
  writeJson(settingsFile, {
    ...settings,
    ...(shellPath ? { shellPath } : {}),
    defaultTools,
    retry: RETRY_SETTINGS,
    // Long reasoning/tool/image requests can legitimately be quiet for more
    // than a minute. Keep a finite timeout, but avoid false disconnects.
    httpIdleTimeoutMs: 300000,
  });
  const extensionDirectory = path.join(directory, "extensions");
  const extensionFile = path.join(extensionDirectory, "desktop-commands.js");
  const reasoningFile = path.join(directory, "jarod-reasoning.cjs");
  const reasoningSource = fs.readFileSync(path.join(__dirname, "reasoning-profiles.js"), "utf8");
  fs.mkdirSync(extensionDirectory, { recursive: true });
  if (!fs.existsSync(reasoningFile) || fs.readFileSync(reasoningFile, "utf8") !== reasoningSource) {
    fs.writeFileSync(reasoningFile, reasoningSource, { mode: 0o600 });
  }
  if (!fs.existsSync(extensionFile) || fs.readFileSync(extensionFile, "utf8") !== DESKTOP_EXTENSION) {
    fs.writeFileSync(extensionFile, DESKTOP_EXTENSION, { mode: 0o600 });
  }
}

function modelsFromCatalog(data, previous = []) {
  const known = new Map(previous.map((model) => [model.id, model]));
  const unique = new Map();
  for (const entry of data) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim()) continue;
    const endpoints = entry.supported_endpoint_types || [];
    if (entry.id === "minimax-h3" || /image|imagine|video|seedance|veo|omni-flash/i.test(entry.id) && !/vision/i.test(entry.id)) continue;
    if (endpoints.length && !endpoints.some((type) => ["openai", "openai-response", "anthropic"].includes(type))) continue;
    const api = endpoints.includes("openai-response") ? "openai-responses"
      : endpoints.includes("openai") || !endpoints.length ? "openai-completions" : "anthropic-messages";
    const input = Array.isArray(entry.input) && entry.input.every((type) => ["text", "image"].includes(type)) ? entry.input : undefined;
    const model = withImageInput({ ...known.get(entry.id), id: entry.id, api, ...(input?.length ? { input } : {}) });
    unique.set(model.id, withApiBaseUrl(withThinkingLevels(model)));
  }
  return [...unique.values()];
}

async function fetchModelCatalog(key, fetcher = fetch) {
  let response;
  let payload;
  try {
    response = await fetcher(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}`, "x-openai-actor-authorization": "1" },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (response.status === 401 || response.status === 403) throw new Error("INVALID_KEY");
    if (!response.ok) throw new Error("UNAVAILABLE");
    payload = await response.json();
  } catch (error) {
    // Never forward provider response bodies or request headers containing credentials.
    if (error.message === "INVALID_KEY") throw new Error("API Key 无效或没有访问权限，请检查后重试。");
    throw new Error("暂时无法连接 JarodFund，原有 Key 未更改，请稍后重试。");
  }
  if (payload?.error || !Array.isArray(payload?.data)) throw new Error("JarodFund 未返回有效模型列表，Key 未保存。");
  return payload.data;
}

async function fetchModels(key, previous, fetcher = fetch) {
  const models = modelsFromCatalog(await fetchModelCatalog(key, fetcher), previous);
  if (!models.length) throw new Error("该 Key 没有可用的文本模型，Key 未保存。");
  return models;
}

module.exports = { BASE_URL, RETRY_SETTINGS, DESKTOP_EXTENSION, readJson, writeJson, prepareAgentDirectory, modelsFromCatalog, fetchModels, fetchModelCatalog, resolveWindowsShellPath };
