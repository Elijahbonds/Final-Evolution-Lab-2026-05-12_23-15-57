// The Mirror's top-left chip names what is happening in THIS pattern (MIRROR-COACH P2, 2026-09-26). It read the guided
// squat's first stage, BREATHE, through the whole Movement Screen — the screen fell into the squat's arm of a ternary.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { chipLabel, screenChip, shortCheckLabel } from './hudChip';
import { FULL_SCREEN, MODIFIED_SCREEN } from './screen';

const base = { phase: 'hold', jumpState: 'ready', squatStage: 'breathe' as const, runner: null };

describe('the chip', () => {
  it('the Movement Screen shows its station — never the squat\'s BREATHE — on every station of both screens', () => {
    for (const [screen, stations] of [['modified', MODIFIED_SCREEN], ['full', FULL_SCREEN]] as const) {
      stations.forEach((st, i) => {
        for (const phase of ['positioning', 'holding', 'stationDone'] as const) {
          const label = chipLabel({ ...base, pattern: 'screen', runner: { screen, phase, stationIndex: i } });
          expect(label).toBe(`Station ${i + 1} of ${stations.length} · ${shortCheckLabel(st.checks[0].label)}`);
          expect(label.toLowerCase()).not.toBe('breathe');
          expect(label.length, label).toBeLessThanOrEqual(40);            // fits the chip on a phone
        }
      });
    }
  });

  it('the chip\'s cut of a label stops at its first comma or bracket', () => {
    expect(shortCheckLabel('Single-leg stance, 30 seconds a side')).toBe('Single-leg stance');
    expect(shortCheckLabel('Pelvic tilt (hands on the hip points)')).toBe('Pelvic tilt');
    expect(shortCheckLabel('Knee window')).toBe('Knee window');
  });

  it('before the first tick it says get set; a finished screen says so', () => {
    expect(chipLabel({ ...base, pattern: 'screen', runner: null })).toBe('Get set');
    expect(screenChip({ screen: 'full', phase: 'complete', stationIndex: 7 })).toBe('Screen complete');
  });

  it('the other patterns read as before: press/row its phase, the jump its state, the squat its stage', () => {
    expect(chipLabel({ ...base, pattern: 'pressRow', phase: 'pull' })).toBe('pull');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'ready' })).toBe('Jump when ready');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'airborne' })).toBe('Airborne');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'calibrating' })).toBe('Stand still');
    expect(chipLabel({ ...base, pattern: 'jump', jumpState: 'landing' })).toBe('landing');
    expect(chipLabel({ ...base, pattern: 'squat', squatStage: 'work' })).toBe('work');
  });
});

describe('the harness', () => {
  const h = readFileSync(new URL('../../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
  it('renders the chip from chipLabel, not a ternary that ends in squatStage', () => {
    expect(h).toContain('{chipLabel({ pattern, phase, jumpState, squatStage, runner })}');
    expect(h).not.toMatch(/: pattern === 'jump' \? \(jumpState === 'ready'/);
  });

  it('a finished screen lets go of the camera: stop() in the effect that submits it', () => {
    const effect = h.slice(h.indexOf("if (pattern !== 'screen' || runner?.phase !== 'complete') return;"));
    const body = effect.slice(0, effect.indexOf('}, [pattern, runner, submitScreen, stop]);'));
    expect(body).toContain('void submitScreen(runner.results, runner.screen);');
    expect(body).toMatch(/stop\(\);\s*setStatus\('idle'\);/);
  });
});
