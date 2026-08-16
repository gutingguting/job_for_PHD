# job_for_PHD

当前版本：**v1.2.0**

一个本地优先的求职与博士后申请工作台。它把候选人资料、简历版本、岗位筛选、PI/课题组研究、申请进度和后续跟进放在同一个 Dashboard 中，同时保留严格的人工确认边界。

> job_for_PHD 不是自动海投工具。它不会因为初始化完成就自动打开申请表、点击 Apply 或提交申请；最终提交始终需要用户明确批准。

## 主要能力

- 资料中心：首次启动分步初始化，以后可随时修改。
- 本地简历解析：支持 DOCX 和文本型 PDF，不使用云端 AI，不覆盖源文件。
- 双重就绪状态：分别显示“找岗位已就绪”和“投递事实已完整”；两者都不等于授权自动提交。
- 企业岗位看板：岗位发现、筛选、投递、面试日程、Offer/拒绝和后续行动。
- 状态与阶段分离：直接在岗位卡片更新真实投递状态；Submitted 必须记录日期和确认依据。
- Outlook 面试收件箱：本地识别中英文面试邮件和 ICS，人工确认后同步到软件日程及 Outlook Calendar。
- 博士后管线：PI/Group、Institute、Research fit、Funding、公开职位/套磁、联系、回复、面试、Research statement、推荐信和跟进。
- 博士后严格白名单：资料中心保存的研究方向是硬约束；如果填写目标机构，它也成为硬约束。相邻领域、候选人技能和关键词重叠不会扩大检索范围。
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
├── dashboard/                   真实岗位、状态历史和日程 CSV
├── integrations/                Outlook 非敏感配置和 DPAPI 加密令牌
├── mail/                        结构化邮件确认队列（不保存完整正文）
└── backups/                     数据结构升级前的一次性备份
```

`user-data/`、`my-materials/`、`.runtime/` 和旧版私人配置文件均被 Git 忽略。不要使用 `git add -f` 强制提交这些内容。

## Agent 使用方式

让支持本地文件的 AI Agent 读取 `SKILL.md`：

```text
请读取 SKILL.md，并按照 references/setup-workflow.md 使用我的本地资料。
先完成最低可用配置；未经我明确同意，不要打开申请表或提交申请。
```

运行时事实位于 `user-data/agent/`，Dashboard 数据位于 `user-data/dashboard/`。Agent 不应把个人数据写入 `templates/`。

### 特别需求

在“资料中心 → 求职目标 → 特别需求”填写额外筛选条件，例如“不得投文职；优先医疗电子或科研仪器”。保存后，该文本会进入 `user-data/agent/application_rules.md`，供找岗位和筛选流程使用。建议用“必须”“不得”“优先”明确表达；该字段可留空，也不会影响找岗位就绪状态。

### 岗位状态与阶段

- 主状态表示申请事实：`Pending`、`Needs user`、`Submitted`、`Offer`、`Rejected`、`Skipped`、`Blocked`。
- 当前阶段表示 Submitted 之后的进展，例如测评、笔试、一面、二面、HR 面、终面、谈薪或背调。
- 将岗位改为 `Submitted` 时，必须填写实际投递日期和成功确认依据；系统同时写入 `application_log.csv`。
- `Skipped`、`Blocked` 和 `Needs user` 必须填写原因。每次变化会写入私有的 `status_history.csv`。

## 连接 Outlook

Outlook 是可选能力。未配置时，资料中心、岗位看板、博士后管线和手动日程仍可正常使用。

1. 在 [Microsoft Entra 管理中心](https://entra.microsoft.com/) 新建应用注册，选择同时支持组织账号和个人 Microsoft 账号。
2. 将应用配置为公共桌面客户端，添加重定向地址 `http://localhost:8420/oauth/outlook/callback`；不要创建 Client Secret。
3. 添加 Microsoft Graph 委托权限：`User.Read`、`Mail.Read`、`Calendars.ReadWrite`。不要添加 `Mail.Write`、`Mail.Send` 或应用级全邮箱权限。
4. 复制 Application (client) ID，在 Dashboard 的“面试邮件”区域填写；租户一般保持 `common`。
5. 点击“连接 Outlook”，在微软页面登录并确认权限。服务启动时检查一次，之后在运行期间每 15 分钟增量检查，也可手动点击检查。

识别到的邮件不会立即改变状态。它先进入待确认区，你需要核对关联申请、日期、时间、时区、地点和会议链接。确认后才会写入本地日程、更新面试阶段并创建 Outlook Calendar 事件。重复邮件通过邮件标识、哈希和 Graph transaction ID 阻止；同步失败时本地事件会保留。

## 开发

```bash
npm ci
npm test
npm start
```

Dashboard 使用原生 HTML/CSS/JavaScript；本地 Node 服务提供 JSON、简历上传和 CSV 写入接口。简历解析依赖仅在本机运行。

## 版本记录

### v1.2.0 — 2026-08-16

- 求职目标增加“特别需求”，并同步到 Agent 筛选规则。
- 企业岗位卡片增加主状态与当前阶段双控件、Submitted 证据校验和状态审计历史。
- 增加可选的 Microsoft Graph Outlook 连接、15 分钟增量检查和人工确认邮件队列。
- 中英文面试邮件及 ICS 可生成企业或博士后日程，并同步 Outlook Calendar。
- 档案升级为 schema v2；旧岗位和日程获得稳定 UUID，迁移前自动备份且可重复运行。

### v1.1.1 — 2026-08-12

- 修复升级后旧后端进程与新前端文件并存时，博士后页面读取缺失 `policy` 字段导致初始化崩溃的问题。
- 前端启动时检查前后端版本一致性；不一致时显示明确的重启提示。

### v1.1.0 — 2026-08-12

- 将博士后研究方向由普通偏好升级为严格白名单。
- 博士后新增/编辑接口会校验 `matched_research_area`；配置目标机构时同时校验 `matched_target_institution`。
- 资料中心启用博士后工作流时，至少需要一个研究方向。
- Agent 兼容规则明确禁止根据候选人经历、相邻领域或关键词擅自扩大博士后方向。
- 博士后看板显示当前白名单，并标记不符合现有规则的历史记录。

## 安全与隐私

- 不猜测姓名、工作许可、签证、薪资、学历日期或身份披露信息。
- 不绕过 CAPTCHA、Cloudflare、登录、2FA 或站点控制。
- 不把收藏、跟踪、套磁计划或打开过的页面记为已投递。
- 不把“准备联系 PI”记为“已联系”。
- 不把尚未核实的经费或开放状态写成确定事实。
- 不因收到面试邮件而把岗位自动记为 Submitted；邮件识别结果必须人工确认。
- 不在日志或公开仓库保存 Outlook Token 或完整邮件正文；Windows Token 缓存由当前用户 DPAPI 加密。
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
