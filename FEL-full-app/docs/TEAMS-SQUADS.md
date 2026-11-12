# Teams and squads (value round "lane/teams" + friends round "lane/squads") — what shipped, and what waits on the owner

Lane `lane/teams-squads`, 2026-10-25. One shared core (`lib/groups/`) for a coach-led **team** and a friends' **squad**
(a coach is optional). Everything is off until the owner applies `prisma/pending/2026-10-25-teams-squads.sql`: before
that, `/squads` says "coming soon", `GET /api/groups` answers `{ available: false }` and every write answers
`503 groups_not_ready`. Nothing 500s. Within ~5 minutes of applying the SQL it is on, with no deploy
(`lib/groups/store.ts`, the shared probe in `lib/coach/pendingSchema.ts`).

## 1. What a member gets

| Piece | Where | Data source (no number is typed or sent by a page) |
|---|---|---|
| Group: name, colour, home court, trophy shelf | `TrainingGroup`; `/squads/[id]` header | A squad's name is two preset words (`lib/groups/types.ts`); a team's name is typed by its certified coach. Colour = a preset key. Home court = a playable venue key (`lib/game-data` VENUES) |
| Roles | `TrainingGroupMember.role` | owner / coach / member; the whole permission table is `lib/groups/rules.ts` `can()` |
| Invite by link, code, QR | `TrainingGroup.inviteToken`; `/squads/join/[token]`, the code box on `/squads` | The coach invite's shape and helpers (`lib/coach/inviteCode.ts`, `newCodedToken`), the same `qrcode`, the same code rate limit |
| Training buddies + nudge | group page | Each member's daily drill today, done or not: the drill claim's ledger row `daily_drill:<PT day>:<user>`. Nudges: three presets, one per pair per day, only to a buddy who has not done it |
| Group streak | group page | Consecutive PT days every member (who had joined) did the drill; needs two |
| Duo goals | group page | Both partners do the drill on 3, 5 or 7 of the week's days |
| Boards (friends-only) | group page | Drill days (everyone); measured reps (`MirrorSession.reps`) and the best **verified** jump (`lib/jump/seam.ts` `jumpRecords` over saved assessments) — adults who save numbers AND turned sharing on for this group |
| Weekly league + rollover | group page; `TrainingGroupAct` kind `trophy` | Monday–Sunday PT. Points in `lib/groups/activity.ts` `LEAGUE_POINTS`. The first visit after a week ends settles it once (unique `league:<week>` row) |
| Squad challenges | group page | Challenges v2: a member posts one of their own open (48 h) `ChallengeLink`s; the feed links `/c/<code>` |
| Teen-safe feed | group page | Drill days (one item a day), an adult's PRs (GameSession bests), shared reps, verified jumps, posted challenges, trophies. Five preset reactions. No text field exists anywhere |
| Team roll-up (coach) | `/squads/[id]` for the owner/coach of a team; the Teams panel on `/coach` | Drill days and games per athlete on the viewer's **live roster** (COACH-LOOP §3 rule), counts only |
| Assign to the team | team page | The daily drill (`TrainingGroup.dailyDrill`, shown to every athlete) and a program, through the coach loop's own `POST /api/coach/programs/duplicate` (assign-to-many) |
| Friends for profile v2 | `app/u/[slug]/page.tsx` | `viewerIsFriend` = squadmates (a team is not a friends list). False before the SQL |

## 2. Safety rules, as built

- **Join gates** (`lib/groups/gates.ts`). A team is the coach's roster, so joining runs the coach loop's teen gate
  unchanged and writes the `CoachClient` row (`via: 'team'`). A squad: adults yes; under 13 never; a blank year is
  asked first; 13–17 only with a guardian consent asked under wording that covers squads. **`SQUADS_CONSENT_SINCE` is
  null, so every teen fails closed today** (same pattern as `COACH_TRAINING_CONSENT_SINCE`).
- **Minors never exposed.** An unknown age is a minor. A minor's game scores, reps and jumps are never fetched (the
  gates run inside the Prisma `where`, as profile v2 does) and are filtered again on the way out
  (`allowedActivity`). A teen's posted challenge shows its mode, not its score. A minor cannot turn sharing on.
- **No public page.** A non-member gets the same 404 as a group that does not exist.
- **Reactions only.** The act route takes preset keys only and refuses any extra field (`unexpected_field`).

## 3. Owner calls (nothing here is live policy)

1. **Apply the pending SQL** — `prisma/pending/2026-10-25-teams-squads.sql` (steps in its header; additive; sql-guard
   matches it).
