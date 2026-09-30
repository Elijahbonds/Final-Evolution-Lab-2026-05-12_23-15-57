// MIRROR-COACH P8 (2026-09-29) — the template clone against the REAL Prisma client on a THROWAWAY local Postgres.
//
// Why: lib/coach/templates/clone-route.test.ts runs the real route over lib/coach/builderMemoryDb.ts, a stand-in this
// phase extended; it cannot prove what Prisma itself does with the clone's one nested write (blocks deleteMany by id +
// create → sessions → exercises with a scalar exerciseId), the Json commonFaults, or the per-coach name key. This does,
// with the generated client (public/_prisma/client) and lib/coach/builderServer.ts builderAction exactly as the route
// calls it.
//
// Safety: refuses any URL that is not 127.0.0.1 and a database named fel_p8_tpl_*. Build the DB first (never db push):
//   createdb -h 127.0.0.1 fel_p8_tpl_X
//   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > s.sql
//   prisma db execute --url postgresql://…/fel_p8_tpl_X --file s.sql
// Run: P8_PG_URL=postgresql://elijahbonds@127.0.0.1:5432/fel_p8_tpl_X DATABASE_URL=$P8_PG_URL node tsx scripts/probes/_p8-template-clone-pg.ts [out.json]
import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@/public/_prisma/client';
import { builderAction, loadProgram, type BuilderDb } from '@/lib/coach/builderServer';
import { planTemplateClone, templateById, expandTemplate } from '@/lib/coach/templates';
import { easierKey, harderKey, templateExercise } from '@/lib/coach/templateCatalogue';
import { nameKey } from '@/lib/coach/catalogue';
import { pullPushCheck } from '@/lib/coach/coverage';

