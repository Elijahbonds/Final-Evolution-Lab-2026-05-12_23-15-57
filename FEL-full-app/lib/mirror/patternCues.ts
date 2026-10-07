// patternCues — a Mirror pattern's own cue table, for its own coach (MIRROR-MOVES P2, 2026-10-07; plan Phase 2, "every
// live movement talks").
//
// The coach's engine (lib/babylon/nexus/neuro-mirror/rules/cue-engine.ts CueEngine) spoke only the squat's and the
// press/row's faults: its cards were one fixed table. The lunge, the hip hinge and the push-up each had a written,
// linted cue table (lungeAudit.ts LUNGE_CUES, hingeAudit.ts HINGE_CUES, pushupAudit.ts PUSHUP_CUES — the CueRule shape in
// patterns.ts, "reused here so a pattern's cue table can be handed straight to that engine once a phase wires the coach
// into these patterns") and nothing that said them. This turns one of those tables into the engine's CueTable, in the
// coaching order the pattern's live stage gives, so each pattern gets its own engine — the same discipline the harness
// already keeps for the squat and the press/row (one engine per pattern: a fault one set could never show must not step
// another pattern's faded schedule).
//
// Pure data in, data out. A fault in the order with no card is a bug, not a silence: it throws.
import type { CueCard, CueTable } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import type { CueRule } from './patterns';

export function cueTableFor<F extends string>(rules: readonly CueRule[], priority: readonly F[]): CueTable<F> {
  const cards = {} as Record<F, CueCard>;
  for (const f of priority) {
    const r = rules.find((x) => x.faultId === f);
    if (!r) throw new Error(`[patternCues] no cue card for ${f}`);
    cards[f] = { cue: r.cue, escalate: r.escalate, regress: r.regress, ...(r.reply ? { reply: r.reply } : {}) };
  }
  return { priority, cards };
}
