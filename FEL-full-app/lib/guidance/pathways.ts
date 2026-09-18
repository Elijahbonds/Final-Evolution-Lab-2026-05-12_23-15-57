// THE GUIDANCE COUNSELLOR — pathways from what someone actually does (2026-09-12).
//
// FEL already has nine disciplines and a card loop: do the thing, it becomes a card, the card is
// remixable and earns. What it has never had is the layer above that — the person who looks at
// what a kid keeps coming back to and says "there is a road here, and here is the next step on it".
//
// HOW THIS DIFFERS FROM A QUIZ, which matters more than the algorithm:
//   · It reads BEHAVIOUR, not self-report. What you keep doing beats what you said on a form.
//   · It NEVER closes a door. Every pathway stays reachable; low evidence produces an invitation
//     to try, never "this is not for you". A fourteen-year-old told by software that they are not
//     a musician is a real harm, and the cost of being wrong in that direction is permanent.
//   · It shows its working. Every suggestion names the evidence it came from, so a mentee or a
//     guardian can disagree with it on the facts rather than argue with a black box.
//   · It suggests ONE next step, not a career plan. Counselling is a sequence of small next steps.
//
// It is advisory. Nothing here gates content, changes a score, or decides anything on a
// person's behalf.

import type { Discipline } from '../creator/creative-card-types';

/** A direction within a discipline — a real role someone could grow into. */
export interface Pathway {
  id: string;
  discipline: Discipline;
  title: string;
  /** What this person would be doing day to day. Concrete, not aspirational fluff. */
  looksLike: string;
  /** The first real step, doable this week, inside FEL or out of it. */
  firstStep: string;
  /** Adjacent pathways — because interests move, and a counsellor keeps the map wide. */
  neighbours: string[];
}

