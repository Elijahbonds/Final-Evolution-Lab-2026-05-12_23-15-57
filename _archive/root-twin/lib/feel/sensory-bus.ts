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
 * The app already ships the referenced SFX (sfx_basketball_swoosh,
 * sfx_punch_impact, sfx_crowd_cheer). Pass a name→url map to preload.
 */

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
}

type AudioCtor = typeof AudioContext;

export class SensoryBus {
  camera: SensoryCamera | null;
  loop: SensoryLoop | null;
  stats: SensoryStats = { emitted: 0, sfxPlayed: 0, shakes: 0, hitStops: 0, rumbles: 0 };
  private _buffers: Record<string, AudioBuffer | undefined>;
  private _ctx: AudioContext | null = null;

  constructor({ camera, loop, sfx = {} }: SensoryBusOpts = {}) {
    this.camera = camera ?? null;
    this.loop = loop ?? null;
    this._buffers = Object.create(null);
    void this._preload(sfx);
  }

  private async _preload(sfx: Record<string, string>): Promise<void> {
    if (typeof window === 'undefined') return;
    const AC: AudioCtor | undefined =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this._ctx = new AC();
    } catch {
      return;
    }
    await Promise.all(
      Object.entries(sfx).map(async ([name, url]) => {
        try {
          const res = await fetch(url);
          const raw = await res.arrayBuffer();
          this._buffers[name] = await this._ctx!.decodeAudioData(raw);
        } catch {
          /* missing file → silent degrade */
        }
      }),
    );
  }

  /** Fire a sensory event NOW (call from the fixed step / contact handler). */
  emit(fx: SensoryEvent = {}): void {
    this.stats.emitted++;
    if (fx.sfx) this._playSfx(fx.sfx, fx.volume ?? 1);
    if (fx.shake && this.camera?.applyCameraShake) {
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
