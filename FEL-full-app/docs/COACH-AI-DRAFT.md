# Weekly program drafts a coach approves

Lane `lane/coach-ai-draft`, 2026-10-24. Owner decision of 2026-10-24 ("build first"): AI-drafted weekly program updates
from real client data, approved by the coach. The coach-store, readiness and video lanes follow.

**State:** the drafts are built and tested. **Approvals stay off until the owner applies the pending SQL** (§4). The AI
layer stays off until `ABACUS_ENABLED=true`. Solo drafts are off and not wired to any page (§6).

## 1. What a coach sees

`/coach` → **Clients** → **Drafts for this week**, under "Needs you today". The inbox has one card per athlete on the
coach's live roster. Each change on a card has:
- a **title** (`Trap-bar deadlift: 60 kg → 62.5 kg`);
- a **reason** that cites the data (`Hit the top of 8-10 on every set in the last 2 sessions at effort 7 or less.`);
- a **confidence** (high, medium or low);
- a **safety class**:
  - **Safe**: eases off, steps back, adds Prep work, or asks the coach to check in.
  - **Review**: moves the athlete forward.
- **The data and the edits**: the logs behind the change, each row before and after, and the Playbook step it follows.

Each change can be **approved**, **edited** (sets, reps, load and band only) or **rejected** on its own. **Approve all
safe** takes only the Safe changes. Changes the engine would not offer are listed under **Held back**, each with the
reason. **What the draft read** lists which data the draft used and which it was not allowed to read.

The athlete's **Today** shows **Your coach updated your plan**: one plain line for each approved change, and the
coach's optional note. The note is also posted in the program's thread. Today shows the new prescription itself,
because an approval is an ordinary builder write.