export const PATHWAYS: Pathway[] = [
  // sport
  { id: 'athlete', discipline: 'sport', title: 'Athlete', looksLike: 'Training with a plan, tracking what changes, competing on a schedule.', firstStep: 'Scan your PRQ, then run the same mode three times this week and watch one attribute move.', neighbours: ['coach', 'performance_analyst'] },
  { id: 'coach', discipline: 'sport', title: 'Coach', looksLike: 'Watching other people move, spotting the fault, saying the one thing that fixes it.', firstStep: 'Run the Mirror on a friend and write down the single cue you would give them.', neighbours: ['athlete', 'trainer', 'teacher'] },
  { id: 'trainer', discipline: 'sport', title: 'Strength & conditioning', looksLike: 'Programming blocks, managing load, keeping people healthy enough to keep going.', firstStep: 'Build a four-week block for yourself and log every session honestly, including the bad ones.', neighbours: ['coach', 'performance_analyst'] },
  { id: 'performance_analyst', discipline: 'sport', title: 'Performance analyst', looksLike: 'Finding the pattern in the numbers nobody else noticed.', firstStep: 'Export a month of your own sessions and find one thing that predicts a good day.', neighbours: ['trainer', 'coach'] },
  // music
  { id: 'producer', discipline: 'music', title: 'Producer', looksLike: 'Building a track from a loop out, arranging, deciding what stays and what goes.', firstStep: 'Finish one 60-second arrangement in the Music Room — finished beats perfect.', neighbours: ['engineer', 'performer', 'songwriter'] },
  { id: 'engineer', discipline: 'music', title: 'Audio engineer', looksLike: 'Making other people\'s work sound like it should. Mixing, mastering, stems.', firstStep: 'Take someone else\'s remix and master it without changing a single note.', neighbours: ['producer'] },
  { id: 'performer', discipline: 'music', title: 'Performer', looksLike: 'Playing or singing it live, where it only happens once.', firstStep: 'Record one take with no edits and publish it as a card.', neighbours: ['producer', 'dancer'] },
  { id: 'songwriter', discipline: 'music', title: 'Songwriter', looksLike: 'The words and the melody — the part people sing back at you.', firstStep: 'Write eight bars about one specific afternoon. Specific beats universal.', neighbours: ['producer', 'writer'] },
  // art / fashion / writing
  { id: 'illustrator', discipline: 'art', title: 'Illustrator', looksLike: 'Drawing the thing in your head until other people can see it too.', firstStep: 'Make one card a day for five days. Speed teaches more than polish.', neighbours: ['designer', 'fashion_designer'] },
  { id: 'designer', discipline: 'art', title: 'Designer', looksLike: 'Deciding how a thing should look and work so it feels obvious.', firstStep: 'Redesign one screen in FEL you find annoying, and say why it is better.', neighbours: ['illustrator', 'fashion_designer'] },
  { id: 'fashion_designer', discipline: 'fashion', title: 'Fashion designer', looksLike: 'Silhouette, colour, and what a fit says before anyone speaks.', firstStep: 'Build one full kit in the Closet and name the person who wears it.', neighbours: ['designer', 'illustrator'] },
  { id: 'writer', discipline: 'writing', title: 'Writer', looksLike: 'Getting the thought out of your head in the order it lands best.', firstStep: 'Write 200 words about a game you lost. Losses are better material.', neighbours: ['songwriter', 'scene_maker'] },
  // dance / acting / scene
  { id: 'dancer', discipline: 'dance', title: 'Dancer', looksLike: 'Moving on the beat until the body stops thinking about it.', firstStep: 'Learn eight counts properly rather than a whole routine badly.', neighbours: ['choreographer', 'performer'] },
  { id: 'choreographer', discipline: 'dance', title: 'Choreographer', looksLike: 'Making the moves and teaching them to other bodies.', firstStep: 'Choreograph eight counts and teach them to one person.', neighbours: ['dancer', 'director'] },
  { id: 'actor', discipline: 'acting', title: 'Actor', looksLike: 'Being believable as someone who is not you.', firstStep: 'Perform the same line three ways and keep the one that scares you.', neighbours: ['director', 'scene_maker'] },
  { id: 'director', discipline: 'scene', title: 'Director', looksLike: 'Deciding what the audience sees and when they see it.', firstStep: 'Build one scene in Who Scene It and cut it twice.', neighbours: ['actor', 'scene_maker', 'choreographer'] },
  { id: 'scene_maker', discipline: 'scene', title: 'World builder', looksLike: 'Making the place the story happens in.', firstStep: 'Build one venue and put a person in it doing something ordinary.', neighbours: ['director', 'designer'] },
  // cooking
  { id: 'chef', discipline: 'cooking', title: 'Chef', looksLike: 'Feeding people well, repeatedly, under time pressure.', firstStep: 'Cook the same dish three times and change one variable each time.', neighbours: ['nutrition'] },
  { id: 'nutrition', discipline: 'cooking', title: 'Performance nutrition', looksLike: 'Matching what someone eats to what their body is being asked to do.', firstStep: 'Track fuel against training for one week in the Fuel floor and look for the pattern.', neighbours: ['chef', 'trainer'] },
];

/** What the counsellor reads. All behaviour, no self-report. */
export interface ActivityEvidence {
  /** Sessions played or created per discipline, any time window the caller chooses. */
  sessionsByDiscipline: Partial<Record<Discipline, number>>;
  /** Cards published per discipline — finishing something counts for more than starting it. */
  cardsByDiscipline: Partial<Record<Discipline, number>>;
  /** Distinct days active per discipline — persistence beats a single binge. */
  activeDaysByDiscipline?: Partial<Record<Discipline, number>>;
  /** A mentee's stated goal, if a facilitator recorded one. Respected, never overridden. */
  statedGoalTags?: string[];
}

export interface Suggestion {
  pathway: Pathway;
  /** 0..1. Confidence that this is worth SHOWING, never a verdict on the person. */
  strength: number;
  /** The facts this came from, in plain language. */
  because: string[];
  /** True when the system has little to go on and is inviting rather than concluding. */
  exploratory: boolean;
}

