// lib/signature/content/basketballSkills.ts — SIGNATURE-PROGRAMS (2026-10-25): the basketball skills program. DRAFT.
//
// WHAT THE OWNER'S BOOKS GIVE, AND WHAT THEY DO NOT. The Blueprint's phase 4 "Basketball Application" (ch17) is the
// court's power, rebounding and shooting chapter: its med-ball vertical toss and its box-out drill ("hit first, widen
// fast, hold the fort") are here. The Playbook gives the frame every session runs in: ch2's foot tripod, ch5's pre-game
// Wake-Up, ch6's jump and land, ch7's SAQ ("start, stop and change direction: lean, crisp contacts, a stuck finish"),
// ch8's strength. The Dunk Program gives the approach and the arm swing (§9.1). What NONE of them write down is a
// progression of ball-handling, finishing, shooting or defensive drills with a dose: those come from FEL's authored
// library drafts (data/library/authored/b1–b3 basketball batches), and every one of those choices is listed in `gaps`
// for the owner to keep, change or replace.
//
// THE SHAPE. 10 planned weeks: footwork and form (4, the wave's easier week 4 holds the retests), moves at speed (4, an
// early advance after week 2 when the shot and the jump both read up), game reps (2). Retests every Friday: the shot
// (body-play makes, the daily drill's shooting reading), the jump check, and the Mirror's form.
import type { SignatureProgram } from '../types';
import { ankleRocks, blueprint, breathStack, dunk, exit, gap, it, jump, longExhale, neuralFlush, playbook } from './dsl';

const STANCE = 'defensive-stance-hold';
const CALM_ANKLE = 'bent-knee-double-leg-calf-raise-isometric-hold';
const tripod = () => it('tripod-foot-lift', 'prep', 2, '10 each side', 15);

