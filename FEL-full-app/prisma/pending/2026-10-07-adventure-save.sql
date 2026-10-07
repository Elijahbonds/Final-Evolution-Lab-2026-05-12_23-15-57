-- ADVENTURE PHASE B (2026-10-07): AdventureSave — one row per account, the Adventure's save document as JSON.
-- docs/ADVENTURE-PLAN.md "Data and saves". ADDITIVE ONLY: one new table, no existing table changes.
-- Written by hand from the plan's DDL; NOT generated against the schema, and NO schema.prisma model is added yet
-- (public/_prisma stays as it is). The owner's step: apply it, add the model, regenerate the client, then a lane adds
-- the save route and flips lib/babylon/adventure/save/policy.ts ADVENTURE_SERVER_SAVE_ENABLED.
--
-- WHO MAY HAVE A ROW: verified adults only. A teen or an unknown age keeps the save on the device (A3's policy,
-- save/policy.ts adventureSavePolicy: TEEN_DEVICE_LOOK_EVERYWHERE's rule); the route must refuse their upload.
-- The document is the same versioned, sanitised, 48 KB-capped AdventureSave the device stores (save/save.ts).
--
-- ORDER: apply BEFORE any deploy that contains the route. Until then the device save is the save.
-- Applying is the owner's step. This lane does not run it against any database.

CREATE TABLE "AdventureSave" (
  "userId"    TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "version"   INTEGER NOT NULL,
  "doc"       JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- rollback: DROP TABLE "AdventureSave";
