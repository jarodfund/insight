const http = require("node:http");
const { randomBytes } = require("node:crypto");

async function createPermissionBridge(check) {
  const token = randomBytes(32).toString("hex");
  const active = new Set();
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "POST" || request.url !== "/check" || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(403).end('{"allowed":false}'); return;
    }
    const controller = new AbortController();
    active.add(controller);
    response.on("close", () => { if (!response.writableEnded) controller.abort(); });
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 4 * 1024 * 1024) throw new Error("Request too large");
        chunks.push(chunk);
      }
      const event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (typeof event.toolName !== "string" || typeof event.cwd !== "string" || !event.input || typeof event.input !== "object") throw new Error("Invalid request");
      const result = await check(event, controller.signal);
      if (!response.destroyed) response.end(JSON.stringify(result));
    } catch { if (!response.destroyed) response.writeHead(400).end('{"allowed":false,"reason":"权限检查失败，操作未执行。"}'); }
    finally { active.delete(controller); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  server.unref();
  return { token, url: `http://127.0.0.1:${server.address().port}/check`, close() { for (const controller of active) controller.abort(); server.closeAllConnections(); server.close(); } };
}
module.exports = { createPermissionBridge };
