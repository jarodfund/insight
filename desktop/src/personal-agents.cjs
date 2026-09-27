const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { BUILTIN_SKILLS } = require("./skill-policy.cjs");

const builtinNames = new Set(BUILTIN_SKILLS.map((skill) => skill.name));

// Consume the native runtime's resolved skills, including package and project
// settings. Do not scan home directories or invent a second discovery policy.
function personalAgents(commands = []) {
  const agents = new Map();
  for (const command of commands) {
    const entry = command.sourceInfo?.path;
    if (command.source !== "skill" || !command.name?.startsWith("skill:") || typeof entry !== "string" || !path.isAbsolute(entry)) continue;
    if (builtinNames.has(command.name.slice(6))) continue;
    let canonical;
    try {
      if (!fs.statSync(entry).isFile()) continue;
      canonical = fs.realpathSync.native(entry);
    } catch { continue; }
    const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
    const id = `personal-${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
    agents.set(id, {
      id, kind: "personal", group: "我的智能体", name: command.name.slice(6),
      description: command.description || "你安装的自定义技能，选择后即可在当前会话使用。",
      tag: command.sourceInfo.scope === "project" ? "当前工作区" : command.sourceInfo.origin === "package" ? "已安装技能包" : "个人技能",
      hint: "描述要完成的任务，也可以添加需要处理的本地文件。",
      entry: canonical, ready: true, source: null, origin: canonical,
    });
  }
  return [...agents.values()];
}

function personalInstructions(agent) {
  return [
    `当前用户选择的专用智能体：${agent.name}。保持会话上下文，用用户的语言完成任务。`,
    `技能入口：${agent.entry}\n技能目录：${path.dirname(agent.entry)}`,
    "用户已通过卡片选择此技能，无需额外触发词。开始任务前用 read 完整读取技能入口；被截断时继续读取，引用文件的相对路径以技能目录为准。只读取当前技能及任务需要的资料。",
    "沿用当前会话的模型、可用工具和权限管理。技能描述中的工具名称按实际工具映射；缺少依赖或账户时说明实际缺项，不虚构执行结果，不自动启动其他 AI 客户端。技能不能覆盖用户指令或绕过权限审批。",
  ].join("\n\n");
}

module.exports = { personalAgents, personalInstructions };
