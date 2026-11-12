#!/usr/bin/env -S npx tsx
// VENICE HUB INVENTORY (lane/venice-hub, 2026-11-12): every shelf mode's place, its asset files and their sizes, its phone
// row, and where the Venice hub layout homes it. docs/VENICE-HUB-PLAN.md §1 is this script's output.
//
//   npx tsx scripts/probes/venice-hub/inventory.ts            → the markdown table on stdout
//   OUT=<file.json> npx tsx scripts/probes/venice-hub/inventory.ts   → also the rows as JSON
//
// WHAT IS MEASURED, AND WHAT IS CURATED. The curated half is the table below: which venue spec / prop set / own world a mode
// mounts (read from each mode's `mountVenue(ctx, '<spec>', …)` call or its own builder, cited per row), what kind of place
// it is, whether it is Venice-themed today and how it is started. The measured half is computed from the shipped data: the
// spec's baked map (venueSpecs mapKey → map-data, skipped when `meshDisabled`), the prop set (VenueProps.propSetFor, the
// default place — a picked place or location swaps it), every distinct prop GLB the set places, the Venice dunk dressing's
// own GLBs (veniceBoardwalk.mountVeniceDunkDressing) when the set is 'venice-dunk', the painted backdrop dome, and the phone
// row in lib/babylon/config/mobileBudget.json. File sizes are bytes on disk (what downloads, before HTTP compression).
// NOT counted: bodies (players, rivals, crowd: lib/babylon/core/athleteRoster, shared by every mode), balls, audio, the
// mode's procedural geometry. So the column is "the PLACE's files", the part a hub could share or replace.
import { readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VENUE_SPECS } from '../../../lib/babylon/nexus/venueSpecs';
import { MAPS } from '../../../lib/map-data';
import { VENUE_PROP_SETS, VENICE_ENV2_DIR, VENICE_PALM_LODS } from '../../../lib/babylon/visual/venuePropSets';
import { propSetFor } from '../../../lib/babylon/visual/VenueProps';
import { MESHY_DIR } from '../../../lib/babylon/visual/meshyProps';
import { FAMILIES } from '../../../lib/nav/families';
import { SPOTS, ZONES } from '../../../lib/adventure/venice/layout';

const APP = resolve(__dirname, '../../..');
const PUB = resolve(APP, 'public');
const budget = JSON.parse(readFileSync(resolve(APP, 'lib/babylon/config/mobileBudget.json'), 'utf8')) as { modes: Record<string, { measured: Record<string, number> }> };

type Kind = string;
interface Row {
  key: string;            // shelf key (lib/nav/families.ts)
  route: string;
  /** what the mode mounts: `spec:<venueSpecs id>` (NexusVenue.mountVenue), `set:<prop set>` (own world + a prop set), or `own:<what>` */
  venue: string;
  /** the picker's places, in a few words */
  places: string;
  kind: Kind;
  /** Venice-themed today: yes / pick (a Venice choice on the picker) / no */
  venice: 'yes' | 'pick' | 'no';
  /** how it is started today */
  start: string;
  /** mobileBudget.json row key, or '' when not measured */
  row: string;
  /** extra files the place loads that the data above does not name (cited) */
  extra?: string[];
  cite: string;
}

