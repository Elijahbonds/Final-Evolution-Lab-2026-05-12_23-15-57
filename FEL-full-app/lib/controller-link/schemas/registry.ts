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
    title: 'Three-Point Shootout',
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
    title: 'Dunk Contest',
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
    title: '3v3 Streetball',
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
    title: 'Gymnastics Vault',
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
    title: 'Big Air',
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

  // Showdown: four face verbs. Its L1/R1/SELECT specials have no pad slot and
  // stay gamepad-only, same as the touch overlay.
  showdown: {
    modeId: 'showdown',
    title: 'Showdown',
    maxPlayers: 1,
    askName: true,
    schemas: [
      { kind: 'button', buttons: [
        { action: 'A', label: 'JAB' },
        { action: 'B', label: 'KICK' },
        { action: 'X', label: 'GUARD' },
        { action: 'Y', label: 'ULTIMATE' },
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
