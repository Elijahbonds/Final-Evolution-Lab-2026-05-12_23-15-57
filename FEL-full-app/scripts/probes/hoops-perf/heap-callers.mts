// who calls a given app frame: aggregate full stacks containing it
import fs from 'node:fs';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
const [rawPath, mapPath, needle, depthArg] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const tm = new TraceMap(fs.readFileSync(mapPath, 'utf8'));
const lab = (cf: any) => { if (!cf.url) return `(native) ${cf.functionName}`; const o = originalPositionFor(tm, { line: cf.lineNumber + 1, column: cf.columnNumber }); const src = (o.source ?? '?').replace(/^.*dev\/core\/src\//, 'bjs:').replace(/^.*?(lib\/|components\/)/, '$1'); return `${src}:${o.line} ${cf.functionName}`; };
const parent = new Map(); const byId = new Map();
const walk = (n: any, p: any) => { parent.set(n.id, p); byId.set(n.id, n); for (const c of n.children) walk(c, n); }; walk(raw.profile.head, null);
const agg = new Map<string, number>();
for (const s of raw.profile.samples) {
  let n = byId.get(s.nodeId); const stack: string[] = [];
  while (n) { stack.push(lab(n.callFrame)); n = parent.get(n.id); }
  const i = stack.findIndex((x) => x.includes(needle)); if (i < 0) continue;
  const k = stack.slice(Math.max(0, i - 3), i + Number(depthArg ?? 6)).join('  <  ');
  agg.set(k, (agg.get(k) ?? 0) + s.size);
}
for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log((v / 1048576 / raw.secs).toFixed(2), k, '\n');
