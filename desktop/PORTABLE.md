# 学术派 Insight 免安装版

产品中文名为学术派，英文名为 Insight。当前版本与平台验收状态见[下载说明](../docs/DOWNLOADS.md)。ZIP 内含 Electron 和 Node 运行时，不安装到系统目录，也不要求用户额外安装运行环境。

## 启动

- Windows x64：完整解压后双击根目录的 `学术派.exe`。启动器按相对路径运行 `runtime/Insight.exe`；整个文件夹可移动，不要单独移动启动器。
- Linux x64：在解压目录运行 `bash 启动学术派.sh`。
- macOS Apple Silicon：在解压目录运行 `bash 启动学术派.sh`。内部使用 Electron.app 运行时；产品未签名或公证，首次运行可能出现系统安全提示。

不要在压缩软件内直接运行，也不要使用 `sudo`。

## 新路径与旧数据迁移

新个人数据目录使用 `Insight`。Windows 为 `%APPDATA%\Insight`；macOS/Linux 使用 Electron 为 Insight 解析的用户数据目录。默认工作区位于用户文档目录下的 `Insight/Workspace`。新生成图片和视频保存在当前工作区的 `outputs/Insight/images` 与 `outputs/Insight/videos`。

首次启动会从本机存在的 `Jarod-Pi`、`jarod-pi` 或 `pi-desktop` 旧目录中选择包含学术派配置、技能或会话的目录进行迁移。这些旧名只存在于迁移兼容逻辑，不会用于新目录或界面。迁移保留加密凭据、技能、会话、索引、视频任务、下载资源及部分下载文件，并更新受支持配置中的绝对路径。可重建的旧运行时投影不复制，避免留下指向旧目录的链接。

迁移不会删除旧目录或改写历史会话正文。遇到目标数据冲突时停止并报告，不静默覆盖；中断后会根据迁移日志继续。完成后请检查工作区与个人技能。不要同时使用旧客户端写入旧数据目录。

退出应用后删除解压目录即可移除程序，个人数据和工作区成果仍保留。更新时退出旧版，将新版解压至新目录再启动。

## 本地重打包

维护者需要一个已验证的各平台旧版运行时 ZIP。重打包脚本替换当前桌面源码和产品清单，但不编译 Electron、不更新平台原生依赖，也不能替代实机验收。每个平台输出到新的空目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/scripts/repack-insight.ps1 `
  -InputZip 'E:/path/to/Insight-0.2.6-Windows-x64.zip' `
  -OutputDirectory 'E:/build/Insight-0.2.7' -Target Windows-x64

powershell -NoProfile -ExecutionPolicy Bypass -File desktop/scripts/repack-insight.ps1 `
  -InputZip 'E:/path/to/Insight-0.2.6-Linux-x64.zip' `
  -OutputDirectory 'E:/build/Insight-0.2.7' -Target Linux-x64

powershell -NoProfile -ExecutionPolicy Bypass -File desktop/scripts/repack-insight.ps1 `
  -InputZip 'E:/path/to/Insight-0.2.6-macOS-Apple-Silicon.zip' `
  -OutputDirectory 'E:/build/Insight-0.2.7' -Target macOS-Apple-Silicon
```

逐包核验 ZIP、包内版本、源码摘要、资源更新地址、运行入口、个人数据路径和平台架构。客户端 ZIP 进入 `jarodfund/insight` Release；智能体资源清单和资源包属于独立的 `jarodfund/insight-components` Release。
