// ECONOMY-SESSIONS-HARDEN (2026-09-28): the per-mode score rules (MODE_SCORE_RULES) and where every number comes from.
//
// The rules are DERIVED from the measured TRUE :3000 runs by one function, so these tests hold the arithmetic, hold every
// measured run inside its own rule, and hold every real run seen on any OTHER port inside the rules too (the cross-check:
// a rule that refused an honest run somebody has actually played would be the worst failure this file could have).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import {
  MAX_DURATION_FLOOR_MS, MEASURED_RUNS, MIN_DURATION_FLOOR_MS, MODE_SCORE_RULES, RATE_HEADROOM, SCORE_COLUMN_MAX, SCORE_HEADROOM, STORY_MIRRORED,
  checkRunScore, checkUnruledScore, deriveRule, derivedBounds, derivedRule, dunkDuelBound, rulesMaxFor, storyBossBound, storyRailBound, unmeasuredModes, type MeasuredRun,
} from './modeScoreRules';
import { DUNK_ATTEMPT_MAX } from '@/lib/arena-score-integrity';
import { MODE_INFO } from '@/lib/game-data';

const run = (score: number | null, sec: number | null, secIs: MeasuredRun['secIs'] = 'posted'): MeasuredRun => ({ score, sec, secIs, source: 'test' });

/** Every `<GameShell mode="…">` under app/: the keys sessions are posted under (lib/sessionModeKeys.test.ts walks the same). */
function sessionKeys(): string[] {
  const APP = join(process.cwd(), 'app');
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.tsx')) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/<GameShell\b[^>]*?\bmode="([^"]+)"/g)) out.add(m[1]);
    }
  };
  walk(APP);
  void relative; void sep;
  return [...out].sort();
}

describe('deriveRule: one arithmetic for every mode', () => {
  it('a mode with an exact rules maximum is capped at exactly that, whatever was measured', () => {
    expect(rulesMaxFor('threePoint', { killSwitch: false })).toBe(30);
    const r = deriveRule('threePoint', [run(6, 150, 'upper')], { killSwitch: false })!;
    expect(r).toMatchObject({ maxScore: 30, maxScoreFrom: 'rules' });
  });

  it('any other mode: the best measured score × SCORE_HEADROOM; its pace × RATE_HEADROOM, never below a max run at the shortest length', () => {
    const r = deriveRule('snowboarding', [run(2156, 72)])!;
    expect(r.maxScoreFrom).toBe('measured');
    expect(r.maxScore).toBe(2156 * SCORE_HEADROOM);
    expect(r.maxScorePerSecond).toBe(Math.ceil(Math.max((2156 / 72) * RATE_HEADROOM, (2156 * SCORE_HEADROOM) / 72) * 100) / 100);
    expect(r.minDurationMs).toBe(18_000);                       // 72 s ÷ 4
    expect(r.maxDurationMs).toBe(MAX_DURATION_FLOOR_MS);        // 72 × 4 s is under the floor
  });

  it('an upper bound is never a shortest length or a pace; with no measured length only the floors apply', () => {
    const r = deriveRule('football', [run(395, 60, 'upper')])!;
    expect(r.minDurationMs).toBe(MIN_DURATION_FLOOR_MS);
    expect(r.maxScorePerSecond).toBe((395 * SCORE_HEADROOM) / (MIN_DURATION_FLOOR_MS / 1000));
    expect(r.maxDurationMs).toBe(MAX_DURATION_FLOOR_MS);
  });

  it('no runs, or a measured-cap mode whose runs carry no score: no rule (fail closed)', () => {
    expect(deriveRule('surfing', [])).toBeNull();
    expect(deriveRule('karateEndless', [run(null, 60, 'upper')])).toBeNull();
    // a rules mode with an unscored run still has its exact maximum
    expect(deriveRule('soccer', [run(null, 60, 'upper')], { killSwitch: false })).toMatchObject({ maxScoreFrom: 'rules', maxScore: 6660 });
  });

  it('music free play is endless: never capped at the Arena set\'s maximum', () => {
    expect(rulesMaxFor('music', { killSwitch: false })).toBeNull();
    expect(rulesMaxFor('karateEndless', { killSwitch: false })).toBeNull();
  });

  it('under the kill switch a mode whose fallback game scores differently loses its rules maximum (sessionScoreCap\'s rule)', () => {
    expect(rulesMaxFor('dunkContest', { killSwitch: true })).toBeNull();
    expect(rulesMaxFor('brainBrawl', { killSwitch: true })).toBe(4500);   // no fallback swap
  });
});

