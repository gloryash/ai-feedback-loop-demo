import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addIssueLabels,
  commentOnIssue,
  listApprovedLocalIssues,
  removeIssueLabel
} from './githubIssue.js';
import {
  commitChanges,
  createIssueWorktree,
  hasChanges,
  pushBranch,
  verifyGitRepo
} from './localGit.js';
import { buildLocalCodexPrompt, buildLocalIssueContext } from './localPrompt.js';
import { runCommand } from './processRunner.js';
import { runCodexInTerminal } from './terminalCodexRunner.js';

const DEFAULT_DEPS = {
  addIssueLabels,
  commentOnIssue,
  listApprovedLocalIssues,
  removeIssueLabel,
  commitChanges,
  createIssueWorktree,
  hasChanges,
  pushBranch,
  verifyGitRepo,
  runCommand,
  runCodexInTerminal,
  writeFile
};

function branchNameFor(issue, config) {
  return `${config.localPr.branchPrefix}/issue-${issue.number}`;
}

function commandFailure(label, result) {
  const detail = result.stderr || result.stdout || `exit code ${result.code}`;
  return new Error(`${label} failed: ${detail}`);
}

function prBodyForIssue(issueNumber) {
  return [
    `Closes #${issueNumber}`,
    '',
    '## AIPR automation',
    '- Auto-merge will be enabled for this local worker PR after GitHub checks pass.',
    '- Render deploy starts automatically after this PR is merged into main.',
    '- Deployment status is written back to the source issue as GitHub comments and labels.'
  ].join('\n');
}

function prCreatedComment(prUrl) {
  return [
    `Local worker created PR: ${prUrl}`,
    '',
    'Next steps:',
    '- GitHub Actions will enable auto-merge after checks pass.',
    '- Merging into main triggers Render deploy.',
    '- Render deploy status will be posted back to this issue.'
  ].join('\n');
}

function withoutGitHubCredentials(env = process.env) {
  const next = { ...env };
  delete next.GITHUB_OWNER;
  delete next.GITHUB_REPO;
  delete next.GITHUB_TOKEN;
  return next;
}

async function markFailed({ deps, issue, config, env, error }) {
  const local = config.localPr;
  await deps.commentOnIssue(
    issue.number,
    [
      'Local worker failed.',
      '',
      `Phase/error: ${error.message}`
    ].join('\n'),
    env
  );
  await deps.removeIssueLabel(issue.number, local.runningLabel, env);
  await deps.addIssueLabels(issue.number, [local.failedLabel], env);
}

export async function runLocalWorkerOnce({
  config,
  env = process.env,
  deps = DEFAULT_DEPS
} = {}) {
  if (!config?.localPr?.enabled) {
    return { processed: false, reason: 'local-pr disabled' };
  }

  const issues = await deps.listApprovedLocalIssues(env, config);
  if (!issues.length) {
    return { processed: false, reason: 'no approved issues' };
  }

  const issue = issues[0];
  const local = config.localPr;
  const branchName = branchNameFor(issue, config);

  await deps.addIssueLabels(issue.number, [local.runningLabel], env);

  try {
    await deps.verifyGitRepo({ repoPath: local.repoPath, runCommand: deps.runCommand });
    const worktreePath = await deps.createIssueWorktree({
      repoPath: local.repoPath,
      worktreeRoot: local.worktreeRoot,
      branchName,
      baseBranch: local.baseBranch,
      issueNumber: issue.number,
      runCommand: deps.runCommand
    });

    await deps.writeFile(
      join(worktreePath, '.codex-issue-context.json'),
      `${JSON.stringify(buildLocalIssueContext(issue), null, 2)}\n`
    );

    const codexEnv = withoutGitHubCredentials();
    const codexPrompt = buildLocalCodexPrompt();
    const codexResult = ['terminal', 'tui'].includes(local.codexRunMode)
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
    if (codexResult.code !== 0) {
      throw commandFailure('Codex', codexResult);
    }

    const testResult = await deps.runCommand(local.testCommand, [], {
      cwd: worktreePath,
      env: withoutGitHubCredentials(),
      shell: true
    });
    if (testResult.code !== 0) {
      throw commandFailure('Tests', testResult);
    }

    if (!(await deps.hasChanges({ cwd: worktreePath, runCommand: deps.runCommand }))) {
      throw new Error('Codex ran but did not produce a code change.');
    }

    await deps.commitChanges({
      cwd: worktreePath,
      message: `fix: resolve local issue #${issue.number}`,
      runCommand: deps.runCommand
    });
    await deps.pushBranch({ cwd: worktreePath, branchName, runCommand: deps.runCommand });

    const prResult = await deps.runCommand('gh', [
      'pr',
      'create',
      '--base',
      local.baseBranch,
      '--head',
      branchName,
      '--title',
      `fix: resolve local issue #${issue.number}`,
      '--body',
      prBodyForIssue(issue.number)
    ], {
      cwd: worktreePath
    });
    if (prResult.code !== 0) {
      throw commandFailure('PR creation', prResult);
    }

    const prUrl = prResult.stdout.trim();
    await deps.commentOnIssue(issue.number, prCreatedComment(prUrl), env);
    await deps.removeIssueLabel(issue.number, local.runningLabel, env);
    await deps.addIssueLabels(issue.number, [local.doneLabel], env);

    return {
      processed: true,
      status: 'pr-created',
      issueNumber: issue.number,
      branchName,
      prUrl
    };
  } catch (error) {
    await markFailed({ deps, issue, config, env, error });
    return {
      processed: true,
      status: 'failed',
      issueNumber: issue.number,
      branchName,
      error: error.message
    };
  }
}
