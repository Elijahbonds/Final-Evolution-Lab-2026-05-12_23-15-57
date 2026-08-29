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
// ADAPTATION NOTES (drop-in -> this repo):
//   * ModeContext here exposes heroRef/objectiveRef as MutableRef (.current=),
//     not setter functions; the results screen is ctx.end(outcome,score,stats),
//     not ctx.onGameOver.
//   * There is no shared music AudioEngine singleton with a .context/startTrack.
//     We own a local AudioContext purely as the SONG CLOCK (real audio clock,
//     frame-drop robust). No backing music track is wired yet — SoundKit
//     provides the tick/hit SFX and runMode starts the ambient bed. //TUNE(elijah):
//     wire an authored backing track to this clock when the audio pack lands.
//   * Clip ids register through me.animator.register(group) (the group name IS
//     the id). Mirrored steps play `<id>.M`, which resolves through the merged
//     DANCE_ALIASES table to the mirrored base groups registered at spawn.

import { Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { registerDanceClips, resolveDanceClip } from '../anim/danceClips';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import {
  DancePerformance, generateRoutine, beatDuration, type Judgement, type DanceStep,
} from '../core/DanceCore';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';

const BPM = 96;                 // //TUNE(elijah): routine tempo
const BARS = 16;                // //TUNE(elijah): routine length in bars
const DIFFICULTY: 1 | 2 | 3 = 2; // //TUNE(elijah): 1 easy .. 3 hard

export const DanceMode: ModeDefinition = (() => {
  let me: SpawnedCharacter;
  let venue: VenueHandle | null = null;
  let perf: DancePerformance;
  let registered = new Set<string>();
  let ended = false;
  let countInSec = 0;
  let started = false;
  /** Local AudioContext used ONLY as the song clock (see header). */
  let audioCtx: AudioContext | null = null;

  /** The song clock. Falls back to performance.now() only if no audio context
   *  exists — and says so, because silent fallback to the frame clock is the
   *  bug this mode is most likely to ship with. */
  function audioNow(): number {
    if (audioCtx) return audioCtx.currentTime;
    return performance.now() / 1000;
  }

  function playStep(s: DanceStep): void {
    const id = resolveDanceClip(s.clipId, (x) => registered.has(x));
    // Clips are authored at 120 BPM; rescale so one clip serves every tempo.
    // Mirrored steps play `<id>.M` — resolved via the merged DANCE_ALIASES
    // table to the mirrored base groups registered at character spawn.
    me.animator.play(s.mirrored ? `${id}.M` : id, {
      fadeSec: 0.12,
      speedRatio: BPM / 120,
    });
  }

  function onJudged(ctx: ModeContext, label: Judgement, _pts: number, combo: number): void {
    ctx.setHud({ banner: combo >= 4 ? `${label}  \u00d7${combo}` : label, score: perf.score, combo });
    if (label === 'PERFECT') {
      EffectsKit.burst(ctx.scene, me.root.position.add(new Vector3(0, 1.4, 0)), 'sparks');
      SoundKit.play('uiTick', { pitch: 1.6, volume: 0.35 });
    } else if (label === 'MISS') {
      SoundKit.play('miss', { volume: 0.25 });
    }
    setTimeout(() => ctx.setHud({ banner: '' }), 380);
  }

  function finish(ctx: ModeContext): void {
    if (ended) return;
    ended = true;
    perf.stop();
    const r = perf.result();
    const cleanHits = r.counts.PERFECT + r.counts.GREAT + r.counts.GOOD;
    const rounds = cleanHits + r.counts.MISS;
    ctx.setHud({
      banner: `${'\u2605'.repeat(r.stars)}${'\u2606'.repeat(5 - r.stars)}  ${Math.round(r.accuracy * 100)}%`,
    });
    // Results screen: the timing host reads outcome ('GREAT' => won),
    // stats.hits/stats.rounds for its headline, and score.
    ctx.end(r.stars >= 3 ? 'GREAT' : 'GOOD', r.score, {
      hits: cleanHits,
      rounds,
      stars: r.stars,
      maxCombo: r.maxCombo,
      perfect: r.counts.PERFECT,
      great: r.counts.GREAT,
      good: r.counts.GOOD,
      miss: r.counts.MISS,
    });
  }

  return {
    modeId: 'dance',
    mood: 'nightGame',
    camPreset: 'overShoulder',

    async load(ctx: ModeContext) {
      venue = mountVenue(ctx, 'dance');

      me = await CharacterLibrary.spawn(ctx.scene, SHARED_CFG.heroUrl, {
        // Stand on the stage deck, not in it — podium scale 1.4 -> surface y 0.7.
        position: new Vector3(0, 0.7, 0), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(me.animator, SPORT_CLIP.idle);
      installSafePlay(me.animator, 'dance-me');
      ctx.groundLock?.track(me.root, me.skeleton);
      venue?.hidePlaceholders();

      // Build the dance clips against THIS skeleton (group name IS the id).
      registered = new Set<string>();
      registerDanceClips(ctx.scene, me.skeleton, (id, group) => {
        me.animator.register(group);
        registered.add(id);
      });

      perf = new DancePerformance(BPM);
      perf.setRoutine(generateRoutine({ bars: BARS, difficulty: DIFFICULTY, seed: Date.now() & 0xffff }));
      perf.onStepFired = playStep;
      perf.onJudged = (l, p, c) => onJudged(ctx, l, p, c);

      ended = false; started = false;
      countInSec = beatDuration(BPM) * 4;          // one bar of count-in

      // Song clock: a real AudioContext.currentTime, robust to dropped frames.
      try {
        const AC = (typeof window !== 'undefined')
          ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
        audioCtx = AC ? new AC() : null;
      } catch { audioCtx = null; }
      if (!audioCtx) console.warn('[FEL-DANCE] no AudioContext — judging on the frame clock (drift possible).');

      ctx.heroRef.current = me.root;
      ctx.objectiveRef.current = me.root.position;
      ctx.camDirector.snapTo(me.root.position, me.root.position);
      ctx.setHud({ score: 0, combo: 0, banner: 'GET READY' });
      assertSpawned(ctx.scene, { hero: me.root, minWorldMeshes: 6, modeId: 'dance' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      if (ended || !started) return;
      const tap = (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B'))
        || (e.t === 'trigger' && e.side === 'R' && e.value > 0.5);
      if (tap) {
        void perf.hit(audioNow());   // onJudged already reported it
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;

      if (!started) {
        countInSec -= dt;
        if (countInSec <= 0) {
          started = true;
          void audioCtx?.resume?.();
          perf.start(audioNow());
          ctx.setHud({ banner: 'GO' });
          setTimeout(() => ctx.setHud({ banner: '' }), 500);
        } else {
          ctx.setHud({ banner: `${Math.ceil(countInSec / beatDuration(BPM))}` });
        }
        return;
      }

      const now = audioNow();
      perf.update(now);

      // The routine is over one full beat after the last step's window closes,
      // so a final PERFECT is never cut off by the results screen.
      const elapsedBeats = (now - (perf as unknown as { started: number }).started) / beatDuration(BPM);
      if (elapsedBeats > perf.totalBeats + 1) finish(ctx);
    },

    dispose() {
      perf?.stop();
      SoundKit.stopAmbient();
      if (audioCtx) { void audioCtx.close(); audioCtx = null; }
      venue?.dispose(); venue = null;
      ended = true;
    },
  };
})();

// HUD fields used: score, combo, banner (judgement + final star rating).
//
// The Creator Card `dance` payload (choreographyId + sequence) is already
// defined in M28's CreatorCardTypes — `perf.setRoutine(card.sequence)` is all
// that is needed to play a card's routine instead of a generated one.
