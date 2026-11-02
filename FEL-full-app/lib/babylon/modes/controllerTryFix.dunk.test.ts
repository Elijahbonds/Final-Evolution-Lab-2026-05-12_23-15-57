// CONTROLLER-TRY-FIX (2026-10-28), the mode side: C3, the SHORT OF THE IRON verdict (CT-16 … CT-19, plus the night advice), and item 5
// (C6), the night report into the card (CT-13). New tests only; #493's dunkLiveTiming tests and every pinned line are untouched.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BLOOPER_LINES, bloopLine, type MissKind } from '../core/DunkRunItBack';
import { emptyCard, addAttempt, nightReport, SHORT_MISS_ADVICE, type DunkCard } from '@/lib/mp/dunkCard';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };
const count = (s: string, needle: string): number => s.split(needle).length - 1;

describe('CT-16 — missWhy says SHORT OF THE IRON first of the verdicts: after the named tricks, before the late line and the pinned line', () => {
  it('order: named < short < late < pinned; the copy is the branch\'s own', () => {
    const w = fn('missWhy');
    const named = w.indexOf('const named = namedTricks();');
    const short = w.indexOf("if (shortOfIron) { const s = 'SHORT OF THE IRON'; return named ? `${named} · ${s}` : s; }");
    const late = w.indexOf("if (slamTiming?.zone === 'late')");
    const pinned = w.indexOf("const why = slamSeen ? 'THREW IT AT THE IRON TOO EARLY' : 'NO SLAM';");
    expect(named).toBeGreaterThan(0);
    expect(short).toBeGreaterThan(named);
    expect(late).toBeGreaterThan(short);
    expect(pinned).toBeGreaterThan(late);
    expect(DUNK).toContain("flash(ctx, 'SHORT OF THE IRON', 900);");   // the same words the branch flashes
    expect(fn('resolveDunk')).toContain('if (!qteHit) flash(ctx, `${missWhy()} — MISSED`);');   // → SHORT OF THE IRON — MISSED
  });
});

describe('CT-17 — missKind: short after the lob, before the late line and the pinned return', () => {
  it('order', () => {
    const k = fn('missKind');
    const lob = k.indexOf("if (lob.live || lob.lost) return 'lob';");
    const short = k.indexOf("if (shortOfIron) return 'short';");
    const late = k.indexOf("if (slamTiming?.zone === 'late') return 'late';");
    const ret = k.indexOf("return slamSeen ? 'early' : 'noSlam';");
    expect(lob).toBeGreaterThan(0);
    expect(short).toBeGreaterThan(lob);
    expect(late).toBeGreaterThan(short);
    expect(ret).toBeGreaterThan(late);
  });
});

describe('CT-18 — the flag: set beside qteHit = false in the short branch only, cleared with qteHit on every attempt', () => {
  it('one set, on the short branch\'s own statement line; two resets beside the qteHit resets', () => {
    expect(count(DUNK, 'shortOfIron = true')).toBe(1);
    expect(DUNK).toContain('shortOfIron = true; qteHit = false; jamSec = -1; sinceRelease = 0; dropToFloor = true;');
    const branch = DUNK.slice(DUNK.indexOf("} else if (ironStep?.kind === 'short') {"), DUNK.indexOf('} else { jamPrevBall.copyFrom(bp); jamPrevLive = true; }'));
    expect(branch).toContain('shortOfIron = true;');
    expect(count(DUNK, 'shortOfIron = false')).toBe(3);   // the declaration's `let … = false` and the two per-attempt resets
    expect(fn('launchDunk')).toContain('clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; shortOfIron = false;');
    expect(DUNK).toContain('charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; shortOfIron = false; rimCamCut = false;');
  });
  it('no new input read (K-DNP7\'s counts are not touched by this change)', () => {
    expect(DUNK.match(/shortOfIron[^\n]*e\.(btn|t) ===/g)).toBeNull();
  });
});

