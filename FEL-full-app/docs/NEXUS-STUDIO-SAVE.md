# Nexus Studio: saving projects to the account (design and proposal)

**Owner, 2026-10-17:** "Studio: save to account." A new table needs the owner's OK before any schema or database work,
so this lane (`lane/studio-save`) is **design first**. Nothing here has been applied:

- `prisma/schema.prisma` is unchanged, and no Prisma command or SQL has been run anywhere.
- `public/_prisma/**` is unchanged.
- No legal or policy copy has been edited. §8 has a draft for the owner.

What *is* built is the logic that does not need the table. It is all tested and wired to nothing (§9):

- `lib/nexus-studio/cloudSave.ts` decides who may save, what is stored, the caps, the quota and how two devices agree.
- `lib/nexus-studio/cloudRoute.ts` is the route's handlers over a store interface, run on an in-memory store in tests.

The owner decisions are in §10, as multiple choice, with the recommendation first.

Read with `docs/NEXUS-STUDIO.md` (§2 for the document, §2.1 for today's save), `docs/LANES.md` §4 (production schema
changes) and `/CLAUDE.md` (the `public/_prisma/client` trap).

---

## 1. Today, and the precedent

| What | Where | Status |
|---|---|---|
| The working project | `localStorage['fel.nexusStudio.v1']`. One project per browser, autosaved 1.5 s after the last edit and on `beforeunload` / hidden (`storage.ts`, `use-studio.ts`) | shipped behind `NEXUS_STUDIO_ENABLED` |
| A file copy | Export / import `.nexus.json`. Import runs `parseProject` (parse → migrate → sanitize) | shipped |
| A server copy | **none.** No `/api/studio/*` route stores a project. The cartridge, credit, entitlement and partner-key routes are the paid Creator surface (`docs/NEXUS-STUDIO.md` §1) | this proposal |

