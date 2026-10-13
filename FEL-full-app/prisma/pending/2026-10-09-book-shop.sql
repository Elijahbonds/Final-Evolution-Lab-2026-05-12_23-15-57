-- FINAL EVOLUTION PRESS (PR #17, feature/book-shop): direct ebook / audiobook entitlements.
-- ADDITIVE ONLY: two new tables, no existing table changes.
--
-- PR #17 first shipped these as two Prisma models plus a regenerated public/_prisma client. The release has moved
-- 919 commits since, and its schema and committed client cannot be hand-merged with that regen, so on 2026-10-09 the
-- models moved here, the release's convention for schema the owner has not applied yet (see
-- 2026-10-07-adventure-save.sql). NO schema.prisma model is added and public/_prisma stays as the release has it.
-- Until the owner applies this, lib/books/bookStore.ts finds no delegate on the client and every book read or
-- write fails closed (bookTablesReady() is false): the catalog renders, checkout is fenced, nothing is granted.
--
-- The owner's step, in order: apply this SQL; add the two models below (and the User relation) to
-- prisma/schema.prisma; regenerate public/_prisma on Linux; then the book pages and routes read the tables.
-- This lane does not run it against any database.
--
-- The Prisma models it matches (from PR #17, 7b9a2efe):
--
--   model User { ... bookEntitlements BookEntitlement[] ... }
--
--   model BookFulfillmentEvent {
--     id              String   @id @default(cuid())
--     eventId         String   @unique      // a Stripe event id (refunds) or stripe-session:<cs_id> (purchases)
--     type            String
--     paymentIntentId String?
--     createdAt       DateTime @default(now())
--     @@index([paymentIntentId])
--   }
--
--   model BookEntitlement {
--     id                    String    @id @default(cuid())
--     email                 String
--     userId                String?
--     user                  User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
--     offerId               String
--     format                String    // ebook | audiobook | bundle
--     bookSlug              String
--     stripeSessionId       String
--     stripePaymentIntentId String?
--     stripeEventId         String
--     amountCents           Int
--     currency              String    @default("usd")
--     status                String    @default("ACTIVE")   // ACTIVE | REVOKED
--     revokedAt             DateTime?
--     createdAt             DateTime  @default(now())
--     updatedAt             DateTime  @updatedAt
--     @@unique([email, offerId])
--     @@index([userId])
--     @@index([stripeSessionId])
--     @@index([stripePaymentIntentId])
--   }

CREATE TABLE "BookFulfillmentEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookFulfillmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookFulfillmentEvent_eventId_key" ON "BookFulfillmentEvent"("eventId");
CREATE INDEX "BookFulfillmentEvent_paymentIntentId_idx" ON "BookFulfillmentEvent"("paymentIntentId");

CREATE TABLE "BookEntitlement" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "offerId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeEventId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookEntitlement_email_offerId_key" ON "BookEntitlement"("email", "offerId");
CREATE INDEX "BookEntitlement_userId_idx" ON "BookEntitlement"("userId");
CREATE INDEX "BookEntitlement_stripeSessionId_idx" ON "BookEntitlement"("stripeSessionId");
CREATE INDEX "BookEntitlement_stripePaymentIntentId_idx" ON "BookEntitlement"("stripePaymentIntentId");

ALTER TABLE "BookEntitlement" ADD CONSTRAINT "BookEntitlement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- rollback: DROP TABLE "BookEntitlement"; DROP TABLE "BookFulfillmentEvent";
