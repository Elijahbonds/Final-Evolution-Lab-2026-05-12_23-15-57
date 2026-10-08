// business — the ONE place the company's legal identity lives (LEGAL-COPY, 2026-10-07; FE PM Oct 7 2:39 PM PT).
// Every legal surface (Terms, Privacy, /support) reads these instead of carrying its own copy, so the name, the
// contact address and the mailing address change in exactly one place. Pure, client-safe data: no server-only,
// no prisma, no next/*, no process.env — lib/policies.ts imports this and is itself read by the client-side
// auth-form, so this file must stay importable from a client component.

import { SCREEN_CONTACT_EMAIL } from '../screen/copy';

/** The legal entity. Public prose is "Final Evolution"; the LLC form appears only in legal lines. */
export const BUSINESS_LEGAL_NAME = 'Final Evolution LLC';

/**
 * Internal marker the policy texts (lib/policies.ts) carry where the mailing address goes. It is never shown to a
 * user: the legal pages swap it for REAL_MAILING_ADDRESS or drop the line at render time. The value stays fixed
 * because the policy fingerprint (lib/policies.test.ts) covers it.
 */
export const BUSINESS_MAILING_ADDRESS = '[Business mailing address – pending]';

/** The real business mailing address, or null while none is set. While null, every legal page drops the line that would print it. Never a home or street address; set it only with the real business mailbox in its own change. */
export const REAL_MAILING_ADDRESS: string | null = null;

/** True only for a non-empty (after trim) string. */
export function isMailingAddressSet(address: string | null | undefined): address is string {
  return typeof address === 'string' && address.trim().length > 0;
}

/** Fills the marker with the address, or (while unset) drops every line that would print it. Pure; never throws. */
export function renderMailingAddress(markdown: string, marker: string, address: string | null): string {
  if (isMailingAddressSet(address)) return markdown.split(marker).join(address.trim());
  if (!marker) return markdown;
  const clause = `, or write to ${BUSINESS_LEGAL_NAME}, ${marker}`;
  return markdown
    .split('\n')
    .map((line) => (line.includes(marker) ? line.split(clause).join('') : line))
    .filter((line) => !line.includes(marker))
    .join('\n');
}

/**
 * The contact address for legal, privacy and support mail. Re-exported from lib/screen/copy.ts (the single constant
 * every surface already shares) rather than typed here, so this file never forks it.
 */
export const BUSINESS_CONTACT_EMAIL = SCREEN_CONTACT_EMAIL;
