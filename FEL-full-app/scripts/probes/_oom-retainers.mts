// OOM-HYGIENE retainers — enter a /play mode, play a few seconds, leave it through the shell's own Home link (client-side
// navigation, the JS context survives), GC, then take a V8 heap snapshot and print the shortest strong retainer path from the
// GC roots to every Babylon Scene still in the heap. This is how "the scene is disposed but the heap only fell to 340 MB"
// gets a name. PORT=3047 MODE=karate_vs npx tsx --max-old-space-size=12000 scripts/probes/_oom-retainers.mts
import { chromium, request } from 'playwright-core';
const PORT = process.env.PORT ?? '3047', BASE = `http://localhost:${PORT}`, MODE = process.env.MODE ?? 'karate_vs';
const ROUTE: Record<string, string> = { try: '/try', karate: '/play/karate', karate_vs: '/play/karate-vs', skateboard: '/play/skateboard', tennis: '/play/tennis' };
const CLASS = process.env.CLASS ?? 'Scene';
const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const b = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
let storage: Awaited<ReturnType<Awaited<ReturnType<typeof request.newContext>>['storageState']>> | undefined;
if (MODE !== 'try') {
  const rc = await request.newContext({ baseURL: BASE });
  const csrf = (await (await rc.get('/api/auth/csrf')).json()).csrfToken as string;
  await rc.post('/api/auth/callback/credentials', { form: { csrfToken: csrf, email: 'playtest@fel.local', password: 'playtest-local-only', callbackUrl: `${BASE}/`, json: 'true' } });
  storage = await rc.storageState(); await rc.dispose();
}
const context = await b.newContext({ viewport: { width: 1280, height: 800 }, storageState: storage });
const p = await context.newPage();
const cdp = await context.newCDPSession(p);
const readyState = (): Promise<string> => p.evaluate('(document.getElementById("fel-ready") || {}).dataset ? (document.getElementById("fel-ready").dataset.state || "") : ""') as Promise<string>;
await p.goto(`${BASE}${ROUTE[MODE]}`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas', { timeout: 90000 });
for (let i = 0; i < 480; i++) { const s = await readyState(); if (s === 'loaded' || s === 'playing') break; await p.waitForTimeout(250); }
await p.waitForTimeout(800);
const btn = p.locator('button', { hasText: /TAP TO START/i }).first(); if (await btn.count()) await btn.click(); else await p.keyboard.press('Space');
await p.waitForTimeout(4500);
for (let i = 0; i < 6; i++) { await p.keyboard.down('w'); await p.waitForTimeout(300); await p.keyboard.up('w'); await p.keyboard.press('j'); await p.waitForTimeout(300); }
const home = p.locator('a[href="/"]', { hasText: /Home/ }).first();
if (await home.count()) { await home.dispatchEvent('click'); await p.waitForURL((u) => u.pathname === '/', { timeout: 30000 }).catch(() => {}); console.log('exited through the Home link'); }
else { console.log('no Home link — /try has no client-side exit; measuring the disposed scene after DUNK AGAIN is the loop probe\'s job'); }
await p.waitForTimeout(2000);
for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(300); }
console.log('heap MB', await p.evaluate('performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1'));

