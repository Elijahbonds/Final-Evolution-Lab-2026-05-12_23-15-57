// lib/babylon/music/fakeWebAudio.ts — a clock-only Web Audio stand-in, so the REAL sequencers can be run in node.
//
// MUSIC-SUITE P1 (2026-09-25): the suite's timing bugs (live swing that stretches the bar, PERFORM notes that only open
// after they sound, a publish that outgrows localStorage) all live in lib/babylon/music/AudioEngine.ts and
// lib/modes/music/audio-engine.ts, which construct `new AudioContext()` / `new OfflineAudioContext()` and drive their
// scheduler from `window.setInterval`. Node has none of the three, so until now every claim about WHEN those engines
// play a note was a hand-copied formula. This file stands in for exactly the surface the engines touch — nodes that
// connect to nothing, AudioParams that remember a value, buffer sources that LOG their start() time — and hands the
// caller the clock: set `ctx.currentTime`, call `tick()` (one firing of every 25 ms scheduler interval), read `starts`.
// The engine code that runs is the shipped code, unmodified; only the browser underneath it is fake.
//
// Used by scripts/music/baseline-sim.ts (the P1 baseline numbers) and lib/babylon/music/AudioEngine.baseline.test.ts.
// NEVER imported by the app: nothing here makes a sound, and installing it replaces globals.
//
// MUSIC-SUITE P4 (2026-09-25): the mixer graph (mixGraph.ts) is tested on this too, so the fake now REMEMBERS the graph
// (additive — every earlier caller sees the same behaviour): each node has a `kind` and the `outputs` it was connected
// to (disconnect() forgets them), the node types the graph adds exist (delay, convolver, analyser, wave shaper, channel
// splitter), and a source's start() logs its offset, duration, playbackRate, buffer and the source itself, and its
// stop() logs when (`stops`) — so a test can walk a hit from its source to the speakers, and see a take cut on STOP.

/** One buffer-source (or oscillator) start(): when, on its context's clock, the sound would have begun. */
export interface FakeStart {
  at: number;
  kind: 'buffer' | 'osc';
  /** MUSIC-SUITE P4: start(at, offset, duration)'s other two arguments (undefined when not given). */
  offset?: number;
  duration?: number;
  /** MUSIC-SUITE P4: the source's playbackRate when it started (a pitched note plays at 2^((note − root) / 12)). */
  rate?: number;
  /** MUSIC-SUITE P4: the buffer it played, and the source node (walk its `outputs` to see where it went). */
  buffer?: unknown;
  src?: FakeScheduledSource;
}
/** MUSIC-SUITE P4: one stop() on a source — when it was told to stop, on its context's clock. */
export interface FakeStop { at: number; src: FakeScheduledSource }

export class FakeAudioParam {
  constructor(public value = 0) {}
  setValueAtTime(v: number, _t?: number): this { this.value = v; return this; }
  linearRampToValueAtTime(v: number, _t?: number): this { this.value = v; return this; }
  exponentialRampToValueAtTime(v: number, _t?: number): this { this.value = v; return this; }
  setTargetAtTime(v: number, _t?: number, _c?: number): this { this.value = v; return this; }
  cancelScheduledValues(_t?: number): this { return this; }
}

export class FakeNode {
  /** MUSIC-SUITE P4: where this node was connected (in order); nothing is routed, the list is only read by tests. */
  readonly outputs: object[] = [];
  /** MUSIC-SUITE P4: what kind of node this is ('gain', 'panner', 'compressor', 'analyser', 'destination', …). */
  constructor(readonly kind: string = 'node') {}
  /** Returns its argument, so the engines' `a.connect(b).connect(c)` chains run. Nothing is routed. */
  connect<T>(dest: T): T { this.outputs.push(dest as object); return dest; }
  /** Forget every output (or just `dest`). */
  disconnect(dest?: unknown): void {
    if (dest === undefined) { this.outputs.length = 0; return; }
    const i = this.outputs.indexOf(dest as object);
    if (i >= 0) this.outputs.splice(i, 1);
  }
}

/** A silent buffer of the requested shape. Channel data is allocated on first read (encodeWav reads it). */
export class FakeAudioBuffer {
  private data: Float32Array[] | null = null;
  constructor(public readonly numberOfChannels: number, public readonly length: number, public readonly sampleRate: number) {}
  get duration(): number { return this.length / this.sampleRate; }
  getChannelData(i: number): Float32Array {
    if (!this.data) this.data = Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length));
    return this.data[i];
  }
}

