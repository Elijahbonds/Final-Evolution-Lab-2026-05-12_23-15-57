# Releasing: notes, What's new, rollback

Owner, quality round (2026-10-20): "plain-language release notes generated from merged PRs, plus an in-app What's new
page. A documented one-command rollback. A preview channel per release before main moves." This file is the process.
Lane `quality-gates`, QG-05, 2026-10-25.

What this lane did **not** do, because each is a deploy or outward act (owner item OWN-22): push version tags, create a
Firebase preview channel, deploy, or move `main`. Section 5 has the commands for when the owner says go.

## 1. Before a deploy: the notes

```sh
cd FEL-full-app
git fetch origin
npx tsx scripts/release-notes.ts --bodies                       # print them (origin/main..origin/lane/finish-release)
npx tsx scripts/release-notes.ts --bodies --write --version "Nov 2"   # record them in lib/release/releases.json
```

- **The range.** By default, from the last release in `lib/release/releases.json` (or `origin/main` when there is
  none) to `origin/lane/finish-release`. `--from <sha> --to <sha>` picks any range: "the last deploy" to "this deploy".
- **The words.** Each merged PR becomes one line, from its title, cleaned: the lane code at the front, anything in
  brackets, and the clauses after the first `;` are dropped. A PR can say it better itself: a line in its body
  `What's new: Your teammate now calls for the ball.` is used as written, and `What's new: none` keeps it off the
  public page. `--bodies` reads PR bodies through `gh` (signed in); without it the titles are used.
- **Who sees what.** PRs that are work for the team (docs, tests, pins, CI, Prisma moves, a bare lane code) are
  "team only": in the printed list for the owner, not on `/whats-new`. Each line is filed under Games, Training and body,
  Coaching, Store, Account and privacy, The app, or Fixes.
- **Editing.** `lib/release/releases.json` is the record; fix a line's `text` there if it reads badly, or set
  `public: false`. Commit it on a lane like any change. `lib/release/notes.test.ts` checks it is well formed.

The first record (`October 2026 update`) covers the 82 PRs merged since the quality round (2026-10-20): no deploy SHA had
been recorded, and `docs/CHANGELOG.md` stops at the 2026-09 release candidate. assumption: that is the right starting
point; regenerate it with `--from <the last deployed sha>` if the owner knows the real one.

## 2. The What's new page

`/whats-new` (`app/whats-new/page.tsx`) shows the public notes of every release, newest first, signed in or out. It is
linked from the public footer (`components/public-chrome.tsx`). A release reads "Rolling out" until it is marked
deployed (step 3), then "Live since <date>". `lib/release/whatsNewPage.test.tsx` renders it.

## 3. After a deploy: record it

```sh
npx tsx scripts/release-notes.ts --deployed <the sha you deployed>    # sets deployedAt on that release
```

This is what the rollback reads: the release that was live before this one.

## 4. Rollback, in one command

```sh
cd <DEPLOY_TREE>/FEL-full-app
scripts/rollback.sh                 # = --dry-run: the rollback SHA, the checks, the steps. Changes nothing.
scripts/rollback.sh --checkout      # the same, then checks the rollback commit out here. Still no deploy.
```

**Which commit.** `--to <sha>` if given; else `ROLLBACK_SHA` from the environment (the SHA written down in
`docs/OWNER-RUNBOOK.md` §2); else the newest release in `lib/release/releases.json` that was deployed and is not the
live one. The live one is this tree's `HEAD` (what it last deployed), or `--current <sha>`.

**What it checks, before printing anything to run:**

- it is a commit, and not the live commit;
- it is an ancestor of the live commit (a warning if not: that is a different line, not a step back);
- the committed Prisma client is in it, with the Linux engine Cloud Run loads (`/CLAUDE.md`: "the trap that has cost the
  most deploys"). Missing: it refuses;
- whether the Prisma schema, `package-lock.json` and `firebase.json` differ from live, and what that means (the SQL stays
  and the old code ignores the new tables; `npm ci` is needed; the old hosting config deploys);
- with `--checkout`: that the tree is clean.

**What it prints:** the fast rollback (send Cloud Run traffic back to the previous revision: seconds, no build) and the
clean one (check out, `npm ci` if the lockfile moved, restore the Prisma client, deploy), exactly as runbook §11.4. The
deploy line is printed, never run. `lib/release/rollback.test.ts` holds that, on a throwaway repository.

Dry run on this lane, 2026-10-25, against a three-release record (C live, B and A before it):

```
rollback: live e173f41373c354ac07c9892c4ece50b81121768e
ROLLBACK_SHA=d8e00c21ef97c0066c9d7dc7e245692422eff903   (from the previous deployed release in …releases-fixture.json)
checks:
  ✓ it is an ancestor of the live commit (a step back, not sideways)
  ✓ the committed Prisma client carries the Linux (debian) engine Cloud Run loads
  ✓ same Prisma schema as live
  ✓ same package-lock.json as live: no npm ci
  ✓ same firebase.json as live (same secrets wiring)
```

## 5. Owner-gated, not done here (OWN-22)

When the owner says go, these are the commands. Each is outward-facing or changes what deploys.

- **A version tag per release** (after the deploy):
  `git tag -a v2026.11.02 <deployed sha> -m "<version>: see /whats-new" && git push origin v2026.11.02`
- **A preview channel per release, before main moves** (Firebase Hosting preview channels; web frameworks are
  supported for previews): `npx -y firebase-tools@latest hosting:channel:deploy rc-2026-11-02 --project
  final-evolution-lab --expires 7d` from the deploy tree at the release SHA. It builds and serves the release at its own
  URL, against the **production** database and secrets: a preview is real traffic to real data, so it is a deploy in
  every sense but the main URL. The owner checks it on a phone, then deploys to live (runbook §11).
- **CI for both** (the notes printed on every PR to `lane/finish-release`, a preview per merge): the exact workflow diff
  is in `docs/QUALITY-GATES-PROPOSAL.md` §4.
