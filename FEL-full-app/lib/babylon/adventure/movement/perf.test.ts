// The phone budget, roughly (lane A1): the BR's 16 bodies — runners, grinders, flyers — stepped at 60 Hz must cost a
// small slice of a 33 ms phone frame. This is a coarse guard against a pathological regression (a per-tick rebuild of
// the rail index, a quadratic catch), not a benchmark: the bound is ~20× what this machine measures.
import { describe, expect, it } from 'vitest';
import type { RailNetwork } from '../contracts';
import { createMovementSystem } from './index';
import { fakeWorld, makeActor, Runner } from './testkit';
import { addParallelSwitches } from '../rails/adapters';

describe('movement: 16 bodies at 60 Hz', () => {
  it('ten simulated seconds well inside the budget', () => {
    const segs: RailNetwork['segments'] = [];
    for (let i = 0; i < 12; i++) segs.push({ id: `r${i}`, points: [{ x: i * 3, y: 1.2, z: 4 }, { x: i * 3, y: 1.2, z: 200 }], speedBias: 0, switches: [] });
    const world = fakeWorld({ rails: addParallelSwitches({ id: 'perf', segments: segs }) });
    const sys = createMovementSystem({ bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 } });
    const r = new Runner(world, [sys]);
    for (let i = 0; i < 16; i++) {
      const a = world.add(makeActor(`b${i}`, i === 0 ? 'player' : 'bot', { team: i, pos: { x: (i % 12) * 3, y: 0, z: 0 } }));
      if (i >= 12) { a.fusion = { active: true, tier: 1, meter: 1, remainingSec: 99, partnerId: null, element: 'wind', grantsFlight: true }; a.wantsFlight = true; a.stats.energy.cur = a.stats.energy.max = 1e6; }
      const inp = r.input(a.id);
      inp.move.y = 1; inp.camYaw = i >= 12 ? i : 0; inp.dashHeld = i >= 14; inp.jumpHeld = i < 12;
    }
    r.tick(30);
    for (let i = 0; i < 12; i++) r.press(`b${i}`, 'jump');
    const t0 = performance.now();
    r.run(10, (t) => { if (Math.round(t * 60) % 90 === 0) for (let i = 0; i < 16; i++) r.press(`b${i}`, 'jump'); });
    const ms = performance.now() - t0;
    const perTick = ms / 600;
    expect(world.actors.get('b3')!.state === 'grind' || r.of('rail:enter').length > 0).toBe(true);
    expect(perTick).toBeLessThan(2);
    // eslint-disable-next-line no-console
    console.log(`[A1 perf] 16 bodies: ${perTick.toFixed(3)} ms per 60 Hz tick (${ms.toFixed(0)} ms for 10 s)`);
  });
});
