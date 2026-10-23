// BASEBALL-3INN (2026-10-22, ALL-MODES-TO-75 §6): BB-1..BB-7, held headless against baseballGame.ts — the rules and the
// clock BaseballInningsMode only draws. BB-8 (device fps) and BB-9 (the ARENA regrade) need a phone and a playtest; they
// are not measured here.

import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BaseballGame, gradeSwing, crossSec, advance, baseballResult, baseballHeadline,
  INNINGS, OUTS_PER_INNING, STRIKES_PER_OUT, BATTERS_PER_INNING_CAP, SWING_WINDOW_SEC, BANNER_MS, NEXT_PITCH_MS,
  type BaseballPitch, type BaseballResult, type BaseballView, type SwingKind,
} from './baseballGame';
import { timingGameResult } from '@/lib/sessions/gameResultFromSession';
import type { SessionResult } from '@/lib/babylon/core/sessionResult';
import { chooseBaseballClip, type BaseballAnimInput } from '../anim/baseballTree';
import { CLIP_ALIASES } from '../anim/clipAliases';
import { REAL_CLIPS } from '../anim/clipRegistry';
import { scopeAllows, scopeForMode, suiteOfClip } from '../anim/clipScope';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Derby's pitch is released this far into the delivery (precisionModes PITCH_RELEASE_SEC); the suite pins its own copy. */
const RELEASE = 0.52;
/** Derby's speed band: a round-1 changeup (14.5 × 0.78) up to a late fastball. */
const SPEEDS = [11.31, 14, 14.5, 17, 19];
const pitchCycle = (n: number): BaseballPitch => ({ speed: SPEEDS[(n - 1) % SPEEDS.length], label: 'FB' });

const DT = 1 / 60;

interface Rig { game: BaseballGame; banners: string[]; hud: Record<string, string | number>; ends: BaseballResult[]; contacts: SwingKind[]; windups: number; releases: number }
function rig(pitchFor: (n: number) => BaseballPitch = pitchCycle): Rig {
  const r = { banners: [] as string[], hud: {} as Record<string, string | number>, ends: [] as BaseballResult[], contacts: [] as SwingKind[], windups: 0, releases: 0 } as Rig;
  const view: BaseballView = {
    windup: () => { r.windups++; }, release: () => { r.releases++; }, swing: () => {},
    contact: (g) => { r.contacts.push(g.kind); }, banner: (t) => { r.banners.push(t); },
    hud: (p) => { Object.assign(r.hud, p); }, end: (res) => { r.ends.push(res); },
  };
  r.game = new BaseballGame(view, pitchFor, RELEASE);
  return r;
}

/** Play to the end. `swingAt(pitchNo, pitch)` returns the offset from the crossing to press at (s), or null to take it. */
function play(r: Rig, swingAt: (n: number, p: BaseballPitch) => number | null, maxSec = 900): void {
  r.game.start();
  let target: number | null = null, forPitch = 0;
  for (let t = 0; t < maxSec && r.ends.length === 0; t += DT) {
    r.game.tick(DT);
    const g = r.game;
    if (g.phase === 'pitch' && g.pitch && forPitch !== g.pitchNo) {
      forPitch = g.pitchNo;
      const off = swingAt(g.pitchNo, g.pitch);
      target = off === null ? null : crossSec(g.pitch, RELEASE) + off;
    }
    if (g.phase === 'pitch' && target !== null && !g.swung && g.pitchSec >= target) g.press();
  }
}

afterEach(() => { vi.useRealTimers(); });

