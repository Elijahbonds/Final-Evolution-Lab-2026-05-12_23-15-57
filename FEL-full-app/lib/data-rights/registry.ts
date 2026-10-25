// lib/data-rights/registry.ts — DATA-RIGHTS-SWEEP (2026-10-25): EVERY table that holds a person's data, and what the
// account export and the account erase do with it. The guard (./registry.test.ts) fails when a table or a person column
// in prisma/schema.prisma or prisma/pending/*.sql is not in here, so the next feature cannot miss it silently.
//
// One entry per table. Each SUBJECT is one way a row belongs to a person — usually one person column (`col`), sometimes
// a condition (`where`, with $1 = the account id). Per subject:
//   export  true            → rows where that subject is the person go into "Download my data";
//           'reason'         → they do not, and this is why (secrets, or other people's data the person only handles).
//   erase   'delete'         → the person's own rows go.
//           'nullify'        → the row stays for someone else; the person's id on it is set to NULL.
//           { scrub: {...} } → the row stays (another person's record, or a money record) and the listed fields are
//                              overwritten; the id still points at the account, which the erase turns into a tombstone
//                              with no name, email, password or birth date (`User`), so nothing identifies the person.
//           'keep'           → the row stays as it is. `why` names the retention rule (ledger, money records, consent).
//           'tombstone'      → the `User` row itself (see accountErase.ts).
//   why     the decision, for the owner. Every choice is written down here, nowhere else.
//
// RETENTION RULES THIS FOLLOWS (found, not invented):
//   · LEDGER — "the wallet is untouched; the event is recorded" (lib/prq-data-rights.ts erasureReason, app/api/prq/
//     delete/route.ts). No erase in this repo has ever deleted a ledger row: Wallet, WalletLedgerEntry, CreditLedger,
//     LedgerAccount/LedgerPosting stay. The season-pass grant log "stays append-only" (lib/wallet/stripe-wallet-events.ts).
//   · MONEY RECORDS — Privacy §10 (lib/policies.ts, read only): "Order, payment, refund and referral records: 7 years
//     after the purchase, for tax and accounting ... If you ask us to delete something sooner, we will, except records
//     the law requires us to keep." Booking and review DETAILS (goal, note, pain answer) are not in that exception, so
//     they are scrubbed and the money columns stay.
//   · CONSENT — HealthConsent rows are kept by every erase (MIRROR-COACH-ERASE, owner 2026-09-30: "the proof of what was
//     agreed and when it was withdrawn"). The other consent ledgers (ScanSaveOptIn, GuardianConsent) follow that rule;
//     that extension is an owner call (docs/DATA-RIGHTS.md).
//   · SAFETY — party reports are kept 12 months (Privacy, lib/party/social/reports.ts PARTY_REPORT_RETENTION_DAYS).
//
// `exportedAs` marks a table the export already carried before this sweep, under that key (lib/prq-data-rights.ts
// collectPrqExport, lib/account/exportData.ts collectAccountExport); the account tables section does not repeat it.

export type Scrub = Record<string, string>;
export type Erase = 'delete' | 'nullify' | 'keep' | 'tombstone' | { scrub: Scrub };

export interface Subject {
  /** The person column this subject is about. */
  col: string;
  /** A condition other than `"col" = $1` ($1 = the account id). Only static text from this file. */
  where?: string;
  /** Other tables `where` reads (it runs only when they exist too). */
  needs?: string[];
  /** true, or the reason these rows are not handed over. */
  export: true | string;
  /** Columns left out of this subject's export rows only. */
  exportOmit?: string[];
  erase: Erase;
  why: string;
}

export interface TableRights {
  subjects: Subject[];
  /** Columns never exported, whoever asks (secrets: password hashes, tokens, key material). */
  omit?: string[];
  /** Already exported under this key before the sweep. */
  exportedAs?: string;
  /** Rows of a child table with no person column, reached through this table (exported only; erase is the FK's). */
  children?: { table: string; sql: string; needs?: string[] }[];
}

