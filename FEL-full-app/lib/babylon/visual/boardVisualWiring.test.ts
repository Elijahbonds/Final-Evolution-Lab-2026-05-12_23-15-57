// vis-board (wave 2) — the wiring guard. The board lane's visual modules are PRESENTATION: they take numbers a mode already computed
// (a banked line's points, a speed, a judge's read) and draw. None of them may import anything that scores, judges or decides —
// a replay that could change a result, or a decal that read a combo, would be a gameplay change in a visual pass.
//
// Also pinned here, because they are this lane's promises and are checked nowhere else:
//   · every mode that opts into replays gates them through ReplayGate (never replay the last moments before the end card);
//   · nothing in the lane's visual code names a tuned feel number's module (speed, timing windows, camera presets);
//   · a held (hoops) mode id never appears in the lane's files.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');   // FEL-full-app/
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const importsOf = (src: string): string[] => [...src.matchAll(/^\s*import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

const VISUAL_FILES = [
  'lib/babylon/modes/boardMoments.ts', 'lib/babylon/modes/boardMarks.ts',
  'lib/babylon/visual/boardStamp.ts', 'lib/babylon/visual/SnowSparkle.ts', 'lib/babylon/visual/GateFlash.ts', 'lib/babylon/visual/slopeLamps.ts',
  'lib/babylon/visual/warehouseDressing.ts', 'lib/babylon/visual/bigAirDressing.ts', 'lib/babylon/visual/SpinTrail.ts', 'lib/babylon/visual/ShockRing.ts',
  'lib/babylon/visual/freeRunDressing.ts', 'lib/babylon/visual/runnerPalette.ts', 'lib/babylon/visual/plazaCity.ts',
];
/** Modules that score, judge, grade, pay or tune: a presentation file importing one is wired into gameplay. */
const FORBIDDEN = /(?:^|\/)(?:skateScore|gateCrasher|surfBreak|SurfHeat|bigAirPlay|JudgePanel|ComboChain|ComboBreaker|BoardTricks|BoardMovement|BoardPhysics|FreeRunCore|FreeRunFlow|FreeRunRivals|FreeRunSplits|ParkGoals|MomentumBus|BoostKit|scoreScale|sessionResult|session-payout|CompetitionBridge|DifficultyL?|Difficulty|cameraPresets|CameraDirector|FOLLOW_PRESETS)(?:\.ts)?$/;

describe('the board lane\'s visual modules import nothing that scores, judges or tunes', () => {
  for (const f of VISUAL_FILES) {
    it(f, () => {
      const bad = importsOf(read(f)).filter((i) => FORBIDDEN.test(i));
      expect(bad, `${f} imports ${bad.join(', ')}`).toEqual([]);
    });
  }
  it('the guard itself catches a scoring import (mutation control)', () => {
    expect(importsOf("import { x } from '../modes/skateScore';\nimport y from './b';")).toEqual(['../modes/skateScore', './b']);
    expect(FORBIDDEN.test('../modes/skateScore')).toBe(true);
    expect(FORBIDDEN.test('../core/BoardTricks')).toBe(true);
    expect(FORBIDDEN.test('./boardStamp')).toBe(false);
    expect(FORBIDDEN.test('../core/CameraDirector')).toBe(true);
  });
});

describe('every replaying board mode gates it', () => {
  const MODES: [string, string][] = [
    ['skateboard', 'lib/babylon/modes/SkateRunMode.ts'], ['snowboard_slalom', 'lib/babylon/modes/SnowboardSlalomMode.ts'], ['surf', 'lib/babylon/modes/SurfBreakMode.ts'],
    ['bigair', 'lib/babylon/modes/AirSessionMode.ts'], ['freerun', 'lib/babylon/modes/FreeRunMode.ts'],
  ];
  for (const [id, file] of MODES) {
    it(`${id}: highlight() is only reached through ReplayGate.consider`, () => {
      const src = read(file);
      expect(src, 'opts into replays').toMatch(/replay: (?:true|opts\.broadcast\?\.replay)/);
      expect(src).toMatch(/new ReplayGate\(\)/);
      const calls = [...src.matchAll(/ctx\.highlight\?\.\(/g)].length;
      const gated = [...src.matchAll(/\.consider\(/g)].length;
      expect(calls).toBeGreaterThan(0);
      expect(gated).toBeGreaterThanOrEqual(calls > 0 ? 1 : 0);
      // each highlight call sits within a few lines after a consider() — never a bare replay on a mode event
      const lines = src.split('\n');
      lines.forEach((ln, i) => {
        if (!/ctx\.highlight\?\.\(/.test(ln)) return;
        const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
        expect(window, `${file}:${i + 1}`).toMatch(/consider\(|plan/);
      });
    });
  }
  it('no mode in the lane replays or shows an intro from its end() path', () => {
    for (const [, file] of MODES) {
      const src = read(file);
      for (const m of src.matchAll(/ctx\.end\([^)]*\)/g)) expect(m[0]).not.toMatch(/highlight/);
    }
  });
});

describe('replays run without the depth of field on the board modes (it flattens the frame)', () => {
  it('the harness honours replayDof: false', () => {
    const h = read('lib/babylon/core/ModeHarness.ts');
    expect(h).toMatch(/replayDof\?: boolean/);
    expect(h).toMatch(/def\.replayDof === false \? null : mountReplayDof\(/);
  });
  for (const f of ['SkateRunMode', 'SnowboardSlalomMode', 'SurfBreakMode', 'FreeRunMode']) {
    it(`${f} opts out`, () => { expect(read(`lib/babylon/modes/${f}.ts`)).toMatch(/replayDof: false,/); });
  }
  it('big air opts out whenever it replays', () => { expect(read('lib/babylon/modes/AirSessionMode.ts')).toMatch(/replayDof: opts\.broadcast\?\.replay \? false : undefined/); });
});

describe('the lane stays out of the held modes and the tuned numbers', () => {
  it('no visual file names a hoops mode', () => {
    for (const f of VISUAL_FILES) expect(read(f), f).not.toMatch(/'(?:dunk|dunkduel|onevone|threevthree|threepoint|carnival|basketball)'/);
  });
  it('the lane\'s mode edits leave the tuned constants alone (speed, tuning tables, camera presets are not assigned in the new code)', () => {
    for (const f of ['lib/babylon/modes/SkateRunMode.ts', 'lib/babylon/modes/SnowboardSlalomMode.ts', 'lib/babylon/modes/SurfBreakMode.ts']) {
      const src = read(f);
      for (const m of src.matchAll(/\/\/ vis-board[^\n]*\n([^\n]*)/g)) expect(m[1], f).not.toMatch(/maxSpeed\s*=|SNOW_TUNING|SKATE_TUNING\s*=|setPreset\(|FOLLOW_PRESETS/);
    }
  });
});

describe('every StandardMaterial that carries an emissive texture settles its emissive colour', () => {
  // A headless scene cannot paint a texture, so a unit test of the material would pass with the texture null. The source says it:
  // each `.emissiveTexture = <painted>` in these files is followed, on the same statement or the next, by settleEmissive(<that material>).
  for (const f of ['lib/babylon/visual/bigAirDressing.ts', 'lib/babylon/visual/freeRunDressing.ts']) {
    it(f, () => {
      const src = read(f);
      const sites = [...src.matchAll(/(\w+)\.emissiveTexture = [\w.]+;([^\n]*)/g)];
      expect(sites.length).toBeGreaterThan(0);
      for (const m of sites) expect(m[0], `${f}: ${m[0]}`).toContain(`settleEmissive(${m[1]})`);
    });
  }
  it('the check sees a missing call (mutation control)', () => {
    const sites = [...'ledM.emissiveTexture = tex; owned.push(tex);'.matchAll(/(\w+)\.emissiveTexture = [\w.]+;([^\n]*)/g)];
    expect(sites[0][0]).not.toContain('settleEmissive(ledM)');
  });
});

describe('the four board modes register their deck for the replay (a trick replay shows the flip)', () => {
  for (const f of ['SkateRunMode', 'SnowboardSlalomMode', 'SurfBreakMode', 'AirSessionMode']) {
    it(f, () => { expect(read(`lib/babylon/modes/${f}.ts`)).toMatch(/ctx\.trackReplay\?\.\((?:rig\.)?board\)/); });
  }
  it('and the harness hands every registered node to the director it builds after load()', () => {
    const src = read('lib/babylon/core/ModeHarness.ts');
    expect(src).toMatch(/trackReplay: \(node\) =>/);
    expect(src).toMatch(/for \(const n of replayTrack\) replay\?\.track\(n\)/);
  });
});
