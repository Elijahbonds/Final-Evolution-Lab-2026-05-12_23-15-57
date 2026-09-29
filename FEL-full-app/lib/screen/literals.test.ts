// SCREEN-SHIP (b): no threshold, band or cue literal used by lib/assess/** or the screen's UI lives outside
// lib/screen/PROPOSED-thresholds.ts. Every number left in those files (other than 0, 1 and 2) is listed here with the
// reason it is not a screening number: a landmark index, a unit, a scale, physics, rounding, an epsilon, a drawing or
// UI-pacing constant, or a record-validation bound. A new unexplained number fails this test: move it into the PROPOSED
// file, or add it here with its reason.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

const LANDMARKS = ['11', '12', '13', '14', '15', '16', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33'];

/** file → [numbers, why]. */
const ALLOWED: Record<string, [string[], string][]> = {
  'lib/assess/scoring.ts': [[['3', '100'], 'the 0–3 and 0–100 scales'], [['1000', '10'], 'ms → Hz, and one decimal of rounding']],
  'lib/assess/reps.ts': [],
  'lib/assess/calibration.ts': [[LANDMARKS, 'MediaPipe landmark indices and the 33-landmark count']],
  'lib/assess/protocol.ts': [[['5', '3'], 'rep counts of T4, T6 and T7, listed as "Full screen: coming later" and never run']],
  'lib/assess/why.ts': [[['10', '100', '1000'], 'rounding, percent, ms → s'], [['2.54'], 'cm per inch'], [['3', '4', '5'], 'the §7.3 ranking order of finding categories and PR #20\'s top-three findings count (not shown by SCREEN-SHIP\'s results)']],
  'lib/assess/runner.ts': [[['1000', '10000', '10', '100'], 'ms → s, Hz rounding, percent'], [['33'], 'the 33-landmark count'], [['3'], 'the 0–3 scale in PR #20\'s mini line'], [['2.54'], 'cm per inch']],
  'lib/assess/geometry.ts': [
    [['180', '360'], 'degrees in a turn'], [['1e-12', '1e-9', '1e-6', '1e-3'], 'division guards'], [['0.5'], 'the image centre, midpoints'],
    [LANDMARKS, 'MediaPipe landmark indices and count'],
    [['0.004', '0.2'], 'orientation heuristics (which way the feet point, which side is nearer the lens): pure geometry, they grade nothing'],
  ],
  'lib/assess/graders/t1-overhead-squat.ts': [[LANDMARKS, 'landmark indices and count'], [['101'], 'a sentinel above the 0–100 scale']],
  'lib/assess/graders/t2-dorsiflexion.ts': [[['1000', '10'], 'heel-lift percent to one decimal'], [['100'], 'the weight of T2\'s only metric (any positive weight scores the same)']],
  'lib/assess/graders/t3-single-leg-squat.ts': [[LANDMARKS, 'landmark indices and count'], [['101'], 'a sentinel above the 0–100 scale']],
  'lib/assess/graders/t5-cmj.ts': [
    [['9.81'], 'g, the gravity constant'], [['8', '4'], 'the flight-time physics: h = g·t²/8, dh = g·t·dt/4'], [['1000', '100', '10'], 'ms → s, m → cm, rounding'],
    [['1e-9'], 'a division guard'], [LANDMARKS, 'landmark indices and count'], [['101'], 'a sentinel above the 0–100 scale'],
  ],
  'lib/assess/prqWrite.ts': [[['32', '1024', '3', '10', '64', '8', '9', '31', '16', '1000', '100', '50', '240', '5000', '7', '21', '8192'], 'record-validation bounds (sizes, key lengths, plausible ranges) and rounding: what the server would accept, not a grade (no server save in this ship)']],
  'lib/assess/thresholds.ts': [],
  'lib/screen/checks.ts': [], 'lib/screen/store.ts': [], 'lib/screen/flow.ts': [], 'lib/screen/copy.ts': [], 'lib/screen/PROPOSED-program-lanes.ts': [],
  'lib/screen/age.ts': [], 'lib/screen/routes.ts': [],
  'lib/screen/config.ts': [[['9'], 'a regex character class (a-z0-9)']],
  'lib/screen/ui.ts': [[['16', '3', '0.5', '6', '1200'], 'UI constants: the skeleton\'s One Euro (1, 16, 3), its visibility floor, the tracking-loss window and the Done beat — grade nothing (gate 2)'], [LANDMARKS, 'landmark indices and count']],
  'app/play/mirror/assess/_components/assess-app.tsx': [[['33'], 'the landmark count'], [['500'], 'how often the camera check re-reads the pose rate (UI)'], [['4', '3'], 'the 4:3 default picture aspect'], [['60'], 'the camera frame-rate asked for on the jump (spec §3.1)']],
  'app/play/mirror/assess/_components/gate-steps.tsx': [],
  'app/play/mirror/assess/_components/live-hud.tsx': [[['100', '1000'], 'percent, ms → s']],
  'app/play/mirror/assess/_components/skeleton.ts': [[LANDMARKS, 'the bones and joints drawn'], [['0.35', '160', '0.9', '2.5', '110', '6', '1.5', '240', '200', '2.4', '0.2', '0.08', '1e-6'], 'drawing: visibility for the frozen view, line widths, alpha, radii, guide lengths, padding']],
  'app/play/mirror/assess/_components/use-voice.ts': [[['1.02'], 'speech rate']],
};
const NONE = [
  'app/play/mirror/assess/_components/camera-help.tsx', 'app/play/mirror/assess/_components/not-saved.tsx', 'app/play/mirror/assess/_components/results-page.tsx',
  'app/play/mirror/assess/_components/results-view.tsx', 'app/play/mirror/assess/_components/screen-ui.tsx', 'app/play/mirror/assess/page.tsx',
  'app/play/mirror/assess/results/page.tsx', 'app/screen/page.tsx', 'app/screen/program/[lane]/page.tsx', 'app/screen/program/[lane]/program-lane.tsx',
  'app/screen/privacy/page.tsx', 'app/screen/privacy/clear-results.tsx', 'app/play/mirror/assess/_components/use-leave-guard.ts',
];
/** lib/assess/replay.ts is the synthetic athlete (QA data for tests and probes): it grades nothing. */
const EXEMPT = ['lib/assess/replay.ts', 'lib/screen/PROPOSED-thresholds.ts', 'lib/screen/PROPOSED-program-lanes.ts'];

/** Numeric literals in code: comments, strings and template text dropped. */
function numbers(src: string): string[] {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; out += '""'; continue; }
    if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; let d = 1; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; if (d) out += src[i]; i++; } out += ' '; continue; }
        i++;
      }
      i++; continue;
    }
    out += c; i++;
  }
  const found = new Set<string>();
  for (const m of out.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?(?:e-?\d+)?|\.\d+)(?![\w$])/g)) if (!['0', '1', '2'].includes(m[1])) found.add(m[1]);
  return [...found];
}

