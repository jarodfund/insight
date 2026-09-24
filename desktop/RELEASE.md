# 学术派 Windows 安装与更新

2026-09-23 分发方案改为 [0.2.0 Windows 免安装 ZIP](PORTABLE.md)。下文保留 0.1.x 安装版的构建与服务器记录；免安装版不使用 NSIS 更新通道，也不在启动时下载全部智能体。

本产品的中文名称是学术派，英文名称是 Jarod-Pi。程序入口为 `Jarod-Pi.exe`；安装包创建「学术派」桌面和开始菜单快捷方式，Windows「应用和功能」提供卸载入口。卸载保留个人数据和工作区成果，避免把论文、会话和媒体文件一起删除。

## 当前交付与边界

本次安装器、资源包、实测耗时与未验收项见 [RELEASE-VALIDATION.md](RELEASE-VALIDATION.md)。

2026-09-22 已发布 0.1.2 联网版，服务器资源目录为 `https://work.jarodfund.xyz/jarod-pi/components/`，更新目录为 `https://work.jarodfund.xyz/jarod-pi/windows/`。Windows 本机的在线安装、完整资源获取、界面暂停续传和卸载保留数据已通过；干净虚拟机和其他校园网络尚未验证。另准备 0.1.3 供真实跨版本升级验收，服务器续接说明见 [UPGRADE-SERVER-LLM.md](server-handoff/UPGRADE-SERVER-LLM.md)。构建时仍使用原 `.release-keys/components-public.pem`，源码的默认 release-config 为空，须设置构建环境变量。

- 标准 NSIS 安装包包含桌面外壳、原生代理和 Node/npm；不用 BAT 启动，不要求用户安装开发环境。默认菜单栏已移除，保留 Windows 正常标题栏、最小化、最大化和关闭。
- 大型智能体、浏览器和 Python 组件不进入主安装包；配置服务器后，在安装结束启动应用时自动下载，显示进度，可暂停和继续。基本聊天不等待资源下载；智能体资源就绪后重启生效。
- 在线安装入口使用 `nsis-web`，先下载主程序，再进入上述资源准备。这是“安装主程序 + 首次启动配置资源”两阶段流程，不是在 NSIS 窗口内执行 Python/npm 安装。
- 小安装入口降低首次下载门槛，不会消除完整环境的总下载量。资源包按组件复用，更新某个技能只下载其变化的包；共享运行时变化则重新下载共享运行时包。
- 应用更新由 electron-updater 提供差分下载；服务器、旧版文件和本地缓存支持时只下载变化块，无法差分时自动下载完整新版。不能保证每次更新都很小。
- `release-config.json` 默认为空。本地无服务器版本会明确显示「尚未配置服务器」，不会访问虚构地址。联网发布前需要下面的三个配置项。

## 数据目录

| 内容 | 位置 |
| --- | --- |
| 配置、凭据、历史、个人技能 | `%APPDATA%\Jarod-Pi` |
| 个人技能安装目录 | `%APPDATA%\Jarod-Pi\agent\skills` |
| 资源包与版本索引 | `%APPDATA%\Jarod-Pi\components` |
| 新安装默认工作区 | Windows 文档目录下 `Jarod-Pi\Workspace` |
| 新生成图片 / 视频 | 当前工作区 `outputs\Jarod-Pi\images` / `videos` |

第一次启动自动复制旧 `%APPDATA%\pi-desktop` 产品数据，迁移设置中的路径，保留原目录作为恢复副本。历史正文、加密 Key 不改写；旧附件路径继续可读。中断的迁移下次启动继续完成，已有新目录中的个人数据不会被覆盖。请暂时保留旧目录；不要再同时使用旧客户端写入它，以免产生两套独立历史。

原生引擎的技术标识、npm 包名、项目 `.pi` 规则与历史原文保持真实，不能全局替换成另一个词。它们不作为新产品的安装入口或个人数据目录。

## 你需要提供的服务器

准备一个 Windows 用户可以访问的 HTTPS 域名，静态文件服务器或对象存储即可，不需要部署模型服务。提供两个固定目录地址，例如下列占位地址，发布时换成你的实际域名：

```text
https://downloads.example.edu/jarod-pi/windows/
https://downloads.example.edu/jarod-pi/components/
```

要求：支持较大文件和 HTTP Range/206 断点请求，保持文件原始字节，不对 EXE、ZIP、blockmap 二次压缩；下载地址不做跨域跳转。清单短缓存或不缓存，带版本/哈希的文件长期缓存。客户端只请求发布资源，不将使用者的 JarodFund Key 发给该下载服务器。

```text
jarod-pi/
  windows/
    latest.yml
    Jarod-Pi-Setup-0.1.1-x64.exe
    Jarod-Pi-Setup-0.1.1-x64.exe.blockmap
    ...在线构建输出的 Web 安装器及 .nsis.7z（若采用在线入口）
  components/
    manifest.json
    packages/
      <sha256>.zip
```

上传时先传二进制文件，最后原子替换 `latest.yml` / `manifest.json`。保留旧版本及 blockmap，避免正在更新的用户读到不完整发布。私钥留在发布机或 CI 密钥存储，不放静态下载目录。

## 本地准备资源

以下命令从仓库根目录运行，使用已准备好的 Node 22。资源准备以当前经过测试的安装为输入，不会扫描使用者的文献或拷贝个人 Key。

