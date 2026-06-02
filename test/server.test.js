import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';

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
    assert.match(payload.ticket.id, /^T-/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
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
    await new Promise((resolve) => server.close(resolve));
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
    await new Promise((resolve) => server.close(resolve));
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

    const response = await fetch(`http://127.0.0.1:${port}/api/report`, {
      method: 'POST',
      body: form
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(issueLabels, ['bug', 'autofix:candidate']);
    assert.equal(payload.automation.mode, 'cloud');
  } finally {
    await new Promise((resolve) => server.close(resolve));
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
    await new Promise((resolve) => server.close(resolve));
    await rm(storageDir, { recursive: true, force: true });
  }
});
