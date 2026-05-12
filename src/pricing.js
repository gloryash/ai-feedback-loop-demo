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

  if (normalizedCoupon === 'SAVE10') {
    discount = 10;
  }

  return {
    plan: normalizedPlan,
    base,
    discount,
    total: Math.max(base - discount, 0),
    coupon: normalizedCoupon
  };
}
