import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueBody, createGitHubIssue } from '../src/githubIssue.js';

test('builds a GitHub issue body with report fields and attachment links', () => {
  const body = buildIssueBody({
    id: 'T-100',
    title: 'SAVE10 coupon does not work',
    type: 'bug',
    details: [
      '我做了什么：选择 Pro 并输入 SAVE10。',
      '我以为会发生什么：总价变成 90。',
      '实际发生了什么：总价仍然是 100。',
      '我的设备/浏览器：Chrome 124 on macOS。'
    ].join('\n'),
    steps: 'Choose Pro and enter SAVE10.',
    expected: 'Total becomes 90.',
    actual: 'Total stays 100.',
    environment: 'Chrome 124 on macOS',
    contact: 'user@example.com',
    classification: {
      route: 'bug-autofix',
      labels: ['bug', 'autofix:candidate'],
      reason: 'Reproducible bug with expected and actual results.'
    },
    attachments: [
      { originalName: 'screen.png', url: 'https://example.com/uploads/screen.png' }
    ]
  });

  assert.match(body, /Ticket ID: T-100/);
  assert.match(body, /SAVE10 coupon does not work/);
  assert.match(body, /## Problem details/);
  assert.match(body, /我做了什么/);
  assert.match(body, /autofix:candidate/);
  assert.match(body, /https:\/\/example.com\/uploads\/screen.png/);
  assert.doesNotMatch(body, /undefined/);
});

test('createGitHubIssue uses caller-provided labels when supplied', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        number: 12,
        html_url: 'https://github.com/acme/demo/issues/12'
      })
    };
  };

  try {
    const result = await createGitHubIssue({
      type: 'bug',
      title: 'SAVE10 coupon does not work',
      classification: {
        labels: ['bug', 'autofix:candidate']
      }
    }, {
      GITHUB_OWNER: 'acme',
      GITHUB_REPO: 'demo',
      GITHUB_TOKEN: 'token'
    }, {
      labels: ['bug', 'local:candidate']
    });

    assert.equal(result.created, true);
    assert.deepEqual(requestBody.labels, ['bug', 'local:candidate']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