export class FakeScheduledSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  type = 'sine';
  readonly playbackRate = new FakeAudioParam(1);
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  onended: (() => void) | null = null;
  /** MUSIC-SUITE P4: when stop() was last called with (null = never). */
  stoppedAt: number | null = null;
  constructor(private readonly log: FakeStart[], private readonly sourceKind: FakeStart['kind'], private readonly stopLog: FakeStop[] = []) { super(sourceKind); }
  start(at = 0, offset?: number, duration?: number): void {
    this.log.push({ at, kind: this.sourceKind, offset, duration, rate: this.playbackRate.value, buffer: this.buffer, src: this });
  }
  stop(at = 0): void { this.stoppedAt = at; this.stopLog.push({ at, src: this }); }
}

export class FakeBaseAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  readonly destination = new FakeNode('destination');
  /** Every start(), in call order. For a sequencer this is its schedule: what would have sounded, and when. */
  readonly starts: FakeStart[] = [];
  /** MUSIC-SUITE P4: every stop() on a source made here, in call order. */
  readonly stops: FakeStop[] = [];

  createGain(): FakeNode & { gain: FakeAudioParam } {
    return Object.assign(new FakeNode('gain'), { gain: new FakeAudioParam(1) });
  }
  createStereoPanner(): FakeNode & { pan: FakeAudioParam } {
    return Object.assign(new FakeNode('panner'), { pan: new FakeAudioParam(0) });
  }
  createBiquadFilter(): FakeNode & { type: string; frequency: FakeAudioParam; Q: FakeAudioParam; gain: FakeAudioParam } {
    return Object.assign(new FakeNode('biquad'), {
      type: 'lowpass', frequency: new FakeAudioParam(350), Q: new FakeAudioParam(1), gain: new FakeAudioParam(0),
    });
  }
  createDynamicsCompressor(): FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', FakeAudioParam> & { reduction: number } {
    return Object.assign(new FakeNode('compressor'), {
      threshold: new FakeAudioParam(-24), knee: new FakeAudioParam(30), ratio: new FakeAudioParam(12),
      attack: new FakeAudioParam(0.003), release: new FakeAudioParam(0.25), reduction: 0,
    });
  }
  /** MUSIC-SUITE P4: the node types the mixer graph adds. */
  createDelay(_max = 1): FakeNode & { delayTime: FakeAudioParam } {
    return Object.assign(new FakeNode('delay'), { delayTime: new FakeAudioParam(0) });
  }
  createConvolver(): FakeNode & { buffer: unknown; normalize: boolean } {
    return Object.assign(new FakeNode('convolver'), { buffer: null as unknown, normalize: true });
  }
  createWaveShaper(): FakeNode & { curve: Float32Array | null; oversample: string } {
    return Object.assign(new FakeNode('shaper'), { curve: null as Float32Array | null, oversample: 'none' });
  }
  createChannelSplitter(outputs = 6): FakeNode & { numberOfOutputs: number } {
    return Object.assign(new FakeNode('splitter'), { numberOfOutputs: outputs });
  }
  /** A meter that always reads silence (nothing is rendered here). */
  createAnalyser(): FakeNode & { fftSize: number; smoothingTimeConstant: number; getFloatTimeDomainData(a: Float32Array): void } {
    return Object.assign(new FakeNode('analyser'), {
      fftSize: 2048, smoothingTimeConstant: 0.8,
      getFloatTimeDomainData(a: Float32Array): void { a.fill(0); },
    });
  }
  createBufferSource(): FakeScheduledSource { return new FakeScheduledSource(this.starts, 'buffer', this.stops); }
  createOscillator(): FakeScheduledSource { return new FakeScheduledSource(this.starts, 'osc', this.stops); }
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }
  /** Any bytes decode to a 0.1 s silent mono buffer (the legacy engine's loadSample path). */
  async decodeAudioData(_bytes: ArrayBuffer): Promise<FakeAudioBuffer> {
    return new FakeAudioBuffer(1, Math.round(this.sampleRate * 0.1), this.sampleRate);
  }
  async resume(): Promise<void> { this.state = 'running'; }
  async suspend(): Promise<void> { this.state = 'suspended'; }
  async close(): Promise<void> { this.state = 'closed'; }
}

