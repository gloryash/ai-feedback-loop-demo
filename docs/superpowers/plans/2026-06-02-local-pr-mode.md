# Local PR Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable `local-pr` automation mode where approved GitHub Issues are processed by a local worker that runs Codex in a local Git worktree and opens a PR.

**Architecture:** Keep the existing cloud route intact. Add an automation router, config loader, GitHub queue helpers, local git/worktree helpers, Codex process runner, and a worker CLI. GitHub Issue labels act as the approval queue and state machine.

**Tech Stack:** Node.js ESM, Express, `node:test`, GitHub REST API through `fetch`, local `git`, local `gh`, local `codex exec`.

**QA Result File:** `docs/qa/2026-06-02-local-pr-mode.md`

---

## Assumptions

- The public/server side still creates GitHub Issues for tracking.
- Local PR mode runs only on a trusted local machine with Git, GitHub CLI, and Codex CLI installed.
- The first version processes one job at a time.
- Admin approval is represented by adding the `local:approved` label to an Issue.
- Local mode uses worktrees, not the user's daily worktree.
- Real local credentials are not added to tests; tests mock network and process execution.

## File Structure

- Create: `automation.config.example.json`  
  Example config for `cloud` and `local-pr` modes.

- Modify: `.gitignore`  
  Ignore `automation.config.json`, `.aipr/`, local worker logs, and generated Codex context files.

- Create: `src/automationConfig.js`  
  Load config from `AUTOMATION_CONFIG` or `automation.config.json`, merge defaults, validate supported modes.

- Create: `src/automationRouter.js`  
  Convert a report classification and config into cloud or local GitHub issue labels and response metadata.

- Modify: `src/githubIssue.js`  
  Allow caller-provided labels, add issue search/update/comment helpers for the local queue.

- Create: `src/localPrompt.js`  
  Build the prompt and `.codex-issue-context.json` content for local Codex runs.

- Create: `src/processRunner.js`  
  Small wrapper around `child_process.spawn` for testable command execution.

- Create: `src/localGit.js`  
  Verify repo, create worktree, inspect diffs, commit changes, push branch.

- Create: `src/localWorker.js`  
  Poll approved issues, claim jobs, run Codex, run tests, push PRs, and update labels/comments.

- Create: `scripts/local-worker.js`  
  CLI entrypoint for `node scripts/local-worker.js --once` and continuous polling.

- Modify: `src/server.js`  
  Use config and automation router during report submission.

- Modify: `public/report.js`  
  Show local queue status copy when local mode creates a pending approval issue.

- Create: `test/automationConfig.test.js`
- Create: `test/automationRouter.test.js`
- Create: `test/localPrompt.test.js`
- Create: `test/localWorker.test.js`
- Create: `test/localGit.test.js`
- Modify: `test/githubIssue.test.js`
- Modify: `test/server.test.js`
- Modify: `test/reportResult.test.js`

## QA 矩阵

| 需求项 | 实现入口 | 验证方式 | 通过标准 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 云端模式保持现有行为 | `src/automationRouter.js`, `src/server.js` | `npm test` 中 server 和 router 单元测试 | `cloud` 模式继续创建带 `autofix:candidate` 的 GitHub Issue | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| 本地模式不会触发云端 workflow | `src/automationRouter.js` | 单元测试检查 local labels | `local-pr` 模式不包含 `autofix:candidate`，包含 `local:candidate` | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| 管理员审批后本地 worker 可领取任务 | `src/localWorker.js`, `src/githubIssue.js` | mocked GitHub API worker test | worker 只处理带 `local:approved` 且未完成/未失败的 Issue，并添加 `local:running` | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| 本地执行隔离在 worktree | `src/localGit.js` | mocked process runner + command sequence test | worker 使用 `git worktree add` 创建 issue-scoped worktree，不在主工作区运行 Codex | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| Codex 本地执行使用非交互模式 | `src/localWorker.js`, `src/localPrompt.js` | mocked command invocation test | worker 通过配置的 `codex exec --sandbox workspace-write --ephemeral -` 传入 prompt | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| 测试通过后自动开 PR | `src/localWorker.js`, `src/localGit.js` | mocked git/gh command test | 有 diff 且 test command 成功时执行 commit、push、`gh pr create`，并评论 Issue | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| 失败状态可追踪 | `src/localWorker.js` | Codex/test/push failure tests | 失败时移除 `local:running`，添加 `local:failed`，写入失败评论 | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |
| 表单提交结果能说明本地队列状态 | `public/report.js` | unit test + Agent Browser manual check | local mode 提交后显示等待管理员审批/本地 worker 处理的文案，无 console error | `docs/qa/2026-06-02-local-pr-mode.md` | PENDING |

