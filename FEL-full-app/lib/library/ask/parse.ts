// lib/library/ask/parse.ts — EXERCISE-LIBRARY (2026-10-25): "Ask" — a question in plain words → library filters.
//
// Owner (2026-10-25): "Make sure people can search for what they need, ask ai." This is the part that is ALWAYS ON,
// with the AI switch off (lib/abacus/killSwitch.ts, the default): a deterministic reading of the question into the
// same filters the search screen has, shown back to the person as chips they can remove. Examples it is built for:
//   "knee-friendly exercises for vertical jump with no equipment"
//       → equipment: none (only), easy on: knees, goal: vertical jump
//   "something easier than a pistol squat"  → relation: easier than <Pistol Squat>
//   "warm-up for basketball, 10 minutes"    → intent: warm-up, sport: basketball, 10 minutes
// It also flags a pain or injury question (injuryWords) so the answer layer can give the existing "see a
// professional" wording and general prehab entries only — the AI is never asked about one.
//
// Pure. Client-safe (the chips are rendered from its output).

import type { SearchFilters } from '../search/engine';
import { fold } from '../search/text';
import { EQUIPMENT, type GoalId, type Joint, type LevelId } from '../vocab';

export type AskIntent = 'find' | 'warmup' | 'cooldown';
export type RelationKind = 'easier' | 'harder' | 'alternative';

export interface AskChip {
  key: keyof SearchFilters | 'intent' | 'minutes' | 'relation' | 'boostGoal' | 'preferLevel' | 'text';
  value: string;
  label: string;
}

export interface ParsedAsk {
  question: string;
  /** Words left for the text search once the filter words are read. */
  text: string;
  filters: SearchFilters;
  boostGoals: GoalId[];
  preferLevel: LevelId | null;
  intent: AskIntent;
  minutes: number | null;
  relation: { kind: RelationKind; anchorText: string } | null;
  injury: { flagged: boolean; joints: Joint[]; words: string[] };
  chips: AskChip[];
}

export const MAX_QUESTION_CHARS = 300;

// ── the lexicon ─────────────────────────────────────────────────────────────────────────────────────────────────────

const JOINT_WORDS: readonly [Joint, RegExp][] = [
  ['knee', /\bknees?\b|\bpatell\w*|\bacl\b|\bmcl\b|\bmeniscus\b/],
  ['ankle', /\bankles?\b|\bachilles\b/],
  ['hip', /\bhips?\b|\bgroin\b/],
  ['back', /\b(lower |low |upper )?back\b|\bspine\b|\blumbar\b/],
  ['shoulder', /\bshoulders?\b|\brotator cuff\b/],
  ['wrist', /\bwrists?\b/],
  ['elbow', /\belbows?\b/],
];

/** Pain and injury words. "knee-friendly" is a preference, not this; "my knee hurts" is this. */
export const INJURY_WORDS = /\b(pain|painful|hurts?|hurting|hurt|injur(?:y|ed|ies)|sprain(?:ed)?|strain(?:ed)?|torn|tear|ruptur\w*|surgery|surgical|post ?op|operation|rehab\w*|recover(?:ing)? from|tendini?tis|tendonitis|tendinopathy|bursitis|arthritis|meniscus|acl|mcl|swollen|swelling|aches?|aching|achy|tweaked|pulled (?:a |my )?(?:muscle|hamstring|groin|calf)|broken|broke|fracture\w*|dislocat\w*|sciatica|numb\w*|tingl\w*|bad (?:knee|knees|back|shoulder|shoulders|ankle|ankles|hip|hips)|sore (?:lower |upper |low )?(?:knee|knees|back|shoulder|shoulders|ankle|ankles|hip|hips|neck|wrist|elbow))\b/;

