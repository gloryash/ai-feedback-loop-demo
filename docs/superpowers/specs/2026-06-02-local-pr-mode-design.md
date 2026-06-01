# Local PR Mode Design

## Goal

Add a configurable local automation mode that lets approved user reports run through Codex on a local Mac or workstation, modify a local Git worktree, run tests, push a branch, and create a GitHub pull request.

## Scope

This feature adds a second automation route beside the existing cloud route.

- Cloud mode keeps the current flow: report -> GitHub Issue -> `autofix:candidate` -> GitHub Actions -> Codex Action -> PR.
- Local PR mode uses GitHub Issues as the approval queue: report -> GitHub Issue -> admin approval label -> local worker polls -> `codex exec` in local worktree -> tests -> push branch -> PR.

The first implementation will support one local repository, one GitHub repository, and a default concurrency of one worker job at a time.

## Non-goals

- Do not expose a public HTTP endpoint on the local Mac.
- Do not run local Codex from the production Render process.
- Do not automatically merge locally generated PRs.
- Do not process risky reports without human approval.
- Do not require a database; file storage and GitHub labels remain sufficient for this demo.

## Configuration

Runtime behavior is controlled by a local JSON config file. The committed repository will include `automation.config.example.json`; real machine-specific config lives in `automation.config.json`, which must be gitignored.

Recommended shape:

```json
{
  "mode": "cloud",
  "cloud": {
    "enabled": true,
    "autofixLabel": "autofix:candidate"
  },
  "localPr": {
    "enabled": false,
    "repoPath": ".",
    "baseBranch": "main",
    "worktreeRoot": ".aipr/worktrees",
    "branchPrefix": "ai/local",
    "pollIntervalSeconds": 20,
    "maxConcurrency": 1,
    "codexCommand": "codex",
    "codexArgs": ["exec", "--sandbox", "workspace-write", "--ephemeral", "-"],
    "testCommand": "npm test",
    "approvalLabel": "local:approved",
    "candidateLabel": "local:candidate",
    "runningLabel": "local:running",
    "doneLabel": "local:pr-created",
    "failedLabel": "local:failed"
  }
}
```

Environment variables may override only deployment-sensitive values:

- `AUTOMATION_CONFIG`: path to config file.
- `AUTOMATION_MODE`: `cloud` or `local-pr`.
- `LOCAL_PR_ENABLED`: enables local worker behavior when set to `true`.

## Issue labels

Cloud mode keeps using `autofix:candidate`.

Local PR mode must not add `autofix:candidate`, because that would also trigger the cloud workflow. Instead it creates issues with:

- type label: `bug`, `feature`, `design`, or `change`
- local candidate label: `local:candidate`

Admin approval is represented by adding `local:approved`.

Worker state labels:

- `local:running`: local worker has claimed the issue.
- `local:pr-created`: worker pushed a branch and opened a PR.
- `local:failed`: worker failed and left a comment with failure details.

## Data flow

### Report submission

1. Browser submits `POST /api/report`.
2. Server stores ticket JSON and attachments as it does today.
3. Server classifies the report.
4. Server builds the GitHub Issue body.
5. Automation routing chooses cloud labels or local labels based on config.
6. Server creates a GitHub Issue and returns the ticket and automation result.

### Admin approval

The first version uses GitHub as the approval UI. A human adds `local:approved` to the Issue. A later admin page may call the GitHub API to add the same label.

### Local worker execution

1. Worker reads config and verifies `localPr.enabled`.
2. Worker polls GitHub Issues for `local:approved`, `local:candidate`, and not `local:running`, not `local:pr-created`, not `local:failed`.
3. Worker claims the oldest eligible issue by adding `local:running`.
4. Worker creates a local branch and worktree:
   - branch: `ai/local/issue-<number>`
   - worktree: `<repoPath>/<worktreeRoot>/issue-<number>`
5. Worker writes `.codex-issue-context.json` in the worktree.
6. Worker runs `codex exec --sandbox workspace-write --ephemeral -` in the worktree with a prompt that points to `.codex-issue-context.json`.
7. Worker runs the configured test command.
8. If files changed and tests pass, worker commits, pushes the branch, and creates a PR with `gh pr create`.
9. Worker comments on the Issue with the PR URL and replaces `local:running` with `local:pr-created`.
10. On failure, worker comments with the phase and log path, removes `local:running`, and adds `local:failed`.

## Local repository safety

The worker should not modify the user's daily working tree. It creates a per-issue `git worktree` from the configured base branch. This isolates simultaneous jobs and avoids mixing AI changes with the user's local changes.

Default concurrency is one. Parallel execution can be added later because worktrees make it technically possible, but this demo should keep one job at a time to reduce conflicts and API usage.

## Security rules

- User report text, logs, and attachments remain untrusted.
- Local mode must be disabled by default.
- Local mode must not run from Render.
- The worker must not read shell commands from user-submitted content.
- The worker may only run commands from config: `codexCommand`, `codexArgs`, `testCommand`, `git`, and `gh`.
- Risky reports keep the existing human-review behavior and are not eligible for cloud or local autofix until a human adds the required approval label.
- The worker should run as a dedicated local user or with a repository-scoped environment when used beyond demo testing.

## Failure behavior

Expected failure states:

- GitHub token missing or unauthorized: worker exits before claiming jobs.
- Local repo path invalid: worker exits before claiming jobs.
- Worktree already exists: worker removes only the worktree path it created for the same issue, then retries once.
- Codex exits non-zero: mark Issue `local:failed`.
- Tests fail: mark Issue `local:failed` and keep branch/worktree for inspection.
- No code changes: comment on the Issue, remove `local:running`, and add `local:failed` with reason `no changes`.
- Push or PR creation fails: keep commit locally, mark `local:failed`, and include the branch name in the comment.

## Verification strategy

Verification will focus on state transitions and observable side effects:

- Unit tests for config defaults, mode selection, label selection, prompt generation, and worker state transitions.
- Integration-style tests with mocked GitHub API and mocked process execution for Codex, git, and gh.
- A manual local dry run against a test Issue using a disposable worktree.
- Existing `npm test` must continue to pass.

## Design self-review

- No implementation requires a public callback into the local Mac.
- Local PR mode avoids triggering the existing GitHub Actions cloud workflow by not using `autofix:candidate`.
- The approval queue is explicit and human-controlled through GitHub labels.
- Worktrees prevent local workspace pollution.
- The design has a clear failure path for every external dependency.
