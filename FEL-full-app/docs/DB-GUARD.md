# db-guard: reviewed pending SQL reaches production from CI, and nothing else does

**Owner decision, 2026-10-20 ("guarded CI job, one-time secret"):** the owner adds the production direct database URL
to GitHub once. After that, a CI job applies pending SQL to production, but only when the database's diff against
`prisma/schema.prisma` is exactly one reviewed file in `prisma/pending/`, or an ordered set of them. It then checks that
the diff is empty. Anything unexpected stops the job and opens an issue for the owner.

| Piece | File |
|---|---|
| The workflow (kept separate from `ci.yml`) | `.github/workflows/db-guard.yml` |
| The matcher (pure, no I/O) | `scripts/sql-guard/sqlGuard.ts` |
| Its command line (`decide`, `redact`, `rollback`) | `scripts/sql-guard/cli.ts` |
| The coordinator's gate before `main` moves | `scripts/sql-guard/await-db-guard.ts` |
| Tests | `scripts/sql-guard-tests.ts` (rules, verdict, workflow shape) and `scripts/sql-guard-prisma-tests.ts` (diffs printed by the Prisma CLI, offline) |

---

## 1. The owner's one-time step

### 1.1 Add the secret (inside a protected environment)

The secret goes into a GitHub **Environment** named `production-db`, not into the plain repository secrets. The
workflow's job declares `environment: production-db`, and the environment's branch rule admits only `main` and
`lane/finish-release`. That rule is what keeps production safe from a branch: a repository secret can be read by a
workflow file edited on **any** branch, and lane agents push branches and can dispatch workflows. An environment
secret reaches only a job running on an admitted branch. The workflow also refuses any other branch itself, before it
looks at the secret, but a workflow edited on a branch could drop that check; it cannot drop the environment rule.

1. Open **github.com/Elijahbonds/Final-Evolution-Lab-2026-05-12_23-15-57 → Settings → Environments → New
   environment**. The direct link is
   `https://github.com/Elijahbonds/Final-Evolution-Lab-2026-05-12_23-15-57/settings/environments/new`.
   **Name:** `production-db`. Spell it exactly like that. Then **Configure environment**.
2. Under **Deployment branches and tags**, choose **Selected branches and tags**, then **Add deployment branch or tag
   rule** twice: `main`, and `lane/finish-release`. Leave **Required reviewers** off. A reviewer would make every run
   wait for your tap, which is the step this job exists to remove.
3. Under **Environment secrets → Add environment secret**:
   - **Name:** `PROD_DIRECT_URL`. Spell it exactly like that. The workflow reads no other name.
   - **Value:** the **`DIRECT_URL`** value from the production env file, with no surrounding quotes. That file is
     `mode-lanes/wt-webapp-deploy/FEL-full-app/.env.production`, or `deploy-wt/FEL-full-app/.env.local`
     (`docs/LANES.md` §4). The value has this shape:

     `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require`

   That is the **direct** connection to the Cloud SQL instance, the same `$PROD_DIRECT_URL` that `OWNER-RUNBOOK.md`
   §4 uses by hand. Do not use:
   - `DATABASE_URL`. It carries `connection_limit` and is the app's pool.
   - A pooler URL (`pgbouncer=true`, or port 6543). `migrate diff` and `db execute` need a direct session.
   - The connector settings (`CLOUD_SQL_INSTANCE`, `DB_USER`, `DB_PASS`). They are the app's runtime path, not a URL.

   The user in that URL must own the tables, because Postgres allows `ALTER TABLE ... ADD COLUMN` only for a table's
   owner. assumption: the `DIRECT_URL` user is the owner, because the runbook applies every pending file with it. If an
   apply fails with `must be owner of table`, the issue will say so and nothing after that file runs.

If the job runs before the environment exists, GitHub creates `production-db` on the fly with **no** branch rule and
no secret. The job then reads nothing and says so. Add the branch rule (step 2) before the secret (step 3).

The same steps from a terminal (run in the deploy tree; the value is never printed):

