# Agent operating rules (owner, 2026-09-03) — and how this repo reconciles them

The owner's rules are the authority for how work is done here. Where a rule
named a state this repository does not have, the owner decided (multiple
choice, 2026-09-03):

| Rule | Repo state | Owner decision |
|---|---|---|
| Mixamo 65-bone rig, `mixamorig:` prefix, T-pose | Gate 0 normalizes to the **22-bone unprefixed FEL spec**; every clip, test, planting and hand IK is built on it | **Keep the 22-bone spec.** Mixamo is an import format, normalized at load. |
| Vite · Vercel · KTX2 | Next.js 14 App Router; deploy host not recorded here; procedural textures | **Rules describe the target platform**; keep Next here, record the gap; KTX2 arrives with real skins (pass 3). |
| Never touch KarateEndlessMode | Rebuilt as the horde brawler at the owner's direction this morning | **Keep today's horde work**; retire/mount decision: mounted. |
| One mode at a time | Passes 2 and 3 are cross-cutting by the owner's request | **Cross-cutting passes may continue**, gauntlet at each phase boundary; the one-mode rule governs benchmark polish. |
| Mount queue: VelocityKartGrandPrixMode, AeroAcesFlyerMode; UnrealArenaMode | Not present in this repository's registry | Recorded; nothing to audit here until they arrive. |
| Streetball is the validated reference | Not present by that name; 1v1/3v3 (`OneVOneMode`, `ThreeVThreeMode`) are the basketball references here | Assumption: "Streetball" ≈ the 1v1/3v3 structure. |

Rules adopted as written, from now on:
- **GATE 0** before animation work: verify the rig's naming and rest state; say so. (Here: `gateContainerRig` on load; fel-hero passes as 22 unprefixed bones.)
- **SHIP FIREWALL**: no Nexus/Cell orchestration code in this repo.
- **TESTS** green before every commit; report the count (currently 33 suites / 213 tests).
- Explore → Plan → Implement → Verify. **Wait for sign-off** on anything touching physics, the rig, or the shared Profile object.
- Show diffs, not files. **Risk level on every change: LOW / MEDIUM / RIG-ADJACENT.**
- Neuro-Mechanic Mirror outputs are labelled "estimated engagement", never clinical measurement.
- Say "assumption:" when guessing. Never add a dependency without asking. Never mark a mode shipped without the written benchmark comparison.
- Scope drift: "That's scope drift — current mode is X. Confirm the switch?"

---

## Escalation: what an agent decides, and what it brings to the owner (owner, 2026-09-28)

Asked because these rules had never said, and because nothing loaded them: there was no `CLAUDE.md` in the repo for
860 commits, so every session started without this file. `/CLAUDE.md` now auto-loads and carries the short version.

| Question | Owner's answer |
|---|---|
| Uncovered decision, owner away | **Do everything reversible; stop before anything irreversible.** Don't idle on a question you can work around. |
| Push rights | **Lane branch only.** Merging a lane to `main` is the owner's, every time — green gate or not. |
| Extra always-ask categories (feel numbers, deploy files, test relaxations, guard tightening) | **None.** They are reversible commits on a lane, so they proceed — but they must be **flagged** in the commit body and the closing report. |
| Agent has evidence an instruction breaks something | **Stop, show the evidence, propose the alternative that serves the intent.** The owner decides. Don't comply into a known breakage; don't argue past the evidence. |

Why this shape works: `main` is the deploy branch, and the owner owns the merge. So every agent commit is reviewable
before it can reach production *by construction* — which is what makes "proceed and flag" safe for reversible work
and leaves only the genuinely one-way acts (a push to `main`, a deploy, a force-push, a deletion, a live migration,
anything outward-facing, a new dependency) needing a person.

What "flagged" has to mean, or the freedom above stops being safe: a tuned feel number, a relaxed assertion, a guard
tightened until the owner's own content fails, and any `assumption:` are all findable in the commit body and said
again in the closing report. A change the owner has to read the diff to discover was not flagged.
