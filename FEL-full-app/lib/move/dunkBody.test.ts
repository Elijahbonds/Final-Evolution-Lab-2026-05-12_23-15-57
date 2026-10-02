// P5 — a synthetic body dunks; a stand, a slow walk, and a wave do not; a hop is not a max jump;
// stepping out of frame pauses. No camera, no scene, no video.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';
import type { BodyIntent } from '@/lib/babylon/core/BodySession';
import { LOST_PAUSE_MS } from '@/lib/babylon/core/BodySession';
import type { BodyPacket } from '@/lib/babylon/core/InputBus';
import { bodyButtonAction, bodyPlayOffer } from '@/lib/move/bodyPlayChoice';
import { DUNK_BODY, DUNK_FULL_RISE_M, dunkBodyReplay } from '@/lib/move/dunkBody';
import { dunkRead, duelRead } from '@/lib/pose/baseline';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { bodyPackets } from '@/lib/pose/seamReplay';
import { restPose, synthesize, type Joints } from '@/lib/pose/synth';
import { armsSwing, dropout, hold, jogBeat, script, scriptedJump, type Beat } from '@/lib/pose/streamKit';
import { waveBeat } from '@/lib/pose/rideKit';

const R = restPose();
const shoot = (beats: Beat[]): PoseFrame[] => synthesize(script(beats), { seed: 17, noise: false, fps: 30 }).frames;

/**
 * The scripted jump, with the arms driven down through the apex so the strike is in the air.
 * `dip` is the gather. A small hop uses a shallower one so it still leaves the floor inside the
 * contest's runway (the hold-run reaches the line in LINE_SEC_MIN, ~0.9 s, and launches on its own).
 */
function dunkJump(base: Joints, v0: number, dip = 0.28): Beat {
  const J = scriptedJump(base, v0, dip, 0.12, false);
  const apex = J.tOff + (J.tLand - J.tOff) / 2;
  const pose = (t: number): Joints => {
    const body = J.pose(t);
    let u = 0;
    if (t > 0 && t < J.tOff) u = -0.15 + 1.15 * Math.min(1, t / J.tOff);
    else if (t >= J.tOff && t < apex + 0.12) u = 1 - (t - J.tOff) / (apex + 0.12 - J.tOff);
    return armsSwing(body, u);
  };
  return [J.end, pose];
}

// Cadence locks partway through the jog. The jump has to leave the floor before the hold-run's line
// (LINE_SEC_MIN), or the contest launches on the line and reads the take-off as an early slam.
const approach = (): Beat[] => [hold(R, 1.2), jogBeat(R, 1.35, 2.6, 0.22)];

describe('a body dunk, on synthetic streams', () => {
  const clean = dunkBodyReplay(shoot([...approach(), dunkJump(R, 3.2)]));
  const hop = dunkBodyReplay(shoot([...approach(), dunkJump(R, 2.05, 0.12)]));
  const stand = dunkBodyReplay(shoot([hold(R, 2.5)]));
  const walk = dunkBodyReplay(shoot([hold(R, 1.2), jogBeat(R, 2.2, 1.05, 0.1)]));
  const wave = dunkBodyReplay(shoot([hold(R, 1.2), waveBeat(R, 2.2)]));

  it('a clean jump dunks, in the contest and in the duel', () => {
    const contest = dunkRead(clean.events);
    const duel = duelRead(clean.events);
    expect(contest.launchBy, JSON.stringify({ contest, power: clean.power01, height: clean.heightM })).toBe('A on the run');
    expect(contest.made, JSON.stringify({ contest, power: clean.power01, height: clean.heightM })).toBe(true);
    expect(duel.hit, JSON.stringify(duel)).toBe(true);
    expect(duel.launchBy).toBe('A on the run');
    expect(clean.heightM).toBeGreaterThan(0);
  });

  it('a small hop is not a max jump', () => {
    expect(hop.power01).toBeLessThan(1);
    expect(hop.power01).toBeLessThan(clean.power01);
    expect(hop.heightM).toBeLessThan(DUNK_FULL_RISE_M);
    expect(dunkRead(hop.events).chargePeak).toBeLessThan(1);
  });

  it('standing, walking, and waving press no dunk', () => {
    for (const [name, run] of [['stand', stand], ['walk', walk], ['wave', wave]] as const) {
      const read = dunkRead(run.events);
      expect(read.made, name).toBe(false);
      expect(read.launch, name).toBeNull();
      expect(run.events.some((e) => e.e.t === 'button' && e.e.pressed), name).toBe(false);
    }
  });
});

describe('dunk offers play, and stepping out pauses', () => {
  it('the card is play, so the Body button starts the check', () => {
    const seam = bodySeamFor({ modeId: 'dunk', body: DUNK_BODY, onBody: () => true });
    expect(seam.drives).toBe(true);
    expect(bodyPlayOffer(seam.card)).toBe('play');
    expect(bodyButtonAction({ ...seam.card, phase: 'ready' }, false)).toBe('begin');
    expect(bodyButtonAction({ ...seam.card, phase: 'playing' }, false)).toBe('begin-paused');
  });

  it('the contest and the duel both bind this, so the live card is the one above', () => {
    const root = join(__dirname, '..', '..');
    const dunk = readFileSync(join(root, 'lib/babylon/modes/DunkMode.ts'), 'utf8');
    const duel = readFileSync(join(root, 'lib/babylon/modes/DunkDuelMode.ts'), 'utf8');
    for (const src of [dunk, duel]) {
      expect(src).toContain('body: DUNK_BODY');
      expect(src).toContain('dunkBody.see(ev)');
      expect(src).toContain('bodySlamClip');
    }
  });

  it('stepping out of frame pauses', () => {
    const frames = shoot([hold(R, 3.2)]);
    const holeAt = frames[Math.floor(frames.length * 0.45)].t;
    const packets = bodyPackets(dropout(frames, holeAt, holeAt + LOST_PAUSE_MS + 800));
    const { session } = bodySeamFor({ modeId: 'dunk', body: DUNK_BODY, onBody: () => true });
    const intents: BodyIntent[] = [];
    let phase: 'playing' | 'paused' = 'playing';
    let last = -Infinity;
    session.begin(packets[0]?.arrivedAt ?? 0, 'body');
    session.noteInput('body', packets[0]?.arrivedAt ?? 0);
    const take = (xs: BodyIntent[]): void => {
      for (const x of xs) {
        intents.push(x);
        if (x === 'pause-lost' || x === 'pause-stall') phase = 'paused';
      }
    };
    for (const p of packets) {
      const gap = p.arrivedAt - (last < 0 ? p.arrivedAt : last);
      if (gap > 40) {
        for (let now = (last < 0 ? p.arrivedAt : last) + 16; now < p.arrivedAt; now += 16) take(session.tick(phase, now, last).intents);
      }
      take(session.step(phase, p as BodyPacket, p.arrivedAt).intents);
      last = p.arrivedAt;
    }
    const tail = (last < 0 ? 0 : last) + LOST_PAUSE_MS + 400;
    for (let now = last + 16; now <= tail; now += 16) take(session.tick(phase, now, last).intents);
    expect(intents).toContain('pause-lost');
  });
});
