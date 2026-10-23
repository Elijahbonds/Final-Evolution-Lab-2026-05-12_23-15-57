// hoops-defense-fx — the shared mode files keep to one-line hooks, and handleFx stays presentation: it never reaches the odds, the
// difficulty, the speeds or the windows. Source-level, as hoopsCourtWiring is: the
// modes are closures over a scene and a rig, and "is the hook still one line, does it still read MY carry" is answered by the text.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const B = path.join(__dirname, '..', '..');
const read = (f: string): string => fs.readFileSync(path.join(B, f), 'utf8');
const one = read('modes/OneVOneMode.ts'), three = read('modes/ThreeVThreeMode.ts');
const fx = read('court/mount/handleFx.ts');
const lines = (src: string, re: RegExp): string[] => src.split('\n').filter((l) => re.test(l));

describe('the mode hooks', () => {
  it('1v1 mounts it once on MY carry (only on my possession), and disposes it', () => {
    expect(lines(one, /mountHandleFx\(/)).toEqual([
      "      handleFx?.dispose(); handleFx = mountHandleFx(ctx, { carry: () => (possession === 'mine' ? meCarry : null) });   // hoops-defense-fx",
    ]);
    expect(lines(one, /handleFx\?\.dispose\(\); handleFx = null;/)).toHaveLength(1);
  });
  it('3v3 mounts it once on MY carry (a mate\'s or a foe\'s dribble is not mine), and disposes it', () => {
    expect(lines(three, /mountHandleFx\(/)).toEqual([
      '      handleFx?.dispose(); handleFx = mountHandleFx(ctx, { carry: () => carries.get(me) ?? null });   // hoops-defense-fx',
    ]);
    expect(lines(three, /handleFx\?\.dispose\(\); handleFx = null;/)).toHaveLength(1);
  });
  it('the modes touch it nowhere else: four lines each (import, slot, mount, dispose)', () => {
    expect(lines(one, /handleFx|HandleFx/)).toHaveLength(4);
    expect(lines(three, /handleFx|HandleFx/)).toHaveLength(4);
  });
});

describe('what the new modules may reach', () => {
  const imports = (src: string): string[] => [...src.matchAll(/^import[^;]*from '([^']+)'/gm)].map((m) => m[1]);
  it('handleFx imports no rule, odds, difficulty or movement module (the harness, the meter and the carry as TYPES only)', () => {
    for (const i of imports(fx)) expect(i, i).not.toMatch(/HandleSystem|Difficulty|BasketballCore|HoopsDefense|DefenderReact|CourtMovement|Dribble|onevoneRules|rules|scor|judg|session|wallet|\/modes\//i);
    for (const t of ['ModeHarness', 'MomentumBus', 'ballCarry']) expect(fx).toMatch(new RegExp(`import type \\{[^}]*\\} from '[./]+(core|anim)/${t}'`));
    const code = fx.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\b(?:ctx\.end|ctx\.setHud|momentum\.report|camDirector\.(?:setPreset|snapTo|setFixedBehind|tuneFollow|setBaseFov))\b/);
    expect(fx).not.toMatch(/\broll\(|Math\.random\(\) *</);   // no dice (its Math.random only detunes a voice)
  });
});
