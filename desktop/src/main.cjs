const { app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, shell, safeStorage, clipboard, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Worker } = require("node:worker_threads");
const { pathToFileURL } = require("node:url");
const { Credentials } = require("./credentials.cjs");
const { Rpc } = require("./rpc.cjs");
const { Task } = require("./task.cjs");
const { Library, pathKey } = require("./library.cjs");
const { BASE_URL, readJson, writeJson, prepareAgentDirectory, fetchModelCatalog, modelsFromCatalog } = require("./agent-config.cjs");
const { commandCatalog } = require("./slash-commands.cjs");
const { ensureExtensionReloadPatch } = require("./runtime-patches.cjs");
const { ensureNavigationPatches } = require("./navigation-patches.cjs");
const { ensureStartupPatches } = require("./startup-patches.cjs");
const { createRuntimeEnvironment } = require("./runtime-env.cjs");
const { MAX_ATTACHMENTS, imageBytes, inspectImage, saveVerifiedImage, generateImage } = require("./images.cjs");
const { openImage, copyImage, openVideo, copyVideo } = require("./media-actions.cjs");
const { IMAGE_PROFILES, imageProfile, normalizeImageOptions } = require("./image-models.cjs");
const { createImageBridge } = require("./image-bridge.cjs");
const { VIDEO_PROFILES, videoProfile, normalizeVideoOptions } = require("./video-models.cjs");
const { VideoJobs, safeVideoError } = require("./videos.cjs");
const { createVideoBridge } = require("./video-bridge.cjs");
const { verifyVideo } = require("./video-verifier.cjs");
const { randomUUID } = require("node:crypto");
const { LocalFiles, appendFilePaths } = require("./local-files.cjs");
const { AGENTS, agentCatalog, runtimePaths } = require("./specialists.cjs");
const { personalAgents } = require("./personal-agents.cjs");
const { PermissionGate, PERMISSION_MODES } = require("./permissions.cjs");
const { createPermissionBridge } = require("./permission-bridge.cjs");
const { conversationHistory } = require("./conversation-history.cjs");
const { name: APP_NAME } = require("./branding.js");
const brand = require("./branding.js");
const { legacyProfileDirectory, migrateProfile, prepareProfileEncryption } = require("./profile.cjs");
const runtime = require("./product-paths.cjs");
const { autoUpdater } = require("electron-updater");
const { Updates } = require("./updates.cjs");
const { Components } = require("./components.cjs");
const { OnDemandComponents } = require("./on-demand-components.cjs");
const { PortableUpdates } = require("./portable-updates.cjs");
const { desktopResourceFetch } = require("./desktop-resource-fetch.cjs");
const { agentComponents } = require("./component-plan.cjs");
const releaseConfig = require("../release-config.json");
const { applyManagedResources } = require("./managed-resources.cjs");
const { ModelCatalog } = require("./model-catalog.cjs");

const originalProfile = app.getPath("userData");
const customProfile = Boolean(process.env.INSIGHT_DATA_DIR) || ![...brand.legacyDirectoryNames, "insight-desktop", brand.directoryName, APP_NAME].some((name) => name.toLowerCase() === path.basename(originalProfile).toLowerCase());
const profileDirectory = process.env.INSIGHT_DATA_DIR ? path.resolve(process.env.INSIGHT_DATA_DIR) : customProfile ? originalProfile : path.join(app.getPath("appData"), brand.directoryName);
const legacyProfile = legacyProfileDirectory(app.getPath("appData"), brand.legacyDirectoryNames);
// Select the profile before Chromium creates a session or the instance lock.
fs.mkdirSync(profileDirectory, { recursive: true });
app.setPath("userData", profileDirectory);
app.setPath("sessionData", profileDirectory);
app.setName(APP_NAME);
if (process.platform === "win32") app.setAppUserModelId(brand.appId);

const projectRoot = runtime.productRoot;
const distributed = app.isPackaged || runtime.distributed;
const defaultWorkspace = distributed ? path.join(app.getPath("documents"), brand.directoryName, "Workspace") : projectRoot;
const defaults = { provider: "jarodfund", model: "gpt-5.6-sol", thinking: "max", cwd: defaultWorkspace, imageModel: "gpt-image-2", imagePreferences: {}, videoModel: "grok-imagine-video-1.5", videoPreferences: {}, permissionMode: "ask" };
const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
let credentials;
let modelCatalog;
let agentDirectory;
let library;
let videoJobs;
let updates;
let components;
let cachedSpecialists;
let agentSelections = {};
let agentSelectionsFile;
let permissionSelections = {};
let permissionSelectionsFile;
let accountChanging = false;
let quitting = false;
// Conversation contexts are keyed by WebContents, independently of OS windows.
const conversations = new Map();
const hosts = new Map();
const sessionClaims = new Map();
const sessionOperations = new Set();
const channels = new Set();
const attachments = new Map();
const localFiles = new LocalFiles();
const drafts = new Map();
let opening = Promise.resolve();

function broadcast(channel, payload) {
  for (const context of conversations.values()) context.send(channel, payload);
}

async function changeAccount(action) {
  if (accountChanging || sessionOperations.size || [...conversations.values()].some((context) => context.task.active || context.busy())) throw new Error("请先等待所有会话的任务结束，再切换账户。");
  accountChanging = true;
  try { return await action(); } finally { accountChanging = false; }
}

function assertSessionUnlocked(file) {
  if (file && sessionOperations.has(pathKey(file))) throw new Error("正在管理该会话，请完成确认操作后再试。");
}

function openDesktop(options = {}, host) {
  const next = opening.then(async () => {
    assertSessionUnlocked(options.sessionFile);
    const owner = options.sessionFile && (sessionClaims.get(pathKey(options.sessionFile)) || [...conversations.values()].find((context) => context.file() && pathKey(context.file()) === pathKey(options.sessionFile)));
    if (owner) { owner.activate(); return { openedView: true, openedWindow: !host || owner.window !== host.window }; }
    if (host?.window.isDestroyed()) throw new Error("窗口已关闭。");
    // Reuse a finished background conversation when opening another task, so
    // views/processes grow with concurrent work, not with every navigation.
    const reusable = host && [...host.contexts].find((item) => item !== host.active && !item.task.active && !item.busy() && (!item.file() || !sessionOperations.has(pathKey(item.file()))));
    if (reusable) {
      await reusable.retarget(options);
      reusable.activate();
      return { openedView: true };
    }
    await createDesktopWindow(options, host);
    return host ? { openedView: true } : { openedWindow: true };
  });
  opening = next.catch(() => {});
  return next;
}

