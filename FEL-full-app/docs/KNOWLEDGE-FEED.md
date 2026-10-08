# Knowledge Feed — design note (v1, and v2 on the owner's decisions of 2026-10-06)

**Owner request (2026-10-06):** "scroll on a timeline like social media … things like the Smarty Me app or the Polymath
app … an addendum to the old Brain Brawl material/concept … the personalized self development loop in idle time."
**Spec:** `docs/history/KNOWLEDGE_FEED_ARCHITECTURE.md` (2026-08-27). Brain Brawl deliberately left feed mechanics,
spaced repetition and progress to this feature (`docs/concept-lock/brainbrawl.md`, `BrainBrawlMode.ts` header).
**Lane:** `lane/knowledge-feed`. Route: **`/learn`**.

## Spec vs v1

| The spec calls for | v1 ships | Waits, and why |
|---|---|---|
| Swipe feed, one item per screen | `/learn`: full-screen CSS scroll-snap timeline. Touch, wheel, keys (↑↓ j k space 1–4 Enter L S) and gamepad (d-pad/stick, A/B/X/Y via `readPad`) | — |
| Micro-challenges (multiple choice) | Quiz cards: tap, instant right/wrong, the "why" | Slider/sequence/text answers: no content needs them yet |
| Skill Drops (video + diagnostic) | Lessons and "go deeper" sequences (3–5 screens) with visuals drawn in code | Video: no media pipeline, no CDN, and no external images by rule |
| Content taxonomy: biomechanics, neuroscience, training logic | 12 broad topics written for v1 + **Training — The Playbook** built from the imported book | Prerequisite graph: v1 orders cards within a pack instead |
| Spaced repetition (SM-2-style decay) | Five-box Leitner on quiz cards (`lib/knowledge/leitner.ts`) | Decay curves and per-card difficulty factors: need real answer data first |
| Brain Brawl ghost matches, friends, notifications, leaderboards | **None.** "Test yourself" links to Brain Brawl | No social graph, by the brief and for under-18s. Ghosts need a server and friends |
| Creator Card "Educational Credentials", Creator XP | Learning XP and a streak, on the device | Server model and credentials are owner decisions (below) |
| Firestore, YAML authoring, CDN media, WebSocket push, daily 3 AM job | Static typed JSON packs in the repo, a validator test, a pure client-side scheduler | **Superseded for this repo:** no new dependencies, no Firestore (the app is Next + Prisma), no media hosting |
| Authoring workflow, peer review, A/B tests | Every card cites a textbook-level source; the validator gates length, ids and answers | Human fact review and telemetry are owner decisions; v1 uploads nothing |

## v2 (2026-10-06): the owner's decisions, built

| # | Owner decision | What v2 does | Where |
|---|---|---|---|
| 1 | Apply all 15 fact-check fixes; self-help as "a popular method suggests…"; credit James Clear | All 15 applied with the checker's wording and source notes; Pomodoro, the matrix and the two-minute rule labelled as methods; `productivity.d-habit` credits *Atomic Habits*. Card ids unchanged | `lib/knowledge/packs/*.json`, `packs.test.ts` |
| 2 | Account sync: YES (verified adults; under 18 and unknown age device-only; merge the device on first sign-in) | Two additive models, `LearnProfile` and `LearnCard`; pending SQL; `/api/learn/sync` (GET/POST/DELETE) and `/api/learn/event`; the merge rules below | `prisma/schema.prisma`, `prisma/pending/2026-10-06-knowledge-feed.sql`, `lib/knowledge/{sync,syncClient}.ts`, `lib/knowledge/server/*` |
| 3 | Daily goal: a small XP bonus only, once per day | +10 account XP the first time the goal is met on a local day (`goalBonusDay`); no coins | `lib/knowledge/accountXp.ts` |
| 4 | Learning XP feeds account XP with a daily cap | The server re-runs each view/answer with the device's reducers, grades quizzes itself, and credits `PlayerProfile.xp` (the sessions route's column) up to **50 a day** (TUNED), under the PlayerProfile row lock. Device-only users keep local XP | `lib/knowledge/accountXp.ts`, `app/api/learn/event` |
| 5 | Guests see the first 5 Playbook cards, sign in for all | `visibleCards`; the picker, each preview card, the caught-up screen and the progress sheet say so | `lib/knowledge/access.ts` |
| 6 | Playbook quiz cards: draft, owner approves before they ship | 88 drafts with the exact book line each; none ship (a test enforces it) | `docs/PLAYBOOK-QUIZ-DRAFTS.md` |
| 7 | Brain Brawl "Review" round: a separate round type | `/play/brain-brawl?round=review`, from "Test yourself": up to 5 of your learned quiz cards, due first, weakest first, ≤ 2 a topic; solo, timed, scored like any challenge; the standard match unchanged | `lib/knowledge/review.ts`, `BrainBrawlCore.ts` (appended), `BrainBrawlMode.ts` (REVIEW ROUND), `docs/concept-lock/brainbrawl.md` |

