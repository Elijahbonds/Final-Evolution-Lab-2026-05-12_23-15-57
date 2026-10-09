// SongStemBand — MUSIC-SUITE P7 (2026-09-29): the Cypher's band, for the six FEL songs, as real audio.
//
// StemBand.ts (P2) synthesizes an E-minor funk band from oscillators, because "no audio assets exist in this repo"
// was true when it was written (its own header). Phase 7 shipped six real songs (public/audio/songs/<id>) as eight
// mono stems apiece (scripts/music/songs/CONTRACT.md: bed + one per earned move family). This class plays THOSE
// stems instead of synthesizing anything: the "band" a hit turns up IS the song's own recorded instrument, at its
// own tempo, key and arrangement. StemBand's hit/miss gain math (nextStemLevel) is reused UNCHANGED — a hit or a
// miss still moves a level exactly the way it always has; only what that level drives changed, from a procedural
// note generator to a GainNode on a pre-rendered file. DanceMode.ts picks this class over StemBand purely on
// whether the locked-in track carries a `song` (danceTracks.ts) — every other caller (onJudged, the instrument
// chips, the results screen's MIX %) reads `band.level()` / `band.judge()` / `band.mixLevel()` exactly as before and
// never needs to know which band it is holding.
//
// bed ALWAYS plays at full gain from the moment the stems start (CONTRACT.md §7: "the rendered bed replaces
// KitPulse's 808 floor for these songs — with both, the kick doubles"; DanceMode never runs KitPulse's own grid
// under a song track, only its count-in clicks, which a song still needs). drums (the bounce family) never drops
// fully silent even on a long miss streak — DRUMS_FLOOR below — because a dancer who cannot land a single bounce
// still needs SOME pocket to dance to, and every stem going to dead silence would make a real song's mix collapse
// in a way the synth band's flatter voices never did. Every other earned stem (bass/keys/perc/horns/lead/fx) can
// duck all the way to 0, exactly like StemBand's synth voices always could.
//
// ONE START, NOT A SCHEDULER: unlike StemBand/KitPulse (which schedule discrete notes 0.25 s ahead forever, because
// they are generating a pattern that runs the whole song), a stem here is one long pre-rendered file — start()
// schedules the whole thing ONCE, at the song's own downbeat, and update() only ever nudges gain (a hit or a miss
// already pushed the target in judge(); update() exists so DanceMode's unconditional `band?.update(now)` every
// frame has something to call, and so a stem whose fetch was still in flight when start() ran can join late once it
// finishes decoding — see the "late join" branch). A pause (DanceMode.syncHold) fades every source out and stops it
// (cancelFrom — MUSIC-SUITE P7 FIX, 2026-09-29: a bare stop() clicked, see CLICK_FADE_SEC's own comment) and a
// resume's count-back (rewind) restarts fresh sources at the right buffer offset, faded in the same way: there is
// no 16th-grid cursor to rewind here, only "start playing again from this point in the file".

import { nextStemLevel, CATEGORY_STEM, type StemCategory } from './StemBand';
import { FEL_STEMS, songStemUrl, type FelSong, type FelStem } from '../dance/felSongs';
import type { Judgement } from '../core/DanceCore';

/** drums never fully drops — see header. Everything else can duck to 0, exactly like StemBand's synth voices. */
export const DRUMS_FLOOR = 0.22;

/** The gain a stem plays at, given its earned level (0..1). Pure — no AudioContext needed to test this: bed ignores
 *  level entirely (always 1), drums is floored, everything else is the level itself. */
export function stemGain(felStem: FelStem, level: number): number {
  if (felStem === 'bed') return 1;
  if (felStem === 'drums') return Math.max(DRUMS_FLOOR, level);
  return level;
}

/** StemBand.CATEGORY_STEM (category -> 'DRUMS'/'BASS'/…) inverted and lower-cased to felSongs' own stem ids
 *  (category -> 'drums'/'bass'/…) — one source of truth, so the two files can never silently disagree on the
 *  mapping (CONTRACT.md §2's table). */
const CATEGORY_TO_STEM: Record<StemCategory, FelStem> = Object.fromEntries(
  (Object.entries(CATEGORY_STEM) as [StemCategory, string][]).map(([cat, stem]) => [cat, stem.toLowerCase() as FelStem]),
) as Record<StemCategory, FelStem>;

