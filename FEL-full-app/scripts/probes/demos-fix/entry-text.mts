const load = async (p: string): Promise<any> => { const m = await import(p); return { ...(m.default ?? {}), ...m }; };
const { loadLibraryFiles } = await load('@/lib/library/files');
const LIB = loadLibraryFiles();
const ids = process.argv.slice(2);
for (const id of ids) {
  const e = LIB.find((x: any) => x.id === id);
  if (!e) { console.log('NONE', id); continue; }
  console.log(`\n=== ${e.id} | ${e.name} | ${e.family}/${e.variation} | ${e.pattern} | eq=${e.equipment.join(',')} | review=${e.review.status} youth=${e.youthOk}`);
  console.log('setup:', JSON.stringify(e.setup)); console.log('cues:', JSON.stringify(e.cues)); console.log('faults:', JSON.stringify(e.faults));
  for (const k of Object.keys(e)) if (!['id','name','family','variation','pattern','equipment','review','youthOk','setup','cues','faults','muscles','dosage','tags'].includes(k)) { const v = JSON.stringify(e[k]); if (v && v.length < 400) console.log(' ', k, v); }
}
