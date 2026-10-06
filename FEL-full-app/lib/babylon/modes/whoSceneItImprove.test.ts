// IMPROVE (2026-10-06): WhoSceneItMode's wiring from the owner-picked pass — the d-pad grid (#14), REPLAY with nothing
// finished (#16), and the source-level promises the pure tests cannot see (#3, #16, #20).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DPAD, replayWhoSceneIt } from './WhoSceneItMode';

const ROOT = path.join(__dirname, '../../..');
const mode = readFileSync(path.join(ROOT, 'lib/babylon/modes/WhoSceneItMode.ts'), 'utf8');
const host = readFileSync(path.join(ROOT, 'components/games/who-scene-it-babylon.tsx'), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('Spot the Scene IMPROVE wiring', () => {
  it('#14 each arrow picks the card on its corner of the 2×2 grid (A B over C D)', () => {
    // cards: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
    const corner = ['tl', 'tr', 'bl', 'br'];
    const turned45cw: Record<string, string> = { up: 'tl', right: 'tr', down: 'br', left: 'bl' };
    DPAD.forEach((dir, card) => expect(turned45cw[dir]).toBe(corner[card]));
    expect(new Set(DPAD).size).toBe(4);
    // the host labels the same arrows on the same cards
    const glyph: Record<string, string> = { up: '\\u25b2', right: '\\u25b6', down: '\\u25bc', left: '\\u25c0' };
    const labels = [...host.matchAll(/dpad: '(\\u25[0-9a-f]{2})'/g)].map((m) => m[1]);
    expect(labels).toEqual(DPAD.map((d) => glyph[d]));
  });
  it('#16 REPLAY with no finished match answers false (the shell remounts, as before); the host runs continuous', () => {
    expect(replayWhoSceneIt()).toBe(false);
    expect(host).toContain('continuous: true, cardSink: resultSink');
    expect(host).toContain('useReplayInPlace(restart)');
    expect(code(mode)).toMatch(/ctx\.continuous \? ctx\.card\(/);
  });
  it('#3 verdicts go through the guarded perform; #20 no per-frame Vector3 and no untracked timer', () => {
    const c = code(mode);
    expect(c).not.toMatch(/cast\?\.(verdict|buzz)\(/);
    expect(c).toMatch(/cast\?\.perform\(/);
    expect(c).not.toMatch(/setTimeout\(/);
    expect(c).not.toMatch(/setTarget\(new Vector3/);
  });
});