```sh
R=Elijahbonds/Final-Evolution-Lab-2026-05-12_23-15-57
gh api -X PUT "repos/$R/environments/production-db" --input - <<'JSON'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
gh api -X POST "repos/$R/environments/production-db/deployment-branch-policies" -f name=main -f type=branch
gh api -X POST "repos/$R/environments/production-db/deployment-branch-policies" -f name=lane/finish-release -f type=branch
grep -E '^DIRECT_URL=' .env.production | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' \
  | gh secret set PROD_DIRECT_URL --env production-db --repo "$R"
```

**Undo:** delete the secret (or the whole `production-db` environment) on the same settings page, or run
`gh secret delete PROD_DIRECT_URL --env production-db --repo "$R"`. db-guard then goes back to doing nothing.

### 1.2 Check that GitHub can reach the database (read-only)

GitHub-hosted runners connect from addresses that change. Cloud SQL accepts a public-IP connection only from its
**authorized networks**. assumption: no doc in this repo records which networks production authorizes. The first
run will tell you.

1. **Actions → db-guard → Run workflow**. Pick the branch `main`, set **mode** to `preview`, and run it.
2. A green run, or a red run whose decision is "unexpected", means the runner reached the database.
3. A red run whose preview step shows `P1001` ("Can't reach database server") means the runner was refused. Nothing
   was written. You have three ways forward:
   - **(a)** Authorize `0.0.0.0/0` on the instance and require SSL. The password is then the only lock. This is not
     recommended.
   - **(b)** Run the Cloud SQL Auth Proxy in the job through Workload Identity Federation. That needs a GCP service
     account, `id-token: write`, and one new step. It is a workflow change for a lane, and it needs your sign-off.
   - **(c)** Run the job on a self-hosted runner inside the network.

   Until one of these is in place, keep applying pending SQL by hand (`OWNER-RUNBOOK.md` §4–5).

**The repository is public.** Its run logs and issues are public. GitHub masks the whole secret wherever it appears.
Every Prisma error also passes through `cli.ts redact`, which removes the host, user, password and database name,
because Prisma prints the host on its own. The diffs themselves are DDL for tables that the public `schema.prisma`
already describes. The workflow has no `pull_request` trigger, so a fork's PR can never reach the secret. Only
someone with write access can dispatch it or push `main`, and the `production-db` environment hands the secret only
to a run on `main` or `lane/finish-release` (§1.1).

---

## 2. What the job does

**Triggers:** `workflow_dispatch` (the mode is `apply` or `preview`), and any push to `main` that touches
`FEL-full-app/prisma/**`. A push runs in `apply` mode.

**One run at a time:** the concurrency group `db-guard-production`, with `cancel-in-progress: false`. A second run
waits, so a run is never cut off in the middle of an apply.

**Permissions:** `contents: read` and `issues: write`, and nothing else. The actions are pinned to commit SHAs. The job
adds no dependency: it runs the Prisma CLI and `tsx` from the lockfile.

| Step | What it runs | Writes? |
|---|---|---|
| secret present? | It refuses (red, nothing read) any ref but `main` or `lane/finish-release`. Then it checks `PROD_DIRECT_URL`. If the secret is absent, the step `no secret: nothing was read or written` logs a notice, and the run ends green having done nothing. | no |
| preview | `prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` | no |
| match | `cli.ts decide`, which returns **empty**, **exact match of [files] in apply order**, or **unexpected** (with reasons). An unexpected decision fails the step. | no |
| apply | For each matched file, in order: `prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/<file>`. It never executes the diff itself. A failure stops at that file. | **yes** |
| verify | The same `migrate diff` runs again, and `cli.ts decide --expect-empty` must say **empty**. | no |
| `verified: production matches the schema` | This step runs only when production now equals this commit's schema. The coordinator reads it. | no |
| open an issue for the owner | It runs on any failure in `apply` mode. It takes one more read-only diff (production as it is **now**), then opens the issue "db-guard stopped: production schema needs the owner", assigned to the repo owner, or comments on that issue if it is already open. | issue only |

### The matcher's rules (`scripts/sql-guard/sqlGuard.ts`)

1. **Normalisation.** The matcher strips comments and collapses whitespace. It lower-cases unquoted text and drops
   the spaces around `(`, `)` and `,`. Quoted names and string literals are compared byte for byte.
