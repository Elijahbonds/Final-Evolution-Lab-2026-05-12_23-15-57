// freeDance.test.ts — lane/dance-extras-2 (owner 2026-10-24): FREE DANCE, the Cypher with its judge off.
//   1. the pure decisions (freeDance.ts): where it is offered, what a press dances, what the run reports, the band in full;
//   2. the server reads the room's run the way the room writes it (lib/session-payout.ts isFreeDanceSession: one stats key, unpaid);
//   3. the room (DanceMode.ts, a closure that needs the whole scene, so held by its source like dancePadWiring / danceFreestyleWiring):
//      free dance never reaches the judge, ends with score 0 and the free stats, is switched only where it is offered, and leaves the
//      judged path exactly as it was. The route's half (recorded unpaid, no GameSession row, a scored post refused) is in
//      lib/sessions-route.test.ts ("FREE DANCE").
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FelInput } from '../core/InputBus';
import { danceTap } from '../audio/SongClock';
import { nextStemLevel } from '../audio/StemBand';
import { FEEL_BLOCK_PARAMS } from '@/lib/feel-panel/sessionGate';
import {
  FREE_DANCE_STAT as SERVER_STAT, isFreeDanceSession, sessionAccuracy, sessionPayout, sessionXp, sessionShards, isEndlessSession,
} from '@/lib/session-payout';
import { isStakingPaused } from '@/lib/stakingPause';
import {
  FREE_DANCE_OUTCOME, FREE_DANCE_SCORE, FREE_DANCE_STAT, fillBand, freeDanceBlock, freeDanceHeadline, freeDanceSlot, freeDanceStats,
  isFreeDanceResult, pickControls,
} from './freeDance';
import { DEFAULT_PAD_STATE, FREE_DANCE_LABEL, padButtons, type DancePadState } from './ui/padModel';

const press = (btn: 'A' | 'B' | 'X' | 'Y', pressed = true): FelInput => ({ t: 'button', btn, pressed });
const mode = fs.readFileSync(path.join(__dirname, '../modes/DanceMode.ts'), 'utf8');
const bodyOf = (src: string, start: string, end: string): string => { const a = src.indexOf(start); expect(a, start).toBeGreaterThan(-1); return src.slice(a, src.indexOf(end, a)); };

describe('where free dance is offered: free play only', () => {
  it('a plain page, a deep link to a track, a playtest run: offered', () => {
    for (const q of [null, '', '?track=cypher', 'track=battle&level=hard', '?playtest=1', '?camera=still']) expect(freeDanceBlock(q), String(q)).toBeNull();
  });
  it('never in a session someone else\'s score meets — every key the feel panel blocks (an Arena duel, a challenge, the ladder…)', () => {
    for (const [key] of FEEL_BLOCK_PARAMS) {
      expect(freeDanceBlock(`?${key}=x`), key).toBe(key);
      expect(freeDanceBlock(`?track=cypher&${key}=`), `${key} empty`).toBe(key);   // present at all blocks (fails closed)
    }
    expect(FEEL_BLOCK_PARAMS.map(([k]) => k)).toEqual(expect.arrayContaining(['arena', 'mp', 'c', 'signature', 'story', 'carnival', 'net', 'party', 'ranked', 'agent']));
  });
  it('dance staking stays paused, untouched (free dance is no way into a stake)', () => {
    expect(isStakingPaused('dance')).toBe(true);
  });
});

describe('a free-dance press is a move', () => {
  it('each face button dances its own move; a trigger pull or SPACE (a tap) is an A; a release or a d-pad is not a move', () => {
    for (const b of ['A', 'B', 'X', 'Y'] as const) expect(freeDanceSlot(press(b), danceTap('up', press(b)).tap)).toBe(b);
    for (const b of ['A', 'B', 'X', 'Y'] as const) expect(freeDanceSlot(press(b, false), false)).toBeNull();
    const pull: FelInput = { t: 'trigger', side: 'R', value: 0.9 };
    expect(freeDanceSlot(pull, danceTap('up', pull).tap)).toBe('A');
    expect(freeDanceSlot({ t: 'dpad', dir: 'up', pressed: true }, false)).toBeNull();
  });
});

