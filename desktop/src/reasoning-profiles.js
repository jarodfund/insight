((target) => {
  const allLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const five = ["low", "medium", "high", "xhigh", "max"];
  const four = five.slice(0, 4);
  // JarodFund matrix supplied on 2026-09-24, including the later correction
  // that every listed max-claude model accepts all five non-off levels.
  const groups = [
    { ids: ["claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-opus-5", "claude-sonnet-4-6", "claude-sonnet-5"], levels: five, off: "omit", evidence: "contract" },
    { ids: ["max-claude-fable-5", "max-claude-fable-5-1", "max-claude-opus-4-6", "max-claude-opus-4-7", "max-claude-opus-4-8", "max-claude-opus-5", "max-claude-opus-5.5", "max-claude-sonnet-4-6", "max-claude-sonnet-5"], levels: five, off: "omit", evidence: "confirmed" },
    { ids: ["codex-auto-review", "glm-5.2", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "hy3"], levels: five, off: "unsupported", evidence: "contract" },
    { ids: ["gpt-5.5", "grok-4.3", "grok-4.5", "qwen3.7-max"], levels: four, off: "unsupported", evidence: "contract" },
    { ids: ["kimi-k3"], levels: ["low", "high", "max"], off: "unsupported", evidence: "contract" },
    { ids: ["deepseek-v4-flash", "deepseek-v4-pro"], levels: five, off: "suffix", evidence: "contract" },
    // Preserve the user's explicitly requested UI ranges for these models.
    { ids: ["gpt-6-astra", "gpt-6-luna", "gpt-6-sol"], levels: five, off: "unsupported", evidence: "request-tested" },
    { ids: ["grok-4.6", "grok-4.7"], levels: four, off: "unsupported", evidence: "request-tested" },
    { ids: ["deepseek-v4-flash-vision-exp", "deepseek-v4.1-flash", "gemini-3.1-pro", "gemini-3.7-flash", "gemini-3.8-flash", "glm-5.3", "glm-5.3-flash", "glm-5.3-flashx", "hy4", "qwen3.8-flash", "qwen3.8-max"], levels: five, off: "none", evidence: "request-tested" },
    { ids: ["jarod-claude-fable-5", "jarod-claude-fable-5-1", "jarod-claude-opus-4-6", "jarod-claude-opus-4-7", "jarod-claude-opus-4-8", "jarod-claude-opus-5", "jarod-claude-sonnet-5"], levels: five, off: "omit", evidence: "request-tested" },
  ];
  const profiles = Object.freeze(Object.fromEntries(groups.flatMap(({ ids, levels, off, evidence }) => ids.map((id) => [id, Object.freeze({
    levels: Object.freeze(off === "unsupported" ? [...levels] : ["off", ...levels]), off, evidence,
  })]))));

  function withThinkingLevels(model) {
    const profile = profiles[model.id];
    if (!profile) return model;
    const thinkingLevelMap = Object.fromEntries(allLevels.map((level) => [level, profile.levels.includes(level) ? level : null]));
    if (profile.off === "none" || profile.off === "suffix") thinkingLevelMap.off = "none";
    // Undefined keeps the default/omission option selectable. The request hook
    // removes native disabled/none fields for Claude instead of claiming that
    // omitting a field guarantees the model stops reasoning internally.
    if (profile.off === "omit") delete thinkingLevelMap.off;
    return {
      ...model, reasoning: true, thinkingLevelMap,
      ...(model.api === "anthropic-messages" && model.id.includes("claude") ? { compat: { ...model.compat, forceAdaptiveThinking: true } } : {}),
    };
  }

  function adaptReasoningPayload(payload, model) {
    if (model?.provider !== "jarodfund" || !payload || typeof payload !== "object" || payload.model !== model.id) return undefined;
    const profile = profiles[model.id];
    if (!profile) return undefined;
    const nativeClaude = model.api === "anthropic-messages";
    const responses = model.api === "openai-responses";
    const effort = nativeClaude ? payload.output_config?.effort : responses ? payload.reasoning?.effort : payload.reasoning_effort;
    if (effort && effort !== "none") return undefined;
    if (profile.off === "unsupported") return undefined;
    const result = { ...payload };
    if (profile.off === "none") {
      if (responses) result.reasoning = { ...payload.reasoning, effort: "none" };
      else result.reasoning_effort = "none";
      return result;
    }
    delete result.reasoning_effort;
    delete result.reasoning;
    delete result.thinking;
    if (result.output_config) {
      result.output_config = { ...result.output_config };
      delete result.output_config.effort;
      if (!Object.keys(result.output_config).length) delete result.output_config;
    }
    if (profile.off === "suffix") result.model = `${model.id}-none`;
    return result;
  }

  function describeReasoning(provider, id) {
    const profile = provider === "jarodfund" ? profiles[id] : undefined;
    if (!profile) return { offLabel: "OFF", note: "" };
    const note = profile.evidence === "request-tested"
      ? "请求层已接受这些参数；服务商尚未承诺不同档位的实际推理效果。"
      : profile.evidence === "confirmed" ? "按最新确认提供五档推理强度。" : "按服务商声明提供推理档位。";
    return {
      offLabel: profile.off === "omit" ? "默认（不指定）" : profile.off === "suffix" ? "关闭（-none）" : profile.off === "none" ? "NONE（请求档）" : "OFF",
      note: note + (profile.off === "omit" ? "默认项省略推理字段，不保证关闭模型内部推理。" : ""),
    };
  }

  const api = { profiles, withThinkingLevels, adaptReasoningPayload, describeReasoning };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else target.jarodReasoning = api;
})(globalThis);
