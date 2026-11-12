// Authored block: conditioning and the Playbook's ch9 reset (breath, wind-down). Steady, repeatable efforts.
import { reps, secs, type Family } from './types';

const B = 'conditioning-recovery';
const EXHALE = 'Let the air out longer than it came in.';

export const CONDITIONING: Family[] = [
  {
    family: 'jump-rope', block: B, category: 'conditioning', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'jump-land', braceMode: 'reflex',
    primary: ['calves', 'soleus'], secondary: ['foot', 'forearms', 'delts'], goals: ['conditioning', 'ankle', 'footwork', 'warmup'], sport: ['general', 'basketball', 'tennis'],
    lowLoad: ['back', 'knee'], youthOk: true, equipment: ['jump-rope'], clip: 'hop',
    setup: 'Stand tall on the balls of the feet, rope behind you, hands at the hips.',
    cues: ['Turn the rope with small circles from the handles, not big arm swings.', 'Tiny, quiet hops off the floor, an inch high.', 'Find a steady rhythm, like a metronome beat.'],
    faults: [
      { fault: 'Big, loud jumps', fix: 'Jump just high enough to clear the rope, quiet on the floor.' },
      { fault: 'Arms swinging wide', fix: 'Keep the handles by your pockets and turn from them.' },
    ],
    dosage: secs(5, 30, 30),
    variants: [
      { name: 'Basic Rope Jump', v: 'basic', level: 'beginner', aliases: ['Rope Skipping'] },
      { name: 'Alternate-Foot Rope Jump', v: 'alternate', level: 'beginner', laterality: 'alternating', cue: 'Step over the rope one foot at a time, like a light jog on the spot.', aliases: ['Boxer Skip'] },
      { name: 'Side-to-Side Rope Jump', v: 'side-side', level: 'intermediate', plane: 'frontal', cue: 'Hop side to side over a line on the floor while the rope turns.' },
      { name: 'High-Knee Rope Jump', v: 'high-knee', level: 'intermediate', laterality: 'alternating', cue: 'Run on the spot with the knees up toward the ceiling while the rope turns.' },
      { name: 'Single-Leg Rope Jump', v: 'single-leg', level: 'advanced', laterality: 'unilateral', cue: 'Hop on one foot, quiet and light, for the whole interval.' },
      { name: 'Double Under', v: 'double-under', level: 'advanced', cue: 'One higher hop off the floor, the rope passing twice under your feet.', aliases: ['Double Unders'] },
    ],
  },
  {
    family: 'machine-intervals', block: B, category: 'conditioning', pattern: 'locomotion', plane: 'sagittal', laterality: 'bilateral', skillLayer: null, braceMode: 'none',
    primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings', 'lats'], goals: ['conditioning'], sport: ['general', 'basketball', 'soccer'],
    lowLoad: ['back', 'knee', 'ankle'], youthOk: true, equipment: ['bike'], clip: 'sprint',
    setup: 'Set the machine up to fit you and warm up for five easy minutes first.',
    cues: ['Hit the same effort every interval, start to finish.', 'Breathe out long through the easy parts.', 'Stay smooth: the same tempo at the end as at the start.'],
    faults: [
      { fault: 'First interval flat out, the rest fading', fix: 'Pick an effort you can repeat for every interval.' },
      { fault: 'Form falling apart late', fix: 'Shorten the effort or slow the tempo until it stays smooth.' },
    ],
    dosage: secs(8, 20, 40),
    variants: [
      { name: 'Bike Sprint Intervals', v: 'bike-sprint', level: 'intermediate', aliases: ['Air Bike Intervals'] },
      { name: 'Bike Tempo Ride', v: 'bike-tempo', level: 'beginner', cue: 'Steady pace you could talk at, the same cadence the whole ride.', dosage: { sets: 1, seconds: 1200, restSec: 0 } },
      { name: 'Rower Intervals', v: 'row', level: 'intermediate', equipment: ['rower'], setup: 'Feet strapped in, handle in both hands, knees bent at the catch.', cue: 'Push the footplate away first, then pull the handle to your ribs.', primary: ['quads', 'lats', 'glutes'], secondary: ['hamstrings', 'mid-back'] },
      { name: 'Rower Steady State', v: 'row-steady', level: 'beginner', equipment: ['rower'], setup: 'Feet strapped in, handle in both hands, knees bent at the catch.', cue: 'Long, smooth strokes: push the footplate away, then pull the handle in.', dosage: { sets: 1, seconds: 900, restSec: 0 }, primary: ['quads', 'lats', 'glutes'], secondary: ['hamstrings', 'mid-back'] },
    ],
  },
  {
    family: 'conditioning-circuit', block: B, category: 'conditioning', pattern: 'locomotion', plane: 'multi', laterality: 'bilateral', skillLayer: null, braceMode: 'reflex',
    primary: ['quads', 'glutes', 'delts'], secondary: ['abs', 'calves', 'chest'], goals: ['conditioning'], sport: ['general', 'basketball', 'football'],
    lowLoad: [], youthOk: true, equipment: [], clip: 'jump',
    setup: 'Clear a few metres of floor around you.',
    cues: ['Keep every rep clean: the same rep at the end as at the start.', 'Breathe out on the hardest part of each rep.', 'Land quiet whenever you leave the floor.'],
    faults: [
      { fault: 'Form slipping as you tire', fix: 'Slow down or rest; clean reps only.' },
      { fault: 'Holding the breath', fix: 'Breathe out on every effort.' },
    ],
    dosage: secs(4, 30, 30),
    variants: [
      { name: 'Squat Thrust', v: 'squat-thrust', level: 'beginner', cue: 'Hands to the floor, step or hop back to a plank, back in, stand tall.', aliases: ['Step-Back Burpee'] },
      { name: 'Burpee', v: 'burpee', level: 'intermediate', cue: 'Hands to the floor, hop back, chest to the floor, push up, hop in, jump tall.' },
      { name: 'Mountain Climber Run', v: 'mountain-climber', level: 'beginner', setup: 'High plank, arms straight.', cue: 'Drive the knees toward the floor under your chest, one after the other, quick and light.', primary: ['hip-flexors', 'abs'], secondary: ['delts', 'quads'] },
      { name: 'Jumping Jack', v: 'jumping-jack', level: 'beginner', plane: 'frontal', cue: 'Jump the feet out and in with the hands meeting overhead, light on the floor.', goals: ['conditioning', 'warmup'] },
      { name: 'Seal Jack', v: 'seal-jack', level: 'beginner', plane: 'frontal', cue: 'Jump your feet out and in while your hands clap out to the walls and back in front.', goals: ['conditioning', 'warmup'] },
    ],
  },
  {
    family: 'breath-drill', block: B, category: 'recovery', pattern: 'breath', plane: 'sagittal', laterality: 'bilateral', skillLayer: 'reset', braceMode: 'none',
    primary: ['diaphragm'], secondary: ['deep-core', 'obliques'], goals: ['cooldown', 'posture'], sport: ['general', 'basketball'],
    lowLoad: ['knee', 'ankle', 'back', 'shoulder', 'wrist', 'hip', 'elbow'], youthOk: true, equipment: ['mat'], clip: 'breathe',
    setup: 'Lie or sit comfortably on a mat in the position the drill names.',
    cues: ['Breathe in through the nose for a slow count of four.', EXHALE, 'Let the next breath come on its own; no rush.'],
    faults: [
      { fault: 'Short, fast breaths', fix: 'Slow the count: four in, six to eight out.' },
      { fault: 'Lifting the shoulders to breathe in', fix: 'Let the breath widen the ribs toward the walls, not the ears.' },
    ],
    dosage: { sets: 1, seconds: 120, restSec: 0 },
    variants: [
      { name: '90/90 Breathing', v: '90-90', level: 'beginner', equipment: ['mat', 'wall'], setup: 'On your back with the feet flat on a wall, knees and hips bent to right angles.', cue: 'Press your heels gently into the wall and breathe out until your ribs settle to the floor.' },
      { name: 'Crocodile Breathing', v: 'crocodile', level: 'beginner', setup: 'Lie face down on a mat, forehead resting on the stacked hands.', cue: 'Breathe so the belt line pushes into the floor and the lower back rises.' },
      { name: 'Box Breathing', v: 'box', level: 'beginner', setup: 'Sit tall on the floor or a chair.', cues: ['Breathe in for four, hold for four, out for four, hold for four.', 'Keep each side of the box the same length.', 'Let the shoulders stay low and still.'] },
      { name: 'Long-Exhale Walk', v: 'walk', level: 'beginner', equipment: [], setup: 'Walk slowly around the room or the court.', cue: 'Breathe in for three steps and out for six, a slow, steady beat.', dosage: { sets: 1, seconds: 180, restSec: 0 }, goals: ['cooldown'] },
      { name: 'Legs-Up-the-Wall Breathing', v: 'legs-up', level: 'beginner', equipment: ['mat', 'wall'], setup: 'Lie on your back with the legs resting straight up the wall.', cue: 'Breathe out long and let the floor take all your weight.' },
    ],
  },
];
