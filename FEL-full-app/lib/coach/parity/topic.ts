// lib/coach/parity/topic.ts — COACH-PARITY (2026-10-26): what a coach's own words are ABOUT, for the check-in questions
// and the habits they type. One rule for both, so a question and a habit about the same thing land on the same side.
//
//   'pain'     the words ask about pain or an injury. REFUSED as a question or a habit: FEL has ONE pain path — the pain
//              check-in (lib/health/painRule.ts decide(), lib/health/pain.ts, POST /api/health/pain), with its own rule,
//              its stop outcomes, the adults-only write gate and the health_data consent. A form that wants pain switches
//              on `painCheck`, which hands the athlete that check-in; a typed "rate your knee pain" would be a second,
//              unruled pain path, which is exactly what must not exist.
//   'health'   sleep, mood, stress, energy, soreness, illness, medication, the menstrual cycle, body weight and shape,
//              food and diet. These follow the health rules the app already has: a verified adult only
//              (lib/privacy/healthWriteGate.ts), a live health_data grant to write, a live coach_view grant for the coach
//              to see — and the readiness check-in already treats sleep, soreness, energy and mood this way
//              (lib/health/readiness.ts). A coach may mark any question health; a question these words call health
//              cannot be marked training.
//   'training' everything else: sessions, effort, technique, goals, practice, steps, mobility minutes.
//
// `bodyOrDiet` marks body weight, body shape and diet on top: never for a minor, whatever a later decision opens for teens
// (owner rule in the brief: "no body-weight or diet habits for minors").
//
// assumption: drinking water is a training habit (hydration before a session), not diet — the brief lists "drink water"
// beside sleep and steps and bars only body-weight and diet habits for minors. Owner call, docs/COACH-PARITY.md.
// Pure.

export type Topic = 'training' | 'health';
export interface TopicRead { topic: Topic | 'pain'; bodyOrDiet: boolean }

const PAIN = /\b(pain|painful|hurts?|hurting|injur(y|ies|ed)|tweak(ed)?|strain(ed)?|sprain(ed)?|aches?|aching)\b/i;
const BODY_DIET = /\b(weigh(t|ts|ing|ed|-in|\s*in)?|body\s*fat|bmi|waist|hips?\s*measure|measurements?|calories?|kcal|diet(ing)?|macros?|protein|carbs?|carbohydrates?|fats?\b|meals?|eat(ing|en)?|food|fasting|snacks?|sugar|alcohol|supplements?|creatine)\b/i;
const HEALTH = /\b(sleep|slept|nap|rest(ed)?\s*well|stress(ed)?|mood|anxi(ous|ety)|depress\w*|mental|energy|fatigue|tired|exhausted|sore(ness)?|doms|ill(ness)?|sick|cold|flu|fever|medic(ation|ine)s?|meds|(?<!rest\s)(?<!work\s)periods?|menstru\w*|cycle\s*day|heart\s*rate|hrv|resting\s*hr|blood(\s*pressure)?|wellness|well-being|wellbeing)\b/i;

/** What these words are about (see the header). */
export function readTopic(text: string): TopicRead {
  const t = String(text ?? '');
  if (PAIN.test(t)) return { topic: 'pain', bodyOrDiet: false };
  const bodyOrDiet = BODY_DIET.test(t);
  if (bodyOrDiet || HEALTH.test(t)) return { topic: 'health', bodyOrDiet };
  return { topic: 'training', bodyOrDiet: false };
}

/**
 * The topic a coach's item ends up with: the coach's mark, raised to health when the words say health. Never lowered:
 * a coach cannot call a sleep question "training" to get it past the health rules. null = pain (refused).
 */
export function settleTopic(text: string, marked: unknown): { topic: Topic; bodyOrDiet: boolean } | null {
  const r = readTopic(text);
  if (r.topic === 'pain') return null;
  const topic: Topic = r.topic === 'health' || marked === 'health' ? 'health' : 'training';
  return { topic, bodyOrDiet: r.bodyOrDiet };
}
