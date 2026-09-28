# 下载与平台状态

[返回首页](../README.md)

当前源码版本为 **Insight 0.2.7**。以下 ZIP 是本地候选包；尚未发布到 GitHub Release，不能把本地文件当作正式下载。

## 本地候选包

文件目录：`E:\快进快出\.artifacts\Insight-0.2.7-Final-Candidate\`

| 平台 | 文件 | 大小 | 当前验证边界 |
| :--- | :--- | ---: | :--- |
| Windows x64 | `Insight-0.2.7-Windows-x64.zip` | 330,101,971 bytes | ZIP/CRC、源码替换和隔离启动已验收 |
| Linux x64 | `Insight-0.2.7-Linux-x64.zip` | 352,679,052 bytes | ZIP/CRC 已验收；尚未在 Linux 实机启动 |
| macOS Apple Silicon | `Insight-0.2.7-macOS-Apple-Silicon.zip` | 354,460,770 bytes | ZIP/CRC 已验收；尚未在 Apple Silicon 实机启动 |

当前没有 macOS Intel 包。重打包桌面源码不等于补齐 Linux/macOS 上所有专业智能体的本机依赖。

发布前需在隔离配置中启动 Windows 包；Linux 和 macOS 则需在对应机器启动验收。通过后才能上传至 [`jarodfund/insight Releases`](https://github.com/jarodfund/insight/releases)，并在此处提供正式下载链接和完整 SHA-256。

## 本地文件摘要

以下 SHA-256 与本地候选包逐字节对应；发布前从公开 Release 重新下载后仍需复验。

```text
12020bd427e6e9d3254306ed98b7b9a0fb9f5df5a3c4ca4fa31a85547738898d  Insight-0.2.7-Windows-x64.zip
b2086c35899d3081b729cac44fd59b89d21f0f149770ecc42524288ee61d4dee  Insight-0.2.7-Linux-x64.zip
34b367b46f88006321993ef9112a9790537b90503ea50212ae94e0f7b3b2d8ad  Insight-0.2.7-macOS-Apple-Silicon.zip
```

## 下载与使用

正式发布后，按系统和 CPU 架构下载完整 ZIP，并解压到普通用户可写目录。Windows 双击根目录的 `学术派.exe`；Linux/macOS 在解压目录运行 `bash 启动学术派.sh`。不要在压缩软件内直接运行，也不要只移动启动器。

Windows 个人数据目录为 `%APPDATA%\Insight`。工作成果保存在所选工作区；新生成图片和视频写入 `outputs/Insight/images` 与 `outputs/Insight/videos`。程序更新时退出旧版，将新版解压到新目录。删除程序目录不会删除个人会话、设置或工作区文件。

首次启动会尝试迁移旧版个人数据并保留原目录；冲突时不会静默覆盖。旧目录名只用于迁移识别，详见[免安装版说明](../desktop/PORTABLE.md)。
