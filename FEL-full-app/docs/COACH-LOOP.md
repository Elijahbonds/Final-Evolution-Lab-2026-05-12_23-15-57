# Coach loop (platform roadmap P1) — what shipped, and what waits on the owner

Lane `lane/coach-loop`, 2026-10-20 to 2026-10-23. Owner decisions: COACHES / ATHLETES / PLATFORM / DOCS AUDIT of
2026-10-20, and the four answers of 2026-10-23 (below). Everything here is off or fail-closed until the owner acts:
email needs `EMAIL_ENABLED=true` and the mailbox set up (§2); teens on rosters need the new consent wording live (§1);
named groups need a schema lane (§3).

What the lane built, in one line each: a typed invite code beside the link (`/coach/join`); the mailer `lib/mail`
(Gmail API, no package); email invites and bulk team import (paste or CSV); assign a program to a group from `/coach`;
compliance alerts (missed sessions) on the attention board with an on-demand digest; the guardian's training-only report
for teens; the teen gate on roster join and coached training; `/coach` at 390 px. Templates, duplicate, the per-coach
library and the QR already existed.

---

## 1. Consent: teens on a coach's roster (owner, 2026-10-23: "ask guardians again")

### The rule in code today

A 13–17 account joins a roster, logs sets or taps the cool-down only with an accepted `GuardianConsent` that was **asked
under the coach-training wording**. A consent asked under today's wording (the guardian is told their yes lets "a camp
plan their coach builds with them" go live, `lib/consent/guardianGate.ts` `GUARDIAN_CONSENT_COVERS`) does not count.
Under 13: never. Blank birth year: asked for first. Adults: unaffected.

`GuardianConsent` records no wording, version or scope — only `requestedAt`, `acceptedAt`, `revokedAt`. So without a
schema change the only way to tell a coach-training consent from an old one is when it was requested:
`lib/coach/coachConsent.ts` `COACH_TRAINING_CONSENT_SINCE`, the day the new wording went live. **It is `null`: every
teen fails closed today**, on the roster join, the set log, the cool-down and the guardian report. A refused teen reads
"A parent or guardian needs to approve coach training before you can train with a coach here." with no link, because no
request they could send today would satisfy the gate.

### Go-live steps (after the owner approves the wording below)

1. Put the approved words in `GUARDIAN_CONSENT_COVERS` (`lib/consent/guardianGate.ts`), so the guardian's accept
   screen (`app/consent/guardian/[token]`) and the player's request screen say them. Update
   `tests/camp/guardian-page-copy.test.ts` to match.
2. Let a teen whose current consent is accepted but older than the new wording send a new request from
   `/consent/guardian` (today that page says "You're all set" to anyone with an accepted consent).
3. Set `COACH_TRAINING_CONSENT_SINCE` to the go-live day of steps 1, 2 and 4 (a UTC midnight on or after the deploy). From then
   on, `teenGateBody` sends a refused teen to `/consent/guardian`.
4. Build the guardian's withdraw path the wording below promises. **None exists today**: nothing in `app/` or `lib/`
   writes `GuardianConsent.revokedAt` (searched 2026-10-23); every reader already honours it. Until it exists, drop the
   last paragraph of the wording.
5. assumption: the request date is a sound proxy only because steps 1–4 ship together. A `covers` (or `wordingVersion`)
   column on `GuardianConsent` would make it exact; that is a schema change for a schema lane.

### Proposed wording — FOR THE OWNER'S APPROVAL, NOT LIVE

For the guardian's accept screen and email (replaces the single `camp_plan` line; the list joins as today's
`guardianConsentAsk` does):

> FEL is a training app. Before **{name}** can join a coach's roster and train with them here, we ask a parent or
> guardian to confirm that's OK.
>
> If you say yes:
> - **{name}** can join a coach's roster on FEL, and that coach can write their training programs.
> - FEL saves **{name}**'s training: the sets they log (exercises, reps, weights, effort), the sessions they complete, the
>   goals they set and how far through each program they are. Their coach sees it.
> - You can get a training report by email: sessions and sets done, nothing measured about the body.
> - A camp plan their coach builds with them can go live.
>
> What a yes never unlocks: Mirror scans, pain check-ins, daily check-ins and any health data are saved only for players
> 18 and over, with or without your yes.
>
> You can withdraw this at any time from the link in this email; **{name}**'s coach then stops seeing new training, and
> the report links stop working.

