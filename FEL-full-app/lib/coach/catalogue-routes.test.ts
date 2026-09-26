// The catalogue through its REAL routes (MIRROR-COACH P2, 2026-09-25). Only the session and the database are stand-ins,
// and the database enforces ProgramExercise's unique key the way Postgres does: P2002 on a byte-equal match, nothing
// else.
//
// P2 review (2026-09-26): the key swap from `name @unique` (FEL-wide) to @@unique([coachId, name]) DROPS an index, which
// owner decision #16's standing GO does not cover, so it is HELD and the schema keeps the FEL-wide key. The routes run
// under BOTH: today's key (the default here) refuses a second coach's same name with an honest name_taken_fel, and the
// held key lets two coaches each own "Goblet Squat" — so the day the owner says go, only the schema changes.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const m = vi.hoisted(() => ({
  session: { user: { id: 'coach-1' } } as unknown,
  // the store the shared stand-in (lib/coach/catalogueMemoryDb.ts) reads; beforeEach replaces its contents
  store: { tables: {} as Record<string, Row[]>, uniqueKey: ['name'] as string[], seq: 0 },
}));

vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', async () => {
  const { catalogueMemoryDb } = await import('./catalogueMemoryDb');
  return { prisma: catalogueMemoryDb(m.store) };
});

import { GET as listGET, POST as createPOST } from '@/app/api/coach/programs/exercises/route';
import { PUT as itemPUT, DELETE as itemDELETE } from '@/app/api/coach/programs/exercises/[id]/route';
import { POST as fromKbPOST } from '@/app/api/coach/programs/exercises/from-kb/route';
import { GET as kbGET } from '@/app/api/coach/catalogue/route';

