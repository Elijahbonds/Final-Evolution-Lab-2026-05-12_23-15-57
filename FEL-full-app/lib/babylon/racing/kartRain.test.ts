// THE KART'S RAIN CHIP IS LOOKS ONLY (w3-followups, owner 2026-10-14 "Add a Rain chip"): "visuals and weather only; handling, grip,
// speed and AI must be unchanged". Three holds, each measured against a control so none of them passes by looking at nothing:
//   1. THE PHYSICS CANNOT READ IT. The import closure of everything that drives, races or paces a kart (the model, the field's driver,
//      the pace, the tune, the boost, the air, the contact, the start) contains neither the weather's pick module nor WeatherKit nor
//      WeatherFx. (Control: the mode's own closure contains all three - the walker does see weather where it is.)
//   2. THE MODE USES IT FOR THE SKY ALONE. Every line of VelocityKartMode that names the weather is the import, the declaration, the
//      mount, the visual tick or the dispose - and none of them is in a physics call.
//   3. THE NUMBERS DO NOT MOVE. The same scripted drive of the player's model and a field rival, with the chip off, on, and the URL's
//      ?weather=rain, is bit-identical frame for frame (and the drive is not constant: it spans speeds, drifts, a boost and the brake).
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { driveKartScript } from '../../../tests/helpers/kartDrive';

const LIB = path.resolve(__dirname, '..');   // lib/babylon

/** Every relative import a file names (static `from '...'`, comments stripped), resolved to a .ts / .tsx path. */
function importsOf(file: string): string[] {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const out: string[] = [];
  for (const m of src.matchAll(/(?:from|import)\s+'(\.[^']*)'/g)) {
    const base = path.resolve(path.dirname(file), m[1]);
    for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (fs.existsSync(c)) { out.push(c); break; }
  }
  return out;
}
function closure(entries: string[]): Set<string> {
  const seen = new Set<string>(); const todo = entries.map((e) => path.resolve(LIB, e));
  while (todo.length) { const f = todo.pop() as string; if (seen.has(f)) continue; seen.add(f); todo.push(...importsOf(f)); }
  return seen;
}
const WEATHER_FILES = ['nexus/weather.ts', 'core/WeatherKit.ts', 'premium/WeatherFx.ts'].map((f) => path.resolve(LIB, f));

/** What drives, races, scores or paces a kart. */
const PHYSICS = [
  'core/KartModel.ts', 'core/KartAir.ts', 'core/RaceCourse.ts', 'core/BoostKit.ts', 'core/Difficulty.ts',
  'racing/RivalDriver.ts', 'racing/RaceField.ts', 'racing/RaceContact.ts', 'racing/RaceStart.ts', 'racing/MiniTurbo.ts', 'racing/Slipstream.ts',
  'racing/kartTune.ts', 'racing/courseEdge.ts', 'racing/racingLine.ts', 'racing/lineWindow.ts', 'racing/AeroItems.ts', 'racing/itemGrid.ts',
  'racing/kartCircuits.ts', 'modes/kartRules.ts',
];

describe('1. the kart physics cannot read the weather', () => {
  it('the walker sees weather where it is (control): the mode\'s own closure holds all three weather files', () => {
    const c = closure(['modes/VelocityKartMode.ts']);
    for (const w of WEATHER_FILES) expect(c.has(w), path.relative(LIB, w)).toBe(true);
  });
  it('and the control walker follows chains: a synthetic file two hops from weather.ts is found', () => {
    const c = closure(['premium/WeatherFx.ts']);   // WeatherFx imports core/WeatherKit (type) and scene files
    expect(c.has(path.resolve(LIB, 'premium/WeatherFx.ts'))).toBe(true);
    expect(c.size).toBeGreaterThan(3);
  });
  for (const f of PHYSICS) {
    it(`${f} does not reach the weather, however far down its imports go`, () => {
      expect(fs.existsSync(path.resolve(LIB, f)), `${f} exists`).toBe(true);
      const c = closure([f]);
      for (const w of WEATHER_FILES) expect(c.has(w), `${f} -> ${path.relative(LIB, w)}`).toBe(false);
    });
  }
});

describe('2. the mode uses the weather for the sky alone', () => {
  const src = stripComments(fs.readFileSync(path.resolve(LIB, 'modes/VelocityKartMode.ts'), 'utf8')).split('\n');
  const naming = src.map((l, i) => ({ l: l.trim(), n: i + 1 })).filter(({ l }) => /\bweather(Fx)?\b|readKartWeather|WeatherKit|mountWeatherFx/.test(l));
  it('names it on exactly the import, declaration, mount, visual tick and dispose lines', () => {
    const kinds = naming.map(({ l }) =>
      /^import /.test(l) ? 'import'
      : /^let weather: WeatherKit/.test(l) ? 'declare'
      : /readKartWeather\(\)/.test(l) ? 'mount'
      : /^weather\?\.update\(dt\); weatherFx\?\.update\(dt\);/.test(l) ? 'tick'
      : /^weatherFx\?\.dispose\(\); weatherFx = null; weather = null;/.test(l) ? 'dispose'
      : `UNKNOWN: ${l}`);
    expect(kinds.filter((k) => k.startsWith('UNKNOWN'))).toEqual([]);
    expect(kinds.filter((k) => k === 'import').length).toBe(3);   // WeatherKit, readKartWeather, mountWeatherFx
    for (const k of ['declare', 'mount', 'tick', 'dispose']) expect(kinds.filter((x) => x === k).length, k).toBe(1);
  });
  it('no physics call shares a line with it (stepKart, stepKartDrive, stepRival, KART_TUNE, grip, speed, the field)', () => {
    for (const { l } of naming) expect(l).not.toMatch(/stepKart|stepRival|KART_TUNE|spawnKart|rivalPace|\.grip|\.speed|vMax|accel|boost|makeField/);
  });
  it('the tick is the clock alone: the weather is advanced by dt and nothing else', () => {
    const tick = naming.filter(({ l }) => /\.update\(dt\)/.test(l)).map(({ l }) => l.replace(/\s+\/\/.*$/, ''));
    expect(tick).toEqual(['weather?.update(dt); weatherFx?.update(dt);']);
  });
});

describe('3. the same drive, with and without the rain, is the same drive', () => {
  afterEach(() => vi.unstubAllGlobals());
  const device = (search: string, saved: string | null) => vi.stubGlobal('window', {
    location: { search }, localStorage: { getItem: (k: string) => (k === 'fel-kart-rain' ? saved : null), setItem: () => {} },
  });
  it('the drive is a real one (control): it spans speeds, a drift, a boost and the brake', () => {
    device('', null);
    const t = driveKartScript();
    const speeds = t.player.map((r) => r[4]);
    expect(Math.max(...speeds)).toBeGreaterThan(18);
    expect(Math.min(...speeds.slice(600))).toBeLessThan(Math.max(...speeds) * 0.8);
    expect(t.player.some((r) => Math.abs(r[5]) > 0.18)).toBe(true);   // slipped past DRIFT_SLIP at some point
    expect(Math.max(...t.rival.map((r) => r[3]))).toBeGreaterThan(8);
  });
  it('chip off, chip on, and ?weather=rain: every frame of the player and the rival is identical', () => {
    device('', null); const dry = driveKartScript();
    device('', '1'); const chip = driveKartScript();
    device('?weather=rain', null); const url = driveKartScript();
    device('?weather=storm', '1'); const storm = driveKartScript();
    expect(chip).toEqual(dry); expect(url).toEqual(dry); expect(storm).toEqual(dry);
  });
});
