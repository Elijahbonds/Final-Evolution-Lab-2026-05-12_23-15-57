// SHARED-ANIM-BUS (2026-09-14) — no cross-mode clip bleed, held on the SOURCE and on a scoped animator.
//
// The source half: for every registered mode, walk its import closure and collect every clip name it can ask for — a
// string literal that is a real clip or an alias key, a `SPORT_CLIP.key`, and the prefix of a templated name
// (`bball_crossover_${dir}`). Each one must be allowed by that mode's scope (clipScope.ts). This is the check that
// would have caught the board bail asking for `football_tackled_fall` and the football spike riding the karate uppercut.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FreeCamera, NullEngine, Scene, AnimationGroup } from '@babylonjs/core';
import { stripComments } from '@/lib/testing/sourceScan';
import { CLIP_ALIASES } from './clipAliases';
import { REAL_CLIPS, SPORT_CLIP } from './clipRegistry';
import { MODES, ENABLED_BABYLON_MODES } from '../modes/registry';
import { MODE_CLIP_SCOPES, requestAllowed, scopeAllows, scopeForMode, suiteOfClip, animReadout, ledgerFor } from './clipScope';
import { CharacterAnimator } from './CharacterAnimator';

const ROOT = path.resolve(__dirname, '../../..');
const MODES_DIR = path.join(ROOT, 'lib/babylon/modes');

// Files that NAME clips without playing them: the clip tables themselves, the importer's list of authored names, the
// dunk trick catalogue (read for scoring labels by modes that import the judge), and the retired TimingSport configs.
const DATA_TABLES = /anim\/authored\/|anim\/clipAliases\.ts$|anim\/clipRegistry\.ts$|anim\/clipScope\.ts$|anim\/mirrored-clips\.ts$|anim\/danceClips\.ts$|anim\/importSanitizer\.ts$|characters\/proceduralClips\.ts$|core\/DunkSystem\.ts$|modes\/modeConfigs\.ts$/;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (fs.existsSync(c)) return c;
  return null;
}

function closure(entry: string): string[] {
  const seen = new Set<string>(); const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gms)) {
      const r = resolveImport(f, m[1]);
      if (r) stack.push(r);
    }
  }
  return [...seen];
}

const KNOWN = new Set<string>([...REAL_CLIPS, ...Object.keys(CLIP_ALIASES)]);
const SPORT_PREFIX = /^(dunk|bball|football|karate|freerun|board|skate|snow|surf|golf|tennis|volleyball|soccer|keeper|penalty|baseball|derby)_/;

