// lib/babylon/music/mixGraph.ts — THE ACADEMY'S ONE MIXING DESK: every sound the groovebox makes, live or rendered, goes
// through a graph this file builds. No globals, no window: it takes the context it builds on (an AudioContext for the
// room, an OfflineAudioContext for each render, the fake in the tests) and the project's mixer.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody". What was wrong (outbox musicsuite/understand-wf_3a55346f-032.json,
// problems[16] and [12]; the map's "wrongClaims" corrected it, :1):
//   * NO MIXER. TrackState carried volume / muted / pan with no UI, and nothing could solo a row.
//   * NO LIMITER. The master was a bare 0.8 gain into the speakers (AudioEngine.ts:131-138 then); MASTER was a glue
//     compressor at −18 dB, ratio 3, off by default. Eight rows at 0.8 on a shared hit can pass 0 dBFS, and encodeWav
//     hard-clipped the export at ±1 (AudioEngine.ts:401 then) — a busy beat distorted, live and in the file.
//   * NO ROOM, NO DELAY. The only reverb in FEL was the MC's PA (lib/babylon/audio/mic/VoiceKit.ts paFor/roomIR).
//   * TWO GRAPHS. P2 made every render go "volume → pan → offlineBus()" so the stems summed to the mix, but the live
//     master and offlineBus were still two pieces of code that had to be kept in step by hand.
//
// Now there is ONE builder, buildMixGraph(ctx, project), and the engine calls it for the live context and for every
// offline render (mix, stems, song, song stems), so what you hear is what you export — tested by building both on
// fakeWebAudio and comparing the node chains (mixGraph.test.ts). The graph (PHASE-4 ENGINE CONTRACT (1)):
//
//   per hit:    source (the row's buffer, or its note) → hit gain (row volume × step velocity) → hit pan (row pan)
//   per row:    → CHANNEL: fader (mixer gain) → pan (mixer pan) → mute/solo gate (0 or 1) ─┬→ bus
//                                                                                          ├→ send A (room)  → room return  → bus
//                                                                                          ├→ send B (slap)  → slap return  → bus
//                                                                                          └→ channel meter (analyser, a tap)
//   master:     bus (0.8 × master fader) → [MASTER polish: glue comp → low shelf → high shelf] → LIMITER (DynamicsCompressor
//               threshold −1.5 dBFS, knee 0, ratio 20, attack 1 ms) → safety gain → ceiling (a wave shaper that clips at
//               −0.3 dBFS) → speakers / the render; the ceiling → splitter → master meter L / R (taps).
//   metronome:  click → clickAlign (6 ms while MASTER is on) → the LIMITER (never the bus or a render) — P4 FIX PASS: it
//               went straight to the ceiling, 6–12 ms ahead of the music and hard-clipped with it (see below).
//
// THE LIMITER'S MAKEUP. A Web Audio DynamicsCompressorNode applies a fixed makeup gain of (1 / curve(0 dBFS))^0.6 — the
// spec's "makeup gain" step, and Chromium's DynamicsCompressorKernel (full_range_makeup_gain, pow 0.6) — even below its
// threshold. For −1.5 dB / ratio 20 that is +0.855 dB (limiterMakeupDb). The safety gain takes that back (SAFETY_DB), so a
// beat under the threshold plays at its old level less only the margin (measured in Chromium: a quiet tone renders
// exactly 0.500 dB under P3), and the margin covers the limiter's attack overshoot; the ceiling is the guarantee that no
// render ever passes −0.3 dBFS whatever the faders say (outbox musicsuite/p4/render-peak.json: how often it has to act).
//
// Room and slap: VoiceKit's roomIR is module-private (VoiceKit.ts:225, not exported) and its slap lives inside paFor, so
// both are generated here the same way (a darkened decaying noise; one delay with a filtered feedback, VoiceKit's Venice
// numbers). The room's noise is SEEDED: the live room and a render's room are the same impulse, sample for sample — on a
// context of the same rate (the P4 fix pass renders at the live context's rate, AudioEngine.renderRate, so they are).
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25) — the review's desk findings:
//   * THE LIMITER IS LATE, AND THE CLICKS WERE NOT. A DynamicsCompressorNode delays what it passes by a fixed 6 ms (its
//     look-ahead pre-delay, the WebKit/Blink kernel's 0.006 s — measured in headless Chromium with the LIMITER settings: an
//     impulse at 0.1 s came out 5.99 ms late; through MASTER's glue comp + the limiter, 11.97 ms). Every hit and take goes
//     through it; the metronome and count-in went click → ceiling, so every click sounded 6 ms (12 ms with MASTER) BEFORE
//     its beat — and CHECK MY TIMING, which pairs taps with those clicks, saved an offset missing the music's delay, while
//     PERFORM judged notes that had it (every player a steady 6–12 ms late). Now a click goes click → clickAlign (a delay of
//     the polish comp's 6 ms while MASTER is on, else 0) → the LIMITER, so it crosses exactly the compressors a hit crosses
//     and lands with it (mixGraph.test.ts walks both paths and counts them). `latencySec` / graphLatencySec(polished) is that
//     delay, for the rooms' latency formulas (PERFORM, the booth, the timing check — AudioEngine.graphLatencySec).
//   * A LOUD BEAT WAS HARD-CLIPPED UNDER EVERY CLICK: the click was summed AFTER the limiter, at the ceiling (0.55 + a beat
//     peaking at 0.897 = past the −0.3 dBFS clip). In front of the limiter the sum is limited, never clipped (a click on a hot
//     downbeat pulls the beat down for the limiter's 100 ms release instead — live only: renders have no clicks).
//   * MIXER MOVES JUMPED. applyStrip wrote `.value` on every fader / pan / gate / send (a drag stepped, a mute clicked). The
//     live graph (buildMixGraph(…, { live: true })) glides each change (setTargetAtTime, RAMP_TC); a render's graph is static
//     and keeps `.value`. A strip's first settings are always set at once (it is new: there is nothing to glide from).
//   * A SOLO NOBODY CAN SEE. anySolo counted every stored strip, drawn or not: a solo left on TAKES after its last take was
//     deleted closed every row's gate — PLAY and PUBLISH silent, no lit S anywhere to press. scopeSolo(mixer, liveIds) keeps
//     only the solos of strips that can sound (the rows drawn, TAKES while there are takes); the room hands the engine that.

