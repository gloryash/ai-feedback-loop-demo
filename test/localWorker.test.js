import test from 'node:test';
import assert from 'node:assert/strict';
import { runLocalWorkerOnce } from '../src/localWorker.js';

function baseConfig(overrides = {}) {
  return {
    mode: 'local-pr',
    localPr: {
      enabled: true,
      repoPath: '/repo',
      baseBranch: 'main',
      worktreeRoot: '.aipr/worktrees',
      branchPrefix: 'ai/local',
      codexCommand: 'codex',
      codexArgs: ['exec', '--sandbox', 'workspace-write', '--ephemeral', '-'],
      testCommand: 'npm test',
      approvalLabel: 'local:approved',
      candidateLabel: 'local:candidate',
      runningLabel: 'local:running',
      doneLabel: 'local:pr-created',
      failedLabel: 'local:failed',
      ...overrides
    }
  };
}

function issue() {
  return {
    number: 12,
    title: 'SAVE10 coupon does not work',
    body: 'body',
    labels: [{ name: 'local:approved' }],
    url: 'https://github.com/acme/demo/issues/12',
    author: { login: 'user' }
  };
}

function makeDeps({ issues = [issue()], hasChanges = true, commands = [] } = {}) {
  const calls = [];
  const commandQueue = [...commands];
  const deps = {
    listApprovedLocalIssues: async () => {
      calls.push(['listApprovedLocalIssues']);
      return issues;
    },
    addIssueLabels: async (issueNumber, labels) => {
      calls.push(['addIssueLabels', issueNumber, labels]);
    },
    removeIssueLabel: async (issueNumber, label) => {
      calls.push(['removeIssueLabel', issueNumber, label]);
    },
    commentOnIssue: async (issueNumber, body) => {
      calls.push(['commentOnIssue', issueNumber, body]);
    },
    verifyGitRepo: async ({ repoPath }) => {
      calls.push(['verifyGitRepo', repoPath]);
      return repoPath;
    },
    createIssueWorktree: async ({ branchName, issueNumber }) => {
      calls.push(['createIssueWorktree', branchName, issueNumber]);
      return `/repo/.aipr/worktrees/issue-${issueNumber}`;
    },
    hasChanges: async () => {
      calls.push(['hasChanges']);
      return hasChanges;
    },
    commitChanges: async ({ message }) => {
      calls.push(['commitChanges', message]);
    },
    pushBranch: async ({ branchName }) => {
      calls.push(['pushBranch', branchName]);
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([
        'runCommand',
        command,
        args,
        options.cwd,
        options.input || '',
        options.shell || false,
        options.env
      ]);
      return commandQueue.shift() || { code: 0, stdout: '', stderr: '' };
    },
    writeFile: async (path, content) => {
      calls.push(['writeFile', path, content]);
    }
  };

  return { calls, deps };
}

test('runLocalWorkerOnce skips when localPr is disabled', async () => {
  const { calls, deps } = makeDeps();

  const result = await runLocalWorkerOnce({
    config: baseConfig({ enabled: false }),
    deps
  });

  assert.equal(result.processed, false);
  assert.equal(result.reason, 'local-pr disabled');
  assert.deepEqual(calls, []);
});

test('runLocalWorkerOnce processes one approved issue and creates a PR', async () => {
  const { calls, deps } = makeDeps({
    commands: [
      { code: 0, stdout: 'codex done', stderr: '' },
      { code: 0, stdout: 'tests passed', stderr: '' },
      { code: 0, stdout: 'https://github.com/acme/demo/pull/34\n', stderr: '' }
    ]
  });

  const result = await runLocalWorkerOnce({
    config: baseConfig(),
    env: { GITHUB_OWNER: 'acme', GITHUB_REPO: 'demo', GITHUB_TOKEN: 'token' },
    deps
  });

  assert.equal(result.processed, true);
  assert.equal(result.status, 'pr-created');
  assert.equal(result.issueNumber, 12);
  assert.equal(result.branchName, 'ai/local/issue-12');
  assert.equal(result.prUrl, 'https://github.com/acme/demo/pull/34');
  assert.deepEqual(calls[1], ['addIssueLabels', 12, ['local:running']]);
  assert.equal(calls.some((call) => call[0] === 'writeFile' && call[1].endsWith('/.codex-issue-context.json')), true);
  assert.equal(calls.some((call) => call[0] === 'commitChanges'), true);
  assert.equal(calls.some((call) => call[0] === 'pushBranch'), true);
  assert.equal(calls.some((call) => call[0] === 'commentOnIssue' && call[2].includes('pull/34')), true);
  assert.deepEqual(calls.at(-2), ['removeIssueLabel', 12, 'local:running']);
  assert.deepEqual(calls.at(-1), ['addIssueLabels', 12, ['local:pr-created']]);
});

