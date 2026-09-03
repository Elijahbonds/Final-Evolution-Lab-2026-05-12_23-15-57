# Gap Report — Workstream 1: Camp Blueprint (Education Pillar: Mentorship)

Audit only. No implementation code was written for this workstream.
Audited 2026-09-02 against the repository at commit `5322d8a` (the imported
handoff state). Scope respected: FEL side only — nothing under the CELL × NEXUS
Studio models (`CellProject`, `CellApiKey`, `CellSettings`, `CellUsage`,
`CellMessage`, `CellWisdom`, `lib/cell-compliance.ts`) or `lib/babylon/nexus/`
orchestration was read for reuse or proposed for change.

---

## 1. The premise, checked against what exists

The directive says the Camp "plugs into what already exists" via four seams.
Each was verified in code. **Two of the four hold. Two do not exist yet, and
the directive's language assumes they do.**

| Seam the directive assumes | What is actually there | Verdict |
|---|---|---|
| **"Shared Profile object (PRQ + Movement Signature + Educational Credentials + Performance History)"** | Not one object. Four separate things of uneven maturity — see §2. | ⚠️ **Partial** — no unifying object; one of the four parts does not exist at all |
| **"Curriculum content sourced from *The Neuro-Mechanic's Blueprint* modules already mapped into the Educational Track"** | The Educational Track (`TRACKS` in `lib/game-data.ts`) is **2 tracks × 2 modules × 3 lessons = 12 lessons**, titles only (`'Charge Mechanics'`, `'Hang Time Physics'`…), **no lesson body, media, or assessment**. "Blueprint" in the codebase means the *story spine* (`lib/story-data.ts`; `StoryNodeProgress.phase 1–5, chapter 1–20`), not a curriculum. | ❌ **Does not exist.** The Blueprint modules are not mapped into the track, and the track itself is a title skeleton. |
| **"Gameplay sessions use existing modes as the resiliency mechanism (PRQ growth over time)"** | Real and wired: `GameSession` → `PrqEntry` (`source: 'drillResult'`, `sessionId`), `ModeMastery`, `SignatureAttempt`. Twelve modes are signed off and measurable. | ✅ **Holds** |
| **"Credentialing extends the Creator Card system into a Facilitator Card"** | Real: `CreatorCard` model (slug, displayName, rarity, prq, signatureMove, published), `/api/v1/card/publish`, public `/card/[slug]`, `CardShare`. A clean extension point. | ✅ **Holds** |

## 2. The "Shared Profile" — what each part actually is

- **PRQ** — `PlayerProfile` carries eight attribute floats (strength, speed,
  endurance, agility, power, flexibility, recovery, mental) and `PrqEntry` is a
  sourced ledger of measurements (`attribute`, `value`, `unit`,
  `source: manual|device|drillResult`, `measuredAt`). **Mature.** A Camp
  session's "PRQ delta" can be derived from `PrqEntry` rows between two dates
  with no new schema.
- **Movement Signature** — `WorkoutScan` (`kind: movement_screen`,
  `metrics: Json` — jump height, depth, asymmetry, valgus…) analysed by
  `lib/workout/movement-screen.ts` into six pillars (power, mobility, symmetry,
  stability, cadence, posture) with flags. **Exists, as a scan result, not a
  profile field.** Nothing aggregates scans into a signature over time; the
  "delta" the Camp wants is between two scans.
- **Educational Credentials** — **no model.** `LessonProgress` records
  completions only (`trackKey`, `lessonKey`, `completedAt`). There is no notion
  of a credential, certificate, badge or assessment result anywhere in the
  schema (`grep -E "^model .*(Credential|Cert|Badge)"` → nothing).
- **Performance History** — `GameSession`, `ModeMastery`, `SignatureAttempt`,
  `LadderEntry`. **Mature.**

