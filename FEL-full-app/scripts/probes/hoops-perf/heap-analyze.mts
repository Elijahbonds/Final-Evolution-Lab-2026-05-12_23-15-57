// hoops-perf: re-read a saved heap profile (heap-profile.mts writes <OUT>/heap-<TAG>-<mode>.raw.json) against the bundle's source map.
//   npx tsx scripts/probes/hoops-perf/heap-analyze.mts <raw.json> <mode.js.map> [top N]
// Prints MB per game second by allocating site (top frame), by the first app frame above Babylon's (who asked), and by app chain.
import fs from 'node:fs';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

interface CallFrame { functionName: string; url: string; lineNumber: number; columnNumber: number }
interface Node { id: number; callFrame: CallFrame; selfSize: number; children: Node[] }
const [rawPath, mapPath, nArg] = process.argv.slice(2);
const N = Number(nArg ?? 30);
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as { secs: number; churn: { churn: number }; profile: { head: Node; samples: Array<{ size: number; nodeId: number }> } };
const tm = new TraceMap(fs.readFileSync(mapPath, 'utf8'));
const cache = new Map<string, { mod: string; line: number; name: string | null }>();
function origin(cf: CallFrame): { mod: string; line: number; name: string | null } {
  if (!cf.url) return { mod: '(native)', line: 0, name: cf.functionName || null };
  const k = `${cf.lineNumber}:${cf.columnNumber}`; const hit = cache.get(k); if (hit) return hit;
  const o = originalPositionFor(tm, { line: cf.lineNumber + 1, column: cf.columnNumber });
  const src = o.source ?? '?';
  const bjs = /dev\/(core|loaders)\/src\/(.*)$/.exec(src);
  const i = src.search(/(node_modules|lib|components|app|scripts)\//);
  const r = { mod: bjs ? `bjs:${bjs[2]}` : i >= 0 ? src.slice(i).replace(/^app\//, '') : src, line: o.line ?? 0, name: o.name ?? null };
  cache.set(k, r); return r;
}
const isApp = (mod: string) => !mod.startsWith('bjs:') && !mod.startsWith('node_modules/') && mod !== '?' && mod !== '(native)';
const parent = new Map<number, Node | null>(); const byId = new Map<number, Node>();
const walk = (n: Node, p: Node | null) => { parent.set(n.id, p); byId.set(n.id, n); for (const c of n.children) walk(c, n); };
walk(raw.profile.head, null);
const top = new Map<string, number>(), app = new Map<string, number>(), chain = new Map<string, number>(), appFile = new Map<string, number>();
let total = 0;
for (const s of raw.profile.samples) {
  const n = byId.get(s.nodeId); if (!n) continue;
  total += s.size;
  const o = origin(n.callFrame);
  const k = `${o.mod}:${o.line} ${n.callFrame.functionName || o.name || '(anon)'}`;
  top.set(k, (top.get(k) ?? 0) + s.size);
  const ch: string[] = []; let firstBjs = isApp(o.mod) ? '' : k;
  for (let a: Node | null = n; a; a = parent.get(a.id) ?? null) {
    const q = origin(a.callFrame);
    if (isApp(q.mod)) { ch.push(`${q.mod}:${q.line} ${a.callFrame.functionName || '(anon)'}`); if (ch.length >= 3) break; }
    else if (ch.length) break;
  }
  const ak = ch[0] ?? '(no app frame)';
  app.set(ak, (app.get(ak) ?? 0) + s.size);
  const f = ak.split(':')[0]; appFile.set(f, (appFile.get(f) ?? 0) + s.size);
  const ck = `${ch.join(' < ') || '(no app frame)'}  ⇐  ${firstBjs || '(app allocates itself)'}`;
  chain.set(ck, (chain.get(ck) ?? 0) + s.size);
}
const mb = (v: number) => (v / 1048576 / raw.secs).toFixed(2).padStart(6);
const show = (title: string, m: Map<string, number>, n = N) => { console.log(`\n== ${title}`); for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]).slice(0, n)) console.log(`${mb(v)}  ${k}`); };
console.log(`${rawPath}: ${raw.secs.toFixed(1)} game s · sampled ${mb(total)} MB/s · sweep churn ${mb(raw.churn.churn)} MB/s`);
show('by app file (who asked)', appFile, 25);
show('by first app frame', app);
show('by allocating frame', top);
show('by app chain ⇐ allocating Babylon frame', chain, 40);
