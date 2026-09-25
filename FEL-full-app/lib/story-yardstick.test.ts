// EVERY STORY NODE ASKS FOR SOMETHING ITS MODE CAN POST.
//
// HOTFIX (2026-09-24): the campaign's first node sent a player to Ones (first to 11) with a target of 400, and the
// Sand Pit, the Golf Green, the Pitch and the Tennis Court asked more than their modes can ever post. Nothing
// failed: the only test checked that a route existed. Two halves here:
//
//   1. Each STORY_YARDSTICKS line is re-derived from its mode's own code. Where the rules live in a pure core
//      (RallyCore's scorers, ShootoutCore, FreeRunCore, the derby's wall), the test RUNS them; where a number is
//      inline in a Babylon mode (which vitest cannot load cheaply), it is pinned from the comment-stripped source,
//      so a retune of the mode fails here and asks for the yardstick to move with it.
//   2. All 52 nodes are held under their mode's yardstick: a win only where the mode posts one, and never a
//      score above the mode's reach or its rules' ceiling.
//
// HOTFIX (2026-09-24): and a rule path to a win is not a player beating the AI. A bare "win it" boss needs its mode's
// winEvidence (solo against the course, or a run on record winning it); a boss without it must also take an
// `orScore` — and that score must be one a LOST session can post, or the fallback is no way through at all. The
// win verdicts themselves are called, not pinned: the timing host's mapping is timingWon (components/games).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAMPAIGN, getAllNodes } from './story-data';
import { storySessionMode } from './progression';
import { STORY_YARDSTICKS, storyGoalLabel, storyModeLabel, yardstickFor } from './story-yardstick';
import { MODE_INFO } from './game-data';
import { TennisScore, VolleyScore } from './babylon/core/RallyCore';
import { shootoutState, REGULATION_KICKS } from './babylon/core/ShootoutCore';
import { TIERS, runGrade } from './babylon/core/FreeRunCore';
import { TARGETS, predictWallCross, robRead, targetHit, verdictFor, PARK } from './babylon/core/ParkourDerby';
import { SCALES } from './babylon/core/scoreScale';
import { stripComments } from './testing/sourceScan';
import { timingWon } from '../components/games/timing-won';

const ROOT = join(__dirname, '..');
const src = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));
/** One number out of a source line, or a loud failure naming what moved. */
function pin(rel: string, re: RegExp): number {
  const m = src(rel).match(re);
  if (!m) throw new Error(`${rel} no longer matches ${re} — re-derive its story yardstick`);
  return Number(m[1]);
}
const has = (rel: string, needle: string) => expect(src(rel), `${rel} should contain: ${needle}`).toContain(needle);

