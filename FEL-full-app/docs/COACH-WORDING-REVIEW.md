# Coach screens: shorter first-screen wording — for the owner to approve

**Owner, 2026-11-12:** shorter wording on the first screen of five coach screens, and the owner reviews the drafts
before they ship. Lane `lane/coach-words`. Nothing here is live until the owner approves it and the lane merges.

How to read this: each row is one line on the screen. **Approve** or **reject** each row on its own. A rejected row goes
back to the old words exactly (the "Before" column), and nothing else changes with it.

The rule the drafts follow: cut the explanation, keep every fact the person needs. Money, price, policy, legal,
consent and safety wording is **not touched**: those rows are listed as "kept" so you can see they were left alone on
purpose. No behaviour changed: the same buttons, the same links, the same checks.

The "words before scrolling" number is the every-screen scorer's count on a phone (390 × 844). The budget for a
"do this" screen is 40. Since 2026-11-11, an approved medical, privacy or consent notice does not count toward it.

## The numbers (measured 2026-11-12 on the every-screen rig: a production build, a phone at 390 × 844, two reads after)

| Screen | Words before scrolling: before → after | Counted toward the 40 (approved notices left out) | Passes all four checks: before → after |
|---|---|---|---|
| `/coach/business/thanks` | 41 → **36** | 36 | no → **yes** (with row 1.1) |
| `/coach/form-review` | 56 → **50** | 50 | no → no (still 10 over) |
| `/coach/highlight/[id]` | 53 → 53 | 53 → **29** | no → **yes** (with row 3.2) |
| `/coach/join/[token]` | 44 → **42** | 42 | no → no (2 over; and the page sometimes jumps as it loads: 0.064 in one read, 0.001 in the other) |
| `/coach/session` | 43 → 43 | 43 → **14** | no → **yes** (with row 5.3) |

"Before" is the same rig on the code before this lane, read the same day. (The rig's fresh account sometimes shows a
two-word "+100 coins" pop-up; the before numbers above leave it out so the two columns compare like for like.) Every count
includes the app's own bars at the top and bottom (about 9 words) that no screen can cut.

## 1. `/coach/business/thanks` — the page after paying for a coach's package

Shown here: opened with no payment to confirm (a bookmark or a shared link). The real after-payment states (booked,
processing, could not confirm) are all money wording and are **not changed**.

| # | Before | After | Why |
|---|---|---|---|
| 1.1 | This page opens after you pay for a coach's package, to confirm the booking. | This page confirms a coach booking after you pay. | Same two facts (it is for after you pay; it confirms the booking), 5 fewer words. assumption: this sentence describes the page, it is not money wording. It mentions paying, so reject it if you read it as money wording. |
| 1.2 | There is no payment to look up from here. | *(kept, word for word)* | Money wording: it tells someone who paid nothing that nothing was charged. |
| — | Nothing to show here · Go to Coach · Back to home | *(kept)* | Already short. |

## 2. `/coach/form-review` — film a set for your coach

| # | Before | After | Why |
|---|---|---|---|
| 2.1 | The camera counts your reps and reads each one. | The camera counts and checks each rep. | Same fact, 2 fewer words. |
| 2.2 | Every number is an estimate. | *(kept, word for word)* | Honesty line: the numbers are estimates, never a measurement. |
| 2.3 | Your camera shows here. Nothing is recorded to a file. | Nothing is recorded to a file. | The black box with the camera icon already says where the camera shows. The privacy sentence is kept word for word. |
| — | Film a set for your coach · the exercise name · the setup line (e.g. "Side-on to the phone, 2 to 3 m away. Stand tall and still, then go.") · Start the camera | *(kept)* | What the screen is for, and how to stand: instructions, not explanation. |

**Still 10 words over.** What is left is the screen's purpose ("Film a set for your coach"), the exercise name, how to
stand (the setup line), the estimate line, the privacy line and the button. Two further cuts are possible, **not made**,
because each is your call:

- **Option A:** "Film a set for your coach" → "For your coach" (saves 3). The button still says "Start the camera".
- **Option B:** mark "Nothing is recorded to a file." as an approved privacy notice, as in rows 3.2 and 5.3 (saves 6
  from the count; not a word changes). With A and B together the screen reads 41: one over.

