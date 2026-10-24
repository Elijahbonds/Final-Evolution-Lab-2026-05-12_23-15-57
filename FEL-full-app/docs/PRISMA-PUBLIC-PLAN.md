# PRISMA-PUBLIC: moving the generated Prisma client out of `public/`

**Owner decision, 2026-10-24.** Rebuild PR #247's plan step by step on today's release, as new PRs. #247 is closed.
This file was cited by #247 but never committed; this is it, rewritten against release `9af2c2ae`.

| Step | What | Branch | State |
|---|---|---|---|
| 1 | A parallel client in `lib/generated/prisma`, nothing imports it | `lane/prisma-move` | done, waiting for review |
| 2 | `lib/db.ts` and every import move onto it; the engine rides in `<distDir>/prisma-engine` | `lane/prisma-move-2` | built and gated locally, **not for merge until the owner approves a deploy proof** |
| 3 | Remove what still names `public/_prisma` (scripts, tests, CI steps, `package.json` `prisma.schema`) | not started | waits for step 2's deploy proof |
| 4 | Delete `public/_prisma` | not started | waits for step 3 and a second deploy proof |

Every step is one PR, and every step is reversible until step 4's deploy.

---

## 1. Why

- **The client and the full schema are public.** Firebase Hosting serves `public/`. Today anyone can download
  `/_prisma/schema.prisma` (every table, column and relation) and `/_prisma/client/**` from the live site. No
  credentials are in either, but the schema is a map of the data model, and it is not ours to hand out.
- **46.6 MB in the repo**, re-added on every regenerate. That includes `libquery_engine-darwin-arm64.dylib.node`
  (19 MB), an engine Cloud Run never loads. It is there because the generator's `binaryTargets` has `"native"`, which
  means "whatever machine ran the generate", so the client also goes dirty whenever a Mac and a Linux box take turns.

## 2. The constraints, and the evidence for each

These are why the client went into `public/` in the first place (see `prisma/schema.prisma`'s generator block and
`docs/DEPLOY-NOTES-PRISMA.md`). Any plan has to survive all of them.

1. **Nothing generates at deploy time.** The cloud install runs no install scripts (`npm warn install-scripts`), and
   Firebase ignores the custom `build` script and runs plain `next build`. So the client must be committed.
2. **`lib/` does not reach the function.** The function gets `next.config.js`, `package.json`, the lockfile, `.env*`,
   `public/` and `<distDir>/`. The 2026-09 attempt to generate into `lib/generated/prisma` failed in production with
   "engine not found": the client JS was bundled into `.next`, but the 17 MB engine sat in `lib/` and never shipped.
3. **What reaches the function from `<distDir>`.** Read from firebase-tools' own source (14.11.0 and 15.34.1,
   `lib/frameworks/next/index.js` `ɵcodegenFunctionsDirectory` and `lib/frameworks/next/utils.js`
   `getProductionDistDirFiles`): `public/` is copied whole, and `<distDir>/**` is copied whole except
   `cache/webpack/*-development/**` and `cache/eslint/**`. So a file that `next build` itself writes into `.next/`
   ships.
   - `scripts/copy-prisma-schema.mjs` says "the schema written to .next/prisma never arrived". assumption: that
     copy ran from the custom `build` script, which Firebase does not run (constraint 1), so the file was never
     written on the deploy machine, rather than written and then dropped. Step 2 writes the engine from inside
     `next build` (the webpack hook in `next.config.js`), which Firebase does run. **The step-2 deploy proof is what
     settles this assumption; nothing local can.**

The answer that satisfies all three: commit the client in `lib/generated/prisma` (webpack bundles its JS into the
server chunks), and have `next build` copy the one engine into `<distDir>/prisma-engine`. Then `lib/db.ts` tells Prisma
where it is with `PRISMA_QUERY_ENGINE_LIBRARY`.

## 3. Step 1: the parallel client (`lane/prisma-move`)

**What.** `scripts/prisma-generate.mjs` (which `postinstall`, `build` and `npm run prisma:generate` already run)
generates a second client into `lib/generated/prisma` after the public one:

