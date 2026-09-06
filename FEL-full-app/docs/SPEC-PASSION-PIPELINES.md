# Passion pipelines → Creator Cards — the map (owner ask 2026-09-06)

Elijah: "Build out the other passion pipelines for the creator cards. Make sure people can really cook up and make songs in
a music engineering game/room/platform. Be able to remix things. Make Who Scene It an actual mode and a pipeline into
the creator cards. It needs to be a tool for coaches to coach online, similar to the TrueCoach training platform, but for
skill and towards what you want to be. Help me map that out." Plus the reel of a producer chopping a theme song on an
AKAI pad: "this inspired me a bit for that musical creation room."

## Owner decisions (2026-09-06, multiple choice)

| Question | Decision |
|---|---|
| Which lane first | **Coach platform**, then Music Room, then Who Scene It, then the new disciplines |
| Who can coach | **Credentialed only** — a coach holds a Facilitator Card (passed the Camp curriculum assessments) |
| How passion work becomes cards | **New first-class disciplines on `CreativeCard`**: `scene`, `cooking`, `fashion` (later `writing`), each with its own payload, review rule and royalty |
| Music Room v1 | **Arrangement + vocals + stems** on the existing groovebox and mastering, with a remix graph and royalties |

Standing constraints carried in: Studio PARK (no Publish/Fix/Gemini), no push, no mural GLBs, no new dependency without
asking, tests green + count per commit, sign-off on physics/rig/shared Profile, IP rule (original content; public-domain
sources only for anything "sampled"), UGC audio enters `pending_review` before public listing (`NEEDS_REVIEW`).

## The idea in one line

Every passion in FEL runs the same loop the sports do — **do the thing → it becomes a card → the card is remixable and
earns** — and the Coach platform is the layer that turns "do the thing" into a coached plan toward what you want to be.
The card system (`CreativeCard`: discipline, payload, stats, rarity, `remixOf`, review state, publish faucet, remix royalty)
is the spine; each lane is a room that produces a payload for it.

```
  room (make)  ──►  payload  ──►  CreativeCard  ──►  browse / remix (royalty) / equip in play
  Coach platform: goal → plan → sessions → check-ins → deltas → Facilitator Card credential, Creator Card for the mentee
```

## What already exists (measured in the repo, 2026-09-06)

| Lane | On disk | State |
|---|---|---|
| Creator cards | `lib/creator/creative-card-types.ts` (5 disciplines: sport, music, art, dance, acting; payload union; `remixOf`; review), `creative-card-service.ts` (create, browse, review, slots, publish faucet 50, remix royalty 25), `components/creator/*` (hub, editor, share, my-creations, 4 mode components), Prisma `CreativeCard`, `CardSlot`, `CreatorCard` (athlete identity card) | live, proven on the dev DB (pass 5) |
| Music | `lib/babylon/music/` — `StudioMode.tsx` (FEL Music Academy: multi-track groovebox, unlockable kits, one-tap mastering, remix-with-attribution, song pages, LISTEN tab), `AudioEngine.ts` (lookahead sequencer, `masterPolish`, `renderMixdown` → WAV), `StudioLibrary.ts` (localStorage, SYNC seams), `SynthKit`, `StreamingBridge`; `components/creator/modes/music-mode.tsx` (16-step build + perform) | live; no song structure, no recording, no chopping, no stems export beyond the mixdown |
| Who Scene It | `components/games/who-scene-it-game.tsx` (2D rapid-fire deck over `QuizCore`, original-content bank, Free-Use Legends shard bank), `lib/babylon/core/QuizCore.ts`, `lib/babylon/content/quizPacks.ts` (**live-venue** pack: identify the rendered FEL venue — `sceneVenueId` keys `VENUE_SPECS`), venue spec `who_scene_it` | live as a deck; the live-venue mode is scaffolded content, not a mounted mode; "no depth pass" (VISION_AUDIT row 17) |
| Coach / Camp | `app/coach/*` (Coach chat, Exercise catalogue, Form Check video), `app/api/coach/*`, Prisma `ProgramExercise`, `CoachingProgram` → `Block` → `Session` → `SessionExercise`, `ClientSession`, `ExerciseLog` (sets/reps/load/RPE/notes); Camp: `FacilitatorProfile` (certificationStatus, facilitatorCardId), `Credential`, `GoalPlan` (goal → milestones → lock → activate, pathway map), `CampSession` (deltas, resiliency), `CampTemplate` (export/import/fork), `GuardianConsent`; `docs/CAMP-BLUEPRINT.md` (the 8-week thesis), `docs/GAP-REPORT-CAMP-BLUEPRINT.md` | models and screens exist; the **client-side loop** (assigned program on the phone, check-in, coach review, messaging, progress) is the gap |
| Other passions | Kitchens (`/kitchens`, Fuel floor, grocery list), Closet (wearables, kits, Meshy garments), Story | live rooms, no card payloads |

