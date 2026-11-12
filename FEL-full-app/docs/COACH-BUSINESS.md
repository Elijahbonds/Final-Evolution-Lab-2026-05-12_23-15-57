# Coach business in a box

Owner decisions of 2026-10-25:

- **Pricing.** A free tier and a paid Pro. The price and the free-tier client limit are settings: **Coach Pro is
  $39/month** and **Free keeps 3 clients** (owner, 2026-10-25).
- **Revenue share.** FEL takes 5% when a coach charges clients through it, using Stripe Connect: **"5% + Stripe fee on
  top"**. The buyer covers Stripe's processing fee and FEL keeps a clean 5% (lane `lane/coach-fee-passthrough`).
- **Go-live.** Payments go live only when the owner turns them on. Until then, everything is off by default and runs in Stripe test mode.

Lane `lane/coach-business`. The code is in `lib/coach-business/**`, `app/api/coach/business/**` and `components/coach-business/**`. It also touches `app/coach/[slug]` (the coach's public page), `app/coaches` (find a coach), `app/coach/business` (the coach's own dashboard) and `app/coach/highlight/[id]` (where a client approves a result).

## Switches and settings (all off or unset by default)

| Env | Meaning |
|---|---|
| `COACH_CONNECT_PAYMENTS_ENABLED` | Coaches charge clients through Stripe Connect (Express). Covers onboarding, package checkout, refunds and the payouts dashboard link. **Off:** every money route answers 409 `store_closed` with reason `payments_off`, and the pages say "Payments aren't live yet." |
| `COACH_CONNECT_LIVE` | A **live** Stripe key opens the Connect routes and the Coach Pro upgrade only while this is on. **Off:** test mode only. |
| `COACH_PRO_ENABLED` | Turns on the Free/Pro gates and puts Coach Pro on sale. **Off:** nothing is gated, so no coach loses anything they have today, and Pro is not sold. |
| `COACH_PRO_PRICE_USD_CENTS` | **Owner decision.** The Pro price per month. Unset (or not a whole number of cents from 100 to 1,000,000) means **3900, $39**. The one value behind every place the price shows or is charged: the Coach Pro upgrade, `/api/stripe/checkout` `FEL_COACH` (`lib/stripe.ts` reads it) and the B2B paywall line (`lib/pro-guard.ts`). |
| `COACH_FREE_CLIENT_LIMIT` | **Owner decision.** How many active clients a Free coach can have. Unset means **3**. |
| `COACH_MARKETPLACE_ENABLED` | Opens `/coaches` and applying to a coach. **Off:** `/coaches` is a 404. |
| `PLATFORM_FEE_BPS_FREE`, `PLATFORM_FEE_BPS_PRO` | **Owner decision (2026-10-27, in chat: "5% on free, 0% on Pro").** FEL's share in basis points by the coach's plan. Unset = **500 (5%)** on Free and **0 (0%)** on Pro. `PLATFORM_FEE_BPS_PRO=500` restores 5% on Pro. |
| `PLATFORM_FEE_CAP_CENTS_MONTHLY` | **Owner decision (open).** The most FEL takes from one coach per calendar month (UTC), in cents. Unset = no cap. Read from FEL's ledger. |
| `REFUND_PROCESSING_FEE` | **Owner decision (2026-10-27, in chat: "refund in full").** Unset = **on**: a refund also returns the buyer's share of the processing fee, and FEL absorbs Stripe's fee (store terms §2.6). `0`/`false`/`off`/`no` = the processing fee is not refunded (the old rule). |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | The signing secret of the "events on connected accounts" endpoint (same URL). Unset = `account.updated` never arrives. |

The coach's public page `/coach/[slug]` is open while **either** `COACH_STORE_ENABLED` or `COACH_MARKETPLACE_ENABLED` is on.

## Free and Pro

| Feature | Free | Pro |
|---|---|---|
| Active clients | Up to the limit | Unlimited |
| AI drafts | No | Yes |
| Live sessions | No | Yes |
| Payments | No | Yes |

