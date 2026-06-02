# Terminal Codex Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in Local PR mode setting that opens a visible macOS terminal window for only the Codex step while preserving the worker's existing PR flow.

**Architecture:** Keep `localWorker` as the orchestrator. Add a focused terminal runner that creates run artifacts, launches iTerm2 or Terminal through AppleScript, waits for `status.json`, and returns the same result shape as `runCommand`.

**Tech Stack:** Node.js ESM, `node:test`, macOS `osascript`, shell scripts, existing GitHub/local worker modules.

**QA Result File:** `docs/qa/2026-06-02-terminal-codex-run.md`

---

## 文件结构

- Modify: `src/automationConfig.js`
  - Add defaults for `codexRunMode`, `terminalApp`, `terminalCloseOnExit`, and `terminalRunRoot`.
  - Validate supported values.
- Create: `src/terminalCodexRunner.js`
  - Owns run artifact creation, shell script generation, AppleScript launch, status polling, and result normalization.
- Modify: `src/localWorker.js`
  - Select internal or terminal Codex execution based on `localPr.codexRunMode`.
- Modify: `automation.config.example.json`
  - Document new optional local terminal settings.
- Modify: `test/automationConfig.test.js`
  - Cover defaults and validation failures.
- Create: `test/terminalCodexRunner.test.js`
  - Cover artifact generation, status success, launch failure, and timeout without launching a real terminal.
- Modify: `test/localWorker.test.js`
  - Cover terminal-mode worker routing and credential sanitization.
- Create: `docs/qa/2026-06-02-terminal-codex-run.md`
  - Record planned and final evidence.

## QA 矩阵

| 需求项 | 实现入口 | 验证方式 | 通过标准 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 默认仍为后台执行，不破坏现有 worker | `src/automationConfig.js`, `src/localWorker.js` | `npm test -- test/automationConfig.test.js test/localWorker.test.js` | 默认 `codexRunMode` 为 `internal`，现有 local worker 成功/失败路径继续通过 | `docs/qa/2026-06-02-terminal-codex-run.md` | PENDING |
| 配置可切换为终端窗口模式 | `src/automationConfig.js` | `npm test -- test/automationConfig.test.js` | 支持 `terminal`，拒绝未知 `codexRunMode` 和未知 `terminalApp` | `docs/qa/2026-06-02-terminal-codex-run.md` | PENDING |
| 终端模式能把 Codex 结果回传给 worker | `src/terminalCodexRunner.js` | `npm test -- test/terminalCodexRunner.test.js` | runner 写入 prompt/script/log/status 路径，读取 `status.json` 后返回 `{ code, stdout, stderr }` | `docs/qa/2026-06-02-terminal-codex-run.md` | PENDING |
| worker 只让 Codex 步骤走终端，后续测试/commit/PR 不变 | `src/localWorker.js` | `npm test -- test/localWorker.test.js` | terminal runner 成功后仍执行 test、hasChanges、commit、push、`gh pr create` | `docs/qa/2026-06-02-terminal-codex-run.md` | PENDING |
| 终端模式不泄漏 GitHub 凭证给 Codex | `src/localWorker.js`, `src/terminalCodexRunner.js` | `npm test -- test/localWorker.test.js` | terminal runner 收到的 env 不包含 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_TOKEN` | `docs/qa/2026-06-02-terminal-codex-run.md` | PENDING |
| 真实 macOS 终端窗口能被打开并完成状态回传 | `src/terminalCodexRunner.js` | 手动运行一次 smoke 命令，使用 fake command 避免真实改代码 | iTerm2 或 Terminal 出现窗口，脚本完成，`status.json` 为 code 0，窗口按配置保留或关闭 | `docs/qa/2026-06-02-terminal-codex-run.md` 和截图 | PENDING |

## Task 1: 配置默认值和校验

**Files:**
- Modify: `src/automationConfig.js`
- Modify: `test/automationConfig.test.js`

- [ ] **Step 1: Write failing tests**

Add tests:

```js
test('loadAutomationConfig defaults localPr Codex run mode to internal', async () => {
  const config = await loadAutomationConfig({ env: {}, cwd: '/missing' });

  assert.equal(config.localPr.codexRunMode, 'internal');
  assert.equal(config.localPr.terminalApp, 'iterm2');
  assert.equal(config.localPr.terminalCloseOnExit, false);
  assert.equal(config.localPr.terminalRunRoot, '.aipr/runs');
});