describe('each yardstick is what its mode actually posts', () => {
  it('Ones: first to 11 in 2s and 3s — a win posts 11 to 13', () => {
    const m = 'lib/babylon/modes/OneVOneMode.ts';
    const target = pin(m, /const TARGET_SCORE = (\d+);/);
    has(m, 'arcPoints = isThree(me.root.position, RIM) ? 3 : 2;');
    has(m, "if (myScore >= TARGET_SCORE) { ended = true; micFinal(true); SoundKit.play('whistle'); ctx.end('WIN', myScore");
    has('components/games/basketball-babylon.tsx', "const won = r.outcome === 'WIN';");
    expect(STORY_YARDSTICKS.hoops1v1).toMatchObject({ postsWin: true, reach: target, ceiling: target - 1 + 3 });
  });

  it('Beach Rally: a set to 25 (win by 2, cap 30) posts your points — run on RallyCore', () => {
    has('lib/babylon/modes/NetSportMode.ts', "volleyScore = o.scoring === 'volley' ? new VolleyScore(25) : null;");
    const won = new VolleyScore(25);
    let r: string = 'point';
    while (r !== 'set') r = won.award(0);
    expect(won.points[0]).toBe(STORY_YARDSTICKS.volleyball.reach);
    // the longest set there is: level all the way to the cap, which ends it
    const capped = new VolleyScore(25);
    let last: string = 'point';
    while (last !== 'set') { last = capped.award(1); if (last === 'set') break; last = capped.award(0); }
    expect(Math.max(...capped.points)).toBe(STORY_YARDSTICKS.volleyball.ceiling);
    // the set's end posts WIN or LOSS by side, and the timing host calls a WIN a win
    expect(src('lib/babylon/modes/NetSportMode.ts')).toMatch(/ctx\.end\(\s*side === 0 \? 'WIN' : 'LOSS',\s*mine,/);
    has('components/games/timing-babylon.tsx', 'const won = timingWon(r.outcome, st);');
    expect([timingWon('WIN', {}), timingWon('LOSS', {})]).toEqual([true, false]);
    expect(STORY_YARDSTICKS.volleyball.postsWin).toBe(true);
  });

  it('Match Point: first to 4 games posts the games you took — run on RallyCore', () => {
    has('lib/babylon/modes/NetSportMode.ts', "tennisScore = o.scoring === 'tennis' ? new TennisScore(4) : null;");
    const t = new TennisScore(4);
    let r: string = 'point';
    while (r !== 'match') r = t.award(0);
    expect(t.games[0]).toBe(STORY_YARDSTICKS.tennis.reach);
    expect(STORY_YARDSTICKS.tennis.ceiling).toBe(t.gamesToWin);
    expect(STORY_YARDSTICKS.tennis.unit).toEqual(['game', 'games']);
    // the match's end and the racket break both post WIN — which the timing host reads as a win
    has('lib/babylon/modes/NetSportMode.ts', "ctx.end('WIN', tennisScore ? tennisScore.games[0] : 0, { rackets: rackets[0] });");
    expect(timingWon('WIN', { rackets: 1 })).toBe(true);
    expect(STORY_YARDSTICKS.tennis.postsWin).toBe(true);
  });

  it('The Hundred: measured, and endless — it never posts a win', () => {
    expect(SCALES.karateEndless.basis).toContain('scored 1250');
    expect(STORY_YARDSTICKS.karateEndless).toMatchObject({ reach: 1250, postsWin: false });
    has('components/games/karate-babylon.tsx', 'won: false,');
  });

  it('Venice Lines and The Break: the reach is the score the run is won on', () => {
    const skate = pin('lib/babylon/modes/SkateRunMode.ts', /const SKATE_WIN_SCORE = (\d+);/);
    has('lib/babylon/modes/SkateRunMode.ts', 'const won = finalScore >= SKATE_WIN_SCORE;');
    expect(STORY_YARDSTICKS.skateboarding).toMatchObject({ reach: skate, postsWin: true });
    const surf = pin('lib/babylon/modes/SurfBreakMode.ts', /const SURF_WIN_SCORE = (\d+);/);
    has('lib/babylon/modes/SurfBreakMode.ts', 'const won = barrels >= 1 || tricks.score >= SURF_WIN_SCORE;');
    expect(STORY_YARDSTICKS.surfing).toMatchObject({ reach: surf, postsWin: true });
  });

  it('Gate Crasher: half the gates at 100 a gate', () => {
    const gates = pin('lib/babylon/modes/rideWorlds.ts', /export const SLALOM_GATES = (\d+);/);
    const share = pin('lib/babylon/modes/SnowboardSlalomMode.ts', /const GATE_CRASHER_SHARE = ([\d.]+);/);
    has('lib/babylon/modes/SnowboardSlalomMode.ts', 'gatesHit++;\n            tricks.score += 100;');
    expect(STORY_YARDSTICKS.snowboarding.reach).toBe(Math.ceil(gates * share) * 100);
  });

  it('The Loop: a par card posts 420 (par 3-4-3, the last hole ×1.5) and par or better wins', () => {
    const m = 'lib/babylon/modes/precisionModes.ts';
    const par = src(m).match(/export const GOLF_PAR = \[([\d, ]+)\] as const;/);
    expect(par).not.toBeNull();
    const pars = par![1].split(',').map(Number);
    const clutch = pin(m, /const CLUTCH_MULT = ([\d.]+);/);
    has(m, 'const gained = Math.round(Math.max(20, 120 - rel * 40) * (clutch ? CLUTCH_MULT : 1));');
    has(m, 'const clutch = round === TOTAL;');
    const parCard = pars.reduce((sum, _p, i) => sum + Math.round(Math.max(20, 120 - 0 * 40) * (i === pars.length - 1 ? clutch : 1)), 0);
    expect(STORY_YARDSTICKS.golf.reach).toBe(parCard);
    has(m, "ctx.end('CARD_IN', pts, { holes: TOTAL, overPar, pickUps });");
    expect([timingWon('CARD_IN', { overPar: 0 }), timingWon('CARD_IN', { overPar: -1 }), timingWon('CARD_IN', { overPar: 1 })])
      .toEqual([true, true, false]);
  });

  it('Moonshot Derby: a pure, square swing is an unrobbable homer worth 107 — flown on the wall\'s own reads', () => {
    const m = 'lib/babylon/modes/precisionModes.ts';
    has(m, 'const launch = Math.max(0.1, Math.min(0.9, 0.45 - meet * 1.1));');
    has(m, 'flight.launch(ball.position, new Vector3(vx, (18 * launch * q + 4) * ks.exitMult, (16 + q * 18) * ks.exitMult));');
    has(m, 'const distPts = Math.round(q * (80 + launch * 60) * (clutch ? CLUTCH_MULT : 1));');
    has(m, 'flight = new Flight(ball, -6);');
    expect(PARK.g).toBe(6);
    const q = 1, launch = 0.45;   // perfect timing, the PCI dead on the ball: the swing the mode calls pure
    for (const y of [0.5, 1, 1.5]) for (const vx of [-1, 0, 1]) {   // the pitch's height; the swing's own ±1 m/s scatter
      const cross = predictWallCross({ x: vx, y: 18 * launch * q + 4, z: 16 + q * 18 }, { x: 0, y, z: 0.3 });
      expect(cross).not.toBeNull();
      const rob = PARK.fielderBearings.map((b) => robRead(b, cross!)).find((r) => r) ?? null;
      expect(verdictFor(cross, targetHit(cross!, TARGETS), rob)).toBe('homer');
    }
    const homer = Math.round(q * (80 + launch * 60));
    expect([timingWon('DERBY_END', { homers: 3 }), timingWon('DERBY_END', { homers: 2 })]).toEqual([true, false]);
    expect(STORY_YARDSTICKS.baseball).toMatchObject({ reach: 3 * homer, postsWin: true });
  });

  it('Breakaway: three drives, a touchdown pays 100 or more — and no football session is ever a win', () => {
    const m = 'lib/babylon/modes/FootballRushMode.ts';
    const drives = pin(m, /const DRIVES = (\d+);/);
    has(m, 'score += Math.round((100 + evades * 10) * mult);');
    expect(STORY_YARDSTICKS.football.reach).toBe(drives * 100);
    // the host waits for an outcome the mode never sends — so a win is not something a football node can ask for
    has('components/games/football-babylon.tsx', "const won = r.outcome === 'TOUCHDOWN';");
    expect(src(m)).not.toMatch(/ctx\.end\(\s*'TOUCHDOWN'/);
    expect(STORY_YARDSTICKS.football.postsWin).toBe(false);
  });

  it('Twelve Yards: 20 a goal, and ShootoutCore always gives you three kicks — run on the core', () => {
    has('lib/babylon/modes/precisionModes.ts', "ctx.end(won ? 'SHOOTOUT_WIN' : 'SHOOTOUT_LOSS', goals * 20 + stylePts,");
    expect(REGULATION_KICKS).toBeGreaterThanOrEqual(3);
    // before your third kick you have scored two: nothing the rival does can have ended it, either way round
    for (let themKicks = 2; themKicks <= 3; themKicks++) for (let themGoals = 0; themGoals <= themKicks; themGoals++) {
      expect(shootoutState(2, themGoals, 2, themKicks).phase).not.toBe('decided');
    }
    expect([timingWon('SHOOTOUT_WIN', {}), timingWon('SHOOTOUT_LOSS', {})]).toEqual([true, false]);
    expect(STORY_YARDSTICKS.soccer).toMatchObject({ reach: 3 * 20, postsWin: true });
  });

  it('Iron Paradise: won at WIN_SCORE in its 60 s round', () => {
    const w = pin('components/games/training-game.tsx', /const WIN_SCORE = (\d+);/);
    has('components/games/training-game.tsx', 'const won = score >= WIN_SCORE;');
    expect(STORY_YARDSTICKS.training).toMatchObject({ reach: w, postsWin: true });
  });

  it('Free Run: the rookie course (the default) bars at par time with a modest line, and grades it — run on FreeRunCore', () => {
    has('lib/babylon/core/FreeRunCore.ts', 'const bar = tier.parSec * 40;');
    has('lib/babylon/modes/FreeRunMode.ts', 'tier: tierById(q ? Number(q) : 1),');
    const rookie = TIERS[0];
    expect(rookie.id).toBe(1);
    expect(STORY_YARDSTICKS.freerun.reach).toBe(rookie.parSec * 40);
    expect(runGrade(STORY_YARDSTICKS.freerun.reach, rookie)).toBe('B');
    has('components/games/freerun-babylon.tsx', "const won = r.outcome === 'win';");
  });
});

describe('every one of the 52 nodes is reachable in its own mode', () => {
  const nodes = getAllNodes();

  it('every node\'s mode has a yardstick, and every yardstick is a mode the campaign plays', () => {
    const modes = new Set(nodes.map((n) => storySessionMode(n)));
    expect([...modes].filter((m) => !yardstickFor(m))).toEqual([]);
    expect(Object.keys(STORY_YARDSTICKS).filter((m) => !modes.has(m))).toEqual([]);
  });

  it('a node asks for a win only where the mode posts one — and then asks for nothing else', () => {
    const bad = nodes.filter((n) => n.mustWin && (!yardstickFor(storySessionMode(n))!.postsWin || n.targetScore !== 0));
    expect(bad.map((n) => n.id)).toEqual([]);
  });

  it('no node asks for a score above its mode\'s reach, or above what its rules can post', () => {
    const over = nodes.flatMap((n) => {
      const y = yardstickFor(storySessionMode(n))!;
      const cap = Math.min(y.reach, y.ceiling ?? Infinity);
      return n.targetScore > cap ? [`${n.id}: asks ${n.targetScore}, ${storySessionMode(n)} reaches ${cap}`] : [];
    });
    expect(over).toEqual([]);
  });

  it('every zone climbs: the rails rise, and a score boss (or a win boss\'s fallback score) is the top of them', () => {
    for (const z of CAMPAIGN.zones) {
      const [a, b, c] = z.rail.map((r) => r.targetScore);
      expect(a > 0 && a < b && b < c, `${z.id} rails ${a}/${b}/${c}`).toBe(true);
      if (!z.boss.mustWin) expect(z.boss.targetScore, `${z.id} boss`).toBeGreaterThan(c);
      if (z.boss.orScore !== undefined) expect(z.boss.orScore, `${z.id} boss orScore`).toBeGreaterThan(c);
    }
  });
});

describe('a win boss is a win a player can get — or it takes a score too', () => {
  const nodes = getAllNodes();
  const bosses = nodes.filter((n) => n.mustWin);

  it('a bare win boss only where the win is against the course or on record', () => {
    const bare = bosses.filter((n) => n.orScore === undefined && !yardstickFor(storySessionMode(n))!.winEvidence);
    expect(bare.map((n) => `${n.id} (${storySessionMode(n)})`)).toEqual([]);
  });

  it('a fallback score sits on a win boss only, on the mode\'s line', () => {
    const stray = nodes.filter((n) => n.orScore !== undefined && !n.mustWin);
    expect(stray.map((n) => n.id)).toEqual([]);
    for (const n of bosses.filter((b) => b.orScore !== undefined)) {
      const y = yardstickFor(storySessionMode(n))!;
      expect(n.orScore!, n.id).toBeLessThanOrEqual(Math.min(y.reach, y.ceiling ?? Infinity));
    }
  });

  it('the three fallbacks are scores a LOST session can post — run on the rules', () => {
    const n = (id: string) => nodes.find((x) => x.id === id)!;
    expect([n('blacktop.boss'), n('sandPit.boss'), n('pitch.boss')].map((b) => b.orScore)).toEqual([10, 22, 60]);
    // Ones: the rival reaches 11 first, so a loss posts at most 10
    const target = pin('lib/babylon/modes/OneVOneMode.ts', /const TARGET_SCORE = (\d+);/);
    has('lib/babylon/modes/OneVOneMode.ts', "if (foeScore >= TARGET_SCORE) { ended = true; micFinal(false); SoundKit.play('whistle'); ctx.end('LOSS', myScore");
    expect(n('blacktop.boss').orScore).toBeLessThanOrEqual(target - 1);
    // Beach Rally: a set lost 22–25 posts 22
    const v = new VolleyScore(25);
    for (let i = 0; i < 22; i++) v.award(0);
    let end: string = 'point';
    while (end !== 'set') end = v.award(1);
    expect(v.points).toEqual([22, 25]);
    expect(v.points[0]).toBeGreaterThanOrEqual(n('sandPit.boss').orScore!);
    // the shootout: lost 3–4 after five kicks each posts three goals — 60 before style
    expect(shootoutState(3, 4, REGULATION_KICKS, REGULATION_KICKS)).toEqual({ phase: 'decided', winner: 'them' });
    expect(3 * 20).toBeGreaterThanOrEqual(n('pitch.boss').orScore!);
  });
});

describe('what the node card says', () => {
  it('a goal in the mode\'s own unit, or the win', () => {
    const n = (id: string) => getAllNodes().find((x) => x.id === id)!;
    expect(storyGoalLabel('hoops1v1', n('blacktop.r1'))).toBe('Score 4 points');
    expect(storyGoalLabel('tennis', n('tennis.r1'))).toBe('Take 1 game');
    expect(storyGoalLabel('tennis', n('tennis.r2'))).toBe('Take 2 games');
    expect(storyGoalLabel('hoops1v1', n('blacktop.boss'))).toBe('Win the game — first to 11 (or score 10 points)');
    expect(storyGoalLabel('volleyball', n('sandPit.boss'))).toBe('Win the set (or score 22 points)');
    expect(storyGoalLabel('tennis', n('tennis.boss'))).toBe('Win the match — first to 4 games');
    expect(storyGoalLabel('karateEndless', n('dojo.boss'))).toBe('Score 1,120 points');
  });

  it('every zone names its mode the way the rest of the app does', () => {
    for (const z of CAMPAIGN.zones) {
      const mode = storySessionMode(z);
      expect(MODE_INFO[mode], `${z.id} → ${mode}`).toBeDefined();
      expect(storyModeLabel(mode)).toBe(MODE_INFO[mode].name);
    }
    expect(storyModeLabel('hoops1v1')).toBe('Ones');
  });
});
