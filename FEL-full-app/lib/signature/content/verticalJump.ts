// lib/signature/content/verticalJump.ts — SIGNATURE-PROGRAMS (2026-10-25): the vertical jump program. DRAFT for the owner.
//
// THE OWNER'S METHOD, IN ITS ORDER. Built from the Dunk Program's Track 3 (programs/DUNK-PROGRAM.md §9: base → build →
// planned deload → power → lighter, then test), its plyo ladder (§6.3: rung 0 land, 1 bounce, 2 travel, 3 load and go,
// 4 one leg, 5 rebound for adults, 6 approach; "pop, not thud"; every contact counted), its session template (§6.1:
// breath and stack → spring → strong → the Neural Flush), the Blueprint's phase 3 "Physics of Flight" (ch9: single-leg
// pogos, the overcoming isometric, the Integrated Set) and phase 4 (ch17: the med-ball vertical toss), and the Playbook's
// ch6 "Jumping and Landing Mechanics" and ch8 "Strength Without Strain". Every exercise is a library entry.
//
// THE SHAPE. 10 planned weeks (the Dunk Program's 8, with its base and build kept whole and one more power week, so an
// early advance after the build's deload — the jump check reading up — still leaves at least 8). Retests: the jump check
// (T5 / the daily readiness check) and the landing check every Friday "re-test first" session, the Mirror at the end of
// the build. Base weeks may repeat twice (§6.4: "Base weeks can be repeated up to twice"); the build and power once.
import type { SignatureProgram } from '../types';
import { ankleRocks, blueprint, breathStack, dunk, exit, gap, it, jump, longExhale, neuralFlush, openBook, playbook } from './dsl';

const CALM_ANKLE = 'bent-knee-double-leg-calf-raise-isometric-hold';
const CALM_KNEE = 'isometric-split-squat-hold';

