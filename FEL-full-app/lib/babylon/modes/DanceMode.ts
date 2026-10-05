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

import { Vector3, Color3 } from '@babylonjs/core';
import type { Observer, PBRMaterial, Scene, TransformNode } from '@babylonjs/core';
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
import { StemBand, CATEGORY_STEM, type StemCategory } from '../audio/StemBand';
// MUSIC-SUITE P7 (2026-09-29), room-mix-ux: instrument chips replace the top-left MIX bar (energy/energyLabel).
// Pure chip-state module (lib/babylon/dance/ui/InstrumentChips.ts); this file only decides WHICH categories the
// loaded chart calls for (songCategories, read once at lock-in) and reads the band's live level per category —
// the same two inputs onJudged already had for the "X JOINS THE MIX" banner.
import { buildInstrumentChips, encodeInstrumentChips, songCategories } from '../dance/ui/InstrumentChips';
// MUSIC-SUITE P7 (2026-09-29), "your beat" (owner decision #7): a player's exported song carries a real-audio
// payload now (DanceExport.YourSongExport) — YourSongBand renders and plays IT, with FEL's kits filling only the
// parts the song doesn't have, instead of the from-scratch funk band every OTHER track (shipped, or an export saved
// before P7) still dances to.
import { YourSongBand, renderYourSongParts, type YourSongRenderDeps } from '../dance/yourSong';
import { readExportedTrack } from '../music/DanceExport';
import { readDeviceAudio } from '../music/StudioLibrary';
// MUSIC-SUITE P7 (2026-09-29), six-songs: every SHIPPED track now carries a real FEL song (danceTracks.ts reads
// FEL_SONGS). SongStemBand plays its eight recorded stems through the SAME hit/miss gain math and the SAME public
// shape (judge/level/mixLevel/setClock/start/update/rewind/cancelFrom/dispose) StemBand and YourSongBand already
// have, so it drops into every `band?.…` call below with no new branching — only the instrument-family cat/level
// calls in onJudged (already narrowed off YourSongBand by its own instanceof check) need it to match StemBand
// exactly, which it does. songPreviewUrl feeds the pick screen's preview-on-focus; outroRange picks the results
// screen's clip (its own song's last section).
import { SongStemBand } from '../audio/SongStemBand';
import { songPreviewUrl, outroRange } from '../dance/felSongs';
import { KitPulse, kitPattern } from '../audio/KitPulse';
import { SongClock, danceTap, tapLatencySec, type TriggerLatch } from '../audio/SongClock';
import { loadRoomCalibration } from '@/lib/feel/rhythm-calibrate';
// MUSIC-SUITE P2 FIX PASS (2026-09-25): the room's decisions, pure and tested (danceRoomFlow.test.ts), and the audio
// session claimed for this room only (it was set for every mode inside SoundKit).
import { holdAction, countBackFirstBeat, pickTimer, countInTapReaches } from './danceRoomFlow';
import { claimPlaybackSession } from '@/lib/audio/session';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';
// MUSIC-SUITE P8 (2026-09-25), "a stage that performs" (PLAN phase 8, owner decision #8): the beat bus (song clock ->
// beat/bar/phase + cheer events, lib/babylon/dance/beatBus.ts) and the pure camera-framing math it and the judge's
// combo drive (lib/babylon/dance/stageCamera.ts) — see either file's header for why both are pure and tested without
// a browser. `motionPolicy` is the SAME global "reduce flashing" switch JuiceKit's own flash already reads
// (lib/a11y/reducedMotion.ts) — PLAN phase 8 rule (c) wires it into the beat bus's rate limiter too, not just JuiceKit's.
import { BeatBus, beatBob } from '../dance/beatBus';
import { stageCameraFrame, type Vec2 } from '../dance/stageCamera';
import { motionPolicy } from '@/lib/a11y/reducedMotion';
// MUSIC-SUITE P8 (2026-09-25), "…and Stoop on the mic": the Cypher's own block-party MC — NOT THE MIC's hoops cast
// (lib/babylon/audio/mic/cast.ts / MicDirector / ModeMic — court-scoped, a booth two voices share), the same "own
// contract" shape BRAINBRAWL-RESIDUAL gave DOC VOLT (lib/babylon/party/brainBrawlLines.ts). VoiceKit (bank fetch /
// decode / play) and the voice bus (SoundKit's voiceBus, which VoiceKit already routes into) are shared; the script,
// the picking and the never-talk-over-a-judge-window scheduling are this room's own (hostVoice.ts, script/stoop.ts).
import { VoiceKit } from '../audio/mic/VoiceKit';
import { STOOP, stoopLines } from '../audio/mic/script/stoop';
import {
  pickHostLine, mulberry32, newRunSeed, estimateSec, hostCaption, clipId, seenFirstTime, SpeechQueue, stillSpeaking,
  type JudgeWindow, type HostLine,
} from '../audio/mic/hostVoice';
// MUSIC-SUITE P10 (2026-09-29): Stoop's guard looks past a missed step still pending (dance/stoopWindows.ts).
import { stoopJudgeWindows, STOOP_LOOKAHEAD } from '../dance/stoopWindows';

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

/** MUSIC-SUITE P8: decision #8's "still camera" comfort setting — see the `stillCam` field's doc for why this reads
 *  a query param / a localStorage key rather than a settings-screen flag no file in this task's scope can add. */
const STILL_CAMERA_KEY = 'fel-dance-camera';
/**
 * MUSIC-SUITE P10 FIX (2026-09-29): REDUCED MOTION HOLDS THE STAGE CAMERA. Pure (tested in node). P10 made the P8
 * camera move for the first time (applyStageCamera's CameraDirector.update: a ±0.22 m sway every beat, a push, a 0.7 m
 * drop on freezes, a +1.8 m widen on streaks) — and the only thing that could stop it was `?camera=still` or a
 * localStorage key nothing in the app writes. load() read the app/OS reduced-motion policy (lib/a11y/reducedMotion.ts:
 * Profile → MOTION & FLASHES, or the OS setting) for the lamps only (`reduceFlash`), so a Reduced player got still lamps
 * and a camera that swayed on every beat. Before P10 nobody's camera moved, so this is a behaviour change of the newly
 * live camera: FLAGGED. The order: an explicit `?camera=still|move` wins (a shared link, a test), then the stored key
 * ('still' | 'move'), then the motion policy — reduced → still.
 */
export function stillCameraFor(query: string | null, stored: string | null, reducedMotion: boolean): boolean {
  if (query === 'still') return true;
  if (query === 'move') return false;
  if (stored === 'still') return true;
  if (stored === 'move') return false;
  return reducedMotion === true;
}
function stillCameraPref(reducedMotion: boolean): boolean {
  try {
    if (typeof window === 'undefined') return reducedMotion;
    const q = new URLSearchParams(window.location.search).get('camera');
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(STILL_CAMERA_KEY); } catch { /* storage blocked: the policy decides */ }
    return stillCameraFor(q, stored, reducedMotion);
  } catch { return reducedMotion; }
}

/**
 * MUSIC-SUITE P8 FIX (2026-09-25): "GOOD no longer drags the dancer off the grid." Pure — the decision (and its
 * bound) needs no live rig to test. `bodySpeedFor` (danceTracks.ts) says a GOOD/GREAT hit drags the current clip's
 * speed to 85%/95%; this says for how LONG that drag is allowed to run before update() restores full tempo. It used
 * to be "until the next step" (playStep's own speed reset) — fine for a short step, but an 8-beat step (the
 * captured windmill / six-step, which drive MoveRootLayer's real root track) held at 0.85× for its entire remaining
 * length falls ~1.2 beats behind the grid (the design audit's "A GOOD drags the rest of the step off the grid",
 * understand-wf_3a55346f-032.json:1705) — and for those two moves the dancer is visibly turned/lowered off the
 * stage mark for that whole extra stretch, not merely late. Bounded to STAGE_BEAT_SEC: the SAME window every other
 * judgement reaction in this file already owns the body for (see beatUntil), so a GOOD still visibly drags for one
 * readable beat-reaction and then the step (and any root track riding it) catches back toward the grid instead of
 * running its whole remainder under tempo. Returns null for a clean hit (no drag) or a MISS (its own stumble path).
 * TUNED FEEL NUMBER: the cap's duration is new; bodySpeedFor's 0.85×/0.95× drag AMOUNTS are untouched (owner-tuned).
 */
