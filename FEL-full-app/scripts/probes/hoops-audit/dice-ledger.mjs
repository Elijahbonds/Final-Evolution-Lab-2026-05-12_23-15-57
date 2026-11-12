// hoops-audit-play (2026-11-12): THE DICE LEDGER — every place a hoops mode settles a GAMEPLAY outcome with a random draw, by file:line,
// sorted into what it decides. Static (no browser, no build): it reads the source. A line is a candidate when it compares a draw
// (`roll()`, `Math.random()`, `rng()`, `rand()`) against something (`<`, `>=`) or rolls a make (`rimDecides` / `dunkVerdict` / `rimVerdictFor`);
// lines that only pick what the announcer, the crowd or a sound says are left out (mic, crowd, SoundKit, pitch, banner text), and so is a
// draw that only jitters a VISUAL path (a miss's lateral spray, a loose ball's scatter) — those are listed apart as "cosmetic".
//   node scripts/probes/hoops-audit/dice-ledger.mjs [--md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = [
  'lib/babylon/modes/OneVOneMode.ts', 'lib/babylon/modes/ThreeVThreeMode.ts', 'lib/babylon/modes/ThreePointMode.ts', 'lib/babylon/modes/DunkMode.ts',
  'lib/babylon/modes/DunkDuelMode.ts', 'lib/babylon/modes/carnivalEvents.ts', 'lib/babylon/modes/threevthreeRules.ts', 'lib/babylon/core/BasketballCore.ts',
  'lib/babylon/core/HandleSystem.ts', 'lib/babylon/core/HoopsDefense.ts', 'lib/babylon/core/HoopsOffball.ts', 'lib/babylon/core/TripleThreat.ts',
  'lib/babylon/core/HoopsMoves.ts', 'lib/babylon/core/ReachTell.ts', 'lib/babylon/hoops/rivalOffense.ts', 'lib/babylon/hoops/teamOffense3v3.ts',
  'lib/babylon/hoops/steals.ts', 'lib/babylon/hoops/blocks.ts', 'lib/babylon/core/DunkRivals.ts', 'lib/babylon/core/DunkRivalSim.ts',
];
const SKIP = /\bmic\b|mic\?|micSay|crowd\b|SoundKit|pitch|heckle|\.say\(|trash|announce/i;
const COSMETIC = /launch\(|launchLoose|new Vector3\(\(Math\.random|lateral:|\(Math\.random\(\) - 0\.5\)/;
const DRAW = /(roll\(\)|Math\.random\(\)|\brng\(\)|\brand\(\)|this\.rng\(\))\s*(<|>=|<=|>)|(<|>=)\s*(roll\(\)|Math\.random\(\))/;
const VERDICT = /\b(rimDecides|dunkVerdict|rimVerdictFor|rimDecidesExact)\(/;
const KIND = [
  [/rebound|board|REBOUND_JITTER|BOARD_JITTER|edge =/i, 'rebound'],
  [/block|swat|aiBlock|blockChance|jump/i, 'block'],
  [/steal|reach|strip|poke|aiReachGate/i, 'steal / reach'],
  [/ankle|bite|odds|jab|shimmy|pump|off_the_head|offTheHead|broke/i, 'move beats defender'],
  [/trick|showtime|SHOWTIME|dunk/i, 'dunk / trick make'],
  [/tipIn|tip/i, 'tip-in make'],
  [/rimDecides|Verdict|made|make/i, 'shot make (the ring at a rate)'],
  [/kick|catchAndShoot|pullUp|shooter|finish|openLane|DUNK_SHARE|drive|bank|intent|Intent|decide/i, 'AI decision'],
];
const rows = [], cosmetic = [];
for (const rel of FILES) {
  const f = path.join(APP, rel); if (!fs.existsSync(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const code = ln.replace(/\/\/.*$/, '');
    if (!(DRAW.test(code) || VERDICT.test(code))) return;
    if (SKIP.test(code)) return;
    if (COSMETIC.test(code) && !DRAW.test(code.replace(COSMETIC, ''))) { cosmetic.push(`${rel}:${i + 1}`); return; }
    if (/^\s*(export )?(function|const \w+ = \()/.test(code) && VERDICT.test(code) && !DRAW.test(code)) return;   // a definition, not a call
    const kind = (KIND.find(([re]) => re.test(code)) ?? [null, 'other'])[1];
    rows.push({ at: `${rel.replace('lib/babylon/', '')}:${i + 1}`, kind, code: code.trim().slice(0, 150) });
  });
}
const byKind = {}; for (const r of rows) (byKind[r.kind] ??= []).push(r);
if (process.argv.includes('--md')) {
  console.log('| what the draw decides | sites | where (file:line) |'); console.log('|---|---|---|');
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) console.log(`| ${k} | ${v.length} | ${v.map((r) => r.at).join(', ')} |`);
  console.log(`\ncosmetic only (a miss's or a loose ball's path): ${cosmetic.length} sites`);
} else {
  for (const [k, v] of Object.entries(byKind)) { console.log(`\n## ${k} (${v.length})`); for (const r of v) console.log(`  ${r.at}  ${r.code}`); }
  console.log(`\ncosmetic only: ${cosmetic.length}`);
}
