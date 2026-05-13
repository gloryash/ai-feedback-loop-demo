import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pricingPath = join(root, 'src', 'pricing.js');

const content = `const PLANS = {
  starter: 29,
  pro: 100,
  scale: 250
};

export function quote({ plan = 'starter', coupon = '' } = {}) {
  const normalizedPlan = String(plan).toLowerCase();
  const base = PLANS[normalizedPlan] ?? PLANS.starter;
  const normalizedCoupon = String(coupon).trim().toUpperCase();
  let discount = 0;

  // Intentional demo bug: SAVE10 should also apply to Pro, but this excludes it.
  if (normalizedCoupon === 'SAVE10' && normalizedPlan !== 'pro') {
    discount = 10;
  }

  return {
    plan: normalizedPlan,
    base,
    discount,
    total: Math.max(base - discount, 0),
    coupon: normalizedCoupon,
    bugHint: 'SAVE10 should reduce Pro from 100 to 90.'
  };
}
`;

await writeFile(pricingPath, content);
console.log('Demo reset: SAVE10 bug is present again.');
