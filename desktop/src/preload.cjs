const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("piDesktop", {
  distributionStatus: () => ipcRenderer.invoke("app:distribution-status"),
  checkUpdates: () => ipcRenderer.invoke("app:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("app:download-update"),
  installUpdate: () => ipcRenderer.invoke("app:install-update"),
  checkComponents: () => ipcRenderer.invoke("app:check-components"),
  installComponents: () => ipcRenderer.invoke("app:install-components"),
  pauseComponents: () => ipcRenderer.invoke("app:pause-components"),
  restart: () => ipcRenderer.invoke("app:restart"),
  onDistributionChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:distribution-changed", listener);
    return () => ipcRenderer.removeListener("app:distribution-changed", listener);
  },
  getConfig: () => ipcRenderer.invoke("app:get-config"),
  getChatModels: (refresh) => ipcRenderer.invoke("app:chat-models", refresh),
  onModelCatalog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:model-catalog", listener);
    return () => ipcRenderer.removeListener("app:model-catalog", listener);
  },
  newWindow: (agent) => ipcRenderer.invoke("app:new-window", agent),
  newAgentSession: (agent) => ipcRenderer.invoke("app:new-agent-session", agent),
  saveDraft: (draft) => ipcRenderer.invoke("app:save-draft", draft),
  getDraft: () => ipcRenderer.invoke("app:get-draft"),
  onContextChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:context-changed", listener);
    return () => ipcRenderer.removeListener("app:context-changed", listener);
  },
  onHistoryReady: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:history-ready", listener);
    return () => ipcRenderer.removeListener("app:history-ready", listener);
  },
  setPermission: (mode) => ipcRenderer.invoke("app:set-permission", mode),
  getPermissions: () => ipcRenderer.invoke("app:permissions"),
  respondPermission: (id, allowed) => ipcRenderer.invoke("app:permission-response", id, allowed),
  onPermissions: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pi:permissions", listener);
    return () => ipcRenderer.removeListener("pi:permissions", listener);
  },
  onAccountChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("app:account-changed", listener);
    return () => ipcRenderer.removeListener("app:account-changed", listener);
  },
  selectAgent: (id) => ipcRenderer.invoke("app:select-agent", id),
  prepareAgent: (id) => ipcRenderer.invoke("app:prepare-agent", id),
  onAgentsChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:agents-changed", listener);
    return () => ipcRenderer.removeListener("app:agents-changed", listener);
  },
  refreshAgents: () => ipcRenderer.invoke("app:refresh-agents"),
  openSkillsFolder: () => ipcRenderer.invoke("app:open-skills-folder"),
  chooseFiles: () => ipcRenderer.invoke("app:choose-files"),
  addFiles: (files) => ipcRenderer.invoke("app:add-files", files.map((file) => webUtils.getPathForFile(file))),
  getImageModels: (refresh) => ipcRenderer.invoke("app:image-models", refresh),
  getVideoModels: (refresh) => ipcRenderer.invoke("app:video-models", refresh),
  getVideoTasks: () => ipcRenderer.invoke("app:video-tasks"),
  getVideoFile: (id) => ipcRenderer.invoke("app:video-file", id),
  openVideo: (id) => ipcRenderer.invoke("app:open-video", id),
  copyVideo: (id) => ipcRenderer.invoke("app:copy-video", id),
  onVideo: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pi:video", listener);
    return () => ipcRenderer.removeListener("pi:video", listener);
  },
  importImage: (input) => ipcRenderer.invoke("app:import-image", input),
  openImage: (input) => ipcRenderer.invoke("app:open-image", input),
  copyImage: (input) => ipcRenderer.invoke("app:copy-image", input),
  copyText: (text) => ipcRenderer.invoke("app:copy-text", text),
  getLibrary: () => ipcRenderer.invoke("app:get-library"),
  getTaskHistory: () => ipcRenderer.invoke("app:get-task-history"),
  addWorkspace: () => ipcRenderer.invoke("app:add-workspace"),
  switchWorkspace: (id) => ipcRenderer.invoke("app:switch-workspace", id),
  removeWorkspace: (id) => ipcRenderer.invoke("app:remove-workspace", id),
  openSession: (file) => ipcRenderer.invoke("app:open-session", file),
  renameSession: (file, name) => ipcRenderer.invoke("app:rename-session", file, name),
  archiveSession: (file) => ipcRenderer.invoke("app:archive-session", file),
  restoreSession: (file) => ipcRenderer.invoke("app:restore-session", file),
  deleteSession: (file) => ipcRenderer.invoke("app:delete-session", file),
  chooseDirectory: () => ipcRenderer.invoke("app:choose-directory"),
  saveSettings: (settings) => ipcRenderer.invoke("app:save-settings", settings),
  saveKey: (key, remember) => ipcRenderer.invoke("app:save-key", { key, remember }),
  logoutKey: () => ipcRenderer.invoke("app:logout-key"),
  getTask: () => ipcRenderer.invoke("pi:get-task"),
  openLink: (url) => ipcRenderer.invoke("app:open-link", url),
  start: () => ipcRenderer.invoke("pi:start"),
  reconnect: () => ipcRenderer.invoke("pi:reconnect"),
  stop: () => ipcRenderer.invoke("pi:stop"),
  command: (command) => ipcRenderer.invoke("pi:command", command),
  respondUi: (response) => ipcRenderer.invoke("pi:ui-response", response),
  slash: (message) => ipcRenderer.invoke("pi:command", { type: "slash", message }),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pi:event", listener);
    return () => ipcRenderer.removeListener("pi:event", listener);
  },
  onUiRequest: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pi:ui-request", listener);
    return () => ipcRenderer.removeListener("pi:ui-request", listener);
  },
  onTask: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pi:task", listener);
    return () => ipcRenderer.removeListener("pi:task", listener);
  },
  onLibraryChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:library-changed", listener);
    return () => ipcRenderer.removeListener("app:library-changed", listener);
  },
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pi:status", listener);
    return () => ipcRenderer.removeListener("pi:status", listener);
  },
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:open-settings", listener);
    return () => ipcRenderer.removeListener("app:open-settings", listener);
  },
});
