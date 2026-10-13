// vis-court wave 2 — the wiring suite: the court visuals read the game's state and never write the game's rules.
//
// Source-level on purpose (the vis-party and vis-combat suites do the same): the visual modules may import Babylon, their
// siblings, and the look systems (visual/, scene/); they may not import a scoring, judging, timing or difficulty module — which
// is what "visual only" means in this repo. The mode files' own hooks are held in the per-mode checks at the bottom.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = __dirname;
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const importsOf = (src: string): string[] => [...src.matchAll(/^\s*(?:import|export)\s[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

describe('the court visual modules', () => {
  it('there are modules to check', () => { expect(files.length).toBeGreaterThanOrEqual(6); });
  for (const f of files) {
    it(`${f} imports only Babylon, its siblings and the look systems`, () => {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const imp of importsOf(src)) {
        const ok = imp === '@babylonjs/core' || imp.startsWith('./') || /^\.\.\/(visual|scene|premium)\//.test(imp);
        expect(ok, `${f} imports ${imp}`).toBe(true);
      }
    });
    it(`${f} touches no scoring, judging or difficulty name`, () => {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(/\b(RallyCore|judgeShot|GolfScoring|derbyHud|bankSwing|Difficulty|readProfile|ctx\.end|ctx\.card|SessionResult|wallet|earn\()/.test(src), f).toBe(false);
    });
  }
});
