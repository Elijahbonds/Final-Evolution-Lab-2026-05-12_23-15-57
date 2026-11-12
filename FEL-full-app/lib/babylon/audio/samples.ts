// samples.ts — RECORDED SOUND BESIDE THE SYNTHS (hoops-sound, phase 11a, 2026-11-12).
//
// Until now every effect in the game was synthesised (SoundKit.ts:1-8). The owner chose CC0 recordings for the basketball sounds
// (2026-11-12): public/audio/hoops/ (CREDITS.md, sources.json; built by scripts/audio/hoops-foley/build.mjs). This file is the pure
// half of the sample player: which recordings stand in for which SoundKit cue, the bank that fetches and decodes them, and the
// round-robin with pitch and volume jitter. SoundKit plays what it hands back through the same buses, ducking and limiter as the
// synths; when a cue has nothing loaded (still loading, a failed fetch, a decode error, the knob off) `pick` returns null and SoundKit
// plays the synth it always played, so nothing ever goes silent.
//
// Scope: a bank is active only while a mode that asked for it is mounted (ModeHarness: after READY, released on teardown), so the
// karate thud or the dunk's swish keep their synth. Pure: no DOM, no Web Audio types (the buffer type is a parameter).

/** feel knob `hoops.sampleSfxOn` default: the recorded sounds stand in for the synths where the set has them (1). 0 = every cue is the
 *  synth exactly as before, the crowd bed is the noise bed, and nothing is fetched. */
export const SAMPLE_SFX_ON = 1;

/** One cue's recordings and how they are played. */
export interface SampleCue {
  /** The variations (site-relative URLs under public/). */
  urls: readonly string[];
  /** The level at volume 1 (a linear gain on the normalised file): sets the recording beside the synth it replaces. */
  gain: number;
  /** Playback-rate spread, ± (0.04 = ±4 %): no two hits are the same pitch. */
  pitchJitter: number;
  /** Level spread, ± in dB. */
  volJitterDb: number;
  /** 'crowd' plays through the crowd duck (ducked under a voice like the synth crowd); 'sfx' through the SFX bus. */
  bus: 'sfx' | 'crowd';
  /** At most this many of the cue playing at once (a pile-up of dribbles from six bodies never stacks up). */
  maxVoices: number;
}

// Each URL is a literal so lib/feel/sensory-assets.test.ts proves the file exists under public/.
/** THE HOOPS SET. Keys are SoundKit cue names; a cue with no row keeps its synth (groan, whistle, score, whoosh, impact, thud…).
 *  GAINS ARE MEASURED (scripts/probes/hoops-sound/loudness.mts: each cue rendered at volume 1 through SoundKit's own graph, the loudest
 *  50 ms at the limiter's output): a recording that replaces a synth plays at that synth's level (±1 dB), so the mix the modes set with
 *  their volumes is kept and only the sound changes — swish -48, rim -34, cheer -35 dB. Two exceptions, flagged: the squeak's synth
 *  measures -68 dB (it cannot be heard), so its recording is set to -40 dB, between the swish and the impacts (assumption: the owner's
 *  ear decides); the dribble and the catch are new — the bounce at -38 dB (beside the impacts, -33; at the dribble volume 0.6, -42) and
 *  the catch at -40 dB, each with its own synth fallback set to the same level. */
