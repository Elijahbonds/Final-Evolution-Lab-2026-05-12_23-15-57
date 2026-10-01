// MUSIC-SUITE P9 (2026-09-29): FREE DANCE PAYS NOTHING — the payout path, walked end to end (owner decision #3: "a
// no-score free-dance toggle — no judge, no pay, the band plays everything").
//
// How a dance run gets paid today, traced: the room calls ctx.end(outcome, score, stats) → ModeHarness hands the result
// to opts.resultSink (ModeHarness.ts ctx.end) → the timing host's resultSink calls the shell's onEnd
// (components/games/timing-babylon.tsx) → GameShell.handleEnd POSTs /api/sessions (components/games/game-shell.tsx),
// and ONLY that POST pays (XP, shards, Lab Credits, the streak — lib/session-payout.ts; POST /api/sessions/start opens a
// run and pays nothing, and an unfinished run expires unpaid: ECONOMY-SESSIONS-HARDEN). So a free-dance run pays nothing
// because it never calls ctx.end: at the song's end the room goes back to its pick screen (DanceMode runEnding →
// backToPick). This file holds each link of that chain, and holds free dance off the judge on the way.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runEnding, freestyleBanner, pickHint, FREE_DANCE_CHIP, FREE_NEXT_STEP, RESULTS_BEAT_SEC,
} from '../modes/DanceMode';
import { sessionPayout, CREATION_PAYOUT } from '@/lib/session-payout';

