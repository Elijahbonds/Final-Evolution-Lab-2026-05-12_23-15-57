// WHAT A TRAINER MAY PUBLISH UNDER OUR DOMAIN (2026-09-13).
//
// A trainer writes free text — a note on a drill, a recommendation for a client — and it goes to a public
// URL on our domain that anybody with the link can read and forward. That makes their words our publication,
// and the standing rule is unambiguous: performance and movement mastery only, no medical diagnosis, therapy
// or clinical claims, enforced at the component level rather than in copy.
//
// THE MISTAKE A WORDLIST MAKES, AND WHY THIS IS NOT ONE.
//
// The obvious build is a list of banned words with "pain" and "injury" near the top. That build is worse
// than nothing, because the single most responsible sentence a trainer writes is "stop if you feel pain" —
// and a screen that blocks it teaches trainers to write around the filter, which is how you end up with
// coaching that omits the safety line.
//
// THE DANGEROUS THING IS NOT THE WORD, IT IS THE SHAPE OF THE CLAIM:
//
//   "Stop if you feel pain in the knee."          — an instruction to the client. Good coaching. Allowed.
//   "Your knee pain is patellar tendinitis."      — an assertion about a body. Diagnosis. Refused.
//   "This will fix your shoulder impingement."    — a treatment claim. Refused.
//   "Guaranteed to add 6 inches to your vertical" — an outcome guarantee. Refused.
//
// So this screens three things and deliberately not a fourth:
//
//   1. NAMED CONDITIONS — tendinitis, impingement, a herniated disc. Naming a condition IS diagnosis, in any
//      framing. There is no sentence containing "your rotator cuff tear" that a movement coach should be
//      publishing under a platform's domain.
//   2. TREATMENT AND CURE CLAIMS — heal, cure, treat, rehab, correct, realign, applied to a person.
//   3. OUTCOME GUARANTEES — a promise about a result, which is a consumer-protection problem as much as a
//      clinical one.
//
// And NOT symptom words on their own. "Pain", "sore", "hurts", "tight", "uncomfortable" are the vocabulary
// of the job. They pass.
//
// IT FLAGS, IT NEVER REWRITES. A trainer's words are theirs, and a screen that silently edited professional
// advice would be both dishonest and dangerous — the edited version still goes out under their name. The
// author is shown what tripped and writes it themselves.
//
// Pure: no Prisma, no DOM, no network.

export type FlagKind = 'condition' | 'treatment' | 'guarantee';

export interface TextFlag {
  kind: FlagKind;
  /** The exact phrase that tripped it, as written. */
  found: string;
  /** Character offset into the original text, so a UI can underline rather than just complain. */
  at: number;
  /** What to do about it, addressed to the trainer. */
  fix: string;
}

/**
 * Named conditions. Naming one is a diagnosis whatever the surrounding sentence does.
 *
 * Kept as whole-word patterns: "strain" must not fire on "restrained", "acl" must not fire on "acclimate".
 */
const CONDITIONS: readonly string[] = [
  'tendinitis', 'tendonitis', 'tendinopathy', 'bursitis', 'arthritis', 'osteoarthritis',
  'impingement', 'herniation', 'herniated disc', 'bulging disc', 'sciatica', 'stenosis',
  'plantar fasciitis', 'shin splints', 'runner\'s knee', 'jumper\'s knee', 'tennis elbow',
  'rotator cuff tear', 'labral tear', 'meniscus tear', 'torn meniscus', 'acl tear', 'mcl tear',
  'sprain', 'sprained', 'fracture', 'fractured', 'dislocation', 'dislocated', 'subluxation',
  'scoliosis', 'kyphosis', 'lordosis', 'spondylolisthesis',
  'concussion', 'whiplash', 'neuropathy', 'radiculopathy', 'compartment syndrome',
  'patellar tracking disorder', 'it band syndrome', 'piriformis syndrome',
];

/**
 * Treatment claims that are unambiguous on their own.
 *
 * Every one of these describes practising medicine. There is no movement-coaching sentence that needs the
 * word "diagnose" in it.
 */
const TREATMENTS: readonly string[] = [
  'cure', 'cures', 'cured', 'curing',
  'therapy', 'therapeutic', 'rehabilitate', 'rehabilitates', 'rehabilitation',
  'realign', 'realigns', 'realignment', 'adjust your spine', 'reset your pelvis',
  'diagnose', 'diagnoses', 'diagnosis', 'diagnostic',
  'prescribe', 'prescribes', 'prescription', 'medication', 'anti-inflammatory',
];

/**
 * Treatment VERBS, which are only a problem when aimed at a body.
 *
 * "Fix your form", "clean up your setup" and "correct the timing" are the vocabulary of coaching and must
 * pass. "Fix your knee" is a treatment claim. The difference is entirely the object, so the object is part
 * of the pattern rather than the verb being banned on its own — a screen that blocked "fix your form" would
 * be a screen trainers learn to write around.
 */
