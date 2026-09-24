# 学术派免安装版

0.2.3 修正 JarodFund 51 个文本模型的推理档位缓存和请求适配。所有已列出的 `max-claude-*` 提供 low、medium、high、xhigh、max；GPT-6 和 Grok 4.6/4.7 保持此前约定，不显示 off。Claude 的“默认（不指定）”省略推理参数，不表示保证关闭内部推理；只有请求层测试、没有语义合同的模型在选择器提示中明确说明。启动和手动刷新都会修正旧缓存，无需删除个人配置或会话。

0.2.3 提供 Windows x64 ZIP，以及 Linux x64、macOS Apple Silicon、macOS Intel 候选 ZIP。Windows 完整解压后双击根目录的 `学术派.exe`；它是带产品图标的小型相对路径启动器，实际程序在 `runtime` 下。整个目录可移动，不能只移动启动器。Linux/macOS 使用终端运行 `bash 启动学术派.sh`。无需安装器，也无需用户安装 Node 或 Electron。

模型权限仍以账户同步列表为准；修正推理元数据不向账户添加不可用模型。基础资源沿用已签名的 release 2；程序更新清单使用 release 3。本版还修正 Anthropic 兼容接口重复拼接 `/v1` 的问题。测试使用本地模拟服务，不提交付费请求。

Linux/macOS 还需本平台实机验收及专用原生资源补齐，不能视为全功能正式版。macOS 内部保留官方 Electron.app，用户入口为脚本；没有为本产品额外签名、公证，系统安全提示仍可能出现。具体交接见 [服务器说明](server-handoff/PORTABLE-SERVER-LLM.md) 和 [原生资源合同](server-handoff/PORTABLE-NATIVE-RESOURCES.md)。

## 内容和数据

基础 Pi 运行时、Node/npm、生态工具、四位思维框架、两个科研技能及神级拷问随包提供。所有十八个内置卡片可见；其余卡片首次点击时下载依赖，显示进度。设置中的资源区可暂停、继续。下载不锁住会话，完成后在原会话选择并使用；若用户已切换会话或选择另一卡片，下载完成只提示就绪，不改变用户的新选择。

科研 Python、创作 Python、OpenResearch CLI、FFmpeg、搜索工具、Hyperframes CLI 和浏览器各自成包。多个智能体复用同一包，资源更新只下载所用且发生变化的包。签名校验、ZIP 哈希、断点续传和原子索引保证失败时仍能使用旧资源。现有任务保持原路径，空闲会话下次请求才启用新路径。

账户、会话、个人技能继续位于 `%APPDATA%\Jarod-Pi`；下载资源使用其中的 `portable-components`，程序更新 ZIP 位于 `portable-updates`。退出应用后删除解压目录即可移除程序，个人数据和工作区成果保留。这是免安装分发，不是把加密 Key 随 U 盘跨电脑迁移的模式。

## 构建

已有经过验证的 `.artifacts/Jarod-Pi-Resource-Source` 和 `.artifacts/Jarod-Pi-Components` 时，在 Windows 发布机运行：

```powershell
$env:Path = 'E:\Pi\.tools\node-v22.23.2-win-x64;' + $env:Path
node desktop/scripts/prepare-portable-components.cjs .artifacts/Jarod-Pi-Resource-Source .artifacts/Jarod-Pi-Components .artifacts/Jarod-Pi-Portable-Components-0.2.0 .release-keys/components-private.pem
$env:JAROD_PI_COMPONENTS_URL = 'https://work.jarodfund.xyz/jarod-pi/portable/components/'
$env:JAROD_PI_UPDATE_URL = 'https://work.jarodfund.xyz/jarod-pi/portable/updates/'
$env:JAROD_PI_COMPONENTS_PUBLIC_KEY_FILE = 'E:\Pi\.release-keys\components-public.pem'
node desktop/scripts/portable-dependencies.cjs .artifacts/portable-native-dependencies
node desktop/scripts/portable-catalogs.cjs .artifacts/portable-components-0.2.1 .release-keys/components-private.pem
node desktop/scripts/package-portable.cjs .artifacts/portable-components-0.2.1 .artifacts/Jarod-Pi-Portable-0.2.3
node desktop/scripts/package-unix-portable.cjs linux x64 .artifacts/Jarod-Pi-Portable-0.2.3 .artifacts/portable-components-0.2.1 .artifacts/Jarod-Pi-Portable-0.2.3/Jarod-Pi-0.2.3-Windows-x64
# macOS: replace linux x64 with darwin arm64 or darwin x64.
```

输出目录应新建且未被其他构建使用。`--reuse-build` 仅用于同一次构建中复用已经完成的 `build/win-unpacked`，不可用于复用旧版代码。资源拆包脚本为首个独立 portable 频道生成 release 1；以后根据完整配方重新发布并递增其 release，不能反复使用 release 1 覆盖已发布目录。

若仅更新客户端代码且资源未变，直接复用经过签名校验的资源目录，跳过资源重建。本次 0.2.3 的交付资源保存在 `.artifacts/Jarod-Pi-Portable-Handoff-0.2.3-20260924/public/jarod-pi/portable/components`，沿用前版的签名和摘要，未重新发布资源。复现构建时将命令中的组件目录替换为这个现成目录，不运行前面的资源重建步骤。

生成交接目录时，`prepare-portable-handoff.cjs` 的第五个参数指定程序更新清单的 release，必须高于前次发布；本次使用 `3`。它与资源清单的 release 独立。

## 更新与服务器

资源频道：`portable/components/portable-<target>.json`。程序频道：`portable/updates/portable-<target>.json`。两者均为 Ed25519 签名 envelope，schema 与现有资源格式相同；target 分别为 windows-x64、linux-x64、macos-arm64、macos-x64。资源和程序渠道必须匹配系统/CPU，不能复用 Windows 清单。二进制放在各自 `packages/<sha256>.zip`，先上传完整 ZIP，最后原子发布清单。未通过实机验收的平台不启用正式更新渠道。

本版的程序更新下载完整 ZIP，校验后定位文件，由使用者退出旧版并将新版解压到新目录。不会运行 NSIS、覆盖运行中的程序或删除旧程序。资源按包增量更新；主程序尚未提供 ZIP 内文件的差分更新。Linux/macOS 需要分别构建运行时、启动入口和平台资源并实测，不能直接使用此 Windows 包。

Windows 入口使用 .NET Framework 编译的小型 GUI 启动器，按自身所在目录查找 runtime/Jarod-Pi.exe。`portable-shortcut.cjs` 是旧版快捷方式实验，不用于当前交付；以真实移动目录后的启动测试为准。
