// lib/coach/cueLint.ts — FEL's EXTERNAL-FOCUS CUE POLICY, as a lint (MIRROR-COACH P9, 2026-09-30).
//
// THE POLICY. Every cue the Mirror speaks or a coach's athlete reads is phrased about the world outside the body — the
// floor, the wall, the handle, the ceiling — or about what the movement does (quiet, still, the path), never about a
// body part to squeeze. "Push the floor away", not "squeeze your glutes"; "reach the wall", not "engage your core".
// The body-part detail may follow as the fallback ("press the floor apart — knees travel out over your toes"), never
// lead. This is the motor-learning finding usually credited to Wulf (attention on the movement's effect outlearns
// attention on the body; Wulf 2013 review) — FEL's taxonomy header already said its cues followed it (taxonomy.ts), and
// the Mirror's cue engine said so in its first comment. Neither was checked, and the Mirror's own table did not follow
// it: "Heels heavy", "Elbow tracks home", "The trap stays out of this", "feel the lat do the work", "Squeeze the back-leg
// glute", "Squeeze the glutes and the line holds itself" (crossref, "Cueing and motor learning": "most cues name body
// parts"; its recommendation: "external focus first, body-part cue as fallback").
//
// THE RULES (a word lint, so it is a floor under the copy, not a judge of it — the test's controls show what it catches
// and what it lets through):
//   1. muscle   — no cue names a muscle (glute, hamstring, lat, trap, core, abs, …). Naming the muscle is the cue to
//                 feel it. Every tier.
//   2. squeeze  — no internal-effort verb (squeeze, contract, engage, activate, fire, tense, tighten, clench, depress,
//                 retract, relax, feel, brace, pack) unless what follows it, within a few words, is something outside
//                 the body ("squeeze the bag", "brace for a light punch", "feel the floor"). Every tier.
//   3. leads    — an ATTENTION cue (what the athlete thinks about during the movement) that names a body part has an
//                 outside anchor (the floor, a wall, the handle, the ceiling, the camera) or a movement-effect word (the
//                 top, the bottom, quiet, still, the path) in its FIRST clause. The body part may come second.
//   4. anchored — …and anywhere at all: an attention cue that names a body part and never names the world or the effect
//                 is a body-part cue, whatever order it is in.
// An INSTRUCTION (a set-up position, a drill description, a regression to an easier drill) names the body where it has
// to — "forearms on a bench" — and is held to rules 1 and 2 only: the policy bans a body part to squeeze, and a place to
// put your hands is not that.
//
// THE ALLOW-LIST. A cue that fails and should stay says why, per entry (CUE_ALLOW). Two kinds of reason only: the
// wording is the OWNER'S (the Playbook, the Pre-Game Wake-Up — CLAUDE.md: a stricter guard that turns the owner's work
// red is a finding to report, not a licence to rewrite it), or the phrasing is unavoidable (a breath drill's hand
// placement has nothing outside the body to point at). The test fails on a stale entry (a cue that no longer exists, or
// now passes) as well as on a new failure.
//
// WHAT IS LINTED (cueCorpus): the Mirror's live coach (rules/cue-engine.ts CUES), the Mirror pattern audits' cue tables
// (lib/mirror/patterns.ts MIRROR_PATTERNS: squat, lunge, push-up, overhead reach, carry, hinge, set-up line), the
// coach's set-up pick-list (taxonomy.ts SETUP_CUES), the P8 template exercises' cues and fault fixes (templateCatalogue.ts),
// and the P6 warm-up's content (warmupContent.ts rock-and-holds and primers, plus the owner's Wake-Up phases it speaks).
// MIRROR-COACH P9 fix (2026-09-30, code review) added: the Movement Screen's FIX lines ("What to do:" on the athlete's
// screen card, right above the written corrective — lib/mirror/screen.ts fixLine, instruction tier), and the cool-down's
// breath step and its timed lines (lib/coach/cooldown.ts — spoken coach content). They were left out "by scope", which
// the policy has no room for: every spoken or written Mirror and coach cue, with the exceptions on the allow-list.
// Not here: the Movement Screen's station instructions (stance directions for the camera, not coaching), and the
// written correctives (rules/rnt-breath.ts, rules/smr-pin-stretch.ts, lib/mirror/program.ts) — lib/mirror/correctives.ts
// correctiveCueCorpus lints those with this same lintCue, in its own test.
//
// THE TEMPLATE CUES' TIER (MIRROR-COACH P9 fix, 2026-09-30, code review). Every template primaryCue was linted as an
// INSTRUCTION, so body-part movement cues ("Press through the heels, hips up…", "Pull the chest in fast", "Keep the hips
// still") skipped rules 3–4: run at the attention tier, 38 failed, none allow-listed. A primaryCue is what the athlete
// thinks about during the rep unless it is the start position or a drill description — so each line is an ATTENTION cue
// by default, and the set-ups are named, each with its reason, in TEMPLATE_SETUP_LINES (the test fails on a stale one).
// The movement cues were reworded in FEL's words (templateCatalogue.ts; before → after in the P9 fix report).
//
// Pure: no DOM, no Prisma client value.
import { CUES as MIRROR_COACH_CUES } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { MIRROR_PATTERNS } from '@/lib/mirror/patterns';
import { SETUP_CUES } from '@/lib/coach/taxonomy';
import { TEMPLATE_EXERCISES } from '@/lib/coach/templateCatalogue';
import { PRIMERS, ROCK_HOLDS } from '@/lib/coach/warmupContent';
import { WAKE_UP } from '@/lib/drills/drills';
import { fixLine } from '@/lib/mirror/screen';
import { BREATH_LINES, RECOVERY_BREATH_STEP } from '@/lib/coach/cooldown';