function createHost() {
  const window = new BrowserWindow({
    width: 1420, height: 900, minWidth: 980, minHeight: 680,
    backgroundColor: "#f8f7f4", title: APP_NAME, icon: path.join(__dirname, process.platform === "win32" ? "icons/xueshupai.ico" : "icons/xueshupai.png"), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  window.removeMenu();
  const host = { window, contexts: new Set(), active: null, closing: false };
  hosts.set(window.id, host);
  window.on("resize", () => {
    const [width, height] = window.getContentSize();
    for (const context of host.contexts) context.view?.setBounds({ x: 0, y: 0, width, height });
  });
  window.on("close", (event) => {
    const running = [...host.contexts].filter((context) => context.task.active);
    if (!running.length || quitting || host.closing) return;
    event.preventDefault();
    void dialog.showMessageBox(window, { type: "question", message: `此窗口有 ${running.length} 个会话任务仍在进行`, detail: "关闭将停止本窗口所有会话的任务，包括后台任务。", buttons: ["继续运行", "停止并关闭"], defaultId: 0, cancelId: 0 }).then(({ response }) => {
      if (response === 1 && !window.isDestroyed()) { host.closing = true; window.close(); }
    });
  });
  window.on("closed", () => {
    hosts.delete(window.id);
    for (const context of host.contexts) { conversations.delete(context.id); context.close(); }
    host.contexts.clear();
  });
  return host;
}

async function createDesktopWindow(initial = {}, host) {
let mainWindow;
let contents;
let context;
const handlers = new Map();
let settingsFile;
let settings = { ...defaults };
let starting;
let resourcesUsed;
let reconnecting;
let changingSettings = false;
let navigatingContext = false;
let submittingPrompt = false;
let stopping = false;
let messageQueue = { steering: [], followUp: [] };
let recoveringQueue;
let sessionFile = initial.sessionFile;
let emptySession;
let pendingConversation;
let extensionCommandError;
let imageBridge;
let videoModels = [];
let videoBridge;
let permissionBridge;
let userAgents = [];
const historyCache = new Map();
const historyLoads = new Map();
const historyRequests = new Map();
let historyWorker;
let historyRequestId = 0;
const pendingInputs = new Set();
const agentPrefix = `[insight-${randomUUID()}]`;

function selectedAgent() {
  const id = agentSelections[sessionFile];
  return id && (AGENTS.some((agent) => agent.id === id) || userAgents.some((agent) => agent.id === id)) ? id : "";
}
function specialists() {
  cachedSpecialists ||= agentCatalog(projectRoot);
  return [...cachedSpecialists, ...userAgents];
}
function permissionMode() {
  const mode = permissionSelections[sessionFile] || settings.permissionMode;
  return PERMISSION_MODES.some((item) => item.id === mode) ? mode : "ask";
}
const permissions = new PermissionGate(() => ({ mode: permissionMode(), cwd: settings.cwd }), (requests) => {
  sendToRenderer("pi:permissions", requests);
  broadcast("app:library-changed");
});

async function loadImageModels(refresh = false) {
  const catalog = await modelCatalog.media(refresh);
  videoModels = catalog.videoModels;
  return catalog.imageModels;
}

function sendToRenderer(channel, payload) {
  if (channel === "app:library-changed") { broadcast(channel); return; }
  if (contents && !contents.isDestroyed()) contents.send(channel, payload);
}

function historySignature(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function stopHistoryWorker() {
  const worker = historyWorker;
  historyWorker = undefined;
  for (const request of historyRequests.values()) request.reject(new Error("历史读取进程已停止。"));
  historyRequests.clear();
  historyLoads.clear();
  if (worker) void worker.terminate();
}

function ensureHistoryWorker() {
  if (historyWorker) return historyWorker;
  const worker = new Worker(path.join(__dirname, "history-reader-worker.cjs"));
  historyWorker = worker;
  worker.on("message", ({ id, file, messages, error }) => {
    const request = historyRequests.get(id);
    historyRequests.delete(id);
    if (!request) return;
    if (error) {
      request.reject(new Error(error));
      return;
    }
    const key = pathKey(file);
    const signature = historySignature(file);
    if (signature) historyCache.set(key, { signature, messages });
    request.resolve(messages);
  });
  worker.on("error", (error) => {
    for (const request of historyRequests.values()) request.reject(error);
    historyRequests.clear();
    historyLoads.clear();
    if (historyWorker === worker) historyWorker = undefined;
  });
  worker.on("exit", (code) => {
    if (historyWorker !== worker) return;
    for (const request of historyRequests.values()) request.reject(new Error(`历史读取进程已退出（${code}）。`));
    historyRequests.clear();
    historyLoads.clear();
    historyWorker = undefined;
  });
  worker.unref();
  return worker;
}

function loadHistory(file) {
  if (!file) return Promise.resolve([]);
  const key = pathKey(file);
  const signature = historySignature(file);
  if (!signature) return Promise.resolve([]);
  const cached = historyCache.get(key);
  if (cached?.signature === signature) return Promise.resolve(cached.messages);
  const existing = historyLoads.get(key);
  if (existing) return existing;
  const id = `history-${++historyRequestId}`;
  const promise = new Promise((resolve, reject) => {
    historyRequests.set(id, { resolve, reject });
    try { ensureHistoryWorker().postMessage({ id, file }); }
    catch (error) { historyRequests.delete(id); reject(error); }
  });
  historyLoads.set(key, promise);
  promise.then(() => {
    if (historyLoads.get(key) === promise) historyLoads.delete(key);
  }, () => {
    if (historyLoads.get(key) === promise) historyLoads.delete(key);
  });
  return promise;
}

function historyResponse(file, { fast = false } = {}) {
  const key = file && pathKey(file);
  const signature = file && historySignature(file);
  const cached = key && historyCache.get(key);
  if (cached?.signature === signature) return { messages: cached.messages, pending: false };
  const pending = loadHistory(file);
  if (fast) {
    void pending.then((messages) => {
      sendToRenderer("app:history-ready", { sessionFile: file, messages });
    }).catch((error) => sendToRenderer("pi:status", { type: "warning", message: `历史记录后台读取失败：${redact(error.message)}` }));
    return { messages: [], pending: true };
  }
  return pending.then((messages) => ({ messages, pending: false }));
}

function redact(message) {
  let value = String(message || "请求失败。");
  if (credentials?.key) value = value.split(credentials.key).join("[REDACTED]");
  return value.replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
}

const task = new Task((value) => {
  if (value?.status !== "running") { permissions.cancel(); pendingInputs.clear(); }
  const safeTask = value ? { ...value, error: value.error && redact(value.error) } : null;
  sendToRenderer("pi:task", safeTask);
  if (safeTask?.status === "running") sendToRenderer("app:library-changed");
  if (safeTask && safeTask.status !== "running") {
    try { if (!library.recordTask(sessionFile, safeTask)) return; }
    catch { sendToRenderer("pi:status", { type: "warning", message: "本次用时未能保存，请检查磁盘空间。" }); }
    sendToRenderer("app:library-changed");
  }
});
const rpc = new Rpc((event) => {
  if (event.type === "queue_update") messageQueue = { steering: event.steering, followUp: event.followUp };
  if (event.type === "agent_start" && !task.active) task.start();
  if (event.type === "extension_error") {
    event.error = redact(event.error);
    extensionCommandError = event.error;
  }
  if (event.type === "extension_ui_request" && ["select", "input", "editor"].includes(event.method)) {
    pendingInputs.add(event.id);
    sendToRenderer("pi:ui-request", event);
    sendToRenderer("app:library-changed");
  }
  if (event.type === "extension_ui_request" && event.method === "confirm") {
    // The desktop UI has no safe equivalent for arbitrary destructive confirms.
    // Structured ask_user_question uses select/input and is handled below.
    rpc.respond({ type: "extension_ui_response", id: event.id, cancelled: true });
    sendToRenderer("pi:status", { type: "warning", message: "该扩展需要确认对话框，桌面版本次已取消。" });
  }
  task.handle(event);
  if (event.message?.errorMessage) event.message.errorMessage = redact(event.message.errorMessage);
  if (event.errorMessage) event.errorMessage = redact(event.errorMessage);
  if (event.finalError) event.finalError = redact(event.finalError);
  sendToRenderer("pi:event", event);
}, (error) => {
  imageBridge?.abort();
  videoBridge?.abort();
  recoverPendingQueue();
  task.finish("failed", error.message);
  sendToRenderer("pi:status", { type: "error", message: redact(error.message) });
});

function recoverPendingQueue() {
  const queue = messageQueue;
  messageQueue = { steering: [], followUp: [] };
  if (queue.steering.length || queue.followUp.length) {
    // A hidden renderer must save the recovered input before its runtime can
    // be reused for a different conversation.
    recoveringQueue = randomUUID();
    sendToRenderer("pi:event", { type: "desktop_queue_returned", recoveryId: recoveringQueue, ...queue });
  }
}

function safeSettings() {
  return { ...settings, permissionMode: permissionMode(), permissionModes: PERMISSION_MODES, imageProfiles: IMAGE_PROFILES, videoProfiles: VIDEO_PROFILES, specialists: specialists(), personalSkillsDirectory: path.join(agentDirectory, "skills"), selectedAgent: selectedAgent(), connected: Boolean(credentials.key), credentialSource: credentials.source, projectRoot };
}

function preserveEmptySession() {
  if (!emptySession) return;
  library.preserveEmptySession(emptySession.cwd, emptySession);
  emptySession = undefined;
}

async function startPi() {
  if (starting) return starting;
  const resourceVersion = process.env.INSIGHT_COMPONENTS;
  if (rpc.child && (resourcesUsed === resourceVersion || task.active)) return;
  preserveEmptySession();
  recoverPendingQueue();
  starting = (async () => {
    if (rpc.child) await rpc.stop();
    sendToRenderer("pi:status", { type: "connecting", message: `正在初始化${APP_NAME}和扩展` });
    const bundledNode = runtime.node;
    const bundledCli = runtime.cli;
    const cli = fs.existsSync(bundledCli) ? bundledCli : path.join(projectRoot, "packages", "coding-agent", "dist", "cli.js");
    if (!fs.existsSync(cli)) throw new Error(`找不到${APP_NAME}的代理运行时，请检查客户端安装。`);
    ensureExtensionReloadPatch(cli);
    ensureNavigationPatches(cli);
    ensureStartupPatches(cli);
    // Project settings must not override the desktop retry policy.
    const args = [cli, "--mode", "rpc", "--no-approve", "--provider", settings.provider, "--model", settings.model, "--thinking", settings.thinking,
      "--extension", path.join(__dirname, "image-extension.js"), "--extension", path.join(__dirname, "video-extension.js"),
      "--extension", path.join(__dirname, "specialist-extension.js"), "--extension", path.join(__dirname, "permission-extension.js")];
    if (sessionFile && fs.existsSync(sessionFile)) args.push("--session", sessionFile);
    const node = fs.existsSync(bundledNode) ? bundledNode : process.env.PI_NODE || "node";
    const options = {
      cwd: settings.cwd,
      env: { ...createRuntimeEnvironment(process.env, { node, cli, agentDirectory, key: credentials.key, specialistDirectory: runtimePaths(projectRoot).directory }),
        INSIGHT_AGENT_PREFIX: agentPrefix, PYTHONUTF8: "1", DO_NOT_TRACK: "1",
        INSIGHT_PERMISSION_BRIDGE: permissionBridge.url, INSIGHT_PERMISSION_TOKEN: permissionBridge.token,
        INSIGHT_IMAGE_BRIDGE: imageBridge.url, INSIGHT_IMAGE_TOKEN: imageBridge.token,
        INSIGHT_VIDEO_BRIDGE: videoBridge.url, INSIGHT_VIDEO_TOKEN: videoBridge.token },
    };
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await rpc.start(node, args, options, {
          onProgress: (elapsed) => sendToRenderer("pi:status", {
            type: "connecting", message: `正在初始化${APP_NAME}和扩展 · ${Math.floor(elapsed / 1000)} 秒${attempt ? "（自动重试）" : ""}`,
          }),
        });
        await rpc.send({ type: "set_auto_retry", enabled: true });
        break;
      } catch (error) {
        await rpc.stop();
        if (attempt || !["PI_STARTUP_TIMEOUT", "PI_DISCONNECTED", "PI_RPC_TIMEOUT"].includes(error.code)) throw error;
        sendToRenderer("pi:status", { type: "connecting", message: "启动未完成，正在自动重试一次" });
      }
    }
    userAgents = personalAgents((await rpc.send({ type: "get_commands" })).data.commands);
    resourcesUsed = resourceVersion;
    const previousAgent = selectedAgent();
    const previousFile = sessionFile;
    sessionFile = response.data.sessionFile;
    emptySession = fs.existsSync(sessionFile) ? undefined : { ...response.data, cwd: settings.cwd };
    // Native Pi does not persist an empty conversation yet. Keep its selected
    // specialist if reconnecting assigns that empty conversation a new file.
    if (previousAgent && previousFile !== sessionFile && !fs.existsSync(previousFile)) {
      agentSelections = { ...agentSelections, [sessionFile]: previousAgent };
      writeJson(agentSelectionsFile, agentSelections);
    }
    // Pi can clamp unsupported thinking levels (for example max -> off).
    // Keep the saved UI state aligned so an image-only save is not mistaken
    // for a chat-model change requiring a process restart.
    settings.thinking = response.data.thinkingLevel;
    library.select(settings.cwd, sessionFile);
    sendToRenderer("pi:status", { type: "started", message: `${APP_NAME}已连接` });
  })();
  try { await starting; }
  catch (error) {
    sendToRenderer("pi:status", { type: "error", message: redact(error.message) });
    throw error;
  } finally { starting = null; }
}

async function restartPi(preserveSession = true, { recover = false } = {}) {
  if (starting) await starting.catch(() => {});
  if (recover) {
    // A dead RPC can leave UI-side guards and the task snapshot behind even
    // after the transport has rejected its pending request. Reset those
    // transient states before starting a fresh runtime for the same session.
    permissions.cancel();
    pendingInputs.clear();
    imageBridge?.abort();
    videoBridge?.abort();
    submittingPrompt = false;
    stopping = false;
    extensionCommandError = undefined;
    if (task.active) task.finish("stopped", "连接已中断，任务已停止；可以继续发送。");
    task.cancelled = false;
  }
  // sessionFile is tracked on every session change. A broken process must not
  // have to answer get_state before it can be replaced.
  if (!preserveSession) { sessionFile = undefined; task.clear(); }
  await rpc.stop();
  await startPi();
}

async function changeConfiguration(action) {
  if (task.active) throw new Error("请等待当前任务结束，或先停止任务。");
  if (changingSettings || navigatingContext || accountChanging) throw new Error("正在更新会话配置，请稍候。");
  changingSettings = true;
  try { return await action(); } finally { changingSettings = false; }
}

async function changeNavigation(action) {
  if (navigatingContext || changingSettings || accountChanging) throw new Error("正在切换会话或配置，请稍候。");
  navigatingContext = true;
  try { return await action(); } finally { navigatingContext = false; }
}

async function switchContext(cwd, file, preferences = {}) {
  assertSessionUnlocked(file);
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("工作区目录不存在或无法访问。");
  const owner = file && (sessionClaims.get(pathKey(file)) || [...conversations.values()].find((item) => item !== context && item.file() && pathKey(item.file()) === pathKey(file)));
  if (owner && owner !== context) {
    if (Object.keys(preferences).length) throw new Error("该会话已打开，请先切换到该会话再修改设置。");
    owner.activate();
    return { openedView: true, openedWindow: owner.window !== mainWindow };
  }
  if (task.active) return openDesktop({ cwd, sessionFile: file, fresh: !file, settings }, host);
  const target = file || library.createSession(cwd);
  sessionClaims.set(pathKey(target), context);
  try { return await performSwitch(cwd, target, preferences); }
  finally { sessionClaims.delete(pathKey(target)); }
}

async function performSwitch(cwd, file, preferences) {
  if (starting) await starting;
  const previous = { settings: { ...settings }, sessionFile, task: task.snapshot(), targetSession: library.workspace(cwd)?.lastSession };
  try {
    await startPi();
    if (Object.keys(preferences).length) {
      await rpc.stop();
      preserveEmptySession();
      settings = { ...settings, ...preferences, cwd };
      sessionFile = file;
      await startPi();
    } else {
      const target = file || library.createSession(cwd);
      if (!fs.existsSync(target)) throw new Error("对话文件已不存在，请刷新列表。");
      const response = await rpc.send({ type: "switch_session", sessionPath: target });
      if (response.data.cancelled) return null;
      preserveEmptySession();
      const current = (await rpc.send({ type: "get_state" })).data;
      if (current.model?.id !== settings.model || current.model?.provider !== settings.provider) {
        await rpc.send({ type: "set_model", provider: settings.provider, modelId: settings.model });
      }
      await rpc.send({ type: "set_thinking_level", level: settings.thinking });
      settings = { ...settings, cwd };
      sessionFile = current.sessionFile;
      library.select(cwd, sessionFile);
    }
    task.restore(library.tasks(sessionFile).at(-1));
    writeJson(settingsFile, settings);
  } catch (error) {
    await rpc.stop();
    settings = previous.settings;
    sessionFile = previous.sessionFile;
    library.select(cwd, previous.targetSession);
    task.restore(previous.task);
    // A failed runtime replacement can leave Pi disposed. Restore a usable
    // process with the original cwd/session before letting the user continue.
    try { await startPi(); } catch { /* The next request can retry startup. */ }
    throw error;
  }
  sendToRenderer("app:library-changed");
  return safeSettings();
}

async function newConversation() {
  if (task.active) return { data: await openDesktop({ cwd: settings.cwd, fresh: true, settings }, host) };
  await startPi();
  const response = await rpc.send({ type: "new_session" });
  if (!response.data.cancelled) {
    task.clear();
    preserveEmptySession();
    const current = (await rpc.send({ type: "get_state" })).data;
    sessionFile = current.sessionFile;
    emptySession = fs.existsSync(sessionFile) ? undefined : { ...current, cwd: settings.cwd };
    library.select(settings.cwd, sessionFile);
    sendToRenderer("app:library-changed");
  }
  return response;
}

function register(channel, handler) {
  handlers.set(channel, async (...args) => {
    try {
      if (!["app:get-library", "app:get-config", "app:get-task-history", "pi:get-task", "app:permissions", "app:get-draft"].includes(channel)) assertSessionUnlocked(sessionFile);
      return await handler(...args);
    }
    catch (error) {
      if (["PI_RPC_TIMEOUT", "PI_DISCONNECTED"].includes(error.code)) sendToRenderer("pi:status", { type: "error", message: redact(error.message) });
      throw new Error(redact(error.message));
    }
  });
  if (!channels.has(channel)) {
    channels.add(channel);
    ipcMain.handle(channel, (event, ...args) => {
      const context = conversations.get(event.sender.id);
      if (!context || event.senderFrame !== event.sender.mainFrame) throw new Error("无效窗口。");
      return context.handlers.get(channel)(...args);
    });
  }
}

register("app:get-config", () => safeSettings());
register("app:chat-models", (refresh) => {
  if (refresh === true) return modelCatalog.refresh(true);
  return modelCatalog.snapshot();
});
register("app:distribution-status", () => ({ updates: updates.state, components: components.state, dataDirectory: profileDirectory, portable: releaseConfig.distribution === "portable" }));
register("app:check-updates", () => updates.check());
register("app:download-update", () => updates.download());
register("app:install-update", () => updates.install());
register("app:check-components", () => components.check());
register("app:install-components", () => components.install());
register("app:pause-components", () => components.pause ? components.pause() : components.controller?.abort());
register("app:prepare-agent", async (id) => {
  const agent = AGENTS.find((item) => item.id === id);
  if (!agent || !components.ensure) throw new Error("该智能体不支持按需安装。");
  await components.ensure(agentComponents(agent));
  return safeSettings();
});
register("app:restart", () => {
  if ([...conversations.values()].some((item) => item.task.active || item.busy()) || sessionOperations.size || accountChanging) throw new Error("请先结束所有会话中的任务和操作，再重启学术派。");
  app.relaunch(); app.quit();
});
register("app:save-draft", (input) => {
  if (typeof input?.message !== "string" || !Array.isArray(input.attachments)) throw new Error("草稿无效。");
  if (!sessionFile) return;
  if (input.sessionFile && pathKey(input.sessionFile) !== pathKey(sessionFile)) throw new Error("会话已切换，未保存过期草稿。");
  const selected = input.attachments.map(({ id, kind }) => {
    const entry = kind === "file" ? localFiles.entries.get(id) : attachments.get(id);
    if (!entry) throw new Error("附件已失效，请重新添加。");
    return { id, kind };
  });
  if (!input.message.trim() && !selected.length) drafts.delete(pathKey(sessionFile));
  else drafts.set(pathKey(sessionFile), { path: sessionFile, cwd: settings.cwd, message: input.message, attachments: selected, mode: input.mode === "followUp" ? "followUp" : "steer", modified: Date.now() });
  if (input.recoveryId === recoveringQueue) recoveringQueue = undefined;
  sendToRenderer("app:library-changed");
});
register("app:get-draft", async () => {
  const draft = sessionFile && drafts.get(pathKey(sessionFile));
  if (!draft) return { message: "", attachments: [], mode: "steer" };
  return { ...draft, attachments: await Promise.all(draft.attachments.map(async ({ id, kind }) => {
    if (kind === "file") return localFiles.entries.get(id);
    const image = attachments.get(id);
    const data = await fs.promises.readFile(image.path).catch(() => Buffer.alloc(0));
    return { ...image, id, data: data.toString("base64") };
  })) };
});
register("app:new-window", (agent) => {
  if (agent && !specialists().some((item) => item.id === agent && item.ready)) throw new Error("无效智能体。");
  return openDesktop({ cwd: settings.cwd, fresh: true, settings, agent });
});
register("app:new-agent-session", (agent) => {
  if (!specialists().some((item) => item.id === agent && item.ready)) throw new Error("无效智能体。");
  return openDesktop({ cwd: settings.cwd, fresh: true, settings, agent }, host);
});
register("app:permissions", () => permissions.snapshot());
register("app:permission-response", (id, allowed) => permissions.respond(id, allowed === true));
register("app:set-permission", (mode) => {
  if (!PERMISSION_MODES.some((item) => item.id === mode)) throw new Error("无效的权限模式。");
  permissions.cancel();
  permissionSelections[sessionFile] = mode;
  writeJson(permissionSelectionsFile, permissionSelections);
  settings.permissionMode = mode;
  writeJson(settingsFile, { ...readJson(settingsFile), permissionMode: mode });
  return safeSettings();
});
register("app:select-agent", (id) => changeConfiguration(async () => {
  if (id !== "" && !specialists().some((agent) => agent.id === id && agent.ready)) throw new Error("该智能体尚未就绪。");
  await startPi();
  const next = { ...agentSelections, [sessionFile]: id };
  writeJson(agentSelectionsFile, next);
  agentSelections = next;
  return selectedAgent();
}));
register("app:refresh-agents", () => changeConfiguration(async () => {
  cachedSpecialists = null;
  await startPi();
  await executeSlashCommand("/reload");
  userAgents = personalAgents((await rpc.send({ type: "get_commands" })).data.commands);
  return safeSettings();
}));
register("app:open-skills-folder", async () => {
  const directory = path.join(agentDirectory, "skills");
  await fs.promises.mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) throw new Error(error);
});
register("app:choose-files", async () => {
  if (changingSettings) throw new Error("请等待当前操作结束。");
  const result = await dialog.showOpenDialog(mainWindow, { title: "选择工作文件（仅添加本地路径）", defaultPath: settings.cwd, properties: ["openFile", "multiSelections"] });
  return result.canceled ? [] : localFiles.add(result.filePaths);
});
register("app:add-files", (paths) => {
  if (changingSettings) throw new Error("请等待当前操作结束。");
  return localFiles.add(paths);
});
register("app:image-models", (refresh) => loadImageModels(refresh === true));
register("app:video-models", async (refresh) => { await loadImageModels(refresh === true); return credentials.key ? videoModels : []; });
register("app:video-tasks", () => videoJobs.list(credentials.key, settings.cwd, sessionFile));
register("app:video-file", async (id) => {
  const file = await videoJobs.localFile(id, credentials.key, settings.cwd);
  return { ...file, url: pathToFileURL(file.path).href };
});
register("app:open-video", async (id) => openVideo(await videoJobs.localFile(id, credentials.key, settings.cwd)));
register("app:copy-video", async (id) => copyVideo(await videoJobs.localFile(id, credentials.key, settings.cwd)));
register("app:import-image", async (input) => {
  if (changingSettings) throw new Error("请等待当前操作结束。");
  const image = await saveVerifiedImage(imageBytes(input?.data), path.join(agentDirectory, "attachments"), nativeImage, "upload");
  const id = path.basename(image.path);
  const name = typeof input.name === "string" ? path.basename(input.name).slice(0, 160) : id;
  const { data, ...stored } = image;
  attachments.set(id, { ...stored, name });
  return { id, name, ...image };
});
register("app:open-image", openImage);
register("app:copy-image", copyImage);
register("app:get-library", async () => {
  const result = await library.snapshot(settings.cwd, sessionFile);
  const listed = new Set(result.sessions.map((item) => item.key || pathKey(item.path)));
  const owners = new Map([...conversations.values()].filter((item) => item.file()).map((item) => [pathKey(item.file()), item]));
  for (const context of conversations.values()) {
    const pending = context.pending();
    if (context.task.active && pending && !listed.has(pathKey(pending.path))) { result.sessions.unshift({ ...pending, active: pending.path === sessionFile }); listed.add(pathKey(pending.path)); }
  }
  for (const draft of drafts.values()) if (!listed.has(pathKey(draft.path))) {
    result.sessions.push({ path: draft.path, cwd: draft.cwd, title: draft.message.trim().slice(0, 120) || "文件草稿", modified: draft.modified, messageCount: 0, draft: true, active: draft.path === sessionFile });
  }
  for (const session of result.sessions) {
    const key = session.key || pathKey(session.path);
    session.archived = library.data.sessions[key]?.archived === true;
    session.title = library.data.sessions[key]?.name || session.title;
    const owner = owners.get(key);
    session.running = Boolean(owner?.task.active);
    session.waitingApproval = Boolean(owner?.permissions().length);
    session.waitingInput = Boolean(owner?.waitingInput());
    session.status = owner?.task.snapshot()?.status;
  }
  result.sessions.sort((a, b) => b.modified - a.modified);
  return result;
});
register("app:get-task-history", () => library.tasks(sessionFile));
register("app:add-workspace", () => changeNavigation(async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"], defaultPath: settings.cwd, title: "添加工作区" });
  if (result.canceled) return null;
  const workspace = library.add(result.filePaths[0]);
  if (pathKey(workspace.cwd) === pathKey(settings.cwd)) return safeSettings();
  return switchContext(workspace.cwd, library.lastSession(workspace.cwd));
}));
register("app:switch-workspace", (id) => changeNavigation(async () => {
  const workspace = library.data.workspaces.find((item) => item.id === id);
  if (!workspace) throw new Error("工作区已不在列表中。");
  await library.scan(false);
  return switchContext(workspace.cwd, library.lastSession(workspace.cwd));
}));
register("app:remove-workspace", async (id) => {
  const workspace = library.data.workspaces.find((item) => item.id === id);
  if (workspace && [...conversations.values()].some((context) => context.task.active && pathKey(context.cwd()) === pathKey(workspace.cwd))) throw new Error("该工作区仍有任务在运行，请先等待完成或停止对应任务。");
  library.remove(id, settings.cwd);
  return library.snapshot(settings.cwd, sessionFile);
});
register("app:open-session", (file) => changeNavigation(async () => {
  assertSessionUnlocked(file);
  const owner = [...conversations.values()].find((context) => context.file() && pathKey(context.file()) === pathKey(file));
  if (owner) { owner.activate(); return { openedView: true, openedWindow: owner.window !== mainWindow }; }
  const session = await library.findSession(file);
  library.add(session.cwd);
  return switchContext(session.cwd, session.path);
}));
register("app:rename-session", async (file, name) => {
  assertSessionUnlocked(file);
  const session = await library.findSession(file);
  assertSessionUnlocked(file);
  library.rename(session.path, name);
  sendToRenderer("app:library-changed");
  return library.snapshot(settings.cwd, sessionFile);
});
async function manageSession(file, operation) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("请选择有效会话。");
  assertSessionUnlocked(file);
  const key = pathKey(file);
  const owner = sessionClaims.get(key) || [...conversations.values()].find((item) => item.file() && pathKey(item.file()) === key);
  if (owner?.task.active) throw new Error("该会话仍有任务在运行，请先停止任务或等待完成，再归档或删除。");
  if (accountChanging || owner?.busy()) throw new Error("该会话正在切换或更新，请稍后再试。");
  sessionOperations.add(key);
  let released = false;
  try {
    const draft = drafts.get(key);
    const session = owner && !fs.existsSync(file) ? { path: file, title: draft?.message.trim().slice(0, 120) || "未命名会话" } : await library.findSession(file);
    const title = library.data.sessions[key]?.name || (!session.messageCount && draft?.message.trim().slice(0, 120)) || session.title;
    if (operation !== "restore") {
      const deleting = operation === "delete";
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: deleting ? "warning" : "question", title: deleting ? "删除会话" : "归档会话",
        message: deleting ? "被删除的会话无法找回，是否确认删除？" : "是否归档此会话？",
        detail: `会话：${title}\n\n` + (deleting
          ? "将永久删除这条会话的本地聊天记录，不会放入回收站。工作区文件和已生成的图片、视频不会删除。"
          : "归档用于收起暂时不用的会话，让会话列表更清晰。聊天记录会保留，可在左侧“已归档”中查看或恢复到会话列表；不会删除工作区文件。"),
        buttons: ["取消", deleting ? "确认删除" : "归档会话"], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (response !== 1) return { cancelled: true };
      if (mainWindow.isDestroyed()) return { cancelled: true };
      if (owner && deleting) {
        // Leave the session before unlinking it, including native empty sessions
        // whose first write has not occurred yet. Other runtimes stay untouched.
        await owner.releaseSession();
        released = true;
      }
      // Archiving only changes visibility. Keep the open view and its unsent
      // input intact, including when another window initiated the action.
      if (owner && !deleting) await owner.persistSession();
    }
    if (operation === "delete") {
      await library.deleteSession(file);
      drafts.delete(key);
      for (const selections of [agentSelections, permissionSelections]) {
        for (const selected of Object.keys(selections)) if (pathKey(selected) === key) delete selections[selected];
      }
      try {
        writeJson(agentSelectionsFile, agentSelections);
        writeJson(permissionSelectionsFile, permissionSelections);
      } catch { sendToRenderer("pi:status", { type: "warning", message: "会话已删除，但附属设置清理失败，请检查磁盘空间。" }); }
    } else {
      await library.setArchived(file, operation === "archive");
      if (draft && !library.data.sessions[key]?.name) library.rename(file, title);
    }
    return { cancelled: false };
  } finally {
    sessionOperations.delete(key);
    if (released) owner.refreshContext();
    sendToRenderer("app:library-changed");
  }
}
register("app:archive-session", (file) => manageSession(file, "archive"));
register("app:restore-session", (file) => manageSession(file, "restore"));
register("app:delete-session", (file) => manageSession(file, "delete"));
register("app:choose-directory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"], defaultPath: settings.cwd });
  return result.canceled ? null : result.filePaths[0];
});
register("app:save-settings", (next) => changeConfiguration(async () => {
  const updated = {
    permissionMode: settings.permissionMode,
    provider: typeof next?.provider === "string" && next.provider.trim() ? next.provider.trim() : settings.provider,
    model: typeof next?.model === "string" && next.model.trim() ? next.model.trim() : settings.model,
    thinking: thinkingLevels.includes(next?.thinking) ? next.thinking : settings.thinking,
    cwd: typeof next?.cwd === "string" && next.cwd.trim() ? path.resolve(next.cwd) : settings.cwd,
    imageModel: typeof next?.imageModel === "string" && next.imageModel.trim() ? next.imageModel.trim() : settings.imageModel,
    imagePreferences: { ...settings.imagePreferences },
    videoModel: typeof next?.videoModel === "string" && next.videoModel.trim() ? next.videoModel.trim() : settings.videoModel,
    videoPreferences: { ...settings.videoPreferences },
  };
  imageProfile(updated.imageModel);
  videoProfile(updated.videoModel);
  if (next?.videoPreferences !== undefined) {
    if (!next.videoPreferences || typeof next.videoPreferences !== "object" || Array.isArray(next.videoPreferences)) throw new Error("视频设置无效。");
    updated.videoPreferences = Object.fromEntries(Object.entries(next.videoPreferences).map(([id, options]) => [id, normalizeVideoOptions(id, options)]));
  }
  if (next?.imagePreferences !== undefined) {
    if (!next.imagePreferences || typeof next.imagePreferences !== "object" || Array.isArray(next.imagePreferences)) throw new Error("生图设置无效。");
    updated.imagePreferences = Object.fromEntries(Object.entries(next.imagePreferences).map(([id, options]) => [id, normalizeImageOptions(id, options)]));
  }
  if (!fs.existsSync(updated.cwd) || !fs.statSync(updated.cwd).isDirectory()) throw new Error("工作区目录不存在。");
  if (["provider", "model", "thinking"].every((field) => updated[field] === settings[field]) && pathKey(updated.cwd) === pathKey(settings.cwd)) {
    const saved = { ...settings, ...updated };
    writeJson(settingsFile, saved);
    settings = saved;
    return safeSettings();
  }
  const workspace = library.add(updated.cwd);
  await library.scan(false);
  const file = pathKey(settings.cwd) === pathKey(workspace.cwd) ? sessionFile : library.lastSession(workspace.cwd);
  return switchContext(workspace.cwd, file, updated);
}));
register("app:save-key", (input) => changeAccount(async () => {
  const key = typeof input?.key === "string" ? input.key.trim() : "";
  if (!key || /\s/.test(key) || key.length > 4096) throw new Error("请输入有效的 JarodFund API Key。");
  const file = path.join(agentDirectory, "models.json");
  const catalog = readJson(file);
  const entries = await fetchModelCatalog(key);
  const models = modelsFromCatalog(entries, catalog.providers.jarodfund.models);
  if (!models.length) throw new Error("该 Key 没有可用的文本模型，Key 未保存。");
  const previousCatalog = structuredClone(catalog);
  catalog.providers.jarodfund.models = models;
  writeJson(file, catalog);
  try { credentials.save(key, input.remember === true); }
  catch (error) { writeJson(file, previousCatalog); throw error; }
  modelCatalog.adopt(key, entries);
  settings.provider = "jarodfund";
  if (!models.some((model) => model.id === settings.model)) settings.model = models[0].id;
  writeJson(settingsFile, settings);
  await restartPi();
  for (const item of conversations.values()) if (item !== context) await item.accountChanged(false);
  return { config: safeSettings(), modelCount: models.length };
}));
register("app:logout-key", () => changeAccount(async () => {
  if (starting) await starting;
  await rpc.stop();
  credentials.clear();
  broadcast("app:model-catalog", modelCatalog.snapshot());
  drafts.clear();
  for (const item of conversations.values()) if (item !== context) await item.accountChanged(true);
  videoModels = [];
  attachments.clear();
  localFiles.entries.clear();
  sessionFile = undefined;
  library.select(settings.cwd, null);
  task.clear();
  sendToRenderer("app:library-changed");
  return safeSettings();
}));
register("app:open-link", (url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) return shell.openExternal(url);
  return false;
});
register("app:copy-text", (text) => {
  if (typeof text !== "string") throw new Error("复制内容无效。");
  return clipboard.writeText(text);
});
register("pi:start", async () => { await startPi(); return safeSettings(); });
register("pi:reconnect", () => {
  if (reconnecting) return reconnecting;
  // Recovery is deliberately independent from configuration changes. A
  // disconnected runtime can leave the task flag set until the failure event
  // is delivered, and that must not make the recovery button unusable.
  reconnecting = (async () => {
    if (accountChanging || navigatingContext) throw new Error("正在切换会话或账户，请稍候。");
    sendToRenderer("pi:status", { type: "connecting", message: "正在恢复连接" });
    await restartPi(true, { recover: true });
    return safeSettings();
  }).finally(() => { reconnecting = null; });
  return reconnecting;
});
register("pi:get-task", () => {
  const value = task.snapshot();
  return value ? { ...value, error: value.error && redact(value.error) } : null;
});
async function executeSlashCommand(message) {
  const text = typeof message === "string" ? message.trim() : "";
  const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
  if (!match) throw new Error("斜杠命令格式无效。");
  const name = match[1].toLowerCase();
  const args = match[2]?.trim() || "";
  if (name === "reload") {
    const available = await rpc.send({ type: "get_commands" });
    if (!available.data.commands.some((item) => item.name === "reload" && item.source === "extension")) {
      throw new Error("重新加载命令未加载，请重新打开桌面客户端。");
    }
    return runExtensionCommand("/reload");
  }
  if (name === "new") return newConversation();
  if (name === "compact") {
    task.start();
    try {
      const response = await rpc.send({ type: "compact", ...(args ? { customInstructions: args } : {}) }, 0);
      task.finish("completed");
      return response;
    } catch (error) { task.finish(task.cancelled ? "stopped" : "failed", redact(error.message)); throw error; }
  }
  if (name === "thinking") {
    const levels = (await rpc.send({ type: "get_available_thinking_levels" })).data.levels;
    if (!args) return { data: { select: "thinking" } };
    if (!levels.includes(args)) throw new Error(`当前模型支持的推理强度：${levels.join("、")}`);
    return rpc.send({ type: "set_thinking_level", level: args });
  }
  if (name === "model") {
    if (!args) return { data: { select: "model" } };
    const [provider, modelId] = args.includes("/") ? args.split(/\/(.*)/s) : [settings.provider, args];
    if (!provider || !modelId || /\s/.test(args)) throw new Error("用法：/model provider/model");
    await rpc.send({ type: "get_available_models", refresh: true });
    return rpc.send({ type: "set_model", provider, modelId });
  }
  if (name === "name") {
    if (!args) throw new Error("用法：/name 对话名称");
    const response = await rpc.send({ type: "set_session_name", name: args });
    if (sessionFile) library.rename(sessionFile, args);
    sendToRenderer("app:library-changed");
    return response;
  }
  if (name === "session") return rpc.send({ type: "get_session_stats" });
  if (name === "copy") {
    const response = await rpc.send({ type: "get_last_assistant_text" });
    if (!response.data?.text) throw new Error(`当前对话还没有${APP_NAME}回复可复制。`);
    await clipboard.writeText(response.data.text);
    return response;
  }
  if (name === "commands") {
    const response = await rpc.send({ type: "get_commands" });
    return { ...response, data: { commands: commandCatalog(response.data.commands) } };
  }
  if (name === "settings") {
    sendToRenderer("app:open-settings");
    return { type: "response", command: "slash", success: true };
  }
  const commands = (await rpc.send({ type: "get_commands" })).data.commands;
  const native = commands.find((item) => item.name === match[1]);
  if (native?.source === "extension") {
    const approval = await permissions.check({ toolName: `/${name}`, input: { command: text } });
    if (!approval.allowed) throw new Error(approval.reason);
    return runExtensionCommand(text);
  }
  if (native) return sendUserPrompt(text);
  throw new Error(`未知或尚未接入的命令 /${name}。输入 / 查看可用命令。`);
}