const LEDGER = 'Ledger history is never deleted: every erase leaves the wallet untouched and records the event (lib/prq-data-rights.ts erasureReason). The row points at the tombstone account, which has no name or email.';
const MONEY = 'Money record: Privacy §10 keeps order, payment, refund and referral records 7 years for tax and accounting, an exception to deletion on request. The row points at the tombstone account, which has no name or email.';
const OWN = "The person's own data; nobody else keeps it.";
const NOT_ACCOUNT = 'Not an account id';
const OTHERS = "Other people's data the person handles in their role (coach, staff); it is not about them, so it is not theirs to download.";
const ERASED_NAME = "'Erased player'";

export const REGISTRY: Record<string, TableRights> = {
  // ── the account itself ────────────────────────────────────────────────────────────────────────────────────────────
  User: {
    exportedAs: 'profile',
    omit: ['password'],
    subjects: [{ col: 'id', export: true, erase: 'tombstone', why: 'The account row becomes a tombstone (no name, email, password, birth year/date, state; role reset) instead of being deleted, because money, ledger and other people\'s records point at it, and deleting it would cascade-delete the wallet ledger (Wallet onDelete Cascade) or be refused by Order/Subscription/Booking (Restrict).' }],
  },

  // ── PRQ, movement and health (already exported; the PRQ and health erases already delete them) ─────────────────────
  PrqEntry: { exportedAs: 'prqEntries', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  WorkoutScan: { exportedAs: 'movementHistory', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  GameSession: { exportedAs: 'gameSessions', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  HealthIntake: { exportedAs: 'healthIntakes', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  PainCheckIn: { exportedAs: 'painCheckIns', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  ReadinessCheckIn: { exportedAs: 'readinessCheckIns', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  BreathLog: { exportedAs: 'breathLogs', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  HealthConsent: {
    exportedAs: 'healthConsents',
    subjects: [
      { col: 'userId', export: true, erase: 'keep', why: 'Consent ledger: kept by every erase (MIRROR-COACH-ERASE, owner 2026-09-30).' },
      { col: 'coachId', export: OTHERS, erase: 'keep', why: "The athlete's consent ledger naming this coach; it is the athlete's proof, kept whoever is erased." },
    ],
  },
  MirrorSession: { exportedAs: 'mirrorSessions', subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  PlayerProfile: { exportedAs: 'playerProfile', subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Game stats and the legacy credit mirror; the balance that counts is the Wallet, which stays.' }] },
  // COACH-READINESS (#447): "not yet in the prq-data-rights export/erase". A camera jump number, so it rides the PRQ +
  // movement history export and erase (lib/prq-data-rights.ts), and through them the account ones.
  ReadinessJumpCheck: { exportedAs: 'readinessJumpChecks', subjects: [{ col: 'userId', export: true, erase: 'delete', why: "The athlete's own camera jump numbers. The coach's ReadinessAlert rows cascade with them, as the feature's own delete does (docs/COACH-READINESS.md §6.5)." }] },
  // COACH-VIDEO-REVIEW (#438): "add the table to the account data export". The form reads of a filmed set: movement
  // history, so the PRQ export and erase carry it.
  CoachFormReview: {
    exportedAs: 'formReviews',
    subjects: [
      { col: 'clientId', export: true, erase: 'delete', why: "The client's filmed-set numbers and pose tracks (docs/COACH-VIDEO-REVIEW.md §6: kept until the client deletes the set or the account is erased)." },
      { col: 'coachId', export: OTHERS, erase: 'keep', why: "A review in the coach's queue is the client's data; erasing the coach, the client's set stays." },
    ],
  },

  // ── game, progress and creative content ───────────────────────────────────────────────────────────────────────────
  SessionRun: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Run bookkeeping (anti-cheat, caps). SessionGrant cascades; what a run paid is on the wallet ledger, which stays.' }] },
  SessionGrant: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: "A run's grant breakdown; the money it moved is on the wallet ledger, which stays." }] },
  CardOwnership: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Owned cards; the purchase itself is on the ledger, which stays.' }] },
  StoryNodeProgress: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  LessonProgress: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  MirrorTriumph: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  ModeMastery: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  SignatureAttempt: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  PassProgress: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Season pass progress; a PRO purchase is in Order and the ledger, which stay.' }] },
  PassGrant: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: 'The season-pass grant log stays append-only (lib/wallet/stripe-wallet-events.ts): a reward grant is ledger history. ' + LEDGER }] },
  AthleteBuild: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  AvatarLook: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  OwnedWearable: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Owned items; the purchase is on the ledger, which stays.' }] },
  AdventureSave: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  WorkoutPlan: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: "A bought plan: the PRQ erase keeps it (it is not measurement data), the account erase does not. The purchase is on the ledger, which stays." }] },
  CreativeCard: { subjects: [{ col: 'ownerId', export: true, erase: 'delete', why: "The person's own creations (remixes by others keep their own rows; remixOf is not a foreign key)." }] },
  CardSlot: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  CreatorCard: { subjects: [{ col: 'ownerId', export: true, erase: 'delete', why: "The person's public creator card. Instructor/FacilitatorProfile/AvatarLook refer to it by id only (no foreign key)." }] },
  CellProject: {
    subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'The person\'s Cell projects. Files, messages and usage cascade; CellWisdom keeps its insight with the project id set to NULL (SetNull), and holds no person column.' }],
    children: [
      { table: 'ProjectFile', sql: `SELECT c.* FROM "ProjectFile" c JOIN "CellProject" p ON p."id" = c."projectId" WHERE p."userId" = $1` },
      { table: 'CellMessage', sql: `SELECT c.* FROM "CellMessage" c JOIN "CellProject" p ON p."id" = c."projectId" WHERE p."userId" = $1` },
      { table: 'CellUsage', sql: `SELECT c.* FROM "CellUsage" c JOIN "CellProject" p ON p."id" = c."projectId" WHERE p."userId" = $1` },
    ],
  },
  CellApiKey: { omit: ['keyCipher'], subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'The person\'s own provider keys. The export leaves out the encrypted key itself.' }] },
  CellSettings: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  StudioPartnerKey: { omit: ['keyHash'], subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Partner API keys (PartnerUsage cascades). The export leaves out the key hash.' }] },
  // CHALLENGES-2: a guest's challenge results live in GuestSession.data under `challenges`, carried to the account by
  // GuestSession.migratedUserId (lib/social/challenge-guest.ts).
  GuestSession: { omit: ['token', 'tokenHash'], subjects: [{ col: 'migratedUserId', export: true, erase: 'delete', why: "The guest rows carried into this account, including challenges v2 guest results. The export leaves out the guest token." }] },
  ChallengeLink: { omit: ['sig'], subjects: [{ col: 'ownerUserId', export: true, erase: 'delete', why: "The person's own signed challenge (their run, score and tag). Deleting it closes /c/<code> for anyone holding the link; a v2 challenge closes after 48 h anyway. A referral already paid stays on the ledger." }] },
  AnalyticsEvent: {
    subjects: [
      { col: 'userId', export: true, erase: 'delete', why: "Product events tied to the account. Aggregates already in MetricRollup hold no person column." },
      { col: 'guestId', export: `${NOT_ACCOUNT}: a hashed browser token (prisma/pending/2026-10-19-guest-token-hash-*.sql).`, erase: 'keep', why: `${NOT_ACCOUNT}; the account's own events go by userId above.` },
    ],
  },

  // ── competition and multiplayer ───────────────────────────────────────────────────────────────────────────────────
  LadderEntry: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: 'Prize-pool standings are kept: other players\' places and prize payouts depend on them. The row points at the tombstone account, which has no name.' }] },
  CompetitionMatch: {
    subjects: (['player1Id', 'player2Id', 'winnerId', 'disputedBy'] as const).map((col): Subject => ({
      col, export: true, erase: 'keep', why: "A staked match: escrow, settlement and refund ledger transactions reference it, and the opponent's record is the same row. " + MONEY,
    })),
  },
  MatchEvent: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: "The staked match's audit log (same rule as CompetitionMatch)." }] },
  MpMatch: {
    subjects: [
      { col: 'hostId', export: true, erase: { scrub: { hostName: ERASED_NAME } }, why: "The other player's match history: the row stays, the erased player's name on it is replaced." },
      { col: 'guestId', export: true, erase: { scrub: { guestName: ERASED_NAME } }, why: "The other player's match history: the row stays, the erased player's name on it is replaced." },
      { col: 'winnerId', export: true, erase: 'keep', why: 'Who won stays with the match (a rewarded match paid through the ledger); the name is scrubbed by the host/guest rule.' },
    ],
  },

  // ── money and the ledger ──────────────────────────────────────────────────────────────────────────────────────────
  CreditLedger: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: LEDGER }] },
  Wallet: {
    subjects: [{ col: 'playerId', export: true, erase: 'keep', why: LEDGER + ' A balance left in it stays there (owner call: docs/DATA-RIGHTS.md).' }],
    // the referral week-one grants (lib/social/challenge-referral.ts) and the daily drill claims (lib/daily-drill/
    // claim.ts) are wallet ledger rows: no table of their own, so they ride here.
    children: [{ table: 'WalletLedgerEntry', sql: `SELECT e.* FROM "WalletLedgerEntry" e JOIN "Wallet" w ON w."id" = e."walletId" WHERE w."playerId" = $1`, needs: ['Wallet'] }],
  },
  LedgerAccount: {
    subjects: [{ col: 'userId', export: true, erase: 'keep', why: LEDGER }],
    children: [{ table: 'LedgerPosting', sql: `SELECT p.* FROM "LedgerPosting" p JOIN "LedgerAccount" a ON a."id" = p."accountId" WHERE a."userId" = $1` }],
  },
  PerfEarnEvent: { subjects: [{ col: 'playerId', export: true, erase: 'keep', why: 'The anti-fraud record behind wallet earnings: "Retained even when rejected" (schema.prisma). Owner call whether an erased account\'s raw payloads should go (docs/DATA-RIGHTS.md).' }] },
  PlayerEntitlement: { subjects: [{ col: 'playerId', export: true, erase: 'delete', why: 'Access to bought SKUs; the purchase itself is in Order and the ledger, which stay.' }] },
  StripeCustomer: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: MONEY }] },
  Subscription: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: MONEY }] },
  Order: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: MONEY }] },
  PayoutRequest: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: MONEY }] },
  MarketplacePurchase: { subjects: [{ col: 'buyerId', export: true, erase: 'keep', why: MONEY }] },
  MarketplaceListing: { subjects: [{ col: 'creatorId', export: true, erase: { scrub: { active: 'false' } }, why: "Buyers' purchases point at the listing (Restrict): it stays, taken off sale." }] },
  BookEntitlement: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: 'A book order (the buyer\'s email is on it as the receipt address). ' + MONEY }] },
  SessionBooking: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'A shard-paid session booking; the shards paid are on the wallet ledger, which stays.' }] },
  ReferralCode: { subjects: [{ col: 'userId', export: true, erase: { scrub: { code: `'erased-' || "id"` } }, why: "ReferralConversion (a referral record) cascades from it, so it stays; its code is replaced so the old link no longer pays anyone." }] },
  ReferralConversion: {
    subjects: [
      { col: 'referrerId', export: true, erase: 'keep', why: 'A referral record (shards awarded). ' + MONEY },
      { col: 'referredUserId', export: true, erase: 'keep', why: 'A referral record (shards awarded). ' + MONEY },
    ],
  },
  MarketingLead: { subjects: [{ col: 'convertedUserId', export: true, erase: 'delete', why: 'The marketing lead this account converted from: name, email and IP hash. Not a money record.' }] },

  // ── coach store (applied pending SQL: 2026-10-04) ─────────────────────────────────────────────────────────────────
  Instructor: {
    subjects: [{
      col: 'userId', export: true,
      erase: { scrub: { published: 'false', headline: 'NULL', bio: 'NULL', affiliationLine: 'NULL', certifications: `'{}'`, specialties: `'{}'`, creatorCardId: 'NULL' } },
      why: 'Bookings and program access (money records) point at it (Restrict), so it stays, unpublished, without the profile text. displayName, slug and the seller postal address stay as the seller on those records (owner call: docs/DATA-RIGHTS.md).',
    }],
  },
  ProgramAccess: {
    omit: ['unlockCodeHash', 'deviceTokenHash'],
    subjects: [
      { col: 'userId', export: true, erase: 'keep', why: 'A purchase. ' + MONEY },
      { col: 'instructorId', export: `${NOT_ACCOUNT}: an Instructor profile id; the coach side is Instructor.userId.`, erase: 'keep', why: 'The seller on a money record.' },
    ],
  },
  Booking: {
    subjects: [
      {
        col: 'clientUserId', export: true,
        erase: { scrub: {
          clientNote: 'NULL', goal: 'NULL', painYes: 'NULL', reviewNote: 'NULL', replyText: 'NULL', attachedDrillIds: 'NULL', clientTimeZone: 'NULL',
          // the original clips go through the existing 30-day sweep (lib/coach-store/api.ts sweepOriginals), now
          originalClipDeleteAt: `CASE WHEN "originalsDeletedAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "originalClipDeleteAt" END`,
        } },
        why: 'Privacy §10: booking and review details (goal, note, pain answer, the written review) are deleted on request; the price, fees, Stripe ids and dates are the money record and stay. The original clips are put due for the existing sweep, which deletes the stored objects. The reply clip object is not swept by anything (owner call).',
      },
      { col: 'coachUserId', export: true, erase: 'keep', why: "The client's booking and the money record; erasing the coach leaves it." },
      { col: 'instructorId', export: `${NOT_ACCOUNT}: an Instructor profile id; the coach side is coachUserId.`, erase: 'keep', why: 'The seller on a money record.' },
    ],
  },
  CoachStoreReferral: {
    subjects: (['referrerUserId', 'buyerUserId', 'coachUserId'] as const).map((col): Subject => ({ col, export: true, erase: 'keep', why: 'A referral payment record. ' + MONEY })),
  },

  // ── coaching ──────────────────────────────────────────────────────────────────────────────────────────────────────
  CoachingProgram: {
    subjects: [
      {
        col: 'clientId', export: true, erase: { scrub: { name: `'Program'`, isActive: 'false' } },
        why: "KEPT, not deleted, so the coach's audit trail survives: CoachProgramDraft (and through it CoachDraftDecision) cascade from the program. The coach's own programming stays; the client's sessions, logs, messages, form reviews and the draft text are erased by their own rules; the program's name (which may name the client) is replaced.",
      },
      { col: 'coachId', export: true, erase: 'keep', why: "Clients keep the programs they follow when their coach is erased." },
    ],
    children: [
      { table: 'ExerciseLog', sql: `SELECT l.* FROM "ExerciseLog" l JOIN "ClientSession" c ON c."id" = l."clientSessionId" WHERE c."clientId" = $1`, needs: ['ClientSession'] },
      { table: 'SetLog', sql: `SELECT s.* FROM "SetLog" s JOIN "ExerciseLog" l ON l."id" = s."exerciseLogId" JOIN "ClientSession" c ON c."id" = l."clientSessionId" WHERE c."clientId" = $1`, needs: ['ExerciseLog', 'ClientSession'] },
      { table: 'Block', sql: `SELECT b.* FROM "Block" b JOIN "CoachingProgram" p ON p."id" = b."programId" WHERE p."clientId" = $1` },
      { table: 'Session', sql: `SELECT s.* FROM "Session" s JOIN "Block" b ON b."id" = s."blockId" JOIN "CoachingProgram" p ON p."id" = b."programId" WHERE p."clientId" = $1`, needs: ['Block'] },
      { table: 'SessionExercise', sql: `SELECT e.* FROM "SessionExercise" e JOIN "Session" s ON s."id" = e."sessionId" JOIN "Block" b ON b."id" = s."blockId" JOIN "CoachingProgram" p ON p."id" = b."programId" WHERE p."clientId" = $1`, needs: ['Session', 'Block'] },
    ],
  },
  ClientSession: { subjects: [{ col: 'clientId', export: true, erase: 'delete', why: "The client's training log (ExerciseLog and SetLog cascade)." }] },
  ProgramMessage: {
    subjects: [
      {
        col: 'programId', where: `"programId" IN (SELECT "id" FROM "CoachingProgram" WHERE "clientId" = $1)`, needs: ['CoachingProgram'], export: true, erase: 'delete',
        why: 'The whole thread of the client\'s own programs, the coach\'s messages too: Privacy §10 deletes "messages with your coach" on request.',
      },
      { col: 'authorId', export: true, erase: 'keep', why: "Messages this person wrote in someone else's program (a coach's replies): the client's thread keeps them." },
    ],
  },
  ProgramExercise: { subjects: [{ col: 'coachId', export: true, erase: 'keep', why: "The coach's exercise catalogue is kept: clients' programs use it (SessionExercise Restrict). libraryExerciseId (pending) is a catalogue link, not a person column." }] },
  CoachClient: {
    subjects: [
      { col: 'coachId', export: true, erase: 'delete', why: 'The coaching link ends with either side (CoachAvailability cascades).' },
      { col: 'clientId', export: true, erase: 'delete', why: 'The coaching link ends with either side (CoachAvailability cascades).' },
    ],
  },
  CoachAvailability: {
    subjects: [
      { col: 'coachId', export: true, erase: 'delete', why: 'Cascades with CoachClient; deleted directly too.' },
      { col: 'clientId', export: true, erase: 'delete', why: 'Cascades with CoachClient; deleted directly too.' },
    ],
  },
  ShareLink: { omit: ['token'], subjects: [{ col: 'coachId', export: true, erase: 'delete', why: "The coach's share links (their payload can carry a client's first name); deleting them closes the links." }] },
  CoachInvite: { omit: ['token'], subjects: [{ col: 'coachId', export: true, erase: 'delete', why: "The coach's invites." }] },
  // COACH-AI-DRAFT (#436)
  CoachProgramDraft: {
    subjects: [
      { col: 'clientId', export: true, erase: { scrub: { draft: `'{"erased":true}'::jsonb` } }, why: "The draft JSON can name the client's pain or readiness; it is replaced. The row stays because the coach's decisions on it cascade from it (the reader skips a draft it cannot read)." },
      { col: 'coachId', export: true, erase: 'delete', why: "An erased coach's drafts and, through the cascade, their own decisions on them. The clients' programs are untouched." },
    ],
  },
  CoachDraftDecision: {
    subjects: [
      { col: 'clientId', export: true, exportOmit: ['note'], erase: { scrub: { clientLine: 'NULL', note: 'NULL' } }, why: "The coach's audit trail stays (who decided, when, approved/edited/rejected, the before and after numbers); the athlete-facing line and the coach's free-text note, which can name the athlete's pain, are dropped. The athlete's export leaves out the coach's private note." },
      { col: 'actorId', export: true, erase: 'keep', why: "The deciding coach's record; it goes with that coach's drafts (cascade) when they are erased." },
    ],
  },
  // COACH-READINESS (#447)
  ReadinessRule: {
    subjects: [
      { col: 'coachId', export: true, erase: 'delete', why: "The coach's own rules." },
      { col: 'scopeId', where: `"scope" = 'athlete' AND "scopeId" = $1`, export: OTHERS, erase: 'delete', why: "A coach's rule for this one athlete is about them; it goes with them." },
    ],
  },
  ReadinessAlert: {
    subjects: [
      { col: 'athleteId', export: true, erase: 'delete', why: 'Cascades with the jump check it came from (the feature\'s own delete does the same); deleted directly too.' },
      { col: 'coachId', export: OTHERS, erase: 'delete', why: "An erased coach's inbox." },
    ],
  },
  // COACH-BUSINESS (#442, #445)
  CoachConnectAccount: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: 'The Stripe Connect account that CoachSale money records name. ' + MONEY }] },
  CoachPackage: { subjects: [{ col: 'coachId', export: true, erase: { scrub: { active: 'false' } }, why: 'Sales point at it (CoachSale.packageId Restrict): it stays, off sale.' }] },
  CoachSale: {
    subjects: [
      { col: 'coachId', export: true, erase: 'keep', why: MONEY },
      { col: 'buyerId', export: true, erase: 'keep', why: MONEY },
    ],
  },
  CoachMarketProfile: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'The marketplace listing settings; deleting delists the coach.' }] },
  CoachHighlight: {
    subjects: [
      { col: 'clientId', export: true, erase: 'delete', why: "A client's testimonial: their words and their consent; it goes with them." },
      { col: 'coachId', export: true, erase: 'delete', why: "The coach's showcase; it goes with them." },
    ],
  },
  CoachApplication: {
    subjects: [
      { col: 'applicantId', export: true, erase: 'delete', why: "The applicant's goal and note." },
      { col: 'coachId', export: OTHERS, erase: 'delete', why: "Applications to an erased coach have nowhere to go." },
    ],
  },
  // EXERCISE-LIBRARY (#444)
  LibrarySubmission: {
    subjects: [
      { col: 'coachId', export: true, erase: 'delete', why: "The coach's submissions. An accepted one already made its own LibraryExercise row (no foreign key back), which stays in the shared library." },
      { col: 'moderatorId', export: OTHERS, erase: 'nullify', why: 'A moderator\'s decision stays on the coach\'s submission without naming them.' },
    ],
  },
  LibraryExercise: { subjects: [{ col: 'reviewerId', export: OTHERS, erase: 'nullify', why: 'Shared catalogue entry; the reviewer is no longer named.' }] },
  // TEAMS-SQUADS (#441)
  TrainingGroup: { omit: ['inviteToken'], subjects: [{ col: 'ownerId', export: true, erase: 'delete', why: 'An owner cannot leave a group, only delete it (lib/groups/rules.ts); erasing the owner deletes it, and its members and feed cascade.' }] },
  TrainingGroupMember: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: 'Leaves every group.' }] },
  TrainingGroupAct: {
    subjects: [
      { col: 'fromUserId', export: true, erase: 'delete', why: "The person's reactions, nudges and posts (the foreign key cascades the same way)." },
      { col: 'toUserId', export: true, erase: 'delete', why: 'Reactions, nudges and trophies aimed at the person (the foreign key cascades the same way).' },
    ],
  },
  // COMBINE-DAY (lane/combine-day; prisma/pending/2026-10-25-combine-day.sql). Numbers only: no frame, video or note.
  CombineEvent: { subjects: [{ col: 'coachId', export: true, erase: 'delete', why: "The coach's own combines (name, stations, weights). Erasing the coach deletes them, and their entrants and results cascade (the foreign keys do the same), as a team goes with its owner." }] },
  CombineEntrant: { subjects: [{ col: 'athleteId', export: true, erase: 'delete', why: "That the athlete was on a coach's combine; it goes with them (the foreign key cascades the same way)." }] },
  CombineResult: { subjects: [{ col: 'athleteId', export: true, erase: 'delete', why: "The athlete's own combine numbers (jump, approach and drill reads, hand-timed times). Other athletes' results stay with the coach's combine (the foreign key cascades the same way)." }] },

  // ── camp / facilitator ────────────────────────────────────────────────────────────────────────────────────────────
  FacilitatorProfile: {
    subjects: [{
      col: 'userId', export: true,
      erase: { scrub: { bio: 'NULL', facilitatorCardId: 'NULL', revokedAt: `COALESCE("revokedAt", CURRENT_TIMESTAMP)`, revokedReason: `COALESCE("revokedReason", 'account erased')` } },
      why: "Mentees' goal plans and camp sessions point at it (Restrict): it stays, revoked, without the bio.",
    }],
  },
  Credential: { subjects: [{ col: 'userId', export: true, erase: 'delete', why: OWN }] },
  GuardianConsent: {
    omit: ['token'],
    subjects: [
      { col: 'menteeId', export: true, erase: 'keep', why: 'Proof of a guardian\'s consent, kept like HealthConsent (owner call to extend that rule here: docs/DATA-RIGHTS.md).' },
      { col: 'acceptedById', export: true, erase: 'keep', why: "The mentee's proof of consent; kept when the guardian's account is erased." },
    ],
  },
  GoalPlan: {
    subjects: [
      { col: 'menteeId', export: true, erase: 'delete', why: "The mentee's goals (CampSession cascades)." },
      { col: 'facilitatorUserId', export: true, erase: 'keep', why: "The mentee's plan stays when the facilitator is erased." },
      { col: 'facilitatorId', export: `${NOT_ACCOUNT}: a FacilitatorProfile id.`, erase: 'keep', why: 'Kept: the facilitator profile is scrubbed, not deleted.' },
    ],
  },
  CampSession: {
    subjects: [
      { col: 'menteeId', export: true, erase: 'delete', why: "The mentee's session outcomes." },
      { col: 'facilitatorId', export: `${NOT_ACCOUNT}: a FacilitatorProfile id.`, erase: 'keep', why: "The mentee's record stays when the facilitator is erased." },
    ],
  },
  CampTemplate: { subjects: [{ col: 'authorId', export: `${NOT_ACCOUNT}: a FacilitatorProfile id (shared templates).`, erase: 'keep', why: 'Shared, forkable templates; the author profile is scrubbed, not deleted.' }] },

  // ── consent, safety, CRM, sessions ────────────────────────────────────────────────────────────────────────────────
  ScanSaveOptIn: { subjects: [{ col: 'userId', export: true, erase: 'keep', why: 'Consent ledger for saved numbers (granted/revoked, text version), kept like HealthConsent (owner call: docs/DATA-RIGHTS.md).' }] },
  PartyReport: {
    subjects: [
      { col: 'reporterId', export: true, erase: 'nullify', why: 'The report stays for its 12-month safety retention (Privacy; lib/party/social/reports.ts), without who filed it.' },
      { col: 'reportedId', export: 'Reports about the person are not handed over: they would tell them who reported them.', erase: 'keep', why: 'A safety record about someone erasing their account stays for its 12 months (owner call: docs/DATA-RIGHTS.md).' },
    ],
  },
  SessionJoinLink: { subjects: [{ col: 'setById', export: true, erase: 'keep', why: "A session's join link, set by staff or a coach, is kept: attendees need it. It names nobody else." }] },
  CrmContact: {
    subjects: [
      { col: 'linkedUserId', export: true, erase: 'delete', why: 'The business\'s contact record about this person (CrmNote cascades; deals and activities keep their rows with the contact set to NULL).' },
      { col: 'ownerId', export: OTHERS, erase: 'nullify', why: 'A sales rep\'s assignment; the contact stays, unassigned.' },
    ],
  },
  CrmDeal: { subjects: [{ col: 'ownerId', export: OTHERS, erase: 'nullify', why: "A sales rep's assignment; the deal stays, unassigned." }] },
  CrmActivity: { subjects: [{ col: 'ownerId', export: OTHERS, erase: 'nullify', why: "A sales rep's assignment; the activity stays, unassigned." }] },
  CrmNote: { subjects: [{ col: 'authorId', export: OTHERS, erase: 'keep', why: 'A business note about a contact, written by staff: the contact\'s record, kept when the author is erased.' }] },
};

/** The movement-history subjects the PRQ export and erase carry (pending tables, raw SQL). */
export const PRQ_MOVEMENT: { table: string; col: string; key: 'readinessJumpChecks' | 'formReviews' }[] = [
  { table: 'ReadinessJumpCheck', col: 'userId', key: 'readinessJumpChecks' },
  { table: 'CoachFormReview', col: 'clientId', key: 'formReviews' },
];