describe('what a free-dance run reports, and how the server reads it', () => {
  const stats = freeDanceStats({ moves: 12.7, bpm: 96, difficulty: 2 });
  it('score 0, never a win, and no judge counts at all — no hits, rounds, stars, accuracy or grades', () => {
    expect(FREE_DANCE_SCORE).toBe(0);
    expect(FREE_DANCE_OUTCOME).not.toBe('GREAT');   // the timing host reads GREAT as won
    expect(stats).toEqual({ freeDance: 1, endless: 1, moves: 12, bpm: 96, difficulty: 2 });
    for (const k of ['hits', 'rounds', 'stars', 'accuracy', 'perfect', 'great', 'good', 'miss', 'maxCombo', 'style', 'fullCombo']) expect(stats, k).not.toHaveProperty(k);
  });
  it('the room and the server name the flag alike, and the server takes the room\'s stats as a free-dance run — in the dance room only', () => {
    expect(FREE_DANCE_STAT).toBe(SERVER_STAT);
    expect(isFreeDanceSession('dance', stats)).toBe(true);
    expect(isFreeDanceSession('dance', { endless: true })).toBe(true);
    expect(isFreeDanceSession('dance', { perfect: 3, miss: 1 })).toBe(false);
    expect(isFreeDanceSession('dance', null)).toBe(false);
    expect(isFreeDanceSession('music', stats)).toBe(false);
    expect(isFreeDanceResult({ stats })).toBe(true);
    expect(isFreeDanceResult({ stats: { hits: 3 } })).toBe(false);
    expect(isFreeDanceResult(null)).toBe(false);
  });
  it('nothing in it trains PRQ: a free run\'s accuracy is nobody\'s (even with forged counts beside the flag)', () => {
    expect(sessionAccuracy('dance', { ...stats, perfect: 40, miss: 0 }, 150)).toBeNull();
    expect(sessionAccuracy('dance', { perfect: 40, miss: 0 }, 150)).toBe(1);   // a judged run's is read as before
  });
  it('had it been paid by the payout formula at all, the floor is the most it could reach: 10 XP, 1 shard (the route pays it nothing)', () => {
    const p = sessionPayout({ score: FREE_DANCE_SCORE, won: false, endless: isEndlessSession('dance', stats, 150), durationSec: 150 });
    expect(p).toMatchObject({ xp: sessionXp(0, false), shards: sessionShards(0, false), winCredits: 0 });
    expect(p.xp).toBe(10);
  });
  it('the card names it', () => {
    expect(freeDanceHeadline(12)).toBe('FREE DANCE · 12 MOVES · NO SCORE');
    expect(freeDanceHeadline(1)).toBe('FREE DANCE · 1 MOVE · NO SCORE');
  });
});

describe('the band in full', () => {
  it('a stem band: every family at its top level, by PERFECTs until the level stops rising', () => {
    const levels = new Map<string, number>();
    const band = { judge: (c: string, j: 'PERFECT') => levels.set(c, nextStemLevel(levels.get(c) ?? 0, j)), level: (c: string) => levels.get(c) ?? 0 };
    const cats = ['toprock', 'bounce', 'footwork', 'power', 'wave', 'transition', 'freeze'];
    fillBand(band as never, cats);
    for (const c of cats) expect(levels.get(c), c).toBe(1);
  });
  it('your own song (clean hits, no families): hit until every part is in; no band: nothing', () => {
    let hits = 0;
    expect(fillBand({ hit: () => { hits++; return null; } }, ['toprock'])).toBe(hits);
    expect(hits).toBeGreaterThan(50);
    expect(fillBand(null, ['toprock'])).toBe(0);
  });
});

describe('the pick screen\'s X', () => {
  const state = (extra: Partial<DancePadState>): DancePadState => ({ ...DEFAULT_PAD_STATE, mode: 'pick', ...extra });
  it('where free dance is not offered X stays the empty socket it always was; where it is, X says FREE ON / FREE OFF and sends X', () => {
    expect(padButtons(state({ freeDance: null })).find((b) => b.slot === 'X')!.live).toBe(false);
    const off = padButtons(state({ freeDance: false })).find((b) => b.slot === 'X')!;
    const on = padButtons(state({ freeDance: true })).find((b) => b.slot === 'X')!;
    expect([off.live, off.label, on.label]).toEqual([true, FREE_DANCE_LABEL.off, FREE_DANCE_LABEL.on]);
    expect(off.down).toEqual(press('X'));
    expect(off.up).toEqual(press('X', false));
  });
  it('the control line names X only where it does something', () => {
    expect(pickControls(true)).toContain('X FREE');
    expect(pickControls(false)).not.toContain('X');
  });
});

