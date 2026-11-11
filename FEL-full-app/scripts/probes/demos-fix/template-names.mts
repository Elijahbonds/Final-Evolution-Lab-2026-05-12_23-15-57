// scripts/probes/demos-fix/template-names.mts — DEMOS-FIX (2026-11-10): for every coach-template exercise whose name the
// library does not answer, print the template's own row (pattern, equipment, cues) and the library entries that share words
// with its name (status, family / variation, the loop demoFor picks, setup and cues), so each name-map line can be read
// against both texts before it is written. Read only.
//   npx tsx scripts/probes/demos-fix/template-names.mts [--all]   (--all: also the rows the map already answers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (p: string): Promise<any> => { const m = await import(p); return { ...(m.default ?? {}), ...m }; };
const { loadLibraryFiles } = await load('@/lib/library/files');
const { demoClipFor } = await load('@/lib/library/demo');
const { matchLibraryByName } = await load('@/lib/library/match');
const { TEMPLATE_EXERCISES } = await load('@/lib/coach/templateCatalogue');
const tmap = await load('@/lib/library/templateNames').catch(() => ({}));
const LIB = loadLibraryFiles();
const STOP = new Set(['with', 'a', 'the', 'and', 'second', 'seconds', '2', '3', '4', '5', 'hold', 'lower', 'squeeze', 'holds', 'pause', 'paused', 'light']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map((w) => w.replace(/s$/, ''));
for (const t of TEMPLATE_EXERCISES) {
  const name: string = t.catalogue.name;
  if (matchLibraryByName(LIB, [name])) continue;
  const mapped = tmap.TEMPLATE_LIBRARY_NAMES?.[name];
  if (mapped && !process.argv.includes('--all')) continue;
  const w = new Set(words(name));
  const cands = LIB.filter((e: { name: string; review: { status: string } }) => e.review.status !== 'rejected')
    .map((e: { name: string; aliases?: string[] }) => ({ e, s: [e.name, ...(e.aliases ?? [])].reduce((m, n) => Math.max(m, words(n).filter((x) => w.has(x)).length / Math.max(w.size, words(n).length)), 0) }))
    .filter((c: { s: number }) => c.s >= 0.4).sort((a: { s: number }, b: { s: number }) => b.s - a.s).slice(0, 6);
  console.log(`\n## ${name}  [${t.key} | ${t.catalogue.pattern} | ${t.catalogue.equipment.join(',') || 'no kit'}${t.impact ? ' | ' + t.impact : ''}]${mapped ? `  MAPPED → ${mapped}` : ''}`);
  console.log(`   cues: ${t.catalogue.primaryCues.join(' / ')}`);
  for (const { e, s } of cands) console.log(`   ${s.toFixed(2)} ${e.id} [${e.review.status}] ${e.family}/${e.variation} eq=${e.equipment.join(',')} → ${demoClipFor(e) ?? '(no loop)'}\n        setup: ${e.setup}\n        cues: ${e.cues.join(' / ')}`);
}
