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
//   * Clip ids register through me.animator.register(group) (the group name IS
//     the id). Mirrored steps play `<id>.M`, which resolves through the merged
//     DANCE_ALIASES table to the mirrored base groups registered at spawn.

import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { BeatOwner } from '../anim/beatOwner';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { registerDanceClips, resolveDanceClip, danceRootTracks } from '../anim/danceClips';
import { MoveRootLayer } from '../anim/MoveRootLayer';
import { registerMirroredClips } from '../anim/mirrored-clips';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  DancePerformance, generateRoutine, beatDuration, DANCE_LIBRARY, type Judgement, type DanceStep,
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
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

/** Clips are authored at 120 BPM; the animator rescales them per track. */
const CLIP_REF_BPM = 120;

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
  /** Audio-clock time the routine's beat 0 lands (set when the count-in begins). */
  let startAt = 0;
  /** Local AudioContext used ONLY as the song clock (see header). */
  let audioCtx: AudioContext | null = null;
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

  /** The song clock. Falls back to performance.now() only if no audio context
   *  exists — and says so, because silent fallback to the frame clock is the
   *  bug this mode is most likely to ship with. */
  function audioNow(): number {
    if (audioCtx) return audioCtx.currentTime;
    return performance.now() / 1000;
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
      if (step) body?.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08, speedRatio: 1.15 });   // the stumble settles back into the running step
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

  function showPick(ctx: ModeContext): void {
    ctx.setHud({
      round: track.blurb.toUpperCase(),
      banner: pickBanner(track),
      nextStep: '◀ ▶  TRACK   ·   A  START',        // short: on a phone this panel sits beside the TAP button
      nextStepIn: null,
      score: 0,
      combo: 0,
    });
  }

  function movePick(ctx: ModeContext, dir: 1 | -1): void {
    track = cycleTrack(track.id, dir);
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

    void audioCtx?.resume?.();
    band = audioCtx ? new StemBand(audioCtx, audioCtx.destination, track.bpm) : null;
    bandJoined = new Set();
    kit?.retune(track.bpm, kitPattern(track.id));

    // The clock is armed on the first PLAYING tick (update), not here: on a
    // deep link this runs inside load(), before the harness's own 3-2-1, and
    // a bar armed now would be spent before the player ever saw it.
    startAt = 0;
    ctx.setHud({ round: track.name, banner: '4', nextStep: '', nextStepIn: null });
    console.log(`[FEL-DANCE] track ${track.id} ${track.bpm}bpm ${track.bars} bars d${track.difficulty} · kit voices ${kit?.voices ?? 0}`);
  }

  return {
    modeId: 'dance',
    mood: 'nightGame',
    camPreset: 'overShoulder',

    async load(ctx: ModeContext) {
      venue = mountVenue(ctx, 'dance', { keepGameplayCamera: true });   // M104 gap: keep the over-shoulder follow camera, not the venue orbit

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

      // Song clock: a real AudioContext.currentTime, robust to dropped frames.
      try {
        const AC = (typeof window !== 'undefined')
          ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
        audioCtx = AC ? new AC() : null;
      } catch { audioCtx = null; }
      if (!audioCtx) console.warn('[FEL-DANCE] no AudioContext — judging on the frame clock (drift possible).');

      // The kit loads its stems now (retuned to the picked track later) so the
      // count-in clicks are audible the moment the player locks a track in.
      const deepLink = typeof window !== 'undefined' ? trackFromQuery(window.location.search) : null;
      track = deepLink ?? trackById(DEFAULT_TRACK_ID);
      kit = audioCtx ? new KitPulse(audioCtx, audioCtx.destination, track.bpm, kitPattern(track.id)) : null;
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
      if (phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) movePick(ctx, e.dir === 'right' ? 1 : -1);
        else if (e.t === 'stick' && e.side === 'L') {
          if (!stickLatch && Math.abs(e.x) > 0.6) { stickLatch = true; movePick(ctx, e.x > 0 ? 1 : -1); }
          else if (Math.abs(e.x) < 0.3) stickLatch = false;
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B')) beginCountIn(ctx);
        return;
      }
      if (phase !== 'playing') return;
      const tap = (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B'))
        || (e.t === 'trigger' && e.side === 'R' && e.value > 0.5);
      if (tap) {
        void perf.hit(audioNow());   // onJudged already reported it
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;

      if (phase === 'pick') {
        // A viewer with no controller (or a capture harness) still gets a
        // routine: the default track starts itself after a few seconds.
        pickSec += dt;
        if (pickSec >= PICK_TIMEOUT_SEC) beginCountIn(ctx);
        return;
      }

      const now = audioNow();
      const bd = beatDuration(track.bpm);

      if (phase === 'countin') {
        if (startAt === 0) {                 // first playing tick: one bar of count-in from NOW
          startAt = now + bd * 4;
          kit?.countIn(now, 4);
        }
        const remaining = startAt - now;
        if (remaining > 0) {
          ctx.setHud({ banner: `${Math.min(4, Math.ceil(remaining / bd))}` });
          return;
        }
        phase = 'playing';
        perf.start(startAt);                 // the grid is the audio clock's, not this frame's
        band?.start(startAt);
        kit?.start(startAt);
        ctx.setHud({ banner: 'GO', hint: 'Every move family is an instrument — hit on the beat and the band builds' });
        setTimeout(() => ctx.setHud({ banner: '' }), 500);
      }

      perf.update(now);
      band?.update(now);
      kit?.update(now);

      // The beat pulse — rhythm games show the beat, and it is the honest
      // way to publish timing (published = rendered): a dot that pops on
      // every beat, decaying through it.
      const songBeat = (now - startAt) / bd;
      const hud: Parameters<ModeContext['setHud']>[0] = {};
      if (songBeat >= 0) hud.beatPulse = 1 - (songBeat % 1);

      // THE CUE — the next move and when it lands. Without it the judging
      // is unfair by design (a perfect-cadence beat bot hit 28%: it tapped
      // beats with no step on them). Now the cypher shows its cards — as a
      // LANE of the next few moves (couch-readable, A+ mission #1) plus the
      // one-line "NOW" call the bezel already drew.
      const upcoming = perf.upcoming(now, 6);
      hud.cues = cueLane(upcoming, now);
      const next = upcoming[0];
      if (next) {
        const clip = DANCE_LIBRARY.find((c) => c.id === next.step.clipId);
        hud.nextStep = clip?.name?.toUpperCase() ?? 'MOVE';
        hud.nextStepIn = Math.max(0, Math.round((next.time - now) * 100) / 100);
      }
      ctx.setHud(hud);

      // The routine is over one full beat after the last step's window closes,
      // so a final PERFECT is never cut off by the results screen.
      if (songBeat > perf.totalBeats + 1) finish(ctx);
    },

    dispose() {
      perf?.stop();
      posture?.dispose(); posture = null;
      band?.dispose(); band = null;
      kit?.dispose(); kit = null;
      SoundKit.stopAmbient();
      if (audioCtx) { void audioCtx.close(); audioCtx = null; }
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
