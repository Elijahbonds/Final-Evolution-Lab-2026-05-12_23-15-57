# FEL Creator Platform — Phase 1 storefront

Team profiles, bookable services, merch (stubbed), a media kit and a "Work with us" form, built on top of the Final Evolution Press book shop (`docs/BOOK-SHOP.md`). This is our own build; nothing is copied from MILLIONS.

Nothing here is live. Every rate, price, stat and open hour is an **EXAMPLE**. Booking checkout is Stripe **test mode** and refuses a live key. Printful, Instagram and Stripe Connect are stubs that make no network calls. This branch deploys nothing, changes no Prisma schema, and does not deploy Firestore rules.

## What Elijah has to decide

1. **Printful vs Printify.** Printful is the first fulfillment module (`lib/creator/printful.ts`). Printify is declared, so a product can name it, but its module refuses until it is built. `manual` covers owayo jerseys and self-shipped inventory like signed basketballs.
2. **Services.** Two placeholder services are listed on `elijah-bonds` (`1-on-1 session (EXAMPLE)`, `Consult call (EXAMPLE)`). Replace the names, descriptions and durations in `lib/creator/creatorCatalog.ts`.
3. **Prices and rates.** Replace `priceCents` on services, products and media-kit packages, and set `priceIsExample: false` only when a number is real.
4. **Open hours.** `weeklyHours` are example hours (Tue/Thu 16:00–19:00, Sat 10:00–13:00, Los Angeles). Replace them and set `hoursAreExample: false`.
5. **Creator split.** Fulfillment orders store the provider's item cost (`itemCostCents`) so a payout split can be computed later. The split itself is not decided or built.
6. **Which Stripe account.** Bookings use the book shop's Stripe client and key (`STRIPE_BOOKS_SECRET_KEY`, falling back to `STRIPE_SECRET_KEY`). If creator revenue belongs in a different account, that is a new env var and a small change in `lib/creator/creatorCheckout.ts`.
7. **Stripe Connect** for paying teammates. `createOnboardingLink()` is a stub.
8. **Content.** The bio (`Bio placeholder.`), specialty, reels, highlights and past partners are placeholders. The past-partner list is taken from the Press partner links and is marked unconfirmed.
9. **Teammates.** `example-teammate` is `approved: false` and never renders. Add real people only with their real copy, and set `approved: true` when they sign off.

## Routes

| Route | What it does |
|---|---|
| `/team` | Approved profiles only. |
| `/team/[slug]` | Photo, bio, specialty, reels, links, merch, services with "starting at" rates, "Request a quote". Unknown or unapproved slug → 404. The payout block ("Get paid: coming soon") shows only to the profile owner (`ownerEmails`) or an `admin`/`owner` session. |
| `/team/[slug]/book/[serviceId]` | Slot picker for one service, then Checkout. |
| `/bookings/success` | Stripe returns here. Reads the session (test key only) and shows what was booked. The webhook confirms the booking, not this page. |
| `/media-kit` | Bio, highlights, audience stats (fixture, "Example data" badge), past partners, packages and rates, "Inquire". |
| `/work-with-us` | Inquiry form. `?profile=<slug>` and `?source=media-kit` are recorded on the inquiry. |
| `GET /api/creator/slots?service=<id>` | Future free slots for an approved service. Times only. |
| `POST /api/creator/checkout` | `{ serviceId, slotStart, email? }`. Test-key guard, server-side slot check, Firestore hold in a transaction, Checkout Session (`metadata.product = 'SERVICE'`, `price_data` from the catalog, `expires_at` 31 minutes). Guest checkout allowed. 409 if the slot is taken. |
| `POST /api/creator/webhook` | Stripe signature with `STRIPE_CREATOR_WEBHOOK_SECRET`. Handles `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`. Idempotent by event id. |
| `POST /api/creator/inquiry` | Validated with zod, honeypot field `website`, per-IP rate limit (5 per 10 minutes). 201 / 400 / 429. No auto-reply. |

A **Team** door is on the Profile tab (`lib/nav/doors.ts`).

## Environment

Set these on the server. Do not commit values. `.env.example` lists them empty.

| Variable | Purpose |
|---|---|
| `STRIPE_BOOKS_SECRET_KEY` | Shared with the book shop. Must be `sk_test_...`; anything else is refused before a hold or a Stripe call. |
| `STRIPE_CREATOR_WEBHOOK_SECRET` | Signing secret of the `/api/creator/webhook` endpoint. No fallback to the other webhook secrets. |
| `PRINTFUL_ENABLED` | `1` to put Printful in dry-run mode. Needs `PRINTFUL_API_TOKEN` too. Default off. |
| `PRINTFUL_API_TOKEN` | Printful token. Read only to decide the mode; this build never sends it anywhere. |
| `STRIPE_CONNECT_ENABLED` | `1` makes `createOnboardingLink()` throw "not implemented" instead of returning `CONNECT_DISABLED`. No Connect call either way. |
| `CREATOR_IP_SALT` | HMAC key for the inquiry `ipHash`. Unset = `ipHash` is stored as `null` (never an unsalted hash, never the IP). |
| `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` | The same service account the book shop uses. Firestore is reached through `firebase-admin` with it. |
| `FIREBASE_PROJECT_ID` | Optional. Taken from the JSON's `project_id` or the service-account email when unset. |

Flags follow `lib/flags.ts`: on only for `1`, `true`, `on` or `yes`.

## Firestore

Server-only, through `firebase-admin` (`lib/creator/creatorStore.firestore.ts`), behind the `CreatorStore` interface (`lib/creator/creatorStore.ts`). The browser never talks to Firestore. Without the service account, the booking and inquiry routes answer 503; pages still render.