**Consequence:** the Camp cannot "reuse the Shared Profile object" because the
object is a concept, not a type. The first design decision is whether to
introduce a read-model that composes these four (recommended — no migration,
no duplication) or to leave the Camp reading four sources directly.

## 3. What already exists that the Camp should layer on (not duplicate)

The directive says "do not build it as a standalone system with its own
parallel data model." Three existing systems are directly in the Camp's path:

1. **The coaching program builder** — `CoachingProgram` → `Block` → `Session`
   → `SessionExercise`, with `ClientSession` + `ExerciseLog` for outcomes, and
   `ProgramExercise`/`Exercise`/`ExerciseCategory` as the catalogue. This *is*
   a "session structure with pacing" model. **Caveat, verified earlier in this
   project:** it is a UI-only local-state prototype on 3 of its 4 tabs
   (`components/training/**`); only the Exercise Library is wired to
   `/api/coach/programs/exercises`. So the schema exists and the backend
   largely does not. A `GoalPlan`'s milestone timeline and a `CampSession`'s
   "modules covered" are a `CoachingProgram` with a different vocabulary.
2. **The AI coach** — `lib/coach-service.ts` assembles real athlete state from
   Prisma (PRQ, recent sessions, lesson progress, credits), derives a
   deterministic readiness score, and drives three personas through an LLM.
   The "guided follow-ups" in the intake conversation have a home here without
   a new LLM integration.
3. **Session scheduling** — `SessionBooking` (`kind: group_workout | seminar |
   private_1on1`, `sessionKey`, `startsAt`, `shardsPaid`). A facilitator's
   scheduler is a new `kind` plus a facilitator relation, not a new table.

## 4. Gaps — what must be built, ranked by whether it blocks the flows

| # | Gap | Blocks | Severity |
|---|---|---|---|
| G1 | **No curriculum content.** 12 lesson *titles*, no bodies, no media, no assessment. The Blueprint modules are not in the track at all. | Flows 2, 3, and facilitator certification (Flow 1) — there is nothing to certify *against* | **Blocking** |
| G2 | **No credential/certification model** of any kind. | Flow 1 (Facilitator Card requires `certificationStatus`) | **Blocking** |
| G3 | **No `FacilitatorProfile`, `GoalPlan`, or `CampSession`** — nothing named goal, milestone, timeline, facilitator, mentee or mentor exists in `app/`, `lib/`, `components/` or the schema (verified by grep; the only hits are unrelated wallet/marketplace strings). | All flows | **Blocking** (expected — this is the epic) |
| G4 | **No template export/import** anywhere in the product. No serialization format, no versioning, no fork semantics. | Flow 4 | **Blocking** for Flow 4 |
| G5 | **Coaching program backend is mostly absent** (G3-adjacent): the schema the Camp should layer on has UI without persistence for programs/blocks/sessions. | Flow 3 if layered as recommended | High |
| G6 | **No composed profile read-model.** Four sources, no single object. | Flow 2 intake auto-generation | Medium |
| G7 | **Movement Signature has no history/aggregation** — scans exist, deltas must be computed ad hoc. | Flow 3 "Movement Signature delta" | Medium |
| G8 | **No resiliency metric exists.** The directive's `resiliency-metric log` has no counterpart; nothing measures failure/retry behaviour. `GameSession` has outcome and score; retry loops are not tracked as such. | Flow 3 | Medium |
| G9 | **No consent / minor / guardian model.** "What do you want to be when you grow up" implies mentees who may be minors; nothing in `User` or `PlayerProfile` models age, guardianship, or consent. | Flow 2 (legal) | High — **needs an owner decision, not code** |

## 5. Proposed data model — as deltas on what exists, not a parallel system

Everything below is additive. No existing table changes shape.

