# Nexus roadmap: from the Studio we have to "Nexus creates my app"

**The owner's goal (2026-10-14):** "finish my Final Evolution Lab App/Game… make sure my engine Nexus is the best
editor/game developer in the world and creates my app with it."

**The owner's decisions (2026-10-20), which this plan is built on:**

| Decision | Answer |
|---|---|
| What "Nexus creates my app" means | **All four:** (1) shipped venues come from Studio, so production loads Studio exports and the owner restyles the real game with no code; (2) new game modes are built in Studio, with rules, scoring, venue and scripts as data; (3) the AI builder drafts a whole mode from a description, for the owner to edit; (4) Studio edits the app too: menus, the home screen and the mode tiles |
| Audience | The owner (admin) first, then an invited creator beta, then public |
| Sharing | Share links first (play by link, no money); the marketplace later |
| Where Nexus should lead | **All four edges:** AI-first creation (every change reviewable and undoable), editing on a phone, pro quality with no code, play-and-edit live |
| Priority | Game feel first (the hoops and feel lanes running now), **then** the Nexus build-out. This plan is ready for when that starts |

Lane: `lane/nexus-roadmap` (docs only). Read with `docs/NEXUS-STUDIO.md` (the architecture, §1–§13) and
`origin/lane/studio-save:FEL-full-app/docs/NEXUS-STUDIO-SAVE.md` (account save, built, not merged).

**How this was measured.** Everything in §1 was read from the code on `lane/finish-release` at `fdd77784`
(2026-10-20), plus `origin/lane/studio-save` at `f02c1a57`. Nothing was run: this lane builds nothing and shares the
machine. A sentence that is a guess says `assumption:`.

---

## 1. Today vs the goal

### 1.1 What exists (the base every phase builds on)

| Piece | Where | State |
|---|---|---|
| The editor | `app/studio/**`, `components/nexus-studio/**` (12 components and the `use-studio` hook), `lib/nexus-studio/**` | Four tracks (venues, AI builder, characters, scripts). 30 test files; about 417 `it`/`test` calls (grep count). About 11,600 lines with tests |
| The document | `lib/nexus-studio/doc.ts` | Typed, versioned (`STUDIO_DOC_VERSION = 1`), sanitised on every import (`sanitizeProject`). Caps: 24 venues, 600 objects a venue, 64 characters, 64 scripts |
| Undo | `lib/nexus-studio/commands.ts` | Every edit is a command; each op records its own inverse; drags coalesce; 200 steps |
| What you edit is what a mode draws | `lib/babylon/core/lookStack.ts` `mountLookStack` | ONE look-stack function, called by both `ModeHarness.mountMode` and the editor's `stage.ts`; `stage.order.test.ts` holds it |
| The export | `lib/nexus-studio/exportVenue.ts` → `runtime.ts` `mountStudioFor` | A `StudioVenueExport` is a `PlaceLook` over a venue spec plus extras (kit, scans, fixtures, crowd, decals, weather, intro, replay angles, cast, scripts) |
| Modes that load an export | `lib/nexus-studio/targets.ts` | **4:** Tiebreak, Football Rush, Volleyball, Derby. Each has opt-in lines in its own mode file |
| The load gate | `runtime.ts` `studioLoadAllowed` | `NODE_ENV !== 'production'`. **Production never loads a Studio venue** |
| The route gate | `app/studio/layout.tsx`, `lib/flags.ts` `isNexusStudioEnabled` | `NEXUS_STUDIO_ENABLED` off = 404. On = **every signed-in account** (no role check). `/studio` is HELD in `lib/nav/reachability.test.ts` |
| AI builder | `app/api/cell/venue/route.ts`, `lib/nexus-studio/aiEdits.ts`, `ai-venue-panel.tsx` | CELL answers in a closed vocabulary (venue settings, place, row, clear, script, cast, stamp) and "explain". Shown as a review list; Apply is ONE undo step. Gates in order: ABACUS switch, sign-in, 6/min and 120/day, ages 13+ (`aiAccess.ts`), 400 kB body |
| CELL's game-file builder | `components/studio/studio-shell.tsx`, `app/api/cell/{chat,compile,projects}/**` | Generates HTML/JS game files into an iframe preview. A separate engine from Nexus; it does not use the Babylon modes |
| Scripts | `scripts.ts`, `interpreter.ts`, `scriptHost.ts` | Event → condition → action graphs. **Presentation only**, by design: `interpreter.wiring.test.ts` proves the host never scores, ends, reports or resets |
| Account save | `origin/lane/studio-save` | Built behind `STUDIO_CLOUD_SAVE_ENABLED`: the `StudioProjectSave` table, routes, two-device merge, ages 13+, look codes never stored. **Not merged; its SQL is not applied; its privacy text is waiting for the owner** |
| Cartridge marketplace | `app/api/studio/{cartridges,credits,entitlement,partner-keys}`, `lib/studio-{plan,service,credits}.ts` | Behind `STUDIO_CREATOR_ENABLED`. Listings (`MarketplaceListing`, type `CARTRIDGE`) of **CELL HTML builds**, with prices. No approval step, no Studio-project kind |

### 1.2 The four meanings

