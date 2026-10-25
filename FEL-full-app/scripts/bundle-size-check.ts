#!/usr/bin/env -S npx tsx
// Bundle check: first-load JS per route, and the JS a game needs before it can load its mode (PERF-LOAD PRF-08, 2026-10-25).
//
// The audit (docs/audits/MODE_GAP_AUDIT.md gap #2) read `next build`'s table once: /play/mirror shipped 2.03 MB of first-load
// JS, 12x every other route, and /play/map-preview 362 kB. FEATURE_INVENTORY.md:112 says the mirror was fixed "until today"
// (2026-09-12); nothing has measured it since, and a `next build` is ~25 minutes this check does not need. esbuild reads the
// same import graph in seconds:
//
//   ROUTES  every app/**/page.tsx. Its client entries are the 'use client' files the page reaches through server files (the
//           server files themselves never ship). The route's first-load JS = the static closure of those entries, bundled
//           and minified, with React and Next left out (the framework is shared by every route; `next build` adds ~87 kB of
//           it to each). A next/dynamic import() is a separate chunk: not first-load, as in Next.
//   GAMES   every components/games/*-babylon.tsx host, per mode key it mounts: the host's chunk (what next/dynamic fetches
//           when the game screen opens) plus that mode's own chunk when the host mounts through lazyRegistry.ts. Before
//           PRF-05 a host that imported registry.ts carried all 30 modes; this is the number that shows it.
//
//   npx tsx scripts/bundle-size-check.ts                 # print both tables, check against scripts/bundle-size-budget.json
//   npx tsx scripts/bundle-size-check.ts --write         # re-measure and write the budget (measured x 1.15, rounded up)
//   ONLY=play/mirror,play/map-preview npx tsx scripts/bundle-size-check.ts   # a subset (no budget write)
//
// A route or game over its budget fails (exit 1). A budget is a measurement plus headroom, like mobileBudget.json: grow a
// route on purpose, re-measure with --write and say why in the commit.
import { build, type Plugin } from 'esbuild';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const BUDGET_FILE = join(ROOT, 'scripts/bundle-size-budget.json');
const HEADROOM = 1.15;
const WRITE = process.argv.includes('--write');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

/** The framework every route shares: left out, as `next build`'s per-route column leaves its shared chunk apart. */
const FRAMEWORK = /^(react|react-dom|next|scheduler)(\/|$)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
/** Resolve a first-party specifier ('@/…' or relative) to a file, or null for a package. */
function resolveLocal(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, ...EXTS.map((x) => base + x), ...EXTS.map((x) => join(base, 'index' + x))]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src);
/** Static imports only (type-only imports carry no code; import() is a separate chunk). */
function staticImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out;
}

/** A route's client entries: the 'use client' files its page reaches through server files. */
function clientEntries(page: string): string[] {
  const seen = new Set<string>(); const entries = new Set<string>();
  const visit = (f: string) => {
    if (seen.has(f)) return; seen.add(f);
    const src = readFileSync(f, 'utf8');
    if (f !== page && isClient(src)) { entries.add(f); return; }
    if (f === page && isClient(src)) { entries.add(f); return; }   // a client page ships whole
    for (const s of staticImports(src)) { const r = resolveLocal(s, f); if (r) visit(r); }
  };
  visit(page);
  return [...entries].sort();
}

