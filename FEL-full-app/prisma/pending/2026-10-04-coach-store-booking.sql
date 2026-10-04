-- COACH-STORE-V1 live and review bookings. Apply after instructor.
-- ADDITIVE ONLY.

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "coachUserId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "durationMin" INTEGER,
    "priceCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "stripeFeeCents" INTEGER NOT NULL DEFAULT 0,
    "refundCents" INTEGER NOT NULL DEFAULT 0,
    "stripeCheckoutId" TEXT,
    "stripePaymentIntentId" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "slotLock" TEXT,
    "clientTimeZone" TEXT,
    "clientNote" TEXT,
    "reschedulesUsed" INTEGER NOT NULL DEFAULT 0,
    "connectionFailedAt" TIMESTAMP(3),
    "failureCreditOpen" BOOLEAN NOT NULL DEFAULT false,
    "shareWithCoach" BOOLEAN NOT NULL DEFAULT false,
    "goal" TEXT,
    "painYes" BOOLEAN,
    "reviewNote" TEXT,
    "clipPaths" JSONB,
    "clipConsentAt" TIMESTAMP(3),
    "consentTextVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "replyText" TEXT,
    "replyClipPath" TEXT,
    "attachedDrillIds" JSONB,
    "deliveredAt" TIMESTAMP(3),
    "originalClipDeleteAt" TIMESTAMP(3),
    "originalsDeletedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Booking_stripeCheckoutId_key" ON "Booking"("stripeCheckoutId");

CREATE UNIQUE INDEX "Booking_stripePaymentIntentId_key" ON "Booking"("stripePaymentIntentId");

CREATE UNIQUE INDEX "Booking_slotLock_key" ON "Booking"("slotLock");

CREATE INDEX "Booking_coachUserId_startsAt_idx" ON "Booking"("coachUserId", "startsAt");

CREATE INDEX "Booking_clientUserId_createdAt_idx" ON "Booking"("clientUserId", "createdAt");

CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

CREATE INDEX "Booking_kind_status_dueAt_idx" ON "Booking"("kind", "status", "dueAt");

CREATE INDEX "Booking_originalClipDeleteAt_idx" ON "Booking"("originalClipDeleteAt");

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
