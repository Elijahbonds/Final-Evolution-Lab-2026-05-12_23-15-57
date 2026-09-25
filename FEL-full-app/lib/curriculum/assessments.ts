// The facilitator certification's questions, answer key and grader — SERVER ONLY.
//
// HOTFIX (2026-09-24): this used to live inside lib/curriculum/blueprint.ts, which a client component
// (components/camp/camp-view.tsx) imports, so the paid certification's answer key shipped to every
// browser that opened /camp. It lives here now, behind `import 'server-only'`: Next fails the build if a
// client component ever reaches this file, and lib/curriculum/answerKeyBoundary.test.ts proves the same
// thing without a build by walking every 'use client' file's import graph. Only the assess route (and
// the tests, and the local camp-walk dev script) may import it — the boundary test holds that list.
//
// Two further things the move alone would not have fixed:
//
// 1. EVERY ANSWER WAS AUTHORED AT INDEX 1. Hiding the `answer` field changes nothing while the correct
//    option is always the second one. The options are therefore SHOWN in a fixed, shuffled order
//    (optionOrder below) and graded by the position the facilitator picked, which the server maps back
//    to the authored option. The authored data below is left exactly as written so it stays easy to
//    review; the order a browser sees is derived from it here and only here.
// 2. The grader takes PRESENTED positions and stores the AUTHORED index as `chosen`, so a Credential's
//    `answers` JSON means the same thing it meant for every row written before today.
//
// Nothing here is new content: the fifty questions below were moved out of blueprint.ts mechanically, in
// the order they were written, with their answers unchanged.
import 'server-only';
import { CURRICULUM, PASS_MARK } from './blueprint';

export interface AssessmentQuestion {
  key: string;
  prompt: string;
  /** In authored order. Never sent to a client in this order — see presentModule. */
  options: string[];
  /** Index into `options` as authored. */
  answer: number;
}

/** What a browser is shown: no answer, options in presented order. */
export interface PublicQuestion { key: string; prompt: string; options: string[] }

const q = (key: string, prompt: string, options: string[], answer: number): AssessmentQuestion => ({ key, prompt, options, answer });

