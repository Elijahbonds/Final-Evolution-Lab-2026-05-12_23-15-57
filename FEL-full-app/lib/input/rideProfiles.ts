// rideProfiles — the boards' and the racers' body rows (movement play P8, 2026-09-26): skate, snow, surf, free run, the
// kart and the plane. bodyProfiles puts RIDE_ROWS in its table in place of their P3 rows (key for key); everything a row
// here binds is pressed by the floor (lib/input/bodyFloor) off the ride read (lib/pose/rideReader). What a mode reads
// itself (the grab, the spin, the push, the graded stride, the dip) is on its card through ModeBodySpec.lines
// (RIDE_MODE_LINES here, composed by lib/babylon/core/rideBody's rideLines) — never a binding.
//
// What each row means (PLAN-P8 §3.2):
//   skate   lean on your toes / heels (the stance's carve) → STEER; crouch → PUMP (the pop's height); hop → POP. The mode
//           reads the rest itself (lib/babylon/core/rideBody): a hand to the board's edge in the air → GRAB, a
//           quarter-turn of the shoulders in the air → SPIN (the game finishes it), a kick-push with the back foot → PUSH.
//   snow    carve → STEER; crouch → TUCK; hop → JUMP; the mode: GRAB, SPIN (and the rail is caught for a body rider).
//   surf    carve → STEER; the crouch's RHYTHM → TRIM (compress = drop in, extend = climb: the mode's own pump rule reads
//           a real pump); hop at the lip → AIR; the mode: GRAB, a quarter-turn on the face → CUTBACK, in the air → SPIN.
//   big air the mode takes the steps (claims step: graded on the camera's clock against a body's cadence) → RUN-UP; a
//           quarter-turn in the air → SPIN (the game plants it); a hand to the edge → GRAB. Steps in the game's air are
//           ignored. Its table row stays P3's step → d-pad: the claim takes it off the floor, so dropping the claim IS
//           the cut line.
//   sprint  the mode takes the steps (claims step: graded on a body's cadence scale) → STRIDE; the chest dipped at the tape
//           → DIP. Its table row stays P3's, as big air's.
//   freerun running in place → RUN on its own band (a walk under the vault gate, a run up to the sprint gate); high knees →
//           SPRINT (RT); hop → JUMP.
//   kart    grip the wheel → GAS; turn it → STEER; hop into a turned wheel → DRIFT (X, held until the wheel straightens).
//   plane   spread your wings → GAS; tilt them → STEER; raise / lower them → CLIMB.
// Everything else stays on the pad and the touch deck (hybrid, owner): menus, flips, manuals, wall rides, boost, items,
// stunts, the kart's brake, STOMP.
//
// THE RIDE SWITCH. The kart and the plane bind only once the live probe has measured 0 misfires in them (owner): until then
// their rows are session-only and READY says body play is coming. NEXT_PUBLIC_FEL_BODY_RIDE — a comma list of registry
// keys, inlined at build time, unset in production — turns them on for a probe's dev server. Flipping one on for everyone
// is a one-line change to RIDE_DEFAULT_ON, on the probe's word — given for both on 2026-09-26 (RIDE_DEFAULT_ON below);
// emptying it is their cut line back to "coming".
//
// Each P8 row's CUT LINE falls back to its P3 row (bodyProfiles keeps them where they were, P3_RIDE_ROWS): the lean, the
// crouch and the pop.
// Pure data: no DOM, no Babylon. Only types come from bodyProfiles (it imports this file's rows: no runtime cycle).
import type { BodyProfile } from './bodyProfiles';
import type { CardLine } from '@/lib/babylon/core/sessionStore';

type Row = Omit<BodyProfile, 'motion'>;
const row = (r: Row): BodyProfile => ({ ...r, motion: 'merge' });
const none = (key: string, modeId: string, family: BodyProfile['family'], later: BodyProfile['later'], overheadIsPlay: boolean): BodyProfile =>
  row({ key, modeId, family, bindings: [], overheadIsPlay, later });

/** The modes the ride switch can turn on (their rows are session-only until it does). */
export const RIDE_SWITCHED = ['velocitykart', 'aeroaces'] as const;
/**
 * Turned on for everyone (the probe's word flips one here). MOVEMENT PLAY P8 (2026-09-26), the live probe
 * (scripts/probes/_ride-body-live.mts, p8/RIDE.md): 0 misfires in both — a still stand, idle sway, a wave, a stretch, a walk
 * and a jog in place, and the twelve P1 takes (the owner's dunks and jumps, a fighter's guard, a jog, a shuffle) fed through
 * the page while playing — with the wheel's and the wings' signs right at every angle and the drift only on a turned wheel.
 * Offline G1, G1-R, G6 / G7 and G9 hold. (A T-stretch IS the wing pose: it flies the plane, by definition, PLAN-P8 §12.)
 */
export const RIDE_DEFAULT_ON: readonly string[] = ['velocitykart', 'aeroaces'];

/** NEXT_PUBLIC_FEL_BODY_RIDE → the keys it turns on ('1' / 'all' = every switched mode). */
export function parseBodyRide(v: string | undefined | null): ReadonlySet<string> {
  const keys = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.includes('1') || keys.includes('all')) return new Set(RIDE_SWITCHED);
  return new Set(keys.filter((k) => (RIDE_SWITCHED as readonly string[]).includes(k)));
}
/** What the switch says on this build (the env inlined at compile time), plus the defaults. */
export const BODY_RIDE: ReadonlySet<string> = new Set([...RIDE_DEFAULT_ON, ...parseBodyRide(process.env.NEXT_PUBLIC_FEL_BODY_RIDE)]);