describe('the room: free dance never reaches the judge', () => {
  const onInput = bodyOf(mode, 'onInput(ctx: ModeContext, e: FelInput) {', '\n    update(ctx: ModeContext, dt: number) {');
  const freePress = bodyOf(mode, 'function freeDancePress(', '\n  }\n');
  const finishFree = bodyOf(mode, 'function finishFree(', '\n  }\n');
  const update = bodyOf(mode, 'update(ctx: ModeContext, dt: number) {', '\n    dispose() {');
  it('onInput: X on the pick screen switches it; a free-dance press goes to freeDancePress and RETURNS before the judge\'s chain', () => {
    const pickEnd = onInput.indexOf('// IMPROVE (2026-10-06, #13): a held freeze ends');
    expect(onInput.slice(0, pickEnd)).toContain("e.btn === 'X' && e.src !== 'space') toggleFreeDance(ctx);");
    const free = onInput.indexOf('if (freeDance) { freeDancePress(ctx, e, t.tap); return; }');
    expect(free).toBeGreaterThan(onInput.indexOf("if (phase === 'pick') {"));
    for (const judged of ['isReleaseOf(hold.src, e)', 'const btn = matchMode ? matchPress(e, t.tap) : null;', 'freestylePress(ctx, e, t.tap)', 'pressAt(ctx']) {
      expect(onInput.indexOf(judged), judged).toBeGreaterThan(free);
    }
  });
  it('freeDancePress dances a move off the freestyle deck and touches no judge, score, combo or STYLE', () => {
    expect(freePress).toContain('freeDanceSlot(e, tap)');
    expect(freePress).toContain('freeDeck.press(slot)');
    expect(freePress).toContain('playStep(');
    expect(freePress).not.toMatch(/perf\.|pressAt\(|style\s*[+=]|grooveTaken|combo/);
  });
  it('update: the judge is not run, the lane is not drawn, and the song\'s end goes to finishFree', () => {
    expect(update).toContain('if (!freeDance) perf.update(heard);');
    expect(update).toContain('if (!freeDance) laneInto(hud, upcoming, heard);');
    expect(update).toContain('if (songBeat > perf.totalBeats + 1) { if (freeDance) finishFree(ctx); else finish(ctx); }');
  });
  it('finishFree posts score 0 and the free stats — no grade, no best, no STYLE — through the same card / end a judged run uses', () => {
    expect(finishFree).toContain('freeDanceStats({ moves: freeMoves, bpm: track.bpm, difficulty: track.difficulty })');
    expect(finishFree).toContain('ctx.card(FREE_DANCE_OUTCOME, FREE_DANCE_SCORE, stats)');
    expect(finishFree).toContain('ctx.end(FREE_DANCE_OUTCOME, FREE_DANCE_SCORE, stats)');
    expect(finishFree).not.toMatch(/recordBest|perf\.result|style|gradeFor/);
    // and the judged run's end is the one it always was
    expect(bodyOf(mode, 'function finish(', '\n  }\n')).toContain('else ctx.end(outcome, r.score, stats);');
  });
  it('switched only where offered, off at every load, and the band filled at lock-in only for a free run', () => {
    expect(bodyOf(mode, 'function toggleFreeDance(', '\n  }\n')).toContain('if (!freeOffered) return;');
    expect(mode).toContain('freeOffered = freeDanceBlock(typeof window !== \'undefined\' ? window.location.search : null) === null;');
    expect(mode).toMatch(/freeOffered = freeDanceBlock\([^\n]*\n\s+freeDance = false;/);
    expect(bodyOf(mode, 'function beginCountIn(', '\n  }\n')).toContain('if (freeDance) fillBand(band as never, STEM_ORDER);');
  });
});

describe('the end card has nothing of a free run for anyone to beat', () => {
  it('no proof line (the "Share proof" button), and no "Challenge a friend" — the shell mints no link from it either', async () => {
    const { proofLineFor } = await import('@/lib/proofLine');
    expect(proofLineFor('dance', { score: 0, won: false, outcome: 'GOOD', stats: freeDanceStats({ moves: 44, bpm: 96, difficulty: 1 }) })).toBeNull();
    expect(proofLineFor('dance', { score: 1200, won: true, stats: { stars: 3, accuracy: 80, maxCombo: 22 } })).toContain('1200 PTS');
    const card = fs.readFileSync(path.join(__dirname, '../../../components/games/end-screen/end-screen.tsx'), 'utf8');
    expect(card).toContain('{!arenaRefused && !isFreeDanceResult(run as never) && (');
    const shell = fs.readFileSync(path.join(__dirname, '../../../components/games/game-shell.tsx'), 'utf8');
    const mint = shell.slice(shell.indexOf('const shareChallenge = useCallback('), shell.indexOf("fetch('/api/challenge/mint'"));
    expect(mint).toContain('if (isFreeDanceResult(result)) return;');
  });
});
