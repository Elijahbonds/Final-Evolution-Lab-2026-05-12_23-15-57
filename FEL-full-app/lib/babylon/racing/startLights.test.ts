// vis-race (visual wave 2) — the gantry's three lamps counting the grid down.
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, FreeCamera, Vector3, PBRMaterial } from '@babylonjs/core';
import { GREEN_HOLD_SEC, buildStartLights, lampStates } from './startLights';
import { GO_AT, stepStart, newStart } from './RaceStart';
import { sampleLine } from './racingLine';

describe('which lamps are lit', () => {
  it('one red a beat: 3 → one, 2 → two, 1 → three; dark before the first beat', () => {
    expect(lampStates(-1, null)).toEqual(['off', 'off', 'off']);
    expect(lampStates(3, null)).toEqual(['red', 'off', 'off']);
    expect(lampStates(2, null)).toEqual(['red', 'red', 'off']);
    expect(lampStates(1, null)).toEqual(['red', 'red', 'red']);
  });
  it('green on GO, held for GREEN_HOLD_SEC, then dark', () => {
    expect(lampStates(0, 0)).toEqual(['green', 'green', 'green']);
    expect(lampStates(0, GREEN_HOLD_SEC - 0.01)).toEqual(['green', 'green', 'green']);
    expect(lampStates(0, GREEN_HOLD_SEC)).toEqual(['off', 'off', 'off']);
  });
  it('follows RaceStart\'s own clock: reds land on the beats it announces, green on the frame it says GO', () => {
    let st = newStart(); const seen = new Map<number, string>(); let wentGoLamps = '';
    for (let i = 0; i < 60 * 5; i++) {
      const r = stepStart(st, 1 / 60, false); st = r.state;
      const l = lampStates(st.go ? 0 : st.beat, st.go ? 0 : null);
      if (!st.go) seen.set(st.beat, l.join()); else if (!wentGoLamps) wentGoLamps = l.join();
      if (st.go) break;
    }
    expect(seen.get(3)).toBe('red,off,off'); expect(seen.get(2)).toBe('red,red,off'); expect(seen.get(1)).toBe('red,red,red');
    expect(wentGoLamps).toBe('green,green,green');
    expect(st.t).toBeCloseTo(GO_AT, 1);
  });
});

describe('the lamps, built', () => {
  it('three lamps named for the glow (neon) and NOT for the fixture lights (no lantern / bulb / flood); they change colour, not mesh', () => {
    const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('c', new Vector3(), scene);
    const line = sampleLine([[0, 0, 0], [0, 100, 0], [100, 100, 0], [100, 0, 0]], { loop: true });
    const h = buildStartLights(scene, line, 9, null);
    expect(h.lamps.map((l) => l.name)).toEqual(['__kart_startlight_neon_0', '__kart_startlight_neon_1', '__kart_startlight_neon_2']);
    expect(h.lamps.every((l) => !/^(lantern_|bb_bulb_|flood_|lhead)/i.test(l.name))).toBe(true);
    const col = (i: number): number[] => { const c = (h.lamps[i].material as PBRMaterial).emissiveColor; return [c.r, c.g, c.b].map((v) => +v.toFixed(2)); };
    h.set(2, null);
    expect(col(0)[0]).toBe(1); expect(col(1)[0]).toBe(1); expect(col(2)[0]).toBeLessThan(0.2);   // two red, one dark
    h.set(0, 0.1);
    expect(col(2)[1]).toBe(1);                                                                     // green
    h.set(0, GREEN_HOLD_SEC + 1);
    expect(col(0)[1]).toBeLessThan(0.2);
    const n = scene.meshes.length;
    h.dispose();
    expect(scene.meshes.length).toBeLessThan(n);
    expect(scene.meshes.some((m) => /kart_startlight/.test(m.name))).toBe(false);
  });
});