**Owner's deploy steps for v2** (the lane changed the schema; it did not regenerate the client or touch a database):
1. On the Mac, in `FEL-full-app/`: `node scripts/copy-prisma-schema.mjs && npm run prisma:generate`, then
   `npx vitest run lib/db/prismaSchemaSync.test.ts` (red on the lane until this step; green after) and
   `npx tsx scripts/prisma-artifact-tests.ts`; commit `public/_prisma/schema.prisma` and `public/_prisma/client`.
2. Production, before the deploy: preview `npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel
   prisma/schema.prisma --script`, apply `npx prisma db execute --url "$PROD_DIRECT_URL" --file
   prisma/pending/2026-10-06-knowledge-feed.sql`, and check the same diff prints an empty migration. A deploy that
   runs first does not 500: the learn routes answer 503 and the feed stays on the device.

## Card types (`lib/knowledge/types.ts`)

**Lesson** (headline, 2–4 short lines, a visual), **Quiz** (2–4 options, answer, why), **Did you know** (fact),
**Recap** (3–5 takeaways, shown after 4 cards of its topic) and **Go deeper** (3–5 screens on one idea). Visuals are
data the app draws: a stat, bars, a side-by-side, a cycle, a timeline, or a topic emblem. Health and money cards carry
"Educational only — not medical/financial advice." Content: 12 packs of 16 cards (192) in `lib/knowledge/packs/*.json`,
plus 26 Playbook cards, built at runtime from `lib/education/playbook.data.json` (the chapters' "What to Remember" and
two chapter openings). They use the book's words, only re-broken into lines, following course.ts's "imported, never
retyped" rule. The Playbook topic has no quizzes, because a question about the book would be our paraphrase of it.

## The personalisation loop (`lib/knowledge/scheduler.ts`, pure, seeded, tested)

1. **New** cards from your topics, in each pack's authored order (a lesson comes before its quiz).
2. **Reviews:** a quiz you missed comes back the same day, after the near-repeat gap. One you got right comes back
   after 1, 3, 7 and then 21 days. About 1 slot in 3 is a review when any are due. A review turn the variety rule
   blocks is carried to the next slot, not dropped. A card in box 4 or 5 counts as **mastered** (right on 3 separate
   days).
3. **Topic weight:** each like adds 0.2 (up to +1). Each "less of this" halves the weight and hides that card for good.
   Dwell moves the weight by up to ±0.3.
4. **Variety:** no topic more than 2 in a row, and no two quizzes back to back, whenever there's an alternative.
5. **No near-repeats:** a card is not shown again if it is among the last 40 shown *and* was seen in the last 4 hours.
   The time half matters: with a count alone, yesterday's due reviews would wait 40 more cards.
6. **Daily goal** of 5 cards. A card counts after 2.5 s on screen, or a quiz counts when answered. **Streak** = days in
   a row the goal was met, on the local calendar day (midnight and DST tested).

## Idle time

`components/learn/learn-while-you-wait.tsx` is one self-contained card (lesson, fact or quiz) that any surface can mount
with `<LearnWhileYouWait />`. It lazy-loads the catalogue, so game routes don't carry it, and it shares on-device
progress with `/learn`. It is mounted in two places. First, the boot splash while the arena loads (`phase === 'loading'`,
in compact form, with no link away). Second, the post-game end card. Lobbies and between-match screens can add it
the same way. The end-screen lane will move it into its side-card slot.

## Data model

**On the device, for everyone:** one localStorage key, `fel.learn.v1` (`lib/knowledge/state.ts`). It holds topics, a
record per card (views, last seen, Leitner box and due day), likes, saves, hidden cards, XP, streak and today's tally.
A corrupt or blocked store reads as a fresh state. `fel.learn.sync.v1` names the account the device mirrors, and
`fel.learn.device.v1` is a random device id (no fingerprinting).

**On the account, for a verified adult (v2, built):** `LearnProfile` (one row per account) and `LearnCard` (one row
per account × card) — the v1 proposal below, plus the account-XP cap ledger (`accountXpDay`, `accountXpToday`,
`goalBonusDay`) and the merged device ids (`devices`). The routes reach them through a typed adapter
(`lib/knowledge/server/learnStore.ts`), so the code compiles before and after the client is regenerated.

