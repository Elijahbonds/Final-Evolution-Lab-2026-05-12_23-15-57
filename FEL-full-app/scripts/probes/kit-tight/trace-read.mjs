// kit-tight: read an every-screen tap trace (score.mts ES_TRACE): the tap's event, the long main-thread tasks round it, and
// the user-timing marks (fel-kit:* = the garment sets, fel-char:* = a body load) inside that window.
//   node scripts/probes/kit-tight/trace-read.mjs <trace.json>
import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(process.argv[2], 'utf8')); const ev = t.traceEvents ?? t;
const main = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
const onMain = (e) => main.has(`${e.pid}:${e.tid}`);
const taps = ev.filter((e) => e.name === 'EventDispatch' && /pointerup|click|touchend|pointerdown/.test(e.args?.data?.type ?? '') && onMain(e));
const t0 = taps.length ? Math.min(...taps.map((e) => e.ts)) : null;
console.log('tap events', taps.map((e) => `${e.args.data.type}@${((e.ts - (t0 ?? 0)) / 1000).toFixed(1)}ms dur ${((e.dur ?? 0) / 1000).toFixed(1)}`).join(', '));
const win = (e) => t0 == null || (e.ts > t0 - 1.5e6 && e.ts < t0 + 1.5e6);
const tasks = ev.filter((e) => onMain(e) && e.name === 'RunTask' && e.dur > 20000 && win(e)).sort((a, b) => a.ts - b.ts);
for (const k of tasks) {
  const inner = ev.filter((e) => onMain(e) && e.ts >= k.ts && e.ts + (e.dur ?? 0) <= k.ts + k.dur && /FunctionCall|EvaluateScript|TimerFire|FireAnimationFrame|EventDispatch|ParseHTML|Layout|Paint|v8.compile|GCEvent|MajorGC|MinorGC|FireIdleCallback/.test(e.name)).sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0)).slice(0, 4);
  console.log(`task @${((k.ts - (t0 ?? k.ts)) / 1000).toFixed(1)}ms  ${(k.dur / 1000).toFixed(1)} ms :: ${inner.map((e) => `${e.name}${e.args?.data?.functionName ? ':' + e.args.data.functionName : ''}${e.args?.data?.url ? ' ' + String(e.args.data.url).split('/').pop() : ''}${e.args?.data?.type ? ' ' + e.args.data.type : ''} ${((e.dur ?? 0) / 1000).toFixed(1)}`).join(' | ')}`);
}
const marks = ev.filter((e) => /^fel-/.test(e.name) && win(e)).sort((a, b) => a.ts - b.ts);
console.log('marks', marks.map((e) => `${e.name}@${((e.ts - (t0 ?? e.ts)) / 1000).toFixed(0)}`).join(' ') || '(none in the window)');