export const BASKETBALL_SKILLS: SignatureProgram = {
  id: 'basketball-skills',
  title: 'Basketball Skills',
  tagline: 'Handles, finishing, shooting, footwork and defense, built on the Playbook\'s feet-first frame.',
  summary:
    'Three court days a week for 10 weeks. Weeks 1 to 4 build the footwork and the form: stationary handles, layups on both hands, form shooting, a real defensive stance. Weeks 5 to 8 put the moves at speed, and weeks 9 and 10 are game reps and a test. Every Friday starts with a re-test: your shots, your jump and your form. Strong reads move you on early; a dip repeats a week.',
  equipmentLine: 'A basketball and a hoop, a few cones, a wall, one dumbbell, a light med ball.',
  daysPerWeek: 3,
  prehabNote: null,
  sources: [
    blueprint('phase 4 "Basketball Application" ch17 (med-ball vertical toss, box-out drill)'),
    playbook('ch2 the Foot Tripod; ch5 the Pre-Game Wake-Up; ch6 Jumping and Landing; ch7 SAQ Made Simple; ch8 Strength Without Strain'),
    dunk('§9.1 arm swing and approach'),
    gap('handles, finishing, shooting and defensive drills and their doses: FEL-authored library drafts (b1–b3 basketball)'),
  ],
  gaps: [
    "The books have no ball-handling progression: the stationary-to-moving-to-combo order and every handles dose are FEL's draft from the library's basketball batches.",
    'Finishing (layup hands and footwork reads) and shooting (form → catch-and-shoot → off the dribble) progressions and their "10 makes" doses are FEL drafts, not the owner\'s.',
    "Defensive drills beyond the Blueprint's box-out (slides, closeouts, contests) are FEL drafts.",
    'Passing is not in this program (the brief named handles, finishing, shooting, footwork and defense): the owner may want a passing day.',
    'Shooting is re-tested only where the game counts body-play shots; there is no in-app make tracker for a real hoop yet.',
  ],
  phases: [
    {
      id: 'form', label: 'Footwork and form', goal: 'A real stance, both hands, a repeatable shot: stationary first, every rep clean.',
      source: [playbook('ch2 tripod; ch7 SAQ'), blueprint('phase 4 ch17 box-out'), gap('handles / finishing / shooting doses')],
      weeks: [{ wave: 1, label: 'Learn the moves' }, { wave: 2, label: 'Build' }, { wave: 3, label: 'Build more' }, { wave: 4, label: 'Easier week, then re-test' }],
      exit: exit(['shot', 'form'], { maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Handles and finishing',
          items: [
            tripod(), it('lateral-skip', 'prep', 1, '2 lengths', 0),
            jump('lateral-hop-to-stick', 2, '5 each side', 10, 60, STANCE),
            it('stationary-crossover', 'key', 3, 30, 20, { key: true }),
            it('pound-dribble', 'assist', 3, 30, 20),
            it('right-hand-layup', 'assist', 3, '10 makes', 30),
            it('left-hand-layup', 'assist', 3, '10 makes', 30),
            it('full-court-speed-dribble', 'finish', 3, '1 length', 30),
            longExhale(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Shooting and footwork',
          items: [
            ankleRocks(), it('skip-for-height', 'prep', 1, '2 lengths', 0),
            jump('countermovement-jump-to-stick', 2, '4', 4, 60, CALM_ANKLE),
            it('one-hand-form-shooting', 'key', 3, '10 makes', 30, { key: true }),
            it('jump-stop', 'assist', 3, '6 each side', 30),
            it('front-pivot', 'assist', 2, '6 each side', 30),
            it('free-throw-routine', 'assist', 3, '10 makes', 45),
            it('around-the-world-shooting', 'finish', 2, '10 makes', 45),
            neuralFlush(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then defense', retest: ['shot', 'form', 'jump'],
          items: [
            tripod(), it('defensive-slide-warm-up', 'prep', 1, '2 lengths', 0),
            jump('lateral-hop-to-stick', 2, '5 each side', 10, 60, STANCE),
            it('defensive-slide', 'key', 3, '4 lengths', 30, { key: true }),
            it('defensive-stance-hold', 'assist', 3, 30, 20),
            it('box-out', 'assist', 3, '5 each role', 30),
            it('goblet-squat', 'assist', 3, '8', 75, { cues: ['tripod-down'] }),
            it('suitcase-carry', 'finish', 2, '20 m each hand', 60),
            longExhale(),
          ],
        },
      ],
    },
    {
      id: 'speed', label: 'Moves at speed', goal: 'The same skills on the move: change of pace, finishing reads, shots off movement, closeouts.',
      source: [playbook('ch6; ch7 "a stuck finish"'), dunk('§9.1 approach'), blueprint('phase 4 ch17 med-ball vertical toss'), gap('moving handles, finishing reads, catch-and-shoot doses')],
      weeks: [{ wave: 1, label: 'Learn the moves at speed' }, { wave: 2, label: 'Build' }, { wave: 3, label: 'Build more' }, { wave: 4, label: 'Easier week, then re-test' }],
      exit: exit(['shot', 'jump'], { earlyAfterWeek: 2, maxRepeats: 1, repeatWeeks: 1 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Handles on the move, finishing reads',
          items: [
            tripod(), it('lateral-skip', 'prep', 1, '2 lengths', 0),
            jump('lateral-bound-to-stick', 3, '4 each side', 8, 75, STANCE),
            it('moving-crossover', 'key', 4, '1 length', 30, { key: true }),
            it('crossover-between-combo', 'assist', 3, 30, 20),
            it('power-layup', 'assist', 3, '10 makes', 30),
            it('reverse-layup', 'assist', 3, '10 makes', 30),
            it('cone-change-of-pace-dribble', 'finish', 3, 30, 30),
            longExhale(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Shots off movement',
          items: [
            ankleRocks(), it('standing-arm-swing-drill', 'prep', 2, '8', 20),
            jump('one-step-approach-jump', 3, '3', 3, 90, 'step-up-with-knee-drive'),
            it('catch-and-shoot-hop', 'key', 3, '10 makes', 30, { key: true }),
            it('jab-step', 'assist', 3, '6 each side', 30),
            it('hop-gather', 'assist', 3, '6 each side', 30),
            it('spot-up-shooting-five-spots', 'assist', 2, '10 makes', 45),
            it('free-throw-routine', 'finish', 2, '10 makes', 45),
            neuralFlush(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then defense at speed', retest: ['shot', 'jump'],
          items: [
            tripod(), it('closeout-warm-up', 'prep', 1, '2 lengths', 0),
            jump('lateral-bound-to-stick', 3, '4 each side', 8, 75, STANCE),
            it('closeout-to-slide', 'key', 3, '4 lengths', 30, { key: true }),
            it('zig-zag-defensive-slide', 'assist', 3, '4 lengths', 45),
            it('med-ball-squat-throw', 'assist', 3, '5', 60),
            it('split-squat-with-dumbbells', 'assist', 3, '6 each side', 75, { cues: ['front-heel'] }),
            it('5-10-5-shuttle', 'finish', 3, '1 run', 60),
            longExhale(),
          ],
        },
      ],
    },
    {
      id: 'game', label: 'Game reps', goal: 'Combos into finishes, shots off the dribble, contests: then a lighter week and the test.',
      source: [playbook('ch5 Wake-Up before game reps; ch7'), gap('combo, off-the-dribble and contest doses')],
      weeks: [{ wave: 2, label: 'Game reps' }, { wave: 4, label: 'Lighter, then test' }],
      exit: exit(['shot', 'jump'], { maxRepeats: 0 }),
      sessions: [
        {
          key: 'A', day: 'Mon', label: 'Combos into finishes',
          items: [
            tripod(), it('lateral-skip', 'prep', 1, '2 lengths', 0),
            jump('two-step-approach-jump', 3, '3', 3, 90, 'step-up-with-knee-drive'),
            it('crossover-into-layup', 'key', 4, '1 length', 30, { key: true }),
            it('between-behind-combo', 'assist', 3, 30, 20),
            it('hop-step-finish', 'assist', 3, '10 makes', 30),
            it('full-court-layup-lines', 'finish', 3, '4 lengths', 60),
            longExhale(),
          ],
        },
        {
          key: 'B', day: 'Wed', label: 'Shots off the dribble',
          items: [
            ankleRocks(), breathStack(),
            jump('countermovement-jump', 2, '3', 3, 90, CALM_ANKLE),
            it('pull-up-jumper-off-the-dribble', 'key', 3, '10 makes', 30, { key: true }),
            it('elbow-jumper-series', 'assist', 3, '10 makes', 45),
            it('jab-crossover', 'assist', 2, '6 each side', 30),
            it('fatigue-free-throws', 'finish', 2, '10 makes', 45),
            neuralFlush(),
          ],
        },
        {
          key: 'C', day: 'Fri', label: 'Re-test, then compete', retest: ['shot', 'jump', 'form'],
          items: [
            tripod(), it('defensive-slide-warm-up', 'prep', 1, '2 lengths', 0),
            jump('lateral-bound-to-stick', 2, '4 each side', 8, 75, STANCE),
            it('recover-and-contest', 'key', 3, 20, 30, { key: true }),
            it('slide-run-slide', 'assist', 3, '4 lengths', 30),
            it('box-out', 'assist', 3, '5 each role', 30),
            it('5-10-5-shuttle', 'finish', 3, '1 run', 60),
            longExhale(),
          ],
        },
      ],
    },
  ],
};
