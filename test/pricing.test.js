import test from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../src/pricing.js';

test('SAVE10 reduces the Pro plan total by 10', () => {
  const result = quote({ plan: 'pro', coupon: 'SAVE10' });

  assert.equal(result.base, 100);
  assert.equal(result.discount, 10);
  assert.equal(result.total, 90);
});
