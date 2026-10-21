// The dunk's registry entry on its own is the registry's, not a second table that could drift from it (FIRST-DUNK-BUDGET).
//
// dunk-babylon mounts MODES.dunk from dunkRegistry.ts so /try does not import all 29 modes. That puts the key 'dunk' in two
// files, which is the drift registry.drift.test exists to catch — so this holds them to one: every key the slice carries is a key
// of the full registry, bound to the very same definition object.
import { describe, expect, it } from 'vitest';
import { MODES as DUNK } from './dunkRegistry';
import { MODES, ENABLED_BABYLON_MODES } from './registry';

describe('dunkRegistry is the registry\'s dunk entry, nothing else', () => {
  it('carries the dunk alone, under the registry\'s own key', () => {
    expect(Object.keys(DUNK)).toEqual(['dunk']);
    expect(ENABLED_BABYLON_MODES.has('dunk')).toBe(true);
  });
  it('the same definition object as registry.ts\'s MODES.dunk (one mode, two doors to it)', () => {
    for (const [key, def] of Object.entries(DUNK)) expect(MODES[key], key).toBe(def);
    expect(DUNK.dunk.modeId).toBe('dunk');
  });
});
