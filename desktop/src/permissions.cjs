const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PERMISSION_MODES = [
  { id: "read-only", name: "只读", description: "可读取工作区文件；修改文件、联网和运行命令前请求批准。" },
  { id: "ask", name: "请求批准", description: "可读写工作区文件；联网、访问工作区外文件和运行无法限定范围的命令前请求批准。" },
  { id: "auto", name: "智能批准", description: "自动批准常规读写与公开网页检索；敏感文件、越界写入、脚本和未知工具请求批准。" },
  { id: "full", name: "完全访问", description: "可访问网络、运行命令和修改工作区外文件，无需工具审批。请谨慎使用。" },
];

// Resolve existing ancestors too: a not-yet-created file may live below a junction.
function resolvedPath(value, cwd) {
  if (typeof value !== "string" || !value.trim() || /[\0\r\n]/.test(value)) throw new Error("无效路径");
  if (/^~(?:[\\/]|$)/.test(value) || /^(?:[\\/]{2}|[a-z]:[^\\/])/i.test(value)) throw new Error("路径范围需要确认");
  const absolute = path.resolve(cwd, value);
  if (process.platform === "win32" && absolute.slice(2).includes(":")) throw new Error("不支持备用数据流路径");
  let existing = absolute;
  const remaining = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error("无法解析路径");
    remaining.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync.native(existing), ...remaining);
}

function classify(event, config) {
  const { toolName, input = {} } = event;
  const { mode, cwd } = config;
  if (!PERMISSION_MODES.some((item) => item.id === mode)) return { allow: false, reason: "权限模式无效，需要确认" };
  if (mode === "full") return { allow: true };
  if (["image_settings", "video_settings"].includes(toolName)) return { allow: true };
  if (["read", "grep", "find", "ls", "write", "edit"].includes(toolName)) {
    const writing = toolName === "write" || toolName === "edit";
    try {
      const target = resolvedPath(input.path || (["grep", "find", "ls"].includes(toolName) ? cwd : ""), cwd);
      const base = resolvedPath(cwd, cwd);
      const relative = path.relative(base, target);
      const inside = relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      const sensitive = /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.ssh|\.aws|\.azure|\.gnupg|credentials(?:\.[^\\/]*)?|auth\.json|jarodfund-key\.enc)(?:[\\/]|$)/i.test(target);
      if (sensitive) return { allow: false, reason: "可能包含密钥或账户凭据的文件", target };
      if (!writing && (inside || mode === "auto")) return { allow: true, target };
      if (writing && inside && mode !== "read-only") return { allow: true, target };
      return { allow: false, reason: writing ? inside ? "只读模式下修改文件" : "修改工作区之外的文件" : "读取工作区之外的文件", target };
    } catch { return { allow: false, reason: "无法安全确定文件的实际位置" }; }
  }
  if (mode === "auto" && toolName === "web_search") return { allow: true };
  if (mode === "auto" && toolName === "fetch_content") {
    // Unknown schemas or destinations remain explicit approvals.
    const urls = input.url ? [input.url] : input.urls;
    if (Array.isArray(urls) && urls.length && urls.every((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port &&
          /^[a-z][a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) && !/(?:localhost|\.local|\.internal)$/i.test(url.hostname);
      } catch { return false; }
    })) return { allow: true };
  }
  if (["bash", "powershell"].includes(toolName)) return { allow: false, reason: "命令可能读写其他目录、联网或启动程序；批准适用于本次命令及其子进程" };
  if (["image_gen", "video_gen", "paperqa_query"].includes(toolName)) return { allow: false, reason: "将资料发送到外部服务并可能产生费用" };
  return { allow: false, reason: "联网或扩展工具：需要确认其操作范围；批准包含工具内部执行的操作" };
}

class PermissionGate {
  constructor(getConfig, onChange) {
    this.getConfig = getConfig;
    this.onChange = onChange;
    this.pending = new Map();
  }
  snapshot() { return [...this.pending.values()].map((item) => item.display); }
  async check(event, signal) {
    if (signal?.aborted) return { allowed: false, reason: "审批已取消" };
    const decision = classify(event, this.getConfig());
    if (decision.allow) return { allowed: true };
    const id = randomUUID();
    const config = this.getConfig();
    const argumentsText = JSON.stringify(event.input || {}, (key, value) => /key|token|authorization|password|secret/i.test(key) ? "[REDACTED]" : value, 2).replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");
    const display = { id, toolName: event.toolName, mode: config.mode, cwd: config.cwd, reason: decision.reason, target: decision.target,
      arguments: argumentsText.length > 16000 ? `${argumentsText.slice(0, 16000)}\n\n[参数过长，预览已截断；批准将允许完整操作。]` : argumentsText };
    const allowed = await new Promise((resolve) => {
      const abort = () => this.respond(id, false);
      this.pending.set(id, { display, resolve: (value) => { signal?.removeEventListener("abort", abort); resolve(value); } });
      signal?.addEventListener("abort", abort, { once: true });
      this.onChange(this.snapshot());
    });
    if (!allowed || signal?.aborted) return { allowed: false, reason: "用户拒绝或已取消本次操作，不要改用其他工具绕过。" };
    const current = classify(event, this.getConfig());
    if (config.mode !== this.getConfig().mode || config.cwd !== this.getConfig().cwd || current.target !== decision.target) return { allowed: false, reason: "权限或实际路径已变化，请重新申请。" };
    return { allowed: true };
  }
  respond(id, allowed) {
    const item = this.pending.get(id);
    if (!item) return false;
    this.pending.delete(id);
    item.resolve(allowed === true);
    this.onChange(this.snapshot());
    return true;
  }
  cancel() { for (const id of this.pending.keys()) this.respond(id, false); }
}

module.exports = { PERMISSION_MODES, PermissionGate, classify, resolvedPath };
