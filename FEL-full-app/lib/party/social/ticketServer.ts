// lib/party/social/ticketServer.ts — the party ticket, as the app signs it (PARTY-CHAT lane, 2026-10-13).
//
// The age comes from User.dobYear IN THE DATABASE (readDobYear), judged by the STRICT verified-adult rule
// (lib/age/ageRules.ts isVerifiedAdultStrict: a year gap of more than 18), the rule this repo uses wherever being wrong
// costs a minor's safety. Unknown, under 18, an exactly-18 gap, a guest, a failed read: not an adult → teen rules in
// the party (presets and emotes only, no voice, invite-only). netd verifies the signature; see
// server/netd/src/ticket.ts for why a ticket exists at all. Server-only.
import { signTicket, pubFor, TICKET_TTL_MS } from '@/server/netd/src/ticket';
import { cleanPartyName } from '@/server/netd/src/partyRules';
import { isVerifiedAdultStrict } from '@/lib/age/ageRules';

export interface TicketInput {
  /** The signed-in account, or null for a guest. */
  userId: string | null;
  /** From the database (readDobYear), never from the request. */
  dobYear: number | null;
  /** The name the person chose for parties (cleaned here, again, by the jersey rule). */
  name: string;
  secret: string | undefined;
  now: number;
}

export interface TicketOut { ticket: string | null; adult: boolean; configured: boolean }

export function buildTicket(i: TicketInput): TicketOut {
  const adult = i.userId !== null && isVerifiedAdultStrict(i.dobYear, new Date(i.now));
  if (!i.secret) return { ticket: null, adult: false, configured: false };
  // a guest gets no ticket: netd gives them a fresh handle and teen rules, which is what an unknown age means
  if (!i.userId) return { ticket: null, adult: false, configured: true };
  const ticket = signTicket({
    uid: i.userId, pub: pubFor(i.userId, i.secret), name: cleanPartyName(i.name) || 'PLAYER', adult, exp: i.now + TICKET_TTL_MS,
  }, i.secret);
  return { ticket, adult, configured: true };
}
