# QA 结果

## 环境

- 分支：`feature/admin-review-panel`
- 工作区：`.aipr/dev-worktrees/admin-review-panel`
- 后端启动命令：`PORT=3100 STORAGE_DIR=/tmp/aipr-admin-review-fT8JBd npm start`
- 前端 URL：`http://127.0.0.1:3100`
- 浏览器工具：Agent Browser / MCP browser

## 自动化测试

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | PASS | 101 tests, 0 failures |
| `node --test --test-concurrency=1 test/reportResult.test.js test/reportPage.test.js` | PASS | 6 tests, 0 failures |
| `node --test --test-concurrency=1 test/adminPage.test.js test/reportPage.test.js test/theme.test.js` | PASS | 7 tests, 0 failures |
| `node --test --test-concurrency=1 test/server.test.js` | PASS | 12 tests, 0 failures |

## 浏览器验收

| 需求项 | 验证方式 | 通过标准 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 小 Bug 可自动通过并进入 AI 链路 | `npm test` / `test/server.test.js` | 清晰 bug 返回 `review.status = sent-to-ai`，调用 GitHub Issue 创建逻辑 | PASS | `test/server.test.js` 12/12 | 无 GitHub token 时 helper 返回 `created:false`，单测用注入 helper 验证调用 |
| 大功能/设计/风险请求必须等待管理员审核 | 浏览器提交 feature；`curl` API 验证 | feature/risky 请求保存为 `pending-review`，不创建 GitHub Issue | PASS | `docs/qa/2026-06-03-admin-review-panel-report-result.png` | 提交结果显示“等待管理员审核” |
| 管理员可以看到所有用户提交的 iShoe 需求 | 打开 `/admin.html` | pending ticket 出现在列表 | PASS | `docs/qa/2026-06-03-admin-review-panel-desktop.png` | 列表显示刚提交的 `Add iShoe annual billing toggle` |
| 管理员可以针对每条需求保存评论 | 管理员详情页填写评论并驳回 | `review.adminComment` 落盘 | PASS | `/tmp/aipr-admin-review-fT8JBd/tickets/T-20260602213521-9BP2F.json` | JSON 中 `adminComment` 为管理员备注 |
| 管理员审批后 AI 能看到管理员评论并进入当前 AI 路由 | `test/server.test.js` / `test/reviewWorkflow.test.js` | Issue body 包含 `## Administrator review` 和评论 | PASS | `npm test` 101/101 | 浏览器本轮选择驳回路径；审批路径由服务端测试覆盖 |
| 本地 PR 模式审批后会加 `local:approved` | `test/reviewWorkflow.test.js` / `test/server.test.js` | local-pr 创建 candidate Issue 后调用 approval label helper | PASS | `npm test` 101/101 | 使用依赖注入验证 `addIssueLabels` 调用 |
| 管理员可以驳回需求，驳回不会触发 AI | 浏览器管理员面板 | reject 后 ticket 为 `rejected`，不创建 GitHub Issue | PASS | `docs/qa/2026-06-03-admin-review-panel-rejected.png` | 结果区显示“需求已驳回，不会发送给 AI” |
| 管理员面板是可操作后台而不是 landing page | Agent Browser 桌面 + 移动截图 | 有筛选、列表、详情、评论框、通过/驳回按钮；无明显重叠或横向溢出 | PASS | `docs/qa/2026-06-03-admin-review-panel-desktop.png`, `docs/qa/2026-06-03-admin-review-panel-mobile.png` | 移动视口 `393x852 @3x`，`hasHorizontalOverflow=false` |

## 截图

- 提交页初始态：`docs/qa/2026-06-03-admin-review-panel-report.png`
- 提交后 pending-review 文案：`docs/qa/2026-06-03-admin-review-panel-report-result.png`
- 管理员桌面面板：`docs/qa/2026-06-03-admin-review-panel-desktop.png`
- 管理员驳回后状态：`docs/qa/2026-06-03-admin-review-panel-rejected.png`
- 管理员移动端面板：`docs/qa/2026-06-03-admin-review-panel-mobile.png`

## 返工记录

| 轮次 | 失败项 | 修复动作 | 结果 |
| --- | --- | --- | --- |
| 1 | `ticketStore` ID 可路径穿越、`updateTicket` 支持对象 patch | 增加 ID allowlist 和路径 containment；移除对象 patch；补测试 | PASS |
| 2 | 审批 pending ticket 时 Issue body 显示 `pending-review`；人审 ticket 通过后仍停在 `human-review` | `approveTicketForAi` 使用审批意图生成状态；管理员通过的人审 ticket 转成 AI 候选路由 | PASS |
| 3 | 并发 approve 可能重复创建 Issue；锁顺序晚于 JSON 读取可能返回 500 | 增加 per-ticket review operation lock，并在读取 JSON 前抢锁 | PASS |
| 4 | 管理员直接点通过时未先保存当前评论 | 前端通过/驳回前调用 `persistCurrentComment()` | PASS |
| 5 | 管理员面板 GitHub 链接允许 `javascript:` / `data:` 协议 | 增加 `safeExternalUrl()`，只允许 `http:` / `https:` | PASS |
| 6 | 浏览器自动化点击提交按钮时按钮不在视口内 | 滚动到按钮可见区域后点击；确认页面逻辑和接口均正常 | PASS |
