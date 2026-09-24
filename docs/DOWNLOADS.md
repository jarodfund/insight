# 下载与平台状态

[返回首页](../README.md)

截至 2026-09-24，GitHub 首次发布仍在准备中，正式下载链接尚未上线。本页不将未发布的地址标作可用下载，也不将 Linux / macOS 候选包描述为已全面验收的正式版。

## 现有压缩包

以下为本地 0.2.3 构建结果，不是 GitHub 已发布资产。大小按 MiB 计，1 MiB = 1,048,576 字节。

| 平台 | 文件名 | 压缩包大小 | 验证状态 |
| :--- | :--- | ---: | :--- |
| Windows x64 | `Jarod-Pi-0.2.3-Windows-x64.zip` | 320.7 MiB | 已完成本地启动、迁移与会话恢复验收 |
| Linux x64 | `Jarod-Pi-0.2.3-Linux-x64.zip` | 340.8 MiB | 候选；归档结构已校验，待实机运行验收 |
| macOS Apple Silicon | `Jarod-Pi-0.2.3-macOS-Apple-Silicon.zip` | 344.6 MiB | 候选；归档结构已校验，待实机运行验收 |
| macOS Intel | `Jarod-Pi-0.2.3-macOS-Intel.zip` | 347.7 MiB | 候选；归档结构已校验，待实机运行验收 |

三个系统对应四个包，因为 macOS 区分 Apple Silicon 与 Intel。Linux/macOS 还有部分专业智能体的原生运行资源待补齐；不能直接使用 Windows 原生资源。

**当前 0.2.3 构建仍使用旧资源服务器地址。** GitHub 下载源适配及重新打包完成前，不应把这些 ZIP 标为“已支持 GitHub 资源下载”。下载客户端和下载智能体资源是两条独立链路，必须分别验证。

<details>
<summary>现有 0.2.3 本地构建 SHA-256</summary>

这些摘要只对应上述现有构建。更改下载配置并重新打包后，必须生成新摘要和版本，不可沿用。

```text
31805d5ac9f6abd5611d83d9323a318f55298570e9e66ae5c66bcb27728773ea  Jarod-Pi-0.2.3-Windows-x64.zip
cde009ea08c83ef87c4afa1dabe6cce8d61a2a4dc2589e8a6f6a5725f6d0eeac  Jarod-Pi-0.2.3-Linux-x64.zip
ad85847c87b9a6ab8c885166f877337936b8ba15fac23ec4b09f0d2be2abf0cf  Jarod-Pi-0.2.3-macOS-Apple-Silicon.zip
1531a453e48b0cbf557fdf9990966998a15f5ce8502db7e70023a23ba7bb8cbf  Jarod-Pi-0.2.3-macOS-Intel.zip
```

</details>

## 发布后的使用流程

1. 从项目正式 Release 选择对应系统和处理器的 ZIP，并核对随版摘要。
2. 完整解压到普通用户可写的目录。不要在压缩软件里直接运行，也不要只复制启动文件。
3. Windows 双击根目录的 `学术派.exe`；Linux/macOS 在解压目录运行 `bash 启动学术派.sh`。
4. 在设置中填入自己的 JarodFund Key，点击验证并连接，选择工作区和模型。
5. 选取智能体并说明目标。大型资源按需下载；可暂停、继续，已安装的共享资源可复用。

基础包随附 Node 与 Electron，无需使用者另行安装。Linux 仍需可用的桌面图形环境和系统依赖。macOS 的终端入口内部仍使用 Electron.app，脚本启动不会消除系统安全检查；本产品尚未额外签名、公证，可能出现系统提示。

## 数据与升级

- Windows 个人数据位于 `%APPDATA%\Jarod-Pi`，工作成果保存在所选工作区。程序目录与个人数据分开。
- 更新主程序时退出旧版，将新版完整解压到新目录，再启动；不要覆盖仍在运行的程序。
- 当前主程序更新下载完整 ZIP；智能体资源按包更新，不等于主程序已实现文件级差分更新。
- 移除程序只需退出后删除解压目录，个人会话、技能及工作成果不会因此自动删除。
- 不要将自己的 Key、会话、浏览器登录态或私人工作文件重新压入分发包。

详见[免安装版说明](../desktop/PORTABLE.md)和[使用说明](../desktop/README.md)。
