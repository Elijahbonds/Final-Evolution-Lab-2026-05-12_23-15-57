import { afterEach, describe, it, expect, vi } from 'vitest';
import { readyWeathers, readWeather, readKartWeather, readKartRainSaved, writeKartRain, KART_RAIN_KEY, WEATHER_KEY, WEATHER_MODE_IDS, WEATHER_FAMILY_OF } from './weather';
import { WEATHER_ALLOWED } from '../core/WeatherKit';

describe('weather pick', () => {
  it('the chip offers NATURAL, RANDOM, the family\'s conditions and the times of day — nothing for indoor', () => {
    const links = readyWeathers('links').map((c) => c.id);
    expect(links.slice(0, 2)).toEqual(['natural', 'random']);
    for (const c of WEATHER_ALLOWED.links) if (c !== 'clear') expect(links).toContain(c);
    expect(links).not.toContain('snow');
    expect(links).toContain('night');
    expect(readyWeathers('indoor')).toEqual([]);
  });
  it('every mode on the chip has a family', () => { for (const id of WEATHER_MODE_IDS) expect(WEATHER_FAMILY_OF[id]).toBeTruthy(); });
  it('with no window the pick is natural', () => { expect(readWeather('golf')).toBe('natural'); });
});

// w3-followups (owner 2026-10-14 "Add a Rain chip"): the Velocity Kart start screen's Rain chip, per device, with the URL still working.
describe('the kart Rain chip', () => {
  afterEach(() => vi.unstubAllGlobals());
  const device = (search: string, store: Record<string, string> = {}, blocked = false) => {
    vi.stubGlobal('window', {
      location: { search },
      localStorage: blocked
        ? { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }
        : { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
    });
    return store;
  };
  it('with no window the kart has its own sky', () => { expect(readKartWeather()).toBeNull(); expect(readKartRainSaved()).toBe(false); });
  it('nothing on the URL and nothing saved: the course\'s own sky', () => { device(''); expect(readKartWeather()).toBeNull(); });
  it('the chip on is remembered per device and rains on the next load, with no URL', () => {
    const store = device('');
    writeKartRain(true);
    expect(store[KART_RAIN_KEY]).toBe('1');
    expect(readKartRainSaved()).toBe(true); expect(readKartWeather()).toBe('rain');
    writeKartRain(false);
    expect(store[KART_RAIN_KEY]).toBe('0'); expect(readKartWeather()).toBeNull();
  });
  it('the URL still works: ?weather=rain, storm and fog dress the kart without the chip', () => {
    for (const w of ['rain', 'storm', 'fog'] as const) { device(`?weather=${w}`); expect(readKartWeather()).toBe(w); }
  });
  it('the URL is explicit: ?weather=clear (or a time of day) over a saved Rain is the course\'s own sky; a stale golf pick never rains on a kart', () => {
    device('?weather=clear', { [KART_RAIN_KEY]: '1' }); expect(readKartWeather()).toBeNull();
    device('?weather=night', { [KART_RAIN_KEY]: '1' }); expect(readKartWeather()).toBeNull();
    device('', { 'fel-weather': 'rain' }); expect(readKartWeather()).toBeNull();   // the golf / tennis chip's key is not the kart's
    device('?weather=storm', { [KART_RAIN_KEY]: '0' }); expect(readKartWeather()).toBe('storm');
  });
  it('a device that blocks storage is dry, and the chip does not throw', () => {
    device('', {}, true);
    expect(readKartWeather()).toBeNull(); expect(() => writeKartRain(true)).not.toThrow();
    device('?weather=rain', {}, true); expect(readKartWeather()).toBe('rain');
  });
  it('the chip writes its own key, not the golf chip\'s', () => { const store = device(''); writeKartRain(true); expect(Object.keys(store)).toEqual([KART_RAIN_KEY]); expect(KART_RAIN_KEY).not.toBe(WEATHER_KEY); });
});