| # | Meaning | What exists | What is missing (measured) |
|---|---|---|---|
| 1 | **Shipped venues come from Studio** | The export path is real and reaches 4 modes in a dev build. The production place system is already data: `nexus/placeLooks.ts` `PLACE_LOOKS` (12 modes), read by `readPlaceLook` in 14 mode files; the export already converts to a `PlaceLook` (`runtime.ts studioLook`) | (a) `studioLoadAllowed` refuses production. (b) There is no "published" venue: no file, no table, no list. (c) Only 4 of the **29 enabled modes** are targets. 21 of the 29 mount a venue spec (`mountVenue`); 8 build their own world (skate, snowboard, surf, sprint, freerun, big air, Aero Aces, Velocity Kart) and have no export shape at all. Hoops places come from a third system (`courtLocations.ts`). (d) There is no competitive-context signal for a gate: `playFrame.ts` reads `felRanked`, and its own comment says nothing sets it; arena (`?arena=`), challenge links (`?c=`), async challenges (`?mp=`) and signature runs are URL params read only in `game-shell.tsx`. (e) Objects may sit anywhere within the reach clamp (`doc.ts`), including over the court: there is no keep-out zone for the playing surface or the camera's view |
| 2 | **New modes built in Studio** | Scripts can listen to a mode and put on a show. Tiebreak, Football, Volleyball and Derby post score keys the scripts read | **No rules format.** Every mode is a hand-written `ModeDefinition` in code (`lib/babylon/modes/registry.ts`) with its own route under `app/play/<mode>/`. Scripts are forbidden from scoring (correctly, for shipped modes). The one config-driven family, `makeTimingSportMode(cfg)` (`TimingSportMode.ts`), is called by nothing today. There is no generic route that plays a mode from data |
| 3 | **AI drafts a whole mode** | AI drafts venue settings, placements, scripts, casts and stamps, reviewed and applied as one command | No rules vocabulary for it to draft (see 2). CELL's other builder writes code into an iframe, which is the opposite of "no code" and outside the engine |
| 4 | **Studio edits the app** | Nothing | The home screen (`/play`, since a signed-in `/` redirects there), the families (`lib/nav/families.ts` `FAMILIES`), the tiles (`lib/game-data.ts` `MODE_INFO`) and the venues page (`VENUES`) are code constants. No data override, no publish step |

### 1.3 The four edges

| Edge | What exists | What is missing (measured) |
|---|---|---|
| **AI-first, every change reviewable and undoable** | The best part of the Studio today: a closed vocabulary, sanitised twice, a review list with struck-out lines, one undo step for the whole answer, "explain this venue". The model never sees characters, look codes, age or account | AI cannot touch rules (none exist) or app surfaces. No "AI suggested this" history beyond the undo label. AI is off in production unless the ABACUS switch is on (it is global, not per account) |
| **Editing on a phone** | Touch-action is off on the canvas, so a browser gesture never steals a drag | **The Studio does not fit a phone.** At 390 px it overflows by 345 px with nothing open (measured by studio-save, §6 of its doc). 10 of the 12 Studio components have no responsive class (`md:`/`sm:`/`lg:`); `studio-app.tsx` lays out a fixed `minmax(320px,420px) 1fr` grid. Group move, copy, paste, hide and lock are keyboard shortcuts with no touch path. The gizmo is Babylon's mouse-sized `GizmoManager` |
| **Pro quality with no code** | The editor renders through the mode's own look stack; the budget meter measures the phone and desktop ceilings live; a Phone switch rebuilds on the mobile tier; 6 built-in stamps; replay angles and intros through the real director; cast fans cheer with the crowd's own timing | The meter warns but never blocks: nothing stops a heavy venue from shipping. No readability check (fog density goes to 0.08; a dark mood can hide a ball). Hand-built-world modes cannot be edited at all. The editor shows Football's field but not Volleyball's or Derby's own furniture (NEXUS-STUDIO §13.3 limits) |
| **Play-and-edit live** | Play-test writes the export and opens the mode in a new tab; edits in the viewport re-realise per layer within a frame (`viewport.ts` layer diff) | Play-test is dev-only and one-way: a change needs a new tab. There is no "play here", no pause-edit-resume, and no hot swap into a running mode |

### 1.4 The top five gaps

1. **Production cannot load a Studio venue** (`studioLoadAllowed`), and there is no notion of a published venue. Until
   this closes, nothing the Studio makes reaches a player. (Meaning 1.)
2. **There is no rules format.** Modes are code; scripts are presentation-only by design. Meanings 2 and 3 both wait on
   it. (Meanings 2, 3.)
3. **The Studio is open to everyone or no one.** `NEXUS_STUDIO_ENABLED` has no role or audience, account save is
   unmerged, and nothing is "owner only". (Audience.)
4. **No fairness or safety plumbing for user content:** no competitive-context signal (`felRanked` is never set), no
   keep-out zone, no budget gate at publish, no abuse text screen, no report or takedown path for Studio content.
5. **The Studio does not work on a phone** (345 px overflow, keyboard-only commands). (Edge: phone.)

---

## 2. The phases

**Shape.** Ten phases. Each one ships something the owner can use on its own; none is a "foundation only" phase. The
owner's priority holds: **no phase starts while the hoops and feel lanes are running**, and phases 1, 4 and 6 touch
mode files those lanes hold, so they wait for them to land (§2.11).

