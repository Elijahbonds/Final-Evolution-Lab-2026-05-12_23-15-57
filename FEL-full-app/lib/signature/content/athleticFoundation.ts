// lib/signature/content/athleticFoundation.ts — SIGNATURE-PROGRAMS (2026-10-25): the athletic foundation program. DRAFT.
//
// FOR ANY SPORT, IN THE PLAYBOOK'S ORDER. Assess → Correct → Load → Perform (Playbook ch1, PLAYBOOK_STEPS): the Mirror and
// the jump check assess; ch2's cylinder and tripod and ch4's joints correct (every session's Prep); ch8 "Strength Without
// Strain" loads in its own order ("technique before load: hinge, split squat, bridge, push-up, plank, then weight"); ch6
// and ch7 perform (landings, starts, cuts). The Blueprint's phases 1–2 ("System Scan", "Hardware Calibration": breath and
// pressure, the tripod foot, ankle and hip range) open every session, and every session ends with its phase 5 Neural
// Flush. Every week covers the six patterns a coach template must (squat, hinge, lunge, push, pull, carry: lib/coach/
// coverage.ts), checked like a template's weeks are.
//
// THE SHAPE. 12 planned weeks, three 4-week waves: positions, strength, speed and power. Each of the first two may end
// after its week 2 when the Mirror's form (and, in the strength block, the jump check) reads up — the shortest plan is 8.
import type { SignatureProgram } from '../types';
import { ankleRocks, blueprint, breathStack, exit, gap, it, jump, legsUpFlush, longExhale, neuralFlush, openBook, playbook } from './dsl';

const CALM_KNEE = 'isometric-split-squat-hold';
const CALM_ANKLE = 'bent-knee-double-leg-calf-raise-isometric-hold';
const tripod = () => it('tripod-foot-lift', 'prep', 2, '10 each side', 15);
const hips = () => it('90-90-hip-switch', 'prep', 2, '6 each side', 15);

