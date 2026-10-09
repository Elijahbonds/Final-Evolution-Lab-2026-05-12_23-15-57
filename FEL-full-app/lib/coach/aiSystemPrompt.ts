// lib/coach-service.ts's buildSystemPrompt (~:294) has no real caller anywhere in the app — grepped for every
// import of the file, and the only one is lib/nav/modules.test.ts's own KNOWN_ORPHANS list ("The coach layer —
// written, tested, unreachable."). The LIVE AI coach chat is app/api/coach/chat/route.ts, called from
// components/coach-chat.tsx's fetch('/api/coach/chat') — its own inline SYSTEM_PROMPT constant is what an athlete's
// message actually reaches. MIRROR-COACH P5 (2026-09-29) adds this module and wires IT (not lib/coach-service.ts) in.
//
// WHY A SEPARATE, PURE MODULE. The route file is not collected by vitest (vitest.config.ts's own comment: "app/ is
// deliberately still out"), so the addendum text has to live somewhere a test can read it directly — same reason
// lib/health/painRule.ts keeps every threshold and copy line out of its own route.
//
// WHAT THE ADDENDUM DOES, AND DOES NOT DO. It never re-decides anything: it tells the model, in prose, the same
// four rules lib/health/painRule.ts's decide() enforces in code (an acute event or a standing red flag means "stop
// and see a clinician"; any pain for a minor means "stop and tell an adult"; the coach never diagnoses, names a
// condition or promises an outcome) so a conversational answer never contradicts what the pain check-in loop would
// have said about the same situation. It carries FEL's own disclosure line, required whatever persona or catalogue
// text precedes it.
export const AI_COACH_DISCLOSURE = "FEL's coach is not a clinician. It can talk through training, but it cannot diagnose, treat, or rule anything out.";

/**
 * The prose the pain rule's FOUR outcomes become for the model — never the user-facing copy strings themselves
 * (PAIN_DECISION_COPY belongs to the check-in loop, not a chat answer), and never a book phrase or method name
 * (IP rule): FEL's own words, describing FEL's own rule.
 */
export const PAIN_SAFETY_RULES = [
  "If the athlete describes an acute event — a pop, sudden swelling, a joint giving way, or pain after a fall or impact — tell them to stop that exercise and see a clinician before training it again. Do not suggest working around it, and do not guess what caused it.",
  "If the athlete has told you they are a minor (or you have reason to think they might be) and they mention any pain from training, tell them to stop and tell an adult first. Never point a minor toward a clinician as the first step — the first call is to an adult.",
  "For ordinary, non-acute soreness or mild pain, you may suggest easing up, an easier variation, or resting the area — but never a diagnosis, a condition name, or a promise that something is or isn't serious.",
  "You never say a movement 'reduces injury risk' or 'prevents injury' — at most, that consistent practice 'builds capacity'. Never invent a percentage, a study, or a guarantee.",
  "For anything beyond ordinary soreness, or anything the athlete seems worried about, point them at the app's own pain check-in (logged after an exercise, or the next morning) rather than talking them through it yourself — that flow, not this chat, is what decides whether to flag their coach.",
].join('\n- ');

/**
 * MIRROR-COACH P5 FIX (2026-09-29, code review): rule 2 above ("if the athlete has told you they are a minor…")
 * used to be the ONLY mechanism grounding the minor-safety rule — nothing told the model the fact the server
 * already knows (User.dobYear via lib/mirror/youth.ts isMinorForMirror, the same source painRule.ts and
 * guardianGate.ts both read), so a known-minor account that never mentions their age in conversation left the model
 * guessing. This line states the server's own answer explicitly, so rule 2 is grounded in fact, not inference — and
 * still tells the model to believe the athlete if they say otherwise, since a chat can learn something the account
 * record does not (a shared/family account, a birth year entered wrong).
 */
function ageGroundingLine(isMinor: boolean): string {
  return isMinor
    ? 'This athlete IS a minor on file (under 18, or no birth year given — the conservative default). Apply rule 2 to them whether or not they say so themselves in this conversation.'
    : 'This athlete is not on file as a minor. If they tell you otherwise during the conversation, believe them and apply rule 2 from that point on.';
}

/**
 * Appends the pain-safety rules and FEL's disclosure to a base system prompt. Idempotent: calling it twice on its
 * own output does not double the addendum (a persona-swap or a retry should never risk sending two copies of the
 * same safety text to the model).
 *
 * `isMinor` should be lib/mirror/youth.ts isMinorForMirror(User.dobYear) — the same ground truth painRule.ts and
 * guardianGate.ts already use — so the chat's minor-safety rule rests on the same fact the rest of the app does,
 * not on whatever the athlete happens to volunteer. Optional and defaulted to `false` only so existing callers (and
 * this file's own idempotency check, which must not care) keep compiling; a caller that knows the athlete's account
 * should always pass it.
 */
export function withPainSafety(basePrompt: string, opts: { isMinor?: boolean } = {}): string {
  if (basePrompt.includes(AI_COACH_DISCLOSURE)) return basePrompt;
  return `${basePrompt}\n\n${AI_COACH_DISCLOSURE}\n\nPAIN AND SAFETY (always in force, whatever persona or catalogue text precedes this):\n- ${PAIN_SAFETY_RULES}\n- ${ageGroundingLine(opts.isMinor === true)}`;
}
