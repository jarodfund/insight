const fs = require("node:fs");
const path = require("node:path");
const manifest = require("../specialists/sources.json");
const perspectives = require("../specialists/perspectives.json");
const perspectiveSnapshot = require("../specialists/perspectives/snapshot.json");
const researchSkills = require("../specialists/research-skills.json");
const researchSnapshot = require("../specialists/research/snapshot.json");
const { personalAgents, personalInstructions } = require("./personal-agents.cjs");
const creatorPackage = require("../specialists/creator-node/package.json");
const { node } = require("./product-paths.cjs");
const { agentComponents } = require("./component-plan.cjs");
const { portablePlatform } = require("./portable-platform.cjs");

function componentPaths() { return JSON.parse(process.env.INSIGHT_COMPONENTS || "{}"); }

const AGENTS = [
  { id: "ppt-master", group: "工作常用", name: "一键制作原生PPTX", description: "产出是真正可编辑的 .pptx：形状、母版、图表、表格、公式都是 PowerPoint 原生对象。", tag: "原生可编辑", entry: "skills/ppt-master/SKILL.md", hint: "告诉我主题、受众和页数，也可以上传已有材料或模板。" },
  { id: "codex-ppt", group: "工作常用", name: "图片风格精美PPT", description: "每一张都是精美的图片，类似notebookLLM风格的PPT体验。", tag: "整页视觉设计", entry: "skills/codex-ppt/SKILL.md", hint: "描述主题、页数和喜欢的风格，或上传需要转成 PPT 的材料。" },
  { id: "agent-reach", group: "工作常用", name: "搜全网", description: "全网语义搜索，涵盖广，基本都能搜", tag: "跨平台找资料", entry: "agent_reach/skill/SKILL.md", hint: "告诉我想找的主题、平台或时间范围，也可以直接发来链接。" },
  { id: "yt-dlp", group: "工作常用", name: "下全网", description: "覆盖面广，基本都能下", tag: "视频 · 音频 · 字幕", entry: "README.md", hint: "粘贴链接，告诉我要视频、音频还是字幕，以及清晰度要求。" },
  { id: "openresearch", group: "通用科研工作台", name: "读论文、管实验、记过程", description: "串起论文阅读、实验分支与过程记录，让研究过程可追溯。", tag: "研究与实验", entry: "SKILL.md", hint: "提供论文、研究目标或实验项目，说明现在要推进哪一步。" },
  { id: "feynman", group: "通用科研工作台", name: "搜 arXiv、问 PDF、核对论文代码", description: "查找论文、追问方法与证据，对照代码检查论文里的结论。", tag: "论文与代码", entry: "skills/pdf-explore/SKILL.md", hint: "输入研究问题、arXiv 链接，或选择 PDF 与代码文件。" },
  { id: "academic", group: "通用科研工作台", name: "写综述 / 初稿 / 模拟审稿", description: "从文献与证据组织文章，生成初稿并给出模拟审稿意见。", tag: "学术写作", entry: "pi/README.md", hint: "说明研究主题、写作阶段和目标，或上传需要修改的稿件。" },
  { id: "paper-qa", group: "通用科研工作台", name: "本地文献高准确问答", description: "围绕选中的本地文献检索证据，附来源回答，并标明证据不足之处。", tag: "基于文献回答", entry: "README.md", hint: "上传 PDF、Markdown 或文本论文，然后输入要核对的问题。" },
  { id: "book-to-skill", group: "通用科研工作台", name: "书籍转技能", description: "从书籍与文档中提炼思维模型、方法和原则，整理成可复用的知识技能。", tag: "知识提炼", entry: "SKILL.md", hint: "选择书籍或文档，说明想提炼的知识和用途；支持 PDF、EPUB、DOCX、Markdown 等格式。" },
  ...researchSkills.map((agent) => ({ ...agent, group: "通用科研工作台", kind: "research", entry: "SKILL.md" })),
  { id: "grill-me", group: "通用科研工作台", name: "神级拷问", description: "追问出你最真实的需求，让AI产出完美匹配你想法的内容。", tag: "需求澄清", entry: "skills/productivity/grilling/SKILL.md", hint: "说出你的想法、计划或想要的成果，我们一起把需求问清楚。" },
  ...perspectives.map((agent) => ({ ...agent, group: "大师思维框架", kind: "perspective", entry: "SKILL.md" })),
  { id: "easel", group: "自媒体创作", name: "一站式自媒体创作", description: "热点-策划-图文/视频-发布-复盘一整条链路自动完成，适用于国内各大平台。", tag: "内容创作全流程", entry: "README.md", hint: "告诉我目标平台、账号定位和主题，或从寻找热点开始。" },
  { id: "hyperframes", group: "自媒体创作", name: "口播/课件神器", description: "用HTML/CSS写片子再渲染成视频。", tag: "口播包装 · 课件视频", entry: "skills/hyperframes/SKILL.md", hint: "描述视频主题、时长和比例，也可以添加口播素材、课件或讲稿。" },
];

