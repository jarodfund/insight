const { spawn } = require("node:child_process");
const { StringDecoder } = require("node:string_decoder");
const { name: APP_NAME } = require("./branding.js");

// History and session restoration can legitimately take longer than a small
// control request, especially after a long conversation. Keep cheap commands
// responsive while giving the expensive reads enough time to complete.
const RPC_TIMEOUTS = Object.freeze({
  get_entries: 180000,
  get_history: 180000,
  get_messages: 180000,
  get_state: 60000,
  get_commands: 60000,
  get_available_models: 60000,
  get_available_thinking_levels: 60000,
  switch_session: 60000,
  new_session: 60000,
});

function defaultTimeout(command) {
  if (command?.type === "prompt") return 0;
  return RPC_TIMEOUTS[command?.type] ?? 30000;
}

class Rpc {
  constructor(onEvent, onExit) {
    this.onEvent = onEvent;
    this.onExit = onExit;
    this.pending = new Map();
    this.serial = 0;
    this.child = null;
  }

  disconnect(child, error, notify = true) {
    if (this.child !== child) return;
    this.child = null;
    this.rejectPending(error);
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
    if (notify) this.onExit(error);
  }

  async start(node, args, options, { timeoutMs = 180000, onProgress = () => {} } = {}) {
    const child = spawn(node, args, { ...options, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    const decoder = new StringDecoder("utf8");
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      if (this.child !== child) return;
      buffer += decoder.write(chunk);
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "response") {
          const request = this.pending.get(event.id);
          if (request) {
            this.pending.delete(event.id);
            clearTimeout(request.timer);
            if (event.success === false) request.reject(new Error(event.error || `${APP_NAME}请求失败。`));
            else request.resolve(event);
          }
        } else this.onEvent(event);
      }
    });
    // SDK diagnostics may contain request details. Only structured events reach the UI.
    child.stderr.resume();
    let initializing = true;
    const fail = () => {
      if (this.child !== child) return;
      const error = Object.assign(new Error(`${APP_NAME}进程已断开，请点击恢复连接。`), { code: "PI_DISCONNECTED" });
      this.disconnect(child, error, !initializing);
    };
    child.on("error", fail);
    child.on("exit", fail);
    child.stdin.on("error", fail);
    const began = Date.now();
    const notice = setInterval(() => onProgress(Date.now() - began), 10000);
    try {
      // Loading installed extensions and restoring a session is not an ordinary
      // control request. Do not kill a healthy cold start after only 30 seconds.
      return await this.send({ type: "get_state" }, timeoutMs);
    } catch (error) {
      await this.stop();
      if (error.code === "PI_RPC_TIMEOUT") {
        error.code = "PI_STARTUP_TIMEOUT";
        error.message = `${APP_NAME}初始化超时，可点击恢复连接重试；已保存的 Key 和对话均已保留。`;
      }
      throw error;
    } finally {
      initializing = false;
      clearInterval(notice);
    }
  }

  send(command, timeoutMs = defaultTimeout(command)) {
    const child = this.child;
    if (!child?.stdin.writable) return Promise.reject(Object.assign(new Error(`${APP_NAME}尚未连接，请点击恢复连接。`), { code: "PI_DISCONNECTED" }));
    const id = `desktop-${++this.serial}`;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        const error = Object.assign(new Error(`${APP_NAME}响应超时，请点击恢复连接。`), { code: "PI_RPC_TIMEOUT" });
        this.pending.delete(id);
        reject(error);
        // A single slow request must not take down the whole conversation.
        // A real process exit or pipe error still goes through disconnect().
      }, timeoutMs) : undefined;
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ ...command, id })}\n`, (error) => {
        if (!error) return;
        const request = this.pending.get(id);
        if (!request) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(Object.assign(new Error(`${APP_NAME}连接已断开，请点击恢复连接。`), { code: "PI_DISCONNECTED" }));
      });
    });
  }

  respond(response) {
    if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify(response)}\n`);
  }

  rejectPending(error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.rejectPending(Object.assign(new Error(`${APP_NAME}已停止。`), { code: "PI_DISCONNECTED" }));
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); }, 1500);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  }
}

module.exports = { Rpc };
