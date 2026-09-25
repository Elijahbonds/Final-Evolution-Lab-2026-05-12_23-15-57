// HOTFIX (2026-09-24): removing the dead /audio/sfx_*.mp3 presets left some events with NO preset at all (Big Air
// trickTap; IRL runStart / firstRun / noBeat / h2hScore / submitted; Story roll / hop / land / bonus). Those events
// must still reach the skin's onSensory hook: a host listens there. The air, IRL and story cores call onSensory
// outside their `if (fx)` today, but court-rally-core returns early on a missing preset, so a later refactor could
// silently kill the hooks. These pin both halves: every event reaches the hook, and the bus is called for exactly
// the events that still have a preset.

import { describe, it, expect } from 'vitest';
import { SensoryBus } from './sensory-bus';
import { makeBigAirSession, BIG_AIR_SENSORY } from './cores/big-air-skin';
import { makeIrlDunkSession, IRL_DUNK_SENSORY } from './cores/irl-dunk-skin';
import { makeStoryRun, STORY_SENSORY } from './cores/story-skin';

const DT = 1 / 60;

/** The events that should have reached the bus: the ones the preset table still has an entry for. */
function withPreset(seen: string[], table: Record<string, unknown>): string[] {
  return seen.filter((e) => table[e] !== undefined);
}

describe('events that lost their sound-only preset still reach onSensory', () => {
  it('Big Air (the live AirSessionMode core): trickTap reaches the hook, not the bus', () => {
    const bus = new SensoryBus();
    const seen: string[] = [];
    const core = makeBigAirSession(bus, { onSensory: (evt) => seen.push(evt) });
    for (let i = 0; i < 2000 && core.state.phase !== 'Air'; i++) core.step(DT);
    expect(core.state.phase).toBe('Air');
    const beforeTrick = bus.stats.emitted;
    core.trick();
    expect(seen).toEqual(['launch', 'trickTap']);
    expect(BIG_AIR_SENSORY.trickTap).toBeUndefined();
    expect(bus.stats.emitted).toBe(beforeTrick);   // no preset → no bus call
    for (let i = 0; i < 2000 && core.state.phase === 'Air'; i++) core.step(DT);
    expect(seen.some((e) => e.startsWith('land'))).toBe(true);
    expect(bus.stats.emitted).toBe(withPreset(seen, BIG_AIR_SENSORY).length);
  });

  it('IRL Dunk: runStart / firstRun / noBeat / h2hScore / submitted reach the hook; only newRecord / h2hWin hit the bus', () => {
    const bus = new SensoryBus();
    const seen: string[] = [];
    const core = makeIrlDunkSession({ bus, submissionConfigured: true, onSensory: (evt) => seen.push(evt) });
    expect(core.beginRun()).toBe(true);
    core.submitRun(10);            // first play
    expect(core.beginRun()).toBe(true);
    core.submitRun(5);             // no beat
    expect(core.beginRun()).toBe(true);
    core.submitRun(20);            // new record
    expect(core.beginH2H(2)).toBe(true);
    core.submitH2HScore(3);
    core.submitH2HScore(7);        // resolves → h2hWin
    expect(core.buildSubmission()).not.toBeNull();
    expect(seen).toEqual([
      'runStart', 'firstRun', 'runStart', 'noBeat', 'runStart', 'newRecord',
      'h2hScore', 'h2hScore', 'h2hWin', 'submitted',
    ]);
    expect(withPreset(seen, IRL_DUNK_SENSORY)).toEqual(['newRecord', 'h2hWin']);
    expect(bus.stats.emitted).toBe(2);
  });

  it('Story: roll and hop reach the hook with no bus call', () => {
    const bus = new SensoryBus();
    const seen: string[] = [];
    const core = makeStoryRun({ bus, rng: () => 0.5, onSensory: (evt) => seen.push(evt) });
    expect(core.roll()).not.toBeNull();
    expect(seen.slice(0, 2)).toEqual(['roll', 'hop']);
    expect(STORY_SENSORY.roll).toBeUndefined();
    expect(STORY_SENSORY.hop).toBeUndefined();
    expect(bus.stats.emitted).toBe(0);
    for (let i = 0; i < 20000 && core.phase === 'moving'; i++) core.tick(DT);
    expect(core.phase).not.toBe('moving');
    expect(bus.stats.emitted).toBe(withPreset(seen, STORY_SENSORY).length);
  });
});