async function runExtensionCommand(message) {
  extensionCommandError = null;
  let response;
  try { response = await rpc.send({ type: "prompt", message }, 120000); }
  catch (error) { await rpc.stop(); task.finish("failed", redact(error.message)); throw error; }
  if (extensionCommandError) throw new Error(extensionCommandError);
  const current = (await rpc.send({ type: "get_state" })).data;
  if (current.sessionFile !== sessionFile) {
    sessionFile = current.sessionFile;
    const session = await library.findSession(sessionFile);
    settings.cwd = session.cwd;
    library.select(settings.cwd, sessionFile);
    if (!task.active) task.restore(library.tasks(sessionFile).at(-1));
    writeJson(settingsFile, settings);
  }
  return response;
}

async function sendUserPrompt(message, attachmentIds = [], fileIds = [], streamingBehavior = "steer") {
  if (!["steer", "followUp"].includes(streamingBehavior)) throw new Error("请选择有效的追加消息方式。");
  const sourceSession = sessionFile;
  const sourceKey = credentials.key;
  const sourceTask = task.value;
  const sourceConfigurationChange = changingSettings;
  const agent = selectedAgent();
  const files = await localFiles.resolve(fileIds);
  if (!Array.isArray(attachmentIds) || attachmentIds.length > MAX_ATTACHMENTS) throw new Error("每次最多上传 4 张图片。");
  const selected = await Promise.all(attachmentIds.map(async (id) => {
    const image = attachments.get(id);
    if (!image) throw new Error("图片附件已失效，请重新添加。");
    const data = await fs.promises.readFile(image.path);
    inspectImage(data, nativeImage);
    return { ...image, data: data.toString("base64") };
  }));
  if (typeof message !== "string" || !message.trim() && !selected.length && !files.length) throw new Error("请输入任务内容。");
  message = appendFilePaths(message, files);
  if (settings.provider === "jarodfund" && !credentials.key) throw new Error("请先在设置中连接 JarodFund API Key。");
  if (selected.length) {
    const current = (await rpc.send({ type: "get_state" })).data;
    if (!current.model?.input?.includes("image")) throw new Error("当前聊天模型未声明支持图片，请选择支持看图的模型后发送。");
    message = (message.trim() || "请查看这些图片。") + "\n\n[图片附件 / 可用于 image_gen 的本地路径]\n" + selected.map((image) => image.path).join("\n");
  }
  if (stopping || sourceTask?.status === "running" && task.value?.id === sourceTask.id && task.cancelled || navigatingContext || accountChanging || changingSettings !== sourceConfigurationChange || sessionFile !== sourceSession || credentials.key !== sourceKey || selectedAgent() !== agent) throw new Error("会话状态已变化，请重新发送。");
  const newTask = !task.active;
  if (newTask) {
    pendingConversation = { path: sessionFile, cwd: settings.cwd, title: message.trim().slice(0, 512), modified: Date.now(), messageCount: 1 };
    task.start();
    sendToRenderer("app:library-changed");
  }
  try {
    return await rpc.send({ type: "prompt", streamingBehavior, message: `${agentPrefix}${agent}\n${message}`, ...(selected.length ? { images: selected.map(({ data, mimeType }) => ({ type: "image", data, mimeType })) } : {}) });
  } catch (error) {
    // A rejected addition must not stop the original run.
    if (newTask) { await rpc.stop(); task.finish("failed", redact(error.message)); }
    throw error;
  }
}
register("pi:command", async (command) => {
  const allowed = ["prompt", "slash", "abort", "new_session", "get_state", "get_messages", "get_history", "get_queue", "clear_queue", "get_available_models", "get_available_thinking_levels", "set_model", "set_thinking_level", "get_commands", "compact", "set_session_name", "get_session_stats", "get_last_assistant_text"];
  if (!allowed.includes(command?.type)) throw new Error(`不支持的${APP_NAME}命令。`);
  if ((command.attachmentIds?.length || command.fileIds?.length) && (command.type !== "prompt" || command.message?.trim().startsWith("/"))) throw new Error("文件请与普通消息一起发送，不能附加到斜杠命令。");
  if (command.type === "slash" || command.type === "compact" || command.type === "prompt" && typeof command.message === "string" && command.message.trim().startsWith("/")) return changeConfiguration(async () => {
    await startPi();
    if (task.active) throw new Error("当前任务尚未结束。");
    const result = await executeSlashCommand(command.type === "compact" ? `/compact ${command.customInstructions || ""}` : command.message);
    if (result?.command === "set_model") {
      settings.provider = result.data.provider;
      settings.model = result.data.id;
      writeJson(settingsFile, settings);
    }
    if (result?.command === "set_thinking_level") {
      settings.thinking = (await rpc.send({ type: "get_state" })).data.thinkingLevel;
      writeJson(settingsFile, settings);
    }
    return result;
  });
  if (command.type === "new_session") return task.active ? newConversation() : changeConfiguration(newConversation);
  if ((accountChanging || navigatingContext) && ["prompt", "set_model", "set_thinking_level"].includes(command.type)) throw new Error("正在切换账户或会话，请稍候。");
  if (changingSettings && command.type !== "abort") throw new Error("正在保存设置，请稍候。");
  if (task.active && ["new_session", "set_model", "set_thinking_level"].includes(command.type)) throw new Error("当前任务尚未结束。");
  await startPi();
  // Startup is asynchronous; another request may have changed the account or task.
  if (changingSettings && command.type !== "abort") throw new Error("正在保存设置，请稍候。");
  if (task.active && ["new_session", "set_model", "set_thinking_level"].includes(command.type)) throw new Error("当前任务尚未结束。");
  if (command.type === "get_history") {
    const history = await historyResponse(sessionFile, { fast: command.fast === true });
    return { type: "response", command: "get_history", success: true, data: { ...history, sessionFile } };
  }
  if (command.type === "get_queue") return { data: messageQueue };
  if (command.type === "prompt") {
    if (submittingPrompt || stopping) throw new Error("上一条消息正在提交或任务正在停止，请稍候。");
    submittingPrompt = true;
    try {
      const response = await sendUserPrompt(command.message, command.attachmentIds, command.fileIds, command.streamingBehavior);
      drafts.delete(pathKey(sessionFile));
      return response;
    }
    finally { submittingPrompt = false; }
  }
  if (command.type === "abort") {
    stopping = true;
    permissions.cancel();
    imageBridge.abort();
    videoBridge.abort();
    task.cancelled = true;
    let cleared = messageQueue;
    try {
      cleared = (await rpc.send({ type: "clear_queue" })).data;
      const response = await rpc.send({ type: "abort" }, 10000);
      task.finish("stopped");
      return { ...response, data: { cleared } };
    } catch {
      await rpc.stop();
      task.finish("stopped");
      return { type: "response", command: "abort", success: true, data: { cleared } };
    } finally { stopping = false; messageQueue = { steering: [], followUp: [] }; }
  }
  {
    if (command.type === "set_model") await rpc.send({ type: "get_available_models", refresh: true });
    const response = await rpc.send(command);
    if (command.type === "get_commands") {
      userAgents = personalAgents(response.data.commands);
      response.data.commands = commandCatalog(response.data.commands);
      response.data.specialists = specialists();
      response.data.selectedAgent = selectedAgent();
    }
    if (command.type === "get_state") { sessionFile = response.data.sessionFile; response.data.desktopAgent = selectedAgent(); }
    if (command.type === "set_model") {
      settings.provider = response.data.provider;
      settings.model = response.data.id;
      writeJson(settingsFile, settings);
    }
    if (command.type === "set_thinking_level") {
      settings.thinking = (await rpc.send({ type: "get_state" })).data.thinkingLevel;
      writeJson(settingsFile, settings);
    }
    return response;
  }
});
register("pi:stop", async () => { permissions.cancel(); imageBridge.abort(); videoBridge.abort(); task.cancelled = true; await rpc.stop(); task.finish("stopped"); });
register("pi:ui-response", (response) => {
  if (!response || typeof response.id !== "string") throw new Error("无效的扩展界面响应。");
  pendingInputs.delete(response.id);
  sendToRenderer("app:library-changed");
  rpc.respond({ type: "extension_ui_response", ...response });
});