## Lane 1 — Coach platform ("TrueCoach for skill, toward what you want to be")

TrueCoach's loop, translated: a coach builds a program, the client sees today's session on their phone, logs it (and can
attach a video), the coach reviews with a comment, progress charts accumulate, messaging sits alongside. FEL's twist is the
Camp thesis: the program is a **Movement Track** (short loop) bridged weekly to a **Career Track** (long loop), and both
tracks write to the mentee's Shared Profile and cards.

### Roles and gate
- **Coach** = a user whose `FacilitatorProfile.certificationStatus === 'certified'` (owner decision). The Facilitator Card
  (`CreatorCard.kind = 'facilitator'`, GAP-REPORT G2 line) is the public credential and the coach's storefront.
- **Client / mentee** = any user; minors need `GuardianConsent` accepted before a coach can see their data (exists).
- Coach ↔ client link = `GoalPlan` (facilitator ↔ mentee) — no new relation.

### The loop (phases)
| Phase | Deliverable | Builds on |
|---|---|---|
| C1 Program builder | Coach authors a `CoachingProgram` from a `CampTemplate` or blank: blocks (weeks/milestones with `targetDate`), sessions, exercises with sets/reps/load/tempo/rest and a per-client cue. Drag order. Assign to a `GoalPlan`. | models exist; `app/coach` gets a **Clients** tab and a **Program** tab |
| C2 Client "Today" | `/coach/me` (client view): today's session card, tap-through exercise logging (`ExerciseLog`: actual sets/reps/load/RPE/note), optional video attach (Form Check already accepts video), "done" → `ClientSession.completedAt`. In-app on the phone pad chrome. | `ClientSession`, `ExerciseLog`, Form Check |
| C3 Coach review + messaging | Coach inbox: completed sessions with logs and video; leave a comment per exercise (`SessionExercise.coachNote` history → new `CoachComment`), thread messaging per plan (reuse `CellMessage`-style table or new `PlanMessage`). Push on new log / comment. | Coach chat exists (AI) — this is human-to-human |
| C4 Progress and deltas | Charts per exercise (load/reps/RPE over time), the Camp's System Scan delta (`WorkoutScan` history), PRQ delta, resiliency (attempts/retries from `GameSession`), all on the Shared Profile. Weekly **Bridge** prompt shown to both sides (the 10-minute transfer talk). | `CampSession` deltas, `PrqEntry`, `WorkoutScan` |
| C5 Skill sessions, not just lifts | A session exercise can be a **FEL mode challenge** (e.g. "10 free throws in ones", "land 3 clean ollies") — the log is the `GameSession`/`ChallengeLink` result, auto-filled. This is the "for skill" part: the same program grammar covers gym work and in-game reps. | `ChallengeLink` (async best-score), `ModeMastery` |
| C6 Career Track | The `GoalPlan.pathwayMap` (six fields) gets a weekly 1-session ritual: a prompt, a written output, a facilitator note; milestones on the same timeline as the movement blocks. | exists as data; needs the screen |
| C7 Templates and marketplace | Coaches publish program templates (fork/uses exist); a template can be listed on the Marketplace for coins. Payouts via the existing Stripe `PayoutRequest` — **later**, after the friend test. | `CampTemplate`, `MarketplaceListing` |
| C8 Cards | Completing a program mints a **mentee Creator Card update** (rarity from PRQ/wins) and credits the coach's Facilitator Card (clients coached, deltas). | `deriveRarity`, `CreatorCard` |

