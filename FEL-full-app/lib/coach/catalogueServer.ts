// The catalogue's database half (MIRROR-COACH P2, 2026-09-25): list, create, edit, delete and copy-from-the-knowledge-
// base for the CALLING coach's ProgramExercise rows. The routes under app/api/coach/programs/exercises are one line
// each over these, so the rules live in one place and the tests drive them through the real routes.
//
// THE SCOPE RULE, ON EVERY PATH: a coach reads, edits, deletes and links only rows whose coachId is theirs. Somebody
// else's row answers 404, never 403 — a 403 would tell a caller that the id exists and belongs to another coach.
// Before this phase the PUT route checked ownership but not the links it wrote (progressionOfId / regressionOfId could
// point at another coach's row), and the builder (app/api/coach/programs/[id]/exercises) selected the row's coachId
// and never compared it, so a coach could prescribe from another coach's catalogue by id.
//
// NAMES. Meant to be unique per coach (schema @@unique([coachId, name])), but that swap drops the old FEL-wide
// `name @unique` index, and owner decision #16's standing GO covers additive-only pushes — so it is HELD for the
// owner's explicit go (P2 review, 2026-09-26; prisma/schema.prisma at ProgramExercise.name). This code works under
// both keys: the coach's own clash is found by reading their rows the way a coach reads a name (lib/coach/catalogue.ts
// nameKey — the database compares bytes, so "Goblet squat" and "Goblet Squat" would both pass it) and refused with
// name_taken; a P2002 that is NOT the coach's own row can only be the FEL-wide key meeting ANOTHER coach's row, and
// answers name_taken_fel — never "You already have an exercise with that name", which was false. A coach's own row is
// looked up with findFirst({ coachId, name }), never by the compound key the held swap would add.
import { prisma } from '@/lib/db';
import type { Prisma } from '@/public/_prisma/client';
import type { TextFlag } from '@/lib/share/screen';
import {
  kbToCatalogueItem, nameKey, validateCatalogueCreate, validateCatalogueUpdate,
  type CatalogueError, type CleanCatalogueItem,
} from './catalogue';
import { kbTagsFor } from './kbTags';

/**
 * The three tables the catalogue touches. Every function takes it last and defaults to the app's client; only the
 * dev harness (app/dev/coach-catalogue) passes an in-memory stand-in, so the page can be looked at with the lane's
 * database offline while running this exact code.
 */
export type CatalogueDb = Pick<typeof prisma, 'programExercise' | 'exercise' | 'sessionExercise'>;

export type ServiceError = CatalogueError | 'name_taken' | 'name_taken_fel' | 'in_use' | 'not_found' | 'not_prescribable';
export type ServiceResult<T> =
  | ({ ok: true; status: 200 | 201 } & T)
  | { ok: false; status: 400 | 404 | 409 | 422; error: ServiceError; field?: string; count?: number };

const isP2002 = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';
const isP2003 = (e: unknown) => (e as { code?: string } | null)?.code === 'P2003';

/** The coach's own row, or null — for somebody else's id as much as for a missing one. */
async function ownRow(db: CatalogueDb, coachId: string, id: string) {
  const row = await db.programExercise.findUnique({ where: { id } });
  return row && row.coachId === coachId ? row : null;
}

/** Another of the coach's rows with the same name as a coach reads it (case and spacing ignored). */
async function nameClash(db: CatalogueDb, coachId: string, name: string, exceptId?: string) {
  const mine = await db.programExercise.findMany({ where: { coachId }, select: { id: true, name: true } });
  return mine.find((r) => r.id !== exceptId && nameKey(r.name) === nameKey(name)) ?? null;
}

/** Which name clash a P2002 was: the coach's own row (a race past nameClash), or — under the FEL-wide key — another's. */
async function clashError(db: CatalogueDb, coachId: string, name: string, exceptId?: string): Promise<'name_taken' | 'name_taken_fel'> {
  return (await nameClash(db, coachId, name, exceptId)) ? 'name_taken' : 'name_taken_fel';
}

/** A progression/regression link must name ANOTHER of this coach's rows. */
async function linksOk(db: CatalogueDb, coachId: string, item: Partial<CleanCatalogueItem>, selfId?: string): Promise<'progressionOfId' | 'regressionOfId' | null> {
  for (const f of ['progressionOfId', 'regressionOfId'] as const) {
    const id = item[f];
    if (!id) continue;
    if (id === selfId || !(await ownRow(db, coachId, id))) return f;
  }
  return null;
}

const json = (faults: CleanCatalogueItem['commonFaults'] | undefined): Prisma.InputJsonValue | undefined =>
  faults === undefined ? undefined : (faults as unknown as Prisma.InputJsonValue);

export async function listCatalogue(coachId: string, db: CatalogueDb = prisma) {
  return db.programExercise.findMany({ where: { coachId }, orderBy: { name: 'asc' } });
}

export async function createCatalogueItem(coachId: string, body: Record<string, unknown>, db: CatalogueDb = prisma): Promise<ServiceResult<{ item: unknown; warnings: TextFlag[] }>> {
  const v = validateCatalogueCreate(body);
  if (!v.ok) return { ok: false, status: 400, error: v.error, field: v.field };
  if (await nameClash(db, coachId, v.item.name)) return { ok: false, status: 409, error: 'name_taken', field: 'name' };
  const badLink = await linksOk(db, coachId, v.item);
  if (badLink) return { ok: false, status: 400, error: 'bad_link', field: badLink };
  try {
    const item = await db.programExercise.create({ data: { ...v.item, coachId, commonFaults: json(v.item.commonFaults) } });
    return { ok: true, status: 201, item, warnings: v.warnings };
  } catch (e) {
    if (isP2002(e)) return { ok: false, status: 409, error: await clashError(db, coachId, v.item.name), field: 'name' };
    throw e;
  }
}

