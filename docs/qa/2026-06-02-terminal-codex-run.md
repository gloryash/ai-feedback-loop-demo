# QA 结果

## 环境

- 分支：`feature/terminal-codex-run`
- 工作区：`.aipr/dev-worktrees/terminal-codex-run`
- 启动命令：不适用
- 前端 URL：不适用
- 后端 URL：不适用

## 验收矩阵

| 需求项 | 验证方式 | 通过标准 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 默认仍为后台执行，不破坏现有 worker | `npm test` | 默认 `codexRunMode` 为 `internal`，现有 local worker 成功/失败路径继续通过 | PASS | `npm test`: 61 tests, 61 pass, 0 fail |  |
| 配置可切换为终端窗口模式 | `npm test` | 支持 `terminal`，拒绝未知 `codexRunMode` 和未知 `terminalApp` | PASS | `loadAutomationConfig defaults localPr Codex run mode to internal`; `rejects unsupported localPr codexRunMode`; `rejects unsupported localPr terminalApp` |  |
| 终端模式能把 Codex 结果回传给 worker | `npm test`; direct runner tests | runner 写入 prompt/script/log/status 路径，读取 `status.json` 后返回 `{ code, stdout, stderr }` | PASS | `runCodexInTerminal writes run artifacts and returns status output`; `runCodexInTerminal resolves relative run root from repoPath`; terminal smoke `status.json` code 0 |  |
| worker 只让 Codex 步骤走终端，后续测试/commit/PR 不变 | `npm test` | terminal runner 成功后仍执行 test、hasChanges、commit、push、`gh pr create` | PASS | `runLocalWorkerOnce uses terminal runner only for Codex in terminal mode` |  |
| 终端模式不泄漏 GitHub 凭证给 Codex | `npm test` | terminal runner 收到的 env 不包含 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_TOKEN` | PASS | `runLocalWorkerOnce uses terminal runner only for Codex in terminal mode`; `runCodexInTerminal writes run artifacts and returns status output` confirms generated script omits GitHub token value |  |
| 真实 macOS 终端窗口能被打开并完成状态回传 | 手动运行 terminal smoke 命令 | iTerm2 或 Terminal 出现窗口，脚本完成，`status.json` 为 code 0 | PASS | Screenshot: `docs/qa/2026-06-02-terminal-codex-run-smoke.png`; run dir: `/var/folders/wr/p5wjzt815077q9khw_dhvc6m0000gn/T/terminal-codex-smoke-final-KEWOrw/repo/.aipr/runs/issue-999`; stdout: `terminal smoke ok final` | iTerm2 smoke used fake command, not real Codex |

## 返工记录

| 轮次 | 失败项 | 修复动作 | 结果 |
| --- | --- | --- | --- |
| 1 | 初始 TDD 红灯 | 添加配置默认值/校验、terminal runner、worker terminal routing | 对应测试转绿 |