// ── the words ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rule 1: a muscle by name. ("trap bar" is equipment, not the muscle.) */
export const MUSCLE_WORDS =
  /\b(glute(?:us)?s?|hamstrings?|quads?|quadriceps|lats?|latissimus|traps?(?![- ]bar)|trapezius|rhomboids?|pecs?|pectorals?|delts?|deltoids?|biceps?|triceps?|core|abs|abdominals?|obliques?|psoas|diaphragm|pelvic floor|hip flexors?|adductors?|abductors?|erectors?|muscles?|posterior chain)\b/i;

/** Rule 2: an internal-effort verb, any tense (what follows it decides: see lintCue). */
const SQUEEZE_VERB =
  /\b(squeez(?:e|es|ed|ing)|contract(?:s|ed|ing)?|engag(?:e|es|ed|ing)|activat(?:e|es|ed|ing)|fir(?:e|es|ed|ing)|tens(?:e|es|ed|ing)|tighten(?:s|ed|ing)?|clench(?:es|ed|ing)?|depress(?:es|ed|ing)?|retract(?:s|ed|ing)?|relax(?:es|ed|ing)?|brac(?:e|es|ed|ing)|pack(?:s|ed|ing)?)\b/gi;
/** Rule 2, "feel": only feeling a body part or a muscle is the internal cue ("feel your hamstrings"); "closer than feels
 *  natural" is not. */
const FEEL_VERB = /\bfeel(?:s|ing)?\b/gi;

/** A body part, as a cue would name it ("back" only where it is the body: "your back", "lower back", "back long"). */
export const BODY_WORDS =
  /\b(heads?|necks?|chins?|ears?|shoulders?|shoulder blades?|arms?|elbows?|forearms?|wrists?|hands?|palms?|fingers?|thumbs?|chest|ribs?|ribcage|spine|trunk|torso|belly|stomach|waist|hips?|pelvis|butt|thighs?|knees?|shins?|calf|calves|ankles?|heels?|feet|foot|toes?|big toe|arch|lower back|upper back|your back|back long|long back|the back rounds)\b/i;

