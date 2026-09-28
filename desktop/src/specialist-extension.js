const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { agentInstructions, runtimePaths } = require("./specialists.cjs");
const { identity } = require("./branding.js");
const { productRoot } = require("./product-paths.cjs");

module.exports = function desktopSpecialists(pi) {
  const root = productRoot;
  const prefix = process.env.INSIGHT_AGENT_PREFIX;
  const personalInstallation = process.env.PI_CODING_AGENT_DIR
    ? `用户要求设计或安装自己的智能体时，学术派的个人技能安装目录是 ${path.join(process.env.PI_CODING_AGENT_DIR, "skills")}。使用独立文件夹和带 name、description 的 SKILL.md，保留所需脚本与相对引用文件；先在工作区准备资料，仅在用户要求安装时写入此目录，并遵守权限审批、不覆盖已有技能。安装后提示用户在“我的智能体”点击“刷新智能体”，无需重启；不要承诺只放到项目 .pi/skills 或其他客户端目录就会显示。`
    : "";
  let selected = "";

  pi.on("input", (event) => {
    selected = "";
    if (!prefix || !event.text.startsWith(prefix)) return { action: "continue" };
    const newline = event.text.indexOf("\n");
    selected = event.text.slice(prefix.length, newline);
    return { action: "transform", text: event.text.slice(newline + 1), images: event.images };
  });
  pi.on("before_agent_start", (event) => {
    return { systemPrompt: [event.systemPrompt, personalInstallation, identity, selected && agentInstructions(root, selected, pi.getCommands())].filter(Boolean).join("\n\n") };
  });

  pi.registerTool({
    name: "paperqa_query",
    label: "本地文献证据问答",
    description: "Answer a specific question from user-selected local PDFs/Markdown/text/HTML with PaperQA and cited evidence. Uses local sparse keyword retrieval (no embedding account) and the current JarodFund chat model for evidence summaries and answers. Document excerpts are sent to that model. Do not scan unrelated files. Returns an answer, evidence count and saved Markdown path. No automatic paid retry.",
    parameters: { type: "object", properties: {
      question: { type: "string", minLength: 1 },
      files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
    }, required: ["question", "files"], additionalProperties: false },
    async execute(_id, args, signal, _update, ctx) {
      if (!fs.existsSync(runtimePaths(root).python)) throw new Error("请先在智能体面板点击“本地文献高准确问答”，下载并启用文献运行环境，然后继续当前会话。");
      if (ctx.model?.provider !== "jarodfund") throw new Error("本地文献问答当前使用 JarodFund，请先选择 JarodFund 聊天模型。");
      signal?.throwIfAborted();
      const result = await new Promise((resolve, reject) => {
        const child = spawn(runtimePaths(root).python, [path.join(root, "desktop/specialists/paperqa_runner.py")], {
          cwd: ctx.cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, PYTHONUTF8: "1", LITELLM_LOCAL_MODEL_COST_MAP: "True" },
        });
        let output = "";
        let failure;
        const stop = () => { failure = new Error("已停止文献问答；不会自动重复请求。"); child.kill(); };
        signal?.addEventListener("abort", stop, { once: true });
        const timer = setTimeout(() => { failure = new Error("文献问答等待超时；未自动重试。"); child.kill(); }, 15 * 60 * 1000);
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", stop); };
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.length > 8 * 1024 * 1024) { failure = new Error("文献结果过大，请缩小问题范围。"); child.kill(); }
        });
        child.stderr.resume();
        child.stdin.on("error", () => {});
        child.on("error", (error) => { cleanup(); reject(error); });
        child.on("close", (code) => {
          cleanup();
          if (failure) return reject(failure);
          try {
            const data = JSON.parse(output.trim().split(/\r?\n/).at(-1));
            if (code !== 0 || data.error) reject(new Error(data.error || "文献问答失败。"));
            else resolve(data);
          } catch { reject(new Error("文献问答未返回有效结果，请检查本地组件。")); }
        });
        child.stdin.end(JSON.stringify({ ...args, cwd: ctx.cwd, model: ctx.model.id, base_url: ctx.model.baseUrl }));
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  });
};
