export const dynamic = 'force-dynamic';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  copyKbToCatalogue, createCatalogueItem, deleteCatalogueItem, listCatalogue, updateCatalogueItem, type CatalogueDb,
} from '@/lib/coach/catalogueServer';
import { catalogueMemoryDb, newCatalogueStore, type CatalogueMemoryStore, type Row } from '@/lib/coach/catalogueMemoryDb';
import { kbTagView } from '@/lib/coach/kbTags';

/**
 * /dev/coach-catalogue/api — the catalogue's server half for the dev harness (MIRROR-COACH P2, 2026-09-25).
 * Development only: a hard 404 outside `next dev`.
 *
 * The lane's dev server runs with its database deliberately offline and no session, so /api/coach/programs/exercises
 * answers 401 here before it does anything. This runs the SAME service functions those routes call
 * (lib/coach/catalogueServer.ts) against the in-memory stand-in the route tests use (lib/coach/catalogueMemoryDb.ts),
 * for a fixed dev coach. The only code here is the routes' own two lines of status mapping. The knowledge base is the
 * 20 exercises scripts/seed.ts writes, read from that file, so the harness shows the seeded KB with FEL's tags.
 *
 * A second coach (`dev-other-coach`) already owns "Goblet Squat" and "Crocodile Breathing": creating either as the
 * dev coach proves the per-coach name rule on the live page.
 */
const DEV_COACH = 'dev-coach';
const OTHER_COACH = 'dev-other-coach';
const g = globalThis as unknown as { __felCatalogueDev?: CatalogueMemoryStore };

function seededKb(): { tables: Record<string, Row[]> } {
  const src = readFileSync(join(process.cwd(), 'scripts/seed.ts'), 'utf8');
  const start = src.indexOf('const exercises = [');
  const end = src.indexOf('\n  ];', start);
  const list = new Function(`return ${src.slice(start + 'const exercises = '.length, end + 4)}`)() as Row[];
  const cats = [...new Set(list.map((e) => String(e.cat)))];
  return {
    tables: {
      exerciseCategory: cats.map((name, i) => ({ id: `cat-${i}`, name, sortOrder: i })),
      exercise: list.map((e, i) => ({
        id: `kb-${e.slug}`, slug: e.slug, name: e.name, categoryId: `cat-${cats.indexOf(String(e.cat))}`, phase: e.phase, chapter: e.chapter,
        bounceLevel: e.level, targetPrqStat: e.stat, dosage: e.dosage, coachingCues: e.cues, commonMistakes: e.mistakes ?? '',
        progressions: '', regressions: '', prerequisites: '', videoUrl: e.video ?? '', thumbnailUrl: '', published: true, sortOrder: i,
      })),
    },
  };
}

function store(reset = false): CatalogueMemoryStore {
  if (!g.__felCatalogueDev || reset) {
    const s = newCatalogueStore(seededKb().tables);
    const t = new Date();
    s.tables.programExercise.push(
      { id: 'pe-other-1', coachId: OTHER_COACH, name: 'Goblet Squat', category: 'lower-body', demoVideoUrl: null, primaryCues: [], commonFaults: null, equipment: [], defaultTempo: '3-1-1-0', pattern: 'squat', braceMode: 'set', skillLayer: 'strength', progressionOfId: null, regressionOfId: null, createdAt: t, updatedAt: t },
      { id: 'pe-other-2', coachId: OTHER_COACH, name: 'Crocodile Breathing', category: 'breath', demoVideoUrl: null, primaryCues: [], commonFaults: null, equipment: [], defaultTempo: '0-0-0-0', pattern: 'breath', braceMode: 'none', skillLayer: 'cylinder', progressionOfId: null, regressionOfId: null, createdAt: t, updatedAt: t },
    );
    g.__felCatalogueDev = s;
  }
  return g.__felCatalogueDev;
}
const db = () => catalogueMemoryDb(store()) as unknown as CatalogueDb;

const devOnly = () => (process.env.NODE_ENV !== 'development' ? NextResponse.json({ error: 'not_found' }, { status: 404 }) : null);
const body = async (req: NextRequest): Promise<Record<string, unknown> | null> => { try { const b = await req.json(); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; } catch { return null; } };

export async function GET(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const op = req.nextUrl.searchParams.get('op');
  if (op === 'list') return NextResponse.json(await listCatalogue(DEV_COACH, db()));
  if (op === 'kb') {
    // app/api/coach/catalogue/route.ts: published KB exercises with FEL's tags
    const s = store();
    const exercises = (await catalogueMemoryDb(s).exercise.findMany({ where: { published: true } }))
      .map((e) => ({ ...e, tags: kbTagView(String(e.slug), (e.category as { name?: string } | null)?.name) }));
    return NextResponse.json({ exercises, categories: s.tables.exerciseCategory });
  }
  if (op === 'all') return NextResponse.json(store().tables.programExercise.map((r) => ({ id: r.id, coachId: r.coachId, name: r.name })));
  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const op = req.nextUrl.searchParams.get('op');
  if (op === 'reset') { store(true); return NextResponse.json({ ok: true }); }
  const b = await body(req);
  if (!b) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  if (op === 'create') {
    const r = await createCatalogueItem(DEV_COACH, b, db());
    return r.ok ? NextResponse.json({ ...(r.item as object), warnings: r.warnings }, { status: r.status }) : NextResponse.json({ error: r.error, field: r.field }, { status: r.status });
  }
  if (op === 'from-kb') {
    const r = await copyKbToCatalogue(DEV_COACH, String(b.kbExerciseId ?? ''), db());
    return r.ok ? NextResponse.json({ item: r.item, already: r.already, dropped: r.dropped }, { status: r.status }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ error: 'unknown_op' }, { status: 400 });
}

export async function PUT(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const b = await body(req);
  if (!b) return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  const r = await updateCatalogueItem(DEV_COACH, req.nextUrl.searchParams.get('id') ?? '', b, db());
  return r.ok ? NextResponse.json({ ...(r.item as object), warnings: r.warnings }) : NextResponse.json({ error: r.error, field: r.field }, { status: r.status });
}

export async function DELETE(req: NextRequest) {
  const no = devOnly(); if (no) return no;
  const r = await deleteCatalogueItem(DEV_COACH, req.nextUrl.searchParams.get('id') ?? '', db());
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error, count: r.count }, { status: r.status });
}
