# Launch sales: switch-on day

Lane `lane/launch-sales` (P0 in `docs/PLATFORM-ROADMAP.md` on `lane/platform-roadmap`), 2026-10-20. This lane fixed the
money paths in Stripe **test** mode and turned nothing on. Every switch below is still off by default, and no live
key exists in the repo. This page is the owner's checklist for the day he turns selling on.

The owner's decisions it follows (2026-10-20): sell first FEL Pro, courses and coaching, cosmetics and the season pass
PRO lane, and the owner's books. The platform fee is 15% (`lib/fees.ts`). Real-money competition stays off. No ads,
ever.

---

## 1. What changed in code

| Fix | Before | After |
|---|---|---|
| **B-W3: FEL Pro checkout** (`lib/stripe/checkout-fulfil.ts`) | Read `subscription.current_period_end`, which basil removed. `new Date(NaN)` reached Prisma, which refuses an Invalid Date, so the webhook answered 500 on every retry and **no Pro subscription was ever written** | The period is read from `subscription.items.data[].current_period_end` (`lib/stripe/basil-shapes.ts`). An unknown period is left unset, never invalid |
| **B-W3: renewals** (`invoice.paid`) | Read `invoice.subscription` (removed): every renewal returned early. No ledger row, the period never moved | Reads `invoice.parent.subscription_details.subscription`. The ledger row is keyed on the invoice (`stripe-invoice:<id>`), so a retried event books once. If `invoice.paid` lands before `checkout.session.completed`, the row is written from the subscription's metadata (checkout now sets `subscription_data.metadata`) |
| **B-W3: failed payments** (`invoice.payment_failed`) | Same early return: a failed payment never marked the row PAST_DUE | PAST_DUE |
| **B-W3: subscription updates** | Invalid Date again: 500 on every retry | Period from the item. A stale "active" update after a refund does not re-open a cancelled row (Stripe is asked) |
| **B-W2: FEL Coach / FEL Facility** | The checkout wrote no Order and no Subscription row | Both write them, like FEL Pro |
| **18+ check** | `/api/stripe/checkout`, `/api/season/checkout`, `/api/v1/wallet/checkout`, `/api/v1/wallet/shard-checkout` and `/api/studio/credits` sold to anyone signed in | 403 `{ error: 'adults_only', reason: 'under_18' \| 'age_unknown' }` before any Stripe call (`lib/stripe/adult-gate.ts`; the database `dobYear`, the strict rule; unknown age is not an adult). The coach store and books already refused (403 `adults_only`) |
| **Refunds** (`charge.refunded` on `/api/stripe/webhook`) | Only books and coach-store rows whose charge carried metadata were revoked. FEL Pro, cosmetics, the season pass, coins and coach-store memberships kept what was refunded | `lib/stripe/refund-revoke.ts`: a full refund of a subscription payment sets the row CANCELED, reverses the payment in the ledger and **cancels the Stripe subscription** so it never bills again; a cosmetic Order goes REFUNDED and its sale is reversed; a membership's refund is found through the invoice and reversed by the coach store's own code; season pass, coins and shards use the wallet webhook's refund. A partial refund revokes nothing |
| **One webhook endpoint** | Coins, shards and the season pass were fulfilled only by `/api/v1/wallet/stripe-webhook`, which verifies with the same `STRIPE_WEBHOOK_SECRET` as `/api/stripe/webhook`. One secret means only one endpoint can be subscribed, so with the coach-store runbook's endpoint the season pass was never granted by a webhook | `/api/stripe/webhook` runs the wallet's code too (`lib/wallet/stripe-wallet-events.ts`, moved unchanged). Subscribe that one endpoint |
| **Replays after a refund** | A reloaded success page (verify-session) or a redelivered checkout event set a refunded Order back to PAID and a cancelled subscription back to ACTIVE | Neither re-opens: a REFUNDED Order stays REFUNDED, and Stripe's own status decides a subscription |