const EARNED_STEM_COUNT = Object.keys(CATEGORY_STEM).length;   // 7 — bed is not earned, never counted in mixLevel

interface Voice {
  gain: GainNode;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  /** Earned 0..1. Stays 0 forever for 'bed' (no move family earns it) — harmless, stemGain ignores it for bed. */
  level: number;
}

/** Matches StemBand.judge's own setTargetAtTime time constant (StemBand.ts:97), so a hit or a miss ramps at the
 *  same felt speed whether it is turning up a synth voice or a real stem. */
const GAIN_SMOOTH_SEC = 0.08;

/**
 * MUSIC-SUITE P7 FIX (2026-09-29): "SongStemBand clicks on every pause and resume of a shipped song" (review
 * finding, confirmed). cancelFrom used to call `source.stop(audioSec)` directly on the one long, continuously-
 * playing buffer per stem, with no gain fade first — truncating whatever sample it was mid-waveform (StemBand's
 * own cancelFrom, which this class was modeled on, never has this problem: it only ever takes back short synth
 * notes not yet QUEUED, so what is already sounding rings out on its own envelope — StemBand.ts:141-153's own
 * doc). startVoice then snapped the gain straight to its resting level at `ctx.currentTime` (rampGain(..., true)
 * — "snap, not ramp"), so a fresh source's very first sample played at full gain with no onset ramp either. Both
 * ends of a pause/resume are essentially guaranteed to land away from a zero crossing (bed is always gain 1,
 * drums never drops below DRUMS_FLOOR), so both were an audible click. Now cancelFrom ramps every sounding
 * voice's gain to 0 over CLICK_FADE_SEC before stopping its source (the stop lands at the END of the fade, not
 * the start, so the source itself never plays past where the fade already silenced it), and startVoice fades
 * a fresh source's gain up FROM 0 at the exact audio time it starts, instead of snapping to target.
 */
export const CLICK_FADE_SEC = 0.015;

export class SongStemBand {
  private voices = new Map<FelStem, Voice>();
  private startedAt = 0;      // song-clock time of the stems' own sample 0 (bar 1, beat 0)
  private started = false;    // not `startedAt !== 0`: a song clock may start at 0
  private dead = false;
  /** Song time → audio time (SongClock.audio). Identity until the mode sets it, as every scheduler here does. */
  private toAudio: (songSec: number) => number = (s) => s;
  /** Every source this instance has ever started, so dispose() can always find them even after cancelFrom/rewind
   *  replaced a voice's own `source` pointer (mirrors StemBand.queued's role, one list for the instance's whole life
   *  rather than a 16th-grid lookahead window — there is nothing here to trim back). */
  private everStarted: AudioScheduledSourceNode[] = [];
  /** Kept for API parity with StemBand/KitPulse (a dev probe reads band.skipped) — always 0: nothing here is
   *  scheduled ahead on a grid that a slow frame could fall behind; a late-loading stem joins in update() instead. */
  readonly skipped = 0;

  constructor(private ctx: AudioContext, private dest: AudioNode, readonly song: FelSong) {
    for (const stem of FEL_STEMS) {
      const gain = ctx.createGain();
      gain.gain.value = stem === 'bed' ? 1 : stem === 'drums' ? DRUMS_FLOOR : 0;
      gain.connect(dest);
      this.voices.set(stem, { gain, buffer: null, source: null, level: 0 });
    }
  }

  /** Fetch + decode all eight stems. Resolves to how many loaded (0–8) — a missing one just never sounds, the same
   *  "run headless" rule KitPulse.load() follows; it never throws. */
  async load(fetchImpl: typeof fetch = fetch): Promise<number> {
    const jobs = FEL_STEMS.map(async (stem) => {
      try {
        const res = await fetchImpl(songStemUrl(this.song.id, stem));
        if (!res.ok) return;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (!this.dead) this.voices.get(stem)!.buffer = buf;
      } catch { /* silent stem */ }
    });
    await Promise.all(jobs);
    return this.loadedStems;
  }

  get loadedStems(): number { return [...this.voices.values()].filter((v) => v.buffer).length; }

