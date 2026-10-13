import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_PHONE, BUSINESS_LEGAL_NAME, REAL_MAILING_ADDRESS, isMailingAddressSet } from '@/lib/legal/business';

/** COACH-THANKS: the support block on /coach/thanks, read from lib/legal/business.ts (never typed here). */
export function ThanksContact() {
  return (
    <section className="mt-6 rounded-xl border border-white/15 p-4 text-sm text-white/80" aria-label="Support">
      <h2 className="font-bold text-white">Questions about your order?</h2>
      <p className="mt-1">Email <a className="underline" href={`mailto:${BUSINESS_CONTACT_EMAIL}`}>{BUSINESS_CONTACT_EMAIL}</a> or call or text <a className="underline" href={`tel:+1${BUSINESS_CONTACT_PHONE.replace(/\D/g, '')}`}>{BUSINESS_CONTACT_PHONE}</a>.</p>
      {isMailingAddressSet(REAL_MAILING_ADDRESS) ? <p className="mt-1">Mail: {BUSINESS_LEGAL_NAME}, {REAL_MAILING_ADDRESS.trim()}</p> : null}
    </section>
  );
}
