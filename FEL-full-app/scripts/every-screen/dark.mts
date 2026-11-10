// EVERY-SCREEN phase 1: which screens are DARK, and what turns each on.
//
// Several features are built but switched off until their database tables exist (lib/coach/pendingSchema.ts; the files
// are in prisma/pending/, the owner's command is in docs/PENDING-SQL.md). Two measurements say exactly which screens:
//
//   1. STATIC   every page and API route is followed through its imports to the raw SQL it runs; a quoted table name
//               that only a pending file creates ties the screen to that file. (A screen is also tied to the routes it
//               called while loading, which the crawl recorded.)
//   2. LIT      the same build is served a second time on a second throwaway database that has every pending file
//               applied (rig.mts litDbUp). Each scored screen's server HTML and each GET /api it called are fetched on
//               both, as the same person, and compared. A screen whose words or answers change is dark today.
//
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/dark.mts          → <ES_OUT>/dark.json
//   npx tsx scripts/every-screen/dark.mts --static                                                 the static part only
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, STATE, litDbUp, originOf, people as makePeople, seedCoaching, serve, type People, type Person } from './rig.mts';
import { discover, layoutsOf } from './routes.mts';
import { readResults } from './results.mts';

// ── static: file → pending files ─────────────────────────────────────────────────────────────────────────────────────
const PENDING = join(ROOT, 'prisma/pending');
/** table → the pending file that creates it, for tables that are NOT in prisma/schema.prisma (the raw-SQL features) */
export function pendingTables(): Map<string, string> {
  const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
  const inSchema = new Set([...[...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]), ...[...schema.matchAll(/@@map\("(\w+)"\)/g)].map((m) => m[1])]);
  const hasColumn = (model: string, col: string) => { const m = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema); return !!m && new RegExp(`^\\s+${col}\\s`, 'm').test(m[1]); };
  const out = new Map<string, string>();
  for (const f of readdirSync(PENDING).filter((x) => x.endsWith('.sql')).sort()) {
    const sqlText = readFileSync(join(PENDING, f), 'utf8');
    for (const m of sqlText.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"/gi)) if (!inSchema.has(m[1])) out.set(m[1], f);
    // a column added to an existing table (User.dob) switches a feature the same way
    for (const m of sqlText.matchAll(/ALTER TABLE "(\w+)"\s+ADD COLUMN (?:IF NOT EXISTS )?"(\w+)"/gi)) if (!hasColumn(m[1], m[2])) out.set(`${m[1]}.${m[2]}`, f);
  }
  return out;
}

const SRC_EXT = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of SRC_EXT) if (existsSync(base + e)) return base + e;
  return null;
}
const importCache = new Map<string, string[]>();
function importsOf(file: string): string[] {
  if (importCache.has(file)) return importCache.get(file)!;
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) { const r = resolveImport(file, m[1]); if (r && !r.includes('node_modules')) out.push(r); }
  importCache.set(file, out);
  return out;
}
const tableCache = new Map<string, Set<string>>();
/** the pending files a source file reaches through its imports (raw SQL names its table in double quotes) */
export function pendingFilesFor(entry: string, tables = pendingTables()): Set<string> {
  if (tableCache.has(entry)) return tableCache.get(entry)!;
  const seen = new Set<string>(); const queue = [entry]; const hit = new Set<string>();
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, 'utf8');
    if (/\$queryRaw|\$executeRaw|pendingProbe|queryRawUnsafe/.test(src)) for (const [t, file] of tables) { const [table, col] = t.split('.'); if (col ? src.includes(`"${table}"`) && src.includes(`"${col}"`) : src.includes(`"${table}"`)) hit.add(file); }
    // the export / erase and retention registries name every table by design: they are not a screen's own reads
    for (const i of importsOf(f)) if (!seen.has(i) && !/\/lib\/(data-rights|retention)\//.test(i)) queue.push(i);
  }
  tableCache.set(entry, hit);
  return hit;
}
/** the route.ts file that answers an /api path */
export function apiRouteFile(path: string): string | null {
  const segs = path.split('?')[0].split('/').filter(Boolean);
  let dir = join(ROOT, 'app');
  for (const s of segs) {
    const exact = join(dir, s);
    if (existsSync(exact) && statSync(exact).isDirectory()) { dir = exact; continue; }
    const dyn = readdirSync(dir).find((d) => /^\[.+\]$/.test(d) && statSync(join(dir, d)).isDirectory());
    if (!dyn) return null;
    dir = join(dir, dyn);
  }
  const f = join(dir, 'route.ts');
  return existsSync(f) ? f : null;
}

