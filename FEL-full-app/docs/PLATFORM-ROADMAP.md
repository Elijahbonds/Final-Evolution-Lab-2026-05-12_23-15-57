# Platform roadmap: educators, coaches, athletes, gamers, money and growth

**The owner's frame (2026-10-20):** FEL is "Udemy / Khan Academy × TrueCoach × the game × the Muscle & Motion strength
training app". It serves movement practitioners, dance teachers, musicians and producers, voice coaches, coaches,
athletes and gamers. The owner's answers are in the EDUCATORS, COACHES, ATHLETES, GAMERS, MONEY, GOAL GAP and
ADVERTISEMENT / GROWTH lines of the 2026-10-20 decisions, and each one is quoted in the table where it is used.

**The priority stays the owner's:** game feel first (the hoops and feel lanes), then the Nexus build-out
(`docs/NEXUS-ROADMAP.md` on `lane/nexus-roadmap`). This plan does not reorder that. It names the platform phases
that touch **different files** (coach, education, money and growth code, not game modes), so they *can* run beside
those lanes if the owner says so (Q1).

Lane: `lane/platform-roadmap`, docs only. Read with `docs/SPEC-PASSION-PIPELINES.md`, `docs/COACH-COMPETITIVE-AUDIT.md`,
`docs/KNOWLEDGE-FEED.md`, `docs/CAMP-BLUEPRINT.md`, `docs/coach-store.md`, `docs/SHIP-READINESS.md`, and
`docs/LAUNCH-CHECKLIST.md` (on `lane/launch-docs`).

**How this was measured.** The code was read on `lane/finish-release` at `3bf7ac7b` (2026-10-19) by file and by grep.
Nothing was run: this lane builds nothing and shares the machine. Free-tier numbers were read from Google's and
Firebase's pricing pages on 2026-10-20 (sources at the end). Anything that is a guess says `assumption:`.

**Sizes.** S = up to a day of one lane. M = 2 to 5 days. L = 1 to 2 weeks. XL = more than 2 weeks, or several lanes.

---

## 0. The short version

1. **Most of the coach platform is built and switched off.** The invite link and QR, the roster, templates and
   duplication, the attention board, Mirror-to-program, video review, live 1:1 calls, memberships, courses and series
   all exist. What is missing is mostly **plumbing that needs the owner**: an email sender, Stripe Connect, live Stripe
   keys, the pending SQL and the policy text.
2. **One finding to check before the athletes' work starts (§1.2).** grep finds no age check and no guardian-consent
   check on joining a coach's roster (`app/api/coach/invite/**`) or on logging sets (`app/api/coach/me/log`).
   assumption: a 13-to-17 account can join a roster and log training today **without** guardian consent. The owner's
   new rule says it needs consent.
3. **Video at no extra cost is possible because FEL's best "video" is not video.** The engine already turns any
   capture into the rig's pose keys and plays them on any body (`lib/babylon/anim/mocapRetarget.ts` +
   `poseClip`). Measured on the repo's own retargeted captures, that is **about 60–80 KB per minute** (gzip), against
   about 7.5 MB per minute for 720p video, roughly 100× smaller. Recommended layers in §2.
4. **Money at launch needs no Connect.** Final Evolution LLC is the seller of record for FEL Pro, the season pass PRO
   lane, cosmetics, books and Elijah's own coach store. Connect is needed only when **other** teachers and creators
   are paid (P5).
5. **"No ads ever" is written down as a product rule (§5.5).** It has one live conflict: YouTube may show its own ads
   on an embedded unlisted video (§2.5, Q8).

---

## 1. Gap tables, one per audience

Each row: the owner's answer → what exists today (file, flag, on or off) → what is missing → size. "Off" means the
code is there behind a flag that is unset in production. "Off (SQL)" means the code also needs pending SQL that is
not applied.

### 1.1 Educators

Owner (EDUCATORS, 2026-10-20): reframe as Udemy/Khan × TrueCoach × the game × Muscle & Motion. Disciplines: **all**
(movement and strength, dance, musicians and producers, voice coaches). Course formats: **all** (lesson + camera check,
3D demos on the avatar, practice inside games, teacher video lessons). Who teaches: **approved teachers** (apply; the
owner approves; a Teacher badge on the Creator Card). Teacher pay: **all** (courses, monthly memberships, 1:1 and video
review, classes for schools and studios). Under 13: class play with no accounts. Pricing: a free class tier plus paid
Facility. Content: PE lesson plans, movement science units, the Studio for classes.

