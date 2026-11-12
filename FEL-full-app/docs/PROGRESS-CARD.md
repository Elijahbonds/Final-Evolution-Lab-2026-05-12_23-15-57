# Progress card (value round, item 1)

The product promise is "get measurably better" (`docs/OWNER-DECISIONS.md`). This item is a weekly progress card per
user: this week against last week, from real rows only, with an image to share. Lane `lane/progress-card`. No schema
change, no new dependency, no deploy file.

## Where it lives

| Surface | What | File |
|---|---|---|
| `/profile/week` | The card, the share control, the before/after-clips seam | `app/profile/week/page.tsx` |
| Profile header | "Your weekly card, and an image to share →" under the four tiles | `components/profile-v2/progress-header.tsx` (one link) |
| Train | A weekly door under the Today card (the week's dates; reads nothing) | `app/train/page.tsx` (one line), `components/progress-card/week-entry.tsx` |
| Share image | `GET /api/v1/progress-card/image?name=0\|1`, PNG 1080×1350, the owner's own card only | `app/api/v1/progress-card/image/route.tsx`, `lib/progress-card/image.tsx` |

`/play` (Home for a signed-in player) changed within 24 hours, so its one-line door is routed, not applied.

## The data: profile v2's layer, not a second one

The card reads `readProfileRows` (`lib/profile-v2/load.ts`): the same single parallel batch as `/profile`, with the
same age and opt-in gates inside the queries. It builds on `assembleProfile`, so its four tiles are the profile
header's tiles (`lib/profile-v2/tiles.ts`). A number on the card and the same number on the profile cannot disagree.

| On the card | Source | Who gets it |
|---|---|---|
| Jump | Best saved jump of the week, in inches (`WorkoutScan`) | Verified adults who opted in to saving numbers |
| Form | Mean clean-rep share of the week's Mirror squat and lunge sets | Opted-in adults from the account. Everyone else from this phone (`lib/mirror/deviceProgress`); the card summarizes itself again once the phone's numbers are read |
| Reaction | Nothing saves a reaction time (profile v2 owner call 2) | Nobody: "Not tracked yet" |
| Streak | `PlayerProfile.streakDays`, plus days played this week vs last | Everyone (session times only) |
| Runs | Sessions finished this week vs last (`GameSession.createdAt` only) | Everyone |
| Mode bests | Each mode's best score this week vs last, top three by runs | Verified adults. A teen's scores stay on the phone, and the card says so |

`lib/progress-card/card.ts` builds the card. `lib/progress-card/summary.ts` gives it one of four states and the line on
top:

| State | When | Line |
|---|---|---|
| `new` | Nothing in either week | "Nothing on your card yet. Play or measure once this week, and next week’s card shows what changed." |
| `first-week` | This week only | "Your first week on record. Next week’s card shows what changed." |
| `quiet-week` | Last week only | "Nothing in the last 7 days yet. Last week’s numbers are here to beat." |
| `compared` | Both weeks | "Better on N of M against last week." M counts only what has a number in both weeks |

**Honesty rules:** a week with no reading is null, never 0. An arrow needs both weeks. A change inside the noise band
reads "same". DERBY-KEY baseball scores from before the innings cut-over never compare with the new game. A read that
hits its cap says "400+".

## Privacy and the share image

- **Under 18 or unknown age:** no name on the card. The share control has no name option, and the route never draws a
  name whatever `?name=` says. There is no face (no photo or avatar on the image) and no location (FEL keeps none).
- **Adults:** the name is off until they tick "Put my name on it" (assumption: off by default).
- **What the image leaves out:** numbers kept only on the phone, because the server draws the image and never sees them.
  The page says so.
- **When the image is made:** on a tap. It is shown first, and only a second tap shares it (`deliverClip`: the share
  sheet, or a download). Nothing is posted or stored.
- **Response:** `cache-control: private, no-store`, signed-in only (401 otherwise), and rate limited to 20 images per 10
  minutes per account (new).
- **Before/after clips:** FEL keeps no clip of the user's own. The replay buffer and the Screen's frozen reps live in page
  memory only. Booking review clips are consented for that one review and then deleted. So `ProgressCard.clips` is
  `null` (the seam) and the page shows a labelled **Coming** block. Owner decision 2026-10-22: our own storage only.

## Measured

Rig: the esbuild + Playwright phone rig (Chromium, 390×844, DPR 3, touch, 4× CPU), the real components with cards
built by the real code from `tests/helpers/progressCardRows.ts`. The share PNGs come from the real renderer. Shots are
in `scratchpad/round7/progress-card/shots/`.

| | Result |
|---|---|
| `/profile` page JS (rig, initial, min / gz) | 394.3 / 127.4 kB → 394.5 / 127.4 kB (one link). No new request, no new query |
| `/train` | +0 queries, +0 client requests; the door is server-rendered and reads nothing |
| `/profile/week` | 1 server batch (the profile's 17 reads). 0 client requests on load; 1 on the "Make the image" tap. Card JS beyond the chrome on the rig (everything client-rendered): 32.6 kB min / 8.5 kB gz |
| Horizontal overflow at 390 px | 0 on every state |
| `backdrop-filter` elements on the card page | 0 |
| Share image render (next/og, node, per image) | 260–640 ms; 110–160 kB PNG |

## Owner calls

1. **Copy for review (product copy, not policy):** the four state lines above. The image's first-person lines: "Day one.
   Nothing measured yet.", "My first week on record.", "Nothing logged this week yet.", "Measured different things each
   week." The share notes: "An image of this card. You see it first; nothing is posted unless you share it.", "Numbers
   kept only on this phone aren’t on it.", "Under 18, your name and photo are never on the image." The teen games line:
   "Under 18, or with no birth year on the account, your game scores stay on this phone, so the card counts runs, not
   scores." The clips Coming block.
2. **Reaction time** still needs a place to be saved (profile v2 owner call 2).
3. **Before/after clips** need the user's own clip store first.
4. **`/play` door** is routed (see the lane's routed notes).
5. **Assumptions:**
   - Weeks are rolling 7-day windows; dates are UTC.
   - Higher is better in every mode.
   - Days played count toward "better".
   - An adult's name is off by default.
