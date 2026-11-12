-- COACH-BUSINESS (2026-10-25; owner decisions: Coach Free + Pro, a 5% revenue share through Stripe Connect, payments
-- live only when the owner switches them on): the coach's packages, their Stripe Connect account, the sales made through
-- it, the marketplace opt-in, client-approved result highlights, and applications to a coach.
-- ADDITIVE ONLY: six new tables, their indexes and seven foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   CoachConnectAccount — one row per coach: their Stripe Express account id and the three status flags Stripe reports
--                         (charges, payouts, details submitted). No bank or identity detail: Stripe holds those.
--   CoachPackage        — a coach's offer: kind, title, summary, price (cents), what is included (JSON list of strings),
--                         capacity (open spots; null = no limit), sessions (session packs only), active, order.
--   CoachSale           — one row per checkout: who bought which package from whom, the amount, FEL's 5% fee, how much
--                         was refunded (and the fee handed back), the Stripe ids, test/live. Kept like the coach store's
--                         order records (no User foreign key, so an account erase never deletes a money record).
--   CoachMarketProfile  — the coach's opt-in to /coaches: listed, accepting clients, sports, goals (fixed vocabularies).
--   CoachHighlight      — a result a coach would like to show, and the CLIENT's approval of that exact text (consentAt,
--                         consentAdult: approved as a verified adult) or its withdrawal (revokedAt). The public page shows
--                         the text only, never who it is about, and only while the client is a verified adult.
--   CoachApplication    — an adult's application to a coach (goal, an optional note, an optional package). One open row
--                         per coach and applicant; applying again updates it.
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma,
-- public/_prisma/** and lib/generated/prisma/** are unchanged (the precedent: 2026-10-24-coach-ai-draft.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/coach-business/store.ts probes information_schema for CoachApplication (the
-- last table created): without it the coach's page shows what it shows today, /coaches lists nobody, and every
-- coach-business write answers 503 coach_business_not_ready. Within ~5 minutes of applying, the feature reads the tables.
-- Every money route stays closed until COACH_CONNECT_PAYMENTS_ENABLED is on as well (docs/COACH-BUSINESS.md).
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model CoachConnectAccount {
--          userId           String   @id
--          stripeAccountId  String   @unique
--          livemode         Boolean  @default(false)
--          chargesEnabled   Boolean  @default(false)
--          payoutsEnabled   Boolean  @default(false)
--          detailsSubmitted Boolean  @default(false)
--          createdAt        DateTime @default(now())
--          updatedAt        DateTime @updatedAt
--          user             User     @relation("CoachConnectAccount", fields: [userId], references: [id], onDelete: Cascade)
--        }
--
--        model CoachPackage {
--          id         String   @id
--          coachId    String
--          /// 'monthly' | 'session_pack' | 'single_review' | 'program'.
--          kind       String
--          title      String
--          summary    String   @default("")
--          priceCents Int
--          includes   Json
--          capacity   Int?
--          sessions   Int?
--          active     Boolean  @default(true)
--          sortOrder  Int      @default(0)
--          createdAt  DateTime @default(now())
--          updatedAt  DateTime @updatedAt
--          sales      CoachSale[]
--
--          @@index([coachId, active])
--        }
--
--        model CoachSale {
--          id                String    @id
--          packageId         String
--          coachId           String
--          buyerId           String
--          kind              String
--          /// PENDING | PAID | ACTIVE | EXPIRED | CANCELED | REFUNDED | PARTIALLY_REFUNDED
--          status            String    @default("PENDING")
--          amountCents       Int
--          feeCents          Int
--          refundedCents     Int       @default(0)
--          feeRefundedCents  Int       @default(0)
--          stripeAccountId   String
--          checkoutSessionId String?   @unique
--          paymentIntentId   String?   @unique
--          subscriptionId    String?   @unique
--          livemode          Boolean   @default(false)
--          holdExpiresAt     DateTime
--          paidAt            DateTime?
--          createdAt         DateTime  @default(now())
--          updatedAt         DateTime  @updatedAt
--          package           CoachPackage @relation(fields: [packageId], references: [id], onDelete: Restrict)
--
--          @@index([packageId, status])
--          @@index([coachId, createdAt])
--          @@index([buyerId])
--        }
--
--        model CoachMarketProfile {
--          userId           String   @id
--          listed           Boolean  @default(false)
--          acceptingClients Boolean  @default(true)
--          sports           String[] @default([])
--          goals            String[] @default([])
--          updatedAt        DateTime @updatedAt
--          user             User     @relation("CoachMarketProfile", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@index([listed])
--        }
--
--        model CoachHighlight {
--          id           String    @id
--          coachId      String
--          clientId     String
--          text         String
--          consentAt    DateTime?
--          consentAdult Boolean   @default(false)
--          revokedAt    DateTime?
--          createdAt    DateTime  @default(now())
--          coach        User      @relation("CoachHighlightsGiven", fields: [coachId], references: [id], onDelete: Cascade)
--          client       User      @relation("CoachHighlightsAbout", fields: [clientId], references: [id], onDelete: Cascade)
--
--          @@index([coachId])
--          @@index([clientId])
--        }
--
--        model CoachApplication {
--          id          String   @id
--          coachId     String
--          applicantId String
--          packageId   String?
--          goal        String
--          note        String   @default("")
--          /// OPEN | ACCEPTED | DECLINED
--          status      String   @default("OPEN")
--          createdAt   DateTime @default(now())
--          updatedAt   DateTime @updatedAt
--          coach       User     @relation("CoachApplicationsTo", fields: [coachId], references: [id], onDelete: Cascade)
--          applicant   User     @relation("CoachApplicationsFrom", fields: [applicantId], references: [id], onDelete: Cascade)
--
--          @@unique([coachId, applicantId])
--          @@index([applicantId])
--        }
--
--      and the back-relations on model User:
--          coachConnectAccount   CoachConnectAccount? @relation("CoachConnectAccount")
--          coachMarketProfile    CoachMarketProfile?  @relation("CoachMarketProfile")
--          coachHighlightsGiven  CoachHighlight[]     @relation("CoachHighlightsGiven")
--          coachHighlightsAbout  CoachHighlight[]     @relation("CoachHighlightsAbout")
--          coachApplicationsTo   CoachApplication[]   @relation("CoachApplicationsTo")
--          coachApplicationsFrom CoachApplication[]   @relation("CoachApplicationsFrom")
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-25-coach-business.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the clients (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- ROLLBACK (loses every package, sale record, opt-in, highlight and application; Stripe keeps its own records of every
-- account and payment): DROP TABLE "CoachApplication"; DROP TABLE "CoachHighlight"; DROP TABLE "CoachMarketProfile";
-- DROP TABLE "CoachSale"; DROP TABLE "CoachPackage"; DROP TABLE "CoachConnectAccount";

-- CreateTable
CREATE TABLE "CoachConnectAccount" (
    "userId" TEXT NOT NULL,
    "stripeAccountId" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachConnectAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CoachPackage" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "priceCents" INTEGER NOT NULL,
    "includes" JSONB NOT NULL,
    "capacity" INTEGER,
    "sessions" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSale" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "feeRefundedCents" INTEGER NOT NULL DEFAULT 0,
    "stripeAccountId" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "paymentIntentId" TEXT,
    "subscriptionId" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMarketProfile" (
    "userId" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT false,
    "acceptingClients" BOOLEAN NOT NULL DEFAULT true,
    "sports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachMarketProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CoachHighlight" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3),
    "consentAdult" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachApplication" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "packageId" TEXT,
    "goal" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachConnectAccount_stripeAccountId_key" ON "CoachConnectAccount"("stripeAccountId");

-- CreateIndex
CREATE INDEX "CoachPackage_coachId_active_idx" ON "CoachPackage"("coachId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSale_checkoutSessionId_key" ON "CoachSale"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSale_paymentIntentId_key" ON "CoachSale"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSale_subscriptionId_key" ON "CoachSale"("subscriptionId");

-- CreateIndex
CREATE INDEX "CoachSale_packageId_status_idx" ON "CoachSale"("packageId", "status");

-- CreateIndex
CREATE INDEX "CoachSale_coachId_createdAt_idx" ON "CoachSale"("coachId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachSale_buyerId_idx" ON "CoachSale"("buyerId");

-- CreateIndex
CREATE INDEX "CoachMarketProfile_listed_idx" ON "CoachMarketProfile"("listed");

-- CreateIndex
CREATE INDEX "CoachHighlight_coachId_idx" ON "CoachHighlight"("coachId");

-- CreateIndex
CREATE INDEX "CoachHighlight_clientId_idx" ON "CoachHighlight"("clientId");

-- CreateIndex
CREATE INDEX "CoachApplication_applicantId_idx" ON "CoachApplication"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachApplication_coachId_applicantId_key" ON "CoachApplication"("coachId", "applicantId");

-- AddForeignKey
ALTER TABLE "CoachConnectAccount" ADD CONSTRAINT "CoachConnectAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSale" ADD CONSTRAINT "CoachSale_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "CoachPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMarketProfile" ADD CONSTRAINT "CoachMarketProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHighlight" ADD CONSTRAINT "CoachHighlight_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHighlight" ADD CONSTRAINT "CoachHighlight_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachApplication" ADD CONSTRAINT "CoachApplication_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachApplication" ADD CONSTRAINT "CoachApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