2. **Order does not matter where Prisma does not care.**
   - A diff's statements are compared as a multiset. Prisma groups a diff by kind, so two files interleave.
   - The columns and constraints of a `CREATE TABLE` are compared as a set.
   - So are the clauses of one `ALTER TABLE ... ADD COLUMN a, ADD COLUMN b`.
3. **Only additive statements are applied, by allowlist:** `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, `CREATE TYPE ...
   AS ENUM`, `ALTER TYPE ... ADD VALUE`, and an `ALTER TABLE` whose every clause is `ADD COLUMN` or `ADD CONSTRAINT ...
   FOREIGN KEY`.
   - Nothing else is ever applied: no `DROP`, no `ALTER ... DROP`, `TYPE`, `RENAME` or `SET`, no `TRUNCATE`, `DELETE`,
     `UPDATE` or `INSERT`, no transaction verb, no dollar-quoting.
   - This holds in the diff **and** in a pending file. A pending file that holds a non-additive statement is never
     eligible, however well it matches.
4. **Whole files, exactly, with one answer.** The diff must equal the union of whole files, and only one such set may
   exist.
   - A file that is partly in the diff (production has some of it) is "unexpected". The guard never applies "the
     rest".
   - Two files with the same statements are ambiguous, and that is also "unexpected".
5. **Dependency order.** A file that references a table or enum created by another matched file is applied after that
   file. References count through `REFERENCES`, `ALTER TABLE`, `ON`, or a column of that enum type. Ties go by file
   name, which is date order. For example, the coach-store files run in the order instructor → booking →
   call-signal → program-access → referral.

**What was measured (2026-10-20, Prisma 6.7.0, offline, no database).** `scripts/sql-guard-prisma-tests.ts` cuts each
pending file's models or fields out of `schema.prisma`. It then asks the Prisma CLI for the diff that production would
print without them.

- Every schema-backed pending file matched exactly, alone and in combination: p5 + p7, all of p5–p8, and all five
  coach-store files.
- `2026-10-07-adventure-save.sql` does **not** match. It is hand-written with an inline `PRIMARY KEY REFERENCES`,
  which is not Prisma's form. If production ever lacked that table, the guard would stop and ask. The runbook says
  you applied it on 2026-10-06.
- A production database that has the raw-SQL `PartyReport` table prints `DROP TABLE "PartyReport"`, and the guard
  stops.

---

## 3. Running it by hand

- **Preview only (writes nothing):** go to **Actions → db-guard → Run workflow**, pick the branch (`main` or
  `lane/finish-release`; any other is refused), and set mode `preview`. Or run
  `gh workflow run db-guard.yml --ref lane/finish-release -f mode=preview`. The run summary shows the diff and
  the decision.
- **Apply:** do the same with mode `apply`. Pick the branch whose `prisma/schema.prisma` is about to deploy.
- **Locally, without a database:** save a diff to a file, then run
  `npx tsx scripts/sql-guard/cli.ts decide --diff <file.sql>`. It prints the same decision the job would make.
  `npx tsx scripts/sql-guard/cli.ts rollback prisma/pending/<file>.sql` prints a file's undo.

**One GitHub rule:** you can dispatch a workflow only once its file is on the default branch (`main`). Until
`db-guard.yml` reaches `main`, there is no "Run workflow" button, and the coordinator's gate falls back (§4).

---

## 4. Ordering with the deploy: SQL first, then the code that needs it

**How deploys actually happen today.**
- `/CLAUDE.md` calls `main` the deploy branch ("a push ships").
- The repo has **no deploy workflow**: `ci.yml` only checks. The deploys on record were run by hand with
  `firebase-tools deploy` from a deploy tree (`docs/LANES.md` §4).
- The delegation of 2026-10-20 has the coordinator fast-forward `main` when release CI, E2E and preview are green.

**So the SQL must land before `main` moves.**

### Implemented: the coordinator triggers db-guard and waits (no deploy config changes)

```sh
npx tsx scripts/sql-guard/await-db-guard.ts --ref lane/finish-release --sha <the 40-char commit main will move to>
```

The script works in four steps:

1. It checks that `origin/lane/finish-release` is exactly that commit.
2. It dispatches `db-guard.yml` on that branch in `apply` mode.
3. It waits for the run.
4. It prints **GO** (exit 0) only if all three of these hold:
   - the run's commit is that SHA;
   - the run succeeded;
   - the `verified: production matches the schema` step ran.

   Anything else prints **STOP** (exit 1). The coordinator fast-forwards `main` only on GO. The script never pushes
   anything itself.

**Fallbacks**, for when db-guard cannot check production:
- The secret is not set yet.
- `db-guard.yml` is not on `main` yet.
- `gh` cannot dispatch.

In any of these cases the script uses today's rule:
- **GO, with a warning,** when the release changes nothing under `FEL-full-app/prisma/`.
- **STOP** when it does. The owner then applies the SQL by hand (`OWNER-RUNBOOK.md` §4–5).

### Backstop: a push to main touching prisma/

If `main` moves without the coordinator, db-guard runs on that push. It applies an exact match, or opens the issue.
If the deploy happens at the same moment, there is a short window in which the new code can run before its SQL.
That is why the coordinator path above is the primary one.

### Recommended later: the deploy job depends on db-guard

If a deploy workflow is ever added, give its job `needs: guard`, with db-guard as a reusable job in the same workflow.
That way the deploy cannot start until production is verified. This **changes what deploys**, so it stays the owner's
call and is not done here.

---

## 5. How it fails safe

| What happens | What the job does | What production gets |
|---|---|---|
| Dispatched on another branch | The environment's branch rule refuses the job, or the first step does. The run is red; no issue. | nothing read, nothing written |
| No secret | It logs a notice and ends green. The `verified` step is skipped, so the coordinator falls back. | nothing read, nothing written |
| Production unreachable / bad URL | The preview fails, with the error redacted, and an issue opens. | nothing written |
| The diff holds a `DROP` or a destructive `ALTER` | The match fails ("DESTRUCTIVE") and an issue opens. The DROP's table is named, with the pending file that created it. | nothing written, **not even the files that did match** |
| The diff has a statement that no pending file explains | "NO PENDING FILE: ..." and an issue | nothing written |
| A file is only partly in the diff | "PARTLY APPLIED?: ..." and an issue | nothing written |
| Two pending files would both explain it | "more than one set ..." and an issue | nothing written |
| A matched file fails while it is applied | The apply step stops at that file. The issue shows the diff **as it is now**. | earlier files are applied; the failing file may be partly applied (see below); later files are not |
| Verify is not empty after the apply | The verify step fails and an issue opens. | the matched files are applied |

assumption: `prisma db execute` sends a file to Postgres as one script. Postgres runs a multi-statement script in one
implicit transaction, so a failing file should roll back as a whole. This was not run against a database. The issue
always carries a fresh diff, so it shows what landed either way.

**Between the preview and the apply** someone else could change production. The concurrency group stops a second
db-guard, but not a person at a terminal. The verify step catches whatever results.

---

## 6. When it stops (the issue)

1. Read the decision in the issue. It lists every reason.
2. **`DROP TABLE "PartyReport"` / `"CreatorInquiry"` / `"BookEntitlement"` / `"BookFulfillmentEvent"`.** Production has
   that raw-SQL table and `schema.prisma` has no model for it (`OWNER-RUNBOOK.md` §4 and §6).
   - **Never apply the DROP.**
   - The fix is a lane change that adds the model to `schema.prisma` and regenerates `public/_prisma` on Linux. Each
     pending file's header has the model block. Until then, **every** db-guard run stops here (§8).
3. **NO PENDING FILE.** Production is behind a schema change that has no reviewed file. Write the file in a lane and
   review it, then run db-guard again.
4. **PARTLY APPLIED?** Production has part of a file. Find out what landed (the "Diff now" block), then decide by
   hand. The guard never applies part of a file.
5. **The apply failed.** Read the redacted apply log and the "Diff now" block, then re-run in `preview` mode before
   doing anything else.
6. When it is fixed, run db-guard again. The next stop comments on the same issue while that issue is open. Close it
   yourself.

---

## 7. Undo: each pending file's rollback

The guard **never** runs these. Each one destroys data written since the file was applied. Run one only by hand, and
only after a deploy whose client no longer has the model, because a client that has the model fails when its table is
missing (`OWNER-RUNBOOK.md` §5.5). In practice, don't: an unused additive table is harmless. Undo in the **reverse**
of the apply order: call-signal before booking, booking before instructor. These lines were printed by
`npx tsx scripts/sql-guard/cli.ts rollback prisma/pending/*.sql`.

| File | Rollback |
|---|---|
| `2026-09-29-mirror-coach-p5-health.sql` | `DROP TABLE "HealthConsent"; DROP TABLE "PainCheckIn"; DROP TABLE "HealthIntake";` |
| `2026-09-29-mirror-coach-p6-warmup-readiness.sql` | `DROP TABLE "ReadinessCheckIn"; ALTER TABLE "GuardianConsent" DROP COLUMN "selfRequested"; ALTER TABLE "GuardianConsent" DROP COLUMN "acceptedById"; ALTER TABLE "ClientSession" DROP COLUMN "cooldownDoneAt"; ALTER TABLE "Session" DROP COLUMN "kind"; DROP TYPE "SessionKind";` |
| `2026-09-29-mirror-coach-p7-breath-log.sql` | `DROP TABLE "BreathLog";` |
| `2026-09-29-mirror-coach-p8-served-exercise.sql` | `ALTER TABLE "ExerciseLog" DROP COLUMN "servedExerciseId";` |
| `2026-10-01-economy-caps-runid-agentrun.sql` | `ALTER TABLE "GameSession" DROP CONSTRAINT "GameSession_runId_fkey"; ALTER TABLE "SessionRun" DROP COLUMN "agentRun"; ALTER TABLE "GameSession" DROP COLUMN "runId";` |
| `2026-10-04-adult-optin-ab04.sql` | `DROP TABLE "ScanSaveOptIn";` |
| `2026-10-04-coach-store-instructor.sql` | `DROP TABLE "Instructor";` (last of the five) |
| `2026-10-04-coach-store-booking.sql` | `DROP TABLE "Booking";` (after call-signal) |
| `2026-10-04-coach-store-call-signal.sql` | `DROP TABLE "CallSignal";` |
| `2026-10-04-coach-store-program-access.sql` | `DROP TABLE "ProgramAccess";` |
| `2026-10-04-coach-store-referral.sql` | `DROP TABLE "CoachStoreReferral";` |
| `2026-10-07-adventure-save.sql` | `DROP TABLE "AdventureSave";` |
| `2026-10-07-coach-ai-1-message-read-markers.sql` | `ALTER TABLE "ProgramMessage" DROP COLUMN "readAt";` |
| `2026-10-07-coach-ai-2-coach-availability.sql` | `DROP TABLE "CoachAvailability";` |
| `2026-10-09-book-shop.sql` | `DROP TABLE "BookEntitlement"; DROP TABLE "BookFulfillmentEvent";` |
| `2026-10-13-creator-inquiry.sql` | `DROP TABLE "CreatorInquiry";` |
| `2026-10-13-party-report.sql` | `DROP TABLE "PartyReport";` |
| `2026-10-16-rate-limits.sql` | `DROP TABLE "rate_limits";` (the limits then fail open) |

To run one by hand: `npx prisma db execute --url "$PROD_DIRECT_URL" --stdin <<< '<the line>'`. Then run the read-only
`migrate diff`. It will now list the object again.

---

## 8. Known limits

- **The raw-SQL tables will stop every run once production has them.**
  - `OWNER-RUNBOOK.md` §6 applies `PartyReport` and `CreatorInquiry` for launch. Neither is in `schema.prisma`, so
    from then on every diff carries `DROP TABLE` for both, and db-guard stops by design (the owner's rule: any DROP
    stops).
  - The fix is the post-launch lane the runbook already names: add both models to `schema.prisma` and regenerate the
    client on Linux. The book shop's two tables do the same on the day it opens.
  - Until that lane lands, db-guard can still guard a release, but it cannot apply one.
- **The raw-SQL pending files are never applied by db-guard.** They are not in the schema, so they never appear in the
  diff. `OWNER-RUNBOOK.md` §6 stays the way to apply them.
- **Hand-written files must be in Prisma's form to auto-apply.** `2026-10-07-adventure-save.sql` is not (§2).
- **The first run that can be dispatched is the one after `db-guard.yml` reaches `main`.** Until then the coordinator
  falls back (§4).
