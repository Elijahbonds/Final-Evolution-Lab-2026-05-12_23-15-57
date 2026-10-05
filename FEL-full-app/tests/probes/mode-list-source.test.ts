import { describe, expect, it } from 'vitest';
import { enabledModesFromSource } from '../../scripts/probes/_mode-list-source.mts';

describe('probe mode-list source parser', () => {
  it('reads only the ENABLED_BABYLON_MODES array literal', () => {
    const src = `
      export const MODES = { dunk: DunkMode, sprint: SprintMode };
      export const ENABLED_BABYLON_MODES = new Set<string>([
        'dunk',
        'sprint',
      ]);
      const laterComment = 'not_a_mode';
      const laterArray = ['also_not_a_mode'];
    `;

    expect(enabledModesFromSource(src)).toEqual(['dunk', 'sprint']);
  });

  it('fails loudly when the registry declaration is missing', () => {
    expect(() => enabledModesFromSource('export const MODES = {};')).toThrow(/ENABLED_BABYLON_MODES/);
  });
});
