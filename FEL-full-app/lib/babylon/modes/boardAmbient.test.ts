// IMPROVE (2026-10-06): the snow modes' wind bed survives the harness's first input. ModeHarness starts the mood's own bed
// on the first input of a mount (firstInput: alpine / overcast → 'none', night → 'stadium'), and SoundKit.startAmbient stops
// whatever bed was playing — so a wind started in load(), before anyone pressed anything, was silenced on the first press.
// Big Air (AirSessionMode) and the slalom start theirs on the first PLAYED frame instead, and stop it on dispose. A source
// scan: neither mode mounts headless (Babylon + a skinned rider), and the order is what matters.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

/** The text of a method from its signature to the next of the mode's methods (load → update → … → dispose). */
function body(text: string, sig: RegExp, next: RegExp): string {
  const at = text.search(sig);
  expect(at, String(sig)).toBeGreaterThan(-1);
  const rest = text.slice(at + 1);
  const end = rest.search(next);
  return end < 0 ? rest : rest.slice(0, end);
}

const MODES: { file: string; update: RegExp }[] = [
  { file: 'lib/babylon/modes/SnowboardSlalomMode.ts', update: /\n {4}update\(ctx: ModeContext, dt: number\) \{/ },
  { file: 'lib/babylon/modes/AirSessionMode.ts', update: /\n {4}update\(ctx: ModeContext, dtRaw: number\): void \{/ },
];

describe('the snow wind bed is started after the harness starts the mood bed', () => {
  it('the harness starts the mood bed on the first input (it replaced a load()-time wind before lane/ambient-fix)', () => {
    const h = src('lib/babylon/core/ModeHarness.ts');
    const first = body(h, /function firstInput\(\): void \{/, /\n {2}\}/);
    // INTEGRATION (2026-10-06): since lane/ambient-fix the harness asks startVenueAmbient(bed), which keeps a bed the
    // mode already chose; the first-frame wind below still owns the bed either way (a later startAmbient replaces it).
    expect(first).toMatch(/SoundKit\.(?:startAmbient|startVenueAmbient)\(bed\)/);
    expect(first).toMatch(/mood === 'alpine' \|\| mood === 'overcast' \? 'none'/);
  });

  for (const { file, update } of MODES) {
    it(`${file.split('/').pop()}: no bed in load(), the wind once on the first played frame, stopped on dispose`, () => {
      const t = src(file);
      const load = body(t, /\n {4}async load\(ctx: ModeContext\)/, /\n {4}(?:update|onInput|dispose)\(/);
      expect(load).not.toMatch(/SoundKit\.startAmbient\(/);
      // a remount starts the wind again (Big Air clears it in reset(), which load() calls)
      const resets = /\n {6}reset\(\);/.test(load) ? body(t, /const reset = \(\): void => \{/, /\n {2}\};/) : '';
      expect(load + resets).toMatch(/ambientOn = false/);
      const upd = body(t, update, /\n {4}(?:dispose|onInput|onBody)\(/);
      expect(upd).toMatch(/if \(!ambientOn\) \{ ambientOn = true; SoundKit\.startAmbient\('wind'\); \}/);
      const dispose = body(t, /\n {4}dispose\(\)(?:: void)? \{/, /\n {4}\},?\n/);
      expect(dispose).toMatch(/SoundKit\.stopAmbient\(\)/);
      expect(t.match(/SoundKit\.startAmbient\(/g)?.length, 'one place starts the bed').toBe(1);
    });
  }
});
