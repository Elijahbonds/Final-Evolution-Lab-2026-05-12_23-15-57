# Coach store — notes that are not this lane's to fix

## B-W2

`FEL_COACH` and `FEL_FACILITY` checkout writes an Order and does not write a Subscription row. The coach store writes `ProgramAccess` for its own memberships and does not patch those handlers. `lib/coach-store/out-of-lane.test.ts` keeps a skipped test so the gap stays visible.

## B-W3

Stripe's basil API removed `invoice.subscription` and `subscription.current_period_end`. They now live at `invoice.parent.subscription_details.subscription` and `subscription.items.data[].current_period_end`. The existing webhook handlers were not changed. Coach-store reads both shapes in `lib/coach-store/stripeShapes.ts`.

## Bucket lifecycle

Production originals live under `coach-reviews/originals/` in the bucket named by `COACH_REVIEWS_BUCKET`. A 90-day lifecycle rule on that prefix is an operator backstop. This lane does not apply it. The app deletes each original 30 days after the review is delivered. Annotated replies live under `coach-reviews/replies/<bookingId>/` so that rule cannot delete them.

## Live mode

Test mode ships without the real-money gates in `docs/coach-store.md`. Live mode stays off until those are done. Checkout rejects a live key. The shared webhook does not reject other products because a coach-store event had `livemode` set; coach-store fulfilment ignores `livemode`.
