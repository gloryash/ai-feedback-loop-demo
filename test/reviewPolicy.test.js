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

test('reviewDecisionForReport holds null reports for admin review', () => {
  const decision = reviewDecisionForReport(null);

  assert.equal(decision.status, 'pending-review');
  assert.equal(decision.autoApproved, false);
  assert.equal(decision.requiresAdminReview, true);
});

test('reviewDecisionForReport holds undefined reports for admin review', () => {
  const decision = reviewDecisionForReport(undefined);

  assert.equal(decision.status, 'pending-review');
  assert.equal(decision.autoApproved, false);
  assert.equal(decision.requiresAdminReview, true);
});

test('reviewDecisionForReport holds incomplete bug reports for admin review', () => {
  const decision = reviewDecisionForReport({ type: 'bug' });

  assert.equal(decision.status, 'pending-review');
  assert.equal(decision.autoApproved, false);
  assert.equal(decision.requiresAdminReview, true);
});

test('reviewDecisionForReport holds reports with non-array labels for admin review', () => {
  const decision = reviewDecisionForReport({
    type: 'bug',
    classification: {
      route: 'bug-autofix',
      labels: { primary: 'bug' }
    },
    details: 'A reproducible checkout issue.'
  });

  assert.equal(decision.status, 'pending-review');
  assert.equal(decision.autoApproved, false);
  assert.equal(decision.requiresAdminReview, true);
});
