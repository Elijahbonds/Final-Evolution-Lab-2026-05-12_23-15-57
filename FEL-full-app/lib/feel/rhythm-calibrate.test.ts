import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// /play/calibrate said "Every rhythm mode shifts its timing windows by this offset", but loadAudioOffsetMs is read by
// that screen alone. The screen may only say the windows move once something outside it reads the offset; this test
// finds the readers, so it lets the claim back in the day a rhythm mode is wired to it.
const ROOT = join(__dirname, '..', '..');
const CALIBRATE = join(ROOT, 'app', 'play', 'calibrate');
const MODULE = join(ROOT, 'lib', 'feel', 'rhythm-calibrate.ts');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const readers = ['app', 'components', 'lib']
  .flatMap((d) => sources(join(ROOT, d)))
  .filter((p) => p !== MODULE && !p.startsWith(CALIBRATE))
  // the loader, or the storage key read directly
  .filter((p) => /\bloadAudioOffsetMs\b|\bCALIBRATION_STORAGE_KEY\b|fel\.audioOffsetMs/.test(readFileSync(p, 'utf8')))
  .map((p) => relative(ROOT, p));

const screen = ['page.tsx', join('_components', 'calibrate-client.tsx')]
  .map((f) => readFileSync(join(CALIBRATE, f), 'utf8'))
  .join('\n');

describe('audio calibration, what the screen claims', () => {
  it('says the timing windows move only if something outside the screen reads the offset', () => {
    if (readers.length > 0) return;   // a mode reads it: the claim may be true now
    expect(screen).not.toMatch(/every rhythm mode/i);
    expect(screen).not.toMatch(/windows shift|shifts? (its|their) (timing )?windows/i);
  });

  it('still says what it measures', () => {
    expect(screen).toMatch(/audio delay|audio latency/i);
  });
});