- **Free** also covers the profile, packages people apply for, and the marketplace listing.
- **Who counts as Pro:** anyone with an active `FEL_COACH` or `FEL_FACILITY` subscription, or anyone on the coach-store allowlist.
- **FEL's fee** (owner, 2026-10-27): **5% on Free, 0% on Pro** (`PLATFORM_FEE_BPS_FREE` / `_PRO`). The buyer pays Stripe's processing fee on top in both cases.
- **The upgrade:** it sells the existing `FEL_COACH` product at `COACH_PRO_PRICE_USD_CENTS`. The existing webhook, verify-session and refund paths handle it.

The gates are wired in three places:

- **Client limit:** the invite-accept route `app/api/coach/invite/[token]`. A client who tries to join a full roster is told only that the coach is not taking new clients.
- **AI drafts:** `app/api/coach/drafts` (answers 402 to a Free coach).
- **Payments:** the Connect onboarding and checkout routes.

`coachFeatureRefusal(db, userId, 'live_sessions')` is ready for lane/coach-live to call.

## The money path

The owner's rule is "5% + Stripe fee on top". The code is `lib/coach-business/fees.ts` (`saleSplit`), and the Stripe rate
is one pair of constants in `config.ts`: `STRIPE_CARD_FEE_BPS = 290` and `STRIPE_CARD_FEE_FIXED_CENTS = 30`.
**Assumption:** Stripe's standard US card rate, 2.9% + 30¢.

Each sale is a **destination charge** on FEL's platform account, **grossed up**. For a listed price P:

| | Amount |
|---|---|
| FEL's share, F | 5% of P, rounded down to the cent (the coach keeps the fraction) |
| Buyer pays, T | the smallest amount with T − Stripe's fee(T) ≥ P, rounding Stripe's percentage **up** |
| Processing fee, X | T − P, shown to the buyer as its own line |
| `application_fee_amount`, A | F + X |
| Coach receives | T − A = **P − F**, exactly |
| FEL keeps | A − Stripe's fee = **F**, or F + 1¢ when Stripe rounds down. Never less, never negative. |

Stripe takes its fee from the platform on a destination charge, with or without `on_behalf_of`. So X is sized to cover
it, and FEL's 5% is left whole.

| Listed price | Buyer pays (price + fee) | Stripe's fee | FEL nets | Coach gets |
|---|---|---|---|---|
| $5.00 | $5.46 ($5.00 + $0.46) | $0.46 | $0.25 | $4.75 |
| $15.00 | $15.76 ($15.00 + $0.76) | $0.76 | $0.75 | $14.25 |
| $50.00 | $51.81 ($50.00 + $1.81) | $1.80 | $2.51 | $47.50 |
| $100.00 | $103.30 ($100.00 + $3.30) | $3.30 | $5.00 | $95.00 |
| $500.00 | $515.25 ($500.00 + $15.25) | $15.24 | $25.01 | $475.00 |

