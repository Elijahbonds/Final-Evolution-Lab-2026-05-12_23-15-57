// lib/safety/textScreen.ts — SAFETY lane (SAF-06, 2026-10-25): ONE text screen for every field a person types that
// someone else may read — abuse, slurs, strong profanity, self-harm baiting, threats, sexual approaches and contact-
// sharing (the grooming shape) — so a report note, a team name, a trainer's public note and the next typed field are
// held to the same bar.
//
// THE LIST IS THE PARTY'S. server/netd/src/partyRules.ts masks party chat with an in-repo list (no dependency); netd is
// deployed by the owner and this lane never edits it, so its STEMS / WORDS / ALLOW are COPIED here and
// lib/safety/textScreen.test.ts reads that file and fails if the copies drift (every netd word must be on this list,
// and netd's isProfane and this screen must agree on every one).
//
// WHAT THIS ADDS TO THE PARTY'S MATCHER:
//   1. NORMALISATION: Unicode NFKC + diacritics off ("fück"), case, the same look-alike map (0→o, 1→i, 3→e, 4→a, 5→s,
//      7→t, @→a, $→s, !→i, |→l), repeated letters collapsed ("fuuuck"), and SPACED-OUT letters joined ("f u c k",
//      "f.u.c.k", "f-u-c-k") — the party list notes that one as not caught.
//   2. PATTERNS over the whole line, not just single words: "kys" / "kill yourself", "go die", "I will kill you",
//      "send nudes", age-and-meet-up probes, and contact sharing (a phone number, an email address, "add me on snap").
//   3. SCUNTHORPE-SAFE: stems match only at the START of a word and whole-word lists match only a whole word, so
//      "Scunthorpe", "assistant", "cockpit", "classic", "Essex", "document", "shiitake" pass. The fixtures that must
//      pass and must fail are pinned in the test.
//
// IT REFUSES, IT DOES NOT REWRITE (lib/share/screen.ts's rule for trainers' words): a field that trips the screen is
// sent back with what tripped, and the person writes it themselves. maskForDisplay exists for relayed chat only.
//
// Pure: no I/O, no Prisma, no DOM.

export type ScreenKind = 'profanity' | 'slur' | 'self_harm' | 'threat' | 'sexual' | 'contact';

export interface ScreenHit {
  kind: ScreenKind;
  /** The text that tripped it, as written. */
  found: string;
  /** Offset into the original text. */
  at: number;
}

// ── the party's list (server/netd/src/partyRules.ts), copied; the parity test holds the two together ────────────────
export const PARTY_STEMS: readonly string[] = [
  'fuck', 'fuk', 'fck', 'motherf', 'shit', 'sht', 'bitch', 'cunt', 'asshole', 'bastard', 'whore', 'slut', 'twat',
  'wank', 'pussy', 'dickhead', 'cocksuck', 'nigg', 'faggot', 'retard', 'tranny', 'wetback', 'raghead', 'towelhead',
];
export const PARTY_WORDS: readonly string[] = [
  'ass', 'asses', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'jizz', 'fag', 'fags', 'chink', 'chinks', 'spic',
  'spics', 'kike', 'kikes', 'gook', 'gooks', 'coon', 'coons', 'dyke', 'dykes', 'beaner', 'beaners', 'nazi', 'rape',
  'rapist', 'kys',
];
export const PARTY_ALLOW: readonly string[] = ['niggle', 'niggles', 'niggling', 'shitake', 'shiitake'];

/** Slurs among the list (reported as `slur`, the rest as `profanity`). */
const SLURS = new Set([
  'nigg', 'faggot', 'retard', 'tranny', 'wetback', 'raghead', 'towelhead', 'fag', 'fags', 'chink', 'chinks', 'spic', 'spics',
  'kike', 'kikes', 'gook', 'gooks', 'coon', 'coons', 'dyke', 'dykes', 'beaner', 'beaners', 'nazi',
]);

