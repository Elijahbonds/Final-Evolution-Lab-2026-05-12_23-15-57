// business — the ONE place the company's legal identity lives (LEGAL-COPY, 2026-10-07; FE PM Oct 7 2:39 PM PT).
// Every legal surface (Terms, Privacy, /support) reads these instead of carrying its own copy, so the name, the
// contact address and the mailing address change in exactly one place. Pure, client-safe data: no server-only,
// no prisma, no next/*, no process.env — lib/policies.ts imports this and is itself read by the client-side
// auth-form, so this file must stay importable from a client component.

import { SCREEN_CONTACT_EMAIL } from '../screen/copy';

/** The legal entity. Public prose is "Final Evolution"; the LLC form appears only in legal lines. */
export const BUSINESS_LEGAL_NAME = 'Final Evolution LLC';

/**
 * The business mailing address. This is the literal placeholder the store terms (store-terms-2026-10-04) already
 * print; the real business address (never a home/street address) is filled in later by its own change, which moves
 * the version id and "Last updated" date with it. It must keep passing addressRejected() from
 * lib/coach-store/address.ts (no street pattern, not blocked).
 */
export const BUSINESS_MAILING_ADDRESS = '[Business mailing address – pending]';

/**
 * The contact address for legal, privacy and support mail. Re-exported from lib/screen/copy.ts (the single constant
 * every surface already shares) rather than typed here, so this file never forks it.
 */
export const BUSINESS_CONTACT_EMAIL = SCREEN_CONTACT_EMAIL;
