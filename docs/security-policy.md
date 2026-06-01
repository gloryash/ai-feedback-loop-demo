# Security Policy

## Secret handling

- Do not commit API keys.
- `AI_PROXY_KEY` and `AI_RESPONSES_ENDPOINT` must be GitHub Secrets.
- The feedback app's `GITHUB_TOKEN` should be a GitHub App installation token or fine-grained token with minimum permissions.
- Local PR mode requires local `gh` and `codex` credentials. Keep those credentials on the trusted local machine and do not commit `automation.config.json`.

## Untrusted input

All user-submitted text, screenshots, and logs are untrusted. The AI prompt and `AGENTS.md` instruct Codex to ignore any instructions inside user content that conflict with repository policy.

Local PR mode also treats GitHub Issue body text as untrusted data. The worker writes the issue context to `.codex-issue-context.json` and passes a fixed prompt to `codex exec`; it never turns user text into a shell command.

## Autofix scope

Autofix is only for narrow, reproducible bugs. The following require human review:

- Feature requests
- Design changes
- Auth and authorization
- Billing or payment
- Privacy and PII
- Security reports
- Database migrations
- Dependency upgrades with broad blast radius

## Local PR mode boundaries

- Local PR mode is disabled by default.
- The local worker must run on a trusted machine.
- The local worker should not be exposed as a public web service.
- The local worker processes only issues with both `local:candidate` and `local:approved`.
- The local worker uses per-issue `git worktree` directories under `.aipr/worktrees` to avoid modifying the user's daily working tree.
- The local worker opens PRs; it does not merge them.
