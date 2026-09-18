# FEL AVATAR SKELETON SPEC (LOCKED)

**Status:** authoritative. Every avatar asset, every animation, every
importer conforms to this or it does not ship.

---

## ⚠ CRITICAL CORRECTION TO THE INCOMING BRIEF

The brief this work came from specifies:

> Naming: preserve `mixamorig:` prefix throughout

**That is wrong for FEL, and locking it would break the entire shipped
animation library.** The live FEL rig uses **UNPREFIXED** bone names.

Evidence (all from shipped, live-verified code in this repo):

| Source | Evidence |
|---|---|
| `anim/clipBuilder.ts` | Resolves targets via `skeleton.bones.find(b => b.name === boneName)` against names like `Hips`, `Spine`, `LeftArm`. A `mixamorig:`-prefixed rig would resolve **zero** bones. |
| `anim/authored/eastbay.ts` + `dunkSuite.ts` + `locomotion.ts` | Every authored clip keys `Spine`, `Neck`, `LeftUpLeg`, `RightForeArm`, `Hips` — no prefix. These are the dunk clips currently on the live build. |
| `anim/mirroredClips.ts` (M28) | Contains an explicit correction: *"the shipped skeleton's bones are UNPREFIXED (LeftArm, RightUpLeg, … — verified from elijah-hero.glb). The draft's `mixamorig:`-prefixed pairs would match nothing and mirroring would no-op."* **This exact mistake has already been made once and caught once.** |
| `anim/importSanitizer.ts` / `GroundLock` | Looks up `'Hips'` unprefixed to clamp characters to the floor. |

If `mixamorig:` were locked as the standard, every authored clip, the
mirroring system, GroundLock, and the M64 rest-pose solver would silently
resolve nothing — characters would freeze at bind pose across all 23 modes.
That failure would look exactly like the "T-pose bug" that just took several
cycles to diagnose.

**Do not adopt the prefixed convention. The spec below is the real one.**

---

## THE LOCKED SPEC

| Property | Value |
|---|---|
| Hierarchy | Mixamo-standard humanoid |
| **Bone naming** | **UNPREFIXED** — `Hips`, `Spine`, `LeftArm`, … |
| Bind pose | T-pose |
| Up axis | Y |
| Forward axis | -Z |
| Units | meters |
| Root bone | `Hips` (used for height scaling) |
| Skeleton sharing | one skeleton instance per avatar; all slot meshes bind to it |

### Required bone names (the set FEL code actually references)

```
Hips
Spine, Spine1, Spine2, Neck, Head
LeftShoulder,  LeftArm,  LeftForeArm,  LeftHand
RightShoulder, RightArm, RightForeArm, RightHand
LeftUpLeg,  LeftLeg,  LeftFoot,  LeftToeBase
RightUpLeg, RightLeg, RightFoot, RightToeBase
```

A rig may carry more bones (fingers, twist bones) — those are ignored, not
rejected. A rig missing any name above **is rejected by the validation gate**,
because shipped clips key them directly.

### Importing a Mixamo/Meshy asset that DOES have the prefix

Strip it. That is the importer's job, not the runtime's:

```
mixamorig:LeftArm  →  LeftArm
```

`felimport/` performs this rename on ingest and records it in the fix ledger.
The runtime never sees a prefixed name.

### Bone count

The brief says "65 bones." FEL does not enforce a count — it enforces the
**required-name set** above. Enforcing an exact count would reject a
perfectly good rig that carries extra twist or finger bones, and would
accept a 65-bone rig with wrong names. Names are what the code resolves;
names are what we validate.

---

## WHY THIS IS THE SINGLE MOST IMPORTANT DECISION

Every retargeted animation, every authored clip, the mirroring system, the
ground clamp, and the rest-pose solver all resolve bones **by name at
runtime**. There is no name-mapping layer between the rig and the clips. The
name set above is effectively the project's ABI.

Changing it later is not a refactor — it is re-authoring every animation.
