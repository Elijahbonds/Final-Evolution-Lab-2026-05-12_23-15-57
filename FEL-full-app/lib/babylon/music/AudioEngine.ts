// AudioEngine v2 — REPLACES the M28 file. Three additions for the Studio
// (everything M28 shipped is kept byte-for-byte in behavior):
//   loadBuffer()     — register an already-synthesized AudioBuffer directly
//                      (SynthKit's path — no fetch, no asset files).
//   masterPolish()   — the one-tap "master this": a gentle compressor +
//                      low/high shelf sweetening on the master bus,
//                      toggleable live.
//   renderMixdown()  — offline-render the FULL MIX (not just per-track
//                      stems) to one WAV blob — what the save/library layer
//                      stores and replays.
//
// MUSIC-SUITE P2 (2026-09-25), "On the beat, and honest":
//   * ONE clock for every step. The live loop used to add the swing offset to a running clock after each odd step
//     (advance(), was :131-136): reverse swing, and a loop that played 88.7 BPM for 92 at 15 % swing (P1 BASELINE 2c,
//     391 ms behind the export by bar 4). Live scheduling, renderMixdown, renderStems, renderSong and renderSongStems
//     now all place steps with stepTime.ts gridStepTime(): odd 16ths delayed on a fixed grid, bars never drift. A tempo
//     change re-anchors the grid at the next step (retempoGrid) instead of stretching what was already counted.
//   * ONE bus for every render. renderStems (was :164-186) had no swing and no pan and skipped the 0.8 bus and the
//     polish chain; renderSongStems (was :253-270) skipped the bus and polish too — so the stems never summed to the
//     mix. Every offline render now goes volume → pan → offlineBus() (0.8 + MASTER's chain when on), the graph the live
//     master has. With MASTER OFF the stems sum to the mix exactly; with it ON the compressor is non-linear, so a stem
//     compressed alone only approximates its share of the compressed mix (the shelves are linear).
//   * A note is known when it is SCHEDULED. onStepScheduled fires as each step is scheduled (up to SCHEDULE_AHEAD_S
//     before it sounds) with what it will play; PERFORM offers its notes there, so a tap just before a note finds it.
//     onStepAudible still fires once the step has sounded (the playhead), unchanged.
//
// MUSIC-SUITE P2 FIX PASS (2026-09-25):
//   * NEVER IN THE PAST. scheduler() scheduled every step from the grid cursor to now + 0.1 s, and src.start(time) plays
//     a past time at once — so after a main-thread stall or a throttled timer (Safari/iOS throttle background timers;
//     Chrome exempts a tab playing audio) every missed step sounded in one burst, and PERFORM was handed notes already
//     late, which expired as MISSes nobody could have hit. The Cypher got SongClock.plan16ths for exactly this; the
//     Academy did not. A step more than stepTime.PAST_SLACK_S behind the clock is now passed over: no sources start,
//     the playhead still moves, and PERFORM is told it is a rest (`skipped: true`). `skippedSteps` counts them.
//   * THE AUDIO SESSION. The engine claims 'playback' before it builds its context (lib/audio/session.ts: on an iPhone
//     the default session obeys the silent switch — assumption, not tried on a device) and gives it back on dispose.

import { gridStepTime, retempoGrid, songStepTime, stepDurSec, stepIsPast, type StepGrid } from './stepTime';
import { claimPlaybackSession } from '@/lib/audio/session';

