/**
 * lib/board/board-audio.ts
 *
 * Procedural Web Audio for the board lane — zero audio files.
 *
 * Harvest notes: copilot_systems/AudioSystem.js contributed the lazy
 * AudioContext + _tone/_noise synth helpers (kept nearly verbatim, TS-ified)
 * and the trick_land one-shot. Added on top (copilot had one-shots only):
 * three CONTINUOUS surface loops (carve hiss per discipline, grind scrape,
 * boost roar) with per-frame gain/filter automation — continuous surface
 * audio is half of the SSX terrain feel.
 */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

import type { BoardModeId } from './trick-table';
import type { LandingQuality } from './board-physics';

interface LoopNodes {
  src: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** Per-discipline carve-loop voicing: center frequency band of the surface. */
const CARVE_BAND: Record<BoardModeId, { lo: number; hi: number }> = {
  skate: { lo: 90, hi: 900 },     // urethane rumble + bearing hum
  snow: { lo: 1800, hi: 7000 },   // edge hiss on snow
  surf: { lo: 350, hi: 2600 },    // water rush
};

export class BoardAudio {
  private _ctx: AudioContext | null = null;
  private _master: GainNode | null = null;
  private _volume = 0.6;
  private _muted = false;

  private _carve: LoopNodes | null = null;
  private _grind: LoopNodes | null = null;
  private _boost: LoopNodes | null = null;
  private _noiseBuffer: AudioBuffer | null = null;

  // ── Lifecycle (harvested pattern: lazy ctx on first user gesture) ────────

  private _getCtx(): AudioContext | null {
    if (this._ctx) return this._ctx;
    if (typeof window === 'undefined') return null;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this._ctx = new Ctx();
      this._master = this._ctx.createGain();
      this._master.gain.value = this._muted ? 0 : this._volume;
      this._master.connect(this._ctx.destination);
      return this._ctx;
    } catch {
      return null;
    }
  }

  async resume(): Promise<void> {
    const ctx = this._getCtx();
    if (ctx && ctx.state === 'suspended') await ctx.resume();
  }

  setVolume(v: number): void {
    this._volume = clamp(v, 0, 1);
    if (this._master) this._master.gain.value = this._muted ? 0 : this._volume;
  }

  dispose(): void {
    this.stopCarveLoop();
    this.stopGrindLoop();
    this.stopBoostLoop();
    void this._ctx?.close();
    this._ctx = null;
    this._master = null;
    this._noiseBuffer = null;
  }

  // ── Synth primitives (ported from copilot AudioSystem) ──────────────────

