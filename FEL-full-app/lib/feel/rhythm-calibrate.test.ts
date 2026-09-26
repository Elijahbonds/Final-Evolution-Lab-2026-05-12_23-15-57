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
  // the loader, or the storage key read directly (MUSIC-SUITE P2 FIX PASS: or the rooms' shared reader)
  .filter((p) => /\bloadAudioOffsetMs\b|\bloadRoomCalibration\b|\bloadSavedOffsetMs\b|\bCALIBRATION_STORAGE_KEY\b|fel\.audioOffsetMs/.test(readFileSync(p, 'utf8')))
  .map((p) => relative(ROOT, p));

const screen = ['page.tsx', join('_components', 'calibrate-client.tsx')]
  .map((f) => readFileSync(join(CALIBRATE, f), 'utf8'))
  .join('\n');

/** MUSIC-SUITE P2 (2026-09-25): the rooms the screen may name, and the file whose reading of the offset makes it true. */
const ROOMS: Array<{ named: RegExp; file: string }> = [
  { named: /\bCypher\b/, file: join('lib', 'babylon', 'modes', 'DanceMode.ts') },
  { named: /\bPERFORM\b/, file: join('lib', 'babylon', 'music', 'StudioMode.tsx') },
];

describe('audio calibration, what the screen claims', () => {
  it('says the timing windows move only if something outside the screen reads the offset', () => {
    if (readers.length > 0) return;   // a mode reads it: the claim may be true now
    expect(screen).not.toMatch(/every rhythm mode/i);
    expect(screen).not.toMatch(/windows shift|shifts? (its|their) (timing )?windows/i);
  });

  it('names a room as using the offset only when that room reads it, and never claims every mode', () => {
    const copy = readFileSync(join(CALIBRATE, 'page.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');   // the copy, not its comments
    for (const r of ROOMS) {
      if (r.named.test(copy)) expect(readers, `${r.file} must read the offset for the screen to name it`).toContain(r.file);
    }
    expect(copy).not.toMatch(/every rhythm mode|all rhythm modes/i);
  });

  it('still says what it measures', () => {
    expect(screen).toMatch(/audio delay|audio latency/i);
  });
});
