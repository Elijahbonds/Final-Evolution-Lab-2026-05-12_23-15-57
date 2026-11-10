# The 10-phase training and coaching pass

**Owner, 2026-11-10:** the next 10-phase pass is **training and coaching**. The owner's answers:

| Question | Answer |
|---|---|
| What to push hardest | Polish what exists. No big new features. |
| Which parts | All four: the workout itself, the AI program builder, the Mirror and jump testing, the coach side and booking. |
| Who first | An athlete training alone. |
| When real people use it | Already, or this month. |
| What bothers the owner most | Too many steps. Looks unfinished. Demos and animations. Numbers I don't trust. |
| How each phase is checked | Screenshots and numbers after each phase; the owner plays it when a batch is deployed. |
| When it starts | Plan now; build as the running lanes finish. |

**Status: PLAN ONLY. Nothing here is built until the owner approves the plan.**

**Lane:** `lane/train-coach-pNN`, one phase at a time. Earlier audits this pass builds on: `TOOLS-EASY-AUDIT.md`,
`COACH-TOOLS-EASY-AUDIT.md`, `VERTICAL-EASY-AUDIT.md`, `SCREEN-EASY-AUDIT.md`, `PROGRAM-ASK.md`, `JUMP-PRO.md`,
`READABLE.md`, `PREMIUM-UI.md`.

## The four complaints, turned into things we can measure

| The owner said | What we count, on every screen a phase touches |
|---|---|
| Too many steps | **Taps and seconds per job.** A job is something a person came to do ("start today's workout", "log a set", "book a group"). Each job has a tap budget. No dead ends: every screen has one obvious next action. |
| Looks unfinished | **Unfinished marks:** "coming soon" text, empty screens with no next step, placeholder text, layout that breaks at phone width, a spinner with no words. The count only goes down, to 0 by phase 10. |
| Demos and animations | **Demo coverage:** of the exercises a person is actually shown, how many play the right demo. An exercise with no demo shows a labelled still pose, never the wrong movement. |
| Numbers I don't trust | **Every number says how it was measured and how sure it is**, and the same test twice gives nearly the same answer. A number that cannot say that is not shown as a fact. |

## How every phase ships