**The precedent is `AdventureSave`** (`prisma/pending/2026-10-07-adventure-save.sql`, `docs/ADVENTURE-PLAN.md` "Data and
saves"). It was the same kind of change:

- one additive table holding a versioned, sanitised JSON document, with `ON DELETE CASCADE` from `User`;
- verified adults only, with teens kept on the device (`lib/babylon/adventure/save/policy.ts`);
- hand-written SQL and a rollback line, applied by the owner;
- then the model, the deploy schema copy and the regenerated client in one commit (`e8be09a9`, which also had to set
  `onUpdate: NoAction` to match the live foreign key the SQL had created).

This proposal follows it step for step.

---

## 2. The proposed model (a diff, NOT applied)

```diff
--- a/FEL-full-app/prisma/schema.prisma
+++ b/FEL-full-app/prisma/schema.prisma
@@ model User {
   // ADVENTURE PHASE B (2026-10-07): the Adventure's server save, one row per account. See AdventureSave below.
   adventureSave AdventureSave?
+  // STUDIO SAVE (owner-approved <date>): Nexus Studio projects saved to the account. See StudioProjectSave below.
+  studioProjectSaves StudioProjectSave[]
 }
@@ (end of file)
+/// STUDIO SAVE (<date>, docs/NEXUS-STUDIO-SAVE.md): one row per Nexus Studio project saved to an account. Matches the live
+/// table from prisma/pending/<date>-studio-project-save.sql (applied by the owner). Written only through
+/// lib/nexus-studio/cloudRoute.ts: who may write (cloudSavePolicy), the import gate and the size cap (prepareUpload),
+/// the quota (quotaCheck) and the revision rule (rev = the base the writer saw, then rev + 1).
+model StudioProjectSave {
+  userId    String
+  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
+  /// StudioProject.id: doc.ts's id shape, minted on the device; unique per account, not across accounts
+  projectId String
+  /// StudioProject.name (at most 60 characters), so the list never reads a document
+  name      String
+  /// STUDIO_DOC_VERSION of `doc`
+  version   Int
+  /// The server revision: 1 on create, +1 on every write
+  rev       Int
+  /// UTF-8 bytes of `doc`'s JSON as written: the quota reads this, never the documents
+  bytes     Int
+  /// The sanitised StudioProject, with no look codes (§4)
+  doc       Json
+  createdAt DateTime @default(now())
+  updatedAt DateTime @default(now())
+
+  @@id([userId, projectId])
+}
```

Why it has this shape:

- **The key is `(userId, projectId)`.** The device mints the project id (`newId('proj')`), so the device and the
  account name the same project the same way without a lookup. The composite key also scopes every query to one
  account: a route that forgets the `userId` cannot address someone else's row. No extra index is needed, because the
  list is at most 20 rows per account (§3) and they are read by the key's first column.
- **`rev` gives optimistic concurrency** (§6), with no lock and no timestamp comparison.
- **`name` and `bytes` are columns**, so the project list and the quota never load a 1 MB document.
- **`onUpdate: NoAction`** matches what the hand-written SQL creates (the AdventureSave lesson above). Prisma's default
  would make the owner's verification step show a difference.
- **`updatedAt` uses `@default(now())`**, which the store sets on each write, rather than `@updatedAt`. That keeps the
  SQL's `DEFAULT CURRENT_TIMESTAMP` and the model identical, as AdventureSave does.

### 2.1 The SQL (to become `prisma/pending/<date>-studio-project-save.sql`)

The SQL is written in `prisma migrate diff`'s own style, so the owner's verification step can print an empty migration.
**assumption:** this matches what `migrate diff` generates for the model above. Nobody here could run it (no Prisma
commands in this lane). The owner's read-only preview (§7, step 1) checks it before anything is applied.

```sql
-- STUDIO SAVE (<date>): StudioProjectSave — Nexus Studio projects saved to an account. docs/NEXUS-STUDIO-SAVE.md.
-- ADDITIVE ONLY: one new table, no existing table changes. Apply BEFORE any deploy that contains the route.
CREATE TABLE "StudioProjectSave" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rev" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "doc" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioProjectSave_pkey" PRIMARY KEY ("userId","projectId")
);

ALTER TABLE "StudioProjectSave" ADD CONSTRAINT "StudioProjectSave_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- rollback: DROP TABLE "StudioProjectSave";
```

**Optional belt and braces.** These could go in a separate file, in the style of `prisma/wallet-constraints.sql`.
`migrate diff` does not model CHECK constraints, so they do not disturb the empty-diff check.

```sql
ALTER TABLE "StudioProjectSave" ADD CONSTRAINT "StudioProjectSave_bytes_cap" CHECK ("bytes" BETWEEN 1 AND 1048576);
ALTER TABLE "StudioProjectSave" ADD CONSTRAINT "StudioProjectSave_rev_pos"   CHECK ("rev" >= 1);
```

### 2.2 Considered and not recommended

**Store the project as a CELL `ProjectFile`.** That means a `CellProject` row with `genre: 'nexus-studio'` and one
file, `nexus-studio.json`. It needs **no schema change**, which is its whole appeal, but:

- CELL's own project list (`/api/cell/projects`, `StudioShell`) would show Studio saves unless CELL's routes were
  changed, and those are another lane's files under the abacus-kill guard lines;
- `content` is a `String`, not JSONB;
- there is no revision column, so concurrency would ride on `updatedAt`;
- CELL rows carry AI-build cost semantics (`CellUsage`) and a different privacy story (BYO provider keys).

This is offered as Q0 (B) in §10, in case "no migration" outweighs all of that.

---

## 3. Sizes, caps and quotas

Measured 2026-10-17 by building projects the editor's way (the catalog, `placed()`) and running them through the real
`sanitizeProject` and `prepareUpload`. The script is
`/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/round5/studio-save/measure-sizes.ts`.

| Project | JSON | gzip | Fits a 1 MiB row? |
|---|---:|---:|---|
| Starter: 1 venue, one of every kind (9 objects) | 1.9 kB | 0.9 kB | yes |
| Typical: 2 venues, 140 objects, 3 characters, 2 scripts, 2 stamps | 27.9 kB | 4.2 kB | yes (27.6 kB stored, without look codes) |
| Heavy: 6 venues × 600 objects, 16 characters | 623 kB | 83 kB | yes (639 kB after sanitising) |
| 10 venues × 600 objects | 1.03 MB | 137 kB | **no**, refused with 413 |
| The doc `LIMITS` worst case (24 × 600 objects, 64 × 50 kB look codes, 64 full scripts, 32 full stamps) | 6.6 MB | 372 kB | **no** |

One object costs about 170 bytes. A Closet slot code is about 335 characters (500 with face numbers). Postgres
compresses JSONB rows over 2 kB on its own (TOAST), so the stored size is closer to the gzip column.

**Proposed caps** (`CLOUD_LIMITS` in `cloudSave.ts`, Q4):

| Cap | Value | Why |
|---|---|---|
| One project | **1 MiB** of UTF-8 JSON, measured **after** sanitising and stripping look codes | About 9 full venues, and more than 35× a typical project. The browser's own ~5 MB localStorage ceiling is the device limit. A project between the two still saves on the device and exports to a file, and the editor says why it cannot go to the account. |
| Projects per account | **20** | The editor works on one project at a time. 20 is plenty for an archive and keeps the list a single query. |
| All of an account's projects | **8 MiB** | 20 × 400 kB. A typical creator uses under 1 %. |
| A PUT body | 1 MiB + 4 kB | The project plus the `{ baseRev }` envelope. Checked before parsing. |

The quota rule is `quotaCheck`. Replacing a project counts only the change in size, and **a save that makes a project
smaller always goes through**. So an account that sits over a cap the owner later lowers can still save smaller work,
and nobody is locked out of tidying up.

**Rate limits** (`CLOUD_RATE` in `cloudRoute.ts`), per account:

- writes (and deletes): 12 a minute and 1,500 a day;
- reads: 60 a minute.

The client pushes at most every 20 s while the project differs from the account copy (§6), so a long session uses a
few hundred writes a day. These use `lib/rate-limit.ts`, which is per server instance. Its own header says a shared
store is the fix if the deployment scales out. That is true of every route that uses it, not only this one.

---

## 4. Privacy

### 4.1 What is stored

- **The project as the import gate leaves it.** `prepareUpload` runs the same `sanitizeProject` an imported file goes
  through: known kinds only, numbers clamped, strings capped, unknown keys dropped (a test sends an `email` field and a
  `<script>` object; neither reaches the row).
- What that leaves:
  - the project's name;
  - its venues: their settings, and each placed object's kind, position, name and colour;
  - its scripts: the node graph and its parameters, including a HUD banner's short text;
  - its stamps;
  - its characters' ids and names.
- **Every character's look code is removed** (`LOOK_CODES_IN_ACCOUNT = false`, Q2). A Closet slot code always carries
  height and build, and face sliders when the player asked (`lib/creator/look/shareCode.ts`). The Creator's rule
  (`lib/creator/lookPrivacy.ts`) is that those numbers upload only for a verified adult who opted in, and stay on the
  device for everyone else (`TEEN_DEVICE_LOOK_EVERYWHERE`). Storing a project with its codes would be a second way
  round that rule.
  - The device keeps the codes. `restoreLookCodes` puts them back by character id on a pull.
  - On a device that never had them, the character appears with its name. "Edit in the Closet" or a pasted code gives
    it a look again.
  - A venue's cast still names its characters, so nothing else in the project changes.
- Fields the user types: the project, venue, object, character, script and stamp names (60 characters each), and
  script banner texts (40 characters each). They are user content under Terms §4. Nothing reads them except the owner
  of the account.

### 4.2 What is never stored or sent

- No picture or link. The document has no field that can hold one, and the sanitiser keeps only known keys.
- No account data, age or birth year in the row. The age is read from `User.dobYear` for the write gate only.
- Never sent to an AI model. Saving does not call CELL. The AI builder still sends only what Privacy §1 already names
  (the typed request and the venue), and only when it is used.
- Never in analytics, never in logs. The route's log line is a fixed event name plus the error's class name (the
  `logGateFailure` pattern): no user id, no project name, no document.
- Never public. There is no share link, no publish step and no cartridge listing. Publishing a project is a separate,
  later owner decision.

### 4.3 Who can read it

**Only the account that saved it.** Every store method takes the `userId` from the session, never from the URL or the
body, and the key starts with it. A test shows another account's GET answering 404 and its list coming back empty.
There is no admin screen for it.

### 4.4 Deletion, export and retention

- **Delete one project:** `DELETE /api/studio/projects/:id` removes the row. It is idempotent and needs only sign-in,
  so turning the switch off or narrowing the age rule **never stops anyone deleting what they saved**.
- **Account deletion:** `ON DELETE CASCADE` from `User`. Accounts are deleted today by the owner on an emailed request
  (Privacy §4: "no in-app route yet"), and the cascade removes every saved project with the account.
- **Export:** Privacy §8 promises "data export (JSON)". The saved projects should join `/api/account/export`
  (`lib/account/exportData.ts`, `collectAccountExport`). That file is another lane's, so it is routed (§11), Q7. Each
  project can already be downloaded as `.nexus.json` from the editor.
- **Retention:** a saved project is kept while the account exists, until its owner deletes it (Q5). There is no
  inactivity purge. This is someone's creative work, nothing in the app records "inactive", and a purge would need the
  retention cron and new policy words.
- **Backups:** Cloud SQL's automated backups hold deleted rows until they expire. That is true of every table here and
  the policy does not mention it. **assumption:** the owner knows the backup retention setting. It is not in the repo.

### 4.5 Minors (Q1)

**Recommended: verified adults only.** That is `isVerifiedAdultStrict`, a year gap over 18, read from the database.
It is the rule the repo already uses for every comparable server save:

- AdventureSave (`adventureSavePolicy`);
- the Creator look (`lookPrivacy.ts`);
- movement numbers (`scanSaveGate.ts`);
- Mirror progress (owner decision 1 of 2026-10-07: under-18s keep it on the device).

A teen keeps today's device save and file export, unchanged. An unknown age and anyone under 13 are refused under any
answer to Q1. Under 13 cannot hold an account at all (`ageScreen`, Terms §2).

The other answer, "teens too", is one line: `STUDIO_SAVE_AUDIENCE = 'teens-and-adults'`. It matches the owner's
"Teens too" for the AI builder (`aiAccess.ts`, the same bands). Look codes are still stripped, and the privacy words
would have to say teens' projects are stored (§8). The refusal is a neutral `403 { error: 'studio_save_unavailable' }`
that names no age, the AI builder's rule for copy.

---

## 5. The API (staged in `lib/nexus-studio/cloudRoute.ts`)

| Route | Answer |
|---|---|
| `GET /api/studio/projects` | `{ projects: [{ projectId, name, rev, bytes, updatedAt }], quota: { projects, maxProjects, bytes, maxBytes, maxProjectBytes } }`, newest first. Never a document. |
| `GET /api/studio/projects/:id` | `{ project, projectId, name, rev, bytes, updatedAt }`. The stored document goes **through `sanitizeProject` again** on the way out. A row this Studio cannot read (a newer version) answers 422 with its meta, so it can still be deleted. |
| `PUT /api/studio/projects/:id` `{ baseRev, project }` | 200 `{ projectId, name, rev, bytes, updatedAt, stripped, dropped }`. 409 `{ error: 'conflict', current: meta \| null }` when `baseRev` is not the stored rev (`current: null`: deleted from another device). |
| `DELETE /api/studio/projects/:id` | 200 `{ deleted: boolean }`, idempotent |

`/api/studio/*` already holds the Creator's paid routes (cartridges, credits). `projects` is a new folder beside them
and touches none of them. **assumption:** the path. `/api/nexus-studio/projects` would serve as well.

**The order of checks.** It is the order `app/api/cell/venue/route.ts` uses, and a test pins each step:

1. **The switch (writes only).** `NEXUS_STUDIO_ENABLED` **and** a new `STUDIO_CLOUD_SAVE_ENABLED` (server flags, read
   per request, both off by default, Q9). Off: 404 before the session is read.
2. **Signed in**, from the session. Otherwise 401.
3. **The rate limit** for the account, with separate read and write buckets. Otherwise 429 with `Retry-After`.
4. **Who may write** (`cloudSavePolicy`, from `User.dobYear` read through `readDobYear`). Otherwise the neutral 403,
   before the body is even parsed.
5. **The body.** Size checked before parsing (413), JSON (400), `baseRev` a non-negative integer (400), then
   `prepareUpload`:
   - the import gate (422);
   - the id in the URL must be the project's own id (400);
   - look codes stripped;
   - the 1 MiB cap measured after sanitising (413).
6. **The quota** (`quotaCheck`, 403 `quota_projects` / `quota_bytes`).
7. **The revision.** The store writes only if the row is still at `baseRev` (409 otherwise).

Every answer is `Cache-Control: no-store`. A store error (a missing table, a dropped connection) is a 503
`save_unavailable`, never a 500 with a stack.

**The Prisma store (sketch, for the implementation PR).** It is about 40 lines and needs the generated
`studioProjectSave` delegate, which is why it is not in this lane:

```ts
const META = { projectId: true, name: true, rev: true, bytes: true, updatedAt: true } as const;
export function prismaProjectStore(db: PrismaClient): StudioProjectStore {
  const meta = (userId: string, projectId: string) =>
    db.studioProjectSave.findUnique({ where: { userId_projectId: { userId, projectId } }, select: META });
  return {
    list: (userId) => db.studioProjectSave.findMany({ where: { userId }, select: META }),
    get: (userId, projectId) =>
      db.studioProjectSave.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { ...META, version: true, doc: true } }),
    async put(userId, row, baseRev) {
      const updatedAt = new Date();
      const data = { name: row.name, version: row.version, bytes: row.bytes, doc: row.doc as Prisma.InputJsonValue, updatedAt };
      if (baseRev === 0) {
        try { return { ok: true, meta: await db.studioProjectSave.create({ data: { userId, projectId: row.projectId, rev: 1, ...data }, select: META }) }; }
        catch (e) { if (isP2002(e)) return { ok: false, current: await meta(userId, row.projectId) }; throw e; }
      }
      const n = await db.studioProjectSave.updateMany({ where: { userId, projectId: row.projectId, rev: baseRev }, data: { ...data, rev: baseRev + 1 } });
      return n.count === 1
        ? { ok: true, meta: { projectId: row.projectId, name: row.name, rev: baseRev + 1, bytes: row.bytes, updatedAt } }
        : { ok: false, current: await meta(userId, row.projectId) };
    },
    async remove(userId, projectId) { return (await db.studioProjectSave.deleteMany({ where: { userId, projectId } })).count > 0; },
  };
}
```

`updateMany ... where rev = baseRev` is a single atomic statement, so two devices racing on the same base cannot both
win. One known gap: the quota is read before the write, so two **new** projects created at the same moment could pass
a full quota together, leaving 21 rows. The write rate limit bounds this. A serializable transaction around the list
and the create would close it, and the implementation PR can decide whether that is worth it.

---

## 6. Two devices, and offline

**The device stays first.** The 1.5 s localStorage autosave is untouched. The account copy is a second layer. When it
is offline, refused, over quota or failing, the device copy is exactly what it is today, and the title bar says which
of these is true:

- "Saved on this device";
- "Saved to your account";
- "Saving…";
- "Not in your account yet: offline";
- "Changed on another device: review".

**What a device remembers per account.** It keeps a `SyncRecord` per project: the server `rev` it last agreed with
and the `projectFingerprint` of the content at that moment (a 53-bit hash that ignores `updatedAt` and key order). It
can also keep the last-agreed document itself, the merge base, under a second key. Records are kept **per account**,
because a browser shared by two people has one working project.

**What to do** (`syncAction`, every case tested):

| Device copy vs. its record | Account copy vs. the record | Action |
|---|---|---|
| unchanged | unchanged | nothing |
| changed | unchanged | **push** with `baseRev = record.rev` |
| unchanged | changed | **pull**, then `restoreLookCodes` from the device copy |
| changed | changed | **conflict**: merge, or keep both |
| any | gone (it had a record) | **deleted elsewhere**: ask "save it again" or "keep it only here". Never re-uploaded by itself |
| no record for this account | not there | **offer** "Save to my account". Never automatic, so one person's device project cannot land in another person's account |
| no record | there (the same id, e.g. one file imported on two devices) | conflict with no base: keep both |

**Pushes are throttled.** A push happens at most every 20 s while the device copy differs from its record, and again
when the tab hides. A hidden-tab `fetch(..., { keepalive: true })` body is capped at 64 kB by browsers, so a larger
project waits for the next open. The next open finds "changed / unchanged" and pushes.

**Conflicts (Q3).** The recommendation is **revisions plus a three-way merge, with "keep both" as the fallback**.
`mergeProjects(base, mine, theirs)` works on whole entities:

- the project's name;
- a venue's settings;
- one placed object;
- one character;
- one script;
- one stamp.

For each entity:

- the same on both sides: kept;
- changed on one side only: that side wins (an edit, an add or a delete);
- changed differently on both sides: a **conflict**, named and never decided for the creator. An edit against a delete
  is a conflict too.

The merge also refuses anything `sanitizeProject` would quietly repair:

- an object added to a venue the other side deleted;
- a cast naming a character the other side deleted;
- a merged venue past the 600-object limit.

The order of things is not an edit: whichever side reordered wins, and items only the other side has go after. The
editor applies a clean merge as **one undoable command** (`replaceProject`) and pushes it with the account's `rev`.

On a conflict, or when no base was kept, the creator sees three choices:

1. **Keep both** (the default): `keepBoth` makes this device's work a new project, "… (this device)", and the
   account's copy opens as the original.
2. Use this device's (a push with the account's `rev`).
3. Use the account's (a pull).

