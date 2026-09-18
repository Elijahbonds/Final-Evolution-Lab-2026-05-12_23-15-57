// StemBand — the Class of 3000 heart of The Cypher: a procedural funk band
// whose instruments are EARNED by dancing on the beat. Each move category
// maps to a stem; landing the step on time turns that instrument up, missing
// ducks it. The song quite literally is the dancing.
//
// No audio assets exist in this repo (the mode header's "wire an authored
// backing track when the audio pack lands" never landed), so every stem is
// synthesized on the shared AudioContext — the mode's song clock — with a
// 16th-note lookahead scheduler. All values // TUNE(elijah).

import type { DanceClip } from '../core/DanceCore';

export type StemCategory = DanceClip['category'];

/** Which instrument each move family plays. */
export const CATEGORY_STEM: Record<StemCategory, string> = {
  bounce: 'DRUMS',      // Two Step / Shoulder Bop — the pocket
  footwork: 'BASS',     // Six Step — the low end
  wave: 'KEYS',         // Arm Wave — the harmony
  toprock: 'PERC',      // Top Rock — the ticks
  freeze: 'HORNS',      // Baby Freeze — the stab
  power: 'LEAD',        // Windmill — the riff
  transition: 'FX',     // Spin — the sweep
};

/** Mix math, exported for tests. A clean hit turns a stem UP; a miss ducks
 *  it. TUNE(elijah). */
export const STEM_HIT_GAIN = 0.34;
export const STEM_MISS_LOSS = 0.3;
export function nextStemLevel(current: number, judgement: 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS'): number {
  if (judgement === 'MISS') return Math.max(0, current - STEM_MISS_LOSS);
  const up = judgement === 'GOOD' ? STEM_HIT_GAIN / 2 : STEM_HIT_GAIN;
  return Math.min(1, current + up);
}

const E = 82.41; // E2 — the band is in E minor, all night
const NOTE = {
  E2: E, G2: 98.0, A2: 110.0, B2: 123.47, D3: 146.83,
  E3: 164.81, G3: 196.0, B3: 246.94, D4: 293.66,
  E4: 329.63, G4: 392.0, B4: 493.88, D5: 587.33,
};

interface Stem {
  level: number;      // scheduled gain target 0..1
  node: GainNode;
}

