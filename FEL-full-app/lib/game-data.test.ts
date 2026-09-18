import { describe, expect, it } from 'vitest';
import { ENABLED_BABYLON_MODES } from './babylon/modes/registry';
import { MODE_INFO } from './game-data';
import { MP_SESSION_MODE } from './mp/match-core';

const MP_KEY: Readonly<Record<string, string>> = {
  snowboard_slalom: 'snowboard',
  karate_vs: 'karate-vs',
  bigair: 'big-air',
  derby: 'baseball',
  penalty: 'soccer',
  who_scene_it: 'who-scene-it',
};

const sessionModeForRegistry = (registryKey: string): string =>
  MP_SESSION_MODE[MP_KEY[registryKey] ?? registryKey] ?? registryKey;

describe('mode catalog coverage', () => {
  it('has public metadata for every enabled Babylon mode', () => {
    const missing = [...ENABLED_BABYLON_MODES]
      .map((key) => ({ key, sessionMode: sessionModeForRegistry(key) }))
      .filter(({ sessionMode }) => !MODE_INFO[sessionMode])
      .map(({ key, sessionMode }) => `${key} -> ${sessionMode}`);

    expect(missing).toEqual([]);
  });
});
