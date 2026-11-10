// scripts/every-screen/builder-rules.mts — EVERY-SCREEN P3 (2026-11-10): the AI program builder's written rules, run over
// many more requests than the tests can afford. The 24 fixed asks are tests (lib/program-ask/asks24.test.ts); this probe
// runs the same rules (lib/program-ask/rules24.ts) over the grid the demo audit used (scripts/every-screen/demos.mts): every
// goal × level × age × four kits × 2–6 days, jumps open and closed for adults, at three session lengths.
//
// Read only: it calls the builder as the server does (lib/program-ask/build.ts buildProgram) and prints each rule's
// failures, grouped, with one example request each.
//
//   npx tsx scripts/every-screen/builder-rules.mts [--minutes=20,45,75] [--examples=3]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (p: string): Promise<any> => { const m = await import(p); return { ...(m.default ?? {}), ...m }; };
const { loadLibraryFiles } = await load('@/lib/library/files');
const { buildProgram } = await load('@/lib/program-ask/build');
const { builderRuleFailures } = await load('@/lib/program-ask/rules24');

const flag = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const MINUTES = (flag('minutes') ?? '20,45,75').split(',').map(Number);
const EXAMPLES = Number(flag('examples') ?? 2);
const LIB = loadLibraryFiles();
const GOALS = ['full-body', 'strength', 'muscle', 'conditioning', 'athletic', 'mobility', 'sport'];
const KITS: string[][] = [[], ['band'], ['dumbbell'], ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'pull-up-bar', 'bench', 'box', 'band', 'trap-bar']];

let builds = 0, failed = 0, crashed = 0;
const byRule = new Map<string, { n: number; examples: string[] }>();
const byCat = new Map<string, number>();
const failing: string[] = [];
for (const minutes of MINUTES) for (const goal of GOALS) for (const level of ['beginner', 'intermediate', 'advanced']) for (const age of ['adult', 'teen', 'child'])
  for (const equipment of KITS) for (const days of [2, 3, 4, 5, 6]) for (const jumpsOpen of age === 'adult' ? [false, true] : [false]) {
    const request = { equipment, tension: null, bands: [], goal, sport: goal === 'sport' ? 'basketball' : null, days, minutes, level, weeks: 4, age, lowLoad: [] };
    const label = `${goal} ${level} ${age} [${equipment.join(',') || 'none'}] ${days}d ${minutes}min${jumpsOpen ? ' jumps' : ''}`;
    let fails: string[];
    try {
      const p = buildProgram({ request, library: LIB, jumpsOpen });
      fails = builderRuleFailures(p, LIB, { jumpsOpen });
    } catch (e) { crashed++; fails = [`crash: ${String(e).slice(0, 120)}`]; }
    builds++;
    if (builds % 250 === 0) process.stderr.write(`${builds} built, ${failed} failing so far\n`);
    if (fails.length) { failed++; failing.push(`${label}\t${[...new Set(fails.map((f) => f.replace(/^(\w+): (week \d+ \S+|week \d+|block \d+): /, '$1: ').replace(/\d+/g, '#')))].join(' | ')}`); }
    for (const c of new Set(fails.map((f) => f.split(':')[0]))) byCat.set(c, (byCat.get(c) ?? 0) + 1);
    for (const f of fails) {
      const rule = f.replace(/^(week \d+ \w+|week \d+|block \d+): /, '').replace(/\d+/g, '#').slice(0, 90);
      const g = byRule.get(rule) ?? { n: 0, examples: [] };
      g.n++; if (g.examples.length < EXAMPLES) g.examples.push(`${label}: ${f}`);
      byRule.set(rule, g);
    }
  }
console.log(`${builds} builds, ${failed} with a failure, ${crashed} crashed`);
console.log(`builds failing each rule: ${[...byCat.entries()].map(([k, n]) => `${k} ${n}`).join(', ')}`);
for (const [rule, g] of [...byRule.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(g.n).padStart(5)}  ${rule}`);
  for (const x of g.examples) console.log(`         ${x}`);
}
const out = flag('list');
if (out) (await import('node:fs')).writeFileSync(out, failing.join('\n') + '\n');
process.exit(failed ? 1 : 0);
