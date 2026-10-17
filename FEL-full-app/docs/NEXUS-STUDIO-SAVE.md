# Nexus Studio: saving projects to the account

**Owner, 2026-10-17:** "Studio: save to account." The design (this file's first version, `b825e5fd`) put ten questions
to the owner. The owner answered them the same day (§0), and `lane/studio-save` built it.

**Built, on the lane:**
- the table in the schema and the regenerated committed client;
- the pending SQL file;
- the routes and their Prisma store;
- the switch;
- the account export entry;
- the Studio's account panel.

**Waiting for the owner, and not done here:**
1. Applying the SQL to production, in the deploy session that carries the route (§7).
2. The privacy-policy text, written out in §8 for the owner to read first. `lib/policies.ts` is **not** edited.
3. Turning the switch (`STUDIO_CLOUD_SAVE_ENABLED`) on.

Nothing has been run against any database here.

Read with `docs/NEXUS-STUDIO.md` (§2 for the document, §2.1 for the device save), `docs/LANES.md` §4 (production schema
changes) and `/CLAUDE.md` (the `public/_prisma/client` trap).

---

## 0. The owner's answers (2026-10-17)

| Q | Asked | Answer | Where it lives |
|---|---|---|---|
| Q0 | A new table? | **Yes, `StudioProjectSave` as proposed** | `prisma/schema.prisma`, `prisma/pending/2026-10-17-studio-project-save.sql` |
| Q1 | Who may save to the account? | **Teens 13+ and adults**. The design had recommended adults only; the owner chose teens too. Under 13 and an unknown age stay refused | `cloudSave.ts` `STUDIO_SAVE_AUDIENCE = 'teens-and-adults'` |
| Q2 | Look codes in the account copy? | **Never stored** | `LOOK_CODES_IN_ACCOUNT = false`, `prepareUpload`, `restoreLookCodes` |
| Q3 | Two devices change one project | **Auto-merge, otherwise keep both** | `mergeProjects`, `cloudSync.ts resolve` / `keepBothSides` |
| Q4 | Caps | **1 MiB per project, 20 projects, 8 MiB per account; 12 writes a minute and 1,500 a day** | `CLOUD_LIMITS`, `CLOUD_RATE` |
| Q5 | Retention | **Until the user deletes the project or the account; no inactivity purge** | `ON DELETE CASCADE`; no purge job |
| Q6 | Privacy policy | **The §1, §2 and §4 bullets plus a version bump. The owner sees the exact text before it lands** | §8 here; `lib/policies.ts` untouched |
| Q7 | Account export | **Include saved projects in `/api/account/export`** | `lib/account/exportData.ts` `studioProjects` |
| Q8 | When the SQL is applied | **In the same session as the deploy that carries the route** | §7 |
| Q9 | The switch | **A new server flag `STUDIO_CLOUD_SAVE_ENABLED`, off by default, on top of `NEXUS_STUDIO_ENABLED`** | `lib/flags.ts` `isStudioCloudSaveEnabled` |

**The age line.** "13+" uses the same careful line as the AI builder (`aiAccess.ts`, from `lib/privacy/ageScreen.ts`).
Only the birth year is stored, so:

- a year gap of 14 or more is certainly 13 or over: **allowed**;
- a gap of exactly 13 may still be a 12-year-old: **refused**;
- an unknown year is **refused**.

The age is read from `User.dobYear` in the database, never from the session or the request body.

---

## 1. Today, and the precedent

- **The device save is unchanged.** `localStorage['fel.nexusStudio.v1']` still holds the working project, autosaved
  1.5 s after the last edit (`storage.ts`, `use-studio.ts`), and the `.nexus.json` export and import are unchanged.
- **The account copy is a second layer.** When it is offline, refused, over quota or switched off, the device copy is
  exactly what it was.
- **The precedent is `AdventureSave`.** It used the same pattern: one additive table with a versioned, sanitised JSON
  document and `ON DELETE CASCADE` from `User`, hand-written SQL applied by the owner, then the model with the
  regenerated client (`e8be09a9`).

---

## 2. The table

`prisma/schema.prisma` (commit `fe5064a8`) has the relation on `User` and this model:

```prisma
// on User:
  // STUDIO SAVE (owner-approved 2026-10-17): Nexus Studio projects saved to the account. See StudioProjectSave below.
  studioProjectSaves StudioProjectSave[]

model StudioProjectSave {
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  projectId String   /// StudioProject.id: minted on the device; unique per account, not across accounts
  name      String   /// StudioProject.name (≤ 60), so the list never reads a document
  version   Int      /// STUDIO_DOC_VERSION of `doc`
  rev       Int      /// the server revision: 1 on create, +1 on every write
  bytes     Int      /// UTF-8 bytes of `doc`'s JSON as written: the quota reads this, never the documents
  doc       Json     /// the sanitised StudioProject, with no look codes
  createdAt DateTime @default(now())
  updatedAt DateTime @default(now())

  @@id([userId, projectId])
}
```

Why it has this shape:

- **The key is `(userId, projectId)`.** The device and the account name a project the same way, and every query is
  scoped to one account by the key's first column.
- **`rev`** gives optimistic concurrency.
- **`name` and `bytes`** let the list and the quota run without loading a document.
- **`onUpdate: NoAction`** matches the SQL's foreign key (the AdventureSave lesson).
- **`updatedAt` uses `@default(now())`** and the store sets it on each write, so it matches the SQL's
  `DEFAULT CURRENT_TIMESTAMP`.

**The SQL** is `prisma/pending/2026-10-17-studio-project-save.sql`:

- one `CREATE TABLE` with `CONSTRAINT "StudioProjectSave_pkey" PRIMARY KEY ("userId","projectId")`;
- one foreign key, `ON DELETE CASCADE ON UPDATE NO ACTION`;
- a rollback line.

It is written in `prisma migrate diff`'s own style, so the verify step can print an empty migration.
**assumption:** it equals what `migrate diff` prints for this model. No Prisma command was run against any database
here; the preview step (§7) checks it before anything is applied. `lib/nexus-studio/cloudStore.test.ts` pins that the
SQL creates exactly the model's columns and key, with the cascade and the rollback line.

**The committed client** (`public/_prisma/**`, commit `fe5064a8`) was regenerated with the repo's own commands:
`node scripts/copy-prisma-schema.mjs`, then `npm run prisma:generate`. It used prisma 6.7.0, the pinned version, and
needed no download.

The committed client had been generated on a Mac, and this machine is Linux. A control run on the **unchanged** schema
measured exactly what a Linux generate changes:

- the `native` target value in `index.js` and `edge.js`;
- the darwin engine's two annotation lines in `index.js`.

Putting those lines back made the control byte-identical to HEAD. The same mechanical restore was applied after the
real generate, so the client diff is the new model only. Checked:

- **The embedded data model:** one new model and one new `User` relation field; enums and types equal.
- **The files:** the same seven as `e8be09a9`.
- **The engines:** both byte-identical (sha256), including `libquery_engine-debian-openssl-3.0.x.so.node`, which Cloud
  Run loads.
- **The guards:** `scripts/prisma-artifact-tests.ts` 5/5 and `lib/db/prismaSchemaSync.test.ts` 5/5.

The restore script is
`/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/round5/studio-save/restore-mac-platform-lines.mjs`.

**Account deletion needs no new code.** There is no in-app account deletion today (Privacy §4: by email). Deleting
the `User` row cascades to every saved project, and `cloudStore.test.ts` pins the cascade in both the schema and the SQL.

---

## 3. Sizes, caps and quotas

Measured with projects built the editor's way and run through the real `sanitizeProject` and `prepareUpload`. The
script is
`/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/round5/studio-save/measure-sizes.ts`.

| Project | JSON | gzip | Fits the 1 MiB cap? |
|---|---:|---:|---|
| Starter: 1 venue, 9 objects | 1.9 kB | 0.9 kB | yes |
| Typical: 2 venues, 140 objects, 3 characters, 2 scripts | 27.9 kB | 4.2 kB | yes |
| Six full 600-object venues, 16 characters | 623 kB | 83 kB | yes (639 kB after sanitising) |
| Ten full venues | 1.03 MB | 137 kB | no: 413, still saved on the device |
| The doc `LIMITS` worst case | 6.6 MB | 372 kB | no |

**Caps (Q4):**

- 1 MiB per project, measured after sanitising and stripping look codes;
- 20 projects per account;
- 8 MiB per account;
- 1 MiB + 4 kB per request body, checked before parsing.

Replacing a project counts only the change in size. **A save that makes a project smaller always goes through**, so an
account over a later-lowered cap can still save smaller work.

**Rates (Q4), per account:**

- writes and deletes: 12 a minute, 1,500 a day;
- reads: 60 a minute.

The panel pushes at most every 20 s. The limiter is `lib/rate-limit.ts`, which is per server instance; its header
names the shared store needed if the deployment scales out.

**The quota race is closed.** The design noted that two new projects saved at the same moment could both pass a full
quota. A write now runs in one transaction under a per-account advisory lock (`SELECT pg_advisory_xact_lock(hashtext($1))::text`,
the `lib/sessions/privateHold.ts` pattern). Under that lock the store reads the rows, checks the revision, checks the
quota, then writes. Other accounts never wait.

`cloudStore.test.ts` races two creates into an account holding 19 projects:

- with a stand-in that honours the lock, exactly one is saved and the other is refused `quota_projects`;
- with one that does not, both are saved (21 rows), which is the race the lock closes.

---

## 4. Privacy

**What is stored.** The project as the import gate leaves it (`sanitizeProject`):

- its name;
- its venues: settings, plus each placed object's kind, position, name and colour;
- its scripts;
- its stamps;
- its characters' ids and names.

**Every look code is removed (Q2).** A Closet slot code always carries height and build, and face sliders when the
player asked. The Creator keeps those numbers on the device unless a verified adult opted in, and the account copy must
not become a way round that rule. The device keeps the codes and puts them back by character id when the project comes
down (`restoreLookCodes`). On a device that never had a code, the character appears with its name only.

**What is never stored or sent:**

- a picture or a link;
- account data, age or birth year (the age is read for the write gate only);
- anything to an AI model, to analytics or to logs.

Log lines carry an event name and an error class, never a user id, a name or a document.

**Who can read it.** Only the account that saved it. Every query is scoped by the session's user id, and the key starts
with it. Another account's GET is a 404 and its DELETE removes nothing (tested on the real routes).

**Deleting, exporting and retention.**

- Delete one project from the Studio's panel (`DELETE /api/studio/projects/:id`). Deleting is never behind the switch
  or the age rule.
- Deleting the account removes them all (cascade).
- `/api/account/export` includes `studioProjects` (Q7). If the table is not there yet, the export reads it as none and
  the rest still downloads; any other error is not hidden.
- Kept until deleted (Q5). There is no purge job.
- Cloud SQL's automated backups hold deleted rows until they expire, as for every table. **assumption:** the owner
  knows that retention setting; it is not in the repo.

**Minors (Q1).**

- Teens 13–17 and adults may save. Under 13 cannot hold an account (Terms §2), and an unknown age is refused.
- A refused account sees one neutral line ("Saving to your account isn't available for this account…") that names no
  age. The route answers `403 { error: 'studio_save_unavailable' }`, the AI builder's rule for refusal copy.
- A teen's look codes are stripped like everyone's, so the Creator's `TEEN_DEVICE_LOOK_EVERYWHERE` rule holds.

---

## 5. The API (built)

| Route | File | Answer |
|---|---|---|
| `GET /api/studio/projects` | `app/api/studio/projects/route.ts` | `{ account, saving: { enabled, allowed }, projects: [meta], quota }`, newest first, never a document. `account` is an opaque per-account tag for the device's records, never the id. |
| `GET /api/studio/projects/:id` | `app/api/studio/projects/[id]/route.ts` | `{ project, projectId, name, rev, bytes, updatedAt }`, sanitised again on the way out. An unreadable row answers 422 with its meta, so it can still be deleted. |
| `PUT /api/studio/projects/:id` `{ baseRev, project }` | same | 200 `{ rev, …, stripped, dropped }`, or 409 `{ error: 'conflict', current }`. `current` is null when the project was deleted elsewhere. |
| `DELETE /api/studio/projects/:id` | same | 200 `{ deleted }`, idempotent |

The route files are wiring only:

- each reads the session itself with `getServerSession`, so `lib/api/routeContract.test.ts` sees the guard in every
  route file;
- the handlers are `lib/nexus-studio/cloudRoute.ts`;
- the deps are `lib/nexus-studio/cloudDeps.ts` `studioSaveDeps(userId)`: `prismaProjectStore(prisma)`, the switch,
  `readDobYear` from the database, `rateLimit` and the PII-free log line;
- the store is `lib/nexus-studio/cloudStore.ts`.

**The order of checks for a write:**

1. the switch, before the session is read, otherwise 404;
2. signed in, otherwise 401;
3. the rate limit, otherwise 429 with `Retry-After`;
4. the age from the database, otherwise a neutral 403;
5. the body: size (413), JSON (400), `baseRev` (400), the import gate (422), the URL's id (400), look codes stripped,
   the 1 MiB cap (413);
6. inside the store's lock: the revision (409), then the quota (403 `quota_projects` / `quota_bytes`), then the write.

Reads, lists and deletes need only sign-in and the rate limit. A store failure, such as the table not applied yet, is
a 503 `save_unavailable`, never a 500. Every answer is `Cache-Control: no-store`.

**The switch (Q9):** `isStudioCloudSaveEnabled()` is `NEXUS_STUDIO_ENABLED && STUDIO_CLOUD_SAVE_ENABLED`, off by
default, with one line in `.env.example`. With it off:

- PUT is a 404 before the session is read;
- the list answers `saving.enabled: false`;
- the panel hides, unless the account already has saved projects, which it can still open and delete.

---

## 6. Two devices, offline, and the panel (built)

**The device's half** is `lib/nexus-studio/cloudSync.ts`. It keeps sync records and merge bases **per account** in
localStorage (`fel.nexusStudio.sync.v1`, `fel.nexusStudio.base.v1.*`; every access is wrapped). It talks to the routes
through a fetch client; offline is status 0, never a throw. The steps:

| What the device finds | What happens |
|---|---|
| a project this account has never seen | an **offer**: "Save to my account". Never automatic, so a shared browser's project can never land in another person's account |
| only this device changed it | **pushed**, at most every 20 s, and when the page hides (a keepalive request) |
| only the account's copy changed | **pulled**, as one undoable command, with this device's look codes put back |
| both changed different things | **merged** three ways and saved, as one undoable command ("Undo takes the merge back on this device") |
| both changed the same thing, or no merge base was kept | a **conflict**. The panel opens with **Keep both** first: this device's version is saved as a new project, "… (this device)", *before* the account's copy opens. If that save fails (a full account), nothing changes. Then "Use this device's" and "Use my account's" |
| it was in the account and is not now | "deleted from your account on another device": **Save it again** or **Keep it only on this device**. Never re-uploaded by itself |
| offline | "Offline: saved on this device", and it retries when the browser is back online |

**The panel** is `components/nexus-studio/account-save.tsx`, mounted with one line in the Studio's title bar. It
shows:

- the sync status;
- the offer;
- the conflict choices;
- the saved-projects list (size, quota, Open, Delete).

**Open** asks first when the working project holds work the account lacks. **Delete** asks first, and the device copy
stays. On a phone it is a full-width sheet.

**Screenshots.** These are from the static rig: the esbuild bundle of the whole Studio in Chromium, with
`/api/studio/projects` answered by the **real** handlers over the in-memory store. Files are in
`/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/round5/studio-save/rig/shots/`:

| Shot | What it shows |
|---|---|
| `01-offer.png` | the offer on first open |
| `02-saved.png` | after the click: in the account, 1 of 20 |
| `03-conflict.png` | another device turned the same banner: Keep both first |
| `04-kept-both.png` | three projects: the account's copy at `ry` 2.2, this device's at 1.1 |
| `05-refused.png` | an account the database says is 10: the neutral line, no button, no PUT |
| `06-phone-teen-offer.png` | a 16-year-old on a 390 px phone |
| `07-switched-off.png` | the switch off with nothing saved: no panel |

`facts.json` beside them records every API call. The stored document never contained a look code.

**Finding (not changed here):** at 390 px the Studio itself overflows the viewport by 345 px with the panel closed;
the editor's columns are desktop-sized. The panel sheet stays inside the viewport (x 8, width 374).

---

## 7. The deploy session (Q8: the SQL is applied in the same session as the deploy that carries the route)

Run by the owner, or the deploy owner the owner names, from the deploy tree with the **production** env
(`docs/LANES.md` §4), in this order:

1. **Merge** `lane/studio-save` into `lane/finish-release` (the owner's PR). It carries the model, the regenerated
   client, the pending SQL, the routes and the panel. The switch is off.
2. **Preview, read-only:**
   `npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/prod-diff.sql`
   It must equal the statements in `prisma/pending/2026-10-17-studio-project-save.sql` (the `CREATE TABLE` and the
   foreign key). Anything more means production is behind another change too: stop and review.
3. **Apply exactly the reviewed file:**
   `npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-17-studio-project-save.sql`
4. **Verify:** the same `migrate diff` now prints an empty migration.
5. **Deploy,** after `git checkout -- public/_prisma/client yarn.lock` so the upload matches the commit (§4 of
   `LANES.md`). The committed client already knows `studioProjectSave`; it must not be regenerated on the deploy
   machine and left dirty.
6. **Verify live** with the switch still off:
   - `GET /api/studio/projects` signed in answers 200 with `saving.enabled: false` (not 503: the table is there);
   - `/api/account/export` downloads with `"studioProjects": []`.
7. **Turn the switch on.** Set `STUDIO_CLOUD_SAVE_ENABLED=1` in the function's environment (next to
   `NEXUS_STUDIO_ENABLED`), after the §8 policy text is live. Then, with a test adult and a test teen, check:
   - save, list, load on a second browser, a stale-rev 409, delete;
   - a test under-13 or unknown-age account gets the 403.

**Rollback.**

- Turn the switch off. The device save is unaffected, and what was saved stays readable and deletable.
- If the table must go, run `DROP TABLE "StudioProjectSave";` only **after** a deploy without the model, because a
  client with the model fails when it queries a missing table. Until then the routes answer 503 and the export lists
  none.

---

## 8. The privacy policy: the exact proposed text (NOT applied; the owner reads it first, Q6)

`lib/policies.ts` is unchanged. This is the diff to apply when the owner approves it. It is computed on a scratch copy
of the file:
`/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/round5/studio-save/policy/policies.diff`.

**Privacy §1, a new bullet after "Studio AI builder requests":**

> - **Studio projects:** if you save a Studio project to your account, we store the project so you can open it on any
>   device you sign in on: its name, its venues (their settings and what is placed where), its scripts and stamps, and
>   the names you give its characters. A character's look is not saved with it; the look stays on the device where you
>   made it. Saving to your account is for signed-in users aged 13 and over.

**Privacy §2, a new bullet after the Studio AI builder one:**

> - Saved Studio projects are used only to give them back to you. Only you can open them. They are not shared,
>   published, used for ads, or sent to an AI model.

**Privacy §4, a new paragraph after the existing one:**

> We keep a saved Studio project until you delete it or your account. You can delete one at any time from Studio, and
> deleting your account deletes all of them. They are included when you download your data.

**The version bump:**

- `CURRENT_POLICY_VERSION` goes from `'2026-10-16'` to `'2026-10-17'` (or the date it lands). Like every bump since
  2026-09-24 it re-prompts no one.
- It gets a STUDIO-SAVE comment block in the style of the ones above it; that block is in the diff.
- `lib/policies.test.ts` needs one fingerprint line. The scratch copy computes it (the live text's computes to
  `f5be67c85745dff0`, which matches the pin, so the computation is checked):
  `'2026-10-17': '65a6d38721c3f5ac',   // STUDIO-SAVE: §1 Studio projects, §2 how saved projects are used, §4 delete and download`
- Its "is the final, non-draft label" test moves to `'2026-10-17'`, with a `test changed` comment as the earlier bumps
  have.

Every sentence was read from the code, not the brief:

- what is stored: `prepareUpload`;
- no looks: `LOOK_CODES_IN_ACCOUNT`;
- 13 and over: `cloudSavePolicy`;
- only you: the session-scoped key;
- not sent to AI: saving never calls CELL;
- kept until deleted: the cascade, and no purge job;
- included in the download: `collectAccountExport`.

The policy must be live before the switch is turned on (§7, step 7).

---

## 9. Tests

| File | Tests | What |
|---|---:|---|
| `lib/nexus-studio/cloudSave.test.ts` | 26 | policy per age band and audience; the shipped audience (14–17 and adults yes; 13-by-year, 12, 10, unknown no); import gate; look-code strip and restore; the cap after sanitising; quota; fingerprint; every `syncAction` case; `keepBoth`; the merge cases |
| `lib/nexus-studio/cloudRoute.test.ts` | 16 | the order of checks; the age line under both audiences; the list's `saving`; create, update, stale rev, double create, deleted-elsewhere; bad bodies; quota inside the write, after the revision; 503 with no user id in the log; scoping; unreadable rows; delete with the switch off |
| `lib/nexus-studio/cloudStore.test.ts` | 8 | the Prisma store on the repo's `spyPrisma`: lock first, revision, quota under the lock, the race closed (and open without the lock), scoping, export reads, and the schema and SQL (cascade, columns, key, rollback) |
| `lib/nexus-studio/studioProjectsRoutes.test.ts` | 14 | the **real route files**, with `next-auth`, `@/lib/db` (`spyPrisma`) and env flags mocked as `lib/account/account-routes.test.ts` does: either flag off is a 404 before the session; reads and deletes survive the switch; the age from the database (adult, 17, 14 → 200; 13-by-year, 12, unknown, no row → 403); a body claiming an age is ignored; the round trip; guests; another account; a missing table is a 503 |
| `lib/nexus-studio/cloudSync.test.ts` | 13 | two devices and one account through `fetchAccountApi` into the real handlers: offer-not-auto, a shared browser, push, open, merge both ways, keep both, use mine and theirs, deleted elsewhere, no base, a full account, offline |
| `components/nexus-studio/account-save.test.tsx` | 13 | the panel hook on the repo's hook runtime, plus markup: hidden for a guest and when off and empty; the list when off but saved; the neutral refusal; a teen's offer and click; auto-push; a pull as one command; the conflict and keep both; open-asks-first; delete; offline then online; the page-hide push |
| `lib/account/exportData.test.ts`, `account-routes.test.ts` | +3 | the export carries only the caller's projects; a missing table is none; other errors are thrown |

**Mutation checks (32, each turned at least one test red, then restored):**

| Area | Count | Mutations |
|---|---:|---|
| `cloudSave` | 7 | |
| `cloudRoute` | 7 | |
| store, flag, route, export, deps | 8 | no lock; flag ignoring `NEXUS_STUDIO_ENABLED`; no early switch; export without projects; rev ignored; every export error hidden; age not from the database; quota blind |
| sync and panel | 10 | auto-create; resurrect; no look-code restore; keep both without saving the copy; never merge; records not per account; panel shown when off and empty; the age answer ignored; open without asking; no retry when back online |

---

## 10. Shared files and findings

**Shared files** (each named in its commit with `shared file:`):

| File | Change |
|---|---|
| `prisma/schema.prisma`, `public/_prisma/**` | owner-approved via the coordinator |
| `lib/flags.ts` | one function |
| `.env.example` | one line |
| `lib/account/exportData.ts` | one field |
| `components/nexus-studio/studio-app.tsx` | one import and one mount line. That file changed 9 h before this lane on `lane/finish-release`, so expect a trivial merge |
| `tests/helpers/writeSpyDb.ts` | `$queryRaw*` recorded, returning no rows |
| `lib/nav/modules.test.ts` | the STAGED line removed: `cloudRoute.ts` is wired now |
| `lib/privacy/u13-lock-log.test.ts` | the schema-ban pin advanced to `fe5064a8`, as its own rule requires. Measured: it fails without the bump |

**Routed:** `docs/NEXUS-STUDIO.md` §2.1 still says "No server persistence". Its holder this round is studio-5. The
one-liner is: "Server save: built behind `STUDIO_CLOUD_SAVE_ENABLED`, see `docs/NEXUS-STUDIO-SAVE.md`."

**Findings:**

- **The Studio does not fit a phone.** At 390 px it overflows the viewport by 345 px with nothing open (§6).
- **Two wrong counts in commit messages.** No amend: lane history is not rewritten. The counts in this file were
  re-counted from a verbose run.
  - `1b55e193`'s body says the panel test has 14 tests; it has 13 (one weak test was replaced by two stronger ones
    before the commit).
  - `3653dada`'s body says `cloudRoute.test.ts` has 18; it has 16.
