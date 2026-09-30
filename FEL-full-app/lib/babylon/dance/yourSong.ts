// yourSong — MUSIC-SUITE P7 ("your beat", 2026-09-29): the Cypher dances to the song YOU wrote, with FEL's band
// filling only the parts your song doesn't have (owner decision #7).
//
// WHAT WAS WRONG. Every dance track — the three shipped ones AND a player's own exported song — played through
// audio/StemBand.ts: a from-scratch E-minor funk band with seven instruments keyed to DANCE MOVE FAMILIES (bounce,
// footwork, wave, toprock, freeze, power, transition), synthesized live, with no connection to the song the player
// actually composed in the Academy. Export a trap beat or a house loop and the Cypher still played the same funk
// riff — the chart (DanceExport.ts) came from your song, the BAND never did.
//
// WHAT THIS IS. Two halves:
//   1. THE FILL RULE (pure, deterministic — no PRNG, so the exact same song fills the exact same way every time):
//      which of the six SONG PARTS (kick / snare / hats / perc / bass / lead) your song actually plays
//      (partsPresent), and for each one it doesn't, a simple, named, house-leaning pattern FEL adds instead: a
//      kick fills four-on-the-floor; a snare/clap fills the 2-and-4 backbeat; hats fill straight 8ths; perc fills a
//      light off-beat accent; a missing BASS follows your song's own kick (real or FEL's) at the song's root note
//      (scales.defaultRowNote); a missing LEAD pads that same root on the first beat of every bar — "chord roots"
//      without inventing a chord progression nobody wrote. `flip` (your own Flip chops) and `takes` (your own
//      voice) are never filled — FEL can stand in for a drum or a bassline, never for a sound only you made.
//   2. THE OFFLINE RENDER (renderYourSongParts) places every part — yours and FEL's alike — through
//      mixGraph.buildMixGraph, the exact desk the Academy renders every stem with (P4 engine contract), one
//      OfflineAudioContext per part, so a part's stem is byte-for-byte what that row would sound like published.
//      Drums and the pitched rows (bass/lead) come from SynthKit — synthesized fresh from the export's own `kit` id,
//      never carried as bytes. `takes` are resolved by REFERENCE (StudioLibrary.readDeviceAudio, the same shared
//      'fel-studio' audio table the booth already writes to) and placed with the exact loop/trim rules the Academy
//      already tested (takeCapture.engineTakeList) — a send-to-the-dance-floor never copies the booth's bytes.
//   3. THE LIVE BAND (YourSongBand) plays those rendered stems as the instruments the dancer earns: FEL's filled
//      parts play from the first beat (they are the floor under a routine, not an achievement); each of YOUR OWN
//      parts joins the mix the way P6's PERFORM band already does (performSet.PerformBand: the first clean hit
//      brings the first one in, JOIN_STREAK more brings in the next, DROP_STREAK misses in a row drops the newest)
//      — generalized here from PERFORM's four fixed lanes to however many real parts a song actually has, since a
//      dance routine has no "lane" a hit belongs to the way a PERFORM note does.
//
// `flip` is not rendered here (the eighth stem the contract names): a Flip row's own chop lives behind an audio
// reference this export does not carry (ProjectFlipRow.source, StudioProject.ts) — out of this pass's scope by the
// CONTRACT's own field list (item 1 names pattern/chain/sections/kit/tempo/swing/notes/takes, not a chop source).
// Flip hits still shape the dance CHART (DanceExport.grooveOf already treats them as ornament); they simply are not
// yet one of the audible band's real instruments. See this file's own header comment at the bottom for the exact
// follow-up.
//
// DEVICE-PRIVATE SONGS NEVER REACH HERE. A song that plays an uploaded source is refused at the SEND TO THE DANCE
// FLOOR button (DanceExport.danceFloorOpenFor, StudioMode.tsx) before an export is ever written — this module never
// has to ask "whose audio is this" because uploads cannot arrive in `song.bars` in the first place.
//
// Pure logic (partOf, partsPresent, applyFill) needs no audio at all and is fully unit-tested; the render and the
// live band need Web Audio (real, or lib/babylon/music/fakeWebAudio.ts's schedule-only stand-in for node).

