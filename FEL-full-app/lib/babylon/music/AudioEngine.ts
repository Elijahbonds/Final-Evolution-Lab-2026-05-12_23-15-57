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
//
// MUSIC-SUITE P3 (2026-09-25), "Keep my work" — WHAT YOU HEAR IS WHAT YOU SEE (track selection only):
//   * The engine played EVERY track it was handed, and the room handed it the project's whole list: 8 kit rows + every
//     Flip row, while the grid drew the tier's 4 / 6 / 8 kit rows (P1, BASELINE.md 2b: 10 tracks, 6 rows drawn; flip_0
//     played 8 times in 2 bars and was never drawn; CELL's lead played 4 times on the 4-row grid). `setAudible(ids)` is
//     the room's drawn-rows rule (MusicTiers.shownRowIds) and every path that starts a sound reads it through `hears()`:
//     the live scheduler, gridLive (PERFORM's "is there anything to play"), renderStems, renderMixdown, renderSong and
//     renderSongStems. A rule by id, so a section swapped in on a bar line is filtered in the same instant. null = all
//     (the default; nothing else changes for a caller that never selects).
//   * `renderMixdown(bars, tracks)` renders a given track list (still through the selection): PUBLISH renders the working
//     grid even while song mode or a CELL preview is what the engine is playing.
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25):
//   * renderMixdown(bars, tracks, SWING). The list was the working grid but the swing was this.state's — the SECTION's,
//     while song mode played one (SongPanel.playSection sets it). Measured on fakeWebAudio: a hat on step 1 at 120 BPM
//     rendered at 0.1250 s with song mode off and 0.1500 s under a 40 % section, while the published record said the
//     project's swing — the library audio was swung, the card, a remix and the dance export were not.
//   * unloadSample / dropSamples. loadBuffer only ever SET samples[id]; nothing removed one. Opening another project
//     loaded that project's Flip chops over the old ones, and a chop that failed to load left the previous project's
//     sound under that row id — project B's "FLIP 1" played project A's 808 kick (and PUBLISH rendered it) while the room
//     said the sound was gone. The room drops every flip_* sample when another project opens, and a row whose chop can't
//     load is unloaded, so a row that "plays nothing" is silent.
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody" — THE PHASE-4 ENGINE CONTRACT (the other P4 lanes build on it):
//   (1) ONE GRAPH. The live master (a bare 0.8 gain, :131-138 then) and offlineBus (:317-323 then) were two pieces of code
//       kept in step by hand, with no mixer, no send and no limiter (a busy beat clipped: encodeWav clamps at ±1). Every
//       path now builds its graph with mixGraph.ts buildMixGraph(ctx, project) — live in the constructor, and a fresh one
//       per offline context in renderMixdown / renderStems / renderSong / renderSongStems — and every hit, take and click
//       is placed by the SAME functions (playHit / playTake), so live and render are the same chain (mixGraph.test.ts
//       builds both on fakeWebAudio and compares them). Per row: source → hit gain (volume × velocity) → hit pan → the
//       row's channel strip (fader → pan → mute/solo gate → room / slap sends) → bus → MASTER polish → limiter → meters.
//   (2) A STEP HAS A NOTE. TrackState keeps `pattern: boolean[]` — the on/off of every step, which fifteen readers
//       (MusicTiers, studioEdit, DanceExport, the dev probe, PERFORM …) already count — and gains two optional per-step
//       arrays, `notes` (MIDI) and `vels` (0..1). StudioProject.stepAt / withStep give the contract's { on, note, vel }
//       view of a step. A pitched row (scales.ts isPitchedRow: bass, lead, keys, flip_*) plays its step's note — a loaded
//       note buffer (loadNote / SynthKit.synthesizeNote) or the row's buffer at playbackRate 2^((note − root) / 12), the
//       root being the note SynthKit made it on (voiceRootOf) or 60 for a Flip chop. Drums ignore a note.
//   (3) METRONOME + COUNT-IN. setMetronome(on) clicks every quarter note of the song on the audio clock (the bar's
//       downbeat accented); countIn(bars) starts the transport after `bars` bars of count clicks (a distinct sound — a
//       higher click, the count's downbeats accented), and says when bar 0 begins (the booth aligns takes to it).
//   (4) TAKES LOOP AND STOP. setTakes([{ id, buffer, startBar, loopBars?, gain, trimStart, trimEnd, muted }]) — a take
//       starts on its bar line on EVERY pass of the song: bar % period === startBar (period = its loopBars, else
//       setSongBars; a take whose startBar is outside its loop never plays — the booth's rule, takeCapture.takePlaysAtBar;
//       no period = once, at startBar: the old setOneShots, now a thin adapter). `trimStart` is a GATE (the pass starts that
//       many seconds after the bar line, that far into the buffer: the audio keeps its place on the grid); `trimEnd` is
//       where in the buffer the pass ends (≤ trimStart or past the buffer = its end). A pass is cut where the next begins, and stop()
//       stops every take at once (the old one-shots rang on after STOP to their end). A take whose bar line had already
//       gone by (a stall) joins late at the right offset instead of starting from its top.
//   (5) THE MIXER. setMixer(project.mixer) — per-row gain / pan / mute / solo / room / slap and the master fader. A muted
//       or soloed-out row starts no sources (hears(), like P3's selection) AND its gate closes, so a hit already scheduled
//       ahead goes silent the moment the button is pressed.

