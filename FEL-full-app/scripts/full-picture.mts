// full-picture — ship pass 4, phase 1: one matrix, mode × venue × movement core ×
// camera preset × bounds source × phone bridge × session × menu path × concept lock
// × gauntlet × tests, derived from the source files by pattern (no app imports), so
// it runs anywhere in a second and every gap is named.
//   npx tsx scripts/full-picture.mts [--md docs/SHIP-PASS-4-MATRIX.md]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const flag = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const MD = flag('md', 'docs/SHIP-PASS-4-MATRIX.md');
const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// modes: registry key → mode class → file
const registry = read('lib/babylon/modes/registry.ts');
const modeEntries = [...registry.matchAll(/^\s+([a-z_0-9]+): ([A-Za-z0-9]+Mode),/gm)].map((m) => ({ key: m[1], cls: m[2] }));
const enabled = new Set([...(registry.match(/ENABLED_BABYLON_MODES = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1] ?? '').matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
const importOf = (cls: string): string | null => { const m = registry.match(new RegExp(`import \\{[^}]*\\b${cls}\\b[^}]*\\} from '\\./([A-Za-z0-9]+)'`)) ?? registry.match(new RegExp(`\\b${cls}\\b[^\\n]*from '\\./([A-Za-z0-9]+)'`)); return m ? `lib/babylon/modes/${m[1]}.ts` : null; };
const aliasOf = (cls: string): string | null => { const m = registry.match(new RegExp(`\\b${cls}\\b\\s*=\\s*([A-Za-z0-9]+)`)); return m ? m[1] : null; };
const modeFile = (cls: string): string | null => importOf(cls) ?? (aliasOf(cls) ? importOf(aliasOf(cls)!) : null) ?? (existsSync(`lib/babylon/modes/${cls}.ts`) ? `lib/babylon/modes/${cls}.ts` : null);

// venue: two mounting paths. (a) a venue SPEC (lib/babylon/nexus/venueSpecs) via
// mountVenue(ctx, venueId) — the route table in NexusVenue or a literal in the mode —
// which may carry a baked map (VENUE_MAP_KEYS); (b) a procedural VenueKit builder.
const nexus = read('lib/babylon/core/NexusVenue.ts');
const routeToVenue = Object.fromEntries([...(nexus.match(/ROUTE_TO_VENUE[^{]*\{([\s\S]*?)\};/)?.[1] ?? '').matchAll(/^\s+([a-z_0-9]+): *'([a-z_0-9]+)'/gm)].map((m) => [m[1], m[2]]));
const specs = read('lib/babylon/nexus/venueSpecs.ts');
const venueMapKeys = Object.fromEntries([...(specs.match(/VENUE_MAP_KEYS[^{]*\{([\s\S]*?)\};/)?.[1] ?? '').matchAll(/([a-z_0-9]+): *'([a-z0-9-]+)'/g)].map((m) => [m[1], m[2]]));
const bakedKeys = new Set(readdirSync('public/models/maps/baked').filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')));
const venueOfMode = (key: string, src: string): { venue: string | null; map: string | null; kit: string | null } => {
  const lit = [...src.matchAll(/mountVenue\(ctx, *'([a-z_0-9]+)'/g)].map((m) => m[1]);
  const venue = routeToVenue[key] ?? lit[0] ?? null;
  const kit = [...src.matchAll(/VenueKit\.(build[A-Za-z]+)\(/g)].map((m) => m[1]);
  return { venue, map: venue ? venueMapKeys[venue] ?? null : null, kit: kit.length ? [...new Set(kit)].join('+') : null };
};

const CORES = ['CourtMovement', 'BoardMovement', 'CombatMovement', 'FieldRun', 'CarrierControl', 'GroundRide', 'AirControl', 'RallyCore', 'TennisCore', 'GolfCore', 'DanceCore', 'DunkApproach', 'OnslaughtCore', 'KeeperCore', 'Batting', 'Pitching'];
// Camera column = a MEASURED gameplay framing exists for the mode (lib/babylon/config/cameraFraming.json,
// scripts/probes/_cam-frame.mts). cameraPresets.json describes the retired venue cameras (pre-M104).
const camFraming = JSON.parse(read('lib/babylon/config/cameraFraming.json'));
const camKeys = new Set(Object.keys(camFraming.modes));
const bridge = read('lib/controller-link/schemas/registry.ts');
const gauntlet = read('scripts/gauntlet.sh');
const gauntletPlay = read('scripts/gauntlet-play.sh');
const gameData = read('lib/game-data.ts');
const locks = new Set(readdirSync('docs/concept-lock').map((f) => f.replace(/\.md$/, '')));
const testScripts = readdirSync('scripts').filter((f) => /-tests\.ts$/.test(f));
const routeMap: Record<string, string> = { karate_vs: 'karate-vs', penalty: 'soccer', derby: 'baseball', snowboard_slalom: 'snowboard', bigair: 'big-air', dunkduel: 'dunkduel' };
const lockName: Record<string, string> = { karate: 'karate-endless', karate_vs: 'karate-vs', derby: 'baseball', penalty: 'soccer', snowboard_slalom: 'snowboard' };
const camName: Record<string, string> = { karate_vs: 'karate-vs', derby: 'baseball', penalty: 'soccer', snowboard_slalom: 'snowboard' };

interface Row { navFirst: boolean; key: string; enabled: boolean; file: string | null; route: string; menu: boolean; venue: string | null; map: string | null; kit: string | null; baked: boolean; cores: string[]; camera: boolean; clamps: number; bridge: boolean; gauntlet: boolean; play: boolean; lock: boolean; tests: number; lines: number }
const rows: Row[] = modeEntries.map(({ key, cls }) => {
  const file = modeFile(cls); const whole = file ? read(file) : '';
  // A file may export several modes (precisionModes.ts: Tennis, Golf, Derby, Penalty). Judge each mode by ITS
  // slice — from its `export const <Cls>` to the next export — or derby reads golf's venue mount.
  const sliceAt = whole.indexOf(`export const ${cls}`); const nextAt = sliceAt >= 0 ? whole.indexOf('\nexport const ', sliceAt + 1) : -1;
  const src = sliceAt >= 0 && whole.split('\nexport const ').length > 2 ? whole.slice(sliceAt, nextAt > 0 ? nextAt : undefined) : whole;
  const route = `/play/${routeMap[key] ?? key}`;
  const { venue, map, kit } = venueOfMode(key, src);
  const cores = CORES.filter((c) => new RegExp(`from '\\.\\./core/${c}'|from '\\./${c}'|\\b${c}\\b`).test(src) && src.includes(`${c}`));
  return {
    key, enabled: enabled.has(key), file, route,
    menu: gameData.includes(`href: '${route}'`),
    venue, map, kit, baked: !!map && bakedKeys.has(map),
    cores: cores.filter((c) => src.includes(`/${c}'`)),
    camera: camKeys.has(key),   // cameraFraming.json is keyed by registry key
    navFirst: /\.constrain\(/.test(src),
    clamps: (src.match(/Math\.max\(-?[A-Z_0-9.]+, *Math\.min\(/g) ?? []).length + (src.match(/^const (COURT|FIELD|ARENA|BOUNDS|HALF)[A-Z_]* *=/gm) ?? []).length,
    bridge: bridge.includes(`'${key}'`),
    gauntlet: new RegExp(`\\b${key}\\b`).test(gauntlet.split('for m in')[1] ?? ''),
    play: gauntletPlay.includes(key),
    lock: locks.has(lockName[key] ?? key),
    tests: testScripts.filter((t) => t.includes(key.split('_')[0])).length,
    lines: src ? src.split('\n').length : 0,
  };
});

const mark = (b: boolean) => (b ? '✓' : '—');
const lines = ['# Ship Pass 4 — Phase 1 matrix (generated by scripts/full-picture.mts)', '', `Generated ${new Date().toISOString().slice(0, 10)}. ✓ present · — missing. Clamps = typed bounds constants / clamp calls in the mode file.`, '',
  '| mode | on | route | menu | venue spec → map | kit builder | baked | movement cores | cam | clamps | phone | gauntlet | play sweep | lock | tests | lines |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const r of rows) lines.push(`| ${r.key} | ${mark(r.enabled)} | ${r.route} | ${mark(r.menu)} | ${r.venue ?? '—'} → ${r.map ?? '—'} | ${r.kit ?? '—'} | ${mark(r.baked)} | ${r.cores.join(', ') || '—'} | ${mark(r.camera)} | ${r.clamps}${r.navFirst ? ' (nav-first)' : ''} | ${mark(r.bridge)} | ${mark(r.gauntlet)} | ${mark(r.play)} | ${mark(r.lock)} | ${r.tests} | ${r.lines} |`);
const gaps: string[] = [];
for (const r of rows.filter((x) => x.enabled)) {
  if (!r.baked) gaps.push(`${r.key}: no baked map (${r.venue ? 'spec ' + r.venue : r.kit ? 'kit ' + r.kit : 'no venue'})`);
  if (!r.camera) gaps.push(`${r.key}: no measured camera framing`);
  if (r.clamps > 0 && !r.navFirst) gaps.push(`${r.key}: ${r.clamps} typed bound(s)/clamp(s), no navmesh (kit venue or unmapped spec) — box is the bound`);
  if (!r.bridge) gaps.push(`${r.key}: not on the phone bridge`);
  if (!r.menu) gaps.push(`${r.key}: no Modes-screen entry for ${r.route}`);
  if (!r.gauntlet) gaps.push(`${r.key}: not in the dev-mode gauntlet`);
  if (!r.lock) gaps.push(`${r.key}: no concept lock`);
  if (r.cores.length === 0) gaps.push(`${r.key}: no shared movement core (mode-local movement)`);
}
lines.push('', `## Gaps (${gaps.length})`, '', ...gaps.map((g) => `- ${g}`), '');
writeFileSync(MD, lines.join('\n'));
console.log(lines.slice(4).join('\n'));
