import Link from 'next/link';
import { assertStripeTestKey, bookStripeSecret, getBookStripe } from '@/lib/books/bookCheckout';
import { getBookableService } from '@/lib/creator/creatorCatalog';
import { formatSlot } from '@/lib/creator/creatorSlots';
import { currentViewer } from '@/lib/creator/creatorViewer';
import { CreatorFrame, SectionTitle } from '@/components/creator-platform/creator-frame';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Booking received — Final Evolution Team' };

/**
 * Stripe Checkout returns here. The page reads the session from Stripe (test key only) to show what was
 * booked. The booking itself is confirmed by the webhook, not by this page.
 */
export default async function BookingSuccessPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const viewer = await currentViewer();
  const sessionId = searchParams.session_id?.slice(0, 200) || '';

  let paid = false;
  let serviceId = '';
  let slotStart = '';
  let lookupError: string | null = null;
  if (sessionId) {
    try {
      assertStripeTestKey(bookStripeSecret());
      const checkout = await getBookStripe().checkout.sessions.retrieve(sessionId);
      if (checkout.metadata?.product !== 'SERVICE') {
        lookupError = 'That payment is not a booking.';
      } else {
        paid = checkout.payment_status === 'paid' || checkout.payment_status === 'no_payment_required';
        serviceId = checkout.metadata?.serviceId ?? '';
        slotStart = checkout.metadata?.slotStart ?? '';
      }
    } catch (err) {
      console.error('[bookings/success]', err instanceof Error ? err.message : err);
      lookupError = 'The booking could not be confirmed from here. If you were charged, the Stripe receipt is the record.';
    }
  } else {
    lookupError = 'This page needs the checkout session from Stripe.';
  }

  const found = serviceId ? getBookableService(serviceId) : undefined;
  const when = found && slotStart ? formatSlot({ start: slotStart, end: slotStart }, found.profile.timeZone) : null;

  return (
    <CreatorFrame signedIn={viewer.signedIn} title="Booking received" lede="Thanks. Here is what you booked.">
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#101010] p-5">
        <SectionTitle>Your booking</SectionTitle>
        {lookupError ? (
          <p className="mt-2 text-sm text-white/70">{lookupError}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-white">
              {found ? `${found.service.name} with ${found.profile.name}` : 'Service'}
              {when ? ` · ${when.day}, ${when.time}` : ''}
            </p>
            <p className="mt-2 text-sm text-white/60">
              {paid
                ? 'Payment received. The booking is confirmed as soon as Stripe notifies us, usually within seconds.'
                : 'Payment is still processing. The booking is confirmed when Stripe reports it paid.'}
            </p>
            <p className="mt-2 text-[11px] text-white/35">No confirmation email is sent yet. Keep the Stripe receipt.</p>
          </>
        )}
        <Link href="/team" className="mt-4 inline-block text-sm text-[#F5C518]">Back to the team</Link>
      </section>
    </CreatorFrame>
  );
}
