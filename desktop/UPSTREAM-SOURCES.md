# 学术派内置智能体来源

这些链接用于维护源码镜像。客户端实际下载的是经过适配、带依赖的版本化资源包；仅把 GitHub 仓库 ZIP 放到服务器上还不足以安装。固定提交见 [sources.json](specialists/sources.json)，生成与发布步骤见 [RELEASE.md](RELEASE.md)。

| 分类 | 展示名称 | 原项目 |
| --- | --- | --- |
| 工作常用 | 一键制作原生PPTX | [hugohe3/ppt-master](https://github.com/hugohe3/ppt-master) |
| 工作常用 | 图片风格精美PPT | [ningzimu/codex-ppt-skill](https://github.com/ningzimu/codex-ppt-skill) |
| 工作常用 | 搜全网 | [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) |
| 工作常用 | 下全网 | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| 通用科研工作台 | 读论文、管实验、记过程 | [alphaXiv/OpenResearch](https://github.com/alphaXiv/OpenResearch) |
| 通用科研工作台 | 搜 arXiv、问 PDF、核对论文代码 | [advaitpaliwal/feynman](https://github.com/advaitpaliwal/feynman)，当前固定安装来源 |
| 通用科研工作台 | 写综述 / 初稿 / 模拟审稿 | [Imbad0202/academic-research-skills](https://github.com/Imbad0202/academic-research-skills) |
| 通用科研工作台 | 本地文献高准确问答 | [Future-House/paper-qa](https://github.com/Future-House/paper-qa) |
| 通用科研工作台 | 书籍转技能 | [virgiliojr94/book-to-skill](https://github.com/virgiliojr94/book-to-skill) |
| 通用科研工作台 | 标准化实验日志记录 | 本地 `nature-experiment-log` 完整快照；未提供公开仓库地址 |
| 通用科研工作台 | 多源交叉验证 | 本地 `nature-ref-verifier` 完整快照；未提供公开仓库地址 |
| 通用科研工作台 | 神级拷问 | [mattpocock/skills](https://github.com/mattpocock/skills)，`skills/productivity/grilling` |
| 大师思维框架 | 查理·芒格、纳瓦尔、马斯克、费曼 | [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill)，本地已安装 `examples` 快照 |
| 自媒体创作 | 一站式自媒体创作 | [ZJU-REAL/Easel](https://github.com/ZJU-REAL/Easel) |
| 自媒体创作 | 口播/课件神器 | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) |

人物和两个科研技能的快照均包含引用资料，不能只取入口 `SKILL.md`。原先另外四位人物的来源备份不在界面中提供入口。

工具扩展包另见 [ECOSYSTEM.md](ECOSYSTEM.md)：pi-web-access、Context7、Playwright、pi-subagents、MCP、pi-lens、待办、结构化提问和后台任务。它们随 `ecosystem` 资源包提供，不再要求使用者逐个安装。

共享 `specialist-runtime` 包提供 Python 解释器及依赖、OpenResearch CLI、FFmpeg、mcporter、Hyperframes CLI 和 Chromium。资源准备脚本已将本机虚拟环境转换成可迁移的 Windows 解释器目录，不要求终端用户自行安装 Python、Node 或这些 Python 包。Bash/Git 和各网站登录、云服务账户仍按实际任务需要配置；这类账户不会随资源包分发。

来源镜像与面向客户端的下载目录应分开存放。下载目录只放签名清单和脚本生成的资源 ZIP，不放开发者的设置、Key、浏览器登录态或签名私钥。
