// Mode → controller-schema registry.
//
// THIS FILE IS THE ONLY THING A NEW MODE HAS TO TOUCH. Add an entry and the
// join flow, lobby, QR, reconnect and controller UI all work for it — no
// changes to transport, session, or the controller page.
//
// `modeId` must match the id the mode is registered under (the Babylon registry
// key in lib/babylon/modes/registry.ts, or the id passed to registerFelMode).
// Actions are the mode's own vocabulary and are forwarded verbatim.

import type { ModeControllerConfig } from '../types';

export const MODE_CONTROLLERS: Record<string, ModeControllerConfig> = {
  // ── The Flip (Music Academy, lane 2 M1b) ─────────────────────────────────
  // The phone IS the pad controller: sixteen pads in a 4×4 grid, actions pad_0…pad_15 (row-major, same order as the
  // keyboard map 1234 / qwer / asdf / zxcv). Colours rotate per row so a bank reads at a glance.
  //
  // MUSIC-SUITE P5 (2026-09-25), phone-mpc — owner decision #16, "MPC-style": the phone is the Academy's pad controller
  // on EVERY tab now (the room mounts it at room level: lib/babylon/music/StudioMode.tsx), so it grew what an MPC has
  // beside its pads — BANK A–D above them (the four Flip banks: the pads play the bank picked here, on any tab) and
  // PLAY / STOP / REC below (the room's transport; REC arms the Flip's ARM REC, so taps write into the grid). The 16 pads
  // are unchanged (pad_0…pad_15). Two OPT-IN hints only this entry sets (types.ts ButtonSchemaHints, padFeel.ts): the
  // pads buzz and carry a MEASURED velocity; the transport and bank rows buzz and are compact. Actions are parsed on the
  // host by lib/babylon/music/phonePad.ts phoneCommand (phonePad.test pins that every action here parses).
  music_flip: {
    modeId: 'music_flip',
    title: 'The Flip',
    maxPlayers: 1,
    askName: false,
    // MUSIC-SUITE P6 phone-replay (2026-09-26): the phone SEES the room — the live bank lit, PLAY lit while the transport
    // runs, REC lit while armed, and chips saying so (types.ts roomState; phonePad.ts phoneRoomState builds it)
    roomState: true,
    schemas: [
      { kind: 'button', columns: 4, compact: true, haptics: true, buttons: (['A', 'B', 'C', 'D'] as const).map((b) => ({ action: `bank_${b}`, label: `BANK ${b}`, color: '#e8d9c2' })) },
      { kind: 'button', columns: 4, haptics: true, velocity: true, buttons: Array.from({ length: 16 }, (_, i) => ({ action: `pad_${i}`, label: String(i + 1), color: ['#22d3ee', '#ff6b3d', '#a78bfa', '#ffd75e'][Math.floor(i / 4)] })) },
      { kind: 'button', columns: 3, compact: true, haptics: true, buttons: [
        { action: 'play', label: '▶ PLAY', color: '#4ade80' },
        { action: 'stop', label: '■ STOP', color: '#e8d9c2' },
        { action: 'rec', label: '● REC', color: '#ff5c5c' },
      ] },
    ],
  },

  // ── PERFORM (Music Academy, MUSIC-SUITE P6, 2026-09-25) ───────────────────
  // Owner decision #11: PERFORM plays your song in four lanes — KICK · SNARE · HATS · FLIP — on keyboard, pad AND phone. The
  // phone's PERFORM page is four big lane buttons in one row (left to right as the screen draws the lanes, in the lanes'
  // colours — lib/babylon/music/performSet.ts PERFORM_LANE_COLORS, which are music_flip's row colours) and PAUSE under them.
  // Actions lane_0 … lane_3 and pause, parsed on the host by lib/babylon/music/performInput.ts performPhoneCommand (its
  // test pins that every action here parses). The lanes buzz (the opt-in `haptics` hint — it also gives the buttons
  // touch-action / select-none, so a fast double tap is two taps, not a zoom); no velocity (a lane is hit or not). In an
  // Arena set the room judges a phone tap as it ARRIVES (P5's rule: the phone answers its own timing pings); in free play
  // the arrival is moved back by half the measured round trip. music_flip above is unchanged (P5), and a phone paired as
  // the MPC plays PERFORM too: a pad's row is a lane.
  music_perform: {
    modeId: 'music_perform',
    title: 'PERFORM',
    maxPlayers: 1,
    askName: false,
    roomState: true,   // MUSIC-SUITE P6 phone-replay: the same room chips as the MPC page (bank, PLAYING, REC)
    schemas: [
      { kind: 'button', columns: 4, haptics: true, buttons: (['KICK', 'SNARE', 'HATS', 'FLIP'] as const).map((label, i) => ({ action: `lane_${i}`, label, color: ['#22d3ee', '#ff6b3d', '#a78bfa', '#ffd75e'][i] })) },
      { kind: 'button', columns: 1, compact: true, haptics: true, buttons: [{ action: 'pause', label: '❚❚ PAUSE', color: '#e8d9c2' }] },
    ],
  },

  // ── Reference implementation ──────────────────────────────────────────────
  // 3PT Shootout: tilt the phone back to wind up, release to shoot. The release
  // is what gets timed against the mode's oscillating bar, so the tap matters
  // as much as the tilt.
  threepoint: {
    modeId: 'threepoint',
    title: 'Downtown',
    // FOUR PADS, ONE HOST (mission Phase C: "Support 4 PAD clients against 1 HOST").
    //
    // A shootout is the right shape for this: everyone shoots the same racks and the scores stand beside
    // each other, so a fourth player costs a column on the board rather than a second body in the scene.
    // The four slots are already on the wire (the frame carries its own slot) and the host already gates
    // them independently — this number is what lets the fourth phone through the lobby door.
    maxPlayers: 4,
    askName: true,
    schemas: [
      {
        kind: 'motion',
        motion: {
          action: 'shoot',
          hint: 'Tilt back to load — release to shoot',
          axis: 'pitch',
          fullChargeDeg: 40,           //TUNE(elijah)
        },
      },
      // A plain button is always offered alongside motion: it is the fallback
      // when a phone denies motion permission or is not in a secure context,
      // and it keeps the mode playable on a laptop joining as a controller.
      { kind: 'button', buttons: [{ action: 'shoot', label: 'SHOOT' }] },
    ],
  },

  // ── Dunk Contest ──────────────────────────────────────────────────────────
  // The charge is analog, so the phone idiom is the same one 3PT uses: tilt
  // back to load the jump, release to launch. The d-pad is genuinely dual-role
  // in this mode — it picks the prop during the approach and arms mid-air
  // tricks during the flight — so it is forwarded verbatim and the mode decides
  // which job it is doing from its own phase.
  dunk: {
    modeId: 'dunk',
    title: 'Flight Night',
    maxPlayers: 1,
    askName: true,
    schemas: [
      {
        kind: 'motion',
        motion: {
          action: 'charge',
          hint: 'Tilt back to load your jump — release to launch',
          axis: 'pitch',
          fullChargeDeg: 40,           //TUNE(elijah)
        },
      },
      { kind: 'dpad', dpad: { action: 'dpad' } },
      // Buttons are the fallback when motion is denied. RUN is `hold` (action
      // id stays `charge` → RT ramp) — a plain tap would arrive as a face
      // button and be read as SLAM.
      { kind: 'button', buttons: [
        { action: 'charge', label: 'RUN', hold: true },
        { action: 'A', label: 'SLAM' },
        { action: 'B', label: 'STYLE' },
      ] },
    ],
  },

  // ── Basketball 3v3 ────────────────────────────────────────────────────────
  // The first mode here that needs WALKING, which is why the bridge grew a
  // 'move' action: modes read movement from a left-stick event, so a plain
  // d-pad schema would have delivered every verb except the ability to move.
  // The basketball shot meter is NOT the shared RT `charge` idiom: LocalInputSource
  // follows the 2K map and reads a held FEL X as SHOOT, while RT is turbo.
  threevthree: {
    modeId: 'threevthree',
    title: 'Threes',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'X', label: 'SHOOT', hold: true },
        { action: 'A', label: 'PASS' },
        { action: 'Y', label: 'BLOCK' },
        { action: 'B', label: 'SCREEN', hold: true },
      ] },
    ],
  },

  // ── Air-session family ────────────────────────────────────────────────────
  // FreeRun steers from the left stick during the run phase, then still lets the
  // face buttons start/pick tricks. Sprint and slide are trigger holds in-mode,
  // so phone fallbacks must be holds too.
  freerun: {
    modeId: 'freerun',
    title: 'Free Run',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'charge', label: 'SPRINT', hold: true },
        { action: 'A', label: 'JUMP' },
        { action: 'brake', label: 'SLIDE', hold: true },
        { action: 'X', label: 'FLIP' },
        { action: 'Y', label: 'TWIST' },
      ] },
    ],
  },
  bigair: {
    modeId: 'bigair',
    title: 'Stomp',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'dpad' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'SPIN' },
        { action: 'B', label: 'STOMP' },
      ] },
    ],
  },

  // Baseball (Home Run Derby). The d-pad is 'move' so it forwards as a LEFT
  // STICK event, which is what drives the PCI — a phone that could swing but not
  // COVER the pitch would be playing a different, easier game.
  derby: {
    modeId: 'derby',
    title: 'Moonshot Derby',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      // PARKOUR DERBY (2026-09-18): the bat-flip vault is a whole mechanic — it is the only way to fill flow for a
      // KINETIC swing — and it lives on B, which this overlay did not offer. A phone player could swing but never
      // reach the trick that makes the swing worth anything.
      { kind: 'button', buttons: [{ action: 'A', label: 'SWING' }, { action: 'B', label: 'BAT FLIP' }] },
    ],
  },

  // Soccer (penalties). The feint is a stick SNAP, so the pad's movement axis
  // has to reach the mode for the mechanic to exist at all on a phone.
  penalty: {
    modeId: 'penalty',
    title: 'Twelve Yards',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [{ action: 'A', label: 'KICK' }] },
    ],
  },

  // Football (rush). Steering is the left stick, so the d-pad is 'move' and
  // forwards as one (same trap as derby: a phone that can evade but not
  // STEER is playing a different game). TRUCK is the R-trigger hold, which
  // the 'charge' hold idiom maps to; the four face buttons carry the evades.
  // SPIN stays keyboard-only — the touch budget ruling is in the concept lock.
  football: {
    modeId: 'football',
    title: 'Breakaway',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'HURDLE' },
        { action: 'X', label: 'JUKE L' },
        { action: 'Y', label: 'JUKE R' },
        { action: 'charge', label: 'TRUCK', hold: true },
      ] },
    ],
  },

  // Golf: the 3-click swing plus club selection. The stick swing needs an
  // analog axis a phone pad does not have, so a Controller Link player uses the
  // 3-click — which is exactly why it was kept alongside rather than replaced.
  golf: {
    modeId: 'golf',
    title: 'The Loop',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      // PARKOUR GOLF (2026-09-18): the springboard is on Y and is the only source of a pad multiplier.
      { kind: 'button', buttons: [
        { action: 'A', label: 'SWING' },
        { action: 'B', label: 'CLUB' },
        { action: 'Y', label: 'PAD' },
      ] },
    ],
  },

  // Tennis: the four shots. A phone could not join this mode at all before --
  // isControllerEnabled() is a plain `modeId in MODE_CONTROLLERS`, so an absent
  // entry is silence, not an error.
  tennis: {
    modeId: 'tennis',
    title: 'Match Point',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'DRIVE' },
        { action: 'B', label: 'SLICE' },
        { action: 'X', label: 'DROP' },
        { action: 'Y', label: 'LOB' },
      ] },
    ],
  },

  // Volleyball. One verb — NetSportMode reads A (with the R trigger as an
  // analog alias) and nothing else; the three touches are the same button doing
  // a different job depending on where you are in the rally, which is how the
  // benchmark plays it too. The d-pad is named 'move' so it forwards as a LEFT
  // STICK event: aim is a real player intent here, and a phone without it could
  // hit the ball but never place it.
  volleyball: {
    modeId: 'volleyball',
    title: 'Volleyball',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'HIT' },
        { action: 'B', label: 'BLOCK' },
      ] },
    ],
  },

  // ── Board family (skate / surf / snowboard) ───────────────────────────────
  // All three were missing entirely, so Controller Link simply did not offer
  // them -- isControllerEnabled() is a plain `modeId in MODE_CONTROLLERS`, so an
  // absent mode is not an error, it is a phone that never gets to join.
  //
  // Two shared idioms make these work:
  //  - The d-pad action is named 'move', which is what opts a schema into being
  //    forwarded as a LEFT STICK event. Board modes steer from stickX and read
  //    nothing else for movement, so a d-pad named anything else would give a
  //    phone every verb except the ability to turn.
  //  - Speed is the analog R-trigger in all three (PUMP / CARVE / TUCK), and
  //    'charge' is the vocabulary word that maps to it. Held, not tapped.
  skateboard: {
    modeId: 'skateboard',
    title: 'Venice Lines',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'charge', label: 'PUMP', hold: true },
        { action: 'A', label: 'POP' },
        { action: 'B', label: 'FLIP' },
        { action: 'X', label: 'GRAB' },
      ] },
    ],
  },
  surf: {
    modeId: 'surf',
    title: 'The Break',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      // CUTBACK and GRAB are on here deliberately: the touch overlay gives surf
      // only AIR and CARVE (surf D1), so on the phone path these are the mode's
      // two missing scoring verbs. The overlay gap is still a separate fix.
      { kind: 'button', buttons: [
        { action: 'charge', label: 'CARVE', hold: true },
        { action: 'A', label: 'AIR' },
        { action: 'B', label: 'CUTBACK' },
        { action: 'X', label: 'GRAB' },
      ] },
    ],
  },
  // Keyed 'snowboard_slalom' -- the registry key, NOT the route word. /play/snowboard
  // maps to it in that route's loader; getting this wrong yields a phone that
  // joins nothing, silently.
  snowboard_slalom: {
    modeId: 'snowboard_slalom',
    title: 'Gate Crasher',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'charge', label: 'TUCK', hold: true },
        { action: 'A', label: 'JUMP' },
        { action: 'B', label: 'SPIN' },
        { action: 'X', label: 'GRAB' },
      ] },
    ],
  },

  // Sprint: this is the one enabled mode whose real control is the D-pad itself,
  // not movement. The bridge action stays 'dpad' so left/right arrive as strides
  // and up remains the dip at the tape.
  sprint: {
    modeId: 'sprint',
    title: 'Beach Sprint',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'dpad' } },
    ],
  },

  // Showdown: RETIRED from the v1 roster with the combat-family trim (owner,
  // 2026-09-01 — karate-vs is the Storm mode). Schema removed so phones don't
  // join a mode the roster no longer offers; the mode file stays registered.
  // Duel stays off the phone pad for the same reason.

  // Kart-racer controls. The bridge maps 'charge' to RT, 'brake' to LT, and the
  // held R1 button to the boost shoulder, matching the local pad path.
  aeroaces: {
    modeId: 'aeroaces',
    title: 'Aero Aces',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'charge', label: 'GAS', hold: true },
        { action: 'brake', label: 'BRAKE', hold: true },
        { action: 'A', label: 'FIRE' },
        { action: 'B', label: 'STUNT' },
        { action: 'Y', label: 'LOOP' },
        { action: 'R1', label: 'BOOST', hold: true },
      ] },
    ],
  },
  velocitykart: {
    modeId: 'velocitykart',
    title: 'Velocity Kart',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'charge', label: 'GAS', hold: true },
        { action: 'brake', label: 'BRAKE', hold: true },
        { action: 'A', label: 'ITEM' },
        { action: 'X', label: 'DRIFT', hold: true },
        { action: 'B', label: 'TRICK' },
        { action: 'Y', label: 'SPIN' },
        { action: 'R1', label: 'BOOST', hold: true },
      ] },
    ],
  },

  // Party quiz modes: face buttons answer A/B/X/Y; the D-pad stays literal so a
  // second local player can buzz with directions and the picker can change count.
  who_scene_it: {
    modeId: 'who_scene_it',
    title: 'Who Scene It',
    maxPlayers: 2,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'dpad' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'A' },
        { action: 'B', label: 'B' },
        { action: 'X', label: 'X' },
        { action: 'Y', label: 'Y' },
      ] },
    ],
  },
  brainbrawl: {
    modeId: 'brainbrawl',
    title: 'Brain Brawl',
    maxPlayers: 2,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'dpad' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'A' },
        { action: 'B', label: 'B' },
        { action: 'X', label: 'X' },
        { action: 'Y', label: 'Y' },
      ] },
    ],
  },

  // The Cypher: tap on the beat — one verb, no movement. (The touch overlay
  // already covers playing ON the phone; this is the second-screen path.)
  dance: {
    modeId: 'dance',
    title: 'The Cypher',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'button', buttons: [{ action: 'A', label: 'TAP' }] },
    ],
  },

  // Dunk Duel: pass-and-play contest. The d-pad drives the approach ('move');
  // the chair prop lives on X because the d-pad is spoken for. RUN is a
  // hold (action id `charge` → RT ramp; modeBridge turns a held button
  // into that analog ramp).
  dunkduel: {
    modeId: 'dunkduel',
    title: 'Prove It',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'SLAM' },
        { action: 'B', label: 'STYLE' },
        { action: 'X', label: 'CHAIR' },
        { action: 'charge', label: 'RUN', hold: true },
      ] },
    ],
  },

  // Mixed Combat: 8-way spacing + the three attacks + guard. The d-pad is
  // 'move' (a fighter that can't walk is a training dummy); the mode also
  // reads a stick flick for the loadout pick, so phones lose nothing.
  mixedcombat: {
    modeId: 'mixedcombat',
    title: "Ring's Edge",
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'STRIKE' },
        { action: 'B', label: 'KICK' },
        { action: 'X', label: 'GUARD', hold: true },
        { action: 'Y', label: 'HEAVY' },
      ] },
    ],
  },

  // ── Ship pass 2, Phase 9: the four modes a phone could not join ───────────
  // isControllerEnabled() is `modeId in MODE_CONTROLLERS`; an absent entry is
  // silence. Labels mirror lib/babylon/ui/modeVerbs.ts so the phone reads like
  // the on-screen rig.
  onevone: {
    modeId: 'onevone',
    title: 'Ones',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'X', label: 'SHOOT', hold: true },
        { action: 'Y', label: 'BLOCK' },
        { action: 'B', label: 'CHARGE', hold: true },
      ] },
    ],
  },
  karate: {
    modeId: 'karate',
    title: 'Endless',
    maxPlayers: 2,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'JAB' },
        { action: 'B', label: 'KICK' },
        { action: 'X', label: 'BLOCK', hold: true },
        { action: 'Y', label: 'HEAVY' },
      ] },
    ],
  },
  karate_vs: {
    modeId: 'karate_vs',
    title: 'Versus',
    maxPlayers: 2,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'JAB' },
        { action: 'B', label: 'KICK' },
        { action: 'X', label: 'BLOCK', hold: true },
        { action: 'Y', label: 'HEAVY' },
      ] },
    ],
  },
  carnival: {
    modeId: 'carnival',
    title: 'Court Carnival',
    maxPlayers: 4,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'GO' },
        { action: 'B', label: 'TRICK' },
        { action: 'X', label: 'CHARGE' },
        { action: 'Y', label: 'POWER' },
      ] },
    ],
  },
};

export function controllerConfigFor(modeId: string): ModeControllerConfig | null {
  return MODE_CONTROLLERS[modeId] ?? null;
}

export function isControllerEnabled(modeId: string): boolean {
  return modeId in MODE_CONTROLLERS;
}
