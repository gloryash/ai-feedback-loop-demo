# Architecture

## Components

- Demo app: `public/index.html`, `src/pricing.js`, `GET /api/quote`.
- Feedback form: `public/report.html`, `POST /api/report`.
- Classifier: `src/classifier.js`.
- GitHub issue adapter: `src/githubIssue.js`.
- AI workflow: `.github/workflows/ai-autofix.yml`.
- CI workflow: `.github/workflows/test.yml`.

## Data flow

```text
User form
  -> POST /api/report
  -> store ticket JSON and uploads
  -> classify route
  -> create GitHub issue when GitHub env is configured
  -> GitHub Actions runs on issue labels
  -> Codex edits branch and opens PR
```

## Routing policy

- `bug` with reproduction steps, expected result, and actual result: `bug-autofix`.
- `feature` or `design`: `human-review`.
- Security, auth, billing, privacy, permissions, or migration keywords: `human-review`.
- Missing detail: `human-review`.
