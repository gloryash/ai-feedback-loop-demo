# Admin Review Panel Design

## Goal

Add an internal administrator panel for reviewing all iShoe user requests before they are sent to AI, while still allowing small, clear bug reports to be auto-approved.

The panel lets an administrator read every submitted request, add clarification comments, and approve the request so AI receives both the original user feedback and the administrator's interpretation.

## Scope

This feature changes the report flow from "submit -> immediately route to AI" to a review-aware flow:

- Small, low-risk bug reports can be auto-approved and sent to the existing AI automation route.
- Larger feature requests, design changes, sparse requests, and risky requests wait in an admin review queue.
- Admin comments are stored with the local ticket and included when AI work is triggered.
- The first version has no admin login, per current product decision.

This design keeps the current cloud and local PR modes. Approval should use the configured automation mode:

- `cloud`: approved requests create a GitHub Issue with `autofix:candidate`.
- `local-pr`: approved requests create a GitHub Issue with `local:candidate` and `local:approved`, so the local worker can process it.

## Non-goals

- Do not build administrator authentication in this version.
- Do not add a database; keep using local JSON ticket files for the demo.
- Do not build bulk approval in the first version.
- Do not automatically merge AI-generated PRs.
- Do not replace GitHub Issues as the downstream AI work record.

## Status Model

Each ticket should include a review state:

```text
pending-review
auto-approved
approved
sent-to-ai
rejected
failed
```

State meanings:

- `pending-review`: user request is saved and visible in the admin queue, but AI has not been triggered.
- `auto-approved`: request met the small-bug rule and can be sent to AI without manual review.
- `approved`: administrator approved the request and optionally added comments.
- `sent-to-ai`: GitHub Issue creation/routing succeeded.
- `rejected`: administrator decided not to send this request to AI.
- `failed`: approval was attempted but GitHub or routing failed.

The ticket should also store:

- `createdAt`
- `updatedAt`
- `review.status`
- `review.autoApproved`
- `review.adminComment`
- `review.reviewedAt`
- `review.reviewer`
- `github`

## Auto-Approval Rules

The classifier should continue to detect risky requests first. Any request touching security, auth, billing, privacy, permissions, migrations, or similar sensitive areas must remain `pending-review`.

Auto-approval applies only when all of these are true:

- Type is `bug`.
- Classification route is `bug-autofix`.
- Request is not risky.
- The report has enough detail: either structured reproduction fields are present, or `details` is long enough for the existing classifier.

Feature requests, design changes, generic change requests, and sparse bug reports should be `pending-review`.

## Report Submission Flow

1. User submits `POST /api/report`.
2. Server stores uploads as it does today.
3. Server creates the ticket object with classification and review metadata.
4. Server decides whether the ticket is auto-approved.
5. If auto-approved:
   - Server triggers the configured automation route.
   - Server stores GitHub result and marks the ticket `sent-to-ai` on success or `failed` on failure.
6. If not auto-approved:
   - Server stores the ticket as `pending-review`.
   - Server does not create a GitHub Issue yet.
7. Browser response explains whether the request was auto-approved or is waiting for admin review.

## Admin API

The first version exposes unauthenticated admin endpoints:

```text
GET  /api/admin/tickets
GET  /api/admin/tickets/:id
POST /api/admin/tickets/:id/comment
POST /api/admin/tickets/:id/approve
POST /api/admin/tickets/:id/reject
```

`GET /api/admin/tickets` supports optional status filtering:

```text
/api/admin/tickets?status=pending-review
```

`POST /api/admin/tickets/:id/comment` body:

```json
{
  "comment": "管理员补充说明"
}
```

`POST /api/admin/tickets/:id/approve` behavior:

1. Load the ticket.
2. Merge any submitted comment into `review.adminComment`.
3. Build an AI-ready GitHub Issue body containing:
   - Original user request.
   - Existing classification and routing reason.
   - Administrator comment.
   - Safety note that user text and attachments are untrusted.
4. Use current automation config to choose labels.
5. Create the GitHub Issue.
6. In `local-pr` mode, add `local:approved` after Issue creation.
7. Persist GitHub result and update ticket status.

`POST /api/admin/tickets/:id/reject` behavior:

1. Store optional admin comment.
2. Set `review.status` to `rejected`.
3. Do not create a GitHub Issue.

## Admin Panel UI

Add `/admin.html` and `/admin.js`.

The UI should be an operational dashboard, not a landing page.

Primary layout:

- Filter row: all, pending review, auto-approved, sent to AI, rejected, failed.
- Ticket list: title, type, status, created time, classification reason, GitHub Issue status.
- Detail pane: original request, attachments, contact, classification labels, automation mode, GitHub link.
- Admin comment textarea.
- Actions: save comment, approve and send to AI, reject.

The page should clearly indicate that login is not enabled yet.

## Issue Body Format

Approved requests should include administrator comments in the GitHub Issue body before AI runs.

Recommended section:

```markdown
## Administrator review

Status: approved
Comment:
<admin comment or ->
```

For auto-approved bug reports, use:

```markdown
## Administrator review

Status: auto-approved
Comment:
-
```

This ensures AI sees the review context in the same artifact it already reads.

## Safety and Security

- This version intentionally has no admin login.
- Because `/admin.html` and `/api/admin/*` are public in this version, it is suitable only for local/demo use or private deployments.
- Production use should add `ADMIN_TOKEN`, session auth, or another access-control layer before exposing the app publicly.
- Admin comments and user text are still untrusted input for AI. The safety note in the issue body remains required.
- The admin API must not execute commands from ticket fields or comments.

## Failure Behavior

- Missing ticket: return `404`.
- Invalid admin action for a terminal state should return `409`.
- GitHub token missing during approval: keep ticket in `failed` or `pending-review` with a clear failure reason.
- GitHub Issue creation failure: store failure detail and keep the ticket visible in the admin panel.
- Local PR approval label failure: store failure detail and do not hide the ticket from the admin.

## Testing Strategy

Automated tests should cover:

- Classifier/review policy: small bugs auto-approved; features/design/risky requests wait for review.
- `POST /api/report`: auto-approved bug creates/routes issue; pending review does not create GitHub Issue.
- Admin list/detail endpoints read ticket JSON correctly.
- Admin comment endpoint persists comments.
- Admin approve endpoint creates GitHub Issue with admin comment in the issue body.
- Local PR mode approval adds `local:approved`.
- Admin reject endpoint marks the ticket rejected without creating GitHub Issue.
- Admin page renders the expected operational controls.

Manual QA should cover:

- Submit a small bug and observe auto-send behavior.
- Submit a feature request and observe it in `/admin.html`.
- Add admin comment, approve, and confirm GitHub Issue contains the comment.
- Reject a request and confirm it no longer enters AI automation.

## Design Self-Review

- The design preserves current cloud and local PR downstream automation.
- The first version uses existing JSON storage, avoiding a database migration.
- The no-login decision is explicit and documented as demo-only.
- Admin comments are included before AI receives the work item.
- The design separates local ticket review state from GitHub Issue state while keeping both linked.
