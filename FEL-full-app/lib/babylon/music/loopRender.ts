// loopRender — MUSIC-SUITE P7 ("your beat on the dance floor + a real band", 2026-09-29): SET AS MY WALK-OUT's gap-free
// loop.
//
// WHAT WAS WRONG. WalkOut.ts names the walk-out as the Music Room's first binding, but before this file nothing ever
// produced a walk-out's AUDIO on purpose: StudioLibrary.setWalkOut(id) copied whatever bytes the song already had —
// the 2-bar PUBLISH preview (AudioEngine.renderMixBuffer(2, …), StudioMode.tsx's publishTrack) — and DunkMode.ts:806
// plays that clip with `audio.loop = true`. Two bars of a reverb-and-delay mix (mixGraph.ts's room send, ROOM_SEC =
// 1.1 s, and the slap send) looped that way has an audible seam every ~2 s: the loop point CUTS the tail the room/slap
// sends are still ringing out, so the reverb restarts from silence instead of continuing to decay — a click, on a
// timer, for as long as the walk-out plays.
//
// WHAT THIS FILE IS. Two halves, the same split every other pure-vs-Web-Audio file in this room keeps (chopEdit.ts,
// dance/yourSong.ts):
//   1. `tailWrapLoop` — PURE. No AudioContext, no DOM: it takes plain Float32Array channel data and produces an exact,
//      seamless loop out of it. Fully unit-tested in node (loopRender.test.ts).
//   2. `renderWalkOutLoopBuffer` / `renderWalkOutLoopBlob` — the Web Audio adapter. It renders `bars` (default
//      WALKOUT_LOOP_BARS) PLUS a tail of LOOP_TAIL_SEC through mixGraph.buildMixGraph (THE same desk every Academy
//      render uses — PHASE-4 ENGINE CONTRACT), independent of whatever the live Studio's own engine happens to have
//      loaded (its kit, its bpm): a walk-out can be set on any of your own published songs, not only the one open in
//      the grid right now, so this builds its own OfflineAudioContext and its own kit voices (SynthKit.synthesizeKit)
//      from the RECORD's own kit/bpm/swing rather than borrowing the live AudioEngine's (whose renderMixBuffer only
//      ever renders at ITS OWN this.state.bpm — there is no way to ask it for another song's tempo without changing
//      the room's own live state, which a background walk-out render must never touch). `placeLoopHit` mirrors
//      AudioEngine.ts:254 playHit exactly (not exported there); dance/yourSong.ts's placeHit is the precedent for
//      reimplementing it here rather than reaching into a file this pass does not own.
//
// THE ALGORITHM (tailWrapLoop). Render `loopSamples` (the arrangement's own N bars, exactly, at the song's tempo)
// plus a tail past it (the room/slap sends' own decay, mixGraph.ts ROOM_SEC = 1.1 s — LOOP_TAIL_SEC gives it 1.2 s of
// headroom, the same margin AudioEngine.renderMixBuffer already adds for the same reason, AudioEngine.ts:689).
//   1. TAIL-WRAP: the tail (whatever rang on past the loop point) is folded onto the START, additively — the reverb
//      that would have decayed into a bar N+1 that never plays instead decays into bar 1, so the loop's own ambience
//      never gets truncated. This is why the walk-out is longer by default than the 2-bar preview: a 2-bar loop
//      spends a much bigger fraction of itself on the wrapped tail than an 8-bar one does.
//   2. THE SEAM. A short crossfade (a few ms) blends the very end of the loop toward the very start, SYMMETRICALLY —
//      the sample right before the wrap and the sample right after it are paired first (and so weighted nearly
//      50/50 toward equality: equal-power sin/cos of 90°, i.e. the LAST sample and the FIRST literally end up equal
//      to within floating-point error), and pairs further from the seam ease off the blend the closer they sit to
//      the window's outer edge — a plain overlap crossfade, mirrored around the join instead of run start-to-end.
//      The window's outer edge snaps to the nearest zero crossing (chopEdit.ts's own zeroCrossingNear — the identical
//      technique the Flip already uses for every chop edge, applied here to one seam instead of every slice), so
//      what is left un-blended already meets the window at a quiet instant.
// The result: the loop is EXACTLY `loopSamples` long (never padded or shortened for the fade), its last sample equals
// its first to within 1e-6, and nothing about the reverb tail's own decay is discarded.
//
// Pure logic (loopSamplesFor, tailWrapLoop) needs no audio at all and is fully unit-tested; the render needs Web Audio
// (a real one — this is not exercised by fakeWebAudio.ts, which schedules but never actually renders PCM).