function runtimePaths(root) {
  const directory = componentPaths()["specialist-runtime"] || path.join(root, ".tools/specialists");
  const portable = fs.existsSync(path.join(directory, "portable.json"));
  const target = portablePlatform();
  const windows = process.platform === "win32";
  return { directory, portable, python: path.join(directory, portable ? target.python : windows ? ".venv/Scripts/python.exe" : ".venv/bin/python3"), orx: path.join(directory, target.orx),
    creatorPython: path.join(directory, portable ? target.creatorPython : windows ? "creator-venv/Scripts/python.exe" : "creator-venv/bin/python3"), hyperframes: path.join(directory, "creator-node/node_modules/hyperframes/bin/hyperframes.mjs") };
}

function agentCatalog(root) {
  const runtime = runtimePaths(root);
  const components = componentPaths();
  let installed;
  try { installed = JSON.parse(fs.readFileSync(path.join(runtime.directory, "installed.json"), "utf8")); } catch { /* Explicit installation is required. */ }
  let creators;
  try { creators = JSON.parse(fs.readFileSync(path.join(runtime.directory, "creators.json"), "utf8")); } catch { /* Creator components have not been provisioned. */ }
  return AGENTS.map((agent) => {
    if (process.env.INSIGHT_ON_DEMAND === "1") {
      const required = agentComponents(agent);
      const directory = agent.kind === "research" ? components.research : agent.kind === "perspective" ? components.perspectives : components[agent.id];
      const entry = directory && path.join(directory, ...(agent.kind ? [agent.id] : []), agent.entry);
      const source = manifest.sources.find((item) => item.id === agent.id);
      return { ...agent, entry, ready: required.every((id) => Boolean(components[id])) && Boolean(entry && fs.existsSync(entry)), downloadable: true,
        source: source ? `https://github.com/${source.repository}` : null };
    }
    if (agent.kind === "research") {
      const directory = components.research || path.join(root, "desktop/specialists/research");
      const entry = path.join(directory, agent.id, agent.entry);
      const files = Object.keys(researchSnapshot.files).filter((file) => file.startsWith(`${agent.id}/`));
      const ready = files.length > 0 && fs.existsSync(entry) && files.every((file) => fs.existsSync(path.join(directory, file))) &&
        fs.existsSync(path.join(root, "desktop/specialists", `${agent.id}.md`));
      return { ...agent, entry, ready, source: null, origin: "来自本机已安装技能，完整资料已内置到学术派" };
    }
    if (agent.kind === "perspective") {
      const directory = components.perspectives || path.join(root, "desktop/specialists/perspectives");
      const entry = path.join(directory, agent.id, agent.entry);
      const ready = fs.existsSync(entry) && fs.existsSync(path.join(directory, "LICENSE")) &&
        Object.keys(perspectiveSnapshot.files).filter((file) => file.startsWith(`${agent.id}/`))
          .every((file) => fs.existsSync(path.join(directory, file)));
      return { ...agent, entry, ready, source: `https://github.com/${perspectiveSnapshot.repository}/tree/main/examples/${agent.id}`, license: perspectiveSnapshot.license };
    }
    const source = manifest.sources.find((item) => item.id === agent.id);
    const entry = path.join(components[agent.id] || path.join(runtime.directory, agent.id), agent.entry);
    const mediaReady = !["agent-reach", "yt-dlp"].includes(agent.id) ||
      installed?.media?.ytDlp === manifest.media.ytDlp && fs.existsSync(path.join(runtime.directory, runtime.portable ? "python/Lib/site-packages/yt_dlp/__main__.py" : ".venv/Scripts/yt-dlp.exe")) &&
      (agent.id !== "agent-reach" || installed.media.agentReachRevision === source.revision && installed.media.mcporter === manifest.media.mcporter &&
        fs.existsSync(path.join(runtime.directory, runtime.portable ? "python/Lib/site-packages/agent_reach/cli.py" : ".venv/Scripts/agent-reach.exe")) && fs.existsSync(path.join(runtime.directory, "media-node/node_modules/mcporter/dist/cli.js")));
    const ready = (Boolean(components[agent.id]) || installed?.sources?.some((item) => item.id === agent.id && item.revision === source.revision))
      && fs.existsSync(entry) && fs.existsSync(runtime.python) && fs.existsSync(runtime.orx) && mediaReady
      && (agent.id !== "easel" || Boolean(creators?.easel) && fs.existsSync(runtime.creatorPython))
      && (agent.id !== "hyperframes" || creators?.hyperframes === creatorPackage.dependencies.hyperframes && fs.existsSync(runtime.hyperframes));
    return { ...agent, entry, source: `https://github.com/${source.repository}`, license: source.license, ready: Boolean(ready) };
  });
}

