# Profile v2

Owner, 2026-10-24: **"We've gotta improve the profile view too."** Lane `lane/profile-v2`. UI work, not gameplay.

What was wrong, in the owner's words: it looks plain and unfinished, it's cluttered and confusing, it's slow and laggy on
iPhone, and it's missing information. The answers the owner gave:

- **Lead with progress.** The top shows the 3D athlete, the PRQ grade, and this week's real numbers (jump, form,
  reaction, streak), each with an arrow against last week. This is the product promise, "get measurably better"
  (`docs/OWNER-DECISIONS.md`, VALUE / FRIENDS / PROFILE).
- **Four sections:** stats and personal bests, badges and milestones, squad and friends, highlights.
- **Privacy: friends only, and teens private.** Adults choose public or friends-only. Under-18s are always
  friends-only and have no public page. Coaches see their athletes' profiles.

## 1. The audit (757534fe, before)

Measured on the esbuild + Playwright phone rig: Chromium, 390×844, DPR 3, touch, 4× CPU throttle. The rig renders the
page's real client components inside the real chrome (status rail, tab bar). Every `/api/*` request is answered from
fixtures after 150 ms, standing in for a phone's round trip plus the route's own reads (assumption: 150 ms). The rig
files are in the session scratchpad, `round7/profile-v2/rig/`.

**What the page did.** `app/profile/page.tsx` read the profile, the entitlements and the wallet on the server, then
drew a shell. After hydration it made **8 client requests**: `/api/profile` twice (once for the profile body, once for
the status rail), `/api/mastery`, `/api/prq/vector`, `/api/health/consent`, `/api/v1/card`, `/api/v1/card/highlights`
and `/api/marketing/referral`. Each request re-read the session and its own rows. Until they answered, the header showed
dashes.

**Database calls.** A probe ran each handler against a counting stand-in client for an existing account. It counted
**49 calls across 9 handlers**: 5 for the page, 14 for each of the two `/api/profile` requests (that route also writes,
`playerProfile.update`, through `getOrCreateProfile`), and 1 to 6 for each of the others. Without the status rail's
copy of `/api/profile`, the page itself made 35 calls.

**JavaScript.** The page's own client code, after subtracting the chrome every tab carries, was **69.3 kB
minified / 20.5 kB gzipped**. It included framer-motion, which animated every roster card and attribute bar on mount.

**What the page said.**

- The header's big PRQ number was `prqScore()` of the profile's attributes. A new account is seeded with random 40–70
  values (`lib/profile-service.ts`), so a new player saw "PRQ 52" before measuring anything. This is the QA P0-01
  class of bug, which `lib/prq-display.ts` fixed everywhere except this aside.
- The page showed two different PRQs: the aside's seeded number and the body's measured one.
- There was no week-over-week comparison, no per-mode bests, no history, no head-to-head record and no privacy control.
- The order was: shortcuts, then the identity card (with the email on screen), then a ten-card athlete roster, then
  mastery, the PRQ attributes with a manual-entry form, data rights, health data, the boost shop, the creator card
  editor, the referral card, the motion setting and the doors.

Screenshots: `scratchpad/round7/profile-v2/shots/before-phone.png`, `before-phone-full.png`, `before-desktop.png`.

## 2. The new layout, top to bottom

| # | Block | Its one job | Reads (all in one server batch, `lib/profile-v2/load.ts`) |
|---|---|---|---|
| 0 | Title row | Who this is; **Edit profile** and **Settings** one tap away | `CreatorCard.displayName`, else `User.name` |
| 1 | **Progress header** | The athlete, the PRQ grade, this week vs last week | See below |
| 2 | **Stats & personal bests** | Best in each mode with an 8-week line; measured skills with their source; jump and form lines | `GameSession` `groupBy` best and runs per mode, plus the last 8 weeks of scores (verified adults only); `PrqEntry` latest per skill; saved jumps and Mirror sets |
| 3 | **Badges & milestones** | What you've earned and the next goal in reach | `PlayerProfile.streakDays` and `xp` (level); `ModeMastery`; `Credential` (Academy passes); `MirrorTriumph` (ghost beats); coach-verified milestones are a labelled **Coming** block |
| 4 | **Squad & friends** | Your rival and your head-to-head record | `MpMatch` (settled, online, as host or guest); `ChallengeLink` sums (opened, tried, beat you); friends and Squads are a labelled **Coming** block |
| 5 | **Highlights** | Your best moments | `CreatorCard.highlights` (pinned runs); auto-cut clips are a labelled **Coming** block |
| 6 | **Who can see your profile** | The privacy choice and the coaches who can see it | `User.dobYear`, `CreatorCard.published` and `slug`, `CoachClient` (live) |
| 7 | Shortcuts and doors | Athlete, Closet, Store, Wallet, Sessions, then the tab's doors | none |

