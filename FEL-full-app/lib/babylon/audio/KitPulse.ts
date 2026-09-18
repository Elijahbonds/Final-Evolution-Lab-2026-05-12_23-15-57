// KitPulse — the FEL 808 kit under the routine (owner decision 2026-09-06:
// "FEL 808 kit pulse under the band"). The StemBand is EARNED by dancing;
// this is the floor the dancer stands on — kick, clap, hats from the
// FEL-owned /audio/kits/808 stems, scheduled on the mode's audio clock with
// the same 16th-note lookahead the band uses, so both stay locked.
//
// Pattern lives in `kitPattern` (pure, tested). Audio lives in the class.
// No asset → that voice is silent, never an error: the mode must run headless.

export interface KitPattern {
  /** 16th-note indices within a bar (0..15) on which each voice hits. */
  kick: number[];
  clap: number[];
  hat: number[];
  openhat: number[];
}

/** One pattern per chart, denser with difficulty. */
export function kitPattern(trackId: string): KitPattern {
  switch (trackId) {
    case 'warmup':
      return { kick: [0, 8], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], openhat: [] };
    case 'battle':
      return { kick: [0, 6, 8, 10], clap: [4, 12, 14], hat: Array.from({ length: 16 }, (_, i) => i), openhat: [7, 15] };
    default:
      return { kick: [0, 7, 8], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14, 15], openhat: [14] };
  }
}

export type KitVoice = keyof KitPattern;

export const KIT_URLS: Record<KitVoice, string> = {
  kick: '/audio/kits/808/kick.wav',
  clap: '/audio/kits/808/clap.wav',
  hat: '/audio/kits/808/hat.wav',
  openhat: '/audio/kits/808/openhat.wav',
};

const VOICE_GAIN: Record<KitVoice, number> = { kick: 0.9, clap: 0.55, hat: 0.35, openhat: 0.4 };
const LOOKAHEAD_SEC = 0.25;

export class KitPulse {
  private buffers = new Map<KitVoice, AudioBuffer>();
  private out: GainNode;
  private next16 = 0;
  private nextTime = 0;
  private startedAt = 0;
  private dead = false;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private bpm: number,
    private pattern: KitPattern,
    level = 0.7,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = level;
    this.out.connect(dest);
  }

  /** Fetch + decode the stems. Resolves to how many voices loaded. */
  async load(fetchImpl: typeof fetch = fetch): Promise<number> {
    const jobs = (Object.keys(KIT_URLS) as KitVoice[]).map(async (v) => {
      try {
        const res = await fetchImpl(KIT_URLS[v]);
        if (!res.ok) return;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (!this.dead) this.buffers.set(v, buf);
      } catch { /* silent voice */ }
    });
    await Promise.all(jobs);
    return this.buffers.size;
  }

  get voices(): number { return this.buffers.size; }

  /** The pick screen may change the track after the stems are loaded:
   *  retune tempo + pattern without reloading (only before `start`). */
  retune(bpm: number, pattern: KitPattern): void {
    this.bpm = bpm;
    this.pattern = pattern;
  }

  /** Four hat clicks (the first accented) so the count-in is HEARD on the
   *  audio clock, not just counted on the frame clock. */
  countIn(t0: number, beats = 4): void {
    const bd = 60 / this.bpm;
    for (let i = 0; i < beats; i++) this.hit('hat', t0 + i * bd, i === 0 ? 1 : 0.6);
  }

  start(nowSec: number): void {
    this.startedAt = nowSec;
    this.next16 = 0;
    this.nextTime = nowSec;
  }

  /** Drive from the mode's update with the AUDIO clock. */
  update(nowSec: number): void {
    if (this.dead || !this.startedAt) return;
    const per16 = 60 / this.bpm / 4;
    while (this.nextTime < nowSec + LOOKAHEAD_SEC) {
      this.schedule16th(this.next16 % 16, this.nextTime);
      this.next16++;
      this.nextTime = this.startedAt + this.next16 * per16;
    }
  }

  /** Duck to silence and stop scheduling (results, dispose). */
  dispose(): void {
    this.dead = true;
    try { this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch { /* closing */ }
  }

  private schedule16th(idx: number, t: number): void {
    const p = this.pattern;
    if (p.kick.includes(idx)) this.hit('kick', t, idx === 0 ? 1 : 0.85);
    if (p.clap.includes(idx)) this.hit('clap', t, 1);
    if (p.openhat.includes(idx)) this.hit('openhat', t, 0.9);
    else if (p.hat.includes(idx)) this.hit('hat', t, idx % 4 === 0 ? 1 : 0.7);
  }

  private hit(v: KitVoice, t: number, vel: number): void {
    const buf = this.buffers.get(v);
    if (!buf || this.dead) return;
    // A time already behind the clock (stems decoded after the count-in was
    // scheduled) would play NOW and stack into a burst — skip it instead.
    if (t < this.ctx.currentTime - 0.01) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = VOICE_GAIN[v] * vel;
    src.connect(g).connect(this.out);
    src.start(t);
  }
}
