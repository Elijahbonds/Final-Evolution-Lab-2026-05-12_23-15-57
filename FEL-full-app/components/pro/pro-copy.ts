// components/pro/pro-copy.ts — PLAT-P07 (2026-11-02): what FEL Pro gives, in three lines. OWNER DRAFT for the Inbox, built
// only from what the code grants today:
//   · every week of a signature program after the free first one (lib/signature/access.ts weekAccess: week 1 free, later
//     weeks need an active FEL Pro);
//   · keeping the attribute upgrades you earn (lib/stripe.ts STRIPE_PRODUCTS.FEL_PRO description);
//   · playing and the PRQ scan stay free (the same description) — said so nobody thinks the basics are behind it.
// No price, fee or renewal wording here: the prices are the products' own, and the store terms are the owner's (OWN-04).
export const PRO_LINES = [
  'Every signature program week, not just the first.',
  'Keep the upgrades you earn.',
  'Playing and the PRQ scan stay free.',
] as const;

export const PRO_COPY = {
  eyebrow: 'FEL Pro',
  title: 'Train past week one',
  get: 'Get FEL Pro',
  plans: 'Plans',
} as const;
