# AI Feedback Loop Demo

Minimal demo for a user-feedback-to-AI-PR workflow.

## What it shows

- `/` is a simulated product page used to reproduce or verify a pricing bug.
- `/report.html` is a non-GitHub user feedback form with screenshot/log upload.
- `POST /api/report` stores a normalized ticket, classifies it, and optionally creates a GitHub issue.
- GitHub Actions runs Codex when the `autofix:candidate` label is added to an issue.
- Codex is configured to call a custom Responses API endpoint through repository secrets.

## Local run

```bash
npm install
npm test
npm start
```

Open:

- <http://localhost:3000>
- <http://localhost:3000/report.html>

## Configure GitHub Actions

Set these repository secrets:

```text
AI_PROXY_KEY=<your proxy key>
AI_RESPONSES_ENDPOINT=https://your-proxy.example.com/v1/responses
```

For the feedback form to create GitHub issues directly, run the app with:

```text
GITHUB_OWNER=<owner>
GITHUB_REPO=<repo>
GITHUB_TOKEN=<GitHub App installation token or fine-grained PAT>
PUBLIC_BASE_URL=<deployed feedback site URL>
```

## How the trigger works

1. A user submits the form or a maintainer labels a GitHub issue.
2. The server classifies the report.
3. If it is a reproducible low-risk bug, the GitHub issue gets `bug` and `autofix:candidate`.
4. `.github/workflows/ai-autofix.yml` runs when `autofix:candidate` is added.
5. Codex edits a new branch.
6. Tests run.
7. The workflow opens a PR.

Feature requests, design changes, and risky reports are labeled `needs:human` and do not trigger the autofix workflow.

## Demo result

Issue #1 in this repository was used as a live smoke test. Codex fixed the `SAVE10` Pro-plan bug, opened PR #2, the `node` and `gate` checks passed, and auto-merge merged the PR into `main`.

## Security notes

- Store API keys only in GitHub Secrets or deployment secrets.
- Treat issue body, screenshots, and logs as untrusted input.
- Redact tokens, cookies, emails, phone numbers, and user identifiers before sending logs to AI in production.
- Keep auto-merge restricted to small, tested bugfixes.
