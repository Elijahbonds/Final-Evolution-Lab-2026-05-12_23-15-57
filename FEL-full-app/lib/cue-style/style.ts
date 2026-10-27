// lib/cue-style/style.ts — CUE-REWRITE (2026-10-27): the fitness copy style guide (docs/CUE-STYLE.md) as a screen.
//
// WHY. The owner's playtest (2026-10-27): "The fitness cueing stuff didn't work well either, it was weird. It needs heavy
// revision. The language needs to change. It needs to be clear. It needs to be appropriate. People need to be able to
// understand and interpret the results and understand what they are doing." This file is the floor under every word a
// person reads or hears while doing or reviewing a movement: the Mirror's live coach, the movement screens' results, the
// form-review flags, the jump / readiness / bar-speed / sprint results, the library's cue lines and the programs' cues.
//
// WHAT IT CHECKS, per line, by TIER (what the line is for decides how long it may be):
//   live    — said or flashed mid-rep: 2–5 words, no number, no technical term. ("Knees out", "Push the floor away")
//   prompt  — said or shown between reps or before a set (a reset, a framing fix, a "stop and do this"): ≤ 14 words.
//   card    — read before the set (a library cue, a program cue): ≤ 18 words.
//   setup   — where to stand and what to hold before the first rep (a library or program set-up): ≤ 24 words.
//   label   — a name (a fault, a movement, a button): ≤ 8 words.
//   result  — one part of a result (what we saw / what it means / what to do next): ≤ 24 words each.
// and for every tier: the banned words (medical, shaming, body-image), technical terms only with their plain gloss in
// the same line, and a reading-level heuristic (Flesch–Kincaid grade ≤ 10 on any line of 8+ words and ≤ 8 on average; at most one 4+-syllable
// word in a line, from a short allow-list of everyday long words).
//
// It is a word screen, so it is a floor, not a judge: the tests' controls (style.test.ts) show what it catches and what it
// lets through. The owner's eye is the judge of the words themselves (docs/CUE-STYLE.md is for the owner to approve).
//
// Pure: no DOM, no Prisma.
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';

export type CueTier = 'live' | 'prompt' | 'card' | 'setup' | 'label' | 'result';

/** The most words a line of each tier may have. A live cue also has a floor of 2 ("Stop." is a prompt, not a cue). */
export const MAX_WORDS: Readonly<Record<CueTier, number>> = { live: 5, prompt: 14, card: 18, setup: 24, label: 8, result: 24 };
export const LIVE_MIN_WORDS = 2;

/**
 * Reading level (the guide: about 6th–8th grade). Flesch–Kincaid on one short line is noisy (a line of plain drill words —
 * "Sprint, shuffle, backpedal around the triangle" — can score 10), so the screen holds each line to MAX_GRADE and each
 * surface's AVERAGE to MAX_MEAN_GRADE (corpus.test.ts).
 */
export const MAX_GRADE = 10;
export const MAX_MEAN_GRADE = 8;
export const READING_MIN_WORDS = 8;

/**
 * MEDICAL — the weekly draft's screen (lib/coach/weeklyDraft/copy.ts MEDICAL_WORDS: diagnosis, treatment, injury, rehab,
 * physio, tear, sprain, medical, therapy, condition, doctor…), extended with the clinical words the movement copy itself
 * used (clinician, physician, clinical, dysfunction, impingement, instability, deficit, pathology, patient, symptom).
 * A pain line routes to "stop" and "a health professional" — neither word is here.
 */
export const MEDICAL_EXTRA = /\b(clinic(?:al|ian|ians)?|physician\w*|patholog\w*|dysfunction\w*|impingement|instabilit\w*|deficits?|patients?|symptoms?|disease|chronic|acute|corrective\s+exercise\s+specialist)\b/i;
export const isMedical = (t: string): boolean => MEDICAL_WORDS.test(t) || MEDICAL_EXTRA.test(t);

