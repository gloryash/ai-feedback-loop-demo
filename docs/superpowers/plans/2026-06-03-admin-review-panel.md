# Admin Review Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unauthenticated internal admin panel where administrators can review iShoe user requests, add comments, approve large requests for AI, or reject them.

**Architecture:** Add a small ticket/review service around the existing JSON ticket storage, then route report submission and admin approval through that service. Keep GitHub Issues as the downstream AI work record; the admin page is a static operational UI served from `public/`.

**Tech Stack:** Node.js ESM, Express 5, Multer, local JSON files, existing GitHub helper functions, vanilla HTML/CSS/JS, `node:test`, Agent Browser for manual UI verification.

**QA Result File:** `docs/qa/2026-06-03-admin-review-panel.md`

---

## 文件结构

- Create: `src/reviewPolicy.js`
  - Determines whether a ticket can be auto-approved.
- Create: `src/ticketStore.js`
  - Reads/writes ticket JSON files, lists tickets, updates review state.
- Create: `src/reviewWorkflow.js`
  - Builds reviewed issue bodies and sends approved tickets to the existing cloud/local-pr automation route.
- Modify: `src/githubIssue.js`
  - Export a helper that can add the local approval label after Issue creation.
- Modify: `src/server.js`
  - Use the new review-aware ticket flow in `POST /api/report`.
  - Add `/api/admin/*` endpoints.
- Create: `public/admin.html`
  - Static admin dashboard.
- Create: `public/admin.js`
  - Fetches tickets, renders list/detail, saves comments, approves/rejects.
- Modify: `public/report.js`
  - Update user-facing response text for `pending-review` and `auto-approved`.
- Modify: `public/report.html`
  - Add admin navigation link and update explanatory copy.
- Modify: `public/index.html`
  - Add admin navigation link.
- Modify: `public/styles.css`
  - Add dashboard/list/detail/status styles while preserving existing visual system.
- Create/modify tests:
  - `test/reviewPolicy.test.js`
  - `test/ticketStore.test.js`
  - `test/reviewWorkflow.test.js`
  - `test/server.test.js`
  - `test/adminPage.test.js`
  - `test/reportResult.test.js`
- Create: `docs/qa/2026-06-03-admin-review-panel.md`

## QA 矩阵

| 需求项 | 实现入口 | 验证方式 | 通过标准 | 证据位置 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 小 Bug 可自动通过并进入 AI 链路 | `src/reviewPolicy.js`, `src/server.js` | `npm test -- test/reviewPolicy.test.js test/server.test.js` | 清晰低风险 bug 返回 `review.status = sent-to-ai`，并调用 GitHub Issue 创建 | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 大功能/设计/风险请求必须等待管理员审核 | `src/reviewPolicy.js`, `src/server.js` | `npm test -- test/reviewPolicy.test.js test/server.test.js` | feature/design/risky 请求保存为 `pending-review`，提交时不调用 GitHub Issue 创建 | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 管理员可以看到所有用户提交的 iShoe 需求 | `src/ticketStore.js`, `src/server.js`, `public/admin.js` | `npm test -- test/ticketStore.test.js test/server.test.js test/adminPage.test.js`; Agent Browser | `/api/admin/tickets` 返回所有 ticket，`/admin.html` 可显示待审核列表 | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 管理员可以针对每条需求保存评论 | `src/ticketStore.js`, `src/server.js`, `public/admin.js` | `npm test -- test/server.test.js`; Agent Browser | `POST /api/admin/tickets/:id/comment` 持久化 `review.adminComment`，刷新详情仍可看到 | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 管理员审批后 AI 能看到管理员评论并真实进入当前 AI 路由 | `src/reviewWorkflow.js`, `src/server.js` | `npm test -- test/reviewWorkflow.test.js test/server.test.js` | 审批后创建 GitHub Issue，Issue body 包含 `## Administrator review` 和评论 | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 本地 PR 模式审批后会加 `local:approved` | `src/reviewWorkflow.js`, `src/githubIssue.js` | `npm test -- test/reviewWorkflow.test.js test/server.test.js` | local-pr 审批创建 `local:candidate` Issue 后调用 label helper 添加 `local:approved` | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 管理员可以驳回需求，驳回不会触发 AI | `src/ticketStore.js`, `src/server.js`, `public/admin.js` | `npm test -- test/server.test.js`; Agent Browser | reject 后 ticket 为 `rejected`，不创建 GitHub Issue | `docs/qa/2026-06-03-admin-review-panel.md` | PENDING |
| 管理员面板是可操作后台而不是 landing page | `public/admin.html`, `public/admin.js`, `public/styles.css` | Agent Browser desktop + mobile screenshots | 页面有筛选、列表、详情、评论框、通过/驳回按钮，无重叠和 console error | `docs/qa/2026-06-03-admin-review-panel.md` 和截图 | PENDING |

