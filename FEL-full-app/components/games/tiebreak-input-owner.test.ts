import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Babylon input ownership', () => {
  it.each([
    ['Tiebreak', '../../app/play/tiebreak/_components/loader.tsx', 'tiebreak'],
    ['Brain Brawl', '../../app/play/brain-brawl/_components/loader.tsx', 'brainBrawl'],
  ])('%s declares that its Babylon host owns controls', (_label, loaderPath, mode) => {
    const loader = fs.readFileSync(path.resolve(__dirname, loaderPath), 'utf8');
    expect(loader).toMatch(new RegExp(`<GameShell\\b[^>]*mode="${mode}"[^>]*ownControls\\b`));
  });
});