import { gridStepTime, retempoGrid, songStepTime, stepDurSec, stepIsPast, type StepGrid } from './stepTime';
import { claimPlaybackSession } from '@/lib/audio/session';
import {
  DEFAULT_MIXER, RAMP_TC, TAKES_CHANNEL, buildMixGraph, clickBuffer, gateOpen,
  type ClickKind, type MeterReadout, type MixGraph, type MixerState,
} from './mixGraph';
import { FLIP_ROOT_MIDI, isPitchedRow } from './scales';
import { voiceRootOf } from './SynthKit';

export interface Sample {
  id: string; name: string; buffer: AudioBuffer;
  category: 'kick' | 'snare' | 'hat' | 'perc' | 'bass' | 'melody' | 'vox' | 'fx';
  /** MUSIC-SUITE P4: the note this buffer sounds (absent: SynthKit's voiceRootOf, else 60 for a Flip chop). */
  rootMidi?: number;
}
export interface TrackState {
  sampleId: string; pattern: boolean[]; volume: number; muted: boolean; pan: number;
  /** MUSIC-SUITE P4: each step's note (MIDI) — pitched rows only; a drum row's notes are ignored. Absent = the row's root. */
  notes?: number[];
  /** MUSIC-SUITE P4: each step's velocity, 0..1 (scales the hit's gain). Absent = 1 on every step. */
  vels?: number[];
}
export interface SequencerState {
  bpm: number; steps: number; tracks: TrackState[]; swing: number;
}
/**
 * MUSIC-SUITE P4: a recorded take as the engine plays it (the booth builds these: takeCapture.engineTakeList). `startBar`
 * is its bar line inside the loop; `loopBars` the period it repeats at (absent: the song's length, setSongBars; neither:
 * it plays once); `trimStart` is a gate in seconds (the pass starts that much after the bar line, that far into the buffer
 * — the audio keeps its place on the grid), `trimEnd` the END of what plays, in seconds into the buffer (≤ trimStart, or
 * past the buffer, = the buffer's end); `muted` = not played (best of N keeps the others).
 */
export interface EngineTake {
  id: string; buffer: AudioBuffer; startBar: number; loopBars?: number; gain: number; trimStart: number; trimEnd: number; muted: boolean;
}
/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): the sounds one render plays, by row id, over the engine's loaded ones — a buffer
 * (played as a Flip row plays its chop: no rootMidi, so a note moves it by rate from FLIP_ROOT_MIDI) or null (silent in
 * this render). A row not in the map plays the engine's sound, as before.
 */
export type RenderSounds = ReadonlyMap<string, AudioBuffer | null>;

/** A one-shot as SongPanel (M3) hands it: a take by its old name. renderSong / renderSongStems take these. */
export interface SongShot { id?: string; buffer: AudioBuffer; atBar: number; gain: number; trimStart?: number; trimEnd?: number; muted?: boolean }
/** MUSIC-SUITE P4: a click on the audio clock. */
export interface ScheduledClick { at: number; kind: ClickKind }

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
/** The first step (or count click) sounds this long after start() / countIn() — the time the graph needs to be ready. */
const START_LEAD_S = 0.05;

/**
 * What a scheduled step will play: `hits` sources start on it; `gridLive` = the pattern has any audible hit at all.
 * MUSIC-SUITE P2 FIX PASS: `skipped` = the step's time had already gone by when the scheduler reached it (a stall), so
 * nothing was started and `hits` is 0 — PERFORM offers it as a rest.
 */
export interface StepSound { hits: number; gridLive: boolean; skipped?: boolean }

// ── pure helpers (MUSIC-SUITE P4: the rules, tested without a clock) ───────────────────────────────────────────────

