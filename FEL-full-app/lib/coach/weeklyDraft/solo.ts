// lib/coach/weeklyDraft/solo.ts — COACH-AI-DRAFT (2026-10-24): the same engine for a SOLO athlete (no human coach),
// with safe limits applied automatically. OFF, AND NOT WIRED TO ANY SURFACE: an owner call.
//
// Owner decision 2026-10-24: "the AI drafts and the coach approves. Solo users get the AI with safe limits." The brief:
// keep it behind a flag, off, unless an existing "AI coach" surface makes it natural. None does today — the AI Coach tab
// is a chat (app/api/coach/chat, kill-switched and adults-only), not a program, and a solo player's plan (/workout,
// lib/workout) is not a CoachingProgram the drafts can write to. So this is the rule, tested, and nothing calls it;
// docs/COACH-AI-DRAFT.md lists what wiring it would take.
//
// THE SAFE LIMITS. With no coach to judge a "review" change, a solo draft keeps:
//   · every SAFE change (eases, regressions, Prep correctives, the ease-off and its "see a professional");
//   · at most ONE progression a week, and only a VOLUME one (one more set) — never load, RPE, band or a harder swap;
//   · adults only (a teen has no solo coached training at all: the teen gate is a coach's roster).
// The athlete approves each change themselves; nothing applies on its own.

import { readOp, type SafetyContext } from './safety';
import type { ClientDraft, DraftCatalogueRow } from './types';

/** ON only for the exact string 'true' (the kill switch's rule). Unset today. Server-side env, never NEXT_PUBLIC. */
export function soloDraftsEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.COACH_SOLO_DRAFTS_ENABLED === 'true';
}

export const SOLO_HELD_WHY = 'Without a coach, a draft moves one thing up a week, by one set at most.';

/** A coach's draft with the solo limits applied (see the header). A teen's draft comes back empty. */
export function soloLimits(draft: ClientDraft, catalogue: readonly DraftCatalogueRow[]): ClientDraft {
  if (draft.band !== 'adult') return { ...draft, changes: [], status: 'skipped', skipReason: 'Solo drafts are for adults.' };
  const ctx: Pick<SafetyContext, 'youth' | 'catalogue'> = { youth: false, catalogue: new Map(catalogue.map((r) => [r.id, r])) };
  const held = [...draft.held];
  let progressed = false;
  const changes = draft.changes.filter((c) => {
    if (c.safety === 'safe') return true;
    const reads = c.ops.map((op) => readOp(op, ctx));
    const volumeOnly = reads.every((r) => !r.intensityUp) && c.ops.every((op) => op.action === 'update' && op.after.sets - op.before.sets <= 1);
    if (!progressed && volumeOnly) { progressed = true; return true; }
    held.push({ title: c.title, why: SOLO_HELD_WHY });
    return false;
  });
  return { ...draft, changes, held };
}
