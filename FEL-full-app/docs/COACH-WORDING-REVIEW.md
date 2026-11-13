# Coach screens: shorter first-screen wording — approved by the owner

**Owner, 2026-11-12:** shorter wording on the first screen of five coach screens, and the owner reviews the drafts
before they ship. Lane `lane/coach-words`.

**Owner's answer, 2026-11-12 (relayed by the coordinator): every row below is approved**, the notice proposals (rows 3.2
and 5.3) included, and options A, B and C are approved and built (rows 2.4, 2.5 and 4.4). Option C is the one
consent-wording change, and the owner chose it explicitly. Nothing is live until the lane merges and the owner deploys.

Each row is one line on the screen. The "Owner" column is the owner's answer.

The rule the drafts follow: cut the explanation, keep every fact the person needs. Money, price, policy, legal,
consent and safety wording is **not touched**: those rows are listed as "kept" so you can see they were left alone on
purpose. No behaviour changed: the same buttons, the same links, the same checks.

The "words before scrolling" number is the every-screen scorer's count on a phone (390 × 844). The budget for a
"do this" screen is 40. Since 2026-11-11, an approved medical, privacy or consent notice does not count toward it.

## The numbers (measured 2026-11-12 on the every-screen rig: a production build, a phone at 390 × 844, two reads after; form-review and join read twice more after options A–C)

| Screen | Words before scrolling: before → after | Counted toward the 40 (approved notices left out) | Passes all four checks: before → after |
|---|---|---|---|
| `/coach/business/thanks` | 41 → **36** | 36 | no → **yes** |
| `/coach/form-review` | 56 → **47** | 56 → **41** | no → no (one word over) |
| `/coach/highlight/[id]` | 53 → 53 | 53 → **29** | no → **yes** |
| `/coach/join/[token]` | 44 → **42** | 44 → **20** | no → no: the words now pass; speed does not (below) |
| `/coach/session` | 43 → 43 | 43 → **14** | no → **yes** |

"Before" is the same rig on the code before this lane, read the same day. (The rig's fresh account sometimes shows a
two-word "+100 coins" pop-up; the before numbers above leave it out so the two columns compare like for like.) Every count
includes the app's own bars at the top and bottom (about 9 words) that no screen can cut.

## 1. `/coach/business/thanks` — the page after paying for a coach's package

Shown here: opened with no payment to confirm (a bookmark or a shared link). The real after-payment states (booked,
processing, could not confirm) are all money wording and are **not changed**.

| # | Before | After | Why | Owner |
|---|---|---|---|---|
| 1.1 | This page opens after you pay for a coach's package, to confirm the booking. | This page confirms a coach booking after you pay. | Same two facts (it is for after you pay; it confirms the booking), 5 fewer words. assumption: this sentence describes the page, it is not money wording. It mentions paying, so reject it if you read it as money wording. | approved 2026-11-12 |
| 1.2 | There is no payment to look up from here. | *(kept, word for word)* | Money wording: it tells someone who paid nothing that nothing was charged. | approved 2026-11-12 |
| — | Nothing to show here · Go to Coach · Back to home | *(kept)* | Already short. | — |

## 2. `/coach/form-review` — film a set for your coach

| # | Before | After | Why | Owner |
|---|---|---|---|---|
| 2.1 | The camera counts your reps and reads each one. | The camera counts and checks each rep. | Same fact, 2 fewer words. | approved 2026-11-12 |
| 2.2 | Every number is an estimate. | *(kept, word for word)* | Honesty line: the numbers are estimates, never a measurement. | approved 2026-11-12 |
| 2.3 | Your camera shows here. Nothing is recorded to a file. | Nothing is recorded to a file. | The black box with the camera icon already says where the camera shows. The privacy sentence is kept word for word. | approved 2026-11-12 |
| 2.4 | Film a set for your coach *(small label above the exercise name)* | For your coach | Option A. The button still says "Start the camera". | approved 2026-11-12 |
| 2.5 | *(the privacy line counted toward the 40 words)* | "Nothing is recorded to a file." marked as an approved privacy notice. Not a word changes. | Option B. | approved 2026-11-12 |
| — | The exercise name · the setup line (e.g. "Side-on to the phone, 2 to 3 m away. Stand tall and still, then go.") · Start the camera | *(kept)* | How to stand, and the button: instructions, not explanation. | — |

**One word over** after every approved cut: 41 counted (47 on the screen, 6 of them the approved privacy notice) on
the read without the rig's pop-up, 43 on the read that had it. What is left is the label, the exercise name, the setup
line ("Phone at hip height, 2 to 3 m away, facing you. Stand still, then go."), the camera-and-estimate line and the
button. A next cut is the owner's call (for example "Stand still, then go." → "Then go.").

