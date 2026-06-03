# TUI Codex Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增本地 worker 的第三种 Codex 运行模式 `tui`，让 Codex 以交互式 TUI 窗口打开，同时保留 worker 后续测试、提交、PR、自动合并和部署链路。

**Architecture:** 继续由 `localWorker` 负责任务编排和状态推进。`codexRunMode: "tui"` 复用 macOS terminal runner，但生成 TUI 专用 prompt：Codex 以普通 `codex` TUI 启动，完成修改后按协议写入 `status.json`；worker 轮询该状态文件后继续执行测试和 PR 流程。

**Tech Stack:** Node.js, macOS AppleScript/iTerm2, Codex CLI TUI, GitHub CLI, Agent Browser visible Chrome on CDP port 9500.

**QA Result File:** `docs/qa/2026-06-03-tui-codex-mode.md`

---

## QA 矩阵

| 需求项 | 实现入口 | 验证方式 | 通过标准 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 配置支持第三种 `tui` 模式 | `src/automationConfig.js`, `automation.config.example.json` | `node --test --test-concurrency=1 test/automationConfig.test.js` | `tui` 被接受，未知模式仍失败，example 包含可配置 TUI 参数 | `docs/qa/2026-06-03-tui-codex-mode.md` | PENDING |
| TUI runner 启动普通 `codex` TUI 而不是 `codex exec` | `src/terminalCodexRunner.js` | `node --test --test-concurrency=1 test/terminalCodexRunner.test.js` | 生成脚本包含 `codex` TUI prompt 参数、完成协议、状态文件轮询兼容 | `docs/qa/2026-06-03-tui-codex-mode.md` | PENDING |
| worker 在 `tui` 模式下仍走终端 runner 并继续 PR 流程 | `src/localWorker.js` | `node --test --test-concurrency=1 test/localWorker.test.js` | `tui` 与 `terminal` 一样由 terminal runner 执行，成功后仍测试、commit、push、PR | `docs/qa/2026-06-03-tui-codex-mode.md` | PENDING |
| 本地配置切换为 TUI 模式 | `automation.config.json` | 读取本地配置 / `npm run worker:local:once` 空队列检查 | 本地配置为 `codexRunMode: "tui"`，worker 可启动 | `docs/qa/2026-06-03-tui-codex-mode.md` | PENDING |
| 云端同步最新代码 | GitHub `main`, Render public service | `git push origin main`; public `/admin.js` 或 `/api/health` 检查 | 远端 main 包含 TUI 模式代码，Render 部署成功 | `docs/qa/2026-06-03-tui-codex-mode.md` | PENDING |
| 9500 浏览器端到端触发本地 TUI Codex | 公网页面 + 本地 worker | Agent Browser visible `shared-9500` 提交和审批 | 用户提交新需求、管理员审批后，本地 iTerm2 打开普通 Codex TUI 窗口 | `docs/qa/2026-06-03-tui-codex-mode.md` | PENDING |

## Implementation Tasks

### Task 1: Config Support

**Files:**
- Modify: `src/automationConfig.js`
- Modify: `automation.config.example.json`
- Test: `test/automationConfig.test.js`

- [ ] Write failing tests for `codexRunMode: "tui"` and `tuiCodexArgs`.
- [ ] Add `tui` to supported run modes and default TUI args.
- [ ] Run targeted config tests.

### Task 2: TUI Runner Protocol

**Files:**
- Modify: `src/terminalCodexRunner.js`
- Test: `test/terminalCodexRunner.test.js`

- [ ] Write failing tests proving TUI mode uses `codex` without `exec`, appends a completion protocol, and does not depend on command exit.
- [ ] Add prompt augmentation and script generation for TUI mode.
- [ ] Run targeted terminal runner tests.

### Task 3: Worker Routing

**Files:**
- Modify: `src/localWorker.js`
- Test: `test/localWorker.test.js`

- [ ] Write failing tests for `codexRunMode: "tui"`.
- [ ] Route `tui` through terminal runner and keep credential sanitization.
- [ ] Run targeted local worker tests.

### Task 4: Local/Cloud Sync And E2E

**Files:**
- Modify local-only: `automation.config.json`
- Modify: `docs/qa/2026-06-03-tui-codex-mode.md`

- [ ] Merge and push to `main`.
- [ ] Update local config to `codexRunMode: "tui"`.
- [ ] Start visible local worker.
- [ ] Use 9500 browser to submit and approve a small request.
- [ ] Observe iTerm2 opening Codex TUI and record evidence.
