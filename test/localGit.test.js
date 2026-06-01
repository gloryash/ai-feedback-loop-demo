import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import {
  commitChanges,
  createIssueWorktree,
  hasChanges,
  pushBranch,
  verifyGitRepo
} from '../src/localGit.js';

function makeRunner(results = []) {
  const calls = [];
  const runCommand = async (command, args, options = {}) => {
    calls.push({ command, args, cwd: options.cwd });
    return results.shift() || { code: 0, stdout: '', stderr: '' };
  };
  return { calls, runCommand };
}

test('verifyGitRepo checks that repoPath is a git repository', async () => {
  const runner = makeRunner([{ code: 0, stdout: '/repo\n', stderr: '' }]);

  const root = await verifyGitRepo({ repoPath: '/repo', runCommand: runner.runCommand });

  assert.equal(root, '/repo');
  assert.deepEqual(runner.calls, [
    { command: 'git', args: ['rev-parse', '--show-toplevel'], cwd: '/repo' }
  ]);
});

test('createIssueWorktree creates an issue-scoped branch and worktree', async () => {
  const runner = makeRunner();

  const worktreePath = await createIssueWorktree({
    repoPath: '/repo',
    worktreeRoot: '.aipr/worktrees',
    branchName: 'ai/local/issue-12',
    baseBranch: 'main',
    issueNumber: 12,
    runCommand: runner.runCommand
  });

  const expectedPath = resolve('/repo', '.aipr/worktrees', 'issue-12');
  assert.equal(worktreePath, expectedPath);
  assert.deepEqual(runner.calls, [
    { command: 'git', args: ['fetch', 'origin', 'main'], cwd: '/repo' },
    {
      command: 'git',
      args: ['worktree', 'add', expectedPath, '-b', 'ai/local/issue-12', 'origin/main'],
      cwd: '/repo'
    }
  ]);
});

test('hasChanges returns true when git status reports files', async () => {
  const runner = makeRunner([{ code: 0, stdout: ' M src/file.js\n', stderr: '' }]);

  assert.equal(await hasChanges({ cwd: '/repo/.aipr/worktrees/issue-12', runCommand: runner.runCommand }), true);
});

test('hasChanges returns false when git status is empty', async () => {
  const runner = makeRunner([{ code: 0, stdout: '', stderr: '' }]);

  assert.equal(await hasChanges({ cwd: '/repo/.aipr/worktrees/issue-12', runCommand: runner.runCommand }), false);
});

test('commitChanges stages and commits all changes', async () => {
  const runner = makeRunner();

  await commitChanges({
    cwd: '/repo/.aipr/worktrees/issue-12',
    message: 'fix: resolve local issue #12',
    runCommand: runner.runCommand
  });

  assert.deepEqual(runner.calls, [
    { command: 'git', args: ['add', '.'], cwd: '/repo/.aipr/worktrees/issue-12' },
    {
      command: 'git',
      args: ['commit', '-m', 'fix: resolve local issue #12'],
      cwd: '/repo/.aipr/worktrees/issue-12'
    }
  ]);
});

test('pushBranch pushes the local branch to origin', async () => {
  const runner = makeRunner();

  await pushBranch({
    cwd: '/repo/.aipr/worktrees/issue-12',
    branchName: 'ai/local/issue-12',
    runCommand: runner.runCommand
  });

  assert.deepEqual(runner.calls, [
    {
      command: 'git',
      args: ['push', '-u', 'origin', 'ai/local/issue-12'],
      cwd: '/repo/.aipr/worktrees/issue-12'
    }
  ]);
});