2. **Teens in squads.** Approve guardian wording that covers squads, put it live, then set `SQUADS_CONSENT_SINCE`.
   Policy text is also needed (docs/PLATFORM-ROADMAP.md §4.1 "Friends for teens": Privacy §1/§2, Terms §2/§5,
   community guidelines). **Approved by the owner, in chat, 2026-10-27 (card C08); not live yet.** In code word for
   word as `lib/consent/guardianGate.ts` `squadsConsentWords`; it goes live with the withdraw path and the go-live
   date (the steps are in that file), so `SQUADS_CONSENT_SINCE` stays null. The last sentence stays out until the
   withdraw path exists (`GUARDIAN_WITHDRAW_LIVE = false`).

   > FEL is a training app. **{name}** would like to join a squad: a small group of friends who see whether each
   > other did the daily drill, a weekly points table from drills and games, and preset reactions (like 🔥 or 👏).
   > There are no messages, comments or private chats, and squads have no public page.
   > Squadmates see **{name}**'s first name, whether they did the daily drill, their place in the weekly table and
   > the challenges they choose to post. They never see **{name}**'s game scores, camera numbers or health data.
   > You can withdraw this at any time from the link in this email; **{name}** then leaves every squad.

   The withdraw path does not exist yet (COACH-LOOP §1 step 4 has the same gap).
3. **Teens on teams** follow COACH-LOOP §1 (the coach-training wording); nothing new here.
4. **League scoring** (new numbers; approved with the C09 wording, owner in chat 2026-10-27, since the league line states them): drill day 10, finished game 2 (up to 15 a week), win 3 (up to 10 a week). "Real
   reps" in the league = drill days, because that is the training everyone (teens too) has on the server; measured
   Mirror reps are on the board only, so the league stays fair to people who keep numbers on the phone. A tie at the
   top shelves no trophy. Owner's eye: change `LEAGUE_POINTS` / `LEAGUE_CAPS` in `lib/groups/activity.ts`.
5. **The reaction set** (🔥 👏 💪 💯 🐐) and the **nudges** (drill / streak / game) in `lib/groups/types.ts`.
6. **Caps** (new): 12 per squad, 60 per team, 10 groups per account.
7. **Typed team names.** A certified coach types the team's name (2–32 plain characters, no links or handles); a
   squad's is preset words. Say if a team with minors should also use preset names.
8. **Adults and minors in one squad.** Nothing stops an adult who has the code joining a squad with a teen in it (the
   rules above still hold). Say if a squad with a minor should be minor-only, or owner-approved joins.
9. **Copy** in `lib/groups/copy.ts` and the components: **approved as written** (owner, in chat, 2026-10-27, card C09),
   including the league line's points (item 4).

## 4. Verified jumps: why the jump board is empty today (finding)

`lib/jump/seam.ts` is wired: the board reads `jumpRecords` from each saved Mirror assessment's T5 read and keeps only
`verified: true`. A saved assessment (`lib/assess/prqWrite.ts` record) keeps each jump's index, validity, flight and
height, but **not** the JUMP-PRO fields `verifyJump` needs (`method: 'refined'`, `heightSdCm`, `quality`): those are
memory-only by that file's allow-list. So every stored jump reads `framesOnly` and no jump verifies from the server
today. Measured in `tests/teams-squads/server.test.ts` (a stored frame-edge read of 70 cm does not reach the board; a
re-timed 50 cm read does). Follow-up for the jump lane: keep those three fields in the saved record (adults who opted in).

## 5. Follow-ups

- **Combine day** builds on teams: a coach runs a measured tryout for a `TrainingGroup` of kind `team`; the roster rule
  and the roll-up are the pieces to reuse.
- Home court as a **Nexus Studio venue**: Studio venues live on the device (no server id). `homeCourt` is a string
  (`venue:<key>`), so a `studio:<id>` form can be added once a published venue has an id.
- Clips in the feed wait for the user's own clip store (`lib/progress-card/summary.ts` `clips: null`).
- Rival pairing, squad vs squad (lane/coop), and a nudge shown outside the group page (e.g. on Train).
- The daily drill card could say "assigned by your coach" (`lib/daily-drill` is the daily-drill lane's).

## 6. Measured

- Tests: `lib/groups/*.test.ts` and `tests/teams-squads/*.test.ts` (65).
- Phone rig: `scripts/probes/_teams-squads-probe.mts` — home, squad, team, coming soon and join at 390 px; no sideways
  scroll, no overflow, no button under 36 px, no text box, no page error.
