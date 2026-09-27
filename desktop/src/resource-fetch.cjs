const { httpsDirectory } = require("./updates.cjs");

function resourceSources(value, allowLocalhost = false) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  if (values.length > 5) throw new Error("资源源数量过多。");
  return [...new Set(values.map((item) => {
    const url = new URL(item);
    if (allowLocalhost && url.protocol === "http:" && url.hostname === "127.0.0.1" && !url.username && !url.password && !url.search && !url.hash) {
      if (!url.pathname.endsWith("/")) url.pathname += "/";
      return url.href;
    }
    return httpsDirectory(item);
  }))];
}

function resourceUrl(base, relative, assetName) {
  const url = new URL(base);
  // Release assets are flat; signed manifests retain their canonical hash path.
  if (url.hostname === "github.com" && /^\/[^/]+\/[^/]+\/releases\/(?:download\/[^/]+|latest\/download)\/$/.test(url.pathname)) {
    if (/^packages\/[a-f0-9]{64}\.zip$/.test(relative)) relative = assetName || relative.slice(9);
  }
  return new URL(relative, url);
}

async function fetchResource(base, relative, { fetcher = fetch, signal, headers = {}, headerTimeoutMs = 12000, assetName } = {}) {
  if (assetName && !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(assetName)) throw new Error("资源资产名称无效。");
  const initial = resourceUrl(base, relative, assetName);
  let url = initial;
  const safeHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => ["range", "accept-encoding"].includes(name.toLowerCase())));
  for (let hop = 0; hop <= 5; hop++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("资源连接超时。")), headerTimeoutMs);
    let response;
    try {
      response = await fetcher(url, { method: "GET", redirect: "manual", headers: safeHeaders,
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal });
    } finally { clearTimeout(timeout); }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || hop === 5) throw new Error("资源重定向次数或地址无效。");
    const next = new URL(location, url);
    const githubAsset = initial.hostname === "github.com" && ["release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(next.hostname);
    if (next.username || next.password || next.hash || (next.origin !== initial.origin && !githubAsset) ||
        (next.protocol !== "https:" && !(initial.protocol === "http:" && next.origin === initial.origin)) ||
        (githubAsset && next.port)) throw new Error("资源重定向到未受信任的地址。");
    url = next;
  }
  throw new Error("资源重定向失败。");
}

module.exports = { resourceSources, resourceUrl, fetchResource };