**The progress header.** Each tile shows one number. A week is the last 7 days against the 7 before; these are rolling
windows, not calendar weeks (assumption). A number nobody measured shows as a dash with a link to measure it. It never
shows a placeholder number.

| Tile | Source | When there is no number |
|---|---|---|
| PRQ grade | The measured PRQ (`prqDisplay` over the latest `PrqEntry` per skill), with how many skills are measured | "—, NOT MEASURED, Nothing measured yet" |
| Jump | The best saved jump of the week, in inches, from `WorkoutScan` kinds `dunk`, `prove_it`, `rescreen` and `jump`. Only adults who opted in to saving numbers (`canSaveScanNumbers`) | An adult who has not opted in: "Turn on saving…", which links to Account. Under 18: "saved for adults who opt in", which links to a jump check. Opted in with nothing saved: "Do a Mirror jump check" |
| Form | The mean clean-rep share of the week's Mirror squat and lunge sets (`valueFromRow`). For everyone the server does not save for, it is read from this phone (`lib/mirror/deviceProgress`) and labelled "On this phone only" | "Do a Mirror squat set" |
| Reaction | **Nothing saves a reaction time today.** Beach Sprint shows the start reaction on its finish card and keeps nothing | "Not tracked yet", which links to Beach Sprint. This is an owner call; see section 5 |
| Streak | `PlayerProfile.streakDays`, plus the days played this week vs last week (`GameSession` times only, no scores) | "Play or train today to start a streak" |

The 3D athlete loads only when the player taps **See in 3D** (`components/profile-v2/athlete-3d.tsx`). Until then the
stage shows a static SVG poster (`AvatarFigure`), so the poster costs no script, no download and no GPU. The 3D view
spawns the same body every mode spawns (`CharacterLibrary.spawn`, the default hero, role `player`). On it, the device
pixel ratio is capped at 2, the render loop stops while the page is hidden, and with reduced motion on the athlete does
not turn by itself.

**Large screens.** At `lg` and up, the athlete and the PRQ grade sit in a left column beside the four tiles, and every
section turns into two columns. The phone layout fits 390 px with no horizontal overflow.

## 3. What moved

| What | From | To |
|---|---|---|
| Athlete roster pick (`AthletePicker`), manual PRQ entry (`PrqFoundation`) | the profile | **`/profile/edit`** (`#athlete`, `#measure`) |
| Creator card editor, referral card | the profile | **`/profile/edit`** (`#card`, `#invite`) |
| PRQ data rights (export or delete), health data, the reduced-motion setting | the profile | **`/account`** |
| Boost shelf (buy creator cards with shards) | the profile | **`/cards`** (the "Card collection" door) |
| Mode mastery panel | the profile, client-fetched | the profile's **Badges** block, server-read |
| The email address on screen | the profile header | removed (it is on `/account`) |
| Wallet balances | the profile header | the status rail, which already shows them on every page |

`components/profile-view.tsx` keeps the four panels as named exports, so the source checks that read it
(`lib/health/healthDataCopy.test.ts`, `lib/prq-data-rights.test.ts`, `lib/prq-display.test.ts`) still hold unchanged.

## 4. Privacy

- **Rules:** `lib/profile-v2/visibility.ts`, tested one rule at a time in `visibility.test.ts`.
  - The owner always sees their profile.
  - A coach with a live `CoachClient` sees their athlete, whether the athlete is an adult or a teen.
  - An adult who chose public is visible to anyone.
  - Everyone else sees nothing.
  - Under 18, or an unknown age, is never public, whatever flag is stored.
