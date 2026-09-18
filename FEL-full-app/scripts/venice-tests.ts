#!/usr/bin/env -S yarn tsx
/**
 * scripts/venice-tests.ts — M14-P7 Venice Court Environment suite.
 * ================================================================
 * Phase 7 rings the open-air Venice basketball court with a deterministic
 * set of perimeter props (corner palms, boardwalk benches, chain-link
 * fence posts, lamp posts) derived by the PURE core lib/render/venice-court.ts
 * and rendered by the thin <VeniceSurround> component.
 *
 *   A. SURROUND GEOMETRY: buildCourtSurround emits palms at the 4 corners,
 *      benches, lamps and fence posts, all sitting OUTSIDE the navigable
 *      bounds on a padded perimeter; finite, deterministic, NaN-safe.
 *   B. CONSTANTS: the optional scanned-surround GLB path + transform are
 *      well-formed and finite.
 *   C. LIVE WIRING (static source invariants): the component consumes the
 *      pure core; all four Venice basketball scenes import and mount
 *      <VeniceSurround> bound to the map bounds; the core stays THREE-free.
 *
 * Run: yarn tsx scripts/venice-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  buildCourtSurround,
  VENICE_SURROUND_GLB,
  VENICE_SURROUND_TRANSFORM,
  type PropPlacement,
} from '@/lib/render/venice-court';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

const BOUNDS_MIN: [number, number, number] = [-13, 0, -13];
const BOUNDS_MAX: [number, number, number] = [13, 8, 13];
const PAD = 1.6;

function allFinite(v: number[]): boolean {
  return v.every((n) => Number.isFinite(n));
}
function outsideBounds(x: number, z: number): boolean {
  // must be outside the raw navigable bounds (allowing the bench inset of 0.4)
  return x <= BOUNDS_MIN[0] - 0.01 || x >= BOUNDS_MAX[0] + 0.01 || z <= BOUNDS_MIN[2] - 0.01 || z >= BOUNDS_MAX[2] + 0.01;
}

// ── A. SURROUND GEOMETRY ─────────────────────────────────────
console.log('\nA. surround geometry');

const spec = buildCourtSurround({ boundsMin: BOUNDS_MIN, boundsMax: BOUNDS_MAX, pad: PAD });

check('produces a non-empty prop list and a padded perimeter', () => {
  assert.ok(spec.props.length > 8, `too few props: ${spec.props.length}`);
  const p = spec.perimeter;
  assert.ok(allFinite([p.minX, p.maxX, p.minZ, p.maxZ, p.floorY]));
  assert.ok(p.minX < BOUNDS_MIN[0] && p.maxX > BOUNDS_MAX[0], 'perimeter not padded on X');
  assert.ok(p.minZ < BOUNDS_MIN[2] && p.maxZ > BOUNDS_MAX[2], 'perimeter not padded on Z');
});

check('exactly 4 palms, one per corner, outside the bounds', () => {
  const palms = spec.props.filter((p) => p.kind === 'palm');
  assert.equal(palms.length, 4, `expected 4 palms, got ${palms.length}`);
  const ids = new Set(palms.map((p) => p.id));
  ['palm-nw', 'palm-ne', 'palm-sw', 'palm-se'].forEach((id) => assert.ok(ids.has(id), `missing ${id}`));
  for (const p of palms) {
    assert.ok(outsideBounds(p.position[0], p.position[2]), `palm ${p.id} inside bounds`);
    assert.ok(Number.isFinite(p.rotationY));
  }
});

check('has benches, lamps and fence posts', () => {
  const kinds = spec.props.reduce<Record<string, number>>((a, p) => ((a[p.kind] = (a[p.kind] || 0) + 1), a), {});
  assert.ok((kinds.bench ?? 0) >= 4, `expected >=4 benches, got ${kinds.bench}`);
  assert.ok((kinds.lamp ?? 0) >= 2, `expected >=2 lamps, got ${kinds.lamp}`);
  assert.ok((kinds.fencePost ?? 0) >= 8, `expected >=8 fence posts, got ${kinds.fencePost}`);
});

check('every fence post lies on the padded perimeter edge', () => {
  const posts = spec.props.filter((p) => p.kind === 'fencePost');
  const { minX, maxX, minZ, maxZ } = spec.perimeter;
  const eps = 1e-6;
  for (const p of posts) {
    const [x, , z] = p.position;
    const onXedge = Math.abs(x - minX) < eps || Math.abs(x - maxX) < eps;
    const onZedge = Math.abs(z - minZ) < eps || Math.abs(z - maxZ) < eps;
    assert.ok(onXedge || onZedge, `fence post ${p.id} not on perimeter (${x},${z})`);
  }
});

check('all prop positions and scales are finite', () => {
  for (const p of spec.props) {
    assert.ok(allFinite(p.position), `non-finite position on ${p.id}`);
    assert.ok(Number.isFinite(p.rotationY) && Number.isFinite(p.scale), `non-finite rot/scale on ${p.id}`);
  }
});

check('is deterministic for identical options', () => {
  const a = buildCourtSurround({ boundsMin: BOUNDS_MIN, boundsMax: BOUNDS_MAX, pad: PAD });
  const b = buildCourtSurround({ boundsMin: BOUNDS_MIN, boundsMax: BOUNDS_MAX, pad: PAD });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

check('NaN bounds collapse to a well-formed fallback ring', () => {
  const bad = buildCourtSurround({
    boundsMin: [NaN, NaN, NaN] as any,
    boundsMax: [NaN, NaN, NaN] as any,
  });
  assert.ok(bad.props.length > 8);
  for (const p of bad.props) assert.ok(allFinite(p.position), `non-finite fallback pos on ${p.id}`);
  const per = bad.perimeter;
  assert.ok(allFinite([per.minX, per.maxX, per.minZ, per.maxZ, per.floorY]));
});

check('pad widens the ring monotonically', () => {
  const near = buildCourtSurround({ boundsMin: BOUNDS_MIN, boundsMax: BOUNDS_MAX, pad: 0.5 });
  const far = buildCourtSurround({ boundsMin: BOUNDS_MIN, boundsMax: BOUNDS_MAX, pad: 4 });
  assert.ok(far.perimeter.maxX > near.perimeter.maxX, 'larger pad did not widen ring');
  assert.ok(far.perimeter.minZ < near.perimeter.minZ, 'larger pad did not widen ring');
});

// ── B. CONSTANTS ─────────────────────────────────────────────
console.log('\nB. surround constants');

check('scanned surround GLB path is a public model path', () => {
  assert.ok(VENICE_SURROUND_GLB.startsWith('/models/maps/'), VENICE_SURROUND_GLB);
  assert.ok(VENICE_SURROUND_GLB.endsWith('.glb'));
});

check('surround transform is finite', () => {
  assert.ok(Number.isFinite(VENICE_SURROUND_TRANSFORM.scale));
  assert.ok(Number.isFinite(VENICE_SURROUND_TRANSFORM.rotationY));
  assert.ok(allFinite(VENICE_SURROUND_TRANSFORM.position));
});

// ── C. LIVE WIRING ───────────────────────────────────────────
console.log('\nC. live wiring (static source invariants)');

check('pure core has no THREE / react imports', () => {
  const src = read('lib/render/venice-court.ts');
  assert.ok(!/from ['"]three['"]/.test(src), 'core imports three');
  assert.ok(!/from ['"]react['"]/.test(src), 'core imports react');
});

check('VeniceSurround component consumes the pure core', () => {
  const src = read('components/three/venice-surround.tsx');
  assert.ok(/buildCourtSurround/.test(src), 'component does not call buildCourtSurround');
  assert.ok(/@\/lib\/render\/venice-court/.test(src), 'component does not import the core');
  assert.ok(/planeGeometry|cylinderGeometry|coneGeometry|boxGeometry/.test(src), 'component renders no primitives');
});

for (const f of ['basketball-3d', 'one-v-one-3d', 'three-point-3d', 'three-v-three-3d']) {
  check(`${f} imports and mounts <VeniceSurround> bound to the map bounds`, () => {
    const src = read(`components/games/${f}.tsx`);
    assert.ok(/import \{ VeniceSurround \} from '@\/components\/three\/venice-surround'/.test(src), `${f} missing import`);
    assert.ok(/<VeniceSurround\b/.test(src), `${f} missing mount`);
    assert.ok(/boundsMin=\{MAP\.boundsMin\}/.test(src), `${f} not bound to MAP.boundsMin`);
    assert.ok(/boundsMax=\{MAP\.boundsMax\}/.test(src), `${f} not bound to MAP.boundsMax`);
  });
}

console.log(`\n\u2713 venice-tests: ${passed} checks passed`);