test('loadAutomationConfig rejects unsupported local terminal settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'automation-config-'));
  const path = join(dir, 'automation.config.json');
  await writeFile(path, JSON.stringify({
    localPr: {
      codexRunMode: 'browser',
      terminalApp: 'warp'
    }
  }));

  await assert.rejects(
    () => loadAutomationConfig({ env: { AUTOMATION_CONFIG: path }, cwd: dir }),
    /Unsupported localPr codexRunMode: browser/
  );
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- test/automationConfig.test.js`

Expected: FAIL because the new config keys and validation do not exist.

- [ ] **Step 3: Implement minimal config support**

In `src/automationConfig.js`, add:

```js
const SUPPORTED_CODEX_RUN_MODES = new Set(['internal', 'terminal']);
const SUPPORTED_TERMINAL_APPS = new Set(['iterm2', 'terminal']);
```

Add default fields under `DEFAULT_CONFIG.localPr`:

```js
codexRunMode: 'internal',
terminalApp: 'iterm2',
terminalCloseOnExit: false,
terminalRunRoot: '.aipr/runs',
```

Extend `validateConfig(config)`:

```js
if (!SUPPORTED_CODEX_RUN_MODES.has(config.localPr.codexRunMode)) {
  throw new Error(`Unsupported localPr codexRunMode: ${config.localPr.codexRunMode}`);
}

if (!SUPPORTED_TERMINAL_APPS.has(config.localPr.terminalApp)) {
  throw new Error(`Unsupported localPr terminalApp: ${config.localPr.terminalApp}`);
}
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- test/automationConfig.test.js`

Expected: PASS.

## Task 2: 终端 Codex runner

**Files:**
- Create: `src/terminalCodexRunner.js`
- Create: `test/terminalCodexRunner.test.js`

- [ ] **Step 1: Write failing tests**

Create tests for:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCodexInTerminal } from '../src/terminalCodexRunner.js';

test('runCodexInTerminal writes run artifacts and returns status output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'terminal-codex-'));
  const worktreePath = join(dir, 'worktree');
  const runRoot = join(dir, 'runs');
  const calls = [];

  const resultPromise = runCodexInTerminal({
    local: {
      codexCommand: 'codex',
      codexArgs: ['exec', '-'],
      terminalApp: 'iterm2',
      terminalRunRoot: runRoot,
      terminalCloseOnExit: false,
      terminalStatusTimeoutMs: 1000,
      terminalStatusPollMs: 10
    },
    worktreePath,
    issueNumber: 42,
    prompt: 'local prompt',
    env: { SAFE: '1' },
    deps: {
      mkdir: async () => {},
      writeFile,
      readFile,
      chmod: async () => {},
      runCommand: async (command, args, options) => {
        calls.push({ command, args, options });
        const statusPath = join(runRoot, 'issue-42', 'status.json');
        await writeFile(statusPath, JSON.stringify({
          code: 0,
          stdoutPath: join(runRoot, 'issue-42', 'stdout.log'),
          stderrPath: join(runRoot, 'issue-42', 'stderr.log')
        }));
        await writeFile(join(runRoot, 'issue-42', 'stdout.log'), 'codex ok');
        await writeFile(join(runRoot, 'issue-42', 'stderr.log'), '');
        return { code: 0, stdout: '', stderr: '' };
      },
      sleep: async () => {}
    }
  });

  const result = await resultPromise;

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'codex ok');
  assert.equal(result.stderr, '');
  assert.equal(calls[0].command, 'osascript');
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- test/terminalCodexRunner.test.js`

Expected: FAIL because `src/terminalCodexRunner.js` does not exist.

- [ ] **Step 3: Implement runner**

Create `runCodexInTerminal()` with this interface:

```js
export async function runCodexInTerminal({
  local,
  worktreePath,
  issueNumber,
  prompt,
  env,
  deps = DEFAULT_DEPS
})
```

Implementation requirements:

- Create `runDir = join(resolve(worktreePath, '..', '..', '..'), local.terminalRunRoot)` only when `terminalRunRoot` is relative; use it directly when absolute.
- Create `issueRunDir = join(runDir, `issue-${issueNumber}`)`.
- Write `prompt.txt`, `run.sh`, initial empty log files.
- `run.sh` must quote paths, run Codex in `worktreePath`, redirect logs, and write `status.json`.
- Launch with `osascript`:
  - iTerm2: `tell application "iTerm2" ... write text "<script path>"`
  - Terminal: `tell application "Terminal" ... do script "<script path>"`
- Poll `status.json` using `terminalStatusPollMs || 1000` until `terminalStatusTimeoutMs || 1800000`.
- Return `{ code, stdout, stderr, runDir: issueRunDir }`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- test/terminalCodexRunner.test.js`

Expected: PASS.

## Task 3: worker 集成终端模式

**Files:**
- Modify: `src/localWorker.js`
- Modify: `test/localWorker.test.js`

- [ ] **Step 1: Write failing tests**

Add a test:

```js
test('runLocalWorkerOnce uses terminal runner only for Codex in terminal mode', async () => {
  const { calls, deps } = makeDeps({
    commands: [
      { code: 0, stdout: 'tests passed', stderr: '' },
      { code: 0, stdout: 'https://github.com/acme/demo/pull/34\n', stderr: '' }
    ]
  });
  deps.runCodexInTerminal = async (options) => {
    calls.push(['runCodexInTerminal', options.worktreePath, options.prompt, options.env]);
    return { code: 0, stdout: 'codex terminal done', stderr: '', runDir: '/repo/.aipr/runs/issue-12' };
  };

  const result = await runLocalWorkerOnce({
    config: baseConfig({ codexRunMode: 'terminal' }),
    env: { GITHUB_OWNER: 'acme', GITHUB_REPO: 'demo', GITHUB_TOKEN: 'token' },
    deps
  });

  assert.equal(result.status, 'pr-created');
  assert.equal(calls.some((call) => call[0] === 'runCodexInTerminal'), true);
  assert.equal(calls.some((call) => call[0] === 'runCommand' && call[1] === 'codex'), false);
  assert.equal(calls.some((call) => call[0] === 'commitChanges'), true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- test/localWorker.test.js`

Expected: FAIL because `localWorker` does not call `runCodexInTerminal`.

- [ ] **Step 3: Implement worker routing**

Modify `DEFAULT_DEPS` to include `runCodexInTerminal`.

Replace the Codex execution block with:

```js
const codexEnv = withoutGitHubCredentials();
const codexPrompt = buildLocalCodexPrompt();
const codexResult = local.codexRunMode === 'terminal'
  ? await deps.runCodexInTerminal({
      local,
      worktreePath,
      issueNumber: issue.number,
      prompt: codexPrompt,
      env: codexEnv
    })
  : await deps.runCommand(local.codexCommand, local.codexArgs, {
      cwd: worktreePath,
      env: codexEnv,
      input: codexPrompt
    });
```

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- test/localWorker.test.js`

Expected: PASS.

## Task 4: 配置样例和 QA 文件

**Files:**
- Modify: `automation.config.example.json`
- Create: `docs/qa/2026-06-02-terminal-codex-run.md`

- [ ] **Step 1: Update config example**

Add these fields under `localPr`:

```json
"codexRunMode": "internal",
"terminalApp": "iterm2",
"terminalCloseOnExit": false,
"terminalRunRoot": ".aipr/runs",
```

- [ ] **Step 2: Create QA result file**

Create `docs/qa/2026-06-02-terminal-codex-run.md` with:

```markdown
# QA 结果

## 环境
- 分支：`feature/terminal-codex-run`
- 工作区：`.aipr/dev-worktrees/terminal-codex-run`
- 启动命令：待执行
- 前端 URL：不适用
- 后端 URL：不适用

## 验收矩阵
| 需求项 | 验证方式 | 通过标准 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |

## 返工记录
| 轮次 | 失败项 | 修复动作 | 结果 |
| --- | --- | --- | --- |
```

- [ ] **Step 3: Verify docs changed as expected**

Run: `git diff -- automation.config.example.json docs/qa/2026-06-02-terminal-codex-run.md`

Expected: shows only the config sample additions and QA result scaffold.

## Task 5: Final verification and manual smoke

**Files:**
- Modify: `docs/qa/2026-06-02-terminal-codex-run.md`

- [ ] **Step 1: Run full automated tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run a real terminal smoke command**

Use `runCodexInTerminal` with a harmless fake command in a temporary directory so the macOS terminal launch path is exercised without running real Codex:

```bash
node --input-type=module <<'NODE'
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCodexInTerminal } from './src/terminalCodexRunner.js';

const dir = await mkdtemp(join(tmpdir(), 'terminal-codex-smoke-'));
const worktreePath = join(dir, 'worktree');
await import('node:fs/promises').then((fs) => fs.mkdir(worktreePath, { recursive: true }));

const result = await runCodexInTerminal({
  local: {
    codexCommand: '/bin/sh',
    codexArgs: ['-c', 'cat >/dev/null; echo terminal smoke ok'],
    terminalApp: 'iterm2',
    terminalRunRoot: join(dir, 'runs'),
    terminalCloseOnExit: false,
    terminalStatusTimeoutMs: 30000,
    terminalStatusPollMs: 250
  },
  worktreePath,
  issueNumber: 999,
  prompt: 'smoke prompt',
  env: process.env
});

console.log(JSON.stringify(result, null, 2));
NODE
```

Expected: A visible terminal window opens, command exits with `code: 0`, stdout contains `terminal smoke ok`, and `status.json` exists under the printed run directory.

- [ ] **Step 3: Update QA result file**

Record:

- `npm test` pass/fail count.
- Terminal smoke command output.
- Screenshot path if a visible terminal screenshot is captured.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add src/automationConfig.js src/localWorker.js src/terminalCodexRunner.js test/automationConfig.test.js test/localWorker.test.js test/terminalCodexRunner.test.js automation.config.example.json docs/qa/2026-06-02-terminal-codex-run.md docs/superpowers/plans/2026-06-02-terminal-codex-run.md
git commit -m "feat: show local Codex runs in terminal"
```

Expected: commit succeeds on `feature/terminal-codex-run`.

## Plan Self-Review

- Spec coverage: config defaults, terminal runner, worker routing, safety, failure behavior, and QA are covered.
- Placeholder scan: no TODO/TBD placeholders are present.
- Type consistency: `codexRunMode`, `terminalApp`, `terminalCloseOnExit`, and `terminalRunRoot` are consistently named across config, tests, and runner.
- Scope: this plan does not change GitHub labels, deployment, PR creation, or full worker process ownership.