/** A step's velocity, 0..1 (absent or unreadable = 1). */
export function stepVelocity(track: Pick<TrackState, 'vels'>, step: number): number {
  const v = track.vels?.[step];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
/** The note a step plays: its MIDI note on a pitched row; null on a drum row (drums ignore a note) or with none set. */
export function stepNote(track: Pick<TrackState, 'sampleId' | 'notes'>, step: number): number | null {
  if (!isPitchedRow(track.sampleId)) return null;
  const n = track.notes?.[step];
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
/** playbackRate that turns a buffer sounding `root` into `note`. */
export function noteRate(note: number, root: number): number { return Math.pow(2, (note - root) / 12); }
/** The note a loaded sound plays at rate 1: as loaded, else as SynthKit made it, else a Flip chop's 60; null = unknown. */
export function sampleRoot(sample: Pick<Sample, 'id' | 'buffer' | 'rootMidi'>): number | null {
  if (typeof sample.rootMidi === 'number' && Number.isFinite(sample.rootMidi)) return sample.rootMidi;
  const synth = voiceRootOf(sample.buffer);
  if (synth !== undefined) return synth;
  return /^flip_\d{1,2}$/.test(sample.id) ? FLIP_ROOT_MIDI : null;
}
/**
 * What a hit plays: the buffer and the rate. A drum (or a pitched step with no note) plays its buffer as it is; a
 * pitched step plays its note — a buffer rendered ON that note when one is loaded, else the row's buffer at noteRate.
 */
export function voiceFor(
  sample: Pick<Sample, 'id' | 'buffer' | 'rootMidi'>, track: Pick<TrackState, 'sampleId' | 'notes'>, step: number,
  notes?: ReadonlyMap<string, AudioBuffer>,
): { buffer: AudioBuffer; rate: number; note: number | null } {
  const note = stepNote(track, step);
  if (note === null) return { buffer: sample.buffer, rate: 1, note: null };
  const exact = notes?.get(noteKey(sample.id, note));
  if (exact) return { buffer: exact, rate: 1, note };
  const root = sampleRoot(sample);
  return { buffer: sample.buffer, rate: root === null ? 1 : noteRate(note, root), note };
}
const noteKey = (id: string, midi: number): string => `${id}#${Math.round(midi)}`;

/** The metronome's click on a step of the song: the downbeat accented, the other quarter notes plain, else none. */
export function metronomeClick(stepInBar: number, stepsPerBar = 16): ClickKind | null {
  if (stepInBar === 0) return 'accent';
  return stepInBar % Math.max(1, Math.round(stepsPerBar / 4)) === 0 ? 'beat' : null;
}
/** One bar's length in seconds (16ths × steps per bar). */
export function barSec(bpm: number, stepsPerBar = 16): number { return stepDurSec(bpm) * stepsPerBar; }
/** A count-in of `bars` bars starting at `startSec`: one click per beat, each bar's first a countAccent. */
export function countInClicks(startSec: number, bars: number, bpm: number, beatsPerBar = 4): ScheduledClick[] {
  const beat = 60 / bpm;
  const out: ScheduledClick[] = [];
  for (let b = 0; b < Math.max(0, Math.floor(bars)); b++) {
    for (let i = 0; i < beatsPerBar; i++) out.push({ at: startSec + (b * beatsPerBar + i) * beat, kind: i === 0 ? 'countAccent' : 'count' });
  }
  return out;
}
/** A take's period in bars: its own loop, else the song's; null = it plays once. */
export function takePeriod(take: Pick<EngineTake, 'loopBars'>, songBars: number | null): number | null {
  const p = take.loopBars ?? songBars;
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 ? Math.floor(p) : null;
}
/**
 * Does a take start on song bar `bar`? Looping: on every pass of its bars, bar % period === startBar — and never when its
 * startBar is outside the loop (the booth's rule, takeCapture.takePlaysAtBar, so the booth's "silent" line is the truth).
 * Not looping: once, on startBar.
 */
export function takeStartsAt(take: Pick<EngineTake, 'startBar' | 'loopBars'>, bar: number, songBars: number | null): boolean {
  const start = Math.floor(take.startBar);
  const p = takePeriod(take, songBars);
  if (p === null) return bar === start;
  return start >= 0 && start < p && bar >= 0 && bar % p === start;
}
/**
 * One pass of a take from its bar line at `barTime`: `trimStart` GATES the front — the source starts that long after the
 * bar line, that far into the buffer (the audio keeps its place on the grid) — and the pass ends at `trimEnd` in the
 * buffer (≤ trimStart or past the buffer = the buffer's end: what takeCapture.engineTakeList hands over). Null when
 * nothing is left to play.
 */
export function takeSpan(take: Pick<EngineTake, 'buffer' | 'trimStart' | 'trimEnd'>, barTime = 0): { when: number; offset: number; duration: number } | null {
  const len = take.buffer.duration;
  const ts = Math.max(0, Math.min(len, Number.isFinite(take.trimStart) ? take.trimStart : 0));
  const end = Number.isFinite(take.trimEnd) && take.trimEnd > ts && take.trimEnd <= len ? take.trimEnd : len;
  const duration = end - ts;
  return duration > 0.001 ? { when: barTime + ts, offset: ts, duration } : null;
}
/** SongPanel's one-shot (atBar) as an engine take: plays from its top, once unless the song length is set. */
export function takeFromShot(o: SongShot, i = 0): EngineTake {
  return {
    id: o.id ?? String(i), buffer: o.buffer, startBar: o.atBar, gain: o.gain,
    trimStart: o.trimStart ?? 0, trimEnd: o.trimEnd ?? 0, muted: o.muted === true,
  };
}

// ── what starts a sound: ONE place per kind, live and offline alike ─────────────────────────────────────────────────

/**
 * A grid hit: source → hit gain (volume × velocity) → the row's channel strip.
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): the hit's own StereoPanner (at track.pan — 0, and no UI sets it) is gone unless a
 * row really carries a pan. A StereoPannerNode UP-MIXES a mono source to stereo (0.707 / 0.707 at centre), and the strip's
 * panner after it then works as a BALANCE on a stereo signal: at PAN −1 it sums L = inL + inR = 1.414 — the review measured
 * +3.01 dB at ±1 and +2.32 dB at ±0.5 on a kit row (SynthKit renders mono, SynthKit.ts:86), while a take (mono → strip)
 * panned equal-power, so the same PAN slider had two laws and a panned row pushed harder into the limiter. Now a mono hit
 * reaches the strip mono, and the strip's panner pans it equal-power, as it pans a take (mixGraph.test.ts walks both).
 */
function playHit(ctx: BaseAudioContext, graph: MixGraph, voice: { buffer: AudioBuffer; rate: number }, track: TrackState, step: number, at: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = voice.buffer;
  if (voice.rate !== 1) src.playbackRate.value = voice.rate;
  const gain = ctx.createGain();
  gain.gain.value = track.volume * stepVelocity(track, step);
  let out: AudioNode = src.connect(gain);
  if (Number.isFinite(track.pan) && track.pan !== 0) {   // a legacy per-row pan (no UI writes one): kept as it was
    const panner = ctx.createStereoPanner();
    panner.pan.value = track.pan;
    out = out.connect(panner);
  }
  out.connect(graph.channel(track.sampleId).input);
  src.start(at);
  return src;
}
/**
 * A take's pass from its bar line `barTime`: source (gated by the trims) → its gain → the takes strip. `until` = where the
 * pass must end (its next pass; null = its own end); `now` = the audio clock (a pass whose start has gone by joins late,
 * at the offset it would have reached, rather than from its top). Returns the source and when it stops.
 */
function playTake(ctx: BaseAudioContext, graph: MixGraph, take: EngineTake, barTime: number, until: number | null, now = -Infinity): { src: AudioBufferSourceNode; gain: GainNode; at: number; end: number } | null {
  const pass = takeSpan(take, barTime);
  if (!pass) return null;
  let { when, offset, duration } = pass;
  if (until !== null) duration = Math.min(duration, until - when);
  if (when < now) { const late = now - when; when = now; offset += late; duration -= late; }
  if (!(duration > 0.001)) return null;
  const src = ctx.createBufferSource();
  src.buffer = take.buffer;
  const g = ctx.createGain();
  g.gain.value = take.gain;
  src.connect(g).connect(graph.channel(TAKES_CHANNEL).input);
  src.start(when, offset, duration);
  return { src, gain: g, at: when, end: when + duration };
}

export class AudioEngine {
  private ctx: AudioContext;
  /** MUSIC-SUITE P4: the live desk (mixGraph.ts) — the same builder every render uses. */
  private graph: MixGraph;
  private mixer: MixerState = DEFAULT_MIXER;
  private polished = false;
  private samples = new Map<string, Sample>();
  /** MUSIC-SUITE P4: buffers rendered ON a note (loadNote), by `<sampleId>#<midi>`. */
  private notes = new Map<string, AudioBuffer>();
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
  /** MUSIC-SUITE P4: the takes (setTakes; setOneShots feeds it too), the song's length for their loop, the metronome. */
  private takes: EngineTake[] = [];
  private songBars: number | null = null;
  private metronome = false;
  /** MUSIC-SUITE P4: bar 0's time on the audio clock for the current run (after any count-in). */
  private startedAt = 0;
  /**
   * MUSIC-SUITE P4: sources that may still sound — stop() stops every take and click, and every hit not yet begun.
   * MUSIC-SUITE P4 FIX PASS: a take's pass also keeps its GainNode (a GAIN move glides it), and its bar line and cut point
   * (a trim move restarts it where it has got to).
   */
  private live: {
    src: AudioScheduledSourceNode; at: number; end: number; kind: 'hit' | 'take' | 'click';
    takeId?: string; buffer?: AudioBuffer; gain?: GainNode; barTime?: number; until?: number | null;
  }[] = [];
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
  /** MUSIC-SUITE P3: the rows the room draws (MusicTiers.shownRowIds) — the only rows that sound. null = every row. */
  private audible: ReadonlySet<string> | null = null;

  constructor(initial: SequencerState) {
    this.releaseSession = claimPlaybackSession();
    this.ctx = new AudioContext();
    // MUSIC-SUITE P4 FIX PASS: the live desk glides a mixer move (a render's desk is static — offlineGraph)
    this.graph = buildMixGraph(this.ctx, { mixer: this.mixer, polish: this.polished }, { live: true });
    this.state = initial;
  }

  async loadSample(id: string, name: string, url: string, category: Sample['category']): Promise<void> {
    const res = await fetch(url);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.samples.set(id, { id, name, buffer, category });
  }

  /** Direct-buffer registration — SynthKit's zero-asset path. MUSIC-SUITE P4: `rootMidi` = the note it sounds (optional). */
  loadBuffer(id: string, name: string, buffer: AudioBuffer, category: Sample['category'], rootMidi?: number): void {
    this.samples.set(id, { id, name, buffer, category, ...(typeof rootMidi === 'number' && Number.isFinite(rootMidi) ? { rootMidi } : {}) });
    this.dropNotes(id);   // a new sound under this id: its old note renders are someone else's
  }

  /** MUSIC-SUITE P3 FIX PASS: forget one sound — its row plays nothing until a buffer is loaded again. */
  unloadSample(id: string): void { this.samples.delete(id); this.dropNotes(id); }
  /** MUSIC-SUITE P3 FIX PASS: forget every sound whose id matches (another project opened: every flip_* row). */
  dropSamples(match: (id: string) => boolean): string[] {
    const gone = [...this.samples.keys()].filter(match);
    for (const id of gone) { this.samples.delete(id); this.dropNotes(id); }
    return gone;
  }
  /** MUSIC-SUITE P3 FIX PASS: is a sound loaded under this id (the dev probe and the tests read it)? */
  hasSample(id: string): boolean { return this.samples.has(id); }

  /**
   * MUSIC-SUITE P4: a buffer rendered ON a note for a pitched row (SynthKit.synthesizeNote) — played instead of the row's
   * buffer at a rate, for that note only. Optional: every note plays without one.
   */
  loadNote(id: string, midi: number, buffer: AudioBuffer): void { this.notes.set(noteKey(id, midi), buffer); }
  /** MUSIC-SUITE P4: forget the note renders of one row (or of every row). */
  dropNotes(id?: string): void {
    if (id === undefined) { this.notes.clear(); return; }
    for (const k of [...this.notes.keys()]) if (k.startsWith(`${id}#`)) this.notes.delete(k);
  }
  /** MUSIC-SUITE P4: the notes a row has a render for (the room renders the rest when the key changes). */
  loadedNotes(id: string): number[] {
    return [...this.notes.keys()].filter((k) => k.startsWith(`${id}#`)).map((k) => Number(k.slice(id.length + 1))).sort((a, b) => a - b);
  }

  /** Swap the whole kit in place (kit picker) — patterns/volumes untouched. MUSIC-SUITE P4: and the old kit's note renders go. */
  swapKit(buffers: Map<string, AudioBuffer>): void {
    for (const [id, buffer] of buffers) {
      const existing = this.samples.get(id);
      if (existing) { existing.buffer = buffer; delete existing.rootMidi; this.dropNotes(id); }
    }
  }

  get context(): AudioContext { return this.ctx; }
  get isRunning(): boolean { return this.timerId !== null; }
  get isPolished(): boolean { return this.polished; }
  setState(s: SequencerState): void { this.state = s; }
  setBpm(bpm: number): void { this.state.bpm = Math.max(40, Math.min(220, bpm)); }

  /** MUSIC-SUITE P3: sound only these rows (the drawn ones), live and in every render; null = every row. */
  setAudible(ids: Iterable<string> | null): void { this.audible = ids === null ? null : new Set(ids); }
  /** MUSIC-SUITE P3: the selection in force (null = every row) — for the dev probe. */
  get audibleIds(): ReadonlySet<string> | null { return this.audible; }
  /**
   * MUSIC-SUITE P3: does this row sound? Unmuted and drawn. The one check every path that starts a sound makes.
   * MUSIC-SUITE P4: …and its channel's gate is open (not muted on the desk, not silenced by another row's solo).
   */
  hears(t: Pick<TrackState, 'sampleId' | 'muted'>): boolean {
    return !t.muted && (this.audible === null || this.audible.has(t.sampleId)) && gateOpen(this.mixer, t.sampleId);
  }

  /** One-tap master: gentle glue compression + shelf sweetening (MUSIC-SUITE P4: in front of the limiter, mixGraph.ts). */
  masterPolish(on: boolean): void {
    if (on === this.polished) return;
    this.polished = on;
    this.graph.setPolish(on);
  }

  /** MUSIC-SUITE P4: the desk (StudioProject.mixer): every strip and the master fader, live now and in every render after. */
  setMixer(m: MixerState): void { this.mixer = m; this.graph.setMixer(m); }
  get mixerState(): MixerState { return this.mixer; }
  /** MUSIC-SUITE P4: the meters — master L / R and every strip that has played, peak + RMS (linear; mixGraph toDb). */
  meters(): MeterReadout { return this.graph.meters(); }
  /** MUSIC-SUITE P4: the live desk itself (the dev probe and the tests read its nodes). */
  get mixGraph(): MixGraph { return this.graph; }
  /**
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): how late the desk plays what the engine schedules — the limiter's 6 ms look-ahead,
   * + MASTER's glue compressor's 6 ms while on (mixGraph.graphLatencySec). Every click crosses the same delay now, so a click
   * and a hit scheduled together are heard together; the rooms add this to the device's delay (PERFORM's judge, the booth's
   * cut, the timing check's reading), because a saved calibration (the /play/calibrate screen: osc → destination, no
   * compressor) does not contain it.
   */
  get graphLatencySec(): number { return this.graph.latencySec; }
  /**
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): where a live sound from outside the grid enters the desk — a Flip pad played on the
   * FLIP tab goes through its row's strip (fader, pan, mute / solo, sends), the limiter and the meters, like the row's hits
   * (it went to ctx.destination beside the desk: over a running beat already at −0.3 dBFS it could clip, and the row's
   * mute / solo / fader and the meters never saw it — FlipPad.tsx:217-218 then).
   */
  channelInput(id: string): AudioNode { return this.graph.channel(id).input; }

  /** MUSIC-SUITE P4: click every quarter note of the song (the downbeat accented), from the next step on. */
  setMetronome(on: boolean): void { this.metronome = on; }
  get metronomeOn(): boolean { return this.metronome; }

  /**
   * MUSIC-SUITE P4: the song's length in bars — the period a take without its own loopBars repeats at (1 = the pattern
   * loop, songBars(chain) in song mode). null (the default) = takes play once, where their bar comes round first.
   */
  setSongBars(bars: number | null): void { this.songBars = bars === null || !Number.isFinite(bars) || bars < 1 ? null : Math.floor(bars); }
  get songLengthBars(): number | null { return this.songBars; }

  /**
   * MUSIC-SUITE P4: the takes the song plays (replaces the list). A take already sounding keeps sounding when it comes back
   * unchanged; one that is gone or now muted stops at once. A new take starts at its next pass.
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): the booth sends every slider move here, and the check compared only the buffer,
   * the trims and the bar — so a GAIN drag changed nothing you could hear until the next pass (up to 10.4 s: a 4-bar loop
   * at 92 BPM; the pass's GainNode was set once and not kept), and a TRIM drag (a new span) cut the pass and left the take
   * SILENT until its bar came round again. Now a gain-only change glides the sounding pass's gain (setTargetAtTime), and a
   * changed span or buffer restarts the pass at once where it has got to (playTake's late join: the same offset on the
   * grid), cut where it was cut. A take moved to another bar or loop still stops (its pass is somewhere else now).
   */
  setTakes(list: EngineTake[]): void {
    const next = new Map(list.map((t) => [t.id, t]));
    const now = this.ctx.currentTime;
    const restart: { take: EngineTake; barTime: number; until: number | null }[] = [];
    this.live = this.live.filter((l) => {
      if (l.kind !== 'take') return true;
      const t = l.takeId === undefined ? undefined : next.get(l.takeId);
      const prev = this.takes.find((x) => x.id === l.takeId);
      const samePlace = !!t && !t.muted && !!prev && t.startBar === prev.startBar && t.loopBars === prev.loopBars;
      const sameSpan = samePlace && t!.buffer === l.buffer && t!.trimStart === prev!.trimStart && t!.trimEnd === prev!.trimEnd;
      if (sameSpan) {
        if (t!.gain !== prev!.gain && l.gain) l.gain.gain.setTargetAtTime(t!.gain, now, RAMP_TC);
        return true;
      }
      try { l.src.stop(now); } catch { /* already stopped */ }
      // the span changed on a pass still inside its window: it starts again now, at the offset it has reached
      if (samePlace && l.barTime !== undefined && (l.until === null || l.until === undefined || l.until > now)) {
        restart.push({ take: t!, barTime: l.barTime, until: l.until ?? null });
      }
      return false;
    });
    this.takes = list.slice();
    for (const r of restart) {
      const played = playTake(this.ctx, this.graph, r.take, r.barTime, r.until, now);
      if (played) this.trackTake(played, r.take, r.barTime, r.until);
    }
  }
  get takeList(): readonly EngineTake[] { return this.takes; }
  /** M3: one-shots (vocal takes) that start at a bar line; replaces the list. MUSIC-SUITE P4: takes by their old name. */
  setOneShots(list: { id: string; buffer: AudioBuffer; atBar: number; gain: number }[]): void { this.setTakes(list.map(takeFromShot)); }
  get currentBar(): number { return this.bar; }
  /** MUSIC-SUITE P4: bar 0's time on the audio clock for this run (after the count-in, if one was asked for). */
  get songStartSec(): number { return this.startedAt; }
  /** MUSIC-SUITE P4: running and still inside the count-in. */
  get countingIn(): boolean { return this.timerId !== null && this.ctx.currentTime < this.startedAt; }

  start(): void { this.begin(0); }
  /**
   * MUSIC-SUITE P4: start after `bars` bars of count-in clicks (a distinct click, each bar's first accented), all placed on
   * the audio clock now. Returns when bar 0 begins and the clicks; a no-op (nothing new) when already running.
   */
  countIn(bars: number): { startAt: number; clicks: ScheduledClick[] } {
    if (this.timerId !== null) return { startAt: this.startedAt, clicks: [] };
    return this.begin(Math.max(0, Math.min(8, Math.floor(Number.isFinite(bars) ? bars : 0))));
  }
  /**
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): a count-in INTO a bar of the running song — `bars` bars of count clicks (the
   * count-in's own sound, each bar's first accented) over the bars just before song bar `bar`, on the grid's own times (the
   * bar line is step 0, which swing never moves). countIn() returned early while running, with no clicks at all, while the
   * booth told the player "RECORD counts you in" over a playing song (RecordBooth.tsx then: only a countdown on screen).
   * Clicks already in the past are skipped; stop() takes back every one not yet sounded. Returns the clicks placed.
   */
  countInBefore(bar: number, bars: number): ScheduledClick[] {
    if (this.timerId === null) return [];
    const n = Math.max(0, Math.min(8, Math.floor(Number.isFinite(bars) ? bars : 0)));
    const from = Math.floor(bar) - n;
    if (n === 0 || from < 0) return [];
    const grid = retempoGrid(this.grid, this.stepIndex, this.state.bpm);   // the tempo the next steps will be placed at
    const at = gridStepTime(grid, from * this.state.steps, 0, 0);
    const now = this.ctx.currentTime;
    const clicks = countInClicks(at, n, grid.bpm).filter((c) => c.at > now);
    for (const c of clicks) this.playClick(c.kind, c.at);
    return clicks;
  }
  private begin(countBars: number): { startAt: number; clicks: ScheduledClick[] } {
    if (this.timerId !== null) return { startAt: this.startedAt, clicks: [] };
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.currentStep = 0; this.bar = 0; this.stepIndex = 0;
    this.onBar?.(0);   // M2: bar 0's patterns (and tempo) are swapped in before the grid is anchored
    const t0 = this.ctx.currentTime + START_LEAD_S;
    const clicks = countInClicks(t0, countBars, this.state.bpm);
    this.startedAt = t0 + countBars * barSec(this.state.bpm, this.state.steps);
    this.grid = { originSec: this.startedAt, originIndex: 0, bpm: this.state.bpm };
    for (const c of clicks) this.playClick(c.kind, c.at);
    this.fireTakes(0, this.startedAt);
    this.timerId = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    return { startAt: this.startedAt, clicks };
  }
  /** MUSIC-SUITE P4: stops the transport, and at once every take, every click, and every hit scheduled but not yet begun. */
  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledSteps = [];
    const now = this.ctx.currentTime;
    for (const l of this.live) {
      if (l.kind === 'hit' && l.at <= now) continue;   // a hit already sounding rings out, as a drum does
      try { l.src.stop(now); } catch { /* already stopped */ }
    }
    this.live = [];
  }

  private track(src: AudioScheduledSourceNode | null, at: number, dur: number, kind: 'hit' | 'take' | 'click'): void {
    if (!src) return;
    this.live.push({ src, at, end: at + dur, kind });
  }
  /** A take's pass: its source, gain, bar line and cut point (setTakes glides / restarts it from these). */
  private trackTake(p: { src: AudioBufferSourceNode; gain: GainNode; at: number; end: number }, take: EngineTake, barTime: number, until: number | null): void {
    this.live.push({ src: p.src, at: p.at, end: p.end, kind: 'take', takeId: take.id, buffer: take.buffer, gain: p.gain, barTime, until });
  }
  private playClick(kind: ClickKind, at: number): void {
    const src = this.ctx.createBufferSource();
    const buf = clickBuffer(this.ctx, kind);
    src.buffer = buf;
    src.connect(this.graph.click);
    src.start(at);
    this.track(src, at, buf.duration, 'click');
  }
  /** Start every take whose pass begins on song bar `bar` (at `time`); a pass is cut where its next one begins. */
  private fireTakes(bar: number, time: number): void {
    const now = this.ctx.currentTime;
    for (const t of this.takes) {
      if (t.muted || !takeStartsAt(t, bar, this.songBars)) continue;
      const p = takePeriod(t, this.songBars);
      const until = p === null ? null : time + p * barSec(this.state.bpm, this.state.steps);
      const played = playTake(this.ctx, this.graph, t, time, until, now);
      if (played) this.trackTake(played, t, time, until);
    }
  }

  private scheduler(): void {
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
    for (let t = this.nextStepTime(); t < horizon; t = this.nextStepTime()) {
      this.scheduleStep(this.currentStep, t);
      this.advance();
    }
    this.drainPlayhead();
    const now = this.ctx.currentTime;
    if (this.live.length > 64) this.live = this.live.filter((l) => l.end > now);
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
    if (this.currentStep === 0) { this.bar++; this.onBar?.(this.bar); this.fireTakes(this.bar, this.nextStepTime()); }
  }
  /** Does the pattern the scheduler reads have any hit that would sound? (An empty grid offers PERFORM nothing.) */
  private gridLive(): boolean {
    return this.state.tracks.some((t) => this.hears(t) && this.samples.has(t.sampleId) && t.pattern.some(Boolean));
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
      if (!this.hears(track) || !track.pattern[step]) continue;
      const sample = this.samples.get(track.sampleId);
      if (!sample) continue;
      const voice = voiceFor(sample, track, step, this.notes);
      this.track(playHit(this.ctx, this.graph, voice, track, step, time), time, voice.buffer.duration / voice.rate, 'hit');
      hits++;
    }
    // MUSIC-SUITE P4: the metronome, on the song's own quarter notes (never swung: they are even steps)
    if (this.metronome) { const k = metronomeClick(step, this.state.steps); if (k) this.playClick(k, time); }
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
   * mix's own bus. MUSIC-SUITE P4: through the same desk (buildMixGraph) as the mix: the row's strip, its sends, MASTER
   * and the limiter — so the stems still sum to the mix wherever the limiter is not pulling (it acts above −1.5 dBFS).
   */
  async renderStems(bars = 2): Promise<Blob[]> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.0;
    const blobs: Blob[] = [];
    for (const track of this.state.tracks) {
      const sample = this.samples.get(track.sampleId);
      if (!sample || !this.hears(track)) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(this.renderRate * totalDur), this.renderRate);
      const graph = this.offlineGraph(offline);
      for (let bar = 0; bar < bars; bar++) this.placeBar(offline, graph, [track], bar, this.state.swing);
      blobs.push(encodeWav(await offline.startRendering()));
    }
    return blobs;
  }

  /** Offline-render the FULL MIX (all unmuted tracks, swing, pan, and the
   *  polish chain if enabled) — what the library saves and replays.
   *  MUSIC-SUITE P3: `tracks` renders that list instead of the one playing (publish renders the working grid while song
   *  mode plays a section); either way only the selected rows sound. MUSIC-SUITE P3 FIX PASS: `swing` places them (the
   *  project's, from PUBLISH — the playing state's is a section's in song mode). */
  async renderMixdown(bars = 2, tracks: TrackState[] = this.state.tracks, swing: number = this.state.swing, sounds?: RenderSounds): Promise<Blob> {
    return encodeWav(await this.renderMixBuffer(bars, tracks, swing, sounds));
  }
  /**
   * MUSIC-SUITE P4: renderMixdown's audio before it is encoded (the peak probe reads it; nothing is clipped by a WAV).
   * MUSIC-SUITE P5 FIX PASS (2026-09-25): `sounds` — what these rows play in this render, by id (null = silent), over the
   * engine's loaded sounds. PUBLISH passes the WORKING grid's Flip chops: song mode swaps a section's own chops into the
   * engine under the same ids (StudioMode swapSectionChops), and the mixdown played those while the record named the grid's.
   */
  async renderMixBuffer(bars = 2, tracks: TrackState[] = this.state.tracks, swing: number = this.state.swing, sounds?: RenderSounds): Promise<AudioBuffer> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.2;
    const offline = new OfflineAudioContext(2, Math.ceil(this.renderRate * totalDur), this.renderRate);
    const graph = this.offlineGraph(offline);
    for (let bar = 0; bar < bars; bar++) this.placeBar(offline, graph, tracks, bar, swing, sounds);
    return offline.startRendering();
  }

  /** MUSIC-SUITE P4: an offline render's desk — THE builder, with this engine's mixer and MASTER (the live graph's). */
  private offlineGraph(offline: OfflineAudioContext): MixGraph {
    return buildMixGraph(offline, { mixer: this.mixer, polish: this.polished });
  }
  /**
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): every offline render runs at the LIVE context's rate. They were fixed at 44 100 Hz
   * while the room runs at the device's rate (48 000 in the booth proof, outbox p4/booth/booth-proof.json lastTake), and
   * the room's seeded impulse is one value per sample with a per-sample one-pole filter (mixGraph roomImpulse) — so the
   * live room and the rendered room were two different impulses on a 48 kHz device (and a 48 kHz take was resampled into
   * the render). One rate: the same room, sample for sample, and no resampling of a take.
   */
  get renderRate(): number {
    const r = this.ctx.sampleRate;
    return Number.isFinite(r) && r >= 8000 && r <= 192000 ? r : 44100;
  }

  /**
   * M2/M4: render a SONG — per-bar track patterns (from Song.expandChain) plus one-shot takes — to one WAV.
   * MUSIC-SUITE P2: `barSwing[b]` is bar b's swing (a section keeps its own); absent = the engine's swing.
   * MUSIC-SUITE P4: one pass of the song — each take once, on its bar, trimmed, through the takes strip.
   */
  async renderSong(bars: TrackState[][], oneShots: SongShot[], lengthSec: number, barSwing?: number[], barSounds?: readonly (RenderSounds | null | undefined)[]): Promise<Blob> {
    const offline = new OfflineAudioContext(2, Math.ceil(this.renderRate * Math.max(1, lengthSec)), this.renderRate);
    const graph = this.offlineGraph(offline);
    bars.forEach((tracks, bar) => this.placeBar(offline, graph, tracks, bar, barSwing?.[bar] ?? this.state.swing, barSounds?.[bar] ?? undefined));
    oneShots.forEach((o, i) => this.placeOneShot(offline, graph, o, i));
    return encodeWav(await offline.startRendering());
  }

  /**
   * M4: one WAV per track over the whole song, plus each take as its own stem — each through the song's desk.
   * MUSIC-SUITE P5 FIX PASS (2026-09-25): `barSounds[b]` = what bar b's rows play (a section's own Flip chops — studioEdit
   * songBarSounds), over the engine's loaded sounds: both renders took every bar from whatever section song mode swapped
   * into the engine last, while live song mode plays each section's own.
   */
  async renderSongStems(bars: TrackState[][], oneShots: SongShot[], lengthSec: number, barSwing?: number[], barSounds?: readonly (RenderSounds | null | undefined)[]): Promise<{ name: string; blob: Blob }[]> {
    const ids = [...new Set(bars.flatMap((b) => b.filter((t) => this.hears(t)).map((t) => t.sampleId)))];
    const out: { name: string; blob: Blob }[] = [];
    for (const id of ids) {
      const sample = this.samples.get(id);
      const anyBar = barSounds?.some((m) => !!m?.get(id)) ?? false;
      if (!sample && !anyBar) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(this.renderRate * Math.max(1, lengthSec)), this.renderRate);
      const graph = this.offlineGraph(offline);
      bars.forEach((tracks, bar) => this.placeBar(offline, graph, tracks.filter((t) => t.sampleId === id), bar, barSwing?.[bar] ?? this.state.swing, barSounds?.[bar] ?? undefined));
      out.push({ name: sample?.name ?? id, blob: encodeWav(await offline.startRendering()) });
    }
    // MUSIC-SUITE P4 FIX PASS: a take stem crosses the TAKES strip, so with the takes muted or soloed out it would be a file
    // of silence ('take N' written empty) — it is left out, as a muted row's stem is (hears())
    const takesHeard = gateOpen(this.mixer, TAKES_CHANNEL);
    for (let i = 0; i < oneShots.length; i++) {
      const o = oneShots[i];
      if (o.muted || !takesHeard) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(this.renderRate * Math.max(1, lengthSec)), this.renderRate);
      this.placeOneShot(offline, this.offlineGraph(offline), o, i);
      out.push({ name: `take ${o.id ?? i + 1}`, blob: encodeWav(await offline.startRendering()) });
    }
    return out;
  }

  /** A take starts on its bar line (step 0 of `atBar`, which swing never moves). */
  private placeOneShot(offline: OfflineAudioContext, graph: MixGraph, o: SongShot, i: number): void {
    const take = takeFromShot(o, i);
    if (take.muted) return;
    playTake(offline, graph, take, songStepTime(o.atBar, 0, this.state.steps, this.state.bpm, 0), null);   // trims gate it, as live
  }

  private placeBar(offline: OfflineAudioContext, graph: MixGraph, tracks: TrackState[], bar: number, swing: number, sounds?: RenderSounds): void {
    for (const track of tracks) {
      // MUSIC-SUITE P5 FIX PASS: a sound given for this render wins (null = silent here); its note renders are not this
      // sound's, so a given buffer plays at a rate like any row without one
      const given = sounds?.has(track.sampleId) ? sounds.get(track.sampleId) ?? null : undefined;
      if (given === null) continue;
      const sample = given ? { id: track.sampleId, buffer: given } : this.samples.get(track.sampleId);
      if (!sample || !this.hears(track)) continue;
      for (let step = 0; step < this.state.steps; step++) {
        if (!track.pattern[step]) continue;
        const at = songStepTime(bar, step, this.state.steps, this.state.bpm, swing);   // the live loop's time, exactly
        playHit(offline, graph, voiceFor(sample, track, step, given ? undefined : this.notes), track, step, at);
      }
    }
  }

  // MUSIC-SUITE P4: closing the context frees the desk with it (lib/audio/session.test.ts pins this line)
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