import type { TrackState } from '../music/AudioEngine';
import { barSec, stepVelocity, takePeriod, takeSpan, takeStartsAt, voiceFor, type EngineTake } from '../music/AudioEngine';
import { buildMixGraph, TAKES_CHANNEL, type MixGraph } from '../music/mixGraph';
import { songStepTime } from '../music/stepTime';
import { synthesizeKit } from '../music/SynthKit';
import { defaultRowNote, type SongKey } from '../music/scales';
import { pickedTakeIds } from '../music/takeCapture';
import type { ExportedTake, YourSongExport } from '../music/DanceExport';

// ── the eight instrument parts (SIX of them can be FEL-filled; flip is out of scope, see header; takes never is) ──────

export type SongPartId = 'kick' | 'snare' | 'hats' | 'perc' | 'bass' | 'lead' | 'takes';

/** The kit slot id a part's audio comes from — SynthKit.KIT_SLOTS' own ids. `takes` has none (it is not a kit voice). */
const PART_SAMPLE: Readonly<Record<Exclude<SongPartId, 'takes'>, string>> = {
  kick: 'kick', snare: 'snare', hats: 'hat', perc: 'clap', bass: 'bass', lead: 'lead',
};
/** The six parts the fill rule can add (in the order FEL considers, and the order YourSongBand plays them foundation-
 *  first when every one of them happens to be FEL's). `takes` is appended separately — it is never fillable. */
export const FILLABLE_PARTS: readonly Exclude<SongPartId, 'takes'>[] = ['kick', 'snare', 'hats', 'perc', 'bass', 'lead'];
/** Every part in play order: the six kit parts, then takes (if the song has any). */
export const PART_ORDER: readonly SongPartId[] = [...FILLABLE_PARTS, 'takes'];

/** Which part a grid row IS, or null (a Flip row, or anything this pass does not turn into an instrument). */
export function partOf(sampleId: string): SongPartId | null {
  if (sampleId === 'kick') return 'kick';
  if (sampleId === 'snare') return 'snare';
  if (sampleId === 'hat' || sampleId === 'open') return 'hats';
  if (sampleId === 'clap') return 'perc';
  if (sampleId === 'bass') return 'bass';
  if (sampleId === 'lead') return 'lead';
  return null;
}

/** Does this row actually sound (the same test grooveOf applies: not muted, not silenced by its own fader)? */
const audible = (t: Pick<TrackState, 'muted' | 'volume' | 'pattern'>): boolean =>
  !t.muted && t.volume > 0 && t.pattern.some(Boolean);

/** Which of the six fillable parts your song's own rows actually play, anywhere across the bars. */
export function partsPresent(bars: readonly TrackState[][]): ReadonlySet<SongPartId> {
  const present = new Set<SongPartId>();
  for (const bar of bars) {
    for (const t of bar) {
      const part = partOf(t.sampleId);
      if (part && !present.has(part) && audible(t)) present.add(part);
    }
  }
  return present;
}

/** The parts FEL has to fill: the fillable ones your song never plays. */
export function missingParts(present: ReadonlySet<SongPartId>): Exclude<SongPartId, 'takes'>[] {
  return FILLABLE_PARTS.filter((p) => !present.has(p));
}

// ── THE FILL RULE (deterministic: a step index test, never a die roll) ─────────────────────────────────────────────

/** FEL's kick when yours is missing: a straight four-on-the-floor (a hit on every quarter). */
function fourOnFloor(steps: number): boolean[] {
  const q = steps / 4;
  return Array.from({ length: steps }, (_, i) => i % q === 0);
}
/** The bar's own kick pattern (yours, or already-filled), for the bass to follow — fourOnFloor if neither exists. */
function kickPatternOf(barTracks: readonly TrackState[], steps: number): readonly boolean[] {
  const row = barTracks.find((t) => partOf(t.sampleId) === 'kick' && audible(t));
  return row?.pattern ?? fourOnFloor(steps);
}
/** A silent row of `steps` falses — the frame every fill pattern starts from. */
const blank = (steps: number): boolean[] => Array.from({ length: steps }, () => false);

/** FEL's fill volume — audible, but never louder than a player's own default row (StudioProject.emptyKitTracks: 0.8). */
export const FEL_FILL_VOLUME = 0.72;

