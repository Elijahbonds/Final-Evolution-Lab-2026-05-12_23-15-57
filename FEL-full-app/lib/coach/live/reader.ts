// lib/coach/live/reader.ts — COACH-LIVE (2026-10-25): the live set's rep counter and form flags, on the client's phone.
//
// The per-movement set reader is lane/coach-video-review's lib/coach/formReview/reader.ts (PR #438, merged): one
// reader for filmed sets and live sets, so a rep the coach sees live is graded exactly as one sent for review. This
// file keeps the live names (LiveRep ≡ RepWindow, LiveReader ≡ SetReader, createLiveReader ≡ createSetReader). It runs
// on the CLIENT's phone at the camera's full rate; nothing graded here is new.
export {
  createSetReader as createLiveReader, kneeSide, MAX_SET_REPS, LUNGE_REP_ARM_DEPTH, LUNGE_REP_END_DEPTH, KNEE_SIDE_SHARE,
  SIDE_REP_LEAD_MS, type RepWindow as LiveRep, type SetReader as LiveReader,
} from '@/lib/coach/formReview/reader';