/** Something outside the body: the ground, the room, an implement, a target. (P9 fix: "band" — an implement.) */
export const WORLD_WORDS =
  /\b(floor|ground|wall|walls|ceiling|sky|room|door|doorway|door ?frame|frame|post|bar|barbell|handles?|dumbbells?|kettlebells?|bell|weights?|load|bags?|bands?|backpack|jug|box|bench|chair|(?:on|off|onto|from|up to) (?:a|the) step|step or chair|stair|table|rack|pin|blocks?|rope|ball|towel|target|cone|spot|mark|mirror|camera|phone|pockets?|laces|shoes?|belt(?: line)?|broomstick|dowel|punch|elevator|beat|count)\b/i;

/**
 * What the movement does, not where a body part goes. Two words are narrowed on purpose: "still" counts only as the
 * whole body holding still ("hold still", "stop square and still") — "Still drifting" is an adverb and "keep your shin
 * still" is a body-part cue; and "tall" is not here at all — "stack tall, shoulders level" is a posture cue, while
 * "grow tall toward the ceiling" already has its anchor.
 */
export const EFFECT_WORDS =
  /\b(quiet(?:ly)?|silent|sound|(?:hold|stand|stay|stays|and) still|smooth|path|top|bottom|height|depth|range|tempo|rhythm|travel\w*|centre|center|middle|straight up|straight down|stick it)\b/i;

// ── the lint ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type CueTier = 'attention' | 'instruction';
export type CueRule = 'muscle' | 'squeeze' | 'leads' | 'anchored';

export interface CueFinding { rule: CueRule; word: string }

/** The first clause: up to the first sentence end or dash (a colon joins a label to its instruction, so it does not). */
export function leadClause(text: string): string {
  return text.split(/[.!?;]\s|[—–]| - /)[0] ?? text;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);

/** Why a cue fails the policy (empty = it passes). */
export function lintCue(text: string, tier: CueTier): CueFinding[] {
  const out: CueFinding[] = [];
  const muscle = MUSCLE_WORDS.exec(text);
  if (muscle) out.push({ rule: 'muscle', word: muscle[0] });
  for (const m of text.matchAll(SQUEEZE_VERB)) {
    // what the verb acts on: the next four words (to the end of the clause)
    const after = words(leadClause(text.slice(m.index! + m[0].length))).slice(0, 4).join(' ');
    if (!WORLD_WORDS.test(after)) out.push({ rule: 'squeeze', word: `${m[0]} ${after}`.trim() });
  }
  for (const m of text.matchAll(FEEL_VERB)) {
    const after = words(leadClause(text.slice(m.index! + m[0].length))).slice(0, 4).join(' ');
    if ((BODY_WORDS.test(after) || MUSCLE_WORDS.test(after)) && !WORLD_WORDS.test(after)) out.push({ rule: 'squeeze', word: `${m[0]} ${after}`.trim() });
  }
  if (tier === 'attention' && BODY_WORDS.test(text)) {
    const lead = leadClause(text);
    const body = BODY_WORDS.exec(lead);
    if (body && !WORLD_WORDS.test(lead) && !EFFECT_WORDS.test(lead)) out.push({ rule: 'leads', word: body[0] });
    if (!WORLD_WORDS.test(text) && !EFFECT_WORDS.test(text)) out.push({ rule: 'anchored', word: BODY_WORDS.exec(text)![0] });
  }
  return out;
}

// ── the corpus ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CueEntry {
  /** Stable id: '<source>:<key>:<field>' — what CUE_ALLOW is keyed by. */
  id: string;
  text: string;
  tier: CueTier;
  /** Where the line lives (path). */
  file: string;
}