describe('CT-19 — the booth calls a short miss with the iron lines: no lines of its own', () => {
  it('short shares early\'s lines; two in a row never the same', () => {
    expect(BLOOPER_LINES.short).toBe(BLOOPER_LINES.early);
    expect(BLOOPER_LINES.short).toBe(BLOOPER_LINES.late);
    for (const l of BLOOPER_LINES.short) expect(l).toBe(l.toUpperCase());
    for (let n = 0; n < 9; n++) expect(bloopLine('short' as MissKind, n)).not.toBe(bloopLine('short', n + 1));
  });
});

const att = (made: boolean, exec = made ? 8 : 0, total = made ? 44 : 30) => ({ round: 1, style: 'POWER', prop: 'NO PROP', finish: 'x', label: made ? 'EASTBAY' : 'BLOWN', judges: [total / 3, total / 3, total / 3], total, made, exec, diff: 6, look: 6 });
const cardOf = (xs: ReturnType<typeof att>[]): DunkCard => xs.reduce((c, a) => addAttempt(c, a as Parameters<typeof addAttempt>[1]), emptyCard());

describe('CT-21 — the night advice: a night whose misses mostly came up short says so; nothing else changes', () => {
  it('the copy', () => {
    expect(SHORT_MISS_ADVICE).toBe('Clean slam — you came up short. Carry more speed into the plant.');
  });
  it('short ≥ half the misses → the short advice; fewer, or none, or no opts → exactly what it said before', () => {
    const night = cardOf([att(false), att(false), att(true)]);
    const before = nightReport(night);
    expect(nightReport(night, { shortMisses: 1 }).advice).toBe(SHORT_MISS_ADVICE);
    expect(nightReport(night, { shortMisses: 2 }).advice).toBe(SHORT_MISS_ADVICE);
    expect(nightReport(night, { shortMisses: 0 })).toEqual(before);
    expect(nightReport(night, {})).toEqual(before);
    const four = cardOf([att(false), att(false), att(false), att(false), att(true)]);
    expect(nightReport(four, { shortMisses: 1 }).advice).toBe(nightReport(four).advice);   // 1 of 4: the timing is still the lever
    expect(nightReport(four, { shortMisses: 9 }).advice).toBe(SHORT_MISS_ADVICE);           // clamped to the card's misses
    const clean = cardOf([att(true), att(true)]);
    expect(nightReport(clean, { shortMisses: 3 })).toEqual(nightReport(clean));            // no misses on the card: nothing to say
  });
  it('the mode counts a scored short miss and hands it over; GO AGAIN clears it', () => {
    expect(DUNK).toContain('if (shortOfIron) nightShort++;');
    const scored = DUNK.indexOf('playerTotal += missTotal; misses++; playerCards.push(missTotal);');
    const counted = DUNK.indexOf('if (shortOfIron) nightShort++;');
    expect(counted).toBeGreaterThan(DUNK.indexOf('card = addAttempt(card, {', scored));   // after the card's own line (the drift guard keeps those two adjacent)
    expect(counted).toBeLessThan(DUNK.indexOf("if (turn === 'rival') rivalScored = true;", scored));   // still inside the player's scored-miss branch
    expect(DUNK).toContain('const report = nightReport(card, { shortMisses: nightShort });');
    expect(fn('goAgain')).toContain('nightShort = 0;');
  });
});

describe('CT-13 — the night report is on the card, not the banner channel', () => {
  it('showNightCard no longer flashes report.headline; it sets nightReport inside the same contestOver guard; GO AGAIN clears it', () => {
    const show = fn('showNightCard');
    expect(show).not.toMatch(/flash\(ctx, `\$\{report\.headline\}/);
    expect(show).toContain("later(() => { if (phase === 'contestOver') ctx.setHud({ nightReport: `${report.headline} — ${report.advice}` }); }, 1400);");
    expect(DUNK).not.toMatch(/flash\(ctx, `\$\{report\.headline\}/);
    expect(fn('goAgain')).toContain("nightCard: null, nightReport: '',");
  });
});
