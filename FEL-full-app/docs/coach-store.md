# Coach store

Flag `COACH_STORE_ENABLED` defaults off. Payments, review uploads, and payouts are separate flags and default off.

| Env | Meaning |
|---|---|
| `COACH_STORE_ENABLED` | Store pages and routes. Off = 404. |
| `COACH_STORE_PAYMENTS_ENABLED` | Checkout. Still test keys only (`sk_test_` / `rk_test_`). |
| `COACH_REVIEW_UPLOADS_ENABLED` | Signed upload URLs and selling video review. |
| `COACH_REVIEWS_BUCKET` | Private GCS bucket. Unset = uploads fail closed ("Uploads coming soon"). |
| `COACH_STORE_COACH_USER_IDS` | Comma-separated user ids. Empty = nobody is a coach. |
| `COACH_STORE_REFERRAL_SHARE_OF_FEE` | Share of FEL's 15% fee. Unset = 0.20. Clamped 0–0.5. |
| `COACH_STORE_BLOCKED_ADDRESS_TERMS` | Extra substrings refused as a mailing address. |
| `COACH_CALL_TURN_URLS` / `COACH_CALL_TURN_SECRET` | Unused in v1. ICE config is `lib/coach-store/call/iceServers.ts`. |
| `PAYOUTS_ENABLED` | Off. The payout route is 503 and writes nothing until a real Connect transfer exists. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Missing either one: webhook and checkout say "payments not set up". |

FEL keeps 15% (`lib/fees.ts`). Stripe's card fee comes out of the coach's share. Buyers see one price. Referral is 20% of that 15% (3% of the sale) on `CoachStoreReferral`, not a ledger account.

Adults are `canWriteHealthData` (database `dobYear`). Unknown age is not an adult.

## MIGRATION SQL

Elijah approves. AM applies, in order, after the matching deploy is ready and not before:

1. `prisma/pending/2026-10-04-coach-store-instructor.sql`
2. `prisma/pending/2026-10-04-coach-store-program-access.sql`
3. `prisma/pending/2026-10-04-coach-store-booking.sql`
4. `prisma/pending/2026-10-04-coach-store-call-signal.sql`
5. `prisma/pending/2026-10-04-coach-store-referral.sql`

Until those land, new-table reads answer "coach store not set up yet" and the flags stay off so existing pages do not 500.

## AM runbook

- Apply the SQL above. Do not raise the Prisma pool (`DB_CONNECTION_LIMIT` stays 5).
- Set the flags. Subscribe the existing webhook to `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`.
- Bucket lifecycle on `coach-reviews/originals/` (90 days) is an operator backstop. Do not point it at `coach-reviews/replies/`. The app deletes originals 30 days after delivery.
- Business mailing address is empty until set in the dashboard. Never a home address.
- Refund business days stay null until the CA ruling is entered.
- Email sender is a no-op until the Google Workspace mailbox is wired. No new email vendor.
- Live mode stays off until receipts are in use, cancel-membership is confirmed, the address is set, and terms are signed.

## Real-money gates still open

Test mode can ship dark. Live mode stays off until: the signed terms replace the drafts, the business address is set, and Elijah switches the payments flag with a live key in a later change. This lane refuses live keys.
