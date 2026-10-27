// lib/coach/import/apply.ts — COACH-PARITY (2026-10-26): the coach's CONFIRMED review grid written into a blank program.
// Nothing is saved before this: the parse and the match (./parse.ts, ./match.ts, POST /api/coach/import) only show.
//
// It is the builder's 'import_program' action (lib/coach/builderServer.ts, one delegating branch), so it runs behind the
// builder's own gate (the program's certified coach) and writes the way 'clone_template' does, reusing its rules rather
// than going around them:
//   · the program must still be blank (lib/coach/templates programIsBlank: nothing prescribed, nothing opened, no dated
//     week); its blank weeks are replaced in ONE nested write, so the program lands whole or not at all;
//   · every line through validateExerciseSpec (lib/coach/loop.ts) and the session shape (one key set, in Key);
//   · every exercise is a row of the COACH'S OWN catalogue: one they picked, a library entry copied through the library's
//     own bridge (lib/library/bridge.ts libraryToCatalogue, the "Add to my catalogue" path), or a new row of theirs by
//     the name they typed (lib/coach/catalogue.ts validateCatalogueCreate). A row they already have by that name is used
//     as it is — their words stay theirs;
//   · youth rules (lib/coach/taxonomy.ts youthRules: under 18, or no birth year): no adults-only library entry, no row
//     that pins (PIN_EXERCISE), the same refusals as the builder's add;
//   · everything is validated before the first write.
import type { Prisma } from '@/public/_prisma/client';
import type { LibraryIndex } from '@/lib/library/search/engine';
import { libraryToCatalogue } from '@/lib/library/bridge';
import { nameKey, validateCatalogueCreate, type CleanCatalogueItem } from '../catalogue';
import { validateExerciseSpec, type CleanExerciseSpec } from '../loop';
import { PIN_EXERCISE, youthRules } from '../taxonomy';
import { programIsBlank } from '../templates';
import { catalogueCreateInput, templateExercise } from '../templateCatalogue';
import { TREE_INCLUDE } from '../server';
import type { BuilderDb } from '../builderServer';
import { LIMITS } from './parse';
import type { ConfirmItem, ConfirmWeek, Pick } from './types';

export const MAX_TOTAL_WEEKS = 12;
type Fail = { ok: false; status: number; error: string; at?: string };
const fail = (status: number, error: string, at?: string): Fail => ({ ok: false, status, error, ...(at ? { at } : {}) });

export interface CleanLine { pick: Exclude<Pick, { kind: 'skip' }>; spec: CleanExerciseSpec }
export interface CleanPlan { weeks: { label: string; days: { label: string; lines: CleanLine[] }[] }[]; repeat: number }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function cleanPick(p: unknown): Pick | null {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  if (o.kind === 'skip') return { kind: 'skip' };
  if ((o.kind === 'catalogue' || o.kind === 'library') && typeof o.id === 'string' && o.id && o.id.length <= 120) return { kind: o.kind, id: o.id };
  if (o.kind === 'new' && str(o.name, 80)) return { kind: 'new', name: str(o.name, 80) };
  if (o.kind === 'template' && typeof o.key === 'string' && templateExercise(o.key)) return { kind: 'template', key: o.key };
  return null;
}