async function createWindow() {
  host ||= createHost();
  mainWindow = host.window;
  // The first conversation uses the window's existing contents. Concurrent
  // conversations use cached views in that same window, preserving live output,
  // draft attachments, scroll position and independent permission requests.
  const view = host.contexts.size ? new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } }) : null;
  contents = view ? view.webContents : mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  const id = contents.id;
  const close = () => {
    permissions.cancel();
    stopHistoryWorker();
    permissionBridge?.close();
    imageBridge?.close();
    videoBridge?.close();
    task.cancelled = true;
    task.finish("stopped");
    void rpc.stop();
    if (view && !contents.isDestroyed()) contents.close();
  };
  context = { id, view, window: mainWindow, handlers, task, file: () => sessionFile, cwd: () => settings.cwd, pending: () => pendingConversation, busy: () => changingSettings || navigatingContext || submittingPrompt || stopping || starting || recoveringQueue,
    permissions: () => permissions.snapshot(), waitingInput: () => pendingInputs.size > 0,
    send: (channel, payload) => { if (!contents.isDestroyed()) contents.send(channel, payload); }, close,
    releaseSession: () => changeNavigation(async () => {
      if (task.active || submittingPrompt || stopping || recoveringQueue) throw new Error("该会话仍有任务在运行，请先停止或等待完成。");
      const response = await newConversation();
      if (response.data.cancelled) throw new Error("会话切换已取消，原会话未归档或删除。");
      pendingConversation = undefined;
    }),
    refreshContext: () => sendToRenderer("app:context-changed", safeSettings()),
    persistSession: () => changeNavigation(async () => {
      // An untouched native session has no file yet. Stop its exclusive writer
      // before preserving the header, then reopen the same session identity.
      if (!fs.existsSync(sessionFile)) await restartPi();
    }),
    retarget: (options) => changeNavigation(async () => {
      const preferences = Object.entries(options.settings || {}).every(([key, value]) => key === "cwd" || JSON.stringify(settings[key]) === JSON.stringify(value)) ? {} : options.settings;
      const config = await switchContext(options.cwd, options.sessionFile || library.createSession(options.cwd), preferences);
      if (!config || config.openedView) throw new Error("会话切换已取消。");
      if (options.agent) { agentSelections[sessionFile] = options.agent; writeJson(agentSelectionsFile, agentSelections); }
      sendToRenderer("app:context-changed", safeSettings());
    }),
    activate: () => {
      for (const item of host.contexts) item.view?.setVisible(item === context);
      host.active = context;
      if (view) {
        const [width, height] = mainWindow.getContentSize();
        view.setBounds({ x: 0, y: 0, width, height });
        mainWindow.contentView.addChildView(view);
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus(); contents.focus();
      if (!library.workspace(settings.cwd) && fs.existsSync(settings.cwd)) library.add(settings.cwd);
      library.select(settings.cwd, sessionFile);
      sendToRenderer("app:library-changed");
    },
    accountChanged: async (logout) => {
      await rpc.stop();
      videoModels = [];
      if (logout) { attachments.clear(); localFiles.entries.clear(); }
      if (logout) { sessionFile = undefined; task.clear(); }
      else {
        const models = readJson(path.join(agentDirectory, "models.json")).providers.jarodfund.models;
        if (!models.some((model) => model.id === settings.model)) settings.model = models[0].id;
      }
      sendToRenderer("app:account-changed", { logout, config: safeSettings() });
    },
  };
  conversations.set(id, context);
  host.contexts.add(context);
  if (view) view.setVisible(false);
  await contents.loadFile(path.join(__dirname, "index.html"));
  context.activate();
}

  const directory = app.getPath("userData");
  settingsFile = path.join(directory, "desktop-settings.json");
  const saved = { ...readJson(settingsFile), ...initial.settings, ...(initial.cwd ? { cwd: initial.cwd } : {}) };
  // Only public preferences may ever reach the renderer or settings file.
  for (const name of Object.keys(defaults)) if (typeof saved[name] === "string") settings[name] = saved[name];
  settings.imagePreferences = {};
  for (const profile of IMAGE_PROFILES) {
    if (!saved.imagePreferences?.[profile.id]) continue;
    try { settings.imagePreferences[profile.id] = normalizeImageOptions(profile.id, saved.imagePreferences[profile.id]); }
    catch { /* Invalid persisted options use this model's contract defaults. */ }
  }
  settings.videoPreferences = {};
  for (const profile of VIDEO_PROFILES) {
    if (!saved.videoPreferences?.[profile.id]) continue;
    try { settings.videoPreferences[profile.id] = normalizeVideoOptions(profile.id, saved.videoPreferences[profile.id]); }
    catch { /* Invalid persisted options use this model's contract defaults. */ }
  }
  if (!PERMISSION_MODES.some((mode) => mode.id === settings.permissionMode)) settings.permissionMode = "ask";
  if (!fs.existsSync(settings.cwd)) settings.cwd = defaultWorkspace;
  permissionBridge = await createPermissionBridge(async (event, signal) => {
    if (!task.active || task.cancelled || accountChanging || pathKey(event.cwd) !== pathKey(settings.cwd)) return { allowed: false, reason: "任务已结束或工作区已变化。" };
    return permissions.check(event, signal);
  });
  videoBridge = await createVideoBridge(async ({ args, cwd }, signal) => {
    if (!task.active || changingSettings || typeof cwd !== "string" || pathKey(cwd) !== pathKey(settings.cwd)) throw new Error("视频请求不属于当前工作区的任务。");
    if (!args?.task_id) {
      await loadImageModels();
      if (!videoModels.some((model) => model.id === settings.videoModel)) throw new Error("当前账户没有所选视频模型，请在设置中刷新并选择可用模型。");
    }
    return videoJobs.run({ args, model: settings.videoModel, preferences: settings.videoPreferences[settings.videoModel], cwd: settings.cwd, sessionFile, key: credentials.key, baseUrl: BASE_URL, signal });
  }, async () => {
    await loadImageModels();
    return { selectedModel: settings.videoModel, options: normalizeVideoOptions(settings.videoModel, settings.videoPreferences[settings.videoModel]),
      models: credentials.key ? videoModels : [], tasks: videoJobs.list(credentials.key, settings.cwd).slice(-30) };
  }, (message) => safeVideoError(message, credentials.key));
  imageBridge = await createImageBridge(async ({ args, cwd }, signal) => {
    if (!task.active || changingSettings || typeof cwd !== "string" || pathKey(cwd) !== pathKey(settings.cwd)) throw new Error("生图请求不属于当前工作区的任务。");
    const models = await loadImageModels();
    // Only the user's saved selection controls routing. Tool arguments must
    // never switch to a different model while trying to recover from an error.
    const model = models.find((item) => item.id === settings.imageModel);
    if (!model) throw new Error("当前账户没有所选生图模型，请在设置中刷新并选择可用模型。");
    return generateImage({ args, model, preferences: settings.imagePreferences[model.id], cwd: settings.cwd, key: credentials.key, baseUrl: BASE_URL, nativeImage, signal });
  }, redact, async () => ({
    selectedModel: settings.imageModel,
    options: normalizeImageOptions(settings.imageModel, settings.imagePreferences[settings.imageModel]),
    models: await loadImageModels(),
  }));
  library.add(settings.cwd);
  sessionFile ||= initial.fresh ? library.createSession(settings.cwd) : library.lastSession(settings.cwd) || library.createSession(settings.cwd);
  if (initial.agent) { agentSelections[sessionFile] = initial.agent; writeJson(agentSelectionsFile, agentSelections); }
  task.restore(library.tasks(sessionFile).at(-1));
  await createWindow();
}

