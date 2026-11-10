// TRY-AGE-PLACEHOLDER-1: Cyber's B1 tests 1 and 4 at the /try surface (the age step it mounts; the shell's flag-on branch).
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgeStep } from '@/components/age-step';

const SHELL = readFileSync('components/games/guest-dunk-shell.tsx', 'utf8');

describe('TRY-AGE-PLACEHOLDER-1: the /try age step', () => {
  it('the /try age step lists this year and has no preselected year', () => {
    expect(SHELL).toMatch(/<AgeStep mode="signup" onLocked=\{onAgeLocked\}/);   // the step /try mounts, as it mounts it
    const markup = renderToStaticMarkup(createElement(AgeStep, { mode: 'signup' }));
    const years = (markup.match(/<option\b[^>]*>[\s\S]*?<\/option>/g) ?? []).filter((o) => !o.includes('Select year'));
    expect(years[0]).toContain(`>${new Date().getFullYear()}<`);
    expect(years.some((o) => /\bselected\b/.test(o))).toBe(false);
    expect(markup).not.toMatch(/18\+|eighteen/i);
  });

  it('a /try teen or blocked result sends nothing off the phone and keeps no birth date', () => {
    const branch = SHELL.slice(SHELL.indexOf('if (ageBands) {'), SHELL.indexOf("if (ageScreenOutcome(year) === 'adult') startGuest();"));
    expect(branch).toContain('lockTryAge(tabStorage(), tryAgeBand(birthDate))');
    expect(branch).not.toMatch(/fetch\(|track\(|flush\(|setItem|localStorage|document\.cookie/);
    // only the adult gate goes online (startGuest), and /try mounts no camera
    expect(SHELL).toMatch(/const startGuest = \(\) => \{\s*online\.current = true;/);
    for (const f of ['components/games/guest-dunk-shell.tsx', 'components/games/dunk-babylon.tsx', 'app/try/page.tsx', 'lib/privacy/tryAgeGate.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('getUserMedia');
    }
  });

  it('is behind TRY_AGE_BANDS_ENABLED, off by default', () => {
    expect(readFileSync('app/try/page.tsx', 'utf8')).toContain('ageBands={isTryAgeBandsEnabled()}');
    expect(readFileSync('lib/flags.ts', 'utf8')).toMatch(/isTryAgeBandsEnabled\(\): boolean \{\s*return envOn\('TRY_AGE_BANDS_ENABLED'\);/);
    expect(SHELL).toMatch(/ageBands = false/);
  });
});
