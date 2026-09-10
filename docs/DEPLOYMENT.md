# Deploying Final Evolution Lab

Before this document existed the repo had no deployment path at all: no CI, no
container definition, no env template, and a `prebuild-gate.js` that claimed to
gate builds but was referenced by nothing. This is the real one.

## What runs where

| Piece | What it is |
|---|---|
| App | Next.js 14 (app router), Node 22 |
| Database | Postgres, via Prisma 6 (`prisma/schema.prisma`) |
| Auth | NextAuth (credentials + Prisma adapter) |
| Test gate | `scripts/ci-suite.ts` — 135 suites, discovered not listed |

## 1. Environment

Copy `.env.example` to `.env` and fill it in. Only three values are needed to
boot: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`. Everything else
degrades gracefully — Stripe unset disables purchase routes, S3 unset disables
asset upload, and so on.

`NEXTAUTH_URL` must match the deployed origin exactly or every sign-in
round-trip breaks.

## 2. Database

There is no migrations folder — the schema is applied with `db push`:

```bash
yarn prisma generate          # required before build AND before tests
yarn db:push                  # apply prisma/schema.prisma
psql -h <host> -p <port> -U <user> -d <db> -f prisma/wallet-constraints.sql
yarn db:seed                  # optional: safe-seed.ts, idempotent
```

`wallet-constraints.sql` adds the non-negative-balance and idempotency
constraints the wallet relies on. It is **not** part of the Prisma schema, so
`db push` alone leaves the ledger unprotected. Apply it on every fresh database.

Note: `psql` rejects Prisma's `?schema=` query parameter, so connect with
explicit flags rather than passing `$DATABASE_URL`.

## 3. Tests

```bash
yarn test          # all suites; DB-backed ones skip if DATABASE_URL is unset
yarn test:ci       # all suites; a skipped DB suite is a hard failure
yarn test:list     # show the discovered plan, marking [db] suites
yarn tsx scripts/ci-suite.ts --filter tennis --concurrency 1   # one area
```

`ci-suite.ts` discovers every `scripts/*-tests.ts` on disk rather than reading a
hand-maintained list, so a new suite cannot be added and silently never run. It
also refuses to start if a suite imports Prisma without being declared in
`DB_SUITES`, which keeps the DB gate honest.

The older `scripts/standing-suite.ts` still works and still runs its curated
61-suite list; `ci-suite.ts` supersedes it for gating.

## 4. Build

```bash
NEXT_OUTPUT_MODE=standalone yarn build
```

`standalone` emits a self-contained server bundle. Two directories are *not*
traced into it and must be copied in beside `server.js`:

```bash
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
```

Then `node server.js` from inside `.next/standalone` (respects `PORT`).

`next.config.js` pins `outputFileTracingRoot` to `__dirname`. It previously
pointed at the parent directory, which nested the whole bundle under a folder
named after whatever the build machine's checkout directory happened to be
called — so the deploy layout changed depending on where it was built. Leave it
at `__dirname`.

`typescript.ignoreBuildErrors` is `false`: a type error fails the build. That is
deliberate — don't flip it to unblock a deploy.

### A note on lint

Lint runs as `eslint .` against `eslint.config.mjs`, **not** `next lint`. Next
14.2 drives ESLint through the v8 API and this tree is on ESLint 9, which
removed the options it passes, so `next lint` fails before linting anything.
Running `eslint` directly avoids downgrading either. `eslint-config-next` is
still a legacy shareable config, so the flat config wraps it with `FlatCompat`.

`eslint-plugin-react-hooks` is pinned to 5.x for the same reason: 4.6 calls
`context.getSource()`, removed in ESLint 9, and crashed the run.

## 5. CI

`.github/workflows/ci.yml` runs on pushes to `main` and `claude/**`, and on PRs
into `main`. Three jobs:

1. **Regression suite** — boots a Postgres 16 service, applies the schema and
   the wallet constraints, runs all 135 suites with `--require-db`.
2. **Typecheck & lint** — `tsc --noEmit` plus `eslint .`.
3. **Standalone build** — needs both of the above; builds, packages, boots the
   server and curls `/` before uploading `fel-standalone.tar.gz` as an artifact
   (14-day retention).

A build that has not served a `200` on `/` is not considered green.

## 6. Hosting

The artifact is a plain Node server, so anything that runs Node 22 works:
container platform, VM behind a reverse proxy, or a Next-aware host. Whatever
you pick needs:

- Node 22
- A reachable Postgres with the schema and `wallet-constraints.sql` applied
- The env vars from `.env.example`
- `public/` and `.next/static/` copied in beside `server.js` (see step 4)

The `public/` directory is large — Babylon engine vendor bundles, Draco/Basis
loaders, venue art, mocap descriptors — so prefer a host that serves it from
disk or a CDN rather than one that inlines static assets into a function bundle.
