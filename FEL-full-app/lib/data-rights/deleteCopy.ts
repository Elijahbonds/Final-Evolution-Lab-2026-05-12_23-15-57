// lib/data-rights/deleteCopy.ts — ACCOUNT-DELETE (2026-10-25): the words "Delete my account" shows.
//
// PRODUCT COPY THAT MUST MATCH THE POLICY. Every "kept" line below is a rule already written somewhere the owner signed
// off, and names it; nothing here adds a promise. If the owner changes the policy (docs/DRAFT-policy-account-deletion.md),
// change this with it. FLAGGED for the owner's eye in the lane report.
//   · money records, 7 years      → Privacy §10 "Order, payment, refund and referral records: 7 years after the purchase,
//                                    for tax and accounting"; docs/DATA-RIGHTS.md §2 (ledger, wallet, payouts kept)
//   · consent records kept        → Privacy §5 "Your consent records are kept, as proof of what you agreed to and when
//                                    you withdrew"; DATA-RIGHTS §2 + owner call 3 (guardian, scan-save consents too)
//   · reports, 12 months          → Privacy §1 Parties "We keep a report for 12 months, then delete it"; DATA-RIGHTS §3.4
//   · booking details removed     → DATA-RIGHTS §2 (goal, note, pain answer, written review scrubbed; money stays)
//   · original clips swept        → DATA-RIGHTS §2 (put due for the existing 30-day sweep: deleted at its next run)
//   · others' records, anonymised → DATA-RIGHTS §3.5, 3.6, 3.8
//   · the placeholder             → DATA-RIGHTS §3.1 (owner decision 1, approved 2026-10-25)
// Server-free so the client component and the tests both import it.

import { BUSINESS_CONTACT_EMAIL } from '@/lib/legal/business';
import type { DeleteBlock, ObligationCode } from './deleteGate';

export const DELETE_COPY = {
  heading: 'Delete my account',
  lede: 'This deletes your account and the personal data in it. It can’t be undone.',
  downloadFirst: 'Download my data first',
  deleted: {
    title: 'What is deleted',
    lines: [
      'Your sign-in, name, birth year and state. Nobody can sign in to this account again.',
      'Your profile, PRQ, Mirror sessions and assessments, movement history, workouts and plans, game progress, cards and looks.',
      'Your health intake, pain check-ins, daily check-ins and Dial-Up Breath uses.',
      'Your coaching sessions, messages and form reviews, your challenge links, and squads you own.',
      'If you coach: your clients list, invites, availability and coach profile text. Your coach page is taken down.',
    ],
  },
  kept: {
    title: 'What is kept, and why',
    lines: [
      'Money records — orders, payments, refunds, payouts, referral rewards and your wallet history — for 7 years after the purchase, for tax and accounting. Your name and email are removed from them. Anything left in your wallet can’t be used after the account is deleted.',
      'Bookings keep their price and dates for those 7 years; your goal, notes, pain answer and written review are removed. Your original review clips are deleted at our next clean-up.',
      'Your consent records — health data, a parent’s or guardian’s consent, and your choice about saving scans — as proof of what you agreed to and when.',
      'Party reports: a report you made is kept for its 12 months without your name; a report about you is kept for its 12 months, then deleted.',
      'Records other people rely on — a coach’s programs, match and ladder results — stay, with your name removed.',
      'An empty placeholder for the account, with no name, email or password, so those kept records stay consistent.',
    ],
  },
  signOut: 'You will be signed out on every device.',
  emailLabel: 'Type the email address on this account',
  passwordLabel: 'Your password',
  confirmLabel: 'I understand my account and data will be deleted and this can’t be undone.',
  button: 'Delete my account',
  working: 'Deleting…',
  cancel: 'Cancel',
  open: 'Delete my account…',
  done: 'Your account has been deleted.',
  errors: {
    reauth: 'That email or password doesn’t match this account.',
    confirm: 'Tick the box to confirm.',
    rateLimited: 'Too many tries. Wait a few minutes, then try again.',
    signedOut: 'Sign in again to delete your account.',
    failed: 'Something went wrong and nothing was deleted. Try again.',
    unsure: 'We couldn’t tell whether that went through. Try again: if it did, you’ll be signed out.',
  },
} as const;

const OBLIGATION_LINES: Record<ObligationCode, (n: number) => string> = {
  'coach-bookings': (n) => `${n === 1 ? 'A booking' : `${n} bookings`} from your clients still to deliver, or with a refund or dispute open. Deliver, finish or cancel ${n === 1 ? 'it' : 'them'} first.`,
  'client-bookings': (n) => `${n === 1 ? 'A booked session or review' : `${n} booked sessions or reviews`} still in progress, or with a refund or dispute open. Let ${n === 1 ? 'it' : 'them'} finish, or cancel first.`,
  payouts: (n) => `${n === 1 ? 'A payout' : `${n} payouts`} still on ${n === 1 ? 'its' : 'their'} way to you. Wait until ${n === 1 ? 'it arrives' : 'they arrive'}.`,
  subscription: () => 'A subscription that will renew. Cancel it first, so you aren’t charged again.',
  'coach-plans-sold': (n) => `${n === 1 ? 'A client pays' : `${n} clients pay`} you for a monthly plan, or a checkout is still open. Cancel those plans first.`,
  'coach-plans-bought': (n) => `${n === 1 ? 'A monthly coaching plan' : `${n} monthly coaching plans`} you pay for, or a checkout still open. Cancel ${n === 1 ? 'it' : 'them'} first, so you aren’t charged again.`,
};

/** The message for a blocked delete: a heading and the lines under it. */
export function blockMessage(b: DeleteBlock, contact: string = BUSINESS_CONTACT_EMAIL): { title: string; lines: string[] } {
  if (b.kind === 'minor') {
    return {
      title: 'Ask your parent or guardian',
      lines: [`Accounts for people under 18 are deleted with a parent or guardian. Ask your parent or guardian to email us at ${contact}, and we’ll take care of it.`],
    };
  }
  if (b.kind === 'age-unknown') {
    return {
      title: 'We need to know it’s an adult’s account',
      lines: [
        'We don’t have a birth year for this account, so we can’t tell whether it belongs to someone under 18.',
        `If you’re under 18, ask your parent or guardian to email us at ${contact}. If you’re 18 or over, email us at ${contact} from the email address on this account, and we’ll delete it.`,
      ],
    };
  }
  return {
    title: 'Settle these first',
    lines: b.items.map((o) => OBLIGATION_LINES[o.code](o.count)),
  };
}