test('runLocalWorkerOnce does not expose GitHub credentials to Codex or tests', async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalOwner = process.env.GITHUB_OWNER;
  const originalRepo = process.env.GITHUB_REPO;
  process.env.GITHUB_TOKEN = 'process-token';
  process.env.GITHUB_OWNER = 'process-owner';
  process.env.GITHUB_REPO = 'process-repo';

  try {
    const { calls, deps } = makeDeps({
      commands: [
        { code: 0, stdout: 'codex done', stderr: '' },
        { code: 0, stdout: 'tests passed', stderr: '' },
        { code: 0, stdout: 'https://github.com/acme/demo/pull/34\n', stderr: '' }
      ]
    });

    await runLocalWorkerOnce({
      config: baseConfig(),
      env: { GITHUB_OWNER: 'acme', GITHUB_REPO: 'demo', GITHUB_TOKEN: 'api-token' },
      deps
    });

    const codexCall = calls.find((call) => call[0] === 'runCommand' && call[1] === 'codex');
    const testCall = calls.find((call) => call[0] === 'runCommand' && call[1] === 'npm test');
    assert.equal(codexCall[6].GITHUB_TOKEN, undefined);
    assert.equal(codexCall[6].GITHUB_OWNER, undefined);
    assert.equal(codexCall[6].GITHUB_REPO, undefined);
    assert.equal(testCall[6].GITHUB_TOKEN, undefined);
    assert.equal(testCall[6].GITHUB_OWNER, undefined);
    assert.equal(testCall[6].GITHUB_REPO, undefined);
  } finally {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    if (originalOwner === undefined) {
      delete process.env.GITHUB_OWNER;
    } else {
      process.env.GITHUB_OWNER = originalOwner;
    }
    if (originalRepo === undefined) {
      delete process.env.GITHUB_REPO;
    } else {
      process.env.GITHUB_REPO = originalRepo;
    }
  }
});

test('runLocalWorkerOnce marks issue failed when Codex exits non-zero', async () => {
  const { calls, deps } = makeDeps({
    commands: [
      { code: 1, stdout: '', stderr: 'codex failed' }
    ]
  });

  const result = await runLocalWorkerOnce({
    config: baseConfig(),
    deps
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /Codex failed/);
  assert.equal(calls.some((call) => call[0] === 'commentOnIssue' && call[2].includes('codex failed')), true);
  assert.deepEqual(calls.at(-2), ['removeIssueLabel', 12, 'local:running']);
  assert.deepEqual(calls.at(-1), ['addIssueLabels', 12, ['local:failed']]);
});

test('runLocalWorkerOnce marks issue failed when tests fail', async () => {
  const { calls, deps } = makeDeps({
    commands: [
      { code: 0, stdout: 'codex done', stderr: '' },
      { code: 1, stdout: '', stderr: 'tests failed' }
    ]
  });

  const result = await runLocalWorkerOnce({
    config: baseConfig(),
    deps
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /Tests failed/);
  assert.equal(calls.some((call) => call[0] === 'commentOnIssue' && call[2].includes('tests failed')), true);
});

test('runLocalWorkerOnce marks issue failed when Codex produced no changes', async () => {
  const { calls, deps } = makeDeps({
    hasChanges: false,
    commands: [
      { code: 0, stdout: 'codex done', stderr: '' },
      { code: 0, stdout: 'tests passed', stderr: '' }
    ]
  });

  const result = await runLocalWorkerOnce({
    config: baseConfig(),
    deps
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /did not produce a code change/);
  assert.equal(calls.some((call) => call[0] === 'commitChanges'), false);
});
