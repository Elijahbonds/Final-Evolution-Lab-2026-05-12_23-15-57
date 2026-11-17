# Data rights: what "Download my data" and an account erase do with every table

Lane `lane/data-rights-sweep`, 2026-10-25. Many features landed in the last days with new pending tables, and the
export and erase had not followed them (the coach-readiness author said so in #447). This sweep classifies **every
table that holds a person's id**, applied (`prisma/schema.prisma`) or pending (`prisma/pending/*.sql`), and makes the
export and the erase follow that classification.

| Piece | File |
|---|---|
| The classification: per table and person column, what the export and the erase do, and why | `lib/data-rights/registry.ts` |
| The export and erase, run from the registry (raw SQL; a pending table not applied yet is skipped quietly) | `lib/data-rights/rights.ts` |
| **The guard**: any person column in schema.prisma or pending SQL that the registry does not classify fails | `lib/data-rights/registry.test.ts` |
| Real Postgres, opt-in: every table built from schema + all pending SQL, 250 seeded rows, erase checked row by row | `lib/data-rights/accountErase.integration.test.ts` (`DATA_RIGHTS_IT=1`, a `*throwaway*` DB on 127.0.0.1) |
| The operator's account erase (Privacy §4: account deletion is by email) | `scripts/erase-account.ts` |

## 1. What changed for a person

- **Download my data** (`/api/account/export`) now also carries `accountTables`: every other table they have rows in,
  with tokens and key material left out. That includes the wallet ledger rows, which is where referral week-one grants
  and daily drill claims live, and the challenges v2 guest results carried into the account (`GuestSession.data`).
- **Profile → Export / DELETE PRQ + MOVEMENT HISTORY** now carries and deletes the daily readiness jump checks (#447)
  and the client's filmed-set form reviews (#438) too: camera movement numbers, which is what that panel promises.
  The coach's readiness alerts cascade with the checks, as the feature's own delete does. The health-only erase does
  not touch them.
- **Account erase.** In the app since lane/account-delete (section 5): Account settings → **Delete my account**. The
  owner can still run `npx tsx scripts/erase-account.ts --user <id> --email <account email>` (dry run, counts only),
  then the same with `--commit`. Both call ONE function, `lib/data-rights/accountDelete.ts` eraseAccountNow. One
  transaction: the account row locked, rows that stay are scrubbed first, then the person's own rows are deleted, then
  the `User` row becomes a tombstone, and a CreditLedger event row records the counts once (Privacy §4 still says "by
  email": the wording change is `docs/DRAFT-policy-account-deletion.md`, for the owner).
- **Bug fixed (measured):** `/api/prq/delete` recorded its event with `postLc(amount: 0)` after the erase had
  committed. The double-entry mirror refuses a zero posting after the CreditLedger row is written, so every real PRQ
  delete erased, left the row and answered 500. It now writes the event row only.

## 2. Retention rules the erase follows (found, not invented)

- **Ledger**: no erase has ever deleted ledger history ("the wallet is untouched; the event is recorded"). Wallet,
  WalletLedgerEntry, CreditLedger, LedgerAccount/LedgerPosting and the append-only PassGrant log stay.
- **Money records**: Privacy §10 keeps order, payment, refund and referral records for 7 years, as an exception to
  deletion on request. Booking and review *details* (goal, note, pain answer, written review) are not in that exception,
  so they are scrubbed; the money columns stay. The original review clips are put due for the existing 30-day sweep.
- **Consent**: HealthConsent is kept by every erase (MIRROR-COACH-ERASE, owner 2026-09-30).
- **Safety**: party reports are kept 12 months.

## 3. Owner calls

1. **Tombstone, not delete.** The `User` row stays with no name, email, password, birth year/date or state (role reset),
   because money, ledger and other people's records point at it and `DELETE FROM "User"` would cascade into the wallet
   ledger or be refused. Kept on it: `kycStatus`/`kycVerifiedAt`, `selfExcludedAt`, `policyVersion`/`policyAcceptedAt`.
2. **A wallet balance** left at erase stays on the tombstone wallet. Nothing purges money records after their 7 years;
   that would be a retention job, like the party-report one.
3. **Consent ledgers beyond health.** ScanSaveOptIn and GuardianConsent are kept like HealthConsent. Say if they
   should go.
4. **Reports about an erased person** (PartyReport.reportedId) stay for their 12 months; the reporter's id is nulled on
   their own reports.
5. **A client's coaching program is kept, anonymised**, not deleted, so the coach's AI-draft decisions survive (they
   cascade from the program): its name is replaced and it is deactivated; the client's sessions, logs, message
   threads, form reviews and readiness rows are deleted; the draft text is replaced; the decision's athlete line and the
   coach's note are dropped. The athlete's export leaves out the coach's private decision note.
6. **Instructor and FacilitatorProfile rows stay** (bookings, program access and mentees' plans point at them):
   unpublished/revoked, profile text removed; display name, slug and business mailing address stay as the seller.
7. **The coach's reply clip** on a review stays in storage: nothing sweeps reply objects. Needs a storage delete.
8. **Kept as they are** (pointing at the tombstone): PerfEarnEvent ("retained even when rejected"), LadderEntry,
   CompetitionMatch/MatchEvent, MpMatch winners (names scrubbed), CrmNote authorship, programs a coach wrote for clients.
9. **Deleted that others could see**: the person's ChallengeLinks (closes `/c/<code>`), squads they own (an owner
   cannot leave, only delete), their coach testimonials and applications, a coach's readiness alerts about them.
10. **Signed-in sessions** end with the erase (lane/account-delete, owner decision 3): `lib/auth.ts`'s jwt callback
    reads the account with the role and empties a placeholder's token (section 5).
11. **Tables keyed by email only** (CreatorInquiry, an unconverted MarketingLead, BookEntitlement.email) are not matched
    by the account email, because it is not verified and matching on it could hand over or delete a stranger's rows.
    The owner handles those by hand on an email request.
12. `rate_limits` holds HMAC'd buckets only and sweeps itself within the hour; CallSignal expires in 10 minutes. Neither
    has a person column.

## 4. Inventory

"Export" is before → now for "Download my data" (`yes (key)` = already carried under that key). "Erase before" is
what the in-app erases did (PRQ = Profile's PRQ + movement erase; health = account settings' health erase); there was
no account erase. The last column is what the account erase does per person column; the reason for every entry is in
`lib/data-rights/registry.ts`. 98 tables: 11 exported before, 82 added, 5 excused (other people's data the person only
handles: CampTemplate, CrmActivity, CrmDeal, CrmNote, LibraryExercise).

| Table | Source | Export | Erase before | Account erase |
|---|---|---|---|---|
| AdventureSave | schema | — → added | — | userId: delete |
| AnalyticsEvent | schema | — → added | — | userId: delete; guestId: keep (not exported) |
| AthleteBuild | schema | — → added | — | userId: delete |
| AvatarLook | schema | — → added | — | userId: delete |
| BookEntitlement | pending | — → added | — | userId: keep |
| Booking | schema | — → added | — | clientUserId: scrub clientNote/goal/painYes/reviewNote/replyText/attachedDrillIds/clientTimeZone/originalClipDeleteAt; coachUserId: keep; instructorId: keep (not exported) |
| BreathLog | schema | yes → yes (breathLogs) | PRQ+health | userId: delete |
| CampSession | schema | — → added | — | menteeId: delete; facilitatorId: keep (not exported) |
| CampTemplate | schema | — → excused | — | authorId: keep (not exported) |
| CardOwnership | schema | — → added | — | userId: delete |
| CardSlot | schema | — → added | — | userId: delete |
| CellApiKey | schema | — → added | — | userId: delete |
| CellProject | schema | — → added | — | userId: delete |
| CellSettings | schema | — → added | — | userId: delete |
| ChallengeLink | schema | — → added | — | ownerUserId: delete |
| ClientSession | schema | — → added | — | clientId: delete |
| CoachApplication | pending | — → added | — | applicantId: delete; coachId: delete (not exported) |
| CoachAvailability | schema | — → added | — | coachId: delete; clientId: delete |
| CoachClient | schema | — → added | — | coachId: delete; clientId: delete |
| CoachConnectAccount | pending | — → added | — | userId: keep |
| CoachDraftDecision | pending | — → added | — | clientId: scrub clientLine/note; actorId: keep |
| CoachFormReview | pending | — → added (PRQ formReviews) | — | clientId: delete; coachId: keep (not exported) |
| CoachHighlight | pending | — → added | — | clientId: delete; coachId: delete |
| CoachingProgram | schema | — → added | — | clientId: scrub name/isActive; coachId: keep |
| CoachInvite | schema | — → added | — | coachId: delete |
| CoachMarketProfile | pending | — → added | — | userId: delete |
| CoachPackage | pending | — → added | — | coachId: scrub active |
| CoachProgramDraft | pending | — → added | — | clientId: scrub draft; coachId: delete |
| CoachSale | pending | — → added | — | coachId: keep; buyerId: keep |
| CoachStoreReferral | schema | — → added | — | referrerUserId: keep; buyerUserId: keep; coachUserId: keep |
| CompetitionMatch | schema | — → added | — | player1Id: keep; player2Id: keep; winnerId: keep; disputedBy: keep |
| CreativeCard | schema | — → added | — | ownerId: delete |
| CreatorCard | schema | — → added | — | ownerId: delete |
| Credential | schema | — → added | — | userId: delete |
| CreditLedger | schema | — → added | — | userId: keep |
| CrmActivity | schema | — → excused | — | ownerId: nullify (not exported) |
| CrmContact | schema | — → added | — | linkedUserId: delete; ownerId: nullify (not exported) |
| CrmDeal | schema | — → excused | — | ownerId: nullify (not exported) |
| CrmNote | schema | — → excused | — | authorId: keep (not exported) |
| FacilitatorProfile | schema | — → added | — | userId: scrub bio/facilitatorCardId/revokedAt/revokedReason |
| GameSession | schema | yes → yes (gameSessions) | — | userId: delete |
| GoalPlan | schema | — → added | — | menteeId: delete; facilitatorUserId: keep; facilitatorId: keep (not exported) |
| GuardianConsent | schema | — → added | — | menteeId: keep; acceptedById: keep |
| GuestSession | schema | — → added | — | migratedUserId: delete |
| HealthConsent | schema | yes → yes (healthConsents) | kept | userId: keep; coachId: keep (not exported) |
| HealthIntake | schema | yes → yes (healthIntakes) | PRQ+health | userId: delete |
| Instructor | schema | — → added | — | userId: scrub published/headline/bio/affiliationLine/certifications/specialties/creatorCardId |
| LadderEntry | schema | — → added | — | userId: keep |
| LedgerAccount | schema | — → added | — | userId: keep |
| LessonProgress | schema | — → added | — | userId: delete |
| LibraryExercise | pending | — → excused | — | reviewerId: nullify (not exported) |
| LibrarySubmission | pending | — → added | — | coachId: delete; moderatorId: nullify (not exported) |
| MarketingLead | schema | — → added | — | convertedUserId: delete |
| MarketplaceListing | schema | — → added | — | creatorId: scrub active |
| MarketplacePurchase | schema | — → added | — | buyerId: keep |
| MatchEvent | schema | — → added | — | userId: keep |
| MirrorSession | schema | yes → yes (mirrorSessions) | — | userId: delete |
| MirrorTriumph | schema | — → added | — | userId: delete |
| ModeMastery | schema | — → added | — | userId: delete |
| MpMatch | schema | — → added | — | hostId: scrub hostName; guestId: scrub guestName; winnerId: keep |
| Order | schema | — → added | — | userId: keep |
| OwnedWearable | schema | — → added | — | userId: delete |
| PainCheckIn | schema | yes → yes (painCheckIns) | PRQ+health | userId: delete |
| PartyReport | pending | — → added | — | reporterId: nullify; reportedId: keep (not exported) |
| PassGrant | schema | — → added | — | userId: keep |
| PassProgress | schema | — → added | — | userId: delete |
| PayoutRequest | schema | — → added | — | userId: keep |
| PerfEarnEvent | schema | — → added | — | playerId: keep |
| PlayerEntitlement | schema | — → added | — | playerId: delete |
| PlayerProfile | schema | yes → yes (playerProfile) | — | userId: delete |
| ProgramAccess | schema | — → added | — | userId: keep; instructorId: keep (not exported) |
| ProgramExercise | schema | — → added | — | coachId: keep |
| ProgramMessage | schema | — → added | — | programId: delete; authorId: keep |
| PrqEntry | schema | yes → yes (prqEntries) | PRQ | userId: delete |
| ReadinessAlert | pending | — → added | — | athleteId: delete; coachId: delete (not exported) |
| ReadinessCheckIn | schema | yes → yes (readinessCheckIns) | PRQ+health | userId: delete |
| ReadinessJumpCheck | pending | — → added (PRQ readinessJumpChecks) | — | userId: delete |
| ReadinessRule | pending | — → added | — | coachId: delete; scopeId: delete (not exported) |
| ReferralCode | schema | — → added | — | userId: scrub code |
| ReferralConversion | schema | — → added | — | referrerId: keep; referredUserId: keep |
| ScanSaveOptIn | schema | — → added | — | userId: keep |
| SessionBooking | schema | — → added | — | userId: delete |
| SessionGrant | schema | — → added | — | userId: delete |
| SessionJoinLink | schema | — → added | — | setById: keep |
| SessionRun | schema | — → added | — | userId: delete |
| ShareLink | schema | — → added | — | coachId: delete |
| SignatureAttempt | schema | — → added | — | userId: delete |
| StoryNodeProgress | schema | — → added | — | userId: delete |
| StripeCustomer | schema | — → added | — | userId: keep |
| StudioPartnerKey | schema | — → added | — | userId: delete |
| Subscription | schema | — → added | — | userId: keep |
| TrainingGroup | pending | — → added | — | ownerId: delete |
| TrainingGroupAct | pending | — → added | — | fromUserId: delete; toUserId: delete |
| TrainingGroupMember | pending | — → added | — | userId: delete |
| User | schema | yes → yes (profile) | — | id: tombstone |
| Wallet | schema | — → added | — | playerId: keep |
| WorkoutPlan | schema | — → added | — | userId: delete |
| WorkoutScan | schema | yes → yes (movementHistory) | PRQ (+scan-history: some kinds) | userId: delete |

## 5. In-app "Delete my account" (lane/account-delete, owner decisions 2026-10-25)

Owner decisions: (1) the erase above is approved, placeholder `User` row included; (2) add an in-app "Delete my
account" with a confirm step; (3) sign out everywhere immediately when an account is erased.

| Piece | File |
|---|---|
| The one erase both callers use: row lock, registry erase, event once (fixed dedupe key `account-erase`), audit log of counts and source | `lib/data-rights/accountDelete.ts` |
| Who may delete in the app, and what to settle first | `lib/data-rights/deleteGate.ts` |
| The words, each "kept" line tied to the policy line it repeats | `lib/data-rights/deleteCopy.ts` |
| 5 tries per account per 15 min, in `rate_limits`, per-instance window when that table is missing | `lib/data-rights/deleteRateLimit.ts` |
| GET (blocked? why) / POST (the delete) | `app/api/account/delete/route.ts` |
| The panel in account settings | `components/account/delete-account.tsx` |
| Sessions of an erased account end | `lib/auth/accountStatus.ts`, `lib/auth.ts` |
| The privacy-policy change, DRAFT, for the owner | `docs/DRAFT-policy-account-deletion.md` |

**The flow.** Signed in → rate limit (counted before the password is looked at) → the confirm box (`confirm: true`) →
already erased? 200 again, nothing new (a retry after a dropped answer) → re-authentication: the typed email is the
account's AND the password is right (one 403 for both) → not blocked → `eraseAccountNow(…, 'in-app')` → the session
cookie cleared, the client signs out.

**Sign out everywhere.** Sessions are NextAuth JWTs (`session.strategy: 'jwt'`); the Prisma adapter never writes a
Session row for them, so there is no row to delete. Every `getServerSession` runs the `jwt` callback, which already
read the `User` row every 5 minutes for the role. That read now selects the email too; a placeholder
(`erased-<id>@erased.invalid`, `lib/data-rights/tombstone.ts`) or a missing row gets an empty token, and the `session`
callback makes that no session (getServerSession → null, `/api/auth/session` → `{}`), so every route and page treats
it as signed out. To be quick rather than 5-minutes-late, the read also runs when this server instance has not seen the
account alive in the last 30 s (`ACCOUNT_STATUS_TTL_MS`, new): at most one small primary-key read per account per
instance per 30 s, none for an account read in the last 30 s, none for an account known erased. Immediate on the
instance that ran the erase (it marks it) and in the deleting browser (cookie cleared); within 30 s on the others.
A database error keeps the session (fail open, as the role refresh always did). The placeholder never signs in: its
password is `''` and `authorize()` refuses a placeholder email outright.

**Minors (owner call).** Under 18 by birth year, or no birth year (the consent rule, `needsGuardian`: blank reads as
under 18), is BLOCKED in the app with "ask your parent or guardian to email us" (no birth year: also "if you're 18 or
over, email us from the address on this account"). Why: a guardian has no account here, so there is no in-app place
for one to act, and nothing in the repo says whether a minor may delete their own account. Alternatives for the owner:
let a minor delete their own (deleting is privacy-protective), or a guardian delete on the signed guardian link.

**Obligations (chosen: block, with the list).** A booking as coach or client that is paid and not yet delivered or
attended, held at checkout, refund due or disputed; a payout PENDING/PROCESSING; an FEL subscription that will renew
(ACTIVE/PAST_DUE/INCOMPLETE, not cancel-at-period-end); a coach-business monthly plan sold or bought (CoachSale
ACTIVE) or a checkout still open. Not handled automatically: cancelling Stripe subscriptions, refunding or moving
payouts from inside an erase is outward-facing money work with its own webhook paths, and half-doing it in a database
transaction is how money gets lost. Each item is something the person can settle and then retry. A one-off PAID
coach-business package is not counted (nothing records when its sessions are used up); say if it should be.

**The audit event** is the CreditLedger row (amount 0, reason = counts + source, on the placeholder's id, which names
nobody after the erase) and one log line of counts and source, never the id.
