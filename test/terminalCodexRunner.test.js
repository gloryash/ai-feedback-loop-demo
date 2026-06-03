import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCodexInTerminal } from '../src/terminalCodexRunner.js';

async function makeDirs() {
  const root = await mkdtemp(join(tmpdir(), 'terminal-codex-'));
  const worktreePath = join(root, 'worktree');
  const runRoot = join(root, 'runs');
  await mkdir(worktreePath, { recursive: true });
  return { root, worktreePath, runRoot };
}

test('runCodexInTerminal writes run artifacts and returns status output', async () => {
  const { worktreePath, runRoot } = await makeDirs();
  const calls = [];

  const result = await runCodexInTerminal({
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
    env: { CODEX_HOME: '/tmp/codex-home', GITHUB_TOKEN: 'must-not-be-exported' },
    deps: {
      mkdir,
      writeFile,
      readFile,
      chmod,
      runCommand: async (command, args, options) => {
        calls.push({ command, args, options });
        const issueRunDir = join(runRoot, 'issue-42');
        await writeFile(join(issueRunDir, 'status.json'), JSON.stringify({
          code: 0,
          stdoutPath: join(issueRunDir, 'stdout.log'),
          stderrPath: join(issueRunDir, 'stderr.log')
        }));
        await writeFile(join(issueRunDir, 'stdout.log'), 'codex ok');
        await writeFile(join(issueRunDir, 'stderr.log'), '');
        return { code: 0, stdout: '', stderr: '' };
      },
      sleep: async () => {},
      now: () => Date.now()
    }
  });

  const issueRunDir = join(runRoot, 'issue-42');
  const prompt = await readFile(join(issueRunDir, 'prompt.txt'), 'utf8');
  const script = await readFile(join(issueRunDir, 'run.sh'), 'utf8');

  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'codex ok');
  assert.equal(result.stderr, '');
  assert.equal(result.runDir, issueRunDir);
  assert.equal(prompt, 'local prompt');
  assert.match(script, /codex/);
  assert.match(script, /CODEX_HOME/);
  assert.match(script, /AIPR local Codex run/);
  assert.match(script, /mkfifo/);
  assert.match(script, /tee "\$STDOUT_PATH"/);
  assert.match(script, /tee "\$STDERR_PATH"/);
  assert.doesNotMatch(script, /> "\$STDOUT_PATH" 2> "\$STDERR_PATH"/);
  assert.doesNotMatch(script, /must-not-be-exported/);
  assert.equal(calls[0].command, 'osascript');
  assert.equal(calls[0].args[0], '-e');
  assert.match(calls[0].args[1], /iTerm2/);
});

test('runCodexInTerminal returns launch failure without waiting for status', async () => {
  const { worktreePath, runRoot } = await makeDirs();

  const result = await runCodexInTerminal({
    local: {
      codexCommand: 'codex',
      codexArgs: ['exec', '-'],
      terminalApp: 'terminal',
      terminalRunRoot: runRoot,
      terminalCloseOnExit: false,
      terminalStatusTimeoutMs: 1000,
      terminalStatusPollMs: 10
    },
    worktreePath,
    issueNumber: 13,
    prompt: 'prompt',
    env: {},
    deps: {
      mkdir,
      writeFile,
      readFile,
      chmod,
      runCommand: async () => ({ code: 1, stdout: '', stderr: 'osascript failed' }),
      sleep: async () => {},
      now: () => Date.now()
    }
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /osascript failed/);
  assert.equal(result.runDir, join(runRoot, 'issue-13'));
});

test('runCodexInTerminal resolves relative run root from repoPath', async () => {
  const { root } = await makeDirs();
  const repoPath = join(root, 'repo');
  const worktreePath = join(root, 'custom-worktrees', 'issue-7');
  const expectedRunDir = join(repoPath, '.aipr', 'runs', 'issue-7');
  await mkdir(worktreePath, { recursive: true });

  const result = await runCodexInTerminal({
    local: {
      repoPath,
      codexCommand: 'codex',
      codexArgs: ['exec', '-'],
      terminalApp: 'terminal',
      terminalRunRoot: '.aipr/runs',
      terminalCloseOnExit: true,
      terminalStatusTimeoutMs: 1000,
      terminalStatusPollMs: 10
    },
    worktreePath,
    issueNumber: 7,
    prompt: 'prompt',
    env: {},
    deps: {
      mkdir,
      writeFile,
      readFile,
      chmod,
      runCommand: async () => {
        await writeFile(join(expectedRunDir, 'status.json'), JSON.stringify({
          code: 0,
          stdoutPath: join(expectedRunDir, 'stdout.log'),
          stderrPath: join(expectedRunDir, 'stderr.log')
        }));
        await writeFile(join(expectedRunDir, 'stdout.log'), 'ok');
        await writeFile(join(expectedRunDir, 'stderr.log'), '');
        return { code: 0, stdout: '', stderr: '' };
      },
      sleep: async () => {},
      now: () => Date.now()
    }
  });

  assert.equal(result.runDir, expectedRunDir);
  assert.equal(result.code, 0);
});

test('runCodexInTerminal reports timeout when status is not written', async () => {
  const { worktreePath, runRoot } = await makeDirs();
  let current = 0;

  const result = await runCodexInTerminal({
    local: {
      codexCommand: 'codex',
      codexArgs: ['exec', '-'],
      terminalApp: 'terminal',
      terminalRunRoot: runRoot,
      terminalCloseOnExit: true,
      terminalStatusTimeoutMs: 30,
      terminalStatusPollMs: 10
    },
    worktreePath,
    issueNumber: 99,
    prompt: 'prompt',
    env: {},
    deps: {
      mkdir,
      writeFile,
      readFile,
      chmod,
      runCommand: async () => ({ code: 0, stdout: '', stderr: '' }),
      sleep: async (ms) => {
        current += ms;
      },
      now: () => current
    }
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Timed out waiting for terminal Codex run/);
  assert.equal(result.runDir, join(runRoot, 'issue-99'));
});
