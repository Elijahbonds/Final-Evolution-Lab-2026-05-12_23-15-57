# PACK THE FIVE — friend-test pack on bf14dea (babylon9-aaa-rendering), 2026-09-04

Owner / FEL PM GO with item 1 amended to tint-only. Studio HOLD respected: no Preview, Publish or Studio clicks.
The spec file `SPEC-FRIEND-SMOKE-PACK5.md` was not on this Mac or at the box path; the pack ran against the acceptance
list in the GO message (tint #1, faucet + toast, dunk proof card, free starter on Venice, RewardRule seed).

## What landed

### 1 · Closet → Venice wardrobe stick (tint-only on fel-hero)
- Already wired in code: `resolveIdentity` derives the palette from `closet.look.equipped` through the catalogue accents
  and `tintSlot` colours the jersey / shorts / shoe materials at spawn; dunk spawns through `CharacterPipeline.spawnPlayer`.
- **Defect found by proof** (`scripts/probes/_tint-proof.mts`, logged in, `/play/dunk`): colours were right (tee and shoes
  `#A855F7`, shorts `#00E5FF`) but the VISIBLE garments were `top_bonds` and `shoes_evo` — the identity layer clones
  meshes as `Kit_tops_top_lab_c31`, the kit parser read `top_lab_c31` as the item id, matched nothing and fell back to
  each slot's first garment. Fix: `kit.ts` strips the `_c<n>` clone suffix before parsing (`CLONE_SUFFIX`); test pins it.
- **Proof after**: visible on court `Kit_tops_top_lab #A855F7`, `Kit_shorts_shorts_court #00E5FF`, `Kit_shoes_shoes_flight #A855F7`.

### 2 · Earn toast + first-session faucet
- `DualWalletChip` fires `daily_first_session` once the wallet reads (auth-aware: the wallet fetch is 401 logged out):
  idempotency key `daily_first_session:<local YYYY-MM-DD>:<session user id>`, a per-day localStorage mark for the toast,
  the ledger's unique key as the real once-a-day guard. Wallet chip only; `PlayerProfile.shards` untouched.
- **Proof** (`_faucet-proof.mts`, `/modes`): pass 1 → `POST /api/v1/wallet/earn` 200, granted 100 coins, ledger entry
  `cmtnnsbrb…`, balances 346 → 446, toast "+100 coins" shown. Pass 2 in a fresh browser → same key, server replay returns
  the SAME entry and balance (no double grant). The chip now skips its toast when the earn's balances equal the ones it
  last showed (a real grant always moves them), so a second device the same day shows nothing.
- First version keyed the day in UTC and the player as `me`; both fixed before proof (one UTC-keyed test grant exists in
  the dev ledger from that run).

### 3 · Dunk proof / Creator Card share
- `DunkMode` counts `makes` / `misses` / `bestChain` into the session result; `dunk-babylon` maps them to tallies.
- **Defect found**: the component compared `outcome === 'WIN'` while the mode emits `CONTEST_WON` / `CONTEST_LOST`, so every
  dunk session posted as a loss. Fixed (both accepted).
- `GameShell`: a second mint button **SHARE DUNK PROOF · <makes>/<attempts> DUNKS · <pts> vs <rival> · WON/LOST** for
  `dunkContest` / `dunkduel`, minting the existing challenge link with that line as `display`; the `/c/<code>` page renders it.
- Proof run: `PROOF=1 ACTIVE=1 ROUTE=dunk scripts/probes/_session-e2e.mts` (result recorded below when the run lands).

### 4 · Free starter on Venice
- `defaultEquipped()` already equips `top_lab / shorts_court / shoes_flight` for every user; item 1's fix is what makes
  them SHOW on the court after auth. Same proof as item 1.

### 5 · RewardRule seed
- `scripts/seed-reward-rules.ts` exports `seedRewardRules(db)`; `scripts/ensure-playtest-user.ts` (the playtest / RC
  path) calls it first; `npm run seed:rewards` and `npm run playtest:ensure` added. `resolveRule` already falls back to
  the in-code defaults, so earn never no-oped on a missing row — the seed makes the rows editable live, as the spec says.
- **Proof**: `reward rules present: 14`; `_pack-db.mts` → RewardRule rows 14 (active 14).

## Residual risks
- Item 3's proof needs a completed dunk contest; the passive session probe never reached an end on dunk, the active-input
  run is the evidence (below).
- Load: a full `vitest run` loses one headless child to its 120 s budget when a production server or a second browser
  shares the host; it is 40 files / 260 tests in isolation.

## Suggested check
`npx tsc --noEmit && npx vitest run` (expect 40 files / 26x tests), then the gauntlet (`GAUNTLET_DIR=… bash scripts/gauntlet.sh`)
and the two pack probes: `ROUTE=dunk npx tsx scripts/probes/_tint-proof.mts`, `npx tsx scripts/probes/_faucet-proof.mts`.