```
FacilitatorProfile   1:1 User
  userId, certificationStatus (enum: none|in_progress|certified|revoked),
  curriculumVersion (string), certifiedAt, activeMentees → [User]
  facilitatorCardId → CreatorCard   ← the Facilitator Card IS a CreatorCard
                                       with kind='facilitator' (add `kind` to
                                       CreatorCard, default 'athlete')

GoalPlan             1:N per mentee
  menteeId, facilitatorId, goalText, tags[], status (draft|locked|active|done),
  programId → CoachingProgram   ← the milestone timeline IS a CoachingProgram:
                                   milestones = Blocks, sessions = Sessions,
                                   target dates = Block/Session dates (add
                                   `targetDate` to Block)
  linkedModuleKeys[]  (trackKey/moduleKey pairs from TRACKS)

CampSession          1:N per GoalPlan
  goalPlanId, facilitatorId, menteeId, date,
  clientSessionId → ClientSession   ← outcomes already live there
  moduleKeys[], gameSessionIds[] → GameSession
  prqDeltaSnapshot Json   (computed from PrqEntry between sessions; cached)
  movementDelta Json      (computed between two WorkoutScans; cached)
  resiliencyLog Json      (needs G8 definition first)
  notes

CampTemplate          (Flow 4)
  authorFacilitatorId, name, version, forkedFromId?,
  structure Json  { blocks[]: { label, sessions[]: { moduleKeys[], modeKey,
                    pacingDays } } }
  published
```

Assessment for certification (G2) needs its own small model
(`CurriculumAssessment`: trackKey, moduleKey, questions Json, passMark) — but
**it cannot be designed until G1 has content to assess.**

## 6. Flows — what each needs, in dependency order

1. **Facilitator onboarding** — needs G1 (content), G2 (assessment + credential),
   the `kind='facilitator'` Creator Card extension. *Cannot start until the
   curriculum exists.*
2. **First session / intake** — needs G3 (`GoalPlan`), G6 (composed profile
   read-model), the AI coach for guided follow-ups (exists), G9 (consent).
   Draft-generation of milestones can reuse `WorkoutPlan`'s generator pattern
   (`tier`, `weeks: Json`, `focus` from weakest metric) — that is the closest
   existing "auto-generate a plan from a profile" code.
3. **Ongoing session** — needs G3 (`CampSession`), G5 (program backend),
   G7/G8 (deltas + resiliency metric), a **session-runner screen** (curriculum
   + a game mode side by side). Note: every mode already publishes
   `SessionResult` through `resultSink` → `/api/sessions`; a Camp session can
   subscribe to that rather than instrument modes.
4. **Replication / export** — needs G4 (`CampTemplate` + import/fork), and a
   versioning rule against `curriculumVersion` so a template built on v1
   content does not silently import into v2.

**UI surfaces** (all new): facilitator dashboard, goal-set intake, session
runner, Facilitator Card display (extend `CreatorCard` component with a
`kind` branch — small), template export/import.

## 7. Decisions needed from the owner before implementation

1. **Where does the curriculum content come from?** G1 is the critical path
   for the whole epic. The Blueprint modules need to be authored into `TRACKS`
   (or a richer lesson model) as real bodies + assessments. This is content
   work, not engineering, and nothing downstream can be certified without it.
2. **Who certifies facilitators, and against what pass mark?** G2.
3. **Minors and consent** (G9). This decides the intake flow's shape and is a
   legal question.
4. **Is the Facilitator Card a `CreatorCard` with a `kind`, or its own model?**
   Recommendation: extend — one publish path, one share surface, one rarity
   system. Only reject if facilitators must never appear in athlete card
   surfaces.
5. **What is the resiliency metric?** (G8) Retry rate after a failed attempt?
   Session completion under difficulty? Without a definition there is nothing
   to log.

## 8. What to build first, if approved

Nothing in §6 should start before decisions 1–3. When they land, the order
that unblocks the most is: **G2 + Creator Card `kind`** (small, mechanical) →
**G6 read-model** (small, pure) → **G3 models + G5 backend** (the epic's spine)
→ Flow 2 → Flow 3 → Flow 4.
