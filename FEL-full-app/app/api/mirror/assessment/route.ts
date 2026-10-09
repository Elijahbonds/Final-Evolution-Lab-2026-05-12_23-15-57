export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeTraceablePrq, createPrqEntry, getLatestPrqVector } from '@/lib/prq-entries';
import { PRQ_CAMERA_SOURCE, prqGrade } from '@/lib/prq';
import { canSaveScanNumbers, refuseScanSave } from '@/lib/privacy/scanSaveGate';
import { ASSESSMENT_KIND, MAX_RECORD_BYTES, mediaIn, prqWritesFor, validateRecord, type AssessmentRecord } from '@/lib/assess/prqWrite';
import { mqs as mqsOf, type TestResult } from '@/lib/assess/scoring';
import { buildAssessmentProgram } from '@/lib/assess/program';

/**
 * Mirror Assess: a finished Quick Screen, as numbers (lib/assess, spec §9).
 *
 * POST  a numbers-only record → one WorkoutScan (kind 'mirror_assessment', its own kind so it never mixes with the
 *       posture screen's 'mirror_screen' or the old 'movement_screen') and a camera-estimate PrqEntry per axis the
 *       screen measured, each carrying the scan's id as its sessionId. Answers with PRQ before → after, recomputed by
 *       computeTraceablePrq (lib/prq-entries.ts, unchanged).
 * GET   the signed-in athlete's latest assessment and their traceable PRQ.
 *
 * WHAT IS REFUSED, and in this order:
 *   · no session (401): guests see their scores on the page; nothing is saved for them (owner default Q8)
 *   · a body over MAX_RECORD_BYTES (413), or anything media-shaped anywhere in it (400): no frame, image, video or
 *     landmark stream is ever accepted, let alone stored (spec §10)
 *   · a record that does not validate (400): strict, an unknown field is refused
 *   · a screen that stopped for pain (422): pain is a referral, nothing from it is saved
 *   · anyone but a verified 18+ account that has opted in (403 scan_save_adults_only; TEEN-WRITE-BLOCK, FE PM 23:05 PT):
 *     lib/privacy/scanSaveGate.ts, today nobody. The parent path is GONE: until 2026-09-30 a minor with an accepted
 *     GuardianConsent was saved here (412 without one); a parent's yes is no longer grounds to store anyone's scan.
 *
 * THE CLIENT'S NUMBERS ARE NOT TRUSTED FOR PRQ. The axis values are recomputed here from the record's measured values
 * (prqWritesFor), the MQS from its test scores, and an axis that did not score writes nothing: never a 50.
 * Idempotent per assessmentId: a retried post returns the saved row and writes nothing new.
 */

const RECENT = 50;

async function userId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

type Stored = Record<string, unknown> & { assessmentId?: string };

/** The PRQ vector as { axis: value } for the before → after lines. */
async function axes(uid: string): Promise<Record<string, number>> {
  const vec = await getLatestPrqVector(prisma, uid);
  return Object.fromEntries([...vec.entries()].map(([k, v]) => [k, v.value]));
}

const summary = (p: { score: number; measured: number; total: number }) => ({ ...p, grade: p.measured ? prqGrade(p.score).key : null });

/** measuredAt as the client gave it when it is plausible (the last six hours, not the future), else now. */
function measuredAt(rec: AssessmentRecord, now: Date): Date {
  const t = Date.parse(rec.measuredAt);
  return Number.isFinite(t) && t <= now.getTime() + 60_000 && t >= now.getTime() - 6 * 3600_000 ? new Date(t) : now;
}