## Task 1: Review policy

**Files:**
- Create: `src/reviewPolicy.js`
- Create: `test/reviewPolicy.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/reviewPolicy.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewDecisionForReport } from '../src/reviewPolicy.js';

test('reviewDecisionForReport auto-approves clear low-risk bugs', () => {
  const report = {
    type: 'bug',
    classification: {
      route: 'bug-autofix',
      labels: ['bug', 'autofix:candidate'],
      reason: 'Reproducible bug with expected and actual results.'
    },
    steps: 'Choose Pro and enter SAVE10.',
    expected: 'Total becomes 90.',
    actual: 'Total stays 100.'
  };

  const decision = reviewDecisionForReport(report);

  assert.equal(decision.status, 'auto-approved');
  assert.equal(decision.autoApproved, true);
  assert.equal(decision.requiresAdminReview, false);
});

test('reviewDecisionForReport holds feature requests for admin review', () => {
  const decision = reviewDecisionForReport({
    type: 'feature',
    classification: {
      route: 'ai-change',
      labels: ['feature', 'autofix:candidate'],
      reason: 'Feature request.'
    },
    details: 'Please add a full new checkout flow.'
  });

  assert.equal(decision.status, 'pending-review');
  assert.equal(decision.autoApproved, false);
  assert.equal(decision.requiresAdminReview, true);
});

test('reviewDecisionForReport holds risky requests for admin review', () => {
  const decision = reviewDecisionForReport({
    type: 'bug',
    classification: {
      route: 'human-review',
      labels: ['bug', 'needs:human', 'risk:review'],
      reason: 'Touches auth.'
    },
    details: 'Change auth token handling.'
  });

  assert.equal(decision.status, 'pending-review');
  assert.equal(decision.autoApproved, false);
  assert.equal(decision.requiresAdminReview, true);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 test/reviewPolicy.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement policy**

Create `src/reviewPolicy.js`:

```js
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasStructuredBugFields(report) {
  return hasText(report.steps) && hasText(report.expected) && hasText(report.actual);
}

export function reviewDecisionForReport(report) {
  const route = report.classification?.route;
  const labels = report.classification?.labels || [];
  const isRisky = route === 'human-review' || labels.includes('needs:human') || labels.includes('risk:review');
  const isClearBug = report.type === 'bug' && route === 'bug-autofix';

  if (!isRisky && isClearBug && (hasStructuredBugFields(report) || hasText(report.details))) {
    return {
      status: 'auto-approved',
      autoApproved: true,
      requiresAdminReview: false,
      reason: 'Clear low-risk bug can be sent to AI automatically.'
    };
  }

  return {
    status: 'pending-review',
    autoApproved: false,
    requiresAdminReview: true,
    reason: 'Request needs administrator review before AI changes code.'
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-concurrency=1 test/reviewPolicy.test.js`

Expected: PASS.

## Task 2: Ticket store

**Files:**
- Create: `src/ticketStore.js`
- Create: `test/ticketStore.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/ticketStore.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTicketStore,
  newReviewState
} from '../src/ticketStore.js';

test('ticket store saves and lists tickets newest first', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticket-store-'));
  const store = createTicketStore(join(dir, 'tickets'));
  await store.saveTicket({
    id: 'T-1',
    title: 'Older',
    type: 'feature',
    createdAt: '2026-06-03T01:00:00.000Z',
    updatedAt: '2026-06-03T01:00:00.000Z',
    review: newReviewState({ status: 'pending-review' })
  });
  await store.saveTicket({
    id: 'T-2',
    title: 'Newer',
    type: 'bug',
    createdAt: '2026-06-03T02:00:00.000Z',
    updatedAt: '2026-06-03T02:00:00.000Z',
    review: newReviewState({ status: 'sent-to-ai', autoApproved: true })
  });

  const tickets = await store.listTickets();

  assert.deepEqual(tickets.map((ticket) => ticket.id), ['T-2', 'T-1']);
});

