# Owner decisions — the running log

Every product decision the owner (Elijah) has made in the coordinator sessions, dated, in the owner's words where quoted.
**Read this before starting work** (CLAUDE.md points here). It sits beside `docs/AGENT-OPERATING-RULES.md` (how agents
work) and `docs/LANES.md` (who owns what): this file is *what was decided*.

## Standing rules from these decisions (owner, 2026-10-20)

- **Ask less, decide more.** For reversible choices, take the recommended option and flag it; ask only on irreversible
  ones (the list in CLAUDE.md: main, history rewrites, deletes, deploys, destructive DB work, outward-facing, dependencies,
  legal/policy copy).
- **A quality bar for every lane:** before/after proof (numbers + strips or screenshots), tests with mutation checks, the
  full gate, and no TUNED change without a flag the owner can find.
- **Fewer, bigger merges.** Batch related lanes into fewer PRs and deploys.
- **Game feel first, then Nexus**; platform lanes (coach, education, money) may run beside them, at most two at a time.
- **No ads ever** inside the app. Real-money competition stays OFF until a legal review.

## The log (oldest first)

The entries below are the coordinator's log, copied as written. Later entries override earlier ones where they differ.

# Owner decisions still binding (rebuilt 2026-10-13 from the coordinator's record)

## PSN-style party (2026-10-09)
- Voice + text chat with quick-chat buttons + emotes. No video.
- The party persists on every page and inside every game (floating party bar); anyone plays their own game; the HOST can
  "Start together" to pull everyone into a multiplayer mode (5 s "Joining X…" with Cancel; decliners stay in the party;
  after the match everyone is still in the party).
- Teens (under 18 or unknown age): friends-only (invited) parties, NO voice, NO free text — preset quick-chat + emotes only,
  enforced SERVER-side. Adults: voice + text.
- Up to 6 (netd MAX_PLAYERS); join by invite link / 6-letter code / QR; host can kick; host transfer when host leaves;
  everyone can mute, block, report; NEVER recorded (scan test like lib/coach-store/call/no-recording.scan.test.ts).
- Voice: peer-to-peer WebRTC mesh now, relay-ready (TURN env slot like lib/coach-store/call/iceServers.ts); if a peer
  can't connect, say so; text keeps working. Game audio ducks under voice.
- UI: floating party bar (avatars, speaking, mute) on every page and over games; tap → full panel with chat; tucks into the
  pause menu when it would cover the HUD (nothing on the play screen but the HUD).
