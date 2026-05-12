const PLANS = {
  starter: 29,
  pro: 100,
  scale: 240
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