/** The master bus level — live and in every render (P2's MASTER_GAIN, AudioEngine.ts then). */
export const MASTER_GAIN = 0.8;

/** One channel strip's settings: the mixer's per-row state (StudioProject.mixer.channels). */
export interface ChannelMix {
  /** Fader, 0..CHANNEL_GAIN_MAX (1 = unity). */
  gain: number;
  /** −1 (left) .. 1 (right). */
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Send A: how much of the channel goes to the ROOM (0..1). */
  sendA: number;
  /** Send B: how much goes to the SLAP delay (0..1). */
  sendB: number;
}
export const DEFAULT_CHANNEL: Readonly<ChannelMix> = { gain: 1, pan: 0, mute: false, solo: false, sendA: 0, sendB: 0 };
export const CHANNEL_GAIN_MAX = 1.5;
export const MASTER_FADER_MAX = 1.5;
/** The strip every recorded take plays through (one strip for the booth, like a vocal bus). */
export const TAKES_CHANNEL = 'takes';

/** The whole desk: the master fader and each channel that is not at its defaults. */
export interface MixerState {
  master: number;
  channels: Readonly<Record<string, Partial<ChannelMix>>>;
}
export const DEFAULT_MIXER: Readonly<MixerState> = { master: 1, channels: {} };

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const num = (v: unknown, dflt: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : dflt);