Nothing is overwritten without one of those clicks.

**Why not last-write-wins.** Two devices editing between syncs is exactly when work goes missing silently. The
revision check costs one integer and the 409 path is already tested.

**Several projects.** The device still holds one working project. A "Projects" panel lists the account's (the GET
list, with sizes and the quota) and opens one. If the working project has changes that are not in the account, the
panel asks first ("save it to your account / export it / discard"), so opening another project never drops unsaved
work.

**Signed out, or not allowed to save.** The panel is not shown. A neutral line says the project is saved on this
device and can be exported. Nothing else changes.

---

## 7. The migration plan (owner steps, in order)

None of these has been done.

1. **Approve** the model and the SQL (Q0). The implementation PR adds `prisma/pending/<date>-studio-project-save.sql`
   exactly as §2.1, with the rollback line, beside the other files in `prisma/pending/`. This lane did not add it:
   it is a design lane, and a file in `prisma/pending/` reads as "waiting to be applied".
2. **Preview, read-only** (`docs/LANES.md` §4): run
   `npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`
   with the model added. Compare it with the reviewed SQL. Anything more means production is also behind another
   lane's change; stop and review.
3. **Apply exactly the reviewed file:** `npx prisma db execute --url "$PROD_DIRECT_URL" --file <reviewed.sql>`.
4. **Verify:** the same `migrate diff` now prints an empty migration.
5. **Regenerate the committed client** in the implementation PR, the way `e8be09a9` did for AdventureSave:
   - add the model to `prisma/schema.prisma`;
   - run `node scripts/copy-prisma-schema.mjs`, which writes `public/_prisma/schema.prisma`;
   - run `npm run prisma:generate`. That is `prisma generate` plus `scripts/prisma-generate.mjs`, which strips the
     machine's absolute paths. Run it on a machine that resolves `debian-openssl-3.0.x`: Linux x64, or any machine,
     since the schema names that target explicitly.
   - commit `prisma/schema.prisma`, `public/_prisma/schema.prisma` and `public/_prisma/client/**` (**including
     `libquery_engine-debian-openssl-3.0.x.so.node`**) **together**;
   - check:
     - `lib/db/prismaSchemaSync.test.ts` is green (every model reaches the shipped copy, and the client's schema matches);
     - `scripts/prisma-artifact-tests.ts` is green (the client is tracked);
     - CI's "generated Prisma client is committed in sync" step passes;
     - `public/_prisma/client/index.d.ts` contains `studioProjectSave`.

   This is the step that cost about ten deploys once (`/CLAUDE.md`). Without the regenerated client committed, the
   route compiles, tests green and 500s in production with `Cannot read properties of undefined (reading
   'findUnique')` (`docs/DEPLOY-NOTES-PRISMA.md`).
6. **Deploy with the switch off** (`STUDIO_CLOUD_SAVE_ENABLED` unset). The read and delete routes answer for signed-in
   users and find nothing. The write route is a 404.
7. **Verify live**, because a green suite and a broken production coexist easily here (`/CLAUDE.md`). With the switch
   on for a test adult account:
   - save, list, load, a stale-rev 409, delete;
   - then confirm with a teen test account that the 403 holds.
8. **Flip the switch** when the privacy words (§8) are live.

**Rollback.** Turn the switch off; the device save is unaffected. If the table must go, `DROP TABLE "StudioProjectSave";`
**after** a deploy without the model, because a client generated with the model only fails when it is queried.

---

## 8. Does the privacy policy need new words? Yes (a draft, NOT an edit)

Today Privacy §1 lists what is collected, and a saved Studio project is a new kind of stored data. The Studio AI
disclosure (`lib/policies.ts`, STUDIO-AI-DISCLOSURE, 2026-10-16) shows the owner wants Studio data named explicitly.
`policies.test.ts` fails on a text change without a version bump, so this needs a bump. The owner applies it (Q6).

> **§1, a new bullet after "Studio AI builder requests":**
> - **Studio projects:** if you save a Studio project to your account, we store the project so you can open it on any
>   device you sign in on: its name, its venues (their settings and what is placed where), its scripts and stamps, and
>   the names you give its characters. A character's look is not saved with it; the look stays on the device where you
>   made it. Saving to your account is for verified adults (18 and over); anyone else's Studio projects stay on their
>   own device.
>
> **§2, a new bullet:**
> - Saved Studio projects are used only to give them back to you. Only you can open them. They are not shared,
>   published, used for ads, or sent to an AI model.
>
> **§4, a new sentence:**
> You can delete a saved Studio project at any time from Studio. Deleting your account deletes all of your saved Studio
> projects.

If Q1 is "teens too", the last sentence of the §1 bullet becomes: "Saving to your account is for signed-in users 13 and
over." Terms §2's parent-consent line then covers a teen's use, as it does for the AI builder.

---

## 9. Tests

**Built in this lane (40 tests):**

- `lib/nexus-studio/cloudSave.test.ts` (25 tests):
  - the policy for each age band and each audience;
  - the import gate, look-code stripping, an unknown key and an unknown kind dropped, an id mismatch, a newer version;
  - the cap measured after sanitising, in UTF-8;
  - quota (count, bytes, replace, shrink-when-over);
  - the fingerprint (`updatedAt`, key order, a real edit);
  - every `syncAction` case and `keepBoth`;
  - the merge (disjoint edits, the same edit, a one-sided delete, a same-entity conflict, edit-vs-delete, an object in
    a deleted venue, a dangling cast, a LIMITS overflow, a reorder and key order, two different projects).
- `lib/nexus-studio/cloudRoute.test.ts` (15 tests):
  - the switch first, before the session, the limiter or the age;
  - 401 everywhere for a guest;
  - 429 before the age, and separate buckets;
  - the neutral 403 for a teen, an unknown age and an under-13, whatever the body;
  - create at rev 1 with no look code in the row;
  - a stale rev, a double create and a deleted-elsewhere push are each a 409 that changes nothing;
  - every bad body's status;
  - the 21st project;
  - a 503 whose log line holds no user id;
  - list order and no documents in the list;
  - a cross-account 404;
  - an unreadable row answering 422 with meta;
  - delete with the switch off, for a teen, idempotent, and only this account's row.
- `tests/helpers/studioProjectStore.ts`: the in-memory store with the same revision rule as the Prisma sketch.
- **Mutation checks.** Fourteen deliberate breaks across the two modules each turned at least one test red, and each
  was restored:
  - look codes kept by default;
  - the merge ignoring theirs;
  - no shrink rule;
  - a key-order-sensitive fingerprint;
  - resurrecting a deleted project;
  - no cast check;
  - teens always allowed;
  - no write switch;
  - no age gate;
  - no quota;
  - a conflict swallowed;
  - get without the sanitiser;
  - delete behind the switch;
  - put without sign-in and the limiter.

**For the implementation PR, once the table is approved:**

1. **The route files** (`app/api/studio/projects/route.ts`, `[id]/route.ts`): a test in the style of
   `aiVenueRoute.test.ts` that the route only builds deps and calls these handlers. Then delete
   `cloudRoute.ts`'s line in `lib/nav/modules.test.ts` NOT_IMPORTED.
2. **The Prisma store against a throwaway Postgres** (127.0.0.1, the `docs/LANES.md` §4 recipe, never `fel_dev`):
   - create, update at the right rev, 409 at a stale rev;
   - two concurrent `updateMany` on one base, exactly one wins;
   - deleting the `User` row cascades.
3. **The client sync module** (`cloudSync.ts`, with `memoryKV` and a fake `fetch`):
   - offline, then back online;
   - 409, then a merge, then a push;
   - a conflict, then keep both;
   - deleted elsewhere;
   - a shared browser never auto-creates in a second account;
   - look codes restored on a pull;
   - throttling, and the 64 kB keepalive limit.
4. **The UI** (`studio.test.tsx` style): the title-bar states, the Projects panel, the "unsaved work" question before
   opening another project, and the panel hidden for a guest and for a refused account.
5. **The export includes the saved projects** (routed, §11).
6. **The browser rig** (esbuild + Playwright static, as `studio4/`). Two browser contexts act as two devices against a
   fake API: edit on both, sync, see a merge and see keep-both.
7. **Production** (§7, step 7): a real save, load and delete on the live site. A passing suite is not that.

---

## 10. Owner decisions (recommendation first)

**Q0. Store saved projects in a new table?**
- **(A) Yes: `StudioProjectSave` as in §2, one additive table with a rollback line.** (recommended)
- (B) No schema change: store each project as a CELL `ProjectFile` under a `CellProject` (§2.2). It needs CELL route
  changes and is a looser fit.
- (C) Not now: keep the device save and the `.nexus.json` export.

**Q1. Who may save projects to their account?**
- **(A) Verified adults only. Teens keep the device save and file export, as with AdventureSave, the Creator look and
  Mirror progress.** (recommended)
- (B) Teens 13–17 and adults, as the AI builder: one line (`STUDIO_SAVE_AUDIENCE`), with the policy wording changed
  to "13 and over".
- (C) Adults now; teens later, after a guardian-consent step is designed.

**Q2. Characters' look codes in the account copy?**
- **(A) Never stored. The look stays on the device that made it, and the account copy keeps the character's name.**
  (recommended)
- (B) Stored for verified adults who have the Closet's face-and-body numbers opt-in on.
- (C) Stored for everyone allowed to save.

**Q3. Two devices change the same project between syncs:**
- **(A) Revisions plus an automatic merge when different things changed. When the same thing changed, "keep both"
  unless the creator picks a side.** (recommended)
- (B) Revisions plus always "keep both" on any conflict (no automatic merge).
- (C) Last write wins (silent loss; not recommended).

**Q4. Caps:**
- **(A) 1 MiB per project, 20 projects, 8 MiB per account; writes 12 a minute and 1,500 a day.** (recommended)
- (B) 2 MiB, 50 projects, 32 MiB.
- (C) 512 KiB, 10 projects, 4 MiB.

**Q5. How long saved projects are kept:**
- **(A) Until the creator deletes them or the account is deleted. No inactivity purge.** (recommended)
- (B) Also delete projects untouched for 24 months (needs the retention cron and policy words).
- (C) Also delete projects untouched for 12 months.

**Q6. The privacy policy:**
- **(A) Add the §1, §2 and §4 words in §8 with a version bump, live before the switch is flipped.** (recommended)
- (B) Add only the §1 bullet, with a version bump.
- (C) No new words (rely on Terms §4 "User Content"; not recommended).

**Q7. The account export:**
- **(A) Include saved Studio projects in `/api/account/export` (routed to that file's holder).** (recommended)
- (B) A "download all my projects" button in Studio only.
- (C) Neither (each project's `.nexus.json` export is enough).

**Q8. When the SQL is applied:**
- **(A) By the owner, to production, before the deploy that carries the route (as AdventureSave), via the §7
  preview → apply → verify steps.** (recommended)
- (B) By the named deploy owner, in the same session as that deploy.

**Q9. The switch:**
- **(A) A new server flag, `STUDIO_CLOUD_SAVE_ENABLED`, off by default, on top of `NEXUS_STUDIO_ENABLED`. Reads and
  deletes are never behind it.** (recommended)
- (B) Only `NEXUS_STUDIO_ENABLED`: account save goes live the day the Studio does.

---

## 11. Routed and shared

- **`lib/account/exportData.ts`** (`collectAccountExport`, last changed 2 weeks ago; the consent-screen work). Once
  the table exists, add the following beside `mirrorSessions`:
  `studioProjects: await db.studioProjectSave.findMany({ where: { userId }, select: { projectId: true, name: true, rev: true, updatedAt: true, doc: true } })`.
  It is routed rather than done here because it needs the table.
- **`docs/NEXUS-STUDIO.md` §2.1** says "No server persistence … an owner decision for later". Its holder this round is
  studio-5, so it is untouched here. The routed one-liner is: "Server save: proposed in `docs/NEXUS-STUDIO-SAVE.md`
  (owner decisions Q0–Q9)."
- **`lib/nav/modules.test.ts`** (shared, additive): one NOT_IMPORTED line for the staged `cloudRoute.ts`, in the same
  class as `lib/sessions/runRateLimit.ts`. Wiring the route deletes it.
- **`docs/LANES.md`** §2: this lane's row.