The Stripe fee here rounds to the nearest cent. `tests/coach-business/fee-passthrough.test.ts` checks every cent from $1
to $500 under rounding up, to the nearest cent and down. Under the old model (5% with Stripe's fee paid from it), FEL
netted −$0.09 on a $10 sale.

**What the buyer sees.** On the coach's page, a bookable package shows **Price, Processing fee, Total**
(`components/coach-business/fee-breakdown.tsx`), from the same `saleSplit` Stripe charges. Checkout then shows the same
two lines: the package, and "Processing fee".

**Where the money goes.**

- the money transfers to the coach's Express account (`transfer_data.destination`, with `on_behalf_of` set to the coach);
- FEL keeps `application_fee_amount` = A;
- the sale row records the listed price (`amountCents`) and FEL's 5% (`feeCents`), so nothing in the pending SQL changed.

### Monthly coaching (subscriptions)

A subscription can't carry a flat application fee. Stripe: "You can't set a subscription's recurring application fee as a
flat amount." This is the mechanism:

1. **Two monthly line items.** The coaching price P and the "Processing fee" X, so every invoice is itemised and totals
   T. The split is also written to the subscription's metadata, so every invoice carries it.
2. **`subscription_data.application_fee_percent`** = A / T, rounded **up** to Stripe's two decimals. The first invoice,
   which Checkout finalises at once, collects at least A and at most about 6¢ more (at $500).
3. **`invoice.created`** (each renewal, while it is still a draft): the webhook sets the invoice's
   `application_fee_amount` to A. Stripe: "The application_fee_amount set directly on an invoice overrides any
   application fee amount calculated with application_fee_percent."
   - The first invoice is skipped, because it is already final.
   - An invoice with a different total is skipped too: a proration keeps the percent.
4. **`invoice.paid`**: if Stripe took more than A, the webhook refunds the excess application fee to the coach.
   - This covers the first invoice, or a renewal whose draft wasn't updated in time.
   - The refund is state-based: it reads the fee's `amount_refunded` first, so a redelivery pays nothing twice.
   - Then the ledger books F for that month.

Every month ends with the coach at P − F and FEL at F (+1¢).

### Refunds

**Superseded 2026-10-27 (owner, in chat, card "refund-fee": "refund in full").** `REFUND_PROCESSING_FEE` now defaults
**on**: a refund returns the price **and** the same share of the processing fee, and FEL absorbs Stripe's fee (see
"Refunding the processing fee" under Payments-ready below). TUNED (money). The rule below is what `REFUND_PROCESSING_FEE=0`
still does.

**The old decision: the processing fee is not refunded.** A refund returns part or all of the **listed price**. Stripe keeps its
fee on a refunded charge, so returning X would make FEL pay Stripe's fee out of its own 5%.

- The refund sets `reverse_transfer`, so the coach's transfer is reversed in proportion.
- It does **not** set `refund_application_fee`. That would return the same share of the whole of A, processing fee
  included.
- Instead FEL hands back exactly its share of F (the cumulative refund ÷ P, rounded down) as an **application-fee
  refund** to the coach (`connect.ts returnApplicationFee`). It is state-based: it reads the fee's `amount_refunded`
  first and tops it up to the target, so neither a retry nor the webhook arriving after the route pays twice.