/** Every cue this policy covers (see the header for what is in and out, and why). */
export function cueCorpus(): CueEntry[] {
  const out: CueEntry[] = [];
  const add = (id: string, text: string, tier: CueTier, file: string) => out.push({ id, text, tier, file });
  // the Mirror's live coach: cue and escalate are what the athlete hears mid-rep; regress is a different drill
  const engine = 'lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts';
  for (const [fault, card] of Object.entries(MIRROR_COACH_CUES)) {
    add(`mirror-coach:${fault}:cue`, card.cue, 'attention', engine);
    add(`mirror-coach:${fault}:escalate`, card.escalate, 'attention', engine);
    add(`mirror-coach:${fault}:regress`, card.regress, 'instruction', engine);
    // MIRROR-MOVES P2: the reply to a repeated fault is said in the cue's slot, mid-set — an attention cue like it
    if (card.reply) add(`mirror-coach:${fault}:reply`, card.reply, 'attention', engine);
  }
  // the pattern audits' tables (the squat's entry reuses the coach's table above; the rest are their own)
  for (const p of MIRROR_PATTERNS) {
    for (const c of p.cues) {
      if (p.id === 'squat' && c.cue === (MIRROR_COACH_CUES as Record<string, { cue: string }>)[c.faultId]?.cue) continue;
      const file = `lib/mirror/patterns.ts (${p.id})`;
      add(`pattern:${p.id}:${c.faultId}:cue`, c.cue, 'attention', file);
      add(`pattern:${p.id}:${c.faultId}:escalate`, c.escalate, 'attention', file);
      add(`pattern:${p.id}:${c.faultId}:regress`, c.regress, 'instruction', file);
      if (c.reply) add(`pattern:${p.id}:${c.faultId}:reply`, c.reply, 'attention', file);
    }
  }
  for (const c of SETUP_CUES) add(`setup:${c.id}`, c.text, 'attention', 'lib/coach/taxonomy.ts');
  for (const e of TEMPLATE_EXERCISES) {
    // P9 fix: attention unless the line is a named set-up (TEMPLATE_SETUP_LINES)
    e.catalogue.primaryCues.forEach((t, i) => {
      const id = `template:${e.key}:primary${i}`;
      add(id, t, TEMPLATE_SETUP_LINES[id] ? 'instruction' : 'attention', 'lib/coach/templateCatalogue.ts');
    });
    e.catalogue.commonFaults.forEach((f, i) => add(`template:${e.key}:fix${i}`, f.correctionCue, 'attention', 'lib/coach/templateCatalogue.ts'));
  }
  for (const r of ROCK_HOLDS) {
    add(`warmup:${r.id}:setup`, r.setup, 'instruction', 'lib/coach/warmupContent.ts');
    add(`warmup:${r.id}:cue`, r.cue, 'attention', 'lib/coach/warmupContent.ts');
  }
  for (const p of PRIMERS) add(`warmup:${p.id}:cue`, p.cue, 'attention', 'lib/coach/warmupContent.ts');
  // P9 fix: the Movement Screen's "What to do:" lines (prescriptions — instruction tier)
  for (const id of SCREEN_FIX_IDS) {
    const t = fixLine(id);
    if (t) add(`screen-fix:${id}`, t, 'instruction', 'lib/mirror/screen.ts');
  }
  // P9 fix: the cool-down's breath — its cue is what the athlete attends to while breathing; the timed lines are directions
  add(`cooldown:${RECOVERY_BREATH_STEP.id}:cue`, RECOVERY_BREATH_STEP.cue, 'attention', 'lib/coach/cooldown.ts');
  BREATH_LINES.forEach((l, i) => add(`cooldown:${RECOVERY_BREATH_STEP.id}:line${i}`, l.text, 'instruction', 'lib/coach/cooldown.ts'));
  // the owner's Pre-Game Wake-Up, which every Prep speaks word for word (lib/coach/warmup.ts)
  for (const ph of WAKE_UP.phases) {
    add(`wakeup:${ph.id}:cue`, ph.cue, 'attention', 'lib/drills/drills.ts');
    // the timed lines (which side, which position) are directions — instruction tier
    (ph.lines ?? []).forEach((l, i) => add(`wakeup:${ph.id}:line${i}`, l.text, 'instruction', 'lib/drills/drills.ts'));
  }
  return out;
}

