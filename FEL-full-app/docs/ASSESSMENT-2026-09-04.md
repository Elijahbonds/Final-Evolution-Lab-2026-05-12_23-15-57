# Product assessment — 2026-09-04, after ship pass 4 and PACK THE FIVE

Tree: `babylon9-aaa-rendering` at 55fd4cc (pass 4 merged at bf14dea, tagged `v0.9.0-rc.2`; the friend-test pack on top).
Gates on this tree: tsc clean; `npx vitest run` 40 files / 260 tests; production build 37 s; gauntlet sweep 18:29 clean
(21 harness modes, 3 logged-in rows, 7 mobile-tier rows, 7 phone rows, no baked-map drift).
Every figure below was read from the code, the schema, the docs or a probe on this tree; nothing is from memory.
Owner intent this answers (brief of 2026-09-04): (1) gold-nugget inventory of older requests, (2) economy inventory,
(3) the friend-test tree and docs, (4) marketing hooks. Studio was not opened.

## 1. Where the product stands, by area

| Area | Measured state | Evidence |
|---|---|---|
| Modes | 24 registered, 18 enabled in the rollout; every enabled mode plays its shipping `/play` route logged in, posts a session with rewards, and has a concept-lock sign-off doc | `registry.ts`; `docs/concept-lock/*-signoff.md`; production sweep 10/10 play rows + 7/7 phone rows (`docs/RC-2026-09-04.md`); session probe 12/20 routes end under passive play, the other 8 need real input |
| Venues | 12 of 16 mode venues on specs; 10 of 12 baked maps carry a navmesh; 68 CC0 props dressed across 10 placement tables | `docs/SHIP-PASS-4.md` phases 2–3; `lib/babylon/config/textureBudget.json` |
| Bodies / Closet | MPFB2 kit body is the default hero (mobile texture variant on the phone tier), 8-athlete roster, 6 skin families, face morphs, 6 hair styles, kit garments per slot; Closet choices reach the court (pack #1 fix) | `docs/SHIP-PASS-3.md`; `_tint-proof.mts` |
| Camera | measured framing table for all 22 modes (median 0.35 of frame height), frame-time-normalised lag, whiskers, map-wide camera box | `lib/babylon/config/cameraFraming.json` |
| Camp / curriculum | model, API, four screens, the owner's eight-week facilitator curriculum on the screens (commit 3884b1d) | `lib/camp/curriculum.ts`, `app/camp` |
| Multiplayer | lobby page + `lib/mp` match service + API (`create/join/list/local`); ONE mode networked (`TennisModeV2`) | `components/mp/multiplayer-lobby.tsx`; `grep NetworkManager lib/babylon/modes` |
| Story / Garden / Hub | `EvolutionGarden.ts`, `FusionColosseum.ts`, `/story` route, PRQ progression, rival circuit exist; the narrative spine is still marked "draft for confirmation" | `docs/STORY_SPINE_DRAFT.md`, `docs/VISION_AUDIT.md` |
| Diagnostics / wiring | phone bridge, gauntlet, play sweep, concept lock and tests ✓ on every enabled mode; `game_diag` → `/api/admin/diag`; sessions → `GameSession` + `AnalyticsEvent` | `docs/SHIP-PASS-4-MATRIX.md` (26 gaps, none in wiring) |

## 2. Gold-nugget inventory — older owner requests that scope changes set aside

Ranked by how much value sits behind how little work. "Source" is where the ask is written down.

| # | Request | Source | Status today | Where it belongs |
|---|---|---|---|---|
| G1 | **Creator Card economy** (Story P6) — deferred "pending live server-authoritative wallet" | `VISION_AUDIT.md` §Story/Garden | The wallet exists now (dual currency, 14 rules, tests). Reason codes `CREATIVE_CARD_PUBLISH` / `CREATIVE_CARD_REMIX_ROYALTY` are defined; the publish/royalty *fires* are not wired | Economy — unblocked, not started **Corrected in pass 5 (2026-09-04, phase 2): both fires exist in `creative-card-service.ts` and are proven on the dev DB — publish +50, remix royalty +25 to the parent's owner, as wallet ledger entries.** |
| G2 | **Mastery ladder surface** — "I can feel myself getting better" (the vision's #1 quote) | `VISION_AUDIT.md` recommended move 2 | PRQ engine, mastery recap (`MASTERY UP` on the results card) and weekly `LadderSeason`/`LadderEntry` exist; no player-facing ladder screen | Progression — partial |
| G3 | **Shareable highlights beyond dunk** — "replay recorder exists for dunks; generalize" | `VISION_AUDIT.md` move 3 | `DunkReplayRecorder` only; the pack's proof card shares a LINE, not a clip | Social — dunk only |
| G4 | **Full-game loops for the precision modes** (fielding, match play, 18 holes, open play) | `VISION_AUDIT.md` move 1 | Derby/penalty/golf/tennis/football ship as single-skill loops by benchmark lock (PES penalty, MLB hitting, PGA 2K); not built | Modes — deferred by benchmark decision |
| G5 | **Multiplayer in karate VS and court carnival** | commit 62ff53f (2026-08-27) "Integrate NetworkManager to KarateVSMode and CourtCarnivalMode" | Not on this branch: `NetworkManager` appears only in `TennisModeV2.ts`; the work lives in another worktree's history | Multiplayer — dropped in a merge, recoverable |
| G6 | **AI avatar generator as a later premium option** (owner decision, pass 3) | `docs/SHIP-PASS-3.md` line 9; commit 52782ce | Not started; the on-device fitted body shipped instead, as decided | Closet / monetisation — later |
| G7 | **Real phone hardware session** | `SHIP-READINESS.md` owner items; the brief's residuals | Still outstanding: desktop Chromium + emulated mobile only | QA — owner/AM hardware |
| G8 | **Story spine confirmation** (rival, garden role, flight as narrative gate, sky-dojo gates) | `docs/STORY_SPINE_DRAFT.md` | Draft never confirmed; garden/colosseum code exists without the spine | Narrative — decision needed |
| G9 | **Bat prop in the derby; 3v3 defensive switching; ball in the AI driver's hand** | `HANDOFF-CONTEXT.md` open list 2026-09-03 | **Landed on this branch** — `derby_bat` mesh in `precisionModes.ts`, `Matchups.ts` with six switching references and the carried ball in `ThreeVThreeMode.ts`. Listed so nobody re-does it | Modes — done |
| G10 | **Wardrobe residuals**: hijab hair, sport-length shorts, sporting headwear; OverScore wardrobe GLBs under `/workspace/wardrobe-proxy/out/` with the Closet wire held | pass 3 residuals; owner brief | None of the CC0 packs carry them; the OverScore GLBs are on the box, not in this repo — Closet wire state cannot be confirmed from here | Closet — needs the box's files |
| G11 | **Karate Endless direction/wave and snowboard gate/steering quality notes** | owner brief | Karate endless is the horde brawler (owner lock, signed 8 of 8); snowboard slalom captures as a whiteout (pre-existing, backlog) | Modes — quality notes to re-read against the locks |
| G12 | **Gate 0 definition** — 65-bone Mixamo (contract wording) vs 22-bone unprefixed FEL spec (operating rules, every shipped GLB) | `docs/GATE0-REPORT-2026-09-04.md`, `docs/BACKLOG.md` | Both readings pass their own tests; the validator never runs on a loaded GLB | Owner decision |
| G13 | **Volleyball / Brain Brawl / Who Scene It depth passes; Market Browse UX pass** | `VISION_AUDIT.md` modes 11, 16, 17, 19 | Volleyball got the net touch in pass 3; the other three have no depth pass | Modes — v1.1 cut |
| G14 | **Retired by decision, do not resurrect**: Unreal Arena, Velocity Kart, Aero Aces | `PHASE2_BENCHMARK_LOCKS.md` | Never in this codebase | — |

## 3. Economy inventory — what exists, what is dark, what is missing

**Three balances exist and they are not one system.** This is the first thing to protect. *Update, later the same day: lab credits are folded into the wallet (`docs/LC-FOLD-2026-09-04.md`); the profile column is now a written mirror.*

| Balance | Lives in | Earned / spent by | State |
|---|---|---|---|
| **coins / shards** | `Wallet` + `WalletLedgerEntry` (server-authoritative, idempotent, 14 `RewardRule`s, `perDay`/`perMinute` caps, exchange coins→shards) | `/api/v1/wallet/*` earn/spend/exchange/entitlements; `DualWalletChip`; the pack's daily faucet; mode sessions (`MODE_SESSION_COMPLETED/WON`), dunk reasons, MP reasons, referral bonus, creative-card reasons | **Live.** Proven today: 100 coins granted, ledger entry, toast, replay-safe |
| **LC (lab credits)** | `PlayerProfile.labCredits`, mirrored by the double-entry `LedgerAccount/Transaction/Posting` (`lib/ledger.ts`, currency `LC`) | Arena stakes and pots (`/api/arena/*`, house rivals stake from a treasury, rake burns), **shop purchases** (`/api/shop/purchase` decrements `labCredits`), competition routes | **Live in code.** This is the "house book": auditable, house-labelled ghosts, deterministic rival draws |
| **PlayerProfile.shards** (legacy) | `PlayerProfile.shards` | older PRQ recap path | **Legacy.** The pack was told to touch the wallet chip, not this field |

Call-outs vs older briefs:
- **Fragmentation**: a player sees coins/shards in the chip and spends LC in the shop and arena. No exchange between LC and coins exists; `exchange.ts` only converts coins→shards. A friend tester will ask why the shop takes a currency the chip doesn't show. Decision needed: fold LC into the wallet as a third currency, or surface LC in the chip, or price the shop in coins.
- **Season pass**: FREE lane live (`/api/season`, `season-service`), PRO lane dark behind `SEASON_PASS_PURCHASE` — pricing is the owner's, none in code. Out of the pack's scope by instruction; it is ready to flip when priced.
- **Stripe**: checkout, webhook, portal, payout and the v1 wallet checkout/shard-checkout/stripe-webhook routes exist (the two v1 checkouts carry a stub mark); **no `STRIPE_*` variable is set in `.env.local`**, so every purchase path is dark on this box. Out of scope by instruction.
- **Referral**: `ReferralCode`/`ReferralConversion` models, `/api/marketing/referral`, signup hook and the `REFERRAL_BONUS` rule exist. Out of scope by instruction; wired enough to test when it comes back in.
- **Real-money competition**: `/api/competition/*` and escrow/KYC/geo gating exist behind `REAL_MONEY_COMPETITION` (default off). Keep off for friends.
- **Studio Creator monetisation** (subscription gating, build metering, cartridge publishing, partner API): behind `STUDIO_CREATOR_ENABLED` (default off). Not for friends.
- **Marketplace**: `/api/marketplace/purchase` is 21 lines and `MarketplacePurchase` has 3 references — thin; the vision's "Market Browse UX pass" never happened.
- **Carnival**: the run lineup, `NEXT:` stop navigation and `/play/carnival/recap` exist; carnival has **no earn reason of its own** (it pays through `MODE_SESSION_*` like every mode). If the carnival was meant to pay a pot, that rule is missing.
- **Creator Card**: mint (`/api/challenge/mint` → `/c/<code>`), `CreatorCard`/`CardOwnership`/`CreativeCard` routes and the pack's dunk proof line exist; the royalty/publish fires (G1) exist and are proven (pass 5 phase 2, `_creative-card-economy.mts`).
- **Missing from every brief I can find**: a payout/withdraw path for shards (`/api/wallet/withdraw` exists as a route; its economics are not documented), and any admin screen for the reward rules beyond editing rows.

## 4. Friend-test readiness — what the AM and PM deploy, and what to tell friends

**Tree to deploy**: HEAD 55fd4cc (pass 4 + the pack). Gates green as listed at the top. Recommended tag: `v0.9.0-rc.3` at this
commit (local; the AM decides what goes public). The Studio deploy itself is the AM/PM's click; this section is the tree and docs.

Prerequisites on the deploy host (none are secrets in this doc; values live only in the host's env):
1. `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (auth is required on every `/play` route). No Stripe variables needed; all three monetisation flags stay unset (off).
2. `prisma migrate deploy` then `prisma generate`; restart the server after generate (a known trap: routes 500 with an empty body otherwise).
3. `npm run seed:rewards` — seeds the 14 reward rules (idempotent, never deletes). `npm run playtest:ensure` refuses to run in production by design; create friend accounts through `/signup`.
4. `scripts/prod-serve.sh build` then serve; smoke with `BASE=<url> bash scripts/gauntlet-play.sh` (the 20 play routes; the harness `gauntlet.sh` targets `/dev/mode/*`, which is 404 in production by design).
5. Verify the painted public URL before anyone claims a live build (owner rule).

What a friend can do on day one, in order (the smoke script for humans): sign up → Closet (starters equipped by default) → Modes → Venice dunk: starters visible in their colours, "+100 coins" toast on the first session of the day → finish the contest → results card with rewards and SHARE DUNK PROOF → open the `/c` link on a phone → try ones, threes, karate versus, skateboard, tennis, volleyball.

Known residuals to say out loud to friends: phones are emulated, not real hardware (G7); three routes are disabled in the rollout (sprint, showdown, duel); snowboard slalom may open to a white screen for a moment; the shop spends a currency the chip does not show (§3); the dunk contest needs a held charge and a slam — the results card only appears after all four dunks.

## 5. Marketing hooks for Content and Growth (notes only — no Higgsfield runs)

Every area has a way to produce stills or clips from this tree today; the AM/PM or Growth run them.

| Area | What to show | How to capture on this tree |
|---|---|---|
| Modes | the Venice court at dusk with the kit body; karate versus in the dojo; skate lines; the dunk judges' reveal | `URL=http://localhost:3000/dev/mode/<key> PUMP=1 STEER=1 HOLD=700 GAP=70 KEYS=j,k,l NAME=<key> OUT_DIR=<dir> REPS=8 npx tsx scripts/capture-mode-play.mts` (a frame per mode); the dunk replay recorder for clips |
| Closet / MPFB body | the skin families, hair styles, garments, face sliders | `/closet` logged in; `?tone=<hex>` and `?hero=<glb>` dev queries for variants |
| Camp / curriculum | the eight-week arc, Pathway Map, Bridge prompts | `scripts/camp-ui-walk.mts` walks the four screens as a real account |
| Multiplayer | the lobby and a tennis match | `/multiplayer` logged in; only tennis is networked today (G5) |
| Boards | skate, surf, slalom, big air | the same capture script; the SSX-style flow meter reads on the HUD |
| Economy moments | the "+100 coins" toast, the results card, the proof card at `/c/<code>` | `scripts/probes/_faucet-proof.mts`, `_dunk-proof-drive.mts` (both produce the moment on screen) |

Hook text Growth can build on (claims that are true on this tree): "your Closet look plays on the court", "a card that says what happened at the rim", "an eight-week camp with a facilitator's curriculum", "twenty-one sports on one body".

## 6. Decisions the owner is asked for next (multiple choice when we meet)

1. Currency: fold LC into the wallet, show LC in the chip, or reprice the shop in coins (§3). **Taken 2026-09-04: folded into the wallet — `docs/LC-FOLD-2026-09-04.md`.**
2. Gate 0 wording: 22-bone unprefixed as the shipping spec (the operating rules), with the 65-bone tests kept for the import path — or the reverse (G12).
3. Story spine: confirm, revise, or park (G8).
4. Multiplayer: recover the karate versus / carnival networking from the other worktree, or ship tennis-only for friends (G5).
5. The Creator Card economy (G1): open it now that the wallet exists, or hold until after friend testing. **Taken 2026-09-04: opened in pass 5; proven.**
