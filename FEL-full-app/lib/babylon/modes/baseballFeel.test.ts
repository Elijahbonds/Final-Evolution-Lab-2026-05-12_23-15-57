// BASEBALL-FEEL (2026-10-23): BB-10..BB-19 from BASEBALL-FEEL-2026-10-22.md §6, held headless against baseballSlots.ts
// (the slot each body is in, off the game's events), baseballTree.ts and baseballGame.ts.
// Not here: BB-15 (its §4 bat-visibility table was not recovered), BB-16 (the fist-to-bat-axis distance needs a skinned
// rig in a browser), BB-18 (the "default-C compression-tee kit" is not defined in the recovered spec).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BaseballGame, crossSec, gradeSwing, type SwingKind } from './baseballGame';
import { pitchSpec, PITCH_RELEASE_SEC } from './baseballPitch';
import { BaseballSlots, SlotDriver, HIT_STOP_MS, HIT_STOP_CAP_MS, SWING_STOP_T, hitStopFor } from './baseballSlots';
import { batGlbFit, BAT_GLB_HANDLE, BAT_GLB_BARREL, BAT_LEN } from './baseballBat';
import { BaseballAnimTree, BASEBALL_CLIP_FOR, chooseBaseballClip, type BaseballAnimState, type BaseballAnimInput } from '../anim/baseballTree';
import { CLIP_ALIASES } from '../anim/clipAliases';
import { REAL_CLIPS } from '../anim/clipRegistry';
import { scopeAllows, scopeForMode, suiteOfClip } from '../anim/clipScope';
import { BAT_SWING_SEC } from '../anim/authored/baseball';
import { stripComments } from '@/lib/testing/sourceScan';
import type { CharacterAnimator } from '../anim/CharacterAnimator';

const ROOT = path.resolve(__dirname, '../../..');
const DT = 1 / 60;
const ALL_STATES: BaseballAnimState[] = ['idle', 'windup', 'pitch_release', 'stance', 'swing_contact', 'swing_power',
  'field_routine', 'field_dive', 'throw', 'run', 'slide', 'celebrate', 'dejected'];
const base = (clip: string): string => {
  let n = clip;
  for (let i = 0; i < 4 && !REAL_CLIPS.has(n) && Object.prototype.hasOwnProperty.call(CLIP_ALIASES, n); i++) n = CLIP_ALIASES[n][0];
  return n.replace(/\.M$/, '');
};

/** A stand-in animator that logs every play(). */
const fakeAnimator = () => {
  const plays: string[] = [];
  return { plays, anim: { play: (n: string) => { plays.push(n); return null; } } as unknown as CharacterAnimator };
};

/** Press offset (s from the crossing) that earns `kind` on `pitch`; null = take the pitch. */
const offsetFor = (kind: SwingKind | 'take', speed: number): number | null => {
  if (kind === 'take') return null;
  if (kind === 'whiff') return -0.4;
  const p = { speed, label: 'FB' };
  const cross = crossSec(p, PITCH_RELEASE_SEC);
  for (let o = 0; o <= 0.15; o += 0.001) {
    for (const s of [o, -o]) if (gradeSwing(cross + s, p, PITCH_RELEASE_SEC).kind === kind) return s;
  }
  throw new Error(`no offset for ${kind}`);
};