export interface Sample {
  id: string; name: string; buffer: AudioBuffer;
  category: 'kick' | 'snare' | 'hat' | 'perc' | 'bass' | 'melody' | 'vox' | 'fx';
}
export interface TrackState {
  sampleId: string; pattern: boolean[]; volume: number; muted: boolean; pan: number;
}
export interface SequencerState {
  bpm: number; steps: number; tracks: TrackState[]; swing: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
/** The master bus level — live (the master GainNode) and in every offline render (offlineBus). */
const MASTER_GAIN = 0.8;

/**
 * What a scheduled step will play: `hits` sources start on it; `gridLive` = the pattern has any audible hit at all.
 * MUSIC-SUITE P2 FIX PASS: `skipped` = the step's time had already gone by when the scheduler reached it (a stall), so
 * nothing was started and `hits` is 0 — PERFORM offers it as a rest.
 */
export interface StepSound { hits: number; gridLive: boolean; skipped?: boolean }

/** MASTER's polish chain (glue compression + shelves) from `input` to `dest` — the live master and every render. */
function polishChain(ctx: BaseAudioContext, input: AudioNode, dest: AudioNode): { comp: DynamicsCompressorNode; low: BiquadFilterNode; high: BiquadFilterNode } {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3;
  comp.attack.value = 0.01; comp.release.value = 0.18;
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 120; low.gain.value = 2.5;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf'; high.frequency.value = 8000; high.gain.value = 2;
  input.connect(comp).connect(low).connect(high).connect(dest);
  return { comp, low, high };
}

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private polishChain: { comp: DynamicsCompressorNode; low: BiquadFilterNode; high: BiquadFilterNode } | null = null;
  private polished = false;
  private samples = new Map<string, Sample>();
  private timerId: number | null = null;
  private currentStep = 0;
  /** MUSIC-SUITE P2: steps scheduled since start() — the live grid's index (stepTime.ts gridStepTime). */
  private stepIndex = 0;
  /** MUSIC-SUITE P2: the live straight grid, anchored at start() and re-anchored on a tempo change. */
  private grid: StepGrid = { originSec: 0, originIndex: 0, bpm: 92 };
  private state: SequencerState;
  private scheduledSteps: { step: number; time: number }[] = [];
  public onStep: ((step: number) => void) | null = null;
  /** M2: fired the moment the scheduler crosses a bar line (before that bar's steps are scheduled) — swap patterns here. */
  public onBar: ((bar: number) => void) | null = null;
  private bar = 0;
  private oneShots: { id: string; buffer: AudioBuffer; atBar: number; gain: number }[] = [];
  /** Fired when a step becomes audible (after it has sounded) — the playhead. */
  public onStepAudible: ((step: number, time: number) => void) | null = null;
  /**
   * MUSIC-SUITE P2: fired the moment a step is SCHEDULED, up to SCHEDULE_AHEAD_S before it sounds at `time` (audio
   * clock). PERFORM offers its notes here: a note has to be known before it sounds, or a tap on the beat finds nothing.
   */
  public onStepScheduled: ((step: number, time: number, sound: StepSound) => void) | null = null;
  /** MUSIC-SUITE P2 FIX PASS: steps passed over because their time had gone by (a stall) — for the probes. */
  public skippedSteps = 0;
  /** MUSIC-SUITE P2 FIX PASS: gives back the 'playback' audio session this engine claimed (lib/audio/session.ts). */
  private releaseSession: () => void;

