// BASEBALL-REGISTER (2026-10-22, ALL-MODES-TO-75 §6): baseball is its own registry mode — three innings, BaseballInningsMode —
// and the derby keeps its timing mode under its own key and its own modeId. BaseballMode.ts stays dead.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODES, ENABLED_BABYLON_MODES } from './registry';
import { BaseballInningsMode } from './BaseballInningsMode';
import { DerbyMode } from './precisionModes';
import { BODY_PROFILES } from '@/lib/input/bodyProfiles';
import { stripComments } from '@/lib/testing/sourceScan';

describe('baseball is registered and enabled', () => {
  it('MODES.baseball is BaseballInningsMode, keyed by its own modeId', () => {
    expect('baseball' in MODES).toBe(true);
    expect(MODES.baseball).toBe(BaseballInningsMode);
    expect(MODES.baseball.modeId).toBe('baseball');
  });
  it('baseball is in ENABLED_BABYLON_MODES', () => {
    expect(ENABLED_BABYLON_MODES.has('baseball')).toBe(true);
  });
  it('its body row is its own', () => {
    expect(BODY_PROFILES.baseball.key).toBe('baseball');
    expect(BODY_PROFILES.baseball.modeId).toBe('baseball');
  });
  it('the registry never imports the dead BaseballMode.ts', () => {
    const src = stripComments(fs.readFileSync(path.join(__dirname, 'registry.ts'), 'utf8'));
    expect(src).not.toContain("'./BaseballMode'");
    expect(src).toMatch(/import \{ BaseballInningsMode \} from '\.\/BaseballInningsMode';/);
  });
});

describe('derby still resolves to its timing mode', () => {
  it('MODES.derby is DerbyMode, enabled, on modeId "derby"', () => {
    expect(MODES.derby).toBe(DerbyMode);
    expect(MODES.derby).not.toBe(MODES.baseball);
    expect(MODES.derby.modeId).toBe('derby');
    expect(ENABLED_BABYLON_MODES.has('derby')).toBe(true);
  });
  it('its body row is its own, by its own modeId', () => {
    expect(BODY_PROFILES.derby.key).toBe('derby');
    expect(BODY_PROFILES.derby).not.toBe(BODY_PROFILES.baseball);
  });
});