/** A seeded innings, every slot recorded from tree.update's return. */
function play(seed: number, script: (SwingKind | 'take')[]) {
  const b = fakeAnimator(), p = fakeAnimator();
  const bt = new BaseballAnimTree(b.anim), pt = new BaseballAnimTree(p.anim);
  const slots = new BaseballSlots(PITCH_RELEASE_SEC);
  const driver = new SlotDriver(bt, pt);
  const seq: string[] = []; const seen = new Set<BaseballAnimState>();
  const batSecs: { w: string; sec: number }[] = [];
  let ended = false;
  const game = new BaseballGame({
    windup: () => slots.windup(), release: () => {}, swing: (g) => slots.swing(g), contact: (g) => slots.contact(g),
    strikeout: () => slots.strikeout(), banner: () => {}, hud: () => {}, end: () => { ended = true; },
  }, (n) => pitchSpec(n, seed), PITCH_RELEASE_SEC);
  game.start();
  let pressAt: number | null = null, pitchNo = 0;
  for (let i = 0; i < 60 * 600 && !ended; i++) {
    if (game.phase === 'pitch' && game.pitchNo !== pitchNo && game.pitch) {
      pitchNo = game.pitchNo;
      const o = offsetFor(script[(pitchNo - 1) % script.length], game.pitch.speed);
      pressAt = o == null ? null : crossSec(game.pitch, PITCH_RELEASE_SEC) + o;
    }
    if (pressAt != null && game.phase === 'pitch' && game.pitchSec >= pressAt) { game.press(); pressAt = null; }
    game.tick(DT);
    const f = slots.tick(DT);
    const s = driver.apply(f);
    if (f.batSec != null) batSecs.push({ w: f.batter.swinging ?? '', sec: f.batSec });
    for (const st of [s.batter, s.pitcher]) if (st) { seen.add(st); }
    seq.push(`${s.batter}|${s.pitcher}`);
  }
  return { seq, seen, ended, plays: { batter: b.plays, pitcher: p.plays }, swingLog: slots.swingLog, batSecs };
}

const SCRIPT: (SwingKind | 'take')[] = ['homer', 'double', 'single', 'out', 'whiff', 'whiff', 'whiff', 'take'];

describe('BB-10 every CLIP_FOR clip resolves to a clip owned under DERBY scope', () => {
  it('core or baseball suite, never a fighter base clip', () => {
    const scope = scopeForMode('baseball');
    for (const [state, c] of Object.entries(BASEBALL_CLIP_FOR)) {
      for (const n of [c.clip, base(c.clip)]) {
        expect(scopeAllows(scope, n), `${state} → ${n}`).toBe(true);
        expect(['core', 'baseball'], `${state} → ${n}`).toContain(suiteOfClip(n));
      }
    }
  });
});

describe('BB-11 slot coverage', () => {
  it('a seeded scripted innings visits all 13 BaseballAnimState slots, read from tree.update', () => {
    const r = play(7, SCRIPT);
    expect(r.ended).toBe(true);
    expect([...ALL_STATES].filter((s) => !r.seen.has(s))).toEqual([]);
  });
});

describe('BB-12 run is built on a DERBY body', () => {
  it('run plays baseball_homer_trot, which resolves to core run inside the baseball scope (no idle fallback)', () => {
    const rest: BaseballAnimInput = { pitching: false, windingUp: false, releasing: false, batting: false, swinging: null, fielding: 'none', throwing: false, running: true, sliding: false };
    const c = chooseBaseballClip(rest);
    expect(c.state).toBe('run');
    expect(c.clip).toBe('baseball_homer_trot');
    expect(base(c.clip)).toBe('run');
    const scope = scopeForMode('baseball');
    expect(scopeAllows(scope, 'baseball_homer_trot')).toBe(true);
    expect(scopeAllows(scope, 'run')).toBe(true);
  });
});

describe('BB-13 power vs contact', () => {
  it('power speedRatio ≥ contact; contact ends at t ≤ 0.42, power reaches t = 0.55 (beat log)', () => {
    const r = play(7, SCRIPT);
    const contact = r.swingLog.filter((l) => l.weight === 'contact'), power = r.swingLog.filter((l) => l.weight === 'power');
    expect(contact.length).toBeGreaterThan(0); expect(power.length).toBeGreaterThan(0);
    for (const p of power) for (const c of contact) expect(p.speedRatio).toBeGreaterThanOrEqual(c.speedRatio);
    for (const c of contact) expect(c.stopT).toBeLessThanOrEqual(0.42);
    for (const p of power) expect(p.stopT).toBeCloseTo(0.55, 6);
    expect(Math.max(...r.batSecs.filter((b) => b.w === 'contact').map((b) => b.sec))).toBeLessThanOrEqual(0.42);
    expect(Math.max(...r.batSecs.filter((b) => b.w === 'power').map((b) => b.sec))).toBeCloseTo(0.55, 6);
    expect(SWING_STOP_T.power).toBe(BAT_SWING_SEC);
  });
});

