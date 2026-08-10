# job_for_PHD

一个本地优先的求职与博士后申请工作台。它把候选人资料、简历版本、岗位筛选、PI/课题组研究、申请进度和后续跟进放在同一个 Dashboard 中，同时保留严格的人工确认边界。

> job_for_PHD 不是自动海投工具。它不会因为初始化完成就自动打开申请表、点击 Apply 或提交申请；最终提交始终需要用户明确批准。

## 主要能力

- 资料中心：首次启动分步初始化，以后可随时修改。
- 本地简历解析：支持 DOCX 和文本型 PDF，不使用云端 AI，不覆盖源文件。
- 双重就绪状态：分别显示“找岗位已就绪”和“投递事实已完整”；两者都不等于授权自动提交。
- 企业岗位看板：岗位发现、筛选、投递、面试日程、Offer/拒绝和后续行动。
- 博士后管线：PI/Group、Institute、Research fit、Funding、公开职位/套磁、联系、回复、面试、Research statement、推荐信和跟进。
- 博士后预设：CERN、PSI、GSI、DESY、高校，以及探测器电子学、质子治疗和仪器方向。预设只是检索入口，不代表存在真实开放岗位。
- 私有数据隔离：运行时资料统一保存在 `user-data/`，公开仓库只保留代码和空白模板。

## Windows 安装

1. 安装 Node.js 20.16 或更高版本，并确保 `node` 和 `npm` 可在命令行使用。
2. 双击根目录的 `install.bat`。
3. 安装脚本会安装锁定依赖、创建或迁移私有数据，然后打开 `http://localhost:8420/dashboard.html`。
4. 日常使用可双击 `启动 job_for_PHD.bat`。

安装和启动脚本均为幂等操作，不会覆盖已经存在的个人资料。服务仅监听 `127.0.0.1`。

## 数据目录

```text
user-data/
├── profile.json                 候选人事实源
├── preferences.json             求职、博士后和安全策略
├── onboarding.json              初始化状态
├── resumes/                     私有简历及版本索引
├── agent/                       供 AI Agent 使用的兼容文件
└── dashboard/                   真实岗位和博士后 CSV
```

`user-data/`、`my-materials/`、`.runtime/` 和旧版私人配置文件均被 Git 忽略。不要使用 `git add -f` 强制提交这些内容。

## Agent 使用方式

让支持本地文件的 AI Agent 读取 `SKILL.md`：

```text
请读取 SKILL.md，并按照 references/setup-workflow.md 使用我的本地资料。
先完成最低可用配置；未经我明确同意，不要打开申请表或提交申请。
```

运行时事实位于 `user-data/agent/`，Dashboard 数据位于 `user-data/dashboard/`。Agent 不应把个人数据写入 `templates/`。

## 开发

```bash
npm ci
npm test
npm start
```

Dashboard 使用原生 HTML/CSS/JavaScript；本地 Node 服务提供 JSON、简历上传和 CSV 写入接口。简历解析依赖仅在本机运行。

## 安全与隐私

- 不猜测姓名、工作许可、签证、薪资、学历日期或身份披露信息。
- 不绕过 CAPTCHA、Cloudflare、登录、2FA 或站点控制。
- 不把收藏、跟踪、套磁计划或打开过的页面记为已投递。
- 不把“准备联系 PI”记为“已联系”。
- 不把尚未核实的经费或开放状态写成确定事实。
- 不在公开仓库、Issue 或截图中发布简历、联系方式、申请记录、Cookie、OTP 或绝对私人路径。

完整边界见 `references/safety-and-boundaries.md`。

## 来源与许可证

本项目采用 MIT License，是 Yvonne He 的开源 *ApplyPilot* 工作流以及 DanielPan12 的 JobHuntBot 改编版本的进一步衍生。原始版权声明和许可文本完整保留在 `LICENSE` 中，并增加了 job_for_PHD 改编版本的版权行。上游作者不为本项目背书。

MIT 允许使用、修改和再分发，但分发的软件副本或实质部分必须保留版权和许可声明。

---

## English

job_for_PHD is a local-first dashboard and agent workflow for industry jobs and postdoctoral applications. It includes interactive onboarding, private local resume parsing, job tracking, a dedicated PI/group postdoc pipeline, and explicit human approval before any final submission.

Install Node.js 20.16+, run `install.bat`, and use `启动 job_for_PHD.bat` for later launches. Private runtime data stays under the git-ignored `user-data/` directory.

This project is an MIT-licensed derivative of Yvonne He's ApplyPilot workflow and DanielPan12's JobHuntBot adaptation. See `LICENSE` for preserved attribution and license terms. No upstream endorsement is implied.
