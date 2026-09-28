# 学术派 Insight 发布

产品中文名为学术派，英文名为 **Insight**。按操作系统和 CPU 架构发布免安装 ZIP；正式客户端资产放在 `jarodfund/insight` 的 GitHub Releases。当前发布状态和平台验收边界见[下载说明](../docs/DOWNLOADS.md)。

## 发布前检查

1. 审阅本次源码与依赖改动，排除 `.env`、API Key、签名私钥、会话、浏览器状态、个人输出、完整构建缓存和无关的大文件。
2. 检查每个 ZIP 的版本、`Insight` 产品路径、界面名、启动器、更新地址、文件权限和架构。
3. 使用临时 `INSIGHT_DATA_DIR` 做 Windows 首启测试，不读取或迁移维护者真实的 `%APPDATA%`。
4. Linux 与 macOS 必须在对应系统启动验收；归档结构校验不能代替实机验证。
5. 发布时记录完整字节数和 64 位 SHA-256；上传后从公开 Release 下载并复验。

## 便携包与独立资源

本产品分发 ZIP，不生成 NSIS 安装器。程序更新下载完整 ZIP，使用者退出旧版后解压到新目录启动；程序目录与个人数据分开。入口和迁移行为见[免安装版说明](PORTABLE.md)。

客户端 ZIP 发布在 `jarodfund/insight`；内置技能/工具的签名资源在独立 `jarodfund/insight-components` 仓库。本次改名不重新签署或覆盖已有资源 release。

## 品牌约束

新界面、启动器、压缩包、新个人数据路径、媒体输出路径及对外文档统一使用“学术派 / Insight”。旧名 `Jarod-Pi`、`jarod-pi` 与 `pi-desktop` 只允许留在旧用户数据迁移兼容逻辑或确有必要的历史说明中，不得成为新安装位置、界面文案或新资产名。Pi/JarodFund 等真实依赖和服务标识保留其技术名，不是产品英文名。
