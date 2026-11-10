# Pending SQL in one command

**Owner call, 2026-11-10 (delegated): "apply the pending tables so those features turn on."** An agent may not write to
production (CLAUDE.md), and this session has no route to it. So this is everything short of the write: a tool that makes the
write one command, proven on throwaway databases. The command in §1 is the owner's.

## 1. The two commands

Run in the deploy tree's `FEL-full-app/`, with the production direct URL loaded the way `OWNER-RUNBOOK.md` §3 loads it
(the variable is `PROD_DIRECT_URL`; the tool never prints it and never takes it from the command line).

```sh
npx tsx scripts/pending-sql/cli.ts plan     # read-only: what production lacks, and the order
npx tsx scripts/pending-sql/cli.ts apply    # the same plan, then applies each APPLY line   [IRREVERSIBLE]
```

To turn on only the five features that are waiting today:

```sh
npx tsx scripts/pending-sql/cli.ts apply --only 2026-10-26-studio-share.sql,2026-11-02-group-booking.sql,2026-11-03-hoops-cam.sql,2026-11-03-program-ask.sql,2026-11-03-teacher.sql
```

**You should see** one `applied  <file>` line per file, then `done: N file(s) applied.` A second `plan` then says
`0 to apply`.

No deploy is needed after it: each feature probes for its table (`lib/coach/pendingSchema.ts`) and lights up on its own.
assumption: a running instance may keep a "not there" answer until it restarts; a new revision or the next cold start
clears it.

## 2. What it does

`plan` reads the database's catalog (tables, columns, enum types, indexes, constraints) and compares it with what each
file in `prisma/pending/` creates. Per file:

| Line | Meaning |
|---|---|
| `APPLY` | The database has none of the file's objects (or the file is re-runnable and lacks some). It will be applied, after every file it depends on. |
| `skip … already applied` | The database has every object the file creates. |
| `skip … manual` | The file changes rows (today: the two `guest-token-hash` files). It is listed and never applied by this tool; it keeps its own session. |
| `STOP` | The file is partly applied and not re-runnable, or needs a table nothing provides. Nothing is done with it; the line says what the database has and lacks. |

`apply` runs each `APPLY` file through `prisma db execute`, one at a time, in dependency order. After each file it reads
the catalog again and stops unless the file is now fully there.

It only ever runs a file from `prisma/pending/` exactly as reviewed. It never drops, renames or retypes anything, and a
file that contains such a statement is `manual`.

## 3. What was measured (Postgres 16.15, local throwaway, 2026-11-10)

| Scenario | Result |
|---|---|
| A database made by `prisma db push` of today's schema (has the 15 schema-backed files' objects, none of the raw-SQL ones) | plan: 21 to apply, 17 skipped. apply: 21 applied. Second plan: 0 to apply. |
| An "old production": the same, with the 15 schema-backed files rolled back by their own rollback statements | plan: 36 to apply, 2 skipped (manual). apply: 36 applied, in dependency order (instructor → booking → call signal). Second plan: 0 to apply. `prisma migrate diff` against `schema.prisma`: no `CREATE` or `ADD` line left. |
| One table of a re-runnable file dropped (teacher) | `APPLY … re-runnable; lacks table TeachCourse, …`; applied. |
| One index of a plain file dropped (party report) | `STOP … partly applied and not re-runnable: has …; lacks index …`; exit 1; nothing written for it. |
| A file that cannot apply (a blocking table of the same name) | `FAILED`, the database's own error with the URL redacted, and nothing from the file kept. |
| A two-statement file whose second statement fails, through `prisma db execute` | the first statement is not kept: the file is one transaction. (The runbook's §5.3 assumed a failed file "may have applied its first statements"; on Postgres it does not.) |

Not measured: production itself, Supabase's roles (`anon`, `authenticated` exist there and not on the throwaway; the two
hardened files guard for both cases), and a database with rows in the tables.

## 4. Limits

- The catalog check is by name. A table that exists with different columns reads as "applied". `OWNER-RUNBOOK.md` §5.4
  (the read-only schema diff) is still the check for the schema-backed files.
- The raw-SQL tables are not in `schema.prisma`, so that diff prints `DROP TABLE` for them afterwards. That is expected
  (`DB-GUARD.md` "Never apply the DROP").
- Tests: `scripts/pending-sql-tests.ts` (17 checks, offline, in the ci-suite).
