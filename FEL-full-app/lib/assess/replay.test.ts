// The replay harness: a capture in, the whole graded session out — the same every time (spec §12 Phase 2 accept:
// "replaying recorded captures gives the same scores deterministically"). And the import boundary the route keeps.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFixture } from '@/lib/mirror/fixtures/load';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { quickCapture, replay, type QuickScenario } from './replay';
import { THRESHOLDS } from './thresholds';

const fixture = (name: string) => toPoseFrames(readFixture(name));
const run = (sc: QuickScenario = {}) => replay(quickCapture(sc, fixture));

describe('replay is deterministic', () => {
  it('the same capture twice gives an identical result object', () => {
    for (const sc of [{}, { t1Front: 'squat_knee_in_left' }, { noise: true, seed: 11, t3: { left: { kneeIn: 0.05 } } }] as QuickScenario[]) {
      const cap = quickCapture(sc, fixture);
      const a = replay(cap), b = replay(cap);
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('and building the capture twice from the same scenario (and seed) does too', () => {
    const sc: QuickScenario = { noise: true, seed: 3 };
    expect(JSON.stringify(run(sc))).toBe(JSON.stringify(run(sc)));
  });
});

describe('a replayed Quick Screen', () => {
  it('squat_clean.json flags nothing on T1; squat_knee_in_left.json flags the left knee only', () => {
    const clean = run({ t1Front: 'squat_clean' }), left = run({ t1Front: 'squat_knee_in_left' });
    expect(clean.tests[0].sides.both!.metrics.filter((m) => m.fault)).toEqual([]);
    expect(left.tests[0].sides.both!.metrics.filter((m) => m.fault).map((m) => `${m.id}:${m.side}`)).toEqual(['valgusLeft:left']);
    expect(left.findings.some((f) => /Left knee/.test(f.text))).toBe(true);
  });

  it('a single-leg knee-in flags that side on T3', () => {
    const r = run({ t3: { right: { kneeIn: 0.09 } } });   // SCREEN-SHIP: Red is over 20° (0.06 read ≈ 18°, Yellow)
    expect(r.tests[2].sides.right!.metrics.find((m) => m.id === 'fppa')!.fault).toBe(true);
    expect(r.tests[2].sides.left!.metrics.find((m) => m.id === 'fppa')!.fault).toBe(false);
  });

  it('confidence under 0.6 is "not scored", never a number; MQS needs three scored tests and says Quick', () => {
    const cap = quickCapture({}, fixture);
    const dim = (fs: readonly PoseFrame[]) => fs.map((f, i) => (i % 4 === 0 ? f : { ...f, image: f.image.map((l) => ({ ...l, v: 0.2 })) }));
    const r = replay({ ...cap, T3: { left: dim(cap.T3!.left!), right: dim(cap.T3!.right!) } });
    expect(r.tests[2]).toMatchObject({ status: 'notScored', score100: null, score03: null });
    expect(r.reasons.T3![0].text).toMatch(/not scored/);
    expect(r.mqs).toMatchObject({ label: 'Quick', tests: ['T1', 'T2', 'T5'] });
    const two = replay({ ...cap, T3: { left: dim(cap.T3!.left!), right: dim(cap.T3!.right!) }, T5: dim(cap.T5!) });
    expect(two.mqs).toBeNull();
  });

  it('every score is provisional: each test read only unsigned thresholds', () => {
    for (const t of run().tests) {
      expect(t.provisional, t.id).toBe(true);
      expect(t.thresholdsUsed.length, t.id).toBeGreaterThan(0);
      for (const id of t.thresholdsUsed) expect(THRESHOLDS[id].signedOff, id).toBe(false);
    }
  });
});

// ── the import boundary (lane brief: no Babylon on the new route) ──

const ROOTS = ['lib/assess', 'app/play/mirror/assess', 'app/api/mirror/assessment'];
function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}
const imports = (src: string) => [...src.matchAll(/(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

describe('the route imports nothing from Babylon', () => {
  const all = ROOTS.flatMap(files);

  it('finds the sources it guards', () => {
    expect(all.filter((f) => f.startsWith('lib/assess')).length).toBeGreaterThan(8);
  });

  it('no source under lib/assess, the page or the API route imports @babylonjs/* or lib/babylon/**', () => {
    const bad = all.flatMap((f) => imports(readFileSync(f, 'utf8')).filter((m) => /@babylonjs\/|(^|\/)babylon\//.test(m)).map((m) => `${f} → ${m}`));
    expect(bad).toEqual([]);
  });

  it('the page and the route never load the synthetic-capture code up front (the QA handle loads it on demand)', () => {
    const page = all.filter((f) => !f.startsWith('lib/assess'));
    const runtime = all.filter((f) => f.startsWith('lib/assess') && !/replay\.ts$/.test(f));
    const synth = /(^|\/)replay$|lib\/pose\/synth|lib\/mirror\/fixtures/;
    const staticImports = (src: string) => [...src.matchAll(/(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const bad = [
      ...page.flatMap((f) => staticImports(readFileSync(f, 'utf8')).filter((m) => synth.test(m)).map((m) => `${f} → ${m}`)),
      ...runtime.flatMap((f) => imports(readFileSync(f, 'utf8')).filter((m) => synth.test(m)).map((m) => `${f} → ${m}`)),
    ];
    expect(bad).toEqual([]);
    // the one dynamic import is the QA handle's, behind the pose feed's gate
    const app = readFileSync('app/play/mirror/assess/_components/assess-app.tsx', 'utf8');
    expect(app).toMatch(/feedHookAllowed\(process\.env\.NODE_ENV, agent, window\.location\.hostname\)[\s\S]*import\('@\/lib\/assess\/replay'\)/);
  });
});

describe('the picture never leaves the page', () => {
  const page = ['app/play/mirror/assess', 'lib/assess'].flatMap(files);
  it('no source on the route exports a frame, records the stream, or opens a channel', () => {
    const EXPORT = /\.toDataURL\s*\(|\.toBlob\s*\(|getImageData\s*\(|captureStream\s*\(|MediaRecorder|sendBeacon|\bWebSocket\b|RTCPeerConnection|\bEventSource\b|XMLHttpRequest/;
    expect(page.filter((f) => EXPORT.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
  // SCREEN-SHIP (A2-3): tightened. The page used to make one call (postAssessment, for a signed-in athlete); with no
  // server save in this ship it makes none. The only fetch left under lib/assess is postAssessment's own, unwired.
  it('the page makes no network call at all; postAssessment stays in lib/assess, called by nothing on the page', () => {
    const calls = page.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bfetch\s*\(/g)].map(() => f));
    expect(calls.filter((f) => f.startsWith('app/'))).toEqual([]);
    expect(page.filter((f) => f.startsWith('app/') && /postAssessment/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
