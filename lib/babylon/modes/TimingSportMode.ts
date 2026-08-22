// TimingSportMode — the config family for timing-window sports: tennis (swept
// racket — NO tunneling), penalty shootout, home-run derby, golf. One loop:
// incoming/setup → swing window → contact via sweptHit → ball flight → score.

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';
import { BallSim, arcVelocity } from '../core/BallPhysics';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { VenueKit } from '../visual/VenueKit';
import { EffectsKit } from '../visual/EffectsKit';
import type { TimingSportConfig } from './modeConfigs';

export function makeTimingSportMode(cfg: TimingSportConfig): ModeDefinition {
  let athlete: SpawnedCharacter;
  let ball: AbstractMesh, sim: BallSim;
  let round = 0, hits = 0, scoreVal = 0;
  let phaseT = 0, state: 'incoming' | 'flight' | 'between' = 'between';
  let swinging = false, aimX = 0;

  function serve(ctx: ModeContext): void {
    round++;
    state = 'incoming'; phaseT = 0; swinging = false;
    const from = cfg.ballFrom.clone();
    from.x += (Math.random() - 0.5) * cfg.ballSpread;
    sim.launch(from, arcVelocity(from, cfg.contactPoint, cfg.ballApex));
    ctx.setHud({ round: `${round}/${cfg.rounds}`, hint: cfg.hint });
  }

  function swing(ctx: ModeContext): void {
    if (swinging || state !== 'incoming') return;
    swinging = true;
    athlete.animator.play(cfg.swingClip, {
      onEnd: () => athlete.animator.play(cfg.idleClip, { loop: true }),
    });
  }

  return {
    modeId: cfg.modeId, mood: cfg.mood, camPreset: 'court',

    async load(ctx) {
      const preset = cfg.modeId === 'golf' ? 'golf'
        : cfg.modeId === 'tennis' ? 'tennis'
        : cfg.modeId === 'derby' ? 'ballpark'
        : 'pitch';
      VenueKit.buildField(ctx.scene, preset);
      EffectsKit.ambient(ctx.scene, preset === 'ballpark' || preset === 'pitch' ? 'gridiron' : 'venice');
      athlete = await CharacterPipeline.spawnPlayer(ctx.scene, cfg.heroUrl, {
        position: cfg.athletePos, yawRad: cfg.athleteYaw, startClip: cfg.idleClip,
      });
      ball = MeshBuilder.CreateSphere('ball', { diameter: cfg.ballDiameter }, ctx.scene);
      EffectsKit.ballTrail(ctx.scene, ball);
      sim = new BallSim(ball, cfg.ballDiameter / 2);
      round = 0; hits = 0; scoreVal = 0;
      ctx.camDirector.setFixed(cfg.cameraPos);
      serve(ctx);
    },

    onInput(ctx, e: FelInput) {
      if (e.t === 'stick' && e.side === 'L') aimX = e.x;
      if (e.t === 'button' && e.btn === 'A' && e.pressed) swing(ctx);
    },

    update(ctx, dt) {
      phaseT += dt;
      sim.step(dt, 0, cfg.restitution);

      if (state === 'incoming') {
        // CONTACT: swept-sphere vs the implement's contact zone while the swing
        // clip is in its active window — a max-speed ball cannot pass through.
        if (swinging) {
          const contact = sim.sweptHit(
            cfg.contactPoint.add(new Vector3(aimX * 0.4, 0, 0)), cfg.contactRadius,
          );
          if (contact) {
            hits++;
            state = 'flight'; phaseT = 0;
            const target = cfg.target.clone();
            target.x += aimX * cfg.aimRange;
            sim.launch(contact, arcVelocity(contact, target, cfg.returnApex));
            scoreVal += cfg.pointsPerHit;
            ctx.setHud({ score: scoreVal, banner: cfg.hitBanner });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
          }
        }
        // whiffed past the athlete
        if (sim.pos.z > cfg.athletePos.z + 1.5 || (!sim.active && phaseT > 0.5)) {
          state = 'between'; phaseT = 0;
          ctx.setHud({ banner: cfg.missBanner });
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
        }
      }

      if (state === 'flight' && phaseT > cfg.flightSeconds) { state = 'between'; phaseT = 0; }

      if (state === 'between' && phaseT > cfg.betweenSeconds) {
        if (round >= cfg.rounds) {
          return ctx.end(
            hits >= cfg.rounds * 0.6 ? 'GREAT' : 'COMPLETE',
            scoreVal, { hits, rounds: cfg.rounds },
          );
        }
        serve(ctx);
      }
    },

    dispose() { athlete?.dispose(); ball?.dispose(); },
  };
}
