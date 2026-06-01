import { resolve } from 'node:path';

async function runGit({ cwd, args, runCommand }) {
  const result = await runCommand('git', args, { cwd });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout || result.code}`);
  }
  return result;
}

export async function verifyGitRepo({ repoPath, runCommand }) {
  const result = await runGit({
    cwd: repoPath,
    args: ['rev-parse', '--show-toplevel'],
    runCommand
  });

  return result.stdout.trim();
}

export async function createIssueWorktree({
  repoPath,
  worktreeRoot,
  branchName,
  baseBranch,
  issueNumber,
  runCommand
}) {
  const worktreePath = resolve(repoPath, worktreeRoot, `issue-${issueNumber}`);

  await runGit({
    cwd: repoPath,
    args: ['fetch', 'origin', baseBranch],
    runCommand
  });

  await runGit({
    cwd: repoPath,
    args: ['worktree', 'add', worktreePath, '-b', branchName, `origin/${baseBranch}`],
    runCommand
  });

  return worktreePath;
}

export async function hasChanges({ cwd, runCommand }) {
  const result = await runGit({
    cwd,
    args: ['status', '--porcelain'],
    runCommand
  });

  return result.stdout.trim().length > 0;
}

export async function commitChanges({ cwd, message, runCommand }) {
  await runGit({
    cwd,
    args: ['add', '.'],
    runCommand
  });

  await runGit({
    cwd,
    args: ['commit', '-m', message],
    runCommand
  });
}

export async function pushBranch({ cwd, branchName, runCommand }) {
  await runGit({
    cwd,
    args: ['push', '-u', 'origin', branchName],
    runCommand
  });
}
