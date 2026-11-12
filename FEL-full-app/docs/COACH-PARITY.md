# Coach parity: check-ins, habits, paste a program

Lane `lane/coach-parity` (round 7, 2026-10-26). The coaching teardown (`scorecard/coaching.md`) found three table-stakes
tools every rival has and FEL did not. This lane builds all three.

## 1. What it does

**Check-in forms** (`lib/coach/checkins/**`, `components/coach/parity/checkins-panel.tsx`, `checkin-card.tsx`)
- The coach builds a weekly or one-off form: scale 1–10, yes/no, number (with a unit), a choice of 2–6, free text. Up to 12.
- Assigned to one athlete on the live roster, or a team the coach runs. A team reaches only members on the coach's roster.
- The athlete answers on Today. A weekly form can be changed until the week ends (PT week, the wallet's clock).
- The coach reads each athlete's answers by week, newest first, with a spark line per number question, and "3/4 weeks".
- **There is no pain question.** Words about pain are refused. "Add the pain check" shows FEL's own pain check-in
  (`PainCheckInChip` → `/api/health/pain`) inside the form, so pain keeps one path, its rule and its follow-up.
- **Health questions** (sleep, mood, energy, soreness, illness, body weight, food — `lib/coach/parity/topic.ts`) follow the
  rules the app already has: a verified adult only; saved only with a live `health_data` grant; seen by the coach only with
  that athlete's live `coach_view` grant to that coach. A coach may mark any question health; words that read as health
  cannot be marked training. Off until `COACH_PARITY_HEALTH_ENABLED` (the wording is a draft).
- **Teens** (with a guardian's coach-training consent, once that wording is live) get training questions only: no free
  text, no health, no pain check. Today every teen fails closed (`lib/coach/teenGate.ts`).

**Coach habits** (`lib/coach/habits/**`, `components/coach/parity/habits-panel.tsx`, `habits-today.tsx`)
- Presets: 10,000 steps, 2 L of water, 10 min mobility, skill practice; with the health switch, 8 h sleep, protein with
  every meal, morning weigh-in. Or custom. A tick, or a number with a target; daily, or 1–6 days a week.
- The athlete ticks from Today (today only). The streak is the friend-streak rule for one person (`lib/groups/activity.ts`),
  computed on read. A habit never pays Lab Credits and never touches the play streak.
- The coach sees each athlete's last 7 days and streak. A health habit's ticks only with that athlete's `coach_view` grant.
- Health, body-weight and diet habits never reach a minor: refused for an athlete, skipped for a team's teens.

**Paste a program** (`lib/coach/import/**`, `components/coach/parity/import-panel.tsx`)
- Paste typed text ("Mon: Back squat 5x5 @ 75%", "A1. DB row 3x10 each", "Warm-up:"), a spreadsheet copy, or upload a CSV.
- The deterministic reader (`parse.ts`, `dose.ts`, `csv.ts`) needs no AI. Each line is matched to the coach's own catalogue,
  then the library's search (`match.ts`). The grid flags a doubtful or unmatched line "Check".
- **Nothing saves until "Add to …".** That is the builder's `import_program` action (`apply.ts`): a blank program only, the
  builder's validators, the coach's own catalogue rows, youth rules, one all-or-nothing write. "Repeat × N" makes N weeks.
- Optional AI reader (`ai.ts`): off unless `COACH_IMPORT_AI_ENABLED` and the Abacus switch are both on. Its answer is a
  table that goes back through the same reader; an exercise not in the paste is dropped.

## 2. Pending SQL (owner)

`prisma/pending/2026-10-26-coach-parity.sql`: five additive tables (CoachCheckinForm, CoachCheckinAssign,
CoachCheckinAnswer, CoachHabit, CoachHabitTick). Until applied, the coach panels say "coming soon", Today shows neither card,
writes answer 503. The import needs no SQL. The file's header has the steps and the rollback.

## 3. Owner calls

1. Apply the SQL.
2. **Draft copy** (behind `COACH_PARITY_HEALTH_ENABLED`, or shown only to teens once their consent is live):
   `lib/coach/checkins/copy.ts` HEALTH_SECTION_LINE_DRAFT, HEALTH_CONSENT_NEEDED_DRAFT, TEEN_SKIPPED_LINE_DRAFT,
   COACH_HEALTH_NOTE_DRAFT; `lib/coach/habits/copy.ts` HEALTH_HABIT_LINE_DRAFT, HEALTH_CONSENT_NEEDED_DRAFT,
   TEAM_HEALTH_NOTE_DRAFT. The consent step itself is the app's existing one (HealthConsentLockedNotice).
3. Water as a training (teen-safe) habit — assumption; flip in `lib/coach/habits/rules.ts` HABIT_PRESETS.
4. Retention: an erased coach's forms and habits go, and the athletes' answers and ticks on them cascade
   (`lib/data-rights/registry.ts`). The alternative is to keep them with the coach nulled.
5. Not done here: `lib/privacy/healthWriteGate.ts` HEALTH_WRITE_ROUTES lists six health writes; the check-in and habit
   routes are two more (gated in code, not listed). Adding them changes that guard's pinned list.
6. More templates (item 4 of the brief) were not built.
