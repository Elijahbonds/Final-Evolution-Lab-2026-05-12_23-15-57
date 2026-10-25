# COACH-READINESS — the 30-second daily jump check (lane `coach-readiness`, 2026-10-25)

Owner, coaching decisions 2026-10-24: *"a 30-second daily jump check; if readiness drops past the coach's threshold,
the day eases off and the coach is told."* Priority #2 of the round. Built on lane/jump-pro's measurement.

## 1. What the athlete does

`/train/readiness` (a card on Train; a door on Today; the trend on `/profile/week`). One screen:

1. Optional tap: **How do you feel? 1–5**.
2. **Start the jump check**: the camera through the pose pipeline the Mirror uses, shown only through `SelfView`. Hold
   still two seconds, then three countermovement jumps, hands on hips. The check finishes on the third landing (about
   10 s of jumping on the bench).
3. The day: **Ready / Normal / Low** (or *Building your normal* for the first three days), the reason, best / average /
   normal, and what happens next.

The jumps are read by the existing jump check, not a new one: `calibrateFront` for the stand, T5's flight finder, then
`gradeT5` with JUMP-PRO's re-timing and `sessionStats` (`lib/coach/readiness/capture.ts`). An outlier jump is left out.

## 2. The baseline math (`lib/coach/readiness/rules.ts`)

- **Baseline** = the athlete's own last ≤ 10 checks in 28 days, before today, **Low days left out**; ≥ 3 needed.
- **Day spread** = max(the days' SD of bests and of means, each day's typical error ÷ √jumps, the body's 3 % CV).
- **Real change** = `lib/jump/session.ts realChange` (JUMP-PRO's own test, z = `jump.realChangeZ` 1.645): today's spread
  for "now", the baseline mean's error (spread ÷ √n) for "before". `belowReal` needs the **best AND the mean** past it.
- **The coach's rule** on top: `drop_pct` (Low = belowReal AND a drop ≥ X %, or belowReal AND feel ≤ 2) or `low_twice`
  (belowReal today and on the check before, within 3 days). Action: `ease` or `tell`.
- So **no rule, however low, can call a day inside the measurement's own noise Low** (tested by a sweep).

Measured (`tests/coach-readiness/baseline.test.ts` and a seeded sim of the same model, 20 athletes × 90 days, camera
noise only — per-jump ± 1.4 cm at 60 fps / 1.5 at 30, 1.5 % trial spread, a 40 cm jumper):

| | false Low / day (default rule) | false Low, twice-in-a-row | real 8 % drop flagged | real 10 % drop flagged |
|---|---|---|---|---|
| 60 fps | 1.0 % | 0.06 % | 75 % | 91 % |
| 30 fps | 1.4 % | 0.11 % | 71 % | 89 % |

Through **real filmed bench takes** (`lib/jump/ballistic.ts` → the live capture, 8 athletes each): at 60 fps / 42 cm,
0 of 24 normal days flagged, 8/8 at −8 % and 8/8 at −10 %; at 30 fps / 30 cm, 1 of 24 normal days flagged, 1/8 at −8 %,
4/8 at −10 % — a 30 cm jump at 30 fps cannot resolve 8 % (2.4 cm) against its own ± 1.5 cm. Honest limit, not tuned away.

## 3. What happens on a Low day

| | coached, saved, shares (coach_view) | coached, saved, not sharing | coached, not saved (phone only) | solo |
|---|---|---|---|---|
| Today's session | eased (rule `ease`) / as written (`tell`) | eased / as written | as written | nothing changed |
| Coach | alert on the attention board, **once per day** (unique coach × athlete × day) | nothing (the readiness check-in's rule) | nothing | — |
| Athlete reads | why, what eased, "your coach has been told" | why, "not told: you have not shared" | why, "kept on this phone" | a suggestion to take it easier |
| Weekly draft | ≥ 2 Low checks in 7 days → the deload rule's trigger (sensitive) | not read (numbersFor gate) | — | — |

**Easing** = each Key / Assist / Finish row through the drafts engine's `dose.ts easeStep` (one set fewer, never under 2;
a weight ~10 % off, else RPE −1, else the band down one). Prep, Prime, Cool-down, timed rows and breath/mobility work
stay as written. `neverHarder()` guards every row (property test over 4,000+ combinations). The program is not written:
Today serves the eased prescription on the same slot.

## 4. Gates (all existing)

- **The check**: verified adult only (`verifiedAdult`, DB `dobYear`). **Teens: no check** (owner call below).
- **Kept on the server**: `canSaveScanNumbers` (verified 18+ AND opted in) — row **1l** of `SCAN_SAVE_ROUTES`. Others keep
  a numbers-only history on the phone (`lib/coach/readiness/deviceHistory.ts`, one localStorage key).
- **The coach sees**: live roster + live `coach_view` grant + the athlete's save opt-in. Anyone else: nothing.
- **Rules**: per athlete (live roster only) or per team (a `TrainingGroup` of kind team the coach owns or coaches).

## 5. Storage — pending SQL (NOT applied)

`prisma/pending/2026-10-25-coach-readiness.sql`: `ReadinessJumpCheck` (unique user × day: the day's first check
stands), `ReadinessRule` (unique coach × scope × scopeId), `ReadinessAlert` (unique coach × athlete × day). Additive
only; `schema.prisma` and `public/_prisma` untouched; guarded by `lib/coach/readiness/store.ts` on the shared probe.
Before it is applied the check still runs (phone history), Today is as written, the coach panel is hidden.

## 6. Owner calls

1. **Thresholds (all new)**: default rule **drop ≥ 5 % past the noise → ease off and tell** (bounds 3–20 %); feel ≤ 2
   tips a real dip to Low; baseline ≥ 3 / ≤ 10 checks / 28 days, Low days excluded; 2 s stand; "today's check" = saved
   in the last 16 h; "twice in a row" = within 3 days; the draft's trigger = 2 Low checks in 7 days. The default is
   5 % (not 7 %) because 7 % flagged a real 8 % drop only ~55 % of the time at the camera's measured noise.
2. **Teens**: adults only. No guardian consent covers camera jump numbers (`COACH_TRAINING_CONSENT_SINCE` is null) and
   the Quick Screen's camera is 18+. `TEEN_READINESS = false` in `lib/coach/readiness/gate.ts`.
3. **Easing without the coach's grant**: a saved Low check eases the athlete's own session under their coach's rule even
   when the coach is not told (no coach_view); the athlete is told the coach was not. Alternative: ease only when shared.
4. **Copy** (`lib/coach/readiness/copy.ts`): draft product copy, no medical words (tested against `MEDICAL_WORDS`).
5. **Retention / data rights**: kept until the athlete deletes it (DELETE `/api/readiness/check`, alerts cascade); not
   yet in `lib/prq-data-rights.ts` export/erase.
6. **Coaching thresholds as plain constants**, not feel-panel knobs (the weekly-draft precedent). assumption.

## 7. Files

New: `lib/coach/readiness/**`, `app/api/readiness/check/route.ts`, `app/api/coach/readiness/route.ts`,
`app/train/readiness/page.tsx`, `components/readiness/**`, `components/coach/readiness/readiness-panel.tsx`,
`tests/coach-readiness/**`, `tests/helpers/fakeReadinessDb.ts`, `scripts/probes/_coach-readiness-{entry.tsx,probe.mts}`,
the pending SQL. Shared (flagged): see `docs/LANES.md`. Rig: `npx tsx scripts/probes/_coach-readiness-probe.mts <out>`.