function agentInstructions(root, id, commands = []) {
  if (!id) return "";
  if (id.startsWith("personal-")) {
    const agent = personalAgents(commands).find((item) => item.id === id);
    if (!agent) throw new Error("该自定义智能体在当前工作区不可用，请刷新智能体列表后重新选择。");
    return personalInstructions(agent);
  }
  const agent = agentCatalog(root).find((item) => item.id === id);
  if (agent?.kind === "research") {
    if (!agent.ready) throw new Error("该科研技能的内置资料不完整，请恢复 desktop/specialists/research 及对应适配文件。");
    const directory = path.dirname(agent.entry);
    const adapter = fs.readFileSync(path.join(root, "desktop/specialists", `${id}.md`), "utf8");
    return [
      `当前用户选择的专用智能体：${agent.name}。保持本次会话上下文，用用户的语言完成任务。`,
      `技能目录：${directory}\n技能入口：${agent.entry}`,
      "用户已通过卡片选择该技能，不要求额外触发词。开始任务前用 read 完整读取入口；被截断时继续至末尾。仅加载当前选中的技能和本任务所需的模板/参考资料，引用路径相对于技能目录。不要修改内置资料。",
      "沿用当前会话模型及实际可用工具，不启动其他客户端，不要求安装 Codex。下述桌面适配决定工具映射和默认输出位置，原技能保留具体工作方法；可选外部连接必须以实际配置和调用结果为准。",
      adapter.replaceAll("{{SKILL}}", directory),
    ].join("\n\n");
  }
  if (!agent?.ready) throw new Error(agent?.kind === "perspective"
    ? "该思维框架的内置资料不完整，请恢复 desktop/specialists/perspectives 中的文件。"
    : "该智能体的本地组件尚未就绪，请在设置 → 应用与更新中下载智能体资源。");
  if (agent.kind === "perspective") {
    return [
      `当前用户选择的专用智能体：${agent.name}。保持本次会话上下文，用用户的语言完成任务。`,
      `技能目录：${path.dirname(agent.entry)}\n技能入口：${agent.entry}`,
      "这是用户已选择的思维框架，不需要再要求输入触发词。开始回答前，用 read 完整读取技能入口；如返回被截断，继续读取至文件末尾。已在当前上下文完整读取时可复用，压缩后缺失则重新读取。仅加载这一位，不加载其他人物框架。",
      "保留原技能的心智模型、决策方法、表达方式、事实核查、首次身份说明和退出规则。它是基于公开资料的模拟视角，不是本人或其真实意见；不得编造引文、来源或亲身经历。用户要求退出角色时遵从；后续除非用户再次要求，不要因卡片仍被选中而强制重新入戏。",
      "引用文件按任务需要读取，references 等相对路径以该技能目录为准，不是工作区或原 Codex 安装目录。不要修改内置资料。",
      "桌面适配：WebSearch/WebFetch 等名称是原技能的通用描述，使用当前实际提供的搜索与网页工具，不虚构工具或已完成的检索。涉及最新事实时先核查，无法核查就说明不确定性；纯框架讨论不需要联网。沿用用户当前聊天模型和凭据，不需要额外账户，不读取或输出密钥。",
    ].join("\n\n");
  }
  const runtime = runtimePaths(root);
  const sourceRoot = componentPaths()[id] || path.join(runtime.directory, id);
  const adapter = fs.readFileSync(path.join(root, "desktop/specialists", `${id}.md`), "utf8");
  return [
    `当前用户选择的专用智能体：${agent.name}。保持本次会话上下文，用用户的语言完成任务。`,
    `上游源码根目录：${sourceRoot}\n技能入口：${agent.entry}` + (fs.existsSync(runtime.python) ? `\n专用 Python：${runtime.python}` : "") + (fs.existsSync(runtime.orx) ? `\nOpenResearch CLI：${runtime.orx}` : ""),
    "开始相关任务前，用 read 读取上述技能入口以及当前阶段明确要求的引用文件。相对路径均相对于上游源码或技能目录，不是用户工作区。不要修改内置源码。",
    "调用 Python 时使用上述完整路径，或已加入本进程 PATH 的 python；Windows 不依赖 python3 命令。所有交付文件放在用户工作区。",
    "桌面版适配：使用当前已暴露的代理工具、web_search/fetch_content、image_settings/image_gen、subagent 和 shell；不要虚构 Claude/Codex/Feynman 专属工具。引用资料中的命令名称是流程说明，不代表它已注册为斜杠命令。",
    "先检查可调用工具再委派。只有实际启动了隔离的子代理才能称为独立审查。缺少外部账号、算力或工具时明确说明，不冒充已执行。不要读取或输出密钥。",
    adapter.replaceAll("{{SOURCE}}", sourceRoot).replaceAll("{{ORX}}", runtime.orx).replaceAll("{{PYTHON}}", runtime.python)
      .replaceAll("{{RUNTIME}}/hyperframes", componentPaths().hyperframes || path.join(runtime.directory, "hyperframes"))
      .replaceAll("{{RUNTIME}}", runtime.directory).replaceAll("{{NODE}}", node)
      .replaceAll("{{CREATOR_PYTHON}}", runtime.creatorPython).replaceAll("{{HYPERFRAMES}}", runtime.hyperframes),
  ].join("\n\n");
}

module.exports = { AGENTS, agentCatalog, agentInstructions, runtimePaths };
