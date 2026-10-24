// BASEBALL-FEEL follow-up (2026-10-23): BB-15 and the full spec's §2–§4 rules, held headless against baseballSlots.ts,
// baseballTree.ts and baseballBat.ts. BB-16 (grip in a skinned rig) and BB-18 (the default-C kit) stay blocked:
// /workspace/fel-specs/BASEBALL-FEEL-BLOCKED-TESTS.md.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BaseballGame, crossSec, gradeSwing, type SwingKind } from './baseballGame';
import { pitchSpec, PITCH_RELEASE_SEC } from './baseballPitch';
import {
  BaseballSlots, SlotDriver, SWING_SPEED, SWING_STOP_T, CONTACT_KEY_T, BEAT_SEC, swingSpeedRatio, batVisibleFor, type SlotFrame,
} from './baseballSlots';
import { BaseballAnimTree, chooseBaseballClip, type BaseballAnimState, type BaseballAnimInput } from '../anim/baseballTree';
import { CLIP_ALIASES } from '../anim/clipAliases';
import { scopeAllows, scopeForMode } from '../anim/clipScope';
import { BAT_RECOVER_SEC, BAT_SWING_SEC } from '../anim/authored/baseball';
import { stripComments } from '@/lib/testing/sourceScan';
import type { CharacterAnimator } from '../anim/CharacterAnimator';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const DT = 1 / 60;
const REST: BaseballAnimInput = { pitching: false, windingUp: false, releasing: false, batting: false, swinging: null, fielding: 'none', throwing: false, running: false, sliding: false };

const fakeAnimator = () => {
  const plays: { name: string; speedRatio?: number }[] = [];
  return { plays, anim: { play: (name: string, o?: { speedRatio?: number }) => { plays.push({ name, speedRatio: o?.speedRatio }); return null; } } as unknown as CharacterAnimator };
};

const offsetFor = (kind: SwingKind | 'take', speed: number): number | null => {
  if (kind === 'take') return null;
  if (kind === 'whiff') return -0.4;
  const p = { speed, label: 'FB' };
  const cross = crossSec(p, PITCH_RELEASE_SEC);
  for (let o = 0; o <= 0.15; o += 0.001) for (const s of [o, -o]) if (gradeSwing(cross + s, p, PITCH_RELEASE_SEC).kind === kind) return s;
  throw new Error(`no offset for ${kind}`);
};

