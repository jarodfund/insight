const { Agent } = require("undici");
const { VIDEO_TIMEOUT_MS } = require("./videos.cjs");
const dispatcher = new Agent({ headersTimeout: VIDEO_TIMEOUT_MS + 60000, bodyTimeout: VIDEO_TIMEOUT_MS + 60000 });

module.exports = function desktopVideos(pi) {
  pi.registerTool({
    name: "video_settings", label: "读取视频设置与任务",
    description: "Read the user's current video model, saved defaults, allowed parameter choices and existing video tasks in this workspace. No billing. Read before video_gen. Only the user can change the selected model in desktop Settings.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute(_id, _args, signal) {
      const response = await fetch(new URL("/settings", process.env.INSIGHT_VIDEO_BRIDGE), { headers: { Authorization: `Bearer ${process.env.INSIGHT_VIDEO_TOKEN}` }, signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "视频设置读取失败。");
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  });
  pi.registerTool({
    name: "video_gen", label: "生成 / 继续获取视频",
    description: "Generate one video from text with the CURRENT video model in desktop Settings, poll its public JarodFund task, download/verify an MP4 and display it in the conversation. Read video_settings first. For an existing task, pass ONLY task_id: this resumes polling/download without submitting or billing a new generation, and retains its original model/options. New requests need prompt. Omit unspecified fields or use null to inherit saved settings. Grok: duration15, aspect_ratio, no resolution. Seedance: duration4..30, ratio, resolution480p/720p. Omni: duration4/6/8/10, ratio, resolution720p. Minimax: duration4..15, ratio, resolution768p/2k. Read exact ratio choices from video_settings. Pure text-to-video only: no uploads, first frames, reference media, editing, providers or channels.",
    promptSnippet: "Generate playable videos from text; resume existing video tasks without regenerating",
    promptGuidelines: ["For a video request, read video_settings and call video_gen using the current selection. Do not substitute image_gen, shell commands, other providers/models or invented resolutions. For 'continue', 'retry' or interrupted existing video tasks, prefer the matching task_id from video_settings instead of a new generation. Never resubmit a possibly billed POST after network/HTTP failure automatically. A task ID, queued or processing status is not a completed video. Only status=completed with a verified file is success; report its exact local path, actual duration and dimensions. Failed/paused results must be reported honestly. Stopping local waiting does not cancel the upstream task. Unsupported duration/resolution/reference requests need a user choice; do not silently downgrade them."],
    parameters: { type: "object", properties: {
      prompt: { type: ["string", "null"], description: "Complete text-to-video prompt for a NEW task; null when resuming." },
      task_id: { type: ["string", "null"], description: "Public task ID from video_settings to resume. No new POST is made. Omit/null for a new task." },
      model: { type: ["string", "null"], description: "Read-only echo of selectedModel; cannot override Settings. Normally null." },
      duration: { type: ["integer", "null"], description: "Integer seconds from the selected model's choices; null to use saved defaults." },
      ratio: { type: ["string", "null"], description: "Seedance/Omni/Minimax ratio, e.g.16:9; null for Grok or saved defaults." },
      aspect_ratio: { type: ["string", "null"], description: "Grok ratio, e.g.16:9; null for other models or saved defaults." },
      resolution: { type: ["string", "null"], description: "Exact resolution choice for the selected model; null for Grok or saved defaults. No invented tiers." },
    }, additionalProperties: false },
    prepareArguments(args) {
      if (!args || typeof args !== "object" || Array.isArray(args)) return args;
      return Object.fromEntries(Object.entries(args).filter(([, value]) => typeof value !== "string" || value.trim()));
    },
    async execute(_id, args, signal, _update, ctx) {
      const response = await fetch(process.env.INSIGHT_VIDEO_BRIDGE, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.INSIGHT_VIDEO_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ args, cwd: ctx.cwd }), signal, dispatcher,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "视频请求失败。");
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: { videoGeneration: true, ...result } };
    },
  });
};