| # | Phase | Size | Ships | Needs from the owner (summary) |
|---|---|---|---|---|
| 1 | Production venue loading | L | The owner restyles real modes in production, owner-only first | Q1, Q2, Q3; flip a flag |
| 2 | Owner Studio in production, and publish without a deploy | M | Edit and publish from `/studio` in production | Q4; one table's SQL; studio-save's SQL and policy text |
| 3 | Share links | L | Play a Studio venue by link | Q5, Q6, Q7; Terms/Privacy copy; one table |
| 4 | Play-and-edit live | L | Play inside the editor; edit while playing | Nothing new |
| 5 | Phone editing | L | The Studio on a phone, AI first | Q8; a real-device check |
| 6 | A data-driven mode format | XL | The first mode made with no code: Target Attack | Q9, Q10; Terms copy on rewards |
| 7 | AI drafts a mode | M | "Describe a mode" → a playable draft | Privacy §1/§2/§3 copy |
| 8 | Studio edits app surfaces | M | Home, families and tiles from Studio | Q2's answer reused |
| 9 | Creator beta | M | Invited creators use the Studio | Q4's beta list; moderation staffing; copy |
| 10 | Marketplace | XL | Studio projects sold or shared publicly | Store terms, payouts, IP process; Q11 |

---

### 2.1 Phase 1: production venue loading (L)

**Scope.**
- **Published venues as data.** A venue the owner publishes is a `StudioVenueExport` stored as a JSON file in the
  repo (`lib/nexus-studio/published/<mode>/<id>.venue.json`, reviewed in a PR like any content). It is read through
  `parseVenueExport` at load, so a committed file is still untrusted input. The Studio's "Publish" button downloads
  the file; phase 2 replaces the download with a server publish.
- **Two load depths, one gate:**
  - *Look* (sky, ground colours, backdrop, kit dressing): `placeLooks.ts looksFor(modeId)` lists published venues as
    places (`id: 'studio:<venueId>'`, through the existing `studioLook`). Every mode that already calls
    `readPlaceLook` (14 files) gets them **with no mode-file change**.
  - *Full* (scans, fixtures, crowd, decals, intro, replay angles, cast, scripts): the 4 targets' existing
    `mountStudioFor` path, with a production source next to the dev `?venue=` one.
  - `studioLoadAllowed` keeps refusing `?venue=` in production. The production source is the published list only:
    no URL can inject a venue.
- **Owner-only first.** A server flag `STUDIO_VENUES_LIVE` (off by default) with an audience (`owner` | `everyone`).
  One small endpoint answers which published venues this account may see; the splash's place picker lists them.
  `assumption:` an endpoint read by the splash, because the place list is resolved in the browser and a
  `NEXT_PUBLIC_` flag needs a rebuild to flip.
- **A venue never changes gameplay** (the fairness rules in §3.1), enforced at publish and at load:
  - the keep-out zone: a per-target box over the playing surface and the play camera's corridor
    (`targets.ts`: `crowdView` already holds the camera line); a published venue may not put an object inside it;
  - the budget gate: a venue is publishable only when its measured phone column is under `mobileBudget.json`'s
    ceiling (the meter already measures it);
  - weather that is gameplay stays the mode's (`modeWeather`, as Football does today);
  - the competitive-context signal: `game-shell.tsx` already reads `?arena=`, `?c=` (challenge links), `?mp=` (async challenges) and
    `?signature=` (the weekly ladder). It stamps one `felCompetitive` (and the missing `felRanked`) on the scene; the Studio loader reads
    it and drops scripts, camera actions and cast frames there (§3.1).
- **More targets, one review each.** A mode joins the *full* depth only after its own fairness review (the §10.5
  pattern). Candidates by the code: the 21 spec-mounted modes. Out of scope here: the 8 hand-built-world modes (they
  need a `PlaceLook.world`-shaped export; that is a follow-on, size M) and the hoops modes' `courtLocations` system
  (held by the hoops lanes).

**Reuses.** `exportVenue.ts`, `runtime.ts` (`studioLook`, `studioPropSetKey`, `mountStudioFor`), `targets.ts`,
`placeLooks.ts` (`looksFor`, `readPlaceLook`), the splash's place picker (`components/games/boot-splash.tsx`),
`castFairness.test.ts` and `tests/helpers/tiebreakRally.ts`, the budget meter (`budget.ts`), `mobileBudget.json`.

**Definition of done (measurable).**
- With the flag off, every mode is unchanged: a test holds each target's getters and `looksFor` to what they return
  today, in production (the `courtTargets.test.ts` pattern).
- With the flag on and audience `owner`, an admin account sees the published place on the splash and plays it in a
  **production build** on the rig. Any other account sees the same list as today (the endpoint test, both roles).
- **Bit-identical play:** for each full-depth target, a scripted match with and without the published venue gives the
  same scores, judgements, HUD lines and end (the `castFairness.test.ts` method).
- A venue with an object in the keep-out zone, or a phone column over the ceiling, is refused at publish (tests, and
  one rig shot of the refusal).
- `?arena=…` (and each other competitive param) loads the look with no scripts and no camera actions (a test on the
  stamped metadata).

**Risks.**
- **Shared files.** Each target's mode file (Tiebreak, FootballRush, NetSport, precisionModes) and
  `boot-splash.tsx`, `game-shell.tsx`: feel and hoops lanes hold or touch these. Wait for them, then route the
  one-liners (LANES §3).
- A published venue that looked right in the editor and is wrong in the mode, because the mode builds its own
  furniture (Volleyball's beach, Derby's plate; NEXUS-STUDIO §13.3 limits). Proof is a rig shot per target, not the
  editor shot.