个人技能目录不作为发布来源。临时添加的 `winui-design` 保留在开发者本机；资源准备、ZIP 生成及主程序打包均排除该技能目录，复用旧资源准备目录时也会过滤。内置的九项基础技能仍随 `ecosystem` 加载，但不显示为“我的智能体”卡片，具体清单见 [ECOSYSTEM.md](ECOSYSTEM.md)。

```powershell
$env:PATH = "$PWD\.tools\node-v22.23.2-win-x64;$env:PATH"
$env:JAROD_PI_HYPERFRAMES_BROWSER = '实际已安装的 chrome-headless-shell.exe 绝对路径'
node desktop/scripts/prepare-components.cjs E:/Jarod-Pi-Publish/source-1 "$env:APPDATA\Jarod-Pi\agent"
```

输出目录必须是新目录。若尚未启动新版完成迁移，最后一个参数可以指定旧的 `%APPDATA%\pi-desktop\agent`。开发机器需已有完整智能体安装、FFmpeg 和 Chromium；终端用户不执行该脚本。第一次已准备好的源码目录可直接复用 `.artifacts/Jarod-Pi-Resource-Source`。

`recipe.json` 列出各包源目录、版本、必需文件及整数 `release`。首次是 1，后续递增；技能快照内容变化必须重新生成 ZIP。源码 Git 提交和 Python/npm 依赖更新先在发布机验证，再准备资源。核心 API、适配器或依赖合同变化须同时更新主程序，不应只推资源。

创建资源签名密钥（只做一次；输出目录必须不存在）：

```powershell
node desktop/scripts/create-update-key.cjs E:/Jarod-Pi-Private
node desktop/scripts/publish-components.cjs E:/Jarod-Pi-Publish/source-1/recipe.json E:/Jarod-Pi-Publish/components E:/Jarod-Pi-Private/components-private.pem
```

脚本只在本地生成 ZIP、SHA-256、Ed25519 签名清单和公钥，不上传。备份私钥；换私钥需要通过新版主程序更新其受信任公钥。客户端先校验清单签名，再校验每个 ZIP 的大小与哈希；下载、解压、必要文件验证全部成功后才切换版本索引。失败保留旧资源，运行中任务使用原版本，用户结束任务后重启启用新资源。

本次已在 `E:\Pi\.release-keys` 生成密钥，未加入 Git；本次资源输出在 `.artifacts/Jarod-Pi-Components`。继续发布这批资源时使用对应 `components-public.pem`，不要另建一对不匹配的密钥。私钥目录不属于给用户的安装包或资源下载目录。

## 构建安装包

Windows x64 发布机：

```powershell
$env:PATH = "$PWD\.tools\node-v22.23.2-win-x64;$env:PATH"
npm ci --prefix desktop --ignore-scripts
$env:JAROD_PI_UPDATE_URL = 'https://你的域名/jarod-pi/windows/'
$env:JAROD_PI_COMPONENTS_URL = 'https://你的域名/jarod-pi/components/'
$env:JAROD_PI_COMPONENTS_PUBLIC_KEY_FILE = 'E:/Jarod-Pi-Private/components-public.pem'
node desktop/scripts/package-windows.cjs
# 或生成较小的在线入口：
node desktop/scripts/package-windows.cjs --web
```

输出分别位于 `.artifacts/Jarod-Pi-Windows` 和 `.artifacts/Jarod-Pi-Web`。可设置 `JAROD_PI_OUTPUT_DIR` 为新的绝对路径，将不同版本的验收构建分别保存；例如 `.artifacts/Jarod-Pi-Web-0.1.3`。`--dir` 只生成可运行目录供测试。只有标准包或在线包其中一套作为同一更新频道发布，不要把两个构建的 `latest.yml` 相互覆盖。网站上保留对应构建产生的全部发布文件。

上述命令假定发布机已有 `.pi-install` 原生运行时、`.tools/node-v22.23.2-win-x64` 和 Electron 二进制。`--ignore-scripts` 不下载 Electron 本体；换发布机时需要恢复经校验的构建环境或单独执行 Electron 官方安装步骤，仅复制仓库不足以重建安装包。

本地打包未配置 Windows 代码签名证书，不声称安装器已签名。需要校内信任分发或正式签名时，在发布机设置 electron-builder 的 `CSC_LINK`、`CSC_KEY_PASSWORD` 以及 `JAROD_PI_PUBLISHER`；发布者名称必须与证书一致。资源清单签名与 Windows 程序签名是两件事。

## 后续更新

主程序版本位于 `desktop/package.json`，独立于原 Pi 仓库的 npm 发布版本。修改后刷新 `desktop/package-lock.json`，运行全仓检查及相关桌面回归，再按上述命令打包。不会提交、打标签或推送原 Pi 项目。

使用者在「设置 → 应用与更新」检查并下载新版；下载期间可继续工作，所有窗口任务结束后才允许重启安装。已下载更新不会在普通退出时强制安装。资源更新也在这里检查、下载、暂停、重试和重启启用。

开发可以放到你的服务器或私有 Git 仓库；Windows 打包仍应交给 Windows 发布机/CI。静态下载服务器只负责分发文件，不在用户访问时现场编译。服务器就绪后，提供两个实际 URL；把公钥写入构建配置、上传首版资源并做一次从旧版本升级到新版的校内试装，才算完成联网发布。

维护参考：[electron-builder 自动更新](https://www.electron.build/docs/features/auto-update/)、[NSIS 26 安装器](https://www.electron.build/v26/docs/nsis/)。