import { barSec, stepVelocity, voiceFor, encodeWav, type RenderSounds, type TrackState } from './AudioEngine';
import { buildMixGraph, type MixGraph } from './mixGraph';
import { songStepTime } from './stepTime';
import { synthesizeKit, type KitId } from './SynthKit';
import { zeroCrossingNear, msToSamples } from './chopEdit';

// ── constants ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The walk-out's own loop length, in bars — longer than the 2-bar PUBLISH preview (StudioLibrary.MIXDOWN_BARS) on
 *  purpose: at 2 bars the wrapped reverb tail is a large fraction of what plays; at 8 it reads as a real loop. */
export const WALKOUT_LOOP_BARS = 8;
/** Tail rendered past the loop point, to catch the room/slap sends' own decay (mixGraph.ts ROOM_SEC = 1.1 s) — the
 *  same 1.2 s margin AudioEngine.renderMixBuffer already uses for the identical reason (AudioEngine.ts:689). */
export const LOOP_TAIL_SEC = 1.2;
/** The seam crossfade's length — long enough to mask a level mismatch, short enough nobody hears a fade (chopEdit.ts's
 *  own chop-edge fades run 3–5 ms for the same reason; a whole-mix seam gets a little more). */
export const LOOP_CROSSFADE_MS = 8;
/** How far the crossfade window's OUTER edge may snap to find a zero crossing (chopEdit.ts SNAP_MS is 2 ms, for one
 *  slice; a few more ms is worth spending once, on the one seam a walk-out ever has). */
export const LOOP_SNAP_MS = 5;

// ── pure: how long N bars are, in samples ───────────────────────────────────────────────────────────────────────────

/** Exactly how many samples `bars` bars last at `bpm`, at `sampleRate` — the same tempo math every render in this
 *  room already shares (AudioEngine.barSec). Rounded once, so "exactly N bars" means an exact integer sample count. */
export function loopSamplesFor(bars: number, bpm: number, sampleRate: number, stepsPerBar = 16): number {
  return Math.round(barSec(bpm, stepsPerBar) * Math.max(1, bars) * sampleRate);
}

// ── pure: the tail-wrap + seam crossfade ────────────────────────────────────────────────────────────────────────────

export interface TailWrapOptions {
  /** ms of seam crossfade. Default LOOP_CROSSFADE_MS. */
  crossfadeMs?: number;
  /** ms the crossfade window's outer edge may snap to find a zero crossing. Default LOOP_SNAP_MS. */
  snapMs?: number;
}

/** Every channel's samples averaged into one, so a stereo mix is searched for a zero crossing ONCE — cutting each
 *  channel at a different sample would push them out of phase at the seam. */
function sumMono(channels: readonly Float32Array[], len: number): Float32Array {
  const m = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) m[i] += ch[i] / channels.length;
  return m;
}

/**
 * `rendered` is `loopSamples` of real content plus whatever tail follows it (the room/slap sends' own decay); returns
 * one Float32Array per channel, each EXACTLY `loopSamples` long, tail-wrapped and seam-crossfaded (see this file's
 * header for the algorithm). Throws when a channel is shorter than the loop itself — the caller's render did not
 * leave the promised tail (or was not given at least `loopSamples` to begin with), and playing it back with `.loop =
 * true` would repeat a truncated bar rather than the arrangement.
 */
