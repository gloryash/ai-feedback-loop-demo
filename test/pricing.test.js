import test from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../src/pricing.js';

test('SAVE10 reduces the Pro plan total by 10', () => {
  const result = quote({ plan: 'pro', coupon: 'SAVE10' });

  assert.equal(result.base, 100);
  assert.equal(result.discount, 10);
  assert.equal(result.total, 90);
});

test('Scale plan quotes a base and total of 250 without a coupon', () => {
  const result = quote({ plan: 'scale' });

  assert.equal(result.base, 250);
  assert.equal(result.discount, 0);
  assert.equal(result.total, 250);
});

test('quote includes a display hint for the pricing page', () => {
  const result = quote({ plan: 'pro', coupon: 'SAVE10' });

  assert.equal(typeof result.bugHint, 'string');
  assert.doesNotMatch(result.bugHint, /undefined/i);
});