const ownsApp = app.requestSingleInstanceLock();
if (!ownsApp) app.quit();
if (ownsApp && !customProfile && legacyProfile) prepareProfileEncryption(legacyProfile, profileDirectory);
app.on("second-instance", () => {
  const host = hosts.values().next().value;
  if (host?.active) host.active.activate();
  else if (host) { host.window.restore(); host.window.show(); host.window.focus(); }
});
app.whenReady().then(async () => {
  if (!ownsApp) return;
  Menu.setApplicationMenu(null);
  if (process.platform === "darwin") app.dock?.setIcon(path.join(__dirname, "icons/xueshupai.png"));
  const initialHost = createHost();
  await initialHost.window.loadFile(path.join(__dirname, "startup.html"));
  if (!customProfile && legacyProfile) await migrateProfile(legacyProfile, profileDirectory);
  await fs.promises.mkdir(profileDirectory, { recursive: true });
  const directory = profileDirectory;
  await fs.promises.mkdir(defaultWorkspace, { recursive: true });
  const portable = releaseConfig.distribution === "portable";
  if (portable) process.env.INSIGHT_ON_DEMAND = "1";
  const ComponentService = portable ? OnDemandComponents : Components;
  components = new ComponentService(path.join(directory, portable ? "portable-components" : "components"), {
    url: releaseConfig.componentsUrl, publicKey: releaseConfig.componentsPublicKey, fetcher: desktopResourceFetch,
    bundle: path.join(projectRoot, "bundled-components"), onChange: () => broadcast("app:distribution-changed"),
    onActivate: (paths) => {
      applyManagedResources(agentDirectory, paths, runtime.node);
      process.env.INSIGHT_COMPONENTS = JSON.stringify(paths);
      cachedSpecialists = null;
      broadcast("app:agents-changed");
    },
  });
  process.env.INSIGHT_COMPONENTS = JSON.stringify(components.paths());
  process.env.INSIGHT_PRODUCT_ROOT = projectRoot;
  updates = new Updates(autoUpdater, { url: portable ? "" : releaseConfig.updateUrl, packaged: app.isPackaged, version: app.getVersion(), busy: () => accountChanging || sessionOperations.size || [...conversations.values()].some((item) => item.task.active || item.busy()), onChange: () => broadcast("app:distribution-changed") });
  if (portable) updates = new PortableUpdates(path.join(directory, "portable-updates"), { url: releaseConfig.updateUrl, publicKey: releaseConfig.componentsPublicKey, fetcher: desktopResourceFetch, version: app.getVersion(), reveal: (file) => shell.showItemInFolder(file), onChange: () => broadcast("app:distribution-changed") });
  agentSelectionsFile = path.join(directory, "desktop-specialists.json");
  agentSelections = readJson(agentSelectionsFile);
  permissionSelectionsFile = path.join(directory, "desktop-permissions.json");
  permissionSelections = readJson(permissionSelectionsFile);
  credentials = new Credentials(path.join(directory, "jarodfund-key.enc"), safeStorage, process.env.JARODFUND_API_KEY || "");
  if (!process.env.JARODFUND_API_KEY && credentials.source === "missing" && !credentials.environmentDisabled && process.platform === "win32") {
    try {
      const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('JARODFUND_API_KEY','User')"], { windowsHide: true, timeout: 5000 });
      credentials.environmentKey = stdout.trim();
    } catch { /* The login form remains available. */ }
  }
  agentDirectory = path.join(directory, "agent");
  prepareAgentDirectory(agentDirectory, distributed ? agentDirectory : process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"));
  applyManagedResources(agentDirectory, components.paths(), runtime.node);
  modelCatalog = new ModelCatalog(agentDirectory, () => credentials.key, { onChange: (catalog) => broadcast("app:model-catalog", catalog) });
  library = new Library(path.join(directory, "desktop-library.json"), [path.join(agentDirectory, "sessions"), ...(distributed ? [] : [path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"), "sessions")])]);
  const cwd = readJson(path.join(directory, "desktop-settings.json")).cwd || defaultWorkspace;
  await library.initialize(fs.existsSync(cwd) ? cwd : defaultWorkspace, { background: true, onRefresh: () => broadcast("app:library-changed"), onError: () => broadcast("pi:status", { type: "warning", message: "历史索引暂时未刷新，已保存的会话文件仍保留。" }) });
  videoJobs = new VideoJobs(path.join(directory, "video-tasks"), { verify: verifyVideo, onProgress: (record) => {
    for (const context of conversations.values()) {
      const current = videoJobs.list(credentials.key, context.cwd(), context.file()).find((item) => item.id === record.id);
      if (current) context.send("pi:video", current);
    }
  } });
  await videoJobs.initialize();
  await openDesktop({}, initialHost);
  // Catalog I/O never gates the window, session or extension initialization.
  void modelCatalog.refresh();
  if (!portable && app.isPackaged && components.state.status !== "disabled" && !components.active.release) {
    // Complete first-install setup in the visible application, without holding
    // up basic chat. Pauses/failures are recoverable from Settings.
    void components.check().then(() => { if (components.state.status === "available") return components.install(); });
  }
  app.on("activate", () => { if (!hosts.size) void openDesktop(); });
}).catch((error) => {
  dialog.showErrorBox(APP_NAME, String(error.message).replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]"));
  app.quit();
});

app.on("before-quit", () => { quitting = true; components?.controller?.abort(); updates?.controller?.abort(); for (const context of conversations.values()) context.close(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