Screenshots (rig, phone 390 px and desktop 1280 px):
`scratchpad/round7/coach-ai-draft/shots/` (drafts pending, after "approve all safe", the not-ready banner, and the
athlete's card).

## 2. The rules engine (`lib/coach/weeklyDraft/rules.ts`) — always on, no AI

It drafts for the coming week: the first program week (block) that still has a session to do, and only rows with
nothing logged on them. The rules run most careful first, and a later rule never touches a row an earlier rule
already changed:

1. **Marked Out** by the coach: nothing is drafted.
2. **A pain flag** (a stop outcome in the last 14 days): **ease off** this week, with "if it has not settled, they should
   see a professional". After a hard stop the wording follows the check-in's own words: "check with a clinician" for
   an adult, "tell an adult" for a teen. With the athlete's `coach_view` grant, the named exercise steps down its
   easier-version ladder. Without the grant, the coach is told only that an exercise was paused (the attention
   board's own wording). **Nothing moves up while a flag is open.**
3. **Low compliance** (stalled, slowing, or 2+ planned sessions missed): **check in**, and trim one set from each
   support (Assist and Finish) row. The key lift stays as written.
4. **A lighter week (deload)** when any of these hold:
   - top-set effort has averaged 8.5 or more over 4+ logged exercises;
   - readiness was low on 3 of the last 7 check-ins (`coach_view` only);
   - the PRQ composite dropped by `OFF_BASELINE_DROP` (8).
5. **Mirror form** down 8+ points over 2 weeks: the squat and lunge rows step back. **Jump** down 1+ inch: one set
   fewer of the jump work.
6. **Per exercise**, judged on its last two logged exposures:
   - **Two misses** (under the range, or half the sets at a limit): one step back, or the easier version when the
     athlete fell far under the range.
   - **Two sessions at the top of the range with reps left**: one step forward, in this order:
     1. a weight goes up one plate (2.5 kg or 5 lb);
     2. else an RPE target goes up one;
     3. else the effort band goes up one;
     4. else one more set;
     5. else the harder version from the catalogue.

     This is double progression: the Playbook's ch. 8 "technique before load".
7. **The Mirror screen's correctives** go into the next open session's Prep, using the coach's own catalogue only.
   A finding with no match is held, with what to look for.

Every change then goes through `safety.ts classify`. It judges a change by **what it writes**, not by its name, and a
change it marks unsafe is held, never offered. The rules:
- never Full throttle;
- never an RPE past 9;
- never more than 5 sets (4 for under-18s);
- never a swap to, or an add of, jump or drop work (the protocol gate's kind);
- never a pinning row for under-18s;
- for under-18s, **volume only**: never load, RPE, band or a harder swap;
- no progression while any of these hold: a pain flag, a lighter week, low compliance, Limited, or a form drop on
  that movement.

## 3. The gates, and what is read

The roster is the coach's **live** `CoachClient` links: a program row alone is not consent (the prescribe route's
rule). Every athlete goes through the teen gate (`lib/coach/teenGate.ts`):
- an adult, or a 13–17 whose guardian consented to coach training. **None has today**: `COACH_TRAINING_CONSENT_SINCE`
  is null, so every teen is skipped and the card says why;
- never under 13;
- a blank birth year is asked for first.

| Data | Who | Gate |
|---|---|---|
| The program, its sessions, the set logs | adults and consented teens | the live roster link |
| Compliance and the coach's Full / Limited / Out | same | same |
| Pain check-ins | adults | details only with a live `coach_view` grant for this coach |
| Readiness | adults | `coach_view` |
| Mirror form and jump numbers | adults | the `jump_numbers` opt-in **and** `coach_view` (assumption, §7) |
| The Mirror screen | adults | the live roster link (the prescribe route's read) |
| PRQ history, the daily-drill focus | everyone on the roster | what the attention board already reads |

Approving re-checks, before anything is written:
- the roster link and the program (still the coach's and still active);
- the teen gate;
- the change's safety class, against a fresh read of the catalogue;
- every row against the draft (a row the coach changed since is refused as stale);
- that nothing has been logged on the rows;
- the builder's own validator.

Then it writes through `builderAction`, the same path and checks as typing the change into the builder.

## 4. Owner action: the pending SQL

`prisma/pending/2026-10-24-coach-ai-draft.sql` adds two tables (additive only; the sql-guard suite passes). Its header
has the Prisma models and the steps.
- **`CoachProgramDraft`**: one draft per coach × athlete × program × week. The unique key makes weekly generation
  idempotent.
- **`CoachDraftDecision`**: the audit trail, one row per decision: who, when, before, after, the athlete's line and
  the note. A change can be decided once.

**Until it is applied:**
- the inbox shows this week's drafts, computed live and identical on every load;
- the buttons are hidden, and approving answers `503 drafts_not_ready`;
- the AI layer never runs;
- the athlete's card stays empty.

## 5. The AI layer (`ai.ts`) — off until `ABACUS_ENABLED=true`

The AI layer goes through the existing kill-switched completion (`lib/coach-service.ts callCoachLLM`). It runs once per
athlete per week, when the draft is stored, and only for adults.

**What it may add:** a note per change, an order, and a one-line summary. That is all.

**What it cannot do** (each is enforced in code and covered by `ai.test.ts`):
- add, revive or alter a change: unknown ids are ignored, ops and safety classes are never read from the reply, and
  held changes are never sent;
- touch a sensitive change (pain, readiness, "see a professional"): those are never sent and stay first;
- write medical words: any note that contains one is dropped.

**What it is sent:** the coach's own prescriptions, before and after, with the change's kind. It is never sent a name,
a client id, a logged number or a health reading.

## 6. Owner calls

1. **Rule thresholds** (`lib/coach/weeklyDraft/thresholds.ts`, all new, plain constants):

   | Rule | Value |
   |---|---|
   | Logs read back | 21 days |
   | Exposures that decide a step | 2 |
   | Progress only at or below | effort 8, or 2+ reps in reserve |
   | Load step | 2.5 kg / 5 lb |
   | Regression | −10% |
   | Sets ceiling | 5 (4 under 18) |
   | RPE ceiling | 9 |
   | Deload | mean top effort 8.5 over 4+ exposures; readiness low on 3 of 7 |
   | Form drop | 8 points |
   | Jump drop | 1 inch |
   | Swap to the easier version | under 50% of the range |
   | Note length | 280 characters |
   | Pain window | 14 days |

2. **Copy** (`lib/coach/weeklyDraft/copy.ts`) — **approved** (owner, in chat, 2026-10-27, card C02), with the card's one
   change: the coach's "Approvals switch on…" line no longer names this document. Read the SAFETY-COPY lines first: `easeOffReason` and
   `easeOffClientLine` say "see a professional", "check with a clinician" and "tell an adult". They follow the pain
   check-in's wording, name no condition and promise nothing, but they are new sentences about pain.
3. **The pending SQL** (§4).
4. **Solo drafts** (`solo.ts`, flag `COACH_SOLO_DRAFTS_ENABLED`, off). The limits for an athlete with no coach:
   - every safe change;
   - at most one volume progression a week;
   - adults only.

   No surface exists to hang it on: the AI Coach tab is a chat, and a solo player's `/workout` plan is not a
   `CoachingProgram`. Turning it on needs a solo program the drafts can write to, and the athlete approving their
   own changes.
5. **What the AI may see**: the coach's prescriptions (§5). Roadmap Q10 recommended "no athlete data beyond the coach's
   own description", and this lane reads it as allowing the coach's own program edits.

## 7. Assumptions

- Weeks are UTC Mondays.
- Mirror form and jump numbers are the athlete's own, and sharing them with a coach takes the same per-coach
  `coach_view` grant the health reads take.
- Without `coach_view`, the ease-off reason says no more than the board's "Client paused an exercise".
- Once stored, a week's draft is fixed for that week. A coach who rewrites the program mid-week gets "stale" on the
  changed rows, not a fresh draft.