  /** Called by the mode when a judged step's family is known (DanceMode.onJudged — the exact call StemBand.judge
   *  takes; `cat` undefined for a wild tap with nothing pending, same as StemBand). */
  judge(cat: StemCategory | undefined, judgement: Judgement): void {
    if (!cat) return;
    const stem = CATEGORY_TO_STEM[cat];
    const v = this.voices.get(stem);
    if (!v) return;
    v.level = nextStemLevel(v.level, judgement);
    this.rampGain(stem, v);
  }

  level(cat: StemCategory): number { return this.voices.get(CATEGORY_TO_STEM[cat])?.level ?? 0; }

  /** The gain actually reaching the speakers for one stem right now (stemGain applied to its earned level) — a
   *  read-only test/debug hook (SongStemBand.test.ts uses it to prove "bed and drums never fully drop" against the
   *  live graph, not just the pure stemGain formula). */
  currentGain(stem: FelStem): number { return this.voices.get(stem)?.gain.gain.value ?? 0; }

  /** How much of the band is earned, 0..1 — the "MIX" readout (finish()'s results banner, instrumentsHud's per-chip
   *  level). Averaged over the seven EARNED stems only, exactly like StemBand.mixLevel: bed is not something a
   *  player earns, so it never inflates the number a results screen reads as "how well did I play". */
  mixLevel(): number {
    let sum = 0;
    for (const cat of Object.keys(CATEGORY_STEM) as StemCategory[]) sum += this.level(cat);
    return sum / EARNED_STEM_COUNT;
  }

  /** Map the grid's song time to the context's audio time (SongClock.audio). Without it the two are one clock. */
  setClock(toAudio: (songSec: number) => number): void { this.toAudio = toAudio; }

  /** Start every loaded stem together, at song time `nowSec` — the count-in's target beat 0 (DanceMode passes the
   *  same `startAt` it hands StemBand/KitPulse). Buffer offset 0: sample 0 of every stem IS bar 1 beat 0
   *  (CONTRACT.md §2.3), so no scheduling math is needed beyond "when does song time `nowSec` land on the audio
   *  clock". */
  start(nowSec: number): void {
    this.startedAt = nowSec;
    this.started = true;
    this.armFrom(nowSec, 0);
  }

  /** Drive from the mode's update with the SONG clock. Gains already move from judge() the instant a step is
   *  judged; this only catches a stem whose fetch was still in flight when start() (or the last rewind) ran — once
   *  its buffer lands, it joins here, at the position the song has already reached, rather than staying silent for
   *  the rest of the run. */
  update(nowSec: number): void {
    if (this.dead || !this.started) return;
    for (const [stem, v] of this.voices) {
      if (v.buffer && !v.source) this.startVoice(stem, v, nowSec, nowSec - this.startedAt);
    }
  }

  /** The count-back-in after a pause: restart every stem from song time `songSec` (DanceMode computes "one bar
   *  before the pause point"; this only needs where to resume). Unlike StemBand's 16th-grid rewind (move a cursor
   *  for a future scheduler pass), there is no queue here — the whole song is scrubbed back and restarted at once,
   *  which is what makes the count-back audibly replay that bar rather than only counting a silent 4-3-2-1. */
  rewind(songSec: number): void {
    if (!this.started) return;
    this.armFrom(songSec, songSec - this.startedAt);
  }

  /** Stop every currently-sounding stem at or after audio time `audioSec` (a pause: the sources already started
   *  must not keep ringing into it). Returns how many were stopped (StemBand/KitPulse return a queued-note count;
   *  here it is "how many stems were sounding"). MUSIC-SUITE P7 FIX (2026-09-29, see CLICK_FADE_SEC's own
   *  comment): fades each voice's gain to 0 first and stops the source once the fade finishes, so a pause never
   *  truncates the buffer mid-waveform. */
  cancelFrom(audioSec: number): number {
    let n = 0;
    const at = Math.max(this.ctx.currentTime, audioSec);
    for (const v of this.voices.values()) {
      if (!v.source) continue;
      try {
        v.gain.gain.cancelScheduledValues(at);
        v.gain.gain.setValueAtTime(v.gain.gain.value, at);
        v.gain.gain.linearRampToValueAtTime(0, at + CLICK_FADE_SEC);
        v.source.stop(at + CLICK_FADE_SEC);
        n++;
      } catch { /* already stopped */ }
      v.source = null;
    }
    return n;
  }

