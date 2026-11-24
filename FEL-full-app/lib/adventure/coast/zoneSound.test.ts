import { describe, expect, it } from 'vitest';
import { COAST_OCEAN_BED, COAST_STEP, CoastSoundscape, coastSurface, nearestShore, shoreGain, type CoastCue, type CoastCueOpts } from './zoneSound';
import { DECKS, DOCK_Z, mainlandShoreX, SEA_Y, terrainY } from './zoneLayout';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { SoundKit, shouldStartMoodBed } from '@/lib/babylon/audio/SoundKit';

function scape() {
  const played: Array<[CoastCue, CoastCueOpts]> = [];
  const s = new CoastSoundscape((n, o) => played.push([n, o]), () => 0.5);
  return { s, played, tags: () => played.map(([, o]) => o.tag) };
}

describe('the Coast sound (improve pass phase 5)', () => {
  it('the knob ships on and its 0 is the old behaviour (no bed asked for)', () => {
    const k = FEEL_KNOB_BY_ID.get('coast.oceanBed')!;
    expect(k.def).toBe(COAST_OCEAN_BED);
    expect(k.min).toBe(0);
  });

  it('asking for the ocean bed in load keeps the harness from starting its stadium crowd (AMBIENT FIX)', () => {
    SoundKit.stopAmbient();
    expect(shouldStartMoodBed(SoundKit.ambientKind())).toBe(true);   // knob 0: nothing asked, the harness's mood bed would play
    SoundKit.startAmbient('ocean');                                   // knob 1: the zone's load
    expect(SoundKit.ambientKind()).toBe('ocean');
    expect(shouldStartMoodBed(SoundKit.ambientKind())).toBe(false);
    SoundKit.stopAmbient();
  });

  it('the surface under you: the dock\'s boards, the shallows, the sand', () => {
    const dock = DECKS.find((d) => d.id === 'dock')!;
    expect(coastSurface((dock.minX + dock.maxX) / 2, DOCK_Z)).toBe('boards');
    const shore = mainlandShoreX(60);
    expect(terrainY(shore + 20, 60)).toBeGreaterThan(SEA_Y);
    expect(coastSurface(shore + 20, 60)).toBe('sand');
    expect(terrainY(shore - 3, 60)).toBeLessThan(SEA_Y);
    expect(coastSurface(shore - 3, 60)).toBe('shallows');
  });

  it('steps by surface, one per 0.8 m, none standing', () => {
    const r = scape();
    const x = mainlandShoreX(60) + 20;
    for (let i = 0; i < 70; i++) r.s.update(1 / 60, { x, z: 60, speed: 4, grounded: true }, 0);
    expect(r.tags().filter((t) => t === 'coast.step.sand').length).toBe(Math.floor((4 * 70) / 60 / COAST_STEP.every));
    r.played.length = 0;
    for (let i = 0; i < 60; i++) r.s.update(1 / 60, { x, z: 60, speed: 0, grounded: true }, 0);
    expect(r.tags().filter((t) => t.startsWith('coast.step'))).toHaveLength(0);
  });

  it('waves are heard near the water and not far inland; gulls come and go', () => {
    const near = scape();
    const x0 = mainlandShoreX(60);
    for (let i = 0; i < 60 * 20; i++) near.s.update(1 / 60, { x: x0 + 4, z: 60, speed: 0, grounded: true }, 0);
    const waves = near.played.filter(([n]) => n === 'wave');
    expect(waves.length).toBeGreaterThanOrEqual(3);
    expect(waves[0][1].volume).toBeGreaterThan(0.5);
    expect(near.tags().filter((t) => t === 'coast.gull').length).toBeGreaterThanOrEqual(1);
    const inland = scape();
    for (let i = 0; i < 60 * 20; i++) inland.s.update(1 / 60, { x: 190, z: 60, speed: 0, grounded: true }, 0);
    const far = inland.played.filter(([n]) => n === 'wave');
    expect(far.every(([, o]) => o.volume < waves[0][1].volume)).toBe(true);
  });

  it('the nearest shore is the island\'s when you stand on it', () => {
    const [sx] = nearestShore(-40, -40);   // Palm Key's middle
    expect(Math.abs(sx - mainlandShoreX(-40))).toBeGreaterThan(50);
    expect(shoreGain(0)).toBe(1);
    expect(shoreGain(1000)).toBe(0);
  });
});