/**
 * One bar's worth of a filled part, named: `kick` FOUR ON THE FLOOR; `snare`/`perc` the house backbeat (2-and-4) and
 * its off-beat answer; `hats` straight 8ths; `bass` FOLLOWS YOUR KICK (this bar's own, real or already-filled) at the
 * song's root, in the bass register; `lead` PADS THE ROOT on the first beat of every bar — a chord without a chord
 * progression nobody wrote. Bass/lead's note is scales.defaultRowNote(key, row), exactly what an empty project's own
 * bass/lead row already opens on (StudioProject.emptyKitTracks) — a filled row sounds like a row the player simply
 * never touched, not like a guess.
 */
function fillRow(part: Exclude<SongPartId, 'takes'>, opts: { steps: number; key: SongKey; kickPattern: readonly boolean[] }): TrackState {
  const { steps, key, kickPattern } = opts;
  const base: TrackState = { sampleId: PART_SAMPLE[part], pattern: blank(steps), volume: FEL_FILL_VOLUME, muted: false, pan: 0 };
  const q = Math.max(1, Math.round(steps / 4));
  const e = Math.max(1, Math.round(steps / 8));
  switch (part) {
    case 'kick':
      return { ...base, pattern: fourOnFloor(steps) };
    case 'snare':
      return { ...base, pattern: base.pattern.map((_, i) => i % q === 0 && (Math.floor(i / q) === 1 || Math.floor(i / q) === 3)) };
    case 'hats':
      return { ...base, pattern: base.pattern.map((_, i) => i % e === 0), volume: FEL_FILL_VOLUME * 0.6 };
    case 'perc':
      return { ...base, pattern: base.pattern.map((_, i) => i % q === Math.round(q * 0.75) && (Math.floor(i / q) === 1 || Math.floor(i / q) === 3)), volume: FEL_FILL_VOLUME * 0.55 };
    case 'bass': {
      const note = defaultRowNote(key, 'bass');
      return { ...base, pattern: [...kickPattern], notes: base.pattern.map(() => note) };
    }
    case 'lead': {
      const note = defaultRowNote(key, 'lead');
      return { ...base, pattern: base.pattern.map((_, i) => i === 0), notes: base.pattern.map(() => note), volume: FEL_FILL_VOLUME * 0.8 };
    }
    default:
      return base;
  }
}

/** `bars` with a FEL row appended for every fillable part your song never plays, and which parts those were. */
export function applyFill(
  bars: readonly TrackState[][], steps: number, key: SongKey,
): { bars: TrackState[][]; filled: ReadonlySet<SongPartId> } {
  const present = partsPresent(bars);
  const missing = missingParts(present);
  if (!missing.length) return { bars: bars.map((b) => [...b]), filled: new Set() };
  const out = bars.map((barTracks) => {
    const kickPattern = kickPatternOf(barTracks, steps);
    const extra = missing.map((part) => fillRow(part, { steps, key, kickPattern }));
    return [...barTracks, ...extra];
  });
  return { bars: out, filled: new Set(missing) };
}

// ── THE OFFLINE RENDER ──────────────────────────────────────────────────────────────────────────────────────────────

export interface PartStem {
  part: SongPartId;
  buffer: AudioBuffer;
  /** True when this part is FEL's fill (item 2's "labelled FEL on the chips"), false when it is your own row. */
  fel: boolean;
}

export interface YourSongRenderDeps {
  /** A take's raw bytes by its device-store key (StudioLibrary.readDeviceAudio) — null when they are gone. */
  readTake: (key: string) => Promise<Blob | null>;
  /** Decode a take's bytes (the room's own AudioContext.decodeAudioData — never a fresh context per take). */
  decode: (data: ArrayBuffer) => Promise<AudioBuffer>;
  /** The render's sample rate — AudioEngine.renderRate's rule: follow the room's live context, not a fixed 44.1 kHz. */
  sampleRate: number;
}

/** A grid hit into an offline render, through the row's OWN channel strip — mirrors AudioEngine.ts's playHit exactly
 *  (P4 engine contract: source → hit gain (volume × velocity) → the row's strip); not exported there, so reimplemented
 *  here rather than reaching into a file this pass does not own. */