export async function POST(req: NextRequest) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ error: 'unauthorized', saved: false }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_RECORD_BYTES) return NextResponse.json({ error: 'too_large', saved: false }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return NextResponse.json({ error: 'invalid_json', saved: false }, { status: 400 }); }
  const media = mediaIn(raw);
  if (media) return NextResponse.json({ error: 'media_not_accepted', field: media, saved: false }, { status: 400 });
  const v = validateRecord(raw);
  if (!v.ok) return NextResponse.json({ error: 'invalid_record', detail: v.error, saved: false }, { status: 400 });
  const rec = v.value;
  if (rec.tests.some((t) => t.status === 'painStop')) return NextResponse.json({ error: 'pain_stop', saved: false }, { status: 422 });

  // TEEN-WRITE-BLOCK (FE PM 23:05 PT): the parent path is removed; verified 18+ AND opted in, before every read and write below.
  if (!(await canSaveScanNumbers(prisma, uid))) return refuseScanSave();

  // a retried post: the row that is already there, nothing new written
  const recent = await prisma.workoutScan.findMany({
    where: { userId: uid, kind: ASSESSMENT_KIND }, orderBy: { createdAt: 'desc' }, take: RECENT, select: { id: true, metrics: true },
  });
  const prior = recent.find((r: { metrics: unknown }) => (r.metrics as Stored | null)?.assessmentId === rec.assessmentId);
  if (prior) {
    const m = prior.metrics as Stored;
    return NextResponse.json({ saved: true, idempotent: true, scanId: prior.id, assessmentId: rec.assessmentId, prqBefore: m.prqBefore ?? null, prqAfter: m.prqAfter ?? null, writes: m.prqWrites ?? [], program: m.program ?? null });
  }

  const now = new Date();
  const before = await computeTraceablePrq(prisma, uid);
  const axesBefore = await axes(uid);
  const writes = prqWritesFor(rec);
  const m = mqsOf(rec.tests as unknown as TestResult[], rec.mode);
  const stored = {
    assessmentId: rec.assessmentId, version: rec.version, protocolVersion: rec.protocolVersion, thresholdsVersion: rec.thresholdsVersion,
    mode: rec.mode, measuredAt: rec.measuredAt, device: rec.device, takeoffLeg: rec.takeoffLeg, tests: rec.tests,
    mqs: m?.value ?? null, mqsBand: m?.band ?? null, mqsLabel: m?.label ?? null, fmsTotal: m?.fmsTotal ?? null, fmsMax: m?.fmsMax ?? null,
    asymmetryFlags: m?.asymmetryFlags ?? 0,
    prqWrites: writes.map((w) => ({ axis: w.axis, value: w.value, reason: w.reason, entryId: null as string | null })),
    prqBefore: summary(before), prqAfter: null as ReturnType<typeof summary> | null,
    program: buildAssessmentProgram(rec),
  };
  const scan = await prisma.workoutScan.create({ data: { userId: uid, kind: ASSESSMENT_KIND, metrics: stored as unknown as object }, select: { id: true } });

  const at = measuredAt(rec, now);
  for (const w of stored.prqWrites) {
    const { id } = await createPrqEntry(prisma, { userId: uid, attribute: w.axis, value: w.value, unit: 'score', source: PRQ_CAMERA_SOURCE, measuredAt: at, sessionId: scan.id });
    w.entryId = id;
  }
  const after = await computeTraceablePrq(prisma, uid);
  stored.prqAfter = summary(after);
  await prisma.workoutScan.update({ where: { id: scan.id }, data: { metrics: stored as unknown as object } });

  return NextResponse.json({
    saved: true, idempotent: false, scanId: scan.id, assessmentId: rec.assessmentId,
    prqBefore: stored.prqBefore, prqAfter: stored.prqAfter,
    writes: stored.prqWrites.map((w) => ({ ...w, before: axesBefore[w.axis] ?? null, after: w.value })),
    mqs: m ? { value: m.value, band: m.band, label: m.label } : null,
    program: stored.program,
  });
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const latest = await prisma.workoutScan.findFirst({
    where: { userId: uid, kind: ASSESSMENT_KIND }, orderBy: { createdAt: 'desc' }, select: { id: true, metrics: true, createdAt: true },
  });
  const prq = await computeTraceablePrq(prisma, uid);
  return NextResponse.json({ assessment: latest, prq: summary(prq) });
}
