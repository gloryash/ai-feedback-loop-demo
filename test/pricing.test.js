import test from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../src/pricing.js';

test('demo starts with the intentional SAVE10 bug for Codex to fix', () => {
  const result = quote({ plan: 'pro', coupon: 'SAVE10' });

  assert.equal(result.total, 100);
  assert.equal(result.bugHint, 'SAVE10 should reduce Pro from 100 to 90.');
});