describe('MODE_SCORE_RULES: every row comes from measured TRUE :3000 runs', () => {
  it('each row is exactly what deriveRule makes of its runs, or derivedRule of its derived bound (no hand-tuned number)', () => {
    const derived = derivedBounds();
    for (const [mode, rule] of Object.entries(MODE_SCORE_RULES)) {
      if (rule.maxScoreFrom === 'derived') expect(rule, mode).toEqual(derivedRule(derived[mode]));
      else expect(rule, mode).toEqual(deriveRule(mode, MEASURED_RUNS[mode]));
    }
    // karateEndless and music keep derived rows; measured runs document their pace but derived wins the ceiling
    expect(Object.keys(MEASURED_RUNS).filter((m) => m in derived).sort()).toEqual(['karateEndless', 'music']);
  });

  it('each row names at least one run, each run names its capture', () => {
    for (const [mode, runs] of Object.entries(MEASURED_RUNS)) {
      expect(runs.length, mode).toBeGreaterThan(0);
      for (const r of runs) expect(r.source, mode).toMatch(/\S{6,}/);
    }
  });

  it('every measured run is inside its own rule (at the length it was measured, where that is a length)', () => {
    for (const [mode, runs] of Object.entries(MEASURED_RUNS)) {
      for (const r of runs) {
        if (r.score === null) continue;
        const sec = r.sec !== null && (r.secIs === 'posted' || r.secIs === 'play') ? r.sec : 60;
        expect(checkRunScore({ mode, score: r.score, durationMs: sec * 1000 }), `${mode} ${r.score}/${sec}s`).toMatchObject({ ok: true });
      }
    }
  });

  it('the keys are session keys the catalogue knows', () => {
    for (const mode of Object.keys(MEASURED_RUNS)) expect(Object.prototype.hasOwnProperty.call(MODE_INFO, mode), mode).toBe(true);
  });

  it('where the captures are on this machine, every cited file exists', () => {
    const outbox = join(homedir(), 'Claude', 'outbox');
    if (!existsSync(outbox)) return;                             // CI: the captures live on the owner's machine
    for (const runs of Object.values(MEASURED_RUNS)) {
      for (const r of runs) {
        const file = r.source.split(/[ :]/)[0];
        expect(existsSync(join(outbox, file)), r.source).toBe(true);
      }
    }
  });
});

/**
 * THE CROSS-CHECK. Real runs of current builds seen on ports other than :3000 (dev lanes, the rc probes), from the same
 * sweep of ~/Claude/outbox. They are not a source of any rule; they are why no rule may be tighter than real play.
 * `sec` is the PLAYED length (the strictest case: the server's clock adds loading and the countdown on top). The
 * gauntlet ran at qaSpeed 4, so its lengths here are game time (wall × 4).
 */
const SEEN_ELSEWHERE: ReadonlyArray<{ mode: string; score: number; sec: number | null; where: string }> = [
  { mode: 'brainBrawl', score: 878, sec: 26, where: ':3099 game-shell-3parts/bb/summary.json (won 5/5)' },
  { mode: 'brainBrawl', score: 870, sec: 29, where: ':3099 game-shell-3parts/bb/summary.json' },
  { mode: 'brainBrawl', score: 1405, sec: 52, where: ':3131 BRAINBRAWL-MAJOR-shots (2-player duel)' },
  { mode: 'brainBrawl', score: 564, sec: 37, where: ':3011 BRAINBRAWL-RESIDUAL.md' },
  { mode: 'snowboarding', score: 2600, sec: 73.6, where: ':3131 GATE-CRASHER-MAJOR-shots/before/summary-race.json' },
  { mode: 'snowboarding', score: 2550, sec: 59, where: ':3131 GATE-CRASHER-MAJOR-shots/after/summary-race.json' },
  { mode: 'freerun', score: 2767, sec: 21, where: 'racing lane r10-final (intent win)' },
  { mode: 'freerun', score: 2109, sec: 20, where: 'finish-release/mechanics (rc)' },
  { mode: 'football', score: 400, sec: 27, where: 'finish-release/mechanics (rc)' },
  { mode: 'football', score: 580, sec: null, where: 'FOOTBALL-A-PLUS-P0.md:47 (dev)' },
  { mode: 'dunkContest', score: 153, sec: null, where: ':3041 TRY-ONBOARD-DUNK-APLUS.md:64' },
  { mode: 'dunkContest', score: 143, sec: null, where: ':3050 DUNK-SOFT-OPEN-s50.md' },
  { mode: 'whoSceneIt', score: 758, sec: 31, where: 'finish-release/mechanics (rc)' },
  { mode: 'bigAir', score: 651, sec: 32, where: 'rc gauntlet (8 s wall at qaSpeed 4)' },
  { mode: 'soccer', score: 184, sec: 29, where: 'finish-release/mechanics-rc9.json (SHOOTOUT_WIN)' },
  { mode: 'dance', score: 1450, sec: null, where: 'finish-release/mechanics (partial at 31 s)' },
  { mode: 'baseball', score: 261, sec: null, where: 'finish-release/mechanics (partial at 31 s)' },
];