/** Additions beyond the party list (new): whole words only. */
const EXTRA_WORDS: readonly string[] = ['nigga', 'niggas', 'kms', 'stfu', 'gtfo', 'milf', 'porn', 'nudes', 'boobs', 'tits', 'horny'];
/** More real words a stem would catch (new): the Scunthorpe set. */
const EXTRA_ALLOW: readonly string[] = [
  'shitakes', 'fuchsia', 'cockpit', 'cockpits', 'cockatoo', 'cockatoos', 'cocktail', 'cocktails', 'cockerel', 'peacock',
  'hancock', 'shuttlecock', 'whoreson',
];

const STEMS = PARTY_STEMS;
const WORDS = new Set([...PARTY_WORDS, ...EXTRA_WORDS]);
const ALLOW = new Set([...PARTY_ALLOW, ...EXTRA_ALLOW]);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'l' };

/** One word, folded: NFKC, diacritics off, lower case, look-alikes mapped, anything else out. */
export function foldWord(w: string): string {
  const base = w.normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFKC').toLowerCase();
  return [...base].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
}
const collapse = (w: string): string => w.replace(/(.)\1+/g, '$1');
const STEMS_C = STEMS.map(collapse);
const WORDS_C = new Set([...WORDS].map(collapse));

/** The list entry a word matches, or null. */
function listHit(word: string): string | null {
  const f = foldWord(word);
  if (!f || ALLOW.has(f)) return null;
  const c = collapse(f);
  if (ALLOW.has(c)) return null;
  const stem = STEMS.find((s) => f.startsWith(s)) ?? STEMS_C.find((s) => c.startsWith(s));
  if (stem) return stem;
  if (WORDS.has(f)) return f;
  // the collapsed form only for a word STRETCHED on purpose (a run of three or more: "asssss"): collapsing a plain word
  // turns "as" into "ass"'s collapse, "assess" into "asses"'s and "cons" into "coons"'s (netd's own matcher does that —
  // docs/TEEN-SAFE-AUDIT.md)
  if (/(.)\1\1/.test(f) && WORDS_C.has(c)) return c;
  return null;
}

/** Is this one word on the list? (netd's isProfane, plus the additions above.) */
export function isListedWord(word: string): boolean {
  return listHit(word) !== null;
}

// a "word" includes the look-alike characters, so "sh1t" and "@ss" are one word
const WORD_RE = /[\p{L}\p{N}@$!|]+/gu;
// three or more single letters/look-alikes split by spaces, dots, dashes, underscores or stars: "f u c k", "s.h.i.t"
const SPACED_RE = /(?:^|(?<=[\s(]))(?:[\p{L}0-9@$!|][\s._*-]{1,3}){2,}[\p{L}0-9@$!|](?=$|[\s.,!?)])/gu;

