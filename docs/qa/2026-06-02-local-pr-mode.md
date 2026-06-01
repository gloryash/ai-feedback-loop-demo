# QA 结果

## 环境

- 分支：
- 启动命令：
- 前端 URL：
- 后端 URL：
- GitHub Issue：
- GitHub PR：

## 验收矩阵

| 需求项 | 验证方式 | 通过标准 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 云端模式保持现有行为 | `npm test` 中 server 和 router 单元测试 | `cloud` 模式继续创建带 `autofix:candidate` 的 GitHub Issue | PENDING | 待实现后记录 |  |
| 本地模式不会触发云端 workflow | `npm test` 中 local route label 测试 | `local-pr` 模式不包含 `autofix:candidate`，包含 `local:candidate` | PENDING | 待实现后记录 |  |
| 管理员审批后本地 worker 可领取任务 | mocked GitHub API worker test | worker 只处理带 `local:approved` 且未完成/未失败的 Issue，并添加 `local:running` | PENDING | 待实现后记录 |  |
| 本地执行隔离在 worktree | mocked process runner + command sequence test | worker 使用 `git worktree add` 创建 issue-scoped worktree，不在主工作区运行 Codex | PENDING | 待实现后记录 |  |
| Codex 本地执行使用非交互模式 | mocked command invocation test | worker 通过配置的 `codex exec --sandbox workspace-write --ephemeral -` 传入 prompt | PENDING | 待实现后记录 |  |
| 测试通过后自动开 PR | mocked git/gh command test | 有 diff 且 test command 成功时执行 commit、push、`gh pr create`，并评论 Issue | PENDING | 待实现后记录 |  |
| 失败状态可追踪 | Codex/test/push failure tests | 失败时移除 `local:running`，添加 `local:failed`，写入失败评论 | PENDING | 待实现后记录 |  |
| 表单提交结果能说明本地队列状态 | unit test + Agent Browser manual check | local mode 提交后显示等待管理员审批/本地 worker 处理的文案，无 console error | PENDING | 待实现后记录 |  |

## 返工记录

| 轮次 | 失败项 | 修复动作 | 结果 |
| --- | --- | --- | --- |