export const VERTICAL_JUMP: SignatureProgram = {
  id: 'vertical-jump',
  title: 'Vertical Jump',
  tagline: 'Land first, then bounce, then fly: the plyo ladder, strength and landings, tested with the jump check.',
  summary:
    "The Dunk Program's ladder as a 10-week plan. Two base weeks teach the landing and the bounce, four build weeks add strength and travel, three power weeks bring the approach and the rebound, and the last week is lighter before you test. Every Friday starts with a jump check, and the plan moves with what it reads: a jump that climbs moves you on early, a dip repeats a week.",
  equipmentLine: 'A low step or box, one dumbbell or kettlebell, a light med ball, a wall. A trap bar if you have one. A hoop helps on approach days.',
  daysPerWeek: 3,
  prehabNote: null,
  sources: [
    dunk('§6.1 session template, §6.3 the FEL plyo ladder, §6.4 the 8-week shape, §9 Track 3, §10 progress checks, §11 deloads'),
    blueprint('phase 3 "Physics of Flight" ch9 (oscillatory drills, overcoming isometric, the Integrated Set); phase 4 ch17 (med-ball vertical toss); phase 5 ch19 (Neural Flush)'),
    playbook('ch6 Jumping and Landing Mechanics; ch8 Strength Without Strain; ch2 the Pressure Cylinder'),
  ],
  gaps: [
    "The Blueprint's 5-second overcoming isometric and the Integrated Set's lockdown have no library entry yet: the isometric split-squat hold stands in. Add an entry, or confirm the stand-in.",
    "Dunk attempts (the Dunk Program's optional Saturday session) are not in the library and not in this plan: the approach jumps carry the approach work.",
    "Box drop jumps (rung 5C) are coach-unlocked only in the Dunk Program, so this solo plan never writes them.",
    "Every dose is the Dunk Program's where it gives one; the power weeks' sets and the 10-week length are FEL's draft.",
  ],
  phases: [
    {
      id: 'base', label: 'Base: land and bounce', goal: 'Quiet landings and a springy bounce: rungs 0 and 1 of the ladder, with stability strength.',
      source: [dunk('§9.3 weeks 1–2; §6.3 rungs 0–1'), playbook('ch6'), blueprint('phase 1 ch3 breath; phase 2 ch5–7 foot and ankle')],
      weeks: [{ wave: 1, label: 'Learn the landings' }, { wave: 2, label: 'Build the bounce' }],
      exit: exit(['landing', 'jump'], { maxRepeats: 2, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Land and stick',
          items: [
            breathStack(), ankleRocks(),
            jump('snap-down', 3, '5', 5, 60, CALM_KNEE),
            it('goblet-squat-to-box', 'key', 3, '8', 60, { key: true, cues: ['tripod-down'] }),
            it('split-squat', 'assist', 2, '8 each side', 60, { cues: ['front-heel'] }),
            it('side-plank', 'assist', 2, 20, 30, { reps: 'each side' }),
            it('suitcase-carry', 'finish', 3, '20 m each hand', 60, { cues: ['grow-tall'] }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Step off and stick',
          items: [
            openBook(), breathStack(),
            jump('drop-landing-from-low-box', 4, '5', 5, 60, CALM_KNEE),
            it('lateral-step-down', 'key', 3, '8 each side', 60, { key: true }),
            it('supported-single-leg-romanian-deadlift', 'assist', 2, '8 each side', 60, { cues: ['wall-behind'] }),
            it('dead-bug-heel-tap', 'assist', 2, '8 each side', 30, { cues: ['long-exhale'] }),
            it('suitcase-carry', 'finish', 3, '20 m each hand', 60),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then bounce', retest: ['jump', 'landing'],
          items: [
            ankleRocks(),
            jump('snap-down', 3, '5', 5, 60, CALM_KNEE),
            jump('pogo-hop', 2, '10 contacts', 10, 60, CALM_ANKLE),
            it('goblet-squat-to-box', 'key', 3, '8', 60, { key: true, cues: ['tripod-down'] }),
            it('split-squat', 'assist', 2, '8 each side', 60),
            it('side-plank', 'assist', 2, 20, 30, { reps: 'each side' }),
            it('two-point-start-sprint', 'finish', 3, '20 m, easy', 75),
            neuralFlush(),
          ],
        },
      ],
    },
    {
      id: 'build', label: 'Build: strength and springs', goal: 'Rungs 1 to 3 and the first loaded strength: a planned easier week, then the Mirror and the jump check decide.',
      source: [dunk('§9.3 weeks 3–5; §6.4 week 4 planned deload, day-28 full screen'), blueprint('phase 3 ch9'), playbook('ch8')],
      weeks: [{ wave: 2, label: 'Build' }, { wave: 4, label: 'Easier week, then the full screen' }, { wave: 2, label: 'Build again' }, { wave: 3, label: 'Build more' }],
      exit: exit(['jump', 'form'], { earlyAfterWeek: 2, maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Strength, then rungs 1–3',
          items: [
            breathStack(), ankleRocks(),
            jump('pogo-hop', 3, '15 contacts', 15, 60, CALM_ANKLE),
            jump('countermovement-jump-to-stick', 3, '4', 4, 90, CALM_KNEE),
            it('trap-bar-deadlift', 'key', 3, '5', 150, { key: true, cues: ['wall-behind', 'light-punch'] }),
            it('isometric-split-squat-hold', 'assist', 3, 10, 60, { reps: 'each side' }),
            it('copenhagen-plank-short-lever', 'assist', 2, 15, 30, { reps: 'each side' }),
            it('farmers-walk', 'finish', 3, '30 m', 75, { cues: ['crush-handle'] }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Approach and sprint',
          items: [
            openBook(), it('standing-arm-swing-drill', 'prep', 2, '8', 20),
            jump('one-step-approach-jump', 4, '3', 3, 120, 'step-up-with-knee-drive'),
            it('step-up-with-knee-drive', 'key', 3, '6 each side', 90, { key: true }),
            it('rotational-med-ball-scoop-toss', 'assist', 3, '5 each side', 60),
            it('two-point-start-sprint', 'finish', 4, '20 m', 90),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then travel', retest: ['jump', 'form'],
          items: [
            ankleRocks(),
            jump('forward-back-pogo', 3, '15 contacts', 15, 75, CALM_ANKLE),
            jump('single-leg-hop-to-stick', 2, '3 each side', 6, 90, 'single-leg-balance'),
            it('split-squat-with-dumbbells', 'key', 3, '6 each side', 90, { key: true, cues: ['front-heel'] }),
            it('one-arm-dumbbell-row', 'assist', 3, '8 each side', 60, { cues: ['elbows-to-pockets'] }),
            it('incline-push-up', 'assist', 3, '8', 60, { cues: ['floor-away'] }),
            it('suitcase-carry', 'finish', 3, '30 m each hand', 60),
            neuralFlush(),
          ],
        },
      ],
    },
    {
      id: 'power', label: 'Power: approach and rebound', goal: 'Rungs 4 to 6: one-leg bounces, the rebound (adults), the approach and the Integrated Set.',
      source: [dunk('§9.3 weeks 6–7 (the Integrated Set, approach day); §9.4 contacts per set'), blueprint('phase 3 ch9 (single-leg pogo hops, Integrated Set); phase 4 ch17 (med-ball vertical toss)'), gap('a third power week (FEL draft)')],
      weeks: [{ wave: 1, label: 'Learn the power work' }, { wave: 2, label: 'Power' }, { wave: 3, label: 'Power more' }],
      exit: exit(['jump'], { maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'One leg, rebound, Integrated Set',
          items: [
            breathStack(), ankleRocks(),
            jump('single-leg-pogo', 3, '10 contacts each', 20, 90, 'bent-knee-single-leg-calf-raise-isometric-hold'),
            jump('repeated-countermovement-jump', 3, '5', 5, 120, CALM_KNEE),
            it('trap-bar-deadlift', 'key', 3, '3, fast', 150, { key: true, cues: ['wall-behind'] }),
            it('isometric-split-squat-hold', 'assist', 3, 5, 60, { reps: 'each side' }),
            it('med-ball-squat-throw', 'assist', 3, '5', 60),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Approach day',
          items: [
            openBook(), it('standing-arm-swing-drill', 'prep', 2, '8', 20),
            jump('three-step-approach-jump', 4, '3', 3, 150, 'step-up-with-knee-drive'),
            jump('one-foot-approach-jump', 3, '3', 3, 150, 'step-up-with-knee-drive'),
            it('med-ball-scoop-toss-forward', 'key', 3, '5', 90, { key: true }),
            it('side-plank-top-leg-raise', 'assist', 2, 20, 30, { reps: 'each side' }),
            it('two-point-start-sprint', 'finish', 4, '20 m', 90),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then rebound', retest: ['jump'],
          items: [
            ankleRocks(),
            jump('lateral-pogo', 3, '15 contacts', 15, 75, CALM_ANKLE),
            jump('box-jump', 3, '3', 3, 120, CALM_KNEE),
            it('split-squat-with-dumbbells', 'key', 3, '5 each side', 120, { key: true }),
            it('inverted-row', 'assist', 3, '8', 60, { cues: ['elbows-to-pockets'] }),
            it('incline-push-up', 'assist', 3, '8', 60),
            neuralFlush(),
          ],
        },
      ],
    },
    {
      id: 'test', label: 'Lighter, then test', goal: 'About half the volume early in the week, then the jump check, the landing check and the Mirror.',
      source: [dunk('§9.3 week 8 "Lighter, then test"; §10 progress checks')],
      weeks: [{ wave: 4, label: 'Lighter week, then the test' }],
      exit: exit(['jump'], { maxRepeats: 0 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Lighter: rungs 1–3',
          items: [
            breathStack(),
            jump('pogo-hop', 2, '15 contacts', 15, 60, CALM_ANKLE),
            jump('countermovement-jump-to-stick', 2, '3', 3, 90, CALM_KNEE),
            it('goblet-squat-to-box', 'key', 2, '5', 90, { key: true }),
            neuralFlush(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Lighter: approach rhythm',
          items: [
            openBook(),
            jump('one-step-approach-jump', 2, '2', 2, 120, 'step-up-with-knee-drive'),
            it('step-up-with-knee-drive', 'key', 2, '6 each side', 90, { key: true }),
            longExhale(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Test day', retest: ['jump', 'landing', 'form'],
          items: [
            breathStack(), ankleRocks(),
            jump('countermovement-jump', 2, '3', 3, 120, CALM_KNEE),
            it('goblet-squat-to-box', 'key', 2, '5', 90, { key: true }),
            neuralFlush(),
          ],
        },
      ],
    },
  ],
};