const TREATMENT_VERBS = ['fix', 'fixes', 'repair', 'repairs', 'heal', 'heals', 'treat', 'treats', 'correct', 'corrects', 'rehab', 'rehabs'];

const BODY_PARTS = [
  'knee', 'knees', 'shoulder', 'shoulders', 'back', 'spine', 'disc', 'discs', 'hip', 'hips',
  'ankle', 'ankles', 'wrist', 'wrists', 'elbow', 'elbows', 'neck', 'foot', 'feet', 'pelvis',
  'tendon', 'tendons', 'ligament', 'ligaments', 'joint', 'joints', 'cartilage',
  'rotator cuff', 'acl', 'mcl', 'meniscus', 'labrum', 'sciatic nerve', 'hamstring', 'hamstrings',
  'groin', 'achilles', 'rib', 'ribs', 'jaw', 'posture',
];

/** Promises about outcomes. */
const GUARANTEES: readonly string[] = [
  'guarantee', 'guaranteed', 'guarantees',
  'will definitely', 'is guaranteed to', '100% effective', 'never fails',
  'risk-free results', 'promised results',
];

const FIXES: Record<FlagKind, string> = {
  condition:
    'Naming a condition is a diagnosis, which we cannot publish. Describe the movement instead — what you '
    + 'want them to do, and what to stop for.',
  treatment:
    'This reads as treatment rather than training. Say what the work is for in movement terms, and point '
    + 'them to a clinician for anything medical.',
  guarantee:
    'Take out the guarantee. Say what the block is designed to change, which is what the outcome field is for.',
};

/** Word-boundary match that survives punctuation and possessives without firing inside longer words. */
function findPhrase(haystack: string, phrase: string): number {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  const m = re.exec(haystack);
  if (!m) return -1;
  return m.index + (m[1]?.length ?? 0);
}

/**
 * Screen one piece of trainer-written text.
 *
 * Returns every flag, not just the first — a trainer fixing one phrase and resubmitting four times is a
 * trainer who stops using the feature.
 */
export function screenText(text: string): TextFlag[] {
  const flags: TextFlag[] = [];
  const groups: [FlagKind, readonly string[]][] = [
    ['condition', CONDITIONS], ['treatment', TREATMENTS], ['guarantee', GUARANTEES],
  ];
  for (const [kind, list] of groups) {
    for (const phrase of list) {
      const at = findPhrase(text, phrase);
      if (at >= 0) flags.push({ kind, found: text.slice(at, at + phrase.length), at, fix: FIXES[kind] });
    }
  }

  // a treatment verb aimed at a body part: "fix your knee", "heals the tendon", "rehab that shoulder".
  // Up to three words may sit between them ("fix up that bad knee") without letting the pair drift across a
  // sentence boundary, which is what the [^.!?] does.
  for (const verb of TREATMENT_VERBS) {
    for (const part of BODY_PARTS) {
      const re = new RegExp(
        `(^|[^a-z0-9])(${verb}(?:[^.!?a-z0-9][a-z0-9']+){0,3}[^.!?a-z0-9]${part})([^a-z0-9]|$)`, 'i',
      );
      const m = re.exec(text);
      if (m) {
        const at = m.index + (m[1]?.length ?? 0);
        flags.push({ kind: 'treatment', found: m[2], at, fix: FIXES.treatment });
      }
    }
  }
  // longest match first at the same spot, so "herniated disc" reports once rather than alongside "herniation"
  return flags
    .sort((a, b) => a.at - b.at || b.found.length - a.found.length)
    .filter((f, i, arr) => !arr.some((o, j) => j < i && o.at <= f.at && o.at + o.found.length >= f.at + f.found.length));
}

export function isPublishable(text: string): boolean {
  return screenText(text).length === 0;
}

/**
 * The line shown to a trainer whose text was held back.
 *
 * Addressed to a professional, because they are one: it says what tripped and why, and does not lecture. A
 * trainer who thinks the call is wrong is usually right about their client and wrong about what a public
 * link means, and that is the distinction the sentence draws.
 */
export function screenSummary(flags: readonly TextFlag[]): string | null {
  if (!flags.length) return null;
  const quoted = [...new Set(flags.map((f) => `"${f.found}"`))].join(', ');
  return `${quoted} can't go on a public link — this page is readable by anyone it's forwarded to, and that `
    + 'makes it a published claim. Your coaching cues are fine; the medical language is what has to come out.';
}

/** The standing limits on trainer-written text, so a route and a form agree. */
export const MAX_NOTE_CHARS = 600;
export const MAX_RECOMMENDATION_CHARS = 1500;
