// SPEED-VIGNETTE rollout (racing HUD pass): only the speed modes opt in. The guard pins the two things that
// make this safe — the harness owns the pipeline (a mode reports a fraction, it never writes vignetteWeight
// itself), and the modes that read as "fast" (kart, aero) are the ones that call it. A mode that never calls
// gets the venue's resting frame exactly as before, so adding the hook cannot darken a mode that did not ask.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const MODES = path.join(ROOT, 'lib/babylon/modes');
const src = (f: string) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));

describe('speed-vignette rollout', () => {
  it('the harness owns the pipeline: it composes impact + speed and a mode only reports a fraction', () => {
    const h = src('lib/babylon/core/ModeHarness.ts');
    expect(h).toContain('speedVignette01(fraction: number): void');   // the opt-in hook on ModeFeel
    expect(h).toContain('composeFrameGrade(restGrade, frame.level, speedLevel)');
    expect(h).toContain('speedVignetteLevel(speedVignetteRaw)');
  });

  it('kart and aero report their fraction of top speed', () => {
    expect(src('lib/babylon/modes/VelocityKartMode.ts')).toMatch(/speedVignette01\(state\.speed \/ kartSpec\.vMax\)/);
    expect(src('lib/babylon/modes/AeroAcesMode.ts')).toMatch(/speedVignette01\(flight\.speed \/ \(tune\.top \* 1\.4\)\)/);
  });

  it('no mode writes the pipeline vignette directly (the compose would fight it)', () => {
    const writers: string[] = [];
    for (const f of fs.readdirSync(MODES)) {
      if (!f.endsWith('.ts') || f.includes('.test.')) continue;
      if (/vignetteWeight\s*=|imageProcessing\.vignette/.test(src(`lib/babylon/modes/${f}`))) writers.push(f);
    }
    expect(writers).toEqual([]);
  });
});