const as = (user: string | null) => { m.session = user ? { user: { id: user } } : null; };
const req = (body: unknown) => new Request('http://fel.test/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
async function call(res: Promise<Response>) { const r = await res; return { status: r.status, body: await r.json() as Row }; }
const create = (body: Row) => call(createPOST(req(body)));
const put = (id: string, body: Row) => call(itemPUT(req(body), { params: { id } }));
const del = (id: string) => call(itemDELETE(new Request('http://fel.test/api', { method: 'DELETE' }), { params: { id } }));
const fromKb = (kbExerciseId: string) => call(fromKbPOST(req({ kbExerciseId })));
const list = async () => (await listGET()).json() as Promise<Row[]>;
const rows = () => m.store.tables.programExercise ?? [];

// Two KB exercises as scripts/seed.ts writes them, plus the posture audit and an unpublished draft.
const KB = {
  categories: [
    { id: 'cat-breath', name: 'Breath & Pressure' }, { id: 'cat-osc', name: 'Oscillatory Drills' }, { id: 'cat-audit', name: 'Postural Audit' },
  ],
  exercises: [
    { id: 'kb-croc', slug: 'crocodile-breathing', name: 'Crocodile Breathing', categoryId: 'cat-breath', published: true, videoUrl: '',
      coachingCues: 'Lie face-down, forehead on stacked hands. Floor blocks chest breathing — forces posterior expansion. 4s inhale, 6s exhale. Feel back rise toward ceiling.',
      commonMistakes: 'Lifting head to breathe. Not relaxing between cycles. Skipping pelvic floor integration.' },
    { id: 'kb-pogo', slug: 'single-leg-pogos', name: 'Single-Leg Pogo Hops', categoryId: 'cat-osc', published: true, videoUrl: 'https://youtu.be/q1HLjLbhS2s',
      coachingCues: 'Rapid single-leg hops, MINIMAL ground contact time. Focus on STIFFNESS.', commonMistakes: 'Spending too long on the ground (losing elastic energy). Soft ankle at contact. Letting heel sink.' },
    { id: 'kb-audit', slug: 'aston-audit', name: 'Aston Postural Audit', categoryId: 'cat-audit', published: true, videoUrl: '', coachingCues: 'Evaluate 3 volumes.', commonMistakes: 'Evaluating in 2D only.' },
    { id: 'kb-draft', slug: 'draft-thing', name: 'Draft Thing', categoryId: 'cat-osc', published: false, videoUrl: '', coachingCues: 'Draft.', commonMistakes: '' },
  ],
};

beforeEach(() => {
  m.store.tables = { programExercise: [], sessionExercise: [], exercise: KB.exercises.map((e) => ({ ...e })), exerciseCategory: KB.categories.map((c) => ({ ...c })) };
  m.store.uniqueKey = ['name'];            // the schema as it is: FEL-wide names (the per-coach swap is held)
  m.store.seq = 0;
  as('coach-1');
});

describe('two coaches and one name: FEL-wide today, per coach once the held swap lands', () => {
  const heldSwap = () => { m.store.uniqueKey = ['coachId', 'name']; };

  it('TODAY (FEL-wide key): the second coach is refused with name_taken_fel — not "You already have one" — and nothing is written', async () => {
    await create({ name: 'Goblet Squat' });
    as('coach-2');
    expect(await create({ name: 'Goblet Squat' })).toEqual({ status: 409, body: { error: 'name_taken_fel', field: 'name' } });
    expect(rows().map((r) => r.coachId)).toEqual(['coach-1']);
    // and the KB bridge for the second coach says the same, instead of a false "already"
    as('coach-1');
    await fromKb('kb-croc');
    as('coach-2');
    expect(await fromKb('kb-croc')).toEqual({ status: 409, body: { error: 'name_taken_fel' } });
    // a rename into another coach's name is refused the same way
    const mine = await create({ name: 'Box Squat' });
    expect(await put(String(mine.body.id), { name: 'Goblet Squat' })).toEqual({ status: 409, body: { error: 'name_taken_fel', field: 'name' } });
  });

  it('HELD SWAP: coach-1 and coach-2 both create "Goblet Squat"; each lists only their own', async () => {
    heldSwap();
    const a = await create({ name: 'Goblet Squat', pattern: 'squat', braceMode: 'set' });
    as('coach-2');
    const b = await create({ name: 'Goblet Squat', pattern: 'squat' });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).not.toBe(b.body.id);
    expect(rows().map((r) => [r.coachId, r.name])).toEqual([['coach-1', 'Goblet Squat'], ['coach-2', 'Goblet Squat']]);
    expect((await list()).map((r) => r.coachId)).toEqual(['coach-2']);
    as('coach-1');
    expect((await list()).map((r) => [r.coachId, r.braceMode])).toEqual([['coach-1', 'set']]);
  });

  it('ONE coach under either key: their own name twice is name_taken (theirs), never name_taken_fel', async () => {
    for (const key of [['name'], ['coachId', 'name']]) {
      m.store.tables.programExercise = [];
      m.store.uniqueKey = key;
      await create({ name: 'Goblet Squat' });
      expect((await create({ name: 'Goblet Squat' })).body, key.join()).toEqual({ error: 'name_taken', field: 'name' });
    }
  });

  it('ONE coach cannot have it twice, even in different case or spacing', async () => {
    await create({ name: 'Goblet Squat' });
    expect((await create({ name: 'goblet  squat' })).body).toEqual({ error: 'name_taken', field: 'name' });
    const other = await create({ name: 'Box Squat' });
    expect((await put(String(other.body.id), { name: 'GOBLET SQUAT' })).status).toBe(409);
  });

  it('HELD SWAP: the KB bridge gives each coach their own copy of the same KB exercise', async () => {
    heldSwap();
    const a = await fromKb('kb-croc');
    as('coach-2');
    const b = await fromKb('kb-croc');
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(rows().filter((r) => r.name === 'Crocodile Breathing').map((r) => r.coachId)).toEqual(['coach-1', 'coach-2']);
  });
});

describe('a coach cannot touch another coach\'s item', () => {
  it('PUT as coach-2 on coach-1\'s row is 404 (not 403) and the row is unchanged', async () => {
    const mine = await create({ name: 'Goblet Squat', primaryCues: ['Elbows inside the knees'] });
    const before = { ...rows()[0] };
    as('coach-2');
    expect(await put(String(mine.body.id), { name: 'Stolen', primaryCues: ['x'] })).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(rows()[0]).toEqual(before);
  });

  it('DELETE as coach-2 is 404 and the row stays', async () => {
    const mine = await create({ name: 'Goblet Squat' });
    as('coach-2');
    expect((await del(String(mine.body.id))).status).toBe(404);
    expect(rows()).toHaveLength(1);
  });

  it('coach-2 cannot link coach-1\'s row as the easier or harder version (create or edit)', async () => {
    const mine = await create({ name: 'Box Squat' });
    as('coach-2');
    expect(await create({ name: 'Goblet Squat', regressionOfId: mine.body.id })).toEqual({ status: 400, body: { error: 'bad_link', field: 'regressionOfId' } });
    const theirs = await create({ name: 'Goblet Squat' });
    expect((await put(String(theirs.body.id), { progressionOfId: mine.body.id })).body).toEqual({ error: 'bad_link', field: 'progressionOfId' });
  });

  it('a row cannot be its own easier version; another of your own rows can', async () => {
    const box = await create({ name: 'Box Squat' });
    const goblet = await create({ name: 'Goblet Squat' });
    expect((await put(String(goblet.body.id), { regressionOfId: goblet.body.id })).body.error).toBe('bad_link');
    const ok = await put(String(goblet.body.id), { regressionOfId: box.body.id });
    expect([ok.status, ok.body.regressionOfId]).toEqual([200, box.body.id]);
  });

  it('signed out: 401 on every verb', async () => {
    as(null);
    expect((await create({ name: 'X' })).status).toBe(401);
    expect((await put('pe-1', { name: 'X' })).status).toBe(401);
    expect((await del('pe-1')).status).toBe(401);
    expect((await fromKb('kb-croc')).status).toBe(401);
  });
});

