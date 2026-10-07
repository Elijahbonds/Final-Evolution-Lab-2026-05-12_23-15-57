// captureProtocol — the owner-led capture's takes, labels and names (MIRROR PHASE 3, lane/capture, 2026-10-07).
//
// OWNER DECISION (2026-10-07): the Mirror's and the Quick Screen's thresholds are finalised by an owner-led capture: the
// owner plus 2 adults, on 2 phones (one mid-range Android, one iPhone), recording POSE NUMBERS ONLY, never video, and
// no minors. Every grader is then replayed against the captures and the thresholds move from PROPOSED to TUNED when
// the owner signs them off.
//
// This file is the one list of what is recorded. The recorder (/dev/pose-record, "Mirror capture" set) walks it, the
// ingest (scripts/mirror-capture.ts) refuses a take it does not name, the replay report reads each take's label as
// the truth it grades against, and docs/MIRROR-CAPTURE-PROTOCOL.md is the same list in plain words (a test keeps the
// two in step). A take is GOOD (done the way the coach wants) or one named FAULT, done on purpose, gently, so the
// report can say how often each grader catches it and how often it cries wolf on a good rep.
//
// People are aliases (P1 = the owner, P2, P3), never names; a capture states that everyone in it is an adult.
//
// Pure data and small checks. No DOM, no fs.

export const CAPTURE_PROTOCOL = 'mirror-capture-1';

/** The three people: the owner and two adults. An alias, never a name. */
export const PERSON_ALIASES = ['P1', 'P2', 'P3'] as const;
export type PersonAlias = (typeof PERSON_ALIASES)[number];

/** The two phones of the owner decision. */
export const CAPTURE_DEVICES = ['android-mid', 'iphone'] as const;
export type CaptureDevice = (typeof CAPTURE_DEVICES)[number];

export type CaptureMovement =
  | 'stand' | 'squat' | 'lunge' | 'pressRow' | 'jump' | 'hinge' | 'pushup' | 't1' | 't2' | 't3' | 'light';
export type CaptureView = 'front' | 'side';
export type CaptureSide = 'left' | 'right';

export interface CaptureTake {
  /** Stable id: `<movement>[.<side>|.<view>].<label>`; the ingest and the report key on it. */
  id: string;
  movement: CaptureMovement;
  /** 'good', or the fault done on purpose. */
  label: string;
  view: CaptureView;
  /** The working side: the front leg (lunge), the tested leg (T2, T3), or the side toward the camera (side views). */
  side?: CaptureSide;
  /** Reps (or jumps, or rocks) asked for. 0 for a still stand. */
  reps: number;
  /** Seconds recorded after GO. */
  seconds: number;
  /** On the screen, readable from 3 m. */
  prompt: string;
  /** The jump: ask the camera for 60 fps for this take (the T5 opt-in, measured). */
  highRate?: boolean;
  /** Optional: the take may be skipped (a fault some people should not do on purpose). */
  optional?: boolean;
  /** Where the phones go: at hip height (default), or on the floor (the push-up, as the Mirror's push-up tab asks). */
  placement?: 'floor';
}

/** Plain names for the movements (the recorder's list and the doc). */
export const MOVEMENT_NAME: Record<CaptureMovement, string> = {
  stand: 'Calibration stand', squat: 'Squat (Mirror)', lunge: 'Split squat / lunge (Mirror)', pressRow: 'Press / row (Mirror)',
  jump: 'Jump (Quick Screen T5 and the Mirror jump)', hinge: 'Hip hinge (Mirror)', pushup: 'Push-up (Mirror)',
  t1: 'Overhead squat (Quick Screen T1)', t2: 'Knee to wall (Quick Screen T2)', t3: 'Single-leg squat (Quick Screen T3)',
  light: 'Light and distance (the "move closer" line)',
};

/** Plain names for every label (the doc's table and the recorder's take list). */
export const LABEL_NAME: Record<string, string> = {
  good: 'good reps',
  kneesCaveIn: 'knees cave in', heelsLift: 'heels lift', shallow: 'shallow', shiftToOneSide: 'shift to one side',
  frontKneeCavesIn: 'front knee caves in', trunkLean: 'trunk leans sideways',
  elbowFlare: 'elbows flare out', shrug: 'shoulders shrug up',
  stiffLanding: 'stiff landing', kneesCaveInLanding: 'knees cave in on landing', armSwing: 'arm swing (hands leave hips)',
  kneeDominant: 'squat-shaped (knees lead the hinge)', headPoke: 'head pokes forward (upper back rounds)',
  hipsSag: 'hips sag', hipsPike: 'hips pike up', partial: 'half-depth reps',
  walkIn: 'walk into position, then good reps', kneePushup: 'knee push-ups (good)',
  armsForward: 'arms fall forward', forwardLean: 'chest leans far forward',
  heelLift: 'front heel lifts', shortRange: 'short range (stops halfway)',
  hipDrop: 'free-side hip drops',
  dim: 'dim light', far: 'far from the phone',
};

