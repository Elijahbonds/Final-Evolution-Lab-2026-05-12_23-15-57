// lib/babylon/audio/SoundKit.ambient.test.ts — AMBIENT FIX (2026-10-06), owner decision "one shared fix for all":
// the harness skips its venue bed when the mode has already started its own ambient.
//
// The bug: ModeHarness's firstInput() called SoundKit.startAmbient(<mood bed>) on the first press, and startAmbient
// stops the bed already playing — so every mode that starts its own bed in load() (SkateRun/FreeRun wind, Surf ocean,
// golf wind, the dojo modes…) lost it to a stadium crowd, or to silence under an alpine mood, the moment play began.
//
// Same fakes and fresh-singleton-per-test set-up as SoundKit.busRouting.test.ts (see its header for why).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FakeAudioContext, installFakeWebAudio, type FakeWebAudio } from '../music/fakeWebAudio';
import { stripComments } from '@/lib/testing/sourceScan';
import { shouldStartMoodBed, type AmbientKind } from './SoundKit';

let fake: FakeWebAudio;

beforeEach(() => {
  vi.resetModules();
  fake = installFakeWebAudio();
  (globalThis as unknown as { window: { AudioContext?: unknown } }).window.AudioContext = FakeAudioContext;
});
afterEach(() => { fake.uninstall(); });

async function freshKit() {
  const { SoundKit } = await import('./SoundKit');
  SoundKit.unlock();   // builds the (fake) graph
  const ctx = SoundKit.graph()!.ctx as unknown as FakeAudioContext;
  /** Buffer sources started so far: one per bed that actually began to sound (the LFO is an 'osc'). */
  const beds = () => ctx.starts.filter((s) => s.kind === 'buffer');
  const stopped = () => ctx.stops.filter((s) => s.src.buffer !== null);
  return { SoundKit, beds, stopped };
}

describe('shouldStartMoodBed — the harness decision, pure', () => {
  it('starts the venue bed only when no bed has been asked for', () => {
    expect(shouldStartMoodBed(null)).toBe(true);
  });
  it("keeps every bed a mode chose, 'none' included (a mode that wants silence gets silence)", () => {
    for (const k of ['stadium', 'dojo', 'ocean', 'wind', 'none'] as AmbientKind[]) expect(shouldStartMoodBed(k), k).toBe(false);
  });
});

describe('SoundKit ambient tracking — start / stop / current', () => {
  it('reports null before any bed, the asked kind after startAmbient, and null again after stopAmbient', async () => {
    const { SoundKit } = await freshKit();
    expect(SoundKit.ambientKind()).toBeNull();
    SoundKit.startAmbient('wind');
    expect(SoundKit.ambientKind()).toBe('wind');
    SoundKit.startAmbient('ocean');   // a new bed replaces the old one, as it always has
    expect(SoundKit.ambientKind()).toBe('ocean');
    SoundKit.stopAmbient();
    expect(SoundKit.ambientKind()).toBeNull();
  });

  it("records the REQUEST: 'none' and a bed asked for with music off both count as chosen", async () => {
    const { SoundKit, beds } = await freshKit();
    SoundKit.startAmbient('none');
    expect(SoundKit.ambientKind()).toBe('none');
    expect(beds()).toHaveLength(0);
    SoundKit.setEnabled(true, false);
    SoundKit.startAmbient('ocean');
    expect(SoundKit.ambientKind()).toBe('ocean');
    expect(beds()).toHaveLength(0);   // nothing sounds, but the mode chose it
  });
});

describe('startVenueAmbient — the harness bed defers to a mode-owned bed', () => {
  it('a mode bed started in load() survives the first input: not stopped, not replaced', async () => {
    const { SoundKit, beds, stopped } = await freshKit();
    SoundKit.startAmbient('wind');          // the mode's load()
    expect(beds()).toHaveLength(1);
    SoundKit.startVenueAmbient('stadium');  // the harness's first input
    expect(SoundKit.ambientKind()).toBe('wind');
    expect(beds()).toHaveLength(1);         // no stadium crowd started…
    expect(stopped()).toHaveLength(0);      // …and the wind kept playing
  });

  it("a mode that chose 'none' stays silent", async () => {
    const { SoundKit, beds } = await freshKit();
    SoundKit.startAmbient('none');
    SoundKit.startVenueAmbient('stadium');
    expect(SoundKit.ambientKind()).toBe('none');
    expect(beds()).toHaveLength(0);
  });

  it('a mode with no bed of its own still gets the venue bed (unchanged behaviour)', async () => {
    const { SoundKit, beds } = await freshKit();
    SoundKit.startVenueAmbient('stadium');
    expect(SoundKit.ambientKind()).toBe('stadium');
    expect(beds()).toHaveLength(1);
  });

  it('a mode that starts its bed AFTER the first input replaces the venue bed (the slalom / Big Air first-frame wind)', async () => {
    const { SoundKit, beds, stopped } = await freshKit();
    SoundKit.startVenueAmbient('stadium');
    SoundKit.startAmbient('wind');
    expect(SoundKit.ambientKind()).toBe('wind');
    expect(beds()).toHaveLength(2);
    expect(stopped()).toHaveLength(1);      // the stadium bed went
  });

  it('a remount on the same page behaves like the first mount: teardown resets the choice', async () => {
    const { SoundKit, beds } = await freshKit();
    // session 1: the mode owns its bed
    SoundKit.startAmbient('wind');
    SoundKit.startVenueAmbient('stadium');
    expect(SoundKit.ambientKind()).toBe('wind');
    SoundKit.stopAmbient();                 // harness teardown
    // session 2: a mode with no bed of its own — the venue bed must start, not be blocked by session 1's wind
    SoundKit.startVenueAmbient('dojo');
    expect(SoundKit.ambientKind()).toBe('dojo');
    SoundKit.stopAmbient();
    // session 3: a mode-owned bed again is kept again
    SoundKit.startAmbient('ocean');
    SoundKit.startVenueAmbient('stadium');
    expect(SoundKit.ambientKind()).toBe('ocean');
    expect(beds()).toHaveLength(3);         // wind, dojo, ocean — never a stadium crowd
  });
});

describe('the harness consults it (source scan)', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const harness = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8'));
  const fnBody = (name: string): string => {
    const at = harness.search(new RegExp(`function ${name}\\(`));
    expect(at, `function ${name}`).toBeGreaterThanOrEqual(0);
    const open = harness.indexOf('{', harness.indexOf(')', at));
    let depth = 0;
    for (let i = open; i < harness.length; i++) {
      if (harness[i] === '{') depth++;
      else if (harness[i] === '}' && --depth === 0) return harness.slice(open + 1, i);
    }
    throw new Error(`unbalanced ${name}`);
  };

  it('firstInput starts the mood bed through startVenueAmbient, never a bare startAmbient', () => {
    const first = fnBody('firstInput');
    expect(first).toMatch(/SoundKit\.startVenueAmbient\(bed\);/);
    expect(first).not.toMatch(/SoundKit\.startAmbient\(/);
  });

  it('nothing else in the harness starts a bed, and teardown still silences it (which also resets the choice)', () => {
    expect([...harness.matchAll(/SoundKit\.startAmbient\(/g)]).toHaveLength(0);
    expect(harness).toMatch(/SoundKit\.stopAmbient\(\);/);
  });
});