function placeHit(ctx: BaseAudioContext, graph: MixGraph, buffer: AudioBuffer, track: TrackState, step: number, at: number): void {
  const voice = voiceFor({ id: track.sampleId, buffer }, track, step);
  const src = ctx.createBufferSource();
  src.buffer = voice.buffer;
  if (voice.rate !== 1) src.playbackRate.value = voice.rate;
  const gain = ctx.createGain();
  gain.gain.value = track.volume * stepVelocity(track, step);
  src.connect(gain).connect(graph.channel(track.sampleId).input);
  src.start(Math.max(0, at));
}

/** A take's one pass from its bar line — mirrors AudioEngine.ts's playTake (not exported there either). */
function placeTakePass(ctx: BaseAudioContext, graph: MixGraph, take: EngineTake, barTimeSec: number, untilSec: number | null): void {
  const pass = takeSpan(take, barTimeSec);
  if (!pass) return;
  let { when, offset, duration } = pass;
  if (untilSec !== null) duration = Math.min(duration, untilSec - when);
  if (!(duration > 0.001)) return;
  const src = ctx.createBufferSource();
  src.buffer = take.buffer;
  const g = ctx.createGain();
  g.gain.value = take.gain;
  src.connect(g).connect(graph.channel(TAKES_CHANNEL).input);
  src.start(Math.max(0, when), offset, duration);
}

/** Every take pass across the whole song (one play-through, bar 0 to the last bar) — the loop/trim rule
 *  AudioEngine.ts's live scheduler already follows (takePeriod / takeStartsAt / takeSpan), just for a fixed span
 *  instead of forever. */
function placeTakes(ctx: BaseAudioContext, graph: MixGraph, takes: readonly EngineTake[], totalBars: number, bpm: number, steps: number): void {
  const barTime = (bar: number): number => songStepTime(bar, 0, steps, bpm, 0);   // step 0's time: swing never moves a bar line
  for (const take of takes) {
    if (take.muted) continue;
    const period = takePeriod(take, totalBars);
    for (let bar = 0; bar < totalBars; bar++) {
      if (!takeStartsAt(take, bar, totalBars)) continue;
      const nextBar = period === null ? null : bar + period;
      const until = nextBar !== null && nextBar < totalBars ? barTime(nextBar) : null;
      placeTakePass(ctx, graph, take, barTime(bar), until);
    }
  }
}

/** `song.takes` resolved into playable EngineTakes: fetched by reference, decoded, and filtered by the Academy's own
 *  picked/trim/loop rules (takeCapture.engineTakeList) — a take whose bytes are gone (recorded on another device, or
 *  swept) is left out rather than failing the whole render. */
async function resolveTakes(takes: readonly ExportedTake[], deps: YourSongRenderDeps): Promise<EngineTake[]> {
  if (!takes.length) return [];
  const picked = pickedTakeIds(takes);
  const out: EngineTake[] = [];
  for (const t of takes) {
    if (t.muted || !picked.has(t.id)) continue;
    const blob = await deps.readTake(t.audioKey).catch(() => null);
    if (!blob) continue;
    let buffer: AudioBuffer;
    try { buffer = await deps.decode(await blob.arrayBuffer()); } catch { continue; }
    const trimStart = Math.max(0, t.trimStart);
    const end = Math.min(buffer.duration - Math.max(0, t.trimEnd), buffer.duration);
    if (!(end - trimStart > 0.001)) continue;
    out.push({ id: t.id, buffer, startBar: t.atBar, loopBars: t.loopBars, gain: t.gain, trimStart, trimEnd: end, muted: false });
  }
  return out;
}

/** How long the render needs to run: the whole song plus a short tail for release envelopes (AudioEngine's own
 *  renderMixBuffer margin — 1.0 s here; nothing this pass renders holds a note anywhere near that long). */
function renderDurationSec(totalBars: number, bpm: number, steps: number): number {
  return barSec(bpm, steps) * Math.max(1, totalBars) + 1.0;
}