test('ticket store filters tickets by review status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticket-store-'));
  const store = createTicketStore(join(dir, 'tickets'));
  await store.saveTicket({ id: 'T-1', createdAt: '2026-06-03T01:00:00.000Z', review: newReviewState({ status: 'pending-review' }) });
  await store.saveTicket({ id: 'T-2', createdAt: '2026-06-03T02:00:00.000Z', review: newReviewState({ status: 'rejected' }) });

  const tickets = await store.listTickets({ status: 'pending-review' });

  assert.deepEqual(tickets.map((ticket) => ticket.id), ['T-1']);
});

test('ticket store updates admin comment and persists JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticket-store-'));
  const ticketDir = join(dir, 'tickets');
  const store = createTicketStore(ticketDir);
  await store.saveTicket({ id: 'T-1', title: 'Feature', review: newReviewState({ status: 'pending-review' }) });

  const ticket = await store.updateTicket('T-1', (current) => ({
    ...current,
    review: {
      ...current.review,
      adminComment: 'Please keep the change small.',
      reviewedAt: '2026-06-03T03:00:00.000Z'
    }
  }));
  const raw = JSON.parse(await readFile(join(ticketDir, 'T-1.json'), 'utf8'));

  assert.equal(ticket.review.adminComment, 'Please keep the change small.');
  assert.equal(raw.review.adminComment, 'Please keep the change small.');
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 test/ticketStore.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement ticket store**

Create `src/ticketStore.js` with:

```js
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function newReviewState(overrides = {}) {
  return {
    status: 'pending-review',
    autoApproved: false,
    requiresAdminReview: true,
    adminComment: '',
    reviewedAt: '',
    reviewer: '',
    failureReason: '',
    ...overrides
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function createTicketStore(ticketDir) {
  async function ensureDir() {
    await mkdir(ticketDir, { recursive: true });
  }

  function ticketPath(id) {
    return join(ticketDir, `${id}.json`);
  }

  return {
    async saveTicket(ticket) {
      await ensureDir();
      await writeFile(ticketPath(ticket.id), `${JSON.stringify(ticket, null, 2)}\n`);
      return ticket;
    },

    async getTicket(id) {
      try {
        return await readJson(ticketPath(id));
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    },

    async listTickets({ status } = {}) {
      await ensureDir();
      const files = (await readdir(ticketDir)).filter((file) => file.endsWith('.json'));
      const tickets = await Promise.all(files.map((file) => readJson(join(ticketDir, file))));
      return tickets
        .filter((ticket) => !status || ticket.review?.status === status)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },

    async updateTicket(id, updater) {
      const current = await this.getTicket(id);
      if (!current) {
        return null;
      }
      const updated = updater(current);
      return this.saveTicket(updated);
    }
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-concurrency=1 test/ticketStore.test.js`

Expected: PASS.

## Task 3: Review workflow