## Task 1: Config Loader

**Files:**
- Create: `automation.config.example.json`
- Modify: `.gitignore`
- Create: `src/automationConfig.js`
- Create: `test/automationConfig.test.js`

- [ ] **Step 1: Write config tests**

Add tests covering default cloud mode, file loading, environment override, and invalid mode rejection.

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAutomationConfig } from '../src/automationConfig.js';

describe('loadAutomationConfig', () => {
  it('defaults to cloud mode', async () => {
    const config = await loadAutomationConfig({ env: {}, cwd: '/tmp/no-config' });
    assert.equal(config.mode, 'cloud');
    assert.equal(config.cloud.autofixLabel, 'autofix:candidate');
  });

  it('loads local-pr config from AUTOMATION_CONFIG', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
    const path = join(dir, 'automation.config.json');
    await writeFile(path, JSON.stringify({
      mode: 'local-pr',
      localPr: {
        enabled: true,
        repoPath: '/repo'
      }
    }));

    const config = await loadAutomationConfig({
      env: { AUTOMATION_CONFIG: path },
      cwd: dir
    });

    assert.equal(config.mode, 'local-pr');
    assert.equal(config.localPr.enabled, true);
    assert.equal(config.localPr.repoPath, '/repo');
    assert.equal(config.localPr.approvalLabel, 'local:approved');
  });

  it('allows AUTOMATION_MODE to override file mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
    const path = join(dir, 'automation.config.json');
    await writeFile(path, JSON.stringify({ mode: 'cloud' }));

    const config = await loadAutomationConfig({
      env: { AUTOMATION_CONFIG: path, AUTOMATION_MODE: 'local-pr' },
      cwd: dir
    });

    assert.equal(config.mode, 'local-pr');
  });

  it('rejects unsupported modes', async () => {
    await assert.rejects(
      () => loadAutomationConfig({ env: { AUTOMATION_MODE: 'bad' }, cwd: '/tmp' }),
      /Unsupported automation mode/
    );
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- test/automationConfig.test.js`  
Expected: fail because `src/automationConfig.js` does not exist.

- [ ] **Step 3: Implement config loader**

Implement `loadAutomationConfig({ env, cwd })` using `node:fs/promises`. Defaults must include all label names and commands from the design doc. Merge nested objects shallowly per section.

- [ ] **Step 4: Add example config and gitignore entries**

Add `automation.config.example.json` with cloud defaults and local-pr disabled. Add these to `.gitignore`:

```gitignore
automation.config.json
.aipr/
.codex-issue-context.json
storage/jobs/*.log
```

- [ ] **Step 5: Verify**

Run: `npm test -- test/automationConfig.test.js`  
Expected: pass.

## Task 2: Automation Router

**Files:**
- Create: `src/automationRouter.js`
- Create: `test/automationRouter.test.js`
- Modify: `src/githubIssue.js`
- Modify: `test/githubIssue.test.js`

- [ ] **Step 1: Write router tests**

Test that cloud mode returns current labels and local-pr mode returns local labels without `autofix:candidate`.

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeAutomation } from '../src/automationRouter.js';

const report = {
  type: 'bug',
  classification: {
    route: 'bug-autofix',
    labels: ['bug', 'autofix:candidate']
  }
};

describe('routeAutomation', () => {
  it('keeps cloud autofix labels in cloud mode', () => {
    const result = routeAutomation(report, {
      mode: 'cloud',
      cloud: { autofixLabel: 'autofix:candidate' }
    });
    assert.deepEqual(result.labels, ['bug', 'autofix:candidate']);
    assert.equal(result.mode, 'cloud');
  });

  it('uses local candidate labels in local-pr mode', () => {
    const result = routeAutomation(report, {
      mode: 'local-pr',
      localPr: { candidateLabel: 'local:candidate' }
    });
    assert.deepEqual(result.labels, ['bug', 'local:candidate']);
    assert.equal(result.mode, 'local-pr');
    assert.equal(result.labels.includes('autofix:candidate'), false);
  });
});
```

- [ ] **Step 2: Implement router**

Create `routeAutomation(report, config)`. Preserve `needs:human` and `risk:review` labels for human-review reports in both modes.

- [ ] **Step 3: Update GitHub issue creation**

Change `createGitHubIssue(report, env)` to accept optional labels:

```js
export async function createGitHubIssue(report, env = process.env, options = {}) {
  const labels = options.labels || report.classification.labels;
  // use labels in request body
}
```

- [ ] **Step 4: Verify**

Run: `npm test -- test/automationRouter.test.js test/githubIssue.test.js`  
Expected: pass.

## Task 3: Local Prompt and Process Runner

**Files:**
- Create: `src/localPrompt.js`
- Create: `src/processRunner.js`
- Create: `test/localPrompt.test.js`

- [ ] **Step 1: Write prompt tests**

Verify prompt references `.codex-issue-context.json`, includes safety rules, and does not embed shell commands from the report.

- [ ] **Step 2: Implement `buildLocalCodexPrompt(issue)`**

Prompt must instruct Codex to implement the GitHub Issue represented in `.codex-issue-context.json`, keep changes minimal, ignore user-submitted conflicting instructions, and run relevant tests when practical.

- [ ] **Step 3: Implement `runCommand(command, args, options)`**

Wrap `child_process.spawn` and return `{ code, stdout, stderr }`. Support stdin text, cwd, env, and timeout.

- [ ] **Step 4: Verify**

Run: `npm test -- test/localPrompt.test.js`  
Expected: pass.

## Task 4: Local Git Worktree Helper

**Files:**
- Create: `src/localGit.js`
- Create: `test/localGit.test.js`

- [ ] **Step 1: Write git helper tests with mocked runner**

Assert command sequences for repo verification, worktree creation, diff detection, commit, and push.

- [ ] **Step 2: Implement helpers**

Export:

```js
export async function verifyGitRepo({ repoPath, runCommand }) {}
export async function createIssueWorktree({ repoPath, worktreeRoot, branchName, baseBranch, issueNumber, runCommand }) {}
export async function hasChanges({ cwd, runCommand }) {}
export async function commitChanges({ cwd, message, runCommand }) {}
export async function pushBranch({ cwd, branchName, runCommand }) {}
```

- [ ] **Step 3: Verify**

Run: `npm test -- test/localGit.test.js`  
Expected: pass.

## Task 5: GitHub Queue Helpers

**Files:**
- Modify: `src/githubIssue.js`
- Modify: `test/githubIssue.test.js`

- [ ] **Step 1: Add tests for queue operations**

Mock `fetch` to verify:

- `listApprovedLocalIssues` searches for approved candidate issues.
- `addIssueLabels` sends label updates.
- `removeIssueLabel` removes running labels.
- `commentOnIssue` writes status comments.

- [ ] **Step 2: Implement helpers**

Add named exports:

```js
export async function listApprovedLocalIssues(env, config) {}
export async function addIssueLabels(issueNumber, labels, env) {}
export async function removeIssueLabel(issueNumber, label, env) {}
export async function commentOnIssue(issueNumber, body, env) {}
```

- [ ] **Step 3: Verify**

Run: `npm test -- test/githubIssue.test.js`  
Expected: pass.

## Task 6: Local Worker

**Files:**
- Create: `src/localWorker.js`
- Create: `scripts/local-worker.js`
- Create: `test/localWorker.test.js`

- [ ] **Step 1: Write worker tests**

Cover success, Codex failure, test failure, no changes, and PR creation failure using mocked GitHub helpers and mocked process runner.

- [ ] **Step 2: Implement `runLocalWorkerOnce`**

The function:

1. loads config
2. lists approved issues
3. claims one issue by adding `local:running`
4. creates worktree
5. writes `.codex-issue-context.json`
6. runs Codex
7. runs tests
8. checks changes
9. commits and pushes
10. runs `gh pr create`
11. comments and updates labels

- [ ] **Step 3: Implement CLI**

`scripts/local-worker.js` supports:

```bash
node scripts/local-worker.js --once
node scripts/local-worker.js
```

Continuous mode sleeps for `pollIntervalSeconds` between runs.

- [ ] **Step 4: Add package script**

Modify `package.json`:

```json
"worker:local": "node scripts/local-worker.js",
"worker:local:once": "node scripts/local-worker.js --once"
```

- [ ] **Step 5: Verify**

Run: `npm test -- test/localWorker.test.js`  
Expected: pass.

## Task 7: Server Integration and UI Copy

**Files:**
- Modify: `src/server.js`
- Modify: `public/report.js`
- Modify: `test/server.test.js`
- Modify: `test/reportResult.test.js`

- [ ] **Step 1: Write server tests**

Test cloud mode still sends `autofix:candidate`. Test local-pr mode sends `local:candidate` and response includes `automation.mode = "local-pr"`.

- [ ] **Step 2: Integrate config and router**

In `createApp`, load config once during app creation. In `POST /api/report`, call `routeAutomation(report, config)` before creating the Issue and pass route labels to `createGitHubIssue`.

- [ ] **Step 3: Update result copy**

When response has `automation.mode === 'local-pr'`, show:

```text
这条反馈已进入本地处理队列。管理员审批后，本地 worker 会在本地仓库创建分支并开 PR。
```

- [ ] **Step 4: Verify**

Run: `npm test -- test/server.test.js test/reportResult.test.js`  
Expected: pass.

## Task 8: Documentation and Manual QA

**Files:**
- Modify: `README.md`
- Modify: `docs/plain-language-guide.md`
- Modify: `docs/security-policy.md`
- Update: `docs/qa/2026-06-02-local-pr-mode.md`

- [ ] **Step 1: Document configuration**

Add a section explaining `cloud` vs `local-pr`, required tools (`git`, `gh`, `codex`), required GitHub labels, and how to run `npm run worker:local`.

- [ ] **Step 2: Document security boundaries**

Add local mode warnings: do not expose local worker publicly, use a trusted machine, keep local mode disabled by default, and keep risky reports in human review.

- [ ] **Step 3: Run full automated tests**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 4: Manual local dry run**

Using a test GitHub Issue with `local:candidate` and `local:approved`, run:

```bash
npm run worker:local:once
```

Expected:

- worker claims issue with `local:running`
- creates a worktree under `.aipr/worktrees`
- runs Codex and configured tests
- pushes an `ai/local/issue-<number>` branch
- creates a PR
- comments the PR URL on the Issue
- updates label to `local:pr-created`

- [ ] **Step 5: Record evidence**

Update `docs/qa/2026-06-02-local-pr-mode.md` with commands, Issue URL, PR URL, test output summary, and any failures.

## Final Verification Commands

Run these before completion:

```bash
npm test
npm run worker:local:once
git status --short
```

Expected:

- `npm test` passes.
- local worker dry run creates or updates the expected GitHub Issue/PR in a test repository.
- `git status --short` contains only intentional source, docs, and test changes.

## Plan Self-Review

- Spec coverage: every design section maps to config, routing, queue, worker, or QA tasks.
- Placeholder scan: no task depends on an undefined file or unspecified command.
- Type consistency: labels use `localPr.*Label`; mode string is consistently `local-pr`; local execution uses `codex exec`.