/** A channel's settings with the defaults filled in (and every number clamped). */
export function channelMix(mixer: Pick<MixerState, 'channels'> | null | undefined, id: string): ChannelMix {
  const c = mixer?.channels?.[id];
  if (!c) return { ...DEFAULT_CHANNEL };
  return {
    gain: num(c.gain, 1, 0, CHANNEL_GAIN_MAX),
    pan: num(c.pan, 0, -1, 1),
    mute: c.mute === true,
    solo: c.solo === true,
    sendA: num(c.sendA, 0, 0, 1),
    sendB: num(c.sendB, 0, 0, 1),
  };
}

// ── mute / solo (pure: the rule is tested once, and the engine's hears() and the gates both read it) ────────────────

/** Is any channel soloed? */
export function anySolo(mixer: Pick<MixerState, 'channels'> | null | undefined): boolean {
  return !!mixer && Object.values(mixer.channels ?? {}).some((c) => c?.solo === true);
}
/**
 * Does this channel reach the bus? Not muted, and — when anything is soloed — soloed itself. Mute wins over solo (a muted,
 * soloed row is silent and still silences the others: the usual desk rule).
 */
export function gateOpen(mixer: Pick<MixerState, 'channels'> | null | undefined, id: string): boolean {
  const c = channelMix(mixer, id);
  if (c.mute) return false;
  return !anySolo(mixer) || c.solo;
}
/** The gate value (0 or 1) for each id. */
export function gateGains(mixer: Pick<MixerState, 'channels'> | null | undefined, ids: Iterable<string>): Record<string, 0 | 1> {
  const out: Record<string, 0 | 1> = {};
  for (const id of ids) out[id] = gateOpen(mixer, id) ? 1 : 0;
  return out;
}
/**
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): the desk as it can SOUND — a solo on a strip that cannot sound (a row the grid does
 * not draw, TAKES with no take left) is dropped, so it cannot silence everything else from where no S button shows it. Mute
 * is kept as it is (a muted strip that cannot sound silences nothing else). The same object back when nothing is dropped.
 */
export function scopeSolo<M extends MixerState>(mixer: M, liveIds: Iterable<string>): M {
  const live = new Set(liveIds);
  const drop = Object.keys(mixer.channels ?? {}).filter((id) => mixer.channels[id]?.solo === true && !live.has(id));
  if (!drop.length) return mixer;
  const channels = { ...mixer.channels };
  for (const id of drop) channels[id] = { ...channels[id], solo: false };
  return { ...mixer, channels };
}

// ── the desk's own delay (MUSIC-SUITE P4 FIX PASS) ───────────────────────────────────────────────────────────────────

/**
 * How late a DynamicsCompressorNode's output is: a fixed 6 ms look-ahead pre-delay (the WebKit / Blink kernel's 0.006 s,
 * which Chromium, Firefox and Safari share — assumption for the last two; measured in headless Chromium: 5.99 ms at 44.1 kHz,
 * 264 frames).
 */
export const COMPRESSOR_DELAY_S = 0.006;
/** The desk's delay from a source to the speakers: the limiter's 6 ms, and MASTER's glue compressor's 6 ms when on. */
export function graphLatencySec(polished: boolean): number { return COMPRESSOR_DELAY_S * (polished ? 2 : 1); }
/**
 * A compressor's look-ahead in whole frames at this rate, as seconds — what the click's alignment delay copies (measured
 * in headless Chromium: 264 frames at 44.1 kHz = floor(0.006 × 44 100); assumption: the kernel floors, 288 at 48 kHz).
 */
export function compressorDelayAt(sampleRate: number): number {
  return Number.isFinite(sampleRate) && sampleRate > 0 ? Math.floor(COMPRESSOR_DELAY_S * sampleRate) / sampleRate : COMPRESSOR_DELAY_S;
}
/** The live desk's glide on a mixer move (s, setTargetAtTime's time constant: ~99 % there in 40 ms). */
export const RAMP_TC = 0.008;

