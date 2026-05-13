import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReport } from '../src/classifier.js';

test('classifies reproducible bug reports as autofix candidates', () => {
  const result = classifyReport({
    type: 'bug',
    title: 'SAVE10 coupon does not change total',
    steps: 'Open pricing, choose Pro, enter SAVE10.',
    expected: 'Total should be 90.',
    actual: 'Total stays 100.'
  });

  assert.equal(result.route, 'bug-autofix');
  assert.deepEqual(result.labels, ['bug', 'autofix:candidate']);
});

test('classifies bug reports with combined details as autofix candidates', () => {
  const result = classifyReport({
    type: 'bug',
    title: 'SAVE10 coupon does not change total',
    details: [
      '我做了什么：打开演示应用，选择 Pro，输入 SAVE10。',
      '我以为会发生什么：总价应该显示 90。',
      '实际发生了什么：总价仍然显示 100。',
      '我的设备/浏览器：Chrome on macOS。'
    ].join('\n')
  });

  assert.equal(result.route, 'bug-autofix');
  assert.deepEqual(result.labels, ['bug', 'autofix:candidate']);
});

test('routes feature and design changes to AI change workflow', () => {
  for (const type of ['feature', 'design']) {
    const result = classifyReport({
      type,
      title: 'Please add a new dashboard',
      details: 'Please add a simple dashboard panel that shows the current plan and total price.'
    });

    assert.equal(result.route, 'ai-change');
    assert.deepEqual(result.labels, [type, 'autofix:candidate']);
  }
});

test('routes risky security/auth/billing/privacy reports to human review', () => {
  const riskyTexts = [
    'auth session leaks',
    'billing invoice wrong',
    'privacy data exposed',
    'database migration failed',
    'security token visible'
  ];

  for (const title of riskyTexts) {
    const result = classifyReport({
      type: 'bug',
      title,
      steps: 'Steps',
      expected: 'Expected',
      actual: 'Actual'
    });

    assert.equal(result.route, 'human-review');
    assert.ok(result.labels.includes('needs:human'));
  }
});