/** The confirmed grid from a request: shape, limits and every prescription checked. Pure. */
export function cleanImport(body: Record<string, unknown>): { ok: true; plan: CleanPlan } | Fail {
  const weeks = Array.isArray(body.weeks) ? body.weeks as ConfirmWeek[] : [];
  const repeat = body.repeat === undefined ? 1 : body.repeat;
  if (!(typeof repeat === 'number' && Number.isInteger(repeat) && repeat >= 1 && repeat <= MAX_TOTAL_WEEKS)) return fail(400, 'import_repeat');
  if (!weeks.length || weeks.length > LIMITS.weeks) return fail(400, 'import_weeks');
  if (weeks.length * repeat > MAX_TOTAL_WEEKS) return fail(400, 'import_too_long');
  const out: CleanPlan['weeks'] = [];
  for (const [wi, w] of weeks.entries()) {
    const days = Array.isArray(w?.days) ? w.days : [];
    if (days.length > LIMITS.daysPerWeek) return fail(400, 'import_days', `${wi + 1}`);
    const cleanDays: CleanPlan['weeks'][number]['days'] = [];
    for (const [di, d] of days.entries()) {
      const items = Array.isArray(d?.items) ? d.items as ConfirmItem[] : [];
      if (items.length > LIMITS.itemsPerDay * 2) return fail(400, 'import_items', `${wi + 1}.${di + 1}`);
      const lines: CleanLine[] = [];
      let keyTaken = false;
      for (const [ii, it] of items.entries()) {
        const at = `${wi + 1}.${di + 1}.${ii + 1}`;
        const pick = cleanPick(it?.pick);
        if (!pick) return fail(400, 'import_pick', at);
        if (pick.kind === 'skip') continue;
        const isKeySet = it.isKeySet === true && !keyTaken && (it.section ?? 'key') === 'key';
        if (isKeySet) keyTaken = true;
        const v = validateExerciseSpec({
          exerciseId: 'import', sets: it.sets ?? undefined, reps: it.reps ?? undefined, load: it.load ?? '', tempo: it.tempo ?? undefined,
          restSeconds: it.restSeconds ?? undefined, workSeconds: it.workSeconds ?? null, supersetGroup: it.superset ?? null,
          section: it.section ?? undefined, isKeySet, coachNote: it.note ?? null,
          ...(it.effortBand ? { effortBand: it.effortBand } : {}), ...(it.holdSeconds ? { holdSeconds: it.holdSeconds } : {}),
          ...(Array.isArray(it.setupCues) && it.setupCues.length ? { setupCues: it.setupCues } : {}),
        });
        if (!v.ok) return fail(400, `import_line_${v.error}`, at);
        lines.push({ pick, spec: v.spec });
      }
      if (lines.length > LIMITS.itemsPerDay) return fail(400, 'import_items', `${wi + 1}.${di + 1}`);
      if (lines.length) cleanDays.push({ label: str(d?.label, LIMITS.label) || `Day ${di + 1}`, lines });
    }
    if (cleanDays.length) out.push({ label: str(w?.label, LIMITS.label) || `Week ${wi + 1}`, days: cleanDays });
  }
  if (!out.length) return fail(400, 'import_empty');
  return { ok: true, plan: { weeks: out, repeat } };
}

/** The weeks as blocks, repeated: "Week 1 · Base" ×2 → Week 1 · Base, Week 2 · Base (a numbered label is renumbered). */
export function expandWeeks(plan: CleanPlan): { label: string; days: { label: string; lines: CleanLine[] }[] }[] {
  const out: CleanPlan['weeks'] = [];
  for (let r = 0; r < plan.repeat; r += 1) {
    for (const w of plan.weeks) {
      const n = out.length + 1;
      out.push({ ...w, label: /^week\s*\d+/i.test(w.label) ? w.label.replace(/^week\s*\d+/i, `Week ${n}`) : plan.repeat > 1 ? `Week ${n} · ${w.label}` : w.label });
    }
  }
  return out;
}

export interface ApplyDeps {
  /** The library index (the route: lib/library/server.ts libraryState). */
  index: () => Promise<LibraryIndex>;
  /** Keep the catalogue row → library entry link when that column exists (lib/library/store.ts linkCatalogueRow). */
  link?: (rowId: string, coachId: string, libraryId: string) => Promise<unknown>;
}

/** The app's deps, loaded on first use (the builder's other actions never pull the library in). */
export const LIBRARY_DEPS: ApplyDeps = {
  index: async () => (await (await import('@/lib/library/server')).libraryState()).index,
  link: async (rowId, coachId, libraryId) => {
    const [{ linkCatalogueRow }, { prisma }] = await Promise.all([import('@/lib/library/store'), import('@/lib/db')]);
    return linkCatalogueRow(prisma as unknown as Parameters<typeof linkCatalogueRow>[0], rowId, coachId, libraryId);
  },
};

/**
 * Write the confirmed import into `programId` (already checked by the builder to be this certified coach's). Returns ok,
 * or the refusal; the caller reloads the tree. See the header for every rule.
 */
