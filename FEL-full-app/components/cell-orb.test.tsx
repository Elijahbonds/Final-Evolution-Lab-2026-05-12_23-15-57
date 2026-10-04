import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () => readFileSync(join(__dirname, 'cell-orb.tsx'), 'utf8');

describe('CELL orb completion route', () => {
  it('expands toward the shipped creator surface, not the held /studio shell', () => {
    const src = source();

    expect(src).toContain("export const CELL_STUDIO_HREF = '/create'");
    expect(src).toContain('Open Creator Studio');
    expect(src).toContain('Try the Creator Studio');
    expect(src).not.toMatch(/href=["']\/studio/);
    expect(src).not.toContain('Open full Studio');
    expect(src).not.toContain('Try the full Studio');
  });
});