  /**
   * Play a short outro of the song's OWN last section (danceTracks.ts / felSongs.outroRange picks it), at the full
   * mastered mix — every stem at gain 1, CONTRACT.md §2.4: summing all eight at gain 1 IS the mix — fading out over
   * `fadeSec`. Independent of anything earned this run: the results screen hears the song finish, not how well it
   * was played. Reuses whatever stems already decoded for gameplay (no new fetch) and stops the still-sounding
   * gameplay tail first, so the results screen never hears two copies of the song overlap.
   */
  playOutro(fromSongSec: number, durationSec: number, fadeSec = 1.2): void {
    if (this.dead) return;
    this.cancelFrom(this.ctx.currentTime);
    const when = this.ctx.currentTime + 0.05;   // a hair past "now": `when` in the past plays instantly, stacked
    for (const v of this.voices.values()) {
      if (!v.buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = v.buffer;
      const g = this.ctx.createGain();
      const fadeStart = when + Math.max(0, durationSec - fadeSec);
      g.gain.setValueAtTime(1, when);
      g.gain.setValueAtTime(1, fadeStart);
      g.gain.linearRampToValueAtTime(0, fadeStart + fadeSec);
      src.connect(g).connect(this.dest);
      const offset = Math.min(Math.max(0, fromSongSec), Math.max(0, v.buffer.duration - 0.05));
      const playFor = Math.min(durationSec, v.buffer.duration - offset);
      src.start(when, offset, playFor > 0 ? playFor : undefined);
      this.everStarted.push(src);
    }
  }

  dispose(): void {
    this.dead = true;
    this.cancelFrom(this.ctx.currentTime);
    for (const v of this.voices.values()) {
      try { v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch { /* closing */ }
    }
  }

  /** (Re)start one stem's source, from `offsetSec` into its buffer, at song time `atSongSec` on the audio clock. */
  private armFrom(atSongSec: number, offsetSec: number): void {
    if (this.dead) return;
    for (const [stem, v] of this.voices) {
      if (v.buffer) this.startVoice(stem, v, atSongSec, offsetSec);
      else v.source = null;   // not loaded yet — update() arms it once it is
    }
  }

  private startVoice(stem: FelStem, v: Voice, atSongSec: number, offsetSec: number): void {
    if (v.source) { try { v.source.stop(0); } catch { /* already stopped */ } try { v.source.disconnect(); } catch { /* gone */ } }
    if (!v.buffer) { v.source = null; return; }
    const when = Math.max(this.ctx.currentTime, this.toAudio(atSongSec));
    // A negative offset (a pause landed before the song's own bar 1 — during the count-in, say) has nothing earlier
    // to play: start from the top rather than throwing (AudioBufferSourceNode.start rejects a negative offset).
    const offset = Math.min(Math.max(0, offsetSec), Math.max(0, v.buffer.duration - 1e-3));
    const src = this.ctx.createBufferSource();
    src.buffer = v.buffer;
    src.connect(v.gain);
    src.start(when, offset);
    v.source = src;
    this.everStarted.push(src);
    // MUSIC-SUITE P7 FIX (2026-09-29, CLICK_FADE_SEC's own comment): fade in FROM 0 at `when` — the exact audio
    // time the source itself starts — instead of snapping the gain to its resting level at `ctx.currentTime`
    // (which, for a source scheduled into the future, reached its target well before any sound was flowing
    // through the node, so the buffer's very first sample played at full gain: a click, not a fade-in).
    v.gain.gain.cancelScheduledValues(when);
    v.gain.gain.setValueAtTime(0, when);
    v.gain.gain.linearRampToValueAtTime(stemGain(stem, v.level), when + CLICK_FADE_SEC);
  }

  /** MUSIC-SUITE P7 FIX (2026-09-29): used only by judge() now — startVoice's own fresh-source fade-in (above) is
   *  a distinct case (it has to land exactly at the source's own start time, not "now") and no longer routes
   *  through this. */
  private rampGain(stem: FelStem, v: Voice): void {
    v.gain.gain.setTargetAtTime(stemGain(stem, v.level), this.ctx.currentTime, GAIN_SMOOTH_SEC);
  }
}
