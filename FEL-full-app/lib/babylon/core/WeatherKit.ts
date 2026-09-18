// WeatherKit — the pure half of weather (docs/SPEC-WEATHER.md; owner 2026-09-15 "we need to do a weather pass", built
// 2026-09-17 with the golf upgrade: "upgrade physics, weather").
//
// ONE system, N modes read it (the shared-channel rule). This file has no Babylon in it: a condition, an intensity, a
// wind, a wetness that builds and dries on an exponential, a time of day — and the GAMEPLAY MODIFIERS, capped HERE and
// nowhere else. Looks + light gameplay: wind pushes balls and planes, a wet court trims grip a little, snow slows
// boards. A fair mode shows every modifier before you commit, the way golf shows its wind.

export type WeatherCondition = 'clear' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'wind' | 'fog';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
/** The venue families of the spec's allowlist table. */
export type WeatherFamily = 'court' | 'coast' | 'slope' | 'links' | 'course' | 'gridiron' | 'indoor';

export interface WeatherState {
  condition: WeatherCondition;
  /** 0..1 — how hard it rains / snows / blows. */
  intensity: number;
  /** m/s, flat. */
  wind: { x: number; z: number };
  /** 0..1 — how wet the ground is right now (builds in rain, dries after). */
  wetness: number;
  timeOfDay: TimeOfDay;
}

/** The modifier caps (spec §1). Every mode reads through the accessors below, so nothing can exceed these. */
export const WEATHER_CAPS = {
  gripMultMin: 0.9,
  boardDragMultMax: 1.12,
  ballWindAccelMax: 1.5,   // m/s²
  flightWindMax: 4,        // m/s
} as const;

/** No snow on the beach: what each venue family may roll. Indoor gets nothing (no chip). */
export const WEATHER_ALLOWED: Record<WeatherFamily, readonly WeatherCondition[]> = {
  court: ['clear', 'rain', 'storm', 'wind', 'fog'],
  coast: ['clear', 'wind', 'storm', 'fog'],
  slope: ['clear', 'snow', 'blizzard', 'wind', 'fog'],
  links: ['clear', 'rain', 'wind', 'fog', 'storm'],
  course: ['clear', 'rain', 'wind', 'fog'],
  gridiron: ['clear', 'rain', 'wind', 'fog', 'snow'],   // the spec's "+ snow for football"
  indoor: [],
};
// NATURAL is "as the venue was authored": timeOfDay 'day' here means "leave the rig alone" (WeatherFx only retunes a
// non-day pick), whatever hour the venue's own mood paints — the golden-hour court is natural at 'day'.
export const WEATHER_NATURAL: Record<WeatherFamily, { condition: WeatherCondition; timeOfDay: TimeOfDay }> = {
  court: { condition: 'clear', timeOfDay: 'day' },
  coast: { condition: 'clear', timeOfDay: 'day' },
  slope: { condition: 'clear', timeOfDay: 'day' },
  links: { condition: 'clear', timeOfDay: 'day' },
  course: { condition: 'clear', timeOfDay: 'day' },
  gridiron: { condition: 'clear', timeOfDay: 'day' },
  indoor: { condition: 'clear', timeOfDay: 'day' },
};
export const TIMES_OF_DAY: readonly TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];

/** Seconds for wetness to close 63 % of the gap to its target — rain soaks in, then the ground dries slower. */
const WET_TAU_SOAK = 8, WET_TAU_DRY = 40;

