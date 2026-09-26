// takeCapture — THE RECORDING BOOTH'S CLOCK (MUSIC-SUITE P4, "Pocket studio + melody", 2026-09-25).
//
// What was wrong (outbox musicsuite/understand-wf_3a55346f-032.json, the take findings; SongPanel.tsx before this phase,
// ~:54 and :250-274): RECORD TAKE opened the mic AND a MediaRecorder inside the engine's onBar callback. onBar fires when
// the SCHEDULER crosses a bar line, up to ~125 ms before that bar is audible (AudioEngine SCHEDULE_AHEAD_S 0.1 s + a 25 ms
// tick), and the first press also waited on the permission prompt; getUserMedia({audio:true}) left echo cancellation,
// noise suppression and AGC on; and MediaRecorder's first byte has no time on the AudioContext clock at all. The take was
// then PLACED on the bar as if it had started there — so every take was late by the scheduler lead + getUserMedia +
// MediaRecorder start-up + the device's round trip, and by a different amount each time. The take also played once, at
// its absolute bar (a take armed on the 2nd pass sat after the song's end), and STOP only cleared a timer.
//
// Now the booth captures raw PCM through an AudioWorklet (ScriptProcessor where there is none), every block stamped with
// its frame on the AudioContext clock (the worklet's `currentFrame`), into a tape; the take is CUT from the tape at the
// start bar's audio time plus the round-trip latency (the formula is `boothLatency` below), sample-accurately — never
// "whenever a recorder happened to start". This file is the pure math (tested in takeCapture.test.ts, node) and the thin
// browser capture (BoothMic) that feeds it; the UI is ui/RecordBooth.tsx, playback is the engine's (engine.setTakes,
// the phase-4 engine contract (4)).
//
// Pure except BoothMic, which touches the browser only inside its methods (importing this file in node is safe).
import type { ProjectTake } from './StudioProject';
import type { EngineTake, StepSound } from './AudioEngine';

// ── latency ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * THE FORMULA. A bar scheduled at audio time T is COMPUTED by the render thread when the context clock reads T, and
 * reaches the player's ears `L_out` later (the context's baseLatency — destination to the OS — plus outputLatency — the OS
 * to the speaker). The player sings on what they hear, so their downbeat reaches the mic at (the moment T was computed) +
 * L_out. A sound at the mic is handed to the graph `L_in` later (MediaStreamTrack.getSettings().latency — the capture
 * buffer), in the render quantum whose context time is (mic time) + L_in. Both clocks advance together, so the singer's
 * downbeat sits on the tape at context time
 *
 *     capture start = T + L_out + L_in,         L_out = saved calibration  ||  ctx.baseLatency + ctx.outputLatency
 *                                              L_in  = track.getSettings().latency  ||  0
 *
 * and a take cut from there, played back from T, puts the singer's downbeat on the bar.
 *
 * L_out prefers the player's saved calibration (fel.audioOffsetMs, read through rhythm-calibrate loadSavedOffsetMs — null
 * for a stale, undated reading, which is skipped for the device's figures): it is the delay they actually hear — P2's
 * rule for PERFORM (performSet.performLatencySec: "it already contains the output delay"), and on Bluetooth the device's
 * own outputLatency is often wrong. assumption: the calibration's tap path adds a few ms of its own (keyboard/touch) which
 * the mic path does not; that is inside its 25 ms snap (the review suspects 20–50 ms on touch — not measured; a booth
 * loopback calibration is the real answer, named in the P4 report). Where the browser reports neither (Safari has no
 * outputLatency; the track has no `latency` setting) the missing term is 0 and the take can be late by that much.
 *
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): + the DESK's delay in L_out (`graphLatencySec`: the limiter's 6 ms look-ahead, 12 ms
 * with MASTER — AudioEngine.graphLatencySec). The music at T reaches the speakers after the desk AND the device; neither a
 * calibration (measured on /play/calibrate: no compressor) nor the device's figures know the desk, so a singer following
 * the music landed 6–12 ms late on playback.
 */