/** Every lesson's assessment, keyed by the lesson ref ("trackKey/moduleKey/lessonKey"). */
const BANK: Readonly<Record<string, readonly AssessmentQuestion[]>> = {
  'blueprint/m1/strength': [
    q('s1', 'Which observation most likely points to strength as the limiting pillar?', ['A dunk attempt released too early', 'A jump that stays short even with perfect charge timing', 'A rally lost on footwork', 'A missed parry window'], 1),
    q('s2', 'How fast does strength move, and how should a mentor judge it?', ['Session to session; judge daily', 'Over weeks; judge the trend', 'It does not change after 18', 'Only in the gym, never in play'], 1),
    q('s3', 'What is the mentor\'s first honest act with a returning athlete?', ['Set a bigger goal', 'Read the current numbers without flinching', 'Compare them to a pro', 'Skip the numbers and start playing'], 1),
  ],
  'blueprint/m1/power': [
    q('p1', 'Power differs from strength because…', ['it is measured in kilograms', 'it is force delivered fast', 'it only exists in the legs', 'it cannot be trained'], 1),
    q('p2', 'Where does a mentor look to judge power in the dunk contest?', ['The run-up speed', 'The gather and release instant', 'The crowd meter', 'The landing'], 1),
    q('p3', 'Two athletes squat the same. Their verticals differ. The likely pillar is…', ['strength', 'power', 'recovery', 'mental'], 1),
  ],
  'blueprint/m1/speed': [
    q('sp1', 'Why is speed the most overrated pillar for a mentor?', ['It cannot be measured', 'Fast to the wrong place is still wrong', 'It never changes', 'It only matters in sprinting'], 1),
    q('sp2', 'What should always sit next to a speed number?', ['A strength number', 'A decision read: where they went and whether it was right', 'A highlight clip', 'A rest day'], 1),
  ],
  'blueprint/m1/endurance': [
    q('e1', 'How does a mentor read endurance?', ['Total minutes played', 'The same skill compared early and late in a session', 'The final score', 'Heart rate only'], 1),
    q('e2', 'The Streetlight Session teaches…', ['speed under lights', 'holding form when the easy energy is gone', 'night vision', 'shooting form'], 1),
  ],
  'blueprint/m2/agility': [
    q('a1', 'Agility is best described as…', ['top speed in a straight line', 'an unplanned change of direction', 'flexibility in the hips', 'reaction to a whistle'], 1),
    q('a2', 'What separates a stumble from a read?', ['Speed', 'The half-step before the change', 'Shoe grip', 'The score'], 1),
  ],
  'blueprint/m2/flexibility': [
    q('f1', 'Range without control is…', ['the goal', 'a liability', 'strength', 'endurance'], 1),
    q('f2', 'Which movement-screen reads feed the flexibility picture?', ['Score and combo', 'Depth, asymmetry, valgus', 'Speed and power', 'Wins and losses'], 1),
  ],
  'blueprint/m2/recovery': [
    q('r1', 'What does the Camp log as resiliency?', ['Total wins', 'Retry rate after failed attempts and return after a losing session', 'Sessions per week', 'Max heart rate'], 1),
    q('r2', 'A mentee stops retrying after fails. The mentor\'s first assumption should be…', ['they are lazy', 'the plan is too heavy', 'they need a new mode', 'nothing; wait a month'], 1),
    q('r3', 'Recovery decides…', ['nothing about training', 'whether the other pillars can be trained at all', 'only sleep quality', 'the final score'], 1),
  ],
  'blueprint/m2/mental': [
    q('m1', 'The mental pillar is trained by…', ['avoiding pressure until ready', 'facing real, survivable stakes often', 'watching film only', 'playing easier opponents'], 1),
    q('m2', 'What should every goal plan state about the mental pillar?', ['A motivational quote', 'Which rung of the stakes ladder the mentee is on', 'A win target', 'A favourite mode'], 1),
  ],
  'blueprint/m3/intake': [
    q('i1', 'When is a goal locked?', ['When the facilitator writes it', 'When the mentee can say it back in their own words', 'After the first win', 'When a guardian signs'], 1),
    q('i2', 'A 15-year-old mentee\'s parent approves verbally on the phone. The plan…', ['can go active', 'cannot go active until the consent request is accepted', 'goes active for one week', 'needs a second facilitator'], 1),
    q('i3', 'Who approves the drafted plan?', ['The AI coach', 'The mentee', 'The owner', 'Nobody; it is automatic'], 1),
  ],
  'blueprint/m3/session': [
    q('se1', 'The order inside a session is…', ['numbers, then game, then talk', 'module key points, the drill, then the numbers', 'game only', 'talk only'], 1),
    q('se2', 'The session note should be…', ['a full summary', 'the one thing that changed or did not', 'a score', 'optional'], 1),
  ],
  'blueprint/m3/replication': [
    q('re1', 'A template built on curriculum 2026.09 is imported under 2027.01. What happens?', ['It imports silently', 'The facilitator reconciles differences first', 'It is deleted', 'It downgrades the curriculum'], 1),
    q('re2', 'Forking a template…', ['is forbidden', 'keeps the author\'s credit and records the source', 'erases the original', 'requires owner approval'], 1),
  ],
  'blueprint/m4/absorption': [
    q('fa1', 'Where are the larger forces in a jump?', ['The take-off', 'The landing', 'The approach', 'The arm swing'], 1),
    q('fa2', 'What does a good landing look like?', ['Loud and stiff, absorbed by the knees alone', 'Quiet, shared across ankle, knee and hip, balanced at the bottom', 'Fast, with a recovery step', 'Deep, with the heels up'], 1),
    q('fa3', 'Why is the depth drop gated on readiness?', ['It is dangerous to attempt at all', 'It asks for absorption at its limit, and asking early teaches the pattern wrong', 'It needs special equipment', 'It only works for tall athletes'], 1),
  ],
  'blueprint/m4/vertical': [
    q('ve1', 'Which step decides a vertical jump?', ['The final plant', 'The penultimate step', 'The first step of the run-up', 'The step after landing'], 1),
    q('ve2', 'What shape should the penultimate step have?', ['Short and tall', 'Long and low', 'Sideways', 'As fast as possible'], 1),
    q('ve3', 'Where should a mentor look?', ['The hands at take-off', 'The hips two steps out', 'The rim', 'The landing'], 1),
  ],
  'blueprint/m4/neuromuscular': [
    q('nc1', 'What is the stretch-shortening cycle?', ['Pushing harder against resistance', 'A rapid load immediately reversed, returning stored energy', 'Holding a stretch before effort', 'Slow eccentric lowering'], 1),
    q('nc2', 'How should oscillatory work be performed?', ['Maximum effort every rep', 'Short contacts, small amplitude, rhythm over height', 'As slowly as possible', 'Only after failure'], 1),
    q('nc3', 'Why does the lab measure agility and power separately?', ['They are the same thing', 'An athlete can be strong but slow to react, or quick but unable to hold the position', 'One is for jumping and one is for running', 'Only one is trainable'], 1),
  ],
  'blueprint/m4/breath': [
    q('bw1', 'What does breath actually set?', ['Heart rate only', 'Rib position over the pelvis, which the brace works against', 'Muscle temperature', 'Grip strength'], 1),
    q('bw2', 'When should the effort happen?', ['On the inhale', 'On the exhale', 'While holding the breath', 'It does not matter'], 1),
    q('bw3', 'Why is the breathing reset never gated on readiness?', ['It is not important enough to gate', 'It needs no equipment, no threshold and no supervision — it is available on any day', 'It only works when you are tired', 'It is gated, at PRQ 40'], 1),
  ],
  'dunk-fundamentals/m1/l1': [
    q('d1', 'Overcharging past the band…', ['adds height freely', 'costs control faster than it adds height', 'does nothing', 'resets the contest'], 1),
  ],
  'dunk-fundamentals/m1/l2': [
    q('d2', 'Hang time is best used to…', ['land early', 'execute the trick', 'charge again', 'change style'], 1),
  ],
  'dunk-fundamentals/m1/l3': [
    q('d3', 'The gather converts…', ['style into points', 'approach speed into lift', 'hang into charge', 'nothing'], 1),
  ],
  'dunk-fundamentals/m2/l1': [
    q('d4', 'SIGNATURE dunks are best attempted…', ['every time', 'on full-charge jumps', 'when trailing only', 'never'], 1),
  ],
  'dunk-fundamentals/m2/l2': [
    q('d5', 'As complexity rises the timing window…', ['grows', 'shrinks', 'stays fixed', 'disappears'], 1),
  ],
  'dunk-fundamentals/m2/l3': [
    q('d6', 'When leading late, the read is…', ['SIGNATURE', 'bank a POWER dunk', 'skip the turn', 'FLASHY only'], 1),
  ],
  'karate-fundamentals/m1/l1': [
    q('k1', 'The jab\'s role in a chain is…', ['the finisher', 'the opener that keeps the window alive', 'a block', 'a special'], 1),
  ],
  'karate-fundamentals/m1/l2': [
    q('k2', 'Kicks are best used as…', ['openers', 'finishers', 'blocks', 'taunts'], 1),
  ],
  'karate-fundamentals/m1/l3': [
    q('k3', 'A special should land on…', ['any opponent', 'a staggered opponent', 'a blocking opponent', 'the crowd'], 1),
  ],
  'karate-fundamentals/m2/l1': [
    q('k4', 'A blocked hit gives you…', ['nothing', 'a short counter window', 'a special', 'a wave skip'], 1),
  ],
  'karate-fundamentals/m2/l2': [
    q('k5', 'The burst is best spent…', ['on the first enemy', 'on dense waves', 'while blocking', 'never'], 1),
  ],
  'karate-fundamentals/m2/l3': [
    q('k6', 'Against three opponents the rule is…', ['stand still and block', 'rotate and deny the flank', 'special everyone', 'run'], 1),
  ],
};