### Landed (2026-09-06, lane 1 C1–C3)
- `lib/coach/loop.ts` (pure: ordered sessions, today, roles, log/prescription/message validation, progress series,
  needs-review) + 9 tests; `lib/coach/server.ts` (tree read, certified-coach gate).
- Routes: `GET /api/coach/programs` (my programs as trees, roles, completion, plan), `POST /api/coach/programs/:id/exercises`
  (builder add/update/remove — coach + certified), `GET /api/coach/me/today`, `POST /api/coach/me/log` (upsert logs, video
  link, complete), `GET /api/coach/inbox`, `POST /api/coach/review`, `GET|POST /api/coach/messages`.
- Schema: `ProgramMessage` (coach ↔ client thread per program); `ExerciseLog.videoUrl / coachComment / coachCommentAt`.
  Applied with `prisma db push` + `generate` + server restart on the dev DB.
- UI: `/coach` gains **Today** (client: session card, tap-through logging, video link, Done, coach comments, thread) and
  **Clients** (certified coach: inbox with logs/videos and per-rep comments, programs with the builder, thread).
- Dev seed `scripts/coach/seed-loop.ts` (certified coach@fel.local, client@fel.local, 2 blocks × 2 sessions × 2
  prescriptions, active plan) and the end-to-end smoke `scripts/probes/_coach-loop-smoke.mts`: 9/9 PASS — Today → log +
  complete (video on the first log) → inbox (needsReview 1) → comment → thread both ways → Today advances with the
  coach's comment surfaced → client refused at the builder (403) → coach add/remove a prescription.

### Acceptance (lane 1)
- A certified coach builds a 4-week program from a template, assigns it, the client logs 3 sessions on the phone with one
  video, the coach comments, the progress chart shows the delta, the Bridge prompt appeared each week. All on the dev DB.
- Gate 0 rules untouched; no new dependency; tests: program builder (pure), logging API, review API, template fork.

## Lane 2 — Music Room ("cook up and make songs, remix")

The Academy already has the groovebox, kits, mastering, library and remix-with-attribution. v1 adds the three things the
owner named plus the reel's workflow.

| Phase | Deliverable |
|---|---|
| M1 **The Flip (chop pad)** | A 4×4 pad grid on the phone controller (the pad chrome IS the MPK). Load a **source** → auto-slice on transients or by grid → each slice on a pad → play/record a pattern into the sequencer. Pitch/reverse/gate per pad. Sources: FEL's own stem library, **public-domain recordings** (Free-Use Legends model — a documented "why it is free to use" per entry, the same audit rule as `sceneit-freeuse.ts`), and the player's own recordings. No third-party catalogue audio, ever. |
| M2 Arrangement | Song sections (intro / verse / hook / bridge / outro) as pattern chains with per-section mute/fill; a timeline over the groovebox; bar-length export. |
| M3 Vocals and recording | Record a take over the beat (mic permission, monitoring, punch-in), auto-align to the grid, simple comp; a recorded take is UGC audio → `pending_review`. |
| M4 Stems and mixdown | `renderMixdown` per track → stems (`stemUrls` on the music payload already exists), plus the master; cover art from the Art room. |
| M5 Remix graph | "Remix this" opens the parent's sequencer + stems (exists: `StudioLibrary.beginRemix`) → the child card sets `remixOf`; royalty 25 coins to the parent (exists). Show the family tree on the song page. |
| M6 Perform | The existing rhythm-perform layer over your own song, scored, as a mode ("Music Perform") so a song can be *played* in the arcade. |
| M7 Sync seams | `StudioLibrary` off localStorage onto the API (the seams are marked); review queue for takes. |

Acceptance: chop a public-domain source into 8 pads on the phone, record a 2-bar pattern, arrange a 16-bar song, sing a
take, export stems + master, publish (pending review), a friend remixes it and the royalty posts. Latency under the
lookahead scheduler's 100 ms window; no new dependency (Web Audio only).

### Landed (2026-09-06, lane 2 M1 — the Flip)
- `lib/babylon/music/Flip.ts` (pure, 7 tests): transient slicing on an RMS envelope with a slow floor, a minimum gap and
  a grid fallback; grid slices; 16 pads with pitch/reverse/gate; the `1234 / qwer / asdf / zxcv` key map; tap quantization;
  the source rule as code — `SourceKind = 'fel' | 'own' | 'public-domain'` with a written note per source, and `FEL_SOURCES`
  = the eight 808 kit stems in `public/audio/kits/808`. Third-party audio has no path in.
