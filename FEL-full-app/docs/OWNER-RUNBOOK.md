# Owner runbook: the launch ops session

**Owner, 2026-10-20:** "Ops items: ONE runbook, done in ONE session together." This is that runbook. It collects every
open operational step from `docs/SHIP-READINESS.md` §3, `docs/NEXUS-STUDIO-SAVE.md` §7 (PR #373), `docs/FEEL-PANEL.md`
(branch `lane/feel-panel`), `docs/RETENTION-JOB.md` and `server/netd/README.md` into one sitting, in a safe order.

Written by `lane/launch-docs` from the code and docs at `origin/lane/finish-release` `fdd77784`. **Nothing here was
run.** No lane may run these steps: each one touches production, deploys, or changes what deploys.

**How to read each step**

- **Run:** the exact command. `<ANGLE>` values are yours to fill in. No secret value appears in this file; each step
  says where the secret lives.
- **You should see:** what a good result looks like.
- **If not:** what to do.
- **Undo:** how to reverse it.

**The markers**

- **[IRREVERSIBLE]**: there is no clean undo. The "undo" loses data, or the effect has already happened.
- **[PROD WRITE]**: it changes production data or configuration. It can be undone.
- **[DEPLOY]**: it ships code that players get. It can be rolled back, but players see it in the meantime.
- Steps without a marker are read-only or local.

Expected length: about 2 hours, plus the two-phone party test.

---

## 0. The order, on one page

Why this order:

- The SQL goes in **before** the app deploy that needs it, or routes 500.
- The secrets exist **before** the deploy that names them, or the deploy fails.
- netd goes **before** the app, because the app build bakes in netd's URL.
- The Scheduler job comes **after** the deploy, because the route has no secret until then.
- The Studio-save switch comes **last, in a later deploy**. Its policy text is not merged yet (§9).

| # | Step | Marker | Section |
|---|---|---|---|
| 1 | Merge the PRs (Studio save #373, the feel panel, the `firebase.json` one-liner) | merge | §1 |
| 2 | Bring the deploy tree to the merged tip | local | §2 |
| 3 | Load the production database URL into your shell, without printing it | local | §3 |
| 4 | Preview what production is missing (read-only diff) | read-only | §4 |
| 5 | Apply the pending SQL in dependency order, including `ProgramMessage.readAt` and `StudioProjectSave` | **IRREVERSIBLE** | §5 |
| 6 | Verify: the same diff again | read-only | §5.4 |
| 7 | Apply the two raw-SQL tables (party reports, creator inquiries) | **IRREVERSIBLE** | §6 |
| 8 | Create the secrets: `RETENTION_CRON_SECRET` and `party-ticket-secret` | PROD WRITE | §7.1, §8.1 |
| 9 | Redeploy netd, then check `/healthz` | DEPLOY | §8 |
| 10 | Edit the production env file: party, feel panel, and a check of the 20 undocumented vars | local, ships with step 11 | §10 |
| 11 | **Deploy the app**: one deploy carries all of the above | DEPLOY | §11 |
| 12 | Verify live: health, Studio-save reads, the coach thread, parties, the feel-panel endpoint | read-only | §11.3 |
| 13 | Put your user id on `FEEL_PANEL_USERS` (feel panel); `admin` role only if you want the diagnostics reader | env (ships with step 11); role is PROD WRITE | §12 |
| 14 | Create the retention Scheduler job and run it once | **IRREVERSIBLE** (it deletes rows) | §7.3 |
| 15 | Device checks: the party on two phones, the feel panel on your phone | read-only | §13 |
| 16 | **Later, its own deploy:** the Studio-save switch | DEPLOY | §9 |

Stop rule: if any step's "you should see" is wrong and its "if not" does not fix it, stop there. Every step before a
**[DEPLOY]** is safe to leave half-done overnight. The SQL is additive, and the old deploy ignores the new tables.

---

## 1. Merge the PRs (before the session, or at its start)

Merging is your step. A merge into `lane/finish-release` can be undone with a revert PR.

| PR | Branch | What it brings | Notes |
|---|---|---|---|
| #373 | `lane/studio-save` | The `StudioProjectSave` model, the regenerated `public/_prisma/client`, `prisma/pending/2026-10-17-studio-project-save.sql`, the routes, the account panel, and the switch (off) | Its SQL must be applied **in the same session as the deploy** (owner Q8). This runbook does that: §5, then §11 |
| feel panel (number not recorded here) | `lane/feel-panel` | `GET /api/feel-panel`, `lib/feel-panel/**`, `FEEL_PANEL_ENABLED`, the sheet mounted in `app/play/layout.tsx` | **Flag:** the branch also carries `lane/hoops-handle`'s commits (`495209f7`, merged into it at `4a152afc`; the four knobs are that work's numbers). Merging the feel panel merges the hoops-handle change too. Merge hoops-handle's own PR first, or knowingly take both |
| (new, yours) | any | One line in `firebase.json` (§7.2) | Lanes may not edit `firebase.json`, so this is your own commit. Without it, the deployed function never sees `RETENTION_CRON_SECRET` |

**You should see:** CI green on each PR before you merge (`.github/workflows/ci.yml`: tsc, vitest, the headless suites,
`next build`).

**Undo:** a revert PR on `lane/finish-release`. If the revert removes a model whose table you already created, the table
stays in production, harmless and unused. Do not drop it (§5.5).

---

## 2. Bring the deploy tree to the merged tip

Use the deploy tree you deployed from last: a real checkout with real `node_modules` and the **production** env file
(`docs/LANES.md` §4). In September that was `~/Developer/FEL-swarm/mode-lanes/wt-webapp-deploy` (`.env.production`) or
`~/Developer/FEL-swarm/deploy-wt` (`.env.local`). The steps below call it `<DEPLOY_TREE>`.

**Run:**

```sh
cd <DEPLOY_TREE>/FEL-full-app
git status --short                          # must print nothing (an untracked .firebase/ is fine)
git rev-parse HEAD                          # write this down: it is your rollback commit (§11.4)
git fetch origin
git checkout --detach origin/lane/finish-release
git diff --quiet <ROLLBACK_SHA> HEAD -- package-lock.json || npm ci
git checkout -- public/_prisma/client yarn.lock
git status --short                          # nothing again
```

**You should see:** a clean tree at the new tip. `git log -1 --oneline` shows the merge of the last PR from §1.

**If not:**

- If `public/_prisma/client` shows as modified after `npm ci`, run the `git checkout --` line again. A Mac bakes
  `darwin-arm64` into the client. The committed Linux engine is the one Cloud Run needs (`/CLAUDE.md`, "The trap that
  has cost the most deploys"). **Never commit or deploy a regenerated client from a Mac.**
- If the tree has other local changes, stop and find out whose they are.

**Undo:** `git checkout --detach <ROLLBACK_SHA>`.

---

## 3. Load the production database URL, without printing it

Every SQL step uses `$PROD_DIRECT_URL`. The value is the `DIRECT_URL` line of the deploy tree's production env file.
Print its length, never the value.

**Run** (use `.env.local` instead if that is your tree's production file):

```sh
export PROD_DIRECT_URL="$(grep -E '^DIRECT_URL=' .env.production | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
test -n "$PROD_DIRECT_URL" && echo "PROD_DIRECT_URL set (${#PROD_DIRECT_URL} chars)"
```

**You should see:** `PROD_DIRECT_URL set (NN chars)`.

**If not:** the file has no `DIRECT_URL` line. Use the Cloud SQL direct connection you used for the last applied file
(the 2026-10-06 `AdventureSave`). assumption: the earlier applies used this same variable name. No doc records how it
was set.

**Undo:** `unset PROD_DIRECT_URL` at the end of the session (§14).

---

## 4. Preview what production is missing (read-only)

**Run:**

```sh
npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/prod-diff.sql
grep -nE 'CREATE TABLE|ALTER TABLE|CREATE TYPE|DROP' /tmp/prod-diff.sql
```

This reads the production schema and writes nothing to the database. **Never execute `/tmp/prod-diff.sql` itself.** Use
it only to decide which reviewed file(s) to apply.

**You should see:** some or all of the statements in the table in §5.1, plus the `StudioProjectSave` table from #373.
Match each statement to its file.

**If not:**

- **A statement no file in §5.1 explains** means production is behind some other change. Stop and review it before
  applying anything (`docs/LANES.md` §4).
- **`DROP TABLE "PartyReport"`, `"CreatorInquiry"`, `"BookEntitlement"` or `"BookFulfillmentEvent"`** means production
  already has that raw-SQL table (§6). Those tables are not in `schema.prisma`, so the diff "wants" to drop them.
  That is expected. Do **not** act on it. Skip that table in §6.
- **An empty diff** means production is already current. Skip to §6.

**Undo:** nothing to undo. Delete `/tmp/prod-diff.sql` when you are done (§14).

---

## 5. Apply the pending SQL, in dependency order — **[IRREVERSIBLE]**

Each file is additive: new tables, new nullable or defaulted columns, new foreign keys. None changes or drops existing
data. It is still marked irreversible, because the only undo is a `DROP`, which loses whatever was written after it.

### 5.1 The files, in order

Apply **only the files whose statements the preview listed**. Skip a file whose objects production already has: a
second `CREATE TABLE` fails with "already exists".

| Order | File (`prisma/pending/`) | Creates | Depends on | Breaks without it |
|---|---|---|---|---|
| 1 | `2026-09-29-mirror-coach-p5-health.sql` | HealthIntake, PainCheckIn, HealthConsent | `User` | the health intake, pain, consent and guardian routes |
| 2 | `2026-09-29-mirror-coach-p6-warmup-readiness.sql` | enum SessionKind, `Session.kind`, `ClientSession.cooldownDoneAt`, `GuardianConsent.acceptedById` and more, ReadinessCheckIn | 1 | Today, the program builder, every GuardianConsent read |
| 3 | `2026-09-29-mirror-coach-p7-breath-log.sql` | BreathLog | 1, 2 | the breath routes |
| 4 | `2026-09-29-mirror-coach-p8-served-exercise.sql` | `ExerciseLog.servedExerciseId` | 1–3 (the file says "apply AFTER") | every ExerciseLog read |
| 5 | `2026-10-01-economy-caps-runid-agentrun.sql` | `GameSession.runId` (+ FK to SessionRun), `SessionRun.agentRun` | — | the session paths |
| 6 | `2026-10-04-adult-optin-ab04.sql` | ScanSaveOptIn | `User` | fails closed (no save) |
| 7 | `2026-10-04-coach-store-instructor.sql` | Instructor | — | coach-store pages (behind `COACH_STORE_ENABLED`, off) |
| 8 | `2026-10-04-coach-store-booking.sql` | Booking | 7 | same |
| 9 | `2026-10-04-coach-store-program-access.sql` | ProgramAccess | 7 | same |
| 10 | `2026-10-04-coach-store-call-signal.sql` | CallSignal | 8 | same |
| 11 | `2026-10-04-coach-store-referral.sql` | CoachStoreReferral | 7 | same |
| 12 | `2026-10-07-adventure-save.sql` | AdventureSave | `User` | the schema comment says you applied it on 2026-10-06; expect the preview not to list it |
| 13 | `2026-10-07-coach-ai-1-message-read-markers.sql` | `ProgramMessage.readAt` | — | **the coach thread's GET and POST** (the finding in §5.2) |
| 14 | `2026-10-07-coach-ai-2-coach-availability.sql` | CoachAvailability | 13 (its header), `CoachClient` | nothing 500s: raw-SQL reads probe for the table first |
| 15 | `2026-10-17-studio-project-save.sql` (from #373) | StudioProjectSave + its FK to `User` | `User` | the Studio-save routes answer 503 and the export lists none |

### 5.2 The `ProgramMessage.readAt` finding (file 13)

The SQL header and `lib/coach/messageReads.ts` still say it is "safe in either order", because "the committed client has
never heard of readAt". That stopped being true at `4eecc830` (2026-10-07). That commit put `readAt` into
`prisma/schema.prisma` **and** into the committed `public/_prisma/client`. `app/api/coach/messages/route.ts` runs
`findMany` and `create` with no `select`, and Prisma then selects every scalar column, `readAt` included. **On a
database without the column, the coach thread's GET and POST fail.** (Source: `docs/SHIP-READINESS.md` §3.2, from the
code and the client. It was not run against a database without the column.)

So: **if the preview lists `ProgramMessage.readAt`, apply file 13 before the deploy (§11).** If it does not, production
already has the column (the commit message says "drift check clean"). Either way, the "safe in either order" notes are
stale. They are the coach-ai lane's files and are not edited here.

### 5.3 Run, one file at a time

```sh
npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/<FILE>.sql
```

**You should see:** `Script executed successfully.`

**If not:**

- **"already exists":** production had that object. Re-run the §4 preview and check what is still missing before going on.
- **Any other error:** stop. assumption: a file that fails partway may have applied its first statements. Re-run §4 to
  see exactly what landed before you do anything else.

### 5.4 Verify (read-only)

```sh
npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
```

**You should see:** an empty migration. The only exceptions are `DROP TABLE` lines for the §6 raw-SQL tables, if
production has them.

**If not:** a remaining `CREATE` or `ALTER` means a file was skipped. Go back to §5.1.

### 5.5 Undo

Each file states its own rollback, for example `DROP TABLE "StudioProjectSave";` or
`ALTER TABLE "ProgramMessage" DROP COLUMN "readAt";`. **Only drop after a deploy whose client no longer has the model.**
A client that has the model fails when the table is missing. Dropping loses every row written since. In practice: do
not undo. An unused additive table is harmless.

---

## 6. The two raw-SQL tables: party reports and creator inquiries — **[IRREVERSIBLE]**

These tables are **not in `schema.prisma`**. The code writes to them with raw SQL after an `information_schema` probe.
Without them, `/work-with-us` stores nothing, party reports are not stored, and the retention job reports `unavailable`.
Applying them is safe in either order with the deploy. The Privacy Policy already promises both records, so apply them
for launch.

**Run** (skip either one if §4 showed production already has it):

```sh
npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-13-party-report.sql
npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-13-creator-inquiry.sql
```

**Verify:** `migrate diff` cannot verify these, because they are not in the schema. Ask the database directly:

```sh
printf '%s\n' "SELECT table_name FROM information_schema.tables WHERE table_name IN ('PartyReport','CreatorInquiry');" > /tmp/check.sql
npx prisma db execute --url "$PROD_DIRECT_URL" --file /tmp/check.sql
```

`db execute` prints no rows, only success or an error. assumption: use `psql "$PROD_DIRECT_URL" -c "<the same SELECT>"`
if you have `psql`. That shows both names.

**You should see:** both table names. Within about 5 minutes the app's probe notices them, with no deploy needed.

**Known gap, for a lane after launch:** from now on, every `migrate diff` prints `DROP TABLE "PartyReport"` and
`DROP TABLE "CreatorInquiry"`. **Never apply those lines**, and never run `prisma db push` against production: it would
offer to drop them. The fix is to add both models to `schema.prisma` and regenerate the client on Linux (each file's
header has the model block). That is a lane change you merge.

**The book shop's tables** (`2026-10-09-book-shop.sql`) are the same kind. Apply them only on the day the book shop
opens; `docs/BOOK-SHOP.md` has its remaining steps.

**Undo:** `DROP TABLE "PartyReport";` / `DROP TABLE "CreatorInquiry";`. This loses the stored reports and inquiries.

---

## 7. The retention cron

The privacy policy promises that party reports and creator inquiries are deleted after 12 months.
`POST /api/cron/retention` does that, and it fails closed: `503 retention_not_configured` until the secret exists. Full
background: `docs/RETENTION-JOB.md`.

### 7.1 The secret — **[PROD WRITE]**

**Run:**

```sh
openssl rand -hex 32          # copy it into your password manager; nowhere in git, nowhere in a doc
npx -y firebase-tools@latest functions:secrets:set RETENTION_CRON_SECRET --project final-evolution-lab   # paste it
```

**Where it lives afterwards:** Google Secret Manager (project `final-evolution-lab`), next to
`COACH_STORE_RECONCILE_SECRET`, and your password manager. The Scheduler job's header (§7.3) holds a second copy.

**You should see:** the CLI confirms a new secret version.

**If not:** the project needs Blaze billing and the Secret Manager API. Both are already in use for
`COACH_STORE_RECONCILE_SECRET`.

**Undo:** remove it from `firebase.json` and redeploy, then
`npx -y firebase-tools@latest functions:secrets:destroy RETENTION_CRON_SECRET --project final-evolution-lab`.

### 7.2 The `firebase.json` line (your commit, merged in §1)

`frameworksBackend.secrets` becomes:

```json
"secrets": ["COACH_STORE_RECONCILE_SECRET", "RETENTION_CRON_SECRET"]
```

**Check after §2:** `grep -c RETENTION_CRON_SECRET firebase.json` prints `1`.

**If not:** the one-liner is not merged yet. Merge it, or make the edit in the deploy tree for this deploy only. In that
case, commit it afterwards, or the next deploy from a clean tree drops the secret, and the route goes back to `503`,
which is safe.

### 7.3 The Scheduler job, after the deploy (§11) — **[IRREVERSIBLE]** once it runs

Each run permanently deletes party reports and creator inquiries older than 365 days. That is the policy's promise. At
launch it deletes nothing, because both tables are new.

**Run** (`<SITE_HOST>` is the live host, the host of `NEXTAUTH_URL`; assumption: `final-evolution-lab.web.app` unless
you serve a custom domain):

```sh
gcloud services enable cloudscheduler.googleapis.com --project final-evolution-lab
gcloud scheduler jobs create http fel-retention-daily --project=final-evolution-lab --location=us-central1 \
  --schedule="23 4 * * *" --time-zone="Etc/UTC" --uri="https://<SITE_HOST>/api/cron/retention" \
  --http-method=POST --headers="x-retention-secret=<SECRET from your password manager>" --attempt-deadline=60s
gcloud scheduler jobs run fel-retention-daily --project=final-evolution-lab --location=us-central1
```

Then read the run in the Cloud Scheduler console (or
`curl -sS -X POST -H "x-retention-secret: <SECRET>" https://<SITE_HOST>/api/cron/retention`).

**You should see:**
`{"ok":true,"partyReportsDeleted":0,"creatorInquiriesDeleted":0,"partyReports":"purged","creatorInquiries":"purged"}`.

**If not:**

- `503`: the secret or the `firebase.json` line did not reach the deployed function (§7.1, §7.2).
- `401`: the header's value differs from the secret.
- `"unavailable"`: that table does not exist yet (§6).

**Undo:** `gcloud scheduler jobs pause fel-retention-daily --location=us-central1 --project=final-evolution-lab`, or
`... jobs delete ...`. Rows already deleted stay deleted.

**Not scheduled, on purpose:** `POST /api/arena/reclaim` (`ARENA_RECLAIM_SECRET`). The arena already reclaims on read.
`docs/SHIP-READINESS.md` §6 call 5 recommends leaving it unscheduled.

---

## 8. netd redeploy for parties

The party (`/party`, PARTY-CHAT) rides `fel-netd` on Cloud Run. An old netd answers "room and peer required", and the
app shows "Parties need a server update". Full steps: `server/netd/README.md`, "Owner's redeploy steps".

### 8.1 The ticket secret — **[PROD WRITE]**

**Run:**

```sh
openssl rand -base64 48       # into your password manager
printf '%s' '<the secret>' | gcloud secrets create party-ticket-secret --data-file=- --project final-evolution-lab
gcloud run services describe fel-netd --region us-central1 --project final-evolution-lab \
  --format='value(spec.template.spec.serviceAccountName)'
# empty output = the default compute service account, <PROJECT_NUMBER>-compute@developer.gserviceaccount.com
gcloud secrets add-iam-policy-binding party-ticket-secret --project final-evolution-lab \
  --member serviceAccount:<netd runtime SA> --role roles/secretmanager.secretAccessor
```

**Where it lives:** Secret Manager `party-ticket-secret`, and the same value as `PARTY_TICKET_SECRET` in the deploy
tree's production env file (§10). **The two copies must match**, or every party ticket is refused.

**If `create` says it already exists:** keep the existing secret, and take its value for §10 from wherever you stored
it. Do not create a second one.

**Undo:** `gcloud secrets delete party-ticket-secret --project final-evolution-lab`, after rolling netd back.

### 8.2 Deploy netd — **[DEPLOY]**

**Run** (from `<DEPLOY_TREE>/FEL-full-app`):

```sh
gcloud run deploy fel-netd --source server/netd --project final-evolution-lab --region us-central1 \
  --allow-unauthenticated --min-instances 1 --max-instances 1 --session-affinity --timeout 3600 \
  --set-secrets PARTY_TICKET_SECRET=party-ticket-secret:latest
curl -s https://<netd url>/healthz
```

**You should see:** the deploy prints the service URL, and `/healthz` includes `"features":["party1"]`.

**If not:** `/healthz` without `party1` means the old image is still serving. Check the revision in the Cloud Run console.

Keep `--max-instances 1`: a party lives in one instance's memory, and a second instance would split it.

**Undo:**

```sh
gcloud run services update-traffic fel-netd --to-revisions <previous revision>=100 --region us-central1
```

The old netd again shows "Parties need a server update". Nothing else changes.

assumption: the new netd still serves the online play that the currently deployed app uses (`?net=`). The README treats
the redeploy as safe before the app deploy. Check one online match after §11.

### 8.3 The party room is a different service

The couch party room, `/play/party` (Controller Link), does not use netd. With more than one app instance it needs
`CONTROLLER_LINK_KV_URL` and `CONTROLLER_LINK_KV_TOKEN` (Upstash; the **read-write** token), or phones hang
(`docs/DEPLOY-CHECKLIST-PARTY.md` §2–§4). `firebase.json` allows 1–4 instances. Check them in §10.

---

## 9. The Studio-save deploy session (PR #373)

From `docs/NEXUS-STUDIO-SAVE.md` §7 (on `lane/studio-save`). Steps 1–6 happen in this session. Step 7, the switch, is a
later deploy.

| Its step | Where it happens here |
|---|---|
| 1. Merge #373 | §1 |
| 2. Preview: the diff must equal `prisma/pending/2026-10-17-studio-project-save.sql` (its `CREATE TABLE` and FK) | §4 (alongside the others) |
| 3. Apply exactly that file — **[IRREVERSIBLE]** | §5, file 15 |
| 4. Verify: the diff is empty | §5.4 |
| 5. Deploy, after `git checkout -- public/_prisma/client yarn.lock`. The committed client already knows `studioProjectSave`. **Do not regenerate it on the deploy machine** | §2 and §11 |
| 6. Verify live with the switch **off** | §11.3 |
| 7. The switch | below |

### 9.1 The switch (a later session) — **[DEPLOY]**

`STUDIO_CLOUD_SAVE_ENABLED=1` does nothing on its own. `lib/flags.ts` `isStudioCloudSaveEnabled()` requires
**`NEXUS_STUDIO_ENABLED` as well**. Turn it on only when all three hold:

1. **The privacy-policy text is live.** `docs/NEXUS-STUDIO-SAVE.md` §8 has the exact §1, §2 and §4 text and the version
   bump. `lib/policies.ts` is **not** edited yet. You read it, approve it, and a lane lands it as its own PR, which you
   merge and deploy. (This runbook does not touch policy copy.)
2. **The Studio itself is open.** `/studio` is held: `NEXUS_STUDIO_ENABLED` is unset, so `notFound()`
   (`docs/SHIP-READINESS.md` §2). Opening it is a separate call. Also note the save lane's finding: at 390 px the Studio
   overflows the phone viewport by 345 px.
3. Steps 1–6 passed.

Then add `STUDIO_CLOUD_SAVE_ENABLED=1` (next to `NEXUS_STUDIO_ENABLED=1`) to the production env file, and deploy as in
§11. With a test adult and a test teen: save, list, load on a second browser, a stale-revision 409, delete. With a
test under-13 (or unknown-age) account: a 403.

**Undo:** remove the line and redeploy. The device save is unaffected. What was saved stays readable, exportable and
deletable.

---

## 10. The production env file

**Server values reach production only through the deploy tree's env file** (`.env.production` or `.env.local`). The
packager ships it with the function (`docs/LANES.md` §4). `firebase.json` names only secrets. So "set an env var" means
"edit this file, then deploy". `NEXT_PUBLIC_*` values are baked in at `next build`, so they must be in the file before
the deploy runs.

### 10.1 Check what is set, without printing values

```sh
for v in DATABASE_URL DIRECT_URL NEXTAUTH_URL NEXTAUTH_SECRET PARTY_TICKET_SECRET NEXT_PUBLIC_NETD_URL \
         CONTROLLER_LINK_KV_URL CONTROLLER_LINK_KV_TOKEN FEEL_PANEL_ENABLED FEEL_PANEL_USERS NEXUS_STUDIO_ENABLED STUDIO_CLOUD_SAVE_ENABLED \
         COACH_STORE_LIVE ARENA_RECLAIM_SECRET CREATOR_MEDIA_BUCKET CREATOR_MEDIA_PUBLIC_BUCKET LIVE_STREAM_SCHEDULE_ENABLED \
         NEXT_PUBLIC_FEL_BODY_RIDE ABACUS_ENABLED COACH_STORE_ENABLED COACH_STORE_PAYMENTS_ENABLED COACH_STORE_COACH_USER_IDS \
         COACH_STORE_RECONCILE_SECRET COACH_REVIEWS_BUCKET COACH_REVIEW_UPLOADS_ENABLED FACE_SCAN_ENABLED \
         VIRTUAL_PURCHASES_ENABLED PAYOUTS_ENABLED STRIPE_BOOKS_SECRET_KEY RETENTION_CRON_SECRET \
         NEXT_PUBLIC_JOIN_LAB_ENABLED FEL_TEST_ACCOUNTS; do
  grep -qE "^${v}=" .env.production && echo "SET    $v" || echo "unset  $v"
done
```

### 10.2 Add or change for this deploy

| Variable | Value | Why |
|---|---|---|
| `PARTY_TICKET_SECRET` | the §8.1 secret (from your password manager) | the app seals party tickets that netd opens |
| `NEXT_PUBLIC_NETD_URL` | `wss://<netd url>` | build-time. If it is already set to the same netd, leave it |
| `CONTROLLER_LINK_KV_URL`, `CONTROLLER_LINK_KV_TOKEN` | from the Upstash console | only if unset. The party room across 1–4 instances (§8.3) |
| `FEEL_PANEL_ENABLED` | `1` | the feel panel (§12). It does nothing until your user id is on `FEEL_PANEL_USERS` |
| `FEEL_PANEL_USERS` | `<your user id>` | comma list of exact user ids that may open the feel panel (§12). Opens nothing else |
| `PARTY_TURN_URLS`, `PARTY_TURN_SECRET` | optional | a TURN relay for voice across strict NATs. Leave unset unless the two-phone test (§13) fails on mobile data |

**Leave unset:** `STUDIO_CLOUD_SAVE_ENABLED` (§9.1).

**Undo:** remove the line and redeploy.

### 10.3 The 20 env vars no `.env.example` names

From `docs/SHIP-READINESS.md` §3.4: six are read by production code and named in no doc. Fourteen are named in a doc
but missing from `.env.example`. **All 20 default to off or closed when unset.** None is needed for a game-only web
launch except the retention secret.

| Variable | What it controls | Launch value | Unset means | Where the value lives if set |
|---|---|---|---|---|
| `RETENTION_CRON_SECRET` | the daily retention route (§7) | **needed**: set it as a secret (§7.1). Not in the env file | the route answers 503 and deletes nothing, which breaks the policy's 12-month promise over time | Secret Manager + `firebase.json` |
| `COACH_STORE_RECONCILE_SECRET` | `POST /api/coach-store/reconcile` | already a secret in `firebase.json`; leave as is | — | Secret Manager |
| `COACH_STORE_LIVE` | lets a **live** Stripe key be used | **unset**. Set it only on the day real money is meant to flow | only test keys are accepted | env file |
| `COACH_STORE_ENABLED` | the coach store pages | unset (the store is not opening at launch) | `/coach/[slug]/**` and `/account/bookings` 404; their links are hidden | env file |
| `COACH_STORE_PAYMENTS_ENABLED` | coach-store checkout (test mode only) | unset | no checkout | env file |
| `COACH_STORE_COACH_USER_IDS` | the coach allowlist (comma-separated ids) | unset | nobody is a coach (fails closed) | env file |
| `COACH_REVIEWS_BUCKET` | the private clip bucket for async review | unset | no review uploads | env file (a GCS bucket name) |
| `COACH_REVIEW_UPLOADS_ENABLED` | signed upload URLs for video review | unset | off | env file |
| `PAYOUTS_ENABLED` | `POST /api/stripe/payout` | unset | 503. It stays 503 even when on: no transfer exists yet | env file |
| `VIRTUAL_PURCHASES_ENABLED` | the shard and wallet checkouts | unset unless you sell virtual items at launch | `payments_not_set_up` / store closed | env file |
| `STRIPE_BOOKS_SECRET_KEY` | **obsolete.** `lib/books/bookCheckout.ts`: "There is no separate STRIPE_BOOKS_SECRET_KEY any more" (books use the platform Stripe account) | unset; delete it if present | — | — |
| `CREATOR_MEDIA_BUCKET` | creator uploads, the pending bucket (private, 30-day lifecycle on `pending/`) | unset unless creator uploads launch | uploads say "coming soon" | env file (a GCS bucket name) |
| `CREATOR_MEDIA_PUBLIC_BUCKET` | creator uploads, the public-read bucket with CORS | unset, as above | same | env file |
| `LIVE_STREAM_SCHEDULE_ENABLED` | `/live/schedule` | unset | 404 | env file |
| `ABACUS_ENABLED` | the kill switch for every Abacus.AI call | unset (no user data leaves) | AI routes answer the coming-soon 503 | env file |
| `FACE_SCAN_ENABLED` | the Closet's face scan (and its Google model download) | unset | no face scan, no download | env file |
| `NEXT_PUBLIC_JOIN_LAB_ENABLED` | the "Join the Lab" email form on `/` | unset (on only if exactly `true`) | form hidden, intake closed | env file (build-time) |
| `FEL_TEST_ACCOUNTS` | comma-separated ids or emails whose runs pay nothing | optional. Unset in production uses the default `playtest@fel.local` | the default list | env file |
| `ARENA_RECLAIM_SECRET` | `POST /api/arena/reclaim` | unset (recommended; §7.3) | the route is a 404; the arena reclaims on read | Secret Manager + `firebase.json`, if ever |
| `NEXT_PUBLIC_FEL_BODY_RIDE` | a probe-only ride profile | **unset in production** | normal input | — |

`K_REVISION` and `VERCEL_GIT_COMMIT_SHA` are set by the platform: nothing to do.

`docs/SHIP-READINESS.md` §6 call 6 recommends that a lane add these 20 names, empty and with one comment each, to
`.env.example`. That has not been done.

---

## 11. Deploy the app — **[DEPLOY]**

One deploy carries: the merged PRs, the `firebase.json` secret line, and the env file from §10.

### 11.1 Pre-flight (all must be true)

- [ ] §5.4 verify passed. §6 tables exist.
- [ ] `RETENTION_CRON_SECRET` exists (§7.1), and `firebase.json` names it (§7.2).
- [ ] netd `/healthz` shows `party1` (§8.2).
- [ ] The env file has the §10.2 lines.
- [ ] `git status --short` is clean apart from your deliberate edits. `public/_prisma/client` is unmodified.
- [ ] No dev server is serving `.next` from this tree (`lsof -nP -iTCP -sTCP:LISTEN | grep node`).

### 11.2 Run

```sh
git checkout -- public/_prisma/client yarn.lock
npx -y firebase-tools@latest deploy --only hosting --project final-evolution-lab --force
```

**You should see:** the build, then `Deploy complete!` with the hosting URL. Firebase's warning that "custom build is
being ignored" is normal (`docs/DEPLOY-NOTES-PRISMA.md`).

**If not:**

- **A secret error:** §7.1.
- **A build error:** stop. Production still runs the previous deploy. Nothing is half-shipped.

### 11.3 Verify live (read-only)

| Check | Run | Good |
|---|---|---|
| Up | `curl -s https://<SITE_HOST>/healthz` | `{"ok":true,"service":"fel","release":"<a new revision>",...}` |
| Studio-save reads (switch off) | signed in, open `https://<SITE_HOST>/api/studio/projects` | `200` with `"saving":{"enabled":false,...}`, **not** `503` (a 503 means the table is missing: §5) |
| Account export | Profile → download your data, or `/api/account/export` | the JSON has `"studioProjects": []` |
| Coach thread (`readAt`) | open a coach thread you are in (Coach → messages) | it loads and a message posts. A 500 means file 13 is missing (§5.2) |
| Party | `/party` on one phone | no "Parties need a server update" |
| Feel panel endpoint | signed in, `https://<SITE_HOST>/api/feel-panel` | `{"enabled":false}` until §12, then `{"enabled":true}` |
| Retention route | `curl -s -X POST https://<SITE_HOST>/api/cron/retention` (no header) | `401` (the secret is live). `503` means §7.1 or §7.2 is missing |
| A game | `/try` on your phone | the dunk loads and plays |

Then crash logs for the first hour (read-only). assumption: the function logs to Cloud Logging under
`final-evolution-lab`:

```sh
gcloud logging read 'textPayload:"[FEL-CRASH]" OR jsonPayload.message:"[FEL-CRASH]"' --project final-evolution-lab --freshness=1h --limit 50
```

### 11.4 Undo

- **Clean rollback:** in the deploy tree, `git checkout --detach <ROLLBACK_SHA>` (from §2), restore the env file's
  previous lines, `git checkout -- public/_prisma/client yarn.lock`, and deploy again.
- **Fast rollback:** in the Cloud Run console (or `gcloud run services list --project final-evolution-lab --region
  us-central1` to find the SSR service), route 100% of traffic to the previous revision. assumption: the frameworks
  backend is the one Cloud Run service whose name starts with `ssr`.
- The SQL from §5 and §6 stays. The old code ignores the new tables.

---

## 12. Turn on the feel panel for you — **[PROD WRITE]**

From `docs/FEEL-PANEL.md` (branch `lane/feel-panel`). What it requires, read from the code:

1. **The flag:** `FEEL_PANEL_ENABLED=1` (§10.2). `1`, `true`, `on` and `yes` count. It is read per request.
2. **Your user id on `FEEL_PANEL_USERS`** (owner decision 2026-10-20). A comma list of exact user ids, matched
   case-sensitively. It opens the feel panel and nothing else — no role change and no database write. (An account whose
   `User.role` is `admin` also passes, but you do not need that for the panel.)
3. **A playtest run:** overrides apply only on `/play/<mode>?playtest=1`, and never on an arena, challenge, ladder,
   story, carnival, online, party or agent run (`lib/feel-panel/sessionGate.ts`). A playtest run pays nothing and
   records no `GameSession`.

### 12.1 Run

1. Signed in on the live site, open `https://<SITE_HOST>/api/auth/session` and copy `user.id`.
2. Add `FEEL_PANEL_ENABLED=1` and `FEEL_PANEL_USERS=<that id>` to the production env (§10.2). They ship with the deploy
   in step 11.

**You should see:** `/api/feel-panel` answers `{"enabled":true}` for you (and `{"enabled":false}` for everyone else).
On `/play/threevthree?playtest=1` a slim **FEEL** tab sits on the left edge.

**If not:**

- Still `{"enabled":false}`: check both lines are in the env file that shipped (§10.1), and that the id matches exactly.
- No FEEL tab on a normal run: that is correct. The sheet opens but says "NOT applied here". Use `?playtest=1`.

**The diagnostics reader** (`/api/admin/diag`, used by the device checklist) still needs `User.role = 'admin'`. That is
a separate, optional PROD WRITE: `SELECT id, email, role FROM "User" WHERE email = '<your sign-in email>';` (note the
old role), then `UPDATE "User" SET role = 'admin' WHERE id = '<your id>';`. **Flag:** `admin` also unlocks the CRM, the
coach knowledge-base drafts and `POST /api/competition/void`.

**Undo:** remove `FEEL_PANEL_ENABLED` / `FEEL_PANEL_USERS` and redeploy (and, if you set it, `UPDATE "User" SET role =
'<the old role>' WHERE id = '<your id>';`). Values saved on your phone stay there and do nothing.

---

## 13. Device checks (read-only)

1. **The party, on two phones on different networks** (one on mobile data): `/party` → Start a party → the other phone
   joins by code → quick chat → typed chat (18+ accounts) → Join voice both ways → host taps Start together → both land
   in the match. If voice fails only on mobile data, that is the TURN relay (§10.2).
2. **The couch party room:** `/play/party` on a laptop or TV, two phones join as controllers
   (`docs/DEPLOY-CHECKLIST-PARTY.md` §4, the five-minute test).
3. **The feel panel:** one playtest run, move one slider, tap **Copy values**, paste them to a lane.
4. **The per-mode phone pass:** `docs/DEVICE-TEST-CHECKLIST.md`. Its diagnostics land in `game_diag`. That file says how
   to read them back.

---

## 14. Close the session

```sh
unset PROD_DIRECT_URL
rm -f /tmp/prod-diff.sql /tmp/check.sql
git -C <DEPLOY_TREE> status --short       # only your deliberate env edits; never commit the env file or .firebase/
```

Write down, for the next session:

- the deployed commit;
- the netd revision;
- which pending files you applied;
- that the Scheduler job exists.

Then tick the ops rows in `docs/LAUNCH-CHECKLIST.md` §C.

---

_Sources: `docs/SHIP-READINESS.md` §3 and §6; `docs/NEXUS-STUDIO-SAVE.md` §0, §7, §8 and §10 on `origin/lane/studio-save`;
`docs/FEEL-PANEL.md`, `app/api/feel-panel/route.ts`, `lib/feel-panel/sessionGate.ts` and the `lib/flags.ts` diff on
`origin/lane/feel-panel`; `docs/RETENTION-JOB.md`; `server/netd/README.md`; `docs/DEPLOY-CHECKLIST-PARTY.md`;
`docs/LANES.md` §4; `docs/DEPLOY-NOTES-PRISMA.md`; `firebase.json`; the headers of every `prisma/pending/*.sql`;
`prisma/schema.prisma` (which pending models it has); `lib/admin/requireAdmin.ts`; `lib/auth.ts` (role refresh);
`lib/sessions/runEligibility.ts` (`FEL_TEST_ACCOUNTS`); `lib/books/bookCheckout.ts` (`STRIPE_BOOKS_SECRET_KEY`);
`app/api/health/route.ts`; `components/reliability/global-error-boundary.tsx` and `app/api/telemetry/crash/route.ts`
(`[FEL-CRASH]`)._
