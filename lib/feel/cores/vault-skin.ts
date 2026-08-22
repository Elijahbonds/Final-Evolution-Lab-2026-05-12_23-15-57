/**
 * lib/feel/cores/vault-skin.ts
 * ============================
 * M9 Step 8 — Vault (gymnastics) skin for the Air-session core.
 *
 * A mode is a thin skin: constants (vault-constants.ts) + sensory presets.
 * This file wires those into an `AirSessionSkin` the AirSessionCore can run.
 * It adds NO new behaviour to the core — vault is the archetype dressed with
 * numbers: a POSITIVE-runDrag runway (you must pump the cadence to build
 * speed) and a nearer table. All tunables live in vault-constants.ts, every
 * value // TUNE(elijah).
 *
 * Reference: LINEUP_SPEC Air-session family — "Vault (gymnastics): cadence
 * run-up, auto-punch, AirTrick flips, stick-the-landing window".
 */

import { AirSessionCore, type AirSessionSkin } from './air-session-core';
import { SensoryBus } from '../index';
import { VAULT_TUNING, VAULT_TRICK, VAULT_SENSORY } from './vault-constants';

export interface VaultSkinOpts {
  onSensory?: AirSessionSkin['onSensory'];
  onPhase?: AirSessionSkin['onPhase'];
  onLanding?: AirSessionSkin['onLanding'];
}

/** Build the vault AirSessionSkin. */
export function makeVaultSkin(opts: VaultSkinOpts = {}): AirSessionSkin {
  return {
    tuning: VAULT_TUNING,
    trick: VAULT_TRICK,
    sensory: VAULT_SENSORY,
    onSensory: opts.onSensory,
    onPhase: opts.onPhase,
    onLanding: opts.onLanding,
  };
}

/** Convenience constructor: an AirSessionCore already wearing the vault skin. */
export function makeVaultSession(bus?: SensoryBus, opts: VaultSkinOpts = {}): AirSessionCore {
  return new AirSessionCore(makeVaultSkin(opts), bus);
}

export { VAULT_TUNING, VAULT_TRICK, VAULT_SENSORY } from './vault-constants';
