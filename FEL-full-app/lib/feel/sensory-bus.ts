/**
 * lib/feel/sensory-bus.ts
 * =======================
 * M9 — frame-synced sensory event bus (mode-agnostic) — "the thud".
 *
 * TypeScript port of the proven engineering-line SensoryBus
 * (FEEL_REFERENCE_SPEC §6). One contact event → camera shake (∝ impulse) +
 * zero-latency pre-decoded WebAudio SFX + gamepad rumble + optional
 * hit-stop, ALL on the SAME frame. Every channel degrades silently — the
 * bus never throws into gameplay.
 *
 * SOUND IS OPT-IN. An event's `sfx` is a NAME, looked up in the name→url map
 * the bus was built with; the bus fetches and decodes those files up front and
 * plays nothing else. Every channel is opt-in the same way: shake needs a
 * `camera`, hit-stop needs a `loop`. What an event loses, and how it shows:
 *   - a mapped file that failed to fetch or decode: silent, counted ONCE per
 *     file in stats.sfxMissing and warned;
 *   - a name the map does not hold, on a bus that HAS a map: silent, counted
 *     per event in stats.sfxUnknown and warned once per name;
 *   - any name on a bus built with NO map: silent and uncounted (sound is off by
 *     design there, not broken);
 *   - a mapped file still loading: silent and uncounted (await `ready` first).
 *
 * HOTFIX (2026-09-24): this header used to say the app ships sfx_basketball_swoosh,
 * sfx_punch_impact and sfx_crowd_cheer. It never did: those, sfx_impact,
 * sfx_score and sfx_ui_click were six MP3s that are not under public/, so every
 * preset that named one played silence. The presets no longer name a file.
 * What reaches a player today: no host builds a bus with a map, a camera or a
 * loop. The one live bus is Big Air's (lib/babylon/modes/AirSessionMode.ts calls
 * makeBigAirSession(undefined), so the core builds a bare bus), and it fires
 * ONLY gamepad rumble, on landStuck and landCrash. Big Air's shake, hit-stop and
 * sound come from the mode's own ctx.juice calls and lib/babylon/audio/SoundKit.ts.
 * Sprint's hosts pass no bus at all, and no live host builds any other feel
 * core. lib/feel/sensory-assets.test.ts fails if a preset points at an audio
 * file that is not under public/.
 */

import { motionPolicy } from '../a11y/reducedMotion';

export interface SensoryCamera {
  applyCameraShake?: (intensity: number) => void;
}

export interface SensoryLoop {
  hitStop?: (ms: number) => void;
}

export interface SensoryBusOpts {
  camera?: SensoryCamera | null;
  loop?: SensoryLoop | null;
  /** name → URL, preloaded + decoded on construction (zero-latency start). */
  sfx?: Record<string, string>;
}

export interface SensoryEvent {
  sfx?: string;
  volume?: number;
  shake?: number;
  hitStopMs?: number;
  rumbleMs?: number;
  rumbleStrength?: number;
}

export interface SensoryStats {
  emitted: number;
  sfxPlayed: number;
  shakes: number;
  hitStops: number;
  rumbles: number;
  /** Map entries that failed to fetch or decode (a missing file is counted here, never played). */
  sfxMissing: number;
  /** Events whose `sfx` name the map does not hold, on a bus built with a map (a typo or a forgotten entry). */
  sfxUnknown: number;
}

type AudioCtor = typeof AudioContext;

export class SensoryBus {
  camera: SensoryCamera | null;
  loop: SensoryLoop | null;
  stats: SensoryStats = { emitted: 0, sfxPlayed: 0, shakes: 0, hitStops: 0, rumbles: 0, sfxMissing: 0, sfxUnknown: 0 };
  /** Settles once every mapped file has loaded or failed, or the bus was disposed (it never rejects). */
  readonly ready: Promise<void>;
  private _buffers: Record<string, AudioBuffer | undefined>;
  private _ctx: AudioContext | null = null;
  /** The names the map was built with: a name outside it is a caller bug, not a load failure. */
  private readonly _names: ReadonlySet<string>;
  private readonly _warnedUnknown = new Set<string>();