export interface LatencySources {
  /** AudioContext.baseLatency (s). */
  baseLatency?: number | null;
  /** AudioContext.outputLatency (s). */
  outputLatency?: number | null;
  /** MediaStreamTrack.getSettings().latency (s). */
  trackLatency?: number | null;
  /** The saved calibration (ms), or null when there is none the room may apply (rhythm-calibrate loadSavedOffsetMs). */
  savedOffsetMs?: number | null;
  /** MUSIC-SUITE P4 FIX PASS: the desk's own delay (s) — AudioEngine.graphLatencySec. Absent = 0. */
  graphLatencySec?: number | null;
}
export interface BoothLatency {
  /** L_out: the calibration's (or the device's) output delay + the desk's (graphSec). */
  outSec: number; inSec: number; totalSec: number;
  outFrom: 'calibration' | 'device' | 'none';
  inFrom: 'track' | 'none';
  /** MUSIC-SUITE P4 FIX PASS: the desk's part of outSec. */
  graphSec: number;
}
/** A device figure above this is a broken report, not a latency (it would cut a take half a second wrong). */
export const MAX_DEVICE_LATENCY_S = 0.5;

const devSec = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, MAX_DEVICE_LATENCY_S) : null;

export function boothLatency(s: LatencySources): BoothLatency {
  let outSec = 0; let outFrom: BoothLatency['outFrom'] = 'none';
  if (typeof s.savedOffsetMs === 'number' && Number.isFinite(s.savedOffsetMs)) {
    outSec = Math.max(-0.4, Math.min(0.4, s.savedOffsetMs / 1000)); outFrom = 'calibration';
  } else {
    const base = devSec(s.baseLatency), out = devSec(s.outputLatency);
    if (base !== null || out !== null) { outSec = (base ?? 0) + (out ?? 0); outFrom = 'device'; }
  }
  const graphSec = typeof s.graphLatencySec === 'number' && Number.isFinite(s.graphLatencySec) && s.graphLatencySec > 0 ? Math.min(s.graphLatencySec, 0.05) : 0;
  outSec += graphSec;
  const tr = devSec(s.trackLatency);
  const inSec = tr ?? 0;
  return { outSec, inSec, totalSec: outSec + inSec, outFrom, inFrom: tr === null ? 'none' : 'track', graphSec };
}

/** The tape frame where a take that starts on the bar at audio time `barTimeSec` begins (the formula above). */
export function takeStartFrame(barTimeSec: number, latencySec: number, sampleRate: number): number {
  return Math.round((barTimeSec + latencySec) * sampleRate);
}

/**
 * The context frame of a ScriptProcessor input block (the fallback where AudioWorklet is missing). Chromium fires
 * onaudioprocess when a `bufferSize` input block has filled and stamps playbackTime = (frame now + bufferSize) / rate for
 * the OUTPUT it asks for (double-buffered), so the input block began 2 × bufferSize before playbackTime.
 * assumption: read from Chromium's ScriptProcessorHandler; other engines may differ by up to one block (≤ 43 ms at
 * 2048 / 48 kHz). Only browsers without AudioWorklet reach this (Safari < 14.1).
 */
export function scriptProcessorBlockFrame(playbackTime: number, bufferSize: number, sampleRate: number): number {
  return Math.round(playbackTime * sampleRate) - 2 * bufferSize;
}

// ── the tape ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A block of mono input: `pcm[i]` is context frame `frame + i`. */
export interface TapeChunk { frame: number; pcm: Float32Array }

/** The first frame past the tape (0 for an empty tape). */
export function tapeEnd(chunks: readonly TapeChunk[]): number {
  let end = 0;
  for (const c of chunks) end = Math.max(end, c.frame + c.pcm.length);
  return end;
}

/** Drop the chunks that end at or before `frame` (the pre-roll kept while armed). */
export function tapeDropBefore(chunks: readonly TapeChunk[], frame: number): TapeChunk[] {
  return chunks.filter((c) => c.frame + c.pcm.length > frame);
}