export const HOOPS_SAMPLES: Readonly<Record<string, SampleCue>> = {
  // the dribble (a new cue: no synth stood here before; its synth fallback is SoundKit's 'bounce')
  bounce: { urls: ['/audio/hoops/bounce_1.mp3', '/audio/hoops/bounce_2.mp3', '/audio/hoops/bounce_3.mp3', '/audio/hoops/bounce_4.mp3', '/audio/hoops/bounce_5.mp3', '/audio/hoops/bounce_6.mp3'], gain: 0.93, pitchJitter: 0.05, volJitterDb: 1.5, bus: 'sfx', maxVoices: 6 },
  // sneakers on the court
  squeak: { urls: ['/audio/hoops/squeak_1.mp3', '/audio/hoops/squeak_2.mp3', '/audio/hoops/squeak_3.mp3', '/audio/hoops/squeak_4.mp3', '/audio/hoops/squeak_5.mp3'], gain: 0.081, pitchJitter: 0.06, volJitterDb: 2, bus: 'sfx', maxVoices: 3 },
  // the iron: a clank, a clank, a rattle
  rattle: { urls: ['/audio/hoops/rim_1.mp3', '/audio/hoops/rim_2.mp3', '/audio/hoops/rim_3.mp3'], gain: 0.137, pitchJitter: 0.04, volJitterDb: 1.5, bus: 'sfx', maxVoices: 3 },
  // through the net (a nylon rustle standing in for a net: CREDITS.md)
  swish: { urls: ['/audio/hoops/net_1.mp3', '/audio/hoops/net_2.mp3', '/audio/hoops/net_3.mp3', '/audio/hoops/net_4.mp3'], gain: 0.051, pitchJitter: 0.05, volJitterDb: 1.5, bus: 'sfx', maxVoices: 2 },
  // a pass caught (a new cue; its synth fallback is SoundKit's 'catch')
  catch: { urls: ['/audio/hoops/catch_1.mp3', '/audio/hoops/catch_2.mp3', '/audio/hoops/catch_3.mp3'], gain: 0.264, pitchJitter: 0.05, volJitterDb: 1.5, bus: 'sfx', maxVoices: 3 },
  // the crowd cheers
  crowdCheer: { urls: ['/audio/hoops/cheer_1.mp3', '/audio/hoops/cheer_2.mp3'], gain: 0.096, pitchJitter: 0.03, volJitterDb: 1, bus: 'crowd', maxVoices: 2 },
};
/** The crowd's murmur, a seamless loop of `HOOPS_BED_LOOP_SEC` (the 'stadium' bed while the hoops bank is active). */
export const HOOPS_BED_URL = '/audio/hoops/crowd_bed.mp3';
export const HOOPS_BED_LOOP_SEC = 14;
/** The bed's base level: measured to sit where the noise bed sits (-46 dB mean at the limiter, loudness.mts); the harness's momentum
 *  swell scales it exactly as it scaled the noise. */
export const HOOPS_BED_GAIN = 0.063;

/** The sample banks by name, and which modes load one. */
export const SAMPLE_BANKS = { hoops: { cues: HOOPS_SAMPLES, bed: { url: HOOPS_BED_URL, loopSec: HOOPS_BED_LOOP_SEC, gain: HOOPS_BED_GAIN } } } as const;
export type SampleBankName = keyof typeof SAMPLE_BANKS;
const HOOPS_MODES = new Set(['onevone', 'threevthree', 'threepoint']);
/** The bank a mode plays (null: the synths only). The court modes: 1v1, 3v3 and the 3-point contest. */
export function sampleBankFor(modeId: string | null | undefined): SampleBankName | null {
  return modeId && HOOPS_MODES.has(modeId) ? 'hoops' : null;
}

/** A round-robin over `n` variations: every variation once before any repeats, never the same one twice in a row. */
export class RoundRobin {
  private order: number[] = [];
  private last = -1;
  constructor(private readonly n: number, private readonly rand: () => number = Math.random) {}
  next(): number {
    if (this.n <= 1) return 0;
    if (!this.order.length) {
      this.order = Array.from({ length: this.n }, (_, i) => i);
      for (let i = this.n - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [this.order[i], this.order[j]] = [this.order[j], this.order[i]]; }
      if (this.order[0] === this.last) this.order.push(this.order.shift()!);
    }
    this.last = this.order.shift()!;
    return this.last;
  }
}

/** A multiplier spread evenly in ±`amount` (rate) — `rand` in [0, 1). */
export const jitterRate = (amount: number, rand: () => number): number => 1 + (rand() * 2 - 1) * Math.max(0, amount);
/** A linear gain spread evenly in ±`db` dB. */
export const jitterGain = (db: number, rand: () => number): number => 10 ** (((rand() * 2 - 1) * Math.max(0, db)) / 20);

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed';
/** How the bank gets bytes and decodes them (SoundKit passes fetch and decodeAudioData; a test passes fakes). */
export interface SampleIo<B> {
  fetch(url: string): Promise<ArrayBuffer>;
  decode(bytes: ArrayBuffer): Promise<B>;
}
/** What to play for one hit. */
export interface SamplePick<B> { buffer: B; rate: number; gain: number; bus: 'sfx' | 'crowd'; maxVoices: number }

