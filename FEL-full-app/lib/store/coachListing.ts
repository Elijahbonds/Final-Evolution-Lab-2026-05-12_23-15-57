// SELLING A BLOCK TO A STRANGER (2026-09-13).
//
// Build-order item #9, and last on purpose: it is a commerce surface over everything items 1–8 produced. A
// coach authors a `CoachProgram` (lib/profile/assignment.ts), `canPublish` already decides whether it may be
// SOLD at all, and Stripe, listings and entitlements already exist. What did not exist is the thing between
// them: what a buyer is TOLD before they pay.
//
// THE PROBLEM THIS FILE EXISTS FOR.
//
// `assignProgram` shows locked items with their thresholds, and for a coach's own client that is exactly
// right — there is a relationship, a conversation, and somebody to ask. A STRANGER paying for an eight-week
// block has none of that. If three of their eight weeks are gated behind a PRQ they do not have, they have
// bought a plan they cannot follow, and they find out afterwards. That is not a UX problem, it is a refund.
//
// SO THE GATES ARE PRICED IN, BEFORE THE MONEY:
//
//   1. A LISTING DECLARES WHAT IT REQUIRES. Every threshold anywhere in the block, deduped and hardest-first,
//      computed from the program rather than typed by the coach — a coach describing their own gates in a
//      description field is a coach who will be out of date by next week.
//
//   2. THE BUYER IS SHOWN HOW MUCH OF *THIS* BLOCK IS OPEN TO *THEM*, before paying, as a number. Not "some
//      content may be locked" — "5 of 12 open to you today", computed against their own profile.
//
//   3. A SALE THAT WOULD DELIVER NOTHING IS REFUSED, not warned about. When zero items are open, a warning
//      is a checkbox somebody clicks past on the way to being disappointed. This is the one place in the
//      coaching layer that says no rather than showing a caveat, and it is deliberate: the caveat is what
//      does not survive contact with a checkout flow.
//
//   4. AN UNSCANNED BUYER CANNOT BE SOLD A GATED BLOCK, because nobody — including us — knows what they
//      would be getting. An ungated block still sells fine. This is the honest version of the upsell: the
//      answer to "can I buy this" is "scan first, then we can both see".
//
// Pure: no Prisma, no Stripe, no DOM. The route layer owns the money.

import type { CoachProgram } from '../profile/assignment';
import { assignProgram, canPublish, unlockedFraction, validateProgram } from '../profile/assignment';
import type { Protocol } from '../profile/protocol';
import type { SharedProfile } from '../profile/sharedProfile';

/** One threshold somewhere in the block. What a buyer needs to clear to use all of it. */
export interface ListingRequirement {
  axis: string;
  label: string;
  need: number;
}

export interface CoachListing {
  programKey: string;
  coachId: string;
  title: string;
  /** The promise. Already required by `validateProgram` — a block with no stated end is a subscription. */
  outcome: string;
  priceCents: number;
  weeks: number;
  items: number;
  /** Hardest first. Empty means the block is ungated and anybody can use all of it. */
  requires: ListingRequirement[];
}

/**
 * Price bounds.
 *
 * A free "sale" is not a sale and routes around the entitlement path entirely; the ceiling is not a judgement
 * about what coaching is worth but a bound on what a single unvetted listing can charge before a human looks
 * at it. Both are here rather than in a config file so a test can hold them.
 */
export const MIN_PRICE_CENTS = 500;         // $5
export const MAX_PRICE_CENTS = 200_000;     // $2,000

export interface ListingProblem {
  where: string;
  problem: string;
}