/**
 * Cut frames [from, to) off the tape. A frame no chunk covers (a dropout, a suspended context, a cut before the tape
 * begins) is silence and is counted in `gaps` — never shifted: every sample keeps its place on the clock.
 */
export function tapeCut(chunks: readonly TapeChunk[], from: number, to: number): { pcm: Float32Array; gaps: number } {
  const n = Math.max(0, Math.floor(to - from));
  const pcm = new Float32Array(n);
  const covered = new Uint8Array(n);
  for (const c of chunks) {
    const a = Math.max(from, c.frame), b = Math.min(to, c.frame + c.pcm.length);
    for (let f = a; f < b; f++) { pcm[f - from] = c.pcm[f - c.frame]; covered[f - from] = 1; }
  }
  let gaps = 0;
  for (let i = 0; i < n; i++) if (!covered[i]) gaps++;
  return { pcm, gaps };
}

// ── meters and transients ──────────────────────────────────────────────────────────────────────────────────────────
export function levels(pcm: Float32Array): { peak: number; rms: number } {
  let peak = 0, sum = 0;
  for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; sum += pcm[i] * pcm[i]; }
  return { peak, rms: pcm.length ? Math.sqrt(sum / pcm.length) : 0 };
}
/** dBFS, floored at -90 (silence). */
export function toDb(x: number): number { return x > 0 ? Math.max(-90, 20 * Math.log10(x)) : -90; }
/** The meter's fill (0..1) for a level: -60 dBFS empty, 0 dBFS full. */
export function meterFill(x: number): number { return Math.max(0, Math.min(1, (toDb(x) + 60) / 60)); }

/** The index of the first sample at or above `threshold` (absolute), or -1. The tests' and the probes' onset finder. */
export function firstTransient(pcm: Float32Array, threshold = 0.2): number {
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) >= threshold) return i;
  return -1;
}

// ── storage ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** 16-bit PCM mono WAV — what a take is kept as (studioStore saveAudio; decodeAudioData reads it back everywhere). */
export function wavFromPcm(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = 44 + pcm.length * 2;
  const ab = new ArrayBuffer(bytes);
  const v = new DataView(ab);
  const str = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0, o = 44; i < pcm.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return ab;
}

/**
 * A take's audio with its trims applied as SILENCE (the samples keep their place, so the take still starts on its bar).
 * Trims are seconds off each end.
 */
export function gatePcm(pcm: Float32Array, sampleRate: number, trimStart: number, trimEnd: number): Float32Array {
  const out = new Float32Array(pcm);
  const a = Math.min(out.length, Math.max(0, Math.round(trimStart * sampleRate)));
  const b = Math.max(a, out.length - Math.max(0, Math.round(trimEnd * sampleRate)));
  out.fill(0, 0, a); out.fill(0, b);
  return out;
}

/**
 * A copy of a take's buffer with its first `gateSec` silenced (every channel; `ctx` makes the copy).
 *
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): NO LONGER HOW THE BOOTH TRIMS. This comment said the engine played a take's buffer
 * from `trimStart` "starting ON its bar line" — a SLIDE that would pull the take early — so the booth sent trimStart 0 and
 * a gated copy of every trimmed take. The engine never did that: AudioEngine.takeSpan returns when = barTime + trimStart
 * and offset = trimStart (src.start(when, offset, …)) — a GATE: the take keeps its place on the grid. The copies were for
 * nothing (a full buffer per take per trim, and every trim drag a new buffer, which also cut the sounding pass). The
 * booth (engineTakeList) hands the engine its trim-in natively now; this stays for the tests that pin the two agree.
 */
export function gatedBuffer(ctx: Pick<BaseAudioContext, 'createBuffer'>, buf: AudioBuffer, gateSec: number): AudioBuffer {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(gatePcm(buf.getChannelData(ch), buf.sampleRate, gateSec, 0));
  return out;
}

