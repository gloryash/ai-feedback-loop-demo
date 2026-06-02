import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function readOnlyTicket(storageDir) {
  const ticketFiles = await readdir(join(storageDir, 'tickets'));
  assert.equal(ticketFiles.length, 1);
  return JSON.parse(
    await readFile(join(storageDir, 'tickets', ticketFiles[0]), 'utf8')
  );
}

function bugForm() {
  const form = new FormData();
  form.set('type', 'bug');
  form.set('title', 'SAVE10 coupon does not work');
  form.set('steps', 'Choose Pro and enter SAVE10.');
  form.set('expected', 'Total becomes 90.');
  form.set('actual', 'Total stays 100.');
  form.set('environment', 'Node test');
  return form;
}

function featureForm() {
  const form = new FormData();
  form.set('type', 'feature');
  form.set('title', 'Add annual billing toggle');
  form.set('details', 'Let users switch pricing cards between monthly and annual billing.');
  form.set('environment', 'Node test');
  return form;
}

test('POST /api/report stores ticket and returns classification without GitHub token', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  const app = createApp({ storageDir });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'bug');
    form.set('title', 'SAVE10 coupon does not work');
    form.set('steps', 'Choose Pro and enter SAVE10.');
    form.set('expected', 'Total becomes 90.');
    form.set('actual', 'Total stays 100.');
    form.set('environment', 'Node test');

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.classification.route, 'bug-autofix');
    assert.equal(payload.github.created, false);
    assert.equal(payload.review.status, 'sent-to-ai');
    assert.match(payload.ticket.id, /^T-/);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('POST /api/report accepts simplified details-only bug reports', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  const app = createApp({ storageDir });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'bug');
    form.set('title', 'SAVE10 coupon does not work');
    form.set('details', [
      '我做了什么：打开演示应用，选择 Pro，输入 SAVE10。',
      '我以为会发生什么：总价应该显示 90。',
      '实际发生了什么：总价仍然显示 100。',
      '我的设备/浏览器：Chrome on macOS。'
    ].join('\n'));

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json();

    const ticketFiles = await readdir(join(storageDir, 'tickets'));
    const ticket = JSON.parse(
      await readFile(join(storageDir, 'tickets', ticketFiles[0]), 'utf8')
    );

    assert.equal(response.status, 201);
    assert.equal(payload.classification.route, 'bug-autofix');
    assert.match(ticket.details, /我做了什么/);
    assert.match(ticket.issueBody, /## Problem details/);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('POST /api/report uses Render public URL for uploaded attachment links', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  const app = createApp({
    storageDir,
    env: {
      RENDER_EXTERNAL_URL: 'https://ai-feedback-loop-demo.onrender.com'
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'bug');
    form.set('title', 'SAVE10 coupon does not work');
    form.set('steps', 'Choose Pro and enter SAVE10.');
    form.set('expected', 'Total becomes 90.');
    form.set('actual', 'Total stays 100.');
    form.set('attachments', new Blob(['sample log'], { type: 'text/plain' }), 'log.txt');

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: form
    });
    await response.json();

    const ticketFiles = await readdir(join(storageDir, 'tickets'));
    const ticket = JSON.parse(
      await readFile(join(storageDir, 'tickets', ticketFiles[0]), 'utf8')
    );

    assert.equal(response.status, 201);
    assert.match(ticket.attachments[0].url, /^https:\/\/ai-feedback-loop-demo\.onrender\.com\/uploads\//);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('POST /api/report queues feature requests for review without calling GitHub', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCalls = 0;
  const app = createApp({
    storageDir,
    createGitHubIssue: async () => {
      issueCalls += 1;
      return { created: true, number: 100 };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: featureForm()
    });
    const payload = await response.json();
    const ticket = await readOnlyTicket(storageDir);

    assert.equal(response.status, 201);
    assert.equal(issueCalls, 0);
    assert.equal(payload.review.status, 'pending-review');
    assert.equal(payload.review.requiresAdminReview, true);
    assert.equal(ticket.review.status, 'pending-review');
    assert.equal(ticket.review.autoApproved, false);
    assert.equal(ticket.issueBody, undefined);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('POST /api/report auto-approves clear bugs and persists reviewed issue body', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCalls = 0;
  let issueBody = '';
  const app = createApp({
    storageDir,
    createGitHubIssue: async (report) => {
      issueCalls += 1;
      issueBody = report.issueBody;
      return { created: true, number: 101, url: 'https://github.com/acme/demo/issues/101' };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: bugForm()
    });
    const payload = await response.json();
    const ticket = await readOnlyTicket(storageDir);

    assert.equal(response.status, 201);
    assert.equal(issueCalls, 1);
    assert.equal(payload.review.status, 'sent-to-ai');
    assert.equal(payload.github.number, 101);
    assert.match(issueBody, /## Administrator review/);
    assert.match(ticket.issueBody, /## Administrator review/);
    assert.equal(ticket.review.status, 'sent-to-ai');
    assert.equal(ticket.github.number, 101);
    assert.equal(ticket.automation.mode, 'cloud');
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('admin list, detail, comment, and approve flow persists comment in issue body', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueBody = '';
  const app = createApp({
    storageDir,
    createGitHubIssue: async (report) => {
      issueBody = report.issueBody;
      return { created: true, number: 102, url: 'https://github.com/acme/demo/issues/102' };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: featureForm()
    });
    const reportPayload = await reportResponse.json();
    const ticketId = reportPayload.ticket.id;

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets?status=pending-review`);
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.deepEqual(listPayload.tickets.map((ticket) => ticket.id), [ticketId]);

    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${ticketId}`);
    const detailPayload = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detailPayload.ticket.id, ticketId);

    const commentResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${ticketId}/comment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ comment: 'Looks small enough for AI.' })
    });
    const commentPayload = await commentResponse.json();
    assert.equal(commentResponse.status, 200);
    assert.equal(commentPayload.ticket.review.adminComment, 'Looks small enough for AI.');

    const approveResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${ticketId}/approve`, {
      method: 'POST'
    });
    const approvePayload = await approveResponse.json();

    assert.equal(approveResponse.status, 200);
    assert.equal(approvePayload.ticket.review.status, 'sent-to-ai');
    assert.equal(approvePayload.ticket.review.reviewer, 'admin');
    assert.match(issueBody, /Comment: Looks small enough for AI\./);
    assert.match(approvePayload.ticket.issueBody, /Comment: Looks small enough for AI\./);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('admin reject flow sets rejected review state without calling GitHub', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCalls = 0;
  const app = createApp({
    storageDir,
    createGitHubIssue: async () => {
      issueCalls += 1;
      return { created: true, number: 103 };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: featureForm()
    });
    const reportPayload = await reportResponse.json();

    const rejectResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${reportPayload.ticket.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Out of scope for this demo.' })
    });
    const rejectPayload = await rejectResponse.json();

    assert.equal(rejectResponse.status, 200);
    assert.equal(issueCalls, 0);
    assert.equal(rejectPayload.ticket.review.status, 'rejected');
    assert.equal(rejectPayload.ticket.review.reviewer, 'admin');
    assert.equal(rejectPayload.ticket.review.failureReason, 'Out of scope for this demo.');
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('admin approve and reject return 409 for tickets already sent to AI', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCalls = 0;
  const app = createApp({
    storageDir,
    createGitHubIssue: async () => {
      issueCalls += 1;
      return { created: true, number: 104 };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: bugForm()
    });
    const reportPayload = await reportResponse.json();

    const approveResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${reportPayload.ticket.id}/approve`, {
      method: 'POST'
    });
    const rejectResponse = await fetch(`http://127.0.0.1:${port}/api/admin/tickets/${reportPayload.ticket.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Too late.' })
    });

    assert.equal(approveResponse.status, 409);
    assert.equal(rejectResponse.status, 409);
    assert.equal(issueCalls, 1);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('admin concurrent approve only sends a ticket to AI once', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCalls = 0;
  let firstCreateStarted;
  let releaseFirstCreate;
  const firstCreateStartedPromise = new Promise((resolve) => {
    firstCreateStarted = resolve;
  });
  const releaseFirstCreatePromise = new Promise((resolve) => {
    releaseFirstCreate = resolve;
  });
  const app = createApp({
    storageDir,
    createGitHubIssue: async () => {
      issueCalls += 1;
      if (issueCalls === 1) {
        firstCreateStarted();
        await releaseFirstCreatePromise;
      }
      return {
        created: true,
        number: 300 + issueCalls,
        url: `https://github.com/acme/demo/issues/${300 + issueCalls}`
      };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: featureForm()
    });
    const reportPayload = await reportResponse.json();
    const approveUrl = `http://127.0.0.1:${port}/api/admin/tickets/${reportPayload.ticket.id}/approve`;

    const firstApprove = fetch(approveUrl, { method: 'POST' });
    await firstCreateStartedPromise;
    const secondApprove = fetch(approveUrl, { method: 'POST' });
    releaseFirstCreate();
    const responses = await Promise.all([firstApprove, secondApprove]);
    const statuses = responses.map((response) => response.status).sort();

    assert.deepEqual(statuses, [200, 409]);
    assert.equal(issueCalls, 1);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('admin reject returns 409 while approve is in progress', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueCalls = 0;
  let firstCreateStarted;
  let releaseFirstCreate;
  const firstCreateStartedPromise = new Promise((resolve) => {
    firstCreateStarted = resolve;
  });
  const releaseFirstCreatePromise = new Promise((resolve) => {
    releaseFirstCreate = resolve;
  });
  const app = createApp({
    storageDir,
    createGitHubIssue: async () => {
      issueCalls += 1;
      firstCreateStarted();
      await releaseFirstCreatePromise;
      return {
        created: true,
        number: 400,
        url: 'https://github.com/acme/demo/issues/400'
      };
    }
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const reportResponse = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: featureForm()
    });
    const reportPayload = await reportResponse.json();
    const baseUrl = `http://127.0.0.1:${port}/api/admin/tickets/${reportPayload.ticket.id}`;

    const approve = fetch(`${baseUrl}/approve`, { method: 'POST' });
    await firstCreateStartedPromise;
    const reject = fetch(`${baseUrl}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Too late.' })
    });
    releaseFirstCreate();

    const responses = await Promise.all([approve, reject]);
    const statuses = responses.map((response) => response.status).sort();
    const ticket = await readOnlyTicket(storageDir);

    assert.deepEqual(statuses, [200, 409]);
    assert.equal(issueCalls, 1);
    assert.equal(ticket.review.status, 'sent-to-ai');
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('POST /api/report passes cloud autofix labels to GitHub issue creation', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueLabels;
  const app = createApp({
    storageDir,
    automationConfig: {
      mode: 'cloud',
      cloud: { autofixLabel: 'autofix:candidate' },
      localPr: { candidateLabel: 'local:candidate' }
    },
    createGitHubIssue: async (report, env, options) => {
      issueLabels = options.labels;
      return { created: true, number: 22, url: 'https://github.com/acme/demo/issues/22' };
    },
    addIssueLabels: async () => {}
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'bug');
    form.set('title', 'SAVE10 coupon does not work');
    form.set('steps', 'Choose Pro and enter SAVE10.');
    form.set('expected', 'Total becomes 90.');
    form.set('actual', 'Total stays 100.');

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(issueLabels, ['bug', 'autofix:candidate']);
    assert.equal(payload.automation.mode, 'cloud');
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('POST /api/report passes local candidate labels in local-pr mode', async () => {
  const storageDir = await mkdtemp(join(tmpdir(), 'feedback-loop-'));
  let issueLabels;
  let issueBody;
  const app = createApp({
    storageDir,
    automationConfig: {
      mode: 'local-pr',
      cloud: { autofixLabel: 'autofix:candidate' },
      localPr: { candidateLabel: 'local:candidate' }
    },
    createGitHubIssue: async (report, env, options) => {
      issueLabels = options.labels;
      issueBody = report.issueBody;
      return { created: true, number: 23, url: 'https://github.com/acme/demo/issues/23' };
    },
    addIssueLabels: async () => {}
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const form = new FormData();
    form.set('type', 'bug');
    form.set('title', 'SAVE10 coupon does not work');
    form.set('steps', 'Choose Pro and enter SAVE10.');
    form.set('expected', 'Total becomes 90.');
    form.set('actual', 'Total stays 100.');

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(issueLabels, ['bug', 'local:candidate']);
    assert.equal(issueLabels.includes('autofix:candidate'), false);
    assert.match(issueBody, /Labels: bug, local:candidate/);
    assert.doesNotMatch(issueBody, /Labels: bug, autofix:candidate/);
    assert.equal(payload.automation.mode, 'local-pr');
    assert.equal(payload.automation.requiresApproval, true);
  } finally {
    await closeServer(server);
    await rm(storageDir, { recursive: true, force: true });
  }
});