const t = (id: string, movement: CaptureMovement, label: string, view: CaptureView, reps: number, seconds: number, prompt: string,
  o: { side?: CaptureSide; highRate?: boolean; optional?: boolean; placement?: 'floor' } = {}): CaptureTake =>
  ({ id, movement, label, view, reps, seconds, prompt, ...o });

const GENTLE = 'Only as far as is comfortable.';

/** Every take, in the order the recorder runs them (grouped so nobody turns round more than they must). */
export const CAPTURE_TAKES: readonly CaptureTake[] = [
  // ── calibration stands (the Quick Screen's graders read the athlete's own standing lines from these) ──
  t('stand.front', 'stand', 'good', 'front', 0, 4, 'Stand still facing the camera, arms relaxed at your sides.'),
  t('stand.side', 'stand', 'good', 'side', 0, 3, 'Turn so your LEFT side faces the camera. Stand still, arms at your sides.', { side: 'left' }),

  // ── squat (the Mirror's squat tab: facing the camera, bodyweight) ──
  t('squat.good', 'squat', 'good', 'front', 5, 20, 'Facing the camera: 5 slow bodyweight squats. Thighs to level, knees over your toes, heels down.'),
  t('squat.kneesCaveIn', 'squat', 'kneesCaveIn', 'front', 3, 14, `3 squats letting BOTH knees fall inward at the bottom. ${GENTLE}`),
  t('squat.heelsLift', 'squat', 'heelsLift', 'front', 3, 14, '3 squats rising onto your toes at the bottom, so your heels lift.'),
  t('squat.shallow', 'squat', 'shallow', 'front', 3, 12, '3 quarter squats: bend only a little.'),
  t('squat.shiftToOneSide', 'squat', 'shiftToOneSide', 'front', 3, 14, '3 squats shifting your hips toward your RIGHT at the bottom.'),

  // ── split squat / lunge (the Mirror's lunge tab: facing the camera; `side` = the front leg) ──
  // FULL sets of 8 on each leg (lane/mirror-moves, 2026-10-07: under synthetic jitter the lunge's rep counter counts
  // 4–6 of 8 on the left, so a real set may never reach the right leg; these takes measure that rep count)
  t('lunge.left.good', 'lunge', 'good', 'front', 8, 36, 'Facing the camera, LEFT foot forward: a full set of 8 slow split squats, back knee toward the floor.', { side: 'left' }),
  t('lunge.right.good', 'lunge', 'good', 'front', 8, 36, 'Facing the camera, RIGHT foot forward: a full set of 8 slow split squats, back knee toward the floor.', { side: 'right' }),
  t('lunge.left.frontKneeCavesIn', 'lunge', 'frontKneeCavesIn', 'front', 3, 16, `LEFT foot forward: 3 split squats letting the FRONT knee fall inward at the bottom. ${GENTLE}`, { side: 'left' }),
  t('lunge.left.trunkLean', 'lunge', 'trunkLean', 'front', 3, 16, 'LEFT foot forward: 3 split squats leaning your upper body to one side at the bottom.', { side: 'left' }),
  t('lunge.left.shallow', 'lunge', 'shallow', 'front', 3, 14, 'LEFT foot forward: 3 split squats dipping only a little.', { side: 'left' }),

  // ── press / row (the Mirror's press/row tab: facing the camera, split stance, no weight needed) ──
  t('pressRow.good', 'pressRow', 'good', 'front', 5, 20, 'Facing the camera, split stance: pull both elbows back, then press forward. 5 slow reps, shoulders down, body tall.'),
  t('pressRow.elbowFlare', 'pressRow', 'elbowFlare', 'front', 3, 14, '3 press/rows letting your elbows flare out wide and high as you pull.'),
  t('pressRow.shrug', 'pressRow', 'shrug', 'front', 3, 14, '3 press/rows shrugging your shoulders up toward your ears on each pull.'),
  t('pressRow.trunkLean', 'pressRow', 'trunkLean', 'front', 3, 14, '3 press/rows leaning your upper body to one side on each rep.'),

  // ── jump (Quick Screen T5 and the Mirror's jump tab: facing the camera, hands on hips; 60 fps asked for) ──
  t('jump.good', 'jump', 'good', 'front', 3, 18, 'Hands on hips. 3 jumps as high as you can: dip, jump, land softly, then stand still 2 seconds.', { highRate: true }),
  t('jump.stiffLanding', 'jump', 'stiffLanding', 'front', 3, 16, 'Hands on hips. 3 LOW jumps landing with straight, stiff legs. Keep them small.', { highRate: true }),
  t('jump.kneesCaveInLanding', 'jump', 'kneesCaveInLanding', 'front', 3, 16, 'Hands on hips. 3 SMALL hops, letting the knees fall in a little as you land. Skip this if you are unsure.', { highRate: true, optional: true }),
  t('jump.armSwing', 'jump', 'armSwing', 'front', 3, 16, '3 jumps swinging your arms up (hands leave your hips).', { highRate: true }),

  // ── hip hinge (the Mirror's hinge tab: side-on, left side to the camera, phones at hip height) ──
  t('hinge.good', 'hinge', 'good', 'side', 11, 44, 'LEFT side to the camera, hands on hips: 11 clean hip hinges. Hips back, back flat, soft knees.', { side: 'left' }),
  t('hinge.kneeDominant', 'hinge', 'kneeDominant', 'side', 3, 14, '3 squat-shaped hinges: bend the knees a lot and drop the hips straight down.', { side: 'left' }),
  t('hinge.headPoke', 'hinge', 'headPoke', 'side', 3, 14, `3 hinges poking the head forward, letting the upper back round. ${GENTLE}`, { side: 'left' }),
  t('hinge.walkIn', 'hinge', 'walkIn', 'side', 3, 22, 'Start off to one side. Walk onto the mark, turn LEFT side to the camera, then 3 clean hinges.', { side: 'left' }),

  // ── push-up (the Mirror's push-up tab: side-on, left side to the camera, PHONES ON THE FLOOR) ──
  t('pushup.good', 'pushup', 'good', 'side', 11, 44, 'Phones on the floor. LEFT side to the camera: 11 clean push-ups, body in one straight line.', { side: 'left', placement: 'floor' }),
  t('pushup.knee', 'pushup', 'kneePushup', 'side', 5, 22, '5 knee push-ups: knees down, body straight from knees to shoulders.', { side: 'left', placement: 'floor' }),
  t('pushup.hipsSag', 'pushup', 'hipsSag', 'side', 3, 14, '3 push-ups letting the hips sag toward the floor.', { side: 'left', placement: 'floor' }),
  t('pushup.hipsPike', 'pushup', 'hipsPike', 'side', 3, 14, '3 push-ups with the hips pushed up high (a pike).', { side: 'left', placement: 'floor' }),
  t('pushup.partial', 'pushup', 'partial', 'side', 3, 12, '3 push-ups going only halfway down.', { side: 'left', placement: 'floor' }),
  t('pushup.walkIn', 'pushup', 'walkIn', 'side', 3, 24, 'Start standing to one side. Walk onto the mark, get down into position, then 3 clean push-ups.', { side: 'left', placement: 'floor' }),

  // ── Quick Screen T1: overhead squat, front then side ──
  t('t1.front.good', 't1', 'good', 'front', 3, 16, 'Facing the camera, arms straight overhead, feet shoulder-width: 3 slow overhead squats.'),
  t('t1.front.kneesCaveIn', 't1', 'kneesCaveIn', 'front', 3, 16, `Arms overhead: 3 overhead squats letting BOTH knees fall inward. ${GENTLE}`),
  t('t1.side.good', 't1', 'good', 'side', 3, 16, 'LEFT side to the camera, arms straight overhead: 3 slow overhead squats.', { side: 'left' }),
  t('t1.side.armsForward', 't1', 'armsForward', 'side', 3, 16, 'LEFT side to the camera: 3 overhead squats letting the arms fall forward in front of you.', { side: 'left' }),
  t('t1.side.heelsLift', 't1', 'heelsLift', 'side', 3, 16, 'LEFT side to the camera, arms overhead: 3 squats rising onto your toes at the bottom.', { side: 'left' }),
  t('t1.side.forwardLean', 't1', 'forwardLean', 'side', 3, 16, 'LEFT side to the camera, arms overhead: 3 squats leaning the chest far forward at the bottom.', { side: 'left' }),

  // ── Quick Screen T2: knee to wall (the tested side toward the camera) ──
  t('t2.left.good', 't2', 'good', 'side', 3, 16, 'LEFT side to the camera, left foot forward, a hand from the wall: rock the knee to the wall 3 times, heel down.', { side: 'left' }),
  t('t2.right.good', 't2', 'good', 'side', 3, 16, 'Turn round: RIGHT side to the camera, right foot forward: rock the knee to the wall 3 times, heel down.', { side: 'right' }),
  t('t2.left.heelLift', 't2', 'heelLift', 'side', 3, 16, 'LEFT side to the camera, left foot forward: 3 rocks letting the front heel lift each time.', { side: 'left' }),
  t('t2.right.shortRange', 't2', 'shortRange', 'side', 3, 16, 'RIGHT side to the camera, right foot forward: 3 rocks going only halfway to the wall.', { side: 'right' }),

  // ── Quick Screen T3: single-leg squat, facing the camera ──
  t('t3.left.good', 't3', 'good', 'front', 3, 16, 'Facing the camera, hands on hips, standing on your LEFT leg: 3 slow single-leg squats.', { side: 'left' }),
  t('t3.right.good', 't3', 'good', 'front', 3, 16, 'Facing the camera, hands on hips, standing on your RIGHT leg: 3 slow single-leg squats.', { side: 'right' }),
  t('t3.left.kneesCaveIn', 't3', 'kneesCaveIn', 'front', 3, 16, `On your LEFT leg: 3 single-leg squats letting the knee fall inward. ${GENTLE}`, { side: 'left' }),
  t('t3.left.hipDrop', 't3', 'hipDrop', 'front', 3, 16, 'On your LEFT leg: 3 single-leg squats letting the hip of the lifted leg drop.', { side: 'left' }),
  t('t3.right.trunkLean', 't3', 'trunkLean', 'front', 3, 16, 'On your RIGHT leg: 3 single-leg squats leaning the upper body sideways.', { side: 'right' }),

  // ── light and distance (the lite model's confidence floor: these SHOULD show "move closer, or add more light") ──
  t('light.dim', 'light', 'dim', 'front', 3, 14, 'Turn the room lights low (one lamp), then 3 bodyweight squats facing the camera.'),
  t('light.far', 'light', 'far', 'front', 3, 14, 'Step back as far as the room allows (5 to 6 m if you can), then 3 bodyweight squats.'),
];

