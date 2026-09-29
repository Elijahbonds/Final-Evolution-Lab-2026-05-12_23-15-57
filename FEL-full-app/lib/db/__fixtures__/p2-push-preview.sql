-- CreateEnum
CREATE TYPE "MovementPattern" AS ENUM ('squat', 'hinge', 'lunge', 'push', 'pull', 'carry', 'rotation', 'locomotion', 'breath', 'mobility', 'other');

-- CreateEnum
CREATE TYPE "BraceMode" AS ENUM ('set', 'reflex', 'none');

-- CreateEnum
CREATE TYPE "SessionSection" AS ENUM ('prep', 'prime', 'key', 'assist', 'finish', 'cooldown');

-- AlterTable
ALTER TABLE "ProgramExercise" ADD COLUMN     "braceMode" "BraceMode",
ADD COLUMN     "pattern" "MovementPattern",
ADD COLUMN     "skillLayer" TEXT;

-- AlterTable
ALTER TABLE "SessionExercise" ADD COLUMN     "effortBand" TEXT,
ADD COLUMN     "holdSeconds" INTEGER,
ADD COLUMN     "isKeySet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "section" "SessionSection" NOT NULL DEFAULT 'key',
ADD COLUMN     "setupCues" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "supersetGroup" TEXT,
ADD COLUMN     "workSeconds" INTEGER;

-- CreateTable
CREATE TABLE "SetLog" (
    "id" TEXT NOT NULL,
    "exerciseLogId" TEXT NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "rir" INTEGER,
    "effort" INTEGER,
    "workSeconds" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SetLog_exerciseLogId_setIndex_key" ON "SetLog"("exerciseLogId", "setIndex");

-- AddForeignKey
ALTER TABLE "SetLog" ADD CONSTRAINT "SetLog_exerciseLogId_fkey" FOREIGN KEY ("exerciseLogId") REFERENCES "ExerciseLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

