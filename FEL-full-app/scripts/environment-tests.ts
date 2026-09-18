#!/usr/bin/env -S yarn tsx
/**
 * scripts/environment-tests.ts — M14-P6 Lighting & Environment suite.
 * =================================================================
 * Phase 6 centralises the render environment in a PURE config core
 * (lib/render/environment.ts): per-venue ACES tone profiles, the
 * SceneLighting variant each mode should use, and the 4-wall enclosure
 * geometry math. A thin <Enclosure> component renders the wall spec.
 *
 *   A. TONE + LIGHTING MAPS: every mapped mode resolves to a valid venue,
 *      lighting variant and a finite in-range ACES exposure; lookups are
 *      total (fallbacks) and deterministic.
 *   B. ENCLOSURE GEOMETRY: buildEnclosure emits exactly 4 inward-facing
 *      walls that surround the given bounds, sized to the (padded) spans,
 *      with distinct orientations; finite and deterministic; ceiling opt-in.
 *   C. LIVE WIRING (static source invariants): the dojo scenes import and
 *      mount <Enclosure>; the Enclosure component consumes the pure core.
 *
 * Run: yarn tsx scripts/environment-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  TONE_PROFILES,
  MODE_VENUE,
  venueBindingForMode,
  lightingForMode,
  venueForMode,
  toneForMode,
  buildEnclosure,
  type VenueKind,
  type LightingVariant,
} from '@/lib/render/environment';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const VALID_VARIANTS: LightingVariant[] = ['venice', 'dojo', 'blue-court', 'skatepark'];
const VALID_VENUES: VenueKind[] = ['arena', 'dojo', 'blue-court', 'skatepark', 'outdoor', 'pitch'];
const MODES = Object.keys(MODE_VENUE);

// ── A. TONE + LIGHTING MAPS ──────────────────────────────────
console.log('\nA. tone + lighting maps');

check('every venue has a finite ACES exposure in a sane range', () => {
  for (const v of VALID_VENUES) {
    const p = TONE_PROFILES[v];
    assert.ok(p, `missing tone profile for ${v}`);
    assert.equal(p.mode, 'aces');
    assert.ok(Number.isFinite(p.exposure), `exposure not finite for ${v}`);
    assert.ok(p.exposure > 0.5 && p.exposure < 2.0, `exposure out of range for ${v}: ${p.exposure}`);
  }
});

check('every mapped mode resolves to a valid venue + lighting variant', () => {
  assert.ok(MODES.length >= 10, `expected many mapped modes, got ${MODES.length}`);
  for (const m of MODES) {
    const b = venueBindingForMode(m);
    assert.ok(VALID_VENUES.includes(b.venue), `bad venue for ${m}: ${b.venue}`);
    assert.ok(VALID_VARIANTS.includes(b.lighting), `bad lighting for ${m}: ${b.lighting}`);
    assert.equal(lightingForMode(m), b.lighting);
    assert.equal(venueForMode(m), b.venue);
  }
});

check('toneForMode returns the venue profile for every mapped mode', () => {
  for (const m of MODES) {
    const t = toneForMode(m);
    assert.deepEqual(t, TONE_PROFILES[venueForMode(m)]);
  }
});

check('unknown modes fall back to a valid arena binding (total lookup)', () => {
  const b = venueBindingForMode('totally-not-a-mode');
  assert.ok(VALID_VENUES.includes(b.venue));
  assert.ok(VALID_VARIANTS.includes(b.lighting));
  assert.ok(Number.isFinite(toneForMode('totally-not-a-mode').exposure));
});

check('the combat modes bind to the dojo venue + dojo lighting', () => {
  for (const m of ['karate', 'karateVersus']) {
    assert.equal(venueForMode(m), 'dojo');
    assert.equal(lightingForMode(m), 'dojo');
  }
});

check('map lookups are deterministic (stable across calls)', () => {
  for (const m of MODES) {
    assert.equal(lightingForMode(m), lightingForMode(m));
    assert.equal(toneForMode(m).exposure, toneForMode(m).exposure);
  }
});

// ── B. ENCLOSURE GEOMETRY ────────────────────────────────
console.log('\nB. enclosure geometry');

const BMIN: [number, number, number] = [-7, 0, -6];
const BMAX: [number, number, number] = [7, 10, 6];

check('buildEnclosure emits exactly 4 walls with the four cardinal ids', () => {
  const e = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7 });
  assert.equal(e.walls.length, 4);
  const ids = e.walls.map((w) => w.id).sort();
  assert.deepEqual(ids, ['east', 'north', 'south', 'west']);
});

check('every wall position + size + rotation is finite', () => {
  const e = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7, pad: 0.6 });
  for (const w of e.walls) {
    assert.ok(w.position.every((n) => Number.isFinite(n)), `pos not finite for ${w.id}`);
    assert.ok(Number.isFinite(w.rotationY), `rotationY not finite for ${w.id}`);
    assert.ok(Number.isFinite(w.width) && w.width > 0, `bad width for ${w.id}`);
    assert.ok(Number.isFinite(w.height) && w.height > 0, `bad height for ${w.id}`);
  }
});

check('walls sit just outside the navigable bounds by the pad', () => {
  const pad = 0.6;
  const e = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7, pad });
  const byId = Object.fromEntries(e.walls.map((w) => [w.id, w]));
  assert.ok(Math.abs(byId.south.position[2] - (BMIN[2] - pad)) < 1e-9);
  assert.ok(Math.abs(byId.north.position[2] - (BMAX[2] + pad)) < 1e-9);
  assert.ok(Math.abs(byId.west.position[0] - (BMIN[0] - pad)) < 1e-9);
  assert.ok(Math.abs(byId.east.position[0] - (BMAX[0] + pad)) < 1e-9);
});

check('opposite walls share a span; the four orientations are distinct', () => {
  const e = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7, pad: 0.6 });
  const byId = Object.fromEntries(e.walls.map((w) => [w.id, w]));
  // north/south span the X extent; east/west span the Z extent
  assert.ok(Math.abs(byId.north.width - byId.south.width) < 1e-9);
  assert.ok(Math.abs(byId.east.width - byId.west.width) < 1e-9);
  const rots = new Set(e.walls.map((w) => Math.round(w.rotationY * 1000) / 1000));
  assert.equal(rots.size, 4, 'expected four distinct wall orientations');
});

check('wall centre height is floor + height/2 and matches the requested height', () => {
  const height = 7;
  const e = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height });
  for (const w of e.walls) {
    assert.ok(Math.abs(w.height - height) < 1e-9);
    assert.ok(Math.abs(w.position[1] - (BMIN[1] + height / 2)) < 1e-9);
  }
});

check('ceiling is null by default and emitted (sized to spans) when requested', () => {
  const noCeil = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7 });
  assert.equal(noCeil.ceiling, null);
  const withCeil = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7, pad: 0.6, ceiling: true });
  assert.ok(withCeil.ceiling);
  assert.ok(withCeil.ceiling!.width > 0 && withCeil.ceiling!.depth > 0);
  assert.ok(Math.abs(withCeil.ceiling!.position[1] - (BMIN[1] + 7)) < 1e-9);
});

check('buildEnclosure is finite-safe against NaN bounds', () => {
  const e = buildEnclosure({ boundsMin: [NaN, NaN, NaN], boundsMax: [NaN, NaN, NaN], height: NaN });
  assert.equal(e.walls.length, 4);
  for (const w of e.walls) {
    assert.ok(w.position.every((n) => Number.isFinite(n)));
    assert.ok(Number.isFinite(w.width) && w.width > 0);
    assert.ok(Number.isFinite(w.height) && w.height > 0);
  }
});

check('buildEnclosure is deterministic (identical spec for identical input)', () => {
  const a = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7, pad: 0.6, ceiling: true });
  const b = buildEnclosure({ boundsMin: BMIN, boundsMax: BMAX, height: 7, pad: 0.6, ceiling: true });
  assert.deepEqual(a, b);
});

// ── C. LIVE WIRING ─────────────────────────────────────
console.log('\nC. live wiring');

check('the Enclosure component consumes the pure buildEnclosure core', () => {
  const src = read('components/three/enclosure.tsx');
  assert.ok(/from '@\/lib\/render\/environment'/.test(src), 'Enclosure must import the pure core');
  assert.ok(/buildEnclosure\(/.test(src), 'Enclosure must call buildEnclosure');
  assert.ok(/planeGeometry/.test(src), 'Enclosure must render wall geometry');
});

check('both dojo scenes import and mount the 4-wall Enclosure', () => {
  for (const f of ['components/games/karate-3d.tsx', 'components/games/karate-versus-3d.tsx']) {
    const src = read(f);
    assert.ok(/from '@\/components\/three\/enclosure'/.test(src), `${f} must import Enclosure`);
    assert.ok(/<Enclosure[\s\S]*boundsMin=\{MAP\.boundsMin\}/.test(src), `${f} must mount <Enclosure> from MAP bounds`);
  }
});

console.log(`\nM14-P6 environment: ${passed} checks passed.`);