describe('create / edit / delete', () => {
  it('create stores the tags, cues, faults and video; edit changes only what was sent', async () => {
    const c = await create({
      name: 'Goblet Squat', category: 'lower-body', pattern: 'squat', braceMode: 'set', skillLayer: 'strength',
      primaryCues: ['Push the floor away'], commonFaults: [{ fault: 'Heels lift', correctionCue: 'Heel, big toe, little toe' }],
      demoVideoUrl: 'https://video.example/goblet.mp4', equipment: 'kettlebell',
    });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ coachId: 'coach-1', pattern: 'squat', braceMode: 'set', skillLayer: 'strength', equipment: ['kettlebell'], warnings: [] });
    const e = await put(String(c.body.id), { braceMode: null, primaryCues: ['Push the floor away', 'Elbows inside the knees'] });
    expect(e.body).toMatchObject({ name: 'Goblet Squat', pattern: 'squat', braceMode: null, skillLayer: 'strength', demoVideoUrl: 'https://video.example/goblet.mp4', primaryCues: ['Push the floor away', 'Elbows inside the knees'] });
  });

  it('the old route stored these; now they are 400s with the field named', async () => {
    expect((await create({ name: 'A', demoVideoUrl: 'javascript:alert(1)' })).body).toEqual({ error: 'video_url', field: 'demoVideoUrl' });
    expect((await create({ name: 'A', defaultTempo: 'fast' })).body).toEqual({ error: 'tempo_format', field: 'defaultTempo' });
    expect((await create({ name: 'A', pattern: 'deadlift' })).body).toEqual({ error: 'pattern_unknown', field: 'pattern' });
    expect((await create({ name: '' })).body).toEqual({ error: 'name_required', field: 'name' });
    expect(rows()).toEqual([]);
  });

  it('medical language saves with a warning the form shows, text untouched', async () => {
    const c = await create({ name: 'Wall Sit', primaryCues: ['Fixes your knee'] });
    expect(c.status).toBe(201);
    expect((c.body.warnings as Row[]).map((w) => w.kind)).toEqual(['treatment']);
    expect(c.body.primaryCues).toEqual(['Fixes your knee']);
  });

  it('an exercise in a program is not deleted (was a bare 500 from the foreign key): 409 in_use with the count', async () => {
    const c = await create({ name: 'Goblet Squat' });
    m.store.tables.sessionExercise.push({ id: 'se-1', exerciseId: c.body.id }, { id: 'se-2', exerciseId: c.body.id });
    expect(await del(String(c.body.id))).toEqual({ status: 409, body: { error: 'in_use', count: 2 } });
    expect(rows()).toHaveLength(1);
  });

  // MIRROR-COACH P2 review (2026-09-26): the editor sends the whole form, name included. Tagging a legacy row whose name
  // has a case twin under the same coach (possible under the byte-exact key) answered name_taken for an unchanged name.
  it('editing a row WITHOUT renaming it is never name_taken, even beside a case twin; a rename into the twin still is', async () => {
    m.store.tables.programExercise.push(
      { id: 'pe-a', coachId: 'coach-1', name: 'Goblet Squat', category: 'general', commonFaults: null, progressionOfId: null, regressionOfId: null },
      { id: 'pe-b', coachId: 'coach-1', name: 'goblet squat', category: 'general', commonFaults: null, progressionOfId: null, regressionOfId: null },
    );
    const tag = await put('pe-b', { name: 'goblet squat', pattern: 'squat', braceMode: 'set' });
    expect([tag.status, tag.body.pattern]).toEqual([200, 'squat']);
    const box = await create({ name: 'Box Squat' });
    expect((await put(String(box.body.id), { name: 'GOBLET SQUAT' })).body).toEqual({ error: 'name_taken', field: 'name' });
  });

  // MIRROR-COACH P2 review (2026-09-26): the links were cleared BEFORE the delete; a prescription made in between made
  // the delete fail (in_use) after the other rows had already lost their easier-version link.
  it('a delete refused by a prescription made after the count leaves every link in place', async () => {
    const box = await create({ name: 'Box Squat' });
    await create({ name: 'Goblet Squat', regressionOfId: box.body.id });
    m.store.tables.sessionExercise.push({ id: 'se-race', exerciseId: box.body.id });
    const { prisma } = await import('@/lib/db') as unknown as { prisma: { sessionExercise: { count: (a: unknown) => Promise<number> } } };
    const realCount = prisma.sessionExercise.count;
    prisma.sessionExercise.count = async () => 0;              // the builder's add lands between the count and the delete
    try {
      expect(await del(String(box.body.id))).toEqual({ status: 409, body: { error: 'in_use' } });
    } finally { prisma.sessionExercise.count = realCount; }
    expect(rows().map((r) => [r.name, r.regressionOfId])).toEqual([['Box Squat', null], ['Goblet Squat', box.body.id]]);
  });

  it('deleting a row unlinks the rows that pointed at it', async () => {
    const box = await create({ name: 'Box Squat' });
    await create({ name: 'Goblet Squat', regressionOfId: box.body.id });
    expect((await del(String(box.body.id))).status).toBe(200);
    expect(rows().map((r) => [r.name, r.regressionOfId])).toEqual([['Goblet Squat', null]]);
  });
});