export function dragFor(label: Judgement, currentClip: string | null, nowSec: number): { clip: string; untilSec: number } | null {
  if (!currentClip || label === 'MISS') return null;
  const spd = bodySpeedFor(label);
  if (spd >= 1) return null;
  return { clip: currentClip, untilSec: nowSec + STAGE_BEAT_SEC };
}

/**
 * MUSIC-SUITE P8 FIX: "the dancer celebrates at the end of every run, even a 1-star one" (design audit —
 * understand-wf_3a55346f-032.json:1697-1701: `bio.celebrating = ended` was unconditional, and `bio.dejected` — a
 * field StagePostureInput already had, with StagePosture.stageWindow already branching `if (i.dejected) return
 * 'dejected'` — was never set from here). Pure: the celebrate/dejected split needs no live rig to test. finish()
 * sets `bio.dejected` once (grade === 'D'); the posture builder reads it back every frame through this.
 */
export function celebratingFor(ended: boolean, dejected: boolean): boolean {
  return ended && !dejected;
}

/**
 * MUSIC-SUITE P8 FIX (2026-09-29): should resultBeat's own GREAT punch actually flash the screen? Extracted from
 * resultBeat (see its own doc) so the exact "an S grade drops this flash in favour of the louder gradeS cheer,
 * rather than stacking two near-identical whiteouts" decision is directly testable, without a live BeatBus (whose
 * own rate limit is a SEPARATE, ADDITIONAL gate — `cheerAllowsFlash` is beatBus.cheer(...)'s own `.flash` result,
 * already folding that budget in) or JuiceKit.
 */
export function resultFlashFor(great: boolean, cheerAllowsFlash: boolean, skipOwnFlash: boolean): boolean {
  return great && cheerAllowsFlash && !skipOwnFlash;
}

/**
 * MUSIC-SUITE P8 FIX (2026-09-29): keeps a ground offset from the dancer's root (what `stageCameraFrame` returns —
 * `frame.groundOffset`, before `applyStageCamera` turns it into a world position) clear of a slim band around
 * `ringRadius` — the Onlookers ring `load()` spawns around the dancer at exactly that radius, and this stage
 * camera's own distance range (stageCamera.ts's `minDistanceM`..`maxDistanceM`, 3.2-8 m) straddles it with no
 * occlusion pass of its own (CameraDirector's `mode === 'fixed'` branch skips `resolveOcclusion`/`clampToBounds`/
 * `enforceStandoff` entirely — see applyStageCamera's own comment for why this does not simply call those instead).
 *
 * If the offset's own distance from the origin already sits inside `[ringRadius - clearance, ringRadius +
 * clearance]`, it is pushed radially (same direction, same angle — a beat's lateral SWAY is never touched, only the
 * distance) to whichever edge of that band it started closer to, so the camera does not ease continuously past an
 * onlooker positioned at nearly the same angle as it grazes through that exact radius (a beat push easing in, or a
 * streak's widen ramping up, both move `distanceM` continuously through the same range this ring occupies).
 * Left alone (returned unchanged) outside the band, and when the offset is degenerate (distance ~0).
 *
 * Pure: no Babylon/scene needed, so DanceCameraRing.test.ts exercises this exact math directly.
 */
export function nudgeClearOfRing(offset: Vec2, ringRadius: number, clearance: number): Vec2 {
  const dist = Math.hypot(offset.x, offset.z);
  if (dist < 1e-4) return offset;
  const lo = ringRadius - clearance, hi = ringRadius + clearance;
  if (dist <= lo || dist >= hi) return offset;
  const target = dist - ringRadius < 0 ? lo : hi;
  const scale = target / dist;
  return { x: offset.x * scale, z: offset.z * scale };
}

/**
 * MUSIC-SUITE P10 (2026-09-29): the cypher's ring of onlookers, with the AUDIENCE SIDE left open. The ring is 16 bodies
 * at `radius` round the dancer (SCORECARD VISUALS, 2026-09-15: "a cypher IS the circle of people around the dancer"),
 * and two of them (slots 7 and 8: 167.8° and 190.3°) stood 0.8–1.0 m either side of the one line P8's front-audience
 * camera films down (dancer → AUDIENCE, 180°), 4.5 m out. While that camera never moved (it sat at 5.2 m, 0.7 m behind
 * them, and they fell outside its frame) nobody saw them; once it moved (the P10 fix in applyStageCamera) the streak
 * widen (7.1 m) and every freeze put a body between the camera and the dancer — measured live on :3121, the left third
 * of the 16:9 streak and freeze frames was one onlooker's back (p10/scorecard-perf/stage/*-streak.png / *-freeze.png,
 * before this). A real cypher filmed from the front opens to the camera, so this leaves out every slot within `gapRad`
 * of the audience direction. Everything else (count, radius, phase, facing) is the ring it was.
 * NEW TUNED NUMBER (flag): the gap's half-width. 0.35 rad (~20°) drops exactly slots 7 and 8 — the two measured in the
 * frame — and keeps the pair at 33° / 35° (2.5–2.6 m off the line: at the widest 16:9 shot they stand at the frame's
 * edges, framing it, where slot 8 stood 17° off the axis — a third of the way in from the left edge).
 * Pure: danceStageCameraDrive.test.ts checks every kept body stands outside the central 90 % of the widest shot.
 */
