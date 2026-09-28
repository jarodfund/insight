# Insight 0.2.7 候选包验证

记录日期：2026-09-28。本记录描述本地候选，不代表已公开发布。

## 已完成

- 从 0.2.6 平台运行时 ZIP 生成 Windows x64、Linux x64 和 macOS Apple Silicon 0.2.7 候选包。
- 包内替换桌面源码、应用版本、资源清单和 Insight 更新/资源地址；新生成的 Windows 主程序文件名为 `runtime/Insight.exe`，Linux/macOS 启动脚本使用 `INSIGHT_PRODUCT_ROOT`。
- 旧配置迁移的隔离测试通过，覆盖加密凭据、会话与索引路径、资源缓存/断点文件、旧运行时投影排除、旧目录保留和不重复迁移。
- PowerShell 打包脚本解析通过；`git diff --check` 通过。

## 尚未完成

- Linux x64 和 macOS Apple Silicon 尚未在原生系统启动；macOS Intel 本轮未构建。
- 尚未上传客户端 GitHub Release，也未从 Release 下载复验。
- `npm run check` 因当前克隆缺少安装依赖而停在找不到 Biome；迁移测试使用 Node 内置测试单独通过。

## 本地候选包

路径：`E:\快进快出\.artifacts\Insight-0.2.7-Final-Candidate\`

| 文件 | 字节 | 完整 SHA-256 |
| :--- | ---: | :--- |
| `Insight-0.2.7-Windows-x64.zip` | 330101971 | `12020bd427e6e9d3254306ed98b7b9a0fb9f5df5a3c4ca4fa31a85547738898d` |
| `Insight-0.2.7-Linux-x64.zip` | 352679052 | `b2086c35899d3081b729cac44fd59b89d21f0f149770ecc42524288ee61d4dee` |
| `Insight-0.2.7-macOS-Apple-Silicon.zip` | 354460770 | `34b367b46f88006321993ef9112a9790537b90503ea50212ae94e0f7b3b2d8ad` |

三份 ZIP 已完成全量条目读取与 CRC 校验；Windows 包另完成 62 个源码文件的逐文件 SHA-256 比对和隔离启动检查。Linux/macOS 尚未在原生系统启动。