/**
 * Free Run's RUN band on the reader's own cadence (PLAN-P8 §4, measured in rideGate): a walk in place (≤ 2.0 steps/s)
 * stays under the vault gate (2.6 m/s = a 0.41 stick at the 6.4 m/s top), a jog (2.2+) reaches it, and a run of ≥ 3.2
 * steps/s reaches the sprint gate (5.2 m/s = 0.81). The reader reads the scripted runs at their own rate (1.56 for 1.6,
 * 2.21 for 2.2, 3.19 for 3.2) and the real run_in_place low (2.64 against a true 3.11): 0.73 here, over the vault gate.
 */
export const FREERUN_BAND = { minHz: 1.4, fullHz: 3.1 } as const;

// the card's words for what a mode reads itself (PLAN-P8 §3.2's copy): after the floor's own lines on its card
const GRAB: CardLine = { move: "Hand to the board's edge, in the air", verb: 'GRAB' };
const SPIN: CardLine = { move: 'Quarter-turn your shoulders, in the air', verb: 'SPIN' };
const PUSH: CardLine = { move: 'Kick-push with your back foot', verb: 'PUSH' };
const CUTBACK: CardLine = { move: 'Quarter-turn your shoulders, on the face', verb: 'CUTBACK' };
const STRIDE: CardLine = { move: 'Run in place', verb: 'STRIDE' };
const RUN_UP: CardLine = { move: 'Run in place', verb: 'RUN-UP' };
const DIP: CardLine = { move: 'Dip your chest at the tape', verb: 'DIP' };
/** The verbs each P8 mode reads itself (lib/babylon/core/rideBody), by def.modeId: the tail of its ModeBodySpec.lines. */
export const RIDE_MODE_LINES: Readonly<Record<string, readonly CardLine[]>> = {
  skateboard: [GRAB, SPIN, PUSH],
  snowboard: [GRAB, SPIN],
  surf: [GRAB, CUTBACK, SPIN],
  bigair: [RUN_UP, SPIN, GRAB],
  sprint: [STRIDE, DIP],
};

/** The six P8 rows that replace their P3 rows (big air and sprint keep theirs), with the ride switch as given (default: this build's). */
export function rideRows(on: ReadonlySet<string> = BODY_RIDE): BodyProfile[] {
  return [
    // the floor holds the gather's peak squat on RT until the hop's A has gone (P3): SkateRun's max(pump, pumpReleased) at A
    // and the snowboard's jump(0.5 + tuck·0.5) read the dip's depth. The carve steers; y is never written on skate and snow
    row({ key: 'skateboard', modeId: 'skateboard', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
      { from: 'carve', to: 'Lx', verb: 'STEER' }, { from: 'squat', to: 'RT', verb: 'PUMP' }, { from: 'takeoff', to: 'A', verb: 'POP' },
    ] }),
    row({ key: 'snowboard_slalom', modeId: 'snowboard', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
      { from: 'carve', to: 'Lx', verb: 'STEER' }, { from: 'squat', to: 'RT', verb: 'TUCK' }, { from: 'takeoff', to: 'A', verb: 'JUMP' },
    ] }),
    // no crouch → RT: RT is surf's CARVE (a rail buried); the crouch is the TRIM on y
    row({ key: 'surf', modeId: 'surf', family: 'boards', later: 'P8', overheadIsPlay: false, bindings: [
      { from: 'carve', to: 'Lx', verb: 'STEER' }, { from: 'trim', to: 'Ly', verb: 'TRIM' }, { from: 'takeoff', to: 'A', verb: 'AIR' },
    ] }),
    row({ key: 'freerun', modeId: 'freerun', family: 'racing', later: 'P8', overheadIsPlay: true, bindings: [
      { from: 'cadence', to: 'Ly', verb: 'RUN', ...FREERUN_BAND }, { from: 'highKnees', to: 'RT', verb: 'SPRINT' }, { from: 'takeoff', to: 'A', verb: 'JUMP' },
    ] }),
    on.has('velocitykart')
      ? row({ key: 'velocitykart', modeId: 'velocitykart', family: 'racing', later: 'P8', overheadIsPlay: false, bindings: [
        { from: 'grip', to: 'RT', verb: 'GAS' }, { from: 'wheel', to: 'Lx', verb: 'STEER' }, { from: 'hopTurn', to: 'X', verb: 'DRIFT' },
      ] })
      : none('velocitykart', 'velocitykart', 'racing', 'P8', false),
    on.has('aeroaces')
      ? row({ key: 'aeroaces', modeId: 'aeroaces', family: 'racing', later: 'P8', overheadIsPlay: true, bindings: [
        { from: 'spread', to: 'RT', verb: 'GAS' }, { from: 'wingBank', to: 'Lx', verb: 'STEER' }, { from: 'wingPitch', to: 'Ly', verb: 'CLIMB' },
      ] })
      : none('aeroaces', 'aeroaces', 'racing', 'P8', true),
  ];
}

export const RIDE_ROWS: readonly BodyProfile[] = rideRows();
/** Every ride row with the switch on: the gates and the probe grade the kart and the plane as they would bind. */
export const RIDE_ROWS_ON: readonly BodyProfile[] = rideRows(new Set(RIDE_SWITCHED));