const FRIENDLY = (j: string) => new RegExp(`\\b${j}s? ?(friendly|safe)\\b|\\beasy on (?:the |my |your )?${j}s?\\b|\\b(?:low|less|no|without) (?:${j}|${j}s) (?:stress|load|impact|pressure|strain|bending)\\b|\\bgentle on (?:the |my |your )?${j}s?\\b|\\bspares? (?:the |my )?${j}s?\\b`);

const GOAL_WORDS: readonly [GoalId, RegExp][] = [
  ['vertical', /\bvert(?:ical)?(?: jump)?\b|\bjump higher\b|\bdunk\w*\b|\bhops\b|\bbounce\b|\bvertical leap\b/],
  ['speed', /\bspeed\b|\bsprint\w*\b|\bfaster\b|\bquicker\b|\bacceleration\b|\bfirst step\b/],
  ['agility', /\bagility\b|\bchange of direction\b|\bcutting\b|\bcuts?\b|\blateral quickness\b|\bquick feet\b/],
  ['footwork', /\bfootwork\b|\bpivots?\b|\bjab step\b/],
  ['handles', /\bdribbl\w*\b|\bball handling\b|\bhandles?\b|\bcrossovers?\b/],
  ['finishing', /\bfinish\w*\b|\blay ?ups?\b|\bfloaters?\b|\baround the (?:rim|basket)\b/],
  ['shooting', /\bshoot\w*\b|\bjump ?shots?\b|\bjumper\b|\bfree throws?\b/],
  ['defense', /\bdefen[cs]\w*\b|\bclose ?outs?\b|\bon ball\b/],
  ['landing', /\blanding\b|\bland (?:better|softer|quiet\w*)\b|\bdecel\w*\b|\bstopping\b/],
  ['balance', /\bbalance\b|\bstability\b|\bsteady\b/],
  ['trunk', /\bcore\b|\babs\b|\bab\b|\btrunk\b|\bsix pack\b|\bmidsection\b/],
  ['grip', /\bgrip\b|\bforearms?\b/],
  ['conditioning', /\bconditioning\b|\bcardio\b|\bendurance\b|\bstamina\b|\bin shape\b|\bwind\b|\bgas tank\b/],
  ['mobility', /\bmobility\b|\bflexib\w*\b|\bstretch\w*\b|\brange of motion\b|\bloosen up\b|\btight\b/],
  ['power', /\bpower\b|\bexplosiv\w*\b/],
  ['strength', /\bstrength\b|\bstronger\b|\bget strong\b/],
  ['posture', /\bposture\b/],
  ['hypertrophy', /\bmuscle size\b|\bbulk\b|\bhypertrophy\b|\bbigger\b/],
];

const MUSCLE_WORDS: readonly [string, RegExp][] = [
  ['glutes', /\bglutes?\b|\bbutt\b|\bbooty\b/], ['hamstrings', /\bhamstrings?\b|\bhamm(?:y|ies)\b/], ['quads', /\bquads?\b|\bquadriceps\b/],
  ['calves', /\bcal(?:f|ves)\b/], ['chest', /\bchest\b|\bpecs?\b/], ['lats', /\blats?\b/], ['delts', /\bdelts?\b/],
  ['biceps', /\bbiceps?\b|\bbis\b/], ['triceps', /\btriceps?\b|\btris\b/], ['obliques', /\bobliques?\b/],
  ['adductors', /\badductors?\b|\binner thighs?\b/], ['tibialis', /\bshins?\b|\btibialis\b/], ['foot', /\bfeet\b|\bfoot\b|\barch(?:es)?\b/],
  ['rotator-cuff', /\brotator cuff\b/], ['neck', /\bneck\b/],
];

const CATEGORY_WORDS: readonly [string, RegExp][] = [
  ['plyometric', /\bplyo\w*\b|\bjumps?\b|\bjumping\b|\bbounds?\b/],
  ['prehab', /\bprehab\b|\binjury prevention\b|\bbulletproof\w*\b|\bdurab\w*\b|\bjoint care\b/],
  ['speed-agility', /\bsaq\b/],
  ['strength', /\bweights?\b|\blifting\b|\blifts?\b/],
];

