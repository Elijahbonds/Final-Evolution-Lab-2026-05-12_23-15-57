# Season Pass — operator guide (M13/M14)

Everything the season pass needs to run, and the exact switches that take the
PRO lane live. Nothing here decides a price: **pricing is the owner's**, set in
env, changeable without a deploy.

## What ships on by default

The FREE lane is fully live the moment a season row is active. No flag needed.

- Season XP flows from **every mode** through `/api/sessions` → `addSeasonXp()`.
- 50 tiers, 8-week season. Curve: `TIER_XP(tier) = 800 + tier * 120`
  (`lib/season/season-pass-core.ts`). It is the single source of truth — never
  re-derive the curve anywhere else.
- Clearing a tier **books** its rewards immediately, server-side, keyed by a
  unique `PassGrant.dedupeKey`, so a reward can never be paid twice.
- An `lc` reward is really credited: `PlayerProfile.labCredits` and the
  `CreditLedger` double-entry move in the **same transaction** as the grant row.
- Season 1 "Golden Hour" content is data (`lib/season/golden-hour.ts`), not code.
  Future seasons ship by adding a table to the registry — no deploy of logic.

Seed an active season with the existing seeder (`prisma/seed` →
`scripts/seed.ts`), which upserts S1 as active for 8 weeks.

## Turning the PRO lane on

Three env vars, all required. Miss any one and the lane stays visibly dark
rather than selling at a price the repo invented.

| Variable | Meaning |
|---|---|
| `SEASON_PASS_PURCHASE` | `1` exposes the buy button. Unset/`0` → HUB shows "COMING SOON". |
| `SEASON_PASS_PRO_PRICE_USD_CENTS` | Price in **cents** (e.g. `999` = $9.99). No default — unset means `/api/season/checkout` answers `503 not_configured`. |
| `STRIPE_SECRET_KEY` | Already required by the coin store. Absent → `503`. |

The webhook (`/api/v1/wallet/stripe-webhook`) must receive
`checkout.session.completed` and `charge.refunded`, and needs
`STRIPE_WEBHOOK_SECRET` — same endpoint and secret the coin store already uses.

### What happens on purchase

1. `POST /api/season/checkout` creates a Stripe Checkout session. The price is
   server-owned; a client-supplied price is ignored. `seasonId` is pinned into
   metadata so a payment landing after a season rollover still unlocks the
   season it was bought for.
2. Nothing is unlocked there. The lane opens **only** in the signature-verified
   webhook, on `product: 'SEASON_PASS_PRO'`.
3. `unlockProLane()` sets `hasPro` and **back-fills** every PRO reward for tiers
   already climbed — buy at tier 20, collect tiers 1-20 immediately. Back-fill
   runs through the same dedupeKeys, so a redelivered webhook grants nothing new.
4. `charge.refunded` closes the lane (`revokeProLane`). Cosmetics already booked
   stay in the append-only grant log; they are cosmetic-only, so no gameplay
   advantage is bought or unbought. Re-purchasing simply re-opens the lane.

**The PRO lane is cosmetic-only. It must never grant a stat, PRQ point, or any
gameplay edge** (Blueprint Pillar 7). LC is the one non-cosmetic reward and it
sits on the FREE lane too.

## Collecting

`POST /api/season/claim` with `{}` collects everything earned, or
`{ tier, lane }` collects one. Claiming marks collection for the HUB badge and
COLLECT beat; it also re-books through the same dedupeKey path, which self-heals
the case where a tier-up's grant write failed on a transient error. It mints
nothing new and is safe to call repeatedly.

## Deliberately absent

`SessionXpInput.questsDone` (worth 200 XP each) is part of the verified
reference core but **nothing feeds it** — FEL has no quest system yet. When a
daily-quest track lands, pass the count into `SeasonPassCore.sessionXp()` and
season XP picks it up with no other change. Do not repurpose it for the daily
streak: the streak bonus pays LC, not pass XP.

## Verifying

`scripts/season-pass-core-tests.ts` (registered in `scripts/standing-suite.ts`)
covers the curve, tier-up events, reward shape, the tier cap, rehydration,
collection idempotency, and the PRO back-fill:

```
yarn tsx scripts/season-pass-core-tests.ts
```
