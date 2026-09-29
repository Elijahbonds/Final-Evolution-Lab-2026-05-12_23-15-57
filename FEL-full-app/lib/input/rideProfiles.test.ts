// MOVEMENT PLAY P8 (2026-09-26): the ride rows (rideProfiles) — what each binds, the ride switch that keeps the kart and the
// plane session-only until the live probe's 0 misfires, Free Run's own band, the P3 rows kept where they were as the cut
// line, and the card lines of what a mode reads itself (never a binding).
import { describe, it, expect } from 'vitest';
import { rideRows, parseBodyRide, RIDE_ROWS, RIDE_ROWS_ON, RIDE_DEFAULT_ON, RIDE_SWITCHED, RIDE_MODE_LINES, FREERUN_BAND, BODY_RIDE } from './rideProfiles';
import { BODY_PROFILES, P3_RIDE_ROWS, MOVE_LABEL } from './bodyProfiles';

const by = (rows: readonly { key: string }[]) => Object.fromEntries(rows.map((r) => [r.key, r])) as Record<string, (typeof RIDE_ROWS)[number]>;
const binds = (p: (typeof RIDE_ROWS)[number]) => p.bindings.map((b) => `${b.from}→${b.to}:${b.verb}`);

describe('the ride rows', () => {
  it('six of the eight P3 rows\' keys (big air and sprint keep theirs: the modes claim the step), same families, same overhead rule', () => {
    const a = by(RIDE_ROWS_ON), b = by(P3_RIDE_ROWS);
    expect(Object.keys(b).sort()).toEqual(['aeroaces', 'bigair', 'freerun', 'skateboard', 'snowboard_slalom', 'sprint', 'surf', 'velocitykart']);
    expect(Object.keys(a).sort()).toEqual(['aeroaces', 'freerun', 'skateboard', 'snowboard_slalom', 'surf', 'velocitykart']);
    for (const k of Object.keys(a)) {
      expect(a[k].modeId, k).toBe(b[k].modeId);
      expect(a[k].family, k).toBe(b[k].family);
      expect(a[k].overheadIsPlay, k).toBe(b[k].overheadIsPlay);
      expect(a[k].motion, k).toBe('merge');
    }
  });
  it('what each binds (PLAN-P8 §3.2): the carve steers the boards, the crouch pumps / tucks, surf trims on y; the runs keep P3\'s', () => {
    const r = by(RIDE_ROWS_ON);
    expect(binds(r.skateboard)).toEqual(['carve→Lx:STEER', 'squat→RT:PUMP', 'takeoff→A:POP']);
    expect(binds(r.snowboard_slalom)).toEqual(['carve→Lx:STEER', 'squat→RT:TUCK', 'takeoff→A:JUMP']);
    expect(binds(r.surf)).toEqual(['carve→Lx:STEER', 'trim→Ly:TRIM', 'takeoff→A:AIR']);
    // big air and sprint: the table keeps the P3 row, the mode's claim takes the step off the floor
    expect(binds(BODY_PROFILES.bigair)).toEqual(['step→dpadByFoot:STRIDE']);
    expect(binds(BODY_PROFILES.sprint)).toEqual(['step→dpadByFoot:STRIDE']);
    expect(binds(r.freerun)).toEqual(['cadence→Ly:RUN', 'highKnees→RT:SPRINT', 'takeoff→A:JUMP']);
    expect(binds(r.velocitykart)).toEqual(['grip→RT:GAS', 'wheel→Lx:STEER', 'hopTurn→X:DRIFT']);
    expect(binds(r.aeroaces)).toEqual(['spread→RT:GAS', 'wingBank→Lx:STEER', 'wingPitch→Ly:CLIMB']);
    const fr = r.freerun.bindings.find((b) => b.from === 'cadence') as { minHz?: number; fullHz?: number };
    expect([fr.minHz, fr.fullHz]).toEqual([FREERUN_BAND.minHz, FREERUN_BAND.fullHz]);
  });
  it('never a flip, a handspring or a cartwheel off the body; no board row presses B / Y / X (the pad keeps them); only the kart\'s drift holds X', () => {
    for (const p of RIDE_ROWS_ON) for (const b of p.bindings) {
      expect(['B', 'Y', 'LB', 'RB', 'START', 'SELECT'].includes(b.to), `${p.key} ${b.from}`).toBe(false);
      if (b.to === 'X') expect(`${p.key}:${b.from}`).toBe('velocitykart:hopTurn');
      expect(/FLIP|HANDSPRING|CARTWHEEL/.test(b.verb), `${p.key} ${b.verb}`).toBe(false);
    }
  });
});