// ── the region: where on the song a take is recorded, and where it plays ────────────────────────────────────────────
/** Bars per loop the booth offers on the grid (song mode loops the song). */
export const BOOTH_LOOPS = [1, 2, 4, 8] as const;
export const BOOTH_LENGTHS = [1, 2, 4, 8] as const;
export const BOOTH_COUNT_INS = [0, 1, 2] as const;
export const DEFAULT_BOOTH_LOOP = 4;
/** The longest take the booth keeps (and the store's cap); a loop is at most 64 bars (Song MAX_SONG_BARS). */
export const MAX_TAKE_SEC = 600;

/**
 * A take is recorded over a REGION of a loop: bars [fromBar, fromBar + bars) of a `loopBars`-bar loop. In song mode the
 * loop is the song (songBars of the chain); on the grid it is the booth's LOOP setting. Takes over the same region are
 * one best-of-N group.
 */
export interface BoothRegion { fromBar: number; bars: number; loopBars: number }

/** The region made legal: 1 ≤ loop ≤ 64, 0 ≤ from < loop, 1 ≤ bars ≤ loop - from. */
export function clampRegion(r: BoothRegion): BoothRegion {
  const loopBars = Math.max(1, Math.min(64, Math.floor(r.loopBars) || 1));
  const fromBar = Math.max(0, Math.min(loopBars - 1, Math.floor(r.fromBar) || 0));
  const bars = Math.max(1, Math.min(loopBars - fromBar, Math.floor(r.bars) || 1));
  return { fromBar, bars, loopBars };
}

/**
 * The engine bar a take recorded now starts on: the first bar at or after `earliest` that is the region's first bar
 * (bar % loopBars === fromBar). Running, `earliest` is the bar after the one the scheduler is in plus the count-in bars
 * (the scheduler is already inside `currentBar`, up to 125 ms before it sounds, so the NEXT bar is the soonest a player
 * can be counted into). Stopped, the engine's count-in happens before bar 0, so bar 0 is the soonest — unless the engine
 * has no count-in of its own (`engineCounts: false`), when the song's first `countInBars` bars are the count-in.
 */
export function takeStartBar(o: { currentBar: number; running: boolean; countInBars: number; region: BoothRegion; engineCounts?: boolean }): number {
  const r = clampRegion(o.region);
  const count = Math.max(0, Math.floor(o.countInBars));
  const earliest = o.running ? Math.max(0, o.currentBar) + 1 + count : o.engineCounts === false ? count : 0;
  const phase = ((earliest % r.loopBars) + r.loopBars) % r.loopBars;
  return earliest + ((r.fromBar - phase + r.loopBars) % r.loopBars);
}

/** The engine surface the bar watcher needs (AudioEngine has it: onStepScheduled + currentBar). */
export interface BarClock {
  onStepScheduled: ((step: number, time: number, sound: StepSound) => void) | null;
  readonly currentBar: number;
}
/**
 * Hear bar `bar`'s line the moment it is SCHEDULED — its step 0, with its exact audio time (the bar line: swing never
 * moves step 0), up to 100 ms before it sounds. The engine has one onStepScheduled (StudioMode's PERFORM judge sits on
 * it), so the watcher CHAINS: the handler that was there still runs first, and is put back when the bar is heard or the
 * returned unwatch is called — unless someone replaced the watcher meanwhile, which is then left alone.
 */
export function watchBarLine(eng: BarClock, bar: number, onBar: (time: number) => void): () => void {
  const prev = eng.onStepScheduled;
  let done = false;
  const unwatch = (): void => { if (done) return; done = true; if (eng.onStepScheduled === watcher) eng.onStepScheduled = prev; };
  const watcher = (step: number, time: number, sound: StepSound): void => {
    prev?.(step, time, sound);
    if (done || step !== 0 || eng.currentBar !== bar) return;
    unwatch();
    onBar(time);
  };
  eng.onStepScheduled = watcher;
  return unwatch;
}

/** Seconds per bar (4/4, 16ths): the grid's bar length at `bpm`. */
export function barSec(bpm: number, stepsPerBar = 16): number { return (stepsPerBar * 60) / (4 * Math.max(1, bpm)); }


