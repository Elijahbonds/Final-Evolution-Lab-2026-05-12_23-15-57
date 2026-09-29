# Nexus + Cell audit — recovered headlines, detail still missing (2026-09-29)

**Status: INCOMPLETE. Six blocker names, no evidence behind them.** This file exists so the names are not lost a
second time. It is not the audit.

## What happened

A Claude session titled *"Role registry and ledger for AI PC"* (`session_01ESfT1cVk8bRdjBHTabCAJq`, 2026-09-16,
opus-5, ~$10 of work) audited **Nexus and Cell** and finished cleanly. It reported six blockers, retracted three of
its own findings as false, and reverted a `yarn.lock` `darwin-arm64` change.

Nothing was written down. Its branch `claude/ai-pc-role-ledger-69gptr` has since been deleted, and a search of this
whole repository on 2026-09-29 found no doc, no code and no commit mentioning any of it. The reasoning, the
measurements and the proposed fixes exist only inside that session's transcript.

That is consistent with the SHIP FIREWALL (`AGENT-OPERATING-RULES.md`: no Nexus/Cell orchestration code in this
repo) — the audit was about a codebase that is not here, so it had nowhere to land. The lesson is not about the
firewall though: **an audit whose output has no home produces nothing.** Point the next one at a file before it
starts.

## The six blockers, as named (headlines only)

These come from the session's own summary metadata, which is all that survived. Each needs its evidence recovered
before it can be acted on — do not treat a line below as a diagnosis.

| # | Blocker | What is missing |
|---|---|---|
| 1 | `cell-byok-routing` | How BYOK routing fails, and for which path |
| 2 | `cell-secret-at-rest` | Which secret, stored where, and the exposure |
| 3 | Cost accounting gaps | Which costs go unattributed, and to what |
| 4 | A CDN constraint | Which CDN, which limit, what it blocks |
| 5 | `npm ci` | The failure mode — reproducibility, lockfile, or install scripts |
| 6 | Price estimate | What was estimated and why it was judged a blocker |

Also reported, also unrecorded: **three findings retracted as false** (which three, and why, is not known), and a
**`yarn.lock` `darwin-arm64` revert** — plausibly the same class of platform-specific-artifact problem the Prisma
client has here (see `scripts/prisma-artifact-tests.ts`), but that connection is a guess, not a finding.

## How to recover the rest

The session is `IDLE` and `disconnected`, not lost. Its transcript and context are intact, so it can still answer.
It cannot be reached from a Claude Code cloud session — there is no `send_message` for cloud sessions in that
toolset, and `ListAgents` does not list it — so recovery is a person opening it:

1. Open `session_01ESfT1cVk8bRdjBHTabCAJq` from the session list at **claude.ai/code**.
2. Ask it to write each blocker up with the evidence it actually had — what it measured, why it blocks, the proposed
   fix — plus which three findings it retracted and why, and what the `yarn.lock` revert was for.
3. Have it commit that to a branch in whichever repo Nexus lives in, and replace this file with a pointer to it.

Until then, treat the table above as a list of questions, not answers.