/** Finishing counts more than starting; showing up on many days counts more than one long night. */
const W_SESSION = 1, W_CARD = 4, W_DAY = 2, W_STATED = 6;

/**
 * Ranked pathways, with the reasoning attached.
 *
 * Always returns something to try. A person with no history gets exploratory invitations across
 * disciplines rather than an empty screen or a verdict — the counsellor's job at that point is to
 * widen the map, not to guess.
 */
export function suggestPathways(ev: ActivityEvidence, limit = 4): Suggestion[] {
  const scores = new Map<string, { score: number; because: string[] }>();

  for (const p of PATHWAYS) {
    const sessions = ev.sessionsByDiscipline[p.discipline] ?? 0;
    const cards = ev.cardsByDiscipline[p.discipline] ?? 0;
    const days = ev.activeDaysByDiscipline?.[p.discipline] ?? 0;
    const stated = (ev.statedGoalTags ?? []).some(
      (t) => t.toLowerCase() === p.id || t.toLowerCase() === p.discipline,
    );

    const because: string[] = [];
    if (cards > 0) because.push(`${cards} ${p.discipline} card${cards === 1 ? '' : 's'} published — you finish things here`);
    if (sessions > 0) because.push(`${sessions} ${p.discipline} session${sessions === 1 ? '' : 's'}`);
    if (days > 2) because.push(`active on ${days} separate days — this is a habit, not a one-off`);
    if (stated) because.push('you told a coach this is what you are aiming at');

    const score = sessions * W_SESSION + cards * W_CARD + days * W_DAY + (stated ? W_STATED : 0);
    scores.set(p.id, { score, because });
  }

  const ranked = PATHWAYS
    .map((p) => ({ p, ...scores.get(p.id)! }))
    .sort((a, b) => b.score - a.score);

  const top = ranked.filter((r) => r.score > 0).slice(0, limit);

  // nothing to go on: invite across DIFFERENT disciplines rather than guessing at one
  if (top.length === 0) {
    const seen = new Set<Discipline>();
    const spread = PATHWAYS.filter((p) => (seen.has(p.discipline) ? false : (seen.add(p.discipline), true)));
    return spread.slice(0, limit).map((p) => ({
      pathway: p,
      strength: 0,
      because: ['no history yet — this is an invitation, not a recommendation'],
      exploratory: true,
    }));
  }

  const max = top[0].score || 1;
  return top.map(({ p, score, because }) => ({
    pathway: p,
    strength: Math.round((score / max) * 100) / 100,
    because,
    exploratory: score < W_CARD,        // little more than a couple of sessions
  }));
}

/**
 * The doors NOT suggested, so the map stays wide.
 *
 * A counsellor who only ever names the obvious pathway narrows a life. These are the neighbours of
 * what someone is already doing — adjacent, reachable, and deliberately surfaced.
 */
export function adjacentPathways(suggestions: Suggestion[], limit = 3): Pathway[] {
  const shown = new Set(suggestions.map((s) => s.pathway.id));
  const out: Pathway[] = [];
  for (const s of suggestions) {
    for (const nid of s.pathway.neighbours) {
      if (shown.has(nid) || out.some((p) => p.id === nid)) continue;
      const n = PATHWAYS.find((p) => p.id === nid);
      if (n) out.push(n);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Never a verdict. The counsellor's voice, in one line. */
export function counsellorNote(suggestions: Suggestion[]): string {
  if (!suggestions.length || suggestions[0].exploratory) {
    return 'Not enough to go on yet — try a few of these and let what you keep coming back to decide.';
  }
  const top = suggestions[0];
  return `You keep showing up for ${top.pathway.discipline}. ${top.pathway.title} is one road from here — and it is not the only one.`;
}

export function pathwaysForDiscipline(d: Discipline): Pathway[] {
  return PATHWAYS.filter((p) => p.discipline === d);
}
