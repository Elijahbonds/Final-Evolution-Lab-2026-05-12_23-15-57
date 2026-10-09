// Who sees which cards. IMPROVE (2026-10-06), owner decision 5: "guests see the first 5 Playbook cards, sign in for
// all." Every other topic is open to everyone. Pure, so the gate is tested rather than trusted.
//
// What this gate is: a product gate on the feed. What it is not: a secret. The Playbook's text already ships in client
// bundles (/education's chapter reader, lib/drills), and v1 bundled the whole pack here too. A server-held Playbook
// would be the way to make it one; it is not built.

import { topicById } from './topics';
import type { Card, TopicId } from './types';

/** How many Playbook cards a guest sees (the Playbook topic's guestPreview). */
export const PLAYBOOK_GUEST_CARDS = 5;

/** The cards this viewer may be shown, in catalogue order: a guest sees the first `guestPreview` cards of a preview
 *  topic and nothing after them; a signed-in viewer sees everything. */
export function visibleCards(cards: readonly Card[], signedIn: boolean): Card[] {
  if (signedIn) return [...cards];
  const shown = new Map<TopicId, number>();
  return cards.filter((c) => {
    const limit = topicById(c.topic).guestPreview;
    if (limit === undefined) return true;
    const n = (shown.get(c.topic) ?? 0) + 1;
    shown.set(c.topic, n);
    return n <= limit;
  });
}

/** For a guest: how many of `topic`'s cards wait behind sign-in (0 for an open topic, or when signed in). */
export function lockedCount(cards: readonly Card[], signedIn: boolean, topic: TopicId): number {
  if (signedIn) return 0;
  const all = cards.filter((c) => c.topic === topic).length;
  return all - visibleCards(cards, false).filter((c) => c.topic === topic).length;
}

/** The note a guest sees on a preview topic's card: which preview card this is, and that sign-in unlocks the rest. */
export function guestNote(cards: readonly Card[], signedIn: boolean, card: Card): string | null {
  if (signedIn) return null;
  const limit = topicById(card.topic).guestPreview;
  if (limit === undefined) return null;
  const i = visibleCards(cards, false).filter((c) => c.topic === card.topic).findIndex((c) => c.id === card.id);
  if (i < 0) return null;
  const total = cards.filter((c) => c.topic === card.topic).length;
  return `Guest preview · card ${i + 1} of ${limit} · sign in for all ${total}`;
}