// ── the limiter ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** PHASE-4 ENGINE CONTRACT (1): a brickwall-style DynamicsCompressor. `release` is ours (not in the contract): 100 ms. */
export const LIMITER = { threshold: -1.5, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const;
/** No render peaks above this (dBFS): the ceiling clips here. */
export const CEILING_DBFS = -0.3;
export const CEILING = Math.pow(10, CEILING_DBFS / 20);

/**
 * The makeup gain a Web Audio compressor adds on its own, in dB: its curve at 0 dBFS is T + (0 − T) / ratio (hard knee),
 * the "full range gain"; makeup = (1 / that)^0.6. −1.5 dB / 20:1 → +0.855 dB.
 */
export function limiterMakeupDb(threshold: number = LIMITER.threshold, ratio: number = LIMITER.ratio): number {
  const fullRangeDb = threshold + (0 - threshold) / ratio;
  return -0.6 * fullRangeDb;
}
/**
 * The safety gain after the limiter, in dB: the makeup taken back (so a quiet beat is unchanged) and a margin for the
 * attack's overshoot. MUSIC-SUITE P4, measured in headless Chromium (scripts/probes/_music-p4-render-peak.mts, 96 renders
 * a run, the kits' noise differs every run): at 0.2 dB the loudest grid (all 8 rows on every step, faders at unity) peaked
 * between −0.64 and −0.30 dBFS and the ceiling clipped up to 6 samples in a run; at 0.5 dB it peaks between −1.04 and
 * −0.74 dBFS and the ceiling never acts on the grid (it acts only with faders and master pushed to 1.5: ≤ 134 of 5.6 M
 * samples). A beat under the threshold is 0.5 dB quieter than it was in P3.
 */
export const SAFETY_MARGIN_DB = 0.5;
export const SAFETY_DB = -limiterMakeupDb() - SAFETY_MARGIN_DB;
export const SAFETY_GAIN = Math.pow(10, SAFETY_DB / 20);

/**
 * The ceiling's transfer curve: the identity inside ±CEILING, flat outside it (a hard clip at −0.3 dBFS). An odd point
 * count puts 0 exactly on a point; between points the shaper interpolates linearly, which is exact for the identity.
 */
export function ceilingCurve(points = 8193, ceiling = CEILING): Float32Array {
  const c = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    c[i] = Math.max(-ceiling, Math.min(ceiling, x));
  }
  return c;
}

// ── MASTER polish (P2's chain, moved here from AudioEngine.polishChain) ─────────────────────────────────────────────

function polishNodes(ctx: BaseAudioContext): { comp: DynamicsCompressorNode; low: BiquadFilterNode; high: BiquadFilterNode } {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3;
  comp.attack.value = 0.01; comp.release.value = 0.18;
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 120; low.gain.value = 2.5;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf'; high.frequency.value = 8000; high.gain.value = 2;
  comp.connect(low).connect(high);
  return { comp, low, high };
}

// ── the sends' returns ───────────────────────────────────────────────────────────────────────────────────────────────

/** The room: VoiceKit roomIR's recipe (decaying noise, one-pole darkened) at this length, SEEDED. */
export const ROOM_SEC = 1.1;
export const ROOM_SEED = 0x46454c; // 'FEL'
export const ROOM_RETURN = 0.8;
/** The slap: VoiceKit PA_PRESETS.venice (one 105 ms wall, feedback 0.18 through a 2.5 kHz low-pass). */
export const SLAP_SEC = 0.105;
export const SLAP_FEEDBACK = 0.18;
export const SLAP_LOWPASS_HZ = 2500;
export const SLAP_RETURN = 0.8;

