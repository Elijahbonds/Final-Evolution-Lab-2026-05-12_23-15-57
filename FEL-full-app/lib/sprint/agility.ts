// agility — the 5-10-5 (pro agility) by camera, from one wide view square to the run (SPRINT-SPEED, 2026-10-25).
//
// Setup: three cones on one line, 5 yards apart; the phone far enough back (≈ 8–10 m) to see all three and the athlete's
// feet, square to the line. The coach taps the left, middle and right cones. The athlete straddles the middle line.
//
//   start      first movement (lib/sprint/start.ts detectOnset), or the phone's Go
//   turn 1     the hips' first turn: the furthest point of the first leg, once they have come back ≥ 1 m. It counts as
//              a TOUCH only when the turning foot (the outermost ankle, heel or toe within 0.3 s of the turn) got to the
//              line or within `agility.touchM` of it
//   turn 2     the same at the far line
//   finish     the torso crossing the middle line after turn 2 (lib/sprint/crossing.ts, sub-frame)
//
// A missed line is said, and the run has no time (a short turn is the 5-10-5's commonest fault, and a time from it is
// not a 5-10-5). The test asks for a hand on the line; the camera reads the foot, which is what a coach watches first.
//
// Status (docs/SPRINT-SPEED.md §5): BETA. On the synthetic runs in tests/sprint-speed it times within its own ± and
// catches a turn short of the line; on a real field, a foot hidden behind the other leg at the turn is the open risk.
//
// Pure.
import { LEFT_ANKLE, LEFT_FOOT_INDEX, LEFT_HEEL, RIGHT_ANKLE, RIGHT_FOOT_INDEX, RIGHT_HEEL } from '@/lib/pose/landmarks';
import { alongM, bodyPoint, markerScale, type MarkerScale, type Pt } from './geometry';
import { findCrossings } from './crossing';
import { detectOnset, type StartRead } from './start';
import { framesHz, type FrameLike } from './timing';
import { sr } from './PROPOSED-sprint';

/** 5 yards in metres: the 5-10-5's cone spacing. */
export const FIVE_YD_M = 4.572;

export interface AgilityCones { left: Pt; middle: Pt; right: Pt }

const FEET = [LEFT_ANKLE, RIGHT_ANKLE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX];

export interface Turn { t: number; side: 'left' | 'right'; hipM: number; footM: number; touched: boolean; shortByM: number }

export type AgilityRun =
  | { ok: true; timeS: number; sdS: number; start: StartRead; turns: [Turn, Turn]; splitsS: [number, number]; poseHz: number }
  | { ok: false; why: string; turns?: Turn[] };

/** The cones as a scale: metres from the left cone, the outer two 10 yd apart. */
export function agilityScale(c: AgilityCones, aspect: number): { ok: true; scale: MarkerScale; middleM: number } | { ok: false; why: string } {
  const s = markerScale(c.left, c.right, 2 * FIVE_YD_M, aspect);
  if (!s.ok) return s;
  const middleM = alongM(s.scale, c.middle);
  if (middleM < FIVE_YD_M * 0.6 || middleM > FIVE_YD_M * 1.4) return { ok: false, why: 'Tap the left cone, then the middle cone, then the right cone.' };
  return { ok: true, scale: s.scale, middleM };
}