export async function updateCatalogueItem(coachId: string, id: string, body: Record<string, unknown>, db: CatalogueDb = prisma): Promise<ServiceResult<{ item: unknown; warnings: TextFlag[] }>> {
  const existing = await ownRow(db, coachId, id);
  if (!existing) return { ok: false, status: 404, error: 'not_found' };
  const v = validateCatalogueUpdate(body);
  if (!v.ok) return { ok: false, status: 400, error: v.error, field: v.field };
  // only a RENAME is checked (P2 review, 2026-09-26): the editor sends the whole form, name included, so tagging a row
  // whose name has a case/spacing twin under this coach (possible under the byte-exact key) answered name_taken for a
  // name nobody changed
  const renamed = v.item.name !== undefined && nameKey(v.item.name) !== nameKey(existing.name);
  if (renamed && await nameClash(db, coachId, v.item.name!, id)) return { ok: false, status: 409, error: 'name_taken', field: 'name' };
  const badLink = await linksOk(db, coachId, v.item, id);
  if (badLink) return { ok: false, status: 400, error: 'bad_link', field: badLink };
  try {
    const item = await db.programExercise.update({ where: { id }, data: { ...v.item, commonFaults: json(v.item.commonFaults) } });
    return { ok: true, status: 200, item, warnings: v.warnings };
  } catch (e) {
    if (isP2002(e)) return { ok: false, status: 409, error: await clashError(db, coachId, v.item.name ?? existing.name, id), field: 'name' };
    throw e;
  }
}

/**
 * Delete one of the coach's rows. A row that is prescribed in any session stays (SessionExercise → ProgramExercise is
 * onDelete: Restrict, which surfaced as a bare 500 before): the answer is in_use with how many prescriptions hold it.
 * Other rows that pointed at it as their easier/harder version are unlinked, not left pointing at nothing.
 */
export async function deleteCatalogueItem(coachId: string, id: string, db: CatalogueDb = prisma): Promise<ServiceResult<{ deleted: string }>> {
  const existing = await ownRow(db, coachId, id);
  if (!existing) return { ok: false, status: 404, error: 'not_found' };
  const count = await db.sessionExercise.count({ where: { exerciseId: id } });
  if (count > 0) return { ok: false, status: 409, error: 'in_use', count };
  // DELETE FIRST, then unlink (P2 review, 2026-09-26). The links were cleared before the delete: a builder "add" that
  // prescribed the row in between made the delete throw P2003 (in_use), after the other rows had already lost their
  // easier/harder link to a row that still existed. The links are plain String? columns (no foreign key), so clearing
  // them after a delete that succeeded leaves nothing pointing at nothing, and a refused delete touches nothing.
  try {
    await db.programExercise.delete({ where: { id } });
  } catch (e) {
    if (isP2003(e)) return { ok: false, status: 409, error: 'in_use' };
    throw e;
  }
  await db.programExercise.updateMany({ where: { coachId, progressionOfId: id }, data: { progressionOfId: null } });
  await db.programExercise.updateMany({ where: { coachId, regressionOfId: id }, data: { regressionOfId: null } });
  return { ok: true, status: 200, deleted: id };
}

/**
 * THE BRIDGE: copy one PUBLISHED knowledge-base exercise into the coach's catalogue with FEL's tags
 * (lib/coach/kbTags.ts). Idempotent by name — pressing it twice, or copying an item the coach already wrote under
 * the same name, returns the row they have (`already: true`) instead of a second one or an error. An assessment (the
 * posture audit) is not an exercise and is refused with not_prescribable.
 */
export async function copyKbToCatalogue(coachId: string, kbExerciseId: string, db: CatalogueDb = prisma): Promise<ServiceResult<{ item: unknown; already: boolean; dropped: string[] }>> {
  const kb = await db.exercise.findUnique({ where: { id: kbExerciseId }, include: { category: { select: { name: true } } } });
  if (!kb || !kb.published) return { ok: false, status: 404, error: 'not_found' };
  const tags = kbTagsFor(kb.slug, kb.category?.name ?? null);
  if (tags.prescribable === false) return { ok: false, status: 422, error: 'not_prescribable' };
  const { item, dropped } = kbToCatalogueItem(kb, tags);
  const have = await nameClash(db, coachId, item.name);
  if (have) return { ok: true, status: 200, item: await db.programExercise.findUnique({ where: { id: have.id } }), already: true, dropped: [] };
  try {
    const row = await db.programExercise.create({ data: { ...item, coachId, commonFaults: json(item.commonFaults) } });
    return { ok: true, status: 201, item: row, already: false, dropped };
  } catch (e) {
    if (isP2002(e)) {
      const again = await db.programExercise.findFirst({ where: { coachId, name: item.name } });
      if (again) return { ok: true, status: 200, item: again, already: true, dropped: [] };
      // not this coach's row: under the FEL-wide key (the held swap) another coach already has one by this name
      return { ok: false, status: 409, error: 'name_taken_fel' };
    }
    throw e;
  }
}
