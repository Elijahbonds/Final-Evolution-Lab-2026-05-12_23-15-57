import { CheckoutThanks } from '@/components/coach-business/checkout-thanks';

export const dynamic = 'force-dynamic';

// COACH-BUSINESS: Stripe Checkout's success_url for a coach's package (lib/coach-business/connect.ts). noindex (layout).
export default function CoachBusinessThanksPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const id = typeof searchParams?.session_id === 'string' ? searchParams.session_id : '';
  return (
    <div className="min-h-screen bg-fel-bg">
      <CheckoutThanks sessionId={id} />
    </div>
  );
}