export function tailWrapLoop(rendered: readonly Float32Array[], sampleRate: number, loopSamples: number, opts: TailWrapOptions = {}): Float32Array[] {
  if (!rendered.length) return [];
  if (!Number.isFinite(loopSamples) || loopSamples <= 0) throw new Error('loopSamples must be a positive sample count');
  const total = Math.min(...rendered.map((c) => c.length));
  if (total < loopSamples) {
    throw new Error(`rendered audio (${total} samples) is shorter than the requested loop (${loopSamples} samples) — render at least the loop's own length before any tail`);
  }
  const tailLen = total - loopSamples;

  // 1. TAIL-WRAP: whatever rings on past the loop point folds onto the start, additively (never truncated, never
  //    replacing what is already there). `i % loopSamples` covers the pathological case of a tail longer than the
  //    loop itself by wrapping more than once, rather than dropping the excess on the floor.
  const wrapped = rendered.map((ch) => {
    const o = ch.slice(0, loopSamples);
    for (let i = 0; i < tailLen; i++) o[i % loopSamples] += ch[loopSamples + i];
    return o;
  });
  if (loopSamples < 4) return wrapped;   // nothing to crossfade a loop this short against itself

  // 2. THE SEAM CROSSFADE — see this file's header for why it is mirrored around the join rather than run forward.
  // `maxFade` keeps the window strictly under half the loop, so the start region it reads from and the end region it
  // writes to never overlap.
  const maxFade = Math.max(1, Math.floor(loopSamples / 2) - 1);
  const mono = sumMono(wrapped, loopSamples);
  const nominalFadeLen = Math.max(1, Math.min(msToSamples(opts.crossfadeMs ?? LOOP_CROSSFADE_MS, sampleRate), maxFade));
  const snap = msToSamples(opts.snapMs ?? LOOP_SNAP_MS, sampleRate);
  const outerEdge = zeroCrossingNear(mono, loopSamples - nominalFadeLen, snap, 0, loopSamples);
  const fadeLen = Math.max(1, Math.min(loopSamples - outerEdge, maxFade));

  for (const o of wrapped) {
    for (let j = 0; j < fadeLen; j++) {
      // t = 1 at j = 0 (the pair either side of the seam itself: the LAST sample and the FIRST), easing toward 0 at
      // the window's far edge — so the seam pair is nearly a full swap (sin/cos of 90°: the last sample becomes the
      // first, to within floating-point error) and everything else tapers smoothly back to the original render.
      const t = (fadeLen - j) / fadeLen;
      const wStart = Math.sin((t * Math.PI) / 2);
      const wEnd = Math.cos((t * Math.PI) / 2);
      const endIdx = loopSamples - 1 - j;
      const startIdx = j;
      o[endIdx] = o[endIdx] * wEnd + o[startIdx] * wStart;
    }
  }
  return wrapped;
}

// ── the Web Audio adapter (browser only — see this file's header) ──────────────────────────────────────────────────

/** What the render needs from a published (or about-to-be-published) song. Structural: a StudioLibrary.TrackRecord
 *  already has every one of these fields, and so does a StudioMode draft before it is published. */
export interface LoopRenderInput {
  tracks: readonly TrackState[];
  kit: KitId;
  bpm: number;
  swing: number;
  /** SequencerState.steps — almost always 16. */
  steps: number;
  /** Default WALKOUT_LOOP_BARS. */
  bars?: number;
  polished?: boolean;
  /** MUSIC-SUITE P5 FIX PASS's own override map (AudioEngine.RenderSounds): a Flip row's live chop, by sample id, over
   *  the kit's own synthesized voice. Absent = every row plays the record's own `kit`; a row this does not cover
   *  (typically a Flip row on a song rendered outside its own Studio session) is silent rather than failing the
   *  render — the same graceful-degradation rule dance/yourSong.ts's renderYourSongParts already follows for a part
   *  it has nothing to play. */
  sounds?: RenderSounds;
}