- netd protocol changes are ADDITIVE; the owner redeploys netd (Cloud Run) — never deploy; the client must degrade
  gracefully against the old netd ("Parties need a server update"). Messages ephemeral (relay only, never stored).
  A policy sentence, if needed, is routed (don't edit lib/policies.ts).

## Camera fixes (2026-10-08, from the owner's playtest)
- 3-Point Contest: "you can't see the hoop when shooting from the corners" → the rim stays in frame at every rack (both
  corners) through setup → release → arrival, desktop + phone portrait/landscape. Shot feel/timing/meter unchanged.
  (Before the reset a lane found trees at one court location blocking the sightline and faded them; also re-check.)
- Karate Endless: "camera is still wonky and needs to zoom out a little" → zoom out a little, keep the player and incoming
  enemies framed (nothing cut off at the edges), no jitter/snapping, pull back more in crowded waves (within limits).
  Every camera number changed = TUNED (from → to). Combat feel numbers unchanged.

## Old PRs (2026-10-08/09: "get all the other PRs finished")
- #48, #19 merged. #19 follow-ups the owner wants LATER (separate lanes): a reveal-only CLAIM on the end screen; extend
  ComboBreaker to Karate VS; the Mirror camera-help patch (cameraErrorLine → cameraHelpText) as a small follow-up.
- #46 music suite: owner chose CLOSE and RE-LAND the still-missing parts fresh on the current dance design: chart density
  pays as STYLE (no score-ceiling jump), current holds (STYLE) + MATCH buttons win, dance staking back on only after a
  real-DB proof.
- Never close a PR without the owner's OK (except #46, already decided). Owner-sign-off items → multiple-choice questions.

## Old PRs, owner answers 2026-10-13
- Close #112, #114, #116 (superseded); merge #106 (tests only). #105 and #140 merged.
- #144: marketplace FAIL CLOSED (reverses 09-24 free preview). Take #144 as is.
- #17 book shop: all recommendations. Merge dark now. Before go-live: sign-in + isVerifiedAdult; store terms gate (termsAccepted + STORE_TERMS_VERSION, 409 terms_required; go-live blocked on LEGAL-COPY-2); own switch BOOK_STORE_ENABLED; platform Stripe account (sk_test_ only); /books -> /press.
- #18 creator: SLIM DOWN. Keep team profiles, media kit, inquiry form (inquiries to Postgres through pending SQL). Drop firebase-admin + Firestore + own booking engine. /team Book buttons go to the coach store (adults-only). Add a privacy-policy line for inquiries (lib/policies.ts).
- 2026-10-13 LANDED: #17 (81d7788d) and #18 (b52582de) merged into lane/finish-release. #218 coach review link merged.
  OWNER ITEMS from it: store terms (2026-10-12) cover stream-only audiobooks, but the shop sells ebooks, bundles and downloads, so book go-live must wait for matching terms;
  apply 2026-10-13-creator-inquiry.sql + 2026-10-09-book-shop.sql; no inquiry notification path; 365-day retention assumption;
  buyers have no "my bookings" page (review studio reachable only from the thanks page).

## Dance re-land, owner answers 2026-10-13
- PAY: cap scored steps per song to the OLD generated counts (warmup 26, cypher 29, goldenhour 32, battle 38, canals 41, evolution 47),
  so pay is exactly unchanged. Extra chart beats become STYLE taps (density pays as STYLE).
- LATER (all four wanted, redesigned for MATCH): phone dance pad around MATCH buttons; the six captured moves as clips;
  freestyle where the button picks the move, without fighting MATCH; fair duels + staking ONLY after a real-DB proof.
- 2026-10-13 PRs: #219 party (CI), #220 cam fixes (CI).
- Warmup: PROMOTE one accent to a scored move (26 steps), so pay is exactly unchanged on all 6 songs.
- 2026-10-13 merged: #219 party, #220 cams, #221 #19 follow-ups. Visual wave 1 redo started: vis-foundation-2 (Opus), vis-combat (Sonnet).
  vis-party waits for the dance-reland merge (DanceMode.ts overlap).

## Owner answers 2026-10-13 (clarity round)
- BOOK TERMS: the shop matches the terms. Launch books as stream-only audiobooks first. Ebooks, bundles and downloads stay HIDDEN
  (fail-closed) until EBOOK-1 terms exist.
- PRIVACY: add the party privacy sentence (scratchpad/party-chat/routed.md) to lib/policies.ts with a version bump. Retention
  is 12 months for party reports AND creator inquiries, with automatic deletion.
- BOOKINGS: build a "Your bookings" door on Profile: paid sessions and video reviews, with Upload clips / Join call /
  Receipt / Add to calendar.
- DEPLOY: fast-forward main after Dance (#224) merges with green CI. Visual wave 1 ships in a later deploy.

## Owner answers 2026-10-13 (visual wave 1 round)
- Football: KEEP the broadcast intro plus auto touchdown replays (all skippable). Roll them out to more modes in wave 2.
- Combat slow-mo finishes (KVS deciding KO, Mixed/Duel ring-out): KEEP.
- Cliffside Shrine: GOLDEN HOUR (not nightGame). Change the foundation's routed cliff mood to goldenHour.
- Books: paid buyers KEEP streaming access even with the shop switched off (adult and entitlement checks stay).
  Add a DAILY scheduled cleanup for the 12-month deletion of party reports and creator inquiries.

## Owner 2026-10-13 (after wave 1)
- DEPLOY: fast-forward main once the combined release CI (8ee1b5be or later) is green.
- NEXT: visual wave 2 (court, board, race, then hoops; roll the replays and intros out to more modes) AND the TV HUD (wave 3, A9.13).
  Not chosen this round: the dance extras and the Nexus editor.

## Owner 2026-10-13/14 (after wave 2)
- DEPLOY wave 2 + TV HUD: fast-forward main once the release CI (c050e31c or later) is green.
- NEXT: GO ON HOOPS. Lift the hoops hold: hoops visual pass (dunk, dunkduel, onevone, threevthree, threepoint, carnival)
  plus the hoops TV HUD migration.

## Owner 2026-10-14 (guidance round)
- HOOPS METERS: turn ON both the 1v1/3v3 shot-meter fill and the three-point GOOD band. Timing windows unchanged; feel-check on device.
- OWNER PRs: drive #235 (Klarna off) and #240 (HOOPS H1) to merge. #240 goes AFTER the hoops visual lanes land.
- DEPLOY: one deploy after hoops lands (hoops visuals + HUD + owner #230/#241), once CI is green.
- AFTER HOOPS: wave 3 polish (the deferred lists from every lane).
- 3-Point: ADD the crane intro; the 60 s clock waits until it ends or is skipped (owner 2026-10-14).

## Owner 2026-10-14 (after wave 3)
- DEPLOY wave 3 once the release CI (566beb28 or later) is green.
- AERO CLOUDS: SOFTEN. Halve the fog pulse; clouds still read, and the next ring never disappears.
- KART RAIN: ADD a Rain on/off chip on the kart start screen. Visual and weather only; handling unchanged.
- NEXT (all four chosen): bug sweep on live, dance extras, Nexus editor, phone perf pass.
- NEXUS (owner 2026-10-14): build the Nexus editor INSIDE FEL as /studio. The owner LIFTS the SHIP FIREWALL for /studio.
  First scope: ALL FOUR, phased: venue/level editor, AI game builder, character/look editor, visual scripting.
  /studio stays unlinked (flag-gated) until the owner says ship.
- Aero soften and kart Rain chip: done on lane/w3-followups (1be42d9b).
- NEXUS AI builder: open it to TEENS too (owner 2026-10-14). Only the venue description is sent; no account or health data.
- NEXUS cast: use the character's OWN height and build (owner 2026-10-14). Needs a scoring-fairness review first: play scale
  must not change score.
- Dance extras done on lane/dance-extras (d600da41). Open owner choices: flip the CHART_MOVES aliases to the captures;
  a STYLE variety bonus; more or longer freestyle sections; re-time moonwalk and robot.

## Owner 2026-10-16
- DEPLOY: release (6112e7ec or later) to main once CI is green. /studio stays off until NEXUS_STUDIO_ENABLED is set.
- PLACEHOLDER copy on /press, /team, /media-kit, /work-with-us: LEAVE AS IS.
- PERF next (all three approved):
  (a) optimise the rig layers (PostureLayer, TwoBoneIK, FootPlanting per-frame garbage). GATE 0 first, motion identical (tested).
  (b) bring Dunk/Karate under their phone mesh and particle budgets.
  (c) pre-warm shaders on phones at load (longer load, no mid-play stall).
- SITEMAP: fill it with the public pages plus a Sitemap line in robots.txt, regardless of the store flag.
- PRIVACY §1/§2: NAME the Studio AI builder's requests, with a policy version bump (owner approved this legal-copy edit).
- PRIVACY TEXT for the Studio AI builder (§1/§2, version 2026-10-16): APPROVED as written (owner 2026-10-16). Merge #291.
- KARATE VS phone particles (18–26 vs a budget of 5): TRIM to the budget, phone-only. Do not raise the row.
- WHO SCENE IT SkinningGuard false "SKINNING STALL" on char_65: FIX the check. Keep the real-stall guard.

## 2026-10-16 (later)
- Deploy #290 + #291 + #293: "Deploy when CI is green" — after #293 merges and release CI is green, ff main.
- Karate VS overlapping hits: "Second hit drops streaks" — keep PHONE_MODE_CEILING['karate-vs']=5; a hit landing while a burst is live shows only its core flash on phones.
- #296 KVS combo (earlier streaks cut short): "Deploy when CI is green".
- Next: "Dunk garbage fix" + "Nexus Studio next round".
- Studio round 4 (#301/#302/#303): "Deploy when CI is green".
- Closet half of Edit in the Closet (closet-view.tsx diff, NEXUS-STUDIO §12.5): "Apply it".
- Tiebreak rival slot: "Not now".
- Privacy §2 naming Explain: "Leave as is".

## 2026-10-17
- #304 Closet half: "Deploy when CI is green".
- Next (all four): Studio round 5; Studio save to account (design + schema proposal first, owner approves schema before any DB/prisma change); Ship-readiness check; Dance extras (options first, owner picks).
- Studio save Q0: new table StudioProjectSave. Q1: TEENS 13+ and adults (not the rec). Q2: look codes never stored. Q3: auto-merge, else keep both.
- Studio save Q4: 1 MiB/20 projects/8 MiB, 12/min 1500/day. Q5: keep until user deletes. Q6: add §1/§2/§4 bullets + version bump (show owner exact text first). Q7: include in account export.
- Studio save Q8: SQL applied in the SAME SESSION as the deploy that carries the route (not the rec). Q9: own flag STUDIO_CLOUD_SAVE_ENABLED (off by default).
- Dance: Q1 five chart names -> captures via chart files; Q2 +50 per new button past first, cap +150 (STYLE only, new tuned numbers set by owner); Q3 second freestyle section per song (end of first hook); Q4 keep moonwalk/robot timing; Q5 move canals moonwalk to beat 84; Q6 small follow-up: grace window at freestyle section end so next on-beat step keeps combo.
- HOOPS (owner 2026-10-17): "The model only dribbles right handed, let's fix that. It needs to perform real crossovers. Sharpen up the moves." -> lane/hoops-handle.
- Studio save policy text (§1/§2/§4 + bump to 2026-10-17): "Approve as written". Studio save PR: HOLD until the owner's deploy session (merge -> preview/apply/verify SQL -> deploy, one session).
- HOOPS 2026-10-20: strong-hand auto-return (H2d Q8) OFF — ball stays in the hand the last move left it in (STRONG_HAND_RETURNS false). Body-dip pass: YES, next, separate lane (feet-keyed legs, no timing changes).
- HOOPS round 2 (owner 2026-10-20):
  - Auto hand: OUTSIDE HAND WHEN GUARDED (defender within reach -> ball to the hand away from him); open court: stays where the last move left it.
  - Combos: chain with a combo window (flow only, no odds change).
  - New moves: in-and-out, snatch-back, hesi-cross, left-hand spin.
  - Momentum cross cut snap: smooth the facing over ~0.12 s (feel number, flag).
  - Defense: defenders shade the ball side (feel-test; flagged as gameplay change).
  - Feedback: sounds, controller rumble, camera punch (off in reduced motion), crowd ooh on ankle-breakers.
  - Movement pass: foot sliding, stops and starts, turn smoothing everywhere (hoops), Tiebreak portrait camera framing.
  - Feel panel: YES, dev-only sliders for the new numbers; owner tweaks on phone, tells values, we commit.
- HOOPS SHOOTING (owner 2026-10-20):
  - Distance narrows the green for the hero in 1v1/3v3 (like 3PT); perfect pays the same. Gameplay change, feel-test.
  - Meter: show the PERFECT band in the 1v1/3v3 meter; finer grades (slightly early/late with ms).
  - Everyone on the rim system (3v3 mates + rivals + dunks) with make rates kept exactly.
  - New shots: free throws, step-back own release, bank-shot animation, 3PT catch-and-shoot set/hop.
  - Shot clock: visible on ELITE only (12 s 1v1 / 14 s 3v3); easier levels untimed.
  - Rebounds: physical bounce + box-out + timed jump decides (less random).
  - Ratings: Creator ratings slightly widen the green in CASUAL modes only; ranked/staked/arena rating-free.
  - Momentum multiplier in 3v3 too (0.94-1.10, trail when hot).
- HOOPS DEFENSE / CONTACT / CONTESTS (owner 2026-10-20):
  - Clipping: one standoff that matches the rules + contact poses (arm bar, forearm on hip, chest-to-chest).
  - 3v3: same Havok physics as 1v1 (measure phone cost, 6 bodies); brace/box-out work; AI bumps react.
  - Contact reactions by direction and force (visual only).
  - New contact play: post-up contact, hand-checks (too many = foul), screens that collide, box-out battle.
  - Blocks: hand meets ball for everyone; AI times its jump (no dice); ball flies where hit; block rates close to today's.
  - Contest: one model for all (distance, hand raised toward ball, closeout at shooter, jump timing curve); banner as today.
  - Shot look under contest: higher release / slight fade / adjusted hand on layups; odds still from the contest.
  - AI/team D: reaction delay by difficulty (420/220/120), 3v3 steals like 1v1 (no 30% coin flip), player switch + double in 3v3, goaltending needs a touch.
- QUALITY / SMOOTHNESS / FEEL (owner 2026-10-20):
  - Frame rate: 60 when the phone can hold it, else an even 30 with steady pacing (measured per mode).
  - Smoothness sweep of every mode on the phone profile (frame spikes, compiles, garbage); fix the worst, before/after.
  - Input lag: measure press-to-motion per mode; budget <= 100 ms on phones, input buffer so early presses count; fix worst.
  - Loading: play sooner, stream the rest (court + you first, extras in background) for every mode, like first-dunk.
  - Animation: blend + minimum-hold rules on every clip change, all sports (pose jumps/s before/after).
  - One shared impact kit (hit-stop, shake by size, brief slow-mo on biggest, sound + rumble); reduced motion turns shake/slow-mo off.
  - Cameras: smooth damped follow + slight look-ahead; distances/heights/FOV unchanged.
  - Audio: surface footsteps, body/cloth on contact, crowd follows tension, spatial sound.
- GOAL GAP (owner 2026-10-20):
  - Nexus "creates my app" = ALL FOUR: shipped venues come from Studio (prod loads Studio exports); build new modes in Studio (rules/scoring/venue/scripts as data); AI builds a whole mode; Studio edits the app too (menus, home, tiles).
  - Studio audience: owner first (admin), then an invited creator beta; public later.
  - Sharing: share links first (play by link, no money); marketplace later.
  - Nexus edge: ALL FOUR: AI-first creation, edit on a phone, pro quality no code, play-and-edit live.
  - "Finished" = public web launch + a written launch checklist (all green -> owner announces).
  - Platforms: installable phone web (PWA), app stores (AFTER web launch), TV/big screen, desktop web.
  - Real devices: owner runs a per-mode checklist on their phone; diagnostics via game_diag.
  - Priority: game feel first (hoops + feel lanes), then Nexus build-out.
  - Ops items: ONE runbook, ONE session together (readAt/pending SQL, retention cron, netd redeploy, env vars, Studio-save deploy).
- EDUCATORS (owner 2026-10-20): reframe = Udemy/Khan x TrueCoach x the game x Muscle&Motion; dance teachers, musicians, voice coaches, movement practitioners. (No Udemy/Khan mention exists in the repo; education threads = SPEC-PASSION-PIPELINES, COACH-COMPETITIVE-AUDIT, KNOWLEDGE-FEED /learn, Playbook, CAMP-BLUEPRINT, coach-store course/series.)
  - Under 13: class play with no accounts. Pricing: free class tier + paid Facility. Content: PE lesson plans, movement science units, Studio for classes.
  - Course formats: ALL (lesson + camera check, 3D demos on avatar, practice inside games, teacher video lessons) — "figure out how to do the above without an additional cost; build/replace the architecture needed or use what's free".
  - Disciplines: ALL (movement & strength, dance, musicians & producers, voice coaches).
  - Who teaches: approved teachers (apply; owner approves; Teacher badge on Creator Card).
  - Teacher pay: ALL (sell courses, monthly memberships, 1:1 + video review, classes for schools/studios).
- COACHES (owner 2026-10-20): add clients ALL (invite link+code, email invite, QR in person, bulk team import); leverage ALL (templates+duplicate+library, assign to group, AI drafts program, Mirror-driven correctives); retention ALL (compliance alerts, scheduling+calendar, coach app on phone, progress reports incl. guardian for teens); payouts: STRIPE CONNECT (platform fee).
- ATHLETES: teens save TRAINING data with guardian consent (pain/health intake stay adult-only; privacy text needs owner approval); goals ALL (goal + weekly plan, progress timeline, streaks+reminders, share progress w/ visibility); scouting: verified stats + coach attest, adults opt-in searchable, minors never by default; fun ALL (workouts as game levels, train with friends, seasons+challenges, AI coach check-ins adults opted-in).
- GAMERS: social ALL (friends+invites [teens via code], leaderboards per mode, ranked+matchmaking, achievements); progression ALL (season pass free lane first, mastery tiers, weekly events, free tournaments); full controller + TV menus; Studio share links for player content (practice-only, never ranked/staked).
- MONEY: sell first ALL (FEL Pro, courses+coaching w/ Stripe Connect, cosmetics + season pass PRO, books); creators earn ALL (revenue share via Stripe Connect, cash out royalties for verified adults above threshold, tips, brand deals); real-money competition: KEEP OFF until legal review; sponsors: sponsored venues (Studio), sponsored challenges, team/club pages, NO ADS EVER.
- ADVERTISEMENT / GROWTH (owner 2026-10-20): meaning = marketing FEL to grow; "no ads ever" in-app STAYS.
  - Channels ALL: shareable highlight clips (vertical, watermark + link, rendered in browser), teachers/coaches bring students (invite links/course pages), referral rewards, creator partnerships (early Studio + sponsored venues).
  - Paid ads: none at first, organic. Tracking: privacy-first, NO ad pixels (UTM/referral codes counted server-side).
  - Referral reward: cosmetics + Lab Credits (inside daily caps, no cash value).
  - Clips show: replay + score card + FEL end card; Creator Card ending; music from your own Music Room songs (no copyrighted); Studio venue credit.
  - Sponsors: family-safe brands only (no gambling/alcohol/tobacco-vape/weight-loss pills/adult); a written brand policy for owner approval.
  - Public pages /press /media-kit /team /work-with-us: DRAFT real copy for owner approval (nothing live until approved).
- 2026-10-20 more: deploy merged release (#374 #375 #320 #305 #306) "when CI green" — BUT also "ops session soon, before more deploys" (clarify order). Feel panel: add a NARROW "feel" permission instead of admin. Schema gap: ADD the 3 models (PartyReport, CreatorInquiry, book shop) + regenerate client on Linux (owner-approved).
- ORDER: deploy now; the ops session next (before the following deploy).
- NEXUS: publish path = committed JSON first, then live publish (phase 2); competitive = only owner-published venues, look only (no scripts/camera actions, readable lighting), user content never; user-made modes = practice only, no rewards.
- PLATFORM (owner 2026-10-20): run platform lanes NOW beside game lanes, max two, coach/education/money files only (P0 launch sales first, then P1 coach loop + P4 media). Audience order after launch: coaches & teachers -> athletes -> gamers -> schools. One `teacher` role granted by owner approval (Camp-certified qualify automatically). Platform fee 15% everywhere (align referral tree 30% down to it).
- DEPLOYED main 2ab6a314 -> 3bf7ac7b (#305 #306 #374 #375 #320 + owner #316).
- DOCS AUDIT (owner 2026-10-20): email via owner's Google Workspace mailbox (app password/service account in ops session); web push opt-in (needs PWA; no marketing pushes to teens); anonymous perf stats (fps + load time per mode to game_diag); load budget: playable 8 s, full 20 s on mid-range phone.
  - Adventure REPLACES Story (retire FEL_STORY_MODE_SPEC); Adventure's 11 open decisions in a later round.
  - Server replay verification BEFORE ranked/staked go live.
  - Cleanup: answered archive + delete dead modes + "leave everything" (contradictory -> clarify).
  - Prepare for approval: 88 Playbook quiz drafts (one page to tick), Mirror scoring capture session (47 takes), Kitchens recipes (owner sends), book shop details.
- Cleanup: archive stale docs into docs/history + delete the 4 dead mode files (after proving no imports). Cash-out threshold $25. NO YouTube (own storage only; strict no-ads). Motion lessons: YES, owner signs off the look. Teen data: training only (set logs, sessions, goals, program progress); Mirror scans + health adult-only. Connect: Express. Under-13 classes: after a lawyer's review. Storage: free tier + per-teacher budgets, R2 past ~80 GB/month served. (AI-drafted program in P1: yes, per coach answers.)
- NEXUS remaining (owner 2026-10-20): published venue becomes the mode's DEFAULT with one-tap Restore; share links: signed-in players open, owner + verified adults make (teens build but private), creator name shows; moderation: auto text screen + reports + takedown, unlisted works at once, public listing needs owner approval; phone: the whole editor, AI-first; first data mode: Target Attack; CELL HTML builder kept as a separate prototype tool. Adventure's 11 decisions: after launch work is underway.
- QUALITY (owner 2026-10-20), PLATFORM: pick-your-path onboarding (play/train/learn/teach/create -> one start + 60 s guided first win); full WCAG 2.2 AA audit + fixes (games: colour-blind-safe cues, remappable controls); "Report a problem" button with auto context (no personal data) -> admin inbox; exercise library = 3D demos from the owner's books in owner-approved batches; safety ALL (community guidelines for approval + report flow + admin queue warn/mute/ban; teen-safe defaults audit; word filter; appeals); English now, i18n-ready (all text in translation files); graceful offline (single-player + downloaded lessons offline via PWA, sync later, clear offline messages); design system pass over every page (tokens exist: TV HUD palette + --fel-*), screenshot proof; uptime check + error-spike alerts via Google Cloud monitoring (no new service); backups: verify + one restore drill in the ops session.
- QUALITY, PROJECT: E2E (Playwright) on key flows in CI per PR, blocking; visual regression screenshot diffs on key screens + a frame per mode; phone-profile perf budget gate in CI (over budget fails unless owner approves a raised row); preview channel per release before main (deploy-config change: show the owner the exact change first); commit decisions log as docs/OWNER-DECISIONS.md + CLAUDE.md pointer; giant files: split when touched + size guard; full security review + fixes before launch; upgrades: security patches always (with owner OK, dependency change), majors as planned lanes after launch; releases: version tags + plain-language notes + in-app "What's new" + documented one-command rollback.
- PROCESS (owner 2026-10-20): weekly status page (shareable, phone-readable); fewer, bigger merges; a written quality bar per lane; **ASK LESS, DECIDE MORE: use the recommended option for reversible choices; only ask on irreversible ones.**
