// IMPROVE (2026-10-06) — the 1v1's pure rules (onevoneRules): the tier knobs, the win condition and what it can post, the
// contextual hint, the release pips and the box score line.
import { describe, it, expect, vi } from 'vitest';
import {
  ONEVONE_TIER, attackerPatience, winRule, gameWinner, onePointAway, postedMax, winBy2Requested, winBy2Offered, readWinBy2Pick, writeWinBy2Pick, WIN_BY_2_KEY, WIN_BY_2_CAP,
  hintFor, hintSwap, HINT_DWELL_SEC, HINT_PAINT, CONTROLS_OFFENCE, CONTROLS_DEFENCE, type HintState,
  pushPip, pipBias, PIP_COUNT, boxLine, emptyBox,
} from './onevoneRules';
import { TIERS } from '../core/Difficulty';
import { SCORE_CEILINGS, SESSION_RULES_CEILINGS, checkStakeScore } from '@/lib/arena-score-integrity';
import { rulesMaxFor, checkRunScore } from '@/lib/sessions/modeScoreRules';

describe('#2 the OPPONENT pick reaches the rival', () => {
  it('every shared tier has knobs; PRO is the game as tuned (0.7, ×1) and the ladder climbs both ways', () => {
    for (const t of TIERS) expect(ONEVONE_TIER[t], t).toBeDefined();
    expect(ONEVONE_TIER.pro).toEqual({ defenderAggression: 0.7, attackerAggression: 1 });
    expect(ONEVONE_TIER.rookie.defenderAggression).toBeLessThan(ONEVONE_TIER.pro.defenderAggression);
    expect(ONEVONE_TIER.elite.defenderAggression).toBeGreaterThan(ONEVONE_TIER.pro.defenderAggression);
    expect(ONEVONE_TIER.rookie.attackerAggression).toBeLessThan(1);
    expect(ONEVONE_TIER.elite.attackerAggression).toBeGreaterThan(1);
  });
  it('patience at PRO is the old 1 / max(0.5, aggression); a rookie waits longer, an elite forces it sooner', () => {
    for (const a of [0.3, 0.5, 0.8, 1, 1.4]) expect(attackerPatience(a, ONEVONE_TIER.pro)).toBeCloseTo(1 / Math.max(0.5, a), 12);
    expect(attackerPatience(1, ONEVONE_TIER.rookie)).toBeGreaterThan(attackerPatience(1, ONEVONE_TIER.pro));
    expect(attackerPatience(1, ONEVONE_TIER.elite)).toBeLessThan(attackerPatience(1, ONEVONE_TIER.pro));
  });
});

