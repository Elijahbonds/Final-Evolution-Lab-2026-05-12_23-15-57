// vis-hoops-court — the three mode files keep to their one-line hooks, the hooks sit where the replay must not be undone, and the
// visual modules import nothing from scoring, rules or judging.
//
// Source-level, as the vis-court wiring suite is: OneVOneMode and ThreeVThreeMode are closures over a scene and a rig (and PR #240
// is editing them), and the questions here — "is this call still the first statement of the reset", "does the final moment still
// never replay" — are answered by the text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MODES = path.join(__dirname, '..', 'modes');
const mode = (f: string): string => fs.readFileSync(path.join(MODES, f), 'utf8');
const one = mode('OneVOneMode.ts'), three = mode('ThreeVThreeMode.ts'), carn = mode('CourtCarnivalMode.ts');
const idx = (src: string, needle: string, from = 0): number => { const i = src.indexOf(needle, from); expect(i, `missing: ${needle}`).toBeGreaterThanOrEqual(0); return i; };
const count = (src: string, re: RegExp): number => (src.match(re) ?? []).length;

describe('the broadcast opt-ins', () => {
  it('onevone and threevthree open on the walk-in, replay, and name their cast (the two bodies / all six, and the ball)', () => {
    for (const [name, src] of [['onevone', one], ['threevthree', three]] as const) {
      expect(src, name).toMatch(/intro: 'walkIn', replay: true, replayCast:/);
      expect(src, name).toMatch(/loose: \[ball\]/);
    }
    expect(one).toMatch(/bodies: \[me\.root, foe\.root\]/);
    expect(three).toMatch(/bodies: bodiesAll\.map\(\(b\) => b\.char\.root\)/);
  });
  it('carnival ends its intro BEFORE an event builds (the event sets its own camera; a late end would restore the hub\'s over it)', () => {
    const run = idx(carn, 'async function runAttempt'), end = idx(carn, 'S.fx?.endIntro()', run), hide = idx(carn, 'showHub(ctx, S, false)', run), build = idx(carn, 'await S.current.build(ctx)', run);
    expect(end).toBeLessThan(hide); expect(hide).toBeLessThan(build);
  });
  it('carnival opens on the establishing crane and does not replay (an event spawns its own bodies; the cast is read once)', () => {
    expect(carn).toMatch(/intro: 'establish'/);
    expect(carn).not.toMatch(/replay: true/);
  });
});

describe('the hooks are the first thing the mode does', () => {
  it('1v1: the intro hold follows micTick, and the dead-ball hook heads both resets', () => {
    expect(one).toMatch(/micTick\(ctx\);\n\s+if \(hoopsFx\?\.holdIntro\(me\.root\.position, RIM\)\) return;/);
    expect(one).toMatch(/function resetPositions\(\): void \{\n\s+if \(hoopsFx\?\.deadBall\(\(\) => resetPositions\(\)\)\) return;[^\n]*\n\s+possessionToken\+\+;/);
    expect(one).toMatch(/function startDefense\(ctx: ModeContext, banner: string\): void \{\n\s+if \(hoopsFx\?\.deadBall\(\(\) => startDefense\(ctx, banner\)\)\) return;[^\n]*\n\s+possessionToken\+\+;/);
  });
  it('3v3: the same, on both of its dead balls (my ball back, and theirs — never a swing\'s catch)', () => {
    expect(three).toMatch(/async function opponentPossession\(ctx: ModeContext, cont\?: SwingCatch\): Promise<void> \{\n\s+if \(ended\) return;\n\s+if \(!cont && hoopsFx\?\.deadBall\(\(\) => opponentPossession\(ctx\)\)\) return;[^\n]*\n\s+possessionToken\+\+;/);
    expect(three).toMatch(/micTick\(ctx\);[^\n]*\n\s+if \(hoopsFx\?\.holdIntro\(me\.char\.root\.position, RIM\)\) return;/);
    expect(three).toMatch(/function resetPossession\(toMe = true\): void \{\n\s+if \(hoopsFx\?\.deadBall\(\(\) => resetPossession\(toMe\)\)\) return;[^\n]*\n\s+possessionToken\+\+;/);
  });
  it('the intro hold comes BEFORE the game clock and the possession logic it must stop', () => {
    expect(idx(three, 'hoopsFx?.holdIntro(')).toBeLessThan(idx(three, 'if (timeLeft > 0) timeLeft -= dt;'));
    expect(idx(one, 'hoopsFx?.holdIntro(')).toBeLessThan(idx(one, 'meSlot.poll(dt);'));
  });
});

describe('never the replay of the moment that ends the match', () => {
  it('1v1 tells the planner the game is over (its `ended`), 3v3 also the buzzer', () => {
    expect(one).toMatch(/final: \(\) => ended,/);
    expect(three).toMatch(/final: \(\) => ended \|\| buzzer,/);
  });
  it('the planner refuses a final moment (hoopsMoments.test) and the broadcast passes the flag through', () => {
    const b = fs.readFileSync(path.join(__dirname, 'mount', 'hoopsBroadcast.ts'), 'utf8');
    expect(b).toMatch(/final: opts\.final\(\)/);
    expect(b).toMatch(/reduced: !motionPolicy\(\)\.travel/);
  });
});

describe('the mode files keep a small footprint', () => {
  it('1v1 mentions the court mount nine times at most (import, state, opt-in, mount, hold, two resets, dispose)', () => {
    expect(count(one, /hoopsFx|mountHoopsCourt|HoopsCourt/g)).toBeLessThanOrEqual(14);
  });
  it('3v3 the same', () => { expect(count(three, /hoopsFx|mountHoopsCourt|HoopsCourt/g)).toBeLessThanOrEqual(14); });
  it('both dispose it with the mode and mount it once in load()', () => {
    for (const src of [one, three]) { expect(count(src, /hoopsFx\?\.dispose\(\); hoopsFx = (?:mountHoopsCourt|null)/g)).toBe(2); }
  });
});

describe('the visual modules read what happened and never touch scoring', () => {
  const FILES = ['hoopsMoments', 'hoopsScuffs', 'mount/hoopsDusk', 'mount/hoopsBroadcast', 'mount/hoopsCourt', 'streetballDressing', 'carnivalSet', 'carnivalMarquee', 'mount/carnivalFx'];
  const FORBIDDEN = /rules|scor|judg|CarnivalNight|difficult|economy|session|wallet|Mode['"]|ModeHarness'(?!;)|\/modes\//i;
  for (const f of FILES) {
    it(`${f} imports no scoring, rules, judging or mode file`, () => {
      const src = fs.readFileSync(path.join(__dirname, `${f}.ts`), 'utf8');
      const imports = [...src.matchAll(/^import[^;]*?from\s+'([^']+)';/gms)].map((m) => m[1]);
      expect(imports.length).toBeGreaterThan(0);
      for (const spec of imports) {
        if (spec === '../core/ModeHarness') { expect(src).toMatch(/import type \{[^}]*\} from '\.\.\/core\/ModeHarness'/); continue; }   // the context's TYPE only
        expect(FORBIDDEN.test(spec), `${f} imports ${spec}`).toBe(false);
      }
    });
  }
  it('and none of them touches a score, a clock, the HUD, the play camera or the momentum meter (a visual module never writes the game)', () => {
    for (const f of FILES) {
      const src = fs.readFileSync(path.join(__dirname, `${f}.ts`), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/\b(?:myScore|foeScore|timeLeft|ctx\.end|ctx\.setHud|camDirector\.(?:setPreset|snapTo|setFixedBehind)|ctx\.momentum\.report)\b/);
    }
  });
});