- `FlipPad.tsx`: FEL stems, your own file, or an 8 s mic take → slices onto the pads; touch or keyboard plays; pitch
  ±12, reverse, gate per pad; SEND TO TRACK puts a pad on a groovebox track (`flip_<n>`); ARM REC writes live taps into
  the running pattern at the step under the playhead. The Academy (`/play/music`) gains a FLIP tab; flip tracks show in the
  STUDIO grid as `FLIP n`. The Creator hub's Music tile now points at `/play/music` (it pointed at the code studio).
- Probe `scripts/probes/_flip-diag.mts`: stem → 8 slices, key `1` → pad 1 played, touch → pad 2 played, GRID reslices, no
  page errors. Phone-pad face buttons over the key bridge: next (M1b).

## Lane 3 — Who Scene It as a mode + Scene Packs

Today: a 2D deck. The live-venue pack already exists in content. The mode:

| Phase | Deliverable |
|---|---|
| W1 Live mode | Mount `who_scene_it` as a Babylon mode: the venue from `sceneVenueId` is built behind the card (fog-in, a camera sweep), QuizCore runs the round, the pad answers A/B/X/Y, an opponent answers alongside (roster body). Depth pass on feel numbers (`TUNE(elijah)`). |
| W2 Scene Packs (cards) | New discipline **`scene`**: payload `{ kind: 'scene'; venueId; cameraPath; questions[]; freeUse?: boolean }`. Players author a pack in a Scene editor (pick venue, frame the shot, write 4-option questions from FEL's world). Original-content screen enforced server-side (the retrofit tests' IP screen). Publish → card; playing a friend's pack = a round of the mode; remix = fork the pack (royalty). |
| W3 Free-Use Legends | Keep the public-domain identification bank as the shard-earning bonus round; packs may include free-use entries with the documented rationale field. |
| W4 Ladder | Pack leaderboards; a pack's plays feed its creator's card rarity. |

## Lane 4 — New disciplines (the other passion pipelines)

| Discipline | Room that makes it | Payload | Review | Equip / use in play |
|---|---|---|---|---|
| `cooking` | Kitchens (exists) | `{ recipe: steps[], ingredients[], photoUrl, fuelTags }` | text/photo — light screen | Fuel floor lists it; a recipe card can be a coach's nutrition assignment |
| `fashion` | Closet (exists) | `{ lookId, wearableIds[], palette, photoUrl }` | none (owned wearables only) | equip the look; sells as a Marketplace listing |
| `scene` | Who Scene It editor (W2) | above | original-content screen | play as a round |
| `writing` (later) | Story | `{ storyNodeId?, text, cover }` | text screen | reads in Story |

Mechanics shared by all: `NEEDS_REVIEW` extended per discipline; `FREE_CARD_SLOTS` unchanged; remix royalty unchanged;
`Discipline` union extended and every `switch` over it made exhaustive (tests).

### Landed (2026-09-06, lane 4)
- `Discipline` = nine (`scene`, `cooking`, `fashion`, `writing` added); `DISCIPLINE_META` drives the create hub; `NEEDS_REVIEW`
  adds `scene` (original-content screen) and `writing` (text screen); `validateArtPayload` (pure, 6 tests) checks every
  payload's fields, URL schemes and list bounds — the service calls it after the kind check and refuses unknown disciplines;
  a fashion card may only carry wearables the owner holds (server re-check against `OwnedWearable`).
- Authoring modes in `/create`: Scene (FEL venue + camera sweep + 1–8 four-option questions), Cooking (ingredients, steps,
  fuel tags, photo link), Fashion (owned pieces from the closet, palette, photo link), Writing (20–4000 chars, cover link).
  `/creator` hub shows nine tiles; My Creations summarises the new kinds. No schema change (`primary` is a string).
- Smoke `scripts/probes/_disciplines-smoke.mts`: 6/6 PASS on the dev DB (cooking approved+public, scene → review, bad
  fashion palette 422, unknown discipline 422, browse by cooking, mine lists both).

## Lane 5 — The Creator Card as a scouting profile (owner, 2026-09-06 evening)

