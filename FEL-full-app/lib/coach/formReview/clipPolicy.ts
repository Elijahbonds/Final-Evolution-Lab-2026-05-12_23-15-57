// lib/coach/formReview/clipPolicy.ts — COACH-VIDEO-REVIEW (2026-10-24): the optional video clip, and why it is off.
//
// The brief allows ONE optional extra: the actual clip of the flagged rep(s) only, when an ADULT client opts in for that
// one submission. Minors never upload video. This file is that rule, so it is decided in one place and tested, but the
// clip does not ship in this lane: CLIP_UPLOADS_LIVE is false and no route accepts a clip (./payload.ts refuses any
// field outside the pose shape). Why, in short (the full design is docs/COACH-VIDEO-REVIEW.md §5, an owner call):
//   · the only private clip storage is coach-store's (lib/coach-store/storage.ts, bucket COACH_REVIEWS_BUCKET): its
//     object names are locked to `coach-reviews/{originals,replies}/<bookingId>/…` by assertObjectName, its consent is
//     a Booking's columns (clipConsentAt, consentTextVersion), and its 30-day delete clock is set on delivery of a paid
//     review. A coach-thread review has no booking, so reuse means a new prefix in another lane's security check, a
//     new lifecycle rule on the bucket (an owner action), a consent text and a table: not a clean reuse;
//   · on the phone, cutting a rep out of a recording needs the clip to be recorded alongside the pose, which the Mirror
//     has never done (Form Check: "the owner's choice is no video upload").
//
// Pure.

import type { RepFlag } from './score';
import type { RepWindow } from './reader';

/** Owner call: the clip's storage, consent text and retention are not built (docs/COACH-VIDEO-REVIEW.md §5). */
export const CLIP_UPLOADS_LIVE = false;
/** The proposed design's limits, for the doc and the windows below. TUNE(elijah) (new, unused while the clip is off) */
export const CLIP_MAX_REPS = 3;
export const CLIP_PAD_MS = 500;
export const CLIP_MAX_SECONDS = 15;

export type ClipRefusal = 'minor' | 'not_opted_in' | 'nothing_flagged' | 'not_available';
export type ClipDecision = { allowed: true } | { allowed: false; reason: ClipRefusal };

/**
 * May this ONE submission carry a clip? Minors first and always no — a guardian's consent does not change it. An adult
 * only with a tick for this submission, only when something was flagged, and only once the storage exists.
 */
export function clipDecision(input: { band: 'adult' | 'teen' | null; optedInThisSubmission: boolean; flags: readonly RepFlag[] }, live: boolean = CLIP_UPLOADS_LIVE): ClipDecision {
  if (input.band !== 'adult') return { allowed: false, reason: 'minor' };
  if (!input.optedInThisSubmission) return { allowed: false, reason: 'not_opted_in' };
  if (!input.flags.length) return { allowed: false, reason: 'nothing_flagged' };
  if (!live) return { allowed: false, reason: 'not_available' };
  return { allowed: true };
}

/** The one line the client reads about video, on every set. */
export const VIDEO_STAYS_LINE = 'Your video stays on your phone. Your coach gets the rep data and a skeleton replay.';

/**
 * The time windows a clip would cover: the flagged reps only (worst first, at most CLIP_MAX_REPS), each padded by
 * CLIP_PAD_MS, merged where they touch, and cut off at CLIP_MAX_SECONDS in total. For the design; nothing calls it to cut
 * video while CLIP_UPLOADS_LIVE is false.
 */
export function clipWindows(reps: readonly Pick<RepWindow, 'n' | 'startMs' | 'endMs'>[], flags: readonly RepFlag[]): { startMs: number; endMs: number }[] {
  const wanted = flags.slice(0, CLIP_MAX_REPS).map((f) => reps.find((r) => r.n === f.rep)).filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ startMs: Math.max(0, r.startMs - CLIP_PAD_MS), endMs: r.endMs + CLIP_PAD_MS }))
    .sort((a, b) => a.startMs - b.startMs);
  const merged: { startMs: number; endMs: number }[] = [];
  for (const w of wanted) {
    const last = merged[merged.length - 1];
    if (last && w.startMs <= last.endMs) last.endMs = Math.max(last.endMs, w.endMs);
    else merged.push({ ...w });
  }
  let left = CLIP_MAX_SECONDS * 1000;
  const out: { startMs: number; endMs: number }[] = [];
  for (const w of merged) {
    if (left <= 0) break;
    const len = Math.min(w.endMs - w.startMs, left);
    out.push({ startMs: w.startMs, endMs: w.startMs + len });
    left -= len;
  }
  return out;
}
