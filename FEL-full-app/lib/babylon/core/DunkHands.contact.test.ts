// CONTACT-RIM-SOUND (2026-10-22) — K-SFX1–4 (DUNK-MODE-PLAN §11.3) on the pure side: the jam's contact decision (`jamIronStep`)
// and the hook latch (`DunkHookLatch`), driven frame by frame the way DunkMode's jam drives them. The mode's wiring of the same
// calls is pinned in modes/DunkMode.contactSfx.test.ts.
import { describe, it, expect } from 'vitest';
import { ironContact, IRON_CONTACT_TIMEOUT_SEC, type V3 } from './DunkHands';
import { jamIronStep, JAM_SHORT_SEC, DunkHookLatch, dunkHooks, type DunkMissKind } from './DunkContact';
import { ringDistance, ringClearance } from './RimFlush';

const RIM: V3 = { x: 0, y: 3.05, z: -10.28 };
const RIM_R = 0.225, BALL_R = 0.12, DT = 1 / 60;

type Ev = { frame: number; what: string };
interface Attempt { events: Ev[]; contacts: number; misses: DunkMissKind[]; punches: number }

/** One attempt, frame by frame, as DunkMode's jam runs it: the press is frame 0, the ball in the palm follows `path(t)`, the
 *  geometric contact logs `[HANDS] iron contact`, punches (latched) and emits onContact on that frame; SHORT emits onMiss. */
function runJam(path: (t: number) => V3, opts: { untilSec?: number; rimMiss?: boolean; latch?: DunkHookLatch } = {}): Attempt {
  const latch = opts.latch ?? new DunkHookLatch();
  const out: Attempt = { events: [], contacts: 0, misses: [], punches: 0 };
  let frame = 0, contactLatch = false;
  latch.reset();
  latch.set({
    onContact: () => { out.contacts++; out.events.push({ frame, what: 'onContact' }); },
    onMiss: (k) => { out.misses.push(k); out.events.push({ frame, what: `onMiss:${k}` }); },
  });
  const punch = () => { if (contactLatch) return; contactLatch = true; out.punches++; out.events.push({ frame, what: 'punch' }); };
  if (opts.rimMiss) { latch.miss('rim', { source: 'player' }); return out; }   // resolveDunk's clank: the jam never runs
  let jamSec = 0, jamContact = false;
  const until = opts.untilSec ?? 1.2;
  while (jamSec >= 0 && !jamContact && jamSec <= until) {
    frame++; jamSec += DT;
    const step = jamIronStep({ ball: path(jamSec), rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: jamSec, centred: true });
    if (step?.kind === 'contact') {
      jamContact = true;
      out.events.push({ frame, what: '[HANDS] iron contact' });
      punch(); latch.contact('dunk_finish', step.quality, 'sweet', { source: 'player' });
    } else if (step?.kind === 'short') {
      jamSec = -1; latch.miss('short', { source: 'player' });
    }
  }
  // the rest of the attempt (flush, hang, land): every frame that tries the hooks again is refused by the latch
  for (let i = 0; i < 40; i++) { frame++; latch.contact('dunk_finish', 'clean', 'sweet', { source: 'player' }); latch.miss('short', { source: 'player' }); }
  return out;
}

const lerp = (a: V3, b: V3, k: number): V3 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
/** The ball carried from `from` to `to` over `sec` seconds, then held there. */
const carry = (from: V3, to: V3, sec: number) => (t: number): V3 => lerp(from, to, Math.min(1, t / sec));
/** A ball held outside the ring at the rim's height — 0.45 m out, ~0.1 m of daylight past touching the iron. */
const OUTSIDE: V3 = { x: 0, y: RIM.y + 0.02, z: RIM.z + 0.45 };

describe('K-SFX1 — a geometric contact emits exactly one onContact, on the frame of [HANDS] iron contact', () => {
  it('a centred jam from 0.33 m over the ring: one contact, one punch, one onContact, all on the same frame', () => {
    const a = runJam(carry({ x: 0, y: RIM.y + 0.33, z: RIM.z + 0.05 }, { x: 0, y: RIM.y + 0.02, z: RIM.z + 0.02 }, 0.2));
    expect(a.contacts).toBe(1);
    expect(a.punches).toBe(1);
    expect(a.misses).toEqual([]);
    const log = a.events.filter((e) => e.what === '[HANDS] iron contact');
    const hook = a.events.filter((e) => e.what === 'onContact');
    expect(log).toHaveLength(1);
    expect(hook).toHaveLength(1);
    expect(hook[0].frame).toBe(log[0].frame);
    expect(a.events.find((e) => e.what === 'punch')!.frame).toBe(log[0].frame);
  });
  it('the contact frame is the first frame the ball is at the iron by geometry — never earlier, whatever sincePress says', () => {
    const path = carry({ x: 0, y: RIM.y + 0.33, z: RIM.z + 0.05 }, { x: 0, y: RIM.y + 0.02, z: RIM.z + 0.02 }, 0.5);   // arrives late, after the 0.28 s timeout
    const a = runJam(path);
    const f = a.events.find((e) => e.what === 'onContact')!.frame;
    expect(f * DT).toBeGreaterThan(IRON_CONTACT_TIMEOUT_SEC);
    for (let i = 1; i < f; i++) expect(ironContact({ ball: path(i * DT), rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0, centred: true })).toBe(false);
    expect(ironContact({ ball: path(f * DT), rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0, centred: true })).toBe(true);
  });
  it('a ball meeting the metal from the front reads as a rim hit; one down the middle reads clean', () => {
    expect(jamIronStep({ ball: { x: 0, y: 3.10, z: RIM.z + 0.34 }, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0.1, centred: true })).toEqual({ kind: 'contact', quality: 'rimHit' });
    expect(jamIronStep({ ball: { x: 0, y: 3.07, z: RIM.z }, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0.1, centred: true })).toEqual({ kind: 'contact', quality: 'clean' });
  });
});

