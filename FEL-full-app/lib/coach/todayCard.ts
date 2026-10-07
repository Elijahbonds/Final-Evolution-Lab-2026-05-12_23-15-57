// The Today card at the top of /play and /train (MIRROR-PROGRESS, plan Phase 4, 2026-10-07).
//
// WHY. A coached athlete signs in and lands on /play — a shelf of games — while today's session waits two taps away on
// /coach's Today tab. The plan's gap list: "Coached athletes land on /play, not on today's session." This reads, for an
// athlete with an active program, which session is next (the same rule as Today: lib/coach/loop.ts nextSession over the
// same program rows lib/coach/todayServer.ts loadToday reads) and hands /play and /train a one-card door to it.
//
// IT DEFERS TO TODAY. The card never says WHY training is paused or lighter: a standing intake red flag
// (lib/health/intake.ts isHardStopped) and the coach's availability (COACH-AI Phase 8: Limited / Out,
// lib/coach/availabilityServer.ts) are said on Today, once. When either means "no session today" (a red flag, or Out),
// the card drops the session preview and just opens Today; Limited keeps the preview (the coach's lighter plan is the
// plan) and Today says the Limited line. Nothing here writes; nothing is read for anyone without an active program
// beyond the one program query.
//
// AGES. A coached minor gets the same card: it shows their coach's programme, which they already see on Today, and reads
// no health data of theirs (a minor has no stored intake — lib/privacy/healthWriteGate.ts).
import { nextSession, type ProgramTree } from './loop';
import { TREE_INCLUDE, toTree } from './server';
import { isHardStopped, latestIntake } from '../health/intake';
import { availabilityForAthlete, type RawDb } from './availabilityServer';
import { todayDay, type Availability } from './availability';

/** Where the card opens: /coach, whose first tab is Today (app/coach/_components/coach-view.tsx). */
export const TODAY_HREF = '/coach';

export type TodayCardView =
  | {
    kind: 'session';
    programName: string; coachName: string; blockLabel: string; sessionLabel: string;
    index: number; total: number; exercises: number; offDay: boolean;
  }
  | { kind: 'open'; programName: string; coachName: string };

/** The card's lines, so a test reads the same words the page shows. */
export function todayCardLines(v: TodayCardView): { eyebrow: string; title: string; line: string; cta: string } {
  const eyebrow = `Today · ${v.programName} · coach ${v.coachName}`;
  if (v.kind === 'open') return { eyebrow, title: 'Your coaching', line: 'Your coach\'s plan for today is on Today.', cta: 'Open Today' };
  const what = v.offDay ? 'Off day' : `${v.exercises} ${v.exercises === 1 ? 'exercise' : 'exercises'}`;
  return { eyebrow, title: `${v.blockLabel} · ${v.sessionLabel}`, line: `Session ${v.index + 1} of ${v.total} · ${what}`, cta: 'Open today\'s session' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CardDb = any;

export interface TodayCardOptions {
  now?: Date;
  /** The athlete's availability as their coach set it, or null when unknown / not on yet. Defaults to the pending table. */
  availability?: (db: CardDb, userId: string, today: string) => Promise<Availability | null>;
}

const readAvailability = async (db: CardDb, userId: string, today: string): Promise<Availability | null> => {
  const a = await availabilityForAthlete(db as RawDb, userId, today);
  return a.available ? a.status : null;
};

/** The card for this athlete, or null (no active program, a finished one, or a read that failed — /play never breaks). */
export async function todayCardFor(db: CardDb, userId: string, opts: TodayCardOptions = {}): Promise<TodayCardView | null> {
  const now = opts.now ?? new Date();
  try {
    const programs = await db.coachingProgram.findMany({
      where: { clientId: userId, isActive: true }, orderBy: { startDate: 'asc' },
      include: { ...TREE_INCLUDE, clientSessions: { where: { clientId: userId } } },
    });
    if (!Array.isArray(programs)) return null;
    for (const p of programs as { coachId: string; name: string; clientSessions: { sessionId: string; completedAt: unknown }[] }[]) {
      const tree: ProgramTree = toTree(p);
      const next = nextSession(tree, p.clientSessions.filter((c) => c.completedAt).map((c) => c.sessionId));
      if (!next) continue;
      const coach = await db.user.findUnique({ where: { id: p.coachId }, select: { name: true, email: true } });
      const coachName = coach?.name ?? coach?.email?.split('@')[0] ?? 'coach';
      const [intake, availability] = await Promise.all([
        latestIntake(db, userId).catch(() => null),
        (opts.availability ?? readAvailability)(db, userId, todayDay(now)).catch(() => null),
      ]);
      if (isHardStopped(intake) || availability === 'out') return { kind: 'open', programName: p.name, coachName };
      return {
        kind: 'session', programName: p.name, coachName,
        blockLabel: next.block.label, sessionLabel: next.session.label, index: next.index, total: next.total,
        exercises: next.session.exercises.length, offDay: next.session.kind === 'recovery',
      };
    }
    return null;
  } catch (e) {
    console.error('[coach/today-card] could not be read; the page shows no card', e);
    return null;
  }
}
