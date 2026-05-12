import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueBody } from '../src/githubIssue.js';

test('builds a GitHub issue body with report fields and attachment links', () => {
  const body = buildIssueBody({
    id: 'T-100',
    title: 'SAVE10 coupon does not work',
    type: 'bug',
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
  assert.match(body, /autofix:candidate/);
  assert.match(body, /https:\/\/example.com\/uploads\/screen.png/);
  assert.doesNotMatch(body, /undefined/);
});
