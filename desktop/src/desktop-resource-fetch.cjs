const { net } = require("electron");

function desktopResourceFetch(url, options = {}) {
  // net.fetch rejects manual redirects in Electron. Expose the redirect
  // response without following it, so resource-fetch retains its allowlist.
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const request = net.request({ url: String(url), method: "GET", redirect: "manual",
      headers: Object.fromEntries(Object.entries(options.headers || {}).filter(([name]) => ["range", "accept-encoding"].includes(name.toLowerCase()))),
      credentials: "omit", cache: "no-store", bypassCustomProtocolHandlers: true });
    let stream;
    let finished = false;
    const fail = (error) => {
      if (finished) return;
      finished = true;
      options.signal?.removeEventListener("abort", abort);
      if (stream) stream.error(error); else reject(error);
      request.abort();
    };
    const abort = () => fail(options.signal.reason || new Error("资源下载已取消。"));
    options.signal?.addEventListener("abort", abort, { once: true });
    request.on("error", fail);
    request.on("redirect", (status, _method, location) => {
      if (finished) return;
      finished = true;
      options.signal?.removeEventListener("abort", abort);
      resolve(new Response(null, { status, headers: { location } }));
      request.abort();
    });
    request.on("response", (incoming) => {
      if (finished) return;
      const headers = new Headers();
      for (const [name, values] of Object.entries(incoming.headers)) {
        for (const value of Array.isArray(values) ? values : [values]) headers.append(name, value);
      }
      const body = new ReadableStream({
        start(controller) { stream = controller; },
        cancel() { finished = true; options.signal?.removeEventListener("abort", abort); request.abort(); },
      });
      incoming.on("error", fail);
      incoming.on("aborted", () => fail(new Error("资源下载连接已中断。")));
      incoming.on("end", () => {
        if (finished) return;
        finished = true;
        options.signal?.removeEventListener("abort", abort);
        stream.close();
      });
      incoming.on("data", (chunk) => { if (!finished) stream.enqueue(new Uint8Array(chunk)); });
      resolve(new Response([204, 205, 304].includes(incoming.statusCode) ? null : body, { status: incoming.statusCode, headers }));
    });
    request.end();
  });
}

module.exports = { desktopResourceFetch };
