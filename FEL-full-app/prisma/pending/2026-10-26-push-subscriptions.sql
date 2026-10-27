-- OFFLINE-PUSH (lane offline-push, 2026-10-26; owner DOCS AUDIT 2026-10-20: "web push opt-in (needs PWA; no marketing
-- pushes to teens)"; coordinator round 8: adults only, opt-in, no marketing pushes, never to teens).
-- ADDITIVE ONLY: three new tables, their indexes and three foreign keys. No existing table or column is changed or dropped.
--
-- WHAT IS STORED.
--   NotificationPref  — one row per account that opened the notification settings: the kinds it opted in to
--                       (lib/push/policy.ts PUSH_KINDS: coach_message, today, plan_update, coach_alerts — there is NO
--                       marketing kind) and whether reminders may also go by email. Written ONLY for a verified adult
--                       (lib/privacy/verifiedAdult.ts, User.dobYear); a teen's request is refused and nothing is written.
--   PushSubscription  — one row per browser that allowed notifications: the push service URL the browser gave
--                       (only Google, Mozilla, Apple and Microsoft push hosts are accepted: lib/push/subscription.ts),
--                       the browser's public key and auth secret (needed to encrypt to it, RFC 8291), when it last
--                       worked and how many sends in a row failed. Deleted when the push service says it is gone
--                       (404/410), after five failures in a row, on opt-out, and with the account.
--   PushSendLog       — one row per notification or reminder email sent: the account, the kind, the channel ('push' or
--                       'email') and when. NO TEXT: every message is fixed copy (lib/push/copy.ts). It is what the rate
--                       limits count (lib/push/policy.ts SEND_LIMITS).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-26-vbt.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/push/store.ts probes information_schema for PushSendLog (created last):
-- without the tables the settings block says notifications are not switched on yet, every send is a no-op, and nothing
-- 500s. Push also needs PUSH_ENABLED=true and the VAPID keys (OWN-19; docs/OFFLINE-AND-PUSH.md). Within ~5 minutes of
-- applying, with the keys set, the opt-in and the sends are on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model NotificationPref {
--          userId    String   @id
--          /// lib/push/policy.ts PUSH_KINDS.
--          kinds     String[] @default([])
--          email     Boolean  @default(false)
--          updatedAt DateTime @default(now())
--          user      User     @relation("NotificationPref", fields: [userId], references: [id], onDelete: Cascade)
--        }
--
--        model PushSubscription {
--          id            String    @id
--          userId        String
--          endpoint      String    @unique
--          p256dh        String
--          auth          String
--          createdAt     DateTime  @default(now())
--          lastSuccessAt DateTime?
--          failures      Int       @default(0)
--          user          User      @relation("PushSubscriptions", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@index([userId])
--        }
--
--        model PushSendLog {
--          id      String   @id
--          userId  String
--          kind    String
--          /// 'push' | 'email'.
--          channel String
--          sentAt  DateTime @default(now())
--          user    User     @relation("PushSendLogs", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@index([userId, sentAt])
--        }
--
--      and the back-relations on model User: `notificationPref NotificationPref? @relation("NotificationPref")`,
--      `pushSubscriptions PushSubscription[] @relation("PushSubscriptions")`, `pushSendLogs PushSendLog[] @relation("PushSendLogs")`.
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-10-26-push-subscriptions.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): NotificationPref and PushSubscription live until opt-out or the account goes (cascade).
-- PushSendLog is only needed for the rate limits (the longest window is one day); the recommendation is to delete rows
-- older than 30 days in the retention job. All three are in lib/data-rights/registry.ts (export and erase).
--
-- ROLLBACK (loses every opt-in and device): DROP TABLE "PushSendLog"; DROP TABLE "PushSubscription"; DROP TABLE "NotificationPref";

-- CreateTable
CREATE TABLE "NotificationPref" (
    "userId" TEXT NOT NULL,
    "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSendLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSendLog_userId_sentAt_idx" ON "PushSendLog"("userId", "sentAt");

-- AddForeignKey
ALTER TABLE "NotificationPref" ADD CONSTRAINT "NotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSendLog" ADD CONSTRAINT "PushSendLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
