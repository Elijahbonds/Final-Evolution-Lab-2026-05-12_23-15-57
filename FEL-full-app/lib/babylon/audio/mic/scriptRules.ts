// THE MIC's script rules (2026-09-24): what every line has to pass before it is voiced. Shared by the merge script
// (scripts/mic/merge-drafts.mts) and the tests over the shipped scripts, so a hand edit is held to the same bar as a draft.
//
// Owner decision: clean streetball. Also: the cast are ORIGINAL characters, so no real person's catchphrase; the player may be
// anyone, so nobody but the speaker gets a gendered pronoun; and a text-to-speech voice reads every line, so no digits, no
// all-caps words and no stage directions.

import { COACH_MOMENTS, CROWD_MOMENTS, MOMENTS, PLAYER_MOMENTS, TIER_COUNTS, momentSpec } from './moments';

export interface ScriptLine { id?: string; moment: string; text: string; tier?: 0 | 1 | 2; tags?: string[] }
export interface ScriptFile { cast: string; lines: ScriptLine[] }

// minced oaths a kids' camp says out loud (dang, heck, gosh) pass; "oh my god" does not
const PROFANE = /\b(damn|damned|hell|crap|crappy|sucks?|sucked|pissed|piss|ass|asses|butt|butts|bs|screw(ed)?|freaking|frickin|friggin|wtf|omg|god)\b/i;
// "dead heat", "dead centre" and "deadeye" are basketball words; "execute" and "bury a three" are too
const VIOLENT = /\b(kill|killed|killing|killer|murder(ed)?|dead(?![- ]?(heat|cent|on\b|eye))|die|died|dying|destroy(ed|s)?|slaughter(ed)?|assassin|weapon|guns?)\b/i;
const GENDERED = /\b(he|him|his|himself|he's|she|her|hers|herself|she's|he'll|she'll|he'd|she'd)\b/i;
const BORROWED = /\b(boomshakalaka|boom shakalaka|kaboom|weak stuff|mouthpiece|and1|and one mixtape|nba|nike|adidas|jordan|lebron|kobe|shaq|mutombo)\b/i;
const ALLCAPS = /\b(?!MC\b)[A-Z]{2,}\b/;

export interface LintIssue { moment: string; text: string; why: string }

export function wordCount(s: string): number { return s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length; }

export function maxWordsFor(moment: string): number | null {
  const m = momentSpec(moment); if (m) return m.maxWords;
  const c = CROWD_MOMENTS.find((x) => x.id === moment); if (c) return c.maxWords;
  const p = PLAYER_MOMENTS.find((x) => x.id === moment); if (p) return p.maxWords;
  const c2 = COACH_MOMENTS.find((x) => x.id === moment); if (c2) return c2.maxWords;
  return null;
}

/** What is wrong with a line (empty = it passes). */
export function lintLine(l: ScriptLine): string[] {
  const why: string[] = [];
  const t = l.text.trim();
  if (!t) why.push('empty');
  if (/\d/.test(t)) why.push('digits');
  if (ALLCAPS.test(t)) why.push('all-caps word');
  if (/[[\]{}<>*#@_~|\\]|\(|\)/.test(t)) why.push('stage direction or markup');
  if (PROFANE.test(t)) why.push('profanity');
  if (VIOLENT.test(t)) why.push('violence');
  if (GENDERED.test(t)) why.push('gendered pronoun');
  if (BORROWED.test(t)) why.push('real name or borrowed catchphrase');
  if (/\b(cass|ty|pilot|zo|stack)\b/i.test(t) && !l.tags?.some((x) => x.startsWith('rival:')) && l.moment !== 'name' && !/^player\./.test(l.moment)) {
    // a rival named in a line that is not about that rival (Stack/Pilot are also plain words: only flag the capitalised name)
    if (/\b(Cass|Ty|Pilot|Zo|Stack)\b/.test(t)) why.push('rival named in an untagged line');
  }
  const max = maxWordsFor(l.moment);
  if (max !== null && wordCount(t) > max) why.push(`over ${max} words (${wordCount(t)})`);
  if (l.moment !== 'name' && max === null) why.push(`unknown moment ${l.moment}`);
  const spec = momentSpec(l.moment);
  if (l.tags?.length && spec && !l.tags.every((x) => spec.tags?.includes(x) || spec.optionalTags?.includes(x))) why.push(`tag not in ${l.moment}`);
  if (l.tier !== undefined && !spec?.tiered) why.push('tier on an untiered moment');
  return why;
}

/** How many lines a cast member owes each moment (role: 'mc' | 'side'). */
export function requiredCounts(role: 'mc' | 'side'): Map<string, number> {
  const req = new Map<string, number>();
  for (const m of MOMENTS) {
    const key = (tier?: number, tag?: string) => `${m.id}|${tier ?? ''}|${tag ?? ''}`;
    if (m.tiered) {
      const tc = TIER_COUNTS[m.id];
      [0, 1, 2].forEach((t) => { const n = role === 'mc' ? tc.mc[t] : tc.side[t]; if (n) req.set(key(t), n); });
      continue;
    }
    const n = role === 'mc' ? m.mc : (m.side ?? 0);
    if (n) req.set(key(), n);
    if (role === 'mc') for (const tag of m.tags ?? []) req.set(key(undefined, tag), 1);
  }
  return req;
}
export function countsOf(file: ScriptFile): Map<string, number> {
  const got = new Map<string, number>();
  for (const l of file.lines) {
    // an OPTIONAL tag (a line only true in that case) still counts toward the moment's untagged lines
    const required = l.tags?.length === 1 && momentSpec(l.moment)?.tags?.includes(l.tags[0]) ? l.tags[0] : '';
    const k = `${l.moment}|${l.tier ?? ''}|${required}`;
    got.set(k, (got.get(k) ?? 0) + 1);
  }
  return got;
}
/** Moments (and tiers/tags) a script is short of: "dunk.make|2|: 7 of 10". */
export function shortfalls(file: ScriptFile, role: 'mc' | 'side'): string[] {
  const got = countsOf(file), out: string[] = [];
  for (const [k, n] of requiredCounts(role)) if ((got.get(k) ?? 0) < n) out.push(`${k}: ${got.get(k) ?? 0} of ${n}`);
  return out;
}

/** A stable id from the line's slot: 'dunk.make.t2.03', 'dunk.rival.intro.cass.01', 'crowd.hype.02'. */
export function lineId(l: ScriptLine, n: number): string {
  const tier = l.tier !== undefined ? `.t${l.tier}` : '';
  const tag = l.tags?.length ? `.${l.tags.map((t) => t.split(':')[1] ?? t).join('+')}` : '';
  return `${l.moment}${tier}${tag}.${String(n).padStart(2, '0')}`;
}