"Put your stats and your highlights on your creator card, so people can share theirs — coaches their clients', friend to
friend. It could be used as a scouting platform."

| Phase | Deliverable | Builds on |
|---|---|---|
| S1 Stats on the card | The public card (`/c/<code>`, `CreatorCard`) shows the athlete's **PRQ** (the eight stats), mode mastery, best scores per mode, season/ladder rank, resiliency, and the Movement Signature delta — read from `PrqEntry`, `ModeMastery`, `LadderEntry`, `WorkoutScan`. The owner picks which blocks are public (a per-card visibility mask). | card page exists, models exist |
| S2 Highlights | A **highlight reel** on the card: pinned replays (the dunk `DunkReplayRecorder` clips, contest results with score cards, `SignatureAttempt`s), up to 6, ordered by the owner; a mode's "pin this" after a PB. Video/GIF export of a replay for off-platform sharing later. | `highlightReelUrl` already on the sport payload |
| S3 Share | The existing mint/share link (`/c/<code>`, `card-share.tsx`) gains: a coach's **client roster** (every mentee's card in one view, with deltas), friend-to-friend sending (inbox), and an OG image so the link previews as a card. | `ChallengeLink`, share components |
| S4 Scouting | Search/filter public cards by sport, PRQ range, age band (with consent rules for minors), location tag; a **scout view** for a certified coach (side-by-side cards, notes). Minors: only with guardian consent and never searchable by default. | `GuardianConsent`, `FacilitatorProfile` |
| S5 Verification | Stats are **verified** when they come from played sessions (server-authoritative scores); self-entered numbers are marked. A coach can attest a client's stat (the Facilitator Card signs it). | `GameSession`, `PrqEntry` |

Order: S1 → S2 → S3 right after lane 1 C1–C3 (it is what makes the coach's roster meaningful); S4–S5 after the friend test.

### Landed (2026-09-06, lane 5 S1–S3)
- `lib/creator/card-stats.ts` (pure: visibility mask, mastery labels, highlight candidates = one PB per mode → wins →
  signature attempts, own-only pins ≤ 6 with clamped labels, records per mode, masked wire shape) + 6 tests;
  `card-stats-server.ts` composes the blocks from the Shared Profile read-model + `ModeMastery` + `LadderEntry`.
- Schema: `CreatorCard.showStats Json?` (mask) and `highlights Json?` (pins), `prisma db push`.
- Routes: `POST /api/v1/card` accepts `showStats` + `highlights` (pins validated against the caller's own candidates);
  `GET /api/v1/card/highlights` (candidates); `GET /api/v1/card/:slug` returns `stats` (masked) + `highlights`;
  `GET /api/coach/roster` (every client with card link, PRQ, deltas since the program began, sessions, resiliency).
- UI: the card renders PRQ bars (verified shield), mastery chips, records, ladder best, resiliency, movement delta and
  pinned highlights; the editor gets "What your card shows" toggles and a pin picker; the coach's Clients tab gets a
  Roster block; `/card/[slug]/opengraph-image` renders the card as the link preview (next/og — Satori needs single text
  children per node, measured).
- Smoke `scripts/probes/_card-stats-smoke.mts`: 7/7 PASS on the dev DB (mask saved with unknown keys dropped, stolen pin
  dropped, public stats masked, OG 200 image/png, card page renders the PRQ block, roster links the card).

## Order and first slice

1. **Lane 1 C1–C3** (program builder, client Today, coach review + messaging) — the coaching loop closes end to end.
2. **Lane 5 S1–S3** — stats and highlights on the card, coach roster, share (the scouting profile).
3. Lane 4 schema extension (`Discipline` + payloads + review rule) — small, mechanical, unblocks lanes 2–3's publish.
3. **Lane 2 M1** the Flip on the pad (the reel), then M2–M5.
4. **Lane 3 W1–W2**.
5. C4–C8, M6–M7, W3–W4.

Each slice: spec line here → tests → commit with the gate line → gauntlet at the boundary. Risk levels: schema changes
medium (migration, sign-off on shared Profile fields); everything else low.

## Out of scope / holds
Studio (PARK), Publish, push, mural GLBs, payouts before the friend test, third-party audio or scenes of any kind, minors
without guardian consent, finger IK / hands.
