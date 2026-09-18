/**
 * lib/wallet/sceneit-freeuse.ts — Scene It "Free-Use Legends" bank (Phase 2).
 *
 * The user's Scene It ask: "free use as in the copyright time limit, old
 * characters." These are characters whose original works are in the PUBLIC
 * DOMAIN (their copyright term has expired), so they are legally free to use.
 * Correctly identifying one in Scene It rewards SHARDS (never purchasable).
 *
 * Everything here is genuinely public-domain source material — no in-copyright
 * third-party franchise IP. Each entry documents WHY it is free to use so the
 * screen (and future editors) can audit the claim.
 */

export interface FreeUseQuestion {
  q: string;
  options: string[];
  answer: number;
  /** Always true — marks this as a shard-earning free-use identification. */
  freeUse: true;
  /** Public-domain rationale (source work + why the term has lapsed). */
  note: string;
}

// Characters from works long out of copyright (published well before the
// modern term cutoff). Deliberately avoids anything still under active rights.
export const FREE_USE_QUESTIONS: FreeUseQuestion[] = [
  {
    q: 'Which free-use detective first appeared in an 1887 novel now in the public domain?',
    options: ['Sherlock Holmes', 'A modern licensed sleuth', 'A studio mascot', 'A game hero'],
    answer: 0,
    freeUse: true,
    note: 'Arthur Conan Doyle, A Study in Scarlet (1887) — canon largely public domain.',
  },
  {
    q: 'This 1897 gothic count is free to use because its source novel is public domain. Who is it?',
    options: ['Count Dracula', 'A licensed film vampire', 'A trademarked cereal count', 'A studio villain'],
    answer: 0,
    freeUse: true,
    note: 'Bram Stoker, Dracula (1897) — public domain.',
  },
  {
    q: 'Mary Shelley’s 1818 creation, free to reuse today, is best known as what?',
    options: ["Frankenstein’s Monster", 'A licensed movie monster', 'A theme-park robot', 'A comic mutant'],
    answer: 0,
    freeUse: true,
    note: 'Mary Shelley, Frankenstein (1818) — public domain.',
  },
  {
    q: 'Which outlaw of English folklore is free to use with no rights holder?',
    options: ['Robin Hood', 'A licensed archer hero', 'A branded mascot', 'A studio ranger'],
    answer: 0,
    freeUse: true,
    note: 'Medieval folklore — no copyright; fully public domain.',
  },
  {
    q: "The girl swept to a magical land in Baum’s 1900 book — free to use — is who?",
    options: ['Dorothy Gale', 'A licensed film heroine', 'A studio princess', 'A branded traveler'],
    answer: 0,
    freeUse: true,
    note: 'L. Frank Baum, The Wonderful Wizard of Oz (1900) — public domain.',
  },
  {
    q: "Lewis Carroll’s 1865 wanderer down a rabbit hole — free to use — is who?",
    options: ['Alice', 'A licensed cartoon girl', 'A studio mascot', 'A branded explorer'],
    answer: 0,
    freeUse: true,
    note: "Lewis Carroll, Alice's Adventures in Wonderland (1865) — public domain.",
  },
  {
    q: 'Carlo Collodi’s 1883 wooden puppet, free to use in its original form, is who?',
    options: ['Pinocchio', 'A licensed animated puppet', 'A branded toy', 'A studio marionette'],
    answer: 0,
    freeUse: true,
    note: 'Carlo Collodi, The Adventures of Pinocchio (1883) — public domain.',
  },
  {
    q: 'Mark Twain’s 1876 mischievous boy hero, free to use, is who?',
    options: ['Tom Sawyer', 'A licensed sitcom kid', 'A branded mascot', 'A studio sidekick'],
    answer: 0,
    freeUse: true,
    note: 'Mark Twain, The Adventures of Tom Sawyer (1876) — public domain.',
  },
];

/** Options must never smuggle in an in-copyright franchise token. */
export function freeUseIsClean(banned: readonly string[]): boolean {
  return FREE_USE_QUESTIONS.every((q) => {
    const hay = (q.q + ' ' + q.options.join(' ')).toLowerCase();
    return !banned.some((tok) => hay.includes(tok));
  });
}
