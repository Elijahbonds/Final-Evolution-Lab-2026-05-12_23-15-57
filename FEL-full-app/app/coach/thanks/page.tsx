import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { ThanksPoll } from '@/components/coach-store/thanks-poll';
import { ThanksContact } from '@/components/coach-store/thanks-contact';
import { isCoachStoreEnabled } from '@/lib/flags';
import { loginPath } from '@/lib/auth/safeNext';
import { loadThanks, problemMessage, slotLabel, type ThanksProblem } from '@/lib/coach-store/thanks';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Thanks' };

type Params = { row?: string; session_id?: string };

function ThanksError({ problem, signIn }: { problem: ThanksProblem | 'signed_out'; signIn?: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-8 text-white">
      <h1 className="text-2xl font-black">We could not show this order</h1>
      <p className="mt-2 text-sm" role="alert">{problemMessage(problem)}</p>
      {signIn ? <a className="mt-3 inline-block text-sm underline" href={signIn}>Sign in</a> : null}
      <ThanksContact />
    </main>
  );
}

// COACH-THANKS: the page Stripe sends a buyer back to. While the store is off it stays a 404 (nothing can be bought).
// With the store on, the server checks the Checkout Session at Stripe and shows the item, price, slot and next step;
// a missing, invalid or someone else's link shows a plain error with support contact, never a 404 or a crash.
export default async function ThanksPage({ searchParams }: { searchParams: Params }) {
  if (!isCoachStoreEnabled()) notFound();
  const row = typeof searchParams.row === 'string' ? searchParams.row : undefined;
  const sid = typeof searchParams.session_id === 'string' ? searchParams.session_id : undefined;
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    const back = `/coach/thanks?${new URLSearchParams({ ...(row ? { row } : {}), ...(sid ? { session_id: sid } : {}) }).toString()}`;
    return <ThanksError problem="signed_out" signIn={loginPath(back)} />;
  }
  const result = await loadThanks(userId, row, sid);
  if (!result.ok) return <ThanksError problem={result.problem} />;
  const { summary } = result;
  return (
    <main className="mx-auto max-w-xl px-4 py-8 text-white">
      <section className="mb-6 rounded-xl border border-white/15 p-4 text-sm" aria-label="Your order">
        <h2 className="text-lg font-bold">{summary.paid ? 'You are all set' : 'Payment pending'}</h2>
        <p className="mt-2">Item: {summary.item}</p>
        {summary.price ? <p>Price: {summary.price}</p> : null}
        {summary.slot ? <p>Booked: {slotLabel(summary.slot)}</p> : null}
        <p className="mt-2">Next step: {summary.nextStep}</p>
      </section>
      <ThanksPoll rowId={row as string} sessionId={sid ?? null} />
      <ThanksContact />
    </main>
  );
}