  constructor({ camera, loop, sfx = {} }: SensoryBusOpts = {}) {
    this.camera = camera ?? null;
    this.loop = loop ?? null;
    this._buffers = Object.create(null);
    // HOTFIX (2026-09-24): `sfx: null` from a JS caller used to make Object.keys throw inside _preload, so `ready`
    // rejected despite its doc. A null map is no map.
    const map = sfx ?? {};
    this._names = new Set(Object.keys(map));
    this.ready = this._preload(map);
  }

  private async _preload(sfx: Record<string, string>): Promise<void> {
    if (typeof window === 'undefined') return;
    // HOTFIX (2026-09-24): no map, no AudioContext. The air, ride, story, IRL and karate cores default to
    // `new SensoryBus()` with nothing to load, and each one still opened a context nobody closed: one more per Big Air mount.
    if (Object.keys(sfx).length === 0) return;
    const AC: AudioCtor | undefined =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    this._ctx = ctx;
    // HOTFIX (2026-09-24): dispose() can land mid-fetch (a quick unmount, a StrictMode double mount). The decode then
    // ran on a null context and the TypeError was reported as a missing FILE. A load that outlives its context now
    // leaves quietly: nothing stored, nothing counted, nothing warned.
    const disposed = (): boolean => this._ctx !== ctx;
    await Promise.all(
      Object.entries(sfx).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          // HOTFIX (2026-09-24): a 404 used to be decoded as audio and fail with no trace; name it instead.
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw = await res.arrayBuffer();
          if (disposed()) return;
          const buf = await ctx.decodeAudioData(raw);
          if (disposed()) return;
          this._buffers[name] = buf;
        } catch (err) {
          if (disposed()) return;
          // missing file → that event stays silent; the bus still never throws into gameplay
          this.stats.sfxMissing++;
          console.warn(`[SENSORY] sfx "${name}" did not load from ${url} (${(err as Error)?.message ?? err}); it will be silent`);
        }
      }),
    );
  }

  /** Fire a sensory event NOW (call from the fixed step / contact handler). */
  emit(fx: SensoryEvent = {}): void {
    this.stats.emitted++;
    if (fx.sfx) this._playSfx(fx.sfx, fx.volume ?? 1);
    // HOTFIX (2026-09-24): reduced motion — no camera shake; the sound, the rumble and the hit-stop still fire
    if (fx.shake && this.camera?.applyCameraShake && motionPolicy().shake) {
      this.camera.applyCameraShake(fx.shake);
      this.stats.shakes++;
    }
    if (fx.hitStopMs && this.loop?.hitStop) {
      this.loop.hitStop(fx.hitStopMs);
      this.stats.hitStops++;
    }
    if (fx.rumbleMs) this._rumble(fx.rumbleMs, fx.rumbleStrength ?? 0.8);
  }

  /** Zero-latency: buffer is pre-decoded, start() is immediate. */
  private _playSfx(name: string, volume: number): void {
    // HOTFIX (2026-09-24): a name the map never held used to drop with no trace, the same silent failure as the dead
    // MP3s. On a bus that has a map it is counted and named once. A map-less bus stays quiet: sound is off there.
    if (this._names.size > 0 && !this._names.has(name)) {
      this.stats.sfxUnknown++;
      if (!this._warnedUnknown.has(name)) {
        this._warnedUnknown.add(name);
        console.warn(`[SENSORY] sfx "${name}" is not in this bus's map (${[...this._names].join(', ')}); it will be silent`);
      }
      return;
    }
    const buf = this._buffers[name];
    if (!buf || !this._ctx) return;
    if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    try {
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const gain = this._ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this._ctx.destination);
      src.start();
      this.stats.sfxPlayed++;
    } catch {
      /* never throw into gameplay */
    }
  }

  private _rumble(durationMs: number, strength: number): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    try {
      for (const gp of navigator.getGamepads()) {
        const act = (gp as any)?.vibrationActuator;
        if (act?.playEffect) {
          act
            .playEffect('dual-rumble', {
              duration: durationMs,
              strongMagnitude: strength,
              weakMagnitude: strength * 0.6,
            })
            .catch(() => {});
          this.stats.rumbles++;
        }
      }
    } catch {
      /* silent */
    }
  }

  dispose(): void {
    this._ctx?.close?.().catch?.(() => {});
    this._ctx = null;
    this._buffers = Object.create(null);
  }
}

export default SensoryBus;