describe('the cross-check: no real run seen anywhere is refused', () => {
  it('every one passes its mode\'s rule at its played length (60 s where the length was not recorded)', () => {
    for (const s of SEEN_ELSEWHERE) {
      const r = checkRunScore({ mode: s.mode, score: s.score, durationMs: (s.sec ?? 60) * 1000 });
      expect(r, `${s.mode} ${s.score} in ${s.sec ?? '?'} s — ${s.where}`).toMatchObject({ ok: true });
    }
  });

  it('RATE_HEADROOM is the smallest whole multiple that keeps them in: FreeRun\'s 2,767 in 21 s is 5.2× the :3000 run\'s pace', () => {
    const measuredPace = 695 / 27.2;
    expect(2767 / 21 / measuredPace).toBeGreaterThan(RATE_HEADROOM - 1);
    expect(2767 / 21 / measuredPace).toBeLessThan(RATE_HEADROOM);
  });
});

describe('checkRunScore: every refusal is SCORE_INVALID with the rule it broke', () => {
  const rules = { m: deriveRule('snowboarding', [run(250, 100)])! };
  const ok = (score: unknown, sec: number) => checkRunScore({ mode: 'm', score, durationMs: sec * 1000 }, rules);
  it('the order: rule, enabled, integer, sign, ceiling, length, pace', () => {
    expect(checkRunScore({ mode: 'notAMode', score: 1, durationMs: 60_000 }, rules)).toMatchObject({ ok: false, reason: 'SCORE_INVALID', detail: 'unknown_mode' });
    expect(checkRunScore({ mode: 'surfing', score: 1, durationMs: 60_000 }, rules)).toMatchObject({ detail: 'no_rules' });
    expect(checkRunScore({ mode: 'm', score: 1, durationMs: 60_000 }, { m: { ...rules.m, enabled: false } })).toMatchObject({ detail: 'mode_disabled' });
    for (const bad of [1.5, '10', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, [10], { n: 10 }]) expect(ok(bad, 60), String(bad)).toMatchObject({ detail: 'score_not_integer' });
    expect(ok(-1, 60)).toMatchObject({ detail: 'score_negative', limit: 0 });
    expect(ok(1001, 60)).toMatchObject({ detail: 'above_max_score', limit: 1000 });
    expect(ok(10, 24)).toMatchObject({ detail: 'too_short', limit: 25_000 });
    expect(ok(10, 46 * 60)).toMatchObject({ detail: 'too_long', limit: MAX_DURATION_FLOOR_MS });
    expect(ok(1000, 30)).toMatchObject({ detail: 'above_max_rate' });
    expect(ok(1000, 101)).toMatchObject({ ok: true, score: 1000 });
    expect(ok(0, 30)).toMatchObject({ ok: true, score: 0 });
  });
});

