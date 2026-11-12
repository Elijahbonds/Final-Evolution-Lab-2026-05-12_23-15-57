// phoneCasters: a phone's shadow map skips parts hidden inside a bigger part's shadow, and HUD pieces; no other tier does.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHONE_NO_CAST, phoneSkipsCaster } from './phoneCasters';

describe('phoneCasters', () => {
  it('a phone skips the accessories, the eyes, the soles and the horde HUD', () => {
    for (const n of ['acc_112_armsleeve', 'acc_28_headband', 'acc_84_wrist_Left', 'acc_player_31_chain', 'eyes_c130', 'eyes',
      'KitSole_evo_c138', 'threat_cue_6077', 'threat_arrow_10155', 'mook_bar_ni8dsq', 'juice_rim', 'juice_net']) {
      expect(phoneSkipsCaster(n, 'mobile'), n).toBe(true);
    }
  });

  it('a phone keeps every silhouette a player reads: bodies, hair, kit, shoes, props, scenery', () => {
    for (const n of ['Body_c137', 'Body.001_c6', 'Hair_buzz_c134', 'Hair_afro_c', 'Kit_tops_top_lab_c143', 'Kit_shoes_shoes_evo_c138',
      'Kit_shorts_shorts_court_c140', 'deck_wheel', 'lightPostModern(Clone)_primitive0', 'wall_arena_gauntlet_0', 'eyeshadow_prop',
      'tree_palmTall_primitive1', 'ball', 'accent_rail', 'access_ramp', 'juice_rim_m', 'rim', 'net']) {
      expect(phoneSkipsCaster(n, 'mobile'), n).toBe(false);
    }
  });

  it('desktop and high keep every caster they had', () => {
    for (const tier of ['desktop', 'high']) {
      for (const n of ['acc_112_armsleeve', 'eyes_c130', 'KitSole_evo_c138', 'threat_arrow_1', 'mook_bar_x']) expect(phoneSkipsCaster(n, tier)).toBe(false);
    }
    expect(phoneSkipsCaster(null, 'mobile')).toBe(false);
    expect(PHONE_NO_CAST.flags).not.toMatch(/i/);   // case-sensitive: `Eyes`-led prop names are not kit eyes
  });

  it("the rig's caster classifier asks it, after the never-cast list and before a caster is added", () => {
    const src = readFileSync(join(__dirname, 'LightRig.ts'), 'utf8');
    const c = src.slice(src.indexOf('const classify = (mesh: AbstractMesh): void => {'));
    const at = c.indexOf('if (phoneSkipsCaster(mesh.name, tier)) return;');
    expect(at).toBeGreaterThan(c.indexOf('if (NEVER_CAST.test(mesh.name)) return;'));
    expect(at).toBeLessThan(c.indexOf('shadows.addShadowCaster(mesh, true);'));
  });
});

// hoops-p08 (2026-11-12): the phone budget — no ink contour on the parts inside a bigger part, and the sock out of the shadow map
import { PHONE_INK_TRIM, PHONE_SOCK_CAST, phoneSkipsCasterMaterial, phoneSkipsInk } from './phoneCasters';
describe('phoneCasters — the ink and the sock (hoops-p08)', () => {
  it('a phone draws no ink for the eyes, the sole, the accessories and the sock; the silhouette keeps its line', () => {
    expect(PHONE_INK_TRIM).toBe(1);
    for (const [n, m] of [['eyes_c304', 'eyes'], ['KitSole_evo_c315', 'kitSole.evo'], ['acc_337_legsleeve', 'acc_337_legsleeve'], ['Kit_shoes_shoes_evo_primitive1_c316', 'shoes.shoes_evo.sock_low_wear']]) {
      expect(phoneSkipsInk(n, m, 'mobile'), n).toBe(true);
    }
    for (const [n, m] of [['Body_c307', 'skin'], ['Hair_buzz_c306', 'hair.buzz'], ['Kit_tops_top_tee_c311', 'jersey.top_tee_wear_wear'], ['Kit_shorts_shorts_baggy_c310', 'shorts.shorts_baggy_wear'], ['Kit_shoes_shoes_evo_primitive0_c315', 'shoes.shoes_evo_wear']]) {
      expect(phoneSkipsInk(n, m, 'mobile'), n).toBe(false);
    }
  });
  it('only on a phone, and the knob at 0 inks every part as before', () => {
    for (const tier of ['desktop', 'high']) expect(phoneSkipsInk('eyes_c1', 'eyes', tier)).toBe(false);
    expect(phoneSkipsInk('eyes_c1', 'eyes', 'mobile', 0)).toBe(false);
  });
  it('the sock leaves a phone\'s shadow map (by its material); 1 restores it; other tiers keep it', () => {
    expect(PHONE_SOCK_CAST).toBe(0);
    expect(phoneSkipsCasterMaterial('shoes.shoes_evo.sock_low_wear', 'mobile')).toBe(true);
    expect(phoneSkipsCasterMaterial('shoes.shoes_evo.sock_low_wear', 'mobile', 1)).toBe(false);
    expect(phoneSkipsCasterMaterial('shoes.shoes_evo.sock_low_wear', 'desktop')).toBe(false);
    expect(phoneSkipsCasterMaterial('shoes.shoes_evo_wear', 'mobile')).toBe(false);
    expect(phoneSkipsCasterMaterial(null, 'mobile')).toBe(false);
  });
  it('autoInk asks it with the tier (the scene\'s own, which the look stack sets before it inks)', () => {
    const ink = readFileSync(join(__dirname, '../visual/AnimeInk.ts'), 'utf8');
    expect(ink).toMatch(/phoneSkipsInk\(m\.name, m\.material\?\.name, tier, feel\('perf\.phoneInkTrim', PHONE_INK_TRIM\)\) \? 'off' : style/);
    expect(ink).toMatch(/tier: string = \(scene\.metadata as \{ felTier\?: string \} \| null\)\?\.felTier \?\? 'desktop'/);
    const look = readFileSync(join(__dirname, '../core/lookStack.ts'), 'utf8');
    expect(look.indexOf('scene.metadata ??= {}).felTier = tier')).toBeLessThan(look.indexOf('autoInk(scene, inkStyleFor(o.modeId))'));
  });
});