- It is generated from a **derived schema**: `libSchemaFrom()` takes `prisma/schema.prisma` and swaps only the
  `generator client { … }` block, with `output = "./prisma"` and `binaryTargets = ["debian-openssl-3.0.x"]`. The
  derived file is written to `lib/generated/schema.prisma` for the generate and removed afterwards.
  - **Why not a second generator block in `prisma/schema.prisma` (what #247 did):** the schema is embedded in the
    public client (`public/_prisma/client/index.js` `inlineSchema`, plus two schema copies), so a second block
    rewrites the deploy artifact that step 1 must leave alone, and it trips the `prisma/` ban in
    `lib/privacy/u13-lock-log.test.ts` (#247 had to add a special case to that test). The derived schema changes
    neither `prisma/` nor `public/_prisma`, and `lib/privacy/u13-lock-log.test.ts` stays as it is.
- **No `"native"` target.** The Cloud Run engine (`debian-openssl-3.0.x`, which is what `schema.prisma` already lists
  for Cloud Run: linux x64, Debian/glibc, OpenSSL 3) and nothing else. No darwin dylib is committed. The generated
  files carry no per-machine entry, so a Mac and a Linux container regenerate it byte for byte (measured on Linux:
  three regenerations, identical hashes for every file).
  - The one exception, unchanged from the public client: a `.env` file in `FEL-full-app/` at generate time adds
    `schemaEnvPath` to the config (measured). CI has none, and the committed public client has none.
- Committed with the same `.gitattributes` treatment as `public/_prisma/client`; ignored by eslint.

**The guard.** `scripts/prisma-lib-client-tests.ts`, which `scripts/ci-suite.ts` picks up by its name, so
`.github/workflows` is unchanged. It checks that:

- `libSchemaFrom` changes only the generator block;
- the committed lib client is the derived form of the current `prisma/schema.prisma`;
- the two clients agree outside the generator block, and have the same runtime data model, Prisma version and engine
  version;
- the lib client targets debian only, with repo-relative paths, and has exactly one engine binary;
- it is tracked;
- the public client did not gain a second generator;
- in CI (`process.env.CI`), after `npm ci` and `npm run prisma:generate` regenerate it, `lib/generated/prisma` matches
  the commit byte for byte. This is a stronger form of CI's existing `git diff --exit-code` on the public client's
  `schema.prisma`; it can compare the whole directory because nothing in it depends on the machine.

Controls, run locally against the guard: a field added to `prisma/schema.prisma` without regenerating makes it fail
("is not prisma/schema.prisma's derived schema"). A byte appended to the committed `index.js` makes the CI check fail.

**Risk: LOW.** Nothing imports the new client. `public/_prisma` is byte-identical (`git diff` is empty), and
`scripts/prisma-artifact-tests.ts` is green with all 24 files tracked: the 23 files of the client, plus
`public/_prisma/schema.prisma`. Costs:

- about +3 s for every generate, including `postinstall`, `build`, and CI's two generates;
- +27 MB on disk, and about +10 MB packed in git (measured in the lane report).

From now on, every schema lane regenerates both clients. It already does: `npm run prisma:generate` runs both.

**Verify.** Run `npx tsx scripts/prisma-lib-client-tests.ts` and `npx tsx scripts/prisma-artifact-tests.ts`, then
`git diff <release> -- public/_prisma prisma` (expect it to be empty).

**Rollback.** Revert the merge. Nothing reads `lib/generated/prisma`.

## 4. Step 2: switch `lib/db.ts` and the imports (`lane/prisma-move-2`)

**What.**

- `lib/db/queryEngine.ts` (new) picks the engine before the client is constructed. If `PRISMA_QUERY_ENGINE_LIBRARY`
  is already set, it is left alone (an operator's override wins). Otherwise it uses the first of these that exists:
  1. `lib/generated/prisma/<engine>`: a source checkout on Linux.
  2. `<cwd>/<NEXT_DIST_DIR or .next>/prisma-engine/<engine>`: **the deployed function**, where `lib/` does not exist.
  3. On a non-Linux machine (the owner's Mac): the native engine that `@prisma/engines`' own install put in
     `node_modules/@prisma/engines`. This is the same Prisma version, so the same engine build, because the lib
     client has no darwin engine of its own.

  If none exists, it sets nothing, and Prisma searches its usual places and reports what it tried.
- `lib/db.ts` calls it, then imports the client from `@/lib/generated/prisma`.
- `next.config.js`, in the `webpack` hook, after aab9b5b0's MediaPipe `ignoreWarnings`, which is kept: for the
  production Node server compilation only (`isServer && nextRuntime === 'nodejs' && !dev`), it copies
  `lib/generated/prisma/libquery_engine-debian-openssl-3.0.x.so.node` into `<distDir>/prisma-engine/`.
  `outputFileTracingIncludes` traces `./lib/generated/prisma/**/*` in place of `./node_modules/.prisma/client/**/*`,
  which nothing imports any more. A missing engine is a no-op, not a failed build: CI's `.next-verify` build still
  works without a generate.
- All 113 `@/public/_prisma/client` imports (110 `from`, 3 `import()`, 1 `vi.mock`) and the two probes'
  `../../public/_prisma/client/index.js` become `@/lib/generated/prisma`. The change is mechanical, and a test pins
  that none are left.
- `public/_prisma` is **not** deleted and not changed. It keeps shipping, unused, so a rollback is a plain revert.

**Risk: MEDIUM.** This is the step that changes what production loads. Locally it is proven (see the lane report:
`next build` copies the engine, and a server started from a directory with **no `lib/`** answers DB-backed routes
through `.next/prisma-engine`). The packaging is the part only a deploy proves.

**Deploy proof (the owner approves and runs it; nothing merges to `main` without it).** See §7.

**Rollback.** Revert the step-2 merge and redeploy. `public/_prisma` is still committed and current, so the previous
loading path comes back unchanged. An emergency override that needs no code: set `PRISMA_QUERY_ENGINE_LIBRARY` on the
function to `/workspace/public/_prisma/client/libquery_engine-debian-openssl-3.0.x.so.node`. That engine is the same
build, from the same Prisma version.

## 5. Step 3: remove the remaining references

**What.** Everything that still names `public/_prisma` once nothing imports it:

- `package.json` `prisma.schema` becomes `prisma/schema.prisma`, and `prisma-generate.mjs` drops the public generate.
  The lib client then becomes the only generator. Its block can move into `prisma/schema.prisma` and replace the
  public one. The u13 `PARENT` bump is the owner's.
- `scripts/copy-prisma-schema.mjs` is deleted, along with its two `ci.yml` steps (`generated Prisma client is
  committed in sync` and `deploy Prisma schema is committed in sync`). These are `.github/workflows` edits, so they
  are flagged.
- `lib/db/prismaSchemaSync.test.ts` and `scripts/prisma-artifact-tests.ts` are retired. Their job moves to
  `scripts/prisma-lib-client-tests.ts`, which gains the "tracked, engine included" checks.
- The comments in `lib/coach/{messageReads,pendingSchema}.ts`, `lib/consent/guardianGate.ts`,
  `lib/knowledge/server/learnStore.ts`, `tests/helpers/stripeSales.ts` and `scripts/dev-setup.sh` are updated.
- The `public/_prisma` path filters in `lib/mirror/correctives.test.ts` and `lib/prq-recovery-self-reports.test.ts`
  become `lib/generated`.
- The `.gitattributes` lines and the eslint ignore are removed.

**Risk: LOW** once step 2's deploy proof is in. Production does not read any of this.

**Verify.** The full gate. `git grep -n "public/_prisma"` finds only this doc and the history notes.

**Rollback.** Revert.

## 6. Step 4: delete `public/_prisma`

**What.** `git rm -r public/_prisma`. This is a `public/_prisma/**` change, so it is the owner's.

**Risk: MEDIUM.** It is irreversible for anyone who downloaded the schema already, but nothing can be done about
that. Its only failure mode is a step-2 path that the proof did not exercise.

**Verify (deploy proof 2).** Run the §7 checklist again. Then `/_prisma/schema.prisma` and
`/_prisma/client/index.js` return **404** from the live site.

**Rollback.** Revert and redeploy. The files come back as they were.

## 7. The deploy proof for step 2 (owner-run; it is a deploy)

Deploy `lane/prisma-move-2` (after it merges into `lane/finish-release`, through the owner's usual release path), then
check:

1. **Before deploying**, in the deploy tree:
   - `git status` is clean apart from the known `yarn.lock`.
   - `ls lib/generated/prisma/libquery_engine-debian-openssl-3.0.x.so.node` shows the 17,121,656-byte engine.
   - There is no `darwin` file under `lib/generated`.
2. **The packager staged the engine.** After `firebase deploy` builds, before it uploads (or from the
   `.firebase/<site>/functions` staging directory it leaves behind):
   - `.firebase/<site>/functions/.next/prisma-engine/libquery_engine-debian-openssl-3.0.x.so.node` exists and is
     17,121,656 bytes. **If it is missing, stop:** the §2.3 assumption is wrong, and step 2 does not ship.
   - `.firebase/<site>/functions/lib/` does not exist. This is expected, and it is the point of the exercise.
3. **The function loads the engine.** In the function's Cloud Run logs after the first request:
   - There is no `PrismaClientInitializationError`, no "Query Engine (Node-API) library … could not be found", and
     no "engine not found".
4. **Old and new models both answer** (these are the probes from `docs/DEPLOY-NOTES-PRISMA.md`):
   - `GET /p/nope` returns **404**. That is `shareLink.findUnique`, an old model, and it is not a 500.
   - `GET /api/coach/invite/nope` returns its normal not-found answer, not a 500 `TypeError … reading 'findUnique'`
     (CoachInvite, the model that once proved a stale client).
   - A route that reads `RateLimit` (#405), for example one sign-in attempt, does not 500.
5. **The Cloud SQL connector path.** `CLOUD_SQL_INSTANCE` is set in production, so `createCloudSqlPrisma` builds the
   client. One signed-in page that reads the database, for example `/profile`, renders.
6. **The bundle did not grow by a second engine.** The function's source upload size is roughly unchanged:
   - Plus 17 MB for `.next/prisma-engine`.
   - Minus nothing until step 4: `public/_prisma` still ships.
   Record the number for step 4.
7. **Rollback drill (optional, cheap).** Set `PRISMA_QUERY_ENGINE_LIBRARY` to the public engine path from §4 on a new
   revision, and check that /p/nope still 404s. This proves the emergency override before it is needed.

Only after all of that do steps 3 and 4 proceed.