interface Pattern { kind: ScreenKind; re: RegExp }
// Line patterns, run over a lower-cased, look-alike-folded copy with the same offsets (no characters added or removed).
const PATTERNS: readonly Pattern[] = [
  // not "hurt yourself" / "cut": "don't hurt yourself" is a trainer's safety line
  { kind: 'self_harm', re: /\b(kill|hang) (yo)?ur ?self\b|\bkys\b|\bkms\b|\bgo (and )?die\b|\b(you|u) should (just )?die\b|\bdrink bleach\b|\bnobody would miss (you|u)\b|\bend (yo)?ur life\b/ },
  // not "beat you" / "shoot you" / "watch your back": trash talk, "I'll shoot you a text" and a footwork cue
  { kind: 'threat', re: /\b(i('?m| am)?|we('?re| are)?) (gonna|going to|will|'?ll) (kill|murder|stab|hurt) (you|u|ya)\b|\bi know where (you|u) live\b/ },
  // not bare "sex": "sex differences in ACL rates" is a coaching sentence
  { kind: 'sexual', re: /\bsend (me )?(nudes?|pics?|a pic|photos?|a photo|noods)\b|\b(nudes|noods)\b|\bsex(y|ting)\b|\b(show|send) me (yo)?ur (body|bod)\b|\bare (you|u) a virgin\b/ },
  { kind: 'contact', re: /\b(add|dm|text|call|hmu|message|msg|find|follow) me (on|at|@)\b|\b(my|whats (yo)?ur|what'?s (yo)?ur) (snap|snapchat|insta|ig|discord|whatsapp|kik|telegram|number|phone|cell|addy|address)\b|\bhow old (are|r) (you|u)\b|\b(meet|meet up|link up|hang out) (irl|in person|in real life)\b|\bwhere do (you|u) live\b/ },
];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// a phone number shape: ten or more digits with spaces, dots, dashes or brackets between them (a date, 2026-10-25, has
// eight and passes), or a local ddd-dddd
const PHONE_RE = /(?:\+?\d[\s().-]{0,2}){9,}\d|\b\d{3}[-.]\d{4}\b/g;
const HANDLE_RE = /(?:^|\s)@[a-z0-9_.]{3,30}\b/gi;

/** The line, lower-cased with look-alikes mapped, SAME LENGTH as the original (so offsets carry over). */
function foldLine(text: string): string {
  return [...text].map((ch) => {
    const lower = ch.toLowerCase();
    const plain = lower.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const one = plain.length === 1 ? plain : lower.length === 1 ? lower : ch;
    return LEET[one] ?? one;
  }).join('').padEnd(text.length).slice(0, text.length);
}

/**
 * Every hit in a piece of typed text, in reading order (empty = it passes). `contact` hits (a phone number, an email,
 * "add me on snap") are always reported: whether a field allows them is the caller's (none of FEL's social fields do).
 */
export function screenAbuse(text: string): ScreenHit[] {
  if (typeof text !== 'string' || !text) return [];
  const hits: ScreenHit[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const hit = listHit(m[0]);
    if (hit) hits.push({ kind: SLURS.has(hit) || [...SLURS].some((s) => hit.startsWith(s)) ? 'slur' : 'profanity', found: m[0], at: m.index ?? 0 });
  }
  for (const m of text.matchAll(SPACED_RE)) {
    const joined = m[0].replace(/[\s._*-]/g, '');
    const hit = listHit(joined);
    if (hit) hits.push({ kind: SLURS.has(hit) ? 'slur' : 'profanity', found: m[0], at: m.index ?? 0 });
  }
  const folded = foldLine(text);
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, 'g');
    for (const m of folded.matchAll(re)) hits.push({ kind: p.kind, found: text.slice(m.index ?? 0, (m.index ?? 0) + m[0].length), at: m.index ?? 0 });
  }
  for (const re of [EMAIL_RE, PHONE_RE, HANDLE_RE]) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      const at = (m.index ?? 0) + (m[0].length - m[0].trimStart().length);
      hits.push({ kind: 'contact', found: m[0].trim(), at });
    }
  }
  // one hit per spot: the longest at the same offset, and nothing inside another hit
  return hits
    .sort((a, b) => a.at - b.at || b.found.length - a.found.length || RANK[a.kind] - RANK[b.kind])
    .filter((h, i, arr) => !arr.some((o, j) => j < i && o.at <= h.at && o.at + o.found.length >= h.at + h.found.length));
}

/** At the same spot, the more specific kind is the one reported ("kys" is self-harm before it is profanity). */
const RANK: Record<ScreenKind, number> = { self_harm: 0, threat: 1, sexual: 2, slur: 3, profanity: 4, contact: 5 };

/** Does this text pass? */
export function passesScreen(text: string): boolean {
  return screenAbuse(text).length === 0;
}

/** For relayed chat only: every hit replaced by asterisks of the same length. Stored fields are refused, not masked. */
export function maskForDisplay(text: string): string {
  let out = text;
  for (const h of screenAbuse(text)) out = out.slice(0, h.at) + '*'.repeat(h.found.length) + out.slice(h.at + h.found.length);
  return out;
}

/** Free text as a field stores it: control characters out, whitespace folded, capped. Null = nothing left. */
export function cleanTyped(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** The line a person reads when a field is refused (product copy; it names what tripped, never lectures). */
export function screenRefusal(hits: readonly ScreenHit[]): string | null {
  if (!hits.length) return null;
  if (hits.some((h) => h.kind === 'contact')) return 'Take out the contact details: phone numbers, emails and handles stay off FEL.';
  return 'Some of that can’t go on FEL. Take it out and try again.';
}
