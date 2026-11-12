// COACH-BUSINESS: the itemised total a buyer sees before Checkout (owner, 2026-10-25: "5% + Stripe fee on top"): the
// coach's price, the processing fee, the total. The same split Stripe charges (lib/coach-business/fees.ts saleSplit), and
// Checkout shows the same two lines. Shown only where the package can be booked.
import { billingOf, type PackageKind } from '@/lib/coach-business/packages';
import { saleSplit } from '@/lib/coach-business/fees';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function FeeBreakdown({ priceCents, kind }: { priceCents: number; kind: PackageKind }) {
  const s = saleSplit(priceCents);
  const per = billingOf(kind) === 'month' ? ' / month' : '';
  return (
    <dl className="mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm" data-fee-breakdown>
      <dt className="text-white/60">Price</dt>
      <dd className="text-right tabular-nums" data-line="price">{usd(s.priceCents)}</dd>
      <dt className="text-white/60">Processing fee</dt>
      <dd className="text-right tabular-nums" data-line="processing">{usd(s.processingFeeCents)}</dd>
      <dt className="border-t border-white/10 pt-0.5 font-bold">Total</dt>
      <dd className="border-t border-white/10 pt-0.5 text-right font-bold tabular-nums" data-line="total">{usd(s.totalCents)}{per}</dd>
    </dl>
  );
}
