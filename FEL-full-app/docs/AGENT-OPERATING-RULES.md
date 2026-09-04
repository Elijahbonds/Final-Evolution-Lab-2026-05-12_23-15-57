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
