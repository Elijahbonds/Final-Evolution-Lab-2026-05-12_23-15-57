# FEL Wallet — Server-Authoritative Dual-Currency Economy

**Scope (v1):** coins + shards, sourced from **Dunk mode** (Phase 1) and, from
Phase 2, other modes and Scene It free-use. This is a NEW standalone system,
separate from the legacy LC economy (`lib/economy.ts`, `lib/ledger.ts`,
`app/api/wallet/*`). Nothing here touches LC.

## Hard invariants (proven by `scripts/wallet-tests.ts`)

1. **The server is the only balance authority.** The client sends a *performance
   event*, never an amount. `computeGrant` derives worth from `RewardRule`.
2. **Every balance change is a ledger row.** Balance is reconstructable from
   `WalletLedgerEntry.delta` alone (see `derivedBalances`).
3. **Every mutating request is idempotent** via a unique `idempotencyKey`. A
   replay returns the ORIGINAL result — never a double grant/spend.
4. **Balances never go negative.** Spend is a conditional atomic decrement
   (`updateMany WHERE balance >= price`); insufficient funds is a clean 409.
   A DB CHECK constraint (`prisma/wallet-constraints.sql`) is the backstop.
5. **Reward rules live server-side** in the editable `RewardRule` table (seed +
   fallback in `lib/wallet/reward-rules.ts`). Editing pay needs no client release.
6. **Stripe purchases mint COINS ONLY. Shards are never purchasable** — there is
   no shard SKU and no code path from a purchase to a shard grant.

## Files

| File | Responsibility |
|------|----------------|
| `reward-rules.ts` | reason codes, event→reason map, default rules, `computeGrant` (PURE) |
| `validation.ts` | trick vocab, `validateChain`, `validateDunkAttempt`, `payloadHash` (PURE) |
| `catalog.ts` | spend SKUs + coin packs (server-owned prices; no shard pack) |
| `wallet-service.ts` | `earn` / `spend` / `grantCoinPurchase` / `refundCoins` / reads |
| `client.ts` | browser best-effort `reportEarn` (fire-and-forget, never blocks play) |

## Endpoints (`app/api/v1/wallet/`)

- `GET  /api/v1/wallet` — caller balance (`{coins,shards,version,updated_at}`)
- `POST /api/v1/wallet/earn` — `{idempotency_key,event_type,payload}` → grant
- `POST /api/v1/wallet/spend` — `{idempotency_key,sku_id,quantity?}` → 409 on funds
- `GET  /api/v1/wallet/ledger?limit&cursor` — read-only audit trail
- `POST /api/v1/wallet/stripe-webhook` — coins-only mint, idempotent on event id

All routes derive `playerId` from the session (`getServerSession`). The client
never supplies a player id, amount, or currency.

## Adding a new earn reason (NO handler edits needed)

1. Add the code to `REASON` in `reward-rules.ts`.
2. Map the client `event_type` → that code in `EVENT_REASON`.
3. If it pays shards, add it to `SHARD_REASONS`.
4. Add a `DEFAULT_REWARD_RULES` entry (currency, formula, amounts, caps).
5. `yarn tsx scripts/seed-reward-rules.ts` to upsert an editable DB row.

That is the entire path — `earn()` resolves the reason, validates, computes,
caps, and writes the ledger row generically. To retune live pay, edit the
`RewardRule` row in the DB; no deploy required.

## Adding a new spend SKU

Add it to `CATALOG` in `catalog.ts` with a server-owned `unitPrice` and
`currency`. Coin packs (real-money) go in `COIN_PACKS`, keyed by Stripe price id
— **coins only, never shards.**

## Tests

`yarn tsx scripts/wallet-tests.ts` (also runs inside `scripts/standing-suite.ts`).
Covers the 5 spec acceptance cases + pure math + the ledger==balance invariant.
