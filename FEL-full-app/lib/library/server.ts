// lib/library/server.ts — EXERCISE-LIBRARY (2026-10-25): the library's server half. The routes under app/api/library,
// app/api/coach/programs/exercises/{from-library,[id]/submit} and app/api/admin/library are a few lines over these.
//
//   · THE LIBRARY = the data files (lib/library/files.ts) with the owner's run-time decisions laid over them
//     (lib/library/store.ts, pending SQL): a row with the same id replaces the file entry, an approved coach submission
//     is added. The search index is built once and rebuilt only when that overlay changes (checked at most every
//     CACHE_MS), so a query is an index lookup, never a table scan.
//   · WHO SEES WHAT: anyone signed in browses APPROVED entries; a coach (role coach/admin, a certified facilitator, or
//     anyone coaching a program or holding a catalogue) may opt in to drafts, labelled as drafts; the admin role
//     (lib/admin/requireAdmin.ts, the existing moderator role) reviews. Youth rules (taxonomy.ts youthRules: under 18 by
//     birth year, or no birth year) leave adults-only entries out for that viewer, everywhere.
import 'server-only';
import { prisma } from '@/lib/db';
import { isCertifiedCoach } from '@/lib/coach/server';
import { youthRules } from '@/lib/coach/taxonomy';
import { createCatalogueItem, type CatalogueDb } from '@/lib/coach/catalogueServer';
import { nameKey as catalogueNameKey } from '@/lib/coach/catalogue';
import { answerAsk } from './ask/answer';
import { libraryToCatalogue, catalogueToSubmission, submissionToEntry } from './bridge';
import { demoFor, muscleMap } from './demo';
import { loadLibraryFiles } from './files';
import { buildIndex, search, FACET_KEYS, type LibraryIndex, type SearchFilters } from './search/engine';
import {
  catalogueLinks, createSubmission, decideSubmission, linkCatalogueRow, mySubmissions, overlayVersion, readOverlay, submissionById,
  submissionQueue, upsertEntries, withdrawSubmission, libraryReady, type RawDb,
} from './store';
import type { LibraryExercise } from './types';
import { checkAgainst, checkEntry } from './validate';

export const CACHE_MS = 60_000;

const raw = (): RawDb => prisma as unknown as RawDb;

let cache: { index: LibraryIndex; version: string; checkedAt: number } | null = null;

/** Tests only. */
export function resetLibraryCache(): void { cache = null; }

export function mergeOverlay(files: readonly LibraryExercise[], overlay: readonly LibraryExercise[]): LibraryExercise[] {
  const byId = new Map(overlay.map((e) => [e.id, e]));
  // the table has no variantOf column (no schema change): an owner edit keeps the file entry's base link
  const out = files.map((e) => {
    const o = byId.get(e.id);
    if (!o) return e;
    return e.variantOf && o.variantOf === undefined ? { ...o, variantOf: e.variantOf } : o;
  });
  const have = new Set(files.map((e) => e.id));
  for (const e of overlay) if (!have.has(e.id)) out.push(e);
  return out;
}

/** The current library and its index, plus whether the review tables exist. */
export async function libraryState(db: RawDb = raw(), now: number = Date.now()): Promise<{ index: LibraryIndex; ready: boolean }> {
  if (cache && now - cache.checkedAt < CACHE_MS) return { index: cache.index, ready: cache.version !== 'files' };
  const version = (await overlayVersion(db, now)) ?? 'files';
  if (cache && cache.version === version) { cache.checkedAt = now; return { index: cache.index, ready: version !== 'files' }; }
  const overlay = version === 'files' ? null : await readOverlay(db, now);
  const entries = overlay ? mergeOverlay(loadLibraryFiles(), overlay.rows) : loadLibraryFiles();
  cache = { index: buildIndex(entries), version: overlay ? version : 'files', checkedAt: now };
  return { index: cache.index, ready: !!overlay };
}

export interface LibraryViewer { userId: string; isAdmin: boolean; isCoach: boolean; youth: boolean }