/**
 * THE RENDER. One OfflineAudioContext per part (kick, snare, hats, perc, bass, lead — always all six, since the fill
 * rule guarantees every one of them has SOMETHING to play — and takes, only if the song has any that survive
 * resolveTakes), each built on mixGraph.buildMixGraph (the same desk every Academy render uses). `flip` is not
 * rendered (see this file's header). Returns one stem per part that actually sounds, and which of them are FEL's.
 */
export async function renderYourSongParts(
  song: YourSongExport, deps: YourSongRenderDeps,
): Promise<{ stems: PartStem[]; filled: ReadonlySet<SongPartId> }> {
  const { bars, filled } = applyFill(song.bars, song.steps, song.key);
  const totalDur = renderDurationSec(bars.length, song.bpm, song.steps);
  const kit = await synthesizeKit(song.kit);
  const stems: PartStem[] = [];

  for (const part of FILLABLE_PARTS) {
    const sampleId = PART_SAMPLE[part];
    const rows = bars.map((bt) => bt.filter((t) => partOf(t.sampleId) === part && audible(t)));
    if (!rows.some((r) => r.length)) continue;   // nothing to render (should not happen post-fill; kept honest)
    const buffer = kit.get(sampleId);
    if (!buffer) continue;
    const offline = new OfflineAudioContext(2, Math.ceil(deps.sampleRate * totalDur), deps.sampleRate);
    const graph = buildMixGraph(offline, {});
    rows.forEach((rowTracks, bar) => {
      for (const t of rowTracks) {
        for (let step = 0; step < song.steps; step++) {
          if (!t.pattern[step]) continue;
          placeHit(offline, graph, buffer, t, step, songStepTime(bar, step, song.steps, song.bpm, song.swing));
        }
      }
    });
    stems.push({ part, buffer: await offline.startRendering(), fel: filled.has(part) });
  }

  const takes = await resolveTakes(song.takes, deps);
  if (takes.length) {
    const offline = new OfflineAudioContext(2, Math.ceil(deps.sampleRate * totalDur), deps.sampleRate);
    const graph = buildMixGraph(offline, {});
    placeTakes(offline, graph, takes, bars.length, song.bpm, song.steps);
    stems.push({ part: 'takes', buffer: await offline.startRendering(), fel: false });
  }

  return { stems, filled };
}

// ── THE LIVE BAND ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A part joins after this many clean hits in a row (matches PERFORM's own cadence, performSet.PERFORM_BAND_JOIN — one
 *  bar of steady dancing). */
export const YOUR_SONG_JOIN_STREAK = 4;
/** This many misses in a row drops the newest joined part (performSet.PERFORM_BAND_DROP). */
export const YOUR_SONG_DROP_STREAK = 3;
/** The live desk's own glide constant (mixGraph.RAMP_TC) — a part fading in or out never clicks. */
const GAIN_GLIDE_TC = 0.05;

/**
 * MUSIC-SUITE P7 FIX (2026-09-29): "YourSongBand has the identical no-fade stop/restart click bug" (review
 * finding, confirmed — the exact same shape as SongStemBand.ts's own fix, see its CLICK_FADE_SEC comment).
 * cancelFrom used to call `node.src.stop(audioSec)` on each part's one long rendered-song buffer with no gain
 * fade first, truncating it mid-waveform; scheduleFrom then started a fresh source at whatever gain the node's
 * continuous per-frame glide (update()'s own setTargetAtTime toward `target()`) had last settled on — which,
 * across a pause, is still wherever it was BEFORE the pause (update() stops being called at all while
 * clock.paused, DanceMode.ts:744), so a joined/FEL part's fresh source began playing at full gain from its very
 * first sample. Now cancelFrom ramps to 0 before stopping (the stop lands at the end of the fade), and
 * scheduleFrom zeroes a fresh source's gain at the exact moment it starts — update()'s own existing glide (every
 * frame, toward target()) then carries it back up, so nothing here needed a second fade-in mechanism.
 */
export const CLICK_FADE_SEC = 0.015;

interface PartNode { gain: GainNode; buffer: AudioBuffer; fel: boolean; src: AudioBufferSourceNode | null }