/** mulberry32: a small seeded PRNG, so the live room and a render's room are the same impulse. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOMS = new WeakMap<object, AudioBuffer>();
/** The room's impulse for this context (made once per context; the same numbers on every context of the same rate). */
export function roomImpulse(ctx: BaseAudioContext, sec = ROOM_SEC, seed = ROOM_SEED): AudioBuffer {
  const hit = ROOMS.get(ctx);
  if (hit) return hit;
  const n = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = seeded(seed + ch);
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; lp += 0.35 * (w - lp); d[i] = lp * Math.pow(1 - i / n, 3); }
  }
  ROOMS.set(ctx, buf);
  return buf;
}

// ── the metronome's clicks ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * accent = the bar's downbeat, beat = the other quarter notes; count / countAccent = the COUNT-IN's clicks, a different
 * (higher, woodblock-like) sound so the player can tell the count from the song's own metronome.
 */
export type ClickKind = 'accent' | 'beat' | 'countAccent' | 'count';
export const CLICK_HZ: Readonly<Record<ClickKind, number>> = { accent: 1760, beat: 1175, countAccent: 2637, count: 1976 };
export const CLICK_LEVEL: Readonly<Record<ClickKind, number>> = { accent: 0.55, beat: 0.35, countAccent: 0.6, count: 0.4 };
const CLICK_SEC = 0.045;
const CLICKS = new WeakMap<object, Map<ClickKind, AudioBuffer>>();
/** A click's buffer on this context: a sine blip with a fast exponential decay (made once per context and kind). */
export function clickBuffer(ctx: BaseAudioContext, kind: ClickKind): AudioBuffer {
  let m = CLICKS.get(ctx);
  if (!m) { m = new Map(); CLICKS.set(ctx, m); }
  const hit = m.get(kind);
  if (hit) return hit;
  const n = Math.max(1, Math.floor(ctx.sampleRate * CLICK_SEC));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const w = (2 * Math.PI * CLICK_HZ[kind]) / ctx.sampleRate;
  for (let i = 0; i < n; i++) d[i] = Math.sin(w * i) * Math.exp(-i / (ctx.sampleRate * 0.008)) * CLICK_LEVEL[kind];
  m.set(kind, buf);
  return buf;
}

// ── meters ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Linear peak (max |x|) and RMS of a block. */
export interface Meter { peak: number; rms: number }
export function peakRms(samples: ArrayLike<number>): Meter {
  let peak = 0, sum = 0;
  for (let i = 0; i < samples.length; i++) { const x = samples[i]; const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; }
  return { peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0 };
}
/** dBFS of a linear level (silence reads −120). */
export function toDb(x: number): number { return x > 1e-6 ? 20 * Math.log10(x) : -120; }
export interface MeterReadout {
  master: { l: Meter; r: Meter };
  channels: Record<string, Meter>;
  /** How far the limiter is pulling the level down right now, in dB (≤ 0; 0 where the browser does not say). */
  limiterDb: number;
}
export const METER_FFT = 2048;

// ── the graph ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ChannelStrip {
  readonly id: string;
  /** Where a row's hits (and the takes) connect: the fader. */
  readonly input: AudioNode;
  readonly fader: GainNode;
  readonly pan: StereoPannerNode;
  readonly gate: GainNode;
  readonly sendA: GainNode;
  readonly sendB: GainNode;
  readonly meter: AnalyserNode;
}

export interface MixGraph {
  readonly ctx: BaseAudioContext;
  /** Every channel and both send returns sum here. */
  readonly bus: GainNode;
  /** The metronome's input: → clickAlign → the limiter (P4 FIX PASS: it crosses the compressors a hit crosses). */
  readonly click: GainNode;
  /** MUSIC-SUITE P4 FIX PASS: the click's MASTER-polish delay (0, or COMPRESSOR_DELAY_S while MASTER is on). */
  readonly clickAlign: DelayNode;
  /** MUSIC-SUITE P4 FIX PASS: how late the desk plays a source (graphLatencySec: 6 ms, 12 ms with MASTER). */
  readonly latencySec: number;
  readonly limiter: DynamicsCompressorNode;
  readonly safety: GainNode;
  readonly ceiling: WaveShaperNode;
  /** The row's strip, built the first time a row plays (with the mixer's settings for it). */
  channel(id: string): ChannelStrip;
  channelIds(): string[];
  /** Apply a mixer: every strip's fader / pan / gate / sends and the master fader, at once. */
  setMixer(m: MixerState): void;
  readonly mixer: MixerState;
  /** MASTER: the glue compressor and shelves in front of the limiter, or not. */
  setPolish(on: boolean): void;
  readonly polished: boolean;
  /** Peak + RMS of the master (L / R) and of every strip, over the last METER_FFT samples. */
  meters(): MeterReadout;
  dispose(): void;
}

