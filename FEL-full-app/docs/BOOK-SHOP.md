# Final Evolution Press — book shop

Direct ebook and audiobook sales on FEL. The pages live at `/press` (catalog), `/press/[slug]` (one book), `/press/library` (purchases), and `/press/receipt` (after Checkout).

`/shop` is already the in-app Lab Credits card shelf. This shop does not replace it.

Nothing here is live. Prices in `lib/books/bookCatalog.ts` are **EXAMPLE** placeholders. Checkout refuses a live Stripe key (`sk_live_`). No book files are in the repo. This document does not contain secrets.

## What Elijah has to decide

1. **Prices.** Replace `priceCents` on each offer and set `priceIsExample` to `false` when the number is real. Do not price a direct ebook below the Kindle list price unless Amazon price-matching is acceptable.
2. **KDP Select.** Five titles are flagged `kdpSelect: true` from a public Amazon check on 2026-09-26 (Building In The Loop, Architecture Of Raising Humans, Vibe Coders Handbook, Neuro Mechanic Playbook, Art of Dunking). Their ebook and bundle buttons stay off. Audiobooks are unaffected. Confirm each title in KDP Bookshelf, then set `kdpSelect` to `false` only after the ebook may be sold outside KDP. Blueprint and Unfair Advantages are flagged off; confirm those too.
3. **Which Stripe account** receives book revenue, and that it is the account behind `STRIPE_BOOKS_SECRET_KEY`.
4. **Tax.** Leave `STRIPE_BOOKS_TAX` unset until Stripe Tax is activated on that account. Turning the flag on without Tax configured makes Checkout session creation fail.
5. **Chapter lists** for the five titles whose audio masters are not inventoried. Blueprint is opening + 20 chapters + close. Art of Dunking is opening + 12 chapters + close. The others are placeholders (`chaptersArePlaceholder: true`).
6. **Descriptions.** Every book says `Description placeholder.` Replace them in the catalog. Do not invent them in a later code change without the real copy.
7. **Go-live** is a separate change: remove the `sk_test_` refusal in `assertStripeTestKey`, use live keys, and only after a test purchase and a refund have been done. This branch does not do that, and it does not deploy.

## Environment

Set these on the server. Do not commit the values.

| Variable | Purpose |
|---|---|
| `STRIPE_BOOKS_SECRET_KEY` | Test secret (`sk_test_...`). Falls back to `STRIPE_SECRET_KEY`, which is then refused if it is a live key. |
| `STRIPE_BOOKS_WEBHOOK_SECRET` | Signing secret for the book endpoint. Falls back to `STRIPE_WEBHOOK_SECRET`. |
| `STRIPE_BOOKS_TAX` | `1` to set `automatic_tax.enabled` and require a billing address on the Checkout Session. |
| `FIREBASE_STORAGE_BUCKET` | Defaults to `final-evolution-lab.firebasestorage.app`. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service-account JSON, one line. Or set the next two instead. |
| `FIREBASE_CLIENT_EMAIL` | Service account email, if you are not using the JSON blob. |
| `FIREBASE_PRIVATE_KEY` | PEM private key. Newlines may be written as `\n`. |
| `BOOK_SIGNED_URL_TTL_SECONDS` | Lifetime of a download/stream URL. Default 600, maximum 3600. |
| `NEXTAUTH_SECRET` | Already required by login. Also signs the short-lived receipt grant that lets a guest play on the receipt page. |
| `NEXTAUTH_URL` | The site origin Stripe sends the buyer back to (`siteOrigin()`, STORE-READY B3). The request's `Origin` header is never used; unset closes checkout (`site_url_not_set`). |
| `VIRTUAL_PURCHASES_ENABLED` | The release's B10 fence (default off: "no real-money product outside the coach store"). Book checkout answers 409 `store_closed` / `virtual_purchases_off` until it is on. Owner question: keep books behind this fence or give them their own switch. |

The service account needs permission to sign URLs for that bucket (`iam.serviceAccounts.signBlob` is not required when the private key is present; the process signs locally). It does not need to make objects public.

## Database

Two tables, **pending** (2026-10-09): `prisma/pending/2026-10-09-book-shop.sql`. They were Prisma models in this
branch's first commit; when the release was merged in (919 commits later) the regenerated `public/_prisma` client could
not be merged, so the models moved to a pending SQL file, the release's convention for schema the owner has not
applied. The SQL file carries the matching model blocks.