export function readAgility(o: {
  frames: readonly FrameLike[]; aspect: number; cones: AgilityCones; from: number; start?: StartRead | null;
}): AgilityRun {
  const sc = agilityScale(o.cones, o.aspect);
  if (!sc.ok) return sc;
  const { scale, middleM } = sc;
  const lines = { left: 0, right: 2 * FIVE_YD_M };
  const touchM = sr('agility.touchM');
  const seen = o.frames.filter((f) => f.t >= o.from).map((f) => {
    const hip = bodyPoint(f, 'hips');
    const torso = bodyPoint(f, 'torso');
    const feet = f.present && f.image.length >= 33
      ? FEET.map((i) => f.image[i]).filter((p) => p && p.v >= sr('sprint.minVisibility')).map((p) => alongM(scale, p))
      : [];
    return { t: f.t, hip: hip ? alongM(scale, hip) : null, torso: torso ? alongM(scale, torso) : null, footMin: feet.length ? Math.min(...feet) : null, footMax: feet.length ? Math.max(...feet) : null, p: hip };
  });
  // the start
  let start: StartRead;
  if (o.start) start = o.start;
  else {
    const on = detectOnset(seen.map((x) => ({ t: x.t, p: x.p })), o.aspect, o.from);
    if (!on.ok) return on;
    start = on;
  }
  const run = seen.filter((x) => x.t >= start.t && x.hip !== null) as (typeof seen[number] & { hip: number })[];
  if (run.length < 10) return { ok: false, why: 'The athlete left the picture. Stand the phone further back so all three cones and the feet are in view.' };
  // the turns: the furthest point of a leg once the hips have come back ≥ 1 m from it
  const turns: Turn[] = [];
  let ext = 0, sign = 0;
  const begin = run[0].hip;
  for (let i = 1; i < run.length && turns.length < 2; i++) {
    const x = run[i].hip;
    if (sign === 0) {
      if (Math.abs(x - begin) > 0.5) { sign = x > begin ? 1 : -1; ext = i; }
      continue;
    }
    if ((x - run[ext].hip) * sign > 0) { ext = i; continue; }
    if ((run[ext].hip - x) * sign >= 1) {
      // the hips dwell at a turn: its time is the middle of the frames within 5 cm of the furthest point
      const dwell = run.filter((r, k) => k <= i && Math.abs(r.hip - run[ext].hip) <= 0.05 && Math.abs(r.t - run[ext].t) <= 400);
      const tt = dwell.reduce((q, r) => q + r.t, 0) / dwell.length;
      const side: Turn['side'] = sign > 0 ? 'right' : 'left';
      const near = run.filter((r) => Math.abs(r.t - tt) <= 300);
      const foot = side === 'right'
        ? Math.max(...near.map((r) => r.footMax ?? -Infinity))
        : Math.min(...near.map((r) => r.footMin ?? Infinity));
      const line = lines[side];
      const short = side === 'right' ? line - foot : foot - line;
      turns.push({ t: tt, side, hipM: run[ext].hip, footM: Number.isFinite(foot) ? foot : NaN, touched: Number.isFinite(foot) && short <= touchM, shortByM: Number.isFinite(foot) ? Math.max(0, short) : NaN });
      sign = -sign; ext = i;
    }
  }
  if (turns.length < 2) return { ok: false, why: 'Two turns were not seen. Keep all three cones and the athlete in view the whole run.', turns };
  if (turns[0].side === turns[1].side) return { ok: false, why: 'The turns were not on opposite sides.', turns };
  const missed = turns.find((t) => !t.touched);
  if (missed) {
    const by = Number.isFinite(missed.shortByM) ? ` (about ${Math.round(missed.shortByM * 100)} cm short)` : '';
    return { ok: false, why: `The ${missed.side} line was not reached${by}. Touch each line, then run back through the middle.`, turns };
  }
  // the finish: the torso back through the middle line, after turn 2
  const samples = seen.filter((x) => x.torso !== null && x.t > turns[1].t).map((x) => ({ t: x.t, d: ((x.torso as number) - middleM) / scale.mPerUnit }));
  const cross = findCrossings(samples, { after: turns[1].t });
  if (!cross.length) return { ok: false, why: 'The athlete did not come back through the middle line in the picture.', turns };
  const fin = cross[0];
  return {
    ok: true,
    timeS: (fin.t - start.t) / 1000, sdS: Math.hypot(start.sdMs, fin.sdMs) / 1000,
    start, turns: [turns[0], turns[1]],
    splitsS: [(turns[0].t - start.t) / 1000, (turns[1].t - start.t) / 1000],
    poseHz: Math.round(framesHz(o.frames)),
  };
}
