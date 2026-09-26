// DanceMode — the mode Dance never had. (M75, adapted to this codebase.)
//
// M28 shipped ChoreographyEngine and CreatorCardTypes with a full `dance`
// payload (choreographyId, sequence, routineVideoUrl). What it never shipped
// was a ModeDefinition, a route, a venue, or clips the ids resolve to — so
// /play/dance has been a 404 the whole time. This is the missing half.
//
// TIMING RUNS ON THE AUDIO CLOCK, NOT THE FRAME CLOCK
// The one decision that matters in a rhythm game. `update(dt)` arrives on
// requestAnimationFrame; a single dropped frame shifts the judging window
// against the music, and players feel a 30 ms drift immediately even though
// no counter shows it. So every timing call takes AudioContext.currentTime,
// and the frame loop only ever asks "what time is it in the song?".
//
// A+ MISSION #1 (2026-09-06, benchmark Wii Sports Resort floor + Mario Party
// readability): three tracks with a pick screen, the FEL 808 kit under the
// band (KitPulse), a cue lane the couch can read (HUD `cues`), the body
// answering the judgement (clean = full-out, GOOD drags, MISS stumbles), and
// a graded results card. The count-in now runs on the audio clock too.
//
// ADAPTATION NOTES (drop-in -> this repo):
//   * ModeContext here exposes heroRef/objectiveRef as MutableRef (.current=),
//     not setter functions; the results screen is ctx.end(outcome,score,stats),
//     not ctx.onGameOver.
//   * There is no shared music AudioEngine singleton with a .context/startTrack.
//     We own a local AudioContext purely as the SONG CLOCK (real audio clock,
//     frame-drop robust). The StemBand and the KitPulse both play through it.
//     MUSIC-SUITE P2 (2026-09-25): not any more — see ONE AUDIO CONTEXT in load().
//
// MUSIC-SUITE P2 (2026-09-25, "on the beat, and honest"). What P1 measured in this room (BASELINE.md §2a) and what
// changed here:
//   * ONE AUDIO CONTEXT. The band and the kit ran on a second AudioContext built here, past SoundKit's master and
//     limiter, 144–160 ms apart from SoundKit's clock, and the harness's first-gesture unlock never reached it. They now
//     play on SoundKit.graph().ctx through its music bus (load()).
//   * A SONG CLOCK THAT PAUSES (audio/SongClock). START or a hidden tab left the audio clock running: a 5 s pause
//     resumed with 2 MISSes in one frame and 2 band notes 0.735 s in the past. Judge, band and kit now run on song time
//     (audio time minus the pauses); a resume counts back in over one bar (syncHold()).
//   * TAPS THAT COUNT WHEN PRESSED. R2 held 1 s was 57 taps and SPACE held 1 s 23; SPACE was judged on key-UP,
//     114–195 ms late. One physical press is now one judged tap, on its way down (onInput, SongClock.danceTap).
//   * LATENCY. A tap is judged `latencySec` earlier (the saved /play/calibrate offset, else outputLatency), and the
//     cue lane, the beat dot and the step clips run on that same heard time, so what is seen matches what is heard.
//   * The pick screen's 6 s auto-start restarts on every browse (it started the track while the player was choosing).
//   * Clip ids register through me.animator.register(group) (the group name IS
//     the id). Mirrored steps play `<id>.M`, which resolves through the merged
//     DANCE_ALIASES table to the mirrored base groups registered at spawn.

