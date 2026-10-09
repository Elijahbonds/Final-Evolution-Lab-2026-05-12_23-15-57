// SCREEN-JUMP-ONLY: opening /screen must not pull the pose runtime. It loads after Start, on the assess page.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const EXTS = ['.tsx', '.ts', '.mts', '.js', '.jsx'];

function importsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g)) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

function resolveFrom(file: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(ROOT, dirname(file), spec) : null;
  if (!base) return null;
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))];
  for (const p of cands) if (existsSync(p) && statSync(p).isFile()) return relative(ROOT, p);
  return null;
}

function graph(starts: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...starts];
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of importsOf(readFileSync(join(ROOT, f), 'utf8'))) {
      const r = resolveFrom(f, spec);
      if (r && !seen.has(r)) queue.push(r);
    }
  }
  return [...seen];
}

describe('/screen does not load pose or the wasm runtime', () => {
  it('the QR page and its layout never reach pose, wasm or mediapipe', () => {
    const files = graph(['app/screen/page.tsx', 'app/screen/screen-start.tsx', 'app/screen/layout.tsx']);
    // A path word, so the draft file PROPOSED-thresholds (those four letters sit inside the name) is not the runtime.
    const hit = files.filter((f) => /\bpose\b|wasm|mediapipe|PoseService/i.test(f));
    expect(hit).toEqual([]);
    const page = readFileSync(join(ROOT, 'app/screen/page.tsx'), 'utf8');
    expect(page).not.toMatch(/searchParams|redirect\(/);
  });

  it('the assess page asks for the camera only after the camera step', () => {
    const app = readFileSync(join(ROOT, 'app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    const copy = readFileSync(join(ROOT, 'lib/screen/copy.ts'), 'utf8');
    expect(app).toMatch(/if \(next\.step === 'camera'\) \{ void startCamera\(\); return; \}/);
    expect(app).toContain('{COACH_READY}');
    expect(copy).toContain("export const COACH_READY = 'Getting the camera coach ready…'");
  });
});