describe('K-SFX2 — the timeout never contacts', () => {
  it('ball held outside the ring with sincePress ≥ 0.28, run to 0.60 s: 0 onContact, 1 onMiss(short)', () => {
    // the old contract still holds for ironContact itself (true on its timeout) — the jam no longer asks it that question
    expect(ironContact({ ball: OUTSIDE, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: IRON_CONTACT_TIMEOUT_SEC, centred: true })).toBe(true);
    for (let t = IRON_CONTACT_TIMEOUT_SEC; t < JAM_SHORT_SEC - 1e-9; t += DT) {
      expect(jamIronStep({ ball: OUTSIDE, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: t, centred: true })).toBeNull();
    }
    const a = runJam(() => OUTSIDE, { untilSec: JAM_SHORT_SEC + DT });
    expect(a.contacts).toBe(0);
    expect(a.punches).toBe(0);
    expect(a.misses).toEqual(['short']);
    const miss = a.events.find((e) => e.what === 'onMiss:short')!;
    expect(miss.frame * DT).toBeGreaterThanOrEqual(JAM_SHORT_SEC - 1e-9);
    expect(miss.frame * DT).toBeLessThan(JAM_SHORT_SEC + DT + 1e-9);
    expect(JAM_SHORT_SEC).toBe(0.60);
  });
  it('a timeout passed in the input is ignored — only geometry or the short safety resolve the jam', () => {
    expect(jamIronStep({ ball: OUTSIDE, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0.5, timeout: 0.05, centred: true })).toBeNull();
    expect(jamIronStep({ ball: OUTSIDE, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0.6, timeout: 0.05, centred: true })).toEqual({ kind: 'short' });
  });
});

describe('K-SFX3 — a release short of the iron never contacts', () => {
  it('the old else-branch case (a late slam with 9 cm of daylight at the timeout): no release, 0 onContact, a short miss', () => {
    // 9 cm of daylight between the ball and the iron, at the ring's height, out in front
    const daylight: V3 = { x: 0, y: RIM.y, z: RIM.z + RIM_R + ringClearance(BALL_R) + 0.09 };
    expect(ringDistance(daylight, RIM, RIM_R) - ringClearance(BALL_R)).toBeCloseTo(0.09, 6);
    expect(ironContact({ ball: daylight, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: IRON_CONTACT_TIMEOUT_SEC, centred: true })).toBe(true);   // the old release
    expect(jamIronStep({ ball: daylight, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: IRON_CONTACT_TIMEOUT_SEC, centred: true })).toBeNull();
    const a = runJam(() => daylight);
    expect(a.contacts).toBe(0);
    expect(a.punches).toBe(0);
    expect(a.misses).toEqual(['short']);
  });
});

describe('K-SFX4 — every hook fires at most once per attempt over 5 seeded attempts', () => {
  it('make, rim miss, short, late make, rim-hit make: ≤ 1 of each hook, and never both a contact and a miss', () => {
    let seed = 0x5eed;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const latch = new DunkHookLatch();
    const attempts: Attempt[] = [
      runJam(carry({ x: (rnd() - 0.5) * 0.06, y: RIM.y + 0.3 + rnd() * 0.05, z: RIM.z + 0.05 }, { x: 0, y: RIM.y + 0.02, z: RIM.z }, 0.15 + rnd() * 0.1), { latch }),
      runJam(() => OUTSIDE, { rimMiss: true, latch }),
      runJam(() => ({ x: 0, y: RIM.y, z: RIM.z + 0.45 + rnd() * 0.2 }), { latch }),
      runJam(carry({ x: 0, y: RIM.y + 0.33, z: RIM.z + 0.06 }, { x: 0, y: RIM.y + 0.02, z: RIM.z + 0.01 }, 0.4 + rnd() * 0.15), { latch }),
      runJam(carry({ x: 0, y: RIM.y + 0.05, z: RIM.z + 0.6 }, { x: 0, y: RIM.y + 0.05, z: RIM.z + 0.3 + rnd() * 0.02 }, 0.2), { latch }),
    ];
    for (const a of attempts) {
      expect(a.contacts).toBeLessThanOrEqual(1);
      expect(a.misses.length).toBeLessThanOrEqual(1);
      expect(a.punches).toBeLessThanOrEqual(1);
      expect(a.contacts + a.misses.length).toBe(1);   // exclusive, and every attempt resolves
      expect(a.punches).toBe(a.contacts);             // the punch only ever rides a contact
    }
    expect(attempts.map((a) => a.contacts ? 'contact' : a.misses[0])).toEqual(['contact', 'rim', 'short', 'contact', 'contact']);
  });
  it('the latch refuses a second call until reset, and a throwing listener never breaks the dunk', () => {
    const l = new DunkHookLatch();
    let n = 0;
    l.set({ onContact: () => { n++; throw new Error('listener'); }, onMiss: () => { n += 100; } });
    expect(l.contact('k', 'clean', 'big', { source: 'rival', actorId: 'r1' })).toBe(true);
    expect(l.contact('k', 'clean', 'big', { source: 'rival', actorId: 'r1' })).toBe(false);
    expect(l.miss('short', { source: 'rival', actorId: 'r1' })).toBe(false);
    expect(n).toBe(1);
    l.reset();
    expect(l.miss('short', { source: 'player' })).toBe(true);
    expect(n).toBe(101);
    expect(dunkHooks).toBeInstanceOf(DunkHookLatch);
  });
});
