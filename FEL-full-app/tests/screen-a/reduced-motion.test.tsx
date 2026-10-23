// UX advice §6–7: respect prefers-reduced-motion. The counted-rep colour flash and the camera-check bar only pulse when
// motion is allowed; with reduced motion the flash still shows (a still colour for FLASH_MS), paired with the tone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string) => readFileSync(join(__dirname, '../../app/play/mirror/assess/_components', f), 'utf8');

describe('reduced motion (UX §6)', () => {
  it.each(['live-hud.tsx', 'assess-app.tsx'])('%s: every pulse is motion-safe', (f) => {
    const s = src(f);
    expect(s).toContain('motion-safe:animate-pulse');
    expect(s.match(/(?<![:\w-])animate-pulse/g) ?? []).toEqual([]);
  });
  it('the colour flash itself is still drawn under reduced motion (only the pulse is dropped)', () => {
    expect(src('live-hud.tsx')).toMatch(/className="pointer-events-none absolute inset-0 z-\[5\] motion-safe:animate-pulse" style=\{\{ backgroundColor: flashColour/);
  });
});
