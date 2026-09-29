// MIRROR-COACH P3 review fixes (2026-09-26): the review's adversarial cases, re-run on the fixed graders — the single-leg
// stance at 8/10/15/30/60 fps, ankle jitter before the first real lift, the wrong leg, a sway under the line under
// jitter, a step-off in the last second, a foot turned in from behind, the far ankle hidden from the side, a read at the
// flag line, and a phone turned mid-hold. Synthetic, not a phone.
// Run: /opt/homebrew/Cellar/node/26.8.2/bin/node node_modules/tsx/dist/cli.mjs scripts/probes/_station-graders-p3-review.ts [--json out.json]
import { writeFileSync } from 'node:fs';
import { gradeStation, type GraderId, type StationGrade } from '../../lib/mirror/stationGraders';
import type { StationView } from '../../lib/mirror/screen';
import {
  JITTER, STATION_ASPECT, film, singleLegClip, standClip, standPose, toBack, toSide, turnFoot, withStepOff,
  type SingleLegShape,
} from '../../lib/mirror/fixtures/stations';
import type { PoseFrame } from '../../lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { DEFAULT_NOISE, type SynthOptions } from '../../lib/pose/synth';
import { RIGHT_ANKLE } from '../../lib/pose/landmarks';

const fmt = (g: StationGrade) => `${g.status}${g.reason ? `(${g.reason})` : ''} v=${g.value === null ? '-' : g.value.toFixed(3)}${g.touchDowns !== undefined ? ` td=${g.touchDowns}` : ''}`;
const tally = (gs: StationGrade[]) => {
  const t: Record<string, number> = {};
  for (const g of gs) { const k = g.status + (g.reason ? `:${g.reason}` : ''); t[k] = (t[k] ?? 0) + 1; }
  return t;
};
const out: Record<string, unknown> = {};
const say = (k: string, v: unknown) => { out[k] = v; console.log(k.padEnd(58), typeof v === 'string' ? v : JSON.stringify(v)); };

const leg = (o: SingleLegShape, opt: SynthOptions) => film(singleLegClip(o), opt);
const g1 = (check: GraderId, frames: PoseFrame[], view: StationView, stance?: 'left' | 'right') =>
  gradeStation(check, frames, view, { aspect: STATION_ASPECT, stance });
const SEEDS6 = [1, 2, 3, 4, 5, 6];
const SEEDS20 = Array.from({ length: 20 }, (_, i) => i + 1);

// 1 — frame rate
for (const [name, shape] of [
  ['still 0.3cm', { stance: 'left', swayCm: 0.3, swayHz: 0.5 }],
  ['wobble 3cm 1Hz', { stance: 'left', swayCm: 3, swayHz: 1 }],
  ['wobble 3cm 2Hz', { stance: 'left', swayCm: 3, swayHz: 2 }],
  ['sway 1.5cm 1Hz', { stance: 'left', swayCm: 1.5, swayHz: 1 }],
  ['touch-down at 10s', { stance: 'left', touchDownsAt: [10] }],
] as [string, SingleLegShape][]) {
  for (const fps of [8, 10, 15, 30, 60]) {
    const gs = SEEDS6.map((s) => g1('singleLeg', leg(shape, { ...JITTER(s), fps }), 'front', 'left'));
    say(`fps ${fps} · ${name}`, `${JSON.stringify(tally(gs))} ${gs.map((g) => g.value?.toFixed(3) ?? '-').join(' ')}`);
  }
}

// 2 — ankle jitter before the first real lift (4 s on both feet), limb jitter k × default
for (const k of [2, 3, 5]) {
  const gs = SEEDS20.map((s) => g1('singleLeg', leg({ stance: 'left', swayCm: 0.3, swayHz: 0.5, settleSec: 4, holdSec: 26 },
    { ...JITTER(s), noise: { imageLimb: DEFAULT_NOISE.imageLimb * k } }), 'front', 'left'));
  say(`pre-lift limb jitter ×${k}, 20 takes`, tally(gs));
}