**Merge rules (`lib/knowledge/sync.ts`):** the first time a device meets an account ("first link") its progress joins
the account's — sets unioned, counters the larger, learning XP added, at most once per device id. After that the device
is "linked": its lists and topics win, so an unsave reaches the account. Per card the later answer wins; a same-day tie
takes the lower box, so a merge never fakes mastery. "Less of this" is always a union. The near-repeat window never
leaves the device. A device mirroring a different account is never merged into this one; it takes this account's
state.

**v1's proposal (kept for the record):**
```prisma
model LearnProfile  { userId String @id; topics String[]; xp Int @default(0); streakCount Int @default(0)
                      streakBest Int @default(0); streakLastDay Int?; likes Json @default("{}"); less Json @default("{}")
                      saved String[]; hidden String[]; updatedAt DateTime @updatedAt }
model LearnCard     { userId String; cardId String; views Int; firstDay Int; lastSeenAt DateTime
                      box Int?; dueDay Int?; right Int @default(0); wrong Int @default(0); lastAnsweredDay Int?
                      @@id([userId, cardId]) }
```
Day numbers stay local-calendar integers computed on the client, so the server never has to guess a time zone. A sync
would merge by taking the most recent value per card. The alternative is to reuse `LessonProgress` (trackKey `learn`),
but it has no box or due-day columns.

## Privacy, teens, safety

There is no user-generated content, no comments, no followers or friends, no ghost matches and no tracking upload.
**v2:** a signed-in **verified adult**'s progress syncs to their own account (the strict `verifiedAdult` rule on the
database's `User.dobYear`). Under 18 and unknown age stay device-only: the server answers `eligible: false` and writes
nothing. "Clear my learning data" deletes the account copy too (no age needed to delete your own data).
Sharing is plain text through the system share sheet or the clipboard, with no link or handle. The feed is fine for
under-18s: it is learning and writes nothing to the server, so the `verifiedAdult` and scan/health write gates have
nothing to gate. `/learn` is open to guests. v2: guests see the first 5 Playbook cards and sign in for the rest (v1 hid the topic). The
feed follows `motionPolicy()` (no smooth scroll, fades or bounce under reduced motion). The progress sheet says data
stays on the device and offers "Clear my learning data".

## Rewards

**v2:** for a synced account, the learning XP below is also credited to account XP (`PlayerProfile.xp`), capped at 50 a
day, plus +10 once a day for the daily goal. No coins, shards, LC, season XP or PRQ, and the sessions route's own caps
are untouched. Device-only users keep the local XP exactly as v1.

v1 gives learning XP only: +1 the first time you see a card, +5 for a first-try right answer, +3 for a review right,
+1 for an answer that was wrong but attempted, +10 when the daily goal is met. It also keeps a streak. **There are no
coins or shards for swiping**, because that would pay people to scroll mindlessly. XP stays on the device.

## Brain Brawl

**v2: built, as a separate round type** (owner decision 7). "Test yourself" opens `/play/brain-brawl?round=review`; see
the v2 table and `docs/concept-lock/brainbrawl.md`. **v1's note:** "Test yourself" opened `/play/brain-brawl`, and
"Review in Brain Brawl" was not built. `BrainBrawlCore` generates timed cognitive minigames from seeds (`makeChallenge`). It
says "never multiple-choice trivia", it takes no external question set, and its concept lock rules out spaced
repetition and feed content. Feeding it learned cards would break that rule. **Next step, if the owner wants it:** a
separate review mode, or a sixth "LEARNED" wedge whose challenge type reads a question set. Either way that is a
concept-lock change for the owner.

## Owner decisions needed (v1's list — all seven answered on 2026-10-06; see the v2 table)

1. **Server sync:** the model above (additive Prisma, stop-and-ask), or keep it on the device.
2. **Daily-goal reward:** a small one-time shard grant for a completed daily goal, server-keyed per day (not built).
3. **XP:** keep learning XP separate, or feed it into account XP / PRQ / the Creator Card ("Educational Credentials").
4. **Fact review:** who signs off the 192 authored cards. Each has a source, but no human reviewer has checked them yet.
5. **Playbook:** whether guests may see the Playbook recaps, and whether to author quiz cards from the book.
6. **Brain Brawl review round:** whether to change the concept lock (above).
7. **Tunables** (new, not felt by the owner yet): goal 5 cards; count after 2.5 s; Leitner 0/1/3/7/21 days, mastered at
   box 4; near-repeat 40 cards / 4 h; review 1 in 3; topic run ≤ 2; recap after 4; like +0.2 (cap +1), less ×0.5,
   dwell ±0.3 around 8 s; XP 1/5/3/1/10.
