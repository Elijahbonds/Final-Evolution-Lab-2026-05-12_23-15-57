import { describe, it, expect } from 'vitest';
import { WeatherKit, WEATHER_ALLOWED, WEATHER_CAPS, seededRandom } from './WeatherKit';

describe('WeatherKit', () => {
  it('every modifier stays inside its cap, whatever the weather says', () => {
    const wild = new WeatherKit({ condition: 'storm', intensity: 1, wind: { x: 40, z: -30 }, wetness: 1 });
    for (let i = 0; i < 200; i++) wild.update(0.05);
    expect(Math.hypot(wild.flightWind().x, wild.flightWind().z)).toBeLessThanOrEqual(WEATHER_CAPS.flightWindMax + 1e-9);
    expect(Math.hypot(wild.gustWind().x, wild.gustWind().z)).toBeLessThanOrEqual(WEATHER_CAPS.flightWindMax + 1e-9);
    expect(Math.hypot(wild.ballWindAccel().x, wild.ballWindAccel().z)).toBeLessThanOrEqual(WEATHER_CAPS.ballWindAccelMax + 1e-9);
    expect(wild.gripMult()).toBeGreaterThanOrEqual(WEATHER_CAPS.gripMultMin);
    expect(new WeatherKit({ condition: 'blizzard', intensity: 1, wetness: 1 }).boardDragMult()).toBeLessThanOrEqual(WEATHER_CAPS.boardDragMultMax);
  });
  it('no venue can roll a forbidden condition (no snow on the beach), over many seeds', () => {
    for (const family of ['court', 'coast', 'slope', 'links', 'course'] as const) {
      for (let seed = 1; seed < 400; seed++) expect(WEATHER_ALLOWED[family]).toContain(WeatherKit.rollFor(family, seed).condition);
    }
    expect(WeatherKit.rollFor('indoor', 5).condition).toBe('clear');
    expect(WEATHER_ALLOWED.coast).not.toContain('snow');
  });
  it('a RANDOM roll is seeded: the same seed gives the same weather', () => {
    const a = WeatherKit.rollFor('links', 42), b = WeatherKit.rollFor('links', 42);
    expect(a.state).toEqual(b.state);
    const r1 = seededRandom(7), r2 = seededRandom(7); expect(r1()).toBe(r2());
  });
  it('wetness is frame-rate independent: 20 s of rain at 1/30 and 1/240 land within a hair', () => {
    const run = (dt: number) => { const k = new WeatherKit({ condition: 'rain', intensity: 0.8 }); for (let t = 0; t < 20; t += dt) k.update(dt); return k.wetness; };
    expect(Math.abs(run(1 / 30) - run(1 / 240))).toBeLessThan(0.01);
    const k = new WeatherKit({ condition: 'rain', intensity: 0.8 }); for (let t = 0; t < 30; t += 0.05) k.update(0.05);
    expect(k.wetness).toBeGreaterThan(0.6);
    k.state.condition = 'clear'; for (let t = 0; t < 120; t += 0.05) k.update(0.05);
    expect(k.wetness).toBeLessThan(0.1);   // it dries, slower than it soaked
  });
  it('a pick resolves: natural, random, a condition, a time of day, junk', () => {
    expect(WeatherKit.fromPick('natural', 'links').condition).toBe('clear');
    expect(WeatherKit.fromPick('rain', 'links').condition).toBe('rain');
    expect(WeatherKit.fromPick('night', 'links').timeOfDay).toBe('night');
    expect(WeatherKit.fromPick('snow', 'links').condition).toBe('clear');   // not allowed on the links → natural
    expect(WeatherKit.fromPick('garbage', 'court').condition).toBe('clear');
    expect(WEATHER_ALLOWED.links).toContain(WeatherKit.fromPick('random', 'links', 9).condition);
  });
  it('the HUD line says what the player is playing in', () => {
    expect(new WeatherKit({ condition: 'clear' }).describe()).toBe('CLEAR');
    expect(WeatherKit.make('rain', 0.7, 'dusk').describe()).toMatch(/^RAIN · DUSK · WIND \d m\/s$/);
    expect(new WeatherKit({ condition: 'fog', intensity: 0.5 }).fogDensity()).toBeGreaterThan(new WeatherKit({ condition: 'rain', intensity: 0.5 }).fogDensity());
  });
});