export async function applyImport(db: BuilderDb, coachId: string, program: { id: string; clientId: string }, body: Record<string, unknown>, deps: ApplyDeps): Promise<{ ok: true; weeks: number; exercises: number; created: number } | Fail> {
  const c = cleanImport(body);
  if (!c.ok) return c;
  const client = await db.user.findUnique({ where: { id: program.clientId }, select: { dobYear: true } });
  const youth = youthRules(client?.dobYear);
  const tree = await db.coachingProgram.findUnique({ where: { id: program.id }, include: TREE_INCLUDE });
  const opened = await db.clientSession.findMany({ where: { programId: program.id }, select: { id: true }, take: 1 });
  if (!tree || !programIsBlank(tree.blocks, opened.length)) return fail(409, 'program_not_empty');

  // every pick resolved to a catalogue row of the coach's, or a row to create — before any write
  const mine = await db.programExercise.findMany({ where: { coachId }, select: { id: true, name: true } });
  const byKey = new Map(mine.map((m) => [nameKey(m.name), m.id]));
  const toCreate = new Map<string, { item: CleanCatalogueItem; libraryId: string | null }>();
  const rowFor = new Map<string, string>();   // pick key → existing row id, or 'new:<nameKey>'
  let index: LibraryIndex | null = null;
  const pickKey = (p: CleanLine['pick']) => (p.kind === 'new' ? `new:${p.name.toLowerCase()}` : p.kind === 'template' ? `template:${p.key}` : `${p.kind}:${p.id}`);
  for (const [wi, w] of c.plan.weeks.entries()) {
    for (const [di, d] of w.days.entries()) {
      for (const [li, l] of d.lines.entries()) {
        const at = `${wi + 1}.${di + 1}.${li + 1}`;
        const k = pickKey(l.pick);
        if (rowFor.has(k)) continue;
        if (l.pick.kind === 'catalogue') {
          const own = mine.find((m) => m.id === (l.pick as { id: string }).id);
          if (!own) return fail(404, 'exercise_not_found', at);
          if (youth && PIN_EXERCISE.test(own.name)) return fail(400, 'pin_not_for_youth', at);
          rowFor.set(k, own.id);
          continue;
        }
        let item: CleanCatalogueItem;
        let libraryId: string | null = null;
        if (l.pick.kind === 'library') {
          index ??= await deps.index();
          const e = index.docs[index.byId.get(l.pick.id) ?? -1];
          if (!e || e.review.status === 'rejected') return fail(404, 'library_not_found', at);
          if (youth && !e.youthOk) return fail(400, 'library_adults_only', at);
          const v = libraryToCatalogue(e);
          if (!v.ok) return fail(422, `library_${v.error}`, at);
          item = v.item; libraryId = e.id;
        } else if (l.pick.kind === 'template') {
          // COACH-DELIVERY COA-02: a FEL template exercise, with the template catalogue's cues and faults (the clone's seed)
          const v = validateCatalogueCreate(catalogueCreateInput(l.pick.key));
          if (!v.ok) return fail(422, `template_${v.error}`, at);
          item = v.item;
        } else {
          const v = validateCatalogueCreate({ name: l.pick.name });
          if (!v.ok) return fail(400, `new_${v.error}`, at);
          item = v.item;
        }
        if (youth && PIN_EXERCISE.test(item.name)) return fail(400, 'pin_not_for_youth', at);
        const have = byKey.get(nameKey(item.name));
        if (have) { rowFor.set(k, have); continue; }
        const nk = `new:${nameKey(item.name)}`;
        if (!toCreate.has(nk)) toCreate.set(nk, { item, libraryId });
        rowFor.set(k, nk);
      }
    }
  }

  // the writes: new catalogue rows, then the weeks in one nested write
  const created = new Map<string, string>();
  for (const [nk, { item, libraryId }] of toCreate) {
    try {
      const row = await db.programExercise.create({ data: { coachId, ...item, commonFaults: item.commonFaults as unknown as Prisma.InputJsonValue }, select: { id: true } });
      created.set(nk, row.id);
      if (libraryId && deps.link) await deps.link(row.id, coachId, libraryId).catch(() => false);
    } catch (e) {
      // a database still carrying the old FEL-wide name key refuses a name another coach owns (builder's clone precedent)
      if ((e as { code?: string } | null)?.code === 'P2002') return fail(409, 'import_name_taken_fel');
      throw e;
    }
  }
  const idOf = (l: CleanLine) => { const r = rowFor.get(pickKey(l.pick))!; return r.startsWith('new:') ? created.get(r)! : r; };
  const blocks = expandWeeks(c.plan);
  let exercises = 0;
  await db.coachingProgram.update({
    where: { id: program.id },
    data: {
      durationWeeks: blocks.length,
      blocks: {
        deleteMany: { id: { in: tree.blocks.map((b) => b.id) } },
        create: blocks.map((b, bi) => ({
          order: bi + 1, label: b.label,
          sessions: { create: b.days.map((d, di) => ({
            order: di + 1, label: d.label,
            exercises: { create: d.lines.map((l, k) => { exercises += 1; return { order: k + 1, ...l.spec, exerciseId: idOf(l) }; }) },
          })) },
        })),
      },
    },
    select: { id: true },
  });
  return { ok: true, weeks: blocks.length, exercises, created: created.size };
}