// ── lookups ────────────────────────────────────────────────────────────────

/** The refs the bank holds questions for (for the coverage test). */
export function bankRefs(): string[] {
  return Object.keys(BANK);
}

export function lessonQuestions(ref: string): readonly AssessmentQuestion[] {
  return BANK[ref] ?? [];
}

/** A module's questions, lesson by lesson in curriculum order. null for a module that does not exist. */
export function moduleQuestions(trackKey: string, moduleKey: string): AssessmentQuestion[] | null {
  const mod = CURRICULUM.tracks.find((t) => t.key === trackKey)?.modules.find((m) => m.key === moduleKey);
  if (!mod) return null;
  return mod.lessons.flatMap((l) => lessonQuestions(l.ref));
}

// ── presentation order ─────────────────────────────────────────────────────
//
// Deterministic, so a GET and the POST that answers it agree without storing anything, and stable across
// deploys unless a question itself changes (the presentationId below catches that case). It is derived
// from the module ref and question key with a fixed salt; the authored order is no longer in any browser,
// so a browser cannot undo it. Changing the salt reshuffles every question — do it only with the
// presentationId check in place (it is), which turns any in-flight attempt into a clean 409 to reload.
const PRESENTATION_SALT = 'fel-cert-presentation-2026-09-24';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `order[shown]` is the AUTHORED index of the option shown at position `shown`. */
export function optionOrder(moduleRef: string, question: AssessmentQuestion): number[] {
  const rand = mulberry32(fnv1a(`${PRESENTATION_SALT}|${moduleRef}|${question.key}`));
  const order = question.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export interface PresentedModule {
  ref: string;
  /**
   * A fingerprint of exactly what was shown. The POST must echo it: if the questions or their order changed
   * between the GET and the submit (a deploy, a content edit), the positions no longer mean what the
   * facilitator saw, and grading them anyway would score somebody against a paper they never sat.
   */
  presentationId: string;
  questions: PublicQuestion[];
}

export function presentModule(trackKey: string, moduleKey: string): PresentedModule | null {
  const qs = moduleQuestions(trackKey, moduleKey);
  if (!qs) return null;
  const ref = `${trackKey}/${moduleKey}`;
  const questions = qs.map((qq) => {
    const order = optionOrder(ref, qq);
    return { key: qq.key, prompt: qq.prompt, options: order.map((i) => qq.options[i]) };
  });
  return { ref, presentationId: fnv1a(JSON.stringify(questions)).toString(36), questions };
}

// ── grading ────────────────────────────────────────────────────────────────

export interface GradedAnswer {
  questionKey: string;
  /** The AUTHORED option index chosen (the same meaning every stored Credential row has), -1 for none. */
  chosen: number;
  correct: boolean;
}

export interface ModuleGrade {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  graded: GradedAnswer[];
}

function authoredChoice(order: number[], shown: number | undefined): number {
  return typeof shown === 'number' && Number.isInteger(shown) && shown >= 0 && shown < order.length ? order[shown] : -1;
}

/** How many of a module's questions have no valid presented answer. The route refuses an incomplete paper. */
export function missingAnswers(trackKey: string, moduleKey: string, answers: Record<string, number>): number {
  const qs = moduleQuestions(trackKey, moduleKey) ?? [];
  const ref = `${trackKey}/${moduleKey}`;
  return qs.filter((qq) => authoredChoice(optionOrder(ref, qq), answers[qq.key]) < 0).length;
}

/**
 * Grade a module. `answers` maps question key → the PRESENTED option position (what the browser showed).
 * null for a module that does not exist.
 */
export function gradeModule(trackKey: string, moduleKey: string, answers: Record<string, number>): ModuleGrade | null {
  const qs = moduleQuestions(trackKey, moduleKey);
  if (!qs) return null;
  const ref = `${trackKey}/${moduleKey}`;
  const graded = qs.map((qq) => {
    const chosen = authoredChoice(optionOrder(ref, qq), answers[qq.key]);
    return { questionKey: qq.key, chosen, correct: chosen === qq.answer };
  });
  const correct = graded.filter((g) => g.correct).length;
  const total = qs.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  return { score, passed: total > 0 && score >= PASS_MARK, correct, total, graded };
}

/**
 * The right PRESENTED position for every question in a module. Server-side and test-side only: the
 * behavioural tests grade with it, and scripts/camp-walk.mts uses it to certify a local playtest account.
 */
export function answerKeyForPresented(trackKey: string, moduleKey: string): Record<string, number> | null {
  const qs = moduleQuestions(trackKey, moduleKey);
  if (!qs) return null;
  const ref = `${trackKey}/${moduleKey}`;
  return Object.fromEntries(qs.map((qq) => [qq.key, optionOrder(ref, qq).indexOf(qq.answer)]));
}
