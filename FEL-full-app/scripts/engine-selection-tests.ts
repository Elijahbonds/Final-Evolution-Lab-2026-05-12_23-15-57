// Guard — anything that mounts a game must pick the Babylon engine FIRST.
//
// This exists because of a bug found on the highest-traffic page in the product.
// components/games/guest-dunk-shell.tsx — the PLAY NOW button, the first thing
// every new player ever sees — selected its engine with is3D('dunkContest') and
// never called isBabylon(). So the guest path mounted the react-three-fiber dunk
// with the Meshy GLB: the known-broken avatar, the very reason
// PROCEDURAL_CHARACTERS defaults true. It T-posed on screen.
//
// Gate 0 passing did not protect it, because that path never touched the
// Gate-0-compliant procedural rig at all. The lesson worth encoding: a platform
// gate only covers the paths that actually USE it, so the selection itself has
// to be guarded.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const ROOT = process.cwd();
const registry = readFileSync(join(ROOT, 'lib', 'babylon', 'modes', 'registry.ts'), 'utf8');
const rendererFlags = readFileSync(join(ROOT, 'components', 'three', 'flags.ts'), 'utf8');

const enabledBody = registry.match(/ENABLED_BABYLON_MODES = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
const enabledModes = [...enabledBody.matchAll(/'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
const babylonFlagsBody = rendererFlags.match(/const BABYLON_MODES:[^{]+{([\s\S]*?)^};/m)?.[1] ?? '';
const babylonFlags = new Set([...babylonFlagsBody.matchAll(/([A-Za-z0-9_]+):\s*true/g)].map((m) => m[1]));

// Registry mode IDs, route session keys, and renderer flag keys do not share one vocabulary.
// Make the translation explicit so enabling a mode cannot silently leave it on a fallback renderer.
const rendererFlagByRegistryMode: Record<string, string> = {
  aeroaces: 'aeroAces',
  bigair: 'bigAir',
  brainbrawl: 'brainBrawl',
  carnival: 'carnival',
  dance: 'dance',
  derby: 'baseball',
  duel: 'duel',
  dunk: 'dunkContest',
  dunkduel: 'dunkduel',
  football: 'football',
  freerun: 'freerun',
  golf: 'golf',
  karate: 'karateEndless',
  karate_vs: 'karateVersus',
  mixedcombat: 'mixedcombat',
  onevone: 'hoops1v1',
  penalty: 'soccer',
  showdown: 'showdown',
  skateboard: 'skateboard',
  snowboard_slalom: 'snowboard_slalom',
  sprint: 'sprint',
  surf: 'surf',
  tennis: 'tennis',
  threepoint: 'threePoint',
  threevthree: 'hoops3v3',
  tiebreak: 'tiebreak',
  velocitykart: 'velocityKart',
  volleyball: 'volleyball',
  who_scene_it: 'whoSceneIt',
};

/** Every file that chooses which game component to mount. */
function mountingFiles(): string[] {
  const out: string[] = [];
  const playDir = join(ROOT, 'app', 'play');
  if (existsSync(playDir)) {
    for (const mode of readdirSync(playDir)) {
      const loader = join(playDir, mode, '_components', 'loader.tsx');
      if (existsSync(loader)) out.push(loader);
    }
  }
  // Shells outside /play that still mount a game (the guest path lives here).
  const games = join(ROOT, 'components', 'games');
  for (const f of readdirSync(games)) {
    if (!f.endsWith('.tsx')) continue;
    const p = join(games, f);
    if (/const Game\s*=/.test(readFileSync(p, 'utf8'))) out.push(p);
  }
  return out;
}

const files = mountingFiles();
ok(files.length > 0, `A1 found game-mounting files (got ${files.length})`);
ok(enabledModes.length > 0, `A2 found enabled Babylon registry modes (got ${enabledModes.length})`);
ok(babylonFlags.size > 0, `A3 found renderer flags (got ${babylonFlags.size})`);

// Enabled registry modes whose LIVE route never asks the renderer flag, each with its reason. integ/backlog
// (2026-10-22): #335 took `dunkduel` out of BABYLON_MODES because /play/dunkduel is the IRL Prove It camera route,
// while #346 added A6 here; the exemption is held from both sides (A7), so it cannot go stale silently.
const NOT_RENDERER_FLAGGED: Record<string, string> = {
  dunkduel: '/play/dunkduel is the IRL Prove It camera route; DunkDuelMode is dev-harness only and its route never asks isBabylon',
};

const mappedModes = Object.keys(rendererFlagByRegistryMode);
const missingModeMappings = enabledModes.filter((mode) => rendererFlagByRegistryMode[mode] == null);
const staleModeMappings = mappedModes.filter((mode) => !enabledModes.includes(mode));
const missingRendererFlags = enabledModes
  .map((mode) => `${mode} -> ${rendererFlagByRegistryMode[mode] ?? '(missing map)'}`)
  .filter((pair) => {
    const flag = pair.split(' -> ')[1];
    return flag !== '(missing map)' && !babylonFlags.has(flag) && !(pair.split(' -> ')[0] in NOT_RENDERER_FLAGGED);
  });
const staleRendererExemptions = Object.keys(NOT_RENDERER_FLAGGED).filter((mode) => (
  !enabledModes.includes(mode) || babylonFlags.has(rendererFlagByRegistryMode[mode] ?? mode)
));
ok(missingModeMappings.length === 0, `A4 enabled modes missing renderer flag map: ${missingModeMappings.join(', ')}`);
ok(staleModeMappings.length === 0, `A5 renderer flag map contains stale disabled modes: ${staleModeMappings.join(', ')}`);
ok(missingRendererFlags.length === 0, `A6 enabled modes missing true BABYLON_MODES flags: ${missingRendererFlags.join(', ')}`);
ok(staleRendererExemptions.length === 0, `A7 renderer-flag exemptions must be enabled modes whose flag is really off: ${staleRendererExemptions.join(', ')}`);

for (const path of files) {
  const src = readFileSync(path, 'utf8');
  const rel = path.replace(`${ROOT}/`, '');

  // Does this file mount a Babylon host at all?
  const mountsBabylon = /-babylon['"]|make(Timing|Board|Air|Sprint)Host/.test(src);
  if (!mountsBabylon) continue;

  // A Babylon-ONLY mode (no 2D/3D fallback exists) mounts unconditionally, and
  // that is correct — there is nothing to fall through TO. The rule only bites
  // when a fallback is also imported, because then the order decides the engine.
  const hasFallback = /-game['"]|-3d['"]|is3D\(/.test(src);
  if (!hasFallback) continue;

  ok(src.includes('isBabylon('),
    `B-${rel} imports BOTH a Babylon host and a non-Babylon fallback but never `
    + 'calls isBabylon() — that is exactly how the guest dunk path silently '
    + 'served the react-three-fiber build and its T-posing GLB avatar');

  // And Babylon must be chosen BEFORE the 3D fallback, not after.
  const sel = /const Game\s*=\s*\(?([\s\S]{0,200}?);/.exec(src)?.[1] ?? '';
  if (sel.includes('is3D')) {
    const babylonAt = sel.search(/babylon|isBabylon/);
    const threeAt = sel.search(/is3D/);
    ok(babylonAt >= 0 && babylonAt < threeAt,
      `C-${rel} checks Babylon BEFORE is3D (order decides which engine wins)`);
  }
}

if (fail.length) {
  console.error(`engine-selection-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`engine-selection-tests: ${checks} checks green — Babylon is selected first everywhere`);