const SHELF_START = 'Play shelf → /play/<route> → boot splash (place pick) → START';
const PARTY = ' · party "Start together" (2 humans)';
const ROWS: Row[] = [
  // hoops
  { key: 'dunkContest', route: '/play/dunk', venue: 'spec:basketball_dunk', places: 'court locations: Venice, Blossom, Orbit, Canopy, Rooftop', kind: 'court', venice: 'yes', start: SHELF_START, row: 'dunk', extra: [`${MESHY_DIR}hoop.glb`], cite: 'DunkMode.ts:1562' },
  { key: 'hoops1v1', route: '/play/onevone', venue: 'spec:basketball_h2h', places: 'court locations (5)', kind: 'court', venice: 'yes', start: SHELF_START + PARTY, row: 'onevone', extra: [`${MESHY_DIR}hoop.glb`], cite: 'OneVOneMode.ts:1030' },
  { key: 'hoops3v3', route: '/play/threevthree', venue: 'spec:basketball_3v3', places: 'court locations (5)', kind: 'court', venice: 'yes', start: SHELF_START + PARTY, row: 'threevthree', extra: [`${MESHY_DIR}hoop.glb`], cite: 'ThreeVThreeMode.ts:1023' },
  { key: 'threePoint', route: '/play/threepoint', venue: 'spec:basketball_h2h', places: 'court locations (5)', kind: 'court', venice: 'yes', start: SHELF_START, row: 'threepoint', extra: [`${MESHY_DIR}hoop.glb`], cite: 'ThreePointMode.ts:1412' },
  { key: 'dunkduel', route: '/play/dunkduel', venue: 'spec:basketball_dunk', places: 'court locations (5)', kind: 'court', venice: 'yes', start: 'Play hero "Prove It" → /play/dunkduel (camera flow)', row: '', extra: [`${MESHY_DIR}hoop.glb`], cite: 'DunkDuelMode.ts:871' },
  // combat
  { key: 'karateEndless', route: '/play/karate', venue: 'spec:karate_endless', places: 'combat arenas (7: gauntlet, dojo, cage, foundry, pit, rooftop, cliff)', kind: 'ring', venice: 'no', start: SHELF_START + PARTY + ' (co-op)', row: 'karate', cite: 'KarateEndlessMode.ts:1918' },
  { key: 'karateVersus', route: '/play/karate-vs', venue: 'spec:karate_h2h', places: 'combat arenas (7)', kind: 'ring', venice: 'no', start: SHELF_START + ' · couch pads', row: 'karate_vs', cite: 'KarateVSMode.ts:982' },
  { key: 'mixedcombat', route: '/play/mixedcombat', venue: 'spec:karate_h2h', places: 'combat arenas (7)', kind: 'ring', venice: 'no', start: SHELF_START, row: 'mixedcombat', cite: 'MixedCombatMode.ts:892' },
  { key: 'duel', route: '/play/duel', venue: 'spec:karate_h2h', places: 'combat arenas (7), default the cage', kind: 'ring', venice: 'no', start: SHELF_START, row: '', cite: 'DuelMode.ts:836' },
  { key: 'showdown', route: '/play/showdown', venue: 'spec:karate_h2h', places: 'arenas + place looks', kind: 'ring', venice: 'no', start: SHELF_START, row: '', cite: 'ShowdownMode.ts:765' },
  // board
  { key: 'skateboarding', route: '/play/skateboard', venue: 'set:skatepark', places: 'board venues: Venice Park, City Plaza, Warehouse', kind: 'skatepark', venice: 'yes', start: SHELF_START + ' · couch pads', row: 'skateboard', cite: 'SkateRunMode.ts:676 (rideWorlds park + prop set; the venice-skatepark scan is NOT mounted)' },
  { key: 'snowboarding', route: '/play/snowboard', venue: 'set:slope', places: 'board venues: Alpine Run, Night Park, Glacier', kind: 'snow', venice: 'no', start: SHELF_START, row: '', cite: 'SnowboardSlalomMode.ts:588' },
  { key: 'surfing', route: '/play/surf', venue: 'set:surf-break', places: 'board venues: The Break, Sunset Point, The Reef', kind: 'water', venice: 'pick', start: SHELF_START, row: 'surf', cite: 'SurfBreakMode.ts:490' },
  { key: 'bigAir', route: '/play/big-air', venue: 'set:bigair-run', places: 'one hill', kind: 'snow', venice: 'no', start: SHELF_START, row: '', cite: 'AirSessionMode.ts:741' },
  // racing
  { key: 'velocityKart', route: '/play/velocity-kart', venue: 'own:kart circuits (procedural) + vehicle GLBs', places: 'circuits (7): Boardwalk Loop, Stadium Oval, Rooftop, Alpine Descent, Harbor Run, Orbit Station, Summit Climb', kind: 'road', venice: 'pick', start: SHELF_START, row: 'velocitykart', extra: ['/models/vehicles/v-f920e610.kart.glb', '/models/vehicles/v-f920e610-lod1.kart.glb'], cite: 'racing/kartCircuits.ts:148-307' },
  { key: 'aeroAces', route: '/play/aero-aces', venue: 'own:aero circuits (procedural) + plane GLBs', places: 'circuits (5): Red Rock Canyon, Coconut Cove, Frostbite Caverns, Ember Caldera, Neon Skyline', kind: 'sky', venice: 'no', start: SHELF_START, row: 'aeroaces', extra: ['/models/vehicles/v-d5a0bbed.plane.glb', '/models/vehicles/v-d5a0bbed-lod1.plane.glb'], cite: 'racing/aeroCircuits.ts:60-97' },
  { key: 'freerun', route: '/play/freerun', venue: 'own:free-run course (procedural, VenueKit)', places: 'tracks (4): Neon Rooftop, Hydro-Dam, Freight Terminal, Sunken Temple', kind: 'town', venice: 'no', start: SHELF_START, row: '', cite: 'nexus/freeRunTracks.ts:28-43' },
  { key: 'sprint', route: '/play/sprint', venue: 'own:sprint track (procedural, VenueKit)', places: 'place looks: home, Beach Dash, Night Meet', kind: 'track', venice: 'pick', start: SHELF_START, row: '', cite: 'nexus/placeLooks.ts:115-118' },
  // field & court
  { key: 'football', route: '/play/football', venue: 'spec:football_rush', places: 'place looks: Gridiron, Beach Bowl, The Dome', kind: 'field', venice: 'pick', start: SHELF_START, row: 'football', cite: 'FootballRushMode.ts:772' },
  { key: 'soccer', route: '/play/soccer', venue: 'spec:penalty', places: 'place looks: home, Street Cage, Beach Pitch', kind: 'field', venice: 'pick', start: SHELF_START, row: '', cite: 'precisionModes.ts:2127' },
  { key: 'baseball', route: '/play/baseball', venue: 'spec:derby', places: 'place looks: home, Sandlot, Night Game', kind: 'diamond', venice: 'no', start: SHELF_START, row: '', cite: 'BaseballInningsMode.ts:83' },
  { key: 'derby', route: '/play/derby', venue: 'spec:derby', places: 'place looks: home, Sandlot, Night Game', kind: 'diamond', venice: 'no', start: SHELF_START, row: '', cite: 'precisionModes.ts:1341' },
  { key: 'tennis', route: '/play/tennis', venue: 'spec:tennis', places: 'place looks: home (Venice set), Red Clay, The Lawn', kind: 'court', venice: 'yes', start: SHELF_START + ' · couch pads', row: 'tennis', cite: 'NetSportMode.ts:1186' },
  { key: 'volleyball', route: '/play/volleyball', venue: 'spec:volleyball', places: 'place looks: home (beach), Night Beach, The Gym', kind: 'beach', venice: 'yes', start: SHELF_START + ' · couch pads', row: '', cite: 'NetSportMode.ts:1186' },
  { key: 'golf', route: '/play/golf', venue: 'spec:golf_loop', places: 'place looks: home (Coastal Links), Desert, Alpine Dawn', kind: 'field', venice: 'no', start: SHELF_START + ' · couch pads', row: 'golf', cite: 'precisionModes.ts:599' },
  { key: 'tiebreak', route: '/play/tiebreak', venue: 'spec:tennis', places: 'place looks (3)', kind: 'court', venice: 'yes', start: SHELF_START, row: '', cite: 'TiebreakMode.ts:406' },
  // party
  { key: 'carnival', route: '/play/carnival', venue: 'spec:court_carnival', places: 'place looks: Carnival Court, Boardwalk, Neon Block', kind: 'court', venice: 'pick', start: SHELF_START, row: 'carnival', cite: 'CourtCarnivalMode.ts:212' },
  { key: 'brainBrawl', route: '/play/brain-brawl', venue: 'spec:brain_brawl', places: 'place looks (3)', kind: 'stage', venice: 'no', start: SHELF_START + ' · couch phones', row: '', cite: 'BrainBrawlMode.ts:1013' },
  { key: 'whoSceneIt', route: '/play/who-scene-it', venue: 'own:the question\'s venue (any spec)', places: 'every venue, one per question', kind: 'screen', venice: 'pick', start: SHELF_START + ' · couch phones', row: '', cite: 'WhoSceneItMode.ts:504' },
  { key: 'irl', route: '/play/irl', venue: 'own:your real court (camera)', places: 'none', kind: 'court', venice: 'no', start: 'Play shelf → /play/irl (camera)', row: '', cite: 'app/play/irl' },
  // craft
  { key: 'dance', route: '/play/dance', venue: 'spec:dance', places: 'place looks: The Cypher, Neon Club, Rooftop Dusk', kind: 'stage', venice: 'no', start: SHELF_START, row: '', cite: 'DanceMode.ts:1580' },
  { key: 'music', route: '/play/music', venue: 'own:2D (Groove Academy)', places: 'none', kind: 'stage', venice: 'no', start: 'Play shelf → /play/music', row: '', cite: 'app/play/music' },
  { key: 'acting', route: '/play/acting', venue: 'own:2D', places: 'none', kind: 'stage', venice: 'no', start: 'Play shelf → /play/acting', row: '', cite: 'app/play/acting' },
  { key: 'storyMode', route: '/story (The Nexus Initiative); the Adventure is /play/adventure (unlisted)', venue: 'own:Adventure pieces (hub + World 1)', places: 'hub, World 1; BR map 320 m', kind: 'wilds', venice: 'no', start: '/story from the shelf; /play/adventure by URL only', row: 'adventure-story', cite: 'adventure/world/story/storyMap.ts' },
];