// ── snapshot ──
const chunks: string[] = []; let total = 0;
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e: { chunk: string }) => { chunks.push(e.chunk); total += e.chunk.length; });
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false });
console.log(`snapshot ${(total / 1048576).toFixed(0)} MB of JSON`);
await b.close();
type Snap = { snapshot: { meta: { node_fields: string[]; edge_fields: string[]; node_types: (string | string[])[]; edge_types: (string | string[])[] }; node_count: number; edge_count: number }; nodes: number[]; edges: number[]; strings: string[] };
const snap = JSON.parse(chunks.join('')) as Snap; chunks.length = 0;
const NF = snap.snapshot.meta.node_fields, EF = snap.snapshot.meta.edge_fields;
const NT = snap.snapshot.meta.node_types[0] as string[], ET = snap.snapshot.meta.edge_types[0] as string[];
const nType = NF.indexOf('type'), nName = NF.indexOf('name'), nEdges = NF.indexOf('edge_count'), nSize = NF.indexOf('self_size');
const eType = EF.indexOf('type'), eName = EF.indexOf('name_or_index'), eTo = EF.indexOf('to_node');
const NL = NF.length, EL = EF.length, nodes = snap.nodes, edges = snap.edges, strings = snap.strings;
const N = nodes.length / NL;
const firstEdge = new Uint32Array(N + 1); for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += nodes[i * NL + nEdges] * EL; } firstEdge[N] = edges.length;
// reverse index: for each node, the incoming edges (edge offset) — built as CSR
const inCount = new Uint32Array(N + 1);
for (let e = 0; e < edges.length; e += EL) inCount[edges[e + eTo] / NL + 1]++;
for (let i = 0; i < N; i++) inCount[i + 1] += inCount[i];
const inEdge = new Uint32Array(edges.length / EL); const fill = inCount.slice();
for (let i = 0; i < N; i++) for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += EL) inEdge[fill[edges[e + eTo] / NL]++] = e;
const nodeOf = (e: number): number => { let lo = 0, hi = N - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (firstEdge[mid] <= e) lo = mid; else hi = mid - 1; } return lo; };
const nameOf = (i: number): string => { const t = NT[nodes[i * NL + nType]]; const s = strings[nodes[i * NL + nName]]; return t === 'object' || t === 'closure' ? s : `${t}:${String(s).slice(0, 40)}`; };
const edgeLabel = (e: number): string => { const t = ET[edges[e + eType]]; const v = edges[e + eName]; return t === 'element' || t === 'hidden' ? `[${v}]` : `${t}:${strings[v]}`; };
// a WeakMap's backing table lists key→value pairs as internal edges — an ephemeron, not a retainer (the value lives only while the key does)
const isWeak = (e: number): boolean => { const t = ET[edges[e + eType]]; if (t === 'weak') return true; if (t === 'internal' || t === 'hidden') { const n = strings[edges[e + eName]]; return typeof n === 'string' && /WeakMap|WeakSet|WeakRef/.test(n); } return false; };
const isRoot = (i: number): boolean => NT[nodes[i * NL + nType]] === 'synthetic';
// what the heap is made of: self size by node name (the retained mode dominates a 40 MB baseline page)
const hist = new Map<string, [number, number]>(); let big: number[] = [];
for (let i = 0; i < N; i++) { const k = `${NT[nodes[i * NL + nType]]}:${String(strings[nodes[i * NL + nName]]).slice(0, 48)}`; const sz = nodes[i * NL + nSize]; const h = hist.get(k) ?? [0, 0]; h[0] += sz; h[1]++; hist.set(k, h); if (sz > 2 * 1048576) big.push(i); }
console.log('top classes by self size:'); for (const [k, [sz, n]] of [...hist.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 18)) console.log(`  ${(sz / 1048576).toFixed(1).padStart(7)} MB  ${String(n).padStart(8)}×  ${k}`);
big.sort((a, b) => nodes[b * NL + nSize] - nodes[a * NL + nSize]);
const targets: number[] = process.env.BIG ? big.slice(0, Number(process.env.BIG)) : []; for (let i = 0; i < N && !process.env.BIG; i++) if (NT[nodes[i * NL + nType]] === 'object' && strings[nodes[i * NL + nName]] === CLASS) targets.push(i);
console.log(`nodes over 2 MB: ${big.slice(0, 12).map((i) => `${nameOf(i)} ${(nodes[i * NL + nSize] / 1048576).toFixed(1)}MB`).join(' · ')}`);
console.log(`${targets.length} ${CLASS} object(s) in the heap; nodes ${N}, edges ${edges.length / EL}`);
for (const t of targets.slice(0, 6)) {
  // BFS upward over strong edges to the nearest synthetic root; print up to 3 distinct paths
  const prev = new Int32Array(N).fill(-1); const prevEdge = new Int32Array(N).fill(-1); prev[t] = t;
  const q: number[] = [t]; let found: number[] = [];
  for (let qi = 0; qi < q.length && found.length < 6; qi++) {
    const cur = q[qi];
    for (let k = inCount[cur]; k < inCount[cur + 1]; k++) {
      const e = inEdge[k]; if (isWeak(e)) continue;
      const from = nodeOf(e); if (prev[from] !== -1) continue;
      prev[from] = cur; prevEdge[from] = e;
      if (isRoot(from)) { found.push(from); if (found.length >= 6) break; }
      else if (q.length < 3_000_000) q.push(from);
    }
  }
  console.log(`\n${CLASS}#${t} self ${nodes[t * NL + nSize]} B — ${found.length} root path(s):`);
  for (const r of found) {
    const path: string[] = []; let cur = r;
    while (cur !== t && path.length < 40) { path.push(`${nameOf(cur)} —${edgeLabel(prevEdge[cur])}→`); cur = prev[cur]; }
    path.push(nameOf(t));
    console.log('  ' + path.join(' '));
  }
}
