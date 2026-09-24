const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { _electron } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { SessionManager } = require("../../.pi-install/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js");
const { writeJson } = require("../src/agent-config.cjs");
const { entries } = require("../test/jarod-reasoning-fixture.cjs");

// Real application rendering, isolated demo sessions, fake credentials, no inference.
// Do not seed generated media or edit the DOM to imply successful model output.
(async () => {
  const root = path.resolve(__dirname, "../..");
  const staging = path.join(root, ".artifacts");
  fs.mkdirSync(staging, { recursive: true });
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(staging, "github-demo-")));
  const output = path.join(root, "docs/assets/screenshots");
  fs.mkdirSync(output, { recursive: true });
  const research = path.join(directory, "组会与论文");
  const creation = path.join(directory, "内容创作");
  fs.mkdirSync(research);
  fs.mkdirSync(creation);
  writeJson(path.join(directory, "desktop-settings.json"), { cwd: research, permissionMode: "ask" });
  writeJson(path.join(directory, "agent/settings.json"), { skills: ["!**"] });
  const example = [
    "## 从研究材料，到一场清晰的组会汇报",
    "先组织论证，再决定页面。建议把 15 分钟留给 **一个问题、三组证据、下一步实验**。",
    "| 汇报章节 | 核心问题 | 推荐交付 |\n| --- | --- | --- |\n| 研究背景 | 为什么值得做？ | 问题与文献对照表 |\n| 方法与证据 | 结论靠什么成立？ | 方法流程、原生图表 |\n| 讨论与计划 | 哪些仍需验证？ | 局限与实验清单 |",
    "### 可以这样继续",
    "1. 放入论文和实验记录，逐条核对证据与引用。\n2. 选择「一键制作原生PPTX」，先做三页样稿。\n3. 确认叙事后再完成演示，保留可编辑的文件。",
    "> 这是界面展示用的示例对话，尚未读取真实论文或生成文件。",
  ].join("\n\n");
  for (const item of [
    { cwd: creation, title: "科普短片 · 选题与分镜", prompt: "围绕一个科学问题，规划一分钟科普短片。", reply: "示例任务：先明确受众，再整理事实依据，最后设计分镜与素材清单。" },
    { cwd: research, title: "文献核验 · 引用与证据", prompt: "整理文献核验的检查清单。", reply: "示例任务：逐字段核对作者、标题、年份、卷期、页码与 DOI，并记录来源和差异。" },
    { cwd: research, title: "组会汇报 · 从论文到讲稿", prompt: "把研究材料整理成 15 分钟的组会汇报。先给我结构建议，再一起做可编辑的 PPT。", reply: example },
  ]) {
    const session = SessionManager.create(item.cwd, path.join(directory, "agent/sessions/demo"));
    session.appendModelChange("jarodfund", "gpt-6-sol");
    session.appendMessage({ role: "user", content: item.prompt, timestamp: Date.now() });
    session.appendMessage({ role: "assistant", content: [{ type: "text", text: item.reply }], api: "openai-completions", provider: "jarodfund", model: "gpt-6-sol", stopReason: "stop", timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    session.appendSessionInfo(item.title);
  }
  let electron;
  const captures = [];
  const errors = [];
  const network = [];
  try {
    electron = await _electron.launch({
      executablePath: path.join(root, "desktop/node_modules/electron/dist/electron.exe"),
      args: [path.join(root, "desktop/test/electron-fixture.cjs"), "--force-device-scale-factor=1"],
      env: { ...process.env, PI_DESKTOP_TEST_HOME: directory, PI_DESKTOP_TEST_ENDPOINT: "http://127.0.0.1:1/v1", PI_DESKTOP_TEST_IMAGES: "1", PI_DESKTOP_TEST_VIDEOS: "1" },
    });
    const page = await electron.firstWindow();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.waitForFunction(() => document.querySelector("#sendButton") && !document.querySelector("#sendButton").disabled);
    await electron.evaluate((_host, models) => {
      globalThis.fixtureCatalogEntries = [...models,
        ...["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gemini-3-pro-image-preview", "gemini-3.1-flash-image-preview", "grok-imagine-image", "grok-imagine-image-quality", "grok-imagine-video-1.5", "seedance2.5", "omni-flash", "minimax-h3"].map((id) => ({ id, supported_endpoint_types: ["openai"] }))];
    }, entries);
    await page.locator("#apiKeyInput").fill("desktop-test-key");
    await page.locator("#connectKeyButton").click();
    await page.waitForFunction(() => document.querySelector("#keyFeedback").textContent.includes("51 个可用模型"));
    await page.locator(".close-button").click();
    await page.locator("#modelSelect").selectOption("gpt-6-sol");
    await page.waitForFunction(() => document.querySelector("#modelInput").value === "gpt-6-sol");
    await page.locator("#thinkingSelect").selectOption("high");
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1800, 1060));
    await page.waitForFunction(() => innerWidth === 1800 && innerHeight === 1060);
    if (!await page.locator("#agentsPanel").isVisible()) await page.locator("#agentsToggle").click();
    assert.equal(await page.locator(".agent-card:visible").count(), 18);

    const capture = async (name, locator) => {
      await page.mouse.move(4, 4);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector("#toast").classList.contains("hidden"));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const visible = await page.locator("body").innerText();
      assert.doesNotMatch(visible, /C:\\Users\\Administrator|sk-[A-Za-z0-9_-]{16,}|desktop-test-key/);
      const file = path.join(output, `${name}.png`);
      const started = Date.now();
      let bounds;
      if (locator) {
        bounds = await locator.boundingBox();
        assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
        await locator.screenshot({ path: file });
      } else {
        bounds = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        await page.screenshot({ path: file });
      }
      const stat = fs.statSync(file);
      assert.ok(stat.isFile() && stat.size > 0 && stat.mtimeMs >= started - 1000);
      const decoded = await electron.evaluate(({ nativeImage }, file) => {
        const image = nativeImage.createFromPath(file);
        return { empty: image.isEmpty(), ...image.getSize() };
      }, file);
      assert.equal(decoded.empty, false);
      assert.ok(Math.abs(decoded.width - bounds.width) < 2 && Math.abs(decoded.height - bounds.height) < 2);
      const record = { file: path.relative(root, file).replaceAll("\\", "/"), width: decoded.width, height: decoded.height, bytes: stat.size, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"), crop: Boolean(locator), resized: false };
      captures.push(record);
      console.log(JSON.stringify(record));
    };

    await capture("workbench");
    await page.locator(".session-open").filter({ hasText: "组会汇报 · 从论文到讲稿" }).click();
    await page.waitForFunction(() => document.querySelector(".formatted table") && !document.querySelector("#sendButton").disabled);
    await page.locator("#agentSearch").fill("通用科研工作台");
    assert.equal(await page.locator(".agent-card:visible").count(), 8);
    await page.locator("#chatPanel").evaluate((node) => { node.scrollTop = 0; });
    await capture("research");
    await capture("research-agents", page.locator("#agentsPanel"));
    await page.locator("#agentSearch").fill("");
    await page.locator("#agentsToggle").click();
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960));
    await page.waitForFunction(() => innerWidth === 1440 && innerHeight === 960);
    await capture("conversation-dark");

    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.locator("#settingsButton").click();
    await page.locator('.settings-nav a[href="#imageSettings"]').click();
    await page.locator("#imageModelSelect").selectOption("gpt-image-2.5-flare");
    await page.locator("#imageOption-size").selectOption("2048x1152");
    await page.locator("#imageSettings .advanced-options summary").click();
    await page.locator("#imageOption-quality").selectOption("xhigh");
    await page.locator("#imageOption-background").selectOption("opaque");
    assert.match(await page.locator("#imageOption-size option:checked").textContent(), /2K.*16:9/);
    await capture("image-settings", page.locator("#imageSettings"));
    await page.locator('.settings-nav a[href="#videoSettings"]').click();
    await page.locator("#videoModelSelect").selectOption("seedance2.5");
    await capture("video-settings", page.locator("#videoSettings"));
    assert.deepEqual(errors, []);
    assert.deepEqual(network, [], "No renderer HTTP requests during documentation capture");
    const report = {
      version: require("../package.json").version, capturedAt: new Date().toISOString(),
      source: "Real Electron application using desktop/test/electron-fixture.cjs", demoContent: true,
      modelCatalog: "Local acceptance fixture; not a live account or availability claim", paidCalls: 0,
      userData: "New isolated temporary profile; removed after capture", captures,
    };
    writeJson(path.join(output, "verification.json"), report);
    console.log(`PASS: ${captures.length} verified screenshots; no paid calls or personal sessions.`);
  } finally {
    if (electron) await electron.close();
    const relative = path.relative(staging, directory);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(directory).startsWith("github-demo-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
