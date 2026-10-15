// Track 4 — the wiring guard. A Studio script is PRESENTATION. The interpreter imports nothing but the script vocabulary and
// cannot run code; the host may only LISTEN to the mode (the meter's listeners, a pass-through HUD tap, the phase) and may only
// DO presentation (crowd, particles, a `studio*` HUD banner, a broadcast shot or the mode's replay, a light pulse, a sound).
// Neither may reach anything that scores, judges, times, pays or tunes. Same shape as visual/crowd/crowdWiring.test.ts.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const importsOf = (src: string): { from: string; typeOnly: boolean }[] =>
  [...src.matchAll(/^\s*import\s+(type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ from: m[2], typeOnly: !!m[1] }));
const resolve = (fromFile: string, spec: string): string | null => {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(dirname(join(ROOT, fromFile)), spec) : null;
  if (!base) return null;
  for (const x of ['.ts', '.tsx', '/index.ts']) if (existsSync(base + x)) return rel(base + x);
  return null;
};
/** Every file a module can reach through VALUE imports (type imports carry no code). */
function valueGraph(entry: string): Set<string> {
  const seen = new Set<string>(); const q = [entry];
  while (q.length) {
    const f = q.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const i of importsOf(read(f))) { if (i.typeOnly) continue; const r = resolve(f, i.from); if (r) q.push(r); else if (!i.from.startsWith('.') && !i.from.startsWith('@/')) seen.add(`pkg:${i.from}`); }
  }
  return seen;
}

/** Modules that score, judge, grade, pay, time or tune, or hold a session (visual/crowd's list, plus the session and money paths). */
const FORBIDDEN = /(?:^|\/)(?:scoring|score[A-Z]\w*|\w*Score|JudgePanel|judge\w*|ComboChain|sessionResult|session-payout|sessions?\/|sessionStore|DifficultyL?|cameraPresets|CameraDirector|RallyCore|KeeperCore|aimSwingCore|precisionModes|wallet|payout|RivalPlay|DunkSystem|DunkCard|TiebreakCore|tiebreakCore|ModeHarness|MomentumBus|registry|db|prisma|cell-engine|creator\/CreatorRecord)(?:\.ts)?$/;
/** A session or meter WRITE, however it is spelled (a call, an optional call, a bracket read). */
const WRITES = /[.\]]\s*(?:end|card|multiplier|reset)\s*(?:\?\.)?\(|\[\s*['"`](?:report|end|card|multiplier)['"`]\s*\]/;
const CODE_RUNNERS = /\beval\s*\(|new\s+Function\b|\bFunction\s*\(|\bimport\s*\(|\brequire\s*\(|setTimeout\s*\(\s*['"`]|innerHTML/;

describe('the interpreter: the vocabulary and nothing else', () => {
  const g = valueGraph('lib/nexus-studio/interpreter.ts');
  it('reaches only the interpreter, the script vocabulary and the document (no Babylon, no package at all)', () => {
    expect([...g].sort()).toEqual(['lib/nexus-studio/doc.ts', 'lib/nexus-studio/interpreter.ts', 'lib/nexus-studio/scripts.ts']);
  });
  it('runs no code: no eval, no Function, no dynamic import; no fetch, no window', () => {
    for (const f of g) {
      expect(read(f), f).not.toMatch(CODE_RUNNERS);
      expect(read(f), f).not.toMatch(/\bfetch\s*\(|\bwindow\./);
    }
  });
});

describe('the host: listens, and does presentation', () => {
  const src = read('lib/nexus-studio/scriptHost.ts');
  /** the code without its comments (the header says what the host must never call, by name) */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const imps = importsOf(src);
  it('imports nothing that scores, judges, times, pays or tunes (type-only imports are data shapes)', () => {
    expect(imps.filter((i) => !i.typeOnly && FORBIDDEN.test(i.from)).map((i) => i.from)).toEqual([]);
    expect(imps.filter((i) => !i.typeOnly).map((i) => i.from).sort()).toEqual(['../a11y/reducedMotion', '../babylon/audio/SoundKit', '../babylon/visual/EffectsKit', './interpreter', '@babylonjs/core']);
  });
  it('never reports to the meter, ends or cards a session, or reads the meter\'s multiplier (in any spelling)', () => {
    expect(WRITES.test(code)).toBe(false);
    // `report` appears in the code only as the listener `onReport`: no `.report(`, `?.report?.(`, `['report']` or an alias
    expect(code.replace(/onReport/g, '')).not.toMatch(/report/i);
    expect(code).toContain('onReport');   // (the control: the scan sees the code it is meant to)
    expect(code).not.toMatch(CODE_RUNNERS);
  });
  it('writes the HUD only under its own studio* keys, and passes every mode update through unchanged first', () => {
    const writes = [...src.matchAll(/origSetHud\?\.call\(ctx, \{([^}]*)\}\)/g)].map((m) => m[1]);
    expect(writes.length).toBeGreaterThanOrEqual(2);
    for (const w of writes) for (const key of w.split(',').map((p) => p.split(':')[0].trim()).filter(Boolean)) expect(key, w).toMatch(/^\[STUDIO_HUD\.\w+\]$/);
    expect(src).toMatch(/ctx\.setHud = \(u: Record<string, HudValue>\) => \{\s*origSetHud\.call\(ctx, u\);/);
    expect(src).toMatch(/if \(origSetHud && keys\) ctx\.setHud = origSetHud;/);   // and puts the harness's own back
    const keys = /STUDIO_HUD = \{([^}]*)\}/.exec(src)![1];
    for (const v of keys.match(/'[^']+'/g)!) expect(v).toMatch(/^'studio[A-Z]/);
  });
  it('the guard catches what it is for (mutation control)', () => {
    expect(FORBIDDEN.test('../babylon/core/MomentumBus')).toBe(true);
    expect(FORBIDDEN.test('@/lib/sessions/payout')).toBe(true);
    expect(FORBIDDEN.test('../babylon/core/TiebreakCore')).toBe(true);
    expect(FORBIDDEN.test('../babylon/visual/EffectsKit')).toBe(false);
    expect(CODE_RUNNERS.test('const f = new Function("x")')).toBe(true);
    for (const bad of ['ctx.momentum.report({ kind: "chain" })', 'm?.report?.({ kind: "chain" })', "m['report'](x)", 'const r = m.report; r(x)']) expect(bad.replace(/onReport/g, ''), bad).toMatch(/report/i);
    for (const bad of ['ctx.end("win", 1, {})', 'ctx?.card?.("x")', "ctx['end']('x')", 'bus.reset()']) expect(WRITES.test(bad), bad).toBe(true);
    expect(WRITES.test('const ended = false; interp.emit({ type: "modeEnd" })')).toBe(false);
  });
});
