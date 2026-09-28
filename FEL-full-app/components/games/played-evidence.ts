// QA A1-02 (shared client finish/session-post code — game-shell.tsx's `played`).
//
// Three DISCRETE-crossing counters — a window keydown/pointerdown/touchstart, sessionStore's harness record
// (EvidenceCounter, sessionStore.ts), and the agent bridge (AgentBridge.ts) — all undercount a CONTINUOUSLY-held
// stick or trigger: EvidenceCounter arms once per crossing above EVIDENCE_STICK_ON and stays disarmed until the
// stick drops back under EVIDENCE_STICK_OFF. A player who steers smoothly through a whole slalom run without ever
// snapping back to center, or plays a match mostly by holding one direction, can cross that threshold once and
// never again — no matter how long or how well they played. Measured on two different paths: hoops3v3 (agent-driven,
// AgentControlSource never reached InputBus at all) and Gate Crasher/snowboarding (real keyboard/pad input) both
// posted `played:false` on a finished, fully-played run.
//
// A fourth, mechanism-independent signal: the abuse case `played` exists to catch (FEATURES-UX-SHOP, 2026-09-08) is
// a mode left idle that "ends on its own clock" with a score-0 session. A run that posts a real, non-zero score or
// opponent score could not have come from doing nothing, regardless of how that mode's input happens to cross (or
// fail to cross) the discrete evidence thresholds. This is additive only — it never overrides the other three, and
// the server's own score checks (checkRunScore / modeScoreRules, app/api/sessions) still gate what actually gets
// paid — it only keeps a real, non-zero-score run from being posted as the empty-session case `played` was built
// to catch.
//
// QA A1-02 reference path (2026-09-28): dunk's finish (dunk-babylon.tsx, same GameShell/InputBus/TouchOverlay wiring
// as every other babylon host, off-limits to edit) already posted played:true under real pad input. Not a different
// code path — dunk's own play is discrete press-hold-RELEASE-repeat across separate attempts, so the SAME
// EvidenceCounter re-arms (drops under EVIDENCE_STICK_OFF / the trigger's threshold) between attempts and crosses
// it again on the next one — three-plus discrete crossings, easily. hoops3v3 and Gate Crasher's continuous
// steering never gives it that gap. isPlayedRun's fourth check exists for exactly the modes whose natural play
// doesn't look like dunk's.

/** The three discrete-crossing evidence counts GameShell already computes. */
export interface PlayEvidenceCounts {
  /** inputCount.current — window keydown/pointerdown/touchstart seen while this run was live. */
  windowEvents: number;
  /** countedSince(sessionStore.record(), runMark.current) — the harness's own record, every source (pad/body/key). */
  harnessEvidence: number;
  /** agentPlayEvidence() — act() calls that reached a real ControlSource this run (0 unless the agent bridge drove it). */
  agentEvidence: number;
}

/** Whether a finished run counts as PLAYED for the `/api/sessions` payload. */
export function isPlayedRun(
  res: { score?: number; opponentScore?: number } | null | undefined,
  counts: PlayEvidenceCounts,
): boolean {
  if (counts.windowEvents >= 3 || counts.harnessEvidence >= 3 || counts.agentEvidence >= 3) return true;
  return Number(res?.score ?? 0) > 0 || Number(res?.opponentScore ?? 0) > 0;
}