Tests, all on fixture events in the current Stripe API shape (`tests/helpers/stripeSales.ts`; tsc checks every
fixture against the SDK's types, so none can carry a removed field):

- `lib/stripe/webhook-basil.test.ts`: B-W3, event by event (measured: 9 of its 15 tests fail on the old handlers).
- `lib/coach-store/out-of-lane.test.ts`: the two skipped B-W2 / B-W3 tests, now real (both fail on the old handlers).
- `lib/stripe/adult-gate.test.ts`: the 18+ rule on its own (adult, under 18, a gap of exactly 18, unknown age).
- `lib/stripe/launch-sales-matrix.test.ts` (26) and `lib/coach-store/launch-sales-matrix.test.ts` (27): the
  per-product matrix below. Measured: without the refund path, 12 of the 53 fail (every refund case except books and
  the coach store's metadata-carrying rows, which already had one).

## 2. The product matrix (each row is a test)

| Product | Route | Adult buys | Under 18 / unknown age | Refund revokes |
|---|---|---|---|---|
| FEL Pro weekly ($6.00) | `/api/stripe/checkout` `FEL_PRO` | 200, Subscription ACTIVE, Pro gate open | 403 `adults_only` `under_18` / `age_unknown` | Subscription CANCELED, Pro gate closed, payment reversed, Stripe subscription cancelled |
| FEL Pro monthly ($9.99) | `/api/stripe/checkout` `FEL_PRO_MONTHLY` | same | same | same |
| Season pass PRO lane | `/api/season/checkout` | 200, lane opened by the shared webhook | same | lane closed, PRO cosmetics withdrawn (free-lane items stay) |
| Cosmetic SKU | `/api/stripe/checkout` `COSMETIC` | 200, Order PAID | same | Order REFUNDED, sale reversed |
| Coin pack | `/api/v1/wallet/checkout` | 200, coins minted once per session | same | coins debited (clamped at 0) |
| Books (audiobook) | `/api/books/checkout` | 200, entitlement ACTIVE | 403 `adults_only` | entitlement REVOKED |
| Coach store: program, course, series, bundle | `/api/coach-store/checkout` | 200, access ACTIVE | 403 `adults_only` | access REFUNDED, closed |
| Coach store: membership, teen membership (parent-bought) | same | 200, access ACTIVE | same | access REFUNDED, closed, Stripe subscription cancelled |
| Coach store: live 1:1, video review | same | 200, booking PAID | same | booking REFUNDED |

Not on the launch list but behind the same gate: shard packs and studio credit packs (403 for minors, tested).

## 3. Before the day (the owner's, in any order)

- **Signed store terms** replace the drafts (`docs/coach-store.md`, "Real-money gates still open").
- **The refund policy**, one page for every product (roadmap §4.2). Section 9 lists the text this lane could not write.
- **Business mailing address** in the coach-store dashboard, and the **CA refund business days**
  (`Instructor.refundBusinessDays` stays null until then).
- **The season pass PRO price** (`SEASON_PASS_PRO_PRICE_USD_CENTS`; there is no default on purpose).
- **Book prices and copy** (`lib/books/bookCatalog.ts`: every price is an EXAMPLE, every description a placeholder),
  and the audio files uploaded (`docs/BOOK-SHOP.md`, "Storage layout").
- **Sales tax**: Stripe Tax on or off, with an accountant (`STRIPE_BOOKS_TAX` only covers books today).

## 4. SQL first (applied by the owner, read-only diff first)

Run the read-only preview in `docs/SHIP-READINESS.md` §3.2 against production, then apply only what it lists. For
selling, in this order:

1. `prisma/pending/2026-10-04-coach-store-instructor.sql`
2. `prisma/pending/2026-10-04-coach-store-program-access.sql`
3. `prisma/pending/2026-10-04-coach-store-booking.sql`
4. `prisma/pending/2026-10-04-coach-store-call-signal.sql` (needs Booking)
5. `prisma/pending/2026-10-04-coach-store-referral.sql`
6. `prisma/pending/2026-10-09-book-shop.sql`, then add its two models (and `User.bookEntitlements`) to
   `prisma/schema.prisma` and regenerate `public/_prisma/client` **on Linux** (`docs/BOOK-SHOP.md`, "Database"). That
   changes what deploys, so it is the owner's step and its own deploy.

FEL Pro, cosmetics, coins and the season pass need no new SQL: `Subscription`, `Order`, the ledger, the wallet and the
season tables are already in production's schema.

## 5. Switch-on, in test mode first (a preview deploy)

Never set a live key while testing. Set the values in the deploy tree's env file, never in this repo.

**Step 1. Stripe (test mode).**

1. `STRIPE_SECRET_KEY` = the platform **test** key (`sk_test_…`).
2. In the Stripe Dashboard (test mode), add **one** webhook endpoint: `https://<preview host>/api/stripe/webhook`,
   with these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.
3. `STRIPE_WEBHOOK_SECRET` = that endpoint's signing secret. Do **not** also subscribe `/api/v1/wallet/stripe-webhook`
   or `/api/books/webhook`: the shared endpoint handles every product now.
4. `NEXTAUTH_URL` = the preview's origin (Stripe's return URLs come from it).
5. Optional, recommended: `COACH_STORE_RECONCILE_SECRET` and a scheduled call to `/api/coach-store/reconcile` (catches
   checkouts nobody came back from and Dashboard refunds if a webhook is missed).

**Step 2. The coach store** (after SQL 1–5): `COACH_STORE_ENABLED=1`, `COACH_STORE_COACH_USER_IDS=<Elijah's user id>`,
then `COACH_STORE_PAYMENTS_ENABLED=1`. For video review: `COACH_REVIEWS_BUCKET=<private bucket>` and
`COACH_REVIEW_UPLOADS_ENABLED=1`.

**Step 3. FEL Pro, cosmetics, coins:** `VIRTUAL_PURCHASES_ENABLED=1`. Read the warning in section 8 first: this one
switch also opens FEL Coach, FEL Facility and shard packs.

**Step 4. The season pass PRO lane:** `SEASON_PASS_PRO_PRICE_USD_CENTS=<the owner's price in cents>`, then
`SEASON_PASS_PURCHASE=1` (it also needs step 3).

**Step 5. Books** (after SQL 6 and its deploy): `BOOK_STORE_ENABLED=1` (it also needs step 3).

To close any product again, unset its switch. Paid buyers keep what they own, and fulfilment and refunds keep working
with every switch off.

## 6. Test purchases (test mode, before going live)

Use three accounts: a verified adult (birth year 1990), a 15-year-old, and an account with no birth year. Card
`4242 4242 4242 4242`, any future date, any CVC. For each product:

| # | Do | Expect |
|---|---|---|
| 1 | Buy as the 15-year-old, then as the no-birth-year account | The buy button's request answers 403 `adults_only` (`under_18`, `age_unknown`); nothing appears in Stripe |
| 2 | Buy as the adult | Checkout opens; after paying, the thing is there (Pro on `/account`, the PRO lane, the coins, My Library, the coach program, the booking) |
| 3 | Reload the success page | Nothing is granted twice (one Order, one ledger row, one set of coins) |
| 4 | Refund the payment **in full** in the Dashboard | Within a minute it is gone: Pro off and the subscription cancelled in Stripe, PRO lane closed, coins debited, the book revoked, the coach access or booking REFUNDED |
| 5 | Reload the old success page after the refund | It stays revoked |

Then, for FEL Pro and the coach-store membership:

- **Renewal:** let a weekly FEL Pro run one week, or reset the billing cycle on the subscription in the Dashboard
  ("Update subscription"). Expect `currentPeriodEnd` to move and one `SUBSCRIPTION_PAYMENT_FEL_PRO` ledger row per
  invoice. assumption: the Dashboard's reset raises an `invoice.paid`; a week of waiting certainly does.
- **Failed payment:** make `4000 0000 0000 0341` the subscription's payment method (it attaches, then every charge
  fails), and bill. Expect the row PAST_DUE.