## 3. `/coach/highlight/[id]` — a coach asks to show your result on their public page

**No words cut.** Every sentence over the budget is consent wording.

| # | Before | After | Why |
|---|---|---|---|
| 3.1 | Your coach would like to show this on their public page. Only these words show, never your name. You can withdraw it any time. | *(kept, word for word)* | Consent wording: what is shown, that your name is not, and that you can take it back. |
| 3.2 | *(counted toward the 40 words)* | **Proposal:** marked as an approved consent notice, so it no longer counts (your 2026-11-11 rule). Not a word changes. | This is your rule applied as written ("medical, privacy and consent text … no longer counts"). It is only allowed for wording you have approved, so it needs your yes: approving this row approves the sentence above as a consent notice. |
| — | Share a result? · Share it · Withdraw it · the "not switched on yet" / "not for this account" notices | *(kept)* | Already short; the "not switched on yet" notice is privacy wording ("Nothing about you is shared"). |

## 4. `/coach/join/[token]` — the page a coach's invite link opens

| # | Before | After | Why |
|---|---|---|---|
| 4.1 | Coach invite *(small label above the heading)* | *(removed)* | The heading right under it already says it: "Coach Riley wants to coach you". |
| 4.2 | Accept and Coach Riley can build your programming, watch your movement screens and send you work. You can leave at any time. | *(kept, word for word)* | Consent wording: what the coach can see and do once you accept, and that you can leave. |
| 4.3 | Ask your coach for a fresh link — they can make one in a tap. *(an expired or used invite)* | Ask your coach for a fresh link. | Same instruction; the second half was explanation. |
| — | Coach Riley wants to coach you · Join Coach Riley · Make an account and join · I already have one | *(kept)* | Already short. |

**Still 2 words over.** Everything left is the heading, the button, the app's bars and the consent paragraph (22 words).
That paragraph names the coach, so it cannot be marked as an approved notice as it stands (a notice must be fixed
wording). **Option C, not made:** reword it to "Accept and your coach can build your programming, watch your movement
screens and send you work. You can leave at any time." and mark it as an approved consent notice. That changes consent
wording, so only you can choose it. The page's occasional jump as it loads is a separate fix (not this lane's: no
behaviour changes here).

## 5. `/coach/session` — court session (a coach running a gym session)

**No words cut.** Every sentence over the budget is privacy wording about young athletes.

| # | Before | After | Why |
|---|---|---|---|
| 5.1 | Nicknames only for anyone under 18 or who would rather not say. Those names stay in this session and leave when it ends. | *(kept, word for word)* | Privacy wording for under-18s: nicknames only, and they are gone when the session ends. |
| 5.2 | Jump numbers are not sent anywhere. *(or, for an account that chose to keep them: "This account can keep adult jump numbers.")* | *(kept, word for word)* | Privacy wording: where the numbers go. |
| 5.3 | *(both counted toward the 40 words)* | **Proposal:** marked as approved privacy notices, so they no longer count (your 2026-11-11 rule). Not a word changes. | As 3.2: approving this row approves these three sentences as privacy notices. |
| — | Court session · Dunk session · Training session | *(kept)* | Already short. |

## What changed in the code (for the coordinator)

- Word cuts: `app/coach/business/thanks/page.tsx`, `components/coach/form-review/record-set.tsx`,
  `app/coach/join/[token]/page.tsx`. Held by `tests/coach-words/coach-words.test.tsx`.
- Notice proposals (rows 3.2 and 5.3, a commit of their own so either can be dropped): the sentences moved word for word
  into `lib/coach-business/highlight-copy.ts` and `lib/session-setup/copy.ts`, added to the approved list in
  `lib/every-screen/notices.ts`, and marked in `components/coach-business/highlight-consent.tsx` and
  `app/coach/session/_components/session-home.tsx`. Held by `tests/coach-words/notices.test.tsx`, which also checks that the
  screens read exactly as before.
- No test asserted any of the cut sentences, so no existing assertion was changed or relaxed.
