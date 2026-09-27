const path = require("node:path");
const { createHash } = require("node:crypto");
const { readJson, writeJson, fetchModelCatalog, modelsFromCatalog } = require("./agent-config.cjs");
const { imageModelsFromCatalog } = require("./images.cjs");
const { VIDEO_PROFILES } = require("./video-models.cjs");

class ModelCatalog {
  constructor(directory, getKey, { fetchCatalog = fetchModelCatalog, onChange = () => {}, now = Date.now } = {}) {
    this.file = path.join(directory, "model-catalog.json");
    this.modelsFile = path.join(directory, "models.json");
    this.getKey = getKey;
    this.fetchCatalog = fetchCatalog;
    this.onChange = onChange;
    this.now = now;
    this.generation = 0;
    this.selectAccount();
  }

  selectAccount() {
    const key = this.getKey();
    if (this.key === key) return;
    this.key = key;
    this.generation++;
    this.pending = null;
    this.error = "";
    this.automaticRefreshAttempted = false;
    this.entries = null;
    this.updatedAt = 0;
    this.account = key ? createHash("sha256").update(key).digest("hex") : "";
    let cached;
    try { cached = readJson(this.file); } catch { /* A broken cache is fetched again. */ }
    if (this.account && cached?.account === this.account && Array.isArray(cached.entries)) {
      this.entries = cached.entries;
      this.updatedAt = Number(cached.updatedAt) || 0;
    }
    const previous = readJson(this.modelsFile).providers?.jarodfund?.models || [];
    try { this.models = this.entries ? modelsFromCatalog(this.entries, previous) : previous; }
    catch { this.entries = null; this.updatedAt = 0; this.models = previous; }
  }

  snapshot() {
    this.selectAccount();
    return {
      models: (this.key ? this.models : []).map(({ id, input, reasoning }) => ({ id, input, reasoning, provider: "jarodfund" })),
      imageModels: this.key && this.entries ? imageModelsFromCatalog(this.entries) : [],
      videoModels: this.key && this.entries ? VIDEO_PROFILES.filter((model) => this.entries.some((entry) => entry.id === model.id)) : [],
      updatedAt: this.updatedAt, refreshing: Boolean(this.pending), error: this.error,
    };
  }

  accept(key, entries) {
    this.selectAccount();
    if (!key || key !== this.key) throw new Error("账户已切换，请重新刷新模型。");
    // Persist catalog metadata only: no headers, API keys or provider response bodies.
    const clean = entries.filter((entry) => entry && typeof entry.id === "string" && entry.id.trim()).map((entry) => ({
      id: entry.id,
      ...(Array.isArray(entry.supported_endpoint_types) ? { supported_endpoint_types: entry.supported_endpoint_types.filter((value) => typeof value === "string") } : {}),
      ...(Array.isArray(entry.input) ? { input: entry.input.filter((value) => ["text", "image"].includes(value)) } : {}),
    }));
    const config = readJson(this.modelsFile);
    const provider = config.providers?.jarodfund;
    if (!provider) throw new Error("JarodFund 模型配置未初始化。");
    const models = modelsFromCatalog(clean, provider.models);
    if (!models.length) throw new Error("服务商未返回可用的对话模型，已保留原列表。");
    if (JSON.stringify(provider.models) !== JSON.stringify(models)) {
      provider.models = models;
      writeJson(this.modelsFile, config);
    }
    const updatedAt = this.now();
    writeJson(this.file, { account: this.account, updatedAt, entries: clean });
    this.entries = clean;
    this.models = models;
    this.updatedAt = updatedAt;
    this.automaticRefreshAttempted = true;
    this.error = "";
    this.onChange(this.snapshot());
  }

  adopt(key, entries) {
    this.selectAccount();
    this.generation++;
    this.pending = null;
    this.accept(key, entries);
  }

  refresh(force = false) {
    this.selectAccount();
    if (!this.key) return Promise.resolve(this.snapshot());
    if (this.pending) return this.pending;
    if (!force && this.automaticRefreshAttempted) return Promise.resolve(this.snapshot());
    // One automatic attempt per app run/account, even if it fails. Further
    // requests require a manual refresh; reading settings must not retry it.
    this.automaticRefreshAttempted = true;
    const key = this.key;
    const generation = this.generation;
    // Defer fetch until pending is assigned, including synchronous test failures.
    this.pending = Promise.resolve().then(() => this.fetchCatalog(key)).then(async (entries) => {
      // Windows can temporarily deny replacement while a runtime reads the file.
      // Retry only the local commit; never repeat the provider request.
      for (let attempt = 0; attempt < 4; attempt++) {
        if (generation !== this.generation || key !== this.getKey()) return;
        try { this.accept(key, entries); return; }
        catch (error) {
          if (!["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt === 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }
    }).catch(() => {
      if (generation === this.generation && key === this.getKey()) {
        this.error = "模型同步暂未成功，已保留原列表。可以继续使用，稍后点击刷新重试。";
      }
    }).finally(() => {
      if (generation === this.generation && key === this.getKey()) {
        this.pending = null;
        this.onChange(this.snapshot());
      }
    }).then(() => this.snapshot());
    this.onChange(this.snapshot());
    return this.pending;
  }

  async media(refresh = false) {
    this.selectAccount();
    if (refresh || this.key && !this.entries) await this.refresh(refresh);
    const snapshot = this.snapshot();
    if (!this.entries && snapshot.error) throw new Error(snapshot.error);
    return snapshot;
  }
}

module.exports = { ModelCatalog };