export async function libraryViewer(userId: string, role: string | undefined): Promise<LibraryViewer> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, dobYear: true } }).catch(() => null);
  const r = user?.role ?? role ?? '';
  const isAdmin = r === 'admin';
  let isCoach = isAdmin || r === 'coach';
  if (!isCoach) {
    const [cert, rows, clients] = await Promise.all([
      isCertifiedCoach(userId).catch(() => false),
      prisma.programExercise.count({ where: { coachId: userId } }).catch(() => 0),
      prisma.coachClient.count({ where: { coachId: userId } }).catch(() => 0),
    ]);
    isCoach = cert || rows > 0 || clients > 0;
  }
  return { userId, isAdmin, isCoach, youth: youthRules(user?.dobYear) };
}

// ── what a card shows ───────────────────────────────────────────────────────────────────────────────────────────────

/** A search hit's other group members (its base and the base's variants), as the "+N variants" list shows them. */
export interface VariantRef { id: string; name: string; level: LibraryExercise['level']; status: LibraryExercise['review']['status'] }

export interface LibraryCard extends LibraryExercise {
  muscleMap: { primary: string[]; secondary: string[] };
  /** LIBRARY-ANATOMY (2026-10-25): the loop the 3D demo plays (lib/library/demo.ts demoFor), or null — the cue card. */
  avatarClip: string | null;
  /** …and, for an isometric hold, the second of that loop it holds still at (null: it loops). */
  avatarHold: number | null;
  /** On a search hit: the other matching members of its group. Absent elsewhere. */
  variants?: VariantRef[];
}

export const toCard = (e: LibraryExercise): LibraryCard => { const d = demoFor(e); return { ...e, muscleMap: muscleMap(e), avatarClip: d?.clip ?? null, avatarHold: d?.hold ?? null }; };
export const toVariantRef = (e: LibraryExercise): VariantRef => ({ id: e.id, name: e.name, level: e.level, status: e.review.status });

