// Phase 5 guard — every mode's touch verbs must actually resolve.
//
// This exists because of a real, silent failure: Karate VS rendered
// <TouchOverlay modeId="karate_vs"> while MODE_VERBS was keyed "karate-vs".
// A missing key does not throw — it falls through to MODE_VERBS.default, which
// is a single generic ACTION button, so KICK, HEAVY and BLOCK became completely
// unreachable from touch and nothing anywhere reported a problem.
//
// That is the worst kind of bug: it degrades instead of failing. This scans the
// shipped host components for the modeId they actually pass and asserts each one
// has its own MODE_VERBS entry, so the next mode cannot repeat it.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_VERBS } from '../lib/babylon/ui/modeVerbs';
import { MODES } from '../lib/babylon/modes/registry';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const GAMES = join(process.cwd(), 'components', 'games');

/** Every modeId literal handed to a TouchOverlay in a shipped host component. */
function touchOverlayModeIds(): { file: string; modeId: string }[] {
  const out: { file: string; modeId: string }[] = [];
  for (const file of readdirSync(GAMES)) {
    if (!file.endsWith('.tsx')) continue;
    const src = readFileSync(join(GAMES, file), 'utf8');
    if (!src.includes('TouchOverlay')) continue;
    // Static literal form: modeId="threepoint"
    for (const m of src.matchAll(/<TouchOverlay[^>]*?modeId="([a-zA-Z_0-9-]+)"/gs)) {
      out.push({ file, modeId: m[1] });
    }
  }
  return out;
}

const found = touchOverlayModeIds();
ok(found.length > 0, `A1 found TouchOverlay usages to check (got ${found.length})`);

const seen = new Set<string>();
for (const { file, modeId } of found) {
  if (seen.has(modeId)) continue;
  seen.add(modeId);
  const has = Object.prototype.hasOwnProperty.call(MODE_VERBS, modeId);
  ok(has, `A-${modeId} has a MODE_VERBS entry (${file}) — without it the whole `
    + 'moveset silently degrades to the single default ACTION button');
}

// The default entry must still exist as the deliberate fallback, and must stay
// minimal — if it ever grew real verbs, a missing key would look "fine".
ok(Object.prototype.hasOwnProperty.call(MODE_VERBS, 'default'), 'B1 default entry exists');
ok(MODE_VERBS.default.buttons.filter((b) => b.emit !== null).length === 1,
  'B2 default is a single live button, so a missing key stays obvious');

// Every config must be exactly four slots — TouchOverlay places them positionally
// and a short array would leave a hole in the diamond.
for (const [key, cfg] of Object.entries(MODE_VERBS)) {
  ok(cfg.buttons.length === 4, `C-${key} declares exactly 4 slots (got ${cfg.buttons.length})`);
}

// ── Every verb a mode READS must exist on its overlay ───────────────────────
//
// Key alignment was only half the guard. Surf shipped with a correctly-keyed
// entry that offered TWO of its four verbs: SurfBreakMode reads B (cutback) and
// X (grab) and neither was on the overlay, so on a phone the cutback -- one of
// only two scoring actions a player can actively take -- simply did not exist.
// An absent slot renders as an inert button rather than failing, which is the
// same silent-degradation shape as the original karate_vs bug.
//
// So: read each mode's own source for the face buttons it acts on, and assert
// the overlay offers them. A mode that deliberately leaves a verb to gamepad
// only records it in EXEMPT with a reason, which makes that a decision instead
// of an oversight.
const MODE_SRC = join(process.cwd(), 'lib', 'babylon', 'modes');
const EXEMPT: Record<string, { btn: string; why: string }[]> = {
  // Showdown's L1/R1/SELECT specials already have no pad slot by design; the
  // face buttons it reads are all present.
};

const registryFile = readFileSync(join(MODE_SRC, 'registry.ts'), 'utf8');
/** registry key -> implementation file, read from the registry's own imports. */
function modeSources(): { key: string; file: string }[] {
  const out: { key: string; file: string }[] = [];
  for (const [, key, symbol] of registryFile.matchAll(/^\s{2}([a-z_0-9]+):\s*([A-Za-z0-9_]+),/gm)) {
    const imp = new RegExp(`import \\{[^}]*\\b${symbol}\\b[^}]*\\} from '\\.\\/([^']+)'`).exec(registryFile);
    if (imp) out.push({ key, file: `${imp[1]}.ts` });
  }
  return out;
}

for (const { key, file } of modeSources()) {
  const cfg = MODE_VERBS[key];
  if (!cfg) continue;                       // key coverage is asserted above
  let src: string;
  try { src = readFileSync(join(MODE_SRC, file), 'utf8'); } catch { continue; }

  // Buttons the mode acts on, grouped BY CONDITION. A mode that writes
  //   if (e.btn === 'A' || e.btn === 'B') fire()
  // is offering B as an alias for A, not as a second verb -- 3PT and Dance both
  // do exactly that, and demanding a B slot for them would be this guard
  // inventing work. So the unit is the disjunction: the action is reachable if
  // ANY button that triggers it is on the overlay. A standalone
  //   if (e.btn === 'X')
  // is a group of one and must be offered on its own.
  const groups: string[][] = [];
  for (const line of src.split('\n')) {
    const btns = [...line.matchAll(/e\.btn === '([ABXY])'/g)].map((m) => m[1]);
    if (btns.length) groups.push([...new Set(btns)]);
  }
  if (groups.length === 0) continue;

  const offered = new Set(
    cfg.buttons.map((b, i) => (b.label && b.label !== '—' ? ['A', 'B', 'X', 'Y'][i] : null)).filter(Boolean) as string[],
  );
  const seen = new Set<string>();
  for (const group of groups) {
    const id = group.join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    const exempt = group.every((b) => EXEMPT[key]?.some((e) => e.btn === b));
    ok(group.some((b) => offered.has(b)) || exempt,
      `${key}: acts on ${group.join(' or ')} in ${file} — the touch overlay offers none of them`);
  }
}

if (fail.length) {
  console.error(`verb-key-alignment-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`verb-key-alignment-tests: ${checks} checks green — every touch modeId resolves`);