**Files:**
- Create: `src/reviewWorkflow.js`
- Modify: `src/githubIssue.js`
- Create: `test/reviewWorkflow.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/reviewWorkflow.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { approveTicketForAi, buildReviewedIssueBody } from '../src/reviewWorkflow.js';

const baseTicket = {
  id: 'T-1',
  type: 'feature',
  title: 'Add team billing dashboard',
  details: 'We need a large dashboard for billing administrators.',
  attachments: [],
  contact: 'admin@example.com',
  classification: {
    route: 'ai-change',
    labels: ['feature', 'autofix:candidate'],
    reason: 'Feature request needs admin review.'
  },
  review: {
    status: 'pending-review',
    adminComment: 'Only add the first dashboard skeleton for now.'
  }
};

test('buildReviewedIssueBody includes administrator review comment', () => {
  const body = buildReviewedIssueBody(baseTicket, {
    labels: ['feature', 'autofix:candidate'],
    status: 'approved'
  });

  assert.match(body, /## Administrator review/);
  assert.match(body, /Status: approved/);
  assert.match(body, /Only add the first dashboard skeleton for now/);
  assert.match(body, /## Problem details/);
});

test('approveTicketForAi creates a cloud issue with admin comment', async () => {
  let createdReport;
  let createdLabels;
  const result = await approveTicketForAi({
    ticket: baseTicket,
    config: {
      mode: 'cloud',
      cloud: { autofixLabel: 'autofix:candidate' },
      localPr: { candidateLabel: 'local:candidate', approvalLabel: 'local:approved' }
    },
    env: {},
    createGitHubIssue: async (report, env, options) => {
      createdReport = report;
      createdLabels = options.labels;
      return { created: true, number: 31, url: 'https://github.com/acme/demo/issues/31' };
    },
    addIssueLabels: async () => {
      throw new Error('should not label cloud issues');
    }
  });

  assert.equal(result.github.created, true);
  assert.deepEqual(createdLabels, ['feature', 'autofix:candidate']);
  assert.match(createdReport.issueBody, /Administrator review/);
});

test('approveTicketForAi adds local approval label in local-pr mode', async () => {
  const added = [];
  const result = await approveTicketForAi({
    ticket: baseTicket,
    config: {
      mode: 'local-pr',
      cloud: { autofixLabel: 'autofix:candidate' },
      localPr: { candidateLabel: 'local:candidate', approvalLabel: 'local:approved' }
    },
    env: {},
    createGitHubIssue: async () => ({ created: true, number: 32, url: 'https://github.com/acme/demo/issues/32' }),
    addIssueLabels: async (issueNumber, labels) => {
      added.push([issueNumber, labels]);
    }
  });

  assert.equal(result.github.created, true);
  assert.deepEqual(result.labels, ['feature', 'local:candidate']);
  assert.deepEqual(added, [[32, ['local:approved']]]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 test/reviewWorkflow.test.js`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement review workflow**

Create `src/reviewWorkflow.js`:

```js
import { routeAutomation } from './automationRouter.js';
import { buildIssueBody, createGitHubIssue, addIssueLabels } from './githubIssue.js';

function reviewedClassification(ticket, labels) {
  return {
    ...(ticket.classification || {}),
    labels
  };
}

export function buildReviewedIssueBody(ticket, { labels, status }) {
  const report = {
    ...ticket,
    classification: reviewedClassification(ticket, labels)
  };

  return [
    buildIssueBody(report),
    '',
    '## Administrator review',
    '',
    `Status: ${status}`,
    'Comment:',
    ticket.review?.adminComment?.trim() || '-'
  ].join('\n');
}

export async function approveTicketForAi({
  ticket,
  config,
  env,
  createGitHubIssue: createIssue = createGitHubIssue,
  addIssueLabels: addLabels = addIssueLabels
}) {
  const automation = routeAutomation(ticket, config);
  const labels = automation.labels;
  const reviewStatus = ticket.review?.autoApproved ? 'auto-approved' : 'approved';
  const issueBody = buildReviewedIssueBody(ticket, { labels, status: reviewStatus });
  const issueReport = {
    ...ticket,
    issueBody,
    classification: reviewedClassification(ticket, labels)
  };
  const github = await createIssue(issueReport, env, { labels });

  if (github.created && config.mode === 'local-pr') {
    await addLabels(github.number, [config.localPr.approvalLabel], env);
  }

  return {
    automation,
    labels,
    github,
    issueBody
  };
}
```