describe('fail closed: the session keys with no measured TRUE :3000 run pay nothing until one is measured', () => {
  it('the list, pinned (measuring a mode moves it out of here and into MEASURED_RUNS)', () => {
    // OWNER DECISION (2026-09-28): the endless four and the four that should pay have derived rows now; a result in any
    // mode still listed here is RECORDED unpaid (NO_RULES), not refused
    const keys = sessionKeys();
    expect(keys.length).toBeGreaterThanOrEqual(34);
    expect(unmeasuredModes(keys)).toEqual([
      'duel', 'hoops3v3', 'mixedcombat', 'showdown', 'sprint',
    ]);
    const ruled = keys.filter((k) => !unmeasuredModes([k]).length);
    expect(ruled).toContain('tiebreak');
    expect(ruled).toContain('training');
    expect(ruled).toContain('velocityKart');
    expect(ruled).toContain('skateboarding');
    expect(MODE_SCORE_RULES.tiebreak.maxScoreFrom).toBe('rules');
    expect(MODE_SCORE_RULES.training.maxScoreFrom).toBe('rules');
    expect(MODE_SCORE_RULES.velocityKart.maxScoreFrom).toBe('measured');
  });
});

describe('OWNER DECISION (2026-09-28): derived per-run bounds', () => {
  const b = derivedBounds({ killSwitch: false });
  it('the endless combo modes still on derived bounds: karateEndless and music', () => {
    expect(b.karateEndless.maxScore).toBe(136_807_600);
    expect(b.music.maxScore).toBe(SCORE_COLUMN_MAX);
    for (const m of ['karateEndless', 'music']) expect(b[m].maxScore, m).toBeLessThanOrEqual(SCORE_COLUMN_MAX);
    expect(b.skateboarding).toBeUndefined();
    expect(b.surfing).toBeUndefined();
  });

  it('the four that should pay, from their own code', () => {
    expect(b.acting.maxScore).toBe(100);
    expect(b.irl.maxScore).toBe(177);                                   // g × 1.2² / 8 = 1.77 m
    expect(storyBossBound()).toBe(950);
    expect(storyRailBound()).toBe(2196);
    expect(b.storyMode.maxScore).toBe(2196);
    // owner 2026-10-06 (moderate): the longest match (5 each) plus the dunk-off's 3 rounds — the duel reports real totals
    expect(dunkDuelBound()).toBe((5 + 3) * DUNK_ATTEMPT_MAX);
    expect(b.dunkduel.maxScore).toBe(dunkDuelBound());
    expect(b.dunkduel.payFloorOnly).toBe(true);
    expect(Object.entries(b).filter(([, v]) => v.payFloorOnly).map(([k]) => k)).toEqual(['dunkduel']);
  });

  it('under the kill switch a modelled bound whose game swaps falls back to the column limit', () => {
    const ks = derivedBounds({ killSwitch: true });
    expect(ks.karateEndless.maxScore).toBe(SCORE_COLUMN_MAX);
    expect(ks.acting.maxScore).toBe(100);
  });

  it('a derived row: pace = the bound over its modelled run (else the shortest run), the duration floors, no measured runs', () => {
    expect(derivedRule(b.karateEndless)).toMatchObject({ maxScoreFrom: 'derived', minDurationMs: MIN_DURATION_FLOOR_MS, maxDurationMs: MAX_DURATION_FLOOR_MS, measured: [] });
    expect(derivedRule(b.acting).maxScorePerSecond).toBe(50);
    // skateboarding now uses MEASURED_RUNS (ECONOMY-CAPS a); a real strong run is inside
    expect(checkRunScore({ mode: 'skateboarding', score: 1649, durationMs: 94_000 })).toMatchObject({ ok: true });
  });

  it('the EXPORTED table carries Prove It\'s played-floor flag, and only Prove It\'s (review: dropping it in derivedRule paid Prove It in full, every test green)', () => {
    // the route reads the flag off the real row (app/api/sessions/route.ts floorOnly), not off derivedBounds()
    expect(derivedRule(b.dunkduel).payFloorOnly).toBe(true);
    expect(MODE_SCORE_RULES.dunkduel).toMatchObject({ maxScoreFrom: 'derived', maxScore: dunkDuelBound(), payFloorOnly: true });
    expect(Object.entries(MODE_SCORE_RULES).filter(([, r]) => r.payFloorOnly).map(([k]) => k)).toEqual(['dunkduel']);
    expect(checkRunScore({ mode: 'dunkduel', score: 96, durationMs: 60_000 })).toMatchObject({ ok: true, rule: { payFloorOnly: true } });
    // a perfect 5-dunk match, reported unscaled (5 × the panel's 50), is inside the bound; one past the bound is not
    expect(checkRunScore({ mode: 'dunkduel', score: 250, durationMs: 5 * 60_000 })).toMatchObject({ ok: true });
    expect(checkRunScore({ mode: 'dunkduel', score: dunkDuelBound() + 1, durationMs: 5 * 60_000 })).toMatchObject({ ok: false, detail: 'above_max_score' });
  });

  it('DRIFT: the story, acting and Prove It constants are still what their code says', () => {
    const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
    const boss = src('components/games/glitch-boss-game.tsx');
    expect(boss).toContain(`bHp: ${STORY_MIRRORED.bossHp},`);
    expect(boss).toContain(`hp: ${STORY_MIRRORED.bossPlayerHp},`);
    expect(boss).toContain(`st.score += dmg * ${STORY_MIRRORED.bossPtsPerDmg};`);
    expect(boss).toContain(`Math.round(st.hp * ${STORY_MIRRORED.bossWinHpMult})`);
    expect(Math.max(...[...boss.matchAll(/hitBoss\((\d+)\)/g)].map((m) => Number(m[1])))).toBe(STORY_MIRRORED.bossMaxHit);
    const rail = src('components/games/rail-grind-game.tsx');
    expect(rail).toContain(`const TARGET_DIST = ${STORY_MIRRORED.railTargetDist};`);
    expect(rail).toContain(`st.speed = (${STORY_MIRRORED.railBaseSpeed} + st.dist * 0.02) * speedMult;`);
    expect(rail).toContain(`st.orbT = ${STORY_MIRRORED.railOrbEverySec} + Math.random() * 0.4;`);
    expect(rail).toContain(`const pts = o.type === 'shard' ? ${STORY_MIRRORED.railOrbMaxPts} : 20;`);
    expect(rail).toContain(`if (st.airTime > ${STORY_MIRRORED.railMinAirSec}) {`);
    expect(rail).toContain(`const pts = Math.round(${STORY_MIRRORED.railLandBase} * (1 + st.combo * ${STORY_MIRRORED.railLandComboStep}));`);
    expect(rail).toContain(`Math.round(st.hp * ${STORY_MIRRORED.railFinishHpMult})`);
    expect(rail).toContain(`hp: ${STORY_MIRRORED.railPlayerHp},`);
    // the slowest grade (lib/prq.ts prqGrade)
    const speedMults = [...src('lib/prq.ts').matchAll(/speedMult: ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...speedMults)).toBe(STORY_MIRRORED.railMinSpeedMult);
    expect(src('components/games/acting-game.tsx')).toContain('score: Math.round(res.average * 100),');
    expect(src('lib/babylon/core/ActingCore.ts')).toContain('const adjusted = clamp01(average * coverage);');
    // owner 2026-10-06: the bound mirrors the duel's longest match and its dunk-off rounds (dunkDuelRules), and the mode
    // reports its real totals (no scaling left)
    const rules = src('lib/babylon/modes/dunkDuelRules.ts');
    const lengths = rules.match(/export const MATCH_LENGTHS: readonly number\[\] = \[([\d, ]+)\];/);
    expect(lengths, 'MATCH_LENGTHS').not.toBeNull();
    expect(Math.max(...lengths![1].split(',').map(Number))).toBe(STORY_MIRRORED.dunkDuelMaxDunksEach);
    expect(rules).toContain(`export const DUNKOFF_MAX_ROUNDS = ${STORY_MIRRORED.dunkDuelDunkOffRounds};`);
    const duel = src('lib/babylon/modes/DunkDuelMode.ts');
    expect(duel).not.toMatch(/reportedScore\(/);
    expect(duel).toContain('Math.max(totals[0], totals[1]), { p1: totals[0], p2: totals[1],');
  });
});

describe('OWNER DECISION: a result in a mode with no row is recorded unpaid — after these checks', () => {
  it('a storable whole number, not negative', () => {
    expect(checkUnruledScore(12)).toEqual({ ok: true, score: 12 });
    expect(checkUnruledScore(0)).toEqual({ ok: true, score: 0 });
    for (const bad of [1.5, '10', null, Number.NaN]) expect(checkUnruledScore(bad), String(bad)).toMatchObject({ ok: false, detail: 'score_not_integer' });
    expect(checkUnruledScore(-1)).toMatchObject({ ok: false, detail: 'score_negative' });
    expect(checkUnruledScore(SCORE_COLUMN_MAX + 1)).toMatchObject({ ok: false, detail: 'above_max_score', limit: SCORE_COLUMN_MAX });
  });
});
