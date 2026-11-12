// lib/signature/content/painFree.ts — SIGNATURE-PROGRAMS (2026-10-25): the pain-free / prehab program. DRAFT.
//
// GENERAL PREHAB, NOT TREATMENT. `prehabNote` carries exactly PREHAB_NOTE (lib/library/vocab.ts), the field the owner's
// brief made for it; every page that shows this program shows it. Nothing here names a condition, diagnoses, or promises
// an outcome. A pain check-in that does not settle routes to the existing words (lib/health/painRule.ts
// PAIN_DECISION_COPY; lib/coach/weeklyDraft/copy.ts easeOffClientLine: "check with a clinician"), never new ones, and a
// pain flag never makes a day or a decision harder (./serve.ts, ./adapt.ts).
//
// THE OWNER'S CORRECTIVE ORDER. Down, Up, Check (programs/DUNK-PROGRAM.md §6: "calm it, lengthen it, wake it up, put it
// to work" — roll what is overworking on a long exhale, then a band or a hold wakes the position up, then a check);
// Track 1's rows for knees, ankles and depth (§7.1) and Track 2's for posture, turn and carry (§8.1); breath and stack
// (§6.2); the Playbook's ch2 cylinder and tripod, ch3 check, ch4 joints and ch9 reset; the Blueprint's phases 1–2
// (breath and pressure, foot and ankle, hip range; its "fascial shearing" is the library's rolling entries here).
//
// THE SHAPE. 8 planned weeks: calm and open (2), build capacity (3), load and integrate (3). No early advance on purpose
// — the Dunk Program moves a corrective track on only after two screens in a row — and each block may repeat its last
// week once when the Mirror's form reads down, a pain check-in has not settled, or readiness runs low.
import { PREHAB_NOTE } from '@/lib/library/vocab';
import type { SignatureProgram } from '../types';
import { ankleRocks, blueprint, breathStack, dunk, exit, gap, it, jump, legsUpFlush, longExhale, neuralFlush, openBook, playbook } from './dsl';

const down = (ex: string) => it(ex, 'prep', 1, 60, 15);
const hips = () => it('90-90-hip-switch', 'prep', 2, '6 each side', 15);

