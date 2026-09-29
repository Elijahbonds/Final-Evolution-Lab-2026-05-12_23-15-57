# Final Evolution Lab — how agents work here

The owner's rules live in **`FEL-full-app/docs/AGENT-OPERATING-RULES.md`** and are the authority. Read that file
before non-trivial work. This file exists because that one does not auto-load, so for 860 commits every session
started blind to it — including the ones that changed tuned physics and proposed deleting a deploy artifact.

The app is `FEL-full-app/` (Next.js 14 App Router + Babylon.js). Run commands from there.

**Parallel lanes (owner, 2026-09-28).** Every lane works on its own branch in its own worktree, and each green phase
reaches `lane/finish-release` through a PR that the owner merges. Nobody commits in the shared checkout
`mode-lanes/wt-finish-release`. The lane rules, the registry of who owns which files and ports, and the deploy and
capacity limits are in **`FEL-full-app/docs/LANES.md`**. Read it before you start or land lane work.

---

## When to ask, and when to just go (owner, 2026-09-28)

**The rule: do anything reversible. Stop before anything irreversible.**

A commit on a lane branch is reversible — the owner reviews it when the lane merges. So you do not need permission
to write code, change a number, add a test, or refactor. Make the call, do it well, and **flag it** (below).

**Stop and ask — do not proceed on your own judgement:**

- **Pushing to `main`.** `main` is the deploy branch (Firebase web-frameworks; a push ships). Agents push to their
  **own lane branch only**. Merging a lane to `main` is the owner's call, every time, even with a green gate.
- **Any history rewrite on a shared branch** — force-push, rebase, amend, `push --force-with-lease`.
- **Deleting anything that isn't yours** — a branch, a ref, a file you didn't create, a database row or table.
- **Triggering a deploy**, or changing what deploys (`firebase.json`, the `build` script, `public/_prisma/**`).
- **Destructive database work** — `prisma db push`/`migrate` against anything but a local throwaway.
- **Anything outward-facing** — posting to GitHub, sending to an external service, publishing.
- **Adding a dependency** (already an owner rule).
- **Scope switch.** Say: *"That's scope drift — current mode is X. Confirm the switch?"*

If the owner is away, do every reversible part of the task, leave the irreversible step undone, and say plainly in
your final report what is waiting and why. Do not sit idle on a question you can work around.

**Flag loudly, but don't block on:**

These are reversible, so proceed — but the owner must be able to find them without reading the diff. Name them in
the commit body *and* in your closing report:

- **A tuned feel number** — speed, acceleration, deceleration, camera distance, difficulty, timing window. The owner
  has felt these and signed them off. Say what you changed, from what to what, and why. Their eye is the judge.
- **Relaxing a test instead of fixing the code** — widening a window, deleting an assertion, skipping a suite. State
  that you did it and why the old assertion was wrong. (This repo lost four assertions once to silent normalisation
  as "pre-existing", which is how the headless suites rotted unnoticed.)
- **Tightening a guard so existing content starts failing** — if your stricter standard makes the owner's work red,
  that is a finding to report, not a licence to edit their content until it passes.
- **Any guess.** Write `assumption:` and say what you assumed.

**When you believe an instruction is wrong:** stop, show the evidence, propose the alternative that serves the
intent, and let the owner decide. Do not comply into a known breakage; do not argue past the evidence either.

---

## Before you commit

- `npx tsc --noEmit` clean.
- `npx tsx scripts/ci-suite.ts` — discovers every `scripts/*-tests.ts`. All green.
- `npx vitest run` — all green.
- Report the counts. They only go up; a drop means you dropped something.

A guard that fails is a bug report until you have *measured* otherwise. This repo's costly mistakes were all
assumptions that read like facts — so verify a probe against a known-good control before trusting what it tells you,
and never conclude from an import what you could have measured from the running rig.

## The trap that has cost the most deploys

`public/_prisma/client/` is a **committed build artifact** and must stay tracked. The Firebase packager snapshots
`public/` from the source tree *before* the build runs, and that directory carries the Linux query engine Cloud Run
loads — so an untracked client is a function with no engine, green locally and 500 in production. It cost ~10 deploys
once. It goes dirty on any machine whose `native` binaryTarget differs (a Mac bakes `darwin-arm64`); that is expected,
not a defect. `scripts/prisma-artifact-tests.ts` guards it; `prisma/schema.prisma`'s generator block tells the story.

Generally: a green test suite and a broken production coexist easily here. Anything touching the deploy needs a real
deploy to verify, not a passing suite.