export class StemBand {
  private stems = new Map<StemCategory, Stem>();
  private next16 = 0;         // next 16th-note index
  private nextTime = 0;       // its audio-clock time
  private startedAt = 0;
  private dead = false;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    private bpm: number,
  ) {
    for (const cat of Object.keys(CATEGORY_STEM) as StemCategory[]) {
      const node = ctx.createGain();
      node.gain.value = 0;
      node.connect(out);
      this.stems.set(cat, { level: 0, node });
    }
  }

  /** Called by the mode when a step is judged. */
  judge(cat: StemCategory | undefined, judgement: 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS'): void {
    if (!cat) return;
    const s = this.stems.get(cat);
    if (!s) return;
    s.level = nextStemLevel(s.level, judgement);
    s.node.gain.setTargetAtTime(s.level * 0.5, this.ctx.currentTime, 0.08);
  }

  level(cat: StemCategory): number { return this.stems.get(cat)?.level ?? 0; }

  /** How much of the band is playing, 0..1 — the "MIX" readout. */
  mixLevel(): number {
    let sum = 0;
    for (const s of this.stems.values()) sum += s.level;
    return sum / this.stems.size;
  }

  /** The count-in ended — start the grid from the mode's audio clock. */
  start(nowSec: number): void {
    this.startedAt = nowSec;
    this.next16 = 0;
    this.nextTime = nowSec;
  }

  /** Drive from the mode's update with the AUDIO clock. Schedules 0.25s ahead. */
  update(nowSec: number): void {
    if (this.dead || !this.startedAt) return;
    const sixteenth = this.bpm / 60 / 4;          // 16ths per second
    while (this.nextTime < nowSec + 0.25) {
      this.schedule16th(this.next16, this.nextTime);
      this.next16++;
      this.nextTime = this.startedAt + this.next16 / sixteenth;
    }
  }

  dispose(): void {
    this.dead = true;
    for (const s of this.stems.values()) {
      try { s.node.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch { /* closing */ }
    }
  }

  // ── the arrangement ──────────────────────────────────────────────────────
  private schedule16th(idx: number, t: number): void {
    const bar = Math.floor(idx / 16);
    const sixteenth = idx % 16;
    const beat = Math.floor(sixteenth / 4);

    // DRUMS (bounce): kick on 1 & 3, snare on 2 & 4, hats on 8ths
    if (this.level('bounce') > 0) {
      if (sixteenth % 4 === 0 && (beat === 0 || beat === 2)) this.kick(t, 'bounce');
      if (sixteenth % 4 === 0 && (beat === 1 || beat === 3)) this.snare(t, 'bounce');
      if (sixteenth % 2 === 0) this.hat(t, 'bounce', sixteenth % 4 === 2 ? 1 : 0.5);
    }
    // BASS (footwork): an E-minor walk on 8ths, two bars long
    if (this.level('footwork') > 0 && sixteenth % 2 === 0) {
      const line = [NOTE.E2, NOTE.E2, NOTE.G2, NOTE.E2, NOTE.A2, NOTE.A2, NOTE.G2, NOTE.E2];
      this.pluck(t, line[(bar * 8 + sixteenth / 2) % 8] ?? NOTE.E2, 'footwork', 0.22, 'triangle');
    }
    // KEYS (wave): Em9 stabs on the AND of 2 and 4
    if (this.level('wave') > 0 && (sixteenth === 6 || sixteenth === 14)) {
      for (const f of [NOTE.E3, NOTE.G3, NOTE.B3, NOTE.D4]) this.keys(t, f, 'wave');
    }
    // PERC (toprock): rim ticks on the off-16ths
    if (this.level('toprock') > 0 && sixteenth % 4 === 3) this.tick(t, 'toprock');
    // HORNS (freeze): a stab on the first downbeat of every 4th bar
    if (this.level('freeze') > 0 && bar % 4 === 0 && sixteenth === 0) {
      for (const f of [NOTE.E3, NOTE.G3, NOTE.B3]) this.stab(t, f, 'freeze');
    }
    // LEAD (power): a little arp every 2nd bar
    if (this.level('power') > 0 && bar % 2 === 1 && sixteenth % 4 === 0) {
      const arp = [NOTE.E4, NOTE.G4, NOTE.B4, NOTE.D5];
      this.pluck(t, arp[beat] ?? NOTE.E4, 'power', 0.16, 'square');
    }
    // FX (transition): a soft sweep into each 8th bar
    if (this.level('transition') > 0 && bar % 8 === 7 && sixteenth === 12) this.sweep(t, 'transition');
  }

  // ── the instruments (all synthesized; no assets) ─────────────────────────
  private out(cat: StemCategory): GainNode { return this.stems.get(cat)!.node; }

  private kick(t: number, cat: StemCategory): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.out(cat));
    o.start(t); o.stop(t + 0.16);
  }

  private snare(t: number, cat: StemCategory): void {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise(0.12);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    n.connect(bp).connect(g).connect(this.out(cat));
    n.start(t); n.stop(t + 0.12);
  }

  private hat(t: number, cat: StemCategory, vel: number): void {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise(0.04);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    n.connect(hp).connect(g).connect(this.out(cat));
    n.start(t); n.stop(t + 0.04);
  }

  private tick(t: number, cat: StemCategory): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = 230;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(this.out(cat));
    o.start(t); o.stop(t + 0.06);
  }

  private pluck(t: number, freq: number, cat: StemCategory, dur: number, type: OscillatorType): void {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.26, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.out(cat));
    o.start(t); o.stop(t + dur + 0.02);
  }

  private keys(t: number, freq: number, cat: StemCategory): void {
    for (const detune of [-4, 4]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = freq; o.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(this.out(cat));
      o.start(t); o.stop(t + 0.24);
    }
  }

  private stab(t: number, freq: number, cat: StemCategory): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(lp).connect(g).connect(this.out(cat));
    o.start(t); o.stop(t + 0.32);
  }

  private sweep(t: number, cat: StemCategory): void {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise(0.5);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3600, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(bp).connect(g).connect(this.out(cat));
    n.start(t); n.stop(t + 0.52);
  }

  private noiseCache = new Map<number, AudioBuffer>();
  private noise(seconds: number): AudioBuffer {
    const key = Math.round(seconds * 100);
    const cached = this.noiseCache.get(key);
    if (cached) return cached;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseCache.set(key, buf);
    return buf;
  }
}
