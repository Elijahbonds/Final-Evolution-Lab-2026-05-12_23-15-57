// DEMO-MODELS-1 item 6 (crowd.forgeFront by server setting, and the back-row hook) and the wiring that is not worth a render:
// v2: the library stage is back to 12b817a3's spawn (setting 5 removed), and setting 4's context comes from the /try dunk scene only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CROWD_BACK_LIGHT_URLS, CROWD_FORGE_FRONT_ON, crowdBackBodyUrls, forgeFrontOn } from '@/lib/babylon/visual/crowd/crowdFront';
import { NO_DEMO_MODEL_FLAGS, setDemoModelFlags } from '@/lib/babylon/core/demoModels';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown };
let ls: FakeStorage;
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls }; });
afterEach(() => { resetFeelForTests(); delete g.window; setDemoModelFlags(NO_DEMO_MODEL_FLAGS); });
const knob = (v: number) => { ls.m.set(FEEL_STORAGE_KEY, JSON.stringify({ 'crowd.forgeFront': v })); setFeelUser(true); setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1')); };
const MESHY = ['scout', 'marlow', 'dodge', 'pike', 'bramble'].map((n) => `/models/crowd/${n}.glb`);

describe('CROWD_FORGE_FRONT_ENABLED', () => {
  it('off (the default): the forge front row stays off, as live; the knob still turns it on', () => {
    expect(CROWD_FORGE_FRONT_ON).toBe(0);
    expect(forgeFrontOn()).toBe(false);
    knob(1); expect(forgeFrontOn()).toBe(true);
  });
  it('on: the forge front row is on, knob or no knob (a knob at its default 0 stores no override: the setting is the off switch)', () => {
    setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, crowdForgeFront: true });
    expect(forgeFrontOn()).toBe(true);
    knob(0); expect(forgeFrontOn()).toBe(true);
    setDemoModelFlags(NO_DEMO_MODEL_FLAGS); expect(forgeFrontOn()).toBe(false);   // knob 0 stored nothing; the setting off turns it off
  });
  it('the other settings never turn it on', () => {
    for (const k of ['coachBody', 'coachBodyMask', 'rivalPrefetch', 'tryGuestCoach'] as const) {
      setDemoModelFlags({ ...NO_DEMO_MODEL_FLAGS, [k]: true });
      expect(forgeFrontOn(), k).toBe(false);
    }
  });
});

describe('the back-row hook (light forge bodies, when 3D Art delivers them)', () => {
  it('none are delivered yet: the list is empty and no file is invented', () => {
    expect(CROWD_BACK_LIGHT_URLS).toEqual([]);
  });
  it('the Meshy five while the list is empty or the setting is off; the light bodies once both are there', () => {
    const on = { ...NO_DEMO_MODEL_FLAGS, crowdForgeFront: true };
    expect(crowdBackBodyUrls(MESHY, NO_DEMO_MODEL_FLAGS)).toBe(MESHY);
    expect(crowdBackBodyUrls(MESHY, on)).toBe(MESHY);
    expect(crowdBackBodyUrls(MESHY, NO_DEMO_MODEL_FLAGS, ['/models/crowd/forge-light-1.glb'])).toBe(MESHY);
    expect(crowdBackBodyUrls(MESHY, on, ['/models/crowd/forge-light-1.glb'])).toEqual(['/models/crowd/forge-light-1.glb']);
  });
  it('crowdBake loads its back rows through the hook', () => {
    const bake = readFileSync('lib/babylon/visual/crowd/crowdBake.ts', 'utf8');
    expect(bake).toMatch(/const backUrls = crowdBackBodyUrls\(CROWD_BODY_URLS\);/);
    expect(bake).toMatch(/for \(let i = 0; i < backUrls\.length; i\+\+\) \{\s*const url = backUrls\[i\];/);
  });
});

describe('v2: the demo stage, the body context and setting 4', () => {
  const stage = readFileSync('components/library/exercise-stage.tsx', 'utf8');
  const lib = readFileSync('lib/babylon/core/CharacterLibrary.ts', 'utf8');
  const harness = readFileSync('lib/babylon/core/ModeHarness.ts', 'utf8');
  it('the library stage spawns exactly as on 12b817a3 (no demonstrator: setting 5 is gone), and never stamps the /try dunk context', () => {
    expect(stage.match(/CharacterLibrary\.spawn\(/g)).toHaveLength(1);
    expect(stage).toMatch(/CharacterLibrary\.spawn\(scene, DEFAULT_HERO_URL, \{ role: 'player', startClip: 'idle_stand', deferHeroCapture: true \}\)/);
    expect(stage).not.toMatch(/demonstrator|felTryDunkGuest|DEMO-MODELS/);
  });
  it('the player branch plans with the scene\'s explicit context; nothing of setting 5 is left', () => {
    expect(lib).toMatch(/const plan = planPlayerBody\(\{ kind: id\?\.body \?\? 'kit-male', context: playerBodyContextOf\(scene\), flags: demoModelFlags\(\) \}\);/);
    expect(lib).toMatch(/return md\?\.felTryDunkGuest === true && md\.felModeId === 'dunk' && signedOutVisitor\(\) \? 'tryDunkGuest' : 'other';/);
    expect(lib).not.toMatch(/demonstrator|libraryCoach/);
    expect(lib).toMatch(/opts\.identity !== false\) \{/);
  });
  it('only ModeHarness stamps the /try dunk context, and only for a known-guest dunk mount', () => {
    expect(harness).toMatch(/if \(opts\.guest === true && def\.modeId === 'dunk'\) scene\.metadata\.felTryDunkGuest = true;/);
    expect(harness.match(/felTryDunkGuest/g)).toHaveLength(1);
    // and no other source file sets it (a stage or any other host cannot opt into setting 4)
    const setters: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) walk(p); continue; }
      if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) && /felTryDunkGuest\s*=(?!=)/.test(readFileSync(p, 'utf8'))) setters.push(p); } };
    for (const d of ['lib', 'components', 'app']) walk(d);
    expect(setters).toEqual([join('lib', 'babylon', 'core', 'ModeHarness.ts')]);
  });
  it('the coach hair follows the identity\'s hide paths (Bald, hidden hair or head, a hood or helmet)', () => {
    const pid = readFileSync('lib/babylon/core/playerIdentity.ts', 'utf8');
    expect(pid).toMatch(/applyCoachHairHide\(spawn\.meshes, id\.face\.hairStyle === 'Bald' \|\| hidden\.hair \|\| hidden\.head \|\| cover === 'hide'\);/);
  });
});