/** Every clip name a source text can ask for. */
function clipNamesIn(src: string): string[] {
  const code = stripComments(src);
  const out = new Set<string>();
  for (const m of code.matchAll(/['"`]([a-z][a-z0-9_]*)['"`]/g)) if (KNOWN.has(m[1])) out.add(m[1]);
  for (const m of code.matchAll(/`([a-z]+_[a-z0-9_]*)\$\{/g)) if (SPORT_PREFIX.test(m[1]) && [...KNOWN].some((k) => k.startsWith(m[1]))) out.add(m[1] + '*');   // a mesh name (`surf_palm_t_${i}`) is not a clip
  for (const m of code.matchAll(/SPORT_CLIP\.([A-Za-z0-9]+)/g)) {
    const v = (SPORT_CLIP as Record<string, string>)[m[1]];
    if (v) out.add(v);
  }
  return [...out];
}

/** The registry's import path for each key (a mode file may define several modes — precisionModes defines four). */
function modeFiles(): Map<string, { file: string; exportName: string }> {
  const reg = fs.readFileSync(path.join(MODES_DIR, 'registry.ts'), 'utf8');
  const fileOf = new Map<string, string>();
  for (const m of reg.matchAll(/import\s+\{([^}]+)\}\s+from\s+'(\.\/[^']+)'/g)) {
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) fileOf.set(name, resolveImport(path.join(MODES_DIR, 'registry.ts'), m[2])!);
  }
  const out = new Map<string, { file: string; exportName: string }>();
  const body = reg.slice(reg.indexOf('export const MODES'));
  for (const m of body.matchAll(/^\s*([a-z_0-9]+):\s*([A-Z]\w+),/gm)) {
    const file = fileOf.get(m[2]);
    if (file) out.set(m[1], { file, exportName: m[2] });
  }
  return out;
}

/** A file that defines several modes is judged section by section: the shared head plus that mode's own `export const`. */
function ownSource(file: string, exportName: string): string {
  const src = fs.readFileSync(file, 'utf8');
  const starts = [...src.matchAll(/^export const (\w+): ModeDefinition/gm)];
  if (starts.length <= 1) return src;
  const i = starts.findIndex((m) => m[1] === exportName);
  const head = src.slice(0, starts[0].index);
  const end = starts[i + 1]?.index ?? src.length;
  return head + src.slice(starts[i].index, end);
}

describe('clipScope — no cross-mode clip bleed', () => {
  it('every registered mode has a scope', () => {
    const missing = Object.entries(MODES).filter(([, d]) => d && !MODE_CLIP_SCOPES[d.modeId]).map(([k, d]) => `${k} (${d.modeId})`);
    expect(missing).toEqual([]);
    for (const k of ENABLED_BABYLON_MODES) expect(MODE_CLIP_SCOPES[MODES[k].modeId], k).toBeTruthy();
  });

  it('every clip a mode can ask for is inside its scope (import closure, comments stripped)', () => {
    const violations: string[] = [];
    for (const [key, { file, exportName }] of modeFiles()) {
      const def = MODES[key];
      const scope = scopeForMode(def.modeId);
      for (const f of closure(file)) {
        const rel = path.relative(ROOT, f);
        if (DATA_TABLES.test(rel)) continue;
        const src = f === file ? ownSource(f, exportName) : fs.readFileSync(f, 'utf8');
        for (const name of clipNamesIn(src)) {
          const bare = name.replace(/\*$/, '');
          const target = CLIP_ALIASES[bare]?.[0];
          const ok = name.endsWith('*') ? scopeAllows(scope, bare + 'x') || scope!.borrow.some((b) => b.startsWith(bare))
            : scopeAllows(scope, bare) && (!target || REAL_CLIPS.has(bare) || scopeAllows(scope, target));
          if (!ok) violations.push(`${key}: ${name}${target ? ` (→ ${target})` : ''} in ${rel}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('the board, football and derby bleeds named in the tip are gone from the tables', () => {
    expect(suiteOfClip(CLIP_ALIASES.football_touchdown_spike[0])).not.toBe('combat');
    expect(CLIP_ALIASES.football_touchdown_spike[0]).not.toBe('uppercut');
    for (const n of ['baseball_swing_full', 'baseball_bat_stance', 'derby_swing', 'derby_bat_stance']) {
      expect(suiteOfClip(CLIP_ALIASES[n][0]), n).toBe('baseball');   // a bat name plays a bat clip, never the karate hook / guard
    }
    const skate = scopeForMode('skateboard')!;
    for (const n of ['dunk_launch', 'football_tackled_fall', 'bball_score_celebrate', 'karate_hit_react', 'baseball_swing']) expect(scopeAllows(skate, n), n).toBe(false);
    const derby = scopeForMode('baseball')!;
    for (const n of ['dunk_launch', 'karate_hit_react', 'tennis_swing', 'golf_swing_full']) expect(scopeAllows(derby, n), n).toBe(false);
    expect(scopeAllows(scopeForMode('tennis'), 'baseball_swing')).toBe(false);   // the bat stays in the batter's box
    // ANIM-RESIDUAL: the fighter's base clips are core by name, and a batter owns none of them
    for (const m of ['baseball', 'derby']) for (const n of ['guard', 'jab', 'hook', 'uppercut', 'roundhouse', 'high_kick']) expect(scopeAllows(scopeForMode(m), n), `${m} ${n}`).toBe(false);
    for (const n of ['idle_stand', 'run', 'walk', 'jump_up', 'baseball_stance']) expect(scopeAllows(derby, n), n).toBe(true);
    expect(scopeAllows(scopeForMode('karate'), 'guard')).toBe(true);
    expect(scopeAllows(skate, 'guard')).toBe(true);   // omit is per mode, not a new global rule
  });
});

describe('a scoped animator refuses another sport’s clip', () => {
  const scene = new Scene(new NullEngine());
  new FreeCamera('c', undefined as never, scene);
  const group = (name: string) => { const g = new AnimationGroup(name, scene); return g; };

  it('plays its own suite, refuses a foreign one onto its resting loop, and counts the refusal', () => {
    scene.metadata = { felModeId: 'skateboard' };
    const a = new CharacterAnimator(scene, ['board_ride_idle', 'board_push', 'idle_stand', 'guard'].map(group));
    const scope = scopeForMode('skateboard');
    a.setScope(scope);
    ledgerFor(scene).scope = scope;
    const errs: string[] = []; const orig = console.error; console.error = (m: string) => { errs.push(String(m)); };
    try {
      a.play('dunk_launch');
      a.play('dunk_launch');
      a.play('football_tackled_fall');
    } finally { console.error = orig; }
    expect(errs.filter((e) => e.includes('REFUSED')).length).toBe(2);   // once per name
    expect(animReadout(scene).refused).toEqual({ dunk_launch: 2, football_tackled_fall: 1 });
    expect(requestAllowed(scope, 'board_push', new Set(['board_push']))).toBe(true);
    expect(requestAllowed(scope, 'skate_idle_cruise', new Set())).toBe(true);   // board alias onto a core clip
    expect(requestAllowed(scope, 'football_touchdown_spike', new Set())).toBe(false);
  });

  it('an unscoped body (no mode) keeps every suite', () => {
    expect(scopeForMode(undefined)).toBeNull();
    expect(scopeAllows(null, 'dunk_launch')).toBe(true);
  });
});
