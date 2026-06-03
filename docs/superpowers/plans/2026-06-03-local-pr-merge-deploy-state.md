# Local PR Merge Deploy State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本地 AI 创建的 PR 在测试通过后自动合并、触发 Render 部署，并把部署状态写回 GitHub issue，避免管理员只看到“已发送 AI”但公网没有变化。

**Architecture:** 本地 worker 继续负责生成分支、提交、推送和创建 PR。GitHub Actions 负责识别 `ai/local/*` PR 并启用 auto-merge；`main` 推送后触发 Render API 部署并轮询部署状态，最后评论/标记原始 issue。管理员面板保留现有审核入口，并提示后续合并部署状态在 GitHub issue 中追踪。

**Tech Stack:** Node.js, Express, GitHub CLI, GitHub Actions, Render REST API, vanilla JS admin page.

**QA Result File:** `docs/qa/2026-06-03-local-pr-merge-deploy-state.md`

---

## QA 矩阵

| 需求项 | 实现入口 | 验证方式 | 通过标准 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 本地 worker 创建的 PR 会进入自动合并链路 | `.github/workflows/auto-merge-bugfix.yml` | `node --test --test-concurrency=1 test/workflowPolicy.test.js` | workflow 同时支持 `ai:autofix` 标签和 `ai/local/*` 分支，并使用 `REPO_AUTOMATION_TOKEN` | `docs/qa/2026-06-03-local-pr-merge-deploy-state.md` | PENDING |
| Render 部署会把状态写回 issue | `.github/workflows/deploy-render.yml` | `node --test --test-concurrency=1 test/workflowPolicy.test.js` | workflow 解析 issue 编号、触发 Render deploy、轮询 deploy status、评论并标记 deployed/failed | `docs/qa/2026-06-03-local-pr-merge-deploy-state.md` | PENDING |
| 本地 worker 创建 PR 时向管理员解释后续自动合并/部署链路 | `src/localWorker.js` | `node --test --test-concurrency=1 test/localWorker.test.js` | issue 评论和 PR body 包含 auto-merge、checks、Render deploy 的说明 | `docs/qa/2026-06-03-local-pr-merge-deploy-state.md` | PENDING |
| 管理员面板能提示后续状态追踪位置 | `public/admin.html`, `public/admin.js` | `node --test --test-concurrency=1 test/adminPage.test.js` + Agent Browser | 管理员详情里能看到 GitHub issue 是 PR/合并/部署状态源 | `docs/qa/2026-06-03-local-pr-merge-deploy-state.md` | PENDING |
| 现有完整测试不回退 | 全项目 | `npm test` | 全部测试通过 | `docs/qa/2026-06-03-local-pr-merge-deploy-state.md` | PENDING |

## Implementation Tasks

### Task 1: Auto-Merge Workflow

**Files:**
- Modify: `.github/workflows/auto-merge-bugfix.yml`
- Test: `test/workflowPolicy.test.js`

- [ ] Write failing tests asserting local PR branch support and automation token usage.
- [ ] Update workflow condition to enable auto-merge for PRs with `ai:autofix` label or `ai/local/` head branch.
- [ ] Run targeted workflow policy tests.

### Task 2: Deploy Status Feedback

**Files:**
- Modify: `.github/workflows/deploy-render.yml`
- Test: `test/workflowPolicy.test.js`

- [ ] Write failing tests asserting issue number parsing, Render deploy polling, and GitHub issue comments/labels.
- [ ] Update deploy workflow to trigger Render deploy, capture deploy id, poll `GET /v1/services/{serviceId}/deploys/{deployId}`, and write issue comments/labels.
- [ ] Run targeted workflow policy tests.

### Task 3: Worker PR/Issue Messaging

**Files:**
- Modify: `src/localWorker.js`
- Test: `test/localWorker.test.js`

- [ ] Write failing tests asserting PR body and issue comment explain checks, auto-merge, and Render deploy.
- [ ] Add a focused PR body builder and update the issue comment after PR creation.
- [ ] Run targeted local worker tests.

### Task 4: Admin Panel Status Guidance

**Files:**
- Modify: `public/admin.html`
- Modify: `public/admin.js`
- Test: `test/adminPage.test.js`

- [ ] Write failing tests for the status guidance text and rendering path.
- [ ] Add concise status guidance to the detail panel when a GitHub issue exists.
- [ ] Run targeted admin page tests and one Agent Browser check.

### Task 5: Final Verification

**Files:**
- Modify: `docs/qa/2026-06-03-local-pr-merge-deploy-state.md`

- [ ] Run `npm test`.
- [ ] Run Agent Browser against the admin page.
- [ ] Update the QA result file with PASS/FAIL/BLOCKED rows and evidence.