import { Vector3 } from '@babylonjs/core';
import type { Observer, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { BeatOwner } from '../anim/beatOwner';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { registerDanceClips, resolveDanceClip, danceRootTracks } from '../anim/danceClips';
import { MoveRootLayer } from '../anim/MoveRootLayer';
import { registerMirroredClips } from '../anim/mirrored-clips';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition, BodyView } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import {
  DancePerformance, generateRoutine, beatDuration, DANCE_LIBRARY, MISS_AFTER, type Judgement, type DanceStep,
} from '../core/DanceCore';
import {
  DEFAULT_TRACK_ID, trackById, cycleTrack, trackFromQuery, pickBanner, PICK_TIMEOUT_SEC, stepsFor,
  gradeFor, bodySpeedFor, cueLane, type DanceTrack,
} from '../core/danceTracks';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the stage family (SPEC-FEL-BIOMECH-GAMEWIDE asks dance for "G2 +
// G5 minimum"). Measured on 2942860: danceClips' procedural steps key the hips, the arms and ONE spine bone and never
// touch the head, so a dancer performed an entire routine looking straight down his own root yaw at the back wall —
// no lift on a PERFECT, no drop on a MISS, and the routine's biggest read (the judgement) happened only in the HUD.
// The Posture Poses layer now carries the chest / shoulders / head: the step stays LIGHT (the routine is the clip's),
// a clean hit opens the chest and lifts the chin, a MISS closes them, and the finish holds the celebrate.
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { stagePose, STAGE_INPUT_IDLE, STAGE_BEAT_SEC, type StagePostureInput } from '../core/StagePosture';
import { StemBand, CATEGORY_STEM } from '../audio/StemBand';
import { KitPulse, kitPattern } from '../audio/KitPulse';
import { SongClock, danceTap, tapLatencySec, type TriggerLatch } from '../audio/SongClock';
import { loadRoomCalibration } from '@/lib/feel/rhythm-calibrate';
// MUSIC-SUITE P2 FIX PASS (2026-09-25): the room's decisions, pure and tested (danceRoomFlow.test.ts), and the audio
// session claimed for this room only (it was set for every mode inside SoundKit).
import { holdAction, countBackFirstBeat, pickTimer, countInTapReaches } from './danceRoomFlow';
import { claimPlaybackSession } from '@/lib/audio/session';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

/** Clips are authored at 120 BPM; the animator rescales them per track. */
const CLIP_REF_BPM = 120;
/** MUSIC-SUITE P2: the pick screen's top chip swaps the track's blurb for the calibration line this often (s). */
const PICK_CAL_FLIP_SEC = 3;

/** MUSIC-SUITE P2: the saved /play/calibrate offset (ms), or null if this device never calibrated. loadAudioOffsetMs
 *  answers 0 for both, and a saved 0 is a calibration (use it); no calibration falls back to outputLatency.
 *  MUSIC-SUITE P2 FIX PASS (2026-09-25): through the one reader the Academy shares (rhythm-calibrate
 *  loadRoomCalibration), which ignores an offset saved by the pre-P2 screen (no measured-at date: its nearest-click
 *  reader clamped to ±200 ms and read late taps as early — applied here it put a Bluetooth player ~550 ms off). */
function savedOffsetMs(): number | null {
  return loadRoomCalibration().offsetMs;
}

type Phase = 'pick' | 'countin' | 'playing';

export const DanceMode: ModeDefinition = (() => {
  let me: SpawnedCharacter;
  let venue: VenueHandle | null = null;
  let perf: DancePerformance;
  let registered = new Set<string>();
  let ended = false;
  let phase: Phase = 'pick';
  let track: DanceTrack = trackById(DEFAULT_TRACK_ID);
  let pickSec = 0;
  let stickLatch = false;
  /** SONG-clock time the routine's beat 0 sounds (set when the count-in is armed). */
  let startAt = 0;
  /** The count-in has been armed on the song clock (startAt is set). Not `startAt === 0`: song time can be 0. */
  let countArmed = false;
  /** SoundKit's AudioContext (MUSIC-SUITE P2: one context — see load()). Its clock is the song clock's source. */
  let audioCtx: AudioContext | null = null;
  /** The Cypher's own node into SoundKit's music bus: the band and the kit play through it, and it leaves with the room. */
  let bus: GainNode | null = null;
  /** MUSIC-SUITE P2: song time = audio time minus the pauses (audio/SongClock). */
  let clock = new SongClock();
  /** Seconds a tap is judged earlier than it lands (the calibration, else outputLatency); the lane runs on it too. */
  let latencySec = 0;
  let latencyFrom: 'calibration' | 'outputLatency' | 'none' = 'none';
  /** The R trigger's edge latch (SongClock.triggerTap): one pull, one tap. */
  let trig: TriggerLatch = 'up';
  /** Seconds the pick screen has been up (its top chip alternates on this; pickSec restarts on every browse). */
  let pickShownSec = 0;
  let holdObs: Observer<Scene> | null = null;
  let onVisibility: (() => void) | null = null;
  /** The count back in's banner is up (cleared once, when it ends). */
  let countBackShown = false;
  /** MUSIC-SUITE P2 FIX PASS: gives back the 'playback' audio session this room claimed at load (lib/audio/session.ts). */
  let releaseSession: (() => void) | null = null;
  /** The Class of 3000 layer: the band your dancing builds. */
  let band: StemBand | null = null;
  let bandJoined = new Set<string>();
  /** The floor: the FEL 808 kit at the track's tempo. */
  let kit: KitPulse | null = null;
  /** The clip currently dancing, so a judgement can re-speed it. */
  let currentClip: string | null = null;
  /** ANIM-READABILITY (creative, 2026-09-07): the ONE OWNER of the dancer's clips. Steps used to play as one-shots with
   *  neverBindPose's chain settling them, and the chain fires when a step is CUT too: the previous step's chained idle
   *  played from inside the animator's fade handler 0.05 s after the next step began and replaced it — measured on the
   *  warm-up chart, half the steps were 2.5 s of idle_stand. Now every step is a LOOP the next step crossfades over (a
   *  step that overruns its beat by a frame repeats its first frame, never the idle), and the MISS stumble is a beat the
   *  owner settles back into the running step. */
  let body: BeatOwner | null = null;
  let posture: { layer: PostureLayer; dispose(): void } | null = null;
  /** The ring around the floor — a cypher is people watching (SCORECARD VISUALS, 2026-09-15). */
  let crowd: Onlookers | null = null;
  const bio: StagePostureInput = { ...STAGE_INPUT_IDLE };
  /** The judgement beat's wall clock (short: the next step must be able to take the body back). */
  let beatUntil = 0;
  /** Where the dancer performs TO. The stage faces −z (the body spawns at yaw π), so the room is in front of it. */
  const AUDIENCE = new Vector3(0, 1.7, -6);
  /** A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): one results punch per routine. */
  let resultLatch = false;

  /** GREAT (stars >= 3): a latched match-class punch — hit-stop + shake + gold flash. GOOD: a softer shake only. No slowMo. */
  function resultBeat(ctx: ModeContext, great: boolean): void {
    if (resultLatch) return; resultLatch = true;
    if (great) { ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140); console.info('[DANCE-JUICE] great punch'); }
    else { ctx.juice.shake(0.08, 140); console.info('[DANCE-JUICE] good shake'); }
  }

  /** The AUDIO clock. Falls back to performance.now() only if no audio context
   *  exists — and says so, because silent fallback to the frame clock is the
   *  bug this mode is most likely to ship with. */
  function audioNow(): number {
    if (audioCtx) return audioCtx.currentTime;
    return performance.now() / 1000;
  }

  /**
   * MUSIC-SUITE P2 (2026-09-25): PAUSE ON THE SONG CLOCK. The harness stops calling update() while it is paused (START,
   * ModeHarness.ts:601) and the browser stops the frame loop in a hidden tab — but the audio clock ran on through both,
   * so the resume expired every step that had passed (P1: 2 MISSes in one frame after a 5 s pause) and the band
   * scheduled every 16th it had missed in the past. This holds the song clock whenever the harness is not 'playing'
   * (read off ctx.phase(), ModeHarness.ts:134 — polled every rendered frame, which the harness renders in every phase)
   * or the page is hidden, takes back what the band and the kit had queued into the pause, and on the way back:
   *   'playing' — counts back in: the song resumes ONE BAR before the pause point (the band replays that bar, the cue
   *               lane rolls toward the line again, four clicks sit on its beats) and taps stay closed until one judge
   *               window before the pause point, so the harness's resync of a held trigger (ModeHarness.ts:700) is not
   *               a tap, and a step that was pending at the pause can still be hit on time;
   *   'countin' — starts the count-in again from the top;
   *   'pick'    — just carries on (nothing is scheduled).
   * Called from the render observer, visibilitychange, onInput and update, so a resume is seen by the first event after it.
   */
  function syncHold(ctx: ModeContext): void {
    // MUSIC-SUITE P2 FIX PASS: the decision is danceRoomFlow.holdAction (pure, tested); what it does stays here
    const hidden = typeof document !== 'undefined' && document.hidden;
    const act = holdAction({ ended, hidden, harnessPhase: ctx.phase(), clockPaused: clock.paused, roomPhase: phase });
    if (act === 'none') return;
    const a = audioNow();
    if (act === 'pause') {
      clock.pause(a);
      band?.cancelFrom(a);
      kit?.cancelFrom(a);
    } else if (act === 'resume-count-back') {
      const bd = beatDuration(track.bpm);
      clock.resume(a, 4 * bd);
      const s = clock.song(a);
      band?.rewind(s);
      kit?.rewind(s);
      kit?.countIn(clock.audio(countBackFirstBeat(startAt, s, bd)), 4);   // the first beat of the replayed bar
      countBackShown = true;
    } else {
      clock.resume(a, 0);
      if (act === 'resume-rearm') countArmed = false;   // the next update() arms a fresh count-in
    }
  }

  /** MUSIC-SUITE P2 (2026-09-25): THE BODY JUDGE'S SEAM — a no-op until movement play P9 plugs the body in.
   *  P9 routes the claimed body events here and judges them with perf.hitBody on this room's heard time (the song
   *  clock minus latencySec; perf.bodyLatencySec takes the camera's own lag off on top). Deliberately NOT the
   *  ModeDefinition's onBody yet: bodySeamFor (core/bodySeam.ts:45-48) makes any mode that has an onBody body-DRIVEN,
   *  and a body-driven mode pauses when the body is lost — a change for every button player that belongs to P9. */
  function judgeBody(_ctx: ModeContext, _ev: BodyEvent, _view: BodyView): void {
    // P9: void perf.hitBody(clock.song(audioNow()) - latencySec, hitFrom(_ev));
  }

  function clipSpeed(): number { return track.bpm / CLIP_REF_BPM; }

  function playStep(s: DanceStep): void {
    const id = resolveDanceClip(s.clipId, (x) => registered.has(x));
    // Mirrored steps play `<id>.M` — resolved via the merged DANCE_ALIASES
    // table to the mirrored base groups registered at character spawn.
    currentClip = s.mirrored ? `${id}.M` : id;
    body?.loop(currentClip, { fadeSec: 0.12, speedRatio: clipSpeed() });
    me.animator.setSpeed(currentClip, clipSpeed());   // the same step twice in a row keeps the loop; a GOOD's drag is undone here
  }

  function onJudged(ctx: ModeContext, label: Judgement, _pts: number, combo: number, step?: DanceStep, deltaMs?: number): void {
    // THE BAND ANSWERS THE DANCING. The judged step's family turns its
    // instrument up (or down) — and when an instrument first joins, the
    // banner says WHO walked in. The Class of 3000 fantasy: you are not
    // dancing TO a track, you are ASSEMBLING one.
    let joinBanner: string | null = null;
    if (band && step) {
      const cat = DANCE_LIBRARY.find((c) => c.id === step.clipId)?.category;
      if (cat) {
        const before = band.level(cat);
        band.judge(cat, label);
        const instrument = CATEGORY_STEM[cat];
        if (before === 0 && band.level(cat) > 0 && !bandJoined.has(instrument)) {
          bandJoined.add(instrument);
          joinBanner = `${instrument} JOINS THE MIX`;
        }
      }
    }
    // Shot-feedback legibility, rhythm edition: a miss says WHICH side of
    // the beat you were on.
    const dirTag = label === 'MISS' && typeof deltaMs === 'number'
      ? (deltaMs < 0 ? ' — EARLY' : ' — LATE')
      : '';
    ctx.setHud({
      banner: joinBanner ?? (combo >= 4 ? `${label}  ×${combo}` : `${label}${dirTag}`),
      score: perf.score,
      combo,
      energy: band ? Math.round(band.mixLevel() * 100) : 0,
      energyLabel: 'MIX',
    });

    // THE BODY ANSWERS THE JUDGEMENT (A+ mission #1). A clean hit dances the
    // move full-out; a GOOD drags it; a MISS on a real step breaks the move
    // into a stumble (the next step's beat picks the routine back up).
    // G5: the judgement is a BODY read, not only a banner
    bio.beat = label === 'MISS' ? 'stumble' : label === 'PERFECT' || label === 'GREAT' ? 'hit' : null;
    beatUntil = performance.now() + STAGE_BEAT_SEC * 1000;
    const spd = bodySpeedFor(label);
    if (label === 'MISS') {
      // A DANCER'S MISS IS AN OVERBALANCE, not a hit taken (2026-09-15). This played karate_hit_react — a fighter's
      // flinch blended over the running step, which the frame review read as crossed limbs — and nobody is throwing
      // punches in a cypher. `dance_stumble` (danceClips) catches the weight wide and comes back up on the groove.
      if (step) body?.beat('dance_stumble', { fadeSec: 0.08, speedRatio: 1.15 });   // the stumble settles back into the running step
    } else if (currentClip && spd < 1) {
      me.animator.setSpeed(currentClip, clipSpeed() * spd);
    }

    // SCORECARD FEEL (2026-09-15): a hit on the beat was a banner word and a tick — the capture counted 0 juice beats a
    // minute in a rhythm game. The hit POPS at the dancer in its grade's colour, a PERFECT kicks the frame, a streak is
    // called, and an instrument joining the mix flashes the stage.
    const popAt = me.root.position.add(new Vector3(0, 2.1, 0));
    if (label === 'PERFECT') {
      EffectsKit.burst(ctx.scene, me.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
      SoundKit.play('uiTick', { pitch: 1.6, volume: 0.35 });
      ctx.juice.scorePop(popAt, 'PERFECT', '#fde047');
      ctx.juice.shake(0.035, 90);
    } else if (label === 'GREAT') {
      ctx.juice.scorePop(popAt, 'GREAT', '#86efac');
    } else if (label === 'GOOD') {
      ctx.juice.scorePop(popAt, 'GOOD', '#93c5fd');
    } else if (label === 'MISS') {
      SoundKit.play('miss', { volume: 0.25 });
    }
    if (label !== 'MISS' && combo > 0 && combo % 8 === 0) ctx.juice.callout(`${combo} ON THE BEAT`, '#f0abfc', 700);
    if (joinBanner) ctx.juice.flash('#f0abfc', 110);
    setTimeout(() => ctx.setHud({ banner: '' }), joinBanner ? 1000 : 380);
  }

  function finish(ctx: ModeContext): void {
    if (ended) return;
    ended = true;
    perf.stop();
    kit?.dispose();
    bio.beat = null; beatUntil = 0;
    body?.loop(SPORT_CLIP.idle, { fadeSec: 0.3 });
    currentClip = null;
    const r = perf.result();
    const cleanHits = r.counts.PERFECT + r.counts.GREAT + r.counts.GOOD;
    const rounds = cleanHits + r.counts.MISS;
    const mixPct = band ? Math.round(band.mixLevel() * 100) : 0;
    const accuracy = Math.round(r.accuracy * 100);
    const grade = gradeFor(r.accuracy);
    resultBeat(ctx, r.stars >= 3);
    ctx.setHud({
      banner: `${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}  ${accuracy}%  ·  GRADE ${grade}  ·  MIX ${mixPct}%`,
      cues: [],
      nextStep: '',
    });
    // Results screen: the timing host reads outcome ('GREAT' => won),
    // stats.hits/stats.rounds for its headline, and score. The proof line
    // (lib/proofLine.ts 'dance') reads stars / accuracy / maxCombo.
    ctx.end(r.stars >= 3 ? 'GREAT' : 'GOOD', r.score, {
      hits: cleanHits,
      rounds,
      stars: r.stars,
      accuracy,                 // 0..100; the proof line derives the grade letter from it
      maxCombo: r.maxCombo,
      perfect: r.counts.PERFECT,
      great: r.counts.GREAT,
      good: r.counts.GOOD,
      miss: r.counts.MISS,
      bpm: track.bpm,
      difficulty: track.difficulty,
    });
  }

  // ── the pick screen ───────────────────────────────────────────────────

  /** MUSIC-SUITE P2: where to fix a late-feeling room. The pick screen publishes only round / banner / nextStep, and the
   *  timing host (not this lane's file) draws no hint there, so the top chip alternates the track's blurb with this. */
  function pickRound(): string {
    if (Math.floor(pickShownSec / PICK_CAL_FLIP_SEC) % 2 === 0) return track.blurb.toUpperCase();
    const cal = loadRoomCalibration();
    const saved = cal.offsetMs;
    // MUSIC-SUITE P2 FIX PASS: an old undated reading is ignored (loadRoomCalibration) — say so, and ask for a new one
    if (cal.stale) return 'Recalibrate: /play/calibrate (old reading ignored)';
    return saved === null ? 'Calibrate: /play/calibrate' : `Calibrate: /play/calibrate (now ${saved > 0 ? '+' : ''}${saved} ms)`;
  }

  function showPick(ctx: ModeContext): void {
    ctx.setHud({
      round: pickRound(),
      banner: pickBanner(track),
      nextStep: '◀ ▶  TRACK   ·   A  START',        // short: on a phone this panel sits beside the TAP button
      nextStepIn: null,
      score: 0,
      combo: 0,
    });
  }

  function movePick(ctx: ModeContext, dir: 1 | -1): void {
    track = cycleTrack(track.id, dir);
    // MUSIC-SUITE P2 (2026-09-25): the auto-start is for a viewer who never touches anything, not a player choosing:
    // P1 measured it starting the default 6.07–6.28 s after wake while d-pad presses at +2, +4 and +5.5 s browsed.
    pickSec = pickTimer(pickSec, { type: 'browse' }, PICK_TIMEOUT_SEC).sec;
    SoundKit.play('uiTick', { pitch: dir > 0 ? 1.2 : 0.9, volume: 0.3 });
    showPick(ctx);
  }

  /** Lock the track in: build the chart, the band and the kit at ITS tempo
   *  and start a one-bar count-in on the audio clock. */
  function beginCountIn(ctx: ModeContext): void {
    if (phase !== 'pick') return;
    phase = 'countin';

    perf = new DancePerformance(track.bpm);
    // A player's exported song carries its OWN steps — they are the song's drums, and re-rolling them from a
    // seed would discard the only thing the export exists to preserve. Shipped tracks generate as before.
    const mine = stepsFor(track);
    perf.setRoutine(mine ?? generateRoutine({ bars: track.bars, difficulty: track.difficulty, seed: track.seed }));
    perf.onStepFired = playStep;
    // pass ALL of onJudged's args through — a 3-arg arrow here silently
    // dropped the step (no band motion ever) and the delta (no EARLY/LATE)
    perf.onJudged = (l, p, c, step, deltaMs) => onJudged(ctx, l, p, c, step, deltaMs);

    SoundKit.unlock();   // the shared context: a no-op once running (the harness unlocks it on the first gesture)
    band?.dispose();
    band = audioCtx && bus ? new StemBand(audioCtx, bus, track.bpm) : null;
    band?.setClock((sec) => clock.audio(sec));
    bandJoined = new Set();
    kit?.retune(track.bpm, kitPattern(track.id));

    // The clock is armed on the first PLAYING tick (update), not here: on a
    // deep link this runs inside load(), before the harness's own 3-2-1, and
    // a bar armed now would be spent before the player ever saw it.
    startAt = 0;
    countArmed = false;
    ctx.setHud({ round: track.name, banner: '4', nextStep: '', nextStepIn: null });
    console.log(`[FEL-DANCE] track ${track.id} ${track.bpm}bpm ${track.bars} bars d${track.difficulty} · kit voices ${kit?.voices ?? 0}`);
  }

  /**
   * MUSIC-SUITE P2 (2026-09-25): LATENCY. A tap is judged latencySec earlier than it lands: the saved calibration
   * (/play/calibrate measures taps against the click on the audio clock, so it already holds the speaker's delay), else
   * the context's outputLatency. Read when the count-in is ARMED, not at lock-in: on a deep link lock-in runs inside
   * load(), before the harness's first gesture resumes the context, and a suspended context reports outputLatency 0
   * (measured on the lane server: 0 ms at lock-in, 16 ms once running). Never re-read mid-song: a latency that changed
   * under a running chart would jump the heard clock.
   */
  function readLatency(): void {
    const saved = savedOffsetMs();
    latencySec = tapLatencySec(saved, audioCtx?.outputLatency);
    latencyFrom = saved !== null ? 'calibration' : latencySec > 0 ? 'outputLatency' : 'none';
    // (MUSIC-SUITE P2 FIX PASS: `saved` is null for an undated pre-P2 reading too — the fallback stands in for it)
    console.log(`[FEL-DANCE] count-in armed · latency ${Math.round(latencySec * 1000)} ms (${latencyFrom}) · audio ${audioCtx?.state ?? 'none'}`);
  }

  return {
    modeId: 'dance',
    mood: 'nightGame',
    camPreset: 'overShoulder',

    async load(ctx: ModeContext) {
      // MUSIC-SUITE P2 FIX PASS (2026-09-25): 'playback' for THIS room (the band through an iPhone's silent switch —
      // assumption, not tried on a device), claimed before SoundKit's context is asked for and given back on dispose.
      // It was set inside SoundKit for every mode, where (assumed) it also stopped the player's own music app.
      releaseSession?.();
      releaseSession = claimPlaybackSession();
      venue = mountVenue(ctx, 'dance', { keepGameplayCamera: true, look: readPlaceLook('dance') });   // M104 gap: keep the over-shoulder follow camera, not the venue orbit
      // SCORECARD VISUALS (2026-09-15): a cypher IS the circle of people around the dancer, and the frame review found a
      // lone body on a lit disc in a dark room. The ring watches the floor (the same Onlookers the dojo and the courts use).
      crowd?.dispose(); crowd = null;
      crowd = new Onlookers(ctx.scene, Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + 0.18;
        return new Vector3(Math.sin(a) * 4.6, 0, Math.cos(a) * 4.6);
      }), '#d946ef', new Vector3(0, 1.2, 0));

      me = await CharacterLibrary.spawn(ctx.scene, SHARED_CFG.heroUrl, {
        // Stand on the stage deck, not in it — podium scale 1.4 -> surface y 0.7.
        position: new Vector3(0, 0.7, 0), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(me.animator, SPORT_CLIP.idle);
      installSafePlay(me.animator, 'dance-me');
      body = new BeatOwner(me.animator);
      body.loop(SPORT_CLIP.idle, { fadeSec: 0.2 });
      ctx.groundLock?.track(me.root, me.skeleton);
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, me.skeleton, me.root, () => {
        bio.stepping = phase === 'playing' && !!currentClip;
        bio.beat = performance.now() < beatUntil ? bio.beat : null;
        bio.celebrating = ended;
        bio.watching = phase !== 'playing' && !ended;
        const { window, pose, legs } = stagePose(bio);
        return { pose, legs, aim: AUDIENCE, eyes: AUDIENCE, window };
      }, 'DANCE-PP');
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { stagePosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.stagePosture = { me: () => posture?.layer.get() ?? null, bio: () => ({ ...bio }), aim: () => ({ x: AUDIENCE.x, y: AUDIENCE.y, z: AUDIENCE.z }) };   // BIOMECH-WAVE2 probes
      }
      venue?.hidePlaceholders();

      // Build the dance clips against THIS skeleton (group name IS the id).
      registered = new Set<string>();
      registerDanceClips(ctx.scene, me.skeleton, (id, group) => {
        me.animator.register(group);
        registered.add(id);
      });
      // Mirrored steps deserve mirrored DANCE motion, not a sport stand-in:
      // build '<danceId>.M' from the procedural groups themselves. (This also
      // no longer depends on the alias chain — which silently shipped zero
      // mirrored groups until the _pN bone-suffix fix in boneLookup.ts.)
      registerMirroredClips(me.animator, ctx.scene, me.skeleton, [...registered]);
      // the captured floor steps (windmill, six-step) turn the whole body over: their root tracks play on the hero root
      const rootLayer = new MoveRootLayer(ctx.scene, me.root, me.skeleton, danceRootTracks(registered));
      ctx.scene.onDisposeObservable.addOnce(() => rootLayer.dispose());

      ended = false; phase = 'pick'; pickSec = 0; stickLatch = false; currentClip = null; resultLatch = false;
      pickShownSec = 0; trig = 'up'; countArmed = false; countBackShown = false; latencySec = 0; latencyFrom = 'none';

      // MUSIC-SUITE P2 (2026-09-25): ONE AUDIO CONTEXT. This built its own `new AudioContext()` as the song clock and
      // played the band and the kit into its destination: past SoundKit's master and limiter, 144–160 ms apart from the
      // clock SoundKit, the crowd bed and the MC run on (P1), and never resumed by the harness's first-gesture
      // SoundKit.unlock() (ModeHarness.ts:566) — its only resume() ran from beginCountIn, which the 6 s pick timeout calls
      // outside any gesture (the map's assumed iPhone hang: a count-in stuck on '4'). The song clock is now SoundKit's
      // context, and the band and the kit play into its music bus (music → master → limiter) through `bus`.
      const graph = (() => { try { return SoundKit.graph(); } catch { return null; } })();
      audioCtx = graph?.ctx ?? null;
      bus = null;
      if (graph) { bus = graph.ctx.createGain(); bus.connect(graph.music); }
      if (!audioCtx) console.warn('[FEL-DANCE] no AudioContext — judging on the frame clock (drift possible).');
      clock = new SongClock();
      holdObs = ctx.scene.onBeforeRenderObservable.add(() => syncHold(ctx));
      if (typeof document !== 'undefined') {
        onVisibility = () => syncHold(ctx);
        document.addEventListener('visibilitychange', onVisibility);
      }
      if (process.env.NODE_ENV === 'development') {
        // MUSIC-SUITE P2 probe seam (dev only, like stagePosture above): a probe that times a press "on the beat" needs
        // the song clock's mapping — song time is not the audio clock once the game has been held (READY counts too)
        const dev = (window as unknown as { __FEL_DEV__?: { danceClock?: unknown } }).__FEL_DEV__;
        if (dev) {
          dev.danceClock = {
            audioNow: () => audioNow(),
            song: () => clock.song(audioNow()),
            heard: () => clock.song(audioNow()) - latencySec,
            /** The audio time the judge's heard clock reads `t` (a press then is judged at exactly t). */
            audioForHeard: (t: number) => clock.audio(t + latencySec),
            state: () => ({ paused: clock.paused, pausedTotal: clock.pausedTotal, countingBack: clock.countingBack(audioNow()),
              accepting: clock.accepting(audioNow(), MISS_AFTER), latencySec, latencyFrom, phase, startAt, trig,
              bandSkipped: band?.skipped ?? 0, kitSkipped: kit?.skipped ?? 0 }),
          };
        }
      }

      // The kit loads its stems now (retuned to the picked track later) so the
      // count-in clicks are audible the moment the player locks a track in.
      const deepLink = typeof window !== 'undefined' ? trackFromQuery(window.location.search) : null;
      track = deepLink ?? trackById(DEFAULT_TRACK_ID);
      kit = audioCtx && bus ? new KitPulse(audioCtx, bus, track.bpm, kitPattern(track.id)) : null;
      kit?.setClock((sec) => clock.audio(sec));
      void kit?.load().catch(() => 0);

      ctx.heroRef.current = me.root;
      ctx.objectiveRef.current = me.root.position;
      ctx.camDirector.snapTo(me.root.position, me.root.position);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'dance' });

      if (deepLink) beginCountIn(ctx);       // ?track=<id>: straight to the count-in
      else showPick(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      if (ended) return;
      syncHold(ctx);   // a resume's own events (the resync) must see the count back in
      // MUSIC-SUITE P2 (2026-09-25): ONE PHYSICAL PRESS = ONE JUDGED TAP (SongClock.danceTap). R2 tapped on every event
      // above 0.5 and a pad re-sends it every frame (P1: 57 taps for a 1 s hold); SPACE's depth ramp crossed 0.5 about
      // 0.55 s in and then tapped every frame (23 for 1 s), and its key-UP A was judged 114–195 ms after the press. Now
      // the trigger is edge-latched (a pull from under 0.3 to 0.5, nothing again until it is let go), SPACE taps on its
      // key-down marker, and SPACE's made-up key-up A is ignored. The latch reads every trigger event in every phase, so
      // a trigger held through the count-in (or re-sent by the resume) is not a tap.
      const t = danceTap(trig, e);
      trig = t.latch;
      if (phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) movePick(ctx, e.dir === 'right' ? 1 : -1);
        else if (e.t === 'stick' && e.side === 'L') {
          if (!stickLatch && Math.abs(e.x) > 0.6) { stickLatch = true; movePick(ctx, e.x > 0 ? 1 : -1); }
          else if (Math.abs(e.x) < 0.3) stickLatch = false;
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B')) beginCountIn(ctx);
        return;
      }
      if (!t.tap) return;
      if (phase === 'countin') {
        // MUSIC-SUITE P2 FIX PASS (2026-09-25): a tap inside beat 0's early window is a tap on beat 0. This returned for
        // every count-in tap, and the room leaves the count-in on the first frame whose SONG time reaches beat 0 while
        // taps are judged on the HEARD clock, so a tap up to 200 ms early on the first step (every shipped chart starts
        // on beat 0) was dropped and the step expired a MISS. The performance is started when the count-in is armed
        // (update), so hit() takes beat 0 early; earlier count-in taps are counting along, and stay ignored.
        const ac = audioNow();
        if (!clock.accepting(ac, MISS_AFTER)) return;
        const heardNow = clock.song(ac) - latencySec;
        if (countInTapReaches({ countArmed, heard: heardNow, startAt, missAfter: MISS_AFTER })) void perf.hit(heardNow);
        return;
      }
      if (phase !== 'playing') return;
      const a = audioNow();
      if (!clock.accepting(a, MISS_AFTER)) return;   // paused, or counting back in (syncHold)
      // judged on the HEARD clock: the song time the press lands at, minus the latency (the step times are when the
      // band SOUNDS them on the song clock)
      void perf.hit(clock.song(a) - latencySec);   // onJudged already reported it
    },

    update(ctx: ModeContext, dt: number) {
      crowd?.update(dt);
      if (ended) return;

      syncHold(ctx);
      if (phase === 'pick') {
        // A viewer with no controller (or a capture harness) still gets a
        // routine: the default track starts itself after a few seconds.
        // (MUSIC-SUITE P2: pickSec restarts on every browse — movePick.)
        const pt = pickTimer(pickSec, { type: 'tick', dt }, PICK_TIMEOUT_SEC);   // danceRoomFlow: tested in node
        pickSec = pt.sec;
        const flip = Math.floor(pickShownSec / PICK_CAL_FLIP_SEC);
        pickShownSec += dt;
        if (Math.floor(pickShownSec / PICK_CAL_FLIP_SEC) !== flip) ctx.setHud({ round: pickRound() });
        if (pt.start) beginCountIn(ctx);
        return;
      }
      if (clock.paused) return;              // a hidden tab still drawing: the song is held (syncHold)

      // MUSIC-SUITE P2: two clocks from here on, both the song clock (audio time minus the pauses). `now` is SONG time:
      // the band and the kit's grid, and when a step SOUNDS. `heard` is `now` minus latencySec: when the player hears
      // it, which is what the judge, the cue lane, the beat dot and the step clips run on.
      const a = audioNow();
      const now = clock.song(a);
      const heard = now - latencySec;
      const bd = beatDuration(track.bpm);

      if (phase === 'countin') {
        if (!countArmed) {                   // first playing tick: one bar of count-in from NOW
          countArmed = true;
          readLatency();
          startAt = now + bd * 4;
          // MUSIC-SUITE P2 FIX PASS: the judge starts NOW, on beat 0's future time (it fires nothing before it), so a tap
          // in beat 0's early window during the count-in can take it (onInput). It used to start at the flip below.
          perf.start(startAt);
          kit?.countIn(clock.audio(now), 4);
          // MUSIC-SUITE P2: the grid starts now, so beat 0 is queued a lookahead ahead of when it sounds (it was handed
          // over on the first frame past it — up to a frame late, and KitPulse's past-time guard could drop it)
          band?.start(startAt);
          kit?.start(startAt);
        }
        band?.update(now);
        kit?.update(now);
        const remaining = startAt - now;
        if (remaining > 0) {
          ctx.setHud({ banner: `${Math.min(4, Math.ceil(remaining / bd))}` });
          return;
        }
        phase = 'playing';
        // (the judge was started when the count-in was armed, on the song clock's grid — starting it again here would
        // wipe a beat-0 step already taken early in the count-in)
        ctx.setHud({ banner: 'GO', hint: 'Every move family is an instrument — hit on the beat and the band builds' });
        setTimeout(() => ctx.setHud({ banner: '' }), 500);
      }

      perf.update(heard);
      band?.update(now);
      kit?.update(now);

      // the count back in after a pause (syncHold): the beats left to the pause point, then the banner clears once
      const hud: Parameters<ModeContext['setHud']>[0] = {};
      if (clock.countingBack(a)) hud.banner = `${Math.max(1, Math.min(4, Math.ceil(clock.countBackLeft(a) / bd - 1e-9)))}`;
      else if (countBackShown) { countBackShown = false; hud.banner = ''; }

      // The beat pulse — rhythm games show the beat, and it is the honest
      // way to publish timing (published = rendered): a dot that pops on
      // every beat, decaying through it.
      const songBeat = (heard - startAt) / bd;
      if (songBeat >= 0) hud.beatPulse = 1 - (songBeat % 1);

      // THE CUE — the next move and when it lands. Without it the judging
      // is unfair by design (a perfect-cadence beat bot hit 28%: it tapped
      // beats with no step on them). Now the cypher shows its cards — as a
      // LANE of the next few moves (couch-readable, A+ mission #1) plus the
      // one-line "NOW" call the bezel already drew.
      // (MUSIC-SUITE P2: on the heard clock, so a cue reaches the line when its beat reaches the ear)
      const upcoming = perf.upcoming(heard, 6);
      hud.cues = cueLane(upcoming, heard);
      const next = upcoming[0];
      if (next) {
        const clip = DANCE_LIBRARY.find((c) => c.id === next.step.clipId);
        hud.nextStep = clip?.name?.toUpperCase() ?? 'MOVE';
        hud.nextStepIn = Math.max(0, Math.round((next.time - heard) * 100) / 100);
      }
      ctx.setHud(hud);

      // The routine is over one full beat after the last step's window closes,
      // so a final PERFECT is never cut off by the results screen.
      if (songBeat > perf.totalBeats + 1) finish(ctx);
    },

    dispose() {
      releaseSession?.(); releaseSession = null;   // MUSIC-SUITE P2 FIX PASS: the audio session goes back
      perf?.stop();
      crowd?.dispose(); crowd = null;
      posture?.dispose(); posture = null;
      band?.dispose(); band = null;
      kit?.dispose(); kit = null;
      SoundKit.stopAmbient();
      // MUSIC-SUITE P2: the context is SoundKit's now — never close it. The band and the kit took back what they had
      // queued (dispose → cancelFrom) and ducked; the room's bus comes off the music bus once the duck has run.
      const leaving = bus; bus = null;
      if (leaving) setTimeout(() => { try { leaving.disconnect(); } catch { /* already gone */ } }, 400);
      audioCtx = null;
      if (holdObs) { holdObs.remove(); holdObs = null; }
      if (onVisibility && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      onVisibility = null;
      venue?.dispose(); venue = null;
      body = null;
      ended = true;
    },
  };
})();

// HUD fields used: round, score, combo, banner (judgement + final grade),
// beatPulse, energy/energyLabel (MIX), nextStep/nextStepIn, cues (the lane).
//
// The Creator Card `dance` payload (choreographyId + sequence) is already
// defined in M28's CreatorCardTypes — `perf.setRoutine(card.sequence)` is all
// that is needed to play a card's routine instead of a generated one.
