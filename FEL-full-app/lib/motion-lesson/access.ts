// lib/motion-lesson/access.ts — EDU-05 phase B (2026-11-10): who sees the motion lesson PREVIEW (/teach/motion).
//
// Dark by default. The owner signs off the look before anyone else sees a motion lesson ("Motion lessons: YES, owner signs
// off the look", docs/OWNER-DECISIONS.md 2026-10-20), so the preview opens for
//   · the owner's roles (founder, admin: the approvers of /admin/review, lib/creator/creative-card-review.ts), and
//   · someone who may author courses (lib/teach/role.ts canAuthor: an approved teacher, a Camp-certified facilitator, or
//     the coach-store list) — the people a recorder will be for.
// Everyone else, signed in or not, gets "opens soon". No age rule is decided here: nothing is recorded, stored or sent by
// the preview, and the age gates stay where they are (the owner's workstream).
// Pure.
export interface MotionViewer { signedIn: boolean; admin: boolean; author: boolean }

export function canPreviewMotion(v: MotionViewer): boolean {
  return v.signedIn && (v.admin || v.author);
}
