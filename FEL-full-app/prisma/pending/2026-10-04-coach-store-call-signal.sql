-- COACH-STORE-V1 call signaling. Apply after booking.
-- ADDITIVE ONLY. Expired rows are the lane's delete.

CREATE TABLE "CallSignal" (
    "id" SERIAL NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CallSignal_bookingId_id_idx" ON "CallSignal"("bookingId", "id");

CREATE INDEX "CallSignal_expiresAt_idx" ON "CallSignal"("expiresAt");

ALTER TABLE "CallSignal" ADD CONSTRAINT "CallSignal_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