/** A grid hit into an offline render, through the row's OWN channel strip — mirrors AudioEngine.ts:254 playHit
 *  exactly (not exported there; dance/yourSong.ts:191 placeHit already reimplements it for the identical reason).
 *  Kept here WITH the legacy per-row pan branch playHit still carries, so a walk-out matches a real publish exactly
 *  rather than yourSong.ts's simplified (pan-less) copy. */
function placeLoopHit(ctx: BaseAudioContext, graph: MixGraph, buffer: AudioBuffer, track: TrackState, step: number, at: number): void {
  const voice = voiceFor({ id: track.sampleId, buffer }, track, step);
  const src = ctx.createBufferSource();
  src.buffer = voice.buffer;
  if (voice.rate !== 1) src.playbackRate.value = voice.rate;
  const gain = ctx.createGain();
  gain.gain.value = track.volume * stepVelocity(track, step);
  let out: AudioNode = src.connect(gain);
  if (Number.isFinite(track.pan) && track.pan !== 0) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = track.pan;
    out = out.connect(panner);
  }
  out.connect(graph.channel(track.sampleId).input);
  src.start(Math.max(0, at));
}

/**
 * Render `input`'s own arrangement, tail-wrapped into an exact, seamless `bars`-bar loop — independent of whatever
 * kit or tempo the live Studio's own AudioEngine currently has loaded (see this file's header for why it cannot use
 * AudioEngine.renderMixBuffer). `sampleRate` should be the room's own live rate when one is open (AudioEngine's own
 * renderRate rule, AudioEngine.ts:701: one rate, so the room's own reverb impulse is the same one this renders);
 * falls back to 44 100 Hz where there is none (a song set as the walk-out with no Studio open).
 */
export async function renderWalkOutLoopBuffer(input: LoopRenderInput, opts: { sampleRate?: number } = {}): Promise<{ buffer: AudioBuffer; bars: number; loopSec: number }> {
  const bars = Math.max(1, Math.round(input.bars ?? WALKOUT_LOOP_BARS));
  const sampleRate = Number.isFinite(opts.sampleRate) && (opts.sampleRate ?? 0) > 0 ? (opts.sampleRate as number) : 44100;
  const loopSamples = loopSamplesFor(bars, input.bpm, sampleRate, input.steps);
  const tailSamples = Math.ceil(sampleRate * LOOP_TAIL_SEC);
  const offline = new OfflineAudioContext(2, loopSamples + tailSamples, sampleRate);
  const graph = buildMixGraph(offline, { polish: input.polished === true });
  const kitVoices = await synthesizeKit(input.kit);

  for (let bar = 0; bar < bars; bar++) {
    for (const track of input.tracks) {
      if (track.muted) continue;
      // MUSIC-SUITE P5 FIX PASS's own override rule (AudioEngine.placeBar): a sound given for this render wins
      // (null = silent here); missing from the map = the kit's own voice for this row.
      const given = input.sounds?.has(track.sampleId) ? input.sounds.get(track.sampleId) ?? null : undefined;
      if (given === null) continue;
      const buffer = given ?? kitVoices.get(track.sampleId);
      if (!buffer) continue;
      for (let step = 0; step < input.steps; step++) {
        if (!track.pattern[step]) continue;
        placeLoopHit(offline, graph, buffer, track, step, songStepTime(bar, step, input.steps, input.bpm, input.swing));
      }
    }
  }

  const rendered = await offline.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c).slice());
  const wrapped = tailWrapLoop(channels, sampleRate, loopSamples);
  const buffer = new AudioBuffer({ numberOfChannels: wrapped.length, length: loopSamples, sampleRate });
  wrapped.forEach((ch, i) => buffer.copyToChannel(ch, i));
  return { buffer, bars, loopSec: loopSamples / sampleRate };
}

/** `renderWalkOutLoopBuffer`, encoded — what StudioLibrary.setWalkOut's `loopAudio` option takes. */
export async function renderWalkOutLoopBlob(input: LoopRenderInput, opts: { sampleRate?: number } = {}): Promise<Blob> {
  const { buffer } = await renderWalkOutLoopBuffer(input, opts);
  return encodeWav(buffer);
}