| Collection | Doc id | Written by |
|---|---|---|
| `bookings` | booking id (UUID) | checkout (`HOLD`), webhook (`CONFIRMED`, `EXPIRED`, `CANCELLED`, `CONFLICT`), a Stripe failure (`FAILED`) |
| `slotHolds` | `<profileSlug>_<13-digit epoch ms>`, one per grid cell | checkout (`HELD`, with `expiresAt`), webhook (`BOOKED`, or deleted on release) |
| `creatorWebhookEvents` | Stripe event id | webhook, for idempotency and refund-before-purchase |
| `inquiries` | auto id | `/api/creator/inquiry`, `status: 'NEW'` |
| `printfulOrders` | our order id | `forwardOrder()`, `status: 'STUB_NOT_SENT'` |
| `manualOrders` | our order id | manual fulfillment, `status: 'MANUAL_PENDING'` |
| `printifyOrders` | our order id | reserved; the module is not built |

Slot holds use document-id range reads, so no composite index is needed. `isPaymentIntentRefunded` filters `creatorWebhookEvents` on two equality fields, which Firestore serves without a composite index.

The repo has no `firestore.rules` file, so none was added. When one is created, deny clients these collections (the Admin SDK bypasses rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /bookings/{id} { allow read, write: if false; }
    match /slotHolds/{id} { allow read, write: if false; }
    match /creatorWebhookEvents/{id} { allow read, write: if false; }
    match /inquiries/{id} { allow read, write: if false; }
    match /printfulOrders/{id} { allow read, write: if false; }
    match /printifyOrders/{id} { allow read, write: if false; }
    match /manualOrders/{id} { allow read, write: if false; }
  }
}
```

Do not deploy rules from this branch.

## How a booking works

1. Slots come from `weeklyHours` in the profile's time zone, on a `slotMinutes` grid (30), from now + `leadMinutes` (12 h) to `horizonDays` (21). A service takes every cell it covers, so a 60-minute session and an overlapping 30-minute call cannot both be held.
2. Checkout re-generates the slots on the server and accepts only an exact match.
3. The hold is one Firestore transaction: create the booking in `HOLD` and every cell in `HELD`, or nothing. A cell is free when it has no doc, or it is `HELD` past its `expiresAt` (session expiry + 30 minutes).
4. The Checkout Session expires after 31 minutes (Stripe's minimum is 30 after creation). If Stripe fails, the booking goes `FAILED` and the cells are freed.
5. `checkout.session.completed` → `CONFIRMED`, cells `BOOKED`, `notifyBooking()` (a stub; no email). If the cells were taken after a lapsed hold, the booking goes `CONFLICT` and needs a manual refund.
6. `checkout.session.expired` → `EXPIRED`, cells freed. It never releases a confirmed booking.
7. `charge.refunded` (full refund) → `CANCELLED`, cells freed. A partial refund is recorded and does not cancel. A refund that arrives before the purchase is remembered, and the purchase lands `CANCELLED`.
8. Events with `livemode: true` are ignored.

The shared `/api/stripe/webhook` ignores `SERVICE` sessions (they carry no `userId`) and passes over refunds it cannot match, so it does not interfere.

## Stripe, test mode

1. Dashboard → **Test mode**.
2. `STRIPE_BOOKS_SECRET_KEY` = the test secret (shared with the book shop).
3. Developers → Webhooks → Add endpoint `https://<host>/api/creator/webhook` with `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`. Put its signing secret in `STRIPE_CREATOR_WEBHOOK_SECRET`.
4. Book a slot with card `4242 4242 4242 4242`, then refund it from the Dashboard and check that the slot shows as open again.

## Merch and fulfillment

`lib/creator/fulfillment.ts` is provider-agnostic: `quote`, `createOrder` (our order id is the idempotency key and Printful's `external_id`), `getStatus`, `handleWebhook`. `quoteCart()` groups a cart by each product's `provider`; `placeFulfillmentOrders()` stores the provider's item cost on each order.

With `PRINTFUL_ENABLED` off (default), `syncProducts()` returns a 5-item fixture (hoodie M/W, tee, hat, joggers) and merch cards show "Coming soon" with no buy button. With it on, the Printful requests are built (token redacted) and returned, and still nothing is sent: `sendPrintfulRequest()` refuses. Merch checkout is not built in Phase 1.

## Known limits

- The inquiry and checkout rate limits are in-memory per server instance (`lib/rate-limit.ts`), like the rest of the app.
- No emails: `notifyBooking()` is a stub and inquiries get no auto-reply.
- A `CONFLICT` booking needs a person to refund it.
- Instagram stats are a fixture (`getInstagramStats()`), shown with an "Example data" badge.

## Tests

```bash
cd FEL-full-app
npx vitest run lib/creator lib/books
```

Memory store, mocked Stripe and a stubbed global `fetch`. They cover the live-key refusal, double booking, webhook replay, expiry, refund, refund-before-purchase, inquiry validation, honeypot and 429, Printful off by default and making no call when on, and Connect returning `CONNECT_DISABLED`.

## Go-live checklist

Do these in order. This branch does none of them.

1. Replace every EXAMPLE rate, hour and placeholder copy; set the `...IsExample` flags to `false`.
2. Decide the Stripe account for creator revenue and the teammate split.
3. Add `firestore.rules` with the deny rules above and deploy them with an explicit go-ahead.
4. Set the service account and `CREATOR_IP_SALT` on the server.
5. Test-mode end to end: book, confirm, expire a checkout, refund.
6. Build the booking email (`notifyBooking`) and an inquiry inbox view.
7. Only then replace the test-mode guard, with an explicit go-ahead. Printful live calls and Connect are separate changes after that.
