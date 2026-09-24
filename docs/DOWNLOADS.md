# 下载与平台状态

[返回首页](../README.md)

当前应使用 **0.2.4**。0.2.3 仍指向已停用的旧资源服务器，不再作为本次分发版本。本文将客户端压缩包、智能体资源服务和各平台验收状态分别记录，不将本地文件当作已发布的 GitHub 下载。

## 现有压缩包

以下为本地 0.2.4 构建结果，客户端 ZIP 尚未上传为 GitHub Release 资产。大小按 MiB 计，1 MiB = 1,048,576 字节。

| 平台 | 文件名 | 压缩包大小 | 验证状态 |
| :--- | :--- | ---: | :--- |
| Windows x64 | `Jarod-Pi-0.2.4-Windows-x64.zip` | 320.7 MiB | 已完成本地启动、目录迁移与会话恢复验收 |
| Linux x64 | `Jarod-Pi-0.2.4-Linux-x64.zip` | 340.8 MiB | 候选；归档、架构与权限已校验，待实机运行验收 |
| macOS Apple Silicon | `Jarod-Pi-0.2.4-macOS-Apple-Silicon.zip` | 344.6 MiB | 候选；归档、架构与权限已校验，待实机运行验收 |
| macOS Intel | `Jarod-Pi-0.2.4-macOS-Intel.zip` | 347.7 MiB | 候选；归档、架构与权限已校验，待实机运行验收 |

三个系统对应四个包，因为 macOS 区分 Apple Silicon 与 Intel。Linux/macOS 还有部分专业智能体的原生运行资源待补齐；不能直接使用 Windows 原生资源。

## 0.2.3 与 0.2.4 的差别

0.2.4 将资源与更新地址迁移到 GitHub Releases，支持平铺资产名称、受限 HTTPS 重定向和断点续传。它没有另换一套聊天模型、推理强度、界面或智能体内容；两版内置资源目录的 SHA-256 一致。

2026-09-25 已确认首次 `app:prepare-agent: 资源 HTTP 404` 的原因：0.2.4 客户端已有 GitHub 地址，但资源仓库尚未发布对应 Release，实际 ZIP 不存在。不能通过降级到指向旧服务器的 0.2.3 解决。当前正在补齐资源发布和真实客户端联网验收。

<details>
<summary>0.2.4 本地构建 SHA-256</summary>

这些摘要只对应上述 0.2.4 文件。补齐远端资源不改变客户端 ZIP，不需要重新打包。

```text
6b93fde018e86427d0f18016cdbe58f0a63abfa9f60a85fb4a385f6112c2bad1  Jarod-Pi-0.2.4-Windows-x64.zip
f71ef5fb9c224751e1e045b8bfee7e604b8c068b60af50067e2a480e242bb1c3  Jarod-Pi-0.2.4-Linux-x64.zip
d39664e2da1e602788c584487fe0badf7530e7b3f0414c744677c83565843738  Jarod-Pi-0.2.4-macOS-Apple-Silicon.zip
2ba98f687c4b479524a5086045dd084fabdc282a70ca6a52e95ffaefbc9f5f57  Jarod-Pi-0.2.4-macOS-Intel.zip
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