const src = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');
const DANCE = src('lib/babylon/modes/DanceMode.ts');
/** The body of a `function name(` in DanceMode.ts, up to the next top-level-in-the-closure `function`. */
function fnBody(name: string): string {
  const at = DANCE.indexOf(`function ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const next = DANCE.indexOf('\n  function ', at + 10);
  return DANCE.slice(at, next === -1 ? undefined : next);
}

describe('free dance never ends a run, so it never posts a session', () => {
  it('runEnding: a judged run ends; a free-dance run goes back to the pick screen', () => {
    expect(runEnding(false)).toBe('end');
    expect(runEnding(true)).toBe('repick');
  });

  it('the song\'s end takes that branch: backToPick for free dance, finish otherwise', () => {
    expect(DANCE).toContain("if (runEnding(freeDance) === 'repick') backToPick(ctx);");
    expect(DANCE).toContain('else finish(ctx);');
  });

  it('backToPick calls no ctx.end and no ctx.card — it reopens the pick screen', () => {
    const body = fnBody('backToPick');
    expect(body).not.toMatch(/ctx\.end\(|ctx\.card\(/);
    expect(body).toContain('showPick(ctx);');
    expect(body).toContain("phase = 'pick';");
  });

  it('every ctx.end is a JUDGED ending — finish()\'s results beat, or an Arena set\'s (which forces free dance off)', () => {
    const code = DANCE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');   // comments name ctx.end too
    const count = (text: string, needle: string): number => text.split(needle).length - 1;
    const inFinish = count(fnBody('finish'), 'ctx.end(');
    // MUSIC-SUITE P9 (duels, concurrent): an Arena dance set ends through endArena after the server has its presses
    const inArena = DANCE.includes('function endArena(') ? count(fnBody('endArena'), 'ctx.end(') : 0;
    expect(inFinish).toBe(1);
    expect(fnBody('finish')).toContain('ctx.end(outcome, r.score, stats)');
    expect(count(code, 'ctx.end(')).toBe(inFinish + inArena);
    if (inArena) expect(DANCE).toContain('if (arena) freeDance = false;');
    // MUSIC-SUITE P9 FIX PASS (2026-09-29): two calls now — the one behind runEnding, and an Arena set's end while the
    // harness's START overlay is up (arenaRunsOn: an Arena set runs to its end). That one is Arena-only, and an Arena run
    // forces free dance off (asserted just above), so free dance still never reaches finish().
    expect(count(code, 'finish(ctx)')).toBe(2);
    expect(count(fnBody('arenaRunsOn'), 'finish(ctx)')).toBe(1);
    expect(fnBody('arenaRunsOn')).toContain('if (ended || !arena || phase === \'pick\') return;');
    const back = fnBody('backToPick');
    expect(back).not.toMatch(/finish\(|endArena\(|sendArena\(/);
  });

  it('no judge in free dance: presses dance and are never judged, nothing fires or expires', () => {
    expect(DANCE).toContain('if (freeDance) { freeDanceMove(ctx, edge.down); return; }');
    expect(DANCE.indexOf('if (freeDance) { freeDanceMove(ctx, edge.down); return; }')).toBeLessThan(DANCE.lastIndexOf('judgePress(heard, edge.down);'));
    expect(DANCE).toContain('if (!freeDance) perf.update(heard);');
    expect(fnBody('freeDanceMove')).not.toMatch(/perf\.(hit|release|update)\(/);
    // releases are not judged either, and the count-in takes no press
    expect(DANCE).toContain("if (edge.up && !freeDance && (phase === 'playing' || phase === 'countin'))");
    expect(DANCE).toContain('if (freeDance) return;   // MUSIC-SUITE P9: nothing to judge');
  });

  it('the band plays everything in free dance (fillBand at lock-in)', () => {
    expect(DANCE).toContain('if (freeDance) fillBand();');
    expect(fnBody('fillBand')).toContain("band.judge(cat, 'PERFECT')");
  });

  it('the payout chain: sessions are paid only by the shell\'s handleEnd POST, which only ctx.end reaches', () => {
    const shell = src('components/games/game-shell.tsx');
    const paidPosts = shell.match(/fetch\('\/api\/sessions'/g) ?? [];
    expect(paidPosts).toHaveLength(1);
    const handleEnd = shell.slice(shell.indexOf('const handleEnd = useCallback('), shell.indexOf('const handleEnd = useCallback(') + 3000);
    expect(handleEnd).toContain("fetch('/api/sessions'");
    expect(shell).toContain('onEnd={handleEnd}');
    const host = src('components/games/timing-babylon.tsx');
    const sink = host.slice(host.indexOf('const resultSink = async'), host.indexOf('const def = MODES[modeKey]'));
    expect(sink).toContain('onEnd(result);');
    expect(host.split('onEnd(').length - 1).toBe(1);        // the host calls onEnd from resultSink only
    const harness = src('lib/babylon/core/ModeHarness.ts');
    const endFn = harness.slice(harness.indexOf('    end(outcome, score, stats, detail) {'), harness.indexOf('    card(outcome, score, stats, detail) {'));
    expect(endFn).toContain('opts.resultSink(result);');
  });

  it('for contrast: what an unposted run would have been paid had it posted as a no-score creation — nothing either way', () => {
    // the rules the route applies to anything that DOES post (a creation pays CREATION_PAYOUT = nothing; a scored
    // endless set is capped). Free dance posts nothing at all, so it never even reaches these.
    expect(sessionPayout({ score: 0, won: false, endless: true, kind: 'creation' })).toEqual({ ...CREATION_PAYOUT });
    expect(CREATION_PAYOUT).toEqual({ xp: 0, shards: 0, winCredits: 0, capped: false });
  });
});

describe('the room\'s P9 words and timings', () => {
  it('the freestyle banner names the pick, and nudges when repeating it cost', () => {
    expect(freestyleBanner('PERFECT', 'Top Rock', 1, 2)).toBe('PERFECT · TOP ROCK');
    expect(freestyleBanner('GREAT', 'Arm Wave', 0.5, 6)).toBe('GREAT  ×6 · ARM WAVE · MIX IT UP');
  });

  it('the pick screen says what d-pad UP does (a d-pad every input has — touch included), and says free dance is on while it is', () => {
    expect(pickHint(false)).toContain('▲  FREE');
    expect(pickHint(true)).toContain('▲  SCORED');
    expect(DANCE).toContain("else if (e.t === 'dpad' && e.pressed && e.dir === 'up') toggleFreeDance(ctx);");
    expect(DANCE).not.toMatch(/e\.btn === 'Y'/);   // not a face button the dance touch overlay (TAP only) lacks
    expect(FREE_DANCE_CHIP).toContain('NO SCORE');
    expect(FREE_DANCE_CHIP).toContain('NO PAY');
    // (MUSIC-SUITE P9 FIX PASS: by the moves' names — the phone pad and the touch rig label their buttons with them)
    expect(FREE_NEXT_STEP).toBe('YOUR MOVE · TOP ROCK / TWO STEP / ARM WAVE / SPIN');
  });

  // MUSIC-SUITE P9 FIX PASS (2026-09-29): CHANGED ASSERTION (named in the report). This said "a leave during it posts
  // nothing" — the regression the phase review found: before P9 ctx.end ran in the same tick as the grade, so a player who
  // left as the banner showed still posted the session; with the 2.2 s beat the leave dropped it (XP, shards, the daily
  // streak for a whole danced song). The beat stays; a leave during it now FLUSHES the held ctx.end instead.
  it('the results beat before the card is short, and a leave during it still posts the run (the held end is flushed)', () => {
    expect(RESULTS_BEAT_SEC).toBeGreaterThan(1);
    expect(RESULTS_BEAT_SEC).toBeLessThan(4);
    const dispose = DANCE.slice(DANCE.indexOf('dispose() {'));
    expect(dispose).toContain('if (resultTimer) { clearTimeout(resultTimer); resultTimer = null; }');
    expect(dispose).toContain('{ const f = resultEnd; resultEnd = null; try { f?.(); }');
    const hold = DANCE.slice(DANCE.indexOf('function holdResults('), DANCE.indexOf('function holdResults(') + 400);
    expect(hold).toContain('resultEnd = end;');
    expect(hold).toContain('const f = resultEnd; resultEnd = null; f?.();');
    // both ways a run ends go through it: free play's finish and the Arena's endArena
    expect(DANCE).toContain('holdResults(() => ctx.end(outcome, r.score, stats), RESULTS_BEAT_SEC * 1000);');
    expect(DANCE).toContain("holdResults(() => ctx.end(v.stars >= 3 ? 'GREAT' : 'GOOD', end.score, stats), wait);");
  });
});
