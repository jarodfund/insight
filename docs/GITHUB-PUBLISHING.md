# Insight GitHub 发布

[返回首页](../README.md)

## 仓库分工

| 仓库 | 用途 |
| :--- | :--- |
| [`jarodfund/insight`](https://github.com/jarodfund/insight) | 学术派（Insight）产品源码、双语首页和客户端 ZIP Releases |
| [`jarodfund/insight-components`](https://github.com/jarodfund/insight-components) | 适配智能体资源、签名清单和资源 Releases |

Insight 按自己的产品代码和发行流程维护。上游项目仅作为依赖和来源记录；不会向上游仓库推送 Insight 修改或触发上游发行流程。底层依赖与服务保留真实技术名，不等同于产品品牌。

## 0.2.7 当前状态

- 本地源码已将产品英文名、应用数据新目录、媒体输出目录、下载地址和便携包入口改为 Insight。
- 三个平台 ZIP 是本地候选，尚未通过 Windows 隔离启动及 Linux/macOS 原生系统验收，不应提前发布。
- 上传前确认产品仓库现有 Releases 与资产；不要修改资源仓库的既有 Release。
- 只有测试通过的资产才能发布。记录每个文件的完整大小与 SHA-256，并从公开 Release 下载复验。

## 安全发布清单

- 只提交产品源码、文档和已通过平台验收的 ZIP。
- 排除 `.env`、凭据、签名私钥、真实会话、浏览器状态、工作区个人文件、构建缓存和不相关的大文件。
- 检查 README 的截图及下载状态与实际版本一致。
- 旧 `Jarod-Pi` / `pi-desktop` 名称只可用于迁移既有用户数据；新路径、界面、输出和发布资产统一使用 Insight。
- 客户端版本和智能体资源 release 分开维护，不要因产品文案改名而覆盖已签名资源。