- **Partial refund:** refund part of a payment. Nothing is revoked (a goodwill credit is not a cancellation).

Check the webhook's deliveries in the Dashboard: every event should answer 200. A 500 means retry; look at the logs.

## 7. Going live (a separate day, the owner's)

1. Everything in sections 3, 4 and 6 done, in test mode, on a preview.
2. A **live** webhook endpoint (live mode has its own endpoints and secret): the same URL and events on production;
   `STRIPE_WEBHOOK_SECRET` = the live secret.
3. `STRIPE_SECRET_KEY` = the live key, and for the coach store `COACH_STORE_LIVE=1`.
4. **Books cannot go live by a switch.** `assertStripeTestKey` refuses any key but `sk_test_`; going live is a code
   change (`docs/BOOK-SHOP.md`, go-live step 9).
5. One real low-price purchase and refund per product, then watch the webhook deliveries for a day.

## 8. What is still open (owner calls)

1. **`VIRTUAL_PURCHASES_ENABLED` is all or nothing.** It opens FEL Pro, cosmetics and coins, but also FEL Coach and
   FEL Facility (roadmap: after launch), shard packs (roadmap: not at launch) and the legacy coach block and
   marketplace listings. (a) **Add a per-product allow list next to it** *(recommended: one small change in
   `/api/stripe/checkout` and the wallet routes)*; (b) accept it for launch.
   **Built (payments-ready, 2026-10-26):** `PURCHASES_ALLOWLIST` (`lib/payments/allowlist.ts`). Unset = as above; set,
   e.g. `PURCHASES_ALLOWLIST=fel_pro,coins`, = only those sell. FEL Pro now also asks the store-terms tick before Stripe
   (409 `terms_required`), with the version and time on the session and subscription metadata.
   **The buy page:** every "Get FEL Pro" link was a GET to the POST-only `/api/stripe/checkout` (405), so nobody could
   buy. They now open `/pro` (signed in only): weekly or monthly at the existing prices, the store-terms tick, and a
   button that POSTs and goes to Stripe. While FEL Pro is closed it shows "FEL Pro isn't on sale yet." Every refusal
   (18+, terms, already Pro) is the route's own answer. The B2B paywalls' links go to the Coach Pro card on
   `/coach/business`; FEL Facility has no buy page yet.
