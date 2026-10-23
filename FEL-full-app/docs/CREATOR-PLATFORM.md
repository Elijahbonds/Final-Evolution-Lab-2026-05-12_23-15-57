# FEL Creator Platform — team profiles, media kit, work with us

Team profiles, a media kit and a "Work with us" inquiry form, on top of the Final Evolution Press look (`docs/BOOK-SHOP.md`). This is our own build; nothing is copied from MILLIONS.

## Slimmed down (owner, 2026-10-13)

PR #18 first shipped a whole storefront. The owner chose **SLIM DOWN**. What is kept, and what is gone:

| Kept | Gone |
|---|---|
| `/team`, `/team/[slug]` (team profiles) | Our own slot/booking engine (`creatorSlots`, holds, `/api/creator/slots`) |
| `/media-kit` | Its booking Stripe checkout and webhook (`/api/creator/checkout`, `/api/creator/webhook`) |
| `/work-with-us` and the inquiry form (`POST /api/creator/inquiry`) | `/team/[slug]/book/[serviceId]` and `/bookings/success` |
| A "Team" door on the Profile tab (`lib/nav/doors.ts`) | The dependency `firebase-admin` (and every Firestore call) |
| | The Printful, Instagram and Stripe Connect stubs, merch cards, the payout block |

`package.json`, `package-lock.json` and `yarn.lock` are back to `lane/finish-release`'s exact versions.

Nothing here is live. Every rate and stat is an **EXAMPLE**, and unconfirmed bios/services use generic pending-confirmation copy. Nothing on these pages is priced or sold.

## Book buttons go to the coach store

A **Book** button on `/team` and `/team/[slug]` links to the existing coach store page for that person, `/coach/<coachStoreSlug>` (Elijah: `/coach/elijahbonds`; `lib/creator/creatorCatalog.ts` `coachStoreBookHref`). The coach store owns the listings, prices, slots, terms and refunds, and it is **adults-only**: its checkout needs a sign-in, a verified adult (18+) and the store terms ticked. A profile with no `coachStoreSlug` (or one that is not approved) shows no Book button, only "Request a quote".

The services on a profile are information only (name, length, description): no price, no slot. Their prices used to be EXAMPLE numbers feeding the deleted checkout; the real price is whatever the coach sets in the coach store.

## What Elijah has to decide

1. **Services.** Two example services are listed on `elijah-bonds` (`1-on-1 session (EXAMPLE)`, `Consult call (EXAMPLE)`). Replace the names, descriptions and lengths in `lib/creator/creatorCatalog.ts`, or remove them.
2. **Media-kit rates** (`priceCents` on each package) stay EXAMPLE until set; flip `priceIsExample` only when a number is real. The audience numbers (`AUDIENCE_STATS`) are a fixture with an "Example data" badge until real ones are pasted.
3. **Content.** The bio, specialty, reels, highlights and past partners are pending confirmation. The past-partner list is taken from the Press partner links and is marked unconfirmed.
4. **Teammates.** `example-teammate` is `approved: false` and never renders. Add real people only with their real copy, set `approved: true` when they sign off, and give them a `coachStoreSlug` if they sell in the coach store.
5. **Apply the pending SQL** (below) so the inquiry form turns on.

## Routes

| Route | What it does |
|---|---|
| `/team` | Approved profiles only, each with a Book button when they are in the coach store. |
| `/team/[slug]` | Photo, bio, specialty, reels, links, services (information), "Book" and "Request a quote". Unknown or unapproved slug -> 404. |
| `/media-kit` | Bio, highlights, audience stats (fixture, "Example data" badge), past partners, packages and rates, "Inquire". |
| `/work-with-us` | Inquiry form, or "Inquiries are unavailable right now" until the table exists. `?profile=<slug>` and `?source=media-kit` are recorded. |
| `POST /api/creator/inquiry` | Validated with zod, honeypot field `website`, per-IP rate limit (5 per 10 minutes). 201 / 400 / 429, and **503 `inquiries_unavailable`** until the table exists. No auto-reply. |

## Inquiries are stored in Postgres, through pending SQL

`lib/creator/inquiryStore.ts` writes to a `CreatorInquiry` table with parameterised raw SQL, the release's pending-SQL pattern (`lib/coach/pendingSchema.ts`, the same as `CoachAvailability`). So **no Prisma model is added and no client is regenerated**.

- The table arrives with `prisma/pending/2026-10-13-creator-inquiry.sql`, which **the owner applies** (`npx prisma db execute --file ...`). `prisma/schema.prisma` and `public/_prisma/**` are untouched.
- Until it exists, the code finds no table (a cached `information_schema` probe, asked again every 5 minutes): `/work-with-us` shows "Inquiries are unavailable right now" instead of the form, and the route answers 503 `inquiries_unavailable`. Nothing is stored and nothing 500s. Within about 5 minutes of applying the SQL the form is on, with no deploy.
- Stored: brand, contact name, email, budget range, dates, deliverables, message, the page it came from, the approved profile slug if any, a status (`NEW`) and the time. **No IP address and no IP hash.** The salted IP hash (and `CREATOR_IP_SALT`) was dropped: the in-memory rate limit already holds the IP for its window, and a stored hash was not needed to reply to anyone.
- **Retention: 365 days** (`INQUIRY_RETENTION_DAYS`). Expired rows are deleted every time an inquiry is saved. The privacy policy says "12 months" (`lib/policies.ts` §1; the policy version moved to `2026-10-13` with it; `lib/policies.test.ts` pins the line and the number).
- There is no inbox view yet: read the rows with SQL.

## Environment

None. (`STRIPE_CREATOR_WEBHOOK_SECRET`, `PRINTFUL_*`, `STRIPE_CONNECT_ENABLED`, `CREATOR_IP_SALT` and `FIREBASE_PROJECT_ID` were removed with the code that read them.) The book shop's `FIREBASE_*` storage variables in `docs/BOOK-SHOP.md` are the book shop's, not this platform's.

## Known limits

- The inquiry rate limit is in-memory per server instance (`lib/rate-limit.ts`), like the rest of the app.
- No emails: inquiries get no auto-reply and no notification; someone has to read the table.
- The audience numbers are a fixture, shown with an "Example data" badge.

## Tests

```bash
cd FEL-full-app
npx vitest run lib/creator lib/policies.test.ts lib/api lib/nav
```

They cover: the catalog (approval gate, Book links point at the coach store), the boundaries (no `firebase-admin`, no booking engine, no Printful/Instagram/Connect, no client component touches the database), inquiry validation, honeypot, rate limit, the 503 fail-closed path, the Postgres store (probe, parameterised SQL, retention, the pending SQL file matches the code), the inquiry route with a mocked database, and the privacy line.

## Go-live checklist

Do these in order. This branch does none of them.

1. Replace every EXAMPLE rate and placeholder copy; set the `...IsExample` flags to `false`.
2. Apply `prisma/pending/2026-10-13-creator-inquiry.sql` and check a test inquiry lands.
3. Decide who reads inquiries (an inbox view or a notification is not built).
4. Give each real teammate a `coachStoreSlug`, if they sell in the coach store.