describe('BB-14 hit-stop', () => {
  it('every hitStop call in baseball code is ≤ 120 ms, and contact < power ≤ homer (60 ms)', () => {
    expect(HIT_STOP_CAP_MS).toBe(120);
    for (const k of ['homer', 'double', 'single', 'out'] as SwingKind[]) expect(hitStopFor(k)).toBeLessThanOrEqual(120);
    expect(HIT_STOP_MS.contact).toBeLessThan(HIT_STOP_MS.power);
    expect(HIT_STOP_MS.power).toBeLessThanOrEqual(HIT_STOP_MS.homer);
    expect(HIT_STOP_MS.homer).toBeLessThanOrEqual(60);
    for (const f of ['lib/babylon/modes/BaseballInningsMode.ts', 'lib/babylon/modes/baseballGame.ts', 'lib/babylon/modes/baseballSlots.ts', 'lib/babylon/anim/baseballTree.ts']) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      for (const m of src.matchAll(/hitStop\(([^)]*)\)/g)) {
        const arg = m[1].trim();
        if (/^\d/.test(arg)) expect(Number(arg.split(/[,\s]/)[0]), `${f}: ${m[0]}`).toBeLessThanOrEqual(120);
        else expect(arg, `${f}: ${m[0]}`).toMatch(/^hitStopFor\(/);
      }
    }
  });
});

describe('BB-17 each beat replays', () => {
  it('two strikeouts in a row both fire the dejected beat', () => {
    const r = play(7, ['whiff']);
    const dejectedClip = BASEBALL_CLIP_FOR.dejected.clip;
    let starts = 0, prev = '';
    for (const s of r.seq) { const b = s.split('|')[0]; if (b === 'dejected' && prev !== 'dejected') starts++; prev = b; }
    expect(starts).toBeGreaterThanOrEqual(2);
    expect(r.plays.batter.filter((n) => n === dejectedClip).length).toBeGreaterThanOrEqual(starts);
  });
});

describe('BB-19 determinism', () => {
  it('same seed and same presses give the same slot sequence', () => {
    expect(play(11, SCRIPT).seq).toStrictEqual(play(11, SCRIPT).seq);
  });
});

describe('BASEBALL-FEEL bat.glb fit (PM order)', () => {
  it('handle → origin, barrel → +Y at BAT_LEN 0.86', () => {
    expect(BAT_LEN).toBe(0.86);
    const f = batGlbFit();
    const tf = (v: readonly number[]) => {
      const x = v[0] * f.scale, y = v[1] * f.scale;
      return [x * Math.cos(f.rotZ) - y * Math.sin(f.rotZ), x * Math.sin(f.rotZ) + y * Math.cos(f.rotZ) + f.offsetY];
    };
    const h = tf(BAT_GLB_HANDLE), b = tf(BAT_GLB_BARREL);
    expect(h[0]).toBeCloseTo(0, 6); expect(h[1]).toBeCloseTo(0, 6);
    expect(b[0]).toBeCloseTo(0, 6); expect(b[1]).toBeCloseTo(0.86, 6);
  });
  it('the bat is not a RightHand child', () => {
    for (const f of ['lib/babylon/modes/baseballBat.ts', 'lib/babylon/modes/precisionModes.ts', 'lib/babylon/modes/BaseballInningsMode.ts']) {
      expect(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))).not.toMatch(/parent\s*=\s*rh\b|attachToBone/);
    }
  });
});