// ── lit: the same screen with and without its tables ─────────────────────────────────────────────────────────────────
const textOf = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, '\n').replace(/&[a-z#0-9]+;/g, ' ')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
/** the parts of a JSON answer that say on / off: booleans, nulls, array sizes and string flags, by key path (3 levels) */
function shape(v: unknown, depth = 0): unknown {
  if (v === null || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object' && depth < 3) return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !/id$|At$|token|date|time|name|email/i.test(k)).map(([k, x]) => [k, shape(x, depth + 1)]));
  if (typeof v === 'string') return v.length < 24 && /^[a-z_]+$/.test(v) ? v : 'str';
  return typeof v;
}

export interface DarkRow {
  route: string; tc: boolean; phase: number;
  /** the pending files the screen reaches (its page, its layouts, and the routes it called while loading) */
  files: string[];
  /** words the screen's server HTML shows only without the tables / only with them */
  darkOnly: string[]; litOnly: string[];
  /** GET /api answers that differ */
  apis: { url: string; dark: string; lit: string; files: string[] }[];
  statusDark?: number; statusLit?: number;
}

async function litCompare(): Promise<DarkRow[]> {
  // two FRESH databases that differ only by the pending tables: neither has been walked on or scored against
  litDbUp('cmp'); litDbUp(true);
  const ORIGIN = originOf('cmp'), LIT_ORIGIN = originOf(true);
  const stopA = await serve(join(STATE, 'server-cmp.log'), 'cmp');
  const stopB = await serve(join(STATE, 'server-lit.log'), true);
  try {
    const dark = await makePeople(true, 'cmp');
    const lit = await makePeople(true, true);
    console.log(await seedCoaching(dark, 'cmp').catch((e) => `dark coached pair: failed (${String(e).slice(0, 120)})`));
    console.log(await seedCoaching(lit, true).catch((e) => `lit coached pair: failed (${String(e).slice(0, 120)})`));
    const tables = pendingTables();
    const get = async (origin: string, p: People, who: Person | null, url: string) => {
      const r = await fetch(origin + url, { redirect: 'manual', headers: who && p.cookies[who] ? { cookie: p.cookies[who] } : {} }).catch(() => null);
      return { status: r?.status ?? 0, body: r ? await r.text() : '' };
    };
    const rows: DarkRow[] = [];
    const screens = new Map(discover().map((s) => [s.route, s]));
    for (const r of readResults()) {
      const s = screens.get(r.route);
      if (!s || !r.url || r.state === 'not-scored' && !r.persona) continue;
      const who = r.persona ?? 'solo';
      const files = new Set<string>();
      for (const f of [s.file, ...layoutsOf(s.file)]) for (const x of pendingFilesFor(join(ROOT, f), tables)) files.add(x);
      // a token made on the dark database means nothing on the lit one: only fixed addresses are compared
      const fixed = !/\/(join|trainer)\/[^/]{12,}|[?&]slot=/.test(r.url);
      const a = fixed ? await get(ORIGIN, dark, who, r.url) : { status: 0, body: '' };
      const b = fixed ? await get(LIT_ORIGIN, lit, who, r.url) : { status: 0, body: '' };
      const ta = new Set(textOf(a.body)), tb = new Set(textOf(b.body));
      const strip = (l: string) => !/Rig |every-screen\.test|^\d+$|^[a-z0-9]{20,}$/i.test(l);
      const row: DarkRow = { route: r.route, tc: r.tc, phase: r.phase, files: [], darkOnly: [...ta].filter((l) => !tb.has(l) && strip(l)).slice(0, 8), litOnly: [...tb].filter((l) => !ta.has(l) && strip(l)).slice(0, 8), apis: [], statusDark: a.status, statusLit: b.status };
      for (const api of r.apis ?? []) {
        const rf = apiRouteFile(api.url);
        const af = rf ? [...pendingFilesFor(rf, tables)] : [];
        const x = await get(ORIGIN, dark, who, api.url), y = await get(LIT_ORIGIN, lit, who, api.url);
        let sx = `${x.status}`, sy = `${y.status}`;
        try { sx += ' ' + JSON.stringify(shape(JSON.parse(x.body))); sy += ' ' + JSON.stringify(shape(JSON.parse(y.body))); } catch { /* not JSON */ }
        if (sx !== sy) { row.apis.push({ url: api.url, dark: sx.slice(0, 260), lit: sy.slice(0, 260), files: af }); for (const f of af) files.add(f); }
      }
      row.files = [...files].sort();
      if (row.darkOnly.length || row.litOnly.length || row.apis.length || a.status !== b.status) rows.push(row);
    }
    return rows;
  } finally { stopB(); stopA(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tables = pendingTables();
  if (process.argv.includes('--static')) {
    const out: Record<string, string[]> = {};
    for (const s of discover()) { const hit = new Set<string>(); for (const f of [s.file, ...layoutsOf(s.file)]) for (const x of pendingFilesFor(join(ROOT, f), tables)) hit.add(x); if (hit.size) out[s.route] = [...hit].sort(); }
    console.log(JSON.stringify({ tables: Object.fromEntries(tables), pages: out }, null, 1));
  } else {
    const rows = await litCompare();
    writeFileSync(join(STATE, 'dark.json'), JSON.stringify({ when: new Date().toISOString(), tables: Object.fromEntries(tables), rows }, null, 1));
    for (const r of rows) console.log(`${r.route.padEnd(36)} ${r.statusDark}/${r.statusLit}  html -${r.darkOnly.length} +${r.litOnly.length}  api ${r.apis.length}  ${r.files.join(', ')}`);
    console.log(`${rows.length} screens differ with the tables applied → ${relative(process.cwd(), join(STATE, 'dark.json'))}`);
    process.exit(0);
  }
}
