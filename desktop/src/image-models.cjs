// JarodFund image contract supplied on 2026-09-17. The account catalog controls
// availability; its generic "openai" tag does not identify the image transport.
const gpt2Sizes = [
  "1024x1024", "1024x576", "576x1024", "1024x768", "768x1024",
  "2048x2048", "2048x1152", "1152x2048", "2048x1536", "1536x2048",
  "2160x2160", "3840x2160", "2160x3840", "2880x2160", "2160x2880",
];
const gpt25Sizes = ["auto", "1024x1024", "1536x1024", "1024x1536", ...gpt2Sizes.slice(5)];
const ratios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const IMAGE_PROFILES = [
  { id: "gpt-image-2", family: "gpt", api: "images", maxOutputs: 4, maxReferences: 4,
    defaults: { size: "1024x1024", n: 1 }, choices: { size: gpt2Sizes } },
  ...["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].map((id) => ({
    id, family: "gpt", api: "images", maxOutputs: 1, maxReferences: 1, customSize: true,
    defaults: { size: "auto", n: 1, quality: "auto", background: "auto" },
    choices: { size: gpt25Sizes, quality: ["auto", "low", "medium", "high", "xhigh", "max"], background: ["auto", "opaque", "transparent"] },
  })),
  ...["gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview"].map((id) => ({
    id, family: "gemini", api: "chat", maxOutputs: 1, maxReferences: 2,
    defaults: { aspect_ratio: "1:1", image_size: "2K" }, choices: { aspect_ratio: ratios, image_size: ["1K", "2K", "4K"] },
  })),
  ...["grok-imagine-image", "grok-imagine-image-quality"].map((id) => ({
    id, family: "grok", api: "images", maxOutputs: 10, maxReferences: 3,
    defaults: { aspect_ratio: "1:1", resolution: "1k", n: 1 },
    choices: { aspect_ratio: [...ratios, "2:3", "3:2", "9:19.5", "19.5:9", "9:20", "20:9", "1:2", "2:1", "auto"], resolution: ["1k", "2k"] },
  })),
];
const IMAGE_OPTION_NAMES = new Set(IMAGE_PROFILES.flatMap((profile) => Object.keys(profile.defaults)));

function imageProfile(id) {
  const profile = IMAGE_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error(`尚未接入该生图模型：${String(id).slice(0, 120)}。请在设置中选择已支持的模型。`);
  return profile;
}

function normalizeImageOptions(id, input = {}) {
  const profile = imageProfile(id);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("生图参数无效。");
  for (const field of Object.keys(input)) {
    if (!Object.hasOwn(profile.defaults, field)) throw new Error(`${id} 不支持参数 ${field}。`);
  }
  const options = { ...profile.defaults, ...input };
  for (const [field, value] of Object.entries(options)) {
    if (field === "n") {
      if (!Number.isInteger(value) || value < 1 || value > profile.maxOutputs) throw new Error(`${id} 每次只能输出 1 至 ${profile.maxOutputs} 张图片。`);
    } else if (field === "size" && profile.customSize && value !== "auto") {
      const match = typeof value === "string" && value.match(/^([1-9]\d{0,3})x([1-9]\d{0,3})$/);
      const width = Number(match?.[1]);
      const height = Number(match?.[2]);
      if (!match || width % 16 || height % 16 || width > 3840 || height > 3840 || width / height < 1 / 3 || width / height > 3 || width * height < 655360 || width * height > 8294400) {
        throw new Error("GPT Image 2.5 尺寸须为 WIDTHxHEIGHT：宽高为 16 的倍数、各不超过 3840，宽高比在 1:3 至 3:1，总像素在 655360 至 8294400。");
      }
    } else if (!profile.choices[field]?.includes(value)) {
      throw new Error(`${id} 的 ${field} 应为：${profile.choices[field].join("、")}。`);
    }
  }
  return options;
}

function imageRequestOptions(id, args, preferences = {}, warnings = []) {
  if (!args || typeof args !== "object" || Array.isArray(args) || typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.length > 32000) throw new Error("请提供有效的图片描述。");
  const profile = imageProfile(id);
  if (typeof args.model === "string" && args.model.trim() && args.model !== id) {
    warnings.push(`已使用设置中当前的生图模型 ${id}，未采用工具提出的模型切换。`);
  }
  if (args.images != null && (!Array.isArray(args.images) || args.images.length > profile.maxReferences || args.images.some((item) => typeof item !== "string" || !item.trim()))) {
    throw new Error(`${id} 最多使用 ${profile.maxReferences} 张参考图，请提供有效的图片路径。`);
  }
  const options = {};
  const ignored = [];
  for (const [field, value] of Object.entries(args)) {
    if (["prompt", "model", "images"].includes(field)) continue;
    if (!IMAGE_OPTION_NAMES.has(field)) throw new Error(`${id} 不支持参数 ${field}。`);
    // Some tool-call transports fill every declared property. Null and blank
    // optional values mean unset; they must not replace saved preferences.
    if (value == null || typeof value === "string" && !value.trim()) continue;
    // Even when n is not sent (Gemini), never silently reduce the output count.
    if (field === "n" && (!Number.isInteger(value) || value < 1 || value > profile.maxOutputs)) {
      throw new Error(`${id} 每次只能输出 1 至 ${profile.maxOutputs} 张图片。`);
    }
    if (Object.hasOwn(profile.defaults, field)) options[field] = value;
    else if (field !== "n") ignored.push(field);
  }
  if (ignored.length) warnings.push(`已按 ${id} 的接口规则忽略其他模型专用参数：${ignored.join("、")}；实际请求参数以本次 options 为准。`);
  return normalizeImageOptions(id, { ...preferences, ...options });
}

function buildImageRequest(id, prompt, options, references) {
  const profile = imageProfile(id);
  if (profile.family === "gemini") {
    return { endpoint: "/chat/completions", body: {
      model: id, stream: false,
      messages: [{ role: "user", content: references.length ? [
        { type: "text", text: prompt }, ...references.map((url) => ({ type: "image_url", image_url: { url } })),
      ] : prompt }],
      extra_body: { google: { image_config: options } },
    } };
  }
  const body = { model: id, prompt, ...options };
  if (profile.family === "grok") {
    body.response_format = "url";
    if (references.length === 1) body.image = { url: references[0], type: "image_url" };
    else if (references.length) body.images = references.map((url) => ({ url }));
  } else if (references.length) body.images = references.map((image_url) => ({ image_url }));
  return { endpoint: references.length ? "/images/edits" : "/images/generations", body };
}

module.exports = { IMAGE_PROFILES, imageProfile, normalizeImageOptions, imageRequestOptions, buildImageRequest };
