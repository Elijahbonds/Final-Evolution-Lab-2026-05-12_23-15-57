// QA P1-27 (2026-09-27): /versus defaulted to "The Track" — the retired sprint was MP_MODES' first entry, and the lobby
// (MP_CHALLENGE_MODES[0]) and the card editor (MP_MODES[0]) start on the first. [DECISION-EJ] default: Flight Night.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MP_CHALLENGE_MODES, MP_DEFAULT_MODE, MP_MODES, mpModeLabel } from './match-core';
import { MODE_INFO } from '../game-data';

describe('the Versus default', () => {
  it('is Flight Night, first in the list and first among the open challenges', () => {
    expect(MP_DEFAULT_MODE).toBe('dunk');
    expect(MP_MODES[0]).toEqual({ key: 'dunk', label: 'Flight Night' });
    expect(MP_CHALLENGE_MODES[0].key).toBe('dunk');
    const lobby = readFileSync(path.resolve(__dirname, '../../components/mp/multiplayer-lobby.tsx'), 'utf8');
    expect(lobby.match(/useState\(MP_CHALLENGE_MODES\[0\]\.key\)/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('the sprint stays stakeable, not first, under its mode\'s name', () => {
    const i = MP_MODES.findIndex((m) => m.key === 'sprint');
    expect(i).toBeGreaterThan(0);
    expect(mpModeLabel('sprint')).toBe(MODE_INFO.sprint.name);
    expect(MP_MODES.map((m) => m.label)).not.toContain('The Track');
  });

  it('no mode was lost in the reorder', () => {
    expect(new Set(MP_MODES.map((m) => m.key)).size).toBe(MP_MODES.length);
    for (const k of ['sprint', 'showdown', 'duel', 'brainbrawl', 'dunk', 'threepoint', 'who-scene-it']) expect(MP_MODES.some((m) => m.key === k), k).toBe(true);
  });
});
