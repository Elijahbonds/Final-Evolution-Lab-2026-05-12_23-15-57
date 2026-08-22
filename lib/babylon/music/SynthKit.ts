// SynthKit — procedural drum/instrument synthesis for the Music Studio
// (M57, Phase 7). Solves the studio's fatal dependency: M28's MusicMode
// loads eight WAVs from `/audio/kits/808/*.wav` that were never shipped —
// even once routed, it would boot a silent kit. Same philosophy as SoundKit
// (M43): every sound is SYNTHESIZED via OfflineAudioContext into real
// AudioBuffers at load, zero external asset files, so the studio can never
// 404 its own instruments.
//
// Three kits ship, one free + two unlockable (the studio gates them):
//   street  — the classic booming club kit (free)
//   neon    — bright, tight, electro-leaning
//   dust    — lo-fi, soft transients, vinyl-ish noise floor

export interface KitSampleDef {
  id: string; name: string; category: 'kick' | 'snare' | 'hat' | 'perc' | 'bass' | 'melody' | 'vox' | 'fx';
}
export const KIT_SLOTS: KitSampleDef[] = [
  { id: 'kick', name: 'Kick', category: 'kick' },
  { id: 'snare', name: 'Snare', category: 'snare' },
  { id: 'hat', name: 'Hat', category: 'hat' },
  { id: 'open', name: 'Open', category: 'hat' },
  { id: 'clap', name: 'Clap', category: 'perc' },
  { id: 'bass', name: 'Bass', category: 'bass' },
  { id: 'lead', name: 'Lead', category: 'melody' },
  { id: 'fx', name: 'FX', category: 'fx' },
];

export type KitId = 'street' | 'neon' | 'dust';
export const KIT_META: Record<KitId, { label: string; blurb: string; unlockShards: number }> = {
  street: { label: 'STREET', blurb: 'The classic boom - free', unlockShards: 0 },
  neon: { label: 'NEON', blurb: 'Bright, tight, electric', unlockShards: 200 },
  dust: { label: 'DUST', blurb: 'Lo-fi, warm, worn-in', unlockShards: 400 },
};

interface KitFlavor {
  kickFreq: number; kickDecay: number; kickClick: number;
  snareTone: number; snareNoise: number; snareDecay: number;
  hatHp: number; hatDecay: number; openDecay: number;
  bassWave: OscillatorType; bassFreq: number; leadWave: OscillatorType; leadFreq: number;
  grit: number;                      // 0..1 noise floor (dust's vinyl feel)
}
const FLAVORS: Record<KitId, KitFlavor> = {
  street: { kickFreq: 120, kickDecay: 0.5, kickClick: 0.6, snareTone: 190, snareNoise: 0.9, snareDecay: 0.22, hatHp: 7500, hatDecay: 0.05, openDecay: 0.34, bassWave: 'sine', bassFreq: 55, leadWave: 'square', leadFreq: 440, grit: 0 },
  neon: { kickFreq: 150, kickDecay: 0.3, kickClick: 1, snareTone: 240, snareNoise: 0.7, snareDecay: 0.14, hatHp: 9500, hatDecay: 0.035, openDecay: 0.25, bassWave: 'sawtooth', bassFreq: 65, leadWave: 'sawtooth', leadFreq: 523, grit: 0 },
  dust: { kickFreq: 95, kickDecay: 0.6, kickClick: 0.25, snareTone: 160, snareNoise: 0.55, snareDecay: 0.3, hatHp: 6000, hatDecay: 0.07, openDecay: 0.4, bassWave: 'triangle', bassFreq: 49, leadWave: 'triangle', leadFreq: 392, grit: 0.06 },
};

const SR = 44100;

async function render(seconds: number, build: (ctx: OfflineAudioContext, out: GainNode) => void, grit = 0): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  build(ctx, out);
  if (grit > 0) {                                     // dust's vinyl noise floor
    const nb = ctx.createBuffer(1, ctx.length, SR);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * grit;
    const src = ctx.createBufferSource();
    src.buffer = nb;
    src.connect(out);
    src.start(0);
  }
  return ctx.startRendering();
}

function noiseBurst(ctx: OfflineAudioContext, out: AudioNode, at: number, dur: number, hpFreq: number, gain: number): void {
  const nb = ctx.createBuffer(1, Math.ceil(SR * dur), SR);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = nb;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = hpFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(hp).connect(g).connect(out);
  src.start(at);
}

function tone(ctx: OfflineAudioContext, out: AudioNode, wave: OscillatorType, f0: number, f1: number, at: number, dur: number, gain: number): void {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur * 0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  osc.connect(g).connect(out);
  osc.start(at); osc.stop(at + dur);
}

/** Synthesize all eight slots of a kit. Returns id → AudioBuffer. */
export async function synthesizeKit(kit: KitId): Promise<Map<string, AudioBuffer>> {
  const f = FLAVORS[kit];
  const out = new Map<string, AudioBuffer>();

  out.set('kick', await render(f.kickDecay + 0.05, (ctx, o) => {
    tone(ctx, o, 'sine', f.kickFreq, 40, 0, f.kickDecay, 1);
    if (f.kickClick > 0) noiseBurst(ctx, o, 0, 0.02, 3000, 0.4 * f.kickClick);
  }, f.grit));

  out.set('snare', await render(f.snareDecay + 0.05, (ctx, o) => {
    tone(ctx, o, 'triangle', f.snareTone, f.snareTone * 0.85, 0, f.snareDecay * 0.8, 0.5);
    noiseBurst(ctx, o, 0, f.snareDecay, 1800, f.snareNoise);
  }, f.grit));

  out.set('hat', await render(f.hatDecay + 0.02, (ctx, o) => {
    noiseBurst(ctx, o, 0, f.hatDecay, f.hatHp, 0.5);
  }, f.grit));

  out.set('open', await render(f.openDecay + 0.05, (ctx, o) => {
    noiseBurst(ctx, o, 0, f.openDecay, f.hatHp * 0.85, 0.45);
  }, f.grit));

  out.set('clap', await render(0.25, (ctx, o) => {
    for (const [dt, g] of [[0, 0.5], [0.02, 0.4], [0.045, 0.6]] as const) {
      noiseBurst(ctx, o, dt, 0.12, 1200, g);
    }
  }, f.grit));

  out.set('bass', await render(0.42, (ctx, o) => {
    tone(ctx, o, f.bassWave, f.bassFreq, f.bassFreq, 0, 0.4, 0.8);
    tone(ctx, o, f.bassWave, f.bassFreq * 2.01, f.bassFreq * 2, 0, 0.2, 0.15);  // faint octave shimmer
  }, f.grit));

  out.set('lead', await render(0.3, (ctx, o) => {
    tone(ctx, o, f.leadWave, f.leadFreq, f.leadFreq, 0, 0.28, 0.35);
    tone(ctx, o, f.leadWave, f.leadFreq * 1.5, f.leadFreq * 1.5, 0.0, 0.2, 0.12);  // a fifth above, quieter
  }, f.grit));

  out.set('fx', await render(0.6, (ctx, o) => {
    tone(ctx, o, 'sawtooth', 200, 1400, 0, 0.55, 0.2);                            // riser
    noiseBurst(ctx, o, 0.1, 0.4, 2500, 0.15);
  }, f.grit));

  return out;
}