/**
 * The instruments the dancer earns, playing YOUR song's own rendered stems (never a synthesized stand-in). FEL's
 * filled parts play from the very first beat — they are the floor a routine stands on, not something the dancer's
 * dancing earns. Each of your own parts joins the way PERFORM's band already does (performSet.PerformBand), just
 * generalized from four fixed lanes to however many real parts this song has, because a dance step has no "lane" —
 * every judged hit, whichever move it was, counts toward the next part joining.
 *
 * Built with a PROMISE, not a ready buffer list: the render can take a beat, and beginCountIn (DanceMode.ts) must be
 * able to construct this synchronously the moment a track locks in. Nothing plays until the render resolves; `start`
 * / `rewind` before then just remember where to pick up, and the very next `update()` catches the band up once it is
 * ready — usually the same frame, since an 8–32 bar render finishes well inside a one-bar count-in.
 */
export class YourSongBand {
  private nodes = new Map<SongPartId, PartNode>();
  private order: SongPartId[] = [];
  private ready = false;
  private disposed = false;
  private joined: SongPartId[] = [];
  private hitStreak = 0;
  private missStreak = 0;
  private beat0SongSec: number | null = null;
  private pendingSongSec: number | null = null;
  private toAudio: (songSec: number) => number = (s) => s;
  /** Every join / drop so far — a probe or the recap can read it, same idea as PerformBand.log. */
  readonly log: { kind: 'join' | 'drop'; part: SongPartId }[] = [];
  /** Parity with StemBand's dev-probe field: always 0 — a whole-song buffer has one scheduled start, never a 16th
   *  that can arrive too late to play. */
  readonly skipped = 0;

