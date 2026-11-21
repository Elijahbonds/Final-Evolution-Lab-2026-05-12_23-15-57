// hoops-items (2026-11-18): the three sound leftovers — each switch's OFF value is the sound as it was, word for word; ON is the new one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { passThrowClick, driftSound, glassKissSound, PASS_THROW_QUIET_ON, DRIFT_SQUEAK_ON, GLASS_SOUND_ON } from './hoopsSfx';
import { scuffVolume } from '../core/ScuffFx';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

// (the switch is each function's last argument: its default reads the knob, which a test cannot set without a signed-in owner)
const mode = (f: string) => readFileSync(join(__dirname, '..', 'modes', f), 'utf8');

describe('the knobs', () => {
  it('default to the constants', () => {
    expect(FEEL_KNOB_BY_ID.get('hoops.passThrowQuietOn')!.def).toBe(PASS_THROW_QUIET_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.driftSqueakOn')!.def).toBe(DRIFT_SQUEAK_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.glassSoundOn')!.def).toBe(GLASS_SOUND_ON);
  });
});

describe('the 3v3 throw', () => {
  it('ships quiet: no click on any pass type', () => {
    expect(PASS_THROW_QUIET_ON).toBe(1);
    for (const t of ['chest', 'bounce', 'lob']) expect(passThrowClick(t)).toBeNull();
  });
  it('off: the menu click by pass type, exactly as before (bounce 1.0, lob 0.8, chest 1.3)', () => {
    expect(passThrowClick('bounce', true)).toEqual({ name: 'uiTick', opts: { pitch: 1.0 } });
    expect(passThrowClick('lob', true)).toEqual({ name: 'uiTick', opts: { pitch: 0.8 } });
    expect(passThrowClick('chest', true)).toEqual({ name: 'uiTick', opts: { pitch: 1.3 } });
  });
  it('the mode asks hoopsSfx, and no uiTick is left on the throw line', () => {
    const src = mode('ThreeVThreeMode.ts');
    expect(src).toContain('passThrowClick(type)');
    expect(src).not.toMatch(/SoundKit\.play\('uiTick', \{ pitch: type === 'bounce'/);
  });
});

describe('the DRIFT', () => {
  it('ships as the hardest cut\'s squeak', () => {
    expect(DRIFT_SQUEAK_ON).toBe(1);
    expect(driftSound()).toEqual({ name: 'squeak', opts: { pitch: 1.12, volume: scuffVolume(1) } });
  });
  it('off: the swish at pitch 0.8, volume 0.4, as before', () => {
    expect(driftSound(false)).toEqual({ name: 'swish', opts: { pitch: 0.8, volume: 0.4 } });
  });
  it('both court modes play it through hoopsSfx', () => {
    for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts']) {
      const src = mode(f);
      expect(src).toContain("callout('DRIFT', '#22d3ee', 380); { const ds = driftSound(); SoundKit.play(ds.name, ds.opts); }");
    }
  });
});

describe('the backboard kiss', () => {
  it('ships as its own cue at the thud\'s volume', () => {
    expect(GLASS_SOUND_ON).toBe(1);
    expect(glassKissSound()).toEqual({ name: 'glass', opts: { volume: 0.35 } });
  });
  it('off: the thud at pitch 1.5, volume 0.35, as before', () => {
    expect(glassKissSound(false)).toEqual({ name: 'thud', opts: { pitch: 1.5, volume: 0.35 } });
  });
  it('1v1, 3v3 and the 3-point contest play it through hoopsSfx', () => {
    for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts', 'ThreePointMode.ts']) {
      const src = mode(f);
      expect(src).toMatch(/if \(t\.on === 'glass'\) \{ const gk = glassKissSound\(\); SoundKit\.play\(gk\.name, gk\.opts\);/);
      expect(src).not.toMatch(/t\.on === 'glass'\) \{ SoundKit\.play\('thud'/);
    }
  });
});