After a full refund the buyer is out X (Stripe's fee), the coach is at 0, and FEL is at 0 (or 1¢). If handing back the
share fails after Stripe accepted the refund, the route still answers the refund as done, and the `charge.refunded`
webhook finishes the step. **Owner call:** whether the buyer is told on the page that the processing fee isn't refunded.
That is policy copy, so this lane did not write it.

### Why destination charges, not direct charges

A direct charge would make the coach pay Stripe's fee and carry refunds and disputes, but it doesn't fit here:

- Stripe recommends **destination charges for Express accounts**. Direct charges are for accounts with the full Stripe
  Dashboard.
- With direct charges the price, the customer and the Checkout would all live on each coach's account, so FEL's
  platform customers wouldn't work.
- FEL stays liable for an Express account's negative balance either way.

The gross-up gets the owner's split on the charge type Stripe recommends here. The cost is that **FEL stays liable for
disputes** ("Stripe debits dispute amounts and fees from your platform account"), as before.

**Payouts.** Stripe pays out to the coach's bank on its own schedule. The dashboard links to the coach's Express dashboard.

**Ledger.** FEL's ledger books only FEL's 5%. The processing fee is Stripe's and never enters it.

- each fee is booked as `COACH_CONNECT_FEE` (EXTERNAL to PLATFORM_REVENUE). The key is `coach-connect-fee:<checkout session | invoice>`.
- each fee refund is booked as `COACH_CONNECT_FEE_REFUND`. The key is `coach-connect-refund:<charge>:<cumulative refunded>`.

**The webhook.** Events whose `metadata.product` is `COACH_CONNECT` go to the existing `/api/stripe/webhook`, ahead of the book path. The handler is idempotent per payment: a status changes only if it is still in the state the handler expects, and each ledger key is unique.

The fee steps (a refund's share, the renewal fee, the true-up) are Stripe calls made for events about sales that
already exist. They run whatever the payments switch says now, so a coach whose client renews after payments are
switched off still gets the right split. With every switch off, no route makes a Stripe call.

**The shared refund path (fixed in this lane).** The book refund path remembers each `charge.refunded` event id in the
book store before the coach store's handler runs. When the coach store failed and Stripe retried, the retry was answered
`deduped`, and that refund was lost. Each handler now dedupes for itself: the book path answers only when it revoked a
book, and every later handler is idempotent on its own. `tests/coach-business/webhook-retry.test.ts` covers this: the
first attempt fails and the retry records the refund. The same test fails on the route as it was before the fix.

## Pending SQL (the owner applies it)

The SQL is in `prisma/pending/2026-10-25-coach-business.sql`. It is additive only: 6 tables, 13 indexes and 7 foreign keys.

- The file header has the Prisma model text and the apply, verify and rollback steps.
- It is safe in either order with the deploy. Until the tables exist, every coach-business write answers 503 `coach_business_not_ready`, and the public page shows what it shows today.

## Turning payments on (the owner's steps)

1. Apply the pending SQL (above).
2. **Stripe Dashboard, test mode, Connect:**
   - enable Connect, with Express accounts, platform profile and branding;
   - set the platform as liable for refunds and disputes. Destination charges make the platform liable for both, so read Stripe's risk terms.
3. On the existing webhook endpoint, subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.created`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` and `charge.refunded`. Most of these are already on for the coach store. `invoice.created` is new: it sets each monthly renewal's exact fee.
4. Set `COACH_CONNECT_PAYMENTS_ENABLED=1`, with a **test** key and `NEXTAUTH_URL`. Onboard a test coach, buy a package with card 4242 4242 4242 4242, refund it, and check the ledger rows.
   - Also check, in the Stripe dashboard, that the payment's application fee is 5% + the processing fee, and that the
     Stripe fee on the balance transaction is the processing fee (or 1¢ less).
   - Refund half, and check the application fee shows a refund of half of FEL's 5%.
5. `COACH_PRO_PRICE_USD_CENTS` (default $39) and `COACH_FREE_CLIENT_LIMIT` (default 3) only need setting to change them. Then set `COACH_PRO_ENABLED=1`.
6. Set `COACH_MARKETPLACE_ENABLED=1` when coaches are listed.
7. Live mode: set `COACH_CONNECT_LIVE=1` and the live key, together with the coach-store go-live items below.

   Live mode stays off until:

   - ~~the coach terms and payout terms are signed~~ — **written 2026-10-27** on the owner's approval (`/coach-terms`,
     `lib/coach-terms.ts`, card C12; not lawyer-reviewed). `COACH_TERMS_VERSION` is set, so live mode no longer refuses
     with `coach_terms_unsigned`: it now waits only on `COACH_CONNECT_LIVE` and the live key, which are the owner's;
   - the business address is set (it is: `lib/legal/business.ts`);
   - ~~refund and dispute ownership is decided~~ — **decided 2026-10-27**: refunds in full (`REFUND_PROCESSING_FEE` on);
     the coach bears a dispute's fee and loss, and FEL may recover it and a negative balance from future payouts (the
     coach terms §7). **Not built:** that recovery. The terms give FEL the right, but no code takes it yet.

## Payments-ready (lane `lane/payments-ready`, 2026-10-26)

What the code does so that payments work safely the moment the owner signs the terms and sets the keys. Every default
is today's behaviour. `npx tsx scripts/payments-preflight.ts --env-file <deploy env file>` checks a config before each
switch-on (it prints no secret).

- **Terms ticks.** The buyer ticks the store terms before a package checkout (409 `terms_required` otherwise), and the
  version and time ride on the Checkout Session, payment and subscription metadata (`terms_version`,
  `terms_accepted_at`), the store terms' own pattern. The coach ticks the coach terms before Connect onboarding; the
  acceptance is kept on the Express account's metadata (`coach_terms_version`, `coach_terms_accepted_at`).
  **The coach and payout terms are written (2026-10-27, card C12):** `COACH_TERMS_VERSION` = `coach-terms-2026-10-27`,
  `COACH_TERMS_HREF` = `/coach-terms` (the text is `lib/coach-terms.ts`). Buyers of a coach's package tick the Purchase
  Terms (`/purchase-terms`, card C28) instead of the coach store's terms. Were the version ever `null` again, test mode
  would record a placeholder version and live mode would refuse to start (409 `store_closed` `coach_terms_unsigned`).