No change is required in `src/githubIssue.js` if `addIssueLabels` is already exported.

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-concurrency=1 test/reviewWorkflow.test.js`

Expected: PASS.

## Task 4: Server review-aware report and admin APIs

**Files:**
- Modify: `src/server.js`
- Modify: `test/server.test.js`

- [ ] **Step 1: Write failing tests**

Add tests to `test/server.test.js`:

```js
test('POST /api/report queues feature requests for admin review without creating GitHub issue', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCreated = false;
  const app = createApp({
    storageDir,
    createGitHubIssue: async () => {
      issueCreated = true;
      return { created: true, number: 1, url: 'https://github.com/acme/demo/issues/1' };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'feature');
    form.set('title', 'Add iShoe team dashboard');
    form.set('details', 'Please add a large dashboard for team analytics.');

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, { method: 'POST', body: form });
    const payload = await response.json();
    const ticketFiles = await readdir(join(storageDir, 'tickets'));
    const ticket = JSON.parse(await readFile(join(storageDir, 'tickets', ticketFiles[0]), 'utf8'));

    assert.equal(response.status, 201);
    assert.equal(issueCreated, false);
    assert.equal(payload.review.status, 'pending-review');
    assert.equal(ticket.review.status, 'pending-review');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('admin endpoints list tickets, save comments, and approve with admin context', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let createdBody = '';
  const app = createApp({
    storageDir,
    createGitHubIssue: async (report) => {
      createdBody = report.issueBody;
      return { created: true, number: 44, url: 'https://github.com/acme/demo/issues/44' };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'feature');
    form.set('title', 'Add iShoe team dashboard');
    form.set('details', 'Please add a large dashboard for team analytics.');
    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/report`, { method: 'POST', body: form });
    const reportPayload = await reportResponse.json();
    const id = reportPayload.ticket.id;

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets?status=pending-review`);
    const listPayload = await listResponse.json();
    await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${id}/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: 'Start with the smallest useful dashboard.' })
    });
    const approveResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${id}/approve`, { method: 'POST' });
    const approvePayload = await approveResponse.json();

    assert.equal(listPayload.tickets.length, 1);
    assert.equal(approveResponse.status, 200);
    assert.equal(approvePayload.ticket.review.status, 'sent-to-ai');
    assert.match(createdBody, /Start with the smallest useful dashboard/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(storageDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 test/server.test.js`

Expected: FAIL because feature requests still create Issues immediately and admin endpoints do not exist.

- [ ] **Step 3: Implement server changes**

In `src/server.js`:

- Import `reviewDecisionForReport`, `createTicketStore`, `newReviewState`, `approveTicketForAi`, and `addIssueLabels`.
- Add `const ticketStore = options.ticketStore || createTicketStore(ticketDir);`.
- Add a small helper:

```js
function nowIso() {
  return new Date().toISOString();
}
```

- In `POST /api/report`, after classification:
  - Build `reviewDecision`.
  - Add `createdAt`, `updatedAt`, and `review`.
  - Save the ticket first.
  - If auto-approved, call `approveTicketForAi`.
  - Save the updated ticket with `github`, `automation`, and `review.status`.
  - If pending, do not create a GitHub Issue.
  - Include `review` in the response.
- Add admin routes:

```js
app.get('/api/admin/tickets', async (req, res, next) => {
  try {
    const tickets = await ticketStore.listTickets({ status: req.query.status });
    res.json({ tickets });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/tickets/:id', async (req, res, next) => {
  try {
    const ticket = await ticketStore.getTicket(req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ ticket });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/tickets/:id/comment', async (req, res, next) => {
  try {
    const updated = await ticketStore.updateTicket(req.params.id, (ticket) => ({
      ...ticket,
      updatedAt: nowIso(),
      review: {
        ...ticket.review,
        adminComment: cleanField(req.body.comment)
      }
    }));
    if (!updated) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ ticket: updated });
  } catch (error) {
    next(error);
  }
});
```

Implement `approve` and `reject` similarly, with `409` for `sent-to-ai` and `rejected` terminal states. Use injected `createIssue` and `options.addIssueLabels || addIssueLabels` for testability.

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-concurrency=1 test/server.test.js`

Expected: PASS.

## Task 5: Admin page

**Files:**
- Create: `public/admin.html`
- Create: `public/admin.js`
- Modify: `public/styles.css`
- Modify: `public/report.html`
- Modify: `public/index.html`
- Create: `test/adminPage.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/adminPage.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin page renders operational review controls', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');

  assert.match(html, /管理员审核/);
  assert.match(html, /id="ticket-list"/);
  assert.match(html, /id="admin-comment"/);
  assert.match(html, /id="approve-button"/);
  assert.match(html, /id="reject-button"/);
  assert.match(html, /暂未启用登录/);
});