/** SHAMING or judging the person, not describing the movement. "Fault" is the coach's word, not the athlete's. */
export const SHAME_WORDS = /\b(lazy|sloppy|terrible|awful|ugly|pathetic|bad(?:ly)?|wrong|poor(?:ly)?|weak(?:er|est|ness)?|fail(?:s|ed|ing|ure)?|failing|cheat\w*|faults?|faulty|mistakes?|embarrass\w*|no excuses|man up|like a girl|stupid|dumb)\b/i;

/** BODY IMAGE — nothing about weight or appearance (the guide's "no body-shaming"). "Weight" as the load is fine; the
 *  body's weight is "your body" ("bodyweight" is an exercise word and allowed). */
export const BODY_IMAGE_WORDS = /\b(fat|skinny|obese\w*|overweight|underweight|lose weight|weight loss|burn fat|fat[- ]burn\w*|toned?|beach body|bikini|slim\w*|bulk(?:y)?|calories|flabby|belly fat|love handles|thigh gap|body fat)\b/i;

/**
 * TECHNICAL TERMS and their plain gloss. A term may appear in a card, prompt or result line only with its gloss in the
 * same line (the guide: "a technical term appears only with a plain gloss on first use" — a line is read on its own, so
 * every line is a first use). Never in a live cue or a label.
 */
export const GLOSSARY: Readonly<Record<string, { re: RegExp; gloss: RegExp; plain: string }>> = {
  valgus: { re: /\bvalgus\b/i, gloss: /knees? (?:cave|caving|move|moving|drift\w*) in/i, plain: 'knees caving in' },
  varus: { re: /\bvarus\b/i, gloss: /knees? (?:bow|bowing) out/i, plain: 'knees bowing out' },
  eccentric: { re: /\beccentric\b/i, gloss: /lowering|on the way down/i, plain: 'the lowering part of the rep' },
  concentric: { re: /\bconcentric\b/i, gloss: /lifting|on the way up/i, plain: 'the lifting part of the rep' },
  isometric: { re: /\bisometric\b/i, gloss: /hold(?:ing)? still|a still hold/i, plain: 'a still hold' },
  tripleExtension: { re: /\btriple extension\b/i, gloss: /ankles?, knees? and hips/i, plain: 'ankles, knees and hips straighten together' },
  hinge: { re: /\bhing(?:e|es|ed|ing)\b/i, gloss: /hips back|bend(?:ing)? at the hips|fold(?:ing)? at the hips/i, plain: 'hips back, bending at the hips' },
  neutralSpine: { re: /\bneutral spine\b/i, gloss: /flat back|back flat|straight back/i, plain: 'a flat back' },
  scapula: { re: /\bscapula\w*\b/i, gloss: /shoulder blades?/i, plain: 'shoulder blade' },
  posteriorChain: { re: /\bposterior chain\b/i, gloss: /back of (?:the|your) (?:body|legs)/i, plain: 'the back of the body' },
  dorsiflexion: { re: /\bdorsiflex\w*/i, gloss: /ankle bend|knee (?:over|past) (?:the )?toes/i, plain: 'ankle bend' },
  plantarflexion: { re: /\bplantarflex\w*/i, gloss: /point(?:ing)? the toes|up on the toes/i, plain: 'pointing the toes' },
  thoracic: { re: /\bthoracic\b/i, gloss: /upper back/i, plain: 'upper back' },
  lumbar: { re: /\blumbar\b/i, gloss: /lower back/i, plain: 'lower back' },
  pronation: { re: /\bpronat\w*/i, gloss: /arch (?:drops|flattens)|rolls? in/i, plain: 'the foot rolling in' },
  supination: { re: /\bsupinat\w*/i, gloss: /rolls? out|palms? up/i, plain: 'rolling out' },
  abduction: { re: /\babduct\w*/i, gloss: /out to the side|away from/i, plain: 'moving out to the side' },
  adduction: { re: /\badduct\w*/i, gloss: /in toward|across the body/i, plain: 'moving in toward the middle' },
  proprioception: { re: /\bproprioce\w*/i, gloss: /balance|body sense/i, plain: 'balance and body sense' },
  amortization: { re: /\bamortiz\w*/i, gloss: /time on the ground|ground time/i, plain: 'time on the ground' },
  rsi: { re: /\bRSI\b/, gloss: /bounce score|how high .* how fast/i, plain: 'bounce score' },
  rfd: { re: /\bRFD\b/, gloss: /how fast you (?:build|make) force/i, plain: 'how fast you build force' },
  countermovement: { re: /\bcountermovement\b|\bCMJ\b/i, gloss: /dip and jump|quick dip/i, plain: 'a quick dip, then jump' },
  oneRm: { re: /\b(?:e?1RM|one-rep max)\b/i, gloss: /heaviest (?:weight|load) .*once|most you could lift once/i, plain: 'the most you could lift once' },
  rpe: { re: /\bRPE\b/, gloss: /how hard .* (?:felt|feel)|effort out of 10/i, plain: 'how hard it felt, out of 10' },
  rir: { re: /\bRIR\b/, gloss: /reps? (?:left|in the tank)/i, plain: 'reps left in the tank' },
  velocityLoss: { re: /\bvelocity loss\b/i, gloss: /slow(?:s|ed|ing)? down|speed drop/i, plain: 'how much the bar slowed down' },
  asymmetry: { re: /\basymmetr\w*/i, gloss: /one side|left (?:and|vs|versus) right/i, plain: 'a difference between your sides' },
  bilateral: { re: /\b(?:bi|uni|contra|ipsi)lateral\b/i, gloss: /both sides|one side|one leg|opposite side|same side/i, plain: 'both sides / one side' },
  forceVelocity: { re: /\bforce[- ]velocity\b|\bF0\b|\bPmax\b|\bV0\b/, gloss: /push(?:ing)? hard|move fast|strength and speed/i, plain: 'strength and speed' },
  ninetyNinety: { re: /\b(?:ninety-ninety|90\/90)\b/i, gloss: /both knees bent|lying on your back, feet on/i, plain: 'lying on your back, feet on a wall, knees bent' },
  tripod: { re: /\btripod\b/i, gloss: /heel,? big toe and little toe|three points/i, plain: 'heel, big toe and little toe' },
  kinematic: { re: /\bkinemat\w*|\bkinetic\b/i, gloss: /how (?:you|the body) move/i, plain: 'how the body moves' },
};

