// JarodFund's text-to-video contract supplied on 2026-09-18.
const ratios = ["16:9", "9:16", "1:1", "3:4", "4:3"];
const VIDEO_PROFILES = [
  { id: "grok-imagine-video-1.5", defaults: { duration: 15, aspect_ratio: "16:9" },
    choices: { duration: [15], aspect_ratio: ratios }, note: "当前接入已验证的 15 秒档位，分辨率由服务商决定。" },
  { id: "seedance2.5", defaults: { duration: 6, ratio: "16:9", resolution: "480p" },
    choices: { duration: Array.from({ length: 27 }, (_, i) => i + 4), ratio: [...ratios, "21:9"], resolution: ["480p", "720p"] } },
  { id: "omni-flash", defaults: { duration: 6, ratio: "16:9", resolution: "720p" },
    choices: { duration: [4, 6, 8, 10], ratio: ratios, resolution: ["720p"] }, note: "当前接入已验证的 720p 档位。" },
  { id: "minimax-h3", defaults: { duration: 6, ratio: "16:9", resolution: "768p" },
    choices: { duration: Array.from({ length: 12 }, (_, i) => i + 4), ratio: [...ratios, "21:9"], resolution: ["768p", "2k"] } },
];

function videoProfile(id) {
  const profile = VIDEO_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error("请在设置中选择已接入的视频模型。");
  return profile;
}

function normalizeVideoOptions(id, input = {}) {
  const profile = videoProfile(id);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("视频参数无效。");
  for (const field of Object.keys(input)) {
    if (!Object.hasOwn(profile.defaults, field)) throw new Error(`${id} 不支持视频参数 ${field}。`);
  }
  const options = { ...profile.defaults, ...input };
  for (const [field, value] of Object.entries(options)) {
    if (!profile.choices[field].includes(value)) throw new Error(`${id} 的 ${field} 可选值：${profile.choices[field].join("、")}。`);
  }
  return options;
}

function videoRequest(id, args, preferences = {}) {
  if (!args || typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 32000) throw new Error("请提供有效的视频描述（最多 32000 字符）。");
  const profile = videoProfile(id);
  const options = {};
  const warnings = [];
  for (const [field, value] of Object.entries(args)) {
    if (field === "prompt") continue;
    if (!["model", "task_id", "duration", "ratio", "aspect_ratio", "resolution"].includes(field)) throw new Error(`不支持视频参数 ${field}；当前仅接入纯文生视频。`);
    if (value == null || typeof value === "string" && !value.trim()) continue;
    if (field === "model") {
      if (value !== id) warnings.push(`已使用设置中当前的视频模型 ${id}。`);
    } else if (field === "task_id") throw new Error("已有任务请继续查询，不要重新提交。");
    else if ((field === "ratio" || field === "aspect_ratio") && !Object.hasOwn(profile.defaults, field)) {
      const target = Object.hasOwn(profile.defaults, "ratio") ? "ratio" : "aspect_ratio";
      if (args[target] != null && args[target] !== "" && args[target] !== value) throw new Error("视频比例参数冲突，请只指定一个比例。");
      options[target] = value;
    } else if (field === "resolution" && !Object.hasOwn(profile.defaults, field)) {
      throw new Error(`${id} 当前未接入指定分辨率，请省略 resolution。`);
    } else options[field] = value;
  }
  const normalized = normalizeVideoOptions(id, { ...preferences, ...options });
  return { body: { model: id, prompt: args.prompt, ...normalized }, options: normalized, warnings };
}

module.exports = { VIDEO_PROFILES, videoProfile, normalizeVideoOptions, videoRequest };