  private _tone(
    freq: number, duration: number, gain: number,
    type: OscillatorType = 'sine', attack = 0.005, decay = 0.05, startAt?: number
  ): void {
    const ctx = this._getCtx();
    if (!ctx || !this._master) return;
    const t = startAt ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, duration - decay));
    osc.connect(env);
    env.connect(this._master);
    osc.start(t);
    osc.stop(t + duration);
  }

  private _noise(
    duration: number, gain: number, lowHz: number, highHz: number,
    attack = 0.01, startAt?: number
  ): void {
    const ctx = this._getCtx();
    if (!ctx || !this._master) return;
    const t = startAt ?? ctx.currentTime;
    const buf = this._sharedNoise(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lo = ctx.createBiquadFilter();
    lo.type = 'highpass';
    lo.frequency.value = lowHz;
    const hi = ctx.createBiquadFilter();
    hi.type = 'lowpass';
    hi.frequency.value = highHz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, duration - 0.04));
    src.connect(lo); lo.connect(hi); hi.connect(env); env.connect(this._master);
    src.start(t);
    src.stop(t + duration);
  }

  /** One shared 2s noise buffer — copilot allocated a fresh buffer per burst. */
  private _sharedNoise(ctx: AudioContext): AudioBuffer {
    if (this._noiseBuffer) return this._noiseBuffer;
    const size = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buffer;
    return buffer;
  }

  private _makeLoop(lowHz: number, highHz: number): LoopNodes | null {
    const ctx = this._getCtx();
    if (!ctx || !this._master) return null;
    const src = ctx.createBufferSource();
    src.buffer = this._sharedNoise(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (lowHz + highHz) / 2;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter); filter.connect(gain); gain.connect(this._master);
    src.start();
    return { src, filter, gain };
  }

  private _killLoop(loop: LoopNodes | null): void {
    if (!loop) return;
    try { loop.src.stop(); } catch { /* already stopped */ }
  }

  // ── Continuous loops ─────────────────────────────────────────────────────

  startCarveLoop(mode: BoardModeId): void {
    if (this._carve) return;
    const band = CARVE_BAND[mode];
    this._carve = this._makeLoop(band.lo, band.hi);
  }

  /** Call every frame: intensity = carve amount 0..1, speedNorm 0..1. */
  setCarveIntensity(mode: BoardModeId, intensity: number, speedNorm: number): void {
    if (!this._carve || !this._ctx) return;
    const band = CARVE_BAND[mode];
    const target = clamp(0.05 * speedNorm + intensity * 0.22, 0, 0.3);
    const t = this._ctx.currentTime;
    this._carve.gain.gain.setTargetAtTime(target, t, 0.08);
    this._carve.filter.frequency.setTargetAtTime(
      band.lo + (band.hi - band.lo) * (0.3 + 0.7 * speedNorm), t, 0.12
    );
  }

  stopCarveLoop(): void { this._killLoop(this._carve); this._carve = null; }

  startGrindLoop(): void {
    if (this._grind) return;
    this._grind = this._makeLoop(2400, 9000);
    if (this._grind && this._ctx) {
      this._grind.gain.gain.setTargetAtTime(0.16, this._ctx.currentTime, 0.03);
    }
    this._tone(1320, 0.09, 0.18, 'square', 0.002, 0.03); // metallic catch "tink"
  }

  setGrindStress(stress: number): void {
    if (!this._grind || !this._ctx) return;
    // wobble pitch as balance degrades — audible danger cue
    this._grind.filter.frequency.setTargetAtTime(
      2400 + 5200 * clamp(stress, 0, 1), this._ctx.currentTime, 0.05
    );
  }

  stopGrindLoop(): void {
    if (this._grind && this._ctx) {
      this._grind.gain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.03);
    }
    const dead = this._grind;
    this._grind = null;
    if (dead) setTimeout(() => this._killLoop(dead), 200);
  }

  startBoostLoop(): void {
    if (this._boost) return;
    this._boost = this._makeLoop(120, 1400);
    if (this._boost && this._ctx) {
      this._boost.gain.gain.setTargetAtTime(0.14, this._ctx.currentTime, 0.1);
    }
  }

  stopBoostLoop(): void {
    if (this._boost && this._ctx) {
      this._boost.gain.gain.setTargetAtTime(0, this._ctx.currentTime, 0.12);
    }
    const dead = this._boost;
    this._boost = null;
    if (dead) setTimeout(() => this._killLoop(dead), 400);
  }

  // ── One-shots ────────────────────────────────────────────────────────────

  ollie(charge: number): void {
    this._noise(0.05, 0.25, 400, 3000, 0.003);
    this._tone(300 + charge * 220, 0.09, 0.3, 'triangle', 0.002, 0.03);
  }

  trickWhoosh(): void {
    this._noise(0.14, 0.16, 3000, 12000, 0.006);
  }

  /** Ported from copilot _playTrickLand, plus quality voicing. */
  trickLand(quality: LandingQuality): void {
    const ctx = this._getCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    this._noise(0.12, 0.5, 60, 500, 0.003, t);
    if (quality === 'clean') {
      this._tone(440, 0.15, 0.3, 'triangle', 0.004, 0.05, t + 0.02);
    } else if (quality === 'sketchy') {
      this._tone(300, 0.14, 0.24, 'sawtooth', 0.004, 0.05, t + 0.02);
    }
  }

  bail(): void {
    const ctx = this._getCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    this._noise(0.28, 0.55, 50, 700, 0.004, t);
    this._tone(220, 0.3, 0.3, 'sawtooth', 0.005, 0.1, t + 0.03);
    this._tone(165, 0.32, 0.25, 'sawtooth', 0.005, 0.12, t + 0.14);
  }

  /** Bank fanfare — arpeggio height scales with the multiplier. */
  bank(multiplier: number): void {
    const ctx = this._getCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    const steps = clamp(2 + Math.floor(multiplier / 2), 2, 6);
    for (let i = 0; i < steps; i++) {
      this._tone(440 * Math.pow(2, (i * 3) / 12), 0.16, 0.3, 'sine', 0.003, 0.05, t + i * 0.05);
    }
  }

  boostIgnite(): void {
    this._noise(0.3, 0.35, 100, 1800, 0.01);
    this._tone(110, 0.3, 0.25, 'sawtooth', 0.01, 0.1);
  }

  trickyFanfare(): void {
    const ctx = this._getCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this._tone(f, 0.28, 0.32, 'sine', 0.004, 0.07, t + i * 0.06)
    );
    this._noise(0.4, 0.12, 3000, 12000, 0.02, t);
  }

  countdownTick(): void { this._tone(880, 0.08, 0.3, 'sine', 0.002, 0.03); }

  matchStart(): void {
    const ctx = this._getCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    [523, 784, 1047].forEach((f, i) => this._tone(f, 0.2, 0.4, 'sine', 0.003, 0.05, t + i * 0.07));
  }

  matchEnd(): void {
    const ctx = this._getCtx(); if (!ctx) return;
    const t = ctx.currentTime;
    this._tone(880, 0.5, 0.35, 'sine', 0.01, 0.2, t);
    this._tone(1108, 0.4, 0.28, 'sine', 0.01, 0.15, t + 0.2);
  }
}
