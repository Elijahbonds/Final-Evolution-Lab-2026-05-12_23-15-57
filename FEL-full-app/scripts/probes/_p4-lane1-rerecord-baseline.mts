// One-off, scoped baseline re-record for MIRROR-COACH P4 lane 1 (registry-and-lunge), 2026-09-25.
//
// Deliberately NOT the full scripts/probes/_mirror-baseline.mts --write: that script regenerates every fixture
// lib/mirror/fixtures/<name>.json from the LIVE lib/mirror/fixtures/build.ts first, and build.ts currently carries
// OTHER lanes' uncommitted, in-flight work (hinge/push-up/carry stations — lib/mirror/fixtures/build.ts is modified
// on disk by a session other than this one, and lib/mirror/fixtures/pushup_side.json is already out of step with it,
// per fixtures.test.ts layer 1, unrelated to anything this lane touched). Regenerating fixtures here would bake an
// unreviewed, in-progress change from another lane into a committed-looking fixture file — not this lane's call.
//
// This does exactly the second half of that script: read every fixture EXACTLY as stored on disk (untouched) and
// re-run lib/mirror/fixtures/measure.ts's recordBaseline over them, so lib/mirror/fixtures/baseline.json reflects
// only the real code changes this lane made (squat-audit.ts heel-rise + cue-engine.ts priority + lungeAudit.ts F4 +
// framing.ts F6 + fixtures/measure.ts's own rep-count fix) against the SAME, unchanged fixture geometry.
import { writeFileSync } from 'node:fs';
import * as buildNs from '../../lib/mirror/fixtures/build.ts';
import * as loadNs from '../../lib/mirror/fixtures/load.ts';
import * as measureNs from '../../lib/mirror/fixtures/measure.ts';

// the app's modules load as CommonJS under tsx: the named exports sit on the default (scripts/body/seam.mts)
const unwrap = <T,>(ns: T): T => ((ns as unknown as { default?: T }).default ?? ns);
const B = unwrap(buildNs), L = unwrap(loadNs), M = unwrap(measureNs);

const NAMES = [...B.FIXTURE_NAMES];
const disk = new Map(NAMES.map((n) => [n, L.readFixture(n)]));
const load = (n: string) => disk.get(n)!;
const mirror = M.recordBaseline(NAMES, load);
writeFileSync(L.BASELINE_PATH, `${JSON.stringify(mirror, null, 2)}\n`);
console.log('recorded lib/mirror/fixtures/baseline.json from the ON-DISK fixtures (none regenerated)');
