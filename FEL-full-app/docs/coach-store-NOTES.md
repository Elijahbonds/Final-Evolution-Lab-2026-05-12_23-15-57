# Coach store — notes that are not this lane's to fix

## B-W2 (fixed by lane/launch-sales, 2026-10-20)

`FEL_COACH` and `FEL_FACILITY` checkout wrote no Subscription row. `lib/stripe/checkout-fulfil.ts` now writes it for every subscription product. `lib/coach-store/out-of-lane.test.ts` holds the real test (it was skipped). See `docs/LAUNCH-SALES.md`.

## B-W3 (fixed by lane/launch-sales, 2026-10-20)

Stripe's basil API removed `invoice.subscription` and `subscription.current_period_end`. They now live at `invoice.parent.subscription_details.subscription` and `subscription.items.data[].current_period_end`. The FEL handlers in `app/api/stripe/webhook/route.ts` and `lib/stripe/checkout-fulfil.ts` now read them through `lib/stripe/basil-shapes.ts`, which reuses the coach store's readers in `lib/coach-store/stripeShapes.ts`. Tests: `lib/stripe/webhook-basil.test.ts`.

## Bucket lifecycle

Production originals live under `coach-reviews/originals/` in the bucket named by `COACH_REVIEWS_BUCKET`. A 90-day lifecycle rule on that prefix is an operator backstop. This lane does not apply it. The app deletes each original 30 days after the review is delivered. Annotated replies live under `coach-reviews/replies/<bookingId>/` so that rule cannot delete them.

## Live mode

Test mode ships without the real-money gates in `docs/coach-store.md`. Live mode stays off until those are done. Checkout rejects a live key. The shared webhook does not reject other products because a coach-store event had `livemode` set; coach-store fulfilment ignores `livemode`.
