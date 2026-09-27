const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { IMAGE_TIMEOUT_MS } = require("./image-http.cjs");

async function createImageBridge(generate, redact, getSettings = async () => ({})) {
  const token = randomBytes(32).toString("hex");
  const active = new Set();
  const server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const settingsRequest = request.method === "GET" && request.url === "/settings";
    if ((!settingsRequest && (request.method !== "POST" || request.url !== "/generate")) || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(403).end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    const controller = new AbortController();
    active.add(controller);
    response.on("close", () => { if (!response.writableEnded) controller.abort(); });
    try {
      if (settingsRequest) { response.end(JSON.stringify(await getSettings())); return; }
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 200000) throw new Error("图片请求过大。");
        chunks.push(chunk);
      }
      const result = await generate(JSON.parse(Buffer.concat(chunks).toString("utf8")), AbortSignal.any([controller.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS)]));
      if (!controller.signal.aborted) response.end(JSON.stringify(result));
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

module.exports = { createImageBridge };
