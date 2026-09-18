// THE MULTIPLAYER CONTRACT (2026-09-12).
//
// FEL's shipping multiplayer is an ASYNCHRONOUS score challenge: you post a score, someone
// stakes a run against it, settleMatch decides. (The realtime socket.io layer in
// lib/babylon/network/NetworkManager.ts is unreferenced scaffolding — no live mode imports it.)
//
// Two drifts are possible and both have happened:
//   · an ENABLED mode with no challenge — you finish a run with nothing to stake it against
//   · a challenge for a RETIRED mode — sprint was offered while /play/sprint redirects to /modes,
//     so the challenge could be created and never played
import { describe, it, expect } from 'vitest';
import { MP_MODES, MP_SESSION_MODE, sessionModeFor } from '../../lib/mp/match-core';
import { ENABLED_BABYLON_MODES } from '../../lib/babylon/modes/registry';

/** registry key -> multiplayer key, where the two spellings differ. */
const MP_KEY: Readonly<Record<string, string>> = {
  snowboard_slalom: 'snowboard', karate_vs: 'karate-vs', bigair: 'big-air',
  derby: 'baseball', penalty: 'soccer', who_scene_it: 'who-scene-it',
};
const mpKeyFor = (registryKey: string) => MP_KEY[registryKey] ?? registryKey;

describe('multiplayer covers the game that actually ships', () => {
  const keys = new Set(MP_MODES.map((m) => m.key));

  it('every enabled mode can be challenged', () => {
    const missing = [...ENABLED_BABYLON_MODES].filter((m) => !keys.has(mpKeyFor(m)));
    expect(missing, `enabled but not challengeable: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it('no challenge exists for a mode you cannot play', () => {
    const enabledMp = new Set([...ENABLED_BABYLON_MODES].map(mpKeyFor));
    // tiebreak is a live route that is not a Babylon mode, so it is a legitimate extra
    const allowed = new Set([...enabledMp, 'tiebreak']);
    const orphan = MP_MODES.map((m) => m.key).filter((k) => !allowed.has(k));
    expect(orphan, `challengeable but not playable: ${JSON.stringify(orphan)}`).toEqual([]);
  });

  it('every challenge key maps to the session mode its host records under', () => {
    for (const m of MP_MODES) {
      expect(MP_SESSION_MODE[m.key], `no session mode for '${m.key}'`).toBeTruthy();
      expect(sessionModeFor(m.key)).toBe(MP_SESSION_MODE[m.key]);
    }
  });

  it('every mode has a human label, not a raw key', () => {
    for (const m of MP_MODES) {
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.label).not.toBe(m.key);
    }
  });

  it('no duplicate keys', () => {
    expect(new Set(MP_MODES.map((m) => m.key)).size).toBe(MP_MODES.length);
  });
});