2. **The cosmetic SKU delivers no item.** `cosm-chrome-visor` writes an Order and nothing reads it: no wardrobe item is
   granted and no UI sells it. Cosmetics are really bought with coins. (a) **Do not sell the SKU; sell coins**
   *(recommended)*; (b) wire the SKU to a wardrobe item first.
3. **A refunded coin pack's cosmetics stay.** Coins are debited, clamped at 0; anything already bought with them is
   kept. (The season pass withdraws its own cosmetics.)
4. **Disputes** (`charge.dispute.created`) are handled for the coach store only. A disputed FEL Pro, cosmetic, coin or
   season payment keeps its entitlement until it is refunded or lost. The coach store's reconcile route is the model.
5. **The refusal body differs slightly.** The new gate answers `{ error: 'adults_only', reason, message }`; the coach
   store and books answer `{ error: 'adults_only' }`. Every client can key on `error`. Aligning them changes the
   coach-store tests that pin the exact body.
6. **Coach-store ledger on refund.** The coach store does not reverse its sale in the ledger on a refund (it did not
   before this lane either); FEL Pro and cosmetics now do.
7. **A refunded studio-credit pack keeps its credits.** Not on the launch list. Its Order goes REFUNDED, but the
   credits it granted are not debited. (a) **Keep studio credits closed until a debit is added** *(recommended)*;
   (b) accept it. It sells only while `STUDIO_CREATOR_ENABLED` is on as well as `VIRTUAL_PURCHASES_ENABLED`.

## 9. Text the owner (and counsel) must write

This lane edited no legal or policy copy. Needed before going live:

- **Refund policy** (one page): FEL Pro (weekly and monthly: is the current period refunded? a refund ends Pro at once
  and cancels the subscription, which is what the code does now), the season pass PRO lane (a refund withdraws its
  cosmetics), coin packs (unspent coins are taken back; what was bought with them stays), the cosmetic SKU if it is
  sold, books (`store-terms-2026-10-12` already says 14 days and a refund ends the license), coach-store programs,
  courses, series, bundles, memberships, 1:1 and video review (the cancel rules in `lib/coach-store/policy.ts`, and the
  CA refund days).
- **Store terms** that cover FEL Pro, the season pass, coins and cosmetics as Final Evolution LLC's own sales (today's
  signed-terms gap is named in `docs/coach-store.md`), including "18+ only, verified by birth year" and auto-renewal
  disclosure for FEL Pro and memberships (California's automatic renewal law needs clear terms and an easy cancel;
  assumption: counsel confirms what applies).
- **Purchase screen copy** for the 403: today the messages are plain product lines ("Purchases are for verified adults
  (18+)." and "Confirm your birth year to buy…") in `lib/stripe/adult-gate.ts`.
- **Privacy §7/§10**: Stripe as processor for every product, not only the coach store.
