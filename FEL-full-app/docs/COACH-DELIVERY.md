# Coach delivery: automations, first blocks, scheduling, branding, reviews, the phone

Lane `lane/coach-delivery` (round 8 COA-01–13, then platform phase 2, 2026-10-26/27). Everything here is off or dark until
the owner acts: the pending SQL (OWN-01), teens on rosters (OWN-03), email (OWN-18), the AI switch (OWN-23), the media
bucket (OWN-16), terms and Stripe (OWN-04/06).

## What it does

| Gap | What | Where |
|---|---|---|
| COA-01 | Automations: on join, after N missed sessions in 7 days (the alerts' own rule), weekly at the coach's hour (PT). A preset (draft) or the coach's words, posted **only into the athlete's existing program thread**, never emailed. Teen gate first; deduped per automation × athlete × PT day; audited. Hourly sweep behind `COACH_AUTOMATIONS_CRON_SECRET` (503 without it); "Run now" for the coach. | `lib/coach/automations/**` |
| COA-02 | First block: the rules pick a template (days, equipment, youth from the birth year) and the Mirror screen's correctives (Prep); every line shows why and has a tick; applied in one write (the builder's import), undone in one write. AI writes a one-line summary only (ABACUS, adults), never sent health data. | `lib/coach/weeklyDraft/firstBlock.ts`, `lib/coach/firstBlockServer.ts` |
| COA-03 | Readiness survey: five questions beside the jump check, read by the daily check-in's low rule and the coach's readiness rule. Health data: verified adult + `health_data` (health write **i**); the coach sees it with `coach_view`. | `lib/coach/readiness/survey*.ts` |
| VBT §7.3 | Today eases, and the coach is alerted, from a warm-up bar-speed Low — the newest of today's jump check, bar speed and survey stands. | `lib/coach/readiness/sources.ts` |
| COA-04 | Brand: name, accent (WCAG AA on FEL's dark), logo in the existing public creator bucket. On the coach page, the athlete's Today, the invite email's sign-off (email stays plain text). | `lib/coach/branding*.ts` |
| COA-05 | Roster sessions on a calendar; a clash with another session or a held/paid store booking is refused; one signed .ics feed per person (RFC 5545 basics tested). | `lib/coach/schedule/**`, `lib/coach-store/ics.ts` |
| COA-06 | `/coach` Clients at 390 px: no sideways scroll; a 44 px tap floor for the whole tab (`app/coach/_components/look.ts`). | rig: `scripts/probes/_coach-delivery-phone.mts` |
| COA-07 | TeamSnap / SportsEngine / LeagueApps roster exports read by name; guardian emails never become invites. | `lib/coach/bulkImport.ts` |
| COA-08 | A coach's own demo clip, by signed PUT to the public creator bucket; off until `COACH_VIDEO_UPLOADS_ENABLED` and the bucket. | `lib/library/coachVideo.ts` |
| COA-09 | No YouTube embed anywhere (scan test); a YouTube URL is a labelled outbound link; own video autoplays. | `tests/coach-delivery/no-youtube.scan.test.ts` |
| COA-10 | Reviews by a verified adult after a package ended; text stays with the coach until SAF-06 lands. | `lib/coach-business/reviews.ts` |
| COA-11 | Change a running monthly package (upgrade prorated; downgrade at renewal). | `lib/coach-business/packageChange.ts` |
| COA-12 | Team fee package sent to the roster's adults through their threads. | `lib/coach-business/teamFee.ts` |
| COA-13 | Coach + payout terms draft points for the owner. | `docs/DRAFT-coach-terms.md` |

The lane's settings live in one collapsed **Setup** group at the bottom of Clients (the premium rule).

## Owner calls

1. Apply `prisma/pending/2026-10-26-coach-delivery.sql` (seven additive tables; rollback in its header).
2. Retention: an erased coach's automations, sessions, brand and reviews go; an athlete's own survey answers, reviews and
   automation audit rows go (`lib/data-rights/registry.ts`). Alternative: keep reviews with the athlete nulled.
3. Draft copy: automation presets, survey lines, team-fee message, review errors, first-client steps.
4. Schedule the hourly automation sweep (Cloud Scheduler → `POST /api/coach/automations/sweep`).
5. Turn review text public once SAF-06 is wired (`REVIEW_TEXT_PUBLIC`).
6. The coach store still takes 15% (`lib/fees.ts`); the dashboard line now shows the coach-business fee (owner call 5).