- **`account.updated`** (Connect endpoint) re-reads the coach's account from Stripe and keeps charges, payouts,
  details and, once `2026-10-26-payments-ready.sql` is applied, `requirementsDue`. `/coach/business` shows "Finish your
  Stripe setup" until all are done.
- **Disputes** on a coach's sale (`charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn`,
  `.funds_reinstated` on the platform endpoint) are recorded per dispute on the sale (`CoachSaleDispute`), shown to the
  coach on `/coach/business`, and FEL's ledger books what Stripe withdrew (amount + dispute fee,
  `COACH_CONNECT_DISPUTE_WITHDRAWN`) and returned (`COACH_CONNECT_DISPUTE_REINSTATED`), once per dispute. A dispute on a
  destination charge is FEL's money. **Not built (owner call, payout terms):** recovering a lost dispute from the coach.
- **Refunding the processing fee** (`REFUND_PROCESSING_FEE`, on by default since 2026-10-27): a refund of part R of the price refunds R plus the same
  share of X to the buyer; FEL hands the coach back its share of F **and** of X, so the coach ends exactly where they do
  today; the X share is booked as `COACH_CONNECT_PROCESSING_FEE_REFUND` (FEL absorbing Stripe's fee). A Dashboard refund
  of any size maps back to the price share it covers.
- **The platform fee** is `platformFee(plan, price, month so far)` (`lib/coach-business/fees.ts`). Under a cap, the
  month so far is FEL's `COACH_CONNECT_FEE` less `COACH_CONNECT_FEE_REFUND` for that coach this UTC month (every ledger
  row now carries the `coachId`), plus the coach's open checkouts. A monthly renewal is capped on its draft
  (`invoice.created` writes the capped split on the invoice's own metadata); `invoice.paid` caps a renewal whose draft
  was missed. The plan is read as today (`planServer.ts`): a failed read counts as Pro, on purpose (coordinator,
  2026-10-26: charging a coach more than their plan allows is worse than FEL losing a few cents), so a sale made during a
  database blip takes the Pro rate; one PII-free log line says so.

**Owner's Stripe steps this adds:** on the platform endpoint also subscribe `charge.dispute.created`,
`charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`;
add a second endpoint, same URL, for **events on connected accounts** with `account.updated`, and put its signing secret
in `STRIPE_CONNECT_WEBHOOK_SECRET`; apply `prisma/pending/2026-10-26-payments-ready.sql` after the coach-business file.

## Known limits

- A **monthly** sale is cancelled from the dashboard, not refunded. Refund its invoice in the Stripe dashboard instead. That refund's charge carries no sale metadata, so FEL's fee refund for it is not booked automatically.
- **Connect account status** is refreshed when the coach comes back from onboarding (`GET /api/coach/business/connect`), and by `account.updated` once the Connect endpoint and `STRIPE_CONNECT_WEBHOOK_SECRET` are set (payments-ready).
- **Reviews:** no rating system exists, so the page shows only client-approved results, and the JSON-LD claims no rating.
- **Stripe's card fee** is passed to the buyer (above). The processing fee is sized to **US cards at 2.9% + 30¢**.
  - Cards that cost more come out of FEL's 5%. International cards are +1.5% and currency conversion +1%. On an
    international card FEL nets about 3.5% instead of 5%. It is still positive at every price from $1.
  - If Stripe's rate for the account differs, change the two constants in `config.ts`.
- **A refund from the Stripe dashboard** should leave "refund application fee" unticked. The `charge.refunded` webhook
  then hands back FEL's exact share. Ticking it returns a share of the whole application fee, processing fee included, and
  the webhook adds nothing on top.
- **A monthly invoice with a different total** (a proration or a discount) keeps the percent fee and isn't trued up. FEL
  books 5% of the coaching part. Coaches can't change a running subscription today, so this doesn't happen yet.
