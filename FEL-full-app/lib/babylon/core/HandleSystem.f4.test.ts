import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('F4: one turbo crossover fade', () => {
  it('the tree uses moveFadeSec(true), not its own multiplier', () => {
    const src = readFileSync(new URL('../anim/basketballTree.ts', import.meta.url), 'utf8');
    expect(src).toContain('? moveFadeSec(true) : c.fadeSec');
    expect(src).not.toMatch(/c\.fadeSec \* 0\.6/);
  });
});
