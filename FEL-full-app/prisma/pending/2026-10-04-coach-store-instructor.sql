-- COACH-STORE-V1 instructor profile.
-- ADDITIVE ONLY. Not applied by this lane.

CREATE TABLE "Instructor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affiliationLine" TEXT,
    "creatorCardId" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "weeklyHours" JSONB NOT NULL DEFAULT '[]',
    "blackoutDates" JSONB NOT NULL DEFAULT '[]',
    "bufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 12,
    "maxDaysAhead" INTEGER NOT NULL DEFAULT 28,
    "reviewSlaHours" INTEGER NOT NULL DEFAULT 48,
    "clientFullRefundHours" INTEGER NOT NULL DEFAULT 24,
    "refundBusinessDays" INTEGER,
    "businessMailingAddress" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instructor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Instructor_userId_key" ON "Instructor"("userId");

CREATE UNIQUE INDEX "Instructor_slug_key" ON "Instructor"("slug");
