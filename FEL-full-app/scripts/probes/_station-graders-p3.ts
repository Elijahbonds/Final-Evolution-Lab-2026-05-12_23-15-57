// MIRROR-COACH P3 (2026-09-26): what the station graders read on the synth's bodies — clean, and under the synth's
// default jitter over 10 seeds — the numbers STATION_THRESHOLDS (lib/mirror/stationGraders.ts) cites. Synthetic, not a
// phone. Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_station-graders-p3.ts [--json out.json]
import { writeFileSync } from 'node:fs';
import { gradeStation, measureStation, type GraderId, type StationGrade } from '../../lib/mirror/stationGraders';
import type { StationView } from '../../lib/mirror/screen';
import {
  JITTER, STATION_ASPECT, film, mirrored, rolled, singleLegClip, standClip, standPose, tiltHeel, toBack, toOtherSide, toSide,
  type SingleLegShape, type StandShape,
} from '../../lib/mirror/fixtures/stations';
import type { PoseFrame } from '../../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
type Case = { name: string; check: GraderId; view: StationView; frames: (seed: number | null) => PoseFrame[]; stance?: 'left' | 'right' };

const stand = (o: StandShape, turn: (j: ReturnType<typeof standPose>) => ReturnType<typeof standPose> = (j) => j, sec = 14) =>
  (seed: number | null) => film(standClip(turn(standPose(o)), sec), seed === null ? undefined : JITTER(seed));
const leg = (o: SingleLegShape) => (seed: number | null) => film(singleLegClip(o), seed === null ? undefined : JITTER(seed));

const CASES: Case[] = [
  { name: 'front clean', check: 'shoulderLevel', view: 'front', frames: stand({}) },
  { name: 'L shoulder +5cm', check: 'shoulderLevel', view: 'front', frames: stand({ shoulderUp: { side: 'left', cm: 5 } }) },
  { name: 'L shoulder +2cm', check: 'shoulderLevel', view: 'front', frames: stand({ shoulderUp: { side: 'left', cm: 2 } }) },
  { name: 'front clean, phone 6° crooked', check: 'shoulderLevel', view: 'front', frames: (s) => rolled(stand({})(s), 6) },
  { name: 'L shoulder +5cm, phone 6°', check: 'shoulderLevel', view: 'front', frames: (s) => rolled(stand({ shoulderUp: { side: 'left', cm: 5 } })(s), 6) },
  { name: 'front clean', check: 'hipLevel', view: 'front', frames: stand({}) },
  { name: 'R hip −5cm', check: 'hipLevel', view: 'front', frames: stand({ hipDrop: { side: 'right', cm: 5 } }) },
  { name: 'R hip −2cm', check: 'hipLevel', view: 'front', frames: stand({ hipDrop: { side: 'right', cm: 2 } }) },
  { name: 'front clean', check: 'kneeWindow', view: 'front', frames: stand({}) },
  { name: 'soft knees, straight', check: 'kneeWindow', view: 'front', frames: stand({ kneeIn: {} }) },
  { name: 'L knee in 6cm', check: 'kneeWindow', view: 'front', frames: stand({ kneeIn: { left: 6 } }) },
  { name: 'both knees in 6cm', check: 'kneeWindow', view: 'front', frames: stand({ kneeIn: { left: 6, right: 6 } }) },
  { name: 'L knee in 3cm', check: 'kneeWindow', view: 'front', frames: stand({ kneeIn: { left: 3 } }) },
  { name: 'side clean', check: 'headFloat', view: 'side', frames: stand({}, toSide, 10) },
  { name: 'side clean, other side', check: 'headFloat', view: 'side', frames: stand({}, toOtherSide, 10) },
  { name: 'head fwd 9cm', check: 'headFloat', view: 'side', frames: stand({ headForwardCm: 9 }, toSide, 10) },
  { name: 'head fwd 4cm', check: 'headFloat', view: 'side', frames: stand({ headForwardCm: 4 }, toSide, 10) },
  { name: 'back clean', check: 'heelLine', view: 'back', frames: stand({}, toBack, 12) },
  { name: 'L heel 18°', check: 'heelLine', view: 'back', frames: (s) => tiltHeel(stand({}, toBack, 12)(s), 'left', 18) },
  { name: 'L heel 8°', check: 'heelLine', view: 'back', frames: (s) => tiltHeel(stand({}, toBack, 12)(s), 'left', 8) },
  { name: 'L steady', check: 'singleLeg', view: 'front', stance: 'left', frames: leg({ stance: 'left', swayCm: 0.3, swayHz: 0.5 }) },
  { name: 'L still', check: 'singleLeg', view: 'front', stance: 'left', frames: leg({ stance: 'left' }) },
  { name: 'L wobbly 3cm 1Hz', check: 'singleLeg', view: 'front', stance: 'left', frames: leg({ stance: 'left', swayCm: 3, swayHz: 1 }) },
  { name: 'L 2 touch-downs', check: 'singleLeg', view: 'front', stance: 'left', frames: leg({ stance: 'left', touchDownsAt: [10, 20] }) },
  { name: 'L steady, R foot still up at start', check: 'singleLeg', view: 'front', stance: 'left', frames: leg({ stance: 'left', startOnOtherLegSec: 1.5 }) },
  { name: 'R steady', check: 'singleLeg', view: 'front', stance: 'right', frames: leg({ stance: 'right', swayCm: 0.3, swayHz: 0.5 }) },
];

const fmt = (g: StationGrade) => `${g.status.padEnd(10)} v=${g.value === null ? 'null' : g.value.toFixed(3)} u=${g.uncertainty?.toFixed(3) ?? '-'} iqr=${g.spread?.toFixed(3) ?? '-'}${g.touchDowns !== undefined ? ` td=${g.touchDowns} sec=${g.stanceSec?.toFixed(1)}` : ''}${g.reason ? ` (${g.reason})` : ''}`;

const out: Record<string, unknown> = {};
for (const c of CASES) {
  const opts = { aspect: STATION_ASPECT, stance: c.stance };
  const clean = gradeStation(c.check, c.frames(null), c.view, opts);
  const mir = gradeStation(c.check, mirrored(c.frames(null)), c.view, opts);
  const jit = SEEDS.map((s) => gradeStation(c.check, c.frames(s), c.view, opts));
  const vals = jit.map((g) => g.value).filter((v): v is number => v !== null);
  const counts = { pass: 0, flag: 0, unreadable: 0 };
  for (const g of jit) counts[g.status]++;
  const us = jit.map((g) => g.uncertainty ?? NaN).filter(Number.isFinite);
  console.log(`${c.check.padEnd(13)} ${c.name.padEnd(24)} clean: ${fmt(clean)}`);
  console.log(`${''.padEnd(38)} mirror: ${fmt(mir)}`);
  console.log(`${''.padEnd(38)} jitter×10: pass ${counts.pass} flag ${counts.flag} unread ${counts.unreadable} · value ${vals.length ? `${Math.min(...vals).toFixed(3)}…${Math.max(...vals).toFixed(3)}` : '-'} · u max ${us.length ? Math.max(...us).toFixed(3) : '-'}`);
  out[`${c.check} · ${c.name}`] = { clean, mirrored: mir, jitter: jit.map((g) => ({ status: g.status, value: g.value, uncertainty: g.uncertainty, spread: g.spread, touchDowns: g.touchDowns, reason: g.reason })) };
}
void measureStation;
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