const assetStub: Plugin = {
  name: 'assets',
  setup(b) {
    b.onResolve({ filter: /\.(css|scss|svg|png|jpe?g|webp|gif|glb|gltf|wasm|mp3|wav|ogg|json5)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default ""', loader: 'js' }));
  },
};

interface Sized { bytes: number; gzip: number }

/** The static closure of some files, bundled and minified as one script: every import() stays out (a separate chunk, as in
 *  Next), and so does the framework. Its size is what those files cost before anything lazy is fetched. */
async function staticSize(files: string[]): Promise<Sized> {
  // every export kept (a bare `import 'x'` would let esbuild drop a component module whose code is all exports)
  const contents = files.map((f, i) => `export * as __e${i} from ${JSON.stringify(f)};`).join('\n');
  const r = await build({
    absWorkingDir: ROOT, stdin: { contents, resolveDir: ROOT, loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2020',
    minify: true, write: false, logLevel: 'silent', tsconfig: join(ROOT, 'tsconfig.json'), jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*', 'scheduler', 'node:*', 'fs', 'path', 'crypto', 'stream', 'zlib', 'os', 'url', 'util', 'http', 'https', 'net', 'tls', 'child_process', 'worker_threads'],
    plugins: [assetStub, { name: 'lazy-out', setup(b) { b.onResolve({ filter: /.*/ }, (a) => (a.kind === 'dynamic-import' ? { path: a.path, external: true } : undefined)); } }],
  });
  const out = r.outputFiles[0].contents;
  return { bytes: out.byteLength, gzip: gzipSync(out).byteLength };
}

const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;

async function routes(): Promise<Record<string, Sized>> {
  const pages = walk(join(ROOT, 'app')).filter((f) => /[/\\]page\.tsx?$/.test(f));
  const res: Record<string, Sized> = {};
  for (const page of pages) {
    const route = relative(join(ROOT, 'app'), dirname(page)).replace(/\\/g, '/') || '/';
    if (ONLY && !ONLY.includes(route)) continue;
    const entries = clientEntries(page);
    if (!entries.length) { res[route] = { bytes: 0, gzip: 0 }; continue; }
    try {
      res[route] = await staticSize(entries);
    } catch (e) {
      console.warn(`  ? ${route}: ${String((e as Error).message).split('\n')[0].slice(0, 160)}`);
    }
  }
  return res;
}

/** The mode keys a host mounts: MODES.<key>, MODES['<key>'], or a factory's modeKey: '<key>' / first string argument. */
function hostKeys(src: string, lazyKeys: string[]): string[] {
  const keys = new Set<string>();
  for (const m of src.matchAll(/MODES(?:\.([a-z_0-9]+)|\[['"]([a-z_0-9]+)['"]\])/g)) keys.add(m[1] ?? m[2]);
  return [...keys].filter((k) => lazyKeys.includes(k));
}

async function games(): Promise<Record<string, Sized>> {
  const lazySrc = readFileSync(join(ROOT, 'lib/babylon/modes/lazyRegistry.ts'), 'utf8');
  const lazyFile = new Map([...lazySrc.matchAll(/^\s+([a-z_0-9]+): ref\('[a-z_0-9]+', \(\) => import\('\.\/([A-Za-z]+)'\)/gm)].map((m) => [m[1], join(ROOT, 'lib/babylon/modes', m[2] + '.ts')]));
  // keyed hosts (board, timing, air, sprint) take their key from the files that mount them: modeKey="<key>" / modeKey: '<key>'
  // (the player's routes and the components that mount a host; /dev pages mount anything and are not counted)
  const sources = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'components'))].filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.') && !/[/\\]app[/\\]dev[/\\]/.test(f)).map((f) => readFileSync(f, 'utf8'));
  const hosts = readdirSync(join(ROOT, 'components/games')).filter((f) => /-babylon\.tsx$/.test(f)).sort();
  const res: Record<string, Sized> = {};
  for (const h of hosts) {
    const file = join(ROOT, 'components/games', h);
    const src = readFileSync(file, 'utf8');
    const name = h.replace(/\.tsx$/, '');
    let keys = hostKeys(src, [...lazyFile.keys()]);
    if (!keys.length && /MODES\[/.test(src)) {
      const users = sources.filter((t) => t.includes(`games/${name}'`) || t.includes(`games/${name}"`));
      const found = new Set<string>();
      for (const t of users) {
        for (const m of t.matchAll(/modeKey(?:=\{?|:\s*)['"]([a-z_0-9]+)['"]/g)) found.add(m[1]);
        for (const m of t.matchAll(/make\w*Host\(\s*['"]([a-z_0-9]+)['"]/g)) found.add(m[1]);
      }
      keys = [...found].filter((k) => lazyFile.has(k));
    }
    if (ONLY && !ONLY.some((o) => name.includes(o) || keys.includes(o))) continue;
    try {
      // a host on lazyRegistry.ts fetches its mode's chunk next: count it with the host (the host on registry.ts carries it already)
      const lazy = /modes\/lazyRegistry/.test(src);
      if (!keys.length) { res[name] = await staticSize([file]); continue; }
      for (const k of keys) res[`${name}:${k}`] = await staticSize(lazy && lazyFile.get(k) ? [file, lazyFile.get(k)!] : [file]);
    } catch (e) {
      console.warn(`  ? ${name}: ${String((e as Error).message).split('\n')[0].slice(0, 160)}`);
    }
  }
  return res;
}

interface Budget { measuredAt: string; headroom: number; routes: Record<string, number>; games: Record<string, number> }

async function main(): Promise<void> {
  const t0 = Date.now();
  const R = await routes();
  const G = await games();
  console.log(`bundle-size-check (${((Date.now() - t0) / 1000).toFixed(0)} s): minified first-party JS, React/Next left out; gzip in brackets`);
  console.log('\nROUTES (first-load: the page\'s client entries and their static imports)');
  for (const [k, v] of Object.entries(R).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`  ${k.padEnd(44)} ${kb(v.bytes).padStart(9)} (${kb(v.gzip)})`);
  console.log('\nGAMES (the host\'s chunk + its mode\'s chunk: what loads when the game screen opens)');
  for (const [k, v] of Object.entries(G).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`  ${k.padEnd(44)} ${kb(v.bytes).padStart(9)} (${kb(v.gzip)})`);

  if (WRITE && !ONLY) {
    const up = (n: number) => Math.ceil((n * HEADROOM) / 1024) * 1024;
    const b: Budget = {
      measuredAt: new Date().toISOString().slice(0, 10), headroom: HEADROOM,
      routes: Object.fromEntries(Object.entries(R).sort().map(([k, v]) => [k, up(v.bytes)])),
      games: Object.fromEntries(Object.entries(G).sort().map(([k, v]) => [k, up(v.bytes)])),
    };
    writeFileSync(BUDGET_FILE, JSON.stringify(b, null, 2) + '\n');
    console.log(`\nwrote ${relative(ROOT, BUDGET_FILE)}`);
  } else if (existsSync(BUDGET_FILE)) {
    const b = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as Budget;
    const over: string[] = [];
    for (const [k, v] of Object.entries(R)) if (b.routes[k] != null && v.bytes > b.routes[k]) over.push(`route ${k}: ${kb(v.bytes)} > budget ${kb(b.routes[k])}`);
    for (const [k, v] of Object.entries(G)) if (b.games[k] != null && v.bytes > b.games[k]) over.push(`game ${k}: ${kb(v.bytes)} > budget ${kb(b.games[k])}`);
    if (over.length) { console.error(`\nbundle-size-check: ${over.length} over budget (${b.measuredAt})`); for (const o of over) console.error('  ✗ ' + o); process.exit(1); }
    console.log(`\nbundle-size-check: every measured route and game is inside its budget (${b.measuredAt})`);
  }
}

void main();
