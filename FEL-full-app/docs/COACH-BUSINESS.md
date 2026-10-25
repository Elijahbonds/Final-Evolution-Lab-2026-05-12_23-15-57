# Coach business in a box

Owner decisions of 2026-10-25:

- **Pricing.** A free tier and a paid Pro. The price and the free-tier client limit are settings.
- **Revenue share.** FEL takes 5% when a coach charges clients through it, using Stripe Connect.
- **Go-live.** Payments go live only when the owner turns them on. Until then, everything is off by default and runs in Stripe test mode.

Lane `lane/coach-business`. The code is in `lib/coach-business/**`, `app/api/coach/business/**` and `components/coach-business/**`. It also touches `app/coach/[slug]` (the coach's public page), `app/coaches` (find a coach), `app/coach/business` (the coach's own dashboard) and `app/coach/highlight/[id]` (where a client approves a result).

## Switches and settings (all off or unset by default)

| Env | Meaning |
|---|---|
| `COACH_CONNECT_PAYMENTS_ENABLED` | Coaches charge clients through Stripe Connect (Express). Covers onboarding, package checkout, refunds and the payouts dashboard link. **Off:** every money route answers 409 `store_closed` with reason `payments_off`, and the pages say "Payments aren't live yet." |
| `COACH_CONNECT_LIVE` | A **live** Stripe key opens the Connect routes and the Coach Pro upgrade only while this is on. **Off:** test mode only. |
| `COACH_PRO_ENABLED` | Turns on the Free/Pro gates and puts Coach Pro on sale. **Off:** nothing is gated, so no coach loses anything they have today, and Pro is not sold. |
| `COACH_PRO_PRICE_USD_CENTS` | **Owner decision.** The Pro price per month. It has no default: while it is unset, the upgrade answers 409 `price_not_set`. |
| `COACH_FREE_CLIENT_LIMIT` | **Owner decision.** How many active clients a Free coach can have. Unset means 3, a placeholder for "a few". |
| `COACH_MARKETPLACE_ENABLED` | Opens `/coaches` and applying to a coach. **Off:** `/coaches` is a 404. |

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
- **The upgrade:** it sells the existing `FEL_COACH` product at `COACH_PRO_PRICE_USD_CENTS`. The existing webhook, verify-session and refund paths handle it.

The gates are wired in three places:

- **Client limit:** the invite-accept route `app/api/coach/invite/[token]`. A client who tries to join a full roster is told only that the coach is not taking new clients.
- **AI drafts:** `app/api/coach/drafts` (answers 402 to a Free coach).
- **Payments:** the Connect onboarding and checkout routes.

`coachFeatureRefusal(db, userId, 'live_sessions')` is ready for lane/coach-live to call.

## The money path

Each sale is a **destination charge** on FEL's platform account:

- the money transfers to the coach's Express account (`transfer_data.destination`, with `on_behalf_of` set to the coach);
- FEL keeps `application_fee_amount`, which is 5% of the price rounded down to the cent;
- monthly coaching is a subscription with `application_fee_percent: 5`.

**Refunds.** A refund sets `reverse_transfer` and `refund_application_fee`, so the coach's transfer is reversed and FEL's fee comes back in proportion.

**Payouts.** Stripe pays out to the coach's bank on its own schedule. The dashboard links to the coach's Express dashboard.

**Ledger.** FEL's ledger books only FEL's fee:

- each fee is booked as `COACH_CONNECT_FEE` (EXTERNAL to PLATFORM_REVENUE). The key is `coach-connect-fee:<checkout session | invoice>`.
- each fee refund is booked as `COACH_CONNECT_FEE_REFUND`. The key is `coach-connect-refund:<charge>:<cumulative refunded>`.

**The webhook.** Events whose `metadata.product` is `COACH_CONNECT` go to the existing `/api/stripe/webhook`, ahead of the book path. The handler is idempotent per payment: a status changes only if it is still in the state the handler expects, and each ledger key is unique.

## Pending SQL (the owner applies it)

The SQL is in `prisma/pending/2026-10-25-coach-business.sql`. It is additive only: 6 tables, 13 indexes and 7 foreign keys.

- The file header has the Prisma model text and the apply, verify and rollback steps.
- It is safe in either order with the deploy. Until the tables exist, every coach-business write answers 503 `coach_business_not_ready`, and the public page shows what it shows today.

## Turning payments on (the owner's steps)

1. Apply the pending SQL (above).
2. **Stripe Dashboard, test mode, Connect:**
   - enable Connect, with Express accounts, platform profile and branding;
   - set the platform as liable for refunds and disputes. Destination charges make the platform liable for both, so read Stripe's risk terms.
3. On the existing webhook endpoint, subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` and `charge.refunded`. Most of these are already on for the coach store.
4. Set `COACH_CONNECT_PAYMENTS_ENABLED=1`, with a **test** key and `NEXTAUTH_URL`. Onboard a test coach, buy a package with card 4242 4242 4242 4242, refund it, and check the ledger rows.
5. Set `COACH_PRO_PRICE_USD_CENTS` and `COACH_FREE_CLIENT_LIMIT`, then `COACH_PRO_ENABLED=1`.
6. Set `COACH_MARKETPLACE_ENABLED=1` when coaches are listed.
7. Live mode: set `COACH_CONNECT_LIVE=1` and the live key, together with the coach-store go-live items below.

   Live mode stays off until:

   - the coach terms and payout terms are signed (see the drafts the lane left for the owner);
   - the business address is set;
   - refund and dispute ownership is decided.

## Known limits

- A **monthly** sale is cancelled from the dashboard, not refunded. Refund its invoice in the Stripe dashboard instead. That refund's charge carries no sale metadata, so FEL's fee refund for it is not booked automatically.
- **Connect account status** is refreshed when the coach comes back from onboarding (`GET /api/coach/business/connect`). There is no `account.updated` Connect webhook yet.
- **Reviews:** no rating system exists, so the page shows only client-approved results, and the JSON-LD claims no rating.
- **Stripe's card fee:** on a destination charge, the platform pays it out of the 5%. At about 2.9% + 30¢, FEL's net per sale is about 2.1% − 30¢. That is negative below roughly $14.
