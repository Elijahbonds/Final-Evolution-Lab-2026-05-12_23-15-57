import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const registry = readFileSync(join(ROOT, 'lib/babylon/modes/registry.ts'), 'utf8');
const matrix = readFileSync(join(ROOT, 'scripts/full-picture.mts'), 'utf8');
const gameData = readFileSync(join(ROOT, 'lib/game-data.ts'), 'utf8');
const controllerRegistry = readFileSync(join(ROOT, 'lib/controller-link/schemas/registry.ts'), 'utf8');
const devGauntlet = readFileSync(join(ROOT, 'scripts/gauntlet.sh'), 'utf8');
const playGauntlet = readFileSync(join(ROOT, 'scripts/gauntlet-play.sh'), 'utf8');

const enabledBody = registry.match(/ENABLED_BABYLON_MODES = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
const enabledModes = [...enabledBody.matchAll(/'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);

const routeMapBody = matrix.match(/const routeMap:[^{]+{([\s\S]*?)^};/m)?.[1] ?? '';
const routeMap = new Map(
  [...routeMapBody.matchAll(/([a-z_0-9]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]] as const),
);

assert.ok(enabledModes.length > 20, 'enabled mode scan is unexpectedly empty');

const expectedSlugs: Record<string, string> = {
  aeroaces: 'aero-aces',
  velocitykart: 'velocity-kart',
  who_scene_it: 'who-scene-it',
  brainbrawl: 'brain-brawl',
};
const playGauntletExempt = new Set([
  // /play/dunkduel is the owner's real-footage Prove It flow; the Babylon
  // DunkDuelMode remains registry/dev-mode coverage only.
  'dunkduel',
]);

for (const [key, slug] of Object.entries(expectedSlugs)) {
  assert.equal(routeMap.get(key), slug, `full-picture routeMap must carry ${key} -> ${slug}`);
}

const missingRoutes: string[] = [];
const missingMenuLinks: string[] = [];
const missingControllerSchemas: string[] = [];
const missingDevGauntlet: string[] = [];
const missingPlayGauntlet: string[] = [];
for (const key of enabledModes) {
  const route = `/play/${routeMap.get(key) ?? key}`;
  const slug = route.slice('/play/'.length);
  if (!existsSync(join(ROOT, 'app/play', slug, 'page.tsx'))) missingRoutes.push(`${key} -> ${route}`);
  if (!gameData.includes(`href: '${route}'`)) missingMenuLinks.push(`${key} -> ${route}`);
  if (!controllerRegistry.includes(`modeId: '${key}'`)) missingControllerSchemas.push(key);
  if (!new RegExp(`\\b${key}\\b`).test(devGauntlet.split('for m in')[1] ?? '')) missingDevGauntlet.push(key);
  if (!playGauntletExempt.has(key) && !new RegExp(`\\b${key}\\b`).test(playGauntlet.split('for m in')[1] ?? '')) missingPlayGauntlet.push(key);
}

assert.deepEqual(missingRoutes, [], 'full-picture must resolve enabled modes to real /play routes');
assert.deepEqual(missingMenuLinks, [], 'full-picture menu column must match MODE_INFO hrefs');
assert.deepEqual(missingControllerSchemas, [], 'enabled modes must have Controller Link schemas');
assert.deepEqual(missingDevGauntlet, [], 'enabled modes must be in the dev-mode gauntlet');
assert.deepEqual(missingPlayGauntlet, [], 'enabled modes must be in the shipping-route gauntlet');

console.log(`full-picture-tests: ${enabledModes.length} enabled mode routes, menus, phone schemas, and gauntlets resolve`);
