// EVERY-SCREEN P5: group training and 1:1s on the LIT rig (every file in prisma/pending/ applied), so phase 5's booking
// jobs can be walked as they will be once the owner applies the group-booking SQL. Production stays "Opens soon" until
// then: nothing here changes what production shows, and nothing is written anywhere but the local LIT database.
//
// What it puts there, through the real coach API where there is one:
//   · the business owner is the rig's coach (GROUP_BOOKING_OWNER_ID is set on the LIT server by jobs.mts --lit);
//   · one group at 24 Hour Fitness Victory, 7 pm, on the day pair that meets today (Los Angeles), from this week
//     (POST /api/group-booking/coach create_group);
//   · the coach's in-person hours for a 1:1: every day, 6 am to 9 pm (the Instructor row a coach's own settings write);
//   · Casey (the rig's coached client) booked into today's session as a drop-in, so the coach's attendance has a person
//     to mark (SQL: the seat and pass rows the reserve route writes; a seat for today's session may already have started,
//     which the reserve route rightly refuses).
import { LIT_ORIGIN, sql, type People } from './rig.mts';

const laDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const laWeekday = (ms: number) => new Date(`${laDay(ms)}T12:00:00Z`).getUTCDay();
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function seedBooking(p: People): Promise<string> {
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(LIT_ORIGIN + path, { method, headers: { 'content-type': 'application/json', cookie: p.cookies.coach }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as Record<string, unknown> | null };
  };
  const now = Date.now(), today = laDay(now), dow = laWeekday(now);
  const dayPair = dow === 2 || dow === 4 ? 'tue_thu' : 'mon_wed';
  const meetsToday = [1, 2, 3, 4].includes(dow);
  // the coach's in-person hours (the 1:1 booker lists slots inside them)
  const weekly = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map((d) => ({ dow: d, startMin: 360, endMin: 1260 })));
  sql(`insert into "Instructor" ("id", "userId", "slug", "displayName", "weeklyHours", "updatedAt") values ('rig-instructor', ${q(p.ids.coach)}, 'rig-coach', 'Coach Riley', ${q(weekly)}::jsonb, now())
       on conflict ("userId") do update set "weeklyHours" = excluded."weeklyHours"`, true);
  const made = await call('POST', '/api/group-booking/coach', { action: 'create_group', name: 'Rig strength group', gymId: '24hr-victory', dayPair, hour: 19, startDate: today });
  const groupId = made.json?.id as string | undefined;
  if (!groupId) return `booking: create_group answered ${made.status} ${JSON.stringify(made.json).slice(0, 120)}`;
  if (!meetsToday) return `booking: group ${groupId} (${dayPair}); no session today (Los Angeles weekday ${dow}), so attendance has no roster`;
  const startsAt = new Date(`${today}T19:00:00-08:00`).toISOString();
  sql(`insert into "GroupPass" ("id", "groupId", "userId", "kind", "sessions", "startWeek", "windowEnd", "priceCents", "payMode", "status") values ('rig-pass', ${q(groupId)}, ${q(p.ids.client)}, 'drop_in', 1, 1, ${q(today)}, 6500, 'at_gym', 'active')`, true);
  sql(`insert into "GroupSeat" ("id", "slotKey", "seat", "groupId", "gymId", "userId", "passId", "date", "startsAt", "kind", "status", "createdAt", "updatedAt") values ('rig-seat', ${q(`group:${groupId}:${today}`)}, 1, ${q(groupId)}, '24hr-victory', ${q(p.ids.client)}, 'rig-pass', ${q(today)}, ${q(startsAt)}::timestamp, 'regular', 'booked', now(), now())`, true);
  return `booking: group ${groupId} (${dayPair}, 7 pm), today's session ${today} with Casey booked; coach hours 6 am–9 pm`;
}