/** Every check the Movement Screen writes a FIX line for (lib/mirror/screen.ts FIX — the camera checks and the hands-on ones). */
export const SCREEN_FIX_IDS = [
  'heelLine', 'kneeWindow', 'hipLevel', 'shoulderLevel', 'ribAngle', 'headFloat', 'singleLeg', 'pelvicTilt', 'thoracicRotation',
] as const;

/**
 * The template primaryCues that are SET-UPS (the start position, or a variant described against the one before it),
 * linted at the instruction tier — each with its reason. Every other primaryCue is an attention cue. The test fails on an
 * entry that no longer exists or that would pass at the attention tier anyway (so this list only ever holds what needs it).
 */
export const TEMPLATE_SETUP_LINES: Readonly<Record<string, string>> = {
  'template:chair-box-squat:primary1': 'SET-UP — the stance: where the feet go before the first rep.',
  'template:glute-bridge-squeeze:primary0': 'SET-UP — the start position, lying down, before the bridge moves.',
  'template:glute-bridge-close:primary0': 'SET-UP — where the feet go for this variant, before the rep.',
  'template:sl-bridge-squeeze:primary0': 'SET-UP — the start position (one foot down, the other knee held).',
  'template:prone-t:primary0': 'SET-UP — the start position, face down, arms placed.',
  'template:breathing-plank:primary0': 'SET-UP — the plank position the breathing is done in.',
  'template:breathing-plank-taps:primary0': 'SET-UP — the plank position and what the drill is; its attention cue is primary1.',
  'template:lat-pulldown:primary0': 'SET-UP — how to sit at the machine and where the hands go on the bar.',
  'template:door-row-single-slow:primary0': 'DRILL — the variant named against the row before it (the same row, a 3-second lower).',
};

// ── the allow-list ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A cue that fails the lint and stays, with why. Keyed by CueEntry.id. Two kinds of reason only (see the header):
 * OWNER — the owner's own words, reported rather than rewritten; UNAVOIDABLE — nothing outside the body to point at.
 */
export const CUE_ALLOW: Readonly<Record<string, string>> = {
  'setup:light-punch':
    'OWNER — Playbook ch8 set-up cue (taxonomy.test.ts anchors it to the chapter). The brace it names is the light-punch '
    + 'image it opens with, which is an outside force; the lint reads the second "brace" on its own.',
  'wakeup:release-the-locks:cue':
    'OWNER — the Pre-Game Wake-Up, Playbook ch5 Phase 1, spoken word for word in every Prep (warmup.test.ts holds it); '
    + 'lib/drills is read-only for this lane. Reported: "contract, relax" is an internal cue. A FEL wording for the owner '
    + 'to consider: "Hands on a wall. Push into the wall, let it go, sink a little further."',
  'wakeup:release-the-locks:line2':
    'OWNER — ch5 Phase 1\'s timed direction. "Hip flexor" names which stretch comes next (a position label, not a '
    + 'muscle to squeeze). Reported with the cue above.',
  'wakeup:release-the-locks:line3': 'OWNER — the same direction, other side (see line2).',
  'wakeup:pressurize:cue':
    'OWNER and UNAVOIDABLE — ch5 Phase 2. A breath drill\'s hand placement (hands on the lower ribs, to feel the breath '
    + 'move them) has nothing outside the body to point at.',
  'cooldown:recovery-breath:cue':
    'OWNER and UNAVOIDABLE — the Playbook ch9 recovery breath (lib/coach/cooldown.ts RECOVERY_BREATH_STEP: "in the owner\'s '
    + 'Playbook words where they are his (the name, the position, the counts)"). A breath drill\'s hand placement — one hand '
    + 'on the belly, one on the lower ribs — has nothing outside the body to point at, as the Wake-Up\'s pressurize does.',
  'wakeup:wake-the-tripod:cue':
    'OWNER — ch5 Phase 3, the owner\'s tripod (taxonomy.ts tripod-down). A foot drill is about the foot. A FEL wording '
    + 'for the owner to consider: "Press heel, big-toe base and little-toe base into the floor. Lift the arch off it, '
    + 'hold 3, again."',
};
