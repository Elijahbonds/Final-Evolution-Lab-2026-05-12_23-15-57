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