// 3 — the wrong leg
say('standing on RIGHT, graded as wobbleL', SEEDS6.map((s) => fmt(g1('singleLeg', leg({ stance: 'right', swayCm: 3, swayHz: 1 }, JITTER(s)), 'front', 'left'))).join(' | '));

// 4 — a sway under the line, under jitter
for (const cm of [1.5, 2]) {
  for (const k of [1, 3]) {
    const gs = SEEDS6.map((s) => g1('singleLeg', leg({ stance: 'left', swayCm: cm, swayHz: 1 }, { ...JITTER(s), noise: { imageTorso: DEFAULT_NOISE.imageTorso * k, imageLimb: DEFAULT_NOISE.imageLimb * k } }), 'front', 'left'));
    say(`sway ${cm}cm 1Hz, jitter ×${k}`, `${JSON.stringify(tally(gs))} ${gs.map((g) => g.value?.toFixed(3) ?? '-').join(' ')}`);
  }
}

// 5 — stepping off before the clock ends (30 s of kept frames; the foot comes down this long before the end)
for (const early of [0.2, 0.6, 2, 3.5, 10]) {
  const gs = SEEDS6.map((s) => g1('singleLeg', film(withStepOff(singleLegClip({ stance: 'left', settleSec: 1, holdSec: 29 }), early), JITTER(s)), 'front', 'left'));
  say(`step-off ${early}s before the end`, gs.map(fmt).join(' | '));
}

// 6 — heel line from behind: one foot turned in, heels untilted; and both feet turned out alike
const back = (turnL: number, turnR = 0, seed?: number) =>
  film(standClip(toBack(turnFoot(turnFoot(standPose(), 'left', turnL), 'right', turnR)), 12), seed ? JITTER(seed) : undefined);
for (const deg of [10, 20, 30, 40]) say(`left foot turned in ${deg}°`, SEEDS6.map((s) => fmt(g1('heelLine', back(deg, 0, s), 'back'))).join(' | '));
say('both feet turned out 15°', SEEDS6.map((s) => fmt(g1('heelLine', back(-15, -15, s), 'back'))).join(' | '));

// 7 — head from the side with the far ankle half hidden
const side = (cm: number, farVis: number, seed: number) => film(standClip(toSide(standPose({ headForwardCm: cm })), 10), JITTER(seed))
  .map((f) => ({ ...f, landmarks: f.landmarks.map((l, i) => (i === RIGHT_ANKLE ? { ...l, visibility: farVis } : l)) }));
for (const v of [0.45, 0.55]) say(`head 9cm, far ankle vis ${v}`, SEEDS6.map((s) => fmt(g1('headFloat', side(9, v, s), 'side'))).join(' | '));

// 8 — a read at the flag line
for (const k of [1, 2, 3]) {
  const gs = SEEDS6.map((s) => g1('headFloat', film(standClip(toSide(standPose({ headForwardCm: 4 })), 10), { ...JITTER(s), noise: { imageTorso: DEFAULT_NOISE.imageTorso * k, imageLimb: DEFAULT_NOISE.imageLimb * k } }), 'side'));
  say(`head 4cm (at the line), jitter ×${k}`, `${JSON.stringify(tally(gs))} ${gs.map((g) => g.value?.toFixed(3) ?? '-').join(' ')}`);
}

// 9 — the phone turned mid-hold: half the frames stamped with the other aspect
{
  const f = film(standClip(standPose({ shoulderUp: { side: 'left', cm: 2.5 } }), 14), JITTER(1));
  const half = f.map((x, i) => ({ ...x, aspect: i < f.length / 2 ? STATION_ASPECT : 1 / STATION_ASPECT }));
  say('aspect changed mid-hold', fmt(g1('shoulderLevel', half, 'front')));
  say('aspect carried per frame (steady)', fmt(g1('shoulderLevel', f.map((x) => ({ ...x, aspect: STATION_ASPECT })), 'front')));
}

const at = process.argv.indexOf('--json');
if (at > 0 && process.argv[at + 1]) writeFileSync(process.argv[at + 1], JSON.stringify(out, null, 2));
