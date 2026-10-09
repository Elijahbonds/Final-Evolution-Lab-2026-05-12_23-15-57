// QA A1-01(b): Hot Shot's HUD said the default (untouched, dead-centre) reticle at every power still fell short of
// the goal line — the old launch speed (13 + power*7 m/s) was too slow for the shallow ~5.6° line from the ball to
// the goal centre (11m out, only ~1.1m up) to survive gravity long enough to get there. Measured against the REAL
// Flight/Reticle physics here (not hand math): HOT_SHOT_BASE_MPS/HOT_SHOT_POWER_MPS (carnivalEvents.ts) fix the
// floor without making every shot a guaranteed score — a badly-aimed low corner can still fall short.
import { describe, expect, it } from 'vitest';
import { MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { Flight } from './aimSwingCore';
import { HOT_SHOT_BASE_MPS, HOT_SHOT_POWER_MPS } from './carnivalEvents';

const GOAL_Z = 10.9;   // the goal-line check in hotShot()'s tick()
const GOAL_CENTER = new Vector3(0, 1.2, 11);
const BALL_START = new Vector3(0, 0.11, 0);

/** The exact shot hotShot() takes: launch from BALL_START toward `reticlePos` at `speed`, step the real Flight sim
 *  until it either crosses GOAL_Z or stops (falls short) — mirrors onInput's launch and tick's resolution. */
function shoot(reticlePos: Vector3, speed: number): { scored: boolean; crossedLine: boolean } {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const ball = MeshBuilder.CreateSphere('probe_ball', { diameter: 0.22 }, scene);
    ball.position.copyFrom(BALL_START);
    const flight = new Flight(ball, -9.8);
    const to = reticlePos.subtract(ball.position).normalize();
    flight.launch(ball.position, to.scale(speed));
    for (let i = 0; i < 600; i++) {
      flight.step(1 / 60);
      const crossedLine = ball.position.z >= GOAL_Z;
      if (crossedLine || !flight.active) {
        return { crossedLine, scored: crossedLine && Math.abs(ball.position.x) < 3.6 && ball.position.y < 2.4 };
      }
    }
    return { scored: false, crossedLine: false };   // never resolved in 10s — would be the soft-lock this fix also covers (A1-01a)
  } finally {
    engine.dispose();
  }
}

describe('Hot Shot launch physics (QA A1-01b)', () => {
  it('the OLD speed (13-20 m/s) fell short of the goal line from dead centre at every power — the reported bug, pinned', () => {
    expect(shoot(GOAL_CENTER, 13).crossedLine).toBe(false);   // old base (power 0)
    expect(shoot(GOAL_CENTER, 20).crossedLine).toBe(false);   // old max (power 1)
  });

  it('a player who just presses shoot (centre reticle, zero power) scores — the easy shot', () => {
    const r = shoot(GOAL_CENTER, HOT_SHOT_BASE_MPS);
    expect(r.crossedLine).toBe(true);
    expect(r.scored).toBe(true);
  });

  it('full power at centre also scores — power does not break the easy shot', () => {
    const r = shoot(GOAL_CENTER, HOT_SHOT_BASE_MPS + HOT_SHOT_POWER_MPS);
    expect(r.crossedLine).toBe(true);
    expect(r.scored).toBe(true);
  });

  it("skill still matters: aiming at the bottom edge — almost level with the ball — falls short even at full power (not every shot is a max score)", () => {
    const bottomCorner = new Vector3(3.3, 0.15, 11);   // the reticle's own low bound (center.y - half.y)
    expect(shoot(bottomCorner, HOT_SHOT_BASE_MPS + HOT_SHOT_POWER_MPS).crossedLine).toBe(false);
  });
});
