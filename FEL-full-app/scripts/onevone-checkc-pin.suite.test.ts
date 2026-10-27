// OV75-5: Check C in scripts/onevone-depth-tests.ts stays word for word (the explode-out section, up to C2).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('OV75-5: Check C is pinned', () => {
  it('the Check C slice hashes to c99a956e…', () => {
    const lines = readFileSync('scripts/onevone-depth-tests.ts', 'utf8').split('\n');
    const from = lines.findIndex((l) => l.startsWith('// ── C. the explode-out is the payoff'));
    const to = lines.findIndex((l) => l.startsWith('// ── C2.'));
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    const slice = lines.slice(from, to).join('\n') + '\n';
    expect(createHash('sha256').update(slice).digest('hex')).toBe('c99a956e88e30e3cd60114d6b8077801208e1ba9d35ad3486910207170ac8dd1');
  });
});
