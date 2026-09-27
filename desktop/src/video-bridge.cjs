const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { VIDEO_TIMEOUT_MS } = require("./videos.cjs");

async function createVideoBridge(run, getSettings, redact) {
  const token = randomBytes(32).toString("hex");
  const active = new Set();
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const settings = request.method === "GET" && request.url === "/settings";
    if (request.headers.authorization !== `Bearer ${token}` || !settings && !(request.method === "POST" && request.url === "/generate")) {
      response.writeHead(403).end(JSON.stringify({ error: "Forbidden" })); return;
    }
    const controller = new AbortController();
    active.add(controller);
    response.on("close", () => { if (!response.writableEnded) controller.abort(); });
    try {
      if (settings) { response.end(JSON.stringify(await getSettings())); return; }
      let size = 0;
      const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 200000) throw new Error("视频请求过大。");
        chunks.push(chunk);
      }
      const result = await run(JSON.parse(Buffer.concat(chunks).toString("utf8")), AbortSignal.any([controller.signal, AbortSignal.timeout(VIDEO_TIMEOUT_MS)]));
      if (!response.destroyed) response.end(JSON.stringify(result));
    } catch (error) {
      if (!response.destroyed) response.writeHead(400).end(JSON.stringify({ error: redact(error.message) }));
    } finally { active.delete(controller); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  server.unref();
  return {
    url: `http://127.0.0.1:${server.address().port}/generate`, token,
    abort() { for (const controller of active) controller.abort(); },
    close() { for (const controller of active) controller.abort(); server.closeAllConnections(); server.close(); },
  };
}

module.exports = { createVideoBridge };