export const captureTake = (id: string): CaptureTake | undefined => CAPTURE_TAKES.find((x) => x.id === id);

/**
 * Labels done CORRECTLY: good reps, a walk into position followed by good reps (nothing may fire, and no rep may be
 * counted, on the walk), and knee push-ups (a correct variant). The graders must stay silent on all three.
 */
export const GOOD_LABELS: readonly string[] = ['good', 'walkIn', 'kneePushup'];
export const isGoodLabel = (label: string): boolean => GOOD_LABELS.includes(label);

/** Every fault label the protocol names (the good ones excluded). */
export const FAULT_LABELS: readonly string[] = [...new Set(CAPTURE_TAKES.map((x) => x.label).filter((l) => !isGoodLabel(l)))];

export const isPersonAlias = (x: unknown): x is PersonAlias => typeof x === 'string' && (PERSON_ALIASES as readonly string[]).includes(x);
export const isCaptureDevice = (x: unknown): x is CaptureDevice => typeof x === 'string' && (CAPTURE_DEVICES as readonly string[]).includes(x);

/** fel-capture-P2-android-mid-2026-10-09-1530.json, local time: who (alias), which phone, when. Never a name. */
export function captureFileName(person: PersonAlias, device: CaptureDevice, d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `fel-capture-${person}-${device}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/** The capture block a recorded file carries: who (alias), which phone, and the two statements the protocol asks for. */
export interface CaptureMeta {
  protocol: typeof CAPTURE_PROTOCOL;
  person: PersonAlias;
  device: CaptureDevice;
  /** Everyone recorded is 18 or over (the recorder will not save without it). */
  adult: true;
  /** They read the consent wording and said yes (docs/MIRROR-CAPTURE-PROTOCOL.md). */
  consent: true;
}

/** Problems with a capture block; empty when it is well formed. */
export function captureMetaProblems(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return ['no capture block'];
  const m = meta as Record<string, unknown>;
  const out: string[] = [];
  if (m.protocol !== CAPTURE_PROTOCOL) out.push(`capture.protocol must be ${CAPTURE_PROTOCOL}`);
  if (!isPersonAlias(m.person)) out.push(`capture.person must be an alias (${PERSON_ALIASES.join(', ')}), never a name`);
  if (!isCaptureDevice(m.device)) out.push(`capture.device must be ${CAPTURE_DEVICES.join(' or ')}`);
  if (m.adult !== true) out.push('capture.adult must be true: adults only, no minors in a capture');
  if (m.consent !== true) out.push('capture.consent must be true: the consent was read and agreed');
  return out;
}