  constructor(private ctx: BaseAudioContext, out: AudioNode, stemsPromise: Promise<{ stems: readonly PartStem[]; filled: ReadonlySet<SongPartId> }>) {
    stemsPromise.then((res) => {
      if (this.disposed) return;
      this.order = PART_ORDER.filter((p) => res.stems.some((s) => s.part === p));
      for (const s of res.stems) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(out);
        this.nodes.set(s.part, { gain, buffer: s.buffer, fel: s.fel, src: null });
      }
      this.ready = true;
    }).catch(() => { /* the render failed: the routine still plays, just with no band — better than a crash */ });
  }

  setClock(toAudio: (songSec: number) => number): void { this.toAudio = toAudio; }

  isFel(part: SongPartId): boolean { return this.nodes.get(part)?.fel ?? false; }
  /** A plain instrument name for the join/drop banner and the chip row's label (InstrumentChips.ts's own fallback,
   *  id.toUpperCase(), is exactly this — kept as a method so a caller never has to know that). */
  name(part: SongPartId): string { return part.toUpperCase(); }
  /** Every part this song has a stem for, in play order — the chip row's `order`. */
  parts(): readonly SongPartId[] { return this.order; }

  /** Is this part sounding right now? FEL's are always in; yours are in once joined. */
  has(part: SongPartId): boolean { return this.isFel(part) || this.joined.includes(part); }
  private target(part: SongPartId): number { return this.has(part) ? 1 : 0; }
  /** 0/1 — for InstrumentChips.buildInstrumentChips' `levels` (it only tests level > 0). */
  level(part: SongPartId): number { return this.has(part) ? 1 : 0; }

  private earnable(): SongPartId[] { return this.order.filter((p) => !this.isFel(p)); }

  start(atSongSec: number): void { this.beat0SongSec = atSongSec; this.pendingSongSec = atSongSec; }
  rewind(songSec: number): void { this.pendingSongSec = songSec; }

  private scheduleFrom(targetSongSec: number): void {
    if (this.beat0SongSec === null) return;
    const offset = Math.max(0, targetSongSec - this.beat0SongSec);
    const when = Math.max(this.ctx.currentTime, this.toAudio(targetSongSec));
    for (const n of this.nodes.values()) {
      try { n.src?.stop(); } catch { /* never started, or already stopped */ }
      n.src = null;
      if (offset >= n.buffer.duration) continue;   // this pass has nothing left to play from here
      const src = this.ctx.createBufferSource();
      src.buffer = n.buffer;
      src.connect(n.gain);
      src.start(when, offset);
      n.src = src;
      // MUSIC-SUITE P7 FIX (2026-09-29, CLICK_FADE_SEC's own comment): zero the gain at the exact moment this
      // fresh source starts — whatever it was holding from before (a pause never touches it) would otherwise
      // play the buffer's very first sample at full gain, a click. update()'s own per-frame glide toward
      // target() (below) picks it back up from here; nothing else needs to ramp it.
      n.gain.gain.cancelScheduledValues(when);
      n.gain.gain.setValueAtTime(0, when);
    }
  }

  /** Drive every frame (like StemBand.update): (re)schedules once the render is ready, then glides every part's gain
   *  toward its current target — no per-16th lookahead, because a whole-song buffer has nothing left to schedule
   *  once it is playing. */
  update(_nowSec: number): void {
    if (this.ready && this.pendingSongSec !== null) {
      this.scheduleFrom(this.pendingSongSec);
      this.pendingSongSec = null;
    }
    const now = this.ctx.currentTime;
    for (const [part, n] of this.nodes) n.gain.gain.setTargetAtTime(this.target(part), now, GAIN_GLIDE_TC);
  }

  /** Take back what is sounding right now (a PAUSE) — a whole-song buffer cannot "ring out" a future queue the way
   *  StemBand's 16ths can, so this stops it outright; `rewind` + the next `update()` picks it back up.
   *  MUSIC-SUITE P7 FIX (2026-09-29, CLICK_FADE_SEC's own comment): fades the gain to 0 first and stops the
   *  source only once the fade has finished, so a pause never truncates the buffer mid-waveform. */
  cancelFrom(audioSec: number): number {
    let n = 0;
    const at = Math.max(this.ctx.currentTime, audioSec);
    for (const node of this.nodes.values()) {
      if (!node.src) continue;
      try {
        node.gain.gain.cancelScheduledValues(at);
        node.gain.gain.setValueAtTime(node.gain.gain.value, at);
        node.gain.gain.linearRampToValueAtTime(0, at + CLICK_FADE_SEC);
        node.src.stop(at + CLICK_FADE_SEC);
        n++;
      } catch { /* already stopped */ }
    }
    return n;
  }

  /** A clean hit (any move at all — dance steps have no per-instrument lane). The first one brings the first of your
   *  parts in at once; every YOUR_SONG_JOIN_STREAK after that brings in the next. Returns the part that just joined. */
  hit(): SongPartId | null {
    this.missStreak = 0;
    this.hitStreak++;
    const next = this.earnable().find((p) => !this.joined.includes(p));
    if (!next) return null;                                    // every part you can earn is already in
    const first = this.joined.length === 0;
    if (first || this.hitStreak >= YOUR_SONG_JOIN_STREAK) {
      this.hitStreak = 0;
      this.joined.push(next);
      this.log.push({ kind: 'join', part: next });
      return next;
    }
    return null;
  }

  /** A miss. YOUR_SONG_DROP_STREAK in a row drops the newest joined part (last in, first out). Returns it, if one was. */
  miss(): SongPartId | null {
    this.hitStreak = 0;
    this.missStreak++;
    if (this.missStreak < YOUR_SONG_DROP_STREAK) return null;
    this.missStreak = 0;
    const dropped = this.joined.pop();
    if (dropped === undefined) return null;
    this.log.push({ kind: 'drop', part: dropped });
    return dropped;
  }

  /** The MIX-bar-era readout some rooms still want (DanceMode's results card): how much of the band is in. */
  mixLevel(): number { return this.order.length ? this.order.filter((p) => this.has(p)).length / this.order.length : 0; }

  dispose(): void {
    this.disposed = true;
    const now = this.ctx.currentTime;
    for (const n of this.nodes.values()) {
      try { n.src?.stop(now); } catch { /* already stopped, or never started */ }
      try { n.gain.disconnect(); } catch { /* already gone */ }
    }
    this.nodes.clear();
  }
}

// FOLLOW-UP (not this pass): a `flip` stem needs ProjectFlipRow's own source (its AudioRef), which YourSongExport
// does not carry — CONTRACT item 1 names pattern/chain/sections/kit/tempo/swing/notes/takes only. Adding it is the
// same shape as `takes` here (a reference, resolved through StudioLibrary.readDeviceAudio) plus carrying
// `project.flipRows` (or the active bank's chops) alongside `bars`.
