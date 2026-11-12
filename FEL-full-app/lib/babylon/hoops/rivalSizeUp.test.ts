// hoops-p06 (1v1/3v3 phase 6 "flow and pace": the rival possession medians): the 1v1 rival SIZES UP at the top before he attacks
// (`hoops.rivalSizeUpSec`), the 3v3 first touch probes longer (`hoops.teamSizeUpSec`); 0 is the release's possession exactly.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { RivalKit, RIVAL_SIZE_UP_SEC, SIZE_UP_TIER, SIZE_UP_AT_M } from './rivalOffense';
import { TeamOffense3v3, TEAM_SIZE_UP_SEC } from './teamOffense3v3';
import { AttackerBrain, CHECK_HOLD_SEC, SHOT_CLOCK_SEC } from '../core/BasketballCore';
import { TEAM_READS } from '../modes/threevthreeRules';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

afterEach(() => resetFeelForTests());
const DT = 1 / 60;
const RIM = new Vector3(0, 0, -0.6);
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const knob = (id: string, v: number) => { setFeelUser(true); setFeelSession(null); setFeelOverride(id, v); };

/** One rival possession against a defender 1.0 m in front on his line to the rim (he moves at his wish). */
function poss(tier: 'rookie' | 'pro' | 'elite', seed = 7, jumpAt = -1) {
  const b = new AttackerBrain(seeded(seed)); b.useKit(new RivalKit(tier, seeded(seed + 1)));
  const self = new Vector3(0, 0, 9.2);
  const rows: { t: number; phase: string; action: string | null; rim: number; exposure: number }[] = [];
  let shotAt = -1;
  for (let t = 0; t < 16; t += DT) {
    const d0 = RIM.subtract(self); d0.y = 0; d0.normalize();
    const def = self.add(d0.scale(1.0));
    const air = jumpAt >= 0 && t >= jumpAt && t < jumpAt + 0.5;
    const d = b.decide(DT, self, def, RIM, { defenderAirborne: air });
    self.addInPlace(d.wish.scale(DT));
    rows.push({ t, phase: d.phase, action: d.action ?? null, rim: Math.hypot(self.x - RIM.x, self.z - RIM.z), exposure: d.exposure });
    if (d.shot) { shotAt = t; break; }
  }
  return { rows, shotAt };
}

describe('the 1v1 rival sizes you up', () => {
  it('ships at 4 s (× the tier); the knob row carries it', () => {
    expect(RIVAL_SIZE_UP_SEC).toBe(4);
    expect(FEEL_KNOB_BY_ID.get('hoops.rivalSizeUpSec')?.def).toBe(RIVAL_SIZE_UP_SEC);
    expect(SIZE_UP_TIER.rookie).toBeLessThan(SIZE_UP_TIER.pro); expect(SIZE_UP_TIER.elite).toBeGreaterThan(SIZE_UP_TIER.pro);
  });
  it('works at the top before he goes: no gather and no rim run inside the size-up, and probe moves while he works', () => {
    const { rows } = poss('pro');
    const until = CHECK_HOLD_SEC + RIVAL_SIZE_UP_SEC * SIZE_UP_TIER.pro * 0.75;   // the shortest a PRO size-up runs
    const early = rows.filter((r) => r.t > CHECK_HOLD_SEC && r.t < until);
    expect(early.every((r) => r.phase !== 'gather' && r.phase !== 'blowby')).toBe(true);
    expect(Math.min(...early.map((r) => r.rim))).toBeGreaterThan(SIZE_UP_AT_M - 1.2);
    expect(early.filter((r) => r.action).length).toBeGreaterThanOrEqual(1);
  });
  it('the possession is longer by the size-up, and the shot clock still allows the full attack after it', () => {
    const on = poss('pro'); knob('hoops.rivalSizeUpSec', 0); const off = poss('pro');
    expect(on.shotAt).toBeGreaterThan(off.shotAt + 2);
    expect(on.shotAt).toBeLessThanOrEqual(CHECK_HOLD_SEC + RIVAL_SIZE_UP_SEC * SIZE_UP_TIER.pro * 1.25 + SHOT_CLOCK_SEC + 0.6);
  });
  it('0 attacks off the check, as the release did: a man in front gets a move on the first frame after it', () => {
    const first = (): string => poss('pro').rows.find((r) => r.t > CHECK_HOLD_SEC + 0.02)!.phase;
    expect(first()).toBe('drive');   // on: working at the top
    knob('hoops.rivalSizeUpSec', 0);
    expect(['sidestep', 'hesi', 'spin', 'post']).toContain(first());
  });
  it('a jump at nothing at the top is punished by the tiers that read it (ELITE goes by it, most of the time)', () => {
    let went = 0;
    for (let s = 1; s <= 20; s++) { const { rows } = poss('elite', s, 1.4); if (rows.some((r) => r.t >= 1.4 && r.t < 2.2 && r.phase === 'blowby')) went++; }
    expect(went).toBeGreaterThanOrEqual(14);
  });
});

describe('the 3v3 first touch probes longer', () => {
  it('ships at 1.5 s; the knob row carries it; 0 is the release probe', () => {
    expect(TEAM_SIZE_UP_SEC).toBe(1.5);
    expect(FEEL_KNOB_BY_ID.get('hoops.teamSizeUpSec')?.def).toBe(TEAM_SIZE_UP_SEC);
    const probeTime = (): number => {
      const t = new TeamOffense3v3('pro', TEAM_READS, seeded(3)); t.beginPossession(); t.beginTouch({ fresh: true, intent: 'around' });
      const v = { handler: { x: 0, z: 8 }, handlerVel: { x: 0, z: 0 }, mates: [{ x: -5, z: 6 }, { x: 5, z: 6 }], defenders: [{ x: 0, z: 6.9 }, { x: -4, z: 5 }, { x: 4, z: 5 }], rim: { x: 0, z: -0.6 }, screen: null };
      let n = 0; for (let i = 0; i < 1200; i++) { const s = t.step(DT, v); if (s.phase !== 'probe' && n > 0) break; if (s.phase === 'probe') n++; }
      return n * DT;
    };
    const on = probeTime(); knob('hoops.teamSizeUpSec', 0); const off = probeTime();
    expect(on - off).toBeCloseTo(TEAM_SIZE_UP_SEC, 1);
  });
});
