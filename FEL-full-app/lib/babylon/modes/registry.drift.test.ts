// REGISTRY DRIFT — the failure mode this tree keeps having (2026-09-13).
//
// Three separate times now a mode has been unreachable because a NAME did not line up, and each time it was
// found by accident rather than by a test:
//   · /dev/mode/snowboard answered "no registry mode" because the key is snowboard_slalom;
//   · MODES.brainbrawl was UNDEFINED while a host component called runMode() with it — a whole A+ mission
//     nobody could reach, and a host one wiring change away from throwing;
//   · ENABLED lists have named retired modes before.
//
// These are all the same bug: a string in one file that has to match a string in another, with nothing
// checking. So this checks.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODES, ENABLED_BABYLON_MODES } from './registry';

const ROOT = path.resolve(__dirname, '../../..');
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the registry says what it means', () => {
  it('EVERY KEY MATCHES ITS MODE’S OWN modeId', () => {
    // the snowboard case: a key of `snowboard_slalom` over a mode whose id is `snowboard` means every probe,
    // deep link and agent list that uses one of them silently misses the other
    const mismatched = Object.entries(MODES)
      .filter(([key, def]) => def && def.modeId && def.modeId !== key)
      .map(([key, def]) => `${key} → modeId "${def.modeId}"`);
    // THE KNOWN SET, listed explicitly so a NEW mismatch fails while the legacy ones do not.
    //
    // These four are real and already compensated for downstream: sportKitDefaults.ts names this exact list
    // in its own comment and carries both spellings of each, so the kit lookup cannot miss. They are a
    // naming legacy rather than a defect — but they are also exactly why this test exists, because the next
    // one will not have a table quietly covering for it.
    const ALLOWED = [
      'snowboard_slalom → modeId "snowboard"',
      'derby → modeId "baseball"',
      'penalty → modeId "soccer"',
      'karate_vs → modeId "karate-vs"',
    ];
    expect(mismatched.filter((m) => !ALLOWED.includes(m))).toEqual([]);
  });

  it('every entry is a real mode definition', () => {
    for (const [key, def] of Object.entries(MODES)) {
      expect(def, `${key} is undefined`).toBeTruthy();
      expect(typeof def.load, `${key}.load`).toBe('function');
      expect(typeof def.update, `${key}.update`).toBe('function');
      expect(typeof def.onInput, `${key}.onInput`).toBe('function');
      expect(def.camPreset, `${key}.camPreset`).toBeTruthy();
    }
  });

  it('EVERY ENABLED MODE EXISTS — an enabled list naming a mode that is gone ships a broken route', () => {
    const missing = [...ENABLED_BABYLON_MODES].filter((id) => !(id in MODES));
    expect(missing).toEqual([]);
  });
});

describe('the aliases are covered downstream', () => {
  it('every registry key whose modeId differs is carried by the sport kit table', () => {
    // the compensation this legacy relies on: if a key/modeId pair is not in sportKitDefaults under BOTH
    // spellings, a body in that mode silently falls back to the first garment in the slot
    const kits = fs.readFileSync(path.join(ROOT, 'lib/babylon/core/sportKitDefaults.ts'), 'utf8');
    for (const [key, def] of Object.entries(MODES)) {
      if (!def?.modeId || def.modeId === key) continue;
      const quoted = (n: string) => new RegExp(`['"]?${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]?\\s*:`);
      expect(quoted(key).test(kits) || quoted(def.modeId).test(kits), `${key}/${def.modeId} is in no kit table`).toBe(true);
    }
  });
});

describe('nothing calls runMode with a mode that is not registered', () => {
  it('every MODES.<key> reference in the app resolves', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) return;
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) files.push(rel);
      }
    };
    walk('components'); walk('app');

    const bad: string[] = [];
    for (const rel of files) {
      const src = code(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      // only where the reference is handed to the harness — `MODES.map(...)` elsewhere is a different array
      for (const m of src.matchAll(/runMode\(\s*MODES(?:\.([a-z_0-9]+)|\[['"]([a-z_0-9]+)['"]\])/g)) {
        const key = m[1] ?? m[2];
        if (key && !(key in MODES)) bad.push(`${rel}: runMode(MODES.${key})`);
      }
    }
    expect(bad).toEqual([]);
  });
});