/**
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): the live context's rate is the DEVICE's (48 000 on most phones and the booth
 * proof), so a test can set it (installFakeWebAudio({ sampleRate })) — renders must follow it (AudioEngine.renderRate).
 */
export class FakeAudioContext extends FakeBaseAudioContext {
  static rate = 44100;
  constructor() { super(); this.sampleRate = FakeAudioContext.rate; }
}

export class FakeOfflineAudioContext extends FakeBaseAudioContext {
  constructor(public readonly numberOfChannels: number, public readonly length: number, sampleRate: number) {
    super();
    this.sampleRate = sampleRate;
    FakeOfflineAudioContext.created.push(this);
  }
  /** Every offline context made while installed, in creation order (a render makes one per stem). */
  static created: FakeOfflineAudioContext[] = [];
  async startRendering(): Promise<FakeAudioBuffer> {
    return new FakeAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
  }
}

/**
 * A localStorage with a quota, counted the way Chromium counts it: key + value length in UTF-16 code units, against
 * 10 MiB of bytes = 5,242,880 units (assumption: Firefox/Safari land near 5 MB too). setItem past the quota throws a
 * QuotaExceededError and leaves the old value in place, as browsers do.
 */
export class FakeStorage {
  private map = new Map<string, string>();
  constructor(public quotaChars = 5 * 1024 * 1024) {}
  get length(): number { return this.map.size; }
  get usedChars(): number {
    let n = 0;
    for (const [k, v] of this.map) n += k.length + v.length;
    return n;
  }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string): void {
    const value = String(v);
    const next = this.usedChars - (this.map.has(k) ? k.length + this.map.get(k)!.length : 0) + k.length + value.length;
    if (next > this.quotaChars) {
      throw new DOMException(`Setting the value of '${k}' exceeded the quota.`, 'QuotaExceededError');
    }
    this.map.set(k, value);
  }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

export interface FakeWebAudio {
  /** Fire every live scheduler interval once — what the browser's timer does every `ms`. */
  tick(): void;
  /** Live intervals by id (the engines register one 25 ms scheduler each). */
  readonly intervals: Map<number, { fn: () => void; ms: number }>;
  readonly storage: FakeStorage;
  uninstall(): void;
}

const FAKE_ID_BASE = 7_000_000;   // far above node's own timer ids, so clearInterval can tell them apart

/**
 * Install the fakes on globalThis: AudioContext, OfflineAudioContext, window (setInterval / clearInterval /
 * localStorage) and localStorage. clearInterval is wrapped so a fake id is removed and anything else reaches node's own.
 */
export function installFakeWebAudio(opts: { quotaChars?: number; sampleRate?: number } = {}): FakeWebAudio {
  const g = globalThis as unknown as Record<string, unknown>;
  // Descriptors, not values: node 22+ defines its own `localStorage` accessor on globalThis (it warns when read without
  // --localstorage-file), so the original is saved and restored as a property, never read.
  const KEYS = ['AudioContext', 'OfflineAudioContext', 'window', 'localStorage', 'clearInterval'] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const put = (k: string, value: unknown): void => {
    Object.defineProperty(globalThis, k, { value, writable: true, configurable: true, enumerable: false });
  };
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  let nextId = FAKE_ID_BASE;
  const nodeClearInterval = g.clearInterval as (id: unknown) => void;
  const clear = (id: unknown): void => {
    if (typeof id === 'number' && intervals.has(id)) intervals.delete(id);
    else nodeClearInterval(id);
  };
  const storage = new FakeStorage(opts.quotaChars);
  FakeOfflineAudioContext.created = [];
  FakeAudioContext.rate = opts.sampleRate ?? 44100;
  put('AudioContext', FakeAudioContext);
  put('OfflineAudioContext', FakeOfflineAudioContext);
  put('localStorage', storage);
  put('clearInterval', clear);
  put('window', {
    setInterval: (fn: () => void, ms: number): number => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: clear,
    setTimeout: g.setTimeout,
    clearTimeout: g.clearTimeout,
    localStorage: storage,
  });
  return {
    intervals,
    storage,
    tick(): void { for (const { fn } of [...intervals.values()]) fn(); },
    uninstall(): void {
      intervals.clear();
      FakeAudioContext.rate = 44100;
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete g[k];
      }
    },
  };
}
