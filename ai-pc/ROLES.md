# Roles, statuses and tiers

Roles do not message each other. A role reads the ledger to learn where things
stand, does one job, and appends one entry. That is the whole coordination
protocol — there is no inbox, no relay and no queue, and adding one would undo
the reason this exists.

## The statuses

Six, defined as an enum in `agent/ledger.py`. Nothing else is a status; the
ledger rejects an entry that tries.

| Status | Means | Who writes it |
|---|---|---|
| `PASS` | Verified, with an artifact that exists on disk. | Any role — but see below. |
| `SOFT_CLEAR` | Looks right, nobody independently checked it. | Any role. The honest default. |
| `BLOCKED` | Cannot proceed. The reason is in the note. | Any role. |
| `REFUSED` | QA tried it and it failed. | `adversarial-qa`, mostly. |
| `LIVE` | Running or deployed right now. | `ops`, `build`. |
| `PARKED` | Deliberately deferred. | Anyone, with a reason. |

**`PASS` is checked, not taken.** `ledger.append()` requires a non-null
`evidence` path that resolves inside the workspace and exists on disk. If it
does not, the entry is written as `SOFT_CLEAR` with the reason prefixed to its
note, and the model is told its claim did not stick. This is enforced in code
because no prompt reliably prevents a model from reporting success it cannot
show, and that failure mode is the expensive one.

`SOFT_CLEAR` is not a failure. It is what you write when the thing looks right
and you did not verify it yourself — which is most of the time, and is what
`adversarial-qa` exists to resolve.

Entries are append-only. There is no update path and no delete path in the
module, so nothing you write can be edited later, by you or anyone. A refusal
stays in the record after the fix lands; the fix is a later entry.

## The roles

Judgment-heavy roles run on a metered frontier model. Mechanical, high-volume
roles run on the local Qwen. Same loop either way — the tier picks the
provider and nothing else changes.

### Frontier tier

| Role | Job | Notably cannot |
|---|---|---|
| `pm` | Reads the ledger, decides what happens next, dispatches one role. | Write files. Run a shell. Dispatch itself. |
| `adversarial-qa` | Assumes every `SOFT_CLEAR` is a lie until it reproduces it. Writes `REFUSED` freely. | Write files — QA that can edit the code it audits will fix what it finds instead of reporting it. |
| `vision-guardian` | Guards scope. Flags work drifting from the ship goal into the moonshot goal. | Write files. Review code quality — that is not the job. |
| `cyber-security` | Reviews anything touching auth, secrets, or the tunnel. | Write files. Probe anything outside this stack. |

### Local tier

| Role | Job | Notably cannot |
|---|---|---|
| `build` | Writes and runs code. The only role with `write_file` in the repo workspace. | Claim `PASS` without an artifact. |
| `playtest` | Runs modes headless, captures screenshots, reports what it saw. | Write files. Diagnose causes. |
| `benchmark` | Researches reference titles, records measurable comparison criteria. | Judge our build against them. |
| `asset-pipeline` | Model/texture/audio conversion and validation. | Report success on an exit code alone. |
| `content` | Drafts copy and posts. Isolated workspace, no repo access. | Run a shell. Claim a feature the ledger does not show as `PASS`. |
| `ops` | Disk, container health, cost and usage tracking. | Delete anything, stop a container, or prune a volume. |

Without `ANTHROPIC_API_KEY`, frontier roles fall back to the local model and
log one warning at startup. Nothing crashes; the judgment-heavy roles just get
noticeably weaker.

### What "cannot write" actually means

Withholding `write_file` from the review roles is a guardrail against drift,
not a containment boundary. `execute_bash` can write too, so `adversarial-qa`
could edit the code if it decided to — the tool scoping makes repairing
awkward and unnatural rather than impossible, and the prompts say plainly not
to. The real boundary is the sandbox, which is the only place anything
executes and which resolves every path against the workspace root before
touching it.

`pm` is the only role with no route to the disk at all: no shell, no
`write_file`. `content` is the inverse — it can write, but only inside
`/workspace/content`, with no shell and no way to reach the repo.

## Adding a role

One YAML file in `agent/roles/`. The filename must match the `name` field.

```yaml
name: localisation            # slug, matches the filename
tier: local                   # frontier | local
description: Translates UI strings and checks them in context.
tools: [execute_bash, read_file, list_files, write_file]
workspace: /workspace/fel     # absolute; relative paths resolve here
subjects: ["i18n-*", "mode-*"]   # globs — what shows up in this role's brief
max_steps: 18
prompt: |
  What this role does, in two or three sentences.

  Refuse to: the three or four things it must not do.
```

`read_ledger`, `write_ledger` and `finish` are added automatically — a role
that cannot read the ledger is blind and one that cannot write to it is
invisible, so no config can drop them. `dispatch` belongs to `pm` alone.

The registry validates everything at startup and reports every problem it
finds, not just the first. An unknown tool name, an undefined tier, a relative
workspace, an unknown field or a name that does not match its filename all
stop the stack at boot rather than surfacing three steps into a mission.

Two things worth getting right:

**Scope the tools down.** A tool a role can see is a tool it will eventually
try. If a role should not change the code, do not give it `write_file`.

**Write the refusals.** The `Refuse to:` clause changes behaviour more than
the description does. What the role must not do is the part a model gets
wrong; what it should do it will mostly infer. A test asserts every shipped
role has one.

## Driving it

```bash
docker compose up -d --build

python agent/cli.py roles                        # who exists, tier, tool count
python agent/cli.py run ops "report disk usage"  # one role, one task
python agent/cli.py mission "get Gate 0 to PASS with evidence"
python agent/cli.py ledger                       # current state per subject
python agent/cli.py ledger --subject gate-0      # that subject's history
python agent/cli.py blockers                     # exits non-zero if any
```

`roles`, `ledger` and `blockers` are local reads and work anywhere. `run` and
`mission` need the sandbox and the model, which live on the compose network —
from the host, run them inside the container:

```bash
docker compose exec agent python cli.py run ops "report disk usage"
```

The console at `http://localhost:8001` has the same role selector and renders
ledger entries inline as they land, colour-coded by status.

A mission stops early in three cases: the PM declares the objective met, the
round cap is hit (open blockers are printed), or one role returns `BLOCKED` or
`REFUSED` on the same subject twice — which means nothing in the loop is going
to clear it, and the remaining rounds would only prove that slowly.
