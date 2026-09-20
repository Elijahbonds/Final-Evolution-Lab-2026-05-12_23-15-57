import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { INK, PALETTE, SURFACE } from './palette';

const ROOT = join(__dirname, '..', '..');

function css(): string {
  return ['app/theme.css', 'app/globals.css', 'app/game-surface.css']
    .map((f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } })
    .join('\n');
}

function definedVars(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of src.matchAll(/(--fel-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

describe('every design token that is used is defined', () => {
  // The test this file exists for. var(--fel-red) was referenced fourteen times and never declared anywhere; an
  // undefined custom property is an invalid value, so those call sites rendered with NO colour — including the
  // line in the athlete creator that tells an author a stat is a violation. Nothing failed, nothing logged, the
  // signal was just missing. A stylesheet cannot catch this; a test can.
  const defined = definedVars(css());

  const used = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(tsx?|css)$/.test(p) || /\.test\.tsx?$/.test(p)) continue;
      // Only a var() WITHOUT a fallback is a hazard. `var(--fel-rise-delay, 0ms)` is fine by construction —
      // it is set per element and the fallback is the resting value. `var(--fel-red)` had nothing to fall back to.
      for (const m of readFileSync(p, 'utf8').matchAll(/var\(\s*(--fel-[a-z0-9-]+)\s*\)/g)) used.add(m[1]);
    }
  };
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'components'));
  walk(join(ROOT, 'lib'));

  it('found tokens and consumers to compare', () => {
    expect(defined.size).toBeGreaterThan(10);
    expect(used.size).toBeGreaterThan(10);
  });

  it('declares every --fel-* custom property that something reads', () => {
    const undeclared = [...used].filter((v) => !defined.has(v)).sort();
    expect(undeclared, 'used via var() but never declared — these render as no value at all').toEqual([]);
  });
});

describe('the TypeScript palette and the CSS tokens agree', () => {
  const defined = definedVars(css());
  const norm = (v: string) => v.trim().toUpperCase();

  for (const [name, value] of Object.entries(PALETTE)) {
    it(`--fel-${name} is ${value}`, () => {
      expect(defined.get(`--fel-${name}`), `--fel-${name} is missing from theme.css`).toBeDefined();
      expect(norm(defined.get(`--fel-${name}`)!)).toBe(norm(value));
    });
  }

  it('the background and the card material match their tokens', () => {
    expect(norm(defined.get('--fel-bg')!)).toBe(norm(INK));
    expect(norm(defined.get('--fel-surface')!)).toBe(norm(SURFACE));
  });

  it('.fel-card uses the same surface value, so one page cannot show two materials', () => {
    const globals = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');
    const block = globals.slice(globals.indexOf('.fel-card {'));
    const bg = /background:\s*([^;]+);/.exec(block)?.[1] ?? '';
    expect(norm(bg)).toBe(norm(SURFACE));
  });

  it('names the two tokens that were being read before they existed', () => {
    // Keep them declared: removing either silently breaks fourteen call sites again.
    expect(defined.has('--fel-red')).toBe(true);
    expect(defined.has('--fel-purple')).toBe(true);
  });
});