// ── takes: best of N ────────────────────────────────────────────────────────────────────────────────────────────────
/** The region a take was recorded over — takes with the same slot are one best-of-N group. */
export function takeSlot(t: Pick<ProjectTake, 'atBar' | 'bars'>): string { return `${t.atBar}+${t.bars}`; }

/**
 * The take each group plays: the one picked (or recorded) last — the largest `pickedAt`, ties to the later in the list.
 * A new take is the pick of its group without touching the others (StudioMode's onTake only appends), PICK stamps one,
 * and deleting the pick hands the group to the one picked before it. The others are kept, silent, until deleted.
 */
export function pickedTakeIds(takes: readonly Pick<ProjectTake, 'id' | 'atBar' | 'bars' | 'pickedAt'>[]): Set<string> {
  const best = new Map<string, { id: string; at: number }>();
  for (const t of takes) {
    const k = takeSlot(t);
    const b = best.get(k);
    if (!b || t.pickedAt >= b.at) best.set(k, { id: t.id, at: t.pickedAt });
  }
  return new Set([...best.values()].map((b) => b.id));
}

/** PICK: this take plays for its bars; the others over the same bars are kept, silent. */
export function pickTake<T extends Pick<ProjectTake, 'id' | 'pickedAt'>>(takes: readonly T[], id: string, now: number): T[] {
  const top = takes.reduce((m, t) => Math.max(m, t.pickedAt), 0);
  return takes.map((t) => (t.id === id ? { ...t, pickedAt: Math.max(now, top + 1) } : t));
}

/** The takes grouped by region, in the order each region was first recorded — the booth's list. */
export function takeGroups<T extends Pick<ProjectTake, 'id' | 'atBar' | 'bars' | 'pickedAt'>>(takes: readonly T[]): { slot: string; atBar: number; bars: number; takes: T[]; picked: string }[] {
  const picked = pickedTakeIds(takes);
  const out: { slot: string; atBar: number; bars: number; takes: T[]; picked: string }[] = [];
  for (const t of takes) {
    const slot = takeSlot(t);
    let g = out.find((x) => x.slot === slot);
    if (!g) { g = { slot, atBar: t.atBar, bars: t.bars, takes: [], picked: '' }; out.push(g); }
    g.takes.push(t);
    if (picked.has(t.id)) g.picked = t.id;
  }
  return out;
}

/**
 * A take as the booth hands it to the engine (AudioEngine EngineTake, contract (4)) in the ENGINE's terms — `trimStart` the
 * trim-in in seconds (a gate: the engine starts the pass that far after the bar line, that far into the buffer) and
 * `trimEnd` an END position in seconds into the buffer. MUSIC-SUITE P4 FIX PASS: the booth's `gateSec` (trimStart 0 + a
 * gated copy of the buffer) is gone — see gatedBuffer.
 */
export type BoothTake = EngineTake;

/**
 * The project's takes → engine.setTakes. Only each group's pick plays (the others are kept, silent); a take whose audio
 * is not decoded yet (or not on this device) is left out; muted takes are handed over muted (the engine silences one at
 * once and starts it again at its next pass when unmuted). The loop is the song's in song mode, else the take's own. A
 * take never plays past its region (its end is the region's last bar line at most), so it cannot overlap its own next
 * pass after the chain shrinks; a take with nothing left between its trims is left out (the engine would read an end at
 * or before the start as "the whole buffer").
 */
export function engineTakeList(
  takes: readonly ProjectTake[],
  buffers: ReadonlyMap<string, AudioBuffer>,
  o: { songMode: boolean; songBars: number; bpm: number; stepsPerBar?: number },
): BoothTake[] {
  const picked = pickedTakeIds(takes);
  const bar = barSec(o.bpm, o.stepsPerBar ?? 16);
  const out: BoothTake[] = [];
  for (const t of takes) {
    const buffer = buffers.get(t.id);
    if (!buffer || !picked.has(t.id)) continue;
    const loopBars = o.songMode && o.songBars > 0 ? o.songBars : t.loopBars;
    if (t.atBar >= loopBars) continue;   // outside what is looping: silent (the booth says so)
    const fits = Math.min(t.bars, loopBars - t.atBar) * bar;
    const trimStart = Math.max(0, t.trimStart);
    const end = Math.min(buffer.duration - Math.max(0, t.trimEnd), fits, buffer.duration);
    if (!(end - trimStart > 0.001)) continue;
    out.push({ id: t.id, buffer, startBar: t.atBar, loopBars, gain: t.gain, trimStart, trimEnd: end, muted: t.muted });
  }
  return out;
}