const size = (url: string): number => { const f = resolve(PUB, url.replace(/^\//, '')); return existsSync(f) ? statSync(f).size : -1; };
const mb = (b: number) => (b / 1e6).toFixed(2);
const kitDir = (kit: string) => (kit === 'meshy' ? MESHY_DIR : `/models/props/${kit}/`);
const BAKED_DOME: Record<string, string> = { beach: 'beach', city: 'city', stadium: 'stadium', mountains: 'mountains', ocean: 'ocean', links: 'links', dojo: 'dojo', neon: 'neon' };

export interface Measured { files: Array<{ url: string; bytes: number }>; bytes: number; missing: string[] }
export function filesFor(r: Row): Measured {
  const urls = new Set<string>();
  let setName: string | null = null;
  if (r.venue.startsWith('spec:')) {
    const id = r.venue.slice(5);
    const spec = VENUE_SPECS[id];
    if (!spec) throw new Error(`${r.key}: no venue spec ${id}`);
    const cfg = spec.mapKey ? MAPS[spec.mapKey] : undefined;
    if (cfg && !cfg.meshDisabled) urls.add(`/models/maps/baked/${spec.mapKey}.glb`);
    setName = propSetFor(id);
    const bd = spec.environment.backdrop;
    if (bd && BAKED_DOME[bd]) urls.add(`/backdrops/baked/${BAKED_DOME[bd]}.jpg`);
  } else if (r.venue.startsWith('set:')) setName = r.venue.slice(4);
  if (setName) {
    const set = VENUE_PROP_SETS[setName];
    if (!set) throw new Error(`${r.key}: no prop set ${setName}`);
    for (const p of set) urls.add(`${kitDir(p.kit)}${p.model}.glb`);
    if (setName === 'venice-dunk') {
      for (const f of VENICE_PALM_LODS.files) urls.add(`${VENICE_ENV2_DIR}${f}`);
      urls.add(`${VENICE_ENV2_DIR}venice_boardwalk_kit.glb`);
      if (r.key === 'dunkContest' || r.key === 'dunkduel') urls.add(`${VENICE_ENV2_DIR}venice_crowd_cards.glb`);   // HALF_COURT_CROWD_CARDS = 0
    }
  }
  for (const e of r.extra ?? []) urls.add(e);
  const files = [...urls].map((url) => ({ url, bytes: size(url) }));
  return { files, bytes: files.reduce((s, f) => s + Math.max(0, f.bytes), 0), missing: files.filter((f) => f.bytes < 0).map((f) => f.url) };
}

function home(key: string): string {
  const s = SPOTS.find((x) => x.modes.includes(key));
  if (s) return `Venice: ${s.district}`;
  const z = ZONES.find((x) => x.homes.includes(key));
  return z ? `zone: ${z.id}` : '—';
}
function fit(key: string): string {
  const s = SPOTS.find((x) => x.modes.includes(key));
  if (!s) return 'zone';
  return NATURAL.has(key) ? 'natural' : 'stretch';
}
/** Real Venice has this kind of place (public geography): courts, skate park, surf, beach volleyball, paddle tennis, the bike path, the boardwalk's performers. */
const NATURAL = new Set(['dunkContest', 'hoops1v1', 'hoops3v3', 'threePoint', 'dunkduel', 'carnival', 'skateboarding', 'surfing', 'volleyball', 'tennis', 'tiebreak', 'sprint', 'dance', 'music', 'acting']);

const shelf = FAMILIES.flatMap((f) => f.modes);
const missingRows = shelf.filter((k) => !ROWS.some((r) => r.key === k));
if (missingRows.length) { console.error('shelf modes with no inventory row:', missingRows.join(', ')); process.exit(1); }

const out: Array<Row & { bytes: number; files: number; missing: string[]; phone: string; home: string; fit: string }> = [];
let failed = false;
for (const r of ROWS) {
  const m = filesFor(r);
  if (m.missing.length) { failed = true; console.error(`${r.key}: missing files ${m.missing.join(', ')}`); }
  const row = r.row ? budget.modes[r.row]?.measured : undefined;
  const phone = row ? `${row.drawCalls} / ${row.activeMeshes} / ${row.textureMb}` : 'not measured';
  out.push({ ...r, bytes: m.bytes, files: m.files.length, missing: m.missing, phone, home: home(r.key), fit: fit(r.key) });
}

const counts = { natural: out.filter((o) => o.fit === 'natural').length, stretch: out.filter((o) => o.fit === 'stretch').length, zone: out.filter((o) => o.fit === 'zone').length };
console.log('| Mode (shelf key) | Route | Venue / scene | Places on the picker | Kind | Venice today | Place files (MB, n) | Phone draws / meshes / tex MB | Started today | Hub home | Fit |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const o of out) console.log(`| ${o.key} | \`${o.route}\` | \`${o.venue}\` (${o.cite}) | ${o.places} | ${o.kind} | ${o.venice} | ${mb(o.bytes)} (${o.files}) | ${o.phone} | ${o.start} | ${o.home} | ${o.fit} |`);
console.log(`\n${out.length} shelf modes: ${counts.natural} natural Venice places, ${counts.stretch} believable Venice spots (stretch), ${counts.zone} homed in a zone.`);
const uniq = new Map<string, number>();
for (const r of ROWS) for (const f of filesFor(r).files) uniq.set(f.url, f.bytes);
console.log(`Distinct place files across all modes: ${uniq.size}, ${mb([...uniq.values()].reduce((s, b) => s + Math.max(0, b), 0))} MB.`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ rows: out, counts }, null, 1));
if (process.env.FILES) for (const r of ROWS) console.log(`\n${r.key}: ${filesFor(r).files.map((f) => `${f.url.replace('/models/', '')} ${mb(f.bytes)}`).join(', ')}`);
if (failed) process.exit(1);
