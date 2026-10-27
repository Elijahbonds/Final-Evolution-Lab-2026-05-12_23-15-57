// Web push wired to the real database, mailbox and network (offline-push, round 8). Server only.
//
// The hooks the coach routes call are here, each one line at its call site: notifyCoachMessage (POST
// /api/coach/messages) and notifyPlanUpdate (the coach approving an AI-draft change). Both are best effort and BOUNDED:
// they wait at most HOOK_WAIT_MS for the send, never throw, and a slow or failing push service never slows or fails
// the coach's request beyond that.
import { prisma } from '@/lib/db';
import { mailLinkOrigin, mailReady, sendMail } from '@/lib/mail';
import { pushConfig } from './config';
import type { MessageContext } from './copy';
import { notify, type NotifyDeps, type NotifyResult } from './send';
import type { RawDb } from './store';

/** (new) The longest a coach's request waits on a notification. */
export const HOOK_WAIT_MS = 3000;

export function liveDeps(): NotifyDeps {
  return {
    db: prisma as unknown as RawDb,
    config: pushConfig(),
    emailOn: mailReady(),
    fetch: (url, init) => fetch(url, init),
    dobYear: async (userId) => (await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }))?.dobYear ?? null,
    emailOf: async (userId) => (await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? null,
    sendMail: async (to, m) => {
      const r = await sendMail({ to, subject: m.subject, text: m.text });
      return r.status === 'sent' ? 'sent' : r.status === 'disabled' ? 'off' : 'failed';
    },
    origin: mailLinkOrigin(),
  };
}

/** notify(), never throwing, never waiting past HOOK_WAIT_MS. */
export async function notifyBounded(userId: string, ctx: MessageContext, deps: NotifyDeps = liveDeps(), waitMs = HOOK_WAIT_MS): Promise<NotifyResult | 'timeout' | 'error'> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      notify(userId, ctx, deps).catch(() => 'error' as const),
      new Promise<'timeout'>((done) => { timer = setTimeout(() => done('timeout'), waitMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/** A message in a coach ↔ athlete thread: the OTHER side hears about it (not its words). */
export async function notifyCoachMessage(program: { coachId: string; clientId: string }, authorId: string, deps?: NotifyDeps): Promise<void> {
  const toCoach = authorId !== program.coachId;
  const recipient = toCoach ? program.coachId : program.clientId;
  if (!recipient || recipient === authorId) return;
  await notifyBounded(recipient, { kind: 'coach_message', toCoach }, deps);
}

/** A coach approved a change to an athlete's plan (lib/coach/weeklyDraft): the athlete hears that it changed. */
export async function notifyPlanUpdate(draftId: string, written: number, deps?: NotifyDeps): Promise<void> {
  if (!(written > 0) || typeof draftId !== 'string' || !draftId) return;
  const d = deps ?? liveDeps();
  if (!d.config.on) return;   // push off: not even the lookup (a plan update is never an email)
  try {
    const rows = await d.db.$queryRawUnsafe<{ clientId: string }[]>(`SELECT "clientId" FROM "CoachProgramDraft" WHERE "id" = $1`, draftId);
    const clientId = rows[0]?.clientId;
    if (clientId) await notifyBounded(clientId, { kind: 'plan_update' }, d);
  } catch { /* no draft table yet, or no such draft: nothing to say */ }
}