- `BookEntitlement` — one row per email + offer (`ebook`, `audiobook`, or `bundle`). `userId` is filled when that email logs in.
- `BookFulfillmentEvent` — what the shop has already handled: `stripe-session:<cs_id>` for a purchase (the same key
  the receipt page and both webhooks use, so one payment is one grant), or the Stripe event id for a refund. A refund
  stored before the purchase arrives is applied when the purchase is written.

Until the tables exist, `lib/books/bookStore.ts` finds no delegate on the generated client: `bookTablesReady()` is
false, every store call throws `BookTablesNotReady`, sign-in skips the claim, My Library shows "unavailable", and the
free sample still signs. The owner's step, in order: apply the SQL, add the two models (and `User.bookEntitlements`)
to `prisma/schema.prisma`, regenerate `public/_prisma` on Linux. No agent runs `prisma db push` or regenerates the
client.

Guest checkout is allowed. On the next sign-in, `lib/auth.ts` claims rows whose email matches the account. My Library and the download route claim again, so a purchase still shows up if the sign-in claim failed.

A refund (`charge.refunded`) sets the row to `REVOKED`. Revoked rows do not get signed URLs.

## Stripe, test mode

1. In the Stripe Dashboard, switch to **Test mode**.
2. Use the test secret as `STRIPE_BOOKS_SECRET_KEY`.
3. The receipt page fulfils on its own (MERGE 2026-10-09, the release's SEC-F4 NO-WEBHOOK rule, #200): it retrieves
   the Checkout Session from Stripe on the server and grants what that session proves (paid, `product: BOOK`, the
   buyer's own email). A webhook is still worth adding for buyers who close the tab before the redirect, and it is
   the only path for refunds:
   - URL: `https://<host>/api/books/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`
   - Put that endpoint's signing secret in `STRIPE_BOOKS_WEBHOOK_SECRET`.
4. The existing `/api/stripe/webhook` also records a Checkout Session whose metadata `product` is `BOOK`, and once the
   book tables exist it tries to revoke book rows on `charge.refunded`. Every path keys a purchase on the Checkout
   Session (`stripe-session:<cs_id>`), so webhook + receipt + a redelivery grant once. A failure on either endpoint
   returns 500 so Stripe retries; the shared endpoint ignores a refund that matches no book purchase.
5. Every closed answer is a 409 `store_closed` with a reason (`payments_not_set_up`, `live_mode_off`,
   `virtual_purchases_off`, `site_url_not_set`), as the rest of the release's store (STORE-READY B2).

Optional Price ids: create a Product and a one-time Price in test mode, and set `stripePriceId` on the offer in the catalog. Until that field is set, Checkout uses `price_data` and the catalog's `priceCents`. The script below does the creating.

### Creating test products

`scripts/stripe-create-test-products.mjs` creates one Product and one Price per row of `scripts/stripe-prices.example.json`. That file lists every offer the catalog sells directly, at the catalog's **EXAMPLE** cents. The KDP-blocked ebooks and bundles are left out. The script refuses any key that is not `sk_test_`, and it refuses a row that disagrees with the catalog (amount, format, EXAMPLE flag, or direct sale).

1. Export the test key in your own shell. Do not put it in a file in the repo.

   ```bash
   export STRIPE_BOOKS_SECRET_KEY=sk_test_...
   ```

2. Dry run from `FEL-full-app/`. It prints the plan and makes no Stripe calls. Without `--allow-example` it refuses every EXAMPLE row and exits 1.

   ```bash
   node scripts/stripe-create-test-products.mjs --allow-example
   ```

3. Create them in test mode:

   ```bash
   node scripts/stripe-create-test-products.mjs --apply --allow-example
   ```

   It finds a Product by `metadata.offerId` and a Price by lookup key `fel_book_<offerId>`, so running it again creates nothing new. If an amount changed, it creates a new Price and moves the lookup key to it.

4. Paste each `price_...` from the printed `offerId -> priceId` table into `stripePriceId` on that offer in `lib/books/bookCatalog.ts`.

Needs Node 22.18 or newer, because it imports the TypeScript catalog directly. Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning when it does; that warning is harmless. On an older Node, run it with `npx tsx` instead. When real prices are decided, change `priceCents` and `priceIsExample` in the catalog, copy the example file, set the new cents and `"EXAMPLE": false`, and pass it with `--file <path> --apply`. `npm test -- lib/books` checks that the example file still matches the catalog.

Stripe Tax: activate Tax in the Dashboard (origin address, registrations), then set `STRIPE_BOOKS_TAX=1`. The session collects a billing address and sets `automatic_tax: { enabled: true }`.

Card numbers: Stripe's test card `4242 4242 4242 4242`. Refund the payment from the Dashboard to confirm the library row flips to revoked.

## Storage layout

Bucket: `final-evolution-lab.firebasestorage.app` (override with `FIREBASE_STORAGE_BUCKET`).

Objects are private. Do not add `allUsers` and do not use a Firebase download token URL. The app signs a V4 URL on `storage.googleapis.com` only after an entitlement check (or for the one sample file).

```
books/<slug>/ebook/book.epub
books/<slug>/ebook/book.pdf
books/<slug>/audio/00-opening.mp3
books/<slug>/audio/01-chapter-1.mp3
...
```

Slugs:

| Title | slug |
|---|---|
| The Neuro-Mechanic's Blueprint | `blueprint` |
| Unfair Advantages | `unfair-advantages` |
| Building In The Loop | `building-in-the-loop` |
| Architecture Of Raising Humans | `architecture-of-raising-humans` |
| Vibe Coders Handbook | `vibe-coders-handbook` |
| Neuro Mechanic Playbook | `neuro-mechanic-playbook` |
| Art of Dunking | `art-of-dunking` |

Audio filenames are `NN-<label>.mp3` with the label lowercased and non-alphanumerics turned into hyphens (`Chapter 1` → `01-chapter-1.mp3`). The index is the position in that book's `files` list in the catalog, starting at `00`.

The free sample is `books/blueprint/audio/01-chapter-1.mp3`. It is the only file signed without a purchase. Upload it before expecting the sample button to play.

Upload with the gcloud CLI or the Firebase console (the console upload is private by default when the bucket uses uniform access and has no public rule). Example, from a machine that is allowed to write the bucket:

```bash
gcloud storage cp ./book.epub gs://final-evolution-lab.firebasestorage.app/books/blueprint/ebook/book.epub
gcloud storage cp ./01-chapter-1.mp3 gs://final-evolution-lab.firebasestorage.app/books/blueprint/audio/01-chapter-1.mp3
```

If a file is missing, the signed URL is still issued and the browser gets a storage 404. That is how you know the upload path does not match the catalog.

## Changing the catalog

`lib/books/bookCatalog.ts` is the only list of books, prices, formats, chapter files, and partner links. The partner URLs are:

- MILLIONS — `https://millions.co/elijah-bonds-basketball`
- PJF Performance Band (affiliate, `rel=sponsored`) — `https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly`
- Total Body Board — `https://www.totalbodyboard.com/` with code `EBondJmp`
- Fan Arch — `https://fanarch.com/collections/elijah-bonds`

After a catalog edit, `npm test -- lib/books` checks that prices are still marked as examples, that KDP-blocked ebooks are not directly purchasable, and that storage paths stay under `books/<slug>/`.

## Go-live checklist

Do these in order. This branch does not perform them.

1. Confirm KDP Select for all seven titles. Flip `kdpSelect` only when the ebook may be sold on the site.
2. Replace example prices. Set `priceIsExample: false` on the offers you are actually charging.
3. Upload EPUB, PDF, and MP3s to the private paths above. Play chapter 1 and the last chapter.
4. Apply `prisma/pending/2026-10-09-book-shop.sql`, add the models, regenerate `public/_prisma` (the owner's step; see Database).
5. Test-mode webhook endpoint, test key, one purchase, receipt page, My Library, a chapter, an EPUB download, then a refund that removes access.
6. Decide tax (Stripe Tax on, or off and filed yourself).
7. Add digital-goods refund language to the Terms page if it is not already there. The shop links to `/terms`.
8. Only then replace the test-mode guard and the test keys, with an explicit go-ahead. Do not deploy from this branch as part of that step unless that go-ahead includes deploy.