- Bundle size: each published venue adds its JSON (a typical 2-venue project is 27.9 kB raw, 4.2 kB gzipped; studio-save
  §3). Fine at tens, not at hundreds. Phase 2's server source removes it.

**Needs from the owner.** Q1 (how a publish reaches production), Q2 (add, or replace the default), Q3 (competitive
contexts). Turning the flag on.

---

### 2.2 Phase 2: owner Studio in production, and publish without a deploy (M)

**Scope.**
- **An audience on the route.** `/studio` in production keeps `NEXUS_STUDIO_ENABLED` and adds an audience:
  `owner` (roles `founder` and `admin`, the same approvers `lib/creator/creative-card-review.ts` names), later `beta`
  (phase 9) and `public`. The page gate reads the session; every write route re-checks the role from the database (the
  review board's pattern, `app/admin/review/page.tsx`).
- **Land account save.** Merge `lane/studio-save`; the owner applies its SQL in the deploy session (its §7); the
  owner reads and approves its §8 privacy text; then `STUDIO_CLOUD_SAVE_ENABLED` on. Route its one-liner into
  `NEXUS-STUDIO.md` §2.1 ("No server persistence" is stale).
- **Publish from the Studio.** A `StudioPublication` table: kind (`venue` now; `mode` and `surface` later), target,
  version, the sanitised export, status (`live` | `retired`), who published it and when. "Publish" writes a new
  version; "Unpublish" retires it; "Restore" makes an older version live. Production reads the live list (cached a
  short time) in place of, or beside, phase 1's committed files.
- **A phone-safe minimum.** On a 390 px phone the Studio shell does not overflow, and the published list, Publish,
  Unpublish and Restore are reachable. Full phone editing is phase 5.
- **AI for the owner.** The ABACUS switch is global (`lib/abacus/**`, the abacus-kill lane's). Turning it on is the
  owner's call; this phase only checks the AI builder works in production when it is on.

**Reuses.** `lib/flags.ts`, `requireAdmin` / `canApprove`, studio-save's routes and its advisory-lock store pattern
(`cloudStore.ts`), `exportVenue.ts`, phase 1's loader.

**Definition of done.**
- In production, an admin opens `/studio`; a signed-in non-admin gets the same 404 a guest gets (a route test for
  each role and for a role changed in the database after sign-in).
- The owner publishes a venue and sees it on the mode's splash **within 60 seconds, with no deploy**; Unpublish
  removes it; Restore brings back the previous version. Rig proof against the real handlers, then one owner check in
  production.
- `/studio` at 390 px: `scrollWidth` equals the viewport width.

**Risks.** A schema change (owner-applied SQL, the `public/_prisma/client` trap in `/CLAUDE.md`). Publishing from
production means a bad publish reaches players without a PR, so phase 1's publish gates (keep-out, budget, sanitiser)
must run on the server too, not only in the editor.

**Needs from the owner.** Q4 (who counts as "owner"). Approve the `StudioPublication` table and apply its SQL. Apply
studio-save's SQL, approve its privacy text, flip its switch.

---

### 2.3 Phase 3: share links (L)

**Scope.**
- **"Share to play."** From the Studio, a creator makes a link to one venue (later: one mode). The link opens the
  target mode with that venue, like a published one, but only for whoever holds the link. Storage is a server
  snapshot (immutable; a new edit is a new link), not the `?venue=b64:` inline form: an inline link can be neither
  revoked nor screened.
- **Token and revoke, as `lib/share/service.ts` already does them:** 192-bit tokens; revoking **nulls the payload**;
  an expired, revoked and never-existing link are the same 404.
- **What a link carries:** the venue export and its presentation scripts. **No look codes** (the account-save rule),
  so a shared cast shows the viewer's own look or a stock body. No creator account id; a display name only if the
  owner says so (Q6).
- **Moderation** (§3.2): every free-text field is screened at create; a report button on the share landing; a
  founder/admin takedown in the review board; rate limits per account.
- Shared play is **practice**: never ranked, staked, arena, ladder, rewards or PRQ (§3.1).

**Reuses.** `lib/share/service.ts` and its `ShareLink` pattern (a new kind, or its own table; `ShareLink` is keyed to
a coach today), `/c/<code>`'s public landing, `app/admin/review` (the queue), `app/api/party/report` and
`PartyReport` (report storage), phase 1's loader.

**Definition of done.**
- A link made by the owner opens the venue for a second account on the rig (and a guest, if Q5 says so); revoking it
  makes it 404 within the cache time.
- A venue with a blocked word in a banner, an object name or the venue name is refused at create (screen tests on a
  fixed list of cases, including false positives that must pass).
- A report reaches the review board; a takedown nulls the payload (route tests).
- A link opened with `?arena=` attached still runs as practice (test).

**Risks.** The repo has **no abuse or profanity screen**: `lib/share/screen.ts` screens medical claims, not abuse. One
is needed, and a word list alone fails (that file explains why). Arranged objects can spell or draw things no text
screen sees; the report path is the only answer to that. A new table.

**Needs from the owner.** Q5 (who opens a link), Q6 (who makes one, and whether a name shows), Q7 (moderation level).
Terms and Privacy copy (§3.5). Moderation staffing: who answers reports.

---

### 2.4 Phase 4: play-and-edit live (L)

**Scope.**
- **"Play here."** The Studio runs the real mode in its own viewport panel, from the in-memory export: no new tab, no
  localStorage hand-off. `studioVenueFor` gains an in-memory source that only the `/studio` page can set.
- **Edit while playing.** Presentation layers (look, kit, scans, fixtures, decals, crowd, weather, cast, scripts)
  hot-swap into the running mode through the same per-layer diff the editor uses (`viewport.ts`). A change the mode
  cannot take live (the mood: the rig and the post chain are built once) restarts the round and says so.
- **Pause, edit, resume.** Pause freezes the mode; the editor's cameras and gizmos take over; resume hands the camera
  back.
- **Never a real session.** An editor play posts nothing: no `/api/sessions`, no arena, no wallet, no PRQ. The
  harness's result sink is a no-op there.

**Reuses.** `ModeHarness.runMode` (or `mountMode` plus the mode's loop), `lookStack.ts`, `runtime.ts` layer mounts,
`viewport.ts` `layersFor`, `scriptHost.ts`.

**Definition of done.**
- On the rig: start a Tiebreak rally in the Studio, change a lamp's colour, and the next frame after the release shows
  it while the rally goes on (a frame capture, a rally-count probe).
- Change the mood: the round restarts on the new mood (shot).
- The network log of a 2-minute play-and-edit session has no request to `/api/sessions`, `/api/arena/*`,
  `/api/wallet*` or any score route (a rig assertion).
- A layer hot-swap leaks nothing: mesh, material and texture counts return to their pre-edit values after 20 swaps.

**Risks.** `ModeHarness.ts` belongs to movement-play (LANES §2); the session store, READY gate, watchdog and perf guard
were built for a session, not an editor (NEXUS-STUDIO §4.1 says why the editor avoided `runMode`). A mode that keeps
references to venue meshes may break on a hot swap; each target needs its own swap test. RIG-ADJACENT where a cast
re-spawns.

**Needs from the owner.** Nothing new.

---

### 2.5 Phase 5: phone editing (L)

**Scope.**
- **A phone layout.** One viewport, a bottom sheet with the tabs (Scene, Add, Inspect, AI, Scripts), and a thumb
  toolbar: undo, redo, delete, duplicate, group, hide, lock, play. Every keyboard shortcut gets a touch path.
- **Touch in the viewport.** One finger orbits, two pan and pinch, a tap selects, a long press adds to the selection;
  bigger gizmo handles on the mobile tier; snap on by default.
- **AI first on a phone.** The AI prompt is the first tab: describe a change, review the list, apply. A creator who
  never drags a gizmo can still build a venue.
- **The script editor on a phone:** pan and zoom already use pointer events; wire-dragging and the node inspector get
  touch-sized targets.
- **Budget:** the phone column is the default on a phone.

**Reuses.** `use-studio.ts` (the commands are already UI-independent), `group.ts`, `clipboard.ts`, `stamps.ts`,
`snap.ts`, the AI panel, the account panel's full-width sheet (studio-save already built one that fits).

**Definition of done.**
- At 390 × 844 on the rig, no horizontal overflow on any tab (`scrollWidth` equals 390).
- A table of every command against its touch path, held by a test: none is keyboard-only.
- A scripted touch session on the rig places a stamp, moves a group, edits a colour, undoes twice and publishes.
- The owner does the same on their own phone (the eye is the judge for feel).

**Risks.** Babylon's gizmos are mouse-first; touch may need a custom handle. Phone memory: the editor plus a mode
(phase 4) on the mobile tier must stay under the 256 MB ceiling.

**Needs from the owner.** Q8 (how much of the editor a phone gets). A real-device check.

---

### 2.6 Phase 6: a data-driven mode format, starting with Target Attack (XL)

**Scope.**
- **`StudioModeDef`**, a new kind in the project: an archetype, its parameters, a venue, presentation scripts, and
  **rule graphs**. Typed, versioned, sanitised like the rest of the document.
- **One archetype first: Target Attack** (recommended; Q9). Aim and power at targets on the precision core
  (`aimSwingCore.ts`'s PLACE archetype, which golf and penalty use), for a clock or a number of shots. The data:
  where the player stands; the targets (spot, size, points, kind: still, pop-up, or moving on a path); shots or
  seconds; what a hit is worth; combo rules; the win line. Everything clamped.
- **Rule graphs are a second vocabulary, not a looser script.** New actions (add points, spawn a target, end the
  round, show a result) exist **only** in the generic Studio mode's interpreter. Shipped modes keep the
  presentation-only host, and `interpreter.wiring.test.ts` stays as it is. A new wiring test holds that the rules
  interpreter cannot reach the wallet, sessions, arena, ladder, PRQ or rewards.
- **One generic mode and one route.** `StudioMode` is registered once (not in `ENABLED_BABYLON_MODES`) and served at
  `/play/custom/[id]`, reading a published or shared `StudioModeDef`. It reuses the harness, the look stack, the
  splash and the end card.
- **Practice only** (§3.1): no Lab Credits, XP, season pass, ladder, PRQ or stakes, unless the owner says otherwise
  (Q10).
- **The editor:** a Mode tab (archetype, parameters, targets placed in the viewport like objects, the rule graph in
  the existing node editor) and play-and-edit from phase 4.

**Reuses.** `aimSwingCore.ts`, `precisionModes.ts` (golf/penalty furniture and flight), `ModeHarness`, `scripts.ts`
and `interpreter.ts` (the graph shape, limits and sanitiser pattern), the node editor, the commands, `exportVenue.ts`,
phase 1's publish and phase 3's share.

**Definition of done.**
- The owner builds a Target Attack mode in the Studio **with no code**: a timed round, three target kinds, a combo,
  a win line. It plays start to end on the rig and shows its result card.
- **Deterministic:** a seeded scripted run gives bit-identical scores twice.
- **Untrusted:** the sanitiser drops unknown kinds, clamps every number, and refuses loops (tests with mutations, as
  every Studio round has done).
- **Fenced:** the new wiring test, and a route test that a Studio mode's end posts no session and no reward.
- A mode with nothing to do (no targets, no win line) is refused at publish with a reason.

**Risks.** Feel: a data mode will not feel like a tuned shipped mode at first. Its defaults should be copied from golf
and penalty's tuned numbers, not invented, and the owner judges them. Scope creep: every archetype is a game. Hold to
one until it ships. The generic route is a new public surface (`lib/nav/reachability.test.ts` must list it as HELD
until the owner ships it).

**Needs from the owner.** Q9 (the first archetype), Q10 (rewards for user-made modes). Terms §5 copy if user modes
must never earn (§3.5).

---

### 2.7 Phase 7: AI drafts a mode (M)

**Scope.** `POST /api/cell/mode` (or a `mode` op family on the venue route): the creator describes a mode; CELL answers
in the closed mode vocabulary (archetype, parameters, targets, rule graphs, plus the venue ops it already has); the
panel shows a review list; **Apply is one command**; "explain this mode" summarises. The same gates in the same order
as the venue route. The prompt carries the description and the mode's data, never the account, characters, look codes,
age or health data.

**Reuses.** `aiEdits.ts` (vocabulary, double sanitising, name resolution in the browser), `ai-venue-panel.tsx`, the
venue route's gates, `aiAccess.ts`, phase 6's sanitiser.

**Definition of done.**
- Ten fixed descriptions, run against the real model: at least 8 give a draft the sanitiser accepts **and** that a
  scripted bot can play to the end. The owner plays the 10 and judges them.
- Each applied draft is one undo step (test), and the request bodies carry nothing beyond the description and the mode
  data (route test and a rig capture, as round 4 did).

**Risks.** Model quality varies; a draft can be valid and dull. The vocabulary must stay closed: no free code, ever.

**Needs from the owner.** Privacy §1, §2 and §3 copy naming the mode requests (§3.5).

---

### 2.8 Phase 8: Studio edits app surfaces (M)

**Scope.** A `surface` publication (phase 2's table): the families' order and their modes' order, a featured tile,
tile art (a photo-mode shot of a Studio venue), the venues page's order. `/play` and `/venues` read the live
publication and fall back to the code constants. **Cannot be edited from the Studio:** legal links, age gates, the
store's price rules, and any mode's reachability (an unshipped mode stays unlinked; `lib/nav/reachability.test.ts`
still decides).

**Reuses.** `lib/nav/families.ts`, `lib/game-data.ts` (`MODE_INFO`, `VENUES`), `components/shell/{play-shelf,venue-strip,venue-shelf}`, the Closet Studio's photo mode for tile art, phase 2's publish.

**Definition of done.** With nothing published, `/play` renders exactly what it does today (a snapshot test). The owner
reorders a family and features a tile in the Studio; `/play` shows it within 60 seconds with no deploy. A publication
naming an unlisted mode is refused (test).

**Risks.** The shell components belong to other lanes. Tile names are product copy, not legal copy, but a renamed mode
can drift from its route and its store listing: names stay code in this phase.

**Needs from the owner.** Nothing beyond Q2's answer (whether a publish can replace a default). This phase can run in
parallel with 3–7 once phase 2 lands.

---

### 2.9 Phase 9: creator beta (M)

**Scope.** Audience `beta`: an invite list (Q4) on top of the age line. Quotas already exist (save caps, AI 6/min and
120/day); add per-creator share-link and publish limits. An onboarding card in the Studio. A weekly moderation report
for the owner (links made, reports, takedowns). Creators publish only to share links, never to the shipped game.

**Definition of done.** Invited accounts open `/studio`; others get a 404. A drill: a test report is made and taken down
inside the agreed time. The weekly numbers come from the database, not by hand.

**Risks.** Moderation load. Teens in the beta (the age rules in §3.4).

**Needs from the owner.** Who is invited; who moderates; the Terms and community-guidelines copy (§3.5).

---

### 2.10 Phase 10: marketplace (XL)

**Scope.** Studio projects (venues and modes) as listings, reusing `MarketplaceListing` with a new manifest kind
beside CELL cartridges. **Everything listed needs approval** (the creative cards' rule: "everything public needs
approval"). Minors never sell. Remixing and royalties follow the creative-card pattern. Payouts through the existing
payout gates.

**Definition of done.** An approved Studio listing can be bought and played; an unapproved one is invisible; a minor's
listing cannot be created (tests on each rule); the owner signs off the store-terms text.

**Risks.** Legal (sales, refunds, IP, payouts). Fraud and farming. This is the heaviest legal phase.

**Needs from the owner.** Store terms, payouts, an IP takedown process (none in the Terms today), Q11.

---

### 2.11 Order, parallel work and the lanes

- **Waits for the feel lanes:** phases 1, 4 and 6 touch mode files (Tiebreak, FootballRush, NetSport,
  precisionModes), `ModeHarness.ts`, `boot-splash.tsx` and `game-shell.tsx`, which the hoops, feel and movement lanes
  hold or edit. They start after those lanes land, and route their shared lines (LANES §3).
- **Can start any time after the feel lanes, independently:** phase 2 (route gate and publish table), phase 5 (the
  Studio's own components).
- **Parallel after phase 2:** phase 8.
- **Strict chain:** 6 → 7; 3 → 9 → 10.

---

## 3. Fairness and safety rules

### 3.1 Fairness: what user-made content may never touch

| Context | Studio venue (look) | Studio venue (scripts, camera actions, cast frame) | User-made rules (phase 6) |
|---|---|---|---|
| Ranked, staked (competition), arena, ladder, signature, challenge | **Owner-published only** (recommendation; Q3) | **Never** | **Never** |
| Async challenges (`?mp=`) and live party play | Owner-published only | Never | Never |
| Normal play | Owner-published | Allowed (presentation only, already proven) | Only in the generic Studio mode |
| Share link | The shared venue | Allowed | Practice only |
| The editor | Anything | Anything | Practice only, nothing posted |

The rules behind the table:
- **A venue never changes gameplay.** The spec's gameplay props (nets, rims, goals) are not editable (NEXUS-STUDIO §2);
  weather that is gameplay stays the mode's; objects stay out of the keep-out zone; a venue must pass the phone
  budget, because dropped frames are input lag; a cast frame is visual only and only where a review measured it
  (§10.5). Each new full-depth target needs its own bit-identical run test.
- **User-made rules never run in ranked, staked or arena play**, and never earn (Q10). The generic Studio mode posts no
  session, and a wiring test holds that its interpreter cannot import the wallet, sessions, arena, ladder or PRQ.
- **One signal, stamped once.** `game-shell.tsx` decides the context; the harness stamps it on the scene
  (`felCompetitive`, and the `felRanked` that `playFrame.ts` already reads and nothing sets); every Studio gate reads
  that one stamp.
- **Readability** (`assumption:` not yet measured): in a competitive context, fog density and darkness are capped so the
  ball, rim and targets stay readable. The cap is measured per target (the ball's contrast against the venue), not
  guessed.

### 3.2 Moderation for share links (what is needed)

| Need | Today | To build |
|---|---|---|
| Text screen for abuse (venue names, object names, banner text, character names, stamp names, mode names) | None. `lib/share/screen.ts` screens medical claims, not abuse | A screen at create and at publish, server-side. Not a bare word list (that file explains why a list fails) |
| Report | `PartyReport` (party chat), the creative-card flag | A report button on the share landing; reports stored with the token, not the content |
| Review and takedown | `app/admin/review` (creative cards: founder and admin approve, mods flag) | Studio items in the same board; takedown nulls the payload (`lib/share/service.ts`'s revoke) |
| Who creates | Creative cards: teens create but keep private | Per Q6 |
| Limits | AI and save rate limits | Per-account limits on links made and links live |
| Approval before listing | Creative cards: "everything public needs approval" | Required for anything listed (marketplace, featured); not for an unlisted link (Q7) |
| Audit | None for Studio | Who made, opened (counts only), reported and took down a link |

### 3.3 Privacy: what is stored and what the AI sees

| Data | Stored where | Who sees it | The AI sees it? |
|---|---|---|---|
| The working project | The device (`localStorage`) | The device | No |
| An account copy (studio-save) | `StudioProjectSave`, **look codes stripped** | The account only | No |
| A published venue, mode or surface | Phase 1: the repo; phase 2: `StudioPublication` | Every player (it is the game) | No |
| A share link | A server snapshot, no look codes, no account id | Whoever holds the link | No |
| A report | The report table: the reporter's account and the token | Founder, admin, mods | No |
| An AI request | Not stored (the route keeps no prompt today) | Abacus / the model provider | **The typed request plus the venue or mode data only.** Never the account, age, birth year, characters, look codes or health data (held by the route tests since round 4) |

Rules: a look code (height, build, face numbers) never leaves the device in an account copy, a share link or a
publication. A minor's looks stay device-only (`TEEN_DEVICE_LOOK_EVERYWHERE`). Logs carry event names and error
classes, never content or user ids (the studio-save rule).

### 3.4 Age gates

| Feature | Rule today | Proposed |
|---|---|---|
| The AI builder | 13+, by `aiAccess.ts` (a year gap of 13 is refused: may be 12) | Unchanged; the mode drafts (phase 7) use the same line |
| Studio save to the account | 13+, built and **held** (studio-save, not merged) | Unchanged |
| `/studio` itself | Every signed-in account when the flag is on (accounts are 13+ by Terms §2) | Owner roles only (phase 2); beta by invite (phase 9) |
| Making a share link | n/a | Recommendation: verified adults (the strict 18+ rule `isPublicCreator` uses); teens create but keep private (Q6) |
| Opening a share link | n/a | Q5 |
| Selling (marketplace) | Store purchases are 18+ (Terms §2) | Adults only; never minors |

### 3.5 Where legal or policy copy would need owner-approved changes (not edited here)

| File | Section | Why | Phase |
|---|---|---|---|
| `lib/policies.ts` Privacy | §1 Data We Collect | Saved projects (studio-save §8, text already written); share-link snapshots; reports; AI mode requests | 2, 3, 7 |
| `lib/policies.ts` Privacy | §2 How We Use Your Data | Share links shown to others; mode drafts sent to an AI model | 3, 7 |
| `lib/policies.ts` Privacy | §3 AI-Generated Content | AI-drafted modes are AI-generated content | 7 |
| `lib/policies.ts` Privacy | §4 Data Retention & Deletion | How long a link and a report are kept; revoke and takedown | 3 |
| `lib/policies.ts` Terms | §2 Account & Eligibility | Age lines for making and opening links, beta access, selling | 3, 9, 10 |
| `lib/policies.ts` Terms | §4 User Content | Today: "a non-exclusive license to display it within the Service". Sharing to people outside the creator's own account, remixing and selling need wider wording | 3, 10 |
| `lib/policies.ts` Terms | §5 Prohibited Conduct | Rules for user content (hate, sexual content, impersonation, IP), and farming through user-made modes | 3, 6 |
| `lib/policies.ts` Terms | §6 Termination | Taking down content and suspending creators | 3 |
| `lib/policies.ts` | `CURRENT_POLICY_VERSION` and `lib/policies.test.ts` fingerprints | Every change above bumps the version | each |
| `app/store-terms/page.tsx` | Store terms | Creator sales, refunds, payouts | 10 |
| (none exists) | Community guidelines | Needed before strangers see each other's content | 3 or 9 |
| (none exists) | An IP / copyright takedown process | No DMCA-style clause in the Terms or store terms (grep) | 3, 10 |
| `components/ai-disclosure.tsx` | The AI label | Reused on AI-drafted modes; check the wording fits | 7 |
| In-product copy | Share landing, report form, refusal lines | Product copy, but it states policy; neutral age copy as the AI builder does | 3 |

---

## 4. Owner questions

Only the decisions that change the plan. The recommendation is listed first in each.

**Q1. How does a published venue reach production?**
- **(A) Both, in order (recommended):** phase 1 ships committed JSON files (no schema, every publish is a reviewed PR);
  phase 2 adds Publish from the Studio to a server table (live in a minute, no deploy, versioned with Restore).
- (B) Committed files only: every change is a PR and a deploy.
- (C) Server table only: phase 1 waits for the schema change.

**Q2. What does a published venue do to a mode's places?**
- **(A) It can become the mode's default place, with the shipped one kept as a pick and a one-tap Restore
  (recommended).** This is "restyle the real game".
- (B) It only adds extra places; the shipped default never changes.
- (C) It replaces the shipped place with no fallback.

**Q3. Studio venues in ranked, staked and arena play?**
- **(A) The look of owner-published venues only. No scripts, camera actions or cast frames; user-made content never
  (recommended).**
- (B) Always the shipped default place there.
- (C) The same as normal play.

**Q4. Who counts as "owner" for `/studio` in production, and how is the beta invited?**
- **(A) Roles `founder` and `admin` (the review board's approvers); the beta is an invite list the owner keeps
  (recommended).**
- (B) A new role `creator` for everyone with access.
- (C) An email allowlist in an environment variable.

**Q5. Who can open a share link?**
- **(A) Signed-in players (age-screened accounts) (recommended).**
- (B) Anyone, guests included, like `/c/<code>` challenge links.
- (C) Only accounts the creator invites.

**Q6. Who can make a share link, and does the creator's name show?**
- **(A) The owner and verified adults (18+, strict); teens create but keep private, as creative cards do; the creator's
  display name shows (recommended).**
- (B) 13+, with a name.
- (C) The owner only, until the beta.

**Q7. How much moderation before a link opens?**
- **(A) An automated text screen at create, a report button, founder/admin takedown. Links are unlisted and open at
  once. Anything listed publicly needs approval first (recommended).**
- (B) Every link is reviewed before it opens.
- (C) Reports only.

**Q8. How much of the editor does a phone get?**
- **(A) The whole editor, built AI-first: the prompt and the inspector first, then touch gizmos (recommended).**
- (B) The AI prompt, the inspector and play; placement and scripts stay on desktop.
- (C) Desktop only for now.

**Q9. The first data-driven mode type?**
- **(A) Target Attack: aim and power at targets, on the golf/penalty core (recommended).** The core and its tuned feel
  exist, and targets are easy to place in the viewport.
- (B) Score Rush: a timed tap-and-react mode on the timing core (unregistered today).
- (C) Collect Run: move around the venue collecting items, on FreeRun's traversal (heavier: physics and a level).

**Q10. Do user-made modes earn anything?**
- **(A) No: practice only. No Lab Credits, XP, season pass, ladder, PRQ or stakes (recommended).** This closes the
  farming route Terms §5 forbids.
- (B) Small, capped XP only.
- (C) The same as shipped modes.

**Q11. CELL's HTML game builder, once Nexus drafts modes?**
- **(A) Keep it as a separate prototype tool; Nexus modes come from the data format; the marketplace sells Studio
  projects first (recommended).**
- (B) Retire it from `/studio` once phase 7 ships.
- (C) Keep both as equal paths, including in the marketplace.

---

## 5. Not decided here, and why

- **The hand-built-world modes** (skate, snowboard, surf, sprint, freerun, big air, Aero Aces, Velocity Kart). They
  need a world-shaped export (`PlaceLook.world`). That is a follow-on to phase 1 (size M), after the feel lanes.
- **Hoops places** (`courtLocations.ts`). That system belongs to the hoops lanes. It joins after they land, through
  the same publish path.
- **The rival casting slot.** This is still an owner call from round 4 (NEXUS-STUDIO §12.2), and it is not on this
  path.
