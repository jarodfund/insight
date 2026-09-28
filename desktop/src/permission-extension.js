// Registered after desktop tool extensions. A failed or missing permission
// service blocks the call; it never silently falls back to unrestricted access.
module.exports = function desktopPermissions(pi) {
  pi.on("tool_call", async (event, ctx) => {
    try {
      const response = await fetch(process.env.INSIGHT_PERMISSION_BRIDGE, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INSIGHT_PERMISSION_TOKEN}` },
        body: JSON.stringify({ toolName: event.toolName, input: event.input, cwd: ctx.cwd }),
      });
      const result = await response.json();
      if (!response.ok || result.allowed !== true) return { block: true, reason: result.reason || "本次操作未获批准。" };
    } catch { return { block: true, reason: "权限检查连接不可用，本次操作未执行。请恢复连接，不要绕过审批。" }; }
  });
};
