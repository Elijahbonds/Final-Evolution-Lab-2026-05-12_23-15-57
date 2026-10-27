# SIGNATURE-PROGRAMS: FEL's four signature programs (lane `signature-programs`, 2026-10-25)

Owner decisions (2026-10-25, priority #3 of the round): **all four programs, first**. They are vertical jump,
basketball skills, athletic foundation and pain-free / prehab. They are built from the owner's books plus the exercise
library. Each runs 8–12 weeks and adapts to retests. Each shipped as a draft for the owner to review; **the owner approved all four as drafted on 2026-10-27** (in chat, "You do it. I approve.", cards C20/C21 — see §7). All four are
included in the athlete Premium subscription, with one free starter week. Prices and payments are the owner's call.

## 1. The programs

| Program | Planned (adapts) | Phases | Sessions | Exercises (library ids) | Retests |
|---|---|---|---|---|---|
| Vertical Jump | 10 (8–12) | Base 2 · Build 4 · Power 3 · Test 1 | 30 | 44 | jump check, landing check, Mirror |
| Basketball Skills | 10 (8–12) | Footwork and form 4 · Moves at speed 4 · Game reps 2 | 30 | 57 | shooting, jump check, Mirror |
| Athletic Foundation | 12 (8–12) | Positions 4 · Strength 4 · Speed and power 4 | 36 | 45 | Mirror, jump check |
| Pain-Free Prehab | 8 (8–11) | Calm and open 2 · Build capacity 3 · Load and integrate 3 | 24 | 47 | Mirror (plus pain check-ins and readiness) |

Every program also reads the daily readiness check (PR #447). Exercise counts include the calm step-downs.

The content lives in `lib/signature/content/*.ts`, one line per item: a library id, the section, sets, dose and rest.
Every item names its source:

- **The Dunk Program** (`programs/DUNK-PROGRAM.md`): the plyo ladder, Down–Up–Check, the 8-week shape, retests and
  deloads.
- **The Blueprint**: the `Exercise` knowledge base, phases 1–5 and chapters 1–20.
- **The Playbook**: `lib/coach/taxonomy.ts` SKILL_LAYERS, ch1–ch10.

What the books do not cover is listed in each program's `gaps`, shown to the admin on the page and on the review screen.

## 2. How it reuses the coach machinery (no second program system)

- **Weeks.** Each program week is a step of the coach templates' 4-week wave (`lib/coach/templates/waves.ts`: the
  same set deltas and bands, and YOUTH_WAVE under youth rules). Every prescription passes `lib/coach/loop.ts`
  validateExerciseSpec unchanged, plus `sessionWarnings`, one key set, and every library entry copying cleanly into a
  coach catalogue (`libraryToCatalogue`). See `lib/signature/check.ts`.
- **Easing.** A Low readiness day, or a pain check-in asking for an easier version, uses the readiness lane's
  `easeRow` / `neverHarder` over the drafts engine's `dose.ts easeStep`.
- **Gates.** Today's gates are the drills page's, read from `loadWarmupContext`: youth, pain, the jump gate and the
  red flag.

**The solo seam.** A solo athlete cannot hold a CoachingProgram, because it needs a coach. So the seam is one row per
adult per program, `SignatureEnrollment`: startedAt, the done session instances and the checkpoint decisions. The plan
itself is recomputed from the program, those decisions and the retests on every read.

## 3. Adaptation (`lib/signature/adapt.ts`)

A decision is taken at each phase's checkpoint. It is kept on the enrollment once per week.

- **Advance early:** at an early checkpoint, when every exit retest reads up (or the landing check passed).
- **Repeat the last week:** at the phase end, when a retest reads down, readiness was Low on ≥ 2 days that week (the
  readiness lane's draft trigger), or a pain check-in has not settled.
- **Continue:** otherwise, including when there are no numbers. A teen, or an adult who has not opted in, runs on
  schedule.
- **Never advance on a pain flag**, and never take the plan outside 8–12 weeks.

"Up" and "down" use existing bands only: profile v2's jump same-band, the Mirror's clean-share band, the daily
drill's shot band, and the weekly draft's drop thresholds. There is no new threshold.

## 4. Safety (`lib/signature/serve.ts`)

- **Red flag:** no session, and the intake's words.
- **Pain stop:** calm work only, with PAIN_DECISION_COPY ("check with a clinician", or "tell an adult").
- **Pain asking for an easier version:** the work eases, and the athlete reads the weekly draft's easeOffClientLine.
- **Jumps and landings** are swapped for a calm, youth-safe step-down when any of these apply: a pain decision other
  than continue, youth rules (a solo program has no coach to add them), the jump gate is shut (with the landing check
  link), or the details could not be read.
- **Youth rules** also stop the effort at Drive and drop max-effort cues.

The pain-free program's `prehabNote` is exactly "General prehab, not treatment." No copy uses a medical word: this is
tested against MEDICAL_WORDS and the share screen.

## 5. Delivery

- **Pages:** `/train/programs` (the list), `/train/programs/[id]` (overview, today's session, the week view) and
  `/coach/admin/programs` (the owner's review).
- **Wiring:** one Train card shows the athlete's week, and one line under `/profile/week` shows the program's week.
- **The daily drill:** today's session links to it as the warm-up. It pays the streak and LC through its existing
  claim.
- **A finished session** counts the streak day the way a Studio creation does (no LC, so the day's first game still
  pays) and pays SESSION_XP = 20 account XP (new; the same as a finished lesson), once per session instance.

## 6. Premium (`lib/signature/access.ts`)

- Week 1 is free. Later weeks need an active FEL Pro (`isProUser`).
- A locked week sends no content, and the server refuses to mark one (402).
- With `VIRTUAL_PURCHASES_ENABLED` off, no checkout link is shown.
- FEL Pro is 18+, so under youth rules the free week is the whole program. Their progress is kept on the phone
  (`lib/signature/deviceProgress.ts`), and nothing is written.

## 7. Storage: pending SQL (NOT applied)

`prisma/pending/2026-10-25-signature-programs.sql` adds `SignatureProgramReview` and `SignatureEnrollment`. Both are
additive, and they are guarded by the shared pending probe (`lib/signature/store.ts`).

Until the SQL is applied:

- Every program reads as a draft, so athletes see none. This still holds after the owner's approval (2026-10-27):
  the approval is a default in `lib/signature/access.ts` (`OWNER_APPROVED`) that applies only when the review table is
  readable and holds no row for a program. Without the tables the list says "Signature programs are coming soon"
  (`NOT_READY_LINE`), and every route answers 404/503, never 500 (`tests/signature-programs/owner-approved-seam.test.ts`).
  Once the SQL is applied, all four open to athletes within ~5 minutes (the probe), with no deploy. A review row still
  wins: rejecting a program, or "Back to draft", hides it again; saving edits keeps its status.
- The admin can preview the programs and read their checks.
- Start, approve and edit answer 503.

## 8. Rig

`CHROMIUM_EXE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx scripts/probes/_signature-programs-probe.mts <out>`

It renders nine scenes at 390 px and checks each one.