/**
 * THE builder (PHASE-4 ENGINE CONTRACT (1)). `project` is the part of a StudioProject the desk reads: the mixer and
 * MASTER. Strips are built on first use, so a render only builds the rows it plays — and a strip always gets the mixer's
 * settings for its id, so building it late or early sounds the same.
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): `opts.live` — the room's graph glides a mixer move (setTargetAtTime) instead of
 * jumping; a render's graph (no `live`) is static and sets values.
 */
export function buildMixGraph(ctx: BaseAudioContext, project: { mixer?: MixerState | null; polish?: boolean } = {}, opts: { live?: boolean } = {}): MixGraph {
  let mixer: MixerState = project.mixer ?? DEFAULT_MIXER;
  let polished = project.polish === true;
  const live = opts.live === true;
  /** The last value each param was sent to (a glide's TARGET — `.value` still reads mid-glide, so it is no guide). */
  const targets = new WeakMap<AudioParam, number>();
  /** A param to `v`: at once (a render, or a node just made), else a short glide on the live clock. */
  const put = (param: AudioParam, v: number, glide: boolean): void => {
    if (glide && live) {
      if (targets.get(param) === v) return;
      param.setTargetAtTime(v, ctx.currentTime, RAMP_TC);
    } else param.value = v;
    targets.set(param, v);
  };

  // the master: bus → [polish] → limiter → safety → ceiling → out (+ meters)
  const bus = ctx.createGain();
  bus.gain.value = MASTER_GAIN * num(mixer.master, 1, 0, MASTER_FADER_MAX);
  const polish = polishNodes(ctx);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold; limiter.knee.value = LIMITER.knee; limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack; limiter.release.value = LIMITER.release;
  const safety = ctx.createGain();
  safety.gain.value = SAFETY_GAIN;
  const ceiling = ctx.createWaveShaper();
  ceiling.curve = ceilingCurve();
  ceiling.oversample = 'none';
  polish.high.connect(limiter);
  limiter.connect(safety).connect(ceiling).connect(ctx.destination);
  const wireBus = (): void => { bus.disconnect(); bus.connect(polished ? polish.comp : limiter); };
  wireBus();
  const split = ctx.createChannelSplitter(2);
  const meterL = ctx.createAnalyser(), meterR = ctx.createAnalyser();
  meterL.fftSize = METER_FFT; meterR.fftSize = METER_FFT;
  ceiling.connect(split);
  split.connect(meterL, 0);
  split.connect(meterR, 1);

  // the metronome: MUSIC-SUITE P4 FIX PASS — into the LIMITER (it was the ceiling), through a delay that matches MASTER's
  // glue compressor while it is on, so a click crosses the same compressor delay a hit does and the limiter sees the sum
  const click = ctx.createGain();
  const clickAlign = ctx.createDelay(0.05);
  clickAlign.delayTime.value = polished ? compressorDelayAt(ctx.sampleRate) : 0;
  click.connect(clickAlign).connect(limiter);

  // send A: the room
  const roomIn = ctx.createGain();
  const room = ctx.createConvolver();
  room.normalize = true;
  room.buffer = roomImpulse(ctx);
  const roomRet = ctx.createGain();
  roomRet.gain.value = ROOM_RETURN;
  roomIn.connect(room).connect(roomRet).connect(bus);
  // send B: the slap
  const slapIn = ctx.createGain();
  const slap = ctx.createDelay(1);
  slap.delayTime.value = SLAP_SEC;
  const slapLp = ctx.createBiquadFilter();
  slapLp.type = 'lowpass'; slapLp.frequency.value = SLAP_LOWPASS_HZ;
  const slapFb = ctx.createGain();
  slapFb.gain.value = SLAP_FEEDBACK;
  const slapRet = ctx.createGain();
  slapRet.gain.value = SLAP_RETURN;
  slapIn.connect(slap).connect(slapLp);
  slapLp.connect(slapFb).connect(slap);
  slapLp.connect(slapRet).connect(bus);

  const strips = new Map<string, ChannelStrip>();
  /** A strip to the mixer's settings — gliding on the live desk (`glide`), except a strip just built. */
  const applyStrip = (s: ChannelStrip, glide = true): void => {
    const c = channelMix(mixer, s.id);
    put(s.fader.gain, c.gain, glide);
    put(s.pan.pan, c.pan, glide);
    put(s.gate.gain, gateOpen(mixer, s.id) ? 1 : 0, glide);
    put(s.sendA.gain, c.sendA, glide);
    put(s.sendB.gain, c.sendB, glide);
  };
  const channel = (id: string): ChannelStrip => {
    const hit = strips.get(id);
    if (hit) return hit;
    const fader = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const gate = ctx.createGain();
    const sendA = ctx.createGain();
    const sendB = ctx.createGain();
    const meter = ctx.createAnalyser();
    meter.fftSize = METER_FFT;
    fader.connect(pan).connect(gate);
    gate.connect(bus);
    gate.connect(sendA).connect(roomIn);
    gate.connect(sendB).connect(slapIn);
    gate.connect(meter);
    const s: ChannelStrip = { id, input: fader, fader, pan, gate, sendA, sendB, meter };
    applyStrip(s, false);
    strips.set(id, s);
    return s;
  };

  const scratch = new Map<AnalyserNode, Float32Array>();
  const read = (a: AnalyserNode): Meter => {
    const had = scratch.get(a);
    const buf: Float32Array = had ?? new Float32Array(a.fftSize);
    if (!had) scratch.set(a, buf);
    a.getFloatTimeDomainData(buf);
    return peakRms(buf);
  };

  return {
    ctx, bus, click, clickAlign, limiter, safety, ceiling,
    channel,
    channelIds: () => [...strips.keys()],
    get mixer() { return mixer; },
    get latencySec() { return graphLatencySec(polished); },
    setMixer(m: MixerState): void {
      mixer = m;
      put(bus.gain, MASTER_GAIN * num(m.master, 1, 0, MASTER_FADER_MAX), true);
      for (const s of strips.values()) applyStrip(s);
    },
    get polished() { return polished; },
    setPolish(on: boolean): void {
      if (on === polished) return;
      polished = on;
      wireBus();
      clickAlign.delayTime.value = on ? compressorDelayAt(ctx.sampleRate) : 0;   // the click keeps up with the music's extra compressor
    },
    meters(): MeterReadout {
      const channels: Record<string, Meter> = {};
      for (const [id, s] of strips) channels[id] = read(s.meter);
      const r = (limiter as unknown as { reduction?: unknown }).reduction;
      return { master: { l: read(meterL), r: read(meterR) }, channels, limiterDb: typeof r === 'number' && Number.isFinite(r) ? Math.min(0, r) : 0 };
    },
    dispose(): void {
      for (const s of strips.values()) for (const n of [s.fader, s.pan, s.gate, s.sendA, s.sendB, s.meter]) n.disconnect();
      for (const n of [bus, polish.comp, polish.low, polish.high, limiter, safety, ceiling, split, click, clickAlign, roomIn, room, roomRet, slapIn, slap, slapLp, slapFb, slapRet]) n.disconnect();
      strips.clear();
    },
  };
}
