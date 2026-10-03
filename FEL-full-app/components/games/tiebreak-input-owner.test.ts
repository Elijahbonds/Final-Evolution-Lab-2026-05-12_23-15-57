import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Tiebreak input ownership', () => {
  it('declares that its Babylon host owns controls', () => {
    const loader = fs.readFileSync(path.resolve(__dirname, '../../app/play/tiebreak/_components/loader.tsx'), 'utf8');
    expect(loader).toMatch(/<GameShell\b[^>]*mode="tiebreak"[^>]*ownControls\b/);
  });
});

describe('Brain Brawl input ownership', () => {
  it('declares that its Babylon host owns controls', () => {
    const loader = fs.readFileSync(path.resolve(__dirname, '../../app/play/brain-brawl/_components/loader.tsx'), 'utf8');
    expect(loader).toMatch(/<GameShell\b[^>]*mode="brainBrawl"[^>]*ownControls\b/);
  });
});

