// w3-crowds — the wiring guard. The crowd is PRESENTATION: it hears plays a mode already reported and draws people reacting.
// It may not import anything that scores, judges, times or tunes, and it may only LISTEN to the Game-Breaker meter (a type
// import, and `onReport` / `onTierChange`) — a crowd that reported would move the meter, its stings and the commentary.
// Also pinned: test-only helpers stay out of lib/ (lib/nav/modules.test.ts), and every mode that opts in disposes its crowd.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..', '..');   // FEL-full-app/
const DIR = 'lib/babylon/visual/crowd';
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const importsOf = (src: string): { from: string; typeOnly: boolean }[] =>
  [...src.matchAll(/^\s*import\s+(type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)].map((m) => ({ from: m[2], typeOnly: !!m[1] }));
const FILES = readdirSync(join(ROOT, DIR)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => `${DIR}/${f}`);

/** Modules that score, judge, grade, pay, time or tune. */
const FORBIDDEN = /(?:^|\/)(?:scoring|score[A-Z]\w*|\w*Score|JudgePanel|judge\w*|ComboChain|sessionResult|session-payout|DifficultyL?|cameraPresets|CameraDirector|RallyCore|KeeperCore|aimSwingCore|precisionModes|wallet|payout|RivalPlay|DunkSystem|DunkCard)(?:\.ts)?$/;
/** Listen-only: these may be imported for their TYPES and nothing else. */
const LISTEN_ONLY = /(?:^|\/)(?:MomentumBus|ModeHarness)(?:\.ts)?$/;

describe('the crowd imports nothing that scores, judges or tunes, and only listens to the meter', () => {
  it('has files to check', () => { expect(FILES.length).toBeGreaterThanOrEqual(8); });
  for (const f of FILES) {
    it(f, () => {
      const src = read(f);
      const imps = importsOf(src);
      expect(imps.filter((i) => FORBIDDEN.test(i.from)).map((i) => i.from), f).toEqual([]);
      expect(imps.filter((i) => LISTEN_ONLY.test(i.from) && !i.typeOnly).map((i) => i.from), f).toEqual([]);
      expect(src, `${f} reports to the meter`).not.toMatch(/\.report\(/);
      expect(src, `${f} reaches into scoring through the context`).not.toMatch(/ctx\.(?:end|setHud|highlight)\(/);
    });
  }
  it('the guard itself catches what it is for (mutation control)', () => {
    expect(FORBIDDEN.test('../../modes/precisionModes')).toBe(true);
    expect(FORBIDDEN.test('../../core/CameraDirector')).toBe(true);
    expect(FORBIDDEN.test('./crowdStands')).toBe(false);
    expect(importsOf("import type { A } from '../../core/MomentumBus';\nimport { B } from '../../core/MomentumBus';")).toEqual([
      { from: '../../core/MomentumBus', typeOnly: true }, { from: '../../core/MomentumBus', typeOnly: false },
    ]);
  });
});

describe('every mode that opts in builds its crowd once and disposes it', () => {
  const MODES = readdirSync(join(ROOT, 'lib/babylon/modes')).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
    .map((f) => `lib/babylon/modes/${f}`).filter((f) => /mountModeCrowd\(/.test(read(f)));
  it('at least one mode opts in', () => { expect(MODES.length).toBeGreaterThan(0); });
  for (const f of MODES) {
    it(f, () => {
      const src = read(f);
      const mounts = [...src.matchAll(/(\w+) = mountModeCrowd\(/g)].map((m) => m[1]);
      expect(mounts.length, 'one assignment per crowd').toBeGreaterThan(0);
      for (const v of new Set(mounts)) expect(src, `${v} is disposed`).toMatch(new RegExp(`${v}\\?\\.dispose\\(\\)`));
    });
  }
});
