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
