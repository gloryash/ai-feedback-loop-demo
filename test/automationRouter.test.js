import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAutomation } from '../src/automationRouter.js';

const autofixReport = {
  type: 'bug',
  classification: {
    route: 'bug-autofix',
    labels: ['bug', 'autofix:candidate'],
    reason: 'Reproducible bug with expected and actual results.'
  }
};

test('routeAutomation keeps cloud autofix labels in cloud mode', () => {
  const result = routeAutomation(autofixReport, {
    mode: 'cloud',
    cloud: { autofixLabel: 'autofix:candidate' }
  });

  assert.equal(result.mode, 'cloud');
  assert.deepEqual(result.labels, ['bug', 'autofix:candidate']);
  assert.equal(result.requiresApproval, false);
});

test('routeAutomation uses local candidate labels in local-pr mode', () => {
  const result = routeAutomation(autofixReport, {
    mode: 'local-pr',
    localPr: { candidateLabel: 'local:candidate' }
  });

  assert.equal(result.mode, 'local-pr');
  assert.deepEqual(result.labels, ['bug', 'local:candidate']);
  assert.equal(result.labels.includes('autofix:candidate'), false);
  assert.equal(result.requiresApproval, true);
});

test('routeAutomation preserves human-review labels in local-pr mode', () => {
  const result = routeAutomation({
    type: 'change',
    classification: {
      route: 'human-review',
      labels: ['change', 'needs:human', 'risk:review'],
      reason: 'Risky report.'
    }
  }, {
    mode: 'local-pr',
    localPr: { candidateLabel: 'local:candidate' }
  });

  assert.equal(result.mode, 'human-review');
  assert.deepEqual(result.labels, ['change', 'needs:human', 'risk:review']);
  assert.equal(result.requiresApproval, true);
});
