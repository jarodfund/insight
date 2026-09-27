const { name: APP_NAME } = require("./branding.js");

const BUILTIN_COMMANDS = [
  { name: "reload", description: `重新加载${APP_NAME}配置与资源` },
  { name: "new", description: "新建对话" },
  { name: "model", description: "选择模型", argumentHint: "provider/model" },
  { name: "thinking", description: "选择推理强度", argumentHint: "level" },
  { name: "compact", description: "压缩会话上下文", argumentHint: "可选的压缩要求" },
  { name: "name", description: "重命名当前对话", argumentHint: "对话名称" },
  { name: "session", description: "当前会话统计" },
  { name: "copy", description: `复制最近一条${APP_NAME}回复` },
  { name: "commands", description: "可用命令" },
  { name: "settings", description: "账户与客户端设置" },
];

function commandCatalog(commands = []) {
  const builtins = BUILTIN_COMMANDS.map((command) => ({ ...command, source: "desktop" }));
  const names = new Set(builtins.map((command) => command.name));
  return [...builtins, ...commands.filter((command) => !names.has(command.name))];
}

module.exports = { BUILTIN_COMMANDS, commandCatalog };