const SPORT_WORDS: readonly [string, RegExp][] = [
  ['basketball', /\bbasketball\b|\bhoops?\b|\bhooping\b/], ['volleyball', /\bvolleyball\b/], ['soccer', /\bsoccer\b|\bfootie\b/],
  ['football', /\bfootball\b/], ['track', /\btrack\b|\bsprinters?\b/], ['tennis', /\btennis\b|\bpickleball\b|\bbadminton\b/],
];

const equipmentWords: readonly [string, RegExp][] = EQUIPMENT.filter((e) => !['other', 'wall', 'mat', 'towel', 'hoop', 'basketball', 'step', 'cone', 'strongman'].includes(e.id)).map((e) => {
  const names = [e.label, ...e.aliases].map((n) => fold(n).replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return [e.id, new RegExp(`\\b(?:${names.map((n) => `${n}s?`).join('|')})\\b`)] as [string, RegExp];
});

/**
 * Every equipment name on its own, longest first, so a longer name claims its words before a shorter one inside it:
 * "trap bar" is the trap bar, not a barbell ("bar") plus a stray "trap" (batches 2–4: that stray word then searched
 * the traps muscle and returned snatch and clean deadlifts for "trap bar deadlift").
 */
const equipmentNames: readonly [string, RegExp][] = EQUIPMENT.filter((e) => !['other', 'wall', 'mat', 'towel', 'hoop', 'basketball', 'step', 'cone', 'strongman'].includes(e.id))
  .flatMap((e) => [e.label, ...e.aliases].map((n) => [e.id, fold(n).replace(/\s+/g, ' ')] as [string, string]))
  .sort((a, b) => b[1].length - a[1].length)
  .map(([id, n]) => [id, new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`)] as [string, RegExp]);

const NO_EQUIPMENT = /\bno (?:equipment|gear|weights?)\b|\bwithout (?:any )?(?:equipment|weights?|gear)\b|\bbody ?weight\b|\bequipment free\b|\bnothing but (?:my )?body\b|\bat home with nothing\b|\bhotel room\b/;
const ONLY = /\bonly\b|\bjust\b/;

const RELATIONS: readonly [RelationKind, RegExp][] = [
  ['easier', /\b(?:easier|simpler|lighter|less (?:hard|difficult|intense)|regress(?:ion)?(?: of| for)?|step(?:ping)? down from|scale(?:d)? (?:down|back))\b(?: (?:than|from|of|version of|for|alternative to))?\s+(.+)$/],
  ['harder', /\b(?:harder|tougher|more (?:advanced|difficult|challenging)|progress(?:ion)?(?: of| for| from)?|step(?:ping)? up from|next step (?:after|from))\b(?: (?:than|from|of|version of|for))?\s+(.+)$/],
  ['alternative', /\b(?:alternatives?|instead of|substitute|sub|swap|replace(?:ment)?|similar to|something like|like)\b(?: (?:to|for|of))?\s+(.+)$/],
];

const FILLER = /\b(?:exercises?|drills?|moves?|movements?|workouts?|something|some|anything|any|good|best|ideas?|recommend\w*|suggest\w*|give me|show me|what are|what is|what|which|can i do|could i do|should i do|i can do|to do|for me|please|that|is|are|a|an|the|my|me|i|for|with|to|of|and|in|on|at|it|im|i'm|want|need|looking|help|routine|session|program|plan|list|but|also|when|how|do|does|can|could|would|should|will|get|got|using|use|version|versions|kind|type|types|stuff|things?|work|working|train|training|improve|better|build|develop|increase|home|house|gym|room|anywhere|day|today|tonight)\b/g;

function cutAnchor(s: string): string {
  return s.split(/\s+(?:with|for|using|that|but|and|without|at home)\s+|[,;.?!]/)[0].trim();
}

/** Read the question. Never throws; an empty or over-long question is read as far as it goes. */
export function parseAsk(question: string): ParsedAsk {
  const q = (question ?? '').slice(0, MAX_QUESTION_CHARS);
  let f = ` ${fold(q).replace(/\bwarm ?ups?\b/g, 'warmup').replace(/\bcool ?downs?\b/g, 'cooldown')} `;
  const filters: SearchFilters = {};
  const chips: AskChip[] = [];
  const boostGoals: GoalId[] = [];
  let preferLevel: LevelId | null = null;
  let intent: AskIntent = 'find';
  let minutes: number | null = null;
  let relation: ParsedAsk['relation'] = null;
  const consume = (re: RegExp) => { f = f.replace(new RegExp(re.source, 'g'), ' '); };

  // injury words first: they change what the answer may contain
  const injuryMatch = [...new Set((f.match(new RegExp(INJURY_WORDS.source, 'g')) ?? []).map((w) => w.trim()))];
  const injuryJoints = JOINT_WORDS.filter(([, re]) => re.test(f)).map(([j]) => j);

  // relations ("easier than a pistol squat")
  for (const [kind, re] of RELATIONS) {
    const m = re.exec(f);
    if (m && !relation) {
      const rawAnchor = cutAnchor(m[1]);
      const anchorText = rawAnchor.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
      if (anchorText.length >= 3) {
        relation = { kind, anchorText };
        // the qualifiers after the anchor ("but with dumbbells") stay to be read as filters
        f = f.replace(m[0], ` ${m[1].slice(rawAnchor.length)} `);
      }
    }
  }
  // "<x> alternatives", "<x> swap": the anchor comes first
  if (!relation) {
    const m = /^\s*(.+?)\s+(?:alternatives?|substitutes?|subs|swaps?|replacements?)\b/.exec(f);
    const anchorText = m ? cutAnchor(m[1]).replace(FILLER, ' ').replace(/\s+/g, ' ').trim() : '';
    if (m && anchorText.length >= 3) { relation = { kind: 'alternative', anchorText }; f = f.replace(m[0], ' '); }
  }
  if (relation) chips.push({ key: 'relation', value: `${relation.kind}:${relation.anchorText}`, label: `${relation.kind === 'easier' ? 'Easier than' : relation.kind === 'harder' ? 'Harder than' : 'Instead of'} ${relation.anchorText}` });

  // minutes and intent
  const mins = /\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/.exec(f);
  if (mins) { minutes = Math.min(60, Math.max(3, Number(mins[1]))); chips.push({ key: 'minutes', value: String(minutes), label: `${minutes} minutes` }); consume(/\b\d{1,3}\s*(?:min|mins|minute|minutes)\b/); }
  if (/\bwarmup\b|\bbefore (?:practice|a game|games|training|a workout|lifting)\b|\bpre ?game\b|\bactivation\b/.test(f)) {
    intent = 'warmup'; chips.push({ key: 'intent', value: 'warmup', label: 'Warm-up' });
    consume(/\bwarmup\b|\bbefore (?:practice|a game|games|training|a workout|lifting)\b|\bpre ?game\b|\bactivation\b/);
  } else if (/\bcooldown\b|\bafter (?:practice|a game|games|training|a workout)\b|\bwind down\b|\brecovery day\b/.test(f)) {
    intent = 'cooldown'; chips.push({ key: 'intent', value: 'cooldown', label: 'Cool-down' });
    consume(/\bcooldown\b|\bafter (?:practice|a game|games|training|a workout)\b|\bwind down\b|\brecovery day\b/);
  }

  // joint-friendly preferences ("knee-friendly", "easy on my back")
  const low: Joint[] = [];
  for (const [j] of JOINT_WORDS) {
    const re = FRIENDLY(j);
    if (re.test(f)) { low.push(j); consume(re); }
  }
  if (/\blow impact\b|\bno jump\w*\b|\bquiet\b|\bapartment\b|\bwithout jumping\b/.test(f)) {
    for (const j of ['knee', 'ankle'] as Joint[]) if (!low.includes(j)) low.push(j);
    filters.notCategory = ['plyometric'];
    chips.push({ key: 'notCategory', value: 'plyometric', label: 'No jumping' });
    consume(/\blow impact\b|\bno jump\w*\b|\bquiet\b|\bapartment\b|\bwithout jumping\b/);
  }
  if (low.length) {
    filters.lowLoad = low;
    for (const j of low) chips.push({ key: 'lowLoad', value: j, label: `Easy on the ${j === 'back' ? 'back' : `${j}s`}` });
  }

  // equipment: "without a machine" leaves it out; "no equipment" means bodyweight only
  const without: string[] = [];
  for (const [id, re] of equipmentWords) {
    const neg = new RegExp(`\\b(?:without|no|not on|not using|except)(?: (?:a|an|the|any))? (?:${re.source.replace(/^\\b\(\?:|\)\\b$/g, '')})\\b`);
    if (neg.test(f)) { without.push(id); f = f.replace(new RegExp(neg.source, 'g'), ' '); }
  }
  if (without.length) {
    filters.notEquipment = without;
    for (const id of without) chips.push({ key: 'notEquipment', value: id, label: `No ${EQUIPMENT.find((e) => e.id === id)?.label.toLowerCase() ?? id}` });
  }
  if (NO_EQUIPMENT.test(f)) {
    filters.equipment = []; filters.equipmentOnly = true;
    chips.push({ key: 'equipmentOnly', value: 'none', label: 'No equipment' });
    consume(NO_EQUIPMENT);
  } else {
    const eq: string[] = [];
    for (const [id, re] of equipmentNames) if (re.test(f)) { if (!eq.includes(id)) eq.push(id); consume(re); }
    if (eq.length) {
      filters.equipment = eq;
      if (ONLY.test(f)) filters.equipmentOnly = true;
      for (const id of eq) chips.push({ key: 'equipment', value: id, label: `${filters.equipmentOnly ? 'Only ' : ''}${EQUIPMENT.find((e) => e.id === id)?.label ?? id}` });
    }
  }

  // sport
  const sport = SPORT_WORDS.filter(([, re]) => re.test(f)).map(([id]) => id);
  if (sport.length) { filters.sport = sport; for (const s of sport) chips.push({ key: 'sport', value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }); for (const [, re] of SPORT_WORDS) consume(re); }

  // level
  if (/\bbeginners?\b|\bnew to\b|\bstarter\b|\bsimple\b|\bfirst time\b|\bnovice\b|\beasy\b/.test(f)) {
    filters.level = ['beginner']; chips.push({ key: 'level', value: 'beginner', label: 'Beginner' });
    consume(/\bbeginners?\b|\bnew to\b|\bstarter\b|\bsimple\b|\bfirst time\b|\bnovice\b|\beasy\b/);
  } else if (/\badvanced\b|\belite\b|\bchallenging\b|\bhard\b|\bpro level\b/.test(f)) {
    filters.level = ['advanced', 'intermediate']; preferLevel = 'advanced'; chips.push({ key: 'level', value: 'advanced', label: 'Advanced' });
    consume(/\badvanced\b|\belite\b|\bchallenging\b|\bhard\b|\bpro level\b/);
  } else if (/\bintermediate\b/.test(f)) {
    filters.level = ['intermediate']; chips.push({ key: 'level', value: 'intermediate', label: 'Intermediate' }); consume(/\bintermediate\b/);
  }

  // goals: the first one named is the subject (a filter), the rest only raise the score
  // in the order the question names them: the first one named is the subject
  const at = (re: RegExp) => { const m = re.exec(f); return m ? m.index : Infinity; };
  const goals = GOAL_WORDS.filter(([, re]) => re.test(f)).sort((a, b) => at(a[1]) - at(b[1]));
  goals.forEach(([g, re], i) => {
    if (i === 0 && intent === 'find') { filters.goal = [g]; chips.push({ key: 'goal', value: g, label: goalLabel(g) }); }
    else { boostGoals.push(g); chips.push({ key: 'boostGoal', value: g, label: `Also: ${goalLabel(g)}` }); }
    consume(re);
  });

  // target muscles (not in a pain question: "my hamstring hurts" is not a request to train it)
  if (!injuryMatch.length) {
    const muscles = MUSCLE_WORDS.filter(([, re]) => re.test(f)).map(([m]) => m);
    if (muscles.length) { filters.muscle = muscles; for (const m of muscles) chips.push({ key: 'muscle', value: m, label: m.replace(/-/g, ' ') }); for (const [, re] of MUSCLE_WORDS) consume(re); }
    // a joint named as a target ("ankle drills", "for my shoulders") raises the joint's goal
    for (const [j, re] of JOINT_WORDS) {
      if (re.test(f) && ['knee', 'ankle', 'hip', 'shoulder'].includes(j)) {
        boostGoals.push(j as GoalId); chips.push({ key: 'boostGoal', value: j, label: `For the ${j === 'hip' ? 'hips' : `${j}s`}` });
        consume(re);
      }
    }
  }

  // movement patterns named as such ("a pull", "push exercises"); squat and lunge stay words, they name exercises
  const PATTERN_WORDS: readonly [string, RegExp][] = [['pull', /\bpull(?:ing)?\b|\brows?\b/], ['push', /\bpush(?:ing)?\b|\bpress(?:ing)?\b/], ['hinge', /\bhinge\b/], ['carry', /\bcarr(?:y|ies)\b/], ['rotation', /\brotation(?:al)?\b|\banti ?rotation\b/]];
  const pat = PATTERN_WORDS.filter(([, re]) => re.test(f) && !/\bpull ?ups?\b|\bpush ?ups?\b|\bpress ?ups?\b/.test(f)).map(([p]) => p);
  if (pat.length === 1) { filters.pattern = pat; chips.push({ key: 'pattern', value: pat[0], label: pat[0].charAt(0).toUpperCase() + pat[0].slice(1) }); consume(PATTERN_WORDS.find(([p]) => p === pat[0])![1]); }

  // categories
  for (const [c, re] of CATEGORY_WORDS) {
    if (re.test(f) && !(filters.notCategory ?? []).includes(c)) {
      if (!filters.category && !(c === 'plyometric' && filters.goal?.includes('vertical'))) { filters.category = [c]; chips.push({ key: 'category', value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }); }
      consume(re);
    }
  }

  const text = f.replace(FILLER, ' ').replace(INJURY_WORDS, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) chips.push({ key: 'text', value: text, label: `“${text}”` });
  return {
    question: q, text, filters, boostGoals: [...new Set(boostGoals)], preferLevel, intent, minutes, relation,
    injury: { flagged: injuryMatch.length > 0, joints: injuryJoints, words: injuryMatch }, chips,
  };
}

const GOAL_LABEL: Partial<Record<GoalId, string>> = {
  vertical: 'Vertical jump', speed: 'Speed', agility: 'Change of direction', footwork: 'Footwork', handles: 'Ball handling',
  finishing: 'Finishing', shooting: 'Shooting', defense: 'Defense', landing: 'Landing', balance: 'Balance', trunk: 'Trunk',
  grip: 'Grip', conditioning: 'Conditioning', mobility: 'Mobility', power: 'Power', strength: 'Strength', posture: 'Posture',
  hypertrophy: 'Muscle size', knee: 'Knees', ankle: 'Ankles', hip: 'Hips', shoulder: 'Shoulders',
};
export const goalLabel = (g: string): string => GOAL_LABEL[g as GoalId] ?? g;