/**
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): while a take is waiting or recording over `slot` (takeSlot of the booth's region),
 * that region's takes go to the engine MUTED — the current pick played under the performer and (echo cancelling off) bled
 * into the new take on speakers. `slot` null = nothing is recording: the list as it is.
 */
export function muteRecordingSlot<T extends Pick<EngineTake, 'id' | 'muted'>>(list: readonly T[], takes: readonly Pick<ProjectTake, 'id' | 'atBar' | 'bars'>[], slot: string | null): T[] {
  if (!slot) return list.slice();
  const ids = new Set(takes.filter((t) => takeSlot(t) === slot).map((t) => t.id));
  return list.map((t) => (ids.has(t.id) && !t.muted ? { ...t, muted: true } : t));
}

/** Why a take is silent right now, in the booth's words (null = it plays). */
export function takeSilence(t: ProjectTake, o: { picked: boolean; songMode: boolean; songBars: number; loaded: boolean; missing: boolean }): string | null {
  if (o.missing) return 'audio missing';
  if (!o.loaded) return 'loading…';
  if (t.muted) return 'muted';
  if (!o.picked) return 'kept (not picked)';
  const loop = o.songMode && o.songBars > 0 ? o.songBars : t.loopBars;
  if (t.atBar >= loop) return `outside the ${loop}-bar ${o.songMode ? 'song' : 'loop'}`;
  return null;
}

// ── the browser capture ─────────────────────────────────────────────────────────────────────────────────────────────
/** Frames per message from the worklet (≈ 43 ms at 48 kHz): the meter's rate and the tape's grain. */
export const CAPTURE_CHUNK_FRAMES = 2048;
/** Seconds of input kept while armed and not recording (the meter's history; a take never reaches back into it). */
export const PREROLL_SEC = 2;
/** The worklet: mono input → chunks stamped with `currentFrame` (the context clock), posted to the main thread. */
export const CAPTURE_WORKLET_NAME = 'fel-take-capture';
export const CAPTURE_WORKLET_SOURCE = `
class FelTakeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(${CAPTURE_CHUNK_FRAMES}); this.n = 0; this.start = 0; this.open = true;
    this.port.onmessage = (e) => { if (e.data === 'flush') this.flush(); else if (e.data === 'close') { this.flush(); this.open = false; } };
  }
  flush() {
    if (!this.n) return;
    const pcm = this.buf.slice(0, this.n);
    this.port.postMessage({ frame: this.start, pcm }, [pcm.buffer]);
    this.n = 0;
  }
  process(inputs) {
    if (!this.open) return false;
    const input = inputs[0];
    if (!input || !input.length) return true;
    const ch = input[0];
    // a block that does not follow the last one (a suspended context) starts a new chunk: frames never slide
    if (this.n && (this.start + this.n !== currentFrame || this.n + ch.length > this.buf.length)) this.flush();
    if (!this.n) this.start = currentFrame;
    this.buf.set(ch, this.n); this.n += ch.length;
    if (this.n >= this.buf.length) this.flush();
    return true;
  }
}
registerProcessor('${CAPTURE_WORKLET_NAME}', FelTakeCapture);
`;

const workletReady = new WeakMap<BaseAudioContext, Promise<boolean>>();
function loadCaptureWorklet(ctx: AudioContext): Promise<boolean> {
  let p = workletReady.get(ctx);
  if (!p) {
    p = (async () => {
      if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return false;
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' }));
      try { await ctx.audioWorklet.addModule(url); return true; } catch { return false; } finally { URL.revokeObjectURL(url); }
    })();
    workletReady.set(ctx, p);
  }
  return p;
}

