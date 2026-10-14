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