export function onlookerRing(count: number, radius: number, phaseRad: number, audience: Vec2, gapRad: number): Vec2[] {
  const toAudience = Math.atan2(audience.x, audience.z);   // the same sin/cos(angle) convention the slots use
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + phaseRad;
    const d = Math.abs(Math.atan2(Math.sin(a - toAudience), Math.cos(a - toAudience)));
    if (d < gapRad) continue;
    out.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius });
  }
  return out;
}
/** MUSIC-SUITE P10: onlookerRing's gap half-width (radians) — see its doc. NEW TUNED NUMBER. */
export const ONLOOKERS_AUDIENCE_GAP = 0.35;

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
  /** The Class of 3000 layer: the band your dancing builds. MUSIC-SUITE P7: a YourSongBand for YOUR exported song
   *  (its own rendered audio), a SongStemBand for a SHIPPED FEL song (track.song — six-songs), else the synth
   *  StemBand (a pre-P7 export with no real-audio payload). */
  let band: StemBand | YourSongBand | SongStemBand | null = null;
  let bandJoined = new Set<string>();
  /** MUSIC-SUITE P7 (six-songs): true while the locked-in track is one of the six FEL songs — CONTRACT.md §7: "the
   *  rendered bed replaces KitPulse's 808 floor for these songs; with both, the kick doubles." Only gates the 808's
   *  own continuous grid (start/update, below); its count-in clicks (countIn/rewind) stay on for every track, song
   *  or not — the stems have no pre-roll of their own to click against. */
  let isSongTrack = false;
  /** MUSIC-SUITE P7 (2026-09-29): every stem id, in a fixed order (the chip row never reshuffles frame to frame). */
  const STEM_ORDER = Object.keys(CATEGORY_STEM) as StemCategory[];
  /** Which stem categories the CURRENT chart calls for (InstrumentChips.songCategories) — set once per track
   *  lock-in (beginCountIn), from the exact routine handed to perf.setRoutine (a shipped seed or an exported "your
   *  song" chart resolve through the same DANCE_LIBRARY lookup either way). A category outside this set is FEL's:
   *  the player cannot earn it this run, because nothing in the chart ever asks for it. */
  let inSongCats = new Set<string>();
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
  // ── MUSIC-SUITE P8 (2026-09-25), "a stage that performs" ──
  /** The song clock -> beat/bar/phase + cheer bus every stage visual reads (beatBus.ts). Built once per load, retuned
   *  to the locked-in track's tempo the instant the count-in arms `startAt` (update()) — same moment the judge, the
   *  band and the kit itself all learn it. */
  let beatBus: BeatBus | null = null;
  /** The DANCE_LIBRARY category of the step currently playing (set in playStep, beside currentClip) — 'freeze' drops
   *  the stage camera low. Not reset on a MISS: a stumbled freeze still reads as "was a freeze" for the shot. */
  let currentCategory: string | null = null;
  /** The venue's lamp / banner (today's stand-in for the LED wall — MESHY-PROMPTS.md) / podium materials, with the
   *  unpulsed base colour each was built with. Gathered once the venue mounts (load()); the beat bus's bob and cheer
   *  glow are multiplied onto these every frame, never baked into the base so a paused song holds them steady too. */
  let pulsables: { mat: PBRMaterial; base: Color3 }[] = [];
  /** Decision #8's comfort setting ("a comfort setting 'still camera' disables the motion") — read once per load,
   *  the same convention placeLooks.ts's `?place=` and reducedMotion.ts's `?motion=` already use. assumption: no
   *  settings screen reaches this room yet; `?camera=still` / `?camera=move` is the read side, ready for either a
   *  future toggle or a shared link (stillCameraPref, below). */
  let stillCam = false;
  /** PLAN phase 8 rule (c): "a 'reduce flashing' setting that stops lamp/LED strobing" — the SAME global switch
   *  JuiceKit's flash() already reads (motionPolicy().flash), cached once per load rather than read every frame:
   *  osPrefersReducedMotion() opens a fresh MediaQueryList per call, too costly for a 60 fps read. Zeroes the ambient
   *  beat-bob outright (not merely dims it — the rule says STOPS) on top of gating beatBus's own cheer flashes. */
  let reduceFlash = false;
  const bio: StagePostureInput = { ...STAGE_INPUT_IDLE };
  /** The judgement beat's wall clock (short: the next step must be able to take the body back). */
  let beatUntil = 0;
  /** MUSIC-SUITE P8 FIX: the clip a GOOD/GREAT's drag is currently applied to, and until when (song-time) — set by
   *  onJudged via `dragFor` (module scope, above; its own doc has the measurement and the reasoning), cleared by
   *  update() once song time passes dragUntil. */
  let dragClip: string | null = null;
  let dragUntil = 0;
  /** Where the dancer performs TO. The stage faces −z (the body spawns at yaw π), so the room is in front of it. */
  const AUDIENCE = new Vector3(0, 1.7, -6);
  /** The Onlookers ring's own radius (load(), below) — hoisted so the stage camera (applyStageCamera) can keep its
   *  own distance clear of it instead of the two ever silently drifting apart. */
  const ONLOOKERS_RADIUS = 4.6;
  /** MUSIC-SUITE P8 FIX (2026-09-29): half-width of the exclusion band applyStageCamera keeps clear around
   *  ONLOOKERS_RADIUS — see that function's own comment for why this exists and what it does not fully solve. */
  const ONLOOKERS_CLEARANCE = 0.6;
  /** MUSIC-SUITE P10 (2026-09-29): the velocity handed to CameraDirector.update from applyStageCamera — its fixed branch
   *  reads only the subject (and an objective, here none), so this is never read; one shared zero, not one per frame. */
  const STAGE_CAM_NO_VELOCITY = new Vector3(0, 0, 0);
  /** A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): one results punch per routine. */
  let resultLatch = false;
  /** MUSIC-SUITE P7 (six-songs): the pick screen's preview.mp3, playing while its song is focused (playPreview /
   *  stopPreview, below). Plain HTMLAudioElement — see playPreview's own comment for why. */
  let previewAudio: HTMLAudioElement | null = null;

  // ── MUSIC-SUITE P8 (2026-09-25), Stoop — the Cypher's own MC (see the import block's header) ──
  /** This run's line-picking order: a fresh seed every load() (hostVoice's own lesson: never a fixed one — the
   *  ModeMic.ts comment it quotes is "a fixed seed opened every session with the same shouts"). */
  let stoopRnd = mulberry32(newRunSeed());
  /** The last line id said at each moment (never repeat back to back — hostVoice.pickHostLine). */
  let stoopLast = new Map<string, string>();
  /** A line waiting for a clear beat (never talks over a judge window — hostVoice.SpeechQueue). Flushed every
   *  update() tick via pollStoop(), so it speaks the instant its whole span clears the next step's judge window. */
  let stoopQueue = new SpeechQueue<HostLine>();
  /** The caption (ctx.setHud mic/micWho, drawn by components/games/mic-caption.tsx's shared <MicCaption> — wired in
   *  components/games/timing-babylon.tsx) holds until this song-clock time, whether the line was queued or spoken
   *  immediately (speakStoopNow: the pick screen's open/new-dancer lines, and the results screen's grade lines —
   *  no judge window exists at either edge of a run, so there is nothing to queue for). */
  let stoopCaptionUntil = 0;
  /** MUSIC-SUITE P8 FIX (2026-09-29): the song-clock time (stoopClock()) the line Stoop is CURRENTLY playing is
   *  expected to finish. stoopWindows() only ever guarded against the NEXT judged step's window — nothing tracked
   *  whether Stoop himself was still mid-line, so two of his own successive moments (queued on back-to-back ticks,
   *  e.g. dance.walkout then dance.countin at the top of every count-in) could dequeue and play seconds apart:
   *  VoiceKit.play's channel:'booth' handling unconditionally hard-stops whatever is still on the booth channel
   *  (VoiceKit.ts:71), cutting the first line off almost before it started. pollStoop() now treats "Stoop is still
   *  speaking" as an implicit judge-like window it must wait out too, the same way it already waits out perf's —
   *  rather than leaning on VoiceKit's stop-then-play, which was written for THE MIC's court MC/sidekick hand-off. */
  let stoopSpeakingUntil = 0;
  /** dance.missstreak fires once per streak (at exactly 3), not on every miss past it. */
  let missStreak = 0;
  /** device-local, once ever: dance.newdancer instead of dance.open on this player's first pick screen. */
  const DANCE_SEEN_KEY = 'fel:dance:seen';

  /** GREAT (stars >= 3): a latched match-class punch — hit-stop + shake + gold flash. GOOD: a softer shake only. No
   *  slowMo.
   *
   *  MUSIC-SUITE P8 FIX (2026-09-29): this used to call ctx.juice.flash directly, outside beatBus's own bookkeeping
   *  entirely — so an S grade (which, in practice, is almost always also a >=3-star "great" run) fired THIS flash
   *  AND the 'gradeS' cheer's own flash (finish(), a few lines later) at the same instant: two near-identical gold
   *  whiteouts stacked on top of each other, neither call aware the other had happened. `skipOwnFlash` is `true`
   *  exactly when finish() already knows the louder 'gradeS' cheer is about to fire of its own accord — this drops
   *  the smaller, redundant flash in favour of that one (the finding's own suggested fix), rather than trying to
   *  make two independent rate-limited flashes agree not to land in the same 1s window (beatBus's `maxFlashPerSec`
   *  guards against a FLASH STORM, not against two specific named cheers landing on the very same tick — it would
   *  still allow both through). The cheer itself is still recorded either way (still feeds the crowd/lamp glow,
   *  still costs one unit of the rate budget for whatever flash DOES happen in the next second) — only the screen
   *  flash is conditionally skipped. `now` is the same `clock.song(audioNow())` finish() reads for the gradeS
   *  cheer, so both share one clock as well as one counter. */
  function resultBeat(ctx: ModeContext, great: boolean, now: number, skipOwnFlash: boolean): void {
    if (resultLatch) return; resultLatch = true;
    if (great) {
      ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160);
      const canFlash = beatBus?.cheer('resultGreat', now, 1).flash ?? false;
      if (resultFlashFor(great, canFlash, skipOwnFlash)) ctx.juice.flash('#FFD700', 140);
      console.info('[DANCE-JUICE] great punch');
    }
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

  // ── MUSIC-SUITE P8 (2026-09-25), Stoop — the Cypher's own MC ──

  function readDanceSeen(): string | null { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(DANCE_SEEN_KEY); } catch { return null; } }
  function writeDanceSeen(v: string): void { try { localStorage.setItem(DANCE_SEEN_KEY, v); } catch { /* storage blocked */ } }

  /** This room's own clock for Stoop's scheduling — the song-heard clock once one exists (matches the judge's own
   *  clock exactly, so a queued line's judge window lines up with the step it is really about to duck under), else
   *  a monotonic fallback for the pick screen (no audio context yet, and nothing to duck under there anyway). */
  function stoopClock(): number { return audioCtx ? clock.song(audioNow()) - latencySec : performance.now() / 1000; }

  /** The judge window(s) Stoop must not start a new line inside right now: only while a chart is actually being
   *  judged (phase 'playing') — the pick screen and the count-in's clicks are not judged beats, so nothing queues
   *  there is ever held back. A short pad (0.12 s) around each upcoming step's own time — perf.upcoming is the same
   *  lookahead the cue lane already reads off.
   *  MUSIC-SUITE P10 (2026-09-29): EVERY upcoming window that has not closed, not just upcoming()[0]. upcoming() lists
   *  pending steps first, and a missed step stays pending ~80 ms past its padded window (MISS_AFTER 0.20 s vs the 0.12 s
   *  pad): the one window this read was already over, so a line started over the NEXT scored step (P9, live on CYPHER:
   *  2 of 8 lines, after a missed double, ran 1.333 s and 0.279 s into the next window). dance/stoopWindows.ts passes
   *  over the stale ones and guards the live steps behind them (STOOP_LOOKAHEAD of them, so a missed double's two
   *  stale steps can never crowd the live one out); stoopWindows.test.ts replays that missed double. */
  function stoopWindows(heardNow: number): JudgeWindow[] {
    if (phase !== 'playing' || !perf) return [];
    return stoopJudgeWindows(perf.upcoming(heardNow, STOOP_LOOKAHEAD), heardNow);
  }

  /** Queue a Stoop line for `moment` (hostVoice.SpeechQueue) — for anything said WHILE a chart may be judging (the
   *  walk-out, the count-in, a streak, an earned instrument, a miss streak, the GO-beat opener): it waits for a gap
   *  rather than talk over a step's judgement. Silently a no-op when Stoop has no lines for the moment (never — every
   *  DANCE_MOMENTS id is scripted, script/stoop.test — but a future moment added to one file and not the other must
   *  never throw the room down). */
  function queueStoop(moment: string): void {
    const pool = stoopLines(moment);
    if (!pool.length) return;
    const line = pickHostLine(pool, stoopRnd, stoopLast.get(moment));
    stoopLast.set(moment, line.id);
    stoopQueue.push(line, VoiceKit.line(clipId(STOOP, line))?.sec ?? estimateSec(line.text), stoopClock());
  }

  /** Speak a Stoop line for `moment` RIGHT NOW, bypassing the queue — only for the two edges of a run where no judge
   *  window exists to duck under: the pick screen (open / new-dancer, before any chart is judging) and the results
   *  screen (top-grade / low-grade, after judging has stopped for good in finish() — ended is already true there, so
   *  update()'s early return means pollStoop() would never get a chance to flush a queued line). */
  function speakStoopNow(ctx: ModeContext, moment: string): void {
    const pool = stoopLines(moment);
    if (!pool.length) return;
    const line = pickHostLine(pool, stoopRnd, stoopLast.get(moment));
    stoopLast.set(moment, line.id);
    playStoopLine(ctx, line, stoopClock());
  }

  /** Actually play a picked line: the caption (hostVoice.hostCaption — the same {mic, micWho} shape ModeMic's own
   *  captions use, drawn by the shared <MicCaption>) goes up whether or not the clip itself plays (muted, no bank
   *  yet, no Web Audio at all — VoiceKit.play resolves false and the words still land, same as ModeMic.showCaption),
   *  and the Cypher's own PA preset (VoiceKit.PA_PRESETS.cypher) colours the clip. */
  function playStoopLine(ctx: ModeContext, line: HostLine, now: number): void {
    const clip = clipId(STOOP, line);
    const sec = VoiceKit.line(clip)?.sec ?? estimateSec(line.text);
    const cap = hostCaption(STOOP, line, sec);
    ctx.setHud({ mic: cap.mic, micWho: cap.micWho });
    stoopCaptionUntil = now + cap.holdSec;
    // MUSIC-SUITE P8 FIX: `sec` (not the caption's padded `holdSec`) is the clip's own measured/estimated length —
    // the exact span pollStoop must hold the next line out for so this one is never cut off mid-sentence.
    stoopSpeakingUntil = now + sec;
    void VoiceKit.play(
      { cast: STOOP.id, role: 'mc', channel: 'booth', clips: [clip], caption: line.text, speaker: STOOP.name, sec, priority: 2, interrupt: false, pan: 0, gain: 1 },
      'cypher',
    ).catch(() => false);
  }

  /** Every update() tick (every phase — the pick screen's open/new-dancer caption clears here too): flush whatever
   *  Stoop is holding for a clear gap, else clear a caption whose hold has run out.
   *  MUSIC-SUITE P8 FIX: never dequeues while `stoopSpeakingUntil` says he is still mid-line — see that field's own
   *  doc. The queued line simply waits (SpeechQueue.poll's own maxWaitSec still applies if he talks long enough). */
  function pollStoop(ctx: ModeContext): void {
    const now = stoopClock();
    const line = stillSpeaking(now, stoopSpeakingUntil) ? null : stoopQueue.poll(now, stoopWindows(now));
    if (line) playStoopLine(ctx, line, now);
    else if (stoopCaptionUntil && now >= stoopCaptionUntil) { stoopCaptionUntil = 0; ctx.setHud({ mic: '', micWho: '' }); }
  }

  // ── MUSIC-SUITE P8 (2026-09-25), "a stage that performs" ──

  /** Gather the venue's lamp/banner/podium materials once, with their built colour captured before anything pulses
   *  it. Defensive: a look with no lamps, or a venue whose beatProps never populated, simply pulses nothing — the
   *  same "every channel degrades silently" rule lib/feel/sensory-bus.ts documents for itself. */
  function collectPulsables(v: VenueHandle | null): { mat: PBRMaterial; base: Color3 }[] {
    const nodes: TransformNode[] = [
      ...(v?.beatProps?.lamps ?? []), ...(v?.beatProps?.banners ?? []), ...(v?.beatProps?.podium ?? []),
    ];
    const out: { mat: PBRMaterial; base: Color3 }[] = [];
    for (const n of nodes) {
      for (const m of n.getChildMeshes()) {
        const mat = m.material as PBRMaterial | null;
        if (mat?.emissiveColor) out.push({ mat, base: mat.emissiveColor.clone() });
      }
    }
    return out;
  }

  /** How hard the ambient beat-bob brightens the lamps/LED-wall/podium, and how hard a live cheer's glow adds on
   *  top. NEW tuned numbers (PLAN's "flag loudly" rule) — nothing pulsed on the beat in this room before this pass. */
  const LAMP_BOB_GAIN = 0.55;
  const LAMP_CHEER_GAIN = 0.35;

  /** Pulse the stage lamps/LED-wall/podium: the beat bob, plus whatever cheer glow the bus is carrying right now.
   *  `bob` is FORCED TO 0 while `reduceFlash` is on (PLAN phase 8 rule (c): "stops lamp/LED strobing", not merely
   *  dims it). The cheer glow is left alone under that setting — its warmth is not the strobe the rule targets; the
   *  screen-covering FLASH a cheer can trigger is gated separately, inside beatBus.cheer() itself. */
  function pulseStage(beatPhase: number, cheerGlow: number): void {
    if (!pulsables.length) return;
    const bob = reduceFlash ? 0 : beatBob(beatPhase) * LAMP_BOB_GAIN;
    const k = 1 + bob + Math.min(1.5, cheerGlow) * LAMP_CHEER_GAIN;
    for (const p of pulsables) p.mat.emissiveColor = p.base.scale(k);
  }

  /**
   * The front audience camera, one call per frame of the count-in and the song (update()'s two call sites), plus a
   * hard-cut neutral shot for the pick screen: load()'s first frame and, MUSIC-SUITE P10 FIX, backToPick (this doc
   * promised "one static call for the pick screen" that did not exist until then). `beatPhase`/`streak` are 0 outside a live song, which parks the camera at its neutral framing
   * rather than mid-sway. `snap` hard-cuts the camera in (load()'s first frame, the same `true` convention
   * OneVOneMode/DunkMode's own setFixed calls use); every other call eases at CameraDirector's own built-in rate,
   * which IS the "gentle" in decision #8's "a gentle push/sway" — the sway ITSELF is locked to the beat phase, never
   * to dt (stageCamera.ts's header), and this easing is just the camera's ordinary glide toward wherever that phase
   * currently places it.
   *
   * MUSIC-SUITE P8 FIX (2026-09-29): CameraDirector's `mode === 'fixed'` branch (what `setFixed` drives) never calls
   * `resolveOcclusion`/`clampToBounds`/`enforceStandoff` the way its `follow` branch does — this camera had NO
   * protection at all against the Onlookers ring load() spawns at ONLOOKERS_RADIUS around the dancer, and this
   * camera's own operating band (stageCamera.ts's `minDistanceM`..`maxDistanceM`, 3.2-8 m) straddles it. Wiring the
   * follow-tuned occlusion system onto this camera risked every OTHER `setFixed` call in the game (that raycasting
   * pass rotates the camera AROUND its subject to dodge a wall — the wrong shape of fix for a camera that dollies
   * straight along one fixed line); instead, the computed ground offset is nudged clear of a slim band around the
   * ring radius, keeping this dolly from grazing an onlooker's body mid-transition (a beat push easing in, or a
   * streak's widen ramping up) without touching CameraDirector at all. Flagged, not fully closed: this stops the
   * camera clipping a person, but the overall FRAMING once it's nudged (does the shot still read as intended right
   * at the band edge?) has not been checked against a live capture — flag for the owner's eye once one is possible.
   */
  function applyStageCamera(ctx: ModeContext, beatPhase: number, streak: number, cheerGlow: number, snap = false): void {
    const engine = ctx.scene.getEngine();
    const cam = ctx.scene.activeCamera as { fov?: number } | null;
    const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
    const fovRad = typeof cam?.fov === 'number' && cam.fov > 0 ? cam.fov : 0.8;
    const frame = stageCameraFrame({
      dancer: { x: me.root.position.x, z: me.root.position.z },
      audience: { x: AUDIENCE.x, z: AUDIENCE.z },
      aspect, fovRad,
      beatPhase, freeze: currentCategory === 'freeze', streak, stillCamera: stillCam,
    });
    const groundOffset = clearOnlookersRing(frame.groundOffset);
    const pos = new Vector3(me.root.position.x + groundOffset.x, frame.heightM, me.root.position.z + groundOffset.z);
    ctx.camDirector.setFixed(pos, frame.targetHeight, snap);
    // MUSIC-SUITE P10 (2026-09-29): THE STAGE CAMERA NEVER MOVED. setFixed only STORES the shot (CameraDirector.ts:481-486
    // — it moves the camera itself on `snap` alone); the glide toward it and the aim both live in CameraDirector.update's
    // fixed branch (:540-546), and every mode that owns a camera calls that itself each frame (ThreePointMode.ts:1123,
    // OneVOneMode.ts:1673, KarateVSMode.ts:940). DanceMode never did — before P8 it had one snapTo and a still shot, so it
    // did not need to. Measured live on :3121 (scripts/probes/_music-p10-stagecam-diag.mts, WARM UP at 16:9): the shot
    // this function asked for walked 5.39 → 6.66 m as the combo built (the streak widen, the sway ±0.2 m across the line)
    // while the camera sat at load()'s snap for the whole song — 5.200 m flat, 1.59–1.61 m high, aimed level at its own
    // height — so none of P8's DEFAULT_STAGE_CAMERA motion (sway, push, freeze drop, streak widen, aim height) had ever
    // been on screen. One update per stage-camera call: the glide is CameraDirector's own 0.1 lerp (the "gentle" decision
    // #8 asked for), the aim is the dancer + frame.targetHeight. A paused song never reaches the per-frame call (the
    // `clock.paused` return in update()), so the camera still freezes with the stage.
    ctx.camDirector.update(me.root.position, STAGE_CAM_NO_VELOCITY, null);
    pulseStage(beatPhase, cheerGlow);
  }

  /** MUSIC-SUITE P8 FIX (2026-09-29): pushes a ground offset radially to the nearer edge of the exclusion band
   *  around ONLOOKERS_RADIUS if it falls inside that band — see applyStageCamera's own comment. A pure, tiny
   *  function on purpose: DanceCameraRing.test.ts exercises it directly, without any Babylon/scene setup. */
  function clearOnlookersRing(offset: { x: number; z: number }): { x: number; z: number } {
    return nudgeClearOfRing(offset, ONLOOKERS_RADIUS, ONLOOKERS_CLEARANCE);
  }

  /** MUSIC-SUITE P7 (2026-09-29): the chip row, encoded for HudValue (a plain string — ModeHarness's HudValue union
   *  is closed and held, so this rides through it the same way hud.kickZones/hud.rackets already do: the host,
   *  components/games/timing-babylon.tsx, decodes it). `band` null (no AudioContext yet, or the pick screen) reads
   *  every earnable category as ducked at level 0, which is the honest state before a note has ever been judged. */
  function instrumentsHud(): string {
    // MUSIC-SUITE P7 ("your beat"): YourSongBand's chip row is keyed by SONG PART (kick/snare/…), not by StemBand's
    // dance-move categories — buildInstrumentChips takes both the same way (it only ever reads `order` back out of
    // `labels`/`inSong`/`levels`), so the chip UI (InstrumentChips.ts, timing-babylon.tsx) needs no case for either.
    if (band instanceof YourSongBand) {
      const order = band.parts();
      const labels: Record<string, string> = {};
      const inSong = new Set<string>();
      const levels: Record<string, number> = {};
      for (const part of order) {
        labels[part] = band.name(part);
        levels[part] = band.level(part);
        if (!band.isFel(part)) inSong.add(part);   // a FEL-filled part is always 'fel', whatever its level reads
      }
      return encodeInstrumentChips(buildInstrumentChips(order, labels, inSong, levels));
    }
    const levels: Record<string, number> = {};
    for (const cat of STEM_ORDER) levels[cat] = band?.level(cat) ?? 0;
    return encodeInstrumentChips(buildInstrumentChips(STEM_ORDER, CATEGORY_STEM, inSongCats, levels));
  }

  function playStep(s: DanceStep): void {
    const id = resolveDanceClip(s.clipId, (x) => registered.has(x));
    // Mirrored steps play `<id>.M` — resolved via the merged DANCE_ALIASES
    // table to the mirrored base groups registered at character spawn.
    currentClip = s.mirrored ? `${id}.M` : id;
    // MUSIC-SUITE P8: which category this step is — the stage camera drops low on a 'freeze' (decision #8).
    currentCategory = DANCE_LIBRARY.find((c) => c.id === s.clipId)?.category ?? null;
    body?.loop(currentClip, { fadeSec: 0.12, speedRatio: clipSpeed() });
    me.animator.setSpeed(currentClip, clipSpeed());   // the same step twice in a row keeps the loop; a GOOD's drag is undone here
  }

  function onJudged(ctx: ModeContext, label: Judgement, _pts: number, combo: number, step?: DanceStep, deltaMs?: number): void {
    // THE BAND ANSWERS THE DANCING. The judged step's family turns its
    // instrument up (or down) — and when an instrument first joins, the
    // banner says WHO walked in. The Class of 3000 fantasy: you are not
    // dancing TO a track, you are ASSEMBLING one.
    let joinBanner: string | null = null;
    // MUSIC-SUITE P8: Stoop calls a NEW instrument joining (never a drop-out — "Hear that horn? You earned it" makes
    // no sense said of a part leaving), so this tracks the join half of joinBanner separately from its text.
    let instrumentJoined = false;
    if (band instanceof YourSongBand) {
      // MUSIC-SUITE P7 ("your beat"): a dance step carries no per-instrument lane the way a PERFORM note does, so
      // every judged hit — whichever move it was — counts toward the next of YOUR song's own parts joining; a MISS
      // counts toward the newest one dropping. FEL's filled parts are never touched here — they play from the first
      // beat regardless (YourSongBand.has).
      if (label === 'MISS') {
        const dropped = band.miss();
        if (dropped) joinBanner = `${band.name(dropped)} DROPS OUT`;
      } else {
        const joined = band.hit();
        if (joined) { joinBanner = `${band.name(joined)}${band.isFel(joined) ? ' · FEL' : ''} JOINS THE BAND`; instrumentJoined = true; }
      }
    } else if (band && step) {
      const cat = DANCE_LIBRARY.find((c) => c.id === step.clipId)?.category;
      if (cat) {
        const before = band.level(cat);
        band.judge(cat, label);
        const instrument = CATEGORY_STEM[cat];
        if (before === 0 && band.level(cat) > 0 && !bandJoined.has(instrument)) {
          bandJoined.add(instrument);
          joinBanner = `${instrument} JOINS THE MIX`;
          instrumentJoined = true;
        }
      }
    }
    // MUSIC-SUITE P8 FIX (2026-09-29): queueStoop('dance.instrument') USED to happen right here — before the combo
    // streak's own queueStoop('dance.streak') call, further down this same function. SpeechQueue.push() replaces
    // whatever is still waiting with no merge (hostVoice.ts's own doc: "a newer event wins"), and both calls can
    // fire from the SAME judged hit (an instrument joining the mix for the first time landing on an 8/16/24-combo
    // beat), synchronously, before pollStoop() ever gets a tick to flush either one — so the instrument line was
    // silently discarded every time this coincidence happened, even though it is the rarer of the two: an
    // instrument only ever joins ONCE per run (bandJoined, above), while a streak call recurs every 8 combo for the
    // rest of the routine. Moved below the streak's own queueStoop call (this function's own end) so an instrument
    // join, when it coincides with a streak, is the one that survives — the smaller, repeatable announcement is the
    // one silently skipped this one time, not the one-time, more meaningful one. A full fix (both said, in order)
    // would need SpeechQueue to hold more than one pending line, which no other caller of it needs today.
    // MUSIC-SUITE P8: dance.missstreak fires once, right AT three in a row (never on every miss past it — Stoop is
    // encouraging, not nagging), and resets the moment the streak breaks.
    if (label === 'MISS') { missStreak++; if (missStreak === 3) queueStoop('dance.missstreak'); } else missStreak = 0;
    // Shot-feedback legibility, rhythm edition: a miss says WHICH side of
    // the beat you were on.
    const dirTag = label === 'MISS' && typeof deltaMs === 'number'
      ? (deltaMs < 0 ? ' — EARLY' : ' — LATE')
      : '';
    ctx.setHud({
      banner: joinBanner ?? (combo >= 4 ? `${label}  ×${combo}` : `${label}${dirTag}`),
      score: perf.score,
      combo,
      // MUSIC-SUITE P7 (2026-09-29): instrument chips replace the one MIX bar (energy/energyLabel) — one chip per
      // instrument in the current song, lit when earned, dim when ducked, FEL-labelled when the chart never asks
      // for it this run (InstrumentChips.ts).
      instruments: instrumentsHud(),
    });

    // THE BODY ANSWERS THE JUDGEMENT (A+ mission #1). A clean hit dances the
    // move full-out; a GOOD drags it; a MISS on a real step breaks the move
    // into a stumble (the next step's beat picks the routine back up).
    // G5: the judgement is a BODY read, not only a banner
    bio.beat = label === 'MISS' ? 'stumble' : label === 'PERFECT' || label === 'GREAT' ? 'hit' : null;
    beatUntil = performance.now() + STAGE_BEAT_SEC * 1000;
    if (label === 'MISS') {
      // A DANCER'S MISS IS AN OVERBALANCE, not a hit taken (2026-09-15). This played karate_hit_react — a fighter's
      // flinch blended over the running step, which the frame review read as crossed limbs — and nobody is throwing
      // punches in a cypher. `dance_stumble` (danceClips) catches the weight wide and comes back up on the groove.
      if (step) body?.beat('dance_stumble', { fadeSec: 0.08, speedRatio: 1.15 });   // the stumble settles back into the running step
    } else {
      // MUSIC-SUITE P8 FIX: bounded, not "until the next step" — see dragFor's own doc (declared above, module scope).
      const drag = dragFor(label, currentClip, clock.song(audioNow()));
      if (drag) {
        me.animator.setSpeed(drag.clip, clipSpeed() * bodySpeedFor(label));
        dragClip = drag.clip;
        dragUntil = drag.untilSec;
      }
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
    // MUSIC-SUITE P8 (2026-09-25): the beat bus's cheer — a rate-limited, "reduce flashing"-gated SECOND guard on
    // top of JuiceKit's own motionPolicy().flash gate that ctx.juice.flash already reads (PLAN phase 8 rule (c); see
    // beatBus.ts's header for why both exist: a streak milestone and a join landing in the same instant must not
    // stack two whiteouts even with reduced motion off). The crowd (Onlookers.cheer) and the stage lamps/LED-wall
    // glow (pulseStage's cheerGlow term, read in update()) still warm up even on a flash the guard refused — only
    // the screen-covering flash itself is capped. NEW: the streak flash and callout-tied crowd cheer did not exist
    // before this pass; the join flash's own colour/duration ('#f0abfc', 110) is unchanged, only newly rate-gated.
    const cheerAt = clock.song(audioNow());
    if (label !== 'MISS' && combo > 0 && combo % 8 === 0) {
      ctx.juice.callout(`${combo} ON THE BEAT`, '#f0abfc', 700);
      crowd?.cheer(Math.min(1, combo / 16));
      if (beatBus?.cheer('streak', cheerAt, Math.min(1.2, combo / 16)).flash) ctx.juice.flash('#facc15', 90, 0.6);
      queueStoop('dance.streak');   // MUSIC-SUITE P8
    }
    // MUSIC-SUITE P8 FIX (2026-09-29): queued AFTER dance.streak (above), not before — see this function's own
    // comment, up where `instrumentJoined` was first computed, for why the order matters.
    if (instrumentJoined) queueStoop('dance.instrument');
    if (joinBanner) {
      crowd?.cheer(0.6);
      if (beatBus?.cheer('join', cheerAt, 1).flash) ctx.juice.flash('#f0abfc', 110);
    }
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
    // MUSIC-SUITE P8 FIX: "the dancer celebrates at the end of every run, even a 1-star one" (design audit — bio.
    // celebrating was hard-set to `ended`, so a D always got the win pose; bio.dejected existed on StagePosture's own
    // input type and StagePosture.stageWindow already branched on it, it was just never set). D is StagePosture's own
    // worst-grade band (danceTracks.gradeFor: accuracy < 0.5) — the posture builder below reads bio.dejected instead
    // of hard-coding `ended` into celebrating, so a D holds STAGE_POSTURE.dejected (a built pose, chest closed/chin
    // down — never a T-pose) instead of the celebrate pose.
    bio.dejected = grade === 'D';
    // MUSIC-SUITE P7 (six-songs): the results screen plays a short outro — the song's own last section, at the full
    // mastered mix, faded (SongStemBand.playOutro). Independent of anything earned this run: the results screen
    // hears the song finish, not the run's own MIX %. Only for a shipped FEL song (track.song) whose band actually
    // decoded the stems (SongStemBand) — an export's YourSongBand, or the exported track's synth StemBand, has no
    // "song" to play an outro of.
    if (track.song && band instanceof SongStemBand) {
      const { startSec, endSec } = outroRange(track.song);
      const MAX_OUTRO_SEC = 6;
      band.playOutro(startSec, Math.min(endSec - startSec, MAX_OUTRO_SEC));
    }
    // MUSIC-SUITE P8 FIX (2026-09-29): one clock reading, shared by resultBeat's own cheer AND the gradeS cheer
    // below — they used to call clock.song(audioNow()) separately (and resultBeat used no beatBus clock at all), so
    // an S grade (which is, in practice, almost always also a >=3-star "great" result) could register two cheers a
    // fraction of a millisecond apart instead of the same instant the rate limiter is meant to see them as.
    const resultAt = clock.song(audioNow());
    resultBeat(ctx, r.stars >= 3, resultAt, grade === 'S');
    // MUSIC-SUITE P8: the beat bus cheers an S grade (decision #8's list of things the stage cheers on) — same
    // rate-limited/reduce-flashing-gated flash as every other cheer in this room, plus the crowd's own reaction.
    if (grade === 'S') {
      crowd?.cheer(1);
      if (beatBus?.cheer('gradeS', resultAt, 1.5).flash) ctx.juice.flash('#fde047', 160, 1);
    }
    // MUSIC-SUITE P8: Stoop's grade calls — speakStoopNow, not queueStoop: `ended` is already true (above), so
    // update()'s own early return means pollStoop() will never run again to flush anything left in the queue.
    if (grade === 'S') speakStoopNow(ctx, 'dance.topgrade');
    else if (grade === 'D') speakStoopNow(ctx, 'dance.lowgrade');
    ctx.setHud({
      banner: `${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}  ${accuracy}%  ·  GRADE ${grade}  ·  MIX ${mixPct}%`,
      cues: [],
      nextStep: '',
      instruments: '',   // MUSIC-SUITE P7: the chip row goes with the cue lane — the results screen has its own MIX %
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

  /**
   * MUSIC-SUITE P7 (six-songs): the pick screen plays the focused song's own preview.mp3 (CONTRACT.md §3: 16 bars
   * from its first hook, the full mix, mastered on its own). `stopPreview` is "blur" — called before every new
   * focus (a browse) and on leaving the pick screen (a lock-in) or the room (dispose), so exactly one preview is
   * ever playing. A plain HTMLAudioElement, not the Web Audio graph: it is a standalone clip with no judging to stay
   * in sync with, and autoplay policy gates it on a user gesture the SAME way either way — the first call (from
   * load(), before any gesture) fails silently and the very next real gesture (a browse, or A/B to lock in and
   * re-focus after a wrapped-around cycle) retries and succeeds.
   */
  function stopPreview(): void {
    if (previewAudio) { try { previewAudio.pause(); } catch { /* already gone */ } }
    previewAudio = null;
  }

  function playPreview(t: DanceTrack): void {
    stopPreview();
    if (!t.song || typeof Audio === 'undefined') return;   // no song to preview, or a non-browser test/probe env
    try {
      const a = new Audio(songPreviewUrl(t.song.id));
      a.volume = 0.55;
      a.preload = 'auto';
      void a.play().catch(() => { /* no gesture yet on this browse — the next one tries again */ });
      previewAudio = a;
    } catch { /* never let a broken preview take the pick screen down with it */ }
  }

  function showPick(ctx: ModeContext): void {
    playPreview(track);
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
    stopPreview();   // MUSIC-SUITE P7 (six-songs): "blur" — locking a track in leaves the pick screen
    queueStoop('dance.walkout');   // MUSIC-SUITE P8: onto the floor — pollStoop (update()) hands it out next tick

    perf = new DancePerformance(track.bpm);
    // A player's exported song carries its OWN steps — they are the song's drums, and re-rolling them from a
    // seed would discard the only thing the export exists to preserve. Shipped tracks generate as before.
    const mine = stepsFor(track);
    // MUSIC-SUITE P7 (six-songs): mine is non-null for every shipped track too now (stepsFor falls through to
    // stepsForSong), so this generateRoutine call is unreachable for a shipped song — it only still runs for the
    // rare pre-P7 export with steps but no real-audio payload.
    const routine = mine ?? generateRoutine({ bars: track.bars, difficulty: track.difficulty, seed: track.seed });
    perf.setRoutine(routine);
    // MUSIC-SUITE P7 (2026-09-29): which instruments THIS chart calls for, decided once, on the exact array perf
    // just got — before any step fires, so the pick screen's follow-on chip row (instrumentsHud, at 'GO' below) is
    // already right on the first frame of play rather than filling in as the player happens to hit each category.
    inSongCats = songCategories(routine);
    perf.onStepFired = playStep;
    // pass ALL of onJudged's args through — a 3-arg arrow here silently
    // dropped the step (no band motion ever) and the delta (no EARLY/LATE)
    perf.onJudged = (l, p, c, step, deltaMs) => onJudged(ctx, l, p, c, step, deltaMs);

    SoundKit.unlock();   // the shared context: a no-op once running (the harness unlocks it on the first gesture)
    band?.dispose();
    isSongTrack = !!track.song;
    // MUSIC-SUITE P7 ("your beat"): a track that IS your exported song, with a real-audio payload attached
    // (DanceExport.YourSongExport — absent on an export saved before P7), dances to ITS OWN rendered stems
    // (dance/yourSong.ts). MUSIC-SUITE P7 FIX (six-songs, 2026-09-29): gated on `!track.song`, not on `mine` —
    // stepsFor(track) now ALSO answers every SHIPPED track (danceTracks.stepsForSong), so `mine` alone can no
    // longer tell "an export" from "a shipped song" apart; a shipped track still never pays for the extra
    // localStorage read, it just asks its own `song` field instead of asking `mine`.
    const myExport = !track.song ? readExportedTrack() : null;
    if (myExport?.song && audioCtx && bus) {
      const ac = audioCtx;
      const deps: YourSongRenderDeps = {
        readTake: readDeviceAudio,
        decode: (data) => ac.decodeAudioData(data),
        sampleRate: ac.sampleRate,
      };
      band = new YourSongBand(audioCtx, bus, renderYourSongParts(myExport.song, deps));
    } else if (track.song && audioCtx && bus) {
      // MUSIC-SUITE P7 (six-songs): the shipped FEL song's own eight recorded stems, not a synthesized funk band.
      const songBand = new SongStemBand(audioCtx, bus, track.song);
      void songBand.load().catch(() => 0);   // a stem still decoding when start() fires joins later (update())
      band = songBand;
    } else {
      band = audioCtx && bus ? new StemBand(audioCtx, bus, track.bpm) : null;
    }
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
      // MUSIC-SUITE P8 (2026-09-25): `keepGameplayCamera: true` still keeps the venue's own static orbit camera OUT
      // of `scene.activeCamera` — CameraDirector's follow-cam stays the one the player sees; the M104 comment this
      // line used to carry ("keep the over-shoulder follow camera") is the gap decision #8 closes: applyStageCamera
      // (below) now puts the SAME director in 'fixed' mode with a front, audience-side framing instead of an
      // over-shoulder chase — see that function's own doc for why `setFixed` is the right call for a subject that
      // never runs anywhere.
      venue = mountVenue(ctx, 'dance', { keepGameplayCamera: true, look: readPlaceLook('dance') });
      // MUSIC-SUITE P8: the lamp/banner/podium materials this venue built, for the beat bus to pulse — see
      // collectPulsables's doc. Gathered right after the mount; buildProp() builds these synchronously, no
      // load-order race with the CC0 kit props (which DO load async, elsewhere in NexusVenue.ts).
      pulsables = collectPulsables(venue);
      // SCORECARD VISUALS (2026-09-15): a cypher IS the circle of people around the dancer, and the frame review found a
      // lone body on a lit disc in a dark room. The ring watches the floor (the same Onlookers the dojo and the courts use).
      crowd?.dispose(); crowd = null;
      // MUSIC-SUITE P10 (2026-09-29): the ring opens on the audience side, where the stage camera films from — see
      // onlookerRing (module scope) for the two bodies that stood in the camera's shot once it moved.
      crowd = new Onlookers(ctx.scene, onlookerRing(16, ONLOOKERS_RADIUS, 0.18, { x: AUDIENCE.x, z: AUDIENCE.z }, ONLOOKERS_AUDIENCE_GAP)
        .map((p) => new Vector3(p.x, 0, p.z)), '#d946ef', new Vector3(0, 1.2, 0));

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
        // MUSIC-SUITE P8 FIX: `bio.dejected` (set in finish(), grade === 'D') wins over the win pose — see
        // celebratingFor's own doc (module scope, above).
        bio.celebrating = celebratingFor(ended, bio.dejected);
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
      inSongCats = new Set();   // MUSIC-SUITE P7: reset with everything else on load; beginCountIn fills it in per track
      currentCategory = null;   // MUSIC-SUITE P8: reset with everything else — playStep fills it in per step
      dragClip = null; dragUntil = 0;   // MUSIC-SUITE P8 FIX: no stale drag carried from a previous run's last step
      bio.dejected = false;   // MUSIC-SUITE P8 FIX: no stale dejected pose carried from a previous run's D grade
      // MUSIC-SUITE P8: Stoop's own per-run state — a fresh seed and no memory of the last visit's lines, else every
      // visit after the first would pick up rotating exactly where the last one left off.
      stoopRnd = mulberry32(newRunSeed()); stoopLast = new Map(); stoopQueue.clear(); stoopCaptionUntil = 0; stoopSpeakingUntil = 0; missStreak = 0;
      // MUSIC-SUITE P8: read once per load, not every frame — see the `stillCam`/`reduceFlash` fields' own doc.
      // MUSIC-SUITE P10 FIX: one policy read, and Reduced motion now holds the camera too (stillCameraFor's doc).
      const motion = motionPolicy();
      stillCam = stillCameraPref(motion.reduced);
      reduceFlash = !motion.flash;
      beatBus?.dispose();
      beatBus = new BeatBus({ bpm: 120, reduceFlashing: () => reduceFlash });   // retuned to the real track's tempo/startAt in update(), the instant the count-in arms one

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
      void VoiceKit.load([{ cast: STOOP.id, group: STOOP.group }]);   // MUSIC-SUITE P8: fetched, never awaited — a
                                                                        // line said before it lands is caption-only

      ctx.heroRef.current = me.root;
      ctx.objectiveRef.current = me.root.position;
      // MUSIC-SUITE P8 (2026-09-25): the front audience camera (decision #8), hard-cut in for the pick screen's
      // first frame — see applyStageCamera's doc. Replaces the old snapTo(root, root), which pointed the (still
      // over-shoulder-configured) follow camera at the dancer from directly behind.
      applyStageCamera(ctx, 0, 0, 0, true);
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'dance' });

      if (deepLink) beginCountIn(ctx);       // ?track=<id>: straight to the count-in — Stoop's open/walk-out both
                                               // fit a browsed pick screen, not a link dropped straight onto the floor
      else {
        showPick(ctx);
        // MUSIC-SUITE P8: exactly one of the two — a first-ever visit to the Cypher (device-local) hears
        // dance.newdancer instead of dance.open, never both.
        const seen = seenFirstTime(readDanceSeen(), 'newdancer');
        if (seen.first) { writeDanceSeen(seen.next); speakStoopNow(ctx, 'dance.newdancer'); }
        else speakStoopNow(ctx, 'dance.open');
      }
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
      pollStoop(ctx);   // MUSIC-SUITE P8: every phase — flushes a queued line the instant its judge window clears

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

      // MUSIC-SUITE P8 FIX: a GOOD's drag (onJudged) is bounded to dragUntil — restore full tempo the instant song
      // time passes it, on THIS clip only (a new step already reset speed itself in playStep, and if the routine
      // looped back onto the same clip id that's a fresh play() call too — either way currentClip no longer === the
      // dragged one, so this is a no-op past its moment). Checked every tick (not scheduled) because song time can
      // jump on a resume (syncHold's count-back), which a setTimeout would miss entirely.
      if (dragClip) {
        if (now >= dragUntil) {
          if (currentClip === dragClip) me.animator.setSpeed(currentClip, clipSpeed());
          dragClip = null;
        }
      }

      if (phase === 'countin') {
        if (!countArmed) {                   // first playing tick: one bar of count-in from NOW
          countArmed = true;
          readLatency();
          queueStoop('dance.countin');   // MUSIC-SUITE P8: "here it comes, ride the one" — the queue sequences it right after dance.walkout
          startAt = now + bd * 4;
          // MUSIC-SUITE P8: the stage's beat grid learns the same downbeat the judge/band/kit just did.
          beatBus?.retune(track.bpm, startAt);
          // MUSIC-SUITE P2 FIX PASS: the judge starts NOW, on beat 0's future time (it fires nothing before it), so a tap
          // in beat 0's early window during the count-in can take it (onInput). It used to start at the flip below.
          perf.start(startAt);
          kit?.countIn(clock.audio(now), 4);   // the 4-click pre-roll: every track gets it, song or not
          // MUSIC-SUITE P2: the grid starts now, so beat 0 is queued a lookahead ahead of when it sounds (it was handed
          // over on the first frame past it — up to a frame late, and KitPulse's past-time guard could drop it)
          band?.start(startAt);
          // MUSIC-SUITE P7 (six-songs): a shipped song's own bed+drums stems ARE the floor (CONTRACT.md §7) — the
          // 808's own grid stays silent under it (isSongTrack), or its kick would double the song's own kick.
          if (!isSongTrack) kit?.start(startAt);
        }
        band?.update(now);
        if (!isSongTrack) kit?.update(now);
        const remaining = startAt - now;
        if (remaining > 0) {
          ctx.setHud({ banner: `${Math.min(4, Math.ceil(remaining / bd))}` });
          // MUSIC-SUITE P8 FIX (2026-09-29): decision #8 ("front, audience view, moving on the beat") used to go
          // quiet for the entire 4-beat count-in — this early `return` skipped straight past the applyStageCamera
          // call below (after this whole `if (phase === 'countin')` block), leaving the camera and the lamp/podium
          // pulse frozen at load()'s single hard-cut framing (beat 0, streak 0) through every click of the count-in,
          // even though `beatBus.retune()` (a few lines up) already has the count-in's own beat grid live. Reads off
          // the SAME bus/clock the post-count-in code below does, so nothing about the beat math is duplicated here.
          const bp = beatBus?.phase(heard) ?? { beatIndex: 0, beatPhase: 0, barIndex: 0, barPhase: 0 };
          applyStageCamera(ctx, bp.beatPhase, perf.combo, beatBus?.cheerPulse(heard) ?? 0);
          return;
        }
        phase = 'playing';
        // (the judge was started when the count-in was armed, on the song clock's grid — starting it again here would
        // wipe a beat-0 step already taken early in the count-in)
        // MUSIC-SUITE P7: the chip row shows from the first frame of play (every chip dim or FEL, nothing earned yet)
        // rather than waiting for the player's first judged step to publish it at all.
        // MUSIC-SUITE P7 ("your beat"): the hint names what is actually being earned — your song's own parts, not a
        // generic "move family", when the room is playing YourSongBand.
        const goHint = band instanceof YourSongBand
          ? "Your song is the band — hit on the beat and each of your own parts joins it"
          : 'Every move family is an instrument — hit on the beat and the band builds';
        ctx.setHud({ banner: 'GO', hint: goHint, instruments: instrumentsHud() });
        setTimeout(() => ctx.setHud({ banner: '' }), 500);
        // MUSIC-SUITE P8: the GO-beat opener — your own song gets its own call, everything else gets the
        // call-and-response hype (mutually exclusive: exactly one queues, dance.ownsong OR dance.callresponse).
        queueStoop(band instanceof YourSongBand ? 'dance.ownsong' : 'dance.callresponse');
      }

      perf.update(heard);
      band?.update(now);
      if (!isSongTrack) kit?.update(now);   // MUSIC-SUITE P7 (six-songs): the song's own bed+drums stems are the floor

      // the count back in after a pause (syncHold): the beats left to the pause point, then the banner clears once
      const hud: Parameters<ModeContext['setHud']>[0] = {};
      if (clock.countingBack(a)) hud.banner = `${Math.max(1, Math.min(4, Math.ceil(clock.countBackLeft(a) / bd - 1e-9)))}`;
      else if (countBackShown) { countBackShown = false; hud.banner = ''; }

      // The beat pulse — rhythm games show the beat, and it is the honest
      // way to publish timing (published = rendered): a dot that pops on
      // every beat, decaying through it.
      const songBeat = (heard - startAt) / bd;
      if (songBeat >= 0) hud.beatPulse = 1 - (songBeat % 1);

      // MUSIC-SUITE P8 (2026-09-25): the front audience camera + the lamp/LED-wall/podium pulse — the SAME heard
      // clock the beat-pulse dot above reads, so what the camera does and what the HUD shows agree. `perf.combo`
      // drives "wide on streaks"; `currentCategory === 'freeze'` (read inside applyStageCamera) drives "low on
      // freezes". A paused song clock never reaches this line at all (the `clock.paused` return above), so the
      // camera and the stage dressing freeze with everything else — decision #8 + PLAN phase 8 item 1.
      {
        const bp = beatBus?.phase(heard) ?? { beatIndex: 0, beatPhase: 0, barIndex: 0, barPhase: 0 };
        applyStageCamera(ctx, bp.beatPhase, perf.combo, beatBus?.cheerPulse(heard) ?? 0);
      }

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
      stopPreview();   // MUSIC-SUITE P7 (six-songs): leaving the room is a blur too
      stoopQueue.clear(); VoiceKit.stop('booth', 0.12);   // MUSIC-SUITE P8: Stoop never bleeds into the next room
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
      // MUSIC-SUITE P8: the beat bus and the stage pulsables go with the room — a stale material reference held past
      // its venue's dispose would throw the next time pulseStage touched it.
      beatBus?.dispose(); beatBus = null;
      pulsables = [];
      currentCategory = null;
      ended = true;
    },
  };
})();

// HUD fields used: round, score, combo, banner (judgement + final grade),
// beatPulse, instruments (MUSIC-SUITE P7: the chip row — lib/babylon/dance/ui/InstrumentChips.ts encodes it, the
// host decodes it; it replaced energy/energyLabel's one MIX bar), nextStep/nextStepIn, cues (the lane).
//
// The Creator Card `dance` payload (choreographyId + sequence) is already
// defined in M28's CreatorCardTypes — `perf.setRoutine(card.sequence)` is all
// that is needed to play a card's routine instead of a generated one.