test('admin JavaScript calls admin ticket APIs', async () => {
  const js = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');

  assert.match(js, /\/api\/admin\/tickets/);
  assert.match(js, /\/comment/);
  assert.match(js, /\/approve/);
  assert.match(js, /\/reject/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 test/adminPage.test.js`

Expected: FAIL because admin files do not exist.

- [ ] **Step 3: Implement static admin UI**

Create `public/admin.html` with:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>管理员审核 - AI Feedback Loop Demo</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="shell admin-shell">
      <header class="topbar">
        <div class="brand"><span class="mark">AI</span> Feedback Loop Demo</div>
        <nav class="nav" aria-label="主导航">
          <a href="/">演示应用</a>
          <a href="/report.html">提交问题</a>
          <a href="/admin.html">管理员审核</a>
        </nav>
      </header>

      <section class="admin-header">
        <div>
          <h1>iShoe 需求审核</h1>
          <p class="lead">查看用户提交的需求，补充管理员评论，再决定是否交给 AI 修改代码。</p>
        </div>
        <p class="warning-note">暂未启用登录。这个页面只适合本地演示或私有环境。</p>
      </section>

      <section class="admin-layout">
        <aside class="panel admin-list-panel">
          <div class="filter-row" id="status-filters">
            <button data-status="">全部</button>
            <button data-status="pending-review">待审核</button>
            <button data-status="sent-to-ai">已发送 AI</button>
            <button data-status="rejected">已驳回</button>
            <button data-status="failed">失败</button>
          </div>
          <div id="ticket-list" class="ticket-list" aria-live="polite">正在加载...</div>
        </aside>

        <section class="panel admin-detail-panel">
          <div id="ticket-detail" class="ticket-detail">请选择一条需求。</div>
          <label for="admin-comment">管理员评论</label>
          <textarea id="admin-comment" placeholder="补充 AI 需要理解的上下文、边界、优先级或不要做的事。"></textarea>
          <div class="action-row">
            <button id="save-comment-button" type="button">保存评论</button>
            <button id="approve-button" class="primary" type="button">通过给 AI</button>
            <button id="reject-button" class="danger-button" type="button">驳回</button>
          </div>
          <div id="admin-result" class="result result-friendly" role="status">等待操作...</div>
        </section>
      </section>
    </main>
    <script type="module" src="/admin.js"></script>
  </body>
</html>
```

Implement `public/admin.js` with functions `loadTickets`, `selectTicket`, `saveComment`, `approveTicket`, `rejectTicket`, and user feedback for errors.

Update `public/styles.css` with classes:

```css
.admin-header,
.admin-layout,
.filter-row,
.ticket-list,
.ticket-card,
.ticket-detail,
.action-row,
.status-pill,
.warning-note,
.danger-button
```

Keep existing gray/black visual style and avoid nested card-in-card layouts.

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-concurrency=1 test/adminPage.test.js`

Expected: PASS.

## Task 6: Report result copy

**Files:**
- Modify: `public/report.js`
- Modify: `public/report.html`
- Modify: `test/reportResult.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/reportResult.test.js`:

```js
test('explains pending admin review submissions in plain Chinese', () => {
  const copy = buildResultCopy({
    ticket: { id: 'T-1' },
    classification: { route: 'ai-change' },
    review: { status: 'pending-review' },
    github: { created: false }
  });

  assert.equal(copy.title, '我们已经收到你的反馈');
  assert.equal(copy.lines.some((line) => line.includes('管理员审核')), true);
  assert.equal(copy.lines.some((line) => line.includes('暂时不会让 AI 直接改代码')), true);
});

test('explains auto-approved bug submissions in plain Chinese', () => {
  const copy = buildResultCopy({
    ticket: { id: 'T-2' },
    classification: { route: 'bug-autofix' },
    review: { status: 'sent-to-ai', autoApproved: true },
    github: { created: true, number: 45, url: 'https://github.com/acme/demo/issues/45' }
  });

  assert.equal(copy.lines.some((line) => line.includes('小 Bug')), true);
  assert.equal(copy.lines.some((line) => line.includes('自动通过')), true);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test --test-concurrency=1 test/reportResult.test.js`

Expected: FAIL because report copy does not inspect `review`.

- [ ] **Step 3: Implement copy changes**

In `public/report.js`, make `buildResultCopy` prefer `payload.review`:

- If `review.status === 'pending-review'`: explain admin review.
- If `review.autoApproved`: explain small bug auto-approved and sent to AI.
- Keep existing local-pr/cloud copy as fallback.

In `public/report.html`, add `/admin.html` nav link and update text to say large requests wait for admin review.

- [ ] **Step 4: Verify GREEN**

Run: `node --test --test-concurrency=1 test/reportResult.test.js test/reportPage.test.js`

Expected: PASS.

## Task 7: Full QA and commit

**Files:**
- Create: `docs/qa/2026-06-03-admin-review-panel.md`

- [ ] **Step 1: Create QA result file**

Create `docs/qa/2026-06-03-admin-review-panel.md`:

```markdown
# QA 结果

## 环境
- 分支：`feature/admin-review-panel`
- 工作区：`.aipr/dev-worktrees/admin-review-panel`
- 启动命令：待执行
- 前端 URL：待执行
- 后端 URL：待执行

## 验收矩阵
| 需求项 | 验证方式 | 通过标准 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- |

## 返工记录
| 轮次 | 失败项 | 修复动作 | 结果 |
| --- | --- | --- | --- |
```

- [ ] **Step 2: Run full automated tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Run local server for Agent Browser QA**

Run:

```bash
PORT=3100 STORAGE_DIR="$(mktemp -d)" npm start
```

Expected: server prints `AI feedback loop demo listening on http://localhost:3100`.

- [ ] **Step 4: Agent Browser desktop QA**

Use Agent Browser to:

1. Open `http://127.0.0.1:3100/report.html`.
2. Submit a feature request.
3. Open `http://127.0.0.1:3100/admin.html`.
4. Confirm the request appears as pending review.
5. Add admin comment.
6. Reject it and confirm status changes.
7. Save screenshot to `docs/qa/2026-06-03-admin-review-panel-desktop.png`.

Expected: no console error, admin dashboard controls visible, status changes after reject.

- [ ] **Step 5: Agent Browser mobile QA**

Open `http://127.0.0.1:3100/admin.html` in a mobile viewport and save screenshot to `docs/qa/2026-06-03-admin-review-panel-mobile.png`.

Expected: list and detail remain readable without incoherent overlap.

- [ ] **Step 6: Update QA result file**

Record:

- `npm test` pass count.
- Server command and URL.
- Desktop screenshot path.
- Mobile screenshot path.
- Any console/network errors.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git add src/reviewPolicy.js src/ticketStore.js src/reviewWorkflow.js src/githubIssue.js src/server.js public/admin.html public/admin.js public/report.js public/report.html public/index.html public/styles.css test/reviewPolicy.test.js test/ticketStore.test.js test/reviewWorkflow.test.js test/server.test.js test/adminPage.test.js test/reportResult.test.js docs/qa/2026-06-03-admin-review-panel.md docs/qa/2026-06-03-admin-review-panel-desktop.png docs/qa/2026-06-03-admin-review-panel-mobile.png docs/superpowers/plans/2026-06-03-admin-review-panel.md
git commit -m "feat: add admin review panel"
```

Expected: commit succeeds on `feature/admin-review-panel`.

## Plan Self-Review

- Spec coverage: covers review status model, auto-approval, admin APIs, admin comments, cloud/local-pr approval, no-login warning, UI, and QA.
- Scope check: this is one cohesive feature with backend review state and frontend admin UI; it does not require splitting into independent specs.
- Placeholder scan: no TODO/TBD placeholders are used.
- Type consistency: `pending-review`, `auto-approved`, `sent-to-ai`, `rejected`, and `failed` are used consistently.