Policy text the same rule needs (owner and counsel; not drafted here): Privacy §1 (training logs of 13–17s), §2 (who
sees them: the coach), §5 (the minor rules: training is not health data; what a guardian's yes unlocks), and the
guardian's email used for reports; Terms §2 (13–17 on a coach's roster only with a guardian's consent).

---

## 2. Email: the Google Workspace service account (owner, 2026-10-23)

`lib/mail` sends through the Gmail API with a service account that acts as the sending mailbox (domain-wide
delegation). No package. Nothing is sent unless `EMAIL_ENABLED` is exactly `true`; with it off, invites still have their
link and code and alerts stay on the board.

### One-time setup (the owner's ops session)

1. **Google Cloud** (project `final-evolution-lab`): APIs & Services → enable the **Gmail API**.
2. IAM & Admin → Service accounts → **Create**, e.g. `fel-mailer`. No project roles are needed. Open it → Keys → Add key
   → **JSON**. Keep the file out of the repo and delete the local copy once step 5 is done.
3. Note the service account's **OAuth 2 client ID** (the numeric "Unique ID" on its details page).
4. **Google Workspace admin console** (admin.google.com) → Security → Access and data control → API controls → **Manage
   domain-wide delegation** → Add new: the client ID from step 3, scope exactly
   `https://www.googleapis.com/auth/gmail.send`. No other scope.
5. **Environment** (Secret Manager / the hosting env, never a commit):
   - `MAIL_FROM` — the Workspace mailbox that sends (the service account acts as this user).
   - `MAIL_FROM_NAME` — optional; default "Final Evolution Lab".
   - `GOOGLE_MAIL_SA_EMAIL` — the JSON key's `client_email`.
   - `GOOGLE_MAIL_SA_PRIVATE_KEY` — the JSON key's `private_key`, on one line with `\n` escapes.
   - `MAIL_TRANSPORT` — `gmail_api` (default); `log` only writes "one message accepted" to the server log.
   - `NEXTAUTH_URL` — already set; every link in an email is built from it, never from a request.
6. **Deliverability:** the Workspace domain should have SPF and DKIM on (admin console → Apps → Google Workspace →
   Gmail → Authenticate email) and a DMARC record.
7. **First send:** set `EMAIL_ENABLED=true`, then send yourself an invite from `/coach` → "Email an invite". With
   anything missing, the server logs `[mail] not sent: missing <NAMES>` and the coach sees "email is off".

Limits in code: 150 invite emails per coach per day, 5 alert digests per coach per day, 2 guardian reports per athlete per
day (in-memory per server instance).

---

## 3. Named groups (owner, 2026-10-23: yes — for a schema lane)

Today "assign to a group" offers Everyone or the athletes who already share a program name. A named group a coach keeps
(a team, a class) needs two tables. **Not applied by this lane**: no edit to `prisma/schema.prisma`, no file in
`prisma/pending/`. A schema lane lands it through db-guard.

### Proposed models

```prisma
model CoachGroup {
  id        String             @id @default(cuid())
  coachId   String
  coach     User               @relation("CoachGroups", fields: [coachId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime           @default(now())
  members   CoachGroupMember[]

  @@unique([coachId, name])
}

model CoachGroupMember {
  groupId  String
  group    CoachGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  /// A roster athlete (CoachClient.clientId). No relation to User: membership is read through the coach's live roster,
  /// so an athlete who leaves the roster drops out of every group without a cascade.
  clientId String
  addedAt  DateTime   @default(now())

  @@id([groupId, clientId])
  @@index([clientId])
}

// and on model User:
//   coachGroups CoachGroup[] @relation("CoachGroups")
```

### Proposed pending SQL (`prisma/pending/<date>-coach-groups.sql`)

```sql
-- COACH-LOOP named groups (owner 2026-10-23). ADDITIVE ONLY: two new tables, their indexes and one foreign key.
-- Nothing existing is changed or dropped. ROLLBACK (loses the groups): DROP TABLE "CoachGroupMember"; DROP TABLE "CoachGroup";

-- CreateTable
CREATE TABLE "CoachGroup" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachGroupMember" (
    "groupId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachGroupMember_pkey" PRIMARY KEY ("groupId","clientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachGroup_coachId_name_key" ON "CoachGroup"("coachId", "name");

-- CreateIndex
CREATE INDEX "CoachGroupMember_clientId_idx" ON "CoachGroupMember"("clientId");

-- AddForeignKey
ALTER TABLE "CoachGroup" ADD CONSTRAINT "CoachGroup_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachGroupMember" ADD CONSTRAINT "CoachGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CoachGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

The schema lane should confirm the statements with a read-only
`prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`, as the other
pending files describe. After it lands: a groups panel on `/coach` (create, add from the roster, rename, delete), and
`AssignProgram` (`components/coach/assign-program.tsx`) offers the named groups beside the implied ones; every write
stays restricted to the coach's live roster (`lib/coach/rosterLookup.ts`).

---

## 4. Compliance alerts: the threshold (owner-confirmed 2026-10-23)

An athlete gets a "missed" alert at **2 or more planned sessions missed in the last 7 days** (`MISSED_ALERT_MIN` in
`lib/coach/alerts.ts`), against the active programs' plan, skipping programs under a week old and recovery days. A
plain constant: the feel panel tunes game feel, and wiring a coach setting into it was not cheap.

## 5. Next (not in this lane)

Scheduling and a calendar for roster sessions (the coach store's `slots.ts` / `ics.ts` are the base); the AI-drafted
program (roadmap Q10); a daily automatic alert digest (needs a scheduler; none runs FEL jobs); routing
`lib/coach-store/email.ts` `sendCoachMail` through `lib/mail` (launch-sales' file).
