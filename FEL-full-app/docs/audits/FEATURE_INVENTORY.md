# FEL — complete feature inventory

**Date** 2026-09-12 · 70+ pages · **139 API routes** · **78 database models** · ~76k lines of `lib`

Counted from source, not memory. The monetisation column is the point: **102 of 139 API routes
require a login, and exactly 3 check an entitlement.** Almost the entire product is free today.

---

## 1. The games — 22 enabled modes

| Area | What exists | Gated? |
|---|---|---|
| **Basketball** | dunk (2265 lines, 3-judge contest), 1v1, 3v3, threepoint, dunkduel | free |
| **Combat** | karate endless (horde), karate_vs, mixedcombat | free |
| **Board** | skateboard, snowboard_slalom, surf, bigair | free |
| **Field/net** | football, tennis, volleyball, soccer(penalty), baseball(derby), golf | free |
| **Creative** | dance, freerun, carnival (mini-game hub), who_scene_it | free |
| Retired but present | duel, showdown, sprint, tiebreak, acting, music, brain-brawl | — |

**Multiplayer:** async score-challenge on all 22 · **realtime netplay live** on 1v1, 3v3 (one seat),
karate (co-op) via `fel-netd` on Cloud Run.

## 2. The Neuromechanic Mirror — *the most sophisticated thing in the repo*

`lib/babylon/nexus/neuro-mirror/` — pose adapter (MediaPipe), kinematic engine, cue engine, rep
counter, squat audit, zone binding, overlay compositor. Real computer-vision form coaching with
live cues. Route `/play/mirror`, plus `MirrorTriumph` model and `/api/mirror-triumph`.

**Status: fully free, ungated.** This is the clearest premium differentiator in the product.

## 3. Coaching platform

15 API routes: `catalogue · categories · chat · exercises · inbox · me · messages · programs ·
review` + admin. Models: `CoachingProgram, Block, Session, SessionExercise, ClientSession,
ExerciseLog, ProgramMessage, FacilitatorProfile, Credential, GuardianConsent, GoalPlan,
ProgramExercise, ExerciseCategory, Exercise`.

**Depth is uneven:** `chat` is substantial (138 lines, LLM-backed); `catalogue` 30, `programs` 25,
`review` 20, `inbox` 22 are thin. **Ungated.** A credentialed-coach lane with consent and guardian
models is real infrastructure — and currently free.

## 4. PRQ — the measurement spine

8 attributes (strength, speed, endurance, agility, power, flexibility, recovery, mental), tiers,
decay (0.5/day past a 3-day grace, floored), per-mode attribute vectors, session deltas capped at 3.
4 API routes + `PrqEntry` model. **Free by design — correctly.**

## 5. Economy

Wallet + double-entry ledger (`LedgerAccount/Transaction/Posting`), `CreditLedger`, `RewardRule`,
`PerfEarnEvent`, shards, exchange, earn gating, Stripe checkout/webhook/portal/payout.
**The only entitlement-gated routes in the app** (`wallet`, `wallet/spend`).

## 6. Camp / education / CRM — B2B surface, largely invisible

- **Camp:** `CampSession, CampTemplate`, mentees, plans, assess, consent, profile, revoke
- **Education:** `LessonProgress`, `/education`
- **CRM:** `CrmCompany, CrmContact, CrmDeal, CrmActivity, CrmNote` — a full sales CRM
- **Bookings:** `SessionBooking`, `/api/v1/sessions/book`

**This is a whole B2B product inside the app**, and it has no pricing attached.

## 7. Creator / Studio / marketplace

`CellProject, CellApiKey, CellSettings, CellUsage, ProjectFile, CellMessage, CellWisdom`,
`CreativeCard, CardSlot, CreatorCard`, `MarketplaceListing, MarketplacePurchase`,
`StudioPartnerKey, PartnerUsage`. Studio Creator sub exists ($29.99/mo).
Card slots and creative-card uploads are purchasable.

## 8. Progression & identity

`Season, PassProgress, PassGrant` (battle pass), `ModeMastery`, `LadderSeason/LadderEntry`,
`StoryNodeProgress` + `/story`, `/story/boss`, `/story/rail`, `SignatureAttempt` (`/signature`),
`AvatarLook, OwnedWearable` (`/closet`), `WorkoutScan, WorkoutPlan` (`/workout`).

## 9. Social & growth

`ChallengeLink` (`/c/[code]`), `ReferralCode, ReferralConversion`, `MarketingLead`,
`GuestSession` (`/try` — no-account funnel), `MpMatch`, `/ladder`, `/arena`, `/live`.

## 10. Platform & infrastructure

Controller Link (phone-as-gamepad, WebRTC, 13 files), `lib/feel` (63 files — game feel),
`lib/net` (netplay), `lib/locomotion` (shared movement core), Kitchens (`/kitchens`, fuel),
`AnalyticsEvent/MetricRollup` + `/admin/metrics`, `/admin/funnel`, telemetry, dev harness
(`/dev/mode/[key]`, rig, anim, render-check).

---

## What this means for monetisation

**Currently sellable, and priced:** FEL Pro ($6/wk or $9.99/mo — attribute upgrades), Studio
Creator ($29.99/mo), cosmetics, shards, studio credits, card slots.

**Built, valuable, and given away free:**

1. **The Mirror** — CV form coaching. The single strongest premium case in the product.
2. **Coaching platform** — programs, sessions, credentialed facilitators, guardian consent.
3. **Camp + CRM + bookings** — an entire B2B lane with no plan attached.
4. **Battle pass / seasons / ladder** — live-service scaffolding, unmonetised.

**The honest headline: 3 of 139 routes check an entitlement.** The attribute-upgrade gate I built
is real but small — it sells the *sweetener*. The Mirror and the coaching lane are the product
someone would actually pay for, and today both are free.

## Gaps worth naming

- 7 modes have **zero tests** (threepoint, football, bigair, freerun, dance, who_scene_it + net cfg)
- **No per-mode perf profile** beyond dunk/1v1/skate (measured this session)
- Retired modes still routable (`/play/duel`, `/play/showdown`, `/play/sprint` → redirect)
- `/play/mirror` was shipping 2 MB of JS to every visitor until today
- Realtime netplay covers 3 of 22 modes; 12 are solo-only (ghosts are the cheap win)
