# DRAFT — coach terms and payout terms (draft points for the owner and counsel)

**NOT LEGAL COPY. Nothing here is in the app.** Moved into the repo by lane `coach-delivery` (round 8, COA-13, 2026-10-27)
from the coach-business lane's session notes, so the owner can approve it from the Inbox. Live coach payments stay off
until signed text exists: `lib/payments/terms.ts` `COACH_TERMS_VERSION` is `null`, and with `COACH_CONNECT_LIVE` on, Connect
and Coach Pro answer 409 `store_closed` `coach_terms_unsigned` (payments-ready, #457).

Every `[OWNER DECIDES]` is an open call. Lines marked **fixed** were stale in the old draft and now say what the code does.

## Coach terms (draft points)

- The coach is an independent business, not FEL's employee or agent; the coach is the merchant of record for their sales
  (Stripe `on_behalf_of`).
- **Fees (fixed).** FEL keeps 5% of the coach's listed price on each sale made through FEL (the application fee). Stripe's
  processing fee is **not** taken from the coach or from FEL's 5%: the **buyer** pays it as its own "Processing fee" line on
  top of the listed price (owner, 2026-10-25: "5% + Stripe fee on top"; `lib/coach-business/fees.ts`). The coach receives
  the listed price less 5%. *(The old draft said the platform pays Stripe's fees out of the 5%. That is no longer true.)*
  The rate per plan and a monthly cap on FEL's share are settings (`PLATFORM_FEE_BPS_FREE`, `PLATFORM_FEE_BPS_PRO`,
  `PLATFORM_FEE_CAP_CENTS_MONTHLY`), and the defaults keep 5% with no cap. [OWNER DECIDES whether the Pro rate differs.]
- Coach Free: a profile, packages that clients apply for, a marketplace listing, and up to [N — default 3,
  `COACH_FREE_CLIENT_LIMIT`] active clients. Coach Pro: [price — default $39/month, `COACH_PRO_PRICE_USD_CENTS`]; unlimited
  clients, AI drafts the coach approves, live sessions, payments.
- The coach sets their prices, what is included, capacity, and their own refund policy within FEL's minimum [OWNER DECIDES
  the minimum].
- Package changes: a coach may move a client's running monthly package up or down; Stripe prorates the difference at the
  next invoice (COA-11). [OWNER DECIDES whether a downgrade credits now or at renewal — the code credits at renewal.]
- Team fees: a coach may send one package to their whole roster or one team (COA-12); each family pays for its own
  athlete, and the same buyer rules apply (18+ buyer, the store terms).
- Results shown on the coach's page must be approved by the client in the app; never about anyone under 18; withdrawable at
  any time. Client reviews (COA-10) are written only by an adult client after a package has ended, are screened before they
  show, and the coach may hide one from their page but never edit it.
- Minors: a coach may train a 13–17-year-old only through FEL's roster join with a guardian's coach-training consent (the
  wording in `docs/COACH-LOOP.md` §1 is itself waiting for the owner; until then no teen can train with a coach here); no
  contact with a minor outside the app's program thread.
- Conduct, credentials claimed, insurance [OWNER DECIDES], removal from the marketplace.

## Payout terms (draft points)

- Payouts are made by Stripe to the coach's Express account and bank, on Stripe's schedule; FEL never holds the coach's
  money.
- Refunds reverse the coach's transfer; FEL returns its share of the 5% in the same proportion. The processing fee is not
  refunded to the buyer by default (`REFUND_PROCESSING_FEE` off); with it on, the buyer gets their share back and FEL absorbs
  Stripe's fee. [OWNER DECIDES the default.]
- Disputes: [OWNER DECIDES who bears the dispute fee and loss — destination charges make the platform liable to Stripe
  first; recovering a lost dispute from the coach is not built].
- Negative balances: [OWNER DECIDES recovery].
- Taxes: Stripe issues 1099-K to coaches where required; the coach is responsible for their own taxes.

## What the owner does with this

1. Approve or edit these points; counsel turns them into terms text.
2. Publish the text at a page, set `COACH_TERMS_VERSION` and `COACH_TERMS_HREF` in `lib/payments/terms.ts`.
3. Only then can `COACH_CONNECT_LIVE` open live coach payments.
