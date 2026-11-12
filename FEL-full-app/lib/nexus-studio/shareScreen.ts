// THE TEXT SCREEN FOR STUDIO SHARE LINKS — AN ADAPTER (NEX-06, round 8).
//
// The safety lane (SAF-06) is building THE one shared text screen (lib/safety/textScreen.ts: normalisation, spaced letters,
// abuse and contact patterns, Scunthorpe-safe fixtures). It had not merged into lane/finish-release when this lane finished, so
// the share link does not build a second one: it screens through the party chat's own word list, read-only from
// server/netd/src/partyRules.ts `isProfane` (the list the safety screen copies and holds parity with), word by word.
//
// TODO(safety, SAF-06): when lib/safety/textScreen.ts lands on lane/finish-release, replace the body of `screenShareText` with
//   `const hits = screenAbuse(text); return hits.length ? { ok: false, found: hits[0].found } : { ok: true };`
// — the call sites (share.ts) and shareScreen.test.ts's must-pass / must-fail cases stay as they are.
//
// It REFUSES, it never rewrites: a venue whose name or banner text trips the screen is sent back with what tripped it.
// Pure: no I/O.

import { isProfane } from '@/server/netd/src/partyRules';

/**
 * Real words the party list's matcher catches (measured, round 8): it folds repeated letters before matching, so the stem "nigg"
 * becomes "nig" and catches "night", "Nigel" and "Nigeria", and the word "ass" becomes "as" and catches "as" (party chat masks
 * "As good as it gets" as "** good ** it gets"); "con" likewise. The safety lane pins the same over-masks (its test's
 * NETD_OVER_MASKS: as, assess, con, cons). The adapter lets these through; the safety screen replaces it (TODO below).
 */
const PARTY_OVER_MASKS = /^(as|assess|con|cons|nigh|night|nights|nightly|nightfall|nightlife|nighttime|nightclub|nightclubs|nightmare|nightmares|nigel|niger|nigeria|nigerian|nigerians)$/;

export type ScreenAnswer = { ok: true } | { ok: false; found: string };

/** One field a creator typed (a venue name, a banner's text). */
export function screenShareText(text: string): ScreenAnswer {
  // a "word" includes the look-alike characters, as the party's own mask reads it ("sh1t" and "@ss" are one word, not two)
  for (const w of text.normalize('NFKC').match(/[\p{L}\p{N}@$!|]+/gu) ?? []) {
    if (isProfane(w) && !PARTY_OVER_MASKS.test(w.toLowerCase())) return { ok: false, found: w };
  }
  return { ok: true };
}
