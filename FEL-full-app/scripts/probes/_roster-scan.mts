// THE ROSTER, AS IT ACTUALLY IS (Phase 0). A static read of every registered mode: does it score, does it
// have an opponent, can it be won or lost, does it make sound, does it emit telemetry. Source scan rather
// than assumption, because both briefs describe a roster this repo does not have.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODES_DIR = path.join(ROOT, 'lib/babylon/modes');
const reg = fs.readFileSync(path.join(MODES_DIR, 'registry.ts'), 'utf8');

const strip = (s: string) => s.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => (m.startsWith('/') ? ' ' : m));

const modeBlock = /export const MODES[^{]*\{([\s\S]*?)\n\};/.exec(reg)?.[1] ?? '';
const enabledBlock = /export const ENABLED[^[]*\[([\s\S]*?)\n\]/.exec(reg)?.[1] ?? '';
const enabled = new Set([...enabledBlock.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]));
const entries = [...modeBlock.matchAll(/^\s{2}([a-z_0-9]+):\s*([A-Za-z0-9_]+)/gm)].map((m) => ({ key: m[1], sym: m[2] }));

// map the imported symbol to its file
const fileOf = new Map<string, string>();
for (const m of reg.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([A-Za-z0-9_]+)'/g)) {
  for (const sym of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim())) fileOf.set(sym, m[2] + '.ts');
}
for (const m of reg.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s*'\.\/([A-Za-z0-9_]+)'/g)) fileOf.set(m[1], m[2] + '.ts');

const rows: string[][] = [];
for (const { key, sym } of entries) {
  const f = fileOf.get(sym);
  let src = '';
  if (f && fs.existsSync(path.join(MODES_DIR, f))) src = strip(fs.readFileSync(path.join(MODES_DIR, f), 'utf8'));
  else {
    // some modes are factories inside a shared file (precisionModes, boardCore, aimSwingCore)
    for (const cand of fs.readdirSync(MODES_DIR)) {
      if (!cand.endsWith('.ts') || cand.includes('.test.')) continue;
      const s = fs.readFileSync(path.join(MODES_DIR, cand), 'utf8');
      if (new RegExp(`(export (const|function) )?${sym}\\b`).test(s)) { src = strip(s); break; }
    }
  }
  // FOLLOW THE FACTORY. Tennis is 28 lines and Volleyball 32 — the first run of this scan called them
  // stubs with no score, no opponent and no audio. They are thin CONFIGS over createNetSportMode, which is
  // good architecture: adding a net sport costs a config, not a rewrite. A baseline that mistakes delegation
  // for absence would have sent this whole pass off to rebuild two working modes.
  const delegates: string[] = [];
  for (const m of src.matchAll(/from\s*'\.\/([A-Za-z0-9_]+)'/g)) {
    const cand = path.join(MODES_DIR, m[1] + '.ts');
    if (fs.existsSync(cand) && /create[A-Za-z]*Mode|makeMode|Core/.test(m[1] + fs.readFileSync(cand, 'utf8').slice(0, 400))) {
      delegates.push(strip(fs.readFileSync(cand, 'utf8')));
    }
  }
  const all = [src, ...delegates].join('\n');
  const has = (re: RegExp) => (all && re.test(all) ? 'y' : '-');
  rows.push([
    key,
    enabled.has(key) ? 'ON' : 'off',
    f ?? '(shared)',
    has(/setHud\([^)]*score|score:|setHud\([^)]*(hits|pts|points)/),   // visible score of some kind
    has(/ctx\.end\(/),                          // win/lose terminal state
    has(/Brain|rival|foe|AI|opponent|brain/),   // an opponent
    has(/SoundKit\./),                          // audio
    has(/difficulty|tier|DIFF/i),               // difficulty tiers
    has(/resultSink|ctx\.end\(/),               // results path
    String(src ? src.split('\n').length : 0) + (delegates.length ? '+' : ''),
  ]);
}
const head = ['mode', 'nav', 'file', 'score', 'end', 'foe', 'audio', 'tiers', 'result', 'lines'];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r: string[]) => r.map((c, i) => c.padEnd(w[i])).join('  ');
console.log(line(head));
console.log(w.map((n) => '-'.repeat(n)).join('  '));
for (const r of rows) console.log(line(r));
console.log(`\n${rows.length} registered, ${rows.filter((r) => r[1] === 'ON').length} in nav`);
