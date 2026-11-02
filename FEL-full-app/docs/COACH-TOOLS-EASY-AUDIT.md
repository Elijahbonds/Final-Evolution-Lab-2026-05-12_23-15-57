# COACH-TOOLS-EASY: the coach's own tools, audited and fixed (lane `coach-tools-easy`, 2026-11-02)

Owner, 2026-10-28: *"All tools need to be accessible, easy to use."* This lane covers the last tool group he named, the
coach's tools:
- the client list and roster;
- writing and approving the weekly plan;
- the form-review queue and its replies;
- messages;
- readiness and alerts;
- the combine coach flow;
- the business and store set-up.

The method is TOOLS-EASY's (`docs/TOOLS-EASY-AUDIT.md`), run at 390 and 1280 px.

**Measured on seeded fixtures only, never production.**
- `scripts/probes/_coach-tools-{entry.tsx,phone.mts}` renders the real coach screens in headless Chromium at 390 and
  1280 px.
- Every `/api` call is answered from `scripts/probes/platform/coach-fixture.mts`: platform phase 5's coach, with twelve
  athletes and ten things waiting. Its queue body is built by the real `lib/coach/queue.ts`.
- The entry adds a seeded combine roster and a business dashboard.
- "Before" is this branch's base (`lane/tools-easy` at `773a0faf`); "after" is this lane.

**Taps** are counted from Play, and the Train tab counts as one, so the coach home is tap 2 (Train → Your roster).
**Time to done** is an estimate. **assumption:** 3 s to read and tap each step, plus 5 s for a short typed reply — the
same rule as the other EASY audits.

---

## 1. Each job, before

