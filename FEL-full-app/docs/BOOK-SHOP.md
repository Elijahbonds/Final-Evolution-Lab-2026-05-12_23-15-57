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
| `NEXTAUTH_URL` | Public origin used when the checkout request has no `Origin` header. |

The service account needs permission to sign URLs for that bucket (`iam.serviceAccounts.signBlob` is not required when the private key is present; the process signs locally). It does not need to make objects public.

## Database

Two tables, in `prisma/schema.prisma`:

- `BookEntitlement` — one row per email + offer (`ebook`, `audiobook`, or `bundle`). `userId` is filled when that email logs in.
- `BookFulfillmentEvent` — Stripe event id. A second delivery of the same event does not create a second purchase. A refund stored before the purchase arrives is applied when the purchase is written.

Apply the schema to the **dev** database only when you mean to:

```bash
cd FEL-full-app
npx prisma db push
```

Do not point `DATABASE_URL` at production for this. This branch does not run `db push` and does not deploy.

Guest checkout is allowed. On the next sign-in, `lib/auth.ts` claims rows whose email matches the account. My Library and the download route claim again, so a purchase still shows up if the sign-in claim failed.

A refund (`charge.refunded`) sets the row to `REVOKED`. Revoked rows do not get signed URLs.

## Stripe, test mode

1. In the Stripe Dashboard, switch to **Test mode**.
2. Use the test secret as `STRIPE_BOOKS_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint:
   - URL: `https://<host>/api/books/webhook`
   - Events: `checkout.session.completed`, `charge.refunded`
   - Put that endpoint's signing secret in `STRIPE_BOOKS_WEBHOOK_SECRET`.
4. The existing `/api/stripe/webhook` also records a Checkout Session whose metadata `product` is `BOOK`, and it tries to revoke book rows on `charge.refunded`. Prefer the book endpoint: a failure there returns 500 so Stripe retries. The shared endpoint returns 500 for a book checkout that fails to record, and ignores a refund that matches no book purchase.

Optional Price ids: create a Product and a one-time Price in test mode, and set `stripePriceId` on the offer in the catalog. Until that field is set, Checkout uses `price_data` and the catalog's `priceCents`.

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
4. `prisma db push` against the database this server uses.
5. Test-mode webhook endpoint, test key, one purchase, receipt page, My Library, a chapter, an EPUB download, then a refund that removes access.
6. Decide tax (Stripe Tax on, or off and filed yourself).
7. Add digital-goods refund language to the Terms page if it is not already there. The shop links to `/terms`.
8. Only then replace the test-mode guard and the test keys, with an explicit go-ahead. Do not deploy from this branch as part of that step unless that go-ahead includes deploy.
