import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addIssueLabels,
  buildIssueBody,
  commentOnIssue,
  createGitHubIssue,
  listApprovedLocalIssues,
  removeIssueLabel
} from '../src/githubIssue.js';

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
      issueBody: 'Labels: bug, local:candidate',
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
    assert.equal(requestBody.body, 'Labels: bug, local:candidate');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listApprovedLocalIssues searches approved local candidate issues', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        items: [
          {
            number: 12,
            title: 'SAVE10 coupon does not work',
            body: 'body',
            labels: [{ name: 'local:candidate' }, { name: 'local:approved' }],
            html_url: 'https://github.com/acme/demo/issues/12',
            user: { login: 'user' }
          }
        ]
      })
    };
  };

  try {
    const issues = await listApprovedLocalIssues({
      GITHUB_OWNER: 'acme',
      GITHUB_REPO: 'demo',
      GITHUB_TOKEN: 'token'
    }, {
      localPr: {
        candidateLabel: 'local:candidate',
        approvalLabel: 'local:approved',
        runningLabel: 'local:running',
        doneLabel: 'local:pr-created',
        failedLabel: 'local:failed'
      }
    });

    assert.match(requestedUrl, /^https:\/\/api\.github\.com\/search\/issues\?/);
    assert.match(decodeURIComponent(requestedUrl), /repo:acme\/demo/);
    assert.match(decodeURIComponent(requestedUrl), /label:"local:candidate"/);
    assert.match(decodeURIComponent(requestedUrl), /label:"local:approved"/);
    assert.match(decodeURIComponent(requestedUrl), /-label:"local:running"/);
    assert.equal(issues[0].number, 12);
    assert.equal(issues[0].url, 'https://github.com/acme/demo/issues/12');
    assert.equal(issues[0].author.login, 'user');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('addIssueLabels posts labels to an issue', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => [] };
  };

  try {
    await addIssueLabels(12, ['local:running'], {
      GITHUB_OWNER: 'acme',
      GITHUB_REPO: 'demo',
      GITHUB_TOKEN: 'token'
    });

    assert.equal(request.url, 'https://api.github.com/repos/acme/demo/issues/12/labels');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { labels: ['local:running'] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('removeIssueLabel deletes an issue label', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({}) };
  };

  try {
    await removeIssueLabel(12, 'local:running', {
      GITHUB_OWNER: 'acme',
      GITHUB_REPO: 'demo',
      GITHUB_TOKEN: 'token'
    });

    assert.equal(request.url, 'https://api.github.com/repos/acme/demo/issues/12/labels/local%3Arunning');
    assert.equal(request.options.method, 'DELETE');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('commentOnIssue posts a markdown comment', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: 1 }) };
  };

  try {
    await commentOnIssue(12, 'Created PR: https://github.com/acme/demo/pull/34', {
      GITHUB_OWNER: 'acme',
      GITHUB_REPO: 'demo',
      GITHUB_TOKEN: 'token'
    });

    assert.equal(request.url, 'https://api.github.com/repos/acme/demo/issues/12/comments');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), {
      body: 'Created PR: https://github.com/acme/demo/pull/34'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
