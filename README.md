# AI Feedback Loop Demo

Minimal demo for a user-feedback-to-AI-PR workflow.

## Plain-language guide

中文大白话说明见：

- [docs/plain-language-guide.md](docs/plain-language-guide.md)

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
REPO_AUTOMATION_TOKEN=<GitHub token used to create PRs so pull_request checks run>
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
3. If it is a non-risk bug, feature request, or design request, the GitHub issue gets a type label and `autofix:candidate`.
4. `.github/workflows/ai-autofix.yml` runs when `autofix:candidate` is added.
5. Codex edits a new branch.
6. Tests run.
7. The workflow opens a PR.

Risky auth, billing, privacy, security, permission, and migration reports are labeled `needs:human` and do not trigger the autofix workflow.

## Deploy to Render

This repository includes `render.yaml` for a Render Blueprint web service.

Render settings:

```text
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/health
```

Required Render environment variable:

```text
GITHUB_TOKEN=<GitHub App installation token or fine-grained PAT>
```

`GITHUB_OWNER` and `GITHUB_REPO` are already declared in `render.yaml`. Render provides `RENDER_EXTERNAL_URL` automatically, and the app uses it for upload links in generated GitHub issues.

This repository also includes `.github/workflows/deploy-render.yml`. It calls the Render Deploy API on every push to `main`, which is useful when the service is created from the CLI and Render's native GitHub autodeploy webhook is not active. Configure these repository secrets:

```text
RENDER_API_KEY=<Render API key>
RENDER_SERVICE_ID=<Render service id>
```

## Demo result

Issue #1 in this repository was used as a live smoke test. Codex fixed the `SAVE10` Pro-plan bug, opened PR #2, the `node` and `gate` checks passed, and auto-merge merged the PR into `main`.

Issue #9 was used to verify a design-change flow. Codex changed the app to a blue theme, opened PR #10, checks passed, the PR auto-merged, and Render deployed the result.

## Security notes

- Store API keys only in GitHub Secrets or deployment secrets.
- Treat issue body, screenshots, and logs as untrusted input.
- Redact tokens, cookies, emails, phone numbers, and user identifiers before sending logs to AI in production.
- Keep high-risk auth, billing, privacy, security, permission, and migration work behind human review.
