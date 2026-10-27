// Every notification and reminder email FEL sends, from fixed text (offline-push, round 8). Pure.
//
// Nothing a person typed ever goes into one: not a coach's message, not a name, not a plan's contents — a lock screen is
// not private, and a push service sees the size and timing even of an encrypted message. A notification says what
// happened and opens the page where it is. Only the kinds in lib/push/policy.ts exist; there is no marketing copy here.
import { DAILY_DRILL_PATH } from '@/lib/daily-drill/copy';
import type { PushKind } from './policy';

export interface PushMessage { kind: PushKind; title: string; body: string; url: string; tag: string }

export type MessageContext =
  | { kind: 'coach_message'; toCoach: boolean }
  | { kind: 'plan_update' }
  | { kind: 'today'; program: true }
  | { kind: 'today'; program: false; streakDays: number }
  | { kind: 'coach_alerts'; athletes: number };

export function messageFor(ctx: MessageContext): PushMessage {
  switch (ctx.kind) {
    case 'coach_message':
      return ctx.toCoach
        ? { kind: ctx.kind, title: 'An athlete sent you a message', body: 'Open FEL to read it.', url: '/coach', tag: 'coach_message' }
        : { kind: ctx.kind, title: 'Your coach sent a message', body: 'Open FEL to read it.', url: '/coach', tag: 'coach_message' };
    case 'plan_update':
      return { kind: ctx.kind, title: 'Your coach updated your plan', body: 'See what changed before your next session.', url: '/coach', tag: 'plan_update' };
    case 'today':
      if (ctx.program) return { kind: ctx.kind, title: "Today's session is ready", body: "Your coach's plan for today is waiting.", url: '/coach', tag: 'today' };
      return {
        kind: ctx.kind, title: "Today's drill is ready",
        body: ctx.streakDays > 0 ? `Keep your ${ctx.streakDays}-day streak going.` : 'A few calm minutes, then the drill.',
        url: DAILY_DRILL_PATH, tag: 'today',
      };
    case 'coach_alerts': {
      const n = Math.max(1, Math.floor(ctx.athletes));
      return { kind: ctx.kind, title: `${n} athlete${n === 1 ? '' : 's'} missed planned sessions`, body: 'Open your board to check in.', url: '/coach', tag: 'coach_alerts' };
    }
  }
}

/** The same message as a reminder email (subject and plain text), with the link made absolute when the site is known. */
export function emailFor(m: PushMessage, origin: string | null): { subject: string; text: string } {
  const link = origin ? `${origin}${m.url}` : null;
  return {
    subject: `FEL: ${m.title}`,
    text: [m.body, ...(link ? ['', link] : []), '', 'You get this because you turned on email reminders in your FEL account settings. Turn them off there at any time.'].join('\n'),
  };
}