describe('BB-1 the swing is graded, not rolled: the same press gives the same outcome every time', () => {
  it('gradeSwing is a pure function of the press time and the pitch', () => {
    for (const speed of SPEEDS) {
      const p = { speed, label: 'FB' };
      for (const off of [-0.2, -0.12, -0.05, -0.01, 0, 0.02, 0.07, 0.14, 0.3]) {
        const at = crossSec(p, RELEASE) + off;
        const first = gradeSwing(at, p, RELEASE);
        for (let i = 0; i < 50; i++) expect(gradeSwing(at, p, RELEASE)).toStrictEqual(first);
      }
    }
  });

  it('two games with the same presses end on the same line, and Math.random is never consulted', () => {
    const spy = vi.spyOn(Math, 'random');
    const pattern = (n: number) => [0, -0.03, 0.05, null, 0.09, -0.12, 0.2][n % 7];
    const a = rig(), b = rig();
    play(a, pattern); play(b, pattern);
    expect(a.ends).toHaveLength(1);
    expect(a.ends).toStrictEqual(b.ends);
    expect(a.banners).toStrictEqual(b.banners);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('neither the rules nor the view reach for Math.random', () => {
    for (const f of ['lib/babylon/modes/baseballGame.ts', 'lib/babylon/modes/BaseballInningsMode.ts']) {
      expect(stripComments(read(f)), f).not.toMatch(/Math\.random/);
    }
  });
});

describe('BB-2 the window: inside always connects, outside always misses', () => {
  it('a press within ±0.15 s of the crossing connects, at every speed; past it, it misses', () => {
    const half = SWING_WINDOW_SEC / 2;
    for (const speed of SPEEDS) {
      const p = { speed, label: 'FB' };
      const cross = crossSec(p, RELEASE);
      for (let off = -half + 0.001; off < half; off += 0.004) expect(gradeSwing(cross + off, p, RELEASE).kind, `${speed} ${off}`).not.toBe('whiff');
      for (const off of [-half - 0.002, -0.2, -0.4, half + 0.002, 0.25, 0.6]) expect(gradeSwing(cross + off, p, RELEASE).kind, `${speed} ${off}`).toBe('whiff');
    }
  });

  it('the timing decides the hit: dead on is a homer, the edges are weak contact', () => {
    const p = { speed: 14, label: 'FB' };
    const cross = crossSec(p, RELEASE);
    expect(gradeSwing(cross, p, RELEASE).kind).toBe('homer');
    expect(gradeSwing(cross + 0.05, p, RELEASE).kind).toBe('double');
    expect(gradeSwing(cross - 0.08, p, RELEASE).kind).toBe('single');
    expect(gradeSwing(cross + 0.13, p, RELEASE).kind).toBe('out');
  });

  it('a swing before the ball leaves the hand is a whiff that says so; a late one says late', () => {
    const p = { speed: 14, label: 'FB' };
    expect(gradeSwing(RELEASE - 0.1, p, RELEASE)).toMatchObject({ kind: 'whiff', missLine: 'WAY EARLY — the ball is still in his hand' });
    expect(gradeSwing(crossSec(p, RELEASE) + 0.3, p, RELEASE).missLine).toMatch(/^LATE by \d+ ms$/);
  });

  it('the game counts it: a whiff and a taken pitch are strikes, and three strikes is an out', () => {
    const r = rig(() => ({ speed: 14, label: 'FB' }));
    play(r, (n) => (n === 1 ? 0.4 : n === 2 ? null : n === 3 ? -0.3 : 0), 30);
    expect(r.game.strikeouts).toBe(1);
    expect(r.contacts[0]).toBe('homer');   // the fourth pitch, dead on, is the first contact
    expect(r.contacts.every((k) => k === 'homer')).toBe(true);
    expect(r.game.runs).toBe(r.contacts.length);   // every one a solo shot: bases empty each time
  });

  it('runners move by the hit and score from third', () => {
    expect(advance([false, false, false], 1)).toEqual({ bases: [true, false, false], runs: 0 });
    expect(advance([true, false, true], 2)).toEqual({ bases: [false, true, true], runs: 1 });
    expect(advance([true, true, true], 4)).toEqual({ bases: [false, false, false], runs: 4 });
  });
});

describe('BB-3 the game ends on its own after 3 innings — no B press, no quit', () => {
  it('a player who never swings is struck out 27 times and the game ends', () => {
    const r = rig();
    play(r, () => null);
    expect(r.ends).toHaveLength(1);
    expect(r.game.inning).toBe(INNINGS);
    expect(r.ends[0].stats).toMatchObject({ outs: INNINGS * OUTS_PER_INNING, strikeouts: INNINGS * OUTS_PER_INNING, innings: 3, runs: 0 });
    expect(r.ends[0].stats.pitches).toBe(INNINGS * OUTS_PER_INNING * STRIKES_PER_OUT);
  });

  it('a hitter who never makes an out still reaches the end (the side retires after the batter cap)', () => {
    const r = rig();
    play(r, () => 0);
    expect(r.ends).toHaveLength(1);
    expect(r.ends[0].stats.homers).toBe(INNINGS * BATTERS_PER_INNING_CAP);
    expect(r.ends[0].score).toBe(INNINGS * BATTERS_PER_INNING_CAP);
  });

  it('nothing after the end: presses are refused and no second end fires', () => {
    const r = rig();
    play(r, () => null);
    expect(r.game.press()).toBe('refused');
    for (let i = 0; i < 600; i++) r.game.tick(DT);
    expect(r.ends).toHaveLength(1);
  });

  it('the view has no quit path: B does nothing, and only A reaches the game', () => {
    const src = stripComments(read('lib/babylon/modes/BaseballInningsMode.ts'));
    expect(src).not.toMatch(/btn === 'B'/);
    expect(src).not.toMatch(/TIME_UP/);
    expect([...src.matchAll(/ctx\.end\(/g)]).toHaveLength(1);   // the game's own end, nothing else
    expect(src).toMatch(/end: \(r\) => ctx\.end\(r\.outcome, r\.score, r\.stats\)/);
  });
});

describe('BB-4 the saved score is the card\'s score', () => {
  it('across 20 games, the posted score, the card\'s score and the runs are one number, and the headline prints it', () => {
    for (let k = 0; k < 20; k++) {
      const r = rig((n) => ({ speed: SPEEDS[(n + k) % SPEEDS.length], label: 'FB' }));
      play(r, (n) => [0, 0.04, -0.07, null, 0.12, -0.2, 0.09, 0.01][(n * (k + 1)) % 8]);
      const end = r.ends[0];
      expect(end.score).toBe(r.game.runs);
      expect(end.stats.runs).toBe(end.score);
      const session: SessionResult = { modeId: 'baseball', outcome: end.outcome, score: end.score, stats: end.stats, durationSec: 100 } as SessionResult;
      const headline = baseballHeadline(session);
      const card = timingGameResult(session, { headline, modeKey: 'baseball' });
      expect(card.score).toBe(end.score);
      expect(headline).toContain(`· ${end.score} RUN`);
      expect(r.hud.score).toBe(`${end.score} ${end.score === 1 ? 'RUN' : 'RUNS'}`);   // the scorebug at the end says it too
    }
  });

  it('the timing host builds the baseball card line from the posted result', () => {
    const host = read('components/games/timing-babylon.tsx');
    expect(host).toMatch(/modeKey === 'baseball' \? baseballHeadline\(r\)/);
    expect(baseballResult({ runs: 4, hits: 6, homers: 1, strikeouts: 3, outs: 9, pitches: 30, innings: 3 }).score).toBe(4);
  });
});

describe('BB-5 /play/baseball mounts baseball, /play/derby mounts derby', () => {
  it('the baseball loader hands the timing host BaseballInningsMode under a baseball title', () => {
    const src = stripComments(read('app/play/baseball/_components/loader.tsx'));
    expect(src).toMatch(/makeTimingHost\(\{ modeKey: 'baseball', def: b\.BaseballInningsMode/);
    expect(src).toMatch(/import\('@\/lib\/babylon\/modes\/BaseballInningsMode'\)/);
    expect(src).not.toMatch(/modeKey: 'derby'/);
    expect(src).toMatch(/title="BASEBALL"/);
    expect(stripComments(read('lib/babylon/modes/BaseballInningsMode.ts'))).toMatch(/modeId: 'baseball'/);
  });

  it('the derby has its own route: the same timing host on the registry `derby`, titled MOONSHOT DERBY', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/play/derby/page.tsx'))).toBe(true);
    expect(read('app/play/derby/page.tsx')).toMatch(/loginPath\('\/play\/derby'\)/);
    const src = stripComments(read('app/play/derby/_components/loader.tsx'));
    expect(src).toMatch(/makeTimingHost\(\{ modeKey: 'derby'/);
    expect(src).toMatch(/title="MOONSHOT DERBY"/);
    expect(src).toMatch(/<GameShell mode="baseball"/);   // the derby's sessions keep their catalogue key
  });

  it('the host mounts the definition it is handed before the registry\'s', () => {
    expect(read('components/games/timing-babylon.tsx')).toMatch(/const def = opts\.def \?\? MODES\[modeKey\];/);
  });
});

describe('BB-6 a pause holds the banners: they run on the game clock, not setTimeout', () => {
  it('with no ticks (the harness stops calling update when paused) no wall time clears a banner or throws a pitch', () => {
    vi.useFakeTimers();
    const r = rig();
    r.game.start();
    expect(r.banners).toEqual([`INNING 1 OF ${INNINGS}`]);
    vi.advanceTimersByTime(60_000);   // a minute paused
    expect(r.banners).toEqual([`INNING 1 OF ${INNINGS}`]);
    expect(r.windups).toBe(0);
    for (let t = 0; t < BANNER_MS / 1000 + DT; t += DT) r.game.tick(DT);
    expect(r.banners.at(-1)).toBe('');   // cleared on the game clock
    for (let t = 0; t < (NEXT_PITCH_MS - BANNER_MS) / 1000 + DT; t += DT) r.game.tick(DT);
    expect(r.windups).toBe(1);
  });

  it('a result banner set mid-game stays up while paused', () => {
    vi.useFakeTimers();
    const r = rig(() => ({ speed: 14, label: 'FB' }));
    r.game.start();
    while (r.game.phase !== 'pitch') r.game.tick(DT);
    while (r.game.pitchSec < crossSec(r.game.pitch!, RELEASE)) r.game.tick(DT);
    r.game.press();
    const shown = r.banners.at(-1);
    expect(shown).toMatch(/HOME RUN/);
    vi.advanceTimersByTime(30_000);
    expect(r.banners.at(-1)).toBe(shown);
  });

  it('neither file calls setTimeout or setInterval', () => {
    for (const f of ['lib/babylon/modes/baseballGame.ts', 'lib/babylon/modes/BaseballInningsMode.ts']) {
      expect(stripComments(read(f)), f).not.toMatch(/\bset(Timeout|Interval)\(/);
    }
    expect(read('lib/babylon/modes/baseballGame.ts')).toMatch(/new TimerBag\(\{ gameClock: true \}\)/);
  });
});

describe('BB-7 no borrowed combat clip in baseballTree (ANIM-ALL-1)', () => {
  const FIGHTER = new Set(['guard', 'jab', 'hook', 'uppercut', 'roundhouse', 'high_kick']);
  const base = (clip: string): string => {
    let n = clip;
    // the resolver plays a real clip as itself (idle_stand is real; its alias row is the fallback), else its alias chain
    for (let i = 0; i < 4 && !REAL_CLIPS.has(n) && Object.prototype.hasOwnProperty.call(CLIP_ALIASES, n); i++) n = CLIP_ALIASES[n][0];
    return n.replace(/\.M$/, '');
  };
  const REST: BaseballAnimInput = { pitching: false, windingUp: false, releasing: false, batting: false, swinging: null, fielding: 'none', throwing: false, running: false, sliding: false };
  const PROBES: BaseballAnimInput[] = [
    { ...REST }, { ...REST, windingUp: true }, { ...REST, pitching: true }, { ...REST, releasing: true },
    { ...REST, batting: true }, { ...REST, batting: true, swinging: 'contact' }, { ...REST, batting: true, swinging: 'power' },
    { ...REST, fielding: 'routine' }, { ...REST, fielding: 'dive' }, { ...REST, throwing: true }, { ...REST, running: true },
    { ...REST, sliding: true }, { ...REST, celebrating: true }, { ...REST, dejected: true },
  ];

  it('every state\'s clip — and the clip its alias plays — is no fighter strike and no combat-suite clip', () => {
    for (const i of PROBES) {
      const c = chooseBaseballClip(i);
      for (const n of [c.clip, base(c.clip)]) {
        expect(FIGHTER.has(n), `${c.state} → ${n}`).toBe(false);
        expect(suiteOfClip(n), `${c.state} → ${n}`).not.toBe('combat');
      }
    }
  });

  it('the throw is a pitch and the celebration a jump; every clip the baseball view plays is in the baseball scope', () => {
    expect(base(chooseBaseballClip({ ...REST, throwing: true }).clip)).toBe('baseball_pitch_side');
    expect(chooseBaseballClip({ ...REST, celebrating: true }).clip).toBe('jump_up');
    const scope = scopeForMode('baseball');
    for (const i of [{ ...REST }, { ...REST, releasing: true }, { ...REST, batting: true }, { ...REST, batting: true, swinging: 'contact' as const }, { ...REST, celebrating: true }]) {
      const c = chooseBaseballClip(i);
      expect(scopeAllows(scope, base(c.clip)), `${c.state} → ${base(c.clip)}`).toBe(true);
    }
  });
});