describe('the ride switch (kart and plane bind only on the live probe\'s 0 misfires)', () => {
  it('switched off (the cut line), the kart and the plane are session-only (no bindings) and READY says coming (later P8); the live probe\'s 0 misfires turned both on', () => {
    expect([...RIDE_DEFAULT_ON].sort()).toEqual(['aeroaces', 'velocitykart']);
    const off = by(rideRows(new Set()));
    for (const k of RIDE_SWITCHED) { expect(off[k].bindings, k).toEqual([]); expect(off[k].later, k).toBe('P8'); }
    // the other four bind whatever the switch says
    for (const k of ['skateboard', 'snowboard_slalom', 'surf', 'freerun']) expect(off[k].bindings.length, k).toBeGreaterThan(0);
  });
  it('parseBodyRide: a comma list of switched keys; 1 / all = both; anything else is ignored', () => {
    expect([...parseBodyRide(undefined)]).toEqual([]);
    expect([...parseBodyRide('')]).toEqual([]);
    expect([...parseBodyRide('velocitykart')]).toEqual(['velocitykart']);
    expect([...parseBodyRide(' aeroaces , velocitykart ')].sort()).toEqual(['aeroaces', 'velocitykart']);
    expect([...parseBodyRide('1')].sort()).toEqual(['aeroaces', 'velocitykart']);
    expect([...parseBodyRide('all')].sort()).toEqual(['aeroaces', 'velocitykart']);
    expect([...parseBodyRide('skateboard,dunk')]).toEqual([]);
  });
  it('this build (the test env sets no switch): the defaults alone bind the kart and the plane, as the rows with the switch on', () => {
    expect([...BODY_RIDE].sort()).toEqual(['aeroaces', 'velocitykart']);
    expect(BODY_PROFILES.velocitykart.bindings).toEqual(by(RIDE_ROWS_ON).velocitykart.bindings);
    expect(BODY_PROFILES.aeroaces.bindings).toEqual(by(RIDE_ROWS_ON).aeroaces.bindings);
    expect(BODY_PROFILES.skateboard.bindings.map((b) => b.from)).toContain('carve');
  });
});

describe('the card: what a mode reads itself is a line, never a binding (R-F3)', () => {
  it('the five modes\' own verbs, in the plan\'s words; none of them is a binding anywhere', () => {
    const verbs = (k: string) => RIDE_MODE_LINES[k].map((l) => l.verb);
    expect(verbs('skateboard')).toEqual(['GRAB', 'SPIN', 'PUSH']);
    expect(verbs('snowboard')).toEqual(['GRAB', 'SPIN']);
    expect(verbs('surf')).toEqual(['GRAB', 'CUTBACK', 'SPIN']);
    expect(verbs('bigair')).toEqual(['RUN-UP', 'SPIN', 'GRAB']);
    expect(verbs('sprint')).toEqual(['STRIDE', 'DIP']);
    for (const p of Object.values(BODY_PROFILES)) for (const b of p.bindings) expect(Object.keys(MOVE_LABEL), `${p.key} ${b.from}`).toContain(b.from);
    for (const lines of Object.values(RIDE_MODE_LINES)) for (const l of lines) expect(l.move).not.toMatch(/^[A-Z]+$/);
  });
});

describe('the P3 rows: the cut line, kept verbatim', () => {
  it('lean / squat / takeoff on the boards, the step d-pad on the runs, the cadence on Free Run (the shared band), nothing on kart and plane', () => {
    const p = by(P3_RIDE_ROWS);
    expect(binds(p.skateboard)).toEqual(['lean→Lx:STEER', 'squat→RT:PUMP', 'takeoff→A:POP']);
    expect(binds(p.snowboard_slalom)).toEqual(['lean→Lx:STEER', 'squat→RT:TUCK', 'takeoff→A:JUMP']);
    expect(binds(p.surf)).toEqual(['lean→Lx:STEER', 'takeoff→A:AIR']);
    expect(binds(p.bigair)).toEqual(['step→dpadByFoot:STRIDE']);
    expect(binds(p.sprint)).toEqual(['step→dpadByFoot:STRIDE']);
    expect(binds(p.freerun)).toEqual(['cadence→Ly:RUN', 'takeoff→A:JUMP']);
    expect(p.freerun.bindings[0]).not.toHaveProperty('minHz');
    expect(p.velocitykart.bindings).toEqual([]);
    expect(p.aeroaces.bindings).toEqual([]);
  });
});