/** mulberry32 — a seeded roll so a RANDOM pick is the same for a replay of the same seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class WeatherKit {
  state: WeatherState;
  /** Gust phase, advanced by dt (frame-rate independent — the SpeedFov / BoostKit lesson). */
  private gustT = 0;
  constructor(init: Partial<WeatherState> = {}) {
    this.state = {
      condition: init.condition ?? 'clear', intensity: clamp01(init.intensity ?? 0),
      wind: init.wind ?? { x: 0, z: 0 }, wetness: clamp01(init.wetness ?? 0), timeOfDay: init.timeOfDay ?? 'day',
    };
    if (this.state.condition === 'clear' && init.intensity === undefined) this.state.intensity = 0;
  }

  /** The venue's default. */
  static naturalFor(family: WeatherFamily): WeatherKit { return new WeatherKit({ ...WEATHER_NATURAL[family], intensity: 0 }); }

  /** RANDOM from the family's allowlist: a condition, an intensity, a wind that fits it, a time of day. Seeded. */
  static rollFor(family: WeatherFamily, seed: number): WeatherKit {
    const allowed = WEATHER_ALLOWED[family];
    if (!allowed.length) return WeatherKit.naturalFor(family);
    const r = seededRandom(seed);
    const condition = allowed[Math.floor(r() * allowed.length)];
    const timeOfDay = TIMES_OF_DAY[Math.floor(r() * TIMES_OF_DAY.length)];
    const intensity = condition === 'clear' ? 0 : 0.4 + r() * 0.6;
    return WeatherKit.make(condition, intensity, timeOfDay, r());
  }

  /** A named pick ('rain', 'night' …) for a family; 'natural' / 'random' resolve here too. Unknown → natural. */
  static fromPick(pick: string | null | undefined, family: WeatherFamily, seed = 1): WeatherKit {
    if (!pick || pick === 'natural') return WeatherKit.naturalFor(family);
    if (pick === 'random') return WeatherKit.rollFor(family, seed);
    const nat = WEATHER_NATURAL[family];
    if ((TIMES_OF_DAY as readonly string[]).includes(pick)) return new WeatherKit({ condition: nat.condition, intensity: 0, timeOfDay: pick as TimeOfDay });
    if ((WEATHER_ALLOWED[family] as readonly string[]).includes(pick)) return WeatherKit.make(pick as WeatherCondition, 0.7, nat.timeOfDay, seededRandom(seed)());
    return WeatherKit.naturalFor(family);
  }

  /** A condition at an intensity, with the wind that condition carries (a bearing from `r`). */
  static make(condition: WeatherCondition, intensity: number, timeOfDay: TimeOfDay, r = 0.37): WeatherKit {
    const bearing = r * Math.PI * 2;
    const speed = condition === 'wind' ? 2.5 + intensity * 5 : condition === 'storm' || condition === 'blizzard' ? 2 + intensity * 4 : condition === 'rain' || condition === 'snow' ? 0.8 + intensity * 1.6 : condition === 'fog' ? 0.3 : 0;
    return new WeatherKit({ condition, intensity: clamp01(intensity), timeOfDay, wind: { x: Math.sin(bearing) * speed, z: Math.cos(bearing) * speed }, wetness: condition === 'rain' || condition === 'storm' ? intensity * 0.5 : 0 });
  }

  get condition(): WeatherCondition { return this.state.condition; }
  get intensity(): number { return this.state.intensity; }
  get wetness(): number { return this.state.wetness; }
  get timeOfDay(): TimeOfDay { return this.state.timeOfDay; }
  /** Is anything falling? */
  get precipitating(): boolean { return this.state.condition === 'rain' || this.state.condition === 'storm' || this.state.condition === 'snow' || this.state.condition === 'blizzard'; }

  /** Wetness soaks toward the rain and dries after it; gusts advance. Frame-rate independent. */
  update(dt: number): void {
    const s = this.state;
    const target = s.condition === 'rain' || s.condition === 'storm' ? Math.max(0.35, s.intensity) : 0;
    const tau = target > s.wetness ? WET_TAU_SOAK : WET_TAU_DRY;
    s.wetness += (target - s.wetness) * (1 - Math.exp(-dt / tau));
    this.gustT += dt;
  }

  /** The base wind, capped for a flight (m/s). */
  flightWind(): { x: number; z: number } {
    const { x, z } = this.state.wind; const n = Math.hypot(x, z);
    const k = n > WEATHER_CAPS.flightWindMax ? WEATHER_CAPS.flightWindMax / n : 1;
    return { x: x * k, z: z * k };
  }
  /** The wind right now: the base plus a gust that breathes with the intensity (storm gusts hardest). Still capped. */
  gustWind(): { x: number; z: number } {
    const base = this.flightWind(); const s = this.state;
    const gust = s.condition === 'storm' || s.condition === 'blizzard' ? 0.45 : s.condition === 'wind' ? 0.3 : 0.12;
    const g = 1 + gust * s.intensity * Math.sin(this.gustT * 0.9) * Math.sin(this.gustT * 0.37 + 1.3);
    const x = base.x * g, z = base.z * g, n = Math.hypot(x, z);
    const k = n > WEATHER_CAPS.flightWindMax ? WEATHER_CAPS.flightWindMax / n : 1;
    return { x: x * k, z: z * k };
  }
  /** Sideways push on a ball in flight (m/s²), capped. */
  ballWindAccel(): { x: number; z: number } {
    const w = this.flightWind(); const x = w.x * 0.45, z = w.z * 0.45; const n = Math.hypot(x, z);
    const k = n > WEATHER_CAPS.ballWindAccelMax ? WEATHER_CAPS.ballWindAccelMax / n : 1;
    return { x: x * k, z: z * k };
  }
  /** Footwork / tyre grip: a wet surface trims it a little, never below the cap. */
  gripMult(): number { return Math.max(WEATHER_CAPS.gripMultMin, 1 - this.state.wetness * 0.12); }
  /** Boards through snow / wet: a little drag, never above the cap. */
  boardDragMult(): number {
    const s = this.state; const snow = s.condition === 'snow' || s.condition === 'blizzard' ? s.intensity * 0.12 : 0;
    return Math.min(WEATHER_CAPS.boardDragMultMax, 1 + snow + s.wetness * 0.05);
  }
  /** Heavier air in rain (the ball flies a touch shorter); fog and snow leave it alone. */
  airDensityMult(): number { return 1 + this.state.wetness * 0.06; }
  /** A bounce on wet turf keeps less; roll dies sooner. 0 dry .. 1 soaked, for a physics sim to scale by. */
  wet01(): number { return this.state.wetness; }
  /** Fog density for a scene (EXP2), 0 = none. */
  fogDensity(): number {
    const s = this.state;
    // EXP2 densities measured against a 60 x 90 links: rain has to haze the far trees (~60 m) to read as rain at all
    if (s.condition === 'fog') return 0.015 + s.intensity * 0.02;
    if (s.condition === 'blizzard') return 0.01 + s.intensity * 0.012;
    if (s.condition === 'storm') return 0.006 + s.intensity * 0.008;
    if (s.condition === 'rain' || s.condition === 'snow') return 0.005 + s.intensity * 0.007;
    return 0;
  }
  /** The HUD line: 'RAIN · 3 m/s' — what the player sees before committing. */
  describe(): string {
    const s = this.state; const w = this.flightWind(); const n = Math.hypot(w.x, w.z);   // the wind as APPLIED (capped), not the raw roll
    const cond = s.condition === 'clear' ? (s.timeOfDay === 'day' ? 'CLEAR' : `CLEAR · ${s.timeOfDay.toUpperCase()}`) : s.condition.toUpperCase() + (s.timeOfDay !== 'day' ? ` · ${s.timeOfDay.toUpperCase()}` : '');
    return n >= 0.5 ? `${cond} · WIND ${n.toFixed(0)} m/s` : cond;
  }
}
