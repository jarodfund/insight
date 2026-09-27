// Loaded by Pi as a native extension. The loopback bridge keeps the provider
// credential and image decoding in the desktop process, out of tool arguments.
const { imageDispatcher } = require("./image-http.cjs");

module.exports = function desktopImages(pi) {
  pi.registerTool({
    name: "image_settings",
    label: "读取生图设置",
    description: "Read the user's CURRENT selected image model, saved default options and available models with exact limits/choices. No generation or billing. Call before image_gen so current-session setting changes and reference/count limits are respected. Image generation always uses selectedModel; only the user can change it in desktop Settings.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute(_id, _args, signal) {
      const response = await fetch(new URL("/settings", process.env.PI_DESKTOP_IMAGE_BRIDGE), {
        headers: { Authorization: `Bearer ${process.env.PI_DESKTOP_IMAGE_TOKEN}` }, signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "生图设置读取失败。");
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  });
  pi.registerTool({
    name: "image_gen",
    label: "生成 / 编辑图片",
    description: "Generate or edit real images through JarodFund using ONLY the image model currently selected in desktop Settings. The tool cannot switch models. Results are verified, saved and displayed in this conversation. Read image_settings first. Omit unspecified options, or set them to null, to use saved settings. Override supported options only for explicit user requirements, never to silently downgrade after an error. Set other model families' fields to null; do not fill invented defaults. The adapter sends only the selected model's supported fields and reports ignored fields. images contains local paths of uploads or earlier generated files; include the prior output for every continued edit. GPT 2: n 1-4, refs <=4, fixed pixel size. GPT 2.5: n=1, refs <=1, size auto/custom, quality/background supported. Gemini preview: one output, refs <=2, aspect_ratio/image_size only. Grok: n 1-10, refs <=3, aspect_ratio/resolution only. No masks. Never discard extra reference images silently or split into extra paid calls without user instruction.",
    promptSnippet: "Generate or edit images and display verified results in the conversation",
    promptGuidelines: ["For image requests, read image_settings then call image_gen. The model is fixed by the user's current desktop Settings; do not switch it or downgrade the requested dimensions after errors. To change image models, the user must choose one in Settings. Omit irrelevant/unspecified optional fields or set them to null. Include the previous output's exact path for continued edits. Report verified paths, actual dimensions, partial failures and warnings. If the call fails, do not claim success or repeat a potentially billed request automatically. A local validation error may be corrected once; if the same error persists, stop and report it rather than loop. A network/HTTP/output failure must not be regenerated without the user's instruction."],
    parameters: {
      type: "object", properties: {
        prompt: { type: "string", description: "Complete image generation/edit instruction" },
        model: { type: ["string", "null"], description: "Optional echo of image_settings.selectedModel, normally null. Read-only: a different value cannot override the user's model selection in Settings." },
        size: { type: ["string", "null"], description: "GPT only; otherwise null. GPT 2 uses a fixed list from image_settings; no auto. GPT 2.5 accepts auto or WxH: multiples of 16, sides <=3840, ratio 1/3..3, area 655360..8294400. Area >3686400 is experimental. Never pass 2K/4K or an aspect ratio here." },
        n: { type: ["integer", "null"], minimum: 1, maximum: 10, description: "Output count: GPT 2 up to4, GPT 2.5 exactly1, Grok up to10; null for Gemini or saved default." },
        quality: { type: ["string", "null"], enum: [null, "auto", "low", "medium", "high", "xhigh", "max"], description: "GPT 2.5 only; otherwise null. Independent of pixel dimensions." },
        background: { type: ["string", "null"], enum: [null, "auto", "opaque", "transparent"], description: "GPT 2.5 only; otherwise null. Opaque does not mean white; describe color in prompt. Transparent is a request, not a guarantee." },
        aspect_ratio: { type: ["string", "null"], description: "Gemini or Grok only, use supported choices from image_settings; otherwise null." },
        image_size: { type: ["string", "null"], enum: [null, "1K", "2K", "4K"], description: "Gemini only; otherwise null. Actual output pixels are verified." },
        resolution: { type: ["string", "null"], enum: [null, "1k", "2k"], description: "Grok only; otherwise null. No 4k." },
        images: { type: ["array", "null"], items: { type: "string" }, maxItems: 4, description: "Local reference paths in prompt order; omit, null or [] for text-to-image. Model-specific limits from image_settings apply." },
      }, required: ["prompt"], additionalProperties: false,
    },
    prepareArguments(args) {
      if (!args || typeof args !== "object" || Array.isArray(args)) return args;
      // Blank optional enum/numeric placeholders must be removed before Pi's
      // schema validator, otherwise the adapter never receives the request.
      const optional = ["model", "size", "n", "quality", "background", "aspect_ratio", "image_size", "resolution"];
      return Object.fromEntries(Object.entries(args).filter(([field, value]) =>
        !optional.includes(field) || typeof value !== "string" || value.trim() !== ""));
    },
    async execute(_id, args, signal, _update, ctx) {
      const response = await fetch(process.env.PI_DESKTOP_IMAGE_BRIDGE, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.PI_DESKTOP_IMAGE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ args, cwd: ctx.cwd }), signal, dispatcher: imageDispatcher,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "图片生成失败。");
      return {
        content: [
          { type: "text", text: JSON.stringify({ model: result.model, images: result.files.map(({ path, width, height }) => ({ path, width, height })), options: result.options, partial: result.partial, warnings: result.warnings, resized: false }) },
          ...result.files.map(({ data, mimeType }) => ({ type: "image", data, mimeType })),
        ],
        details: { imageGeneration: true, model: result.model, files: result.files.map(({ data, ...info }) => info), options: result.options, partial: result.partial, warnings: result.warnings, requestId: result.requestId },
      };
    },
  });
};