/** Every distinct threshold in the block, hardest first. Derived, never authored. */
export function requirementsOf(program: CoachProgram, catalogue: readonly Protocol[]): ListingRequirement[] {
  const byKey = new Map(catalogue.map((p) => [p.key, p]));
  const seen = new Map<string, ListingRequirement>();
  for (const w of program.weeks) {
    for (const item of w.items) {
      const rule = byKey.get(item.protocolKey)?.unlock;
      if (!rule) continue;
      for (const t of rule.all) {
        const key = t.axis;
        const prev = seen.get(key);
        // one line per axis, carrying the HARDEST requirement — a buyer needs the highest bar, and listing
        // the same axis three times at three numbers is a wall of noise that hides the real one
        if (!prev || t.min > prev.need) seen.set(key, { axis: t.axis, label: t.label, need: t.min });
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.need - a.need);
}

/**
 * Turn a program into something sellable, or say why not.
 *
 * Stricter than `canPublish` only on price — everything about the block's CONTENT is already that function's
 * job, and duplicating its rules here is how the two drift apart.
 */
export function buildListing(
  program: CoachProgram,
  catalogue: readonly Protocol[],
  priceCents: number,
): { listing: CoachListing; problems: [] } | { listing: null; problems: ListingProblem[] } {
  const problems: ListingProblem[] = validateProgram(program, catalogue).map((p) => ({
    where: p.where, problem: p.problem,
  }));

  if (!canPublish(program, catalogue) && !problems.length) {
    // valid, but built on private work — the specific reason canPublish refuses a valid block
    problems.push({
      where: 'protocols',
      problem: 'A block for sale has to be built entirely from published protocols. Buyers cannot see private work.',
    });
  }
  if (!Number.isInteger(priceCents) || priceCents < MIN_PRICE_CENTS) {
    problems.push({ where: 'price', problem: `The lowest a block can list for is $${MIN_PRICE_CENTS / 100}.` });
  } else if (priceCents > MAX_PRICE_CENTS) {
    problems.push({ where: 'price', problem: `Listings are capped at $${MAX_PRICE_CENTS / 100}.` });
  }

  if (problems.length) return { listing: null, problems };

  return {
    listing: {
      programKey: program.key,
      coachId: program.coachId,
      title: program.title,
      outcome: program.outcome,
      priceCents,
      weeks: program.weeks.length,
      items: program.weeks.reduce((n, w) => n + w.items.length, 0),
      requires: requirementsOf(program, catalogue),
    },
    problems: [],
  };
}

export interface PurchasePreview {
  /** Items open to this buyer today. */
  openNow: number;
  total: number;
  /** 0..1. */
  fraction: number;
  /** What stands between them and the rest, hardest first. Empty when they can use all of it. */
  blockedBy: ListingRequirement[];
  /**
   * At least one item is locked only because the buyer's scan is too old for it.
   *
   * A separate flag because it is a different instruction. The gate returns no `blocking` entries in this
   * case — there is no threshold to blame, the reading is simply out of date — and without this the preview
   * fell through to "the rest unlocks as your readiness comes up", which tells somebody to train harder when
   * what they actually need is to scan again. Found by probing the preview rather than by reading it.
   */
  staleScan: boolean;
  /** False means the checkout is REFUSED, not warned. */
  sellable: boolean;
  /** One sentence, shown whether or not the sale goes ahead. */
  advice: string;
}

/**
 * What this buyer would actually get, computed before they pay.
 *
 * The gate runs against their real profile, so a buyer with a stale scan sees items locked exactly as the
 * gate says — `evaluateUnlock` already fails closed on stale data, and a preview that quietly used a
 * six-month-old reading to promise access would be the worst of both.
 */
export function previewPurchase(
  program: CoachProgram,
  catalogue: readonly Protocol[],
  buyer: SharedProfile | null,
  now: number = Date.now(),
): PurchasePreview {
  const assigned = assignProgram(program, catalogue, buyer, buyer?.clientId ?? 'preview', now);
  const total = assigned.weeks.reduce((n, w) => n + w.items.length, 0);
  const openNow = assigned.weeks.reduce((n, w) => n + w.openCount, 0);
  const requires = requirementsOf(program, catalogue);

  // only the requirements actually standing in THIS buyer's way — the listing's `requires` is the whole
  // block's bar, which is a different question from what is stopping this person today
  const blocking = new Set(
    assigned.weeks.flatMap((w) => w.items).filter((i) => !i.open)
      .flatMap((i) => i.gate.blocking.map((b) => b.axis)),
  );
  const blockedBy = requires.filter((r) => blocking.has(r.axis));

  // locked with nothing to blame it on = locked on the age of the scan (see `staleScan` above)
  const staleScan = assigned.weeks.flatMap((w) => w.items)
    .some((i) => !i.open && i.gate.blocking.length === 0);

  const unscanned = !buyer || buyer.prq.length === 0;
  const gated = requires.length > 0;

  if (!total) {
    return { openNow: 0, total: 0, fraction: 0, blockedBy: [], staleScan: false, sellable: false, advice: 'This block is empty.' };
  }
  if (unscanned && gated) {
    // neither of us knows what they would be getting — the honest answer is not a discount, it is a scan
    return {
      openNow, total, fraction: openNow / total, blockedBy: requires, staleScan: false, sellable: false,
      advice: 'Run a System Scan first — parts of this block are gated, and until you scan neither of us can see how much of it would be open to you.',
    };
  }
  if (openNow === 0) {
    const nearest = blockedBy[blockedBy.length - 1];        // the LOWEST bar is the nearest one
    return {
      openNow, total, fraction: 0, blockedBy, staleScan, sellable: false,
      advice: staleScan && !nearest
        ? 'Nothing in this block is open to you yet — your scan is out of date. Scan again and check back.'
        : nearest
          ? `Nothing in this block is open to you yet — it starts at ${nearest.label} ${nearest.need}. Come back for it.`
          : 'Nothing in this block is open to you yet.',
    };
  }
  if (openNow === total) {
    return { openNow, total, fraction: 1, blockedBy: [], staleScan: false, sellable: true, advice: 'All of it is open to you.' };
  }

  // the rest is a partly-open block, and WHY it is partly open decides what to tell them
  const rest =
    staleScan && !blockedBy.length ? 'The rest needs a more recent scan — nothing about your readiness is in the way.'
    : staleScan ? 'Some of the rest needs a more recent scan, and some unlocks as your readiness comes up.'
    : 'The rest unlocks as your readiness comes up.';

  return {
    openNow, total, fraction: unlockedFraction(assigned), blockedBy, staleScan, sellable: true,
    advice: `${openNow} of ${total} open to you today. ${rest} You keep the whole block either way.`,
  };
}
