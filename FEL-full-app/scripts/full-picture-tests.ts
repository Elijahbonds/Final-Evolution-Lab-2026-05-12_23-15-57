import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_CONTROLLERS } from '../lib/controller-link/schemas/registry';

const ROOT = process.cwd();

const registry = readFileSync(join(ROOT, 'lib/babylon/modes/registry.ts'), 'utf8');
const matrix = readFileSync(join(ROOT, 'scripts/full-picture.mts'), 'utf8');
const gameData = readFileSync(join(ROOT, 'lib/game-data.ts'), 'utf8');
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
const devGauntletModes = modesInForLoops(devGauntlet);
const playGauntletModes = modesInForLoops(playGauntlet);
const conceptLockNames = new Set(
  readdirSync(join(ROOT, 'docs/concept-lock'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, '')),
);
const conceptLockName: Record<string, string> = {
  karate: 'karate-endless',
  karate_vs: 'karate-vs',
  derby: 'baseball',
  penalty: 'soccer',
  snowboard_slalom: 'snowboard',
};
const testName: Record<string, string[]> = {
  aeroaces: ['aeroaces', 'aero-aces', 'aeroAces'],
  bigair: ['bigair', 'big-air', 'BigAir'],
  brainbrawl: ['brainbrawl', 'brain-brawl', 'brainBrawl'],
  derby: ['derby', 'baseball'],
  dunkduel: ['dunkduel', 'dunk-duel', 'DunkDuel'],
  freerun: ['freerun', 'free-run', 'FreeRun'],
  karate_vs: ['karate_vs', 'karate-vs', 'KarateVS', 'karateVersus'],
  mixedcombat: ['mixedcombat', 'mixed-combat', 'MixedCombat'],
  onevone: ['onevone', 'one-v-one', 'OneVOne'],
  penalty: ['penalty', 'soccer'],
  skateboard: ['skateboard', 'skate-run', 'skate'],
  snowboard_slalom: ['snowboard_slalom', 'snowboard', 'snowboarding'],
  tiebreak: ['tiebreak', 'Tiebreak'],
  threepoint: ['threepoint', 'three-point', 'threePoint'],
  threevthree: ['threevthree', 'three-v-three', 'ThreeVThree'],
  velocitykart: ['velocitykart', 'velocity-kart', 'velocityKart'],
  who_scene_it: ['who_scene_it', 'who-scene-it', 'whoSceneIt'],
};
const skipTestDirs = new Set(['.git', '.next', 'coverage', 'node_modules', 'public']);
const testFilePattern = /(?:^|[./-])(?:test|tests)\.(?:ts|tsx)$|-tests\.ts$/;

function walkTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipTestDirs.has(entry.name)) files.push(...walkTestFiles(path));
    } else if (testFilePattern.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const testFiles = walkTestFiles(ROOT);

function testCountFor(mode: string): number {
  const tokens = testName[mode] ?? [mode, routeMap.get(mode) ?? mode];
  return testFiles.filter((file) => tokens.some((token) => file.toLowerCase().includes(token.toLowerCase()))).length;
}

function modesInForLoops(script: string): Set<string> {
  const modes = new Set<string>();
  for (const match of script.matchAll(/for\s+\w+\s+in\s+([^;]+);/g)) {
    for (const token of match[1].trim().split(/\s+/)) {
      if (/^[a-z0-9_]+$/.test(token)) modes.add(token);
    }
  }
  return modes;
}

function hasDpadAction(mode: string, action: string): boolean {
  return (MODE_CONTROLLERS[mode]?.schemas ?? []).some((schema) => (
    schema.kind === 'dpad' && schema.dpad.action === action
  ));
}

function hasHeldButton(mode: string, action: string): boolean {
  return (MODE_CONTROLLERS[mode]?.schemas ?? []).some((schema) => (
    schema.kind === 'button' && schema.buttons.some((button) => button.action === action && button.hold === true)
  ));
}

function hasButton(mode: string, action: string, label?: string): boolean {
  return (MODE_CONTROLLERS[mode]?.schemas ?? []).some((schema) => (
    schema.kind === 'button' && schema.buttons.some((button) => (
      button.action === action && (label === undefined || button.label === label)
    ))
  ));
}

for (const [key, slug] of Object.entries(expectedSlugs)) {
  assert.equal(routeMap.get(key), slug, `full-picture routeMap must carry ${key} -> ${slug}`);
}

const missingRoutes: string[] = [];
const missingMenuLinks: string[] = [];
const missingControllerSchemas: string[] = [];
const missingDevGauntlet: string[] = [];
const missingPlayGauntlet: string[] = [];
const missingConceptLocks: string[] = [];
const missingModeTests: string[] = [];
for (const key of enabledModes) {
  const route = `/play/${routeMap.get(key) ?? key}`;
  const slug = route.slice('/play/'.length);
  if (!existsSync(join(ROOT, 'app/play', slug, 'page.tsx'))) missingRoutes.push(`${key} -> ${route}`);
  if (!gameData.includes(`href: '${route}'`)) missingMenuLinks.push(`${key} -> ${route}`);
  if (!(key in MODE_CONTROLLERS)) missingControllerSchemas.push(key);
  if (!devGauntletModes.has(key)) missingDevGauntlet.push(key);
  if (!playGauntletExempt.has(key) && !playGauntletModes.has(key)) missingPlayGauntlet.push(key);
  if (!conceptLockNames.has(conceptLockName[key] ?? key)) missingConceptLocks.push(key);
  if (testCountFor(key) === 0) missingModeTests.push(key);
}

assert.deepEqual(missingRoutes, [], 'full-picture must resolve enabled modes to real /play routes');
assert.deepEqual(missingMenuLinks, [], 'full-picture menu column must match MODE_INFO hrefs');
assert.deepEqual(missingControllerSchemas, [], 'enabled modes must have Controller Link schemas');
assert.deepEqual(missingDevGauntlet, [], 'enabled modes must be in the dev-mode gauntlet');
assert.deepEqual(missingPlayGauntlet, [], 'enabled modes must be in the shipping-route gauntlet');
assert.deepEqual(missingConceptLocks, [], 'enabled modes must have concept locks');
assert.deepEqual(missingModeTests, [], 'enabled modes must have named regression coverage');
assert.ok(hasDpadAction('freerun', 'move'), 'freerun phone d-pad must steer with LEFT STICK movement');
assert.ok(hasHeldButton('freerun', 'charge'), 'freerun phone schema must expose held RT sprint');
assert.ok(hasHeldButton('freerun', 'brake'), 'freerun phone schema must expose held LT slide');
assert.ok(hasHeldButton('mixedcombat', 'X'), 'mixedcombat phone guard must be holdable, not a tap');
assert.ok(hasHeldButton('karate', 'X'), 'karate phone block must be a held X guard, not a dash tap');
assert.ok(hasHeldButton('karate_vs', 'X'), 'karate_vs phone block must be a held X guard, not a dash tap');
assert.ok(hasHeldButton('onevone', 'X') && hasButton('onevone', 'X', 'SHOOT'),
  'onevone phone SHOOT must use held X, matching the 2K shot-meter map');
assert.ok(!hasButton('onevone', 'charge'),
  'onevone phone SHOOT must not use charge/RT, which basketball reads as turbo');
assert.ok(hasHeldButton('threevthree', 'X') && hasButton('threevthree', 'X', 'SHOOT'),
  'threevthree phone SHOOT must use held X, matching the 2K shot-meter map');
assert.ok(hasButton('threevthree', 'A', 'PASS') && hasButton('threevthree', 'Y', 'BLOCK'),
  'threevthree phone PASS/BLOCK must match the local 2K face-button map');
assert.ok(!hasButton('threevthree', 'charge'),
  'threevthree phone SHOOT must not use charge/RT, which basketball reads as turbo');

console.log(`full-picture-tests: ${enabledModes.length} enabled mode routes, menus, phone schemas, and gauntlets resolve`);
