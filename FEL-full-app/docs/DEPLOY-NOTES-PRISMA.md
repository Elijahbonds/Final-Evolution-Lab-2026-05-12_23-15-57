# The deployed Prisma client, and why a new model 500s in production

**2026-09-20.** Two tables (`CoachInvite`, `CoachClient`) were added, pushed to the hosted database, shipped in the
schema copy, and the live routes that use them still throw. Six deploys of investigation; this is what is now known,
so the next person starts from here instead of from the beginning.

## The symptom, precisely

```
/p/nope                  404   ← prisma.shareLink.findUnique works
/api/coach/invite/nope   500   ← TypeError: Cannot read properties of undefined (reading 'findUnique')
```

Same client, in the same request path. Old models present, new models absent. **The deployed client was generated
from a schema that predates the new tables.** It is not a database error — the tables exist on the configured host,
verified by querying `information_schema` through the same `DATABASE_URL` the function uses.

## Three facts that constrain any fix

1. **The cloud install skips scripts.** The deploy log carries `npm warn install-scripts @prisma/client@6.7.0
   (postinstall: node scripts/postinstall.js)` — npm announcing it is not running them. Nothing regenerates the
   client up there, ever.
2. **Firebase ignores the custom build script.** Its own warning: *"Your package.json contains a custom build that
   is being ignored. Only the Next.js default build script (e.g, `next build`) is respected."* So neither
   `copy-prisma-schema.mjs` nor `prisma generate` can be hung off `build` and expected to run at deploy time.
3. **`prisma/` is not in the function bundle.** Only `.env*`, `next.config.js`, `package.json`,
   `package-lock.json`, `server.js`, `public/` and `.next/` are copied. This is why `public/_prisma/schema.prisma`
   exists at all, and why `postinstall`'s old `--schema=prisma/schema.prisma` pointed at nothing.

## What was tried, and what it cost

| attempt | result |
|---|---|
| Refresh the stale `public/_prisma/schema.prisma` copy | necessary, not sufficient — now guarded by `lib/db/prismaSchemaSync.test.ts` |
| Fix `postinstall` to drop the missing `--schema` path | necessary for local/CI, cannot help in cloud (fact 1) |
| Delete the staged `.firebase/.../node_modules/.prisma` | **actively harmful** — that was the only current client the bundle had |
| Keep the staged client (verified current, contains the model) | no change live |
| Clean `.next` rebuild | no change live |
| Move `prisma generate` into `build` | unreachable (fact 2) |

## What has NOT been tried, and is the most likely fix

Generate the client into the **source tree** (`generator { output = "../lib/generated/prisma" }`) so it is an
ordinary traced module rather than a `node_modules` lookup that a cloud reinstall can replace. Two caveats found
while prototyping it and then reverting:

- `output` is relative to the **schema file**, and there are two schemas at different depths. Generating via
  `public/_prisma/schema.prisma` silently wrote the client to `public/lib/generated/prisma`. The copy script has to
  rewrite the path, or both schemas need their own correct relative output.
- All 37 importers take `PrismaClient` / `Prisma` from `'@prisma/client'`. A `tsconfig` path alias would redirect
  them without touching the files, but that needs verifying against the bundler, not just the typechecker.
- The generated client with both binary targets is ~44 MB. Committing it makes production deterministic; that is a
  repo-weight decision for the owner, not one to take quietly.

It was prototyped and reverted rather than shipped half-finished: the tree is on the default generation path, which
is the state every other model in the app is working under.
