-- TEACHER PLATFORM v1 (platform phase 10, lane plat-p10, 2026-11-03; owner 2026-10-20: "One teacher role granted by owner
-- approval (Camp-certified qualify automatically)"; courses free first).
-- ADDITIVE ONLY: three new tables, their indexes and three foreign keys. No existing table or column is changed or dropped.
-- RE-RUNNABLE (hardening 2026-11-03, AM gate on finish-release 05c73483): CREATE ... IF NOT EXISTS, and each foreign key and
-- policy sits in a one-line DO block that checks the catalog first, so a second run changes nothing. Each DO block is kept on
-- ONE line on purpose: tests/helpers/prismaDdl.ts splits statements on a `;` at the end of a line.
-- ROW-LEVEL SECURITY: the app reads and writes these tables only on the server through Prisma (DATABASE_URL, the table
-- owner, which RLS does not restrict without FORCE). There is no Supabase client and no browser access, and user ids are
-- NextAuth TEXT ids, not auth.uid(). So the least privilege is: RLS on, no policy that opens anything, an explicit deny
-- for anon and authenticated, and their table grants revoked. The Supabase API (PostgREST) then sees nothing.
-- ADULTS ONLY (18+) stays in app code (lib/teach/apply.ts). User.dobYear is a nullable, year-only self-attestation, so a
-- database check could not tell an 18th birthday apart from a 17-year-old, and it would block a null year. No DB check is added.
--
-- WHAT IS STORED.
--   TeacherApplication — one row per application: the discipline (lib/teach/apply.ts DISCIPLINES), a bio, a teaching
--                        sample, up to three https links, the status ('pending' | 'approved' | 'rejected'), the owner's
--                        note on a decision, when it was decided and by whom. Every word passed the safety text screen
--                        before it was written (lib/teach/apply.ts checkApplication). Adults only (18+).
--   TeacherRole        — one row per approved teacher: how the role came ('owner'), who granted it, when, and a revoke time
--                        (a revoked row stays so the revoke has a time). A Camp-certified facilitator needs no row: the
--                        role reads FacilitatorProfile.certificationStatus (lib/teach/role.ts).
--   TeachCourse        — a teacher's course: the title, a summary, the lessons as JSON (lib/teach/course.ts: ordered
--                        lessons of ordered blocks: card, demo, camera check, quiz, practice), 'draft' | 'published',
--                        and the times. A course is published only when lib/teach/course.ts courseErrors finds nothing.
--   NO STUDENT PROGRESS IS STORED: a student's place in a course stays on their device (teens included).
--
-- Written by hand in `prisma migrate diff --script` form; no Prisma command was run and prisma/schema.prisma and
-- public/_prisma/** are unchanged (the precedent: 2026-10-26-vbt.sql).
--
-- SAFE IN EITHER ORDER WITH THE DEPLOY. lib/teach/store.ts probes information_schema for TeachCourse (created last):
-- without the tables /teach says "Opens soon", applying answers 503 opens_soon, the owner's queue is empty, no badge
-- shows, and the coach store keeps working through COACH_STORE_COACH_USER_IDS. Within ~5 minutes of applying, it is on.
--
-- THE OWNER'S STEPS (docs/LANES.md section 4):
--   1. Locally, add to prisma/schema.prisma:
--
--        model TeacherApplication {
--          id         String    @id
--          userId     String
--          discipline String
--          bio        String
--          sample     String
--          links      String[]  @default([])
--          /// 'pending' | 'approved' | 'rejected'
--          status     String    @default("pending")
--          note       String?
--          createdAt  DateTime  @default(now())
--          decidedAt  DateTime?
--          decidedBy  String?
--          user       User      @relation("TeacherApplications", fields: [userId], references: [id], onDelete: Cascade)
--
--          @@index([status, createdAt])
--          @@index([userId])
--        }
--
--        model TeacherRole {
--          userId    String    @id
--          /// 'owner'
--          source    String
--          grantedBy String?
--          grantedAt DateTime  @default(now())
--          revokedAt DateTime?
--          user      User      @relation("TeacherRole", fields: [userId], references: [id], onDelete: Cascade)
--        }
--
--        model TeachCourse {
--          id          String    @id
--          teacherId   String
--          title       String
--          summary     String    @default("")
--          lessons     Json
--          /// 'draft' | 'published'
--          status      String    @default("draft")
--          createdAt   DateTime  @default(now())
--          updatedAt   DateTime  @default(now())
--          publishedAt DateTime?
--          teacher     User      @relation("TeachCourses", fields: [teacherId], references: [id], onDelete: Cascade)
--
--          @@index([teacherId])
--          @@index([status, updatedAt])
--        }
--
--      and the back-relations on model User: `teacherApplications TeacherApplication[] @relation("TeacherApplications")`,
--      `teacherRole TeacherRole? @relation("TeacherRole")`, `teachCourses TeachCourse[] @relation("TeachCourses")`.
--   2. Preview (read-only): npx prisma migrate diff --from-url "$PROD_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
--      — exactly the statements below.
--   3. Apply through db-guard (docs/DB-GUARD.md), or: npx prisma db execute --url "$PROD_DIRECT_URL" --file prisma/pending/2026-11-03-teacher.sql
--   4. Verify: the same diff prints an empty migration.
--   5. Regenerate and commit the client (public/_prisma/client and lib/generated/prisma) as the earlier pending files say.
--
-- RETENTION (OWNER CALL): an application is kept until the account goes (cascade); a rejected one could be deleted after a
-- period the owner sets. A course is kept until its teacher deletes it or the account goes. All three tables are in
-- lib/data-rights/registry.ts (export and erase).
--
-- ROLLBACK (loses every application, role and course): DROP TABLE "TeachCourse"; DROP TABLE "TeacherRole"; DROP TABLE "TeacherApplication";
-- (dropping a table drops its policies with it)

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeacherApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "sample" TEXT NOT NULL,
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "TeacherApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeacherRole" (
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TeacherRole_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TeachCourse" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "lessons" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "TeachCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeacherApplication_status_createdAt_idx" ON "TeacherApplication"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeacherApplication_userId_idx" ON "TeacherApplication"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeachCourse_teacherId_idx" ON "TeachCourse"("teacherId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeachCourse_status_updatedAt_idx" ON "TeachCourse"("status", "updatedAt");

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherApplication_userId_fkey' AND conrelid = '"TeacherApplication"'::regclass) THEN ALTER TABLE "TeacherApplication" ADD CONSTRAINT "TeacherApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherRole_userId_fkey' AND conrelid = '"TeacherRole"'::regclass) THEN ALTER TABLE "TeacherRole" ADD CONSTRAINT "TeacherRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeachCourse_teacherId_fkey' AND conrelid = '"TeachCourse"'::regclass) THEN ALTER TABLE "TeachCourse" ADD CONSTRAINT "TeachCourse_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;

-- RowLevelSecurity: on, with no policy that grants anything; the server (table owner) is unaffected
ALTER TABLE "TeacherApplication" ENABLE ROW LEVEL SECURITY;

-- DenyApiRoles: anon and authenticated (Supabase API roles) get no rows and no grants; skipped where the roles do not exist
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "TeacherApplication" FROM anon, authenticated; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'TeacherApplication' AND policyname = 'TeacherApplication_deny_api') THEN CREATE POLICY "TeacherApplication_deny_api" ON "TeacherApplication" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false); END IF; END IF; END $$;

-- RowLevelSecurity: on, with no policy that grants anything; the server (table owner) is unaffected
ALTER TABLE "TeacherRole" ENABLE ROW LEVEL SECURITY;

-- DenyApiRoles: anon and authenticated (Supabase API roles) get no rows and no grants; skipped where the roles do not exist
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "TeacherRole" FROM anon, authenticated; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'TeacherRole' AND policyname = 'TeacherRole_deny_api') THEN CREATE POLICY "TeacherRole_deny_api" ON "TeacherRole" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false); END IF; END IF; END $$;

-- RowLevelSecurity: on, with no policy that grants anything; the server (table owner) is unaffected
ALTER TABLE "TeachCourse" ENABLE ROW LEVEL SECURITY;

-- DenyApiRoles: anon and authenticated (Supabase API roles) get no rows and no grants; skipped where the roles do not exist
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "TeachCourse" FROM anon, authenticated; IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = current_schema() AND tablename = 'TeachCourse' AND policyname = 'TeachCourse_deny_api') THEN CREATE POLICY "TeachCourse_deny_api" ON "TeachCourse" AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false); END IF; END IF; END $$;