/** Raw input: the booth records what the mic hears, not what a call-quality filter leaves of it. */
export const RAW_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 },
};

/** A capture node on `ctx` (worklet, else ScriptProcessor) that hands stamped mono chunks to `onChunk`. */
async function captureNode(ctx: AudioContext, onChunk: (c: TapeChunk) => void): Promise<{ node: AudioNode; kind: 'worklet' | 'script'; flush: () => void; close: () => void }> {
  const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);   // pulled by the graph, heard by no one
  if (await loadCaptureWorklet(ctx)) {
    const node = new AudioWorkletNode(ctx, CAPTURE_WORKLET_NAME, {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
    });
    node.port.onmessage = (e: MessageEvent<{ frame: number; pcm: Float32Array }>) => onChunk({ frame: e.data.frame, pcm: e.data.pcm });
    node.connect(sink);
    return {
      node, kind: 'worklet',
      flush: () => node.port.postMessage('flush'),
      close: () => { node.port.postMessage('close'); node.port.onmessage = null; node.disconnect(); sink.disconnect(); },
    };
  }
  const size = CAPTURE_CHUNK_FRAMES;
  const sp = ctx.createScriptProcessor(size, 1, 1);
  sp.onaudioprocess = (e) => onChunk({ frame: scriptProcessorBlockFrame(e.playbackTime, size, ctx.sampleRate), pcm: e.inputBuffer.getChannelData(0).slice() });
  sp.connect(sink);
  return { node: sp, kind: 'script', flush: () => { /* a ScriptProcessor block arrives whole */ }, close: () => { sp.onaudioprocess = null; sp.disconnect(); sink.disconnect(); } };
}

/**
 * The booth's open mic. ARM opens it (permission is asked HERE, never on a bar line), with raw input, into a capture node
 * on the ENGINE's context (one clock for the beat and the tape). While armed it keeps PREROLL_SEC of input for the meter;
 * `hold(frame)` keeps everything from `frame` on, `cut(from, to)` waits for the tape to reach `to` and cuts it, and
 * `close()` stops the track (the browser's mic light goes out) — the booth calls it when it closes or unmounts.
 */
export class BoothMic {
  readonly sampleRate: number;
  private chunks: TapeChunk[] = [];
  private keepFrom: number | null = null;
  private waiters: { to: number; done: () => void }[] = [];
  /** The newest block's levels — the input meter. */
  level = { peak: 0, rms: 0 };
  /** Loudest peak since the last read of `takePeak()` — the clip light. */
  private peakHold = 0;
  closed = false;
  private constructor(
    readonly ctx: AudioContext,
    readonly stream: MediaStream,
    private readonly src: MediaStreamAudioSourceNode,
    private readonly cap: { node: AudioNode; kind: 'worklet' | 'script'; flush: () => void; close: () => void },
  ) {
    this.sampleRate = ctx.sampleRate;
  }