- **Where an adult's choice is stored.** No schema change was needed. The choice uses the field that already exists for
  a public page, `CreatorCard.published` (`POST /api/v1/card/publish`). That route already refuses under-18 and
  unknown-age accounts (CARD-SAFE-1). The default is off, which means friends-only.
- **Age checks reused.** `lib/privacy/verifiedAdult` (a gap of more than 18 years; unknown is not an adult) and
  `canSaveScanNumbers` (verified adult plus a live `jump_numbers` opt-in) are reused as-is.
  - They run inside the query as a relation filter (`lib/profile-v2/gate.ts`), so the database returns no gated row
    for a refused account. Then they run again in JS on the result.
  - `gate.test.ts` checks the query-side year bound against `verifiedAdult` for every birth year.
- **The viewer route is `/u/[slug]`.** The handle is the creator card's slug, the only handle FEL has. Every refusal
  returns the same 404 as a slug that doesn't exist. `lib/profile-v2/viewer.ts` strips data before render:
  - Nobody but the owner sees the Mirror numbers (a coach gets those through the per-booking share), the week's
    tiles, opponents' names or the privacy controls.
  - A public viewer also gets only the blocks the owner shows on their public card (`showStats`).
  - The owner opening their own `/u/…` sees what others see, with a banner.
  - The coach roster links each athlete's profile.
- **Friends.** FEL has no friends list (there is no model for one). "Friends-only" therefore means you and your coaches
  for now. The rule takes an `isFriend` boolean, so the friends lane only has to supply it. A friends list needs a
  schema change, which this lane does not make; see section 5.

## 5. Owner calls

1. **Friends list (needs a schema change).** "Friends only" can't include friends until a friend relation exists.
   Squads (a value-round lane) is the natural place for it. Until then the copy says "Only you and your coaches can see
   it."
2. **Reaction is not saved anywhere.** Beach Sprint measures the start reaction (`SprintMode` `stats.reactionS`), but
   the session save keeps only score fields. To show it week over week, the session needs to store it. `GameSession`
   has no column for it, so it would mean either a schema change or a new stats JSON field. The tile says "Not tracked
   yet" until then.
3. **Privacy and explainer copy for review.** This is product copy, not policy:
   - "Only you and your coaches can see it."
   - "Anyone with your link can see your profile and card."
   - "Accounts under 18 never get a public page."
   - "On this phone only. Under-18 bests are never kept on the server."
   - "Jump numbers are saved for adults who opt in."
4. **Assumptions to check by eye.**
   - Weeks are rolling 7-day windows.
   - Jump is shown in inches.
   - A jump within ±0.5 in of last week reads "same" (new).
   - The streak goals are 3/7/14/30/60/100/365 (new; nothing pays on them).
   - Days played are counted in UTC.
   - Days played (session times, no scores) are counted for teens too. They are training data, which the owner allowed
     for teens.

## 6. Performance, before and after

The method is the same rig and the same account (`rig/fixtures.mjs` for before; `rig/gen-fixture.ts` builds the after
data with the real assembly code). The after side renders the whole page on the client. In production the page arrives
server-rendered and only the islands hydrate, so the after numbers are conservative.

| | Before (757534fe) | After |
|---|---|---|
| Client requests after load | 8 (`/api/profile` ×2 …) | 1 (the status rail's `/api/profile`, chrome on every page) |
| Database calls for one profile view | 49 across 9 handlers (35 without the rail) | 17 in one parallel batch, plus the rail's 14 |
| Page JS beyond the chrome, minified / gzipped | 69.3 kB / 20.5 kB | 30.2 kB / 11.3 kB (3D: a lazy chunk, loaded only on tap) |
| Animation library on the page | framer-motion | none |
| `backdrop-filter` elements on the page body | 0 | 0 (no blur stacks; the shell's chrome is perf-lag's) |
| Time to content, FCP, long tasks, scroll | see the measured table below | |

**Measured on the phone rig** (median of 3 runs each, interleaved under the shared gate lock): the table below.