const LIST = (v: string | null): string[] | undefined => {
  const out = (v ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  return out.length ? out : undefined;
};

/** The search screen's request, read from a URL's query string. */
export function filtersFromParams(p: URLSearchParams): SearchFilters {
  const f: SearchFilters = {};
  for (const k of FACET_KEYS) { const v = LIST(p.get(k)); if (v) (f as Record<string, string[]>)[k] = v; }
  const low = LIST(p.get('lowLoad'));
  if (low) f.lowLoad = low;
  const not = LIST(p.get('notCategory'));
  if (not) f.notCategory = not;
  const notEq = LIST(p.get('notEquipment'));
  if (notEq) f.notEquipment = notEq;
  if (p.get('only') === '1') { f.equipmentOnly = true; if (!f.equipment) f.equipment = []; }
  return f;
}

export async function searchLibrary(viewer: LibraryViewer, params: URLSearchParams) {
  const { index, ready } = await libraryState();
  const q = (params.get('q') ?? '').slice(0, 120);
  const drafts = viewer.isCoach && params.get('drafts') === '1';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const limit = Math.min(48, Math.max(1, Number(params.get('limit') ?? 24) || 24));
  const r = search(index, q, filtersFromParams(params), { drafts, youth: viewer.youth, offset, limit });
  const approved = index.docs.filter((e) => e.review.status === 'approved' && (!viewer.youth || e.youthOk)).length;
  return {
    ...r, hits: r.hits.map((h) => ({ ...toCard(h.entry), variants: h.variants.map(toVariantRef) })),
    viewer: { coach: viewer.isCoach, admin: viewer.isAdmin, drafts, youth: viewer.youth },
    library: { total: index.docs.length, approved, drafts: index.docs.filter((e) => e.review.status === 'draft').length, ready },
  };
}

export async function libraryEntry(viewer: LibraryViewer, id: string) {
  const { index } = await libraryState();
  const e = index.docs[index.byId.get(id) ?? -1];
  if (!e || e.review.status === 'rejected' || (viewer.youth && !e.youthOk)) return null;
  if (e.review.status !== 'approved' && !viewer.isCoach) return null;
  const link = (lid: string | null) => { const x = lid ? index.docs[index.byId.get(lid) ?? -1] : null; return x ? { id: x.id, name: x.name, level: x.level, status: x.review.status } : null; };
  return { entry: toCard(e), regression: link(e.regressionId), progression: link(e.progressionId) };
}

export async function askLibrary(viewer: LibraryViewer, question: string, ai: ((system: string, user: string) => Promise<string>) | null, drafts: boolean) {
  const { index } = await libraryState();
  const a = await answerAsk(index, question, { drafts: viewer.isCoach && drafts, youth: viewer.youth, ai: ai ? { call: ai } : null, limit: 10 });
  return {
    question: a.parsed.question, chips: a.chips, filters: a.filters, text: a.parsed.text, relation: a.parsed.relation, intent: a.parsed.intent,
    results: a.results.map(toCard), total: a.total, plan: a.plan?.map((p) => ({ slot: p.slot, minutes: p.minutes, entry: toCard(p.entry) })) ?? null,
    anchor: a.anchor ? { id: a.anchor.id, name: a.anchor.name } : null, safety: a.safety, relaxed: a.relaxed, ai: a.ai, didYouMean: a.didYouMean,
  };
}

// ── coach actions ───────────────────────────────────────────────────────────────────────────────────────────────────

/** "Add to my catalogue": copy (or find the copy already there), then keep the link when the column exists. */
export async function addLibraryToCatalogue(viewer: LibraryViewer, libraryId: string, db: CatalogueDb = prisma) {
  const { index } = await libraryState();
  const e = index.docs[index.byId.get(libraryId) ?? -1];
  if (!e || e.review.status === 'rejected' || (e.review.status !== 'approved' && !viewer.isCoach) || (viewer.youth && !e.youthOk)) return { ok: false as const, status: 404 as const, error: 'not_found' };
  const v = libraryToCatalogue(e);
  if (!v.ok) return { ok: false as const, status: 422 as const, error: v.error, field: v.field };
  const mine = await db.programExercise.findMany({ where: { coachId: viewer.userId }, select: { id: true, name: true } });
  const have = mine.find((r) => catalogueNameKey(r.name) === catalogueNameKey(v.item.name));
  let item: unknown;
  let already = false;
  if (have) { item = await db.programExercise.findUnique({ where: { id: have.id } }); already = true; }
  else {
    const made = await createCatalogueItem(viewer.userId, v.item as unknown as Record<string, unknown>, db);
    if (!made.ok) return made;
    item = made.item;
  }
  const rowId = (item as { id?: string } | null)?.id;
  const linked = rowId ? await linkCatalogueRow(raw(), rowId, viewer.userId, e.id) : false;
  return { ok: true as const, status: already ? 200 as const : 201 as const, item, already, linked };
}

/** "Submit to library": the coach's own row, snapshotted for moderation. */
export async function submitToLibrary(viewer: LibraryViewer, programExerciseId: string) {
  const row = await prisma.programExercise.findUnique({ where: { id: programExerciseId } });
  if (!row || row.coachId !== viewer.userId) return { ok: false as const, status: 404 as const, error: 'not_found' };
  if (!(await libraryReady(raw()))) return { ok: false as const, status: 503 as const, error: 'library_not_ready' };
  const payload = catalogueToSubmission(row);
  // the same checks a library entry passes, run now so the coach hears about a problem before the owner does
  const preview = checkEntry(submissionToEntry(payload, 'preview', 'preview')).filter((i) => i.check === 'cueLint' || i.check === 'claims');
  const s = await createSubmission(raw(), viewer.userId, programExerciseId, payload);
  if (!s) return { ok: false as const, status: 503 as const, error: 'library_not_ready' };
  return { ok: true as const, status: s.already ? 200 as const : 201 as const, submission: s, notes: preview.map((i) => i.detail) };
}

export async function mySubmissionList(viewer: LibraryViewer) {
  const rows = await mySubmissions(raw(), viewer.userId);
  return rows ? { ready: true, submissions: rows } : { ready: false, submissions: [] };
}

export async function withdrawMine(viewer: LibraryViewer, submissionId: string) {
  if (!(await libraryReady(raw()))) return { ok: false as const, status: 503 as const, error: 'library_not_ready' };
  return (await withdrawSubmission(raw(), submissionId, viewer.userId)) ? { ok: true as const, status: 200 as const } : { ok: false as const, status: 404 as const, error: 'not_found' };
}

export async function myLibraryLinks(viewer: LibraryViewer): Promise<Record<string, string>> {
  return catalogueLinks(raw(), viewer.userId);
}

// ── owner review ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function reviewOverview(params: URLSearchParams) {
  const { index, ready } = await libraryState();
  const batches = new Map<string, { batch: string; total: number; draft: number; approved: number; rejected: number }>();
  for (const e of index.docs) {
    const b = batches.get(e.review.batch) ?? { batch: e.review.batch, total: 0, draft: 0, approved: 0, rejected: 0 };
    b.total++; b[e.review.status]++;
    batches.set(e.review.batch, b);
  }
  const batch = params.get('batch');
  const status = params.get('status') ?? 'draft';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const list = index.docs.filter((e) => (!batch || e.review.batch === batch) && (status === 'all' || e.review.status === status));
  return {
    ready, batches: [...batches.values()].sort((a, b) => a.batch.localeCompare(b.batch)),
    total: list.length, entries: list.slice(offset, offset + 50).map(toCard),
    queue: ready ? (await submissionQueue(raw())) ?? [] : [],
  };
}