  static async open(ctx: AudioContext): Promise<BoothMic> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_MIC_CONSTRAINTS });
    try {
      if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
      let mic: BoothMic | null = null;
      const cap = await captureNode(ctx, (c) => mic?.onChunk(c));
      const src = ctx.createMediaStreamSource(stream);
      src.connect(cap.node);
      mic = new BoothMic(ctx, stream, src, cap);
      return mic;
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      throw e;
    }
  }

  get kind(): 'worklet' | 'script' { return this.cap.kind; }
  get track(): MediaStreamTrack | null { return this.stream.getAudioTracks()[0] ?? null; }
  /** What the track actually got (the probes read echoCancellation / noiseSuppression / autoGainControl / latency). */
  settings(): MediaTrackSettings & { latency?: number } { return (this.track?.getSettings() ?? {}) as MediaTrackSettings & { latency?: number }; }
  /** The formula's inputs as they are now (they can change with the output device). P4 FIX PASS: + the desk's delay. */
  latency(savedOffsetMs: number | null, graphLatencySec = 0): BoothLatency {
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return boothLatency({ baseLatency: c.baseLatency, outputLatency: c.outputLatency, trackLatency: this.settings().latency ?? null, savedOffsetMs, graphLatencySec });
  }
  get endFrame(): number { return tapeEnd(this.chunks); }
  /** The track is live (not ended by the browser, the OS or an unplugged device). */
  get live(): boolean { return !this.closed && this.track?.readyState === 'live'; }
  takePeak(): number { const p = this.peakHold; this.peakHold = 0; return p; }
  /** The loudest sample of the last `sec` seconds of the tape (≤ PREROLL_SEC while only armed) — read, not consumed. */
  recentPeak(sec = 1): number {
    const from = this.endFrame - Math.round(sec * this.sampleRate);
    let peak = 0;
    for (const c of this.chunks) if (c.frame + c.pcm.length > from) peak = Math.max(peak, levels(c.pcm.subarray(Math.max(0, from - c.frame))).peak);
    return peak;
  }

  private onChunk(c: TapeChunk): void {
    if (this.closed) return;
    this.chunks.push(c);
    this.level = levels(c.pcm);
    this.peakHold = Math.max(this.peakHold, this.level.peak);
    const end = c.frame + c.pcm.length;
    const floor = this.keepFrom ?? end - Math.round(PREROLL_SEC * this.sampleRate);
    if (this.chunks.length > 1 && this.chunks[0].frame + this.chunks[0].pcm.length <= floor) this.chunks = tapeDropBefore(this.chunks, floor);
    const ready = this.waiters.filter((w) => end >= w.to);
    this.waiters = this.waiters.filter((w) => end < w.to);
    ready.forEach((w) => w.done());
  }

  /** Keep every frame from `frame` on (a take is recording); null goes back to the pre-roll. */
  hold(frame: number | null): void { this.keepFrom = frame; }

  /** Cut [from, to): waits (at most `timeoutMs`) for the tape to reach `to`; frames never captured are silence (gaps). */
  async cut(from: number, to: number, timeoutMs = 1500): Promise<{ pcm: Float32Array; gaps: number }> {
    if (this.endFrame < to && !this.closed) {
      this.cap.flush();
      await new Promise<void>((resolve) => {
        const w = { to, done: () => { clearTimeout(timer); resolve(); } };
        const timer = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); resolve(); }, timeoutMs);
        this.waiters.push(w);
      });
    }
    return tapeCut(this.chunks, from, to);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stream.getTracks().forEach((t) => t.stop());
    try { this.src.disconnect(); } catch { /* already gone */ }
    this.cap.close();
    this.chunks = []; this.keepFrom = null;
    const w = this.waiters; this.waiters = []; w.forEach((x) => x.done());
  }

  /**
   * DEV CLOCK CHECK (the probes): a 1-sample click scheduled on the context at `at` straight into a second capture node
   * (no mic, no device latency) must land on the tape at frame round(at × rate). Returns the error in ms, measured in
   * the real browser — the worklet's `currentFrame` stamping, not the formula's device terms.
   */
  static async clockCheck(ctx: AudioContext, leadSec = 0.25): Promise<{ errorMs: number | null; kind: 'worklet' | 'script' }> {
    const chunks: TapeChunk[] = [];
    const cap = await captureNode(ctx, (c) => chunks.push(c));
    try {
      const click = ctx.createBuffer(1, 64, ctx.sampleRate); click.getChannelData(0)[0] = 0.9;
      const src = ctx.createBufferSource(); src.buffer = click; src.connect(cap.node);
      const at = ctx.currentTime + leadSec;
      src.start(at);
      const want = Math.round(at * ctx.sampleRate);
      const deadline = Date.now() + 3000;
      while (tapeEnd(chunks) < want + 4096 && Date.now() < deadline) { cap.flush(); await new Promise((r) => setTimeout(r, 40)); }
      const cutFrom = want - 4096;
      const { pcm } = tapeCut(chunks, cutFrom, want + 4096);
      const i = firstTransient(pcm, 0.3);
      return { errorMs: i < 0 ? null : ((cutFrom + i - want) / ctx.sampleRate) * 1000, kind: cap.kind };
    } finally { cap.close(); }
  }
}