/**
 * THE BANK: fetches and decodes a set once (lazily: `load()`, never at construction), a few files at a time, the cues in the order
 * given (the dribble first). A variation that fails is skipped; a cue with no variation loaded hands back null (the synth plays).
 */
export class SampleBank<B> {
  private readonly buffers = new Map<string, (B | null)[]>();
  private readonly robins = new Map<string, RoundRobin>();
  private bedBuf: B | null = null;
  private loading: Promise<void> | null = null;
  private stateNow: LoadState = 'idle';
  /** Files fetched and decoded / failed (a probe reads these). */
  loaded = 0;
  failed = 0;
  constructor(
    private readonly cues: Readonly<Record<string, SampleCue>>,
    private readonly bed: { url: string } | null,
    private readonly io: SampleIo<B>,
    private readonly rand: () => number = Math.random,
    private readonly concurrency = 3,
  ) {}
  get state(): LoadState { return this.stateNow; }
  /** Start loading (idempotent). Resolves when every file has loaded or failed; never rejects. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.stateNow = 'loading';
    const jobs: (() => Promise<void>)[] = [];
    for (const [name, cue] of Object.entries(this.cues)) {
      const slots: (B | null)[] = cue.urls.map(() => null);
      this.buffers.set(name, slots);
      this.robins.set(name, new RoundRobin(cue.urls.length, this.rand));
      cue.urls.forEach((u, i) => jobs.push(async () => { slots[i] = await this.one(u); }));
    }
    if (this.bed) { const url = this.bed.url; jobs.push(async () => { this.bedBuf = await this.one(url); }); }
    let next = 0;
    const worker = async (): Promise<void> => { while (next < jobs.length) { const j = jobs[next++]; await j(); } };
    this.loading = Promise.all(Array.from({ length: Math.max(1, Math.min(this.concurrency, jobs.length)) }, worker)).then(() => {
      this.stateNow = this.loaded > 0 ? 'ready' : 'failed';
    });
    return this.loading;
  }
  private async one(url: string): Promise<B | null> {
    try {
      const bytes = await this.io.fetch(url);
      const b = await this.io.decode(bytes);
      this.loaded++;
      return b;
    } catch {
      this.failed++;
      return null;
    }
  }
  /** Is there anything to play for this cue now? */
  has(name: string): boolean { return !!this.buffers.get(name)?.some((b) => b !== null); }
  /** One hit of `name`: the next variation in the round-robin that has loaded, with its rate and level jitter. Null: play the synth. */
  pick(name: string): SamplePick<B> | null {
    const cue = this.cues[name], slots = this.buffers.get(name), rr = this.robins.get(name);
    if (!cue || !slots || !rr || !slots.some((b) => b !== null)) return null;
    let i = rr.next();
    if (slots[i] === null) {   // that variation failed to load: the next loaded one after it (a failed file never silences a cue)
      let k = 1; while (k < slots.length && slots[(i + k) % slots.length] === null) k++;
      i = (i + k) % slots.length;
    }
    const buffer = slots[i];
    if (buffer === null) return null;
    return { buffer, rate: jitterRate(cue.pitchJitter, this.rand), gain: cue.gain * jitterGain(cue.volJitterDb, this.rand), bus: cue.bus, maxVoices: cue.maxVoices };
  }
  /** The bed's loop, once loaded (null: the synth bed). */
  bedBuffer(): B | null { return this.bedBuf; }
}

/** Where the loop runs in a decoded bed: its authored length when the decode is that long (an MP3 decoder that honours the encoder's
 *  delay and padding gives exactly that); otherwise past a possible encoder delay at the start, the same length or what is there. */
export function bedLoopWindow(durationSec: number, loopSec: number): { start: number; end: number } {
  const extra = durationSec - loopSec;
  if (Math.abs(extra) < 0.003) return { start: 0, end: loopSec };
  const start = Math.min(0.03, Math.max(0, extra));
  return { start, end: Math.min(durationSec, start + loopSec) };
}