describe('Add to my catalogue (the KB bridge)', () => {
  it('copies the KB item\'s fields and FEL\'s tags', async () => {
    const r = await fromKb('kb-pogo');
    expect(r.status).toBe(201);
    expect(r.body.already).toBe(false);
    expect(r.body.item).toMatchObject({
      coachId: 'coach-1', name: 'Single-Leg Pogo Hops', category: 'plyometric', defaultTempo: '0-0-0-0',
      demoVideoUrl: 'https://youtu.be/q1HLjLbhS2s', pattern: 'locomotion', braceMode: 'reflex', skillLayer: 'jump-land',
      commonFaults: [
        { fault: 'Spending too long on the ground (losing elastic energy)', correctionCue: '' },
        { fault: 'Soft ankle at contact', correctionCue: '' },
        { fault: 'Letting heel sink', correctionCue: '' },
      ],
    });
    expect((r.body.item as Row).primaryCues).toHaveLength(3);
    // …and it is now prescribable: it is a ProgramExercise row the builder takes by id
    expect((await list()).map((x) => x.id)).toEqual([(r.body.item as Row).id]);
  });

  it('the breath items land in the `breath` category the Mirror\'s rib-angle finding searches for', async () => {
    const r = await fromKb('kb-croc');
    expect(r.body.item).toMatchObject({ category: 'breath', pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', demoVideoUrl: null });
    expect((r.body.item as Row).commonFaults).toEqual([
      { fault: 'Lifting head to breathe', correctionCue: '' }, { fault: 'Not relaxing between cycles', correctionCue: '' }, { fault: 'Skipping pelvic floor integration', correctionCue: '' },
    ]);
  });

  it('pressing it twice returns the row the coach has (200, already) instead of a second row or an error', async () => {
    const first = await fromKb('kb-croc');
    const again = await fromKb('kb-croc');
    expect(again.status).toBe(200);
    expect(again.body.already).toBe(true);
    expect((again.body.item as Row).id).toBe((first.body.item as Row).id);
    expect(rows()).toHaveLength(1);
  });

  it('a coach\'s own row by that name counts as already there (case-insensitive), and is not overwritten', async () => {
    await create({ name: 'crocodile breathing', primaryCues: ['My own cue'] });
    const r = await fromKb('kb-croc');
    expect([r.status, r.body.already, (r.body.item as Row).primaryCues]).toEqual([200, true, ['My own cue']]);
  });

  it('the posture audit is an assessment: 422 not_prescribable; an unpublished or missing KB id is 404', async () => {
    expect(await fromKb('kb-audit')).toEqual({ status: 422, body: { error: 'not_prescribable' } });
    expect((await fromKb('kb-draft')).status).toBe(404);
    expect((await fromKb('nope')).status).toBe(404);
    expect(rows()).toEqual([]);
  });

  it('the Exercises tab\'s KB list carries each item\'s tags and whether it can be copied', async () => {
    const r = await (await kbGET()).json() as { exercises: { slug: string; tags: Row }[] };
    const bySlug = Object.fromEntries(r.exercises.map((e) => [e.slug, e.tags]));
    expect(bySlug['single-leg-pogos']).toMatchObject({ pattern: 'locomotion', braceMode: 'reflex', skillLayer: 'jump-land', prescribable: true });
    expect(bySlug['aston-audit']).toMatchObject({ prescribable: false });
  });
});