| Owner answer | Exists today | Missing | Size |
|---|---|---|---|
| Lessons with a camera check | `lib/education/course.ts` (the Playbook as a course, imported from the book, never retyped), `lib/education/lessonMovement.ts` (a lesson links to `/play/mirror?pattern=<id>`), `lib/education/chapterCheck.ts` (teens' results stay on the device, `checkDevice.ts`). Routes `/education`, `/education/playbook/**`, `/api/education/**`. On | A lesson format **any teacher** can author. Today the only course is the owner's book, and the format is the book's chapter shape. A camera check exists only for movements the Mirror reads (`MIRROR_PATTERNS`) | M |
| 3D demos on the avatar | `components/coach/exercise-demo.tsx`: a YOUR AVATAR tab and a COACH VIDEO tab (a YouTube link). The avatar tab loops "a representative athletic clip chosen from the exercise's target stat" (`exercise-avatar-canvas.tsx`), **not the exercise itself** | A per-exercise and per-step motion: the motion lessons in §2.3 (P3) | L |
| Practice inside games | `ChallengeLink` (async best score), `ModeMastery`. The passion-pipelines plan's C5 ("a session exercise can be a FEL mode challenge") | C5 is **not built**: no `SessionExercise` field names a mode or a challenge (schema read), and nothing in `lib/coach` reads `ChallengeLink` (grep) | M |
| Teacher video lessons | Coach-store video review: private GCS bucket, V4 signed URLs, no package (`lib/coach-store/storage.ts`); creator media buckets (`lib/soundtrack/storage.ts`). Off: `COACH_REVIEW_UPLOADS_ENABLED`, `COACH_REVIEWS_BUCKET`, `CREATOR_MEDIA_BUCKET`, `CREATOR_MEDIA_PUBLIC_BUCKET` | A teacher-lesson media type, in-browser compression before upload, a per-teacher storage budget. §2 | M |
| Movement and strength | Program templates with variation ladders (`lib/coach/templateCatalogue.ts`), the catalogue (`lib/coach/catalogue.ts`), cue lint, the Mirror's correctives | A Muscle & Motion-style **anatomy layer** (which muscles, common mistakes per exercise). Faults and cues exist per template exercise; there is no muscle map anywhere (grep) | L |
| Dance | Dance mode, captured steps (`lib/babylon/anim/authored/mocapDance.ts`), charts | A teacher records a routine and students learn it (§2.3) | L (in P3) |
| Musicians and producers | Groove Academy (`/play/music`): groovebox, the Flip chop pad, song sections, recorded takes, stems (`SPEC-PASSION-PIPELINES` lane 2) | Music **lessons**: a teacher's pattern as a lesson students open and play; audio-only lessons. Finger tracking for instruments is not possible with the body model (33 points; §2.3) | M |
| Voice coaches | The mic path in the Flip and takes (`FlipPad.tsx`, `Song.ts`), The Mic spec (`docs/SPEC-THE-MIC.md`) | Audio-only lessons and an audio review (the video-review flow with audio instead of clips). §2.4 | M |
| Approved teachers, Teacher badge | `FacilitatorProfile.certificationStatus` (auto-certified by the Camp curriculum, owner revoke switch); `COACH_STORE_COACH_USER_IDS` (env list of coaches); `Instructor.published`; `CreatorInquiry` + `/work-with-us` (pending SQL); `app/admin/review` (founder and admin approve creative cards) | An **application** (who you are, discipline, sample), an owner approval queue (reuse `app/admin/review`), a `teacher` role the coach store and education routes read instead of an env list, and the badge on `CreatorCard`. Two "who may coach" rules exist (certified facilitator vs the env list); the owner's new answer is a third. Q3 picks one | M |
| Sell courses | `lib/coach-store/manifest.ts`, `entitlement.ts`: listing kinds `program`, `course`, `series`, `bundle`, `membership`, `live_1on1`, `video_review`. Off (SQL): `COACH_STORE_ENABLED`, `COACH_STORE_PAYMENTS_ENABLED` | Works for **one seller** (Final Evolution LLC). Other teachers need Connect (P5) | in P5 |
| Monthly memberships | `membership` kind, subscription webhooks (`invoice.paid`, `customer.subscription.*`) | `membershipIncludesCourses` is an open owner question in `bundlePolicy.ts` (default false) | S |
| 1:1 and video review | `Booking` (`live_1on1`, `video_review`), slots, ICS, WebRTC call with no recording (`lib/coach-store/call/**`), 48 h review SLA. Adults only (`lib/coach-store/adult.ts`). Off (SQL) | Multi-teacher payouts (P5); TURN relay for calls that fail peer-to-peer (`iceServers.ts` is STUN only) | in P5 |
| Classes for schools and studios | FEL Facility $199/month and FEL Coach $39/month in `lib/stripe.ts` (B2B lane, behind `VIRTUAL_PURCHASES_ENABLED`). `/host?mode=` + phone controllers + `/play/party` (TV stage) | A **class mode**: a teacher-hosted session with no child accounts (§4.3). A free class tier. The Facility plan's seats | L |
| Under 13: class play, no accounts | Terms §2: "We can't create an account for anyone under 13. A child under 13 may use the free movement screen only with an adult present, and nothing from it is saved." `lib/privacy/u13LockLog.ts`, the age screen | The class mode above, plus new Terms and Privacy text and counsel (§4) | L |
| PE lesson plans, movement science units | 12 knowledge packs × 16 cards + the Playbook (`lib/knowledge/packs/*.json`), sourced, fact-checked (KNOWLEDGE-FEED v2) | PE lesson plans (warm-up, the activity, a game, a check) mapped to grade bands. Content work by the owner or approved teachers, not code | M (format) + content |
| The Studio for classes | Nexus Studio (`/studio`, `NEXUS_STUDIO_ENABLED`, off), Studio save (held) | After the Nexus roadmap's phase 9 (creator beta). Not before | after Nexus |

### 1.2 Coaches

Owner (COACHES, 2026-10-20): add clients **all** (invite link and code, email invite, QR in person, bulk team
import); leverage **all** (templates, duplicate, library, assign to a group, AI drafts a program, Mirror-driven
correctives); retention **all** (compliance alerts, scheduling and a calendar, a coach app on the phone, progress
reports including the guardian for teens); payouts: **Stripe Connect** with a platform fee.

| Owner answer | Exists today | Missing | Size |
|---|---|---|---|
| Invite link and code | `lib/coach/invite.ts` (`CoachInvite`: once or many, expiry, revoke, joined count), `lib/coach/publicInvite.ts` (one reusable public invite), `/coach/join/[token]`, `CoachClient`. On | A short **typed code** for a gym whiteboard (the token is 32 base64url characters) | S |
| Email invite | `lib/coach-store/email.ts`: `sendCoachMail` returns `'noop'` ("No-op until Elijah's Google Workspace mailbox is wired. No new email vendor"). `lib/marketing/email.ts` sends nothing while `ABACUS_ENABLED` is off | **An email sender.** Owner: the Google Workspace mailbox. Then the invite email is S | S + owner |
| QR in person | `components/coach/invite-panel.tsx` | — | done |
| Bulk team import | Nothing (grep: no CSV or bulk path in `lib/coach`, `app/api/coach`) | Paste a list of names and emails, or a CSV; each gets a one-shot invite. With no email sender, the coach gets a sheet of codes to hand out | M |
| Templates, duplicate, library | `lib/coach/templates/`, `templateCatalogue.ts`, `duplicate.ts` (to one athlete or a squad), `catalogue.ts` (per-coach library). On | — | done |
| Assign to a group | `duplicate.ts` covers the squad case | A named **group** a coach keeps (team, class) so a re-assign is one tap | S |
| AI drafts a program | `app/api/coach/chat` (AI coach chat; ABACUS-gated), `app/api/coach/prescribe` + `mirrorToProgram.ts` (screen findings → prescribed work, not AI) | "Describe the athlete and the goal" → a draft program in the builder, reviewable line by line and undoable, like the Studio AI builder. The AI must never see health intake data (Privacy §5) | M |
| Mirror-driven correctives | `lib/coach/mirrorToProgram.ts`, `lib/mirror/correctives.ts`. On | — | done |
| Compliance alerts | `lib/coach/compliance.ts`, `triage.ts`, `attention.ts`, shown in `components/coach/attention-panel.tsx` (Clients tab). On, in-app only | The **alert**: an email or a push when someone drifts. No sender (above) and no web push (no service worker; launch checklist F6) | S after email |
| Scheduling and a calendar | Coach store: `slots.ts`, `ics.ts`, `Instructor.weeklyHours`, `Booking`. `CoachAvailability` (athlete Full/Limited/Out). Off (SQL) | Scheduling for **roster** sessions (not only paid bookings); a calendar view of both | M |
| A coach app on the phone | `/coach` pages; the audit says "our coach surfaces are desktop-shaped today too" | A phone layout pass of `/coach` (Clients, builder, inbox), and the PWA install from the launch checklist (F2–F7) | M |
| Progress reports (guardian for teens) | `lib/coach/loop.ts` progress series, `/api/coach/roster` deltas, `lib/mirror/progressReading.ts` | A weekly report: the coach's, the athlete's, and for a teen, the guardian's. The guardian has no account (`GuardianConsent.guardianEmail` + token), so the report goes by email or a capability link (`lib/share` pattern). Needs the email sender | M |
| Payouts: Stripe Connect, platform fee | `PLATFORM_FEE_RATE = 0.15` (`lib/fees.ts`); `CREATOR_ACCRUAL` ledger accounts (`lib/ledger.ts`, `lib/stripe-helpers.ts`); `PayoutRequest`; `/api/stripe/payout` answers 503 always; `PAYOUTS_ENABLED` off | Connect itself. §5.2, P5 | XL |
| **Finding: teens on a roster** | `GoalPlan` needs an accepted `GuardianConsent` for a minor. `CoachInvite` / `CoachClient` and `/api/coach/me/log` read no age and no consent (grep) | Under the owner's ATHLETES rule, joining a roster and saving training logs needs guardian consent for 13–17. assumption: read from the code, not run; verify first in P1 | S |

### 1.3 Athletes

Owner (ATHLETES, 2026-10-20): teens save **training** data with guardian consent (pain and health intake stay adult
only; the privacy text needs owner approval). Goals **all** (a goal with a weekly plan, a progress timeline, streaks
and reminders, share progress with a visibility choice). Scouting: verified stats and coach attest, adults opt in to
be searchable, minors never by default. Fun **all** (workouts as game levels, train with friends, seasons and
challenges, AI coach check-ins for adults who opt in).

| Owner answer | Exists today | Missing | Size |
|---|---|---|---|
| Teens save training data with guardian consent | `lib/privacy/scanSaveGate.ts`: a movement save goes through **only** for a verified 18+ account that opted in, and "a parent's approval (GuardianConsent) is not grounds to save anybody's numbers". `healthWriteGate.ts` (health writes 18+). `GuardianConsent` with `selfRequested`. Knowledge sync and chapter checks: device-only under 18 | A **training-data gate**: sets, reps, load, RPE, sessions done and goals save for 13–17 **with** an accepted guardian consent. Health intake, pain and readiness stay adult only. Whether Mirror scan numbers join is Q9. This **reverses** the 2026-09-29 rule for training data, so it needs the owner's privacy text first | M |
| A goal with a weekly plan | `GoalPlan` (goal → milestones → lock → activate, pathway map), `WorkoutPlan`, the Camp's two tracks | A self-serve goal flow without a facilitator (today a `GoalPlan` links a facilitator and a mentee) | M |
| Progress timeline | Card stats (`lib/creator/card-stats.ts`), PRQ history, coach progress series | One timeline view across sessions, PRQ, screens and milestones | M |
| Streaks and reminders | Learn streak on the device, `DAILY_STREAK` reward | Reminders need email or web push: neither exists (P1 email; push needs the PWA's service worker) | M |
| Share progress with visibility | `CreatorCard.showStats` mask, highlights, `/c/<code>`, OG image (`app/card/[slug]/opengraph-image.tsx`) | A per-item visibility choice for a progress post (private, coach, friends, link) | S |
| Scouting: verified stats + coach attest | S1–S3 landed (card stats, highlights, roster). `PrqEntry` stores its source | S4 search and S5 verification and coach attest are not built | L |
| Adults opt in to be searchable; minors never by default | `isPublicCreator` strict 18+ rule (used by the Nexus plan) | The opt-in, the search, and a hard "never listed" for under 18 | in the row above |
| Workouts as game levels | Modes, `ModeMastery`, `ChallengeLink`, the pose body-play pipeline | C5 (above) and a "level" wrapper over a program session | M |
| Train with friends | **No friends graph** (no `Friend` or `Follow` model among the 100 models) | Friends (§1.4) | in P7 |
| Seasons and challenges | `Season`, `PassProgress`, `PassGrant`, `lib/season/**`, weekly `LadderSeason`. On (free lane) | Training challenges inside the season (today the season counts play) | M |
| AI coach check-ins (adults, opted in) | `app/api/coach/chat`, `lib/coach/aiChatGuard.ts`, ABACUS switch | A scheduled check-in an adult turns on, with the same data limits as the chat | M |

### 1.4 Gamers

Owner (GAMERS, 2026-10-20): social **all** (friends and invites, teens via code; leaderboards per mode; ranked and
matchmaking; achievements). Progression **all** (season pass free lane first, mastery tiers, weekly events, free
tournaments). Full controller and TV menus. Studio share links for player content (practice only, never ranked or
staked).

| Owner answer | Exists today | Missing | Size |
|---|---|---|---|
| Friends and invites (teens via code) | Party (`/party`, netd, invite by code, voice 18+ only; Privacy §2 "Parties"); `ReferralCode` | A **friends graph** (new tables), add by code (teens) or by link (adults), block and report (reuse `PartyReport`), and Privacy text for teens' friend lists | L |
| Leaderboards per mode | `/api/bests`, `LadderEntry` (weekly, LC prizes), `ModeMastery`, arena score integrity (`lib/arena-score-integrity.ts`) | A per-mode board for all-time and weekly, friends-only filter. Score-integrity rows for modes that have none | M |
| Ranked and matchmaking | Arena (`/api/arena/**`): GHOST_DUEL quick match against a House Rival, LC fees; staking paused (`lib/stakingPause.ts`, owner decision #9); `MpMatch` | A rating (Elo-like) and real matchmaking. The `felRanked` stamp the Nexus plan wants (nothing sets it today) is the same signal | L |
| Achievements | Card progression (`lib/creator/cardProgression.ts`), dunk milestones in `reward-rules.ts`. No achievements system (grep) | A catalogue and an unlock service; the rewards go through the economy caps | M |
| Season pass free lane first | `lib/season/season-pass-core.ts`, server-owned grants. Free lane on. PRO lane: `SEASON_PASS_PURCHASE` + `SEASON_PASS_PRO_PRICE_USD_CENTS` (no default price) + `VIRTUAL_PURCHASES_ENABLED`, all off | — (PRO is in the launch sales list, §5.1) | done |
| Mastery tiers | `ModeMastery`, `/api/mastery` | Tier names and rewards on the Play shelf | S |
| Weekly events | Weekly ladder, golden hour (`lib/season/golden-hour.ts`) | An event calendar and an event type (a mode + a rule + a reward) | M |
| Free tournaments | Nothing (grep: no tournament or bracket code) | Brackets over async challenges first (no live netcode needed). Free entry only: real-money competition stays off | L |
| Full controller and TV menus | In-game pad and TV HUD done (launch checklist E2, E3, G1–G4) | Menu focus with a pad or remote (launch checklist **E4/G5, not done**) | M (launch lane) |
| Studio share links, practice only | Nothing yet | The Nexus roadmap's phase 3 and its fairness table (§3.1 there). Not repeated here | in Nexus |

### 1.5 Money

Owner (MONEY, 2026-10-20): sell first **all** (FEL Pro, courses and coaching with Stripe Connect, cosmetics and the
season pass PRO, books). Creators earn **all** (revenue share via Connect, cash out royalties for verified adults
above a threshold, tips, brand deals). Real-money competition: **keep off until legal review**. Sponsors: sponsored
venues (Studio), sponsored challenges, team and club pages, **no ads ever**.

| Owner answer | Exists today | Missing | Size |
|---|---|---|---|
| FEL Pro | `lib/stripe.ts`: weekly $6.00 and monthly $9.99, one entitlement; `lib/progression/upgradeGate.ts`. Off (`VIRTUAL_PURCHASES_ENABLED`) | Live keys, the refund path check (B10 says each product needs an 18+ check and a refund path before the flag) | S |
| Courses and coaching | Coach store, one seller. Off (SQL) | Connect for other sellers (P5) | XL |
| Cosmetics | `COSMETIC_SKUS`, marketplace split to `CREATOR_ACCRUAL`. Off | Live keys | S |
| Season pass PRO | Above. Off | The owner's price | S |
| Books | `lib/books/**`, `BOOK_STORE_ENABLED`, `STRIPE_BOOKS_SECRET_KEY`; `2026-10-09-book-shop.sql`; the models are not in `schema.prisma` (BOOK-SHOP.md has the steps). Off | The owner's steps in `docs/BOOK-SHOP.md` | S + owner |
| Revenue share via Connect | Ledger split posts `CREATOR_ACCRUAL` (USD cents) today; nothing pays it out | P5 | XL |
| Cash out royalties, verified adults, threshold | Remix royalty is **25 LC** (`creative-card-service.ts`), a virtual currency. Terms §3: "LC have no real-world monetary value and cannot be exchanged for real currency." `canWithdraw` (`lib/competition/payoutGate.ts`) checks KYC, self-exclusion and age, but only on the real-money-competition path | Royalties that cash out must be **USD from real sales**, never LC (§5.3) | in P5 |
| Tips | Nothing (grep) | A tip is a Connect charge to a verified-adult creator; minors never receive tips (§5.4) | M after P5 |
| Brand deals | `/work-with-us` + `CreatorInquiry` (pending SQL), `lib/creator/creatorCatalog.ts` (EXAMPLE rates) | The brand policy (Appendix A), real media-kit numbers | S + owner |
| Real-money competition | `REAL_MONEY_COMPETITION` off; `/api/wallet/withdraw` 403 while off | Stays off (owner). Nothing planned | — |
| Sponsored venues, challenges, team and club pages | Nexus Studio venues; `MarketingLead`, CRM models (`CrmCompany`, `CrmDeal`) | Sponsor credit on a venue (Nexus), a sponsored challenge type (weekly events), team and club pages (new) | M each |
| No ads ever | No ad network, no ad pixel in the tree (H1 in the launch checklist: first-party analytics only) | Written as a rule here (§5.5) | done |

---

## 2. Video with no additional cost

The owner: "Figure out how to do the above without an additional cost; build or replace the architecture needed, or
use what's available for free." This section compares the options honestly and ends with a layered recommendation.

### 2.1 What the free tiers cover (read 2026-10-20)

| Service | Free each month | What it means for lessons |
|---|---|---|
| **Cloud Storage** (`us-central1`, `us-east1`, `us-west1` only; summed per billing account) | 5 GB-months stored; 5,000 Class A (writes) and 50,000 Class B (reads) operations; **100 GB** outbound to the internet from North America | The free bucket. Egress is the limit that bites first for video |
| **Cloud Storage for Firebase** (`*.firebasestorage.app` buckets, same three regions) | The same: 5 GB-months, 100 GB/month download, 5K uploads, 50K downloads | Same numbers. FEL already signs GCS URLs itself (no Firebase SDK needed) |
| **Firebase Hosting** (Blaze) | 10 GB stored, **360 MB/day** transfer | Only for the app's static files. Never for user media |
| **Cloud Run** (request-based billing) | 2M requests, 180,000 vCPU-seconds, 360,000 GB-seconds, **1 GB** egress | Never stream media through Cloud Run: 1 GB egress is nothing. assumption: the app's always-on instance (`firebase.json`: `minInstances: 1`, 1 GiB) already uses part or all of the free compute, so server-side transcoding cannot be planned as free |
| Transcoder API, Cloud CDN | No free tier | Ruled out |
| **Cloudflare R2** (a different company; an owner account) | 10 GB-month stored, 1M writes, 10M reads, **egress always free** | The cliff mover if video egress grows (§2.7). S3-compatible: SigV4 signing by hand, no package |

FEL's own precedent: video review clips already live in a private GCS bucket with V4 signed URLs signed through the
metadata server and IAM `signBlob`, with no added package (`lib/coach-store/storage.ts`, copied by
`lib/soundtrack/storage.ts`). Every layer below reuses that.

### 2.2 How big each kind of lesson is

| Kind | Bytes per minute | How it was found |
|---|---|---|
| **Motion (pose keys, gzip)** | **≈ 60–80 KB** | Measured on the repo: `mocapOpponents.ts` = 54 clips, 35.4 s, 35,003 bytes gzip (≈ 59 KB/min); `mocapDance.ts` = 5 clips, 6.8 s, 8,691 bytes gzip (≈ 77 KB/min). Both are text source; a binary format would be smaller |
| Raw pose landmarks (33 points × x, y, z, visibility, float32, 30 fps) | ≈ 950 KB raw, ≈ 250–350 KB quantised to int16 | Arithmetic. This is what the Mirror's recorder keeps |
| Voice (Opus ≈ 32–48 kbps) | ≈ 240–360 KB | Arithmetic |
| Music (Opus or AAC ≈ 96–128 kbps) | ≈ 0.7–1 MB | Arithmetic |
| Video 720p at 1 Mbps (a set MediaRecorder bitrate) | ≈ 7.5 MB | Arithmetic |
| Video at Chrome's default MediaRecorder rate (≈ 2.5 Mbps) | ≈ 19 MB | assumption: Chrome's default `videoBitsPerSecond` |
| A phone's own camera file (1080p/4K) | ≈ 60–350 MB | Why `MAX_CLIP_BYTES` is ~200 MB for a 60 s review clip (`lib/coach-store/constants.ts`) |

**What 5 GB stored and 100 GB/month egress buy:**

| Kind | Stored in 5 GB | Watched or heard in 100 GB/month |
|---|---|---|
| Motion lessons | ≈ 65,000 minutes | ≈ 1.3 million minutes |
| Voice lessons | ≈ 14,000 minutes | ≈ 280,000 minutes (≈ 4,600 hours) |
| 720p video at 1 Mbps | ≈ 670 minutes (≈ 11 hours) | ≈ 13,000 minutes (≈ 220 hours) |

### 2.3 Video as motion data: the platform's edge (recommended as the main layer)

**The idea.** A teacher performs in front of a phone. The Mirror's pose pipeline already runs in the browser
(`lib/pose/PoseService.ts`: one camera owner, MediaPipe pose landmarker served from FEL's own `/pose` files, image and
**world** landmarks per frame). Instead of keeping the picture, FEL keeps the movement, turns it into the rig's pose
keys, and replays it on a 3D avatar: the student's own character, any build, any camera angle, slowed down, mirrored,
looped by phrase.

**What already exists (this is why it is real, not a moonshot):**

- `lib/babylon/anim/mocapRetarget.ts` turns **any** capture into "the rig's portable language": wrists and ankles as
  body-local targets, elbow poles, torso lean and turn, the crouch, a root track. It is already fed by the owner's own
  DeepMotion captures (video → BVH), CMU and Quaternius, and "the two-bone solver (poseClip.ts) then fits the same keys
  to whichever body plays — a short female kit body and the owner's scan get the same move."
- The dance mode already plays captured breaking and popping steps this way (`mocapDance.ts`).
- The camera side exists: `PoseService`, the BlazePose table (`lib/pose/landmarks.ts`), smoothing (`oneEuro.ts`), the
  dev recorder (`app/dev/pose-record`), and the recordings guard that keeps a recording numbers-only, adults-only,
  no free text (`lib/pose/recordingsGuard.ts`).
- The privacy rule exists: "the camera picture is processed on your device ... never leaves your browser" (Privacy §6).

**What is missing (P3):**

1. A **runtime** BlazePose-to-pose-keys adapter. Today `mocapRetarget` runs in build scripts over BVH files; a lesson
   needs it in the browser over `PoseService` world landmarks. New files only; `mocapRetarget.ts` and `poseClip` are
   reused, not changed.
2. A compact **lesson format** (versioned, quantised, gzip) with phrases, a count or beat grid, and cue text.
3. A **recorder** for approved teachers (record, trim, mark phrases, add cues, preview on the avatar) and a **player**
   (speed, mirror, loop a phrase, camera orbit) built on the same small Babylon canvas the exercise demo uses.
4. **Compare**: the student does it in front of their camera, and the Mirror's existing readers grade the parts they
   can read (timing on the beat, range, symmetry). No new judging model.
5. Storage: GCS (the free bucket) or Postgres rows; at ≈ 70 KB a minute either works.

**Limits, honestly:**

- **Monocular depth is noisy.** Turns, spins and moves facing away from the camera lose the body; floor work
  (breaking, rolls) is weak. The repo already handles video-solve sway ("a still stand with a video solve's sway",
  fixture notes) and smooths in time; teachers should film front-on and in sections.
- **No fingers.** The body model has 3 hand points (wrist, index, pinky, thumb tips). Piano, guitar, drum grips and
  sign-style hand work need MediaPipe's hand model, a new model file (not a package, but a new asset and a new
  privacy line). Musicians get audio and pattern lessons instead (§2.4) until then.
- **Faces and mouths are not captured** (a 33-point body). Voice technique (jaw, lips, posture) is partly posture,
  which motion covers; the rest is audio.
- **It is RIG-ADJACENT.** It plays motion on the shared rig, so it needs the owner's sign-off and eye (operating
  rules: "Wait for sign-off on anything touching physics, the rig, or the shared Profile object"). The plan reuses the
  solver unchanged and adds a new consumer.
- **Is body motion personal data?** It is not a picture, but it is a recording of how a named teacher moves. It needs
  a Privacy line (§4.1), teacher consent in the teacher agreement, and the rule that a **student's** recordings stay on
  the device unless the student is a verified adult who opted in (today's `scanSaveGate` rule).

**Cost:** effectively nothing. Even at a million lesson-minutes a month the egress stays inside the free 100 GB.

### 2.4 Audio-only lessons (voice and music)

- **Record:** `MediaRecorder` on the mic. Chrome and Firefox give Opus in WebM; iOS Safari gives AAC in MP4. The
  codec picker already exists for video (`lib/capture/codecs.ts`); an audio list is the same pattern. Ask for
  `audioBitsPerSecond` ≈ 48 kbps (voice) or 96–128 kbps (music).
- **Music lessons as data, not audio:** a groovebox pattern or a song chain (`lib/babylon/music/Song.ts`,
  `StudioLibrary`) is a few KB. A producer's lesson can be "open this pattern and play it", which is cheaper than any
  recording and remixable (`beginRemix`). The Flip already loads FEL stems, the player's own files and public-domain
  sources only (no third-party audio, by rule).
- **Avoid WAV for delivery.** `renderMixdown` and `renderSongStems` write WAV (≈ 10 MB a minute). A lesson's audio
  should be re-encoded by MediaRecorder from a `MediaStreamDestination` before upload.
- **Audio review:** the video-review flow (`Booking.kind = 'video_review'`) with an audio clip instead of video, for
  voice coaches.
- **Limit:** browser AAC and Opus are fine for speech and demos; they are not mastering-grade. Pro producers who need
  lossless stems should keep those out of the platform (a link to their own storage).

### 2.5 Teacher video, compressed in the browser

**The zero-dependency path already exists in this repo.** `lib/capture/exportVideo.ts`: "No server, no encoder
package: a canvas plays the frames back through captureStream and MediaRecorder." The same trick re-encodes a
teacher's phone file: play it into a canvas at 720p and record at a set bitrate (≈ 1 Mbps). A 60 s phone clip of
~200 MB becomes ~7.5 MB **before** it is uploaded, which saves both storage and the free egress.

| Option | Verdict |
|---|---|
| Canvas + `MediaRecorder` re-encode (as `exportVideo.ts`) | **Recommended.** No package. Limits: runs in real time (a 10-minute lesson takes 10 minutes), the tab must stay open and visible, output is WebM on Chrome and Firefox and MP4 on Safari (both play everywhere that matters; assumption: older iOS plays WebM poorly, so test on the owner's iPhone) |
| WebCodecs `VideoDecoder` / `VideoEncoder` | Faster than real time and better quality per byte, but writing an MP4 or WebM **file** needs a muxer: either a new dependency (ask) or a hand-written muxer (L). assumption: Safari's video WebCodecs arrived in 16.4 and Firefox's on desktop only. Later, if real time is too slow |
| ffmpeg.wasm | A new dependency and ~30 MB of WASM per teacher session. Not recommended |
| Server transcoding (Cloud Run + ffmpeg, Transcoder API) | Not free (see §2.1) and adds a binary to the deploy. Rejected |

**Rules for teacher video:** short (≤ 3 minutes a clip; a lesson is several clips), 720p, 1 Mbps, private bucket,
signed URLs (≤ 1 hour), originals never kept (the re-encoded file is the upload), a per-teacher storage budget (Q12).
Students under 18 never upload video (the coach store's review is already adults only).

### 2.6 Unlisted embeds from free hosts (YouTube unlisted)

There is a precedent: `exercise-demo.tsx`'s COACH VIDEO tab already shows "the founder-recorded YouTube demo".

| Pro | Con |
|---|---|
| Free, unlimited storage and bandwidth, adaptive streaming, captions | **Ads.** YouTube's Terms give it the "right to monetize" any video, including channels outside the Partner Program, without paying the creator (YouTube's Terms update, November 2020). An embed may show a YouTube ad, which collides with "no ads ever" (§5.5, Q8). assumption: that clause still stands and applies to embeds; check the current Terms |
| The teacher keeps control of their own video | **Unlisted is not private:** anyone with the link can watch and re-share it. Not for anything a paying student should own exclusively, and never for a minor's video |
| No FEL storage at all | **Tracking.** An embed loads Google's player and cookies. `youtube-nocookie.com` (privacy-enhanced mode) delays cookies until play. A third party then sees the viewer: Privacy §7 needs a line, and the under-13 class mode must **never** load an embed (COPPA: the site operator answers for third-party collection on a child-directed page). assumption: counsel confirms |
| | Availability is out of FEL's hands: the teacher deletes or YouTube removes it, the lesson breaks. A link checker is needed |
| | YouTube's own terms apply to the teacher (their content rules, "made for kids" settings) |

**Verdict:** allowed as a **teacher's own long-form layer** on adult-facing course pages, privacy-enhanced, labelled
"Plays on YouTube" (Q8). Never on a child-directed surface, never as the only copy of paid content.

### 2.7 Peer-to-peer

| Use | Verdict |
|---|---|
| Live 1:1 lessons and small live classes (WebRTC) | **Yes, already built:** the coach-store call is peer-to-peer with STUN only and no recording (`lib/coach-store/call/**`, Privacy §10: "the video goes directly between your device and the coach's device"). Cost: nothing but signalling rows. Limit: ~10–20% of networks need a TURN relay (assumption: the usual estimate), and a relay costs money; `iceServers.ts` takes one later "without touching the room". A 1:many class needs a server (an SFU) past ~4 viewers on phones: not free |
| Distributing recorded lessons peer-to-peer (WebTorrent-style) | **No.** A new dependency, unreliable on phones and on iOS, and it exposes every viewer's IP address to other viewers, which is wrong for teens and classes |

### 2.8 The recommendation: four layers, cheapest first

| Layer | For | Where it lives | Free up to (stored / served a month) |
|---|---|---|---|
| **1. Motion lessons** (pose keys on the avatar) | Movement, strength, dance, posture for voice | GCS free bucket or Postgres | ≈ 65,000 min / ≈ 1.3M min: not a realistic limit |
| **2. Audio and pattern lessons** | Voice, music, producers | GCS free bucket; patterns as data | ≈ 14,000 min / ≈ 280,000 min of voice |
| **3. Short teacher video**, re-encoded in the browser to 720p at 1 Mbps | Anything that needs a picture (a face, an instrument, a cue) | GCS private bucket, signed URLs | ≈ 11 hours / ≈ 220 hours |
| **4. The teacher's own long-form** (YouTube unlisted, privacy-enhanced) and **live** peer-to-peer | Long lectures; live 1:1 | YouTube; peer-to-peer | YouTube's cost, YouTube's ads (Q8); live is free until TURN is needed |

**The cost cliff is teacher video egress (layer 3):** about **220 hours of 720p video watched a month**, or 11 hours
stored. Past it, GCS bills storage per GB-month and internet egress per GB (assumption: about $0.02 and $0.08–0.12 a
GB; check the current price list). Two levers keep it away: a per-teacher video budget (minutes stored), and moving
layer 3 to Cloudflare R2 (egress always free, 10 GB free storage; an owner account and a Privacy line) when monthly
egress passes ~80 GB (Q12). The other two cliffs: a TURN relay for live calls that fail peer-to-peer, and an SFU if
the owner wants live classes larger than ~4 phones.

**What it costs to measure:** GCS bucket egress is in the billing console by SKU. assumption: the owner adds a budget
alert at $1 so the first cent is noticed.

---

## 3. The phased plan

**Shape.** Each phase ships something on its own. "Parallel" means the phase touches files no game, feel or Nexus
lane holds today, so it can run beside them **if the owner says so** (Q1). Capacity still binds: at most 3 dev servers
on the shared machine and one heavy lock (`docs/LANES.md` §5). Recommendation: at most **two** platform lanes at once,
because every phase needs owner review.

| # | Phase | Size | Ships | Parallel with feel and Nexus lanes? | Waits for |
|---|---|---|---|---|---|
| P0 | Launch sales: what Final Evolution LLC sells itself | M | FEL Pro, season PRO, cosmetics, books, Elijah's coach store, live | Yes (`lib/stripe*`, `app/api/stripe`, `lib/coach-store`, `lib/books`) | The ops session (runbook), the owner's live keys and terms |
| P1 | Coach loop, finished | L | Short codes, email invites, bulk import, groups, alerts, guardian reports, the teen consent gate, phone layout | Yes (`lib/coach/**`, `app/coach/**`, `app/api/coach/**`) | An email sender for its email half |
| P2 | Approved teachers and the course format | L | Apply → owner approves → Teacher badge; a teacher builds a free course (lesson, camera check, avatar demo, in-game practice, audio, short video) | Yes (`lib/education/**`, new `lib/teach/**`, `app/admin/review`) | P1's role work, P4 for media |
| P3 | Motion lessons | L | Record a movement on a phone, replay it on any avatar, compare yourself | Mostly: new files only. **RIG-ADJACENT** sign-off | Owner sign-off; the dance and hoops lanes not editing `mocapRetarget.ts` / `poseClip.ts` at the time |
| P4 | Media layer (audio, browser-compressed video, budgets) | M | Audio lessons and reviews, video re-encoded before upload, per-teacher budgets, YouTube links | Yes (new `lib/media/**`; reuses the storage pattern) | Buckets set (owner) |
| P5 | Stripe Connect: teachers and creators get paid | XL | Other teachers sell courses, memberships, 1:1 and reviews; revenue share; cash-out; tips | Yes, but **after P0** (same money files) | Owner's Connect platform profile, the creator agreement, fee and threshold (Q4, Q5) |
| P6 | Athletes: training data, goals, scouting | L | Teen training saves with consent; goal + weekly plan; timeline; reminders; scouting S4–S5 | Yes (`lib/privacy`, `lib/creator/card-*`, `lib/coach`) | Privacy text (owner) |
| P7 | Gamers: social and progression | XL | Friends, per-mode boards, rating and matchmaking, achievements, weekly events, free tournaments | **Partly.** Friends, achievements and events are new files. Boards, ranked and menu focus touch `game-shell.tsx`, the end screen and the shelf: wait for the feel lanes | Feel lanes landed; the Nexus plan's `felRanked` stamp |
| P8 | Schools and classes | XL | Teacher-hosted class mode with no child accounts; PE lesson plans; free class tier + Facility | Yes for content and the class host; the Studio part waits for Nexus phase 9 | Counsel on COPPA/FERPA; P2 |
| P9 | Growth and sponsors | M–L | Highlight clips, UTM counting, referral rewards, sponsor challenges, team and club pages | Clips touch the end screen: wait for the feel lanes. The rest: yes | Brand policy approval (Appendix A) |

**Order.** P0 first (it pays, and it is the launch). Then P1 and P4 together (different files). Then P2, then P3 (the
edge), then P5 (Connect turns teachers' free courses into paid ones). P6 can start any time after P1. P7 and the clip
half of P9 wait for the feel lanes. P8 last (most legal work). The audience order after launch is Q2.

### P0. Launch sales (M)

- **Scope:** turn on what Final Evolution LLC sells as seller of record: FEL Pro (weekly and monthly), the season pass
  PRO lane, cosmetics, books, and Elijah's coach store (programs, courses, series, membership, 1:1, video review). Per
  product, confirm the two things `isVirtualPurchasesEnabled`'s comment says are needed first: an 18+ check and a
  refund path. Add the missing `.env.example` names (SHIP-READINESS §6 call 6) for every flag in §5.1.
- **Reuse:** `lib/stripe.ts`, `/api/stripe/checkout`, `/api/stripe/webhook` (refund-due handling in
  `lib/stripe/verify-checkout.ts`), `/api/season/checkout`, `/api/v1/wallet/*checkout`, `lib/books/**`,
  `lib/coach-store/**`, `docs/coach-store.md` runbook.
- **Done when:** in Stripe **test** mode on a preview, each product in §5.1 can be bought by a verified adult,
  refused for an under-18 and an unknown-age account (403 with the reason), refunded, and the refund revokes the
  entitlement; a test per product proves the three paths. Then the owner switches live.
- **Risks:** a live key before the terms are signed (the coach store refuses live keys while `COACH_STORE_LIVE` is
  off; keep it that way until the owner's day); sales tax (Stripe Tax is a setting and a cost per transaction:
  owner, with an accountant).
- **Needs from the owner:** live Stripe keys on the day; signed store terms; the refund policy (§4.2); the business
  address and the CA refund days (`Instructor.refundBusinessDays` is null "until the CA ruling is entered"); the
  season PRO price; SQL 7–11 and the book-shop SQL (SHIP-READINESS §3.2); `VIRTUAL_PURCHASES_ENABLED`,
  `SEASON_PASS_PURCHASE`, `BOOK_STORE_ENABLED`, `COACH_STORE_*`.

### P1. Coach loop, finished (L)

- **Scope:** a short typed invite code beside the link; email invites; bulk import (paste or CSV; no package: a
  hand parser for a simple CSV); named groups; drift alerts by email; the weekly progress report (coach, athlete,
  guardian); scheduling for roster sessions with an ICS feed; a phone layout of `/coach`; **the teen gate** on roster
  join and on training logs (guardian consent for 13–17, as `GoalPlan` already requires).
- **Reuse:** `lib/coach/invite.ts`, `publicInvite.ts`, `duplicate.ts`, `compliance.ts`/`attention.ts`,
  `lib/coach-store/ics.ts` and `slots.ts`, `GuardianConsent`, `lib/share` (capability links for guardians).
- **Done when:** a coach adds 20 athletes from a pasted list in under a minute and each joins by code; a 15-year-old
  cannot join until a guardian accepts (a route test: 403 then 200); a drift alert email reaches a test inbox; the
  guardian's report link opens with no account and shows training only (a test pins that no health field is in it);
  `/coach` at 390 px has no horizontal overflow (measured on the rig, as studio-save measured the Studio).
- **Risks:** email deliverability (SPF and DKIM on the Workspace domain); a guardian report leaking health data (the
  same leak guard as `lib/share`).
- **Needs from the owner:** the Google Workspace mailbox and its sending setup; Privacy text for guardian reports and
  the teen roster rule; the AI-drafted program is in P1 only if Q10 says so.
- **Size:** L (M without email).

### P2. Approved teachers and the course format (L)

- **Scope:** a teacher application (discipline, bio, sample, links); an owner queue in `app/admin/review`; a `teacher`
  role read by the education and coach-store routes (replacing the env list, per Q3); the Teacher badge on the
  Creator Card; a course = ordered lessons, each made of blocks: text (the knowledge card types), a camera check
  (`lessonMovement`), an avatar demo (P3), in-game practice (C5: a `ChallengeLink` or a mode with a target), audio or
  short video (P4), a YouTube link (Q8); a progress record (`LessonProgress`) that follows today's age rules
  (device-only under 18 unless P6 changes training data).
- **Reuse:** `lib/education/course.ts` (the shape), `lib/knowledge/types.ts` (card types), `lib/knowledge/validate.ts`
  (the validator), `CreatorInquiry` (the application shape), `app/admin/review`, `CreatorCard`.
- **Done when:** an applicant applies, the owner approves in the queue, the badge shows on `/c/<code>`, the teacher
  publishes a free 3-lesson course with a camera check and an in-game practice, and a student completes it; tests for
  the role gate (a non-teacher gets 403 on authoring), the validator and the age rules.
- **Risks:** content quality and claims (health claims are screened today by `lib/share/screen.ts`; reuse it on
  lesson text); copyright in teacher uploads (the IP process, §4.2).
- **Needs from the owner:** Q3 (who may teach); the teacher agreement (§4.2); community guidelines; the approval
  criteria.

### P3. Motion lessons (L)

- **Scope:** §2.3 items 1–5.
- **Reuse:** `PoseService`, `landmarks.ts`, `oneEuro.ts`, `mocapRetarget.ts`, `poseClip`, `exercise-avatar-canvas.tsx`,
  `recordingsGuard.ts`, the Mirror readers.
- **Done when:** (1) a teacher records 60 s of a squat pattern and an 8-count dance phrase on a phone; (2) the file is
  under 150 KB a minute (measured); (3) it plays on two different bodies (a kit body and the owner's scan) with feet
  planted (the existing foot-slide measure, not a new one); (4) a fixture test replays a committed adult recording
  through the adapter and pins the keys; (5) the owner watches both on his phone and signs off. GATE 0 is reported
  before any rig work.
- **Risks:** jitter and depth errors (filter, film front-on, mark weak frames); the rig lanes editing the same solver
  (route through LANES §3); teachers expecting video quality from a skeleton (the player shows it as a guide, with an
  optional short video beside it).
- **Needs from the owner:** RIG-ADJACENT sign-off (Q7); Privacy line for teachers' motion recordings; the teacher
  agreement's consent clause.

### P4. Media layer (M)

- **Scope:** audio recording and upload (voice and music lessons, audio reviews); browser re-encode of teacher video
  to 720p at ~1 Mbps before upload; per-teacher budgets (minutes stored); YouTube link blocks (privacy-enhanced, link
  checker); bucket lifecycle notes for the owner.
- **Reuse:** `lib/capture/codecs.ts`, `exportVideo.ts`, `lib/coach-store/storage.ts` and `lib/soundtrack/storage.ts`
  (signed URLs, private and public buckets, pending → approved copy).
- **Done when:** a 60 s phone clip of ~100 MB uploads as under 10 MB (measured on the owner's iPhone and an Android);
  a voice lesson of 5 minutes is under 2 MB; a teacher over budget is refused with a message; an embed never loads on
  a page marked child-directed (a test).
- **Risks:** real-time re-encode is slow for long files (cap clip length); Safari codec differences (test on device).
- **Needs from the owner:** the buckets (`CREATOR_MEDIA_*`, `COACH_REVIEWS_BUCKET`) and their lifecycle rules; Q8, Q12.

### P5. Stripe Connect (XL)

- **Scope:** §5.2. Connect onboarding for approved teachers and verified-adult creators; destination charges with an
  application fee; payouts on Stripe's schedule; `PayoutRequest` and `CREATOR_ACCRUAL` wired to real transfers; tips;
  cash-out of USD royalties above the threshold; a creator earnings page; refunds and disputes reversing the transfer.
- **Reuse:** `lib/ledger.ts` (double-entry, `CREATOR_ACCRUAL`), `lib/coach-store/money.ts` (split), `lib/fees.ts`,
  `lib/marketing/referralTree.ts` (bounded, product-revenue-only commissions), `canWithdraw`'s checks.
- **Done when:** in test mode, a second teacher onboards with Express, sells a course, the buyer is charged once, the
  platform fee lands on the platform, the teacher's balance shows in Stripe, a refund reverses both, and the ledger
  balances to zero across EXTERNAL / PLATFORM_REVENUE / CREATOR_ACCRUAL (a test); a minor cannot onboard (403).
- **Risks:** seller of record changes from Final Evolution LLC to the teacher for their sales (store terms, receipts,
  tax); 1099-K reporting (Stripe files for Express accounts; assumption: confirm with Stripe and an accountant);
  disputes on a teacher's sale.
- **Needs from the owner:** the Connect platform profile in the Stripe dashboard; Q4 (fee), Q5 (threshold), Q6
  (account type); the creator agreement; store-terms changes; `PAYOUTS_ENABLED` on the day.

### P6. Athletes (L)

- **Scope:** the training-data gate for 13–17 with guardian consent (§1.3); a self-serve goal and weekly plan;
  the progress timeline; reminders (email first, web push when the PWA has a service worker); share with a visibility
  choice; scouting S4 (search, adults opt in, minors never listed) and S5 (verified stats, coach attest).
- **Reuse:** `scanSaveGate.ts` (shape of the gate), `GuardianConsent`, `GoalPlan`, `card-stats.ts`, `PrqEntry.source`.
- **Done when:** route tests: a 15-year-old with an accepted consent saves a set log; without it, 403; a pain check-in
  from the same account is still refused; a search never returns an under-18 card (a test seeds one); an attested
  stat shows the coach's mark.
- **Needs from the owner:** Privacy §1/§5 text for teens' training data; Q9.

### P7. Gamers (XL)

- **Scope:** §1.4. Friends first (it unlocks "train with friends" for athletes too), then boards, achievements,
  weekly events, free tournaments, rating and matchmaking, menu focus (the launch lane may take this).
- **Done when:** a teen adds a friend by code and cannot be found by search; a block hides both ways; an achievement's
  reward passes the daily caps (a test against `applyEconomyCaps`); a free bracket of 8 runs over async challenges.
- **Needs from the owner:** Privacy text for friends (teens), community guidelines, report handling.

### P8. Schools and classes (XL)

- **Scope:** §4.3's class mode; PE lesson plan format; a free class tier; Facility seats; later the Studio for
  classes (after Nexus phase 9).
- **Done when:** a teacher starts a class on a TV, 20 children join on shared devices or controllers with **no
  account**, play a lesson, and the server stores only the class's totals (a test proves no per-child row is
  written; the same proof shape as `age-screen-lock-stores-nothing.test.ts`).
- **Needs from the owner:** counsel on COPPA's school-authorisation route and FERPA; a school agreement; Terms §2
  change.

### P9. Growth and sponsors (M–L)

See §6.

---

## 4. Legal, privacy and safety work

Nothing here was edited. `lib/policies.ts`, `app/store-terms/page.tsx` and every legal page are the owner's. Every
change below bumps `CURRENT_POLICY_VERSION` (today `2026-10-16`) and the fingerprints in `lib/policies.test.ts`.
Counsel should read the money and children's items before anything ships.

### 4.1 Where `lib/policies.ts` would need owner-approved text

| Topic | Privacy | Terms | Why (what is true today) | Phase |
|---|---|---|---|---|
| Teens' training data with guardian consent | §1 (a new bullet: training logs), §5 (says the minor rules; must say training is not health data and what a guardian's consent unlocks) | §2 (13–17 "only with a parent or legal guardian's consent") | `scanSaveGate` today refuses every minor save, guardian or not | P1, P6 |
| Stripe Connect payouts | §7 (Stripe now also receives teachers' identity and bank data, under Stripe's Connected Account terms), §10 (other sellers, not only Elijah: "today that is Elijah Bonds") | §2 (who can sell: verified adults, approved), a new section for sellers | Final Evolution LLC is the only seller of record today | P5 |
| Cash-out royalties | §1 (earnings records, tax info), retention (7 years like orders) | §3 says LC "cannot be exchanged for real currency": keep that true, and add that **USD** royalties from real sales are separate | Remix royalties are LC today | P5 |
| Tips | §1, §10 | A tips clause: not a purchase, not refundable except as the law requires, adults only on both sides | none exist | P5 |
| Creator revenue share | §10 | §4 (licence wording is "display it within the Service" only; selling and revenue share need more) | | P5 |
| Video, audio and motion uploads | §1 (teachers' lesson media, motion recordings), §4 (retention, delete), §6 (a teacher's motion recording is kept, unlike a player's camera) | §4 (a licence to host, transcode and show to enrolled students), §5 (prohibited content) | Privacy §6 promises the camera picture "never leaves your browser". Motion lessons keep that for pictures; the text must say movement numbers of **teachers** are kept | P2–P4 |
| YouTube embeds | §7 (a third party that sees viewers on lesson pages) | | Privacy §6 already names Google for the face-scan model; embeds are new | P4 |
| Friends for teens | §1 (friend lists), §2 (who sees what), the Parties paragraph pattern | §2, §5 (harassment, reporting) | No friends graph exists | P7 |
| Scouting | §1/§2 (searchable profiles, adults only, opt-in), §4 (turning it off removes you from search) | §2 (minors never listed by default) | S1–S3 cards exist; search does not | P6 |
| School classes with under-13s and no accounts | A children's section: what a class session stores (class totals only), who the operator is, the school's role | §2 (today: "We can't create an account for anyone under 13 ... only the free movement screen with an adult present") | COPPA (assumption: the amended FTC rule's compliance date was in 2026; counsel confirms what applies), FERPA when a school is the customer, state student-privacy laws | P8 |
| AI drafts a program | §1/§2 (what is sent: the coach's description and the catalogue, never health data), §3 | | The Studio AI builder text (2026-10-16) is the model | P1 |
| Email (invites, alerts, guardian reports) | §1/§2 (the guardian's email is used for reports), the marketing line ("Buying ... does not sign you up for marketing emails") stays true | | | P1 |
| Referral rewards and UTM counting | §1 (a referral code and a campaign tag on a visit, counted on FEL's server, no ad pixel) | §3 (referral rewards are LC and cosmetics, no cash value) | `ReferralCode` exists; UTM capture does not | P9 |

### 4.2 Documents that do not exist yet

| Document | Why it is needed | Needed by |
|---|---|---|
| **Community guidelines** | Strangers will see each other's courses, profiles, friends and shared content. The Terms §5 list is four lines | P2, P7 |
| **Creator and teacher agreement** | Licence to host and sell, revenue share and fee, payout terms, tax, quality and conduct, the motion-recording consent, approval and removal, what happens to students when a teacher leaves | P2 (free teaching), P5 (paid) |
| **DMCA / IP takedown process** | No takedown clause in the Terms or store terms (the Nexus roadmap found the same by grep). US safe harbour needs a designated agent registered with the Copyright Office (an owner action) and a counter-notice process | P2 |
| **Refund policy** (one page, every product) | The coach store has cancel rules (`lib/coach-store/policy.ts`) and the CA refund days are null; virtual goods, subscriptions, books, courses and tips each need a stated rule | P0 |
| **Brand and sponsor policy** | The owner asked for one; draft in Appendix A | P9 |
| **School agreement / data terms** | When a school or studio buys Facility | P8 |
| **Guardian consent text for training data** | The words a guardian agrees to (separate from the health consent) | P1, P6 |

### 4.3 The class mode for under-13s (the safe shape)

- The **teacher** (a verified adult with an account) hosts on a TV or projector (`/host`, `/play/party`); children
  play on shared devices or phone controllers that join a room code (the Controller Link). No child signs in, types a
  name or is recorded; a seat is "Player 3".
- The server stores **the class**, not the children: the lesson, the date, totals. No per-child rows, no camera
  pictures (the camera stays on the device, as today), no embeds, no chat, no friends, no rewards to a child.
- Body play with the camera is the most sensitive part: the existing rule ("A child under 13 may use the free
  movement screen only with an adult present, and nothing from it is saved") is the starting point.
- assumption: this shape avoids collecting personal information from children; counsel confirms before P8 ships.

### 4.4 Real-money competition

**Stays off** (owner). `REAL_MONEY_COMPETITION` unset; `/api/wallet/withdraw` answers 403 while off; staking in the
arena is LC and paused (`lib/stakingPause.ts`). Free tournaments (P7) and Connect payouts (P5) are separate code paths
and must not import the competition modules (a wiring test, like the Studio interpreter's).

---

## 5. Money

### 5.1 The launch sales list and its flags

Seller of record for all of these: Final Evolution LLC. No Connect needed.

| Product | Price today (in code) | Route | Flags and settings (all off today) | Also needs |
|---|---|---|---|---|
| FEL Pro, weekly / monthly | $6.00 / $9.99 (`lib/stripe.ts`) | `/api/stripe/checkout` `FEL_PRO` | `VIRTUAL_PURCHASES_ENABLED`, `STRIPE_SECRET_KEY` live, `STRIPE_WEBHOOK_SECRET` | refund path check |
| Season pass PRO | none: `SEASON_PASS_PRO_PRICE_USD_CENTS` has no default | `/api/season/checkout` | `SEASON_PASS_PURCHASE`, the price env, `VIRTUAL_PURCHASES_ENABLED` | the owner's price |
| Cosmetics | e.g. $4.99 (`COSMETIC_SKUS`) | `/api/stripe/checkout` `COSMETIC` | `VIRTUAL_PURCHASES_ENABLED` | |
| Shard and coin packs | `/api/v1/wallet/shard-checkout`, `/checkout` | | `VIRTUAL_PURCHASES_ENABLED` | Q: sell at launch? (not in the owner's list; recommend **no** at launch: currency packs draw the most scrutiny with teens around) |
| Books | `lib/books/bookCatalog.ts` | `/api/books/**` | `BOOK_STORE_ENABLED`, `STRIPE_BOOKS_SECRET_KEY` | book-shop SQL, models, client regen on Linux (`docs/BOOK-SHOP.md`) |
| Coach store: program, course, series, bundle, membership, 1:1, video review | per listing | `/api/coach-store/checkout` | `COACH_STORE_ENABLED`, `COACH_STORE_PAYMENTS_ENABLED`, `COACH_STORE_LIVE`, `COACH_REVIEW_UPLOADS_ENABLED` + `COACH_REVIEWS_BUCKET`, `COACH_STORE_COACH_USER_IDS` | SQL 7–11; address; CA refund days; signed terms (`docs/coach-store.md`) |
| FEL Coach / FEL Facility | $39 / $199 a month | `/api/stripe/checkout` | `VIRTUAL_PURCHASES_ENABLED` | Recommend **after launch**, with P1 (Coach) and P8 (Facility), so what is sold matches what works |
| Studio Creator | $29.99 a month | | `STUDIO_CREATOR_ENABLED` | Not at launch (Nexus) |
| Payouts | | `/api/stripe/payout` (503) | `PAYOUTS_ENABLED` | P5 |
| Real-money competition | | | `REAL_MONEY_COMPETITION` | **Off** (owner) |

### 5.2 Stripe Connect design (P5)

- **Account type: Express** (recommended, Q6). Stripe hosts onboarding and identity checks, the teacher gets Stripe's
  dashboard, Stripe handles the tax forms it is required to file. Standard gives teachers full Stripe accounts and
  FEL less control over refunds; Custom makes FEL responsible for the onboarding UI and more compliance.
- **Charge type: destination charges** with `application_fee_amount` = the platform fee, `on_behalf_of` the teacher
  so the teacher is the merchant on the statement for their sales. assumption: confirm with counsel that the teacher
  as merchant of record is what the owner wants; it moves sales-tax and refund duties toward the teacher.
- **Who can be paid:** verified adults only (`canWriteHealthData`'s strict year rule, the coach store's
  `adult.ts`), approved teachers or approved creators, Stripe onboarding complete. Minors never.
- **The platform fee is the owner's decision (Q4).** Today: `PLATFORM_FEE_RATE = 0.15` for coach-store sales and
  marketplace splits; the referral tree uses `PLATFORM_TAKE = 0.30` (`lib/marketing/referralTree.ts`). These must
  agree before Connect ships. Stripe's own card fee comes out of the teacher's share today (`docs/coach-store.md`).
- **The ledger stays the source of truth:** a sale posts EXTERNAL → PLATFORM_REVENUE + CREATOR_ACCRUAL as today; a
  Stripe transfer posts CREATOR_ACCRUAL → EXTERNAL (`lib/stripe-helpers.ts` already has both shapes); the webhook
  (`transfer.*`, `payout.*`, `charge.refunded`, `charge.dispute.*`) reconciles.
- **Holds:** `SESSION_HOLD_DAYS = 7` and `PAYMENT_HOLD_DAYS = 14` exist in `lib/coach-store/constants.ts`; reuse them
  as the delay before a sale's money is transferable.
- **The referral share** stays a share of FEL's fee, never taken from the teacher (`lib/coach-store/money.ts`).

### 5.3 Royalty cash-out

- **Only USD earned from real sales cashes out.** LC never does (Terms §3, and the economy rule that a purchase path
  can never mint shards). Remix royalties today are 25 LC; a USD royalty exists only when a **paid** item is remixed
  and sold (a share of that sale to the parent creator), posted to `CREATOR_ACCRUAL`.
- **Threshold (Q5):** recommend **$25**, the same as `REFERRAL_MIN_PAYOUT_CENTS = 2_500`, so one number rules both.
  Below it the balance carries over.
- **Who:** verified adults, Connect onboarding complete, not self-excluded (`canWithdraw`'s checks reused, not the
  competition route).
- **Economy-caps interaction:** none on USD. The XP and shard caps (`lib/economy-caps.ts`: 14,150 XP and 100 shards
  per run; 50,000 XP and 400 shards per UTC day) govern play rewards. Rules to hold: (1) no USD earning is ever
  computed from play (a wiring test: the payout code cannot import sessions, wallet earn or arena); (2) LC and shard
  royalties and referral rewards stay inside the daily caps (`REFERRAL_BONUS` is already in `SHARD_REASONS`, the set
  the daily sum reads; assumption: whether the referral grant itself is clipped by the cap is not verified); (3)
  cosmetics bought with USD never pay LC or shards.

### 5.4 Tips

A tip is a Connect charge from a verified adult to an approved, verified-adult teacher or creator, with the same
platform fee (or none: part of Q4). No tips to or from minors. Tips buy nothing and unlock nothing. Refunds only as
the law requires.

### 5.5 Product rule: no ads ever

> **FEL shows no advertising. Ever.** No ad networks, no ad pixels or advertising trackers, no paid placements in
> feeds or games, no data used to target ads on FEL or elsewhere. Sponsorship is allowed only as credited,
> family-safe content the owner approves (a sponsored venue, a sponsored challenge, a team or club page), under the
> brand policy (Appendix A). Growth is organic and measured on FEL's own server (§6).

Where it touches the plan: YouTube embeds may carry YouTube's ads (§2.6, Q8); the media kit must not sell "ads"; the
analytics stay first-party (`lib/analytics.ts`, launch checklist H1). Suggested home for the rule once approved: this
section and `docs/AGENT-OPERATING-RULES.md` (owner edits).

---

## 6. Growth

Owner (ADVERTISEMENT / GROWTH, 2026-10-20): growth means marketing FEL; "no ads ever" in the app **stays**. Channels:
**all** (shareable highlight clips, teachers and coaches bringing students, referral rewards, creator partnerships).
Paid ads: none at first. Tracking: privacy-first, **no ad pixels**, UTM and referral codes counted on FEL's server.
Referral reward: cosmetics + Lab Credits inside the daily caps, no cash value. Clips show the replay + the score card
+ the FEL end card, the Creator Card ending, music from your own Music Room songs (nothing copyrighted), and the
Studio venue credit. Sponsors: family-safe brands only, with a written brand policy for the owner. Public pages:
draft real copy for approval; nothing live until approved.

| Item | Exists today | Missing | Size | Phase |
|---|---|---|---|---|
| **Vertical highlight clips**, rendered in the browser | `lib/capture/**`: game recorder (canvas `captureStream` + the game mix), the last-30-seconds buffer, `exportVideo.ts` (9:16 and 16:9 "with the FEL mark", no server, no package), `shareClip.ts` (system share sheet or download; "the app never posts"); dunk film (`lib/dunk-film/**`); `DunkReplayRecorder`, `koReplay`; the end screen (`components/games/end-screen/**`) | The composed clip: replay → **score card** → **FEL end card** with the link → **Creator Card ending** (the card art from `/c/<code>`); a **venue credit** line for Studio venues | M | P9 (touches the end screen: after the feel lanes) |
| Music from your own Music Room songs | `AudioEngine.renderMixdown` / `renderSong` (WAV), `StudioLibrary`; the Flip's source rule (FEL, own, public domain only) | Mix one of the player's own songs under the clip (a `MediaStreamDestination` into the export); refuse a song carrying any non-FEL source that is not the player's own; game audio as the fallback | S–M | P9 |
| Watermark and link | FEL mark in `exportVideo.ts` | The player's referral link or code on the end card (text, not a tracker) | S | P9 |
| Teachers and coaches bring their students | Invite link, QR, public invite on shared programs (`lib/coach/publicInvite.ts`), coach-store pages `/coach/<slug>` | Course landing pages (P2) with the teacher's invite; the referral code carried through signup | S after P2 | P1/P2 |
| **Referral rewards**: cosmetics + LC, inside the daily caps, no cash value | `/api/marketing/referral` (code and stats), `lib/marketing/referral.ts` (one grant per referred user, idempotent), `REFERRAL_BONUS` = **10 shards** flat (`lib/wallet/reward-rules.ts`, TUNE(elijah)); `/api/marketing/subscribe` takes `?ref` (closed while Join the Lab is hidden) | Switch the reward to **LC + a referral cosmetic** (owner numbers: a flagged economy change), make sure the grant is clipped by the daily caps, and keep the referral tree's USD commissions off (they are a P5 + counsel item, not a growth reward) | S | P9 |
| Creator partnerships (early Studio + sponsored venues) | Nexus Studio (creator beta = Nexus phase 9), `CreatorInquiry`, `/work-with-us` | A partner list and terms; sponsored venue credit (Nexus) | M | Nexus 9 + P9 |
| **Privacy-first tracking**: UTM + referral codes on our server, no pixels | First-party `AnalyticsEvent` (batched, `sendBeacon`), `/admin/funnel`, `/admin/metrics`, `MarketingLead.source`, `ReferralCode` clicks and conversions | Read `utm_source/medium/campaign` and `ref` on the first page view, keep them in a first-party session value, attach them to the signup and the first purchase, count them in the funnel. No third-party script; no cross-site identifier; the Privacy line in §4.1 | S | P9 |
| Paid ads | None | None planned (owner: organic first) | — | — |
| **Sponsors**: family-safe only | CRM models (`CrmCompany`, `CrmDeal`, `CrmContact`), `/work-with-us` | The brand policy (Appendix A, owner approves); a sponsored challenge type (P7's weekly events); team and club pages | M | P9 |
| **`/press`** | A book and publishing page: `BOOKS`, `featuredBook`, `PARTNERS` from `lib/books/bookCatalog.ts`, a "Join the Lab" panel | Draft copy (Appendix B) | S | P9 (copy) |
| **`/media-kit`** | `MEDIA_KIT`, `AUDIENCE_STATS` in `lib/creator/creatorCatalog.ts`; every rate and stat is an **EXAMPLE** ("Fixture numbers, not real stats") | Real numbers and packages (owner), copy (Appendix B) | S | P9 |
| **`/team`** | `approvedProfiles()`: "No profiles are published yet" | Real profiles (owner), copy | S | P9 |
| **`/work-with-us`** | The inquiry form; it says so while the `CreatorInquiry` table is missing (pending SQL) | The SQL (runbook), copy (Appendix B) | S | P9 |

Note: on 2026-10-16 the owner said to leave the placeholder copy on these four pages as is. The 2026-10-20 answer
asks for **drafts** for approval. This lane follows the newer answer and drafts only; the pages are not edited.

---

## 7. Owner questions

Only the decisions that change the plan. The recommendation is first in each.

**Q1. When do platform lanes run?**
(a) **Now, beside the feel lanes, at most two at a time, only on coach, education and money files** *(recommended:
they share no files with the game, and P0 is the launch)*. (b) After the feel lanes land, before Nexus. (c) After the
Nexus build-out.

**Q2. The audience order after launch.**
(a) **Coaches and teachers (P1, P2, P3, P5) → athletes (P6) → gamers social (P7) → schools (P8)** *(recommended: the
coach loop is the most built, Connect turns teachers into revenue, schools carry the most legal work)*. (b) Gamers
first (P7), since game feel is the priority. (c) Schools first.

**Q3. Who may teach or coach?**
(a) **One `teacher` role, granted by the owner's approval of an application; the Camp certification and the env list
both become routes into that same approval** *(recommended)*. (b) Keep the three separate (certified facilitator,
env list, approved teacher). (c) Certification only.

**Q4. The platform fee on teacher and creator sales.**
(a) **15% on everything, as today (`PLATFORM_FEE_RATE`), Stripe's fee from the seller's share; align the referral
tree's 30% to it** *(recommended: one number; the coach store and its terms already use it)*. (b) 10% on courses and
memberships, 15% on 1:1 and reviews. (c) 20%. Tips: (a) **same fee** *(recommended)*, (b) no fee.

**Q5. The cash-out threshold for USD earnings.**
(a) **$25** *(recommended: matches `REFERRAL_MIN_PAYOUT_CENTS`)*. (b) $50. (c) $10.

**Q6. The Connect account type.**
(a) **Express** *(recommended)*. (b) Standard. (c) Custom.

**Q7. Motion lessons (P3), a RIG-ADJACENT build.**
(a) **Build the in-browser path as new files, reusing `mocapRetarget` and `poseClip` unchanged; you sign off on what
the playback looks like on your phone** *(recommended)*. (b) Teachers capture offline the way you do (DeepMotion →
BVH → the build script), and FEL imports the files. (c) Skip motion; video only.

**Q8. YouTube unlisted links.**
(a) **Allowed for approved teachers on adult-facing course pages, privacy-enhanced, labelled "Plays on YouTube", never
on child-directed pages, never the only copy of paid content** *(recommended)*. (b) A link that opens YouTube, no
embed. (c) Not allowed, because YouTube may show ads (the strict reading of "no ads ever").

**Q9. Teens' training data with guardian consent: what counts as training.**
(a) **Set logs, sessions done, goals and program progress; Mirror scan numbers and all health data stay adult-only**
*(recommended: smallest change to today's rule)*. (b) Also Mirror scan numbers. (c) Also learning progress (the
feed and chapter checks), which are device-only for teens today.

**Q10. AI drafts a program (coaches).**
(a) **In P1, adults' coaches only, the same review-and-undo shape as the Studio AI builder, no athlete data sent
beyond the coach's own description** *(recommended)*. (b) Later, after P5. (c) Not at all.

**Q11. Under-13 classes.**
(a) **A teacher-hosted class mode with no child accounts and class totals only (§4.3), after counsel** *(recommended)*.
(b) School-authorised child accounts (more legal work, more features). (c) No under-13 use beyond today's screen.

**Q12. The video cost cliff.**
(a) **Stay on the GCS free tier with a per-teacher video budget; move teacher video to Cloudflare R2 if monthly egress
passes ~80 GB** *(recommended)*. (b) Use R2 from the start (another account and processor). (c) Pay GCS as it grows.

---

## Appendix A. Draft brand and sponsor policy (for the owner's approval)

Status: a draft written by a lane. Not legal advice. Nothing references it until the owner approves it.

**FEL brand and sponsor policy (draft)**

1. **No advertising.** FEL does not run ads. A sponsor appears only as credited content: a sponsored venue, a
   sponsored challenge, a team or club page, or a creator's disclosed brand deal.
2. **Family-safe brands only.** FEL's players include teens, and classes may include children. FEL does not work
   with brands, products or services in these categories, in any form:
   - gambling, betting, sweepstakes casinos, fantasy sports for money, loot-box or skin-gambling sites;
   - alcohol;
   - tobacco, nicotine, vaping and e-cigarettes, cannabis;
   - weight-loss pills, diet supplements that claim weight loss, appetite suppressants, "fat burners", and any
     product making medical or body-transformation claims;
   - adult or sexual content, dating services;
   - weapons and ammunition;
   - payday loans, crypto and speculative investment products;
   - political campaigns and political advertising.
3. **Supplements and sports nutrition** (protein, electrolytes) need the owner's case-by-case approval, never shown
   to under-18 accounts, and never with health claims.
4. **No data for sponsors.** A sponsor gets aggregate counts only (plays, completions). Never names, emails, ages,
   scores of individuals, health data or anything about a minor.
5. **Fair play.** A sponsored venue or challenge never changes gameplay, odds or ranked play (the Nexus fairness
   rules), and never gives a paid advantage.
6. **Disclosure.** Every sponsored item is labelled "Sponsored by …". Creators disclose their brand deals as the FTC
   requires (#ad or "paid partnership"), and FEL may remove content that does not.
7. **Approval and removal.** The owner approves every sponsor before anything goes live and may remove a sponsor at
   any time.

## Appendix B. Public pages: what each needs, and where the facts come from

The pages are not edited. Each draft below marks every fact the owner must supply as **[owner: …]**; nothing is
invented.

**`/press`** (today: the books and the "Join the Lab" panel). assumption: "press" here is the publishing page; if
the owner means a press kit for journalists, that is a new section.
- Needs: a one-paragraph description of FEL; the books (already from `lib/books/bookCatalog.ts`); a press contact; a
  launch date; approved screenshots or the logo files (`public/brand/`).
- Facts from: `lib/books/bookCatalog.ts`, `lib/legal/business.ts` (legal name, contact email), the owner.
- Draft: "Final Evolution Lab is a game and a training platform in one: play [owner: number] sports and movement
  modes on a phone, a TV or a computer, learn from approved teachers, and train with a coach. The books behind it are
  below. Press and partnership questions: [owner: press email]."

**`/media-kit`** (today: every number is EXAMPLE).
- Needs: real audience numbers (**only** from FEL's own analytics, `/admin/metrics`, with the date read); the package
  list and rates; past partners (already from `PARTNERS`); the brand policy link (Appendix A, once approved); a
  statement that FEL runs no ads and shares only aggregate counts.
- Facts from: `/admin/metrics` and `/admin/funnel` (admin role), `lib/books/bookCatalog.ts` `PARTNERS`, the owner.
- Draft: "Partner with FEL. We don't run ads. Brands appear as credited, family-safe sponsorships: a venue players
  play in, a weekly challenge, or a team page. [owner: monthly players, as of date], [owner: packages and rates].
  Sponsors receive aggregate results only, never player data."

**`/team`** (today: no published profiles).
- Needs: each person's approved profile (name, role, photo, a two-line bio, credentials), approved by that person.
- Facts from: `lib/creator/creatorCatalog.ts` (`approved: true` entries), the people themselves.
- Draft: "The people building Final Evolution Lab. [owner: profiles]. Book a session with a coach through the coach
  store."

**`/work-with-us`** (today: the form waits for the `CreatorInquiry` table).
- Needs: the SQL applied (runbook); who to contact for what (brands, teachers, schools); the brand policy link.
- Facts from: `lib/creator/inquiry.ts` (budget ranges and sources), Privacy §1 (the 12-month retention line already
  approved).
- Draft: "Brands, teachers, schools and creators: tell us what you have in mind. Teachers can apply to teach on FEL
  [link to the application, P2]. Brands: we work with family-safe partners only (see our brand policy). We reply
  within [owner: days]."

---

_Sources read on 2026-10-20:_
- Google Cloud free tier: https://docs.cloud.google.com/free/docs/free-cloud-features
- Firebase pricing (Blaze no-cost limits for Hosting and Cloud Storage for Firebase): https://firebase.google.com/pricing
- Cloudflare R2 pricing (free tier, free egress): https://developers.cloudflare.com/r2/pricing/
- YouTube "Right to monetize" (November 2020 Terms update), e.g.
  https://www.socialmediatoday.com/news/youtube-will-start-inserting-ads-into-non-monetized-content-updates-rules/589310/

_Repo facts: the files named in each row on `lane/finish-release` `3bf7ac7b`; `prisma/schema.prisma` (100 models);
`lib/flags.ts`; grep for invite, consent, friends, achievements, tournaments, tips, UTM and YouTube; byte counts and
durations of `lib/babylon/anim/authored/mocapOpponents.ts` and `mocapDance.ts` with `gzip -c | wc -c`.
`docs/LAUNCH-CHECKLIST.md` from `lane/launch-docs`; `docs/NEXUS-ROADMAP.md` from `lane/nexus-roadmap`. Nothing was run
on a device, against production, or in a browser._
