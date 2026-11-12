import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { STRIPE_PRODUCTS } from '@/lib/stripe';
import { isPurchaseOpen } from '@/lib/payments/allowlist';
import { BUYER_TERMS } from '@/lib/payments/terms';
import { parseProPlan, proBuyHref } from '@/lib/payments/proBuy';
import { ProBuy } from '@/components/pro/pro-buy';

export const dynamic = 'force-dynamic';

// PAYMENTS-READY (2026-10-26): the FEL Pro buy page every "Get FEL Pro" link opens (lib/payments/proBuy.ts). Signed in
// only (lib/screen/config.ts SIGNED_IN_ONLY_ROUTES). The prices are the products' own (lib/stripe.ts); whether it sells
// is VIRTUAL_PURCHASES_ENABLED + PURCHASES_ALLOWLIST; every other answer (18+, terms, already Pro) is the checkout route's.
export default async function ProPage({ searchParams }: { searchParams?: { plan?: string } }) {
  const plan = parseProPlan(searchParams?.plan);
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(proBuyHref(plan)));
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <ProBuy
        open={isPurchaseOpen('fel_pro')}
        plan={plan}
        prices={{ weekly: STRIPE_PRODUCTS.FEL_PRO.priceUsd, monthly: STRIPE_PRODUCTS.FEL_PRO_MONTHLY.priceUsd }}
        terms={{ version: BUYER_TERMS.fel_pro.version, href: BUYER_TERMS.fel_pro.href }}
        description={STRIPE_PRODUCTS.FEL_PRO_MONTHLY.description}
      />
    </div>
  );
}