export type ReviewAction =
  | { action: 'approve' | 'reject'; ids: string[] }
  | { action: 'approve-batch'; batch: string }
  | { action: 'edit'; entry: LibraryExercise; approve?: boolean }
  | { action: 'moderate'; submissionId: string; decision: 'approved' | 'rejected'; note?: string; entry?: LibraryExercise };

const MAX_BATCH = 2000;

export async function reviewAct(moderatorId: string, body: ReviewAction) {
  if (!(await libraryReady(raw()))) return { ok: false as const, status: 503 as const, error: 'library_not_ready' };
  const { index } = await libraryState();
  const get = (id: string) => index.docs[index.byId.get(id) ?? -1] ?? null;
  const stamp = (e: LibraryExercise, status: 'approved' | 'rejected'): LibraryExercise => ({ ...e, review: { ...e.review, status, reviewer: moderatorId } });
  let writes: LibraryExercise[] = [];
  if (body.action === 'approve' || body.action === 'reject') {
    const ids = [...new Set(body.ids)].slice(0, MAX_BATCH);
    writes = ids.map(get).filter((e): e is LibraryExercise => !!e).map((e) => stamp(e, body.action === 'approve' ? 'approved' : 'rejected'));
  } else if (body.action === 'approve-batch') {
    writes = index.docs.filter((e) => e.review.batch === body.batch && e.review.status === 'draft').slice(0, MAX_BATCH).map((e) => stamp(e, 'approved'));
  } else if (body.action === 'edit') {
    const before = get(body.entry?.id);
    if (!before) return { ok: false as const, status: 404 as const, error: 'not_found' };
    // the id, the source and the batch are the library's; the owner edits the words, tags and dose
    const edited: LibraryExercise = { ...body.entry, id: before.id, slug: before.slug, source: before.source, review: { ...before.review, status: body.approve ? 'approved' : before.review.status, reviewer: body.approve ? moderatorId : before.review.reviewer } };
    const issues = checkAgainst(edited, index.docs);
    if (issues.length) return { ok: false as const, status: 422 as const, error: 'invalid_entry', issues };
    writes = [edited];
  } else if (body.action === 'moderate') {
    const sub = await submissionById(raw(), body.submissionId);
    if (!sub || sub.status !== 'pending') return { ok: false as const, status: 404 as const, error: 'not_found' };
    if (body.decision === 'rejected') {
      const done = await decideSubmission(raw(), sub.id, 'rejected', moderatorId, body.note?.slice(0, 500) ?? null, null);
      return done ? { ok: true as const, status: 200 as const, written: 0 } : { ok: false as const, status: 409 as const, error: 'already_decided' };
    }
    const entry = body.entry ? { ...body.entry, source: { kind: 'coach-submitted' as const, ref: sub.id, url: null, licence: submissionToEntry(sub.payload, sub.id, moderatorId).source.licence }, review: { status: 'approved' as const, reviewer: moderatorId, batch: 'coach-submitted' } } : submissionToEntry(sub.payload, sub.id, moderatorId);
    const issues = checkAgainst(entry, index.docs);
    if (issues.length) return { ok: false as const, status: 422 as const, error: 'invalid_entry', issues, draft: entry };
    await upsertEntries(raw(), [entry]);
    await decideSubmission(raw(), sub.id, 'approved', moderatorId, body.note?.slice(0, 500) ?? null, entry.id);
    resetLibraryCache();
    return { ok: true as const, status: 200 as const, written: 1, id: entry.id };
  }
  if (!writes.length) return { ok: false as const, status: 404 as const, error: 'not_found' };
  await upsertEntries(raw(), writes);
  resetLibraryCache();
  return { ok: true as const, status: 200 as const, written: writes.length };
}