  constructor(initial: SequencerState) {
    this.releaseSession = claimPlaybackSession();
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);
    this.state = initial;
  }

  async loadSample(id: string, name: string, url: string, category: Sample['category']): Promise<void> {
    const res = await fetch(url);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.samples.set(id, { id, name, buffer, category });
  }

  /** Direct-buffer registration — SynthKit's zero-asset path. */
  loadBuffer(id: string, name: string, buffer: AudioBuffer, category: Sample['category']): void {
    this.samples.set(id, { id, name, buffer, category });
  }

  /** Swap the whole kit in place (kit picker) — patterns/volumes untouched. */
  swapKit(buffers: Map<string, AudioBuffer>): void {
    for (const [id, buffer] of buffers) {
      const existing = this.samples.get(id);
      if (existing) existing.buffer = buffer;
    }
  }

  get context(): AudioContext { return this.ctx; }
  get isRunning(): boolean { return this.timerId !== null; }
  get isPolished(): boolean { return this.polished; }
  setState(s: SequencerState): void { this.state = s; }
  setBpm(bpm: number): void { this.state.bpm = Math.max(40, Math.min(220, bpm)); }

  /** One-tap master: gentle glue compression + shelf sweetening. */
  masterPolish(on: boolean): void {
    if (on === this.polished) return;
    this.polished = on;
    this.master.disconnect();
    if (on) {
      this.polishChain = polishChain(this.ctx, this.master, this.ctx.destination);
    } else {
      this.polishChain = null;
      this.master.connect(this.ctx.destination);
    }
  }

  start(): void {
    if (this.timerId !== null) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.currentStep = 0; this.bar = 0; this.stepIndex = 0;
    this.onBar?.(0);   // M2: bar 0's patterns (and tempo) are swapped in before the grid is anchored
    this.grid = { originSec: this.ctx.currentTime + 0.05, originIndex: 0, bpm: this.state.bpm };
    this.fireOneShots(0, this.grid.originSec);
    this.timerId = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }
  /** M3: one-shots (vocal takes) that start at a bar line; replaces the list. */
  setOneShots(list: { id: string; buffer: AudioBuffer; atBar: number; gain: number }[]): void { this.oneShots = list; }
  get currentBar(): number { return this.bar; }
  private fireOneShots(bar: number, time: number): void {
    for (const o of this.oneShots) {
      if (o.atBar !== bar) continue;
      const src = this.ctx.createBufferSource(); src.buffer = o.buffer;
      const g = this.ctx.createGain(); g.gain.value = o.gain;
      src.connect(g).connect(this.master); src.start(time);
    }
  }
  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledSteps = [];
  }

  private scheduler(): void {
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
    for (let t = this.nextStepTime(); t < horizon; t = this.nextStepTime()) {
      this.scheduleStep(this.currentStep, t);
      this.advance();
    }
    this.drainPlayhead();
  }
  private secondsPerStep(): number { return stepDurSec(this.state.bpm); }   // 16ths
  /**
   * MUSIC-SUITE P2: when the next step sounds — its place on the live grid (gridStepTime), never a running sum. A tempo
   * change since the last step re-anchors the grid here, so the tempo bends from this step on and nothing jumps.
   */
  private nextStepTime(): number {
    this.grid = retempoGrid(this.grid, this.stepIndex, this.state.bpm);
    return gridStepTime(this.grid, this.stepIndex, this.currentStep, this.state.swing);
  }
  private advance(): void {
    this.stepIndex++;
    this.currentStep = (this.currentStep + 1) % this.state.steps;
    // the bar line is step 0's time, which swing never moves; onBar may swap the patterns (and tempo) first
    if (this.currentStep === 0) { this.bar++; this.onBar?.(this.bar); this.fireOneShots(this.bar, this.nextStepTime()); }
  }
  /** Does the pattern the scheduler reads have any hit that would sound? (An empty grid offers PERFORM nothing.) */
  private gridLive(): boolean {
    return this.state.tracks.some((t) => !t.muted && this.samples.has(t.sampleId) && t.pattern.some(Boolean));
  }
  private scheduleStep(step: number, time: number): void {
    if (stepIsPast(time, this.ctx.currentTime)) {
      // MUSIC-SUITE P2 FIX PASS: already gone by (a stall) — start nothing; the playhead still moves over it
      this.skippedSteps++;
      this.scheduledSteps.push({ step, time });
      this.onStepScheduled?.(step, time, { hits: 0, gridLive: this.gridLive(), skipped: true });
      return;
    }
    let hits = 0;
    for (const track of this.state.tracks) {
      if (track.muted || !track.pattern[step]) continue;
      const sample = this.samples.get(track.sampleId);
      if (!sample) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = sample.buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = track.volume;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = track.pan;
      src.connect(gain).connect(panner).connect(this.master);
      src.start(time);
      hits++;
    }
    this.scheduledSteps.push({ step, time });
    this.onStepScheduled?.(step, time, { hits, gridLive: hits > 0 || this.gridLive() });
  }
  private drainPlayhead(): void {
    const now = this.ctx.currentTime;
    while (this.scheduledSteps.length && this.scheduledSteps[0].time <= now) {
      const s = this.scheduledSteps.shift()!;
      this.onStep?.(s.step);
      this.onStepAudible?.(s.step, s.time);
    }
  }

  /**
   * Offline-render each track to a WAV blob — the Creator Card stems. MUSIC-SUITE P2: swung, panned and through the
   * mix's own bus + polish (offlineBus), so the stems sum to renderMixdown (exactly with MASTER OFF; see the header).
   */
  async renderStems(bars = 2): Promise<Blob[]> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.0;
    const blobs: Blob[] = [];
    for (const track of this.state.tracks) {
      const sample = this.samples.get(track.sampleId);
      if (!sample || track.muted) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(44100 * totalDur), 44100);
      const bus = this.offlineBus(offline);
      for (let bar = 0; bar < bars; bar++) this.placeBar(offline, bus, [track], bar, this.state.swing);
      blobs.push(encodeWav(await offline.startRendering()));
    }
    return blobs;
  }

  /** Offline-render the FULL MIX (all unmuted tracks, swing, pan, and the
   *  polish chain if enabled) — what the library saves and replays. */
  async renderMixdown(bars = 2): Promise<Blob> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.2;
    const offline = new OfflineAudioContext(2, Math.ceil(44100 * totalDur), 44100);
    const bus = this.offlineBus(offline);
    for (let bar = 0; bar < bars; bar++) this.placeBar(offline, bus, this.state.tracks, bar, this.state.swing);
    return encodeWav(await offline.startRendering());
  }

  /** The master bus of an offline render: MASTER_GAIN, then MASTER's polish chain when it is on — the live graph. */
  private offlineBus(offline: OfflineAudioContext): GainNode {
    const bus = offline.createGain();
    bus.gain.value = MASTER_GAIN;
    if (this.polished) polishChain(offline, bus, offline.destination);
    else bus.connect(offline.destination);
    return bus;
  }

  /**
   * M2/M4: render a SONG — per-bar track patterns (from Song.expandChain) plus one-shot takes — to one WAV.
   * MUSIC-SUITE P2: `barSwing[b]` is bar b's swing (a section keeps its own); absent = the engine's swing.
   */
  async renderSong(bars: TrackState[][], oneShots: { buffer: AudioBuffer; atBar: number; gain: number }[], lengthSec: number, barSwing?: number[]): Promise<Blob> {
    const offline = new OfflineAudioContext(2, Math.ceil(44100 * Math.max(1, lengthSec)), 44100);
    const bus = this.offlineBus(offline);
    bars.forEach((tracks, bar) => this.placeBar(offline, bus, tracks, bar, barSwing?.[bar] ?? this.state.swing));
    for (const o of oneShots) this.placeOneShot(offline, bus, o);
    return encodeWav(await offline.startRendering());
  }

  /** M4: one WAV per track over the whole song, plus each take as its own stem — each through the song's bus. */
  async renderSongStems(bars: TrackState[][], oneShots: { id: string; buffer: AudioBuffer; atBar: number; gain: number }[], lengthSec: number, barSwing?: number[]): Promise<{ name: string; blob: Blob }[]> {
    const ids = [...new Set(bars.flatMap((b) => b.map((t) => t.sampleId)))];
    const out: { name: string; blob: Blob }[] = [];
    for (const id of ids) {
      const sample = this.samples.get(id); if (!sample) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(44100 * Math.max(1, lengthSec)), 44100);
      const bus = this.offlineBus(offline);
      bars.forEach((tracks, bar) => this.placeBar(offline, bus, tracks.filter((t) => t.sampleId === id), bar, barSwing?.[bar] ?? this.state.swing));
      out.push({ name: sample.name, blob: encodeWav(await offline.startRendering()) });
    }
    for (const o of oneShots) {
      const offline = new OfflineAudioContext(2, Math.ceil(44100 * Math.max(1, lengthSec)), 44100);
      this.placeOneShot(offline, this.offlineBus(offline), o);
      out.push({ name: `take ${o.id}`, blob: encodeWav(await offline.startRendering()) });
    }
    return out;
  }

  /** A take starts on its bar line (step 0 of `atBar`, which swing never moves). */
  private placeOneShot(offline: OfflineAudioContext, dest: AudioNode, o: { buffer: AudioBuffer; atBar: number; gain: number }): void {
    const src = offline.createBufferSource(); src.buffer = o.buffer;
    const g = offline.createGain(); g.gain.value = o.gain;
    src.connect(g).connect(dest);
    src.start(songStepTime(o.atBar, 0, this.state.steps, this.state.bpm, 0));
  }

  private placeBar(offline: OfflineAudioContext, dest: AudioNode, tracks: TrackState[], bar: number, swing: number): void {
    for (const track of tracks) {
      const sample = this.samples.get(track.sampleId);
      if (!sample || track.muted) continue;
      for (let step = 0; step < this.state.steps; step++) {
        if (!track.pattern[step]) continue;
        const at = songStepTime(bar, step, this.state.steps, this.state.bpm, swing);   // the live loop's time, exactly
        const src = offline.createBufferSource(); src.buffer = sample.buffer;
        const g = offline.createGain(); g.gain.value = track.volume;
        const pan = offline.createStereoPanner(); pan.pan.value = track.pan;
        src.connect(g).connect(pan).connect(dest); src.start(at);
      }
    }
  }

  dispose(): void { this.stop(); void this.ctx.close(); this.releaseSession(); }
}

/** Minimal 16-bit PCM WAV encoder. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const chans: Float32Array[] = [];
  let offset = 0, pos = 0;
  const setStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); };
  const set32 = (v: number) => { view.setUint32(pos, v, true); pos += 4; };
  const set16 = (v: number) => { view.setUint16(pos, v, true); pos += 2; };
  setStr('RIFF'); set32(len - 8); setStr('WAVE');
  setStr('fmt '); set32(16); set16(1); set16(numCh);
  set32(buffer.sampleRate); set32(buffer.sampleRate * 2 * numCh);
  set16(numCh * 2); set16(16);
  setStr('data'); set32(len - pos - 4);
  for (let i = 0; i < numCh; i++) chans.push(buffer.getChannelData(i));
  while (pos < len) {
    for (let i = 0; i < numCh; i++) {
      const s = Math.max(-1, Math.min(1, chans[i][offset]));
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([ab], { type: 'audio/wav' });
}
