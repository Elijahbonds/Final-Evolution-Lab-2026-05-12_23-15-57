// integration-2 (2026-10-06): the party relay's face → d-pad table must be the buzz modes' own card order. It kept the
// old ▲ ▶ ▼ ◀ after Who Scene It / Brain Brawl moved to ▲ ▶ ◀ ▼ (IMPROVE #14), so a phone P2 pressing C answered D.
// Read from the modes' source (importing them would load Babylon), so a future reorder there turns this red.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACE_TO_DPAD } from './route';

const MODES = join(__dirname, '..', 'babylon', 'modes');
const dpadOf = (file: string): string[] => {
  const m = readFileSync(join(MODES, file), 'utf8').match(/const DPAD: Array<[^>]+> = \[([^\]]+)\]/);
  if (!m) throw new Error(`${file}: no DPAD table found — the scan needs updating`);
  return m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
};

describe('party relay: a phone\'s A B X Y answer cards A B C D in every buzz game', () => {
  for (const file of ['WhoSceneItMode.ts', 'BrainBrawlMode.ts']) {
    it(file, () => {
      expect([FACE_TO_DPAD.A, FACE_TO_DPAD.B, FACE_TO_DPAD.X, FACE_TO_DPAD.Y]).toEqual(dpadOf(file));
    });
  }
});
