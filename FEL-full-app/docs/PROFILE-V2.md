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

**The athlete stage** (lane/profile-character, owner 2026-10-27: "Make the profile show your actual character, not some
stick figure"). Your own profile shows your real athlete — the body, saved look, hair and clothes every mode plays — by
itself, with no button (`components/profile-v2/athlete-stage.tsx`):

1. **First paint.** The picture of your athlete this device kept the last time the 3D drew it, if it still matches your
   look. Otherwise the athlete's silhouette with the kit's loading shimmer (`athlete-silhouette.tsx`). Never the SVG
   `AvatarFigure`.
2. **The live 3D** (`athlete-3d.tsx`, its own lazy chunk) opens once the stage is near the screen
   (`components/library/use-auto-open`, the demos' autoplay) and the page has painted and gone idle, then fades in over
   the picture. It spawns the same body every mode spawns (`CharacterLibrary.spawn`, the default hero, role `player`),
   idles, turns slowly (not with reduced motion on), and a sideways drag turns it; a vertical swipe still scrolls. It is
   shown only once measured off its bind pose (never a T-pose). Phone care: the heavy steps yield to the page between
   them, the device pixel ratio is capped at 2, the render loop stops while the page is hidden or the stage is
   off-screen, and everything (the GL context too) is disposed on unmount.
3. **The kept picture** (`lib/profile-v2/athletePoster.ts`, `posterStore.ts`). The 3D's first sure frame, a 2:3 crop
   at up to 400×600, webp (PNG on Safari), in IndexedDB on this device only. It is keyed by a hash of the account id and
   valid only for the same look: the `AvatarLook` and `AthleteBuild` rows' `updatedAt` (read beside the profile in
   `app/profile/page.tsx`; every Closet, Creator, slot and card-skin save moves one, on any device), the device's own
   copy of the look (a teen's look lives only on the device), and a version. It is re-taken when the identity the 3D
   actually wore differs. Every read and write is wrapped and time-boxed; a browser that will not keep it just gets the
   silhouette and the 3D, as on a first visit.

**Someone else's profile** (`/u/[slug]`) shows the athlete's silhouette, still. The 3D would draw the signed-in
*visitor's* own body (`resolveIdentity` reads the visitor's closet), and no public render of another account's body
exists: `/api/v1/hero-body` and `/api/v1/closet` answer only for the session's own account. Showing another person's
athlete needs a new public read (or a picture the owner chooses to publish), which is an owner call (section 5).

**Measured** (lane/profile-character, 2026-10-28; `scripts/probes/_profile-character.mts`: the real page modules, a
release build, 390 px at DPR 3, CPU throttled 4×, SwiftShader GL, on a shared 4-CPU box — the GPU-side and absolute times
are pessimistic; compare rows, not devices):

| | Before (8983dad7) | After | Change |
|---|---|---|---|
| First contentful paint, median of 7 (interleaved, warm-up dropped) | 768 ms | 740 ms | −4% (the 3D never touches first paint) |
| Long tasks before FCP, median of 7 | 451 ms | 456 ms | +1% |
| What the stage shows at first paint | the SVG stick figure | first visit: the athlete's silhouette; repeat: the kept picture of your athlete (up 0.4 s after FCP) | |
| Your real athlete on screen | only after a tap on "See in 3D" | first visit: the live 3D, by itself; repeat: the picture at once, then the 3D | |
| The 3D's load, warm (old: See in 3D tapped; new: repeat visit) | 14.0 s of long tasks, worst 7.8 s, taps up to 1.36 s | 9.3 s, worst 2.8 s, taps ≤ 0.4 s (input delay ≤ 24 ms) | −33% total, −65% worst |
| JS heap once settled | 5.6 MB (no 3D) / 43 MB (3D tapped) | 39.5 MB (3D) | the 3D's cost, now paid by default |

The single biggest cut: a scene no mode owns is unscoped, so the spawn built every authored clip of every sport and
installed the hoops captures (11 of the old 14 s spawn task in a CPU profile). The stage now stands in the exercise
library's lazy clip scope (`felModeId 'library'`, not a standard-frame mode, so height and build still show). On a phone
it also carries the screen's tier (`felTier`), so the scan body loads as its phone file (`elijah-meshy.mobile.glb`).

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
4. **Another person's athlete on their profile (lane/profile-character).** Today a viewer sees a neutral silhouette.
   Showing the real athlete needs either (a) the owner of the profile publishing a picture of their athlete with their
   public card (adults who chose public only; teens never, as for the page itself), or (b) a public read of another
   account's look. Recommendation: (a) — it reuses the picture this device already keeps, it is opt-in per adult, and it
   exposes nothing the owner did not choose to show. Not built without the owner's OK.
5. **Assumptions to check by eye.**
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
| Page JS beyond the chrome, minified / gzipped | 69.3 kB / 20.5 kB | 30.2 kB / 11.3 kB (3D: a lazy chunk; since lane/profile-character it loads by itself after the first paint, on idle) |
| Animation library on the page | framer-motion | none |
| `backdrop-filter` elements on the page body | 0 | 0 (no blur stacks; the shell's chrome is perf-lag's) |

**Measured on the phone rig** (median of 3 runs each, before and after interleaved, all under one hold of the shared
gate lock; `logs/perf.jsonl`):

| | Before | After | Change |
|---|---|---|---|
| First contentful paint | 2,096 ms | 1,668 ms | −20% |
| Last content commit (data rendered) | 1,406 ms | 1,184 ms | −16% |
| Requests during load (page + chrome) | 12 | 5 | the page's own: 8 → 0 |
| Long tasks in the first 8 s | 5 (745 ms) | 3 (583 ms) | −2 (−22% blocked time) |
| Worst long task | 281 ms | 229 ms | −52 ms |
| React commits during boot | 8 (232 ms) | 6 (209 ms) | −2 |
| Scroll frame interval, p50 / p95 | 33.4 / 66.7 ms | 16.7 / 33.4 ms | 30 fps → 60 fps |
| DOM nodes | 844 | 485 | −43% |
| Page height at 390 px | 7,340 px | 3,582 px | −51% |
| `backdrop-filter` elements | 3 | 2 | both from the shell chrome (the perf-lag lane's area) |
| Horizontal overflow at 390 px | 0 | 0 | |

The rig paints late under the 4× throttle, so on the rig the before page's 150 ms requests finished before its first
paint. On a real phone, with a real network, the before page showed its shell with dashes until 8 requests came back.
The after page arrives with its numbers, because the server read them in one batch.

Screenshots: `scratchpad/round7/profile-v2/shots/`:
- before: `before-phone.png`, `before-phone-full.png`, `before-desktop.png`
- after: `after-phone-adult.png`, `after-phone-adult-full.png`, `after-phone-fresh.png` (a new account: every tile a
  dash with a way to measure it), `after-phone-teen.png`, `after-desktop.png`, `after-tv.png`
