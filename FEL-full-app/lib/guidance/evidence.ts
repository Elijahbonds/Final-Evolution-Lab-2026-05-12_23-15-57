// evidence — turning what somebody actually did into something the counsellor can read.
//
// pathways.ts has been complete and correct since 2026-09-12 and had NOT ONE CONSUMER: nineteen pathways with
// real copy, a scorer that shows its working, and nothing anywhere that called it. The missing piece was this —
// sessions are stored by MODE and cards by DISCIPLINE, and the counsellor only speaks discipline.
//
// THE MAP IS DELIBERATELY INCOMPLETE. A mode that is not evidence of a direction is left out rather than filed
// under 'sport' to make the table look finished. Brain Brawl is a quiz and Carnival is a party game; somebody
// playing them is not telling you they want to coach. Inflating the sport count with them would make the
// counsellor confidently wrong, and the one thing this layer must not do is be confidently wrong at a
// fourteen-year-old about who they are.

import type { Discipline } from '../creator/creative-card-types';
import type { ActivityEvidence } from './pathways';

/** Mode key -> the discipline that playing it is evidence of. Absent means "this tells us nothing". */
export const MODE_DISCIPLINE: Record<string, Discipline> = {
  // Hoops, combat, boards, racing, field — all of it is sport.
  dunkContest: 'sport', hoops1v1: 'sport', hoops3v3: 'sport', threePoint: 'sport', dunkduel: 'sport',
  karateEndless: 'sport', karateVersus: 'sport', mixedcombat: 'sport', duel: 'sport', showdown: 'sport',
  skateboarding: 'sport', snowboarding: 'sport', surfing: 'sport', bigAir: 'sport',
  velocitykart: 'sport', aeroaces: 'sport', freerun: 'sport', sprint: 'sport',
  football: 'sport', soccer: 'sport', baseball: 'sport', tennis: 'sport', volleyball: 'sport',
  golf: 'sport', tiebreak: 'sport', training: 'sport',

  // The craft modes each map to their own thing.
  dance: 'dance',
  musicAcademy: 'music',
  acting: 'acting',
  storyMode: 'scene',
  whoSceneIt: 'scene',

  // Left out on purpose: carnival and brainBrawl (party games, not a direction), irl (a harness, not a craft).
};

export function disciplineForMode(modeKey: string): Discipline | null {
  return MODE_DISCIPLINE[modeKey] ?? null;
}

export interface SessionRow { mode: string; createdAt: Date | string }
export interface CardRow { primary: string }

/** A day key in UTC — good enough for "was this a habit or one long evening". */
function dayOf(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Build the counsellor's input from rows. Pure, so the API route holds no judgement of its own and the whole
 * thing is testable without a database.
 */
export function evidenceFrom(sessions: readonly SessionRow[], cards: readonly CardRow[], statedGoalTags: string[] = []): ActivityEvidence {
  const sessionsByDiscipline: Partial<Record<Discipline, number>> = {};
  const cardsByDiscipline: Partial<Record<Discipline, number>> = {};
  const days: Partial<Record<Discipline, Set<string>>> = {};

  for (const s of sessions) {
    const d = disciplineForMode(s.mode);
    if (!d) continue;
    sessionsByDiscipline[d] = (sessionsByDiscipline[d] ?? 0) + 1;
    (days[d] ??= new Set()).add(dayOf(s.createdAt));
  }
  for (const c of cards) {
    const d = c.primary as Discipline;
    if (!MODE_DISCIPLINE_VALUES.has(d)) continue;
    cardsByDiscipline[d] = (cardsByDiscipline[d] ?? 0) + 1;
  }

  const activeDaysByDiscipline: Partial<Record<Discipline, number>> = {};
  for (const [d, set] of Object.entries(days)) activeDaysByDiscipline[d as Discipline] = set.size;

  return { sessionsByDiscipline, cardsByDiscipline, activeDaysByDiscipline, statedGoalTags };
}

/** Every discipline the product recognises, so a junk `primary` on a row cannot invent one. */
const MODE_DISCIPLINE_VALUES: ReadonlySet<string> = new Set<Discipline>([
  'sport', 'music', 'art', 'dance', 'acting', 'scene', 'cooking', 'fashion', 'writing',
]);