interface Rec { f: SlotFrame; b: BaseballAnimState | null; p: BaseballAnimState | null; t: number }
function play(seed: number, script: (SwingKind | 'take')[]) {
  const b = fakeAnimator(), p = fakeAnimator();
  const slots = new BaseballSlots(PITCH_RELEASE_SEC);
  const driver = new SlotDriver(new BaseballAnimTree(b.anim), new BaseballAnimTree(p.anim));
  const recs: Rec[] = []; const events: { t: number; e: string }[] = [];
  let ended = false, t = 0;
  const game = new BaseballGame({
    windup: (pp) => slots.windup(pp), release: () => {},
    swing: (g) => { events.push({ t, e: `swing:${g.kind}` }); slots.swing(g); },
    contact: (g) => { events.push({ t, e: `contact:${g.kind}` }); slots.contact(g); },
    strikeout: () => slots.strikeout(), scored: (r) => { events.push({ t, e: `scored:${r}` }); slots.scored(r); },
    banner: () => {}, hud: () => {}, end: () => { ended = true; },
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
    game.tick(DT); t += DT;
    const f = slots.tick(DT);
    const s = driver.apply(f);
    recs.push({ f, b: s.batter, p: s.pitcher, t });
  }
  return { recs, events, ended, plays: { batter: b.plays, pitcher: p.plays } };
}
const SCRIPT: (SwingKind | 'take')[] = ['homer', 'double', 'single', 'out', 'whiff', 'whiff', 'whiff', 'take', 'single', 'single', 'single'];

describe('BB-15 bat visibility follows the §4 table', () => {
  it('shown in stance and both swings (the recovery is the stance); hidden on run, slide, field_*, throw, celebrate, dejected', () => {
    for (const s of ['stance', 'swing_contact', 'swing_power'] as BaseballAnimState[]) expect(batVisibleFor(s), s).toBe(true);
    for (const s of ['run', 'slide', 'field_routine', 'field_dive', 'throw', 'celebrate', 'dejected', 'idle', 'windup', 'pitch_release'] as BaseballAnimState[]) {
      expect(batVisibleFor(s), s).toBe(false);
    }
  });
  it('every frame of a seeded innings: the batter\'s bat is shown exactly in the shown slots, and through each recovery', () => {
    const r = play(7, SCRIPT);
    expect(r.ended).toBe(true);
    const hidden = new Set<string>();
    for (const x of r.recs) {
      expect(x.f.batVisible, `${x.b} @${x.t.toFixed(2)}`).toBe(batVisibleFor(x.b!));
      if (!x.f.batVisible) hidden.add(x.b!);
      if (x.f.batSec != null && x.f.batSec > BAT_SWING_SEC) expect(x.f.batVisible).toBe(true);   // the recovery
    }
    for (const s of ['run', 'slide', 'celebrate', 'dejected']) expect(hidden.has(s), s).toBe(true);
  });
  it('the bat is never on the pitcher or a fielder: one bat, mounted on the batter only', () => {
    const src = read('lib/babylon/modes/BaseballInningsMode.ts');
    expect([...src.matchAll(/mountTwoHandBat\(/g)]).toHaveLength(1);
    expect(src).toMatch(/mountTwoHandBat\(ctx\.scene, batter,/);
    expect(src).toMatch(/bat\?\.setVisible\(f\.batVisible\)/);
  });
});

describe('§4 one shared two-hand bat (no fork)', () => {
  it('Derby and the innings mode both place through baseballBat.placeTwoHandBat; Derby keeps no copy of the placement', () => {
    const derby = read('lib/babylon/modes/precisionModes.ts'), bat = read('lib/babylon/modes/baseballBat.ts');
    expect(derby).toMatch(/placeTwoHandBat\(ctx\.scene, me\.root, bones, bat, \(\) => batSwingSec,/);
    expect(derby).not.toMatch(/BAT_HANDS_PULL|batLineAt\(|FromUnitVectorsToRef/);
    expect(bat).toMatch(/mountTwoHandBat[\s\S]*placeTwoHandBat\(scene, body\.root, bones, bat, swingSec\)/);
    expect([...bat.matchAll(/FromUnitVectorsToRef\(/g)]).toHaveLength(1);
    expect(derby).not.toMatch(/\.parent = rh\b|attachToBone/);
  });
  it('the look is one switch (BAT_LOOK): the GLB today, the cylinder one word away, for both modes', () => {
    const bat = read('lib/babylon/modes/baseballBat.ts');
    expect(bat).toMatch(/export const BAT_LOOK: BatLook = 'glb'/);
    expect(bat).toMatch(/if \(look === 'cylinder'\)/);
  });
});

describe('§2 slot → firing event', () => {
  it('the windup holds idle_stand, then the release clip plays (the side-arm on a slider)', () => {
    expect(chooseBaseballClip({ ...REST, pitching: true }).clip).toBe('idle_stand');
    expect(chooseBaseballClip({ ...REST, pitching: true, windingUp: true }).clip).toBe('idle_stand');
    expect(chooseBaseballClip({ ...REST, releasing: true }).clip).toBe('derby_pitch');
    expect(chooseBaseballClip({ ...REST, releasing: true, sideArm: true }).clip).toBe('baseball_pitch_side');
    const r = play(7, SCRIPT);
    const seq = r.recs.map((x) => x.p);
    const firstRelease = seq.indexOf('pitch_release');
    expect(seq.slice(0, firstRelease)).toContain('idle');
    // between pitches the pitcher is in the set (windup), and every release is preceded by it
    for (let i = 1; i < seq.length; i++) if (seq[i] === 'pitch_release' && seq[i - 1] !== 'pitch_release') expect(['windup', 'idle', 'throw']).toContain(seq[i - 1]);
    expect(seq).toContain('windup');
  });
  it('baseball_run is run ×1.0, a name only, in the baseball scope; a hit sprints, a homer trots', () => {
    expect(CLIP_ALIASES.baseball_run).toEqual(['run', 1.0]);
    expect(scopeAllows(scopeForMode('baseball'), 'baseball_run')).toBe(true);
    expect(chooseBaseballClip({ ...REST, running: true, sprint: true }).clip).toBe('baseball_run');
    expect(chooseBaseballClip({ ...REST, running: true }).clip).toBe('baseball_homer_trot');
    const r = play(7, ['homer', 'single']);
    const runs = r.plays.batter.filter((p) => p.name === 'baseball_run' || p.name === 'baseball_homer_trot').map((p) => p.name);
    expect(runs).toContain('baseball_run'); expect(runs).toContain('baseball_homer_trot');
  });
  it('celebrate fires on a homer and on a run scored by a hit; dejected on strike three and on a caught fly out', () => {
    const s = new BaseballSlots(PITCH_RELEASE_SEC);
    const states = (n: number) => { const out: BaseballAnimState[] = []; for (let i = 0; i < n; i++) out.push(chooseBaseballClip(s.tick(DT).batter).state); return out; };
    s.swing({ kind: 'single', q: 0.4, offsetSec: 0.08, missLine: '' }); s.contact({ kind: 'single', q: 0.4, offsetSec: 0.08, missLine: '' }); s.scored(1);
    expect(states(600)).toContain('celebrate');
    const o = new BaseballSlots(PITCH_RELEASE_SEC);
    o.swing({ kind: 'out', q: 0.2, offsetSec: 0.12, missLine: '' }); o.contact({ kind: 'out', q: 0.2, offsetSec: 0.12, missLine: '' });
    const os: BaseballAnimState[] = []; for (let i = 0; i < 300; i++) os.push(chooseBaseballClip(o.tick(DT).batter).state);
    expect(os).toContain('dejected');
    const k = new BaseballSlots(PITCH_RELEASE_SEC); k.swing({ kind: 'whiff', q: 0, offsetSec: -0.4, missLine: '' }); k.strikeout();
    const ks: BaseballAnimState[] = []; for (let i = 0; i < 120; i++) ks.push(chooseBaseballClip(k.tick(DT).batter).state);
    expect(ks).toContain('dejected');
  });
  it('slide fires only while a throw is in the air near the base: a single slides into first, a double runs in', () => {
    const run = (kind: SwingKind) => {
      const s = new BaseballSlots(PITCH_RELEASE_SEC); const g = { kind, q: 0.5, offsetSec: 0.05, missLine: '' };
      s.swing(g); s.contact(g);
      const out: { b: BaseballAnimState; p: BaseballAnimState; t: number }[] = [];
      for (let i = 0; i < 60 * 9; i++) { const f = s.tick(DT); out.push({ b: chooseBaseballClip(f.batter).state, p: chooseBaseballClip(f.pitcher).state, t: (i + 1) * DT }); }
      return out;
    };
    const single = run('single');
    const slideAt = single.find((x) => x.b === 'slide')!.t;
    const throwEnd = single.filter((x) => x.p === 'throw').at(-1)!.t;
    expect(slideAt).toBeGreaterThanOrEqual(throwEnd);   // the throw is out of the hand …
    expect(single.some((x) => x.b === 'run')).toBe(true);
    expect(run('double').some((x) => x.b === 'slide')).toBe(false);
  });
  it('the fielder closes in on its own strafe (toward the ball\'s side) under field_routine, then takes it and throws', () => {
    const s = new BaseballSlots(PITCH_RELEASE_SEC);
    const g = { kind: 'out' as const, q: 0.2, offsetSec: -0.12, missLine: '' };
    s.swing(g); s.contact(g);
    const clips: string[] = [];
    for (let i = 0; i < 60 * 3; i++) { const c = chooseBaseballClip(s.tick(DT).pitcher); clips.push(`${c.state}:${c.clip}`); }
    const order = [...new Set(clips)];
    expect(order.slice(0, 3)).toEqual(['field_routine:strafe_left', 'field_routine:idle_stand', 'throw:baseball_pitch_side']);
    expect(scopeAllows(scopeForMode('baseball'), 'strafe_left')).toBe(true);
  });
});

describe('§3 contact vs power', () => {
  it('contact starts at speed 1.7 and power is at least as fast; the tree plays the swing at that speed', () => {
    expect(SWING_SPEED.contact).toBe(1.7);
    expect(swingSpeedRatio('contact')).toBeCloseTo(1.7, 6);
    expect(swingSpeedRatio('power')).toBeGreaterThanOrEqual(swingSpeedRatio('contact'));
    const r = play(7, ['homer', 'single']);
    const swings = r.plays.batter.filter((p) => p.name === 'baseball_swing_full' || p.name === 'baseball_contact_drive');
    expect(swings.find((p) => p.name === 'baseball_swing_full')?.speedRatio).toBe(SWING_SPEED.contact);
    expect(swings.find((p) => p.name === 'baseball_contact_drive')?.speedRatio).toBe(SWING_SPEED.power);
  });
  it('contact cuts at t 0.42 and blends to the stance; power plays to 0.55, holds, then runs the BAT_RECOVER return', () => {
    const c = new BaseballSlots(PITCH_RELEASE_SEC); c.swing({ kind: 'single', q: 0.4, offsetSec: 0.08, missLine: '' });
    const cf: SlotFrame[] = []; for (let i = 0; i < 40; i++) cf.push(c.tick(DT));
    expect(Math.max(...cf.map((f) => f.batSec ?? 0))).toBeLessThanOrEqual(SWING_STOP_T.contact);
    const cut = cf.findIndex((f) => !f.batter.swinging);
    expect(cut * DT).toBeLessThanOrEqual(SWING_STOP_T.contact / swingSpeedRatio('contact') + DT);
    expect(chooseBaseballClip(cf[cut].batter).state).toBe('stance');
    expect(cf.some((f) => f.powerHold)).toBe(false);

    const p = new BaseballSlots(PITCH_RELEASE_SEC); p.swing({ kind: 'homer', q: 0.9, offsetSec: 0, missLine: '' });
    const pf: SlotFrame[] = []; for (let i = 0; i < 90; i++) pf.push(p.tick(DT));
    const held = pf.filter((f) => f.powerHold);
    expect(held.length * DT).toBeCloseTo(BEAT_SEC.powerHold, 1);
    for (const f of held) expect(f.batSec).toBe(BAT_SWING_SEC);
    const rec = pf.filter((f) => f.batSec != null && f.batSec > BAT_SWING_SEC);
    expect(rec.length).toBeGreaterThan(0);
    expect(Math.max(...rec.map((f) => f.batSec!))).toBeLessThanOrEqual(BAT_SWING_SEC + BAT_RECOVER_SEC + DT);
    expect(pf.findIndex((f) => f.powerHold)).toBeLessThan(pf.findIndex((f) => (f.batSec ?? 0) > BAT_SWING_SEC));
  });
  it('the hit-stop starts when the swing clip reaches its contact key (t 0.3), once per contact', () => {
    for (const kind of ['single', 'homer'] as SwingKind[]) {
      const s = new BaseballSlots(PITCH_RELEASE_SEC); const g = { kind, q: 0.6, offsetSec: 0, missLine: '' };
      s.swing(g); s.contact(g);
      const fs_: SlotFrame[] = []; for (let i = 0; i < 60; i++) fs_.push(s.tick(DT));
      const hits = fs_.map((f, i) => ({ f, i })).filter((x) => x.f.hitStop);
      expect(hits).toHaveLength(1);
      expect(hits[0].f.hitStop).toBe(kind);
      expect(hits[0].f.batSec!).toBeGreaterThanOrEqual(CONTACT_KEY_T);
      expect(fs_[hits[0].i - 1].batSec!).toBeLessThan(CONTACT_KEY_T);
    }
    const src = read('lib/babylon/modes/BaseballInningsMode.ts');
    expect(src).toMatch(/if \(f\.hitStop\) \{\s*ctx\.juice\.hitStop\(hitStopFor\(f\.hitStop\)\)/);
    expect([...src.matchAll(/juice\.hitStop\(/g)]).toHaveLength(1);
  });
});
