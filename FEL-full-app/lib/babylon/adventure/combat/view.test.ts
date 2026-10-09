// The view binders on a headless Babylon scene (NullEngine), and the purity rule: the sim files import no Babylon.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createCombatSystem } from './index';
import { bindCombatView } from './view';
import { createArena, makeActor } from './testArena';
import { MONSTERS, createMonsterActor } from './monsters/defs';
import { createMagicSystem } from '../magic/index';
import { bindMagicView } from '../magic/view';

function scene(): Scene {
  const s = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 2, -6), s);
  return s;
}

describe('adventure views', () => {
  it('the combat view draws the lock, the tells and the shots, fires juice on hits, and cleans up', () => {
    const sc = scene();
    const ar = createArena();
    const combat = createCombatSystem({ seed: 2 });
    ar.add(makeActor('me', { x: 0, z: 0 }, { hp: 5000 }));
    const brute = ar.add(createMonsterActor(MONSTERS.brute, 'brute', { x: 0, y: 0, z: 2 }));
    combat.registerMonster(brute, MONSTERS.brute);
    const caster = ar.add(createMonsterActor(MONSTERS.caster, 'caster', { x: 6, y: 0, z: 6 }));
    combat.registerMonster(caster, MONSTERS.caster);
    const juiced: string[] = [];
    const bursts: string[] = [];
    const before = sc.meshes.length;
    const view = bindCombatView({
      scene: sc, bus: ar.bus, combat, actors: ar.actors, localPlayerId: 'me',
      juice: { hitStop: () => juiced.push('stop'), shake: () => juiced.push('shake') },
      burst: (_s, _at, kind) => bursts.push(kind),
    });
    const o = { aiInputs: [combat.aiInputs], moveLockOf: combat.moveLockOf, takeWarp: combat.takeWarp };
    ar.input('me').lock = true;
    let sawTell = false, sawShot = false, sawReticle = false;
    for (let k = 0; k < 400; k++) {
      ar.step([combat], 1, o);
      view.sync();
      sawReticle ||= sc.getMeshByName('adv_lock_reticle')!.isEnabled();
      sawTell ||= sc.meshes.some((m) => m.name.startsWith('adv_tell_') && m.isEnabled());
      sawShot ||= sc.meshes.some((m) => m.name.startsWith('adv_shot_') && m.isEnabled());
    }
    expect(sawReticle).toBe(true);
    expect(sawTell).toBe(true);
    expect(sawShot).toBe(true);
    expect(bursts).toContain('sparks');
    expect(juiced).toContain('shake');
    view.dispose();
    expect(sc.meshes.length).toBe(before);
    sc.dispose();
  });

  it('the magic view draws bolts in their element, tints slow-time on and off, and cleans up', () => {
    const sc = scene();
    const ar = createArena();
    const combat = createCombatSystem();
    const magic = createMagicSystem({ loadoutOf: () => ({ known: ['bolt.fire', 'mind.slowTime'], equipped: ['bolt.fire', null, null, null] }) });
    ar.add(makeActor('me', { x: 0, z: 0 }));
    ar.add(makeActor('t', { x: 0, z: 15 }, { kind: 'monster', team: -1, hp: 1000 }));
    const tints: (string | null)[] = [];
    const before = sc.meshes.length;
    const view = bindMagicView({
      scene: sc, bus: ar.bus, magic, actors: ar.actors, localPlayerId: 'me',
      juice: { tint: (c) => tints.push(c) }, burst: () => {},
    });
    ar.input('me').lock = true; ar.step([combat, magic]);
    ar.input('me').magic = true;
    let sawBolt = false;
    for (let k = 0; k < 40; k++) {
      ar.step([combat, magic]);
      view.sync();
      sawBolt ||= sc.meshes.some((m) => m.name.startsWith('adv_bolt_i') && m.isEnabled());
    }
    expect(sawBolt).toBe(true);
    ar.input('me').focusHeld = true; ar.step([combat, magic]); view.sync();
    ar.input('me').focusHeld = false; ar.step([combat, magic]); view.sync();
    expect(tints).toEqual(['#7dd3fc', null]);
    view.dispose();
    expect(sc.meshes.length).toBe(before);
    sc.dispose();
  });
});

describe('adventure A2: the sim is pure', () => {
  it('no sim file imports Babylon directly (only the view binders do)', () => {
    const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'view.ts') files.push(p);
      }
    };
    walk(path.join(root, 'combat'));
    walk(path.join(root, 'magic'));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from '@babylonjs\//);
      expect(src, f).not.toMatch(/Math\.random\(|Date\.now\(|performance\.now\(/);
      expect(src, f).not.toMatch(/from '\.\.\/(movement|rails|flight|partner|stats|save)\//);
    }
  });
});