const url = process.env.P8_PG_URL ?? '';
if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/fel_p8_tpl_\w+$/.test(url) || process.env.DATABASE_URL !== url) {
  console.error('refusing: P8_PG_URL must be a local fel_p8_tpl_* database and DATABASE_URL must equal it');
  process.exit(2);
}
const db = new PrismaClient({ datasources: { db: { url } } });
const B = db as unknown as BuilderDb;
const rows: { check: string; want: unknown; got: unknown; pass: boolean }[] = [];
const check = (name: string, want: unknown, got: unknown) => {
  const pass = JSON.stringify(want) === JSON.stringify(got);
  rows.push({ check: name, want, got, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`}`);
};

async function blank(coachId: string, clientId: string, weeks = 4, perWeek = 3) {
  return (await db.coachingProgram.create({
    data: {
      coachId, clientId, name: 'P8 probe', startDate: new Date('2026-09-28'), durationWeeks: weeks,
      blocks: { create: Array.from({ length: weeks }, (_, b) => ({ order: b + 1, label: `Week ${b + 1}`, sessions: { create: Array.from({ length: perWeek }, (_, k) => ({ order: k + 1, label: `Session ${k + 1}` })) } })) },
    },
    select: { id: true },
  })).id;
}

async function main() {
  const year = new Date().getFullYear();
  // fixture users in a throwaway database: the password column is required, and nobody signs in as these
  const NO_LOGIN = 'fixture-no-login';
  await db.user.createMany({ data: [
    { id: 'p8-coach', email: 'p8-coach@fel.test' }, { id: 'p8-coach2', email: 'p8-coach2@fel.test' },
    { id: 'p8-adult', email: 'p8-adult@fel.test', dobYear: 1990 }, { id: 'p8-teen', email: 'p8-teen@fel.test', dobYear: year - 15 },
    { id: 'p8-blank', email: 'p8-blank@fel.test' },
  ].map((u) => ({ ...u, password: NO_LOGIN })) });
  await db.facilitatorProfile.createMany({ data: [{ userId: 'p8-coach', certificationStatus: 'certified' }, { userId: 'p8-coach2', certificationStatus: 'certified' }] });
  // another coach owns a row by a template name: under the per-coach key both may exist
  await db.programExercise.create({ data: { coachId: 'p8-coach2', name: 'Barbell Back Squat', primaryCues: ['Their words.'] } });
  // the coach's own row by a template name (any case) with their own easier link
  const myBox = await db.programExercise.create({ data: { coachId: 'p8-coach', name: 'My box squat' } });
  const myGoblet = await db.programExercise.create({ data: { coachId: 'p8-coach', name: 'goblet squat', primaryCues: ['My words.'], regressionOfId: myBox.id, pattern: 'squat' } });

  // 1. the 4-day gym template into a blank adult program
  const pid = await blank('p8-coach', 'p8-adult');
  const r = await builderAction(B, 'p8-coach', pid, { action: 'clone_template', templateId: 'adult-gym-4' });
  check('clone adult-gym-4 → ok', true, r.ok);
  const blocks = await db.block.findMany({ where: { programId: pid }, orderBy: { order: 'asc' }, include: { sessions: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' }, include: { exercise: true } } } } } });
  check('blocks (old blank weeks gone)', ['Week 1 · Learn the moves', 'Week 2 · Build', 'Week 3 · Build more', 'Week 4 · Easier week'], blocks.map((b) => b.label));
  check('sessions a week', [4, 4, 4, 4], blocks.map((b) => b.sessions.length));
  check('prescriptions', 88, blocks.reduce((n, b) => n + b.sessions.reduce((m, s) => m + s.exercises.length, 0), 0));
  check('durationWeeks', 4, (await db.coachingProgram.findUnique({ where: { id: pid } }))!.durationWeeks);
  check('no orphan sessions from the blank weeks', 0, await db.session.count({ where: { block: { programId: pid }, label: { startsWith: 'Session ' } } }));
  const plan = expandTemplate(templateById('adult-gym-4')!);
  const want = plan.map((w) => w.sessions.map((s) => s.items.map((p) => `${p.name}|${p.section}|${p.sets}|${p.reps}|${p.effortBand}|${p.isKeySet}|${p.supersetGroup ?? ''}|${p.workSeconds ?? ''}|${p.tempo}|${p.setupCues.join(',')}`)));
  const got = blocks.map((b) => b.sessions.map((s) => s.exercises.map((e) => `${templateExercise(keyOfName(e.exercise.name))?.catalogue.name ?? e.exercise.name}|${e.section}|${e.sets}|${e.reps}|${e.effortBand}|${e.isKeySet}|${e.supersetGroup ?? ''}|${e.workSeconds ?? ''}|${e.tempo}|${e.setupCues.join(',')}`)));
  check('every stored prescription = the template as written (weeks × sessions × items)', want, got);
  check('loads stored empty', ['', ''], [blocks[0].sessions[0].exercises[1].load, blocks[3].sessions[3].exercises[0].load]);

  // 2. the coach's catalogue
  const mine = await db.programExercise.findMany({ where: { coachId: 'p8-coach' } });
  const keys = planTemplateClone(templateById('adult-gym-4')!).exerciseKeys;
  check('coach rows = seeded rungs + the coach\'s own "My box squat"', keys.length + 1, mine.length);
  const idOf = (k: string) => mine.find((m) => nameKey(m.name) === nameKey(templateExercise(k)!.catalogue.name))!.id;
  let linksOk = 0, linksBad: string[] = [];
  for (const k of keys) {
    const row = mine.find((m) => m.id === idOf(k))!;
    const wantDown = k === 'goblet-squat' ? myBox.id : easierKey(k) ? idOf(easierKey(k)!) : null;
    const wantUp = harderKey(k) ? idOf(harderKey(k)!) : null;
    if (row.regressionOfId === wantDown && row.progressionOfId === wantUp) linksOk++; else linksBad.push(k);
  }
  check('every seeded rung linked easier/harder among the coach\'s own rows (their Goblet Squat\'s own easier link kept)', { ok: keys.length, bad: [] }, { ok: linksOk, bad: linksBad });
  const goblet = mine.find((m) => m.id === myGoblet.id)!;
  check('their "goblet squat" reused as is: name, cues, easier link', ['goblet squat', ['My words.'], myBox.id], [goblet.name, goblet.primaryCues, goblet.regressionOfId]);
  check('Json commonFaults stored', templateExercise('back-squat')!.catalogue.commonFaults, mine.find((m) => m.id === idOf('back-squat'))!.commonFaults);
  check('the other coach\'s row untouched', ['Their words.'], (await db.programExercise.findFirst({ where: { coachId: 'p8-coach2' } }))!.primaryCues);

  // 3. the load (coach) and the weekly balance
  const loaded = await loadProgram(B, 'p8-coach', pid);
  check('load: no builder warnings', {}, loaded.ok ? loaded.warnings : null);
  const pat = new Map(mine.map((m) => [m.id, m.pattern]));
  check('pull-over-push: no suggestion in any week', [null, null, null, null], loaded.ok ? loaded.program.tree.blocks.map((b) => pullPushCheck(b.sessions.flatMap((s) => s.exercises.map((e) => ({ pattern: pat.get(e.exerciseId), section: e.section, sets: e.sets }))))) : null);

  // 4. the guards
  const again = await builderAction(B, 'p8-coach', pid, { action: 'clone_template', templateId: 'adult-bw-3' });
  check('second clone → 409 program_not_empty', { ok: false, status: 409, error: 'program_not_empty' }, again);
  for (const client of ['p8-teen', 'p8-blank']) {
    const tp = await blank('p8-coach', client);
    const before = await db.programExercise.count();
    const no = await builderAction(B, 'p8-coach', tp, { action: 'clone_template', templateId: 'adult-bw-4' });
    check(`adult template for ${client} → 400 template_adults_only, nothing written`, [{ ok: false, status: 400, error: 'template_adults_only' }, before, 12], [no, await db.programExercise.count(), await db.session.count({ where: { block: { programId: tp } } })]);
    const yes = await builderAction(B, 'p8-coach', tp, { action: 'clone_template', templateId: 'youth-bw-3' });
    const ses = await db.sessionExercise.findMany({ where: { session: { block: { programId: tp } } }, include: { exercise: true } });
    check(`youth-bw-3 for ${client} → ok, no Prime, no jump row, bands ⊆ {cruise, drive}`, [true, 0, 0, ['cruise', 'drive']],
      [yes.ok, ses.filter((e) => e.section === 'prime').length, ses.filter((e) => e.exercise.skillLayer === 'jump-land' || e.exercise.category === 'plyometric').length, [...new Set(ses.map((e) => e.effortBand))].sort()]);
  }
  const camp = await blank('p8-coach', 'p8-blank', 2, 2);
  const c = await builderAction(B, 'p8-coach', camp, { action: 'clone_template', templateId: 'camp-session' });
  check('camp-session → 1 week "Camp", 1 session "Camp session", durationWeeks 1', [true, ['Camp'], ['Camp session'], 1],
    [c.ok, (await db.block.findMany({ where: { programId: camp } })).map((b) => b.label), (await db.session.findMany({ where: { block: { programId: camp } } })).map((s) => s.label), (await db.coachingProgram.findUnique({ where: { id: camp } }))!.durationWeeks]);
  // a client session opened in a blank program: refused, and the blank weeks survive
  const opened = await blank('p8-coach', 'p8-adult', 1, 2);
  const firstSession = (await db.session.findFirst({ where: { block: { programId: opened } } }))!;
  await db.clientSession.create({ data: { programId: opened, sessionId: firstSession.id, clientId: 'p8-adult' } });
  const op = await builderAction(B, 'p8-coach', opened, { action: 'clone_template', templateId: 'adult-bw-3' });
  check('a session the client opened → 409, blank weeks intact', [{ ok: false, status: 409, error: 'program_not_empty' }, 2], [op, await db.session.count({ where: { block: { programId: opened } } })]);
}

const byName = new Map<string, string>();
function keyOfName(name: string): string {
  if (!byName.size) for (const t of ['adult-gym-4']) for (const k of planTemplateClone(templateById(t)!).exerciseKeys) byName.set(nameKey(templateExercise(k)!.catalogue.name), k);
  return byName.get(nameKey(name)) ?? name;
}

main()
  .then(() => {
    const out = process.argv[2];
    const summary = { ranAt: new Date().toISOString(), db: url.replace(/\/\/[^@]+@/, '//…@'), pass: rows.filter((r) => r.pass).length, fail: rows.filter((r) => !r.pass).length, rows };
    if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
    console.log(`\n${summary.pass} pass, ${summary.fail} fail`);
    return db.$disconnect().then(() => process.exit(summary.fail ? 1 : 0));
  })
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