## 3. `/coach/highlight/[id]` — a coach asks to show your result on their public page

**No words cut.** Every sentence over the budget is consent wording.

| # | Before | After | Why | Owner |
|---|---|---|---|---|
| 3.1 | Your coach would like to show this on their public page. Only these words show, never your name. You can withdraw it any time. | *(kept, word for word)* | Consent wording: what is shown, that your name is not, and that you can take it back. | approved 2026-11-12 |
| 3.2 | *(counted toward the 40 words)* | Marked as an approved consent notice, so it no longer counts (the owner's 2026-11-11 rule). Not a word changes. | The owner's rule applied as written ("medical, privacy and consent text … no longer counts"); the owner's yes approves the sentence above as a consent notice. | approved 2026-11-12 |
| — | Share a result? · Share it · Withdraw it · the "not switched on yet" / "not for this account" notices | *(kept)* | Already short; the "not switched on yet" notice is privacy wording ("Nothing about you is shared"). | — |

## 4. `/coach/join/[token]` — the page a coach's invite link opens

| # | Before | After | Why | Owner |
|---|---|---|---|---|
| 4.1 | Coach invite *(small label above the heading)* | *(removed)* | The heading right under it already says it: "Coach Riley wants to coach you". | approved 2026-11-12 |
| 4.2 | Accept and Coach Riley can build your programming, watch your movement screens and send you work. You can leave at any time. | Accept and **your coach** can build your programming, watch your movement screens and send you work. You can leave at any time. | Option C: the one consent-wording change, chosen by the owner. Only the coach's name became "your coach"; every other word is the same. The name is still in the heading and the Join button. | approved 2026-11-12 |
| 4.3 | Ask your coach for a fresh link — they can make one in a tap. *(an expired or used invite)* | Ask your coach for a fresh link. | Same instruction; the second half was explanation. | approved 2026-11-12 |
| 4.4 | *(the consent line counted toward the 40 words)* | Marked as an approved consent notice (it is fixed wording now). | Option C. | approved 2026-11-12 |
| — | Coach Riley wants to coach you · Join Coach Riley · Make an account and join · I already have one | *(kept)* | Already short. | — |

**The words now pass** (20 counted; the consent line is an approved notice). **Speed does not**, on either read after C,
and it is not wording: the "Join Coach Riley" tap answered in 240 ms and 272 ms (the budget is 200; assumption: machine
load, as eight browser jobs were queued on the shared machine, and earlier reads of this screen were 72–176 ms), and in
one read the page's column shifted once as it loaded (0.064; the budget is 0.02; the same fault earlier reads found).
Nothing in this lane changed what the page does.

## 5. `/coach/session` — court session (a coach running a gym session)

**No words cut.** Every sentence over the budget is privacy wording about young athletes.

| # | Before | After | Why | Owner |
|---|---|---|---|---|
| 5.1 | Nicknames only for anyone under 18 or who would rather not say. Those names stay in this session and leave when it ends. | *(kept, word for word)* | Privacy wording for under-18s: nicknames only, and they are gone when the session ends. | approved 2026-11-12 |
| 5.2 | Jump numbers are not sent anywhere. *(or, for an account that chose to keep them: "This account can keep adult jump numbers.")* | *(kept, word for word)* | Privacy wording: where the numbers go. | approved 2026-11-12 |
| 5.3 | *(both counted toward the 40 words)* | Marked as approved privacy notices, so they no longer count (the owner's 2026-11-11 rule). Not a word changes. | As 3.2: the owner's yes approves these three sentences as privacy notices. | approved 2026-11-12 |
| — | Court session · Dunk session · Training session | *(kept)* | Already short. | — |

## What changed in the code (for the coordinator)

- Word cuts: `app/coach/business/thanks/page.tsx`, `components/coach/form-review/record-set.tsx`,
  `app/coach/join/[token]/page.tsx`. Held by `tests/coach-words/coach-words.test.tsx`.
- Notices (rows 2.5, 3.2, 4.4, 5.3): the sentences live in `lib/coach-business/highlight-copy.ts`,
  `lib/session-setup/copy.ts`, `lib/coach/formReview/copy.ts` and `lib/coach/inviteCopy.ts`, are on the approved list in
  `lib/every-screen/notices.ts`, and are marked where they render. Held by `tests/coach-words/notices.test.tsx`.
- Options A and C changed copy that `tests/coach-words/coach-words.test.tsx` held (the label and the consent line): those
  two assertions were changed on purpose to the owner-approved words, not relaxed. No older test asserted any of it.