- **One phase at a time.** The lane merges the release, commits, pushes. The coordinator opens a PR and merges on green.
- **The owner gets, per phase:** one before/after contact sheet (JPG, phone width) and one small table of numbers
  (taps, seconds, unfinished marks, demo coverage, and the phase's own gate). Plain words. A 3-minute phone check list.
- **Measured on the rig**, phone first (390 px, CPU-throttled 4×), then 1280 px. Jobs are scripted so before and after
  run the same steps (`scripts/tools-easy-bench.ts` is the starting point).
- **The common gates**, on every screen a phase touches:
  - taps and seconds per job: at or under the phase's budget, and never more than before;
  - first screen of a do-this page: ≤ 40 visible words, one primary action, tap targets ≥ 44 px, no sideways scroll;
  - text per `READABLE.md` (the source-floor guard), accessibility audit with 0 serious findings;
  - unfinished marks: never more than before;
  - no existing tuned number, price, legal or policy text changes. New numbers go behind feel knobs or constants, flagged.
- **Never touched:** `schema.prisma`, the deploy config, age gates owned by the owner's other workstream, prices and
  legal copy, captured clips and the rig. New tables, if any are truly needed, are raw pending SQL for the owner to apply.

## Before phase 1: two owner steps that decide what real people can use this month

Several training and coaching features are built but **switched off until their database tables exist**. Polishing
them changes nothing for a real person until then.

1. **Apply the pending tables.** One command now does it (`docs/PENDING-SQL.md`): `plan`, then `apply`. This turns on
   group booking, saved AI programs, coach shot charts, the teacher pages and studio sharing, plus older ones.
2. **Booking setup:** which account is the trainer (`GROUP_BOOKING_OWNER_ID`), the three gym addresses, and the $75
   online 1:1 listing.

Phase 1 reports exactly which screens are dark for want of these.

## The ten phases

Ordered for "real people this month" and "an athlete training alone first": things a person would trip over come
before deeper polish, and the athlete's own path comes before the coach's.

### Phase 1 — Walk every job and fix what trips people
Walk every training and coaching job on the rig as three people: an athlete alone, a coached client, the coach.
Record taps, seconds, words, unfinished marks, demo shown (right / wrong / none), and each number shown with whether
it explains itself. Fix on the spot anything that stops a person: a dead end, a broken link, a button that does
nothing, a screen that is dark with no explanation.
**Gate:** the baseline table exists for every job; 0 dead ends; every dark feature says why and what to do instead.
**Owner gets:** the full job table (this is the scoreboard for the other nine phases) and the list of what is dark.

### Phase 2 — From opening the app to the first rep
The Train front door. One obvious thing to do today; resume where you left off; no choosing between five tools before
you can move.
**Gate:** open app → doing the first exercise of today's workout in ≤ 2 taps and ≤ 10 s on the throttled phone, with
or without a saved program. Unfinished marks on the Train hub: 0.

### Phase 3 — The workout itself
The session player: what an athlete looks at and taps while training.
- The demo leads each exercise and starts by itself; cues are one short line.
- Logging a set is one tap; the rest timer runs by itself; swapping an exercise is two taps.
- Finishing shows what you did and the next thing, never a blank "done".
**Gate:** log a set in 1 tap; a 5-exercise session start to finish in ≤ 12 taps beyond the sets themselves. Demo
coverage for every exercise in the built-in and signature programs: 100 % right demo or labelled still, 0 wrong. The
missing demos go to the animation lane as a ranked list.

### Phase 4 — The AI program builder
"All I have is a band" → a full program you can start today.
- Plain words in; equipment chips; a real plan out: full body covered, weeks that progress, sessions that fit the time.
- Change one thing ("make it 3 days", "no jumping") without starting over. Save, and start today's session.
**Gate:** ask → first rep in ≤ 4 taps. A fixed set of 24 asks (band only, dumbbells, no equipment, teen, bad knee,
20 minutes, and so on) all pass written rules: only owned equipment, every major pattern covered each week, sensible
weekly volume, youth rules kept, no medical claims. The rules are tests.

### Phase 5 — Numbers you can trust: jumping
Vertical jump and the jump tests.
- Every result says how it was measured and how sure it is, in one plain line.
- The same recorded jump analysed again gives the same number; a set-up problem (camera angle, feet out of frame)
  is caught before the jump, not after.
**Gate:** on the recorded fixture jumps, error and repeat-to-repeat spread are reported and shown to the athlete as a
± line; no jump number appears without its "how sure" line; a bad set-up is flagged before measuring in every fixture
that has one. Set-up to first result: ≤ 3 taps (holding the earlier vertical-easy result).

### Phase 6 — Numbers you can trust: the Mirror, sprint, bar speed, readiness
The same standard as phase 5 for the other camera tools and for readiness.
- One results layout for all of them: the number, how sure, what it means, what to do next.
- Readiness explains itself: what went into it and what it changed in today's plan.
**Gate:** every measured number on these screens has a method line and a confidence line; every result screen has
one next action that leads into training; the movement screen holds its 3-tap, under-3-minute result.

### Phase 7 — Progress, and a reason to come back
Progress page, personal bests, history.
- Each number on the progress page traces back to the session or test it came from, one tap away.
- After any workout or test, the next step is offered: tomorrow's session, a retest date, a harder variation.
**Gate:** from any progress number to its source in 1 tap; 0 numbers with no source; unfinished marks on progress
and history: 0.

### Phase 8 — Booking and groups, for the person joining
Find a group, see the gym and time, join, book a 1:1, see my bookings, cancel.
- The rules are stated where they apply, in the owner's approved words only: the 24-hour cancel rule, make-up days,
  pay at the gym. No new price or policy text is written.
**Gate:** join a group in ≤ 4 taps; book a 1:1 in ≤ 5; cancel in ≤ 3 with the rule shown before the tap; every booking
screen says where, when, and what to bring. (Needs owner steps 1 and 2 above to be seen by real people.)

### Phase 9 — The coach's day
What the coach sees and does: who trained, who needs attention, write or adjust a program, review a form clip, run a
group at the gym (roster, attendance), shot charts.
**Gate:** "who needs me today" is the first screen, in 0 taps; adjust one exercise in a client's program in ≤ 4 taps;
mark a group's attendance in ≤ 1 tap per person; review a form clip and reply in ≤ 4 taps.

### Phase 10 — Finish, and rehearse the whole thing
- Sweep every training and coaching screen for what is left: empty states, loading and error screens, wording that
  does not match between screens, phone speed.
- Rehearse three journeys end to end on the rig: a new athlete alone (ask for a program, train, test a jump, come
  back tomorrow); a client (join a group, book, train a coach's program, send a form clip); the coach (the day in
  phase 9).
**Gate:** unfinished marks: 0 on every training and coaching screen; all three journeys complete with no dead end and
within their summed tap budgets; phone load of the Train hub and the session player no slower than the phase-1
baseline. **Owner gets:** the scoreboard from phase 1, before → after for every job, and a 10-minute phone check.

## What this pass will not do

- No new features beyond what a gate needs. Ideas that come up are listed for the owner, not built.
- No prices, legal, policy or age-gate changes. No payment switch-on.
- No new exercise animations: missing demos are listed for the animation lane, which is already running.
- No changes to how the jump or screen maths works without showing the fixture numbers before and after.

## Owner calls before it starts (recommendation first)

1. **Approve this plan** as written, or change the order. *Recommend:* approve.
2. **Run the pending-tables command** before phase 8 at the latest. *Recommend:* now, so phase 1 audits the real thing.
3. **Booking setup** (trainer account, gym addresses, online listing). *Recommend:* before phase 8.