| Job | Path (before) | Taps | Time to done (est.) |
|---|---|---|---|
| Reply to an athlete who wrote | Home queue card → Reply → a preset | 4 | ≈ 12 s |
| **Message an athlete who is not in the queue** | Their avatar → **Week** (the sheet always opened there) → Thread → type → Send. There is no list of threads and no unread mark on the sheet | 5 + typing | ≈ 20 s |
| Approve this week's safe plan changes | Home queue card → Approve | 3 | ≈ 9 s |
| … review each change | **"Drafts"** → per change: Approve / Edit / Reject → "Approve all safe" (under every card) | 3 + 1 a change | — |
| **Reply to a filmed set from its list** | **"Filmed sets"** → the set → a **dropdown** of cues (grouped) → pick → "Send to the thread" | 7 | ≈ 21 s |
| … from the home queue | card → Reply → a preset | 4 | ≈ 12 s |
| Readiness, pain and missed sessions | **"Roster check"**, whose screen is headed **"Needs you today"** (the home queue's own name) | 3 | — |
| **Start a combine** | Setup → Combine day → "Start a combine" → New combine → Start the combine (or Train's Program card: 4) | 7 | ≈ 21 s |
| Business: what is left to do | Scroll one long page (197 words, 25 controls, 7 inputs) and work it out | — | — |

## 2. The screens, before (rig)

Each cell: font sizes · button looks · controls · visible words.

| Screen | 390 | 1280 |
|---|---|---|
| home (10 waiting, 12 athletes) | 4 · 4 · **52** · 127 | 4 · 4 · 52 · 127, **in a 560 px column**: each card ~126 px tall with its buttons on a second line; the roster strip scrolls sideways and cuts athlete 9 with ~700 px free |
| athlete sheet (opened from the avatar of someone with 2 unread) | 4 · 3 · 7 · 48 — on **Week**, no unread mark | the same, centred |
| thread | 3 · 4 · 7 · 21 | same |
| drafts | **5** · 4 · 7 · 105 | same |
| form reviews (list) | 4 · 4 · 4 · 28 | same |
| reply sheet (queue) | 4 · 4 · 55 · 146 | same |
| "Roster check" | 4 · 3 · 3 · 57 | same |
| setup | 1 · 2 · 3 · 20 | same |
| combine home / set-up | 2 · 1 · 1 · 32 / 4 · 7 · 19 · 133 | same |
| business | **5** · 4 · **25** · **197** | same |

## 3. Top 8 (sent to the coordinator first)

1. At 1280 the home is a phone column. Cards are ~126 px tall with the buttons under them, and the roster scrolls
   sideways with ~700 px unused.
2. The tool names don't say what each tool is ("Roster check", "Filmed sets", "Drafts", "Send", "Form Check").
   Messages has no row, and Combine day is buried in Setup (7 taps to start one).
3. "Roster check" is headed "Needs you today": the home queue's name, over different contents.
4. There is no messages inbox. The sheet always opens on Week, even when the athlete has written, and nothing marks an
   unread thread.
5. Replying to a filmed set from its list takes a dropdown and Send: 7 taps where the queue takes 4.
6. 52 controls on the home: every card has the row, an "Open" that repeats the row tap, and its action.
7. "Client" and "athlete" are mixed in the coach-facing words.
8. The business page is one long screen with nothing up top saying what is still to do.

## 4. What changed

1. **The home uses the screen** (`components/coach/coach-queue/look.ts`):
   - From `lg`, two columns: the queue on the left, the roster and the tools on the right.
   - From `md`, a card's buttons sit on its own row.
   - From `lg`, the roster strip wraps instead of scrolling. A phone is unchanged: one column, and the strip scrolls
     inside itself.
2. **One control less per card** (`coach-queue.tsx`): no "Open" beside a card, because the card itself opens. "Looks
   good" and "Done" stay. A card still has at most two buttons (`tests/coach-queue`).
3. **Each tool named for what it is, in the order a coach reaches for them** (`app/coach/_components/clients-view.tsx`):
   - Messages
   - Form reviews
   - Weekly plan updates
   - Readiness and alerts
   - Combine day (a row of its own: 5 taps to start, was 7)
   - Court session
   - Text a plan or drill
   - Exercises
   - My form check
   - My training
   - AI coach
   - Your coaching business
4. **Messages** (`lib/coach-tools/inbox.ts`, `components/coach-tools/messages-inbox.tsx`): every athlete's thread, one
   tap each.
   - Unread come first, then A–Z; athletes with no program yet are last ("A thread starts with their first program.").
   - It opens the athlete's sheet on Thread.
   - From the roster, the sheet opens on Thread when that thread is unread, with a dot on the Thread tab.
   - **No new table.** The counts come from the existing read markers (`lib/coach/messageReads.ts`). Until their
     pending SQL is applied, `/api/coach/messages/unread` answers `{ available: false }` and **no count is shown at all**
     — never a false 0 — and the list is A–Z.
5. **Readiness and alerts** (`attention-panel.tsx`): the heading is "Readiness, pain and missed sessions", not the
   queue's "Needs you today".
6. **A cue is one tap** (`components/coach/form-review/review-queue.tsx`): the catalogue's cues are rows under their
   groups, and a tap sends one, with the note if one was typed. A note alone has its own "Send the note". Same route,
   same body (`{ cueId, note, rep }`).
7. **"Still to do" on the business page** (`lib/coach-tools/businessTodo.ts`, `components/coach-tools/business-todo.tsx`):
   - It lists only what is unfinished: publish your page, list it in Find a coach, add a package, answer N
     applications, check N results.
   - "Finish setting up payments" appears only once the owner has turned payments on.
   - Each item jumps to its card.
   - **No price, fee or payment line changed**, and no card changed. One mount line was added to
     `business-dashboard.tsx`.
8. **"Athlete" in the coach-facing words touched here:** "Message your athlete", "Your first athlete", "Sets your
   athletes film".
9. **The coordinator's item 4: reviews on the result card's "no number" variant.** plat-p03's `ResultCard` draws no
   number row when `value` is null (`lib/results/view.ts`).
   - The **form-review set** (`record-set.tsx`):
     - the card shows the exercise and its reps;
     - the line is the set's headline, unchanged;
     - its one button is "Send it to my coach", or "Film it again" when it cannot be sent;
     - the rep chips, flags, replay and send states are under Details, unchanged.
   - The **Mirror's squat review** (`mirror-harness.tsx`):
     - the card shows "Squat · N reps";
     - the line is `squatReviewVerdict`, unchanged;
     - what the camera saw and what the coach said are under Details;
     - it has no button, because the Mirror's own Start / End stay its actions.
   - The lunge, hinge and push-up reviews are not moved yet (§7).

Not changed:
- the queue's order and gates (`lib/coach/queue.ts`);
- every route and body;
- the drafts' decisions and guards;
- the readiness rules;
- the combine's flow and its station defaults;
- every price, fee, payment, terms and consent line;
- the platform P7 files (`lib/coach/today*`, the session player, `today-view.tsx`).

## 5. Gates, before → after

| Job | Taps before → after | Time to done (est.) |
|---|---|---|
| Message an athlete who wrote (from the roster) | 5 + typing → **4 + typing** (opens on Thread) | ≈ 20 → 17 s |
| Message any athlete | 5 + typing → 5 + typing (Messages → athlete → type → Send), now from a list instead of hunting the strip | ≈ 20 s |
| Reply to a filmed set from its list | 7 → **5** (Form reviews → the set → a cue) | ≈ 21 → 15 s |
| Start a combine from the coach home | 7 → **5** | ≈ 21 → 15 s |
| Approve safe plan changes | 3 → 3 | — |
| Readiness and alerts | 3 → 3, under its own name | — |
| Home controls (10 waiting) | 52 → **46** | — |
| Home page height at 1280 | 2,271 px → **1,126 px** (two columns; the roster wraps) | — |

### 5.1 The screens at 390 and 1280 (rig, after)

Each cell: font sizes · button looks · controls · visible words. 0 sideways scroll on every screen at both widths, before and after. The layout change shows at 1280 (the numbers count the same elements): the home went from a 2,271 px page to 1,126 px, with every athlete and every tool on the first screen.

| Screen | before (390 and 1280) | after |
|---|---|---|
| home | 4 · 4 · 52 · 127 | 4 · 4 · 46 · 130 |
| sheet | 4 · 3 · 7 · 48 | 3 · 4 · 7 · 22 |
| thread | 3 · 4 · 7 · 21 | 3 · 4 · 7 · 22 |
| drafts | 5 · 4 · 7 · 105 | 5 · 4 · 7 · 107 |
| reviews | 4 · 4 · 4 · 28 | 4 · 4 · 4 · 28 |
| reply | 4 · 4 · 55 · 146 | 4 · 4 · 49 · 149 |
| attention | 4 · 3 · 3 · 57 | 4 · 3 · 3 · 60 |
| setup | 1 · 2 · 3 · 20 | 1 · 2 · 3 · 20 |
| combine | 2 · 1 · 1 · 32 | 2 · 1 · 1 · 32 |
| combine-setup | 4 · 7 · 19 · 133 | 4 · 7 · 19 · 133 |
| business | 5 · 4 · 25 · 197 | 5 · 5 · 26 · 203 |
| messages | – | 2 · 2 · 13 · 48 |

- **home:** 52 → 46 controls (no "Open" beside a card).
- **sheet:** opened from the avatar of an athlete with 2 unread, it now lands on their thread (22 words), not the week (48).
- **business:** one card more ("Still to do": +6 words, +1 control). The rig counted 5 button looks because the checklist's rows had a look of their own; after that run they took the page's own link look (`text-cyan-300 underline`), so the count should be back to 4. Not re-rigged, to save a browser run.

## 6. Flags

- **Shared files (platform P5's, finished; none of P7's):** `components/coach/coach-queue/{look.ts,coach-queue.tsx}`,
  `components/coach/athlete-sheet/athlete-sheet.tsx` (one optional prop), `app/coach/_components/clients-view.tsx`.
- **Coach-delivery's and coach-video-review's:** `components/coach/attention-panel.tsx` (one heading),
  `components/coach/form-review/review-queue.tsx` (the reply), `components/coach/form-review/record-set.tsx` (the
  result), `components/coach/first-client.tsx` (two words).
- **Coach-business's:** `business-dashboard.tsx` (one mount line).
- **The Mirror:** `mirror-harness.tsx` (the squat review's wrapper).
- **"Client" lines I would change but did not** (the coordinator's rule: policy, payments and terms stay):
  - `lib/health/pain.ts` `GENERIC_FLAG_LABEL` "Client paused an exercise". It is the pain rule's consent-gated wording,
    so it stays as policy copy; "Athlete paused an exercise" would read better.
  - The business page's "Coach Free · N of 3 clients" and its plan and package lines are pricing copy, left alone.
- **assumption:** a coach opening Messages wants the thread, so the inbox opens the sheet on Thread whether or not it
  is unread.
- **assumption:** time to done uses 3 s a tap and 5 s for a short typed reply.

## 7. Owner calls (recommendation first)

1. **The lunge, hinge and push-up reviews onto the result card too.** Recommend: yes, in a Mirror follow-up. Each has
   its own per-side panel (`side-rep-panels.tsx`), so its "line" needs choosing; the squat's verdict line already
   existed.
2. **"Client" in the pain flag's generic wording** (`lib/health/pain.ts`). Recommend: "Athlete paused an exercise".
   It is consent-gated policy wording, so it waits for your word.
3. **The read markers' pending SQL.** Recommend: apply it, so the inbox and the home can show unread counts. Until
   then they show none.
4. **Combine day in two places** (Train's Program card and the coach home). Recommend: keep both. They are the same
   page.

## 8. Owner phone check (5 minutes)

1. Open the coach home on a laptop. Expect the queue on the left and the roster and the tools on the right, with no
   sideways scroll.
2. Do the same on a phone. Expect one column, and each card with at most two buttons.
3. Tap **Messages**. Expect the athletes who wrote at the top. Tap one and expect their thread.
4. Tap **Form reviews**, open a set, and tap a cue. Expect "Sent to …'s thread".
5. Tap **Combine day**, then New combine, then Start the combine.
6. Open **Your coaching business**. Expect "Still to do" at the top, and each item jumping to its card.