export const PAIN_FREE: SignatureProgram = {
  id: 'pain-free',
  title: 'Pain-Free Prehab',
  tagline: 'Knees, ankles, hips and shoulders: Down, Up, Check, then load it, in the owner\'s corrective order.',
  summary:
    'Eight weeks of the owner\'s Down, Up, Check: calm what is overworking, wake the position up, then check it. Each week has a knees and ankles day, a hips and trunk day and a shoulders day, building from holds to slow strength to load. The Mirror re-checks you every Friday. If a check-in says something has not settled, the plan eases off and tells you who to see; it never pushes through.',
  equipmentLine: 'A foam roller, a light and a medium band, a low step, a wall, a ball to squeeze, one dumbbell.',
  daysPerWeek: 3,
  prehabNote: PREHAB_NOTE,
  sources: [
    dunk('§6 Down, Up, Check; §6.2 breath and stack; §7.1 Track 1 rows (knees, ankles, depth); §8.1 Track 2 rows (posture, turn, carry)'),
    playbook('ch2 Cylinder and Tripod; ch3 the 5-Minute Movement Check; ch4 Unlocking the Joints; ch9 the Reset Button'),
    blueprint('phase 1 (breath and pressure, postural audit); phase 2 (foot and ankle, hip mobility, fascial shearing); phase 5 Neural Flush'),
  ],
  gaps: [
    "The Dunk Program's band-in squat and RNT single-leg balance (band pulls you into the mistake) have no library entry: the banded knee squat and single-leg balance stand in.",
    "The RNT split-stance row and press (§6.2) has no library entry: the split-stance Pallof press and the band row stand in.",
    "The Blueprint's fascial shearing is not foam rolling by its own words; the library's rolling entries stand in for the Down step. The owner should confirm or replace.",
    "Doses on the shoulder day (rotator-cuff and scapular work) are FEL's draft from the library's prehab batches; the books give no shoulder rows.",
    'The plan does not yet pick rows from your Mirror flag (the Dunk Program\'s "your top flag picks your row"): every athlete gets all four areas.',
  ],
  phases: [
    {
      id: 'calm', label: 'Calm and open', goal: 'Down, Up, Check on every area: rolling, holds and breath. Nothing loaded yet.',
      source: [dunk('§6, §6.2, §7.1, §8.1'), playbook('ch2; ch4'), blueprint('phases 1–2')],
      weeks: [{ wave: 1, label: 'Learn the positions' }, { wave: 2, label: 'Settle in' }],
      exit: exit(['form'], { maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Knees and ankles',
          items: [
            down('calves-smr'), ankleRocks(), breathStack(),
            it('wall-sit-quarter-depth', 'key', 3, 30, 45, { key: true }),
            it('band-terminal-knee-extension', 'assist', 2, '15 each side', 30),
            it('short-foot-hold', 'assist', 2, '8 each side', 15),
            it('single-leg-balance', 'assist', 2, 30, 15, { reps: 'each side' }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Hips and trunk',
          items: [
            down('piriformis-smr'), hips(), breathStack(),
            it('heels-on-bench-bridge-hold', 'key', 3, 20, 30, { key: true }),
            it('banded-clamshell', 'assist', 2, '12 each side', 30),
            it('adductor-ball-squeeze', 'assist', 2, '6 x 5 s', 30),
            it('dead-bug-heel-tap', 'assist', 2, '6 each side', 30, { cues: ['long-exhale'] }),
            legsUpFlush(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Shoulders, then the check', retest: ['form'],
          items: [
            down('latissimus-dorsi-smr'), openBook(), breathStack(),
            it('back-to-wall-arm-raise', 'key', 3, '10', 30, { key: true }),
            it('band-external-rotation-elbow-at-the-side', 'assist', 2, '12 each side', 30),
            it('palms-up-band-pull-apart', 'assist', 2, '10', 30),
            it('wall-chin-tuck', 'assist', 2, '8 x 5 s', 15),
            longExhale(),
          ],
        },
      ],
    },
    {
      id: 'capacity', label: 'Build capacity', goal: 'Slow strength through the range: step-downs, longer holds, the band at 90°.',
      source: [dunk('§7.2 weeks 3 and 5 (step-downs, Copenhagen plank); §7.3 progressions'), playbook('ch8')],
      weeks: [{ wave: 2, label: 'Build' }, { wave: 3, label: 'Build more' }, { wave: 4, label: 'Easier week, then the Mirror' }],
      exit: exit(['form'], { maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Knees and ankles: slow strength',
          items: [
            down('calves-smr'), ankleRocks(), breathStack(),
            it('lateral-step-down', 'key', 3, '8 each side', 45, { key: true }),
            it('banded-spanish-squat-hold-quarter-depth', 'assist', 3, 30, 45),
            it('single-leg-calf-raise-on-flat-floor', 'assist', 2, '10 each side', 30),
            it('single-leg-balance-head-turns', 'assist', 2, 30, 15, { reps: 'each side' }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Hips and trunk: hold and push',
          items: [
            down('piriformis-smr'), hips(), breathStack(),
            it('copenhagen-hold-knee-on-bench', 'key', 3, 20, 30, { key: true, reps: 'each side' }),
            it('banded-lateral-walk', 'assist', 2, '12 each side', 30),
            it('long-lever-bridge-hold', 'assist', 3, 20, 30),
            it('side-plank', 'assist', 2, 20, 30, { reps: 'each side' }),
            legsUpFlush(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Shoulders: rotate and reach, then the check', retest: ['form'],
          items: [
            down('latissimus-dorsi-smr'), openBook(), breathStack(),
            it('incline-scap-push-up', 'key', 3, '10', 30, { key: true }),
            it('band-external-rotation-at-90-half-kneeling', 'assist', 2, '12 each side', 30),
            it('prone-t-raise', 'assist', 2, '12', 30),
            it('split-stance-pallof-press', 'assist', 2, '10 each side', 30),
            longExhale(),
          ],
        },
      ],
    },
    {
      id: 'load', label: 'Load and integrate', goal: 'Put it to work: loaded squats and hinges, carries, presses, and low landings when the jump check allows.',
      source: [dunk('§7.2 weeks 6–7 "Integrate"; §6 "put it to work"'), playbook('ch6 landings; ch8')],
      weeks: [{ wave: 2, label: 'Load it' }, { wave: 3, label: 'Load more' }, { wave: 4, label: 'Easier week, then the Mirror' }],
      exit: exit(['form'], { maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Knees and ankles: load and land',
          items: [
            down('calves-smr'), ankleRocks(), breathStack(),
            jump('drop-landing-from-low-box', 2, '4', 4, 60, 'isometric-split-squat-hold'),
            it('goblet-squat-to-box', 'key', 3, '8', 60, { key: true, cues: ['tripod-down'] }),
            it('forward-step-down', 'assist', 3, '8 each side', 45),
            it('straight-knee-single-leg-calf-raise-isometric-hold', 'assist', 3, 30, 45, { reps: 'each side' }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Hips and trunk: carry and hinge',
          items: [
            down('piriformis-smr'), hips(), breathStack(),
            it('dumbbell-suitcase-romanian-deadlift', 'key', 3, '10', 60, { key: true, cues: ['wall-behind'] }),
            it('copenhagen-raise-knee-on-bench', 'assist', 2, '10 each side', 30),
            it('hip-airplane-supported', 'assist', 2, '5 each side', 30),
            it('suitcase-carry', 'finish', 3, '20 m each hand', 60, { cues: ['grow-tall'] }),
            legsUpFlush(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Shoulders: press and pull, then the check', retest: ['form'],
          items: [
            down('latissimus-dorsi-smr'), openBook(), breathStack(),
            it('half-kneeling-dumbbell-press', 'key', 3, '8 each side', 60, { key: true }),
            it('band-row', 'assist', 3, '12', 45, { cues: ['elbows-to-pockets'] }),
            it('band-external-rotation-in-a-split-stance', 'assist', 2, '12 each side', 30),
            it('wall-slide-with-lift-off', 'assist', 2, '10 each side', 30),
            longExhale(),
          ],
        },
      ],
    },
  ],
};
