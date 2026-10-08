**Status: B1–B9 complete and green. DRAFT — awaiting the money-PR gate (GitHub CI `npm run test:ci` database run) and owner review before this leaves draft.**

Store-readiness pass before the store flag flips, per Cyber's STORE-PREFLIP-FINAL with the FE PM / owner decisions of Oct 7: every "payments not set up" answer is **409 `store_closed` ("Checkout opens soon."), never 503**; a session whose start already passed when payment lands goes **REFUND_DUE, never PAID**; memberships sell at launch (B9 Option B); fulfilment stays server-verified, no webhooks; scheduled work is an authed route only.

**Base:** `fa7aa0a8` (lane/finish-release at launch, before #207/#206). `git log --oneline -5`:
```
04c7e98 Initial plan
fa7aa0a8 Merge pull request #208 from Elijahbonds/lane/form-send
```

---

## The 409 store-closed contract (B2)

```ts
// lib/coach-store/gate.ts — every "payments not set up" answer, never a 5xx
export function storeClosed(reason: StoreClosedReason): NextResponse {
  return NextResponse.json({ error: 'store_closed', reason, message: STORE_CLOSED_MESSAGE }, { status: 409 });
}
```

`stripeTestGate(env)` (export name kept) now returns `{ ok:false, status:409, error:'store_closed', reason }`: no key → `payments_not_set_up`; `sk_live_`/`rk_live_` → ok **only** with `COACH_STORE_LIVE` on in the *passed* env, else `live_mode_off`; test keys pass unchanged. All four routes (`/api/coach-store/checkout`, `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/verify-session`) gate **before** `getStripe()`, so nothing throws on a missing key and the old unhandled 500 in `/api/stripe/checkout` is gone. The buy button (`book-form.tsx`, main buy and buyPart) renders 409 `store_closed` as a neutral "Checkout opens soon." notice — no red error, no redirect.

**Existing tests changed (503→409 / gate shape):** `lib/coach-store/core.test.ts` (stripeTestGate cases: live key now `live_mode_off`, ok only with `COACH_STORE_LIVE`), `lib/coach-store/storePricesCheckout.test.ts` (stripeMode mock — ok shape unchanged, comment only).

## B1 — FACE-SCAN-FLAG
`/closet` "Scan My Face" behind `FACE_SCAN_ENABLED` (default OFF). `isFaceScanEnabled()` in `lib/flags.ts`; `ClosetView` gains optional `faceScan` (default false — dev/studio untouched); `FaceScanCapture` loads via `next/dynamic` only, so tasks-vision and the Google model fetch don't exist in the bundle path until the flag flips. Neither `face-scan-capture.tsx` nor `lib/pose/**` touched. Tests: `components/closet/face-scan-flag.test.tsx` (render + source: `storage.googleapis.com/mediapipe-models` appears only in the capture module).

## B3 — F7 server origin
New `lib/stripe/site-origin.ts`: `NEXTAUTH_URL` trimmed, no trailing slash, `null` when unset (→ `store_closed('site_url_not_set')`). Never reads the request. Used by all three Stripe URL routes + coach-store checkout. Test proves an `Origin: https://evil.example` POST can't steer success/cancel/return URLs, and a source test asserts no `req.headers.get('origin')` remains in those files.

## B4 — F20 program paywall
New `lib/coach-store/access.ts`:

```ts
export function programAccessOpen(row, now) {
  if (row.status !== 'ACTIVE' && row.status !== 'PAST_DUE') return false;
  if (row.accessUntil && row.accessUntil.getTime() <= now.getTime()) return false;
  return true;
}
```

`app/program/[accessId]` renders content only when true ("This program isn't active." otherwise); `rowStatus` returns a server-computed `programOpen`; ThanksPoll and `/account/coaching` link `/program/<id>` only for open rows; `receiptFor` 404s anything but PAID bookings / ACTIVE·PAST_DUE·CANCELED access rows. Note: stops in-app free access only; content also lives in source (`/program/unlock` is a later lane). Tests: `program-access-open.test.tsx` (truth table + mocked-server-component page render).

## B5 — F21 re-buy within 24 h
`buyAccess` resolves the existing row's session **before any row write**: still open at the same price → return its URL untouched; price changed → `sessions.expire` the old one and create fresh under a **new** idempotency key (`coach-store:checkout:<rowId>:<ts>` — the bare reused key was the 500); already paid → fulfil + 409 `already_owned`; other Stripe error → 502, nothing written. Tests: `rebuy-checkout.test.ts` (3, in-memory DB).

## B6 — F2 paid booking never dropped
New `lib/coach-store/slotCheck.ts` `slotStillFree` (busy = that instructor's HELD|PAID bookings with slotLock, minus `excludeBookingId`; exact startsAt+durationMin match). `onCheckoutSession` live_1on1 branch rewritten:
- startsAt ≤ now when payment lands → **REFUND_DUE**, slotLock null, PI recorded, never PAID;
- future + free → one status-CAS (HELD|EXPIRED → PAID) with slotLock; a P2002 falls through to REFUND_DUE;
- not free → REFUND_DUE — never throws, and "taken" is never derived from `booking.slotLock` (the null-slotLock bug is gone);
- late payments measure notice/maxDaysAhead from `booking.createdAt` (B7 passes real now);
- sale posted once under `verifyIdempotencyKey(session.id)`; referral only for PAID.

`refund_due` propagates fulfil → `verifyCheckoutSession` → verify-session route → `verify-checkout-session.tsx` → ThanksPoll: "Your time was taken while you paid. Elijah will refund you in full or rebook you." Tests: `verify-checkout-refund-due.test.ts` (6: sweep→PAID, 60-min-vs-30-min overlap→REFUND_DUE+HTTP 200, unrelated paid video review→PAID, replay→no second posting, notice-from-createdAt→PAID, past-start→REFUND_DUE).

## B7 — F3 reschedule slot check
`moveBooking` reschedule runs `slotStillFree({ excludeBookingId: booking.id, now: new Date() })` after `decideCancel`; failure → 409 `slot_unavailable` with nothing written; P2002 → 409. `decideCancel` and connection-failed unchanged. Tests: `reschedule-slot-check.test.ts` (6: overlap at a different start, outside hours, past + inside-notice, blackout, exact collision, free slot 200).

## B8 — RECONCILE (complete)
New `lib/coach-store/reconcile.ts` `reconcileCoachStore({ now, stripe })` + `POST /app/api/coach-store/reconcile` (`force-dynamic`, **no** `assertCoachStoreOn` — it must clean up while the store flag is off). Auth ladder: allowlisted coach session → run; else `COACH_STORE_RECONCILE_SECRET` unset → 404; signed-in non-coach without header → 404; `x-coach-store-reconcile-secret` compared constant-time (`verifyReconcileSecret`, modelled on `verifyReclaimSecret`) → 401/run. No key after auth → `200 { ok:true, skipped:'payments_not_set_up' }`, zero counts, no Stripe call.

- **Pass 1**: HELD|EXPIRED bookings / PENDING access with a `stripeCheckoutId` touched in the last 24 h → retrieve; paid → B6 fulfilment (incl. past-start limit); expired → status-CAS to EXPIRED. **The window is bounded on `updatedAt`, not `createdAt`** — the checkout id is written *after* the row exists (`checkout.ts`), so `updatedAt` is the "a checkout happened recently" signal and a row created 25 h ago but re-bought a minute ago is still found (this was the real cause of the old test-(c) miss: the row was never picked up, so fulfil never ran).
- **Pass 2**: `refunds.list` (7 d) → act only on `charge.refunded === true` (partial = log only) → booking REFUNDED / access REFUNDED + `codeActive:false` / referral REVERSED.
- **Pass 3**: `disputes.list` (120 d) → open → DISPUTED/PAUSED; lost → as refund; won → restore only rows still DISPUTED/PAUSED.
- Both payment-mode session creates now carry `payment_intent_data.metadata` so Dashboard refunds/disputes map back by PI.
- Per-row errors are caught, counted, logged by FEL row id only; counts-only response. "Sync with Stripe" button (`components/coach-store/sync-stripe.tsx`) on the coach dashboard POSTs the route and shows counts.

Tests: `reconcile.test.ts` (21, all green) — (a)–(j) as specced plus the B9 Pass-4 cases (k)–(o) below.

## B9 — MEMBERSHIPS, Option B (complete; memberships sell at launch)
- **`cancelMembership` (`lib/coach-store/api.ts`)** — the cancel is real in Stripe FIRST for **any** key (test or live). `subscriptions.update(id, { cancel_at_period_end: true })`; on a Stripe failure the row is left **untouched** and the buyer gets a 502 (a "cancelled" banner with money still coming out is the one answer this route never gives). On success it writes `cancelAtPeriodEnd` + `accessUntil = subscriptionPeriodEndUnix(subscription)` (basil: read from `items[].current_period_end`); an already-ended subscription (`status 'canceled'`) closes the row outright. No subscription id or no key → the local-only cancel stands. Returns `accessUntil` so the UI can name the end date.
- **Reconcile Pass 4 (subscription sync)** — `subscriptions.list({ status:'all' })`; each membership row (by `stripeSubscriptionId`) syncs by status-CAS (a replay never moves a row backwards): `active`/`trialing` → ACTIVE (`codeActive` true), `past_due`/`unpaid`/`incomplete` → PAST_DUE (still open, `codeActive` true), `canceled`/`incomplete_expired` → CANCELED (`codeActive` false); `accessUntil` = period end. A row already CANCELED is not re-opened; a REFUNDED/PAUSED row is left to Passes 2–3.
- **Renewal refund/dispute mapping** — a Dashboard refund/dispute on a subscription *renewal* lands on the renewal invoice's PaymentIntent, not the row's stored one, so Passes 2–3 also resolve `payment_intent → invoice (in the window) → subscription → access row` (`invoiceSubscriptionId` handles basil `parent.subscription_details.subscription` and the older `subscription`).
- **`setListingPrice`** — writes `priceUsd` **only**, never flips `active`, so editing the price is not a back door that re-activates a paused listing.
- **UI** — the cancel button (`cancel-membership.tsx`) swaps to "**Cancelled. Access ends \<date\>**" on success and keeps the button + a retry note on failure; the account page (`/account/coaching`) already shows "Ends \<date\>" for a `cancelAtPeriodEnd` row.

Tests: `membership-b9.test.ts` (10 — cancel test key / live key / Stripe-failure-502-row-untouched / already-ended-closes / no-subscription / no-key / not-owner; setListingPrice paused-stays-paused / active-stays-active / bounds+owner), reconcile Pass-4 cases (k)–(o) (5), `cancel-membership.test.tsx` (3, source + first-paint).

## ENV VARS FOR AM
- `STRIPE_SECRET_KEY` — **read at**: `lib/stripe.ts:12` (`getStripe()`); gated first at `lib/coach-store/stripeMode.ts:28` (`stripeTestGate`), `lib/coach-store/api.ts:457` (cancel), `app/api/coach-store/reconcile/route.ts:39`, `app/api/stripe/webhook/route.ts:20`. The first LIVE key loads after this PR ships; the store is cleanly closed (409, "Checkout opens soon.") until then.
- `COACH_STORE_LIVE` — **NEW**, default OFF; read at `lib/flags.ts:101` (`isCoachStoreLive`). A live key opens checkout only while this is on.
- `COACH_STORE_RECONCILE_SECRET` — **NEW**; read at `app/api/coach-store/reconcile/route.ts`. Unset = the route 404s for non-coaches.
- `COACH_STORE_ENABLED` (store flag), `COACH_STORE_PAYMENTS_ENABLED` (payments flag), `COACH_STORE_COACH_USER_IDS` (coach allowlist) — existing; unchanged.
- `FACE_SCAN_ENABLED` — **NEW**, default OFF; read at `lib/flags.ts` (`isFaceScanEnabled`); gates `/closet` "Scan My Face".
- `NEXTAUTH_URL` — the server origin for all Stripe success/cancel/return URLs (`lib/stripe/site-origin.ts`); unset → `store_closed('site_url_not_set')`.

### Stripe API calls this PR's surface makes (for `rk_live_` permissions)
Checkout: `checkout.sessions.create` (payment + subscription modes), `checkout.sessions.retrieve`, `checkout.sessions.expire`; `customers.create`. Verify/fulfil: `checkout.sessions.retrieve` (expand `payment_intent`), `paymentIntents.retrieve` (expand `latest_charge.balance_transaction`), `charges.retrieve` (expand `balance_transaction`). Portal: `billingPortal.sessions.create`. Cancel (B9): `subscriptions.update` (`cancel_at_period_end`), `subscriptions.retrieve`. Reconcile (B8/B9): `checkout.sessions.retrieve`, `refunds.list`, `charges.retrieve`, `disputes.list`, `subscriptions.list`, `invoices.list`. Webhook (`/api/stripe/webhook`, unchanged): `webhooks.constructEvent` (needs `STRIPE_WEBHOOK_SECRET`), `subscriptions.retrieve`.

**Reconcile call AM schedules** (no scheduler in this PR): `POST https://<NEXTAUTH_URL host>/api/coach-store/reconcile` with header `x-coach-store-reconcile-secret`, every 10 minutes.

## Gates
- `tsc --noEmit` — clean.
- `npx vitest run` — **19,139 passed** (39 skipped, 1 todo).
- `npx tsx scripts/ci-suite.ts` — **203 passed, 0 failed**; 11 DB suites skip locally and run in GitHub CI's `npm run test:ci` database run.
- `npm run lint --max-warnings=0` — clean.

## Hard limits held
No new packages; `package.json` and lockfiles unchanged; no `lib/db.ts`, schema, migration, `prisma/pending`, `public/_prisma`, or Storage changes; no SQL; no `lib/pose/**` / dunk / #206 / #207 files; no `lib/env.ts` import; no webhooks; no scheduler/cron/infra. `yarn.lock` and `public/_prisma/client/*.js` install dirt reverted, never committed. B10 (a live-key fence for wallet/season/other checkouts) is a later follow-up — not started here; wallet, season, studio and deposit routes untouched.

Remaining before this leaves draft: the money-PR gate (GitHub CI's `npm run test:ci` database run — the locally-skipped DB suites listed above must pass there) and the manual-check script for AM.
