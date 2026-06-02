# Terminal Codex Run Design

## Goal

Add an optional local worker execution mode where only the Codex step opens a visible macOS terminal window. The local worker should still own the queue, worktree setup, test execution, commit, push, and PR creation.

## Scope

This extends Local PR mode. The current internal execution remains the default:

- `internal`: worker runs `codex exec` through Node `spawn` and captures output in memory.
- `terminal`: worker opens a terminal window for the `codex exec` step, waits for a status file, then continues the existing PR flow.

The first implementation targets macOS because the requested local machine is a Mac. It should support either iTerm2 or Terminal through AppleScript, with iTerm2 as the preferred app when configured.

## Non-goals

- Do not move the entire worker loop into a terminal window.
- Do not make Codex interactive with a human during automated issue processing.
- Do not change GitHub labels, worktree naming, PR creation, or test execution semantics.
- Do not expose a public callback endpoint on the Mac.

## Configuration

Add optional fields under `localPr`:

```json
{
  "localPr": {
    "codexRunMode": "internal",
    "terminalApp": "iterm2",
    "terminalCloseOnExit": false,
    "terminalRunRoot": ".aipr/runs"
  }
}
```

Field meanings:

- `codexRunMode`: `internal` or `terminal`.
- `terminalApp`: `iterm2` or `terminal`.
- `terminalCloseOnExit`: whether the opened terminal window should close after Codex exits.
- `terminalRunRoot`: repository-relative directory for generated scripts, logs, prompt files, and status files.

Defaults keep today's behavior. Existing `automation.config.json` files do not need to change.

## Data Flow

1. Worker claims an approved local Issue.
2. Worker creates the issue worktree and writes `.codex-issue-context.json`.
3. If `codexRunMode` is `internal`, worker uses the current `runCommand(local.codexCommand, local.codexArgs, ...)` path.
4. If `codexRunMode` is `terminal`, worker creates a per-issue run directory:
   - `prompt.txt`
   - `run.sh`
   - `stdout.log`
   - `stderr.log`
   - `status.json`
5. Worker opens the configured terminal app and runs `run.sh`.
6. `run.sh` changes into the worktree, feeds `prompt.txt` to `codex exec`, writes logs, and writes `status.json` with the exit code.
7. Worker polls `status.json` until completion or timeout.
8. Worker treats the terminal run result like the existing Codex result:
   - exit code `0`: continue to tests.
   - non-zero exit: mark Issue failed with the log path.

## Terminal Behavior

The terminal window is only a visibility layer. It should not become the source of truth.

For `terminalCloseOnExit: false`, the script should leave the window open after printing the exit code and log path.

For `terminalCloseOnExit: true`, the script may exit immediately after writing `status.json`. Terminal auto-close behavior depends on app profile settings, so the implementation should not rely on window closure for correctness.

## Safety

- The terminal run gets the same sanitized environment as the internal Codex run, without `GITHUB_OWNER`, `GITHUB_REPO`, or `GITHUB_TOKEN`.
- User issue text remains data in `.codex-issue-context.json`, not shell script content.
- The generated shell script should quote paths safely and read the prompt from a file instead of interpolating prompt text into shell code.
- The worker should write run artifacts under `.aipr/runs`, which is local-only and ignored by Git.

## Failure Behavior

- Unsupported `codexRunMode`: config validation fails.
- Unsupported `terminalApp`: config validation fails.
- AppleScript launch fails: mark Issue failed before tests.
- `status.json` is not written before timeout: mark Issue failed and include the run directory.
- Codex exits non-zero: mark Issue failed and include stdout/stderr log paths.
- Terminal window remains open after failure by default for inspection.

## Verification Strategy

- Config tests verify defaults and reject unsupported terminal values.
- Worker tests verify `internal` mode keeps the current `runCommand` path.
- Worker tests verify `terminal` mode calls a terminal runner, passes the prompt, uses the worktree as cwd, and still continues to tests and PR creation on success.
- Terminal runner tests verify generated run artifacts and status parsing without launching a real terminal.
- Manual QA verifies one real Issue where the Codex step appears in iTerm2 or Terminal, then the worker completes the PR flow.

## Design Self-Review

- The design keeps the existing reliable queue and PR flow intact.
- The terminal window is observable but not authoritative; worker completion depends on `status.json`.
- The feature is opt-in and preserves current defaults.
- The design avoids embedding untrusted Issue text in shell scripts.
- The scope is small enough to implement without changing GitHub routing or deployment behavior.