describe('#3 the win condition', () => {
  const to11 = winRule(11, false), by2 = winRule(11, true);
  it('first to 11 is exactly `score >= 11` (mine read first)', () => {
    expect(gameWinner(10, 10, to11)).toBeNull();
    expect(gameWinner(11, 10, to11)).toBe('me');
    expect(gameWinner(13, 4, to11)).toBe('me');
    expect(gameWinner(9, 12, to11)).toBe('foe');
  });
  it('win by 2: 11–10 plays on, 12–10 ends; the cap ends it whatever the margin', () => {
    expect(gameWinner(11, 10, by2)).toBeNull();
    expect(gameWinner(12, 11, by2)).toBeNull();
    expect(gameWinner(12, 10, by2)).toBe('me');
    expect(gameWinner(10, 13, by2)).toBe('foe');
    expect(gameWinner(WIN_BY_2_CAP, 14, by2)).toBe('me');
    expect(gameWinner(14, WIN_BY_2_CAP + 1, by2)).toBe('foe');
  });
  it('game point is one two away: 9 under first to 11, as the MC always called it', () => {
    expect(onePointAway(9, 0, to11)).toBe(true);
    expect(onePointAway(8, 0, to11)).toBe(false);
    expect(onePointAway(10, 10, by2)).toBe(true);   // 12–10
    expect(onePointAway(11, 11, by2)).toBe(true);   // 13–11: two up
    expect(onePointAway(9, 10, by2)).toBe(false);   // 11–10 plays on
  });
  it('what a won game can post — first to 11 fits the stake ceiling; win-by-2 fits only the session ceiling (owner 2026-10-06)', () => {
    const stake = SCORE_CEILINGS.hoops1v1.max;
    expect(postedMax(to11)).toBe(stake);
    expect(postedMax(by2)).toBeGreaterThan(stake);                      // why it is never offered on a staked run
    expect(postedMax(by2)).toBe(SESSION_RULES_CEILINGS.hoops1v1.max);   // 17: a session takes it
    expect(rulesMaxFor('hoops1v1', { killSwitch: false })).toBe(postedMax(by2));
    expect(checkRunScore({ mode: 'hoops1v1', score: postedMax(by2), durationMs: 5 * 60_000 }).ok).toBe(true);
    expect(checkRunScore({ mode: 'hoops1v1', score: postedMax(by2) + 1, durationMs: 5 * 60_000 }).ok).toBe(false);
    expect(checkStakeScore({ mode: 'hoops1v1', score: postedMax(to11) }).ok).toBe(true);
    expect(checkStakeScore({ mode: 'hoops1v1', score: postedMax(to11) + 1 }).ok).toBe(false);   // a stake still reads 13
  });
  it('win-by-2 is a player pick, off by default; the dev seam stays; never on a staked or head-to-head run', () => {
    expect(winBy2Requested('', { picked: false, dev: false })).toBe(false);          // the default: first to 11
    expect(winBy2Requested('', { picked: false, dev: true })).toBe(false);
    expect(winBy2Requested('', { picked: true, dev: false })).toBe(true);            // the READY screen's pick, in production
    expect(winBy2Requested('?winby2=1', { picked: false, dev: true })).toBe(true);   // the dev seam
    expect(winBy2Requested('?winby2=1', { picked: false, dev: false })).toBe(false);
    for (const q of ['?arena=abc', '?mp=XYZ', '?c=code', '?winby2=1&arena=abc']) {
      expect(winBy2Offered(q), q).toBe(false);
      expect(winBy2Requested(q, { picked: true, dev: true }), q).toBe(false);
    }
    expect(winBy2Offered('?tier=elite')).toBe(true);
  });
  it('the pick is remembered on this device, and reads off when storage is empty or throws', () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    vi.stubGlobal('window', { localStorage: ls });
    try {
      expect(readWinBy2Pick()).toBe(false);
      writeWinBy2Pick(true); expect(store.get(WIN_BY_2_KEY)).toBe('1'); expect(readWinBy2Pick()).toBe(true);
      writeWinBy2Pick(false); expect(store.has(WIN_BY_2_KEY)).toBe(false); expect(readWinBy2Pick()).toBe(false);
      vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('blocked'); } } });
      expect(readWinBy2Pick()).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('#1 one line for the state you are in', () => {
  const base: HintState = { possession: 'mine', loose: false, shooting: false, dunking: false, showtime: false, posting: false, carrying: true, set: false, nearRim: false, paintWarn: false, defPhase: 'over', gathering: false };
  it('each state has its line, and every line is one short line', () => {
    const lines = [
      hintFor(base), hintFor({ ...base, set: true }), hintFor({ ...base, nearRim: true }), hintFor({ ...base, posting: true }),
      hintFor({ ...base, shooting: true }), hintFor({ ...base, dunking: true }), hintFor({ ...base, dunking: true, showtime: true }),
      hintFor({ ...base, carrying: false }), hintFor({ ...base, paintWarn: true }),
      hintFor({ ...base, possession: 'defense', defPhase: 'drive' }), hintFor({ ...base, possession: 'defense', defPhase: 'drive', gathering: true }),
      hintFor({ ...base, possession: 'defense', defPhase: 'shot' }), hintFor({ ...base, possession: 'defense', loose: true }),
    ];
    expect(new Set(lines).size).toBe(lines.length);
    for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(90);
    expect(CONTROLS_OFFENCE.length).toBeGreaterThan(800);   // the full list still exists — for the pause screen
    expect(CONTROLS_DEFENCE).toMatch(/TAKE THE CHARGE/);
  });
  it('the ref outranks the dribble; the flight outranks the meter', () => {
    expect(hintFor({ ...base, paintWarn: true, set: true })).toBe(HINT_PAINT);
    expect(hintFor({ ...base, shooting: true, nearRim: true })).toMatch(/GREEN/);
    expect(hintFor({ ...base, possession: 'defense', defPhase: 'drive', gathering: true })).toMatch(/BLOCK/);
  });
  it('a calm line waits out the dwell; an urgent one or a new possession does not', () => {
    const calm = hintFor({ ...base, set: true }), move = hintFor(base);
    expect(hintSwap(move, calm, 0.1, false)).toBe(false);
    expect(hintSwap(move, calm, HINT_DWELL_SEC, false)).toBe(true);
    expect(hintSwap(move, HINT_PAINT, 0, false)).toBe(true);
    expect(hintSwap(move, calm, 0, true)).toBe(true);
    expect(hintSwap('', calm, 0, false)).toBe(true);
    expect(hintSwap(calm, calm, 9, true)).toBe(false);
  });
});

describe('#10 the release pips', () => {
  it('keep the last five graded releases, oldest first; a held meter is not a pip', () => {
    let p = '';
    for (const q of ['perfect', 'good', 'early', 'late', 'brick', 'held', 'early']) p = pushPip(p, q);
    expect(p).toBe('gelbe');
    expect(p.length).toBe(PIP_COUNT);
  });
  it('read a lean once there are three to read', () => {
    expect(pipBias('ee')).toBe('');
    expect(pipBias('eeg')).toBe('EARLY');
    expect(pipBias('lbg')).toBe('LATE');
    expect(pipBias('elg')).toBe('');
  });
});

describe('#4 the box score line', () => {
  it('always the FG, then only what happened', () => {
    expect(boxLine(emptyBox())).toBe('FG 0/0');
    expect(boxLine({ fgm: 7, fga: 12, threes: 2, steals: 3, blocks: 1, ankles: 2 })).toBe('FG 7/12 · 3PT 2 · STL 3 · BLK 1 · ANKLES 2');
    expect(boxLine({ fgm: 5, fga: 9, blocks: 2 })).toBe('FG 5/9 · BLK 2');
  });
});
