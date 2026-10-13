# Daily retention cleanup (owner, 2026-10-13)

The privacy policy (`lib/policies.ts`) says **party reports** and **creator ("Work with us") inquiries** are deleted
after 12 months. Each store already deletes old rows whenever a new row is written. That leaves old rows in place on a
quiet stretch, so there is now a **daily scheduled cleanup**.

## What shipped

`POST /api/cron/retention` (`app/api/cron/retention/route.ts`, logic in `lib/retention/retentionJob.ts`).

| Case | Answer |
|---|---|
| `RETENTION_CRON_SECRET` not set on the server (or empty) | `503 { error: 'retention_not_configured' }`. Fail closed: nothing runs. |
| header `x-retention-secret` missing or wrong | `401 { error: 'unauthorized' }`. Nothing runs. The compare is constant time (SHA-256 of both sides, then `timingSafeEqual`), the same shape as `verifyReconcileSecret` / `verifyReclaimSecret`. |
| right secret | runs both purges, `200` with counts |
| a table does not exist yet (its pending SQL is not applied) | that purge is a no-op; `200`, count `0`, state `unavailable` |
| a real database error on a purge | `500 { ok: false, ... }`; the other purge still ran |

Body of a `200`: **counts only, never a row, id, email or message**:

```json
{ "ok": true, "partyReportsDeleted": 0, "creatorInquiriesDeleted": 0, "partyReports": "purged", "creatorInquiries": "unavailable" }
```

It is idempotent (a second run deletes nothing more) and safe to call more than once a day. The cutoff is 365 days
(`PARTY_REPORT_RETENTION_DAYS`, `INQUIRY_RETENTION_DAYS`), the same constants and SQL the write-time purges use, so
the policy text, the write-time purge and the daily job cannot drift apart. The write-time purges stay.

## What the owner must set up (nothing here is done for you)

The repo has no scheduler today: the only workflow is `ci.yml`, and the earlier secret-protected jobs
(`/api/coach-store/reconcile`, `/api/arena/reclaim`) say "no scheduler calls it yet". So the trigger is a Cloud Scheduler
job, and it needs a secret. Steps, in order:

1. **Make a secret value** and keep it out of git: `openssl rand -hex 32`.
2. **Store it as the server secret `RETENTION_CRON_SECRET`** the way `COACH_STORE_RECONCILE_SECRET` is stored:
   `firebase functions:secrets:set RETENTION_CRON_SECRET` (paste the value).
3. **Add `"RETENTION_CRON_SECRET"` to `frameworksBackend.secrets` in `firebase.json`**, next to
   `"COACH_STORE_RECONCILE_SECRET"`, then deploy. Without this the running function never sees the secret and the route
   keeps answering `503`. (An agent may not edit `firebase.json`, which is why this is your step. It is one line.)
4. **Create the Cloud Scheduler job** (once, from a machine signed in to the `final-evolution-lab` project). Replace
   `<SITE_HOST>` with the live host (the host of `NEXTAUTH_URL`) and `<SECRET>` with the value from step 1:

   ```sh
   gcloud scheduler jobs create http fel-retention-daily \
     --project=final-evolution-lab \
     --location=us-central1 \
     --schedule="23 4 * * *" \
     --time-zone="Etc/UTC" \
     --uri="https://<SITE_HOST>/api/cron/retention" \
     --http-method=POST \
     --headers="x-retention-secret=<SECRET>" \
     --attempt-deadline=60s
   ```

   `23 4 * * *` is 04:23 UTC daily (off the hour on purpose). Cloud Scheduler needs its API enabled
   (`gcloud services enable cloudscheduler.googleapis.com`) and a billing-enabled project. The secret sits in the job's
   header, visible to anyone who can read Scheduler jobs in the project, so rotate it (steps 1 to 3, then
   `gcloud scheduler jobs update http fel-retention-daily --headers=...`) if that audience changes.
5. **Check it once by hand** after the deploy, before trusting the schedule. Both lines are safe to run:
   - `gcloud scheduler jobs run fel-retention-daily --project=final-evolution-lab --location=us-central1`
   - or `curl -sS -X POST -H "x-retention-secret: <SECRET>" https://<SITE_HOST>/api/cron/retention`
   You should see `{"ok":true,...}` with counts. `503` means step 2 or 3 is missing; `401` means the two secrets differ.

Until the two party/inquiry tables exist (`prisma/pending/2026-10-13-party-report.sql`, `...-creator-inquiry.sql`) the
job reports `unavailable` and deletes nothing. That is expected.

## Why not GitHub Actions

A scheduled workflow would need the site host and the secret in repo secrets and would put a production call in CI
config. The repo has none today, so the route is the only part that ships and the trigger stays with the owner.

## Tests

`lib/retention/retentionJob.test.ts`: 503 without a secret, 401 for a missing/wrong secret, both purges run with the
right one, counts only, idempotent, the 365-day cutoff (364 days stays, 366 goes), missing tables answer `200` with
zero counts, a database error answers `500`, and `verifyRetentionSecret` is checked to call `timingSafeEqual` on equal
length digests. Fake database: `tests/helpers/fakeRetentionDb.ts`.
