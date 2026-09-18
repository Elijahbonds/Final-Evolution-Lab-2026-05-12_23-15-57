// weather — the pick module (docs/SPEC-WEATHER.md §2), shaped like courtLocations / boardVenues: what the WEATHER chip
// on the start screen offers, what the player chose (URL first, then the saved preference), and which modes carry the
// chip at all. A mode listed in WEATHER_MODE_IDS has to read `readWeather` — pickerReach checks that structurally.

import { TIMES_OF_DAY, WEATHER_ALLOWED, type WeatherCondition, type WeatherFamily, type TimeOfDay } from '../core/WeatherKit';

export const WEATHER_KEY = 'fel-weather';
export type WeatherPick = 'natural' | 'random' | WeatherCondition | TimeOfDay;

/** Which outdoor family a mode plays in — a mode absent here shows no chip (dojo, arena interiors, dance, quiz). */
export const WEATHER_FAMILY_OF: Record<string, WeatherFamily> = {
  golf: 'links',
  soccer: 'course',      // the penalty shootout (registry key `penalty`, modeId 'soccer')
  tennis: 'court',
  football: 'gridiron',  // + snow
};
/** Game-component mode ids that show the chip on the boot splash (the contract pickerReach enforces). */
export const WEATHER_MODE_IDS = new Set(Object.keys(WEATHER_FAMILY_OF));

export interface WeatherChoice { id: WeatherPick; name: string; tint: string }
const NAMES: Record<string, { name: string; tint: string }> = {
  natural: { name: 'NATURAL', tint: '#9be37a' }, random: { name: 'RANDOM', tint: '#ffd166' },
  clear: { name: 'CLEAR', tint: '#cfe8ff' }, rain: { name: 'RAIN', tint: '#7fb3ff' }, storm: { name: 'STORM', tint: '#8a7fff' },
  snow: { name: 'SNOW', tint: '#e8f0ff' }, blizzard: { name: 'BLIZZARD', tint: '#c8d6ff' }, wind: { name: 'WIND', tint: '#9ecbff' }, fog: { name: 'FOG', tint: '#b8c0c8' },
  dawn: { name: 'DAWN', tint: '#ffb7d5' }, dusk: { name: 'DUSK', tint: '#ffb36b' }, night: { name: 'NIGHT', tint: '#9fb7ff' },
};
/** The chip's rows for a family: NATURAL · RANDOM · the allowed conditions, then the times of day. Empty for indoor. */
export function readyWeathers(family: WeatherFamily): WeatherChoice[] {
  const allowed = WEATHER_ALLOWED[family];
  if (!allowed.length) return [];
  const ids: WeatherPick[] = ['natural', 'random', ...allowed.filter((c) => c !== 'clear'), ...TIMES_OF_DAY.filter((t) => t !== 'day')];
  return ids.map((id) => ({ id, ...NAMES[id] }));
}
const VALID = new Set<string>(['natural', 'random', 'clear', 'rain', 'storm', 'snow', 'blizzard', 'wind', 'fog', ...TIMES_OF_DAY]);

/** The pick: `?weather=` on the URL, then the saved preference, else natural. Safe on the server. */
export function readWeather(modeId?: string): WeatherPick {
  try {
    if (typeof window === 'undefined') return 'natural';
    const q = new URLSearchParams(window.location.search).get('weather');
    if (q && VALID.has(q)) return q as WeatherPick;
    const v = window.localStorage.getItem(WEATHER_KEY);
    void modeId;
    return v && VALID.has(v) ? (v as WeatherPick) : 'natural';
  } catch { return 'natural'; }
}
export function writeWeather(pick: WeatherPick): void { try { window.localStorage.setItem(WEATHER_KEY, pick); } catch { /* convenience only */ } }