describe('no screening number lives outside lib/screen/PROPOSED-thresholds.ts', () => {
  it.each(Object.keys(ALLOWED))('%s', (f) => {
    const allowed = new Set(ALLOWED[f].flatMap(([ns]) => ns));
    const extra = numbers(readFileSync(join(ROOT, f), 'utf8')).filter((x) => !allowed.has(x));
    expect(extra, `${f}: move these into the PROPOSED file, or document them in literals.test.ts`).toEqual([]);
  });

  it.each(NONE)('%s: no number at all', (f) => {
    expect(numbers(readFileSync(join(ROOT, f), 'utf8'))).toEqual([]);
  });

  it('every allow-list entry says why', () => {
    for (const [f, groups] of Object.entries(ALLOWED)) for (const [, why] of groups) expect(why.length, f).toBeGreaterThan(8);
    expect(EXEMPT).toContain('lib/assess/replay.ts');
  });

  it('no band or drill cue is defined outside the PROPOSED file', () => {
    const files = [...Object.keys(ALLOWED), ...NONE].filter((f) => !EXEMPT.includes(f));
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, f).not.toMatch(/\bband\(\s*[\d.]+\s*,|good:\s*[\d.]+\s*,\s*poor:|b3\(\[/);
      expect(src, f).not.toMatch(/drill\(\s*'/);
    }
  });
});