export const ATHLETIC_FOUNDATION: SignatureProgram = {
  id: 'athletic-foundation',
  title: 'Athletic Foundation',
  tagline: 'Strength, speed, mobility and prehab for any sport: the Playbook\'s Assess, Correct, Load, Perform.',
  summary:
    'Twelve weeks in three blocks. Positions first: the tripod foot, a full breath, and the six patterns done well with light load. Then strength, with the same patterns loaded. Then speed and power: starts, cuts and jumps on top of the strength you built. The Mirror and the jump check re-test you every Friday; clean, climbing numbers move you on early.',
  equipmentLine: 'One or two dumbbells, a band, a low box or bench, a wall, a light med ball. A trap bar if you have one.',
  daysPerWeek: 3,
  prehabNote: null,
  sources: [
    playbook('ch1 Assess → Correct → Load → Perform; ch2 Cylinder and Tripod; ch4 Unlocking the Joints; ch6; ch7 SAQ; ch8 Strength Without Strain; ch9 the Reset Button'),
    blueprint('phase 1 "System Scan" (breath and pressure); phase 2 "Hardware Calibration" (tripod foot, ankle and hip range); phase 5 Neural Flush'),
  ],
  gaps: [
    "The Blueprint's ankle and hip CARs (phase 2 ch6–7) have no library entry: knee-to-wall ankle rocks and the 90/90 hip switch stand in.",
    "The load choices inside each block (which squat, which hinge, which row) are FEL's draft from the library; the Playbook names the patterns and the order, not the lifts.",
    'Conditioning is light on purpose (a carry or a short sprint finish): the owner may want a conditioning day for field sports.',
  ],
  phases: [
    {
      id: 'positions', label: 'Positions', goal: 'Technique before load: the six patterns, the tripod foot and the brace, light and clean.',
      source: [playbook('ch2; ch4; ch8 "technique before load"'), blueprint('phases 1–2')],
      weeks: [{ wave: 1, label: 'Learn the moves' }, { wave: 2, label: 'Build' }, { wave: 3, label: 'Build more' }, { wave: 4, label: 'Easier week' }],
      exit: exit(['form'], { earlyAfterWeek: 2, maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Squat, push, carry',
          items: [
            breathStack(), tripod(),
            jump('snap-down', 2, '5', 5, 60, CALM_KNEE),
            it('goblet-squat', 'key', 3, '8', 90, { key: true, cues: ['tripod-down', 'knees-over-laces'] }),
            it('incline-push-up', 'assist', 3, '8', 60, { cues: ['floor-away'] }),
            it('plank', 'assist', 2, 20, 30),
            it('suitcase-carry', 'finish', 3, '20 m each hand', 60, { cues: ['grow-tall'] }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Hinge, pull, lunge',
          items: [
            hips(), openBook(),
            it('band-good-morning', 'key', 3, '10', 60, { key: true, cues: ['wall-behind'] }),
            it('inverted-row', 'assist', 3, '8', 60, { cues: ['elbows-to-pockets'] }),
            it('split-squat', 'assist', 2, '8 each side', 60, { cues: ['front-heel'] }),
            it('heels-on-bench-bridge-hold', 'finish', 2, 20, 30),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then move', retest: ['form', 'jump'],
          items: [
            ankleRocks(), it('a-march', 'prep', 2, '10 each side', 20),
            jump('pogo-hop', 2, '10 contacts', 10, 60, CALM_ANKLE),
            it('lateral-lunge', 'key', 3, '6 each side', 60, { key: true }),
            it('one-arm-dumbbell-row', 'assist', 3, '8 each side', 60),
            it('dead-bug', 'assist', 2, 30, 30),
            it('farmers-walk', 'finish', 2, '20 m', 60),
            neuralFlush(),
          ],
        },
      ],
    },
    {
      id: 'strength', label: 'Strength', goal: 'The same six patterns, loaded: the governor\'s throttle opens a little each week.',
      source: [playbook('ch8 Strength Without Strain'), blueprint('phase 3 ch9 overcoming isometric (stand-in)')],
      weeks: [{ wave: 1, label: 'Learn the loads' }, { wave: 2, label: 'Build' }, { wave: 3, label: 'Build more' }, { wave: 4, label: 'Easier week' }],
      exit: exit(['form', 'jump'], { earlyAfterWeek: 2, maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Squat strength',
          items: [
            breathStack(), tripod(),
            jump('countermovement-jump-to-stick', 3, '4', 4, 90, CALM_KNEE),
            it('goblet-squat', 'key', 4, '6', 120, { key: true, cues: ['tripod-down', 'light-punch'] }),
            it('half-kneeling-dumbbell-press', 'assist', 3, '8 each side', 75),
            it('copenhagen-plank-short-lever', 'assist', 2, 15, 30, { reps: 'each side' }),
            it('farmers-walk', 'finish', 3, '30 m', 75, { cues: ['crush-handle'] }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Hinge strength',
          items: [
            hips(), openBook(),
            it('trap-bar-deadlift', 'key', 4, '5', 150, { key: true, cues: ['wall-behind', 'light-punch'] }),
            it('one-arm-dumbbell-row', 'assist', 3, '8 each side', 60, { cues: ['elbows-to-pockets'] }),
            it('rear-foot-elevated-split-squat', 'assist', 3, '6 each side', 90),
            it('suitcase-carry', 'finish', 3, '30 m each hand', 60),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then single leg', retest: ['form', 'jump'],
          items: [
            ankleRocks(), it('a-march', 'prep', 2, '10 each side', 20),
            jump('pogo-hop', 3, '15 contacts', 15, 60, CALM_ANKLE),
            it('dumbbell-step-ups', 'key', 3, '6 each side', 90, { key: true }),
            it('single-leg-romanian-deadlift', 'assist', 3, '6 each side', 60),
            it('inverted-row', 'assist', 3, '10', 60),
            it('pallof-press', 'assist', 2, '10 each side', 30),
            it('farmers-walk', 'finish', 2, '30 m', 60),
            neuralFlush(),
          ],
        },
      ],
    },
    {
      id: 'speed', label: 'Speed and power', goal: 'Start, stop, cut and jump on top of the strength: crisp contacts, a stuck finish.',
      source: [playbook('ch6; ch7 SAQ Made Simple'), gap('sprint and cut doses (FEL draft)')],
      weeks: [{ wave: 1, label: 'Learn the speed work' }, { wave: 2, label: 'Build' }, { wave: 3, label: 'Build more' }, { wave: 4, label: 'Easier week, then re-test' }],
      exit: exit(['jump'], { maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Accelerate and squat',
          items: [
            breathStack(), it('wall-march', 'prep', 2, '10 each side', 20),
            jump('broad-jump-to-stick', 3, '3', 3, 90, CALM_KNEE, { cues: ['stick-two'] }),
            it('two-point-start-sprint', 'key', 5, '10 m', 75, { key: true }),
            it('goblet-squat', 'assist', 3, '5', 120, { cues: ['tripod-down'] }),
            it('med-ball-scoop-toss-forward', 'assist', 3, '5', 60),
            it('farmers-walk', 'finish', 3, '30 m', 75),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Cut and decelerate',
          items: [
            hips(), it('lateral-skip', 'prep', 1, '2 lengths', 0),
            jump('lateral-bound-to-stick', 3, '4 each side', 8, 75, 'lateral-lunge', { cues: ['stick-two'] }),
            it('5-10-5-shuttle', 'key', 4, '1 run', 75, { key: true }),
            it('decel-to-stick', 'assist', 3, '4', 45),
            it('trap-bar-deadlift', 'assist', 3, '4', 150),
            it('one-arm-dumbbell-row', 'assist', 3, '8 each side', 60),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then power', retest: ['jump', 'form'],
          items: [
            ankleRocks(), it('a-skip', 'prep', 2, '20 m', 30),
            jump('countermovement-jump', 3, '3', 3, 90, CALM_KNEE),
            it('dumbbell-step-ups', 'key', 3, '5 each side', 90, { key: true }),
            it('rotational-med-ball-scoop-toss', 'assist', 3, '5 each side', 60),
            it('push-ups-with-feet-elevated', 'assist', 3, '8', 60),
            it('inverted-row', 'assist', 3, '10', 60),
            it('suitcase-carry', 'finish', 2, '30 m each hand', 60),
            legsUpFlush(),
          ],
        },
      ],
    },
  ],
};
