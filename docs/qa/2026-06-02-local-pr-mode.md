# QA 结果

## 环境

- 分支：`feature/local-pr-mode`
- 启动命令：`AUTOMATION_MODE=local-pr LOCAL_PR_ENABLED=true PORT=3911 npm start`
- 前端 URL：`http://127.0.0.1:3911/report.html`
- 后端 URL：`http://127.0.0.1:3911`
- GitHub Issue：未执行真实创建；自动化测试 mock GitHub API，真实 API 在缺少 GitHub 环境变量时返回 `created: false`
- GitHub PR：未执行真实创建；`localWorker` 测试 mock `gh pr create` 成功和失败路径

## 验收矩阵

| 需求项 | 验证方式 | 通过标准 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 云端模式保持现有行为 | `npm test` 中 server 和 router 单元测试 | `cloud` 模式继续创建带 `autofix:candidate` 的 GitHub Issue | PASS | `npm test`：52/52 pass；`POST /api/report passes cloud autofix labels to GitHub issue creation` |  |
| 本地模式不会触发云端 workflow | `npm test` 中 local route label 测试 | `local-pr` 模式不包含 `autofix:candidate`，包含 `local:candidate` | PASS | `npm test`：52/52 pass；`routeAutomation uses local candidate labels in local-pr mode`；curl 响应 labels 为 `["bug","local:candidate"]` |  |
| 管理员审批后本地 worker 可领取任务 | mocked GitHub API worker test | worker 只处理带 `local:approved` 且未完成/未失败的 Issue，并添加 `local:running` | PASS | `npm test`：52/52 pass；`runLocalWorkerOnce processes one approved issue and creates a PR` |  |
| 本地执行隔离在 worktree | mocked process runner + command sequence test | worker 使用 `git worktree add` 创建 issue-scoped worktree，不在主工作区运行 Codex | PASS | `npm test`：52/52 pass；`createIssueWorktree creates an issue-scoped branch and worktree` |  |
| Codex 本地执行使用非交互模式 | mocked command invocation test | worker 通过配置的 `codex exec --sandbox workspace-write --ephemeral -` 传入 prompt | PASS | `npm test`：52/52 pass；`runLocalWorkerOnce processes one approved issue and creates a PR` |  |
| 测试通过后自动开 PR | mocked git/gh command test | 有 diff 且 test command 成功时执行 commit、push、`gh pr create`，并评论 Issue | PASS | `npm test`：52/52 pass；worker success test 验证 commit、push、`gh pr create` 和 Issue comment | 未执行真实 GitHub PR；需要真实 `automation.config.json`、GitHub labels、`gh` 登录和测试 Issue |
| 失败状态可追踪 | Codex/test/push failure tests | 失败时移除 `local:running`，添加 `local:failed`，写入失败评论 | PASS | `npm test`：52/52 pass；Codex failure、test failure、no changes 三个 worker failure tests |  |
| 表单提交结果能说明本地队列状态 | unit test + Agent Browser manual check | local mode 提交后显示等待管理员审批/本地 worker 处理的文案，无 console error | PASS | `npm test`：52/52 pass；`explains local-pr submissions in plain Chinese`；Agent Browser 可打开 `report.html` 并读取表单；curl 真实提交返回 `automation.mode = "local-pr"` | 共享浏览器会被另一个本地页面抢回焦点，未能稳定完成点击后的结果 DOM 截图；结果文案由单元测试覆盖 |

## 命令证据

```bash
npm test
```

结果：52 个测试全部通过，0 failure。

```bash
npm run worker:local:once
```

结果：默认本地 PR 模式禁用时安全退出：

```json
{"processed":false,"reason":"local-pr disabled"}
```

```bash
AUTOMATION_MODE=local-pr LOCAL_PR_ENABLED=true PORT=3911 npm start
curl --request POST http://127.0.0.1:3911/api/report ...
```

结果摘要：

```json
{
  "route": "bug-autofix",
  "automation": {
    "mode": "local-pr",
    "labels": ["bug", "local:candidate"],
    "requiresApproval": true
  },
  "github": {
    "created": false,
    "reason": "GITHUB_OWNER, GITHUB_REPO, or GITHUB_TOKEN is not configured."
  }
}
```

## 返工记录

| 轮次 | 失败项 | 修复动作 | 结果 |
| --- | --- | --- | --- |
