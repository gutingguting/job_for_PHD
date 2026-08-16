# job_for_PHD

当前版本：**v1.3.0**

一个本地优先的求职与博士后申请工作台。它把候选人资料、简历版本、岗位筛选、PI/课题组研究、申请进度和后续跟进放在同一个 Dashboard 中，同时保留严格的人工确认边界。

> job_for_PHD 不是自动海投工具。它不会因为初始化完成就自动打开申请表、点击 Apply 或提交申请；最终提交始终需要用户明确批准。

## 目录

- [主要能力](#主要能力)
- [Windows 安装](#windows-安装)
- [首次使用流程](#首次使用流程)
- [Dashboard 功能指南](#dashboard-功能指南)
- [资料中心指南](#资料中心指南)
- [岗位发现、筛选与状态管理](#岗位发现筛选与状态管理)
- [日程与 Outlook 面试邮件](#日程与-outlook-面试邮件)
- [浏览器预填写助手](#浏览器预填写助手)
- [博士后申请管线](#博士后申请管线)
- [Agent 使用方式](#agent-使用方式)
- [数据、备份与升级](#数据备份与升级)
- [开发与本地接口](#开发与本地接口)
- [故障排查](#故障排查)
- [安全与隐私](#安全与隐私)

## 主要能力

- 资料中心：首次启动分步初始化，以后可随时修改。
- 本地简历解析：支持 DOCX 和文本型 PDF，不使用云端 AI，不覆盖源文件。
- 双重就绪状态：分别显示“找岗位已就绪”和“投递事实已完整”；两者都不等于授权自动提交。
- 企业岗位看板：岗位发现、筛选、投递、面试日程、Offer/拒绝和后续行动。
- 状态与阶段分离：直接在岗位卡片更新真实投递状态；Submitted 必须记录日期和确认依据。
- Outlook 面试收件箱：本地识别中英文面试邮件和 ICS，人工确认后同步到软件日程及 Outlook Calendar。
- 预填写中心：通过本地浏览器扩展一次性导入或填写 Moka、Workday、Greenhouse 表单，保留冲突复核和敏感字段过滤。
- 博士后管线：PI/Group、Institute、Research fit、Funding、公开职位/套磁、联系、回复、面试、Research statement、推荐信和跟进。
- 博士后严格白名单：资料中心保存的研究方向是硬约束；如果填写目标机构，它也成为硬约束。相邻领域、候选人技能和关键词重叠不会扩大检索范围。
- 私有数据隔离：运行时资料统一保存在 `user-data/`，公开仓库只保留代码和空白模板。

## Windows 安装

1. 安装 Node.js 20.16 或更高版本，并确保 `node` 和 `npm` 可在命令行使用。
2. 双击根目录的 `install.bat`。
3. 安装脚本会安装锁定依赖、创建或迁移私有数据，然后打开 `http://localhost:8420/dashboard.html`。
4. 日常使用可双击 `启动 job_for_PHD.bat`。

安装和启动脚本均为幂等操作，不会覆盖已经存在的个人资料。服务仅监听 `127.0.0.1`。

### 启动、停止与升级

- 首次安装：双击 `install.bat`。
- 日常启动：双击 `启动 job_for_PHD.bat`，保持出现的服务窗口运行。
- 停止服务：关闭服务窗口；关闭浏览器页面本身不会停止后台服务。
- 检查服务：访问 `http://localhost:8420/api/health`，应返回应用名称、版本和就绪状态。
- 升级源码：先备份 `user-data/`，拉取新版本后重新运行 `install.bat`。初始化和迁移可重复执行，不会用空模板覆盖已有资料。
- 端口 `8420` 被其他程序占用时，程序会明确报错；它不会静默切换到随机端口。

## 首次使用流程

1. 启动 Dashboard。没有初始化记录时会自动进入“资料中心”。
2. 阅读隐私和提交边界，上传一份 DOCX 或文本型 PDF 简历。
3. 核对简历解析建议，再填写基本资料、教育状态、求职目标、地点和工作许可。
4. 在“授权与执行规则”中确认试运行边界。默认是“只找岗位”。
5. 在最后一步查看两种状态：
   - `lead_finding_ready`：资料已足够用于找岗位和筛选。
   - `application_ready`：联系方式、入职信息和材料路由等投递前事实更加完整。
6. 点击“确认最低配置并返回看板”。这一步只完成配置，不授权投递。
7. 让 Agent 进行“仅找岗位”试运行，或者把经过核实的岗位写入私有 `job_pool.csv`。
8. 在 Dashboard 管理状态、阶段、日程、博士后机会和预填写资料。

随时可以从顶部“资料中心”重新编辑。每一步都支持“保存草稿并稍后继续”。

## Dashboard 功能指南

Dashboard 顶部提供四个固定入口：

| 入口 | 用途 |
| --- | --- |
| 岗位看板 | 查看就绪状态、岗位统计、面试邮件、未来 7 天日程和企业岗位卡片 |
| 预填写中心 | 管理浏览器扩展配对、可复用事实、企业问答、导入记录和冲突 |
| 博士后管线 | 管理 PI/课题组、机构、研究匹配、联系、面试和材料进度 |
| 资料中心 | 初始化或修改简历、个人事实、求职目标、博士后白名单和执行规则 |

其他通用操作：

- “刷新”重新读取本地 JSON 和 CSV；不会访问招聘网站。
- 主题按钮切换明暗主题。
- 顶部资料状态只说明资料完整度，“投递未授权”不是错误。
- “已投递 / 未投递 / 已结束”指标卡可以快速筛选岗位。
- 岗位搜索支持公司和岗位名称，状态筛选支持全部主状态。

## 资料中心指南

### 1. 欢迎与隐私

显示私有数据位置、默认试运行模式、本地解析说明和最终提交保护。资料只写入当前项目的 `user-data/`。

### 2. 简历管理

- 支持 `.docx` 和文本型 `.pdf`，单文件最大 10 MB。
- 扫描版 PDF 暂不做 OCR；请换用 DOCX 或有文本层的 PDF。
- 上传时填写版本名称、适用岗位族和使用条件，便于后续材料路由。
- 解析出的候选字段必须人工确认；系统不会静默覆盖已确认档案。
- 上传新简历会创建新版本，不覆盖源文件；停用旧版本采用归档而非直接删除。

### 3. 基本资料

管理法定姓名、常用中文名、英文名、邮箱、电话、当前城市，以及可选的 LinkedIn、GitHub 和作品集链接。姓名、邮箱和电话属于高影响事实，修改前应核对。

### 4. 教育与当前状态

管理当前身份、对外状态表述、预计毕业时间、可入职时间和多条教育经历。日期不确定时不要猜测，可先保存草稿。

### 5. 求职目标

- 主岗位族、次岗位族、优先职位、明确避投和目标城市使用可排序标签；排序代表优先级。
- 可配置办公形式、异地政策和目标职级。
- “特别需求”用于额外硬约束和偏好，例如“不得投文职；优先医疗电子或科研仪器”。保存后同步到 `user-data/agent/application_rules.md`，但不影响最低就绪状态。
- 博士后工作流启用后，研究方向是严格白名单；如果还填写目标机构，机构也成为严格白名单。

### 6. 授权与执行规则

管理目标国家、当前工作许可、当前/未来签证支持、准确表单表述、薪资策略和简历模式。三态签证字段中的“未确定”不等于“否”。默认自愿身份披露为“不透露”，自定义答案为“首次草拟、确认后复用”。资料中心不能解除最终提交保护。

### 7. 检查与完成

页面会定位缺失字段，并分别计算找岗位就绪和申请资料就绪。点击完成只标记初始化状态，不会打开申请页面、点击 Apply 或发送信息。

## 岗位发现、筛选与状态管理

### 找岗位

岗位发现由本地 Agent 工作流完成，Dashboard 本身不自动爬取招聘网站。推荐指令：

```text
请读取 SKILL.md，按照我的资料和 application_rules.md 只找 3～5 个岗位。
核对岗位真实开放，筛选和分类后更新 user-data/dashboard 下的 CSV；
不要打开申请表、不要点击 Apply、不要提交申请。
```

找岗时应记录来源链接、核验时间、开放状态、匹配依据和阻塞项。收藏、打开页面或准备申请都不能记为已投递。

### 主状态与当前阶段

- 主状态表示申请事实：`Pending`、`Needs user`、`Submitted`、`Offer`、`Rejected`、`Skipped`、`Blocked`。
- 当前阶段描述推进位置，例如已投递、测评、笔试、一面、二面、HR 面、终面、谈薪、背调，也可以输入自定义阶段。
- 主状态和阶段是两个维度。例如主状态可保持 `Submitted`，阶段从“一面”更新为“二面”。
- 改为 `Submitted` 时必须填写实际投递日期和确认依据，可选填投递平台；系统同步追加 `application_log.csv`。
- `Skipped`、`Blocked`、`Needs user` 必须填写原因。
- 误操作可以修正，但每次修改都会保留更新时间并写入 `status_history.csv`。

在岗位卡片中直接修改阶段；点击状态按钮打开“更新岗位状态”窗口。岗位以稳定 UUID 关联，CSV 行顺序变化不会破坏日程或邮件关联。

## 日程与 Outlook 面试邮件

### 手动日程

在“未来 7 天日程”点击“添加日程”，选择日期、时间、关联公司/岗位和事件内容。事件内容可以使用笔试、测评、一面、二面、HR 面、终面、谈薪等建议，也可自定义。手工日程保存在私有 `follow_up.csv`。

### Outlook 能做什么

- 连接后首次检查最近 30 天收件箱，之后使用 Microsoft Graph 增量检查。
- 服务启动时检查一次，运行期间每 15 分钟检查一次，也可以点击“检查 Outlook 邮件”。
- 优先解析 ICS，再从中英文正文提取公司/机构、岗位/PI、时间、时区、地点、会议链接和面试轮次。
- 不扫描发件箱，不修改或删除邮件，不保存完整邮件正文。
- 所有识别结果先进入待确认区，不会仅凭邮件把岗位记为已投递。
- 确认后写入本地日程；企业岗位更新当前阶段，博士后记录更新到 `Interview`，并尝试创建 Outlook Calendar 事件。
- Outlook 日历写入失败时保留本地事件，可在日程卡片点击“重试 Outlook”。

### 创建 Microsoft Entra 应用

Outlook 是可选能力。没有 Client ID 时，其他功能全部可以正常使用。

1. 登录 [Microsoft Entra 管理中心](https://entra.microsoft.com/) 或 [Azure 门户](https://portal.azure.com/)。
2. 进入“Microsoft Entra ID → 应用注册 → 新注册”。名称可填写 `job_for_PHD-local`。
3. “支持的账户类型”选择“任何 Entra ID 租户中的账户和个人 Microsoft 账户”。
4. “重定向 URI”平台选择“公共客户端/本机（移动和桌面）”，填写：

   ```text
   http://localhost:8420/oauth/outlook/callback
   ```

   必须是 `http`、端口 `8420`，末尾不要添加 `/`；不要选择 Web 或 SPA。
5. 注册后进入应用的“身份验证 → 高级设置”，将“允许公共客户端流”设为“是”。
6. 进入应用左侧“管理 → API 权限 → 添加权限 → Microsoft Graph → 委托的权限”。添加：
   - `User.Read`
   - `Mail.Read`
   - `Calendars.ReadWrite`
7. 不要添加 `Mail.Write`、`Mail.Send` 或“应用程序权限”，也不要创建 Client Secret。
8. 回到“概述”，复制“应用程序(客户端) ID”。
9. 在 Dashboard“面试邮件”区域填写 Client ID，租户一般保持 `common`，点击“连接 Outlook”。
10. 在微软登录页面选择邮箱并同意权限。回调成功后页面会显示已连接账号。

如果“新注册”提示“在目录外部创建应用程序的功能已被弃用”，说明当前个人 Microsoft 账号不属于 Entra 租户，并非 Graph 或 Outlook 被弃用。可以注册 Azure 以创建自己的目录，切换到该目录后再注册应用；也可以使用已有组织目录的学校/单位账号，但管理员可能禁止普通用户注册应用。

### 检查并确认面试邮件

1. 点击“检查 Outlook 邮件”。
2. 在待确认卡片核对关联类型、关联记录、开始/结束时间、原始时区、北京时间、地点、会议链接和联系人。
3. 匹配失败时先手动选择已有企业岗位或博士后记录；系统不会凭邮件自动创建申请事实。
4. 确认无误后点击确认；不相关邮件点击忽略。
5. 如 Outlook Calendar 显示等待重试，检查网络和权限后点击“重试 Outlook”。

断开连接会删除本机加密令牌和增量游标，但不会删除此前创建的 Outlook 日历事件。

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
├── prefill/                     非敏感预填事实、确认问答、映射和导入统计
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

## 浏览器预填写助手

首版支持 Moka、Workday 和 Greenhouse。它通过当前浏览器页面的表单控件批量读取和填写，不调用招聘平台的未公开提交接口，也不会点击最终提交。

1. 打开 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`，启用“开发者模式”。
2. 选择“加载已解压的扩展程序”，目录选择 `<项目目录>\extension`。
3. 打开 Dashboard 顶部“预填写中心”，点击“生成配对码”。
4. 在扩展弹窗输入六位配对码。
5. 在已经人工填写的申请页点击“导入当前已填表单”；回到 Dashboard 检查导入统计和字段冲突。
6. 在其他申请页点击“一键预填当前页面”，逐项检查后由你亲自点击提交。

扩展只在你点击图标后获得当前标签页的临时权限，不申请 Cookie、密码或浏览历史权限。身份证件号、出生日期、精确住址、健康/民族等敏感信息、验证码、CAPTCHA和声明同意不会保存或自动填写。简历控件仅记录显示的文件名，浏览器仍可能要求你手动确认上传。

### 导入、冲突与预填结果

- “导入当前已填表单”读取当前页面已填写的非敏感字段，保存规范化事实和“原问题—答案—企业/平台来源”。
- 可复用事实显示姓名、教育、项目、技能等已确认字段；可以在 Dashboard 中修改并保存。
- 用人单位问答保存企业自定义问题、适用企业/岗位/平台和确认状态，并同步到 `user-data/agent/answer_bank.md` 的受管理区段。
- 发生档案冲突时不会静默覆盖。“采集记录与冲突”要求逐项选择保留原值或采用导入值。
- “一键预填当前页面”只批量填写并回读校验。结果分为已填写、已有相同值、歧义待确认、缺少答案、敏感字段跳过和网页拒绝。
- Moka、Workday、Greenhouse 是首版适配平台；网页结构变化后，少数字段可能需要手工处理。
- 登录、验证码、CAPTCHA、文件选择和声明同意始终由用户处理；扩展永远不会点击最终提交。

### 扩展重新配对

配对码十分钟后失效，且只能兑换一次。更换浏览器配置文件、清除扩展数据或点击“断开本地连接”后，请在预填写中心重新生成配对码。确保 Dashboard 服务运行在 `127.0.0.1:8420`。

## 博士后申请管线

### 配置严格白名单

先在“资料中心 → 求职目标”启用博士后工作流，添加研究方向，例如 detector electronics、proton therapy、instrumentation。研究方向是硬约束，不会因为技能相似而扩展到相邻领域。若填写 CERN、PSI、GSI、DESY 或其他目标机构，机构也成为硬约束；留空机构列表表示不限制机构。

### 新增和维护机会

在“博士后管线”点击“新增机会”，可以记录：

- PI / Group、Institute、国家/地区；
- 匹配研究方向、匹配目标机构和 Research fit 依据；
- Funding status：未知、Funded、PI funding、Fellowship required、Self-funded；
- 机会类型：公开职位或 cold email；
- 职位名称、来源链接、联系日期、面试日期和跟进日期；
- Research statement、Reference letters、回复摘要、下一步行动和备注。

阶段包括 `Prospect`、`Open position`、`Cold email planned`、`Contacted`、`Replied`、`Interview`、`Offer`、`Closed`。准备套磁不等于已经联系；只有实际发送后才能改为 `Contacted`。经费和职位开放状态必须来自可核验来源，未知时保留“待确认”。

博士后记录支持按阶段筛选，并按 PI、机构或研究方向搜索。Outlook 中确认的博士后面试可以把关联记录更新为 `Interview` 并创建日程。

## 数据、备份与升级

所有 JSON、Markdown 和 CSV 使用临时文件加原子替换。结构迁移前会在 `user-data/backups/` 创建时间戳备份，重复运行迁移不会重复生成岗位 ID、日程或投递日志。

建议备份：

1. 退出 job_for_PHD 服务。
2. 复制整个 `user-data/` 到加密磁盘或其他私有位置。
3. 恢复时安装同版本或更新版本源码，再把备份放回项目根目录并运行 `install.bat`。

不要把 `user-data/`、`my-materials/`、`.runtime/` 或旧私人配置目录提交到 Git。仓库中的 `templates/dashboard-template/` 仅为空白结构，不包含真实岗位。

## 开发与本地接口

```bash
npm ci
npm test
npm start
```

Dashboard 使用原生 HTML/CSS/JavaScript；本地 Node 服务提供 JSON、简历上传和 CSV 写入接口。简历解析依赖仅在本机运行。

主要接口：

| 范围 | 接口 |
| --- | --- |
| 健康和初始化 | `GET /api/health`、`GET/PUT /api/onboarding`、`POST /api/onboarding/complete` |
| 档案和偏好 | `GET/PUT /api/profile`、`GET/PUT /api/preferences` |
| 简历 | `GET/POST /api/resumes`、`PATCH /api/resumes/:id`、`POST /api/resumes/:id/archive` |
| 企业岗位 | `PATCH /api/jobs/:id`；旧版 `POST /api/update-status` 仅作兼容 |
| 日程 | `POST /api/calendar/add`、`update`、`delete` |
| 博士后 | `GET/POST /api/postdocs`、`PUT /api/postdocs/:id` |
| Outlook | status、connect、disconnect、sync、mail-review confirm/dismiss、follow-up retry |
| 预填写 | pair、import、bundle、facts/questions update、resolve-conflicts |

服务只接受本机连接。预填导入和 bundle 接口还要求已配对扩展令牌，普通网页不能读取档案。

## 故障排查

### Dashboard 无法打开

- 运行 `启动 job_for_PHD.bat`，不要立即关闭命令窗口。
- 检查 `http://localhost:8420/api/health`。
- 如果依赖缺失，重新运行 `install.bat`。
- 如果提示端口占用，先关闭旧的 job_for_PHD 进程；不要让其他服务占用 8420。

### 前后端版本不一致

关闭旧服务窗口，再运行 `启动 job_for_PHD.bat`。浏览器执行强制刷新；不要同时运行两个不同源码版本的服务。

### 简历不能解析

确认扩展名和真实 MIME 为 DOCX/PDF、文件不超过 10 MB。扫描 PDF 没有文本层，需要换用 DOCX 或文本型 PDF。

### Outlook 常见错误

- “功能已被弃用”：通常是个人账号没有 Entra 目录，需先注册 Azure/加入目录，再切换目录创建应用。
- `AADSTS50011`：回调 URI 不匹配。必须精确注册 `http://localhost:8420/oauth/outlook/callback`。
- 权限不足：确认添加的是 Microsoft Graph“委托的权限”，不是“应用程序权限”。
- 组织需要管理员批准：学校/单位租户策略阻止用户同意，需要管理员授权，或改用你自己控制的 Entra 目录。
- 回调后无法连接 localhost：确保 job_for_PHD 服务仍在运行，且端口是 8420。
- 增量同步失败：先手动点击重试；权限被撤销时断开后重新连接。

### 扩展无法配对或预填

- 配对码只有六位、十分钟有效且只能使用一次；过期后重新生成。
- 确认加载的是 `<项目目录>\extension`，且 Dashboard 正运行。
- 重新加载扩展后可能需要重新配对。
- 网页若动态重新渲染，等待表单稳定后再次预填；所有结果仍需人工检查。

## 版本记录

### v1.3.0 — 2026-08-16

- 增加本地预填写中心和 Chrome/Edge Manifest V3 扩展。
- 首版适配 Moka、Workday、Greenhouse，支持当前页批量采集、预填、回读校验和冲突复核。
- 新增非敏感事实库、结构化问答库、导入统计与 Agent 答案库同步。
- 扩展采用一次性配对码和随机令牌；拒绝普通网页跨域读取本地档案。
- 最终提交保护保持不变，敏感字段、密码、验证码、CAPTCHA和同意勾选不会保存或填写。

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
- 不保存政府证件号、出生日期、精确住址、健康/民族信息、密码、验证码、CAPTCHA或声明同意；预填写扩展不读取 Cookie。
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
