# 学术派免安装版

当前修正版为 **0.2.5**，客户端与资源的实际发布状态以[下载说明](../docs/DOWNLOADS.md)为准。0.2.4 将下载地址迁移到 GitHub；0.2.5 进一步让资源和程序更新下载遵循系统网络代理，保留签名、摘要与断点续传校验。0.2.3 指向已停用的旧服务器，不再建议分发。

0.2.5 提供 Windows x64 ZIP，以及 Linux x64、macOS Apple Silicon、macOS Intel 候选 ZIP。Windows 完整解压后双击根目录的 `学术派.exe`；它是带产品图标的小型相对路径启动器，实际程序在 `runtime` 下。整个目录可移动，不能只移动启动器。Linux/macOS 使用终端运行 `bash 启动学术派.sh`。无需安装器，也无需用户安装 Node 或 Electron。

0.2.5 保留 0.2.3 的模型修正：51 个文本模型的推理档位缓存和请求适配、已列出的 `max-claude-*` 五档配置，以及 Anthropic 兼容接口重复拼接 `/v1` 的修复。GPT-6 与 Grok 4.6/4.7 保持此前约定，不显示 off；Claude 的“默认（不指定）”省略推理参数，不保证关闭内部推理。模型权限仍以账户同步列表为准，无需清除个人配置或会话。基础资源仍为签名 release 2；资源编号与客户端版本、程序更新清单编号相互独立。

Linux/macOS 还需本平台实机验收及专用原生资源补齐，不能视为全功能正式版。macOS 内部保留官方 Electron.app，用户入口为脚本；没有为本产品额外签名、公证，系统安全提示仍可能出现。[旧服务器交接](server-handoff/PORTABLE-SERVER-LLM.md)保留作历史记录，不再代表当前下载源；平台缺项见[原生资源合同](server-handoff/PORTABLE-NATIVE-RESOURCES.md)。

## 内容和数据

基础 Pi 运行时、Node/npm、生态工具、四位思维框架、两个科研技能及神级拷问随包提供。所有十八个内置卡片可见；其余卡片首次点击时下载依赖，显示进度。设置中的资源区可暂停、继续。下载不锁住会话，完成后在原会话选择并使用；若用户已切换会话或选择另一卡片，下载完成只提示就绪，不改变用户的新选择。

科研 Python、创作 Python、OpenResearch CLI、FFmpeg、搜索工具、Hyperframes CLI 和浏览器各自成包。多个智能体复用同一包，资源更新只下载所用且发生变化的包。签名校验、ZIP 哈希、断点续传和原子索引保证失败时仍能使用旧资源。现有任务保持原路径，空闲会话下次请求才启用新路径。

账户、会话、个人技能继续位于 `%APPDATA%\Jarod-Pi`；下载资源使用其中的 `portable-components`，程序更新 ZIP 位于 `portable-updates`。退出应用后删除解压目录即可移除程序，个人数据和工作区成果保留。这是免安装分发，不是把加密 Key 随 U 盘跨电脑迁移的模式。

## 构建

本次仅修正客户端，复用经过验证的 release 2 资源，不重新生成签名或更改 ZIP。以下为本地复现命令，需要发布机已有对应资源、平台依赖和公钥：

```powershell
$env:Path = 'E:\Pi\.tools\node-v22.23.2-win-x64;' + $env:Path
$env:JAROD_PI_COMPONENTS_URL = 'https://github.com/jarodfund/jarod-pi-components/releases/latest/download/'
$env:JAROD_PI_UPDATE_URL = 'https://github.com/jarodfund/jarod-pi/releases/latest/download/'
$env:JAROD_PI_COMPONENTS_PUBLIC_KEY_FILE = 'E:\Pi\.release-keys\components-public.pem'
node desktop/scripts/portable-dependencies.cjs .artifacts/portable-native-dependencies
$resourceDirectory = '.artifacts/Jarod-Pi-Portable-Handoff-0.2.3-20260924/public/jarod-pi/portable/components'
node desktop/scripts/package-portable.cjs $resourceDirectory .artifacts/Jarod-Pi-Portable-0.2.5
node desktop/scripts/package-unix-portable.cjs linux x64 .artifacts/Jarod-Pi-Portable-0.2.5 $resourceDirectory .artifacts/Jarod-Pi-Portable-0.2.5/Jarod-Pi-0.2.5-Windows-x64
# macOS: replace linux x64 with darwin arm64 or darwin x64.
```

输出目录应新建且未被其他构建使用。`--reuse-build` 仅用于同一次构建中复用已经完成的 `build/win-unpacked`，不可用于复用旧版代码。资源拆包脚本为首个独立 portable 频道生成 release 1；以后根据完整配方重新发布并递增其 release，不能反复使用 release 1 覆盖已发布目录。

上述资源目录名称保留 0.2.3，是资源首次整理时的文件夹名，不表示本次客户端仍为 0.2.3。客户端版本读取 `desktop/package.json`；资源 release 读取签名目录。

生成程序更新清单时，`prepare-portable-handoff.cjs` 的第五个参数指定其 release，必须高于前次发布；不能复用旧编号覆盖已发布内容。客户端 ZIP 尚未发布到 GitHub 时，不能将更新源已配置描述为在线升级已可用。

## 更新与服务器

当前资源频道为 `jarodfund/jarod-pi-components` 的 GitHub Release，程序频道为 `jarodfund/jarod-pi` 的独立 Release。两者均按平台请求 `portable-<target>.json`，使用 Ed25519 签名 envelope；target 为 windows-x64、linux-x64、macos-arm64、macos-x64。资源和程序渠道必须匹配系统/CPU，不能复用 Windows 清单。

签名目录内的规范路径 `packages/<sha256>.zip` 由下载器映射到 GitHub 平铺资产 `<sha256>.zip`，并只跟随受信任的 HTTPS CDN 重定向。先上传并校验所有资产，再公开 Release；资源发布与客户端 ZIP 发布分别验收。未通过实机验收的平台不启用正式更新渠道。国内镜像尚未配置。

本版的程序更新下载完整 ZIP，校验后定位文件，由使用者退出旧版并将新版解压到新目录。不会运行 NSIS、覆盖运行中的程序或删除旧程序。资源按包增量更新；主程序尚未提供 ZIP 内文件的差分更新。Linux/macOS 需要分别构建运行时、启动入口和平台资源并实测，不能直接使用此 Windows 包。

Windows 入口使用 .NET Framework 编译的小型 GUI 启动器，按自身所在目录查找 runtime/Jarod-Pi.exe。`portable-shortcut.cjs` 是旧版快捷方式实验，不用于当前交付；以真实移动目录后的启动测试为准。
