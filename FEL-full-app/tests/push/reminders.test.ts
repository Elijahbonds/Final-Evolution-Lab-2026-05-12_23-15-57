// The daily reminders (lib/push/reminders.ts, OFF-04): who is reminded of what, the coach board's missed-session rule,
// the job's own guard, and a whole run against the stand-in store.
import { createECDH } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { b64u, newVapidKeyPair } from '@/lib/push/crypto';
import { pushConfig } from '@/lib/push/config';
import { DONE_WINDOW_MS, missedAthletes, runReminders, todayReminder, verifyRemindersSecret, type ReminderReads } from '@/lib/push/reminders';
import type { NotifyDeps } from '@/lib/push/send';
import { resetPushProbe } from '@/lib/push/store';
import { fakePushDb } from '../helpers/fakePushDb';

const NOW = Date.UTC(2026, 9, 26, 17);
const DAY = 86_400_000;
const Y = new Date(NOW).getFullYear();

describe('todayReminder', () => {
  it('a coached athlete who has not completed a session today hears about the session; one who has, nothing', () => {
    expect(todayReminder({ activeProgram: true, completedRecently: false, lastPlayedMs: NOW, streakDays: 3 }, NOW)).toEqual({ kind: 'today', program: true });
    expect(todayReminder({ activeProgram: true, completedRecently: true, lastPlayedMs: null, streakDays: 0 }, NOW)).toBeNull();
  });
  it('anyone else who has not played today hears about the drill, with their streak', () => {
    expect(todayReminder({ activeProgram: false, completedRecently: false, lastPlayedMs: NOW - DONE_WINDOW_MS - 1, streakDays: 6 }, NOW)).toEqual({ kind: 'today', program: false, streakDays: 6 });
    expect(todayReminder({ activeProgram: false, completedRecently: false, lastPlayedMs: NOW - 3600_000, streakDays: 6 }, NOW)).toBeNull();
    expect(todayReminder({ activeProgram: false, completedRecently: false, lastPlayedMs: null, streakDays: 0 }, NOW)).toEqual({ kind: 'today', program: false, streakDays: 0 });
  });
});

describe('missedAthletes: the coach board\'s rule (2 missed in 7 days, program at least a week old)', () => {
  const plan = (clientId: string, ageDays: number) => ({ clientId, startMs: NOW - ageDays * DAY, durationWeeks: 4, trainingSessions: 12 });   // 3 a week
  it('counts athletes, not sessions', () => {
    const done = [{ clientId: 'b', completedAtMs: NOW - DAY }, { clientId: 'b', completedAtMs: NOW - 2 * DAY }, { clientId: 'b', completedAtMs: NOW - 3 * DAY }];
    expect(missedAthletes([plan('a', 14), plan('b', 14), plan('c', 14)], done, NOW)).toBe(2);   // a and c did 0 of 3
    expect(missedAthletes([plan('a', 3)], [], NOW)).toBe(0);   // too new to judge
    expect(missedAthletes([], [], NOW)).toBe(0);
  });
});

describe('the job\'s guard', () => {
  it('is a constant-time match of a configured secret', () => {
    expect(verifyRemindersSecret('s3cret', 's3cret')).toBe(true);
    expect(verifyRemindersSecret('s3cre', 's3cret')).toBe(false);
    expect(verifyRemindersSecret('', 's3cret')).toBe(false);
    expect(verifyRemindersSecret(null, 's3cret')).toBe(false);
    expect(verifyRemindersSecret('anything', undefined)).toBe(false);
  });
});

describe('a run', () => {
  const pair = newVapidKeyPair();
  const config = pushConfig({ PUSH_ENABLED: 'true', VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey, VAPID_SUBJECT: 'mailto:ops@fel.example' } as NodeJS.ProcessEnv);
  function setup() {
    resetPushProbe();
    const db = fakePushDb({ now: NOW, users: [
      { id: 'athlete', dobYear: Y - 25 }, { id: 'player', dobYear: Y - 35 }, { id: 'teen', dobYear: Y - 14 }, { id: 'coach', dobYear: Y - 45, coach: true }, { id: 'done', dobYear: Y - 30 },
    ] });
    for (const [id, kinds] of [['athlete', ['today']], ['player', ['today']], ['teen', ['today']], ['coach', ['coach_alerts', 'coach_message']], ['done', ['today']], ['quiet', ['coach_message']]] as const) {
      db.prefs.set(id, { kinds: [...kinds], email: false, updatedAt: NOW });
      const e = createECDH('prime256v1'); e.generateKeys();
      db.devices.push({ id: `d-${id}`, userId: id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: b64u.encode(e.getPublicKey()), auth: b64u.encode(Buffer.alloc(16, 1)), createdAt: 0, failures: 0, lastSuccessAt: null });
    }
    const sentTo: string[] = [];
    const deps: NotifyDeps = {
      db, config, emailOn: false, origin: null, now: NOW,
      fetch: async (url) => { sentTo.push(url.split('/').pop()!); return new Response(null, { status: 201 }); },
      dobYear: async (id) => db.users.find((u) => u.id === id)?.dobYear ?? null,
      emailOf: async () => null, sendMail: async () => 'off',
    };
    const reads: ReminderReads = {
      todayFacts: async (id) => ({ activeProgram: id === 'athlete' || id === 'done', completedRecently: id === 'done', lastPlayedMs: null, streakDays: 2 }),
      coachFacts: async () => ({ plans: [{ clientId: 'a', startMs: NOW - 20 * DAY, durationWeeks: 4, trainingSessions: 12 }], completions: [] }),
    };
    return { db, deps, reads, sentTo };
  }

  it('reminds the opted-in adults who have something to do, never the teen, and counts only', async () => {
    const { deps, reads, sentTo, db } = setup();
    const s = await runReminders(deps, reads, NOW);
    expect(s).toEqual({ ok: true, state: 'ran', considered: 5, sent: 3, refused: 1, nothingToSay: 1 });
    expect(sentTo.sort()).toEqual(['athlete', 'coach', 'player']);
    expect(db.log.map((l) => `${l.userId}:${l.kind}`).sort()).toEqual(['athlete:today', 'coach:coach_alerts', 'player:today']);
    // the same day again: the spacing holds every one back
    const again = await runReminders(deps, reads, NOW + 3600_000);
    expect(again.sent).toBe(0);
  });

  it('off: push and email both off reads nothing', async () => {
    const { deps, reads, db } = setup();
    expect((await runReminders({ ...deps, config: { on: false, reason: 'flag_off' } }, reads, NOW)).state).toBe('off');
    expect(db.statements).toEqual([]);
  });
});
