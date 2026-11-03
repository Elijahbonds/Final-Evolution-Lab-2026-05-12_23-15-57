// lib/teach/role.ts — EDU-01 (platform phase 10, 2026-11-03): who is a teacher, and who may author and sell.
//
// The owner, 2026-10-20: "One teacher role granted by owner approval (Camp-certified qualify automatically)". So a person
// is a TEACHER when
//   · the owner approved their application (a TeacherRole row, not revoked: lib/teach/store.ts), or
//   · they are a Camp-certified facilitator (FacilitatorProfile.certificationStatus 'certified', which the Camp keeps
//     current: a revoke flips it back).
// The role REPLACES COACH_STORE_COACH_USER_IDS as the way into the coach store and course authoring; the env list stays a
// FALLBACK until the owner removes it (lib/coach-store/coaches.ts), so the owner's own store works the day this lands,
// before the teacher SQL is applied. Both paths are tested (role.test.ts).
//
// The badge (/c/<code>) shows the role only: never for an applicant, never for an env-listed account that is not a teacher.
//
// Pure: the reads come in as deps.
import { isAllowlistedCoach } from '@/lib/coach-store/coaches';

export interface RoleDeps {
  /** The owner-granted row (lib/teach/store.ts hasTeacherRow). */
  teacherRow(userId: string): Promise<boolean>;
  /** A Camp-certified facilitator. */
  campCertified(userId: string): Promise<boolean>;
  env?: NodeJS.ProcessEnv;
}

export type TeacherSource = 'owner' | 'camp' | null;

/** How a person holds the teacher role, or null. Never throws (a failed read is "no"). */
export async function teacherSource(userId: string | null | undefined, deps: RoleDeps): Promise<TeacherSource> {
  if (!userId) return null;
  const [row, camp] = await Promise.all([deps.teacherRow(userId).catch(() => false), deps.campCertified(userId).catch(() => false)]);
  return row ? 'owner' : camp ? 'camp' : null;
}

export async function isTeacher(userId: string | null | undefined, deps: RoleDeps): Promise<boolean> {
  return (await teacherSource(userId, deps)) !== null;
}

/** May author courses: a teacher, or (the fallback) an account on COACH_STORE_COACH_USER_IDS. */
export async function canAuthor(userId: string | null | undefined, deps: RoleDeps): Promise<boolean> {
  if (!userId) return false;
  return isAllowlistedCoach(userId, deps.env) || isTeacher(userId, deps);
}

/** May sell in the coach store: the env list (the fallback, checked first: no database read) or the teacher role. */
export async function isStoreCoachWith(userId: string | null | undefined, deps: RoleDeps): Promise<boolean> {
  if (!userId) return false;
  return isAllowlistedCoach(userId, deps.env) || isTeacher(userId, deps);
}
