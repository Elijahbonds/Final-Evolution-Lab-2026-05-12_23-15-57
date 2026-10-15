// A scripted kart drive for tests that ask "does X change the race?": the player's own model (stepKart) on a scripted input, and a
// rival driven round a looped line by the field's driver (stepKartDrive), for `sec` seconds at 60 Hz. Returns every frame's numbers, so
// two drives under different device states can be compared EXACTLY.
import { Vector3 } from '@babylonjs/core';
import { KART_NEUTRAL, KART_STARTER, spawnKart, stepKart, type KartInput } from '../../lib/babylon/core/KartModel';
import { sampleLine } from '../../lib/babylon/racing/racingLine';
import { spawnKartDrive, stepKartDrive } from '../../lib/babylon/racing/RivalDriver';
import { makeField, rivalPace, raceLineFromPoints, type Rival } from '../../lib/babylon/racing/RaceField';

export interface KartDriveTrace { player: number[][]; rival: number[][] }

export function driveKartScript(sec = 40): KartDriveTrace {
  const K = KART_STARTER;
  const line = sampleLine([[0, 0, 0], [120, 0, 0], [160, 60, 0], [120, 120, 0], [0, 120, 0], [-40, 60, 0]], { loop: true });
  // the player: throttle, a weave, a drift hold, the brake, a boost - every input the model reads
  const me = spawnKart(new Vector3(0, 0, 0), 0);
  const player: number[][] = [];
  for (let f = 0; f < sec * 60; f++) {
    const t = f / 60;
    const input: KartInput = { ...KART_NEUTRAL, throttle: t < 30 ? 1 : 0.4, steer: Math.sin(t * 0.9) * 0.8, brake: t % 9 > 8 ? 1 : 0, boostK: t > 12 && t < 14 ? 1 : 0, drift: t % 7 > 4 };
    stepKart(me, input, 1 / 60, Math.sin(t) > -0.7, K);
    player.push([me.pos.x, me.pos.y, me.pos.z, me.heading, me.speed, me.slip, me.boost, me.steerAt]);
  }
  // one rival of the field on the same line, paced by the field's own brain and driven by the field's own driver
  const raceLine = raceLineFromPoints(line.pts, true);
  const r: Rival = makeField(1, K.vMax, 0.5)[0];
  r.dist = 0; r.speed = K.vMax * 0.25; r.lane = -2;
  const d = spawnKartDrive(line, r);
  const spec = { topSpeed: K.vMax };
  const rival: number[][] = [];
  for (let f = 0; f < sec * 60; f++) {
    stepKartDrive(d, r, line, rivalPace(r, raceLine, 0, spec, f / 60), 1 / 60, K, 9);
    rival.push([d.state.pos.x, d.state.pos.z, d.state.heading, d.state.speed, r.dist]);
  }
  return { player, rival };
}
