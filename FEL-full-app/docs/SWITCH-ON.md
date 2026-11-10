# Switch on: every switch that is off, why, and what turns it on

**Owner, 2026-11-10:** "anything that's turned off because it needs to be improved, let's improve it and turn it on."
Lane `lane/switch-on`. Read on `lane/finish-release` at `d394b11b`.

Each switch is in exactly one class:

- **A. Off because it is not good enough yet.** This lane improves it to a written, measured gate and then turns it on.
  Every off value still restores the old behaviour exactly, with a test.
- **B. Off for a reason that is not quality.** Money or payments going live, legal or policy text, age or consent rules, an
  account or key the owner must create, a pending SQL table (`docs/PENDING-SQL.md`), a production environment variable, or
  an explicit owner decision. Listed with what turns it on and who does it. **Not flipped here.**
- **C. Not really off.** 0 is the newer behaviour, an A/B kept to compare, or a developer tool. Listed only.

Where I looked: every feel knob in `lib/feel-panel/knobs.ts` whose default is 0; every `process.env.*ENABLED*`,
`NEXT_PUBLIC_*` and `lib/flags.ts` switch, and `.env.example`; every code constant `X_ENABLED / X_ON / X_LIVE / X_READY /
X_BUILT = false | 0`; every "coming soon" / "opens soon" gate in `app/`, `components/`, `lib/`. Why each is off comes from the
comment at the line, `docs/`, `docs/OWNER-DECISIONS.md`, and the git log of the commit that made it off.

---

## 1. Class A, this lane's (in order of how many players see it)

