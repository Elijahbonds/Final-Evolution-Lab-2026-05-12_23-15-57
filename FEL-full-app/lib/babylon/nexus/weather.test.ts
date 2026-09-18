import { describe, it, expect } from 'vitest';
import { readyWeathers, readWeather, WEATHER_MODE_IDS, WEATHER_FAMILY_OF } from './weather';
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
