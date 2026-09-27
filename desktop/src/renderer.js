(() => {
  const { name: APP_NAME } = window.desktopBrand;
  const DEFAULT_EDITOR_KEYBINDINGS = {
    submit: { key: "Enter", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
    commandNext: { key: "ArrowDown", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
    commandPrevious: { key: "ArrowUp", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
    commandComplete: { key: "Tab", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
    commandDismiss: { key: "Escape" },
    panelDismiss: { key: "Escape" },
    menuDismiss: { key: "Escape" },
    focusNext: { key: "Tab", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
    focusPrevious: { key: "Tab", shiftKey: true, ctrlKey: false, altKey: false, metaKey: false },
    readUp: { key: "ArrowUp" },
    readPageUp: { key: "PageUp" },
    readHome: { key: "Home" },
  };
  const compactAgents = window.matchMedia("(max-width: 1679px)");
  const $ = (selector) => document.querySelector(selector);
  const els = {
    connectionLabel: $("#connectionLabel"),
    connectionMark: $("#connectionMark"),
    providerName: $("#providerName"),
    connectionDetail: $("#connectionDetail"),
    reconnectButton: $("#reconnectButton"),
    workspaceList: $("#workspaceList"),
    sessionList: $("#sessionList"),
    sessionSearch: $("#sessionSearch"),
    sessionCount: $("#sessionCount"),
    sessionFilters: $("#sessionFilters"),
    historyEmpty: $("#historyEmpty"),
    addWorkspaceButton: $("#addWorkspaceButton"),
    renameDialog: $("#renameDialog"),
    renameForm: $("#renameForm"),
    sessionNameInput: $("#sessionNameInput"),
    toolbarWorkspace: $("#toolbarWorkspace"),
    modelSelect: $("#modelSelect"),
    refreshChatModels: $("#refreshChatModels"),
    refreshChatModelsSettings: $("#refreshChatModelsSettings"),
    chatModelHint: $("#chatModelHint"),
    thinkingSelect: $("#thinkingSelect"),
    permissionSelect: $("#permissionSelect"),
    permissionHint: $("#permissionHint"),
    permissionRequests: $("#permissionRequests"),
    followOutputButton: $("#followOutputButton"),
    followUpMode: $("#followUpMode"),
    messageQueue: $("#messageQueue"),
    messageQueueItems: $("#messageQueueItems"),
    takeBackQueue: $("#takeBackQueue"),
    newWindowButton: $("#newWindowButton"),
    welcomePanel: $("#welcomePanel"),
    chatPanel: $("#chatPanel"),
    messages: $("#messages"),
    typingRow: $("#typingRow"),
    typingText: $("#typingText"),
    promptInput: $("#promptInput"),
    attachButton: $("#attachButton"),
    agentsList: $("#agentsList"),
    agentsToggle: $("#agentsToggle"),
    agentSearch: $("#agentSearch"),
    composerAgent: $("#composerAgent"),
    clearAgent: $("#clearAgent"),
    imageInput: $("#imageInput"),
    attachments: $("#attachments"),
    imageModelSelect: $("#imageModelSelect"),
    refreshImageModels: $("#refreshImageModels"),
    imageModelHint: $("#imageModelHint"),
    imageOptions: $("#imageOptions"),
    imageOptionsHint: $("#imageOptionsHint"),
    videoModelSelect: $("#videoModelSelect"),
    refreshVideoModels: $("#refreshVideoModels"),
    videoModelHint: $("#videoModelHint"),
    videoOptions: $("#videoOptions"),
    videoOptionsHint: $("#videoOptionsHint"),
    commandMenu: $("#commandMenu"),
    commandDialog: $("#commandDialog"),
    commandResult: $("#commandResult"),
    sendButton: $("#sendButton"),
    stopButton: $("#stopButton"),
    newSessionButton: $("#newSessionButton"),
    settingsButton: $("#settingsButton"),
    settingsDialog: $("#settingsDialog"),
    settingsForm: $("#settingsForm"),
    providerInput: $("#providerInput"),
    modelInput: $("#modelInput"),
    cwdInput: $("#cwdInput"),
    dialogChooseDirectory: $("#dialogChooseDirectory"),
    apiStatusText: $("#apiStatusText"),
    apiStatusPill: $("#apiStatusPill"),
    toast: $("#toast"),
    taskStatus: $("#taskStatus"),
    taskStatusLabel: $("#taskStatusLabel"),
    taskElapsed: $("#taskElapsed"),
    apiKeyInput: $("#apiKeyInput"),
    showKey: $("#showKey"),
    rememberKey: $("#rememberKey"),
    logoutKeyButton: $("#logoutKeyButton"),
    connectKeyButton: $("#connectKeyButton"),
    keyFeedback: $("#keyFeedback"),
    saveSettingsButton: $("#saveSettingsButton"),
    settingsNote: $("#settingsNote"),
    interactionDialog: $("#interactionDialog"),
    interactionForm: $("#interactionForm"),
    interactionTitle: $("#interactionTitle"),
    interactionOptions: $("#interactionOptions"),
    interactionText: $("#interactionText"),
    interactionCancel: $("#interactionCancel"),
  };

  const state = {
    config: null,
    models: [],
    catalog: null,
    streaming: false,
    sending: false,
    stopping: false,
    currentAssistant: null,
    currentThinking: null,
    toastTimer: null,
    task: null,
    taskReceivedAt: 0,
    keySaving: false,
    navigating: true,
    initializing: true,
    library: { workspaces: [], sessions: [] },
    libraryRequest: 0,
    sessionFile: null,
    renamePath: null,
    archivedSessions: false,
    sessionLimit: 100,
    renderingHistory: false,
    historyEvents: [],
    historyBySession: new Map(),
    taskHistoryBySession: new Map(),
    pendingHistory: null,
    historyRequestVersion: 0,
    managingSession: false,
    streamFrame: null,
    pendingText: new Map(),
    followOutput: true,
    lastScrollTop: 0,
    scrollingPointer: false,
    libraryTimer: null,
    composing: false,
    commands: [],
    commandMatches: [],
    commandIndex: 0,
    interaction: null,
    attachments: [],
    importingImages: false,
    imageModelRequest: 0,
    imagePreferencesDraft: {},
    imageOptionsModel: null,
    videoPreferencesDraft: {},
    videoOptionsModel: null,
    videoModelRequest: 0,
    videoCards: new Map(),
    toolActivities: new Map(),
    selectingAgent: false,
    preparingAgents: new Set(),
    agentChoice: 0,
    agentsCatalogKey: null,
    reconnecting: false,
    connection: "connecting",
  };

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 4500);
  }

  function shortPath(value) {
    if (!value) return "未选择工作区";
    const normalized = value.replaceAll("/", "\\");
    const parts = normalized.split("\\").filter(Boolean);
    return parts.length > 2 ? `…\\${parts.slice(-2).join("\\")}` : normalized;
  }

  function workspaceTitle(value) {
    if (!value) return "工作区";
    const parts = value.replaceAll("/", "\\").split("\\").filter(Boolean);
    return (parts.at(-1) || "工作区").toUpperCase();
  }

  function setConnection(type, detail) {
    state.connection = type;
    const online = type === "online" || type === "started";
    const error = type === "error";
    els.connectionLabel.textContent = online ? `${APP_NAME}已连接` : error ? "连接需要注意" : detail || `正在连接${APP_NAME}`;
    els.connectionLabel.previousElementSibling.classList.toggle("is-online", online);
    els.connectionLabel.previousElementSibling.classList.toggle("is-error", error);
    els.connectionMark.classList.toggle("is-online", online);
    els.connectionMark.classList.toggle("is-error", error);
    els.connectionDetail.textContent = online ? "本地助手已就绪" : detail || (error ? "连接已中断，可尝试恢复" : "正在加载本地助手");
    els.connectionDetail.title = detail || "";
    setBusy(state.streaming);
  }

  function setBusy(busy, label = `${APP_NAME}正在整理思路…`) {
    state.streaming = busy;
    els.typingRow.classList.toggle("hidden", !busy);
    els.typingText.textContent = label;
    els.sendButton.classList.remove("hidden");
    els.sendButton.querySelector("span").textContent = busy ? "追加" : state.initializing ? "准备中" : "发送";
    els.followUpMode.classList.toggle("hidden", !busy);
    els.stopButton.classList.toggle("hidden", !busy);
    const locked = busy || state.keySaving || state.navigating || state.importingImages || state.selectingAgent || state.managingSession;
    const navigationLocked = state.keySaving || state.navigating || state.selectingAgent || state.sending || state.stopping || state.managingSession;
    if (locked) hideCommandMenu();
    document.querySelector(".main-panel").setAttribute("aria-busy", String(state.navigating));
    document.querySelector(".main-toolbar").classList.toggle("is-loading", state.navigating);
    els.promptInput.disabled = navigationLocked && !state.initializing;
    els.attachButton.disabled = navigationLocked || state.importingImages;
    els.clearAgent.disabled = locked;
    for (const button of els.agentsList.querySelectorAll(".agent-select")) button.disabled = navigationLocked || button.dataset.ready !== "true";
    const refreshAgents = $("#refreshPersonalAgents");
    if (refreshAgents) refreshAgents.disabled = locked;
    els.imageModelSelect.disabled = locked;
    els.imageOptions.disabled = locked;
    els.refreshImageModels.disabled = locked;
    els.videoModelSelect.disabled = locked;
    els.videoOptions.disabled = locked;
    els.refreshVideoModels.disabled = locked;
    for (const button of els.messages.querySelectorAll(".video-resume")) button.disabled = locked;
    for (const button of els.attachments.querySelectorAll("button")) button.disabled = navigationLocked;
    els.sendButton.disabled = navigationLocked || state.importingImages || state.sending || state.stopping;
    els.followUpMode.disabled = els.sendButton.disabled;
    els.takeBackQueue.disabled = state.sending || state.stopping || navigationLocked;
    els.newSessionButton.disabled = navigationLocked;
    els.newWindowButton.disabled = navigationLocked;
    els.addWorkspaceButton.disabled = navigationLocked;
    els.newSessionButton.title = busy ? "当前任务在后台继续，在此窗口开始新对话" : "开始新对话";
    els.permissionSelect.disabled = state.keySaving || state.navigating || state.managingSession;
    els.modelSelect.disabled = locked;
    for (const button of [els.refreshChatModels, els.refreshChatModelsSettings]) button.disabled = state.keySaving || !state.config?.connected || Boolean(state.catalog?.refreshing);
    els.thinkingSelect.disabled = locked;
    els.connectKeyButton.disabled = locked;
    els.logoutKeyButton.disabled = locked;
    els.rememberKey.disabled = locked;
    els.saveSettingsButton.disabled = locked;
    els.reconnectButton.disabled = (state.connection !== "error" && locked) || state.reconnecting || state.connection === "connecting";
    els.reconnectButton.textContent = state.reconnecting ? "正在恢复…" : state.connection === "connecting" ? "正在连接…" : "恢复连接";
    for (const button of document.querySelectorAll(".workspace-list button, .session-list button, .session-filters button")) button.disabled = navigationLocked;
    els.settingsNote.textContent = busy ? "当前会话任务进行中；可以切到其他会话并行工作，任务结束后再修改本会话运行设置。" : "保存后，当前对话下一次请求即使用新设置。";
  }

  function formatDuration(milliseconds) {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    const parts = [Math.floor(seconds / 60) % 60, seconds % 60];
    if (seconds >= 3600) parts.unshift(Math.floor(seconds / 3600));
    return parts.map((part) => String(part).padStart(2, "0")).join(":");
  }

  function updateClock() {
    if (!state.task) return;
    const extra = state.task.status === "running" ? performance.now() - state.taskReceivedAt : 0;
    els.taskElapsed.textContent = formatDuration(state.task.elapsedMs + extra);
  }

  function handleTask(task) {
    if (task?.status !== "running") flushStream();
    const alreadyFinished = task && state.task?.id === task.id && state.task.status !== "running";
    state.task = task;
    state.taskReceivedAt = performance.now();
    els.taskStatus.classList.toggle("hidden", !task);
    if (!task) { setBusy(false); return; }
    if (task.status !== "running") {
      for (const activity of state.toolActivities.values()) {
        if (!activity.finished) {
          activity.summary.textContent = `${activity.name} · 已结束等待`;
          activity.output.textContent = "工具没有返回可展示的结果。";
          activity.finished = true;
        }
      }
    }
    const labels = { running: "进行中", completed: "已完成，用时", failed: "未完成，用时", stopped: "已停止，用时" };
    els.taskStatus.dataset.status = task.status;
    els.taskStatusLabel.textContent = labels[task.status];
    setBusy(task.status === "running");
    updateClock();
    if (task.status !== "running" && !alreadyFinished && !state.navigating) appendTaskSummary(task);
    if (task.status !== "running" && state.pendingHistory?.sessionFile === state.sessionFile) {
      const pending = state.pendingHistory;
      state.pendingHistory = null;
      void renderStoredMessages(pending.messages, pending.tasks || state.taskHistoryBySession.get(pending.sessionFile) || []).catch((error) => showToast(error.message));
    }
  }

  function appendTaskSummary(task) {
    if (!task || [...els.messages.querySelectorAll(".task-summary")].some((el) => el.dataset.taskId === task.id)) return;
    const labels = { completed: "已完成，用时", failed: "未完成，用时", stopped: "已停止，用时" };
    if (task.status === "failed") messageNode("assistant", task.error || "任务未完成，请稍后重试。");
    const summary = document.createElement("div");
    summary.className = "task-summary";
    summary.dataset.taskId = task.id;
    const label = document.createElement("span");
    label.textContent = labels[task.status];
    const duration = document.createElement("time");
    duration.textContent = formatDuration(task.elapsedMs);
    summary.append(label, duration);
    els.messages.append(summary);
  }

  setInterval(updateClock, 250);

  function showChat() {
    els.welcomePanel.classList.add("hidden");
    els.chatPanel.classList.remove("hidden");
  }

  function showWelcome() {
    els.welcomePanel.classList.remove("hidden");
    els.chatPanel.classList.add("hidden");
  }

  function messageNode(role, text = "", thinking = false) {
    const wrapper = document.createElement("article");
    wrapper.className = `message ${role}${thinking ? " thinking" : ""}`;
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    if (role === "user") avatar.textContent = "你";
    else {
      const mark = document.createElement("span");
      mark.className = "brand-symbol";
      avatar.append(mark);
    }
    const body = document.createElement("div");
    body.className = "message-body";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const author = document.createElement("span");
    author.textContent = role === "user" ? "你" : thinking ? `${APP_NAME} · 思考过程` : APP_NAME;
    meta.append(author);
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = text;
    const copy = document.createElement("button");
    copy.className = "icon-button message-copy";
    copy.title = "复制消息";
    copy.setAttribute("aria-label", "复制消息");
    const icon = document.createElement("img");
    icon.src = "./icons/copy.svg";
    icon.alt = "";
    icon.width = 16;
    icon.height = 16;
    copy.append(icon);
    copy.addEventListener("click", async () => {
      flushStream();
      copy.disabled = true;
      try {
        await window.piDesktop.copyText(window.piMessageFormat.source(content));
        showToast("已复制");
      } catch { showToast("复制失败，请重试。"); }
      finally { copy.disabled = false; }
    });
    meta.append(copy);
    if (thinking) {
      const details = document.createElement("details");
      details.className = "thinking-details";
      const summary = document.createElement("summary");
      summary.textContent = "查看思考过程";
      details.append(summary, meta, content);
      body.append(details);
    } else body.append(meta, content);
    wrapper.append(avatar, body);
    els.messages.append(wrapper);
    return { wrapper, content };
  }

  function appendImages(message, images, details = []) {
    if (!images.length) return;
    const gallery = document.createElement("div");
    gallery.className = "message-images";
    for (const [index, image] of images.entries()) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) || typeof image.data !== "string") continue;
      const info = details[index] || image;
      const card = document.createElement("figure");
      card.className = "image-card";
      const preview = document.createElement("img");
      preview.src = `data:${image.mimeType};base64,${image.data}`;
      preview.alt = info.name || "会话图片";
      preview.loading = "lazy";
      const caption = document.createElement("figcaption");
      const description = `${info.width && info.height ? `${info.width} × ${info.height} · 原始尺寸` : "图片"}${info.path ? `\n${info.path}` : ""}`;
      caption.textContent = description;
      preview.addEventListener("click", () => {
        $("#imagePreview").src = preview.src;
        $("#imageCaption").textContent = description;
        $("#imageDialog").showModal();
      });
      preview.addEventListener("error", () => { caption.textContent = "图片预览失败"; });
      const { actions, open } = mediaActions(
        () => window.piDesktop.openImage({ path: info.path }),
        () => window.piDesktop.copyImage(info.path ? { path: info.path } : { data: image.data }),
        "图片",
      );
      open.disabled = !info.path;
      if (!info.path) open.title = "这张图片没有本地路径，可使用复制";
      card.append(preview, caption, actions);
      gallery.append(card);
    }
    message.content.after(gallery);
  }

  function mediaActions(openFile, copyFile, kind) {
    const actions = document.createElement("div");
    actions.className = "media-actions";
    const open = document.createElement("button");
    const copy = document.createElement("button");
    for (const [button, label, pending, action, feedback] of [
      [open, "本地打开", "正在打开…", openFile, "已交给系统默认应用打开"],
      [copy, "复制", "正在复制…", copyFile, kind === "图片" ? "图片已复制，可粘贴使用" : "视频文件已复制，可粘贴到支持文件的应用"],
    ]) {
      button.type = "button";
      button.className = `button button-outline media-${button === open ? "open" : "copy"}`;
      button.textContent = label;
      button.title = button === open ? `用系统默认应用打开本地${kind}` : kind === "图片" ? "复制图片内容和原文件" : "复制本地视频文件";
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = pending;
        try { await action(); showToast(feedback); }
        catch (error) { showToast(error.message || `${label}失败，请重试。`); }
        finally { button.disabled = false; button.textContent = label; }
      });
    }
    actions.append(open, copy);
    return { actions, open, copy };
  }

  function renderAttachments() {
    els.attachments.replaceChildren();
    els.attachments.classList.toggle("hidden", !state.attachments.length);
    for (const attachment of state.attachments) {
      const card = document.createElement("div");
      card.className = "attachment";
      const image = document.createElement(attachment.kind === "file" ? "span" : "img");
      if (attachment.kind === "file") {
        card.classList.add("file-attachment");
        image.className = "file-extension";
        image.textContent = attachment.name.includes(".") ? attachment.name.split(".").at(-1).toUpperCase().slice(0, 12) : "FILE";
        card.title = attachment.path;
      } else { image.src = `data:${attachment.mimeType};base64,${attachment.data}`; image.alt = attachment.name; }
      const name = document.createElement("small");
      name.textContent = attachment.name;
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.setAttribute("aria-label", `移除 ${attachment.name}`);
      remove.addEventListener("click", () => { state.attachments = state.attachments.filter((item) => item.id !== attachment.id); renderAttachments(); });
      card.append(image, name, remove);
      if (attachment.kind === "file") {
        const location = document.createElement("span");
        location.className = "file-path";
        location.textContent = attachment.path;
        card.append(location);
      }
      els.attachments.append(card);
    }
  }

  async function importImages(files) {
    if (state.navigating || state.keySaving || state.importingImages) return;
    if (state.attachments.filter((item) => item.kind !== "file").length + files.length > 4) { showToast("每次最多粘贴 4 张截图。"); return; }
    state.importingImages = true;
    setBusy(state.streaming);
    try {
      for (const file of files) {
        if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("图片不能为空，每张最多 20 MB。");
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("图片读取失败。"));
          reader.readAsDataURL(file);
        });
        state.attachments.push(await window.piDesktop.importImage({ name: file.name, data }));
        renderAttachments();
      }
    } catch (error) { showToast(error.message); }
    finally { state.importingImages = false; setBusy(state.streaming); els.promptInput.focus(); }
  }

  async function addLocalFiles(files) {
    if (state.navigating || state.keySaving || state.importingImages || state.selectingAgent) return;
    state.importingImages = true;
    setBusy(state.streaming);
    try {
      const added = files ? await window.piDesktop.addFiles(files) : await window.piDesktop.chooseFiles();
      const unique = added.filter((file) => !state.attachments.some((item) => item.kind === "file" && item.path === file.path));
      if (state.attachments.filter((item) => item.kind === "file").length + unique.length > 50) throw new Error("每条消息最多引用 50 个文件。");
      state.attachments.push(...unique);
      renderAttachments();
    } catch (error) { showToast(error.message); }
    finally { state.importingImages = false; setBusy(state.streaming); els.promptInput.focus(); }
  }

  function appendFiles(message, files) {
    if (!files.length) return;
    const list = document.createElement("div");
    list.className = "message-files";
    for (const file of files) {
      const item = document.createElement("p");
      item.className = "message-file";
      const name = document.createElement("strong");
      name.textContent = file.name || file.path.split(/[\\/]/).at(-1);
      const location = document.createElement("span");
      location.textContent = file.path;
      item.append(name, location);
      list.append(item);
    }
    message.content.after(list);
  }

  function renderAgents() {
    const catalogKey = JSON.stringify(state.config.specialists || []);
    if (state.agentsCatalogKey !== catalogKey) {
      const scrollTop = els.agentsList.scrollTop;
      state.agentsCatalogKey = catalogKey;
      els.agentsList.replaceChildren();
      for (const groupName of [...new Set([...(state.config.specialists || []).map((agent) => agent.group), "我的智能体"])]) {
        const group = document.createElement("section");
        group.className = "agent-group";
        group.dataset.group = groupName;
        const agents = (state.config.specialists || []).filter((agent) => agent.group === groupName);
        const heading = document.createElement("h3");
        heading.textContent = groupName;
        const count = document.createElement("span");
        count.textContent = String(agents.length).padStart(2, "0");
        heading.append(count);
        group.append(heading);
        if (groupName === "我的智能体") {
          const intro = document.createElement("div");
          intro.className = "personal-agents-intro";
          const copy = document.createElement("p");
          copy.textContent = "你也可以设计、安装自己的智能体。这里展示你添加的技能，可跨工作区使用；内置基础能力默认可用，无需在此选择。";
          const actions = document.createElement("div");
          actions.className = "personal-agents-actions";
          const folder = document.createElement("button");
          folder.type = "button"; folder.className = "button button-outline";
          folder.id = "openSkillsFolder"; folder.textContent = "打开安装目录";
          folder.addEventListener("click", () => { void window.piDesktop.openSkillsFolder().catch((error) => showToast(error.message)); });
          const refresh = document.createElement("button");
          refresh.type = "button"; refresh.className = "button button-outline";
          refresh.id = "refreshPersonalAgents"; refresh.textContent = "刷新智能体";
          refresh.addEventListener("click", refreshPersonalAgents);
          actions.append(folder, refresh);
          const help = document.createElement("details");
          help.className = "personal-agents-help";
          const summary = document.createElement("summary"); summary.textContent = "如何安装或设计自己的智能体";
          const instructions = document.createElement("p");
          instructions.textContent = "把包含 SKILL.md 的完整技能文件夹放入下方学术派个人安装目录，然后点击“刷新智能体”，无需重启。也可以让学术派根据你的目标编写并安装技能。你安装并加载的技能包也会显示；内置基础能力、只有工具或扩展的包不会生成卡片。来自其他项目或客户端的技能，请将完整文件夹复制到此目录。";
          const location = document.createElement("code"); location.textContent = state.config.personalSkillsDirectory || "";
          const example = document.createElement("pre");
          example.textContent = "my-assistant/SKILL.md 示例：\n---\nname: my-assistant\ndescription: 按我的风格整理材料与生成报告\n---\n\n在这里写明目标、工作步骤和输出要求。";
          help.append(summary, instructions, location, example);
          intro.append(copy, actions, help);
          group.append(intro);
        }
        for (const agent of agents) {
          const card = document.createElement("article");
          card.className = "agent-card";
          card.dataset.agent = agent.id;
          const button = document.createElement("button");
          button.className = "agent-select";
          button.dataset.ready = String(agent.ready || agent.downloadable);
          button.setAttribute("aria-label", agent.name);
          const top = document.createElement("span");
          top.className = "agent-card-top";
          const shape = document.createElement("i");
          shape.className = "agent-symbol";
          shape.setAttribute("aria-hidden", "true");
          const tag = document.createElement("span");
          tag.className = "agent-tag";
          tag.textContent = agent.tag;
          top.append(shape, tag);
          const name = document.createElement("strong");
          name.textContent = agent.name;
          const description = document.createElement("span");
          description.className = "agent-description";
          description.textContent = agent.description;
          button.append(top, name, description);
          button.addEventListener("click", () => selectAgent(agent.id));
          const bottom = document.createElement("div");
          bottom.className = "agent-card-bottom";
          const status = document.createElement("span");
          status.className = "agent-status";
          const source = document.createElement(agent.source ? "button" : "span");
          source.className = "agent-source";
          source.textContent = agent.source ? "项目来源 ↗" : "本地技能";
          source.title = [agent.source || agent.origin, agent.license].filter(Boolean).join(" · ");
          if (agent.source) source.addEventListener("click", () => { void window.piDesktop.openLink(agent.source); });
          bottom.append(status, source);
          card.append(button, bottom);
          group.append(card);
        }
        els.agentsList.append(group);
      }
      els.agentsList.scrollTop = scrollTop;
    }
    for (const card of els.agentsList.querySelectorAll(".agent-card")) {
      const agent = state.config.specialists.find((item) => item.id === card.dataset.agent);
      const selected = agent.id === state.config.selectedAgent;
      card.classList.toggle("is-selected", selected);
      card.querySelector(".agent-select").setAttribute("aria-pressed", String(selected));
      card.querySelector(".agent-status").textContent = state.preparingAgents.has(agent.id) ? "正在准备…" : !agent.ready ? agent.downloadable ? "点击下载并使用" : "待安装" : selected ? "已选择" : "可使用";
    }
    const selected = state.config.specialists?.find((agent) => agent.id === state.config.selectedAgent);
    els.composerAgent.textContent = selected?.name || `和${APP_NAME}说点什么`;
    els.clearAgent.classList.toggle("hidden", !selected);
    els.promptInput.placeholder = selected?.hint || "例如：帮我整理这份材料，提炼值得讨论的问题……";
    filterAgents();
  }

  function filterAgents() {
    const query = els.agentSearch.value.trim().toLocaleLowerCase();
    let total = 0;
    let visibleGroups = 0;
    for (const group of els.agentsList.querySelectorAll(".agent-group")) {
      let count = 0;
      for (const card of group.querySelectorAll(".agent-card")) {
        const agent = state.config.specialists.find((item) => item.id === card.dataset.agent);
        const visible = [agent.name, agent.description, agent.group, agent.tag].join(" ").toLocaleLowerCase().includes(query);
        card.hidden = !visible;
        if (visible) count++;
      }
      group.hidden = !count && !(group.dataset.group === "我的智能体" && (!query || "我的智能体 自定义 个人技能".includes(query)));
      if (!group.hidden) visibleGroups++;
      group.querySelector("h3 span").textContent = String(count).padStart(2, "0");
      total += count;
    }
    $("#agentSearchStatus").textContent = query ? `找到 ${total} 位智能体` : `${total} 位智能体 · 内置专长与个人技能`;
    $("#agentsEmpty").classList.toggle("hidden", visibleGroups > 0);
    els.agentsList.classList.toggle("hidden", visibleGroups === 0);
  }

  async function refreshPersonalAgents() {
    if (state.streaming || state.navigating || state.selectingAgent || state.keySaving) return;
    state.selectingAgent = true;
    setBusy(state.streaming);
    $("#refreshPersonalAgents").textContent = "正在刷新…";
    try {
      syncConfig(await window.piDesktop.refreshAgents());
      const response = await command({ type: "get_commands" });
      state.commands = response.data.commands;
      showToast("智能体已刷新，可以直接选择使用。");
    } catch (error) { showToast(error.message); }
    finally {
      state.selectingAgent = false;
      $("#refreshPersonalAgents").textContent = "刷新智能体";
      setBusy(state.streaming);
    }
  }

  async function selectAgent(id) {
    if (state.navigating || state.keySaving || state.importingImages || state.selectingAgent) return;
    const choice = ++state.agentChoice;
    const agent = state.config.specialists?.find((item) => item.id === id);
    if (agent && !agent.ready && agent.downloadable) {
      if (state.preparingAgents.has(id)) return;
      const originalSession = state.sessionFile;
      state.preparingAgents.add(id);
      renderAgents();
      showToast("正在准备智能体；可继续聊天或切换会话，下载进度在左下角显示。");
      try {
        const config = await window.piDesktop.prepareAgent(id);
        state.config.specialists = config.specialists;
        renderAgents();
        if (choice === state.agentChoice && state.sessionFile === originalSession && !state.navigating) {
          state.preparingAgents.delete(id);
          return await selectAgent(id);
        }
        showToast("智能体已就绪，点击卡片即可使用。");
      } catch (error) { showToast(error.message); }
      finally { state.preparingAgents.delete(id); renderAgents(); setBusy(state.streaming); }
      return;
    }
    if (state.streaming) {
      await navigate(() => window.piDesktop.newAgentSession(id));
      return;
    }
    state.selectingAgent = true;
    setBusy(false);
    try {
      state.config.selectedAgent = await window.piDesktop.selectAgent(id);
      renderAgents();
      if (compactAgents.matches) toggleAgents(false);
    } catch (error) { showToast(error.message); }
    finally { state.selectingAgent = false; setBusy(state.streaming); els.promptInput.focus(); }
  }

  function toggleAgents(open) {
    document.body.classList.toggle("agents-open", open);
    els.agentsToggle.setAttribute("aria-expanded", String(open));
    $("#agentsPanel").setAttribute("aria-hidden", String(!open));
    $("#agentsPanel").inert = !open;
    const drawer = open && compactAgents.matches;
    $("#agentsBackdrop").hidden = !drawer;
    $(".main-panel").inert = drawer;
    $(".sidebar").inert = drawer;
    if (drawer) {
      $("#agentsPanel").setAttribute("role", "dialog");
      $("#agentsPanel").setAttribute("aria-modal", "true");
    } else {
      $("#agentsPanel").removeAttribute("role");
      $("#agentsPanel").removeAttribute("aria-modal");
    }
  }

  async function refreshImageModels(refresh = false) {
    const request = ++state.imageModelRequest;
    els.imageModelHint.textContent = "正在读取生图模型…";
    try {
      const models = await window.piDesktop.getImageModels(refresh);
      if (request !== state.imageModelRequest) return;
      const selected = els.imageModelSelect.value || state.config.imageModel;
      els.imageModelSelect.replaceChildren();
      for (const model of models) els.imageModelSelect.add(new Option(model.id, model.id));
      if (!models.some((item) => item.id === selected)) els.imageModelSelect.add(new Option(`${selected}（当前列表未提供）`, selected));
      els.imageModelSelect.value = selected;
      els.imageModelHint.textContent = models.length ? "使用当前 Key 可用的已接入模型；直接在对话中描述图片，或上传图片后提出修改要求。" : "当前账户未返回已接入的生图模型。";
    } catch (error) { if (request === state.imageModelRequest) els.imageModelHint.textContent = error.message; }
  }

  function readImageOptions() {
    return Object.fromEntries([...els.imageOptions.querySelectorAll("[data-image-option]")].map((input) => [
      input.dataset.imageOption,
      input.dataset.imageOption === "n" ? Number(input.value) : input.value === "custom" ? $("#imageCustomSize").value.trim() : input.value,
    ]));
  }

  async function refreshVideoModels(refresh = false) {
    const request = ++state.videoModelRequest;
    els.videoModelHint.textContent = "正在读取视频模型…";
    try {
      const models = await window.piDesktop.getVideoModels(refresh);
      if (request !== state.videoModelRequest) return;
      const selected = els.videoModelSelect.value || state.config.videoModel;
      els.videoModelSelect.replaceChildren();
      for (const model of models) els.videoModelSelect.add(new Option(model.id, model.id));
      if (!models.some((item) => item.id === selected)) els.videoModelSelect.add(new Option(`${selected}（当前列表未提供）`, selected));
      els.videoModelSelect.value = selected;
      els.videoModelHint.textContent = models.length ? "使用当前 Key 可用的视频模型；在对话中描述内容，完成后自动保存，可播放、本地打开或复制。" : "当前账户未返回已接入的视频模型。";
    } catch (error) { if (request === state.videoModelRequest) els.videoModelHint.textContent = error.message; }
  }

  function readVideoOptions() {
    return Object.fromEntries([...els.videoOptions.querySelectorAll("[data-video-option]")].map((input) => [
      input.dataset.videoOption, input.dataset.videoOption === "duration" ? Number(input.value) : input.value,
    ]));
  }

  function renderVideoOptions() {
    const profile = state.config.videoProfiles.find((item) => item.id === els.videoModelSelect.value);
    els.videoOptions.replaceChildren();
    state.videoOptionsModel = profile?.id;
    if (!profile) { els.videoOptionsHint.textContent = "请从列表选择已接入的视频模型。"; return; }
    const options = { ...profile.defaults, ...state.videoPreferencesDraft[profile.id] };
    const labels = { duration: "视频时长", ratio: "画面比例", aspect_ratio: "画面比例", resolution: "分辨率等级" };
    for (const field of Object.keys(profile.defaults)) {
      const label = document.createElement("label");
      label.className = "field";
      const title = document.createElement("span");
      title.textContent = labels[field];
      const select = document.createElement("select");
      select.id = `videoOption-${field}`;
      select.dataset.videoOption = field;
      select.setAttribute("aria-label", labels[field]);
      for (const value of profile.choices[field]) select.add(new Option(field === "duration" ? `${value} 秒` : String(value), String(value)));
      select.value = String(options[field]);
      label.append(title, select);
      els.videoOptions.append(label);
    }
    els.videoOptionsHint.textContent = `当前支持文字生成单个视频。参数按模型分别记住，实际时长和像素以下载结果为准。${profile.note || ""}停止等待后可继续获取原任务。`;
  }

  function renderVideoTask(record) {
    if (!record?.id || record.sessionFile !== state.sessionFile) return;
    let card = state.videoCards.get(record.id);
    if (!card) {
      const message = messageNode("assistant");
      message.wrapper.classList.add("video-result");
      message.wrapper.dataset.videoId = record.id;
      const body = document.createElement("div");
      body.className = "video-card";
      const details = document.createElement("p");
      details.className = "video-details";
      const media = document.createElement("div");
      const { actions, open, copy } = mediaActions(
        () => window.piDesktop.openVideo(record.id),
        () => window.piDesktop.copyVideo(record.id),
        "视频",
      );
      actions.classList.add("video-actions");
      const resume = document.createElement("button");
      resume.className = "button button-outline video-resume";
      resume.textContent = "继续获取";
      resume.addEventListener("click", () => {
        if (state.streaming || state.navigating || state.keySaving) return;
        if (els.promptInput.value.trim() || state.attachments.length) { showToast("请先发送或清空输入框中的内容。"); return; }
        els.promptInput.value = `继续获取视频任务 ${record.id}，只查询和下载原任务，不要重新生成。`;
        void sendPrompt();
      });
      actions.prepend(resume);
      body.append(details, media, actions);
      message.content.after(body);
      card = { ...message, details, media, resume, open, copy, filePath: null };
      state.videoCards.set(record.id, card);
    }
    const labels = { queued: "视频排队中", processing: "视频生成中", in_progress: "视频生成中", downloading: "正在下载并验证视频", completed: "视频已生成", failed: "视频生成失败", paused: "视频等待已暂停" };
    card.content.textContent = `${labels[record.status] || "视频任务"} · ${record.model}`;
    card.wrapper.dataset.status = record.status;
    card.details.textContent = [record.file ? `${record.file.width} × ${record.file.height} · ${record.file.duration.toFixed(2)} 秒 · ${(record.file.bytes / 1024 / 1024).toFixed(1)} MB\n${record.file.path}`
      : `请求 ${record.options.duration} 秒 · ${record.options.ratio || record.options.aspect_ratio}${record.options.resolution ? ` · ${record.options.resolution}` : ""}`,
      ...(record.warnings || []), record.error || "", `任务 ID：${record.id}`].filter(Boolean).join("\n");
    card.resume.classList.toggle("hidden", record.status === "completed" || record.status === "failed" || record.active);
    card.resume.disabled = state.streaming || state.navigating || state.keySaving;
    card.open.classList.toggle("hidden", record.status !== "completed");
    card.copy.classList.toggle("hidden", record.status !== "completed");
    if (record.status === "completed" && record.file && card.filePath !== record.file.path) {
      card.filePath = record.file.path;
      void window.piDesktop.getVideoFile(record.id).then((file) => {
        if (!card.wrapper.isConnected) return;
        const video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        video.src = file.url;
        video.setAttribute("aria-label", "生成的视频");
        video.addEventListener("error", () => { card.details.textContent = "视频播放失败，可继续获取原任务。"; card.resume.classList.remove("hidden"); });
        card.media.replaceChildren(video);
      }).catch((error) => { card.details.textContent = error.message; card.resume.classList.remove("hidden"); });
    }
    showChat();
  }

  function updateImageOptionsHint() {
    const profile = state.config.imageProfiles.find((item) => item.id === els.imageModelSelect.value);
    if (!profile) { els.imageOptionsHint.textContent = "请从列表选择已接入的模型。"; return; }
    const options = readImageOptions();
    const pixels = options.size?.split("x").map(Number);
    const experimental = profile.customSize && pixels?.[0] * pixels?.[1] > 3686400;
    const notes = [`每次最多输出 ${profile.maxOutputs} 张，编辑最多参考 ${profile.maxReferences} 张。参数按模型分别记住，也可在对话中指定本次要求。`];
    if (profile.customSize) notes.push("自定义宽高须为 16 的倍数，各不超过 3840；宽高比 1:3 至 3:1，总像素 655360–8294400。");
    if (experimental) notes.push("当前尺寸属于实验性分辨率，耗时和实际输出尺寸以服务商返回为准。");
    if (options.background === "transparent") notes.push("请求透明背景，是否实际透明以返回图片为准。");
    if (profile.family === "gemini") notes.push("分辨率为尺寸等级，实际像素以生成结果为准。");
    els.imageOptionsHint.textContent = notes.join(" ");
    els.imageOptionsHint.classList.toggle("is-experimental", Boolean(experimental));
  }

  // Display presets only: option values remain WIDTHxHEIGHT for the API.
  const gpt2SizeLabels = {
    "1024x1024": "1K · 1:1",
    "1024x576": "1K · 16:9",
    "576x1024": "1K · 9:16",
    "1024x768": "1K · 4:3",
    "768x1024": "1K · 3:4",
    "2048x2048": "2K · 1:1",
    "2048x1152": "2K · 16:9",
    "1152x2048": "2K · 9:16",
    "2048x1536": "2K · 4:3",
    "1536x2048": "2K · 3:4",
    "2160x2160": "4K · 1:1",
    "3840x2160": "4K · 16:9",
    "2160x3840": "4K · 9:16",
    "2880x2160": "4K · 4:3",
    "2160x2880": "4K · 3:4",
  };
  const gpt25SizeLabels = {
    "1280x1280": "1K · 1:1",
    "960x1280": "1K · 3:4",
    "1280x960": "1K · 4:3",
    "720x1280": "1K · 9:16",
    "1280x720": "1K · 16:9",
    "2048x2048": "2K · 1:1",
    "1536x2048": "2K · 3:4",
    "2048x1536": "2K · 4:3",
    "1152x2048": "2K · 9:16",
    "2048x1152": "2K · 16:9",
    "2160x2160": "4K · 1:1",
    "2160x2880": "4K · 3:4",
    "2880x2160": "4K · 4:3",
    "2160x3840": "4K · 9:16",
    "3840x2160": "4K · 16:9",
    "1024x1024": "常用 · 1:1",
    "1536x1024": "常用 · 3:2",
    "1024x1536": "常用 · 2:3",
  };

  function renderImageOptions() {
    const profile = state.config.imageProfiles.find((item) => item.id === els.imageModelSelect.value);
    els.imageOptions.replaceChildren();
    state.imageOptionsModel = profile?.id;
    if (!profile) { updateImageOptionsHint(); return; }
    const options = { ...profile.defaults, ...state.imagePreferencesDraft[profile.id] };
    const labels = { size: "输出像素", n: "生成张数", quality: "画质", background: "背景", aspect_ratio: "画面比例", image_size: "分辨率等级", resolution: "分辨率等级" };
    const values = { auto: "自动", low: "低", medium: "中", high: "高", xhigh: "更高", max: "最高", opaque: "不透明", transparent: "透明" };
    const advanced = document.createElement("details");
    advanced.className = "advanced-options";
    const summary = document.createElement("summary");
    summary.textContent = "更多选项（张数、背景）";
    const advancedGrid = document.createElement("div");
    advancedGrid.className = "advanced-grid";
    advanced.append(summary, advancedGrid);
    for (const field of Object.keys(profile.defaults)) {
      const label = document.createElement("label");
      label.className = "field";
      const title = document.createElement("span");
      title.textContent = labels[field];
      const select = document.createElement("select");
      select.id = `imageOption-${field}`;
      select.dataset.imageOption = field;
      select.setAttribute("aria-label", labels[field]);
      let choices = field === "n" ? Array.from({ length: profile.maxOutputs }, (_, i) => i + 1) : profile.choices[field];
      const sizeLabels = field !== "size" ? null : profile.id === "gpt-image-2" ? gpt2SizeLabels
        : ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(profile.id) ? gpt25SizeLabels : null;
      if (sizeLabels === gpt25SizeLabels) choices = [...new Set(["auto", ...Object.keys(sizeLabels), ...choices])];
      for (const value of choices) {
        const text = values[value] || String(value).replace("x", " × ");
        select.add(new Option(sizeLabels?.[value] ? `${text}（${sizeLabels[value]}）` : text, String(value)));
      }
      label.append(title, select);
      if (field === "size" && profile.customSize) {
        select.add(new Option("自定义像素…", "custom"));
        const input = document.createElement("input");
        input.id = "imageCustomSize";
        input.placeholder = "例如 1536x864";
        input.setAttribute("aria-label", "自定义输出像素");
        input.maxLength = 9;
        input.value = choices.includes(options.size) ? "" : options.size;
        input.classList.toggle("hidden", choices.includes(options.size));
        input.addEventListener("input", updateImageOptionsHint);
        select.addEventListener("change", () => input.classList.toggle("hidden", select.value !== "custom"));
        label.append(input);
      }
      select.value = choices.includes(options[field]) ? String(options[field]) : "custom";
      select.addEventListener("change", updateImageOptionsHint);
      if (["n", "background"].includes(field)) advancedGrid.append(label);
      else els.imageOptions.append(label);
    }
    if (advancedGrid.children.length) els.imageOptions.append(advanced);
    updateImageOptionsHint();
  }

  function renderUserMessage(message) {
    const content = Array.isArray(message.content) ? message.content : [{ type: "text", text: String(message.content || "") }];
    const text = content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    const images = content.filter((part) => part.type === "image");
    const [clean, imagePaths] = text.split("\n\n[图片附件 / 可用于 image_gen 的本地路径]\n");
    const [body, paths] = clean.split("\n\n[本地文件路径 / 按需读取，选择文件时未上传内容]\n");
    if (!body.trim() && !images.length && !paths) return;
    const node = messageNode("user", body);
    appendImages(node, images, (imagePaths || "").split("\n").filter(Boolean).map((path) => ({ path })));
    const files = (paths || "").split("\n").flatMap((line) => {
      try { const path = JSON.parse(line); return typeof path === "string" ? [{ path }] : []; } catch { return []; }
    });
    appendFiles(node, files);
    showChat();
  }

  function renderQueue(queue) {
    els.messageQueueItems.replaceChildren();
    const entries = [...(queue.steering || []).map((text) => ({ text, label: "补充当前任务" })), ...(queue.followUp || []).map((text) => ({ text, label: "完成后处理" }))];
    els.messageQueue.classList.toggle("hidden", !entries.length);
    for (const entry of entries) {
      const item = document.createElement("p");
      item.className = "queue-item";
      const preview = entry.text.split("\n\n[本地文件路径 / 按需读取，选择文件时未上传内容]\n")[0]
        .split("\n\n[图片附件 / 可用于 image_gen 的本地路径]\n")[0];
      item.textContent = `${entry.label} · ${preview.slice(0, 500)}${preview.length > 500 ? "…" : ""}`;
      els.messageQueueItems.append(item);
    }
  }

  async function restoreQueue(queue) {
    const messages = [...(queue?.steering || []), ...(queue?.followUp || [])];
    if (!messages.length) return;
    // Recovered attachments are plain path references, not structured suffixes:
    // otherwise transcript rendering could hide later queued text or edits.
    const recovered = messages.map((text) => text
      .replaceAll("\n\n[图片附件 / 可用于 image_gen 的本地路径]\n", "\n\n参考图片（本地路径，可按需读取）：\n")
      .replaceAll("\n\n[本地文件路径 / 按需读取，选择文件时未上传内容]\n", "\n\n参考文件（本地路径，可按需读取）：\n"));
    els.promptInput.value = [...recovered, els.promptInput.value].filter(Boolean).join("\n\n");
    renderQueue({});
    await window.piDesktop.saveDraft({ sessionFile: state.sessionFile, message: els.promptInput.value, attachments: state.attachments.map(({ id, kind }) => ({ id, kind })), mode: els.followUpMode.value, recoveryId: queue.recoveryId });
    showToast("待处理内容已放回输入框；文件和图片保留为本地路径引用。");
  }

  function ensureAssistantMessage() {
    if (!state.currentAssistant) {
      state.currentAssistant = messageNode("assistant");
    }
    return state.currentAssistant;
  }

  function addAssistantText(text) {
    const message = ensureAssistantMessage();
    queueText(message.content, text);
  }

  function addThinkingText(text) {
    if (!state.currentThinking) {
      state.currentThinking = messageNode("assistant", "", true);
      if (state.currentAssistant) state.currentAssistant.wrapper.before(state.currentThinking.wrapper);
    }
    queueText(state.currentThinking.content, text);
  }

  function queueText(content, text) {
    state.pendingText.set(content, (state.pendingText.get(content) || "") + text);
    if (state.streamFrame === null) state.streamFrame = requestAnimationFrame(flushStream);
  }

  function flushStream() {
    if (state.streamFrame !== null) cancelAnimationFrame(state.streamFrame);
    state.streamFrame = null;
    if (!state.pendingText.size) return;
    const selection = window.getSelection();
    const selecting = selection && !selection.isCollapsed &&
      (els.messages.contains(selection.anchorNode) || els.messages.contains(selection.focusNode));
    for (const [content, text] of state.pendingText) {
      if (content.isConnected && text) content.append(document.createTextNode(text));
    }
    state.pendingText.clear();
    if (state.followOutput && !selecting && !state.scrollingPointer) scrollLatest();
  }

  function scrollLatest() {
    els.chatPanel.scrollTop = els.chatPanel.scrollHeight;
    state.lastScrollTop = els.chatPanel.scrollTop;
  }

  function pauseFollowing() {
    state.followOutput = false;
    els.followOutputButton.classList.remove("hidden");
  }

  async function renderStoredMessages(messages, tasks = [], requestVersion = null) {
    if (requestVersion !== null && requestVersion !== state.historyRequestVersion) return false;
    const version = state.historyRenderVersion = (state.historyRenderVersion || 0) + 1;
    state.renderingHistory = true;
    try {
    flushStream();
    if (requestVersion !== null && requestVersion !== state.historyRequestVersion) return false;
    els.messages.replaceChildren();
    state.videoCards.clear();
    state.toolActivities.clear();
    state.currentAssistant = null;
    state.currentThinking = null;
    let previousTask;
    let rendered = 0;
    for (const message of messages || []) {
      if (rendered++ && rendered % 60 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      if (version !== state.historyRenderVersion) return false;
      if (requestVersion !== null && requestVersion !== state.historyRequestVersion) return false;
      if (message.role === "user") {
        if (previousTask && message.timestamp >= previousTask.finishedAt) { appendTaskSummary(previousTask); previousTask = null; }
        previousTask = tasks.find((task) => task.promptTimestamp === message.timestamp) || previousTask;
        renderUserMessage(message);
      } else if (message.role === "desktopCompaction") {
        const marker = document.createElement("p");
        marker.className = "history-marker";
        marker.textContent = "此处已压缩模型上下文 · 较早的会话记录仍完整保留";
        els.messages.append(marker);
      } else if (message.role === "assistant") {
        const text = Array.isArray(message.content)
          ? message.content.filter((part) => part.type === "text").map((part) => part.text).join("")
          : String(message.content || "");
        if (text.trim()) window.piMessageFormat.render(messageNode("assistant", text).content);
      } else if (message.role === "toolResult") {
        if (message.details?.videoGeneration) renderVideoTask(message.details);
        renderImageResult(message);
        renderToolActivity(message.toolCallId, message.toolName, message, message.isError);
      }
    }
    if (requestVersion !== null && requestVersion !== state.historyRequestVersion) return false;
    appendTaskSummary(previousTask);
    if (els.messages.children.length > 0) showChat();
    else showWelcome();
    } finally {
      if (version === state.historyRenderVersion) {
        state.renderingHistory = false;
        for (const event of state.historyEvents.splice(0)) handleEvent(event);
      }
    }
    return true;
  }

  function modelLabel(model) {
    return model.id.replace(/^cursor-/, "").replace(/^max-/, "MAX ");
  }

  function populateModels(models) {
    state.models = models.filter((model) => model.provider === (state.config?.provider || "jarodfund"));
    els.modelSelect.replaceChildren();
    for (const model of state.models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = modelLabel(model);
      els.modelSelect.append(option);
    }
    // A catalog update never silently selects a different model in an open task.
    if (state.config?.model && !state.models.some((model) => model.id === state.config.model)) {
      els.modelSelect.add(new Option(`${state.config.model}（当前选择）`, state.config.model));
    }
    if (state.config?.model && [...els.modelSelect.options].some((option) => option.value === state.config.model)) {
      els.modelSelect.value = state.config.model;
    }
    $("#chatModelOptions").replaceChildren(...state.models.map((model) => new Option(model.id, model.id)));
  }

  function renderModelCatalog(catalog) {
    state.catalog = catalog;
    if (!state.config) return;
    if (state.config.provider === "jarodfund") populateModels(catalog.models);
    els.refreshChatModelsSettings.textContent = catalog.refreshing ? "正在同步…" : "刷新对话模型";
    els.chatModelHint.textContent = !state.config.connected ? "连接 Key 后自动获取可用模型。"
      : catalog.refreshing ? "正在后台同步 JarodFund 模型，当前会话可继续使用。"
      : catalog.error || (catalog.updatedAt ? `${catalog.models.length} 个对话模型 · 最近同步 ${new Date(catalog.updatedAt).toLocaleTimeString("zh-CN")} · 每次启动自动同步一次，也可手动刷新。` : "当前显示本地模型列表，启动时自动同步一次。无需重新输入 Key。");
    setBusy(state.streaming);
  }

  async function refreshChatModels(force = false) {
    try {
      const catalog = await window.piDesktop.getChatModels(force);
      renderModelCatalog(catalog);
      if (force) showToast(catalog.error || `已同步 ${catalog.models.length} 个对话模型`);
    } catch (error) { if (force) showToast(error.message); }
  }

  function syncConfig(config) {
    state.config = { ...state.config, ...config };
    if (Object.prototype.hasOwnProperty.call(config, "sessionFile")) state.sessionFile = config.sessionFile;
    const title = workspaceTitle(state.config.cwd);
    els.toolbarWorkspace.textContent = title;
    els.toolbarWorkspace.title = state.config.cwd;
    els.providerName.textContent = (state.config.provider || APP_NAME).toUpperCase();
    els.providerInput.value = state.config.provider || "jarodfund";
    els.modelInput.value = state.config.model || "gpt-5.6-sol";
    if ([...els.modelSelect.options].some((option) => option.value === state.config.model)) els.modelSelect.value = state.config.model;
    els.cwdInput.value = state.config.cwd || "";
    els.thinkingSelect.value = state.config.thinking || "max";
    const reasoning = window.jarodReasoning.describeReasoning(state.config.provider, state.config.model);
    els.thinkingSelect.querySelector('[value="off"]').textContent = reasoning.offLabel;
    els.thinkingSelect.title = reasoning.note;
    els.thinkingSelect.closest("label").title = reasoning.note || "选择推理强度";
    els.permissionSelect.replaceChildren();
    for (const mode of state.config.permissionModes || []) els.permissionSelect.add(new Option(mode.name, mode.id));
    els.permissionSelect.value = state.config.permissionMode;
    els.permissionHint.textContent = state.config.permissionModes?.find((mode) => mode.id === state.config.permissionMode)?.description || "";
    els.permissionHint.classList.toggle("is-full", state.config.permissionMode === "full");
    if (![...els.imageModelSelect.options].some((option) => option.value === state.config.imageModel)) els.imageModelSelect.add(new Option(state.config.imageModel, state.config.imageModel));
    els.imageModelSelect.value = state.config.imageModel;
    if (![...els.videoModelSelect.options].some((option) => option.value === state.config.videoModel)) els.videoModelSelect.add(new Option(state.config.videoModel, state.config.videoModel));
    els.videoModelSelect.value = state.config.videoModel;
    const sources = { saved: "Key 已加密记住", session: "Key 仅在本次运行有效", environment: "已使用本机配置的 Key", unreadable: "无法读取已保存的 Key，请重新连接", missing: "尚未连接 JarodFund" };
    els.apiStatusText.textContent = sources[state.config.credentialSource] || "尚未连接";
    els.apiStatusPill.textContent = state.config.connected ? "已配置" : "未连接";
    els.apiStatusPill.classList.toggle("is-error", !state.config.connected);
    els.logoutKeyButton.classList.toggle("hidden", !state.config.connected && state.config.credentialSource !== "unreadable");
    els.connectKeyButton.textContent = state.config.connected ? "验证并更换 Key" : "验证并连接";
    els.rememberKey.checked = state.config.credentialSource !== "session";
    renderAgents();
    setBusy(state.streaming);
  }

  function rowMenu(label, actions) {
    const menu = document.createElement("div");
    menu.className = "row-menu";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "icon-button row-menu-toggle";
    toggle.textContent = "⋯";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.className = "row-menu-panel";
    panel.setAttribute("popover", "auto");
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.danger) button.className = "is-danger";
      button.addEventListener("click", () => { panel.hidePopover(); action.run(); });
      panel.append(button);
    }
    toggle.addEventListener("click", () => {
      if (state.navigating || state.managingSession || state.keySaving || state.sending || state.stopping) return;
      if (panel.matches(":popover-open")) { panel.hidePopover(); return; }
      panel.showPopover();
      const anchor = toggle.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
      panel.style.top = `${Math.max(8, anchor.bottom + bounds.height + 4 < window.innerHeight ? anchor.bottom + 4 : anchor.top - bounds.height - 4)}px`;
    });
    panel.addEventListener("toggle", (event) => {
      toggle.setAttribute("aria-expanded", String(event.newState === "open"));
      if (event.newState === "closed") scheduleLibraryRefresh();
    });
    menu.addEventListener("keydown", (event) => {
      if (Object.entries(DEFAULT_EDITOR_KEYBINDINGS.menuDismiss).every(([key, value]) => event[key] === value)) {
        event.preventDefault(); event.stopPropagation(); panel.hidePopover(); toggle.focus();
      }
    });
    menu.append(toggle, panel);
    return menu;
  }

  function renderLibrary(library) {
    // A task completion or another view can refresh history while the user is
    // choosing an action. Keep its menu mounted, then refresh after dismissal.
    if (document.querySelector(".row-menu-panel:popover-open")) return;
    if (JSON.stringify(state.library) === JSON.stringify(library)) return;
    const focusedRow = document.activeElement?.matches(".row-menu-toggle") && document.activeElement.closest(".workspace-row, .session-row");
    const focusedKey = focusedRow && (focusedRow.dataset.sessionPath || focusedRow.dataset.workspaceId);
    state.library = library;
    els.workspaceList.replaceChildren();
    for (const workspace of library.workspaces) {
      const row = document.createElement("div");
      row.className = `workspace-row${workspace.active ? " is-active" : ""}${workspace.missing ? " is-missing" : ""}`;
      row.dataset.workspaceId = workspace.id;
      const button = document.createElement("button");
      button.className = "workspace-card";
      button.title = workspace.cwd;
      button.setAttribute("aria-current", String(workspace.active));
      const folder = document.createElement("span");
      folder.className = "folder-shape";
      folder.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "workspace-copy";
      const name = document.createElement("strong");
      name.textContent = workspace.name;
      const location = document.createElement("small");
      location.textContent = workspace.missing ? "目录不可用" : shortPath(workspace.cwd);
      copy.append(name, location);
      button.append(folder, copy);
      button.addEventListener("click", () => { if (!workspace.active) navigate(() => window.piDesktop.switchWorkspace(workspace.id)); });
      row.append(button);
      if (!workspace.active) row.append(rowMenu("工作区操作", [{ label: "移出工作区列表", run: () => updateLibrary(() => window.piDesktop.removeWorkspace(workspace.id)) }]));
      els.workspaceList.append(row);
    }
    renderSessions();
    if (focusedKey) for (const row of document.querySelectorAll(".workspace-row, .session-row")) {
      if ((row.dataset.sessionPath || row.dataset.workspaceId) === focusedKey) row.querySelector(".row-menu-toggle")?.focus({ preventScroll: true });
    }
    setBusy(state.streaming);
  }

  function renderSessions() {
    const query = els.sessionSearch.value.trim().toLocaleLowerCase();
    const visible = state.library.sessions.filter((session) => Boolean(session.archived) === state.archivedSessions);
    const sessions = visible.filter((session) => `${session.title} ${session.cwd}`.toLocaleLowerCase().includes(query));
    els.sessionCount.textContent = String(visible.length);
    els.sessionList.setAttribute("aria-label", state.archivedSessions ? "已归档会话" : "全部会话");
    els.sessionList.replaceChildren();
    for (const session of sessions.slice(0, state.sessionLimit)) {
      const row = document.createElement("div");
      row.className = `session-row${session.active ? " is-active" : ""}`;
      row.dataset.sessionPath = session.path;
      const button = document.createElement("button");
      button.className = "session-open";
      button.title = `${session.title}\n${session.cwd}`;
      button.setAttribute("aria-current", String(session.active));
      const name = document.createElement("strong");
      name.textContent = session.title.replace(/\s+/g, " ");
      const time = document.createElement("time");
      time.dateTime = new Date(session.modified).toISOString();
      time.textContent = session.waitingApproval ? "等待批准" : session.waitingInput ? "等待你的回答" : session.running ? "任务进行中" : session.draft ? "未发送草稿" : session.status === "failed" ? "任务未完成" : new Date(session.modified).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      time.dataset.status = session.waitingApproval || session.waitingInput ? "waiting" : session.running ? "running" : session.status || "";
      const workspace = document.createElement("small");
      workspace.className = "session-workspace";
      workspace.textContent = workspaceTitle(session.cwd);
      workspace.title = session.cwd;
      button.append(name, workspace, time);
      button.addEventListener("click", () => { if (!session.active) navigate(() => window.piDesktop.openSession(session.path)); });
      row.append(button, rowMenu("会话操作", [
        { label: "重命名对话", run: () => {
          state.renamePath = session.path;
          els.sessionNameInput.value = session.title.slice(0, 120);
          els.renameDialog.showModal();
          els.sessionNameInput.select();
        } },
        { label: session.archived ? "恢复会话" : "归档会话", run: () => manageSession(session, session.archived ? "restore" : "archive") },
        { label: "删除会话", danger: true, run: () => manageSession(session, "delete") },
      ]));
      els.sessionList.append(row);
    }
    els.historyEmpty.classList.toggle("hidden", sessions.length > 0);
    $("#moreSessions").classList.toggle("hidden", sessions.length <= state.sessionLimit);
    els.historyEmpty.textContent = query ? "没有匹配的对话" : state.archivedSessions ? "暂无已归档会话" : "还没有对话，选择工作区后开始新对话";
    setBusy(state.streaming);
  }

  async function refreshLibrary() {
    clearTimeout(state.libraryTimer);
    const request = ++state.libraryRequest;
    try {
      const library = await window.piDesktop.getLibrary();
      if (request === state.libraryRequest) renderLibrary(library);
    } catch (error) {
      if (request === state.libraryRequest) { els.historyEmpty.classList.remove("hidden"); els.historyEmpty.textContent = "历史记录读取失败"; showToast(error.message); }
    }
  }

  function scheduleLibraryRefresh() {
    clearTimeout(state.libraryTimer);
    if (!state.navigating) state.libraryTimer = setTimeout(refreshLibrary, 50);
  }

  async function navigate(action) {
    if (state.navigating || state.keySaving || state.importingImages || state.sending || state.stopping || state.managingSession) return;
    state.agentChoice++;
    state.navigating = true;
    clearTimeout(state.libraryTimer);
    state.libraryRequest++;
    setBusy(state.streaming);
    try {
      await window.piDesktop.saveDraft({ sessionFile: state.sessionFile, message: els.promptInput.value, attachments: state.attachments.map(({ id, kind }) => ({ id, kind })), mode: els.followUpMode.value });
      const config = await action();
      if (config?.openedWindow) { showToast("已打开独立窗口，原会话保持运行。"); return; }
      if (config?.openedView) return;
      if (!config) { await refreshLibrary(); return; }
      syncConfig(config);
      // The active view should become interactive as soon as the target
      // context is known. History, task transcripts and model catalogs are
      // refreshed in the background and must never hold the navigation lock.
      await refreshState({ fast: true });
      void restoreDraft().catch((error) => showToast(error.message));
      setConnection("online");
      void refreshState().catch((error) => showToast(error.message || "后台加载会话详情失败"));
    } catch (error) {
      showToast(error.message || "切换失败，原对话已保留。");
      if (!state.streaming) {
        syncConfig(await window.piDesktop.getConfig());
        await refreshState().catch(() => {});
      }
    } finally {
      state.navigating = false;
      setBusy(state.task?.status === "running");
    }
  }

  async function restoreDraft(preserveInput = false) {
    const draft = await window.piDesktop.getDraft();
    if (!preserveInput || !els.promptInput.value) els.promptInput.value = draft.message;
    els.followUpMode.value = draft.mode;
    state.attachments = draft.attachments;
    renderAttachments();
  }

  async function updateLibrary(action) {
    if (state.navigating || state.keySaving || state.managingSession) return;
    state.navigating = true;
    setBusy(state.streaming);
    try { renderLibrary(await action()); }
    catch (error) { showToast(error.message); }
    finally { state.navigating = false; setBusy(state.streaming); }
  }

  async function manageSession(session, operation) {
    if (state.managingSession || state.navigating || state.keySaving || state.sending || state.stopping) return;
    state.managingSession = true;
    setBusy(state.streaming);
    try {
      if (session.active) await window.piDesktop.saveDraft({ sessionFile: state.sessionFile, message: els.promptInput.value, attachments: state.attachments.map(({ id, kind }) => ({ id, kind })), mode: els.followUpMode.value });
      const actions = { archive: window.piDesktop.archiveSession, restore: window.piDesktop.restoreSession, delete: window.piDesktop.deleteSession };
      const result = await actions[operation](session.path);
      if (!result.cancelled) showToast({ archive: "会话已归档，可在“已归档”中查看或恢复。", restore: "会话已恢复到全部会话。", delete: "会话已永久删除。" }[operation]);
    } catch (error) { showToast(error.message); }
    finally {
      await refreshLibrary();
      state.managingSession = false;
      setBusy(state.task?.status === "running");
    }
  }

  async function command(payload) {
    try {
      return await window.piDesktop.command(payload);
    } catch (error) {
      showToast(error.message || `${APP_NAME}命令失败`);
      throw error;
    }
  }

  async function refreshState({ fast = false } = {}) {
    const requestVersion = ++state.historyRequestVersion;
    if (fast) {
      // Fast view changes use data already owned by the desktop process. Do
      // not wait for RPC history parsing, model discovery or task indexing.
      // The history worker will notify us through app:history-ready later.
      await window.piDesktop.start();
      if (requestVersion !== state.historyRequestVersion) return;
      const file = state.sessionFile || state.config?.sessionFile;
      const cachedMessages = file ? state.historyBySession.get(file) : undefined;
      const cachedTasks = file ? state.taskHistoryBySession.get(file) || [] : [];
      if (file && cachedMessages) await renderStoredMessages(cachedMessages, cachedTasks, requestVersion);
      else if (!file) await renderStoredMessages([], [], requestVersion);
      const [task, permissions, videos] = await Promise.all([
        window.piDesktop.getTask(),
        window.piDesktop.getPermissions(),
        window.piDesktop.getVideoTasks(),
      ]);
      if (requestVersion !== state.historyRequestVersion) return;
      state.task = null;
      handleTask(task);
      for (const video of videos) renderVideoTask(video);
      renderPermissions(permissions);
      void refreshLibrary();
      return;
    }
    // Finish startup before reading local task/history snapshots as well as RPC
    // state, so every part of the screen describes the same restored session.
    await window.piDesktop.start();
    const [stateResponse, modelsResponse, messagesResponse, levelsResponse, tasks, currentTask, commandsResponse, videos, queueResponse] = await Promise.all([
      command({ type: "get_state" }),
      fast ? Promise.resolve(null) : command({ type: "get_available_models" }),
      command({ type: "get_history", fast }),
      fast ? Promise.resolve(null) : command({ type: "get_available_thinking_levels" }),
      window.piDesktop.getTaskHistory(),
      window.piDesktop.getTask(),
      fast ? Promise.resolve(null) : command({ type: "get_commands" }),
      window.piDesktop.getVideoTasks(),
      fast ? Promise.resolve(null) : command({ type: "get_queue" }),
    ]);
    if (requestVersion !== state.historyRequestVersion) return;
    if (commandsResponse) {
      state.commands = commandsResponse.data.commands;
      syncConfig({ specialists: commandsResponse.data.specialists });
    }
    const sessionState = stateResponse.data;
    state.sessionFile = sessionState.sessionFile;
    const provider = sessionState.model?.provider || state.config.provider;
    syncConfig({ provider, model: sessionState.model?.id || state.config.model, thinking: sessionState.thinkingLevel, ...(commandsResponse ? { selectedAgent: commandsResponse.data.selectedAgent || "" } : {}) });
    if (!fast) {
      if (state.config.provider === "jarodfund") renderModelCatalog(await window.piDesktop.getChatModels());
      else populateModels(modelsResponse.data.models || []);
      for (const option of els.thinkingSelect.options) {
        option.disabled = !levelsResponse.data.levels.includes(option.value);
        option.hidden = option.disabled;
      }
    }
    const historyMessages = messagesResponse.data.pending
      ? state.historyBySession.get(state.sessionFile) || []
      : messagesResponse.data.messages || [];
    if (!messagesResponse.data.pending) state.historyBySession.set(state.sessionFile, historyMessages);
    state.taskHistoryBySession.set(state.sessionFile, tasks);
    state.pendingHistory = messagesResponse.data.pending ? { sessionFile: state.sessionFile, messages: historyMessages, tasks } : null;
    if (!state.streaming || fast) await renderStoredMessages(historyMessages, tasks, requestVersion);
    for (const video of videos) renderVideoTask(video);
    state.task = null;
    handleTask(currentTask);
    els.chatPanel.scrollTop = els.chatPanel.scrollHeight;
    state.followOutput = true;
    state.lastScrollTop = els.chatPanel.scrollTop;
    els.followOutputButton.classList.add("hidden");
    renderPermissions(await window.piDesktop.getPermissions());
    if (queueResponse) renderQueue(queueResponse.data);
    await refreshLibrary();
  }

  async function reconnect() {
    if (state.reconnecting || state.navigating || state.keySaving || state.importingImages || state.selectingAgent) return;
    if (!state.config.connected && state.config.provider === "jarodfund") { openSettings(); els.apiKeyInput.focus(); return; }
    state.reconnecting = true;
    state.navigating = true;
    setConnection("connecting", "正在恢复连接");
    try {
      syncConfig(await window.piDesktop.reconnect());
      await refreshState({ fast: true });
      setConnection("online");
      void refreshState().catch((error) => showToast(error.message || "后台加载会话详情失败"));
      showToast("连接已恢复，可以继续当前对话。");
    } catch (error) {
      setConnection("error", error.message);
      showToast(error.message || "恢复失败，可再次点击恢复连接。");
    } finally {
      state.reconnecting = false;
      state.navigating = false;
      setBusy(state.task?.status === "running");
    }
  }

  function hideCommandMenu() {
    els.commandMenu.classList.add("hidden");
    els.promptInput.setAttribute("aria-expanded", "false");
    els.promptInput.removeAttribute("aria-activedescendant");
  }

  function renderCommandMenu() {
    const query = els.promptInput.value.match(/^\/([^\s]*)$/);
    if (!query || state.streaming || state.navigating || state.keySaving || state.composing) { hideCommandMenu(); return; }
    state.commandMatches = state.commands.filter((item) => item.name.toLowerCase().includes(query[1].toLowerCase()));
    state.commandIndex = Math.min(state.commandIndex, Math.max(0, state.commandMatches.length - 1));
    els.commandMenu.replaceChildren();
    for (const [index, item] of state.commandMatches.entries()) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "command-option";
      option.id = `command-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === state.commandIndex));
      const name = document.createElement("strong");
      name.textContent = `/${item.name}`;
      const description = document.createElement("span");
      description.textContent = item.description || item.source;
      option.append(name, description);
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => completeCommand(index));
      els.commandMenu.append(option);
    }
    if (!state.commandMatches.length) {
      const empty = document.createElement("p");
      empty.className = "command-empty";
      empty.textContent = "没有匹配的命令";
      els.commandMenu.append(empty);
    }
    els.commandMenu.classList.remove("hidden");
    els.promptInput.setAttribute("aria-expanded", "true");
    const selected = els.commandMenu.querySelector('[aria-selected="true"]');
    if (selected) {
      els.promptInput.setAttribute("aria-activedescendant", selected.id);
      // Scroll only the menu, not its ancestors or the whole window.
      const top = selected.offsetTop;
      const bottom = top + selected.offsetHeight;
      if (top < els.commandMenu.scrollTop) els.commandMenu.scrollTop = top;
      else if (bottom > els.commandMenu.scrollTop + els.commandMenu.clientHeight) {
        els.commandMenu.scrollTop = bottom - els.commandMenu.clientHeight;
      }
    } else els.promptInput.removeAttribute("aria-activedescendant");
  }

  function completeCommand(index) {
    const item = state.commandMatches[index];
    if (!item) return;
    els.promptInput.value = `/${item.name}${item.argumentHint || item.source !== "desktop" ? " " : ""}`;
    hideCommandMenu();
    els.promptInput.focus();
  }

  async function sendPrompt() {
    const text = els.promptInput.value.trim();
    if (!text && !state.attachments.length || state.sending || state.stopping || state.keySaving || state.navigating || state.importingImages || state.selectingAgent) return;
    if (state.streaming && text.startsWith("/")) { showToast("运行中可追加普通消息；斜杠命令请在任务结束后执行。"); return; }
    if (text.startsWith("/") && state.attachments.length) { showToast("文件请与普通消息一起发送，不能附加到斜杠命令。"); return; }
    const slash = text.match(/^\/([^\s]+)(?:\s+[\s\S]*)?$/);
    if (text === "/") { renderCommandMenu(); return; }
    const nativePrompt = slash && state.commands.some((item) => item.name === slash[1] && ["prompt", "skill"].includes(item.source));
    if (slash && !nativePrompt) {
      let select;
      els.promptInput.value = "";
      state.navigating = true;
      setBusy(false);
      try {
        const response = await window.piDesktop.slash(text);
        const slashName = slash[1].toLowerCase();
        if (response.data?.select) {
          select = response.data.select === "model" ? els.modelSelect : els.thinkingSelect;
        } else if (slashName === "reload") {
          showToast(`已重新加载${APP_NAME}的扩展、技能和提示配置`);
          await refreshState();
        } else if (slashName === "new") {
          syncConfig(await window.piDesktop.getConfig());
          await refreshState();
          showToast(response.data.cancelled ? "已取消新建对话" : "已开始新对话");
        } else if (["model", "thinking"].includes(slashName)) {
          syncConfig(await window.piDesktop.getConfig());
          await refreshState();
          showToast(slashName === "model" ? "模型已切换" : "推理强度已更新");
        } else if (slashName === "name") {
          await refreshLibrary();
          showToast("对话名称已更新");
        } else if (slashName === "copy") {
          showToast(`已复制最近一条${APP_NAME}回复`);
        } else if (slashName === "session") {
          const info = response.data;
          els.commandResult.textContent = [
            `会话：${info.sessionId}`,
            `用户消息：${info.userMessages}    ${APP_NAME}回复：${info.assistantMessages}`,
            `工具调用：${info.toolCalls}    总消息：${info.totalMessages}`,
            `Token：${info.tokens.total.toLocaleString()}（输入 ${info.tokens.input.toLocaleString()} / 输出 ${info.tokens.output.toLocaleString()}）`,
            `文件：${info.sessionFile || "尚未保存"}`,
          ].join("\n\n");
          els.commandDialog.showModal();
        } else if (slashName === "commands") {
          state.commands = response.data.commands;
          els.promptInput.value = "/";
        } else if (slashName === "compact") {
          await refreshState();
          showToast("会话上下文已压缩");
        } else if (slashName !== "settings" && state.task?.status !== "running") {
          syncConfig(await window.piDesktop.getConfig());
          await refreshState();
        }
      } catch (error) {
        els.promptInput.value = text;
        showToast(error.message || "斜杠命令执行失败");
      } finally {
        state.navigating = false;
        setBusy(state.task?.status === "running");
        select?.focus();
        if (els.promptInput.value === "/") { els.promptInput.focus(); renderCommandMenu(); }
      }
      return;
    }
    if (state.config?.provider === "jarodfund" && !state.config.connected) { openSettings(); els.apiKeyInput.focus(); return; }
    if (state.attachments.some((item) => item.kind !== "file") && !state.models.find((model) => model.id === state.config.model)?.input?.includes("image")) {
      showToast("当前聊天模型未声明支持图片，请先选择支持看图的模型。"); return;
    }
    const images = state.attachments;
    els.promptInput.value = "";
    state.attachments = [];
    renderAttachments();
    state.sending = true;
    // Native message_start is authoritative, including messages consumed from
    // either queue. Do not reset the assistant that is still streaming.
    if (!state.streaming) { state.currentAssistant = null; state.currentThinking = null; }
    setBusy(state.streaming);
    try {
      await command({ type: "prompt", message: text, streamingBehavior: els.followUpMode.value, attachmentIds: images.filter((item) => item.kind !== "file").map((image) => image.id), fileIds: images.filter((item) => item.kind === "file").map((file) => file.id) });
    } catch {
      els.promptInput.value = [text, els.promptInput.value].filter(Boolean).join("\n\n");
      state.attachments = [...images, ...state.attachments];
      renderAttachments();
      handleTask(await window.piDesktop.getTask());
    } finally {
      state.sending = false;
      setBusy(state.task?.status === "running");
    }
  }

  async function startNewSession() {
    await navigate(async () => {
      const response = await command({ type: "new_session" });
      if (response.data.openedWindow || response.data.openedView) return response.data;
      return response.data.cancelled ? null : window.piDesktop.getConfig();
    });
  }

  async function chooseDirectory(targetInput) {
    const directory = await window.piDesktop.chooseDirectory();
    if (directory) targetInput.value = directory;
  }

  function openSettings() {
    state.imagePreferencesDraft = structuredClone(state.config.imagePreferences || {});
    els.imageModelSelect.value = state.config.imageModel;
    renderImageOptions();
    els.settingsDialog.showModal();
    els.settingsDialog.scrollTop = 0;
    void refreshChatModels();
    void refreshImageModels();
    state.videoPreferencesDraft = structuredClone(state.config.videoPreferences || {});
    els.videoModelSelect.value = state.config.videoModel;
    renderVideoOptions();
    void refreshVideoModels();
  }

  async function saveSettings(event) {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    if (state.streaming || state.navigating || state.keySaving) return;
    state.navigating = true;
    setBusy(false);
    try {
      if (state.imageOptionsModel) state.imagePreferencesDraft[state.imageOptionsModel] = readImageOptions();
      if (state.videoOptionsModel) state.videoPreferencesDraft[state.videoOptionsModel] = readVideoOptions();
      const previous = state.config;
      const updated = await window.piDesktop.saveSettings({
        provider: els.providerInput.value,
        model: els.modelInput.value,
        cwd: els.cwdInput.value,
        thinking: els.thinkingSelect.value,
        imageModel: els.imageModelSelect.value,
        imagePreferences: state.imagePreferencesDraft,
        videoModel: els.videoModelSelect.value,
        videoPreferences: state.videoPreferencesDraft,
      });
      syncConfig(updated);
      if (["provider", "model", "thinking", "cwd"].some((field) => previous[field] !== updated[field])) await refreshState();
      els.settingsDialog.close();
      showToast("设置已保存，当前对话下一次请求即可使用。");
    } catch (error) {
      showToast(error.message || "设置保存失败");
    } finally {
      state.navigating = false;
      setBusy(state.task?.status === "running");
    }
  }

  async function connectKey() {
    if (state.streaming || state.keySaving || state.navigating) return;
    const key = els.apiKeyInput.value.trim();
    if (!key) { els.keyFeedback.textContent = "请输入 API Key。"; els.apiKeyInput.focus(); return; }
    state.keySaving = true;
    setBusy(false);
    els.sendButton.disabled = true;
    els.apiKeyInput.disabled = true;
    els.keyFeedback.classList.remove("is-error");
    els.keyFeedback.textContent = "正在验证账户和模型列表…";
    els.connectKeyButton.textContent = "连接中…";
    try {
      const result = await window.piDesktop.saveKey(key, els.rememberKey.checked);
      els.apiKeyInput.value = "";
      els.apiKeyInput.type = "password";
      els.showKey.checked = false;
      syncConfig(result.config);
      state.imagePreferencesDraft = structuredClone(state.config.imagePreferences || {});
      renderImageOptions();
      void refreshImageModels();
      state.videoPreferencesDraft = structuredClone(state.config.videoPreferences || {});
      renderVideoOptions();
      void refreshVideoModels();
      await refreshState();
      setConnection("online");
      els.keyFeedback.textContent = `已连接 JarodFund，${result.modelCount} 个可用模型。`;
    } catch (error) {
      els.keyFeedback.classList.add("is-error");
      els.keyFeedback.textContent = error.message || "连接失败，请稍后重试。";
    } finally {
      state.keySaving = false;
      els.apiKeyInput.disabled = false;
      els.sendButton.disabled = false;
      els.connectKeyButton.textContent = state.config?.connected ? "验证并更换 Key" : "验证并连接";
      setBusy(state.task?.status === "running");
    }
  }

  async function logoutKey() {
    if (state.streaming || state.keySaving || state.navigating) return;
    state.keySaving = true;
    setBusy(false);
    els.apiKeyInput.disabled = true;
    try {
      const config = await window.piDesktop.logoutKey();
      syncConfig(config);
      els.apiKeyInput.value = "";
      els.apiKeyInput.type = "password";
      els.showKey.checked = false;
      await renderStoredMessages([]);
      state.sessionFile = null;
      state.attachments = [];
      renderAttachments();
      handleTask(null);
      setConnection("signed-out", "未连接账户");
      els.connectionDetail.textContent = "尚未连接 JarodFund";
      els.keyFeedback.classList.remove("is-error");
      els.keyFeedback.textContent = "已退出，已清除记住的 Key。";
    } catch (error) {
      els.keyFeedback.classList.add("is-error");
      els.keyFeedback.textContent = error.message || "退出失败，请重试。";
    } finally {
      state.keySaving = false;
      els.apiKeyInput.disabled = false;
      setBusy(state.task?.status === "running");
      els.apiKeyInput.focus();
    }
  }

  function renderImageResult(message) {
    const images = (message.content || []).filter((part) => part.type === "image");
    if (message.toolName !== "image_gen" && !images.length) return;
    const details = message.details;
    const text = message.isError ? (message.content || []).filter((part) => part.type === "text").map((part) => part.text).join("\n")
      : details?.imageGeneration ? `${details.partial ? "部分图片已保存" : "图片已生成"} · ${details.model} · ${details.files.length} 张${details.warnings?.length ? `\n${details.warnings.join("\n")}` : ""}` : "图片";
    const node = messageNode("assistant", text);
    node.wrapper.classList.add("image-result");
    appendImages(node, images, details?.files);
    showChat();
  }

  function renderToolActivity(id, name, result, isError = false) {
    if (!id || ["image_gen", "video_gen"].includes(name)) return;
    let activity = state.toolActivities.get(id);
    if (!activity) {
      const details = document.createElement("details");
      details.className = "tool-activity";
      const summary = document.createElement("summary");
      const output = document.createElement("pre");
      details.append(summary, output);
      els.messages.append(details);
      activity = { details, summary, output, name, finished: false };
      state.toolActivities.set(id, activity);
    }
    activity.summary.textContent = `${name} · ${result ? isError ? "执行失败" : "已完成" : "执行中"}`;
    activity.finished = Boolean(result);
    activity.details.classList.toggle("is-error", Boolean(isError));
    const text = (Array.isArray(result?.content) ? result.content : []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
    activity.output.textContent = result ? text.slice(0, 4000) + (text.length > 4000 ? "\n…（仅显示前 4,000 字符）" : "") || "工具执行完成。" : "正在执行，结果会显示在这里。";
  }

  function handleEvent(event) {
    if (!event || typeof event !== "object") return;
    if (state.renderingHistory) { state.historyEvents.push(event); return; }
    if (event.type === "queue_update") { renderQueue(event); return; }
    if (event.type === "desktop_queue_returned") { void restoreQueue(event).catch((error) => showToast(error.message)); return; }
    if (event.type === "extension_error") { showToast(event.error); return; }
    if (event.type === "extension_ui_request" && event.method === "notify") { showToast(event.message); return; }
    if (event.type === "tool_execution_start" && event.toolName === "image_gen") { setBusy(true, "正在生成图片…"); return; }
    if (event.type === "tool_execution_start" && event.toolName === "video_gen") { setBusy(true, "正在处理视频任务…"); return; }
    if (event.type === "tool_execution_start") {
      renderToolActivity(event.toolCallId, event.toolName);
      setBusy(true, `${APP_NAME}正在使用工具：${event.toolName}`);
      return;
    }
    if (event.type === "tool_execution_end") {
      renderToolActivity(event.toolCallId, event.toolName, event.result, event.isError);
      return;
    }
    if (event.type === "agent_start") {
      setBusy(true);
      return;
    }
    if (event.type === "auto_retry_start" || event.type === "summarization_retry_scheduled") {
      setBusy(true);
      return;
    }
    if (event.type === "message_start") {
      flushStream();
      if (event.message?.role === "user") {
        renderUserMessage(event.message);
        if (state.followOutput && !state.scrollingPointer) scrollLatest();
      } else if (event.message?.role === "assistant") {
        state.currentAssistant = messageNode("assistant");
        state.currentThinking = null;
      }
      return;
    }
    if (event.type === "message_update") {
      const delta = event.assistantMessageEvent;
      if (delta?.type === "text_delta") addAssistantText(delta.delta || "");
      if (delta?.type === "thinking_delta") addThinkingText(delta.delta || "");
      if (delta?.type === "toolcall_start") {
        setBusy(true, `${APP_NAME}正在使用工具：${delta.toolName || "工作区"}`);
      }
      return;
    }
    if (event.type === "message_end") {
      flushStream();
      if (event.message?.role === "toolResult") {
        if (event.message.details?.videoGeneration) renderVideoTask(event.message.details);
        else if (event.message.toolName === "video_gen" && event.message.isError) messageNode("assistant", event.message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"));
        renderImageResult(event.message); return;
      }
      if (event.message?.role === "assistant" && event.message.stopReason === "error") {
        // Pi discards failed attempts before continuing. Mirror that in the UI.
        state.currentAssistant?.wrapper.remove();
        state.currentThinking?.wrapper.remove();
        state.currentAssistant = null;
        state.currentThinking = null;
      } else if (event.message?.role === "assistant") {
        const text = (event.message.content || []).filter((part) => part.type === "text").map((part) => part.text).join("");
        if (text) {
          const content = ensureAssistantMessage().content;
          const rendered = content.textContent;
          if (text.startsWith(rendered)) {
            if (text.length > rendered.length) content.append(document.createTextNode(text.slice(rendered.length)));
          }
          else if (rendered !== text) content.textContent = text;
          const scrollTop = els.chatPanel.scrollTop;
          const selection = window.getSelection();
          const selecting = selection && !selection.isCollapsed &&
            (els.messages.contains(selection.anchorNode) || els.messages.contains(selection.focusNode));
          window.piMessageFormat.render(content);
          if (state.followOutput && !selecting && !state.scrollingPointer) scrollLatest();
          else els.chatPanel.scrollTop = scrollTop;
        }
        else state.currentAssistant?.wrapper.remove();
      }
      return;
    }
    if (event.type === "agent_settled") {
      flushStream();
      state.currentAssistant = null;
      state.currentThinking = null;
    }
  }

  function handleStatus(status) {
    if (status.type === "started" || status.type === "online") setConnection("online", status.message);
    else if (status.type === "connecting") setConnection("connecting", status.message);
    else if (status.type === "error") {
      if (state.interaction) {
        state.interaction = null;
        els.interactionDialog.close();
      }
      setConnection("error", status.message);
      showToast(status.message || `${APP_NAME}连接失败`);
      if (!state.task || state.task.status !== "running") setBusy(false);
    } else if (status.type === "warning") showToast(status.message);
    else if (status.type === "stderr") {
      return;
    }
  }

  function closeInteraction(response) {
    const interaction = state.interaction;
    if (!interaction) return;
    state.interaction = null;
    if (els.interactionDialog.open) els.interactionDialog.close();
    void window.piDesktop.respondUi({ id: interaction.id, ...response });
  }

  function openInteraction(request) {
    if (state.interaction) closeInteraction({ cancelled: true });
    state.interaction = request;
    els.interactionTitle.textContent = request.title || "需要你的输入";
    els.interactionOptions.replaceChildren();
    els.interactionText.classList.toggle("hidden", !["input", "editor"].includes(request.method));
    els.interactionText.value = request.prefill || "";
    els.interactionText.placeholder = request.placeholder || "输入你的回答";
    if (request.method === "select") {
      els.interactionText.classList.add("hidden");
      for (const [index, option] of (request.options || []).entries()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "interaction-option";
        button.textContent = option;
        button.addEventListener("click", () => closeInteraction({ value: option }));
        els.interactionOptions.append(button);
      }
    }
    els.interactionDialog.showModal();
    if (request.method !== "select") els.interactionText.focus();
  }

  function renderPermissions(requests) {
    els.permissionRequests.replaceChildren();
    els.permissionRequests.classList.toggle("hidden", !requests.length);
    for (const request of requests) {
      const card = document.createElement("article");
      card.className = "permission-request";
      card.dataset.requestId = request.id;
      const title = document.createElement("strong");
      title.textContent = `需要批准 · ${request.toolName}`;
      const reason = document.createElement("p");
      reason.textContent = `${request.reason}\n工作区：${request.cwd}`;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "查看本次操作";
      const args = document.createElement("pre");
      args.textContent = request.arguments;
      details.append(summary, args);
      card.append(title, reason, details);
      for (const [label, allowed] of [["允许这一次", true], ["拒绝", false]]) {
        const button = document.createElement("button");
        button.className = `button ${allowed ? "button-primary" : "button-outline"}`;
        button.textContent = label;
        button.dataset.allowed = String(allowed);
        button.addEventListener("click", async () => {
          button.disabled = true;
          try { await window.piDesktop.respondPermission(request.id, allowed); }
          catch (error) { button.disabled = false; showToast(error.message); }
        });
        card.append(button);
      }
      els.permissionRequests.append(card);
    }
  }

  els.sendButton.addEventListener("click", sendPrompt);
  els.reconnectButton.addEventListener("click", reconnect);
  for (const button of [els.refreshChatModels, els.refreshChatModelsSettings]) button.addEventListener("click", () => { void refreshChatModels(true); });
  els.attachButton.addEventListener("click", () => { void addLocalFiles(); });
  els.agentsToggle.addEventListener("click", () => {
    const open = !document.body.classList.contains("agents-open");
    toggleAgents(open);
    if (open) els.agentSearch.focus();
  });
  $("#agentsClose").addEventListener("click", () => { toggleAgents(false); els.agentsToggle.focus(); });
  els.clearAgent.addEventListener("click", () => selectAgent(""));
  $("#agentsBackdrop").addEventListener("click", () => { toggleAgents(false); els.agentsToggle.focus(); });
  els.agentSearch.addEventListener("input", filterAgents);
  $("#clearAgentSearch").addEventListener("click", () => { els.agentSearch.value = ""; filterAgents(); els.agentSearch.focus(); });
  compactAgents.addEventListener("change", () => {
    const open = !compactAgents.matches && document.body.classList.contains("agents-open");
    const focused = $("#agentsPanel").contains(document.activeElement);
    toggleAgents(open);
    if (!open && focused) els.agentsToggle.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("agents-open") || document.querySelector("dialog[open]")) return;
    const matches = (name) => Object.entries(DEFAULT_EDITOR_KEYBINDINGS[name]).every(([key, value]) => event[key] === value);
    if (matches("panelDismiss") && (compactAgents.matches || $("#agentsPanel").contains(document.activeElement))) {
      event.preventDefault(); toggleAgents(false); els.agentsToggle.focus(); return;
    }
    if (!compactAgents.matches || !matches("focusNext") && !matches("focusPrevious")) return;
    const controls = [...$("#agentsPanel").querySelectorAll("button:not(:disabled), input:not(:disabled)")].filter((node) => node.getClientRects().length);
    if (matches("focusPrevious") && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
    else if (matches("focusNext") && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
  });
  toggleAgents(!compactAgents.matches);
  for (const link of document.querySelectorAll(".settings-nav a")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const section = $(link.getAttribute("href"));
      section.scrollIntoView({ block: "start" });
      section.querySelector("input, select")?.focus({ preventScroll: true });
    });
  }
  els.imageInput.addEventListener("change", () => { void importImages([...els.imageInput.files]); els.imageInput.value = ""; });
  els.promptInput.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.files || [])];
    if (files.length) { event.preventDefault(); void importImages(files); }
  });
  $("#composer").addEventListener("dragover", (event) => { event.preventDefault(); $("#composer").classList.add("is-dragging"); });
  $("#composer").addEventListener("dragleave", () => $("#composer").classList.remove("is-dragging"));
  $("#composer").addEventListener("drop", (event) => { event.preventDefault(); $("#composer").classList.remove("is-dragging"); void addLocalFiles([...event.dataTransfer.files]); });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => event.preventDefault());
  els.refreshImageModels.addEventListener("click", () => { void refreshImageModels(true); });
  els.refreshVideoModels.addEventListener("click", () => { void refreshVideoModels(true); });
  els.videoModelSelect.addEventListener("change", () => {
    if (state.videoOptionsModel) state.videoPreferencesDraft[state.videoOptionsModel] = readVideoOptions();
    renderVideoOptions();
  });
  els.imageModelSelect.addEventListener("change", () => {
    if (state.imageOptionsModel) state.imagePreferencesDraft[state.imageOptionsModel] = readImageOptions();
    renderImageOptions();
  });
  els.chatPanel.addEventListener("scroll", () => {
    const atBottom = els.chatPanel.scrollHeight - els.chatPanel.scrollTop - els.chatPanel.clientHeight <= 2;
    if (!state.scrollingPointer) {
      if (atBottom) { state.followOutput = true; els.followOutputButton.classList.add("hidden"); }
      else if (els.chatPanel.scrollTop < state.lastScrollTop) pauseFollowing();
    }
    state.lastScrollTop = els.chatPanel.scrollTop;
  }, { passive: true });
  els.chatPanel.addEventListener("wheel", (event) => { if (event.deltaY < 0) pauseFollowing(); }, { passive: true });
  els.chatPanel.addEventListener("pointerdown", () => { state.scrollingPointer = true; pauseFollowing(); });
  window.addEventListener("pointerup", () => { state.scrollingPointer = false; });
  window.addEventListener("pointercancel", () => { state.scrollingPointer = false; });
  els.chatPanel.addEventListener("keydown", (event) => {
    if (["readUp", "readPageUp", "readHome"].some((name) => Object.entries(DEFAULT_EDITOR_KEYBINDINGS[name]).every(([key, value]) => event[key] === value))) pauseFollowing();
  });
  els.followOutputButton.addEventListener("click", () => {
    state.followOutput = true;
    els.followOutputButton.classList.add("hidden");
    scrollLatest();
  });
  new ResizeObserver(() => {
    if (state.followOutput && !state.scrollingPointer && window.getSelection()?.isCollapsed) scrollLatest();
  }).observe(els.messages);
  els.permissionSelect.addEventListener("change", async () => {
    try { syncConfig(await window.piDesktop.setPermission(els.permissionSelect.value)); }
    catch (error) { els.permissionSelect.value = state.config.permissionMode; showToast(error.message); }
  });
  els.newWindowButton.addEventListener("click", () => navigate(() => window.piDesktop.newWindow()));
  els.takeBackQueue.addEventListener("click", async () => {
    state.sending = true;
    setBusy(state.streaming);
    try { await restoreQueue((await command({ type: "clear_queue" })).data); }
    catch { /* Keep the queue visible if clearing failed. */ }
    finally { state.sending = false; setBusy(state.task?.status === "running"); }
  });
  els.stopButton.addEventListener("click", async () => {
    state.stopping = true;
    setBusy(state.streaming);
    els.stopButton.disabled = true;
    try {
      const response = await command({ type: "abort" });
      await restoreQueue(response.data?.cleared);
    } catch {
      // command() already displays a toast
    } finally {
      state.stopping = false;
      setBusy(state.task?.status === "running");
      els.stopButton.disabled = false;
    }
  });
  els.interactionCancel.addEventListener("click", () => closeInteraction({ cancelled: true }));
  els.interactionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.interaction) closeInteraction({ value: els.interactionText.value });
  });
  els.interactionDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeInteraction({ cancelled: true }); });
  els.newSessionButton.addEventListener("click", startNewSession);
  els.addWorkspaceButton.addEventListener("click", () => navigate(() => window.piDesktop.addWorkspace()));
  els.sessionSearch.addEventListener("input", () => { state.sessionLimit = 100; renderSessions(); });
  $("#moreSessions").addEventListener("click", () => { state.sessionLimit += 100; renderSessions(); });
  new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting) && !$("#moreSessions").classList.contains("hidden")) { state.sessionLimit += 100; renderSessions(); }
  }, { root: $(".sidebar-content"), rootMargin: "120px" }).observe($("#moreSessions"));
  for (const button of els.sessionFilters.querySelectorAll("button")) button.addEventListener("click", () => {
    state.archivedSessions = button.dataset.archived === "true";
    for (const filter of els.sessionFilters.querySelectorAll("button")) filter.setAttribute("aria-pressed", String(filter === button));
    renderSessions();
  });
  $(".sidebar-content").addEventListener("wheel", () => {
    for (const panel of document.querySelectorAll(".row-menu-panel:popover-open")) panel.hidePopover();
  }, { passive: true });
  window.addEventListener("resize", () => {
    for (const panel of document.querySelectorAll(".row-menu-panel:popover-open")) panel.hidePopover();
  });
  els.renameForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    await updateLibrary(() => window.piDesktop.renameSession(state.renamePath, els.sessionNameInput.value));
    els.renameDialog.close();
  });
  els.dialogChooseDirectory.addEventListener("click", () => chooseDirectory(els.cwdInput));
  els.settingsButton.addEventListener("click", openSettings);
  els.settingsForm.addEventListener("submit", saveSettings);
  els.connectKeyButton.addEventListener("click", connectKey);
  els.logoutKeyButton.addEventListener("click", logoutKey);
  els.showKey.addEventListener("change", () => { els.apiKeyInput.type = els.showKey.checked ? "text" : "password"; });
  els.apiKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); connectKey(); }
  });
  els.settingsDialog.addEventListener("close", () => {
    els.apiKeyInput.value = "";
    els.apiKeyInput.type = "password";
    els.showKey.checked = false;
    els.keyFeedback.textContent = "";
  });
  els.modelSelect.addEventListener("change", async () => {
    try {
      const response = await command({ type: "set_model", provider: state.config.provider, modelId: els.modelSelect.value });
      syncConfig({ model: response.data.id });
      const levels = (await command({ type: "get_available_thinking_levels" })).data.levels;
      for (const option of els.thinkingSelect.options) { option.disabled = !levels.includes(option.value); option.hidden = option.disabled; }
      const session = (await command({ type: "get_state" })).data;
      syncConfig({ thinking: session.thinkingLevel });
      showToast(`已切换到 ${modelLabel(response.data)}`);
    } catch {
      els.modelSelect.value = state.config.model;
    }
  });
  els.thinkingSelect.addEventListener("change", async () => {
    try {
      await command({ type: "set_thinking_level", level: els.thinkingSelect.value });
      syncConfig({ thinking: (await command({ type: "get_state" })).data.thinkingLevel });
    } catch {
      els.thinkingSelect.value = state.config.thinking;
    }
  });
  document.querySelectorAll(".quick-action").forEach((button) => {
    button.addEventListener("click", () => {
      els.promptInput.value = button.dataset.prompt || "";
      els.promptInput.focus();
    });
  });
  els.promptInput.addEventListener("input", () => { state.commandIndex = 0; renderCommandMenu(); });
  els.promptInput.addEventListener("focus", renderCommandMenu);
  els.promptInput.addEventListener("blur", hideCommandMenu);
  els.promptInput.addEventListener("compositionstart", () => { state.composing = true; hideCommandMenu(); });
  els.promptInput.addEventListener("compositionend", () => { state.composing = false; renderCommandMenu(); });
  els.promptInput.addEventListener("keydown", (event) => {
    // IME confirmation must commit the text without submitting the prompt.
    if (state.composing || event.isComposing || event.keyCode === 229) return;
    const matches = (name) => Object.entries(DEFAULT_EDITOR_KEYBINDINGS[name]).every(([key, value]) => event[key] === value);
    if (!els.commandMenu.classList.contains("hidden")) {
      if (matches("commandDismiss")) { event.preventDefault(); hideCommandMenu(); return; }
      if (matches("commandNext") || matches("commandPrevious")) {
        event.preventDefault();
        const length = state.commandMatches.length;
        state.commandIndex = length ? (state.commandIndex + (matches("commandNext") ? 1 : -1) + length) % length : 0;
        renderCommandMenu();
        return;
      }
      const exact = state.commandMatches.some((item) => els.promptInput.value === `/${item.name}`);
      if (matches("commandComplete") || matches("submit") && !exact && state.commandMatches.length) {
        event.preventDefault();
        if (!event.repeat) completeCommand(state.commandIndex);
        return;
      }
    }
    if (Object.entries(DEFAULT_EDITOR_KEYBINDINGS.submit).every(([name, value]) => event[name] === value)) {
      event.preventDefault();
      if (!event.repeat) sendPrompt();
    }
  });

  window.piDesktop.onEvent(handleEvent);
  window.piDesktop.onAgentsChanged(() => {
    void window.piDesktop.getConfig().then((config) => { state.config.specialists = config.specialists; renderAgents(); setBusy(state.streaming); }).catch((error) => showToast(error.message));
  });
  window.piDesktop.onModelCatalog(renderModelCatalog);
  window.piDesktop.onContextChanged(async (config) => {
    state.agentChoice++;
    state.navigating = true;
    setBusy(false);
    try {
      syncConfig(config);
      await refreshState({ fast: true });
      void restoreDraft().catch((error) => showToast(error.message));
      setConnection("online");
      void refreshState().catch((error) => showToast(error.message || "后台加载会话详情失败"));
    } catch (error) { setConnection("error", error.message); showToast(error.message); }
    finally { state.navigating = false; setBusy(state.task?.status === "running"); }
  });
  window.piDesktop.onHistoryReady((payload) => {
    if (!payload?.sessionFile || !Array.isArray(payload.messages)) return;
    state.historyBySession.set(payload.sessionFile, payload.messages);
    if (payload.sessionFile !== state.sessionFile) return;
    if (state.streaming || state.renderingHistory || state.navigating) {
      state.pendingHistory = { sessionFile: payload.sessionFile, messages: payload.messages, tasks: state.taskHistoryBySession.get(payload.sessionFile) || [] };
      return;
    }
    state.pendingHistory = null;
    void renderStoredMessages(payload.messages, state.taskHistoryBySession.get(payload.sessionFile) || []).catch((error) => showToast(error.message));
  });
  window.piDesktop.onPermissions(renderPermissions);
  window.piDesktop.onAccountChanged(async ({ logout, config }) => {
    syncConfig(config);
    if (logout) { await renderStoredMessages([]); state.sessionFile = null; state.attachments = []; renderAttachments(); handleTask(null); setConnection("signed-out", "未连接账户"); }
    else { await refreshState().catch((error) => showToast(error.message)); }
  });
  window.piDesktop.onVideo(renderVideoTask);
  window.piDesktop.onUiRequest(openInteraction);
  window.piDesktop.onStatus(handleStatus);
  window.piDesktop.onTask(handleTask);
  window.piDesktop.onOpenSettings(openSettings);
  window.piDesktop.onLibraryChanged(scheduleLibraryRefresh);
  window.addEventListener("focus", scheduleLibraryRefresh);

  (async () => {
    // Keep initial controls locked until configuration and history are ready.
    setBusy(false);
    try {
      const config = await window.piDesktop.getConfig();
      syncConfig(config);
      void refreshChatModels();
      void refreshLibrary();
      if (!config.connected) openSettings();
      setConnection("connecting");
      // Render the shell and current session immediately. Model catalogs and
      // long transcript parsing continue after the window is usable.
      await refreshState({ fast: true });
      void refreshState().catch((error) => showToast(error.message || "后台加载会话详情失败"));
      await restoreDraft(true);
      setConnection("online");
    } catch (error) {
      setConnection("error", error.message);
      showToast(error.message || `${APP_NAME}启动失败`);
    } finally {
      state.initializing = false;
      state.navigating = false;
      setBusy(state.task?.status === "running");
    }
  })();
})();
