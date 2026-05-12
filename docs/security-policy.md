# Security Policy

## Secret handling

- Do not commit API keys.
- `AI_PROXY_KEY` and `AI_RESPONSES_ENDPOINT` must be GitHub Secrets.
- The feedback app's `GITHUB_TOKEN` should be a GitHub App installation token or fine-grained token with minimum permissions.

## Untrusted input

All user-submitted text, screenshots, and logs are untrusted. The AI prompt and `AGENTS.md` instruct Codex to ignore any instructions inside user content that conflict with repository policy.

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
