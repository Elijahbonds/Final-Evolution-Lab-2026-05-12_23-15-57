// lib/coach/automations/rules.ts — COACH-DELIVERY COA-01 (2026-10-26): coach automations, the pure half.
//
// THREE TRIGGERS, each posting a preset or the coach's own words into the athlete's EXISTING program thread (the same
// ProgramMessage a coach types; never an email, never a new thread):
//   · join   — once, when an athlete joins the coach's roster (their CoachClient link is under JOIN_WINDOW_DAYS old and a
//              program thread exists). Once ever per automation × athlete.
//   · missed — when the athlete has missed `missedN` or more planned sessions in the last 7 days, read by the compliance
//              alerts' own rule (lib/coach/alerts.ts missedFactsFor / missedThisWeek: the active programs' plan against
//              completed sessions, programs under a week old skipped, off days never "missed"). At most once in 7 days.
//   · weekly — on the coach's weekday, at or after the coach's hour, on the PT clock (the app's day: lib/groups/week.ts).
//              Once that day.
// Dedupe is a unique row per automation × athlete × PT day (CoachAutomationRun), claimed BEFORE the message is posted, so two
// sweeps at once post once. The run row is also the audit: what was posted, to whom, when — or that a teen was skipped.
//
// Pure: no Prisma, no clock of its own.
import { MISSED_ALERT_MIN, missedThisWeek, type MissedFacts } from '../alerts';
import { addDays } from '@/lib/groups/week';

export const TRIGGERS = ['join', 'missed', 'weekly'] as const;
export type Trigger = (typeof TRIGGERS)[number];
export type AutoScope = 'roster' | 'athlete' | 'team';

/** (new) A join automation reaches an athlete whose roster link is at most this old: a coach who adds one later does not
 *  greet the whole existing roster. */
export const JOIN_WINDOW_DAYS = 7;
/** (new) A missed-sessions message at most once in this many days per athlete (the window it measures). */
export const MISSED_COOLDOWN_DAYS = 7;
export const LIMITS = { text: 500, perCoach: 20 } as const;

/**
 * DRAFT COPY (owner review): the presets. {first} is the athlete's first name. Training words only: nothing about pain,
 * health or the body, so a preset is the same for an adult and a consented teen.
 */
export const PRESETS: Record<Trigger, readonly { id: string; label: string; text: string }[]> = {
  join: [
    { id: 'welcome', label: 'Welcome', text: "Welcome aboard, {first}! Your sessions are on Today. Message me here any time — questions about an exercise, your week, anything." },
    { id: 'welcome_short', label: 'Short welcome', text: 'Glad to have you, {first}. Start with the first session on Today and tell me how it went.' },
  ],
  missed: [
    { id: 'check_in', label: 'Check in', text: "Hey {first}, a couple of sessions slipped this week. All good? Reply here and we'll fit the plan to your week." },
    { id: 'nudge', label: 'Gentle nudge', text: "{first}, your next session is waiting on Today. Even a short one keeps the week moving — let me know if the plan needs to change." },
  ],
  weekly: [
    { id: 'new_week', label: 'New week', text: 'New week, {first}. Your sessions are on Today. How did last week feel?' },
    { id: 'weekly_review', label: 'Weekly review', text: "{first}, quick check-in: what went well this week, and what felt hard? I'll use it for next week's plan." },
  ],
};

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface CleanAutomation {
  trigger: Trigger;
  scope: AutoScope;
  scopeId: string | null;
  missedN: number | null;
  weekday: number | null;
  hour: number | null;
  preset: string | null;
  text: string | null;
}

export type AutomationError = 'trigger' | 'scope' | 'missed_n' | 'weekday' | 'hour' | 'message_required' | 'preset' | 'text_too_long';

const intIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** What a coach typed → an automation, or why not. The scope's ownership is the server's check (mayAssign). */
export function cleanAutomation(body: unknown): { ok: true; a: CleanAutomation } | { ok: false; error: AutomationError } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!TRIGGERS.includes(b.trigger as Trigger)) return { ok: false, error: 'trigger' };
  const trigger = b.trigger as Trigger;
  const scope = (b.scope ?? 'roster') as AutoScope;
  if (scope !== 'roster' && scope !== 'athlete' && scope !== 'team') return { ok: false, error: 'scope' };
  const scopeId = scope === 'roster' ? null : typeof b.scopeId === 'string' && b.scopeId && b.scopeId.length <= 64 ? b.scopeId : null;
  if (scope !== 'roster' && !scopeId) return { ok: false, error: 'scope' };
  let missedN: number | null = null, weekday: number | null = null, hour: number | null = null;
  if (trigger === 'missed') {
    missedN = b.missedN === undefined ? MISSED_ALERT_MIN : intIn(b.missedN, 1, 7);
    if (missedN === null) return { ok: false, error: 'missed_n' };
  }
  if (trigger === 'weekly') {
    weekday = intIn(b.weekday, 0, 6);
    if (weekday === null) return { ok: false, error: 'weekday' };
    hour = b.hour === undefined ? 9 : intIn(b.hour, 0, 23);
    if (hour === null) return { ok: false, error: 'hour' };
  }
  const raw = typeof b.text === 'string' ? b.text.replace(/\s+\n/g, '\n').trim() : '';
  if (raw.length > LIMITS.text) return { ok: false, error: 'text_too_long' };
  const text = raw || null;
  const preset = text ? null : typeof b.preset === 'string' ? b.preset : null;
  if (!text && !preset) return { ok: false, error: 'message_required' };
  if (preset && !PRESETS[trigger].some((p) => p.id === preset)) return { ok: false, error: 'preset' };
  return { ok: true, a: { trigger, scope, scopeId, missedN, weekday, hour, preset, text } };
}

/** The message an automation posts to one athlete: the coach's text or the preset, with {first} filled in. */
export function renderMessage(a: Pick<CleanAutomation, 'trigger' | 'preset' | 'text'>, athleteName: string): string {
  const first = (athleteName.trim().split(/\s+/)[0] || 'there').slice(0, 40);
  const base = a.text ?? PRESETS[a.trigger].find((p) => p.id === a.preset)?.text ?? PRESETS[a.trigger][0].text;
  return base.replace(/\{first\}/g, first).slice(0, 2000);
}

/** The PT weekday (0 Sunday) and hour of an instant: the app's clock (lib/groups/week.ts, the wallet's day). */
export function ptWeekdayHour(at: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), hour };
}

export interface DueFacts {
  /** Today, PT 'YYYY-MM-DD'. */
  today: string;
  now: Date;
  /** When the athlete's live roster link was made. */
  joinedAt: Date | null;
  missed: MissedFacts | null;
  /** The PT days this automation already has a run row for this athlete (any outcome), newest first. */
  ranDays: readonly string[];
}

/** Does this automation fire for this athlete now? */
export function isDue(a: Pick<CleanAutomation, 'trigger' | 'missedN' | 'weekday' | 'hour'>, f: DueFacts): boolean {
  if (f.ranDays.includes(f.today)) return false;
  switch (a.trigger) {
    case 'join':
      return !f.ranDays.length && !!f.joinedAt && f.now.getTime() - f.joinedAt.getTime() <= JOIN_WINDOW_DAYS * 86_400_000;
    case 'missed': {
      if (!f.missed || missedThisWeek(f.missed) < (a.missedN ?? MISSED_ALERT_MIN)) return false;
      const since = addDays(f.today, -(MISSED_COOLDOWN_DAYS - 1));
      return !f.ranDays.some((d) => d >= since);
    }
    case 'weekly': {
      const { weekday, hour } = ptWeekdayHour(f.now);
      return weekday === a.weekday && hour >= (a.hour ?? 0);
    }
  }
}

/** One line for the coach's list: "When someone joins", "After 2 missed sessions in 7 days", "Mondays at 9:00 (PT)". */
export function triggerLine(a: Pick<CleanAutomation, 'trigger' | 'missedN' | 'weekday' | 'hour'>): string {
  if (a.trigger === 'join') return 'When an athlete joins your roster';
  if (a.trigger === 'missed') return `After ${a.missedN ?? MISSED_ALERT_MIN} missed session${(a.missedN ?? MISSED_ALERT_MIN) === 1 ? '' : 's'} in 7 days (at most once a week)`;
  return `${WEEKDAY_LABELS[a.weekday ?? 1]}s at ${String(a.hour ?? 9).padStart(2, '0')}:00 (Pacific)`;
}

export const OUTCOME_LINE: Record<string, string> = {
  posted: 'posted to the thread',
  skipped_teen: 'skipped: needs a guardian\'s coach-training consent',
  posting: 'posting',
  failed: 'could not post; it will not retry today',
};
