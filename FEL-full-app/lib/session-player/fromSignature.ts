// lib/session-player/fromSignature.ts — PLAT-P01 (2026-10-27): the first adapter. A signature program's session as
// served today (lib/signature/serve.ts ServedSession: today's gates already applied — youth, pain, the jump gate, the
// readiness ease) → the player's Session. The ONLY file under lib/session-player/ that imports lib/signature/**
// (tests/session-player/engine-scan.test.ts holds that line), and it imports types only.
//
// Words: every word is the source's — the exercise names, set-ups and cues as served (cue-rewrite owns the cues), and the
// two day lines the program page already shows for a swapped or eased item ("In place of … today.", "Eased today: ….").
// Held items (a youth or pain hold) are not in `items`, so the player never runs them.
//
// Pure. Client-safe.
import type { ServedSession } from '@/lib/signature/serve';
import type { ProgramView } from '@/lib/signature/view';
import type { SignatureProgram } from '@/lib/signature/types';
import type { Session, Step } from './model';

export function fromSignature(s: ServedSession, o: { title: string; clips: Readonly<Record<string, string | null>> }): Session {
  const steps: Step[] = s.items.map((it) => ({
    exId: it.ex,
    name: it.name,
    sets: Math.max(1, it.sets),
    reps: it.reps || null,
    workSeconds: it.workSeconds,
    restSeconds: Math.max(0, it.restSeconds),
    setup: it.setup,
    cue: it.cue,
    clip: o.clips[it.ex] ?? null,
    ...(it.swappedFrom ? { note: `In place of ${it.swappedFrom} today.` } : it.eased ? { note: `Eased today: ${it.eased}.` } : {}),
  }));
  return { id: s.id, title: o.title, steps };
}

/** Every library id a program can serve (its items and their calm step-downs): the page maps them to loops once. */
export function signatureExerciseIds(p: Pick<SignatureProgram, 'phases'>): string[] {
  return [...new Set(p.phases.flatMap((ph) => ph.sessions.flatMap((s) => s.items.flatMap((i) => [i.ex, ...(i.down ? [i.down] : [])]))))];
}

/**
 * What Start does on a program page:
 *   'save'    — an approved program, an adult: the finish posts the existing `done` action (and Start enrolls first when
 *               the athlete has not started the program yet: `enroll`);
 *   'device'  — an approved program under youth rules: the done mark stays on this phone (deviceProgress), nothing is sent;
 *   'preview' — a draft (only the admin can see one, lib/signature/access.ts canSee): the player runs end to end and
 *               saves nothing, so the owner can feel a program before approving it;
 *   null      — nothing to play: no session today, a red flag (blocked), or a week behind FEL Pro.
 */
export type PlayMode = 'save' | 'device' | 'preview';

export function playMode(view: Pick<ProgramView, 'status' | 'draft' | 'keep' | 'premium' | 'enrolled' | 'canStart'>, today: Pick<ServedSession, 'blocked' | 'items'> | null): { mode: PlayMode; enroll: boolean } | null {
  if (!today || today.blocked || !today.items.length || view.premium.locked) return null;
  if (view.draft || view.status !== 'approved') return { mode: 'preview', enroll: false };
  if (view.keep === 'device') return { mode: 'device', enroll: false };
  if (view.keep === 'server' && (view.enrolled || view.canStart)) return { mode: 'save', enroll: !view.enrolled };
  return null;
}