/** Technical terms in a line that are missing their gloss. */
export function unglossed(text: string): string[] {
  const out: string[] = [];
  for (const [k, g] of Object.entries(GLOSSARY)) if (g.re.test(text) && !g.gloss.test(text)) out.push(k);
  return out;
}
/** Technical terms in a line at all (a live cue or a label may have none). */
export function terms(text: string): string[] {
  return Object.entries(GLOSSARY).filter(([, g]) => g.re.test(text)).map(([k]) => k);
}

// ── reading level ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Words as a reader counts them: "Push-up" is one, "2–3 m" is two, an em dash is none. */
export function wordsOf(text: string): string[] {
  return text.replace(/[—–]/g, ' ').replace(/[^\p{L}\p{N}'’%±.\-/ ]/gu, ' ').split(/\s+/).map((w) => w.replace(/^[.\-/]+|[.\-/]+$/g, '')).filter((w) => /[\p{L}\p{N}]/u.test(w));
}
export const wordCount = (text: string): number => wordsOf(text).length;

/** English syllables, by the usual vowel-group heuristic (silent e, -le, -es/-ed endings). Good to ±1 a word. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return /\d/.test(word) ? Math.max(1, Math.ceil(word.replace(/\D/g, '').length / 2)) : 0;
  if (w.length <= 3) return 1;
  const s = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = s.match(/[aeiouy]{1,2}/g)?.length ?? 1;
  const le = /[^aeiouy]le$/.test(w) ? 1 : 0;
  return Math.max(1, groups + le);
}

/** Flesch–Kincaid grade of a line (sentences split on . ! ? ; and the colon that joins a label to its sentence). */
export function grade(text: string): number {
  const ws = wordsOf(text);
  if (!ws.length) return 0;
  const sentences = Math.max(1, text.split(/[.!?;:]+(?:\s|$)/).filter((s) => wordsOf(s).length > 0).length);
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59;
}

/** Everyday words of 4+ syllables a 6th grader reads without slowing down. */
export const LONG_WORDS_OK = /^(everything|everybody|everyone|anything|comfortable|comfortably|exercises?|naturally|automatically|already|actually|usually|especially|alternating|alternate|elevator|helicopter|activity|activities|information|calibrating|calibration|camera's|estimated|estimates?|immediately|personal|variation|variations|television|definitely|regularly|completely|separately|accurately|accurate|motorcycle|watermelon|basketball|categories|category|unhurried|evenly|literally|literal|energy|ordinary|community|celebrate|necessary|anybody|movement's|beginner's|progression|regression|intermediate|everyday)$/i;

export function longWords(text: string): string[] {
  return wordsOf(text).filter((w) => syllables(w) >= 4 && !LONG_WORDS_OK.test(w.replace(/[’']s$/, '')));
}

/**
 * A movement whose NAME is a technical term people meet everywhere ("Hip hinge") may keep it as its label; its card says
 * what it is the first time (names.ts HINGE_GLOSS). Nothing else gets this.
 */
export const NAMED_TERMS = /\bhip hinge\b/gi;

// ── the lint ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type StyleRule = 'length' | 'too-short' | 'number' | 'term' | 'gloss' | 'medical' | 'shame' | 'body-image' | 'grade' | 'long-words';
export interface StyleFinding { rule: StyleRule; detail: string }

/** Why a line breaks the guide (empty = it passes). */
export function lintStyle(text: string, tier: CueTier): StyleFinding[] {
  const out: StyleFinding[] = [];
  const n = wordCount(text);
  if (n > MAX_WORDS[tier]) out.push({ rule: 'length', detail: `${n} words > ${MAX_WORDS[tier]} (${tier})` });
  if (tier === 'live' && n < LIVE_MIN_WORDS) out.push({ rule: 'too-short', detail: `${n} word` });
  if (tier === 'live' && /\d/.test(text)) out.push({ rule: 'number', detail: 'a number in a live cue' });
  if (tier === 'live' || tier === 'label') { const t = terms(text.replace(NAMED_TERMS, '')); if (t.length) out.push({ rule: 'term', detail: t.join(', ') }); }
  else { const u = unglossed(text); if (u.length) out.push({ rule: 'gloss', detail: u.join(', ') }); }
  if (isMedical(text)) out.push({ rule: 'medical', detail: (MEDICAL_WORDS.exec(text) ?? MEDICAL_EXTRA.exec(text))![0] });
  const sh = SHAME_WORDS.exec(text); if (sh) out.push({ rule: 'shame', detail: sh[0] });
  const bi = BODY_IMAGE_WORDS.exec(text); if (bi) out.push({ rule: 'body-image', detail: bi[0] });
  if (n >= READING_MIN_WORDS) { const g = grade(text); if (g > MAX_GRADE) out.push({ rule: 'grade', detail: `grade ${g.toFixed(1)}` }); }
  const lw = longWords(text); if (lw.length > 1) out.push({ rule: 'long-words', detail: lw.join(', ') });
  return out;
}

/** A pain line routes to stopping, and to a person: an adult, a coach, or a health professional. */
export const PAIN_ROUTE = /\bstop\b[\s\S]*\b(health professional|an adult|a parent|your coach|a coach|a grown-up)\b/i;
export const mentionsPain = (t: string): boolean => /\b(pain|hurts?|hurting|painful|sore)\b/i.test(t);
