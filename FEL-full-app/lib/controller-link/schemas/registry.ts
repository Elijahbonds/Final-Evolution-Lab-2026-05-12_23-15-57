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
  // ── Reference implementation ──────────────────────────────────────────────
  // 3PT Shootout: tilt the phone back to wind up, release to shoot. The release
  // is what gets timed against the mode's oscillating bar, so the tap matters
  // as much as the tilt.
  threepoint: {
    modeId: 'threepoint',
    title: 'Downtown',
    maxPlayers: 1,
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
      // Buttons are the fallback when motion is denied. CHARGE is `hold`, which
      // the Babylon adapter ramps into an analog trigger — a plain tap would
      // arrive as a face button and be read as SLAM.
      { kind: 'button', buttons: [
        { action: 'charge', label: 'CHARGE', hold: true },
        { action: 'A', label: 'SLAM' },
        { action: 'B', label: 'STYLE' },
      ] },
    ],
  },

  // ── Basketball 3v3 ────────────────────────────────────────────────────────
  // The first mode here that needs WALKING, which is why the bridge grew a
  // 'move' action: modes read movement from a left-stick event, so a plain
  // d-pad schema would have delivered every verb except the ability to move.
  // SHOOT is the analog hold-and-release meter, so it takes the same tilt idiom
  // as 3PT's shot and Dunk's charge.
  threevthree: {
    modeId: 'threevthree',
    title: 'Threes',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'move' } },
      {
        kind: 'motion',
        motion: {
          action: 'charge',
          hint: 'Tilt back to load your shot — release in the green',
          axis: 'pitch',
          fullChargeDeg: 40,           //TUNE(elijah)
        },
      },
      { kind: 'button', buttons: [
        { action: 'charge', label: 'SHOOT', hold: true },
        { action: 'B', label: 'PASS' },
        { action: 'X', label: 'STEAL' },
        { action: 'A', label: 'BLOCK' },
      ] },
    ],
  },

  // ── Air-session family ────────────────────────────────────────────────────
  // The run-up IS a d-pad cadence, so these need the dpad schema as well as the
  // two air verbs. Same shape for both because they are one shared core.
  gymnastics: {
    modeId: 'gymnastics',
    title: 'Stick It',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'dpad', dpad: { action: 'dpad' } },
      { kind: 'button', buttons: [
        { action: 'A', label: 'FLIP' },
        { action: 'B', label: 'STICK' },
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
      { kind: 'button', buttons: [{ action: 'A', label: 'SWING' }] },
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
      { kind: 'button', buttons: [
        { action: 'A', label: 'SWING' },
        { action: 'B', label: 'CLUB' },
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

  // Showdown: RETIRED from the v1 roster with the combat-family trim (owner,
  // 2026-09-01 — karate-vs is the Storm mode). Schema removed so phones don't
  // join a mode the roster no longer offers; the mode file stays registered.

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
  // the chair prop lives on X because the d-pad is spoken for. CHARGE is a
  // hold (the mode reads the trigger ramp; modeBridge turns a held button
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
        { action: 'charge', label: 'CHARGE', hold: true },
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
        { action: 'X', label: 'GUARD' },
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
        { action: 'charge', label: 'SHOOT', hold: true },
        { action: 'B', label: 'BOX OUT' },
        { action: 'X', label: 'STEAL' },
        { action: 'A', label: 'BLOCK' },
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
        { action: 'X', label: 'BLOCK' },
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
        { action: 'X', label: 'BLOCK' },
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