| # | Switch | What it does | Why it is off | Status |
|---|---|---|---|---|
| A1 | `anim.inertial` (feel knob, `lib/babylon/anim/inertialize.ts ANIM_INERTIAL_ON`) | A clip change cuts to the new clip at once and the old pose's difference decays out (Holden inertialization), instead of a linear crossfade. Wired on karate, karate VS, showdown, mixed combat, football, skateboard, derby, dunk, 1v1, 3v3. | AF-1 (2026-10-28) landed it off to A/B it; gameplay-clean recommends it for the fighters' strike-onset pops (`docs/GAMEPLAY-CLEAN-AUDIT.md` §4g item 1, §6 item 6). Never measured on. | See §6 |
| A2 | `anim.holdLast` (feel knob, `lib/babylon/anim/basketballTree.ts ANIM_HOLD_LAST_ON`) | The jumpshot holds its last frame while the shot state lasts, instead of wrapping (the wrap jumped 173°). | AF-11 (2026-10-29) landed it off to A/B it. | See §6 |
| A3 | `NEXT_PUBLIC_WEBGPU` (`lib/babylon/core/createEngine.ts`) | WebGPU engine instead of WebGL2. | `TintMaterialPlugin` injects GLSL only, so every tinted avatar breaks under WebGPU. | Not attempted: the fix is a WGSL port of the tint plugin, and this machine has no WebGPU adapter to measure it on (software GL only). It is also a build-time variable (the owner's). Floor: unmeasured. |
| A4 | `NEXT_PUBLIC_IBL_SHADOWS` (`lib/babylon/scene/IblShadows.ts`) | Soft contact shadows from the sky light. | Cost: it voxelizes the scene and runs a pass every frame; a phone budget call. | Not attempted: a GPU cost cannot be measured on this machine's software renderer. Build-time variable (the owner's). |
| A5 | Face options "coming soon" (`lib/babylon/core/faceMorphs.ts FEATURE_WEIGHTS`, empty) | Eye shape, mouth, nose and all brows but Arched in the character editor. | The kit bodies carry seven face morphs; these need new baked morphs (CREATOR-PLAN phase 5). | Not attempted: baking morphs into the body files is model work (GATE 0, not this lane's). |
| A6 | `BOOTS_LIVE` (`lib/babylon/adventure/br/loot.ts`) | Boots spawn as loot in the Adventure bot battle royale. | The run speed does not read `speedMult` yet, so boots would do nothing. | Lowest reach: `/play/adventure-br` is unlisted (no player can reach it from the app). Not attempted; wiring speed into movement would also change every Adventure run's speed by PRQ band, which is in the owner's open Adventure decisions. |

## 2. Other lanes' switches (listed, not edited)

| Switch | Lane | What it does, and why it is off | Class |
|---|---|---|---|
| `dunk.preloadSet` | dunk | Loads the rival and onlookers during the intro. Off: they load between rounds. | A (dunk lane turning it on) |
| `dunk.landLeadSec` (0) | dunk | Landing crouch starts before touchdown. 0 = as shipped. | A (dunk lane) |
| `dunk.realJumpPersonal` | dunk | A verified adult's own best jump fills the take-off. | A (dunk lane); uses verified-adult data |
| `dunk.slamVariants` | dunk | Stick held at the slam picks REVERSE / TWO-HAND POWER. Kept off by the 2026-11-10 delegated call 1. | B (owner call) then dunk lane |
| `cam.dunkFraming` | dunk | The dunk contest's camera fixes (QA 1–3, 8). | A (dunk lane) |
| the dunk landing | dunk | — | dunk lane |
| `hoops.blockDiceOn`, `hoops.stealDiceOn`, `hoops.aiBlockReactOn` | hoops | 1 puts back the old dice rolls / the AI's block wait. 0 is the newer "hand meets ball" rule (owner 2026-10-20). | C |
| `hoops.turnTrueArc` (0), `hoops.kickSec` (0), `hoops.cutSec` (0), `hoops.jerk` (0) | hoops | H3a's smoother turn, turbo kick, cut cost and jerk limit; H3a recommends 1 / 0.10 / 0.08 / 900. Off = as shipped. | A (hoops lane, `lane/hoops-p05`) |
| `hoops.reversePlantHold` (0) | hoops | A stick thrown back at pace slides the old way for the plant. | A (hoops lane) |
| `hoops.ftDistNarrow01` (0) | hoops | Free-throw green narrowed like a jumper. 0 = the full window (owner 2026-10-24). | C (owner's value) |
| `STRONG_HAND_RETURNS` (`core/StrongHand.ts`) | hoops | The ball goes back to the strong hand on its own. Off by owner decision 2026-10-20. | B (owner decision) |
| `OCCLUDER_FADE_OFF` (dunk, 1v1, 3v3) | dunk / hoops | Scenery between the camera and the player fades. Every other mode has it; these three wait for their lanes. | A (their lanes) |
| `lib/babylon/modes/baseballBat.ts` | bat | — | bat lane |

## 3. Class B: not a quality question (the owner's, or another step's)

"Env" means a production environment variable: only the owner sets it (Firebase / Cloud Run settings), and a `NEXT_PUBLIC_`
one also needs a rebuild and deploy.

### 3.1 Money and payments

| Switch | What turns it on | Who |
|---|---|---|
| `VIRTUAL_PURCHASES_ENABLED` (coins, shards, season PRO, Studio credits, marketplace) | An 18+ check and a refund path per product (`lib/flags.ts` B10), then env `VIRTUAL_PURCHASES_ENABLED=1` and the per-product allow list | Owner |
| `COACH_STORE_ENABLED`, `COACH_STORE_PAYMENTS_ENABLED`, `COACH_STORE_LIVE` | The live Stripe key, the store terms, then env | Owner |
| `COACH_CONNECT_PAYMENTS_ENABLED`, `PAYOUTS_ENABLED`, `STRIPE_TAX_ENABLED` | Stripe Connect (Express) account, tax registration, then env | Owner |
| `COACH_PRO_ENABLED` (Free/Pro gates and the Pro upgrade), `COACH_MARKETPLACE_ENABLED` (`/coaches`) | Price (`COACH_PRO_PRICE_USD_CENTS`), payments live, then env | Owner |
| `BOOK_STORE_ENABLED`; ebooks/bundles/downloads (EBOOK policy) | Store terms matching what is sold (EBOOK-1 terms for ebooks), payments, then env | Owner (legal) |
| `SEASON_PASS_PURCHASE` | Payments live, then env | Owner |
| `REAL_MONEY_COMPETITION` | Legal review (owner 2026-10-20: keep off) | Owner |
| `STUDIO_CREATOR_ENABLED` (Studio credits, cartridges, partner keys) | Payments live (`VIRTUAL_PURCHASES_ENABLED`) and a refund rule for credit packs (`docs/LAUNCH-SALES.md` §8.7), then env | Owner |
| Every "Opens soon" product card (`components/shop/opens-soon.tsx`, Pro, packages, 1:1 booking online) | Follows its store's payment switch above | Owner |

### 3.2 Legal, policy, age and consent

| Switch | What turns it on | Who |
|---|---|---|
| `FACE_SCAN_ENABLED` (Closet "Scan My Face") | Biometric consent text and a legal review; this lane never turns it on | Owner |
| `TRY_AGE_BANDS_ENABLED` (`/try` birth-date bands) | An age-rule decision (Cyber B1), then env | Owner |
| `TEEN_POSE_REVIEW_ENABLED`, `TEEN_VBT_SAVE`, `TEEN_E1RM`, `TEEN_READINESS`, `TEEN_SHOT_SAVE` (code constants) | Owner decisions on teen data (guardian consent; `docs/COACH-VIDEO-REVIEW.md`) | Owner |
| `GUARDIAN_WITHDRAW_LIVE` (`lib/consent/guardianGate.ts`) | The guardian withdraw path built, the consent words live, the `*_CONSENT_SINCE` go-live dates set | Owner (consent rule) |
| `ADULT_NUMBER_SYNC_ENABLED` (`lib/session-setup/sync.ts`) | The AB-04 opt-in (`prisma/pending/2026-10-04-adult-optin-ab04.sql`) | Owner (SQL + consent) |
| `CAMERA_TIMES_SAVED` (`lib/sprint/cameraSprint.ts`) | The movement-save opt-in's words cover sprint times (privacy text) | Owner |
| `CLIP_UPLOADS_LIVE` (form-review clips) | Storage bucket, lifecycle rule, consent text, retention, a table (`docs/COACH-VIDEO-REVIEW.md` §5) | Owner |
| `COACH_PARITY_HEALTH_ENABLED` (health questions in check-ins) | Health-data consent text approved | Owner |
| `NEXT_PUBLIC_COMBINE_DRAFT_COPY` | The combine's draft privacy and consent lines approved | Owner |
| `REVIEW_TEXT_PUBLIC` (coach review text on the public page) | The safety lane's shared abuse screen (SAF-06) wired in, and the CoachReview SQL | Safety lane, then owner |
| `STUDIO_SHARE_ENABLED` (Studio share links) | `prisma/pending/2026-10-26-studio-share.sql`; Terms §4 (user content shown to others) and Privacy text; the safety lane's report target; then env | Owner |
| `/teach/motion` (motion lessons, "opens soon") | The owner signs off the look (owner 2026-10-20) | Owner |
| `/play/adventure`, `/play/adventure-br` (unlisted) | The owner lists them (Adventure's open decisions) | Owner |

### 3.3 Accounts, keys and outside services

| Switch | What turns it on | Who |
|---|---|---|
| `ABACUS_ENABLED` (AI Coach chat, the Studio's AI builder, the importer's AI reader `COACH_IMPORT_AI_ENABLED`) | The AI service key (`ABACUSAI_API_KEY`) and its cost, then env | Owner |
| `EMAIL_ENABLED` (all mail) | The owner's Google Workspace mailbox (app password or service account; ops session), then env | Owner |
| `NEXT_PUBLIC_JOIN_LAB_ENABLED` (signed-out email form) | Mail on, then env and a rebuild | Owner |
| `NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED` | The email waitlist can save safely; the page no longer reads it | Owner |
| `COACH_REVIEW_UPLOADS_ENABLED`, `COACH_VIDEO_UPLOADS_ENABLED`, every `UploadsComingSoon` (soundtrack, creative card, branding, catalogue video) | The storage buckets (OWN-16), then env | Owner |
| `NEXT_PUBLIC_COACH_LIVE_ENABLED` (live coaching calls) | A TURN relay (`PARTY_TURN_URLS`, `PARTY_TURN_SECRET`), then env | Owner |
| `LIVE_RELAY_BUILT`, `BROADCAST_READY` (stream to Twitch / YouTube) | A paid WebRTC → RTMP relay server | Owner |
| `LIVE_STREAM_SCHEDULE_ENABLED` (`/live/schedule`) | The owner's real stream schedule, then env | Owner |
| `NEXT_PUBLIC_NEXUS_ENABLED` (Nexus gateway client) | A Nexus gateway (`NEXUS_GATEWAY_URL`) | Owner |
| `NEXT_PUBLIC_SW_ENABLED` (installable app's service worker) | "The owner turns it on after a device check" (`lib/pwa/sw.ts`); build-time | Owner |

### 3.4 A pending SQL table (the owner's `pending-sql` step, `docs/PENDING-SQL.md`)

Each of these says "coming soon" / "opens soon" until its file is applied; nothing else is missing. `npx tsx
scripts/pending-sql/cli.ts plan`, then `apply`, against production (the owner's step).

| Screen | File |
|---|---|
| Squads and teams (`/squads`) | `2026-10-25-teams-squads.sql` |
| Combine day (`/train/combine`, results) | `2026-10-25-combine-day.sql` |
| Teaching on FEL (`/teach`, the queue, course studio) | `2026-11-03-teacher.sql` |
| Group booking (`/groups`, one-on-one, coach groups) | `2026-11-02-group-booking.sql` (plus the gym config and a coach listing) |
| Coach check-ins, habits, roster calendar, automations, paste a program | `2026-10-26-coach-parity.sql` |
| Signature programs | `2026-10-25-signature-programs.sql` |
| Readiness check-in | `2026-10-25-coach-readiness.sql` |
| Sending sets to your coach (form review) | `2026-10-24-coach-form-review.sql` |
| Library review decisions | `2026-10-25-exercise-library.sql` |
| Adventure server save (`ADVENTURE_SERVER_SAVE_ENABLED`) | `2026-10-07-adventure-save.sql` |
| Studio account save (`STUDIO_CLOUD_SAVE_ENABLED`, on `lane/studio-save`) | its own SQL, in the owner's deploy session (owner 2026-10-17 Q8) |

### 3.5 Explicit owner decisions to keep it off

| Switch | Decision |
|---|---|
| `crowd.forgeFront` (forge rivals in the crowd's front row) | Off by the PM on 2026-10-30; "crowd forge front parked by Elijah 9:45 AM Nov 9" (`lane/demo-models-1`, 30dfdae5, which also adds `CROWD_FORGE_FRONT_ENABLED`). |
| `NEXUS_STUDIO_ENABLED` (the editor at `/studio`) | "/studio stays unlinked (flag-gated) until the owner says ship" (2026-10-14). See §5. |
| `COACH_SOLO_DRAFTS_ENABLED` | "OFF, AND NOT WIRED TO ANY SURFACE: an owner call" (`lib/coach/weeklyDraft/solo.ts`). |
| `dunk.slamVariants`, `STRONG_HAND_RETURNS` | §2. |

## 4. Class C: not really off

| Switch | Why it is not "off" |
|---|---|
| `hoops.blockDiceOn`, `hoops.stealDiceOn`, `hoops.aiBlockReactOn` | 0 is the newer rule; 1 restores the old dice for an A/B. |
| `HAS_TIME_WINDOWS` (`lib/courts/CheckIn.ts`) | A deliberate "no": the courts system has no late-night windows, by the mission. |
| `VIDEO_TRAINING_USE` (`lib/capture/privacy.ts`) | A promise, not a setting: video never trains a model. |
| `FEEL_PANEL_ENABLED`, `FEEL_PANEL_USERS` | The owner's dev panel. |
| `NEXT_PUBLIC_JUMP_PILOT_CAPTURE` | The force-plate lab's build only. |
| `NEXT_PUBLIC_PLAYTEST_MODE` | Named in `.env.example`; no code reads it. |
| `NEXT_PUBLIC_SKINNED_BODY`, `NEXT_PUBLIC_PROCEDURAL_ENVIRONMENTS`, `NEXT_PUBLIC_PROCEDURAL_CHARACTERS`, `NEXT_PUBLIC_PREMIUM_DRESSING`, `NEXT_PUBLIC_MOCAP_DUNK`, `NEXT_PUBLIC_DUNK_FINISH_VARIETY`, `NEXT_PUBLIC_FEL_BODY_RIDE` | Already on (the variable is a rollback); body ride is on for kart and plane in `RIDE_DEFAULT_ON`. |
| `CHI_BURST_ENABLED` (Karate) | `true`: on. |
| `?noplant=1`, `?noposture=1`, `?nomotion=1`, `?nolegs=1`, `?norimaim=1`, `?noreach=1` | Development-build A/B flags for the rig. |
| `WALLED` (`lib/babylon/modes/shipStatus.ts`) | The in-development wall is empty: no mode is behind it. |

## 5. Nexus Studio

(Filled in below.)
