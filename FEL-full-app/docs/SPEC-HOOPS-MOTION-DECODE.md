# Hoops motion — reference decode (phase 2c of the 13-phase pass, 2026-09-25)

Owner, 2026-09-24: *"upgrade all movement, dribbling, defensive slide, layup and variants animations, active hands; get the
character to feel aware of the scene, the ball, the rim, the defensive pressure."* And: *"the jumpshot looks ugly too."*

This is the bar every hoops action is measured against, in the MAP's format. Each catalogue action has one row:
- **(a) the real mechanics**, with a 2K-feel note beside them;
- **(b) what the code does today**;
- **(c) the gap**;
- **(d) the measurable target** the later gates use.

The catalogue is `scripts/probes/_hoops-motion-probe.mts` (`CATALOGUE`, 81 actions), plus the 5 supplemental windows the
baseline anchors on a mode log line. The 5 actions the game has no code path for have rows too.

## How to read a row

- **(a)** comes from the owner's reels and from named coaching or biomechanics references. Every row cites at least one.
  - A reel cite reads `R10@22.1–22.3`: reel 10, seconds 22.1 to 22.3, **read from frames in this pass** (see "Sources").
  - A web cite reads `[W3]`. The reference list says for each one whether the page itself was read or only a search snippet.
- **(b)** was **read** in this worktree at `a37a90ce`, by symbol. A `file:line` is given only where a grep confirmed it at
  `a37a90ce`; lines drift, so find the symbol.
  - `cap` = the `bball_mc_*` capture that actually plays. `installOpponentMotion` (`CharacterLibrary.ts`, `HERO_CAPTURE`)
    swaps the authored name through `variantFor` (`opponentMotion.ts`).
- **(c)** numbers are **measured**, from the audited phase-1 baseline at 71ea8f3 (`hoopsmotion/p1-baseline/BASELINE.md`,
  tables E and F). They describe the gap; they are not what a gate compares with. Phase 1's 382 recordings were taken
  before the audit fixed the clock and only re-measured after it. On the 16 actions they share with `base2`, the audit's
  17 live re-recordings on the fixed clock, at the same tip, read pops 7.81 → 12.06. A gate's delta is taken against `base2`
  (`hoopsmotion/p2/BASE2.md`), taken at one tip on the repaired clock.
  Anything else is marked:
  - *read* = a clip-key fact or a code fact;
  - *MAP* = the MAP's static trace at 2ccf696;
  - *plan* = a number the phase plan carries from phase 1's audit;
  - *2b* = measured by phase 2b (`hoopsmotion/p2/fps/`). 2b found CMU subject 78 is a true 120-fps capture, not 60 as the
    plan assumed, so the plan's speed ratios for the 78 clips were twice the real ones; the rows below carry the 2b numbers.
- **(d)** is written in a form the probe can measure: the phase-1 metrics plus the 14 phase-2a metrics (ball path per
  frame, dribble contact, hip-yaw seam, cadence, finishing side, guide-hand gap, wrist flex, torso overlap, AI-ARMS, look
  error, shield, catch reach, celebration travel, pacing).
  - Where the phase plan already states the gate, the row repeats it.
  - Where the decode adds or tightens a number, the row says *(decode)*.
- **2K:** notes describe how the move *reads* in a 2K-style game, from 2K's own published feature descriptions ([W5], [W6],
  [W4]). Nothing is copied from 2K: no clip, name or timing is theirs.

## Sources

### The owner's reels

- **Where they were read.** `git -C ~/rork-final-evolution-lab show 13cb4c2:SourceVideos/Instagram/basketball/<file>`,
  into the session scratchpad only. Never into `public/`, never committed.
- **How the frames were grabbed.** `ffmpeg` is not on this machine, so frames came from a scratch Swift/AVFoundation tool
  (`scratchpad/grab/grab.swift`, AVAssetImageGenerator with zero tolerance, so each tile is the exact frame at its label).
  - The sheets were 1 fps overviews of every reel, then 0.2 s, 0.1 s and 30 fps (0.033 s) crops over the windows below.
  - Reel 04 (VP9) decoded at 0.5 s steps.
  - All reels are 30 fps (read from the track). Durations read from the files: R04 13.60 s, R05 3.30 s, R06 8.73 s,
    R08 31.76 s. The plan's table uses the metadata's durations.
- **The earlier draft was corrected in this pass.** Its reel cites were re-checked frame by frame. Wrong ones were
  replaced:
  - R10@21.4–22.6 is a pull-up jumper, not a layup.
  - There is no behind-the-back at R10@3.2–4.4 or R10@38.0–38.8. Those are crossovers and between-the-legs.
  - R10@25.4–25.8 is a drive to a contested shot, not a ball-less sprint.
  - R09@7.0–7.8 is a lob pass, not a hesitation.
  - R07@2.0–3.4 is a loose-ball grab and a push dribble, not a slide.
  - R07@16.4–17.4 is a self-lob, not a shuffle.
  - R07's catch is overhead, not at the chest.
  - R09@20.0 is camera blur, not a crouch celebration.

| reel | length | what the frames show (the windows this decode cites) |
|---|---|---|
| R01 dunk session | 46.0 s | 38.3–38.9 a sprint with the ball carried one-handed at the hip; 39.3 a low gather; 39.6 take-off with the ball cocked; 39.8–40.0 the knee up; 40.3 a one-hand flush; 40.5 the landing |
| R02 running one-hand dunk (slow motion) | 15.2 s | 1.2–1.4 the ball swept low; 1.6–2.4 the ball at the chest in two hands, the knee up; 2.6–3.6 the ball taken to the right side and cocked back beside the head; 3.8–4.2 the arm extends; 4.4–4.6 the flush; 4.8–5.6 the hand stays at the rim; 6.2–7.4 the landing and a jog away; 8.6–9.0 a child bends at the hips and picks the ball off the floor |
| R03 self alley-oop | 21.9 s | 18.8–19.2 a two-hand toss from above the head; 19.4–19.8 the ball in the air; 19.8–20.4 the thrower sprints after it; 20.8–21.2 the jump, the catch and the flush |
| R04 reverse over 3 people | 13.6 s | 1.5–2.5 the approach, a low penultimate (2.0), the take-off with the arms swinging up (2.5); 3.0 the reverse jam; 3.5–4.0 the landing; 7.0–7.5 a hug with a teammate; 9.0–9.5 a chest-to-chest hug; 11.5–12.0 hands clasped high; 12.5–13.5 the arms spread and swung up to the crowd |
| R05 compilation | 3.3 s | 0.0–0.3 the approach dribble; 0.4–0.5 a low gather; 0.7–1.1 the rise with the ball at the chest; 1.2 the ball cocked; 1.3–1.5 a one-hand flush; 1.8 the landing |
| R06 practice | 8.7 s | 0.4–0.5 a loaded two-hand gather at the hip; 0.6 the take-off with the ball high; 0.9–1.0 the ball passed under the legs in the air; 1.1–1.2 the flush; 1.5–1.9 the landing into a knee-high dribble; 5.0 a toss off the glass; 5.2–5.3 a two-foot crouch; 5.5 a two-hand catch in the air; 5.7–5.9 the swing back overhead; 6.0 a one-hand flush; 6.3 the landing; 7.0–7.6 the ball wrapped **behind the hips** from the right side to the left, hip-to-chest height, then dribbled (7.9) |
| R07 game with shuffles | 33.0 s | 0.0–0.5 a rebound jostle, a backside into a man; 2.3–2.5 a loose ball grabbed with two hands to the chest; 2.6–4.0 a push dribble, the ball at knee height out ahead, the head up; 4.3–4.6 a low crossover at speed; 4.8–5.0 a defender reaches in; 5.1–5.5 the ball kept in the hand away from him; 5.6–6.2 a drive at speed, the ball ahead; 11.5–11.7 a two-hand gather at the hip; 11.8–12.1 a long penultimate stride beside a defender; 12.2–12.8 body contact; 12.9–13.3 the rise, the ball overhead in one hand; 13.3–14.8 a one-hand dunk and hang; 14.9–16.2 the defenders under the rim, arms up; 16.3–16.9 a self-lob; 17.8–18.1 an overhead two-hand catch in the air; 19.0–19.6 a between-the-legs dunk; 24.6–25.6 a lateral shuffle dribble, the ball at knee height at his side; 27.2–27.8 a two-hand pick-up to the shoulder |
| R08 casual game | 31.8 s | 1.6–3.0 a drive against a sliding defender; 4.0–4.4 a one-hand dunk, the ball cocked from the take-off; 5.4–6.0 a set jumper, release at the top at 5.8 under a raised hand, the follow-through held at 6.0; 7.5–8.2 a low crossover and drive; 8.3–9.0 side-on to the defender, the ball low on the far side while he reaches; 9.1–10.3 a pull-up (the gather 9.1–9.4, the **dip** to the waist 9.5–9.6, the set above the head 9.7, the release at the top 9.9, the follow-through held 10.0–10.1 under a raised hand, the landing 10.2–10.3); 13.4–14.0 a jumper released at the top over a jumping contest; 15.6–17.0 a defender low with his arms out, sliding with a dribbler; 19.0–19.2 a jumper over a contest; 21.0–21.6 a drive into body contact; 28.8–29.5 a rebound: the jump, the ball taken at the top (29.2), landed at the chin (29.4); 30.0–30.4 a two-hand overhead put-back |
| R09 slams + tricks | 51.3 s | 7.3–7.7 a two-hand pick-up at the chest and a two-hand lob pass; 9.0–9.4 the lob caught and dunked one-handed; 18.4–18.8 a ball-less run to the lob, the hands up; 19.0 the catch in two hands at the waist, the knee up; 21.4–22.0 the arms up to the ball, a two-hand catch at the chest in the air, a two-hand flush; 33.9–34.4 a low dribble, the hand on top at knee height; 34.4–34.8 a low crossover at shin height; 39.2–39.4 both hands reaching, the catch at the waist; 47.0–48.8 the ball taken off a helper's head; 49.2–49.4 the helper's hands on his head |
| R10 full-court game | 59.7 s | 0.0–0.6 a set jumper (the set point at the forehead 0.0, the release at the top 0.2, the goose-neck held 0.2–0.45, the landing 0.5–0.6) while the closing defender jumps straight up with both arms, late; 3.2–3.4 a low crossover between the feet at shin height; 4.0–4.2 a low crossover back; 4.2–4.6 the drive with the ball in the far hand, the body between ball and defender; 4.6–5.8 a drive and a one-hand finish at the rim; 6.4–6.6 a defender jumps with one arm straight up; 8.3–8.8 an on-ball defender, arms out, sliding with the handler; 8.6–9.0 his reach at the ball; 9.0–9.3 the ball knocked loose; 9.4–9.8 he takes it and dribbles away; 10.2–10.8 a walk dribble, upright, the ball at knee-to-hip; 10.8–11.2 the ball at the chest, then a one-arm push pass with a step; 14.4–14.9 a crossover in front at knee height; 14.9–15.2 the drive past a defender who opens his hip and turns; 19.5–20.0 the ball held on the far hip, side-on to a defender whose hand is up; 20.3–20.8 the rise and a one-hand release at full extension; 21.4–22.6 a **pull-up** (the low dribble 21.4–21.7, the gather 21.7–21.8, the **dip** 21.9–22.0, the set point above the forehead while rising 22.1–22.2, the release above the head 22.3, the wrist goose-necked and the guide hand dropping away 22.3–22.6); 23.8–24.5 a square set jumper, released at the top 24.1–24.2, the arm held through the landing; 25.4–26.2 a drive to a one-hand shot at 26.1–26.2 over a vertical contest (the defender's arm fully extended 25.9–26.2); 26.6–27.4 two ball-less players run to the boards; 28.6–29.0 a jump to the ball, then both hands on it above the rim; 30.0–30.4 the ball held low at the hip in two hands; 36.9–37.0, 37.5, 37.9–38.0 and 38.2–38.4 between-the-legs dribbles (the ball under the lifted lead leg at knee height); 38.7–38.8 and 39.7–40.0 low crossovers; 40.0–40.2 the drive past with a long low step; 43.4–44.2 a low gather, a one-hand dunk and hang, the landing; 44.3–44.7 a shot from above the head against a straight-up arm; 49.4–50.2 a size-up in a wide split stance, the ball at knee height; 50.3–50.4 between the legs; 50.5–52.2 the drive and the finish; 55.2–56.4 a long lob, a sprint under it, the catch and flush; 57.2–57.8 a low two-hand catch, the rise, a one-hand release against a straight-up arm |

**Tagged movements from `video_metadata.json`.** These were used only to choose where to scrub. Nothing from the metadata
goes on a card, and its contest claim for reel 04 is not confirmed and not used.

| reel | tagged | confirmed in frames |
|---|---|---|
| R01 | vertical, two-hand reverse, one-hand alley-oop, one-hand front, two-hand front, one-hand reverse dunks | a one-hand front dunk (38.3–40.5); the rest not scrubbed |
| R02 | running approach, explosive jump, one-hand slam | all (1.2–5.6) |
| R03 | self alley-oop, running dunk, one-hand dunk | the self alley-oop (18.8–21.2) |
| R04 | dribble approach, vertical jump, mid-air rotation, reverse dunk, chest-bump celebration | the approach, jump and reverse (1.5–4.0); the "chest bump" is a chest-to-chest hug (9.0–9.5); the rotation is not readable at 0.5 s steps |
| R05 | running dunk, standing dunk, attempt | a running dunk (0.0–1.8) |
| R06 | dribbling, jump shot, drive, two-hand dunk, reverse dunk, behind-the-back pass, windmill | dribbling (1.5–1.9); a between-the-legs dunk (0.6–1.2); a behind-the-back wrap (7.0–7.6); a self-lob swing dunk (5.0–6.3); jump shot and reverse not in the windows scrubbed |
| R07 | lateral shuffle dribble, drive, slam, layup, running to the basket, defensive stance | shuffle dribble (24.6–25.6), drive (5.6–6.2), slam (13.3–14.8); no layup or on-ball stance in the windows scrubbed |
| R08 | dribbling, passing, running, jumping, shooting, dunking | all but a pass: 29.0–30.4 is a put-back, not a pass |
| R09 | one-hand, two-hand slams, ball tricks, running approach | all |
| R10 | behind-the-back, crossover, aggressive drive, euro step, layup, dunk, mid-range, jump shot, defensive stance, sprinting, quick change of direction | all but **behind-the-back and euro step**: neither was found in any window scrubbed (only crossovers and between-the-legs) |

### Named references

All were read 2026-09-25. Quotes are theirs and short. "Page read" means the page itself was fetched and the quote
checked. "Search snippet" means the page refused the fetch (403 or a CAPTCHA, which was not bypassed), so the words come
from the search engine's summary.

- **[W1]** Coach's Clipboard, *Shooting* — page read. The set point "as high as your forehead, or even higher"; the elbow
  "underneath the ball"; the non-shooting hand "should actually come off the ball just before you release it"; "Release your
  shot on the upward force of the jump, not on the way down"; the wrist "bent forward, in a 'goose neck' fashion"; "Hold the
  release after your shot until the ball hits the rim"; "keep balanced, not falling or drifting sideways or backwards";
  "Keep your eye on the target"; the feet "about shoulder width apart", the shooting-side foot "slightly forward".
  https://www.coachesclipboard.net/Shooting.html
- **[W2]** Frontiers in Psychology 2021, *Mechanics of the Jump Shot: The "Dip" Increases the Accuracy of Elite Basketball
  Shooters* — page read. The dip is "lowering the ball below a player's shooting pocket", and it gave "approximately a 7–9%
  increase in accuracy" for high-school and university shooters.
  https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.658102/full
- **[W3]** G. Ney, *The Fundamentals of Shooting the Basketball* (a Bowling Green Parks PDF) — the text was extracted from
  the PDF. "the shot must be timed so that fingertip release occurs just prior to the highest point of the jump".
  https://www.bgparks.org/wp-content/uploads/2021/12/8-The-Fundamentals-of-Shooting-the-Basketball.pdf
- **[W4]** NBA2KLab, *How to shoot* (2K27) — page read. "a typical pure window is only 15 to 20 milliseconds wide"; "Match
  the shot's tempo and the window grows". https://www.nba2klab.com/how-to-shoot
- **[W5]** 2K, *NBA 2K27 gameplay* — page read.
  - "a real-time visual tick mark that moves in direct sync with your physical Pro Stick movement";
  - "aggressive hands-up defense to suffocate a shooter's air space";
  - "ALL dunk attempts must now be manually timed using the Dunk Meter";
  - the engine "can automatically adjust your finisher's shooting hand in mid-air";
  - it "monitors a defender's real-time momentum";
  - "a quick one-step cutoff" or "a larger, lunging step";
  - the passer "will dynamically look off the target using head tracking".

  https://nba.2k.com/2k27/features/gameplay/
- **[W6]** 2K, the NBA 2K26 ProPLAY motion-engine release — page read. "Dynamic lower-body pose matching adjusts the exact
  positioning of players' legs and feet on the fly and ensures they launch, plant and cut realistically."
  https://newsroom.2k.com/news/nbar-2k26-debuts-new-gen-9-gameplay-improvements-including-an-all-new-dynamic-motion-engine-powered-by-proplay
- **[W7]** Coach's Clipboard, *Dribbling* — page read.
  - "keep your head up and eyes forward";
  - crossover: "by bouncing the ball in front of you across to the other side";
  - behind the back: "dribble the ball once behind you and pick up the dribble with the opposite hand";
  - between the legs: "one bounce through the legs to the other hand";
  - hesitation / rocker: "putting your inside foot forward and 'rocking' backward onto your outside foot";
  - spin: "reverse pivot (spin) on your front foot, and pull the ball hard and quickly around your body";
  - in-and-out: "roll your dribbling hand over the top of the ball, and bring it sharply back".

  https://www.coachesclipboard.net/Dribbling.html
- **[W8]** Basketball Army, *Spin move* — page read. The pivot foot "must remain planted"; "Practice spinning 180 degrees";
  "keep your dribble low and close"; "Use your non-dribbling hand to shield the ball from the defender".
  https://basketballarmy.com/how-to-do-a-spin-move-basketball/
- **[W9]** HoopsKing, *Float/hang hesitation* — page read. "a brief suspension, leaving the defender uncertain"; "Begin in a
  low stance"; "Elevate your body as you float"; then "swiftly attack the basket".
  https://hoopsking.com/blogs/default-blog/master-the-float-hang-hesitation-basketball-dribble-move-now
- **[W10]** Basketball For Coaches, *How to do a layup* — page read. The first step with the "outside" foot, then "the inside
  foot"; "driving the shooting-side knee up into the air as they jump off their opposite foot"; "bring the ball up above
  their head, extend their arm, and then flick their wrist". https://www.basketballforcoaches.com/how-to-do-a-layup/
- **[W11]** Basketball For Coaches, *Euro step* — page read. "pick up the ball with both hands while your left foot is on
  the floor"; the first step "with your right foot toward the baseline side"; then "plant your left foot in the opposite
  direction"; "use your off arm to shield"; "Jump off your left foot". https://www.basketballforcoaches.com/euro-step/
- **[W12]** HoopsKing, *How to shoot a floater* — page read. "near-vertical jump"; released "just before reaching peak
  height"; "an upward flick of your wrist"; an arc "over taller defenders' fingers".
  https://hoopsking.com/blogs/default-blog/perfecting-the-art-how-to-shoot-a-floater-in-basketball
- **[W13]** Coach's Clipboard, *Hook shot* — page read. "your back to the basket"; "Lift the knee on your shooting side and
  jump off your pivot foot"; the arm "in an ear-to-ear direction"; "Keep your non-shooting hand on the ball until the
  release". https://www.coachesclipboard.net/HookShotWissel.html
- **[W14]** HoopsKing, *What is a step back* — page read. "plant your outside foot"; "Push back explosively off your pivot
  foot"; "one large step backward and a smaller step for elevation"; the weight "shifts smoothly to your back foot".
  https://hoopsking.com/blogs/default-blog/what-is-a-step-back-in-basketball-a-guide-to-the-move
- **[W15]** Basketball For Coaches, *Post up* — page read. "sealing your defender with contact"; the jump hook "Catch, Turn,
  Score … your off-hand will protect the basketball". https://www.basketballforcoaches.com/post-up-basketball/
- **[W16]** Basketball Goal Store, *Defensive slide* — page read. "drives off the instep of the foot that is the opposite the
  direction the offensive player is heading while extending the other foot"; "your head stays in a level plane"; feet
  "slightly wider than shoulder width apart"; "Hands remain up and out". https://basketballgoalstore.com/blog/defensive-slide/
- **[W17]** Coach's Clipboard, *Z-drill and lane slides* — page read. "Stay low." "Stay wide." "Hands should be away from body
  (wider than knees), with palms facing up toward the ball." "When retreating, drop the outside foot backward and push off
  with the front foot." https://www.coachesclipboard.net/DefenseZDrill.html
- **[W18]** Breakthrough Basketball, *Debunking the "don't cross your feet" myth* — search snippet (403). Crossing one foot
  over the other while sliding means "their base is completely compromised"; push off the back foot; a beaten defender
  uses a crossover step to recover. https://www.breakthroughbasketball.com/defense/debunking-cross-feet
- **[W19]** Hoop Student, *Closeout* — page read. Sprint "with long steps", then "short choppy steps upon completely closing
  the space"; "at least one hand up, typically slightly above the shoulders"; "knees bent, their hips low"; "jump straight
  into the air (or perhaps slightly away) to contest". https://hoopstudent.com/basketball-closeout/
- **[W20]** Hoop Mentality, *Explaining defensive closeouts* — page read. The sprint, then "short, quick chop steps" at
  "roughly 8 feet from the shooter"; "One hand goes high on the shooter's strong-hand side … The other hand stays near the
  hip". https://hoopmentality.com/blogs/basketball/explaining-defensive-closeouts-a-coachs-complete-guide
- **[W21]** Coach's Clipboard, *Rebounding* — page read. "pivot facing the basket, bend over, get wide with your feet and arms
  out, and put your backside into the offensive player"; "Keep your eye on the flight of the ball, and go get it!"; "jumping
  high with both arms extended, grab it strongly with both hands, and 'rip it down'"; "bring the ball under your chin with
  elbows out". https://www.coachesclipboard.net/Rebounding.html
- **[W22]** Passing fundamentals — search snippet (Scholar Basketball Academy and the UGA open basketball text, both 403).
  - The chest pass steps "out with one foot towards your target" with "your thumbs pointing to the floor".
  - The bounce pass arrives at "the chest height of your teammate".
  - The overhead pass starts "directly behind your head with your elbows bent right next to each ear" and, "stepping
    forward", ends with the wrists snapped.

  https://scholarbasketball.com/basics-of-chest-pass-bounce-pass-and-overhead-pass/ ,
  https://open.online.uga.edu/basketball/chapter/2-fundamentals-passing/
- **[W23]** Hoop Student, *Catching* — page read. The receiver should "extend their arms out towards the passer"; "utilize
  both hands at the same time"; the hands "relaxed and not tense"; this helps "absorb the force of the ball". A search
  snippet adds fingers "pointed up and spread … thumbs almost touching". https://hoopstudent.com/basketball-catching/
- **[W24]** Rockstar Academy, *Block* — page read. "jumping straight up without leaning forward or reaching over the
  shooter"; "Wait until the shooter has fully committed to their shot before you take off"; "land safely on your feet".
  https://www.rockstaracademy.com/blog/block-basketball
- **[W25]** Rockstar Academy, *Steals* — page read. The poke steal is "quickly tapping the ball away with the fingertips
  during a dribble"; the strip from below is "swiping upward when the ball is held low".
  https://www.rockstaracademy.com/blog/defensive-strategies-to-get-more-steal-in-basketball
- **[W26]** Walking cadence (the Tudor-Locke / CADENCE-Adults work) — search snippet (the PMC pages sit behind a CAPTCHA,
  not bypassed). Normal walking cadence is 96–138 steps/min for women and 81–135 steps/min for men.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5387837/
- **[W27]** IJSPT, *The Effect of Running Speed on Cadence and Running Kinetics* — page read. 169 steps/min at 2.68 m/s up
  to 178 steps/min at 3.83 m/s (Table 1).
  https://ijspt.scholasticahq.com/article/140544-the-effect-of-running-speed-on-cadence-and-running-kinetics
- **[W28]** IJSHS, *Kinematic characteristics of high step frequency sprinters and long step length sprinters at top speed*
  — the abstract was read. Step frequency 3.99–5.19 Hz, step length 1.93–2.33 m at top speed.
  https://www.jstage.jst.go.jp/article/ijshs/14/0/14_201515/_article
- **[W29]** Wikipedia, *Fadeaway* — page read. "a jump shot taken while jumping backwards, away from the basket"; a
  "one-legged version". https://en.wikipedia.org/wiki/Fadeaway
- **[W30]** Teach Hoops, *Drop step drill* — page read. The drop is made with "the bottom foot"; "swing their bottom foot
  wide around the defender … to seal properly"; "Use one power dribble and keep the ball tight to the body"; the finish is "a
  layup or short hook". https://teachhoops.com/youth-basketball-drop-step-drill-footwork/
- **[W31]** Level Up Basketball, *Up and under* — page read. "A shot fake is useless if you don't look at the rim"; "keep his
  pivot foot on the floor through the entire move"; on the step-through, "move the ball in a sweeping 'U' shape below your
  knees". https://www.levelupbasket.com/basketball-drills/finishing-drills/up-under
- **[W32]** Wikipedia, *Twelve basic principles of animation* — page read, for the principle names only: follow-through and
  overlapping action; slow in and slow out. https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation
- **[DUNK]** `docs/SPEC-DUNK-MOTION-DECODE.md`: what every dunk body does and what each named dunk is. The game-dunk rows
  inherit it.

### Code

All read at `a37a90ce`, by symbol:
- the modes: `modes/OneVOneMode.ts` (1v1), `modes/ThreeVThreeMode.ts` (3v3), `modes/ThreePointMode.ts` (3PT),
  `modes/CourtCarnivalMode.ts` and `modes/carnivalEvents.ts`;
- core: `core/BasketballCore.ts`, `core/HoopsMoves.ts`, `core/HoopsOffball.ts`, `core/DriveFlight.ts`,
  `core/StrideMatch.ts`, `core/CourtMovement.ts`, `core/HoopsPosture.ts`, `core/DunkPosture.ts`, `core/DunkCuts.ts`;
- anim: `anim/PostureLayer.ts`, `anim/authored/basketball.ts`, `anim/authored/mocapOpponents.ts`, `anim/ballCarry.ts`,
  `anim/basketballTree.ts`, `anim/poseClip.ts`, `anim/SecondaryMotion.ts`, `anim/dunkHand.ts`;
- scripts: `scripts/mocap/opponent-clips.json`.

---

## 0. What every hoops body does (the shared bar)

These rules apply to every row below. They are the owner's four awareness must-haves (look, shield, active hands,
rim-aware finish) plus the feet, hands, handedness and seam rules the plan already carries.

| rule | real mechanics · 2K feel | code today (read) | target (measured by) |
|---|---|---|---|
| **Look** | A dribbler keeps "your head up and eyes forward" [W7] (R10@10.2–10.8 the walk dribble; R07@2.6–4.0 the push dribble, head up). A shooter keeps "your eye on the target" [W1]. A defender watches the handler (R08@15.6–17.0; R10@8.3–8.8). A shot fake sells with the eyes on the rim [W31]. 2K: the passer "will dynamically look off the target using head tracking" [W5]. | The Posture layer owns the eyes. `PostureLayer.apply` turns the head toward `feed.eyes`, capped at `HEAD_YAW_CAP` 60° (`DunkPosture.ts:97`) × the pose's `eyes` weight (0.5–1, `HoopsPosture.P`). The target never changes by situation: RIM on offence and the ball on defence (1v1 `feedFor`, `OneVOneMode.ts:869–870`; 3v3 `eyes: def ? ballWorld() : RIM`), and RIM always in 3PT (`ThreePointMode.ts:875`). The SecondaryMotion head-look is stood down (`setLookTarget(() => null)`, `OneVOneMode.ts:863`). No hoops clip keys the head. | Head yaw/pitch error to the situational target ≤ 20° p90 over offence and defence windows. Head speed ≤ 400°/s when the target switches. The targets: a handler looks at the rim on the approach, the nearest defender at the gap, and the ball on a loose dribble; off-ball bodies look at the ball; defenders look at the handler's hips, not the ball (phase 9). |
| **Shield under pressure** | With a defender in reach, the ball goes to the far hand, low, with the body between it and the defender (R10@4.2–4.6; R10@19.5–20.0 side-on with the ball on the far hip; R08@8.3–9.0 the ball low on the far side while he reaches; R07@5.1–5.5 the ball kept away from the reach). "Use your non-dribbling hand to shield the ball" [W8]; the post hook's "off-hand will protect the basketball" [W15]. 2K: the handler visibly protects the rock. | `HoopsPosture.P.protect` (weight 0.85, `HoopsPosture.ts:37`) is a pose chosen when a defender is inside `PROTECT_RANGE` and speed is low (`:145`). The ball's side is the carry's toggle (`ballCarry.switchHand`, `:230–236`), which ignores where the defender is. | On pressured frames (defender ≤ 1.6 m), the ball is on the side away from the defender ≥ 85% of the time; an off-arm bar (forearm between ball and defender) ≥ 60%; the hips ≥ 5 cm lower than unpressured (phase 9). |
| **Active hands on defence** | The hands are never at the sides. On the ball: arms out, wide, palms up (R08@15.6–17.0; R10@8.3–8.8; [W17] "Hands should be away from body (wider than knees)"). On a closeout: "at least one hand up, typically slightly above the shoulders" [W19], "on the shooter's strong-hand side" [W20]. A contest is a straight-up arm (R10@25.9–26.2, R10@44.3–44.7, R10@57.8, R08@5.8). A poke taps the ball "during a dribble" [W25] (R10@8.6–9.3). 2K: "aggressive hands-up defense" [W5]. | `bball_hand_up` is a static rig-Right hand at 2.02 m with a small sway (`buildHandUp`, `basketball.ts:372`). `bball_steal_reach` thrusts the rig-Right hand about 0.38 m in 0.15 s (`buildStealReach`, `:400`). `bball_closeout` holds a static rig-Right hand at 2.05 m (`buildCloseout`, `:644`). Every AI body is the Meshy `Body.001`, whose skin barely weights the hands: summed weights RightHand 13 and LeftHand 10, against the hero's 1796 and 1800 (*plan*, [AI-ARMS]). | The contest hand ≥ +0.20 m over the head at the shooter's release, drawn, hero and AI. The steal hand within 0.10 m of the ball before it comes free. On on-ball slide frames, the hand-check forearm points toward the handler's hip ≥ 50% of the time. On-ball stance hands wider than the knees ≥ 70% of frames *(decode)*. The AI's drawn hand ≤ 0.05 m off its bone (phases 5 and 10). |
| **Rim-aware finish** | The take-off foot, the finishing hand and the finish type come from where the rim and the defender are. The shooting-side knee drives up off the opposite foot [W10]. The ball goes to the hand away from the defender and rises at full extension (R10@19.5–20.8). Contact comes before the rise, and the ball is taken up one-handed after it (R07@12.2–13.3). 2K: the engine "can automatically adjust your finisher's shooting hand in mid-air" [W5]. | `pickLayupSide` / `pickHookSide` / `reverseSide` reason in the root's +x (MAP V:1v1 N1), and the rig draws mirrored, so the inside hand finishes. Six right-hand finish key sets lift the rig-**Left** knee at the take-off key (*read*: `HOOK_KEYS`, `FINGER_ROLL_KEYS`, `MIKAN_KEYS`, `SCOOP_KEYS`, `SPIN_LAYUP_KEYS`, `HANG_LAYUP_KEYS`; LeftUpLeg −62° to −80° against a rig-Right release). The floater lifts the Right (the correct side). | The hand away from the nearest defender on ≥ 90% of contested finishes. The knee on the finishing-hand side lifts, with the take-off from the other foot, 100%. The finish type agrees with the table in §5 on ≥ 90% (phases 6 and 10). |
| **Feet** | Planted feet do not slide; a runner launches, plants and cuts (R07@11.8–12.1 the long penultimate; R10@40.0–40.2 the long low step past). 2K: players "launch, plant and cut realistically" [W6]. | 16 of 26 captures are CMU subject 78, a true 120-fps capture (*2b*; the plan's 1.55–4.0× real assumed 60 fps). At `a37a90ce` its loops played 0.79–1.37× real through hand-set durations, and the strides were one number per kind, tuned on them (`HOOPS_STRIDE_CAPTURE`: run 3.6, slide 2.0, walk 0.72, jog 2.8). Phase 2b plays the loops at their real span (1.00–1.01×) and derives the table per state from the clip each state plays (run 4.57, jog 3.87, walk 0.97, slide 2.40, right slide 1.70, *2b*). AI speed is a unit wish × a constant with no acceleration: `.scale(3.6)` on the 1v1 rival (`OneVOneMode.ts:1455`), `.scale(3.8)` on the 3v3 foes (`ThreeVThreeMode.ts:1473`), and 4.2 on 3v3 mates (`:1411`). Only 1v1 mounts `FootPlant` (grep: no other mode). | Planted slide p90 ≤ 3 cm and ≤ 3 skating frames per window on every loop. AI root acceleration p99 ≤ 34 m/s² (base ≈ 216). Cadence within ±15% of §1 (phases 3 and 5). |
| **Hands move** | Wrists cock, snap and give: on a shot (R10@22.3–22.6 the goose-neck [W1]), on a catch ("absorb the force of the ball" [W23]), on a dribble (R09@33.9–34.4 the hand on top of the ball). | `poseClip.ts` `ARM_BONES` is Arm and ForeArm only (`:77`), so no authored clip keys a Hand bone. `WristLayer` and `LimbDrag` are constructed only in `DunkMode` (`:1014–1015`). Both hand bones hold one rotation in 381 of 382 windows (*plan*). | Both hand bones move on every action with the ball (0 frozen windows). Wrist flex ≥ 45° through a release (phases 3 and 7). |
| **Right-handed on screen** | The owner's rule: shots, layups, handles and the carry on the athlete's right, on every body. | Every attach is rig `RightHand` (`OneVOneMode.ts:799/1573/2558/2664`, `giveBallTo` `ThreeVThreeMode.ts:497`, `ThreePointMode.ts:384`). That draws on the athlete's left (*plan*): 16% of held frames and 1.2% of dribble frames are drawn right outside the dunks. | Hero ball drawn right ≥ 95% of held and of dribble frames; every AI carrier the same; deliberate off-hand moves listed and excluded (phase 3). |
| **Seams** | Nothing snaps; a body carries its velocity through a change of action (follow-through and overlapping action; slow in and slow out [W32]). | One-shot captures start at a baked hip yaw (*plan*: jumpshot −46 → +48°, layup gather −33 → +75°, spin +88 → −110°) and fade in over 3–6 frames. `freezeAtEnd` parks the authored clip after a capture has played (MAP S1). | Hip-yaw seam ≤ 15° in one frame at any hand-over; the ball path ≤ 0.15 m per frame while held; 0 frames with two clips at full weight (phase 3). |

**Weight class** (LEDGER §4 "Weight class (S1)", scoped here as the plan asks).
- **What S1 means.** `SPEC-HOOPS-DEPTH-DECODE.md` S1 says FEL "has no WEIGHT class (guard vs big stop the same)". It is
  body mass feeding the acceleration model, not a different clip set.
- **The scope** *(decode proposal, nothing measured yet)*. Three classes scale `CourtMovement`'s accel 26 and decel 34
  m/s² (`CourtMovement.ts:85/87`): guard ×1.0, wing ×0.85, big ×0.7.
- **What the probe measures.** Root acceleration p99 and the stop distance from 4.2 m/s (v²/2a):
  - guard ≤ 34 m/s² and about 0.26 m;
  - big ≤ 24 m/s² and about 0.37 m.
- Nothing else in this pass depends on it.

## 1. Locomotion reference (cadence and stride)

The phase-3 and phase-5 gates say "within ±15% of the decode's reference". This table is that reference. Stride (one step)
is speed ÷ cadence.

| gait | speed | cadence | stride (one step) | source |
|---|---|---|---|---|
| walk dribble | 1.2–1.5 m/s | 1.7–2.1 steps/s | 0.65–0.8 m | walking 81–138 steps/min [W26]; R10@10.2–10.8 upright, the ball at knee-to-hip |
| jog dribble | 2.5–3.0 m/s | 2.8–2.9 steps/s | 0.9–1.05 m | 169 spm at 2.68 m/s, 170.5 at 2.98 [W27]; R07@2.6–4.0 the ball pushed ahead |
| run / drive | 3.6–4.6 m/s | 2.9–3.2 steps/s | 1.2–1.45 m | 176–178 spm at 3.58–3.83 m/s [W27], extrapolated to 4.6; R07@5.6–6.2, R01@38.3–38.9 |
| sprint (no ball) | ≥ 6 m/s | 3.8–4.5 steps/s | 1.4–1.7 m | below the elite top-speed band 3.99–5.19 Hz / 1.93–2.33 m [W28]; R10@55.3–55.8, R10@26.6–27.4 |
| slide (push step) | 1.5–3.0 m/s | 3–5 contacts/s | 0.3–0.5 m per push | a push off the instep of the trail foot while the lead foot extends, then back to width, head level [W16] [W17]; R08@15.6–17.0, R10@8.3–8.8 |
| slide → crossover run | > 2.5 m/s | run cadence | run stride | a beaten defender opens the hip and runs [W18]; R10@14.9–15.2 |
| closeout | sprint, then chop | ≥ 3 chops over the last 1.5 m (about 8 ft [W20]), each 0.2–0.35 m, hips dropping [W19] | 0.2–0.35 m | R10@0.0–0.6 (a late closeout: the defender arrives as the ball leaves and jumps straight up) |

The slide cadence band is derived from push-step length and speed; no study giving slide contacts per second was found.

**At `a37a90ce`** (*2b*; the plan's 2.17× / 2.5–2.7× / 1.77× assumed subject 78 was 60 fps, and it is 120):
- the 78_06 run capture played 1.10× real at rate 1, the 78_30 slides 1.27× / 1.37× and the backpedal 0.89×;
- `StrideMatch` clamps at `RATE_MAX` 1.85, and a 3.6 m/s AI slide ran the 2.0 m/s slide reference at rate 1.8.

Phase 2b plays every subject-78 loop at its real span (1.00–1.01× at rate 1) and re-derives `HOOPS_STRIDE_CAPTURE` per state
(slide 2.40, right slide 1.70). At `RATE_MAX` the right slide's feet would cover only 3.15 m/s, so it keeps a37a90ce's ceiling
through its own cap (2.34× real, 3.98 m/s). A 3.6 m/s slide to the right runs at rate 2.12, inside that cap, and a 4.2 m/s one
is capped. These bands are what the regenerated clips are checked against.

---

## 2. The jumpshot, in full (the owner: "the jumpshot looks ugly too")

The whole shot, beat by beat. The rows in §3 point here. The reel's two clearest jumpers are R10@21.4–22.6 (a pull-up) and
R08@9.1–10.3 (a pull-up with a visible dip); the set jumpers are R10@0.0–0.6 and R10@23.8–24.5.

| beat | real mechanics · 2K feel | code today (read) | the defect (measured unless marked) | target |
|---|---|---|---|---|
| **Dip** | The ball drops below the shooting pocket and rises in one motion (R08@9.5–9.6 the ball at the waist in two hands, then up; R10@21.9–22.0; on a catch the catch is the dip, R10@57.2–57.4). The dip gave "approximately a 7–9% increase in accuracy" [W2]. 2K: the tick mark rides the stick's tempo [W5], and tempo decides the green window [W4]. | Set: `bball_pullup_gather` → cap `bball_mc_pullup_gather` held at its end, then `meAnimTree.hold('jumpshot', { speedRatio: syncedShotSpeed(…) })` (`OneVOneMode.ts:2451`; 3v3 `:2154`). | The gather → rise fade drops the ball 0.44 m and snaps the hips 55° in 0.08 s (MAP). In 3PT the fade drops the ball 0.58–0.64 m in 0.08 s and the hips go 0–9° → −46° (MAP). | One continuous ball path from the catch or pick-up to the release: ≤ 0.12 m per frame, with a single low point (no second descent after the dip); hip-yaw seam ≤ 15° in one frame. |
| **Set point** | "as high as your forehead, or even higher"; the elbow "underneath the ball" [W1] (R10@0.0 at the forehead; R10@22.1–22.2 above the forehead while rising; R08@9.7 above the head). | The capture's hands start low and spread: the right hand at 0.84 m and the hands 0.51–0.57 m apart until clip t 0.25 (MAP). | The ball hand peaks at 1.24–1.41 m against a head at 1.41–1.76 m; 20 of 20 hero jumpers release below the head (*plan*); hand over head −0.11 m (set), −0.24 m (pull-up). | The ball ≥ +0.10 m over the head at the release. The ball at or above eye height when the feet leave the floor *(decode)*. The shooting upper arm within 25° of the sagittal plane at the set *(decode)*. |
| **Rise and release** | "Release your shot on the upward force of the jump, not on the way down" [W1]; "fingertip release occurs just prior to the highest point of the jump" [W3]. A vertical jump, square (R10@24.0–24.2; R08@5.8; R08@9.9; R08@13.8, each released at the top). 2K: a "15 to 20 milliseconds" pure window [W4]. | `releaseFrameOf(…, RELEASE_FRAME_01)` sets the release frame; the root rides `riseHop` over `riseSec + 0.32` to `JUMPER_HOP_APEX` 0.30 m (`OneVOneMode.ts:270/2448`). The jumpshot hold loops, so a late release wraps to frame 0 (MAP S9). | The release is +98 ms after the feet apex on average (median +117; 3PT +267) (*plan*). A late release restarts the set in one frame: 12 pops, Hips 5.5k°/s (*plan*, live re-recording). The feet clear 0.24 m (1v1 set), 0.08 m (3PT) and 0.02–0.05 m (the rival). | Release −60…+20 ms of the feet apex in ≥ 80% of hero set, pull-up, step-back and 3v3 set jumpers. [W3] and the reels support the band, and the reels are 30 fps (±33 ms), so it is not tightened. 0 wraps back to the set. Feet ≥ 0.20 m on a set jumper and ≥ 0.12 m on a 3PT rhythm shot. |
| **Guide hand off** | The non-shooting hand "should actually come off the ball just before you release it" [W1] (R10@22.3–22.6: the guide hand drops away as the shooting arm extends). | The guide hand is the capture's LeftHand IK target, with no per-frame relation to the ball. | Not measured in phase 1 (the 2a metric is new). | Guide hand within 0.12 m of the ball from the set to 50 ms before the release, then ≥ 0.08 m off within 50 ms after it. |
| **Wrist snap and hold** | The wrist "bent forward, in a 'goose neck' fashion"; "Hold the release after your shot until the ball hits the rim" [W1] (R10@0.2–0.45 held; R10@24.2–24.5 the arm up through the landing; R08@6.0 and R08@10.0–10.1 held). | No authored hoops clip keys a Hand bone (`ARM_BONES`, *read*); `WristLayer` exists only in `DunkMode`. | Both hand bones motionless in 381 of 382 windows (*plan*); wrist flex 0°. | Wrist flex ≥ 45° through the release (cocked before, snapped after). The follow-through pose is held until the ball reaches the rim or for 0.6 s, in 100% of shots. The hand never rises again after the release. |
| **Frozen hands** (the capture's defect) | Nothing holds still through a release (follow-through and overlapping action [W32]). | `opponent-clips.json` `bball_mc_jumpshot` has `extend { from01: 0.42, peak01: 0.78 }` with no `release01` (*read*, json line 58). So the extend holds to the clip's end, and `gen-opponent-clips.mts` writes 4 identical hand keys from 0.75 to 0.90 s (*plan*, V:clips C3). | The hands are frozen for the last 0.15 s of every captured jumper. | 0 runs of identical consecutive hand keys in the regenerated `bball_mc_jumpshot`, and hand speed > 0 on every frame of the last 0.15 s. |
| **The 0.51 m follow-through jump** (the capture's defect) | The follow-through starts from the release pose; the arm does not move on its own. | `bball_mc_follow_through` has `extend { from01: 0, peak01: 0.08, release01: 0.42 }` (*read*, json line 92). The right hand moves 1.89 → 2.14 m high in the first 0.05 s key (MAP). | About 0.51 m in one key (≈10 m/s), on every perfect or good follow-through, hero and rival (MAP). | The follow-through's first key matches the release pose within 0.05 m, and the hand/ball path is ≤ 0.12 m per frame across the release → follow-through seam. |
| **Hips and stance** | The feet "about shoulder width apart", the shooting-side foot "slightly forward"; stay "balanced, not falling or drifting" [W1] (R10@23.8–24.5 square and vertical). | The capture's hips run −46° → +48° (*plan*). `bball_land_absorb` fires on feet-down (`OneVOneMode.ts:997`), and its first key is loaded with "the hands still high" (knees 46°, *read* `buildLandAbsorb`). The hands re-rise 0.54 m after a follow-through that has already come down (MAP). | 94° of hip twist through the shot. The landing cuts the follow-through. | Hips yaw travel ≤ 25° from the rise to the landing. The landing within 0.15 m of the take-off spot on a set jumper *(decode)*. The follow-through is not cut by the landing. |
| **Look** | "Keep your eye on the target" [W1]. | The Posture layer aims the eyes at RIM on offence, capped at 60° × the `eyes` weight (§0). | Not measured in phase 1 (the 2a metric is new). | Head error to the rim ≤ 20° p90 from the set to the release. |
| **The pull-up gather** | The last dribble is gathered in stride, the dip rides the stop, and the rise follows at once (R10@21.7–22.1: gather to dip to set in about 0.4 s; R08@9.1–9.7). | `bball_mc_pullup_gather` is held at its end for the plan's gather time (MAP). | A dead stop of 0.27 s with the body turning 60–90° to the rim during it (*plan*); turn −53° mean (measured). The rival's hands sit at 1.02 and 1.04 m through the shot, and he never jumps (0.03 m). | Gather ≤ 0.20 s with root speed ≥ 0.5 m/s into the rise *(decode)*. The rival's feet ≥ 0.2 m, and his release comes after his ball hand passes his head. |

---

## 3. Jumpers (7 catalogue actions + `ai_3v3_mate_shot`)

Shared (a): §2. 2K: the tick mark rides the stick [W5]; tempo decides the window [W4].

Shared (b): the `OneVOneMode` / `ThreeVThreeMode` shot path:
1. a gather beat;
2. `hold('jumpshot')`;
3. `followThroughFor(quality)` (`BasketballCore.ts:551`): the capture if perfect or good, an authored 4-key pose if early
   or late;
4. `bball_land_absorb`;
5. `bball_score_celebrate` on a make.

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_jumper_set` | A standing jumper: the set at the forehead, released at the top, the goose-neck held. | A set gather, then `hold('jumpshot')`; the hop to 0.30 m. | Release +96.8 ms after the feet apex; hand over head −0.11 m; 4.2 pops (19 pops / 7 severe when the late-release wrap fires, *plan*). | §2 in full: release −60…+20 ms in ≥ 80%; ball ≥ +0.10 m over the head; wrist flex ≥ 45°; 0 wraps; hips ≤ 25°; ≤ 4 pops, 0 severe. | R10@0.0–0.6 · R10@23.8–24.5 · [W1] [W3] |
| `hero_1v1_pullup` | The last dribble gathered, the dip, the set above the forehead while rising, the release at the top. | Cap `pullup_gather` held at its end, then the jumper. | Release +160 ms; 5.8 pops; 32.4 skates; hand over head −0.24 m; turn −53°. | Gather ≤ 0.20 s with root speed ≥ 0.5 m/s into the rise; release −60…+20 ms; ball ≥ +0.10 m; slide p90 ≤ 3 cm; ≤ 4 pops. | R10@21.4–22.6 · R08@9.1–10.3 · [W1] [W2] |
| `hero_1v1_fade` | "jumping backwards, away from the basket"; a one-legged version exists [W29]. Released at the top while drifting. | `bball_fadeaway` (authored); `FINISH_CLIP.fadeaway` is `{ right: 'bball_fadeaway', left: 'bball_fadeaway' }` (`HoopsMoves.ts:150`), so there is no mirror. | The fade does not fade: 1% of the travel is sideways (0.01); 27.8 locked-elbow frames; release +60 ms. | Hips ≥ 0.25 m away from the defender in the air. Release −60…+40 ms of the apex *(decode: +40 because the fade releases at the top of a drifting jump)*. A real `_left` mirror. Locked-elbow frames ≤ 5. | [W29] · [W1] |
| `hero_1v1_stepback` | "plant your outside foot", "Push back explosively off your pivot foot", "one large step backward and a smaller step for elevation", the weight to the back foot [W14]. | `bball_stepback_gather` (authored, 4 keys / 0.46 s, whose push-off key is a forward stride, MAP) at `STEPBACK_HOP_SPEED` 3.6 m/s (`BasketballCore.ts:163`), then the jumper. | The right foot jumps 0.29–0.47 m in one frame at +217 ms in 5 of 5 (*plan*); 21.4 pops, 4.8 severe; slide max 28.2 cm; release +103 ms. | The foot moves ≤ 0.10 m per frame through the step. One backward step ≥ 0.6 m, then a set step ≤ 0.3 m *(decode)*. Release −60…+20 ms. ≤ 4 pops, 0 severe. | [W14] (no step-back found in the reels) |
| `hero_3v3_jumper_set` | As `hero_1v1_jumper_set`. | The 3v3 shot path (`hold('jumpshot')`, `ThreeVThreeMode.ts:2154`). The set holds the ball in `mc_defend_stance` for 0.42 s at the check (*plan*, 4 of 4). | 13.2 pops, 1.5 severe. The ball goes overhead, then drops 0.45 m before the release (MAP). The `shooting` flag never clears after a mate's make (*plan*). | The §2 targets. 0 frames of `bball_shoot_jumper` while a mate shoots. The check stance is not the shot's start (gather ≤ 0.20 s). | R10@23.8–24.5 · [W1] |
| `ai_1v1_jumper` | The rival shoots like a player: gather, hop, release at the top, follow-through. 2K: the AI's shot reads like yours. | `releaseRival` calls `releaseBall(ball)` **before** `foeAnimTree.beat('jumpshot')` (`OneVOneMode.ts:2055/2058`), so the ball leaves before the arm moves. There is no hop. | Feet 0.03 m; hand over head −0.36 m; drawn right 1.00 (rig Left); 33.2 locked-elbow frames; 10.2 pops. | Feet ≥ 0.20 m. The release comes after the ball hand passes the head. A jumper gather as the tell, not a dunk crouch. The §2 timing band. ≤ 4 pops. | R08@5.4–6.0 · R08@13.4–14.0 · [W3] |
| `ai_3v3_jumper` | As above, on the 3v3 driver. | `opponentPossession` → the tell beat by `tellPlan` (`dunk_charge_gather`, `FINISH_CLIP.layup[side]` or `'jumpshot'`, `ThreeVThreeMode.ts:3230`) → the release. | 1 attempt only: feet 0.02 m; slide p90 14.0 cm; 27 skates. The driver's `speedMps` is 0, so the stride rate floors (*plan*). | As `ai_1v1_jumper`; slide p90 ≤ 3 cm; ≥ 5 attempts recorded. | R08@19.0–19.2 · [W1] |
| `ai_3v3_mate_shot` (no code path in the catalogue) | A mate catches, sets and shoots, or finishes a lob (R09@21.4–22.0 the catch and two-hand flush; R10@57.2–57.8 the catch low, rise and release). | `teammateShoots` fires only when `Vector3.Distance(root, RIM) < 3.5` (a 3-D distance: with the rim 3.05 m up, that is ≤ 1.72 m planar) and `Math.random() < 0.01` per frame (`ThreeVThreeMode.ts:1440`), or on a lob. | Never recorded (0 of 81). | FOUND with ≥ 3 attempts. The planar range. Gather ≥ 0.15 s before the rise, and the release ≥ 0.4 s after the catch *(decode)*. The §2 timing band. | R10@57.2–57.8 · R09@21.4–22.0 · [W1] |

## 4. 3PT (4)

Shared (a): a rhythm set shot off a pick-up (R10@0.0–0.6; R10@44.3–44.5 a deep shot released from above the head).
2K: the rhythm is the tempo [W4].

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_3pt_rack_shot` | Take the ball off the rack with a reach, then dip, rise, release at the top and hold. | `player.animator.play('jumpshot', { speedRatio: SHOT_CLIP_SPEED })` with `SHOT_CLIP_SPEED` 1.5 (`ThreePointMode.ts:303/475`), out of an `idle_stand` set. The rack ball lerps to the hand over `PICK_SEC` 0.24 (`:185`). The chest carry is 3PT's own `carryApply` (`:307`). | Plays at ≈1.95× real (*plan*). `idle_stand` stays at full weight under the shot (24 + 36 frames, *plan*). Release +233 ms; feet 0.08 m; 38.4 locked-elbow frames. The pick-up warps 0.15 m with a 20% size pop (MAP). | 0 frames with two clips at full weight; the clip ≤ 1.1× real; feet ≥ 0.12 m; release −60…+20 ms; ball ≥ +0.10 m over the head. The pick-up: the hand reaches the ball before it moves, and the ball moves ≤ 0.10 m per frame. | R10@0.0–0.6 · R10@44.3–44.5 · [W1] [W4] |
| `hero_3pt_money_ball` | The same shot; only the stakes differ (the show is phase 12). | The same path; a make plays `SPORT_CLIP.scoreCelebrate` (`ThreePointMode.ts:583`). | Release +317 ms; 51.7 locked-elbow frames; 13.3 pops, 2.0 severe. The celebration's arms drop 0.5–0.8 m in one frame into the next gather (*plan*). | As the rack shot; celebration-to-gather hand drop ≤ 0.12 m per frame; ≥ 0.4 m of hand travel in the celebration. | R10@0.0–0.6 · R04@12.5–13.5 · [W1] |
| `hero_3pt_rack_jog` | A jog between racks, the ball at the chest, facing the way you go, the feet planted (§1 jog: 2.8–2.9 steps/s). | `MOVE_SEC` 0.85 (`ThreePointMode.ts:132`) over the rack chord with a smoothstep; `'run'` → cap `bball_mc_run` at a fixed rate; `carryApply` two-hand chest IK. | Slide p90 10.6 cm, 16.7 skates, 2.67 severe. It runs in place 0.85 s at rack 1 and teleports 11.6 m in the final (MAP). | Slide p90 ≤ 3 cm; cadence within ±15% of §1 at the actual speed; the run starts facing the way it goes; 0 root teleports. | §1 · [W27] |
| `ai_3pt_react` | A sideline rival reacts to his number: hands on the head (R09@49.2–49.4), the arms swung up (R04@12.5–13.5). | `f.score >= 16 ? SPORT_CLIP.scoreCelebrate : 'bball_contact_react'` (`ThreePointMode.ts:981`). | The "bad round" reaction is a bump flinch: 0 pops, thoracic still 1.00, hand over head −0.13 m. | A score reaction, not `contact_react`: ≥ 0.4 m of hand travel; 0 `contact_react` on the sideline bodies; head toward the standings ≤ 20° p90. | R09@49.2–49.4 · R04@12.5–13.5 |

## 5. Layups, floaters and hooks (5 catalogue + 2 supplemental)

Shared (a), from [W10] and the frames:
- the pick-up on the outside foot, then the inside foot;
- "driving the shooting-side knee up into the air as they jump off their opposite foot";
- the ball "up above their head", the arm extended, the wrist flicked.

In the frames: R10@4.6–5.8 a drive with a take-off at 5.2 and the ball overhead at 5.4; R07@11.5–13.3 the gather, the long
penultimate stride, contact, and the ball taken up one-handed; R10@19.5–20.8 shielded on the far hip, then released at full
extension. 2K: the layup engine adjusts the hand in mid-air [W5].

Shared (b): `startFinish` (`OneVOneMode.ts:2455`, 3v3 `:2157`) → `FINISH_CLIP[style][side]` held at its end and paced to
the release key; the ball attaches to the side hand directly (MAP S7).

Shared (c), measured:
- the ball is 0.2–0.63 m below the head at the release on every finger roll, floater, hook, scoop, post hook and 3v3 layup
  (*plan*);
- 14 of 61 hero finishes freeze for 800 ms after the release (*plan*);
- six right-hand finish key sets lift the wrong knee (§0 Rim-aware).

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_layup` | The knee on the finishing-hand side up, off the opposite foot; the ball extended to the rim. | `FINISH_CLIP.layup[side]` → cap `bball_mc_layup_gather(_left)`. The `extend` override `{ from01: 0.2, peak01: 0.46 }` has no `release01` (*read*, json lines 321/401), so it holds the arm at 2.12 m through the landing. | 19.5 pops, 4.25 severe, 35.2 locked-elbow frames; release +158 ms; drawn right 0.28; slide p90 9.54 cm. Airtime 0.80 s against a physical 0.48 s (MAP). | The knee on the finishing-hand side lifts 100%. The ball ≥ +0.10 m over the head at the release. Release −100…+50 ms of the feet apex. The arm comes down with the body (0 frozen follow-throughs). ≤ 5 pops, severe ≤ 0.2. | R10@4.6–5.8 · R07@11.5–13.3 · [W10] |
| `hero_1v1_floater` | One foot, a "near-vertical jump", released "just before reaching peak height", "an upward flick of your wrist", a high arc [W12]. | `FLOATER_KEYS` (authored, 5 keys / 0.7 s, `basketball.ts:139`), right knee up (*read*). | Release +76.6 ms (after the apex); hand over head +0.13 m; 18.4 locked-elbow frames; 7.6 pops. | Release −150…−50 ms of the feet apex. Ball ≥ +0.10 m over the head. The arc's apex ≥ 1.3 m above the release point *(decode)*. Locked-elbow frames ≤ 5. ≤ 5 pops. | [W12] · R10@20.3–20.8 (a one-hand release at full extension near the top) |
| `hero_3v3_layup` | As `hero_1v1_layup`. | 3v3 `startFinish`. In 3 of 7 the ball is released on the gather's first frame (*plan*). | Release −50 ms mean (the first-frame releases); hand over head −0.09 m; 12.1 pops. | 0 releases on the gather's first frame; release −100…+50 ms; ball ≥ +0.10 m; within 10% of 1v1 on pops, slide p90 and severe. | R10@4.6–5.8 · [W10] |
| `ai_1v1_layup` | The rival's layup jumps. | `releaseRival(ctx, 'layup')`: the ball leaves at the gather beat, always the right-side clip, no hop (MAP). | Feet 0.04 m (10 of 10 never leave the floor, *plan*); released from the hip at 0.79–1.16 m (*plan*); 17.0 pops. | AI feet ≥ 0.25 m at the release; ball ≥ +0.10 m over the head; the side from one visual-side helper; ≤ 5 pops. | R10@4.6–5.8 · [W10] |
| `ai_3v3_layup` | As above, on the 3v3 driver. | The driver's tell → `FINISH_CLIP.layup[side]` beat (`ThreeVThreeMode.ts:3230`). | Feet 0.04 m; hand over head −0.12 m; slide max 23.8 cm. | As `ai_1v1_layup`; slide p90 ≤ 3 cm. | R10@50.5–52.2 · [W10] |
| `hero_1v1_drive_finish` (supp.) | The whole drive: the last dribble gathered, the penultimate step long and low, the take-off, the finish (R07@11.5–13.3; R10@40.0–40.2 the long low step past). Euro: the pick-up on the left foot, a step right "toward the baseline side", then "plant your left foot in the opposite direction", "Jump off your left foot" [W11]. | `startFootwork` (`OneVOneMode.ts:2516`) → `bball_euro_step(_left)` / `bball_hop_step` / `bball_step_through`, then `startFinish`. `EURO_KEYS`: 4 keys / 0.48 s, hips −14° / +10° / +14° (*read*). | Release +178 ms; 19 skates. The euro has no steps: the root slides 43–63% sideways under a still body (*plan*). | Euro: two steps, each moving a foot ≥ 0.4 m sideways, with the planted slide ≤ 3 cm. The penultimate step ≥ 1.15× the previous stride, with the hips ≥ 5 cm lower *(decode)*. Release −100…+50 ms. | R07@11.5–13.3 · R10@40.0–40.2 · [W11] (no euro step found in the reels) |
| `hero_3v3_drive_finish` (supp.) | As above. | 3v3 `startFootwork` (`:2211`) / `startFinish`. | Release +43 ms; slide p90 8.24 cm; 17.1 skates. | As the 1v1 window; within 10% of 1v1. | R10@14.4–15.2 · [W11] |

**The rim/defender table.** Phase 10's finish choice is graded against it. From [W10] [W12] [W13] [W5] and the frames:

| where the rim and the defender are | the finish | take-off / hand |
|---|---|---|
| open lane, at speed | layup / power finish | opposite foot, finishing-side knee up (R10@4.6–5.8) |
| defender on the inside hip | outside-hand layup, the ball on the far hip until the rise | the hand away from him (R10@19.5–20.8) |
| defender in front, 2.2–3.4 m out | floater, released before the apex [W12] | a near-vertical one-foot jump |
| defender on the take-off side, inside 2 m | hook, shoulder-on, the off hand on the ball until the release [W13] | the pivot foot; the shooting-side knee up |
| defender beaten on a fake | up-and-under: the pivot foot down, the ball swept low [W31] | the step foot plants before the release |
| defender straight up at the rim | scoop / finger roll under the hand, or a hang | opposite foot, the hand away |
| contact in the air | the ball goes to the far hand mid-air [W5] (R07@12.2–13.3: contact, then the ball up in one hand) | hand change ≤ 0.15 m per frame |

## 6. Post moves (5)

Shared (a): "sealing your defender with contact"; the hook "Catch, Turn, Score", the off-hand protecting the ball [W15];
a wide, low base (the stance rules in [W21] and [W17] apply). The reels show no post-up; the nearest is R08@8.3–9.0
(side-on, the ball low on the far side against a reach). 2K: a post-up reads as leverage, not a stance loop.

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_post_up` | Backing down: short power dribbles, a wide base, a lean into the defender, the off arm sealing [W15]. | `hold('bball_post_up')` (`buildPostUp`, `basketball.ts:417`: the seal arm with the elbow high, the forearm back into his chest). The carry keeps bouncing with no posting guard (MAP). | 10.2 pops, 1.38 severe; slide p90 12.1 cm. The two bodies draw inside each other at the 0.76 m standoff (*plan*). | Base ≥ 1.2× shoulder width; trunk lean 10–25° toward the defender; hips ≥ 8 cm lower than the dribble idle; slide p90 ≤ 3 cm; torso overlap ≤ 2% of frames. | [W15] · R08@8.3–9.0 |
| `hero_1v1_post_hook` | "your back to the basket"; "Lift the knee on your shooting side and jump off your pivot foot"; the arm "ear-to-ear"; the off hand on the ball "until the release" [W13]. Shoulder-on: about 70–90° to the rim line. | `HOOK_KEYS` (5 keys / 0.72 s, `basketball.ts:449`). The take-off key lifts rig LeftUpLeg −70° for a rig-Right release (*read*): the opposite knee. | Release +146 ms; hand over head −0.05 m; 16.2 wrong-way elbow frames; 2.6 severe; turn 165°. | Shoulders ≥ 70° to the rim line at the release. The shooting-side knee up. Ball ≥ +0.10 m over the head. The off hand within 0.12 m of the ball until 50 ms before the release. Wrong-way elbow frames ≤ 1. | [W13] |
| `hero_1v1_dropstep` | The bottom foot swings "wide around the defender … to seal", "one power dribble", then "a layup or short hook" [W30]. | `DROP_STEP_KEYS`: hips 0 → −70 → −130° in 0.34 s (`basketball.ts:764`, *read*). | A leg snap at ≈8000°/s (*plan*): 27.2 pops, 5.2 severe, 42.8 whips; turn 171°. | Turn 90–135° once, with the pivot foot's slide ≤ 3 cm. The hips' fastest frame ≤ 600°/s *(decode)*. One power dribble (a floor contact) before the finish. ≤ 5 pops, severe ≤ 0.2. | [W30] |
| `hero_1v1_shimmy_fade` | A shoulder shimmy, then a fade away from the man, released at the top while leaning back [W29]. | The shimmy is `bball_hesi` (`OneVOneMode.ts:1534`), then `bball_fadeaway`. | Release +157 ms; 14.4 pops, 2.0 severe; 21 locked-elbow frames; turn 109°. The shimmy is the hesi capture. | Its own shimmy clip: shoulders ±15° at ≥ 2 Hz for ≥ 0.3 s *(decode)*. The fade's hips ≥ 0.25 m away in the air. Release −60…+40 ms. Ball ≥ +0.10 m over the head. ≤ 4 pops. | [W29] · [W15] |
| `hero_1v1_up_and_under` | A shot fake sold with the eyes on the rim, then the pivot foot kept "on the floor through the entire move", and the ball swept "in a sweeping 'U' shape below your knees" [W31]. | `bball_pump_fake` → cap `bball_mc_pump_fake` (0.7 s in a 0.5 s slot, *plan*) → `UP_UNDER_KEYS` (7 keys / 0.85 s, `basketball.ts:588`). | The fake drops the ball into a live dribble (MAP S20); 46.4 wrong-way elbow frames; release +250 ms; 15.8 pops. | The ball stays in the hands through the fake (0 dribbles). The pivot foot's slide ≤ 3 cm through the step-through. The ball's low point below the knees during the sweep *(decode)*. The step foot planted ≥ 80 ms before the release. Pump fake ≤ 1.15× real. Wrong-way elbow frames ≤ 1. ≤ 5 pops. | [W31] · [W15] |

## 7. Game dunks (4)

Shared (a): [DUNK] §1 in full. The frames:
- R02@1.2–5.6, the whole flight in slow motion: the ball at the chest with the knee up, cocked beside the head, extended,
  flushed, the hand left at the rim;
- R07@11.5–14.8, a game dunk through contact;
- R01@38.3–40.5, the ball carried one-handed on the sprint, a low gather, a one-hand flush;
- R04@1.5–4.0, the low penultimate and the arms swinging up;
- R08@4.0–4.4, the ball cocked from the take-off.

2K: every dunk is metered, "manually timed using the Dunk Meter" [W5].

Shared (b):
- **1v1.** `checkDriveDunk` (`BasketballCore.ts:1042`) → `startDunk` (`OneVOneMode.ts:2117`). A standing dunk beats
  `dunk_charge_gather` first (`:2208`). The game dunks do use the contest's flush: `startFlush` (`:1184`; 3v3 `:896`),
  `dunkHandPass` into the dunking hand, and `rightHandDunks`.
- **The rim reach** is mounted on both 1v1 bodies (`:875–876`) and only on the 3v3 player (`ThreeVThreeMode.ts:659`).
- **DunkMode only** (grep, tests aside): `DunkSpin`, `spinBody`, `LimbDrag`, `WristLayer` and `hingeArmApply`.
  `arcHeight` is used by DunkMode and DunkDuelMode.

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_dunk` | The contest's built dunk on a drive: the gather, the carry, the push 1-2, the top at the rim, the flush with the hand on top, then the hang or the landing. | `startDunk`, picked by `pickHoopsDunk`. The dribble loop fades straight into the air clip (MAP S22). | A stiff board, legs straight and together (*plan*). 25.2 pops, 7.75 severe, 41.2 whips, 89.8 locked-elbow frames, 51 wrong-way elbow frames. One hand 0.10–0.23 m from the ring; 9 of 9 were DOUBLE CLUTCH (*plan*). | Per dunk: ≤ 5 pops, ≤ 3 whips, ≤ 1 severe, ≤ 35 locked-elbow frames, 0 wrong-way elbow frames. The ball ≤ 0.2 m from the ring's centre. Hand on top ≥ 50%. The flush hand drawn right 100%. ≥ 5 dunk types recorded. | [DUNK] · R02@1.2–5.6 · R07@11.5–14.8 |
| `hero_3v3_dunk` | As above; the reverse turns through the flight (R04@2.5–3.0). | 3v3 `startDunk` (`ThreeVThreeMode.ts:1893`). There is no `DunkSpin` in 3v3, and `dunk_360_spin` keys no hips yaw (MAP), so the 360, PAUSIN', 360 WINDMILL and LOST & FOUND never turn. | 11.2 pops, 2.0 severe, 43.8 locked-elbow frames; drawn right 0.96. The alley-oop's root stays at y 0 (MAP). | As 1v1. The 360 family turns 330–390° (`[DUNK-CUE] spin landed`). The alley-oop's feet ≥ 0.6 m. The transfers move the ball, with ball-far frames ≤ 2. | [DUNK] · R04@1.5–4.0 |
| `ai_1v1_dunk` | The rival dunks like the player (R01@38.3–40.5). | `foeDunk` (`OneVOneMode.ts:3248`) with `dunkHandPass`; the picked dunk held at its end, then `dunk_land_crouch`. No hang, trick or celebration (MAP). | 1 attempt: 22 pops, 7 severe, 35 whips, 24 wrong-way elbow frames. | As the hero's; ≥ 5 attempts recorded. | [DUNK] · R01@38.3–40.5 |
| `ai_3v3_dunk` | As above, on the 3v3 driver (R05@0.0–1.8: approach, gather, rise, a one-hand flush, landing). | `driverDunk` (`ThreeVThreeMode.ts:2881`); no rim reach on the AI. | The POWER SLAM never reaches the rim: the hand gets to 2.24–2.8 m, and the ball is thrown in from 0.34–0.89 m off the ring (*plan*). Drawn right 0.39. | AI hand ≥ 3.0 m at the flush; the ball ≤ 0.2 m from the ring's centre; the flush hand drawn right 100%; ≤ 5 pops. | [DUNK] · R05@0.0–1.8 |

## 8. Handles and drives (12)

Shared (a):
- the ball crosses hand to hand at the move's crossing point: low in front on a crossover, under the lead leg between the
  legs, around the hips behind the back;
- the head stays up [W7].

In the frames:
- crossovers: R10@3.2–3.4 between the feet at shin height; R10@14.4–14.9; R10@39.7–40.0; R07@4.3–4.6; R09@34.4–34.8;
- between the legs: R10@37.9–38.4 and R10@50.3–50.4;
- behind the back: R06@7.0–7.6, a wrap behind the hips.

2K: the map is relative to the ball hand, the move moves the ball, and ankle-breakers read the defender's "real-time
momentum" [W5].

Shared (b): the L-stick crossover is where `switchHand()` fires. It resets the bounce `phase = 0` and flips the side
(`ballCarry.ts:230–236`, *read*), a ≈0.52 m teleport (*plan*). The R-stick moves go through `doMove` (`OneVOneMode.ts:2931`)
→ `moveClip` (`HandleSystem.ts:116`), with the carry IK still writing the ball arm (MAP S4).

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_cross` | The ball bounced "in front of you across to the other side" [W7], low: at shin height, between the feet (R10@3.2–3.4) or at knee height (R10@14.4–14.9). The body goes with it. | `moveClip('crossover')` → cap `bball_mc_crossover_*`, whose hand barely reaches the midline (+0.03 m, MAP). | The ball stays 24–28 cm to the drawn left in every attempt; 0 of 25 R-stick moves changed its side (*plan*); 6.8 pops. | The ball changes drawn side in ≥ 95% of attempts. The crossing point ≤ 0.6 m high and ≥ 0.3 m across the midline *(decode)*. Ball path ≤ 0.15 m per frame. ≤ 4 pops, 0 severe. | R10@3.2–3.4 · R10@14.4–14.9 · R07@4.3–4.6 · [W7] |
| `hero_1v1_between` | "one bounce through the legs to the other hand" [W7]. A split stance, the ball under the lifted lead leg at knee height (R10@37.9–38.4; R10@50.3–50.4 out of a wide size-up). | `bball_between_legs_*` (authored). A 0.25 m hip drop that the carry IK paints over (MAP). | The ball never goes under the legs (0 of 5, *plan*); 7.6 pops. | The ball passes between the feet (probe flag) in ≥ 90%. Hips drop ≥ 0.15 m. Side change ≥ 95%. Ball path ≤ 0.15 m per frame. | R10@37.9–38.4 · R10@49.4–50.4 · [W7] |
| `hero_1v1_behind` | "dribble the ball once behind you and pick up the dribble with the opposite hand" [W7]. The ball wraps behind the hips (R06@7.0–7.6). | `bball_behind_back_*` (authored): `_left` is anatomically wrong, and `_right` is a right-to-left wrap (MAP). | The ball stays 0.15–0.20 m in front of the hips (0 of 5 behind, *plan*); 6.4 pops. | The ball passes behind the hips in ≥ 90%; side change ≥ 95%; ball path ≤ 0.15 m per frame. | R06@7.0–7.6 · [W7] |
| `hero_1v1_spin` | "reverse pivot (spin) on your front foot, and pull the ball hard and quickly around your body" [W7]. The pivot foot "must remain planted"; 180° [W8]; up to 270° on a drive. | `SPIN_SWEEP = Math.PI * 2` over `SPIN_SEC` 0.6 on the root (`HoopsMoves.ts:462`), plus the capture's own +88 → −110° hips (MAP). Every sweep opens with an unrequested in-and-out (*plan*). | Turn 312° with no hand change; 11.0 pops, 1.2 severe; slide p90 9.7 cm, 22.2 skates. | Body turn 180–270° with a hand change. Pivot-foot slide ≤ 3 cm. The ball within 0.3 m of the hips through the turn [W8]. 0 unrequested feints. ≤ 4 pops, 0 severe. | [W7] [W8] (no spin found in the reels) |
| `hero_1v1_hesi` | The dribble pauses — "a brief suspension, leaving the defender uncertain" — the body rises ("Elevate your body as you float"), then attacks [W9]. The rocker: "inside foot forward and 'rocking' backward onto your outside foot" [W7]. | Cap `bball_mc_hesi`: the spine goes down, and the ball hand ends behind the hip (MAP). `bball_hesi` also stands in for the jab (`OneVOneMode.ts:1270`, 3v3 `:1280`), the shimmy (`:1534`, 3v3 `:1648`) and the rival's step-back (`:1839`). | No hitch (*plan*); 11.8 pops over 9 attempts. | Spine2 rises ≥ 4 cm. Root speed pauses (≤ 0.5 m/s) for ≥ 150 ms, then reaches ≥ 3 m/s within 300 ms *(decode)*. Its own clip (0 uses as the jab, shimmy or step-back). ≤ 4 pops. | [W9] [W7] (no hesitation found in the reels) |
| `hero_1v1_inout` | "roll your dribbling hand over the top of the ball, and bring it sharply back" [W7]. One hand; the ball feints across and returns. | `bball_in_and_out_*` → cap `bball_mc_feint_*`, a two-hand rip at 1.29× real (*2b*; the MAP's 2.55× assumed 60 fps). | Reads as a walking dribble; thoracic still 0.97; 6.0 pops. | One hand on the ball throughout (the off hand ≥ 0.25 m from it). The ball moves ≥ 0.2 m toward the midline and returns within 0.3 s *(decode)*. Clip ≤ 1.15× real. ≤ 4 pops. | [W7] |
| `hero_1v1_drive` | The run with the ball: pushed out ahead at knee height, the head up (R07@2.6–4.0; R07@5.6–6.2; R01@38.3–38.9 carried one-handed on the sprint). | The dribble loop `bball_mc_dribble_run` (78_06; 1.10× real at `a37a90ce`, 1.00× after 2b, *2b*; the plan's 2.17× assumed 60 fps). The carry's bounce is not locked to the stride (MAP). | Slide p90 11.5 cm; 22.2 skates; hand over head −0.23 m. | Slide p90 ≤ 3 cm; cadence within ±15% of §1's run; the dribble frequency locked to the stride; the palm within 0.08 m of the ball at every bounce top. | R07@2.6–6.2 · R01@38.3–38.9 · §1 |
| `hero_3v3_cross` | As `hero_1v1_cross`. | 3v3 `crossoverDir: wish.x >= 0 ? 'right' : 'left'` (`ThreeVThreeMode.ts:1398`); `switchHand` on the L-stick reversal. | Drawn right 0.00; 11.0 pops. | As `hero_1v1_cross`, plus a stick-sign unit test at both baskets. | R10@39.7–40.0 · [W7] |
| `ai_1v1_drive` | The rival drives like a player: acceleration, a plant, the ball ahead (R08@1.6–3.0 a drive against a sliding defender). | `AttackerBrain` wish → `foeVel = … .scale(3.6)` (`OneVOneMode.ts:1455`), no acceleration; his facing is set outright (MAP S13). | Slide p90 14.3 cm; 16.8 skates; 13.0 pops, 1.0 severe. | Root acceleration p99 ≤ 34 m/s²; slide p90 ≤ 3 cm; cadence within ±15% of §1; ≤ 4 pops. | R08@1.6–3.0 · §1 |
| `ai_1v1_cross` | As `hero_1v1_cross`, on the rival. | Cap `crossover_*` plus `switchHand()` (MAP). | The hand switch is one frame: the hand jumps 0.22–0.29 m at 9.6k°/s (*plan*); 19.0 pops, 1.4 severe. The clip names are mirrored against what is drawn (*plan*). | Ball path ≤ 0.15 m per frame; side change ≥ 95%; drawn side matches the clip name 100%; ≤ 4 pops, 0 severe. | R08@7.5–7.8 · R09@34.4–34.8 · [W7] |
| `ai_1v1_hesi` | A real hesitation [W9], or a real step-back [W14]. | The rival's "step-back" is `bball_hesi` (`OneVOneMode.ts:1839`) over a 0.96 m backward slide (MAP). | Slide p90 11.1 cm; 21.6 skates. | A step-back clip with one foot moving ≥ 0.6 m back; the hesi as `hero_1v1_hesi`; slide p90 ≤ 3 cm. | [W14] [W9] |
| `ai_3v3_drive` | As `ai_1v1_drive`. | A timed lerp plus `driveLateral`. The velocity is zeroed, so `speedMps` is 0 and the stride rate floors at `RATE_MIN` 0.55 while the root moves 2–5.4 m/s (*plan*). | Slide p90 11.6 cm; 1.8 pops (the body barely animates). | Root acceleration p99 ≤ 34 m/s²; slide p90 ≤ 3 cm; the stride rate follows the real root speed. | R10@14.9–15.2 · §1 |

## 9. Passes and catches (2 measured + 2 no-code-path)

Shared (a):
- **Passes.** The chest pass steps toward the target with the thumbs turning to the floor; the bounce pass arrives at chest
  height; the overhead pass starts behind the head with a step and a wrist snap [W22]. In the frames:
  - R10@10.8–11.2: the ball held at the chest, then a one-arm push pass with a step toward the receiver;
  - R09@7.3–7.7: a two-hand pick-up at the chest and a two-hand lob;
  - R03@18.8–19.2: a two-hand toss from above the head;
  - R06@7.0–7.6: a behind-the-back wrap.
- **The catch.** The receiver extends the arms toward the passer with both hands, relaxed, then absorbs the ball [W23]. In
  the frames: R09@21.4–21.6 the arms up, then a two-hand catch at the chest; R09@39.2–39.4 both hands reaching; R06@5.5 a
  two-hand catch in the air; R07@17.8–18.1 an overhead two-hand catch; R10@57.2 a low two-hand catch.

2K: the passer looks off the target [W5].

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_3v3_pass` | Released from the chest or overhead, with a step toward the receiver [W22] (R10@10.8–11.2). | `choosePassType` → `releaseBall(ball)` at the ball's live position (`ThreeVThreeMode.ts:1576`), then `PassFlight`. No throw clip exists (MAP). | The ball leaves from the dribble point (hand over head −0.28 m); 0.4 pops (nothing moves). | Released from ≥ 0.9 m high. A step: a foot moves ≥ 0.3 m toward the target. Both hands on the ball ≤ 100 ms before the release. The head toward the target or the look-off. | R10@10.8–11.2 · R09@7.3–7.7 · [W22] |
| `ai_3v3_catch` | The hands out to the passer, meeting the ball, then giving [W23] (R09@21.4–21.6). | `giveBallTo(id)` → `attachBallToHand(ball, …, 'RightHand')` on arrival (`ThreeVThreeMode.ts:493–497`). The receiver keeps moving at full speed during the flight (MAP). | The ball warps 0.54–0.79 m into the palm with a 4.0–5.3k°/s arm snap (*plan*); 20.6 wrong-way elbow frames; 10.0 pops, 2.4 severe. | Hand within 0.25 m of the ball 100 ms before it arrives. Ball ≤ 0.12 m per frame at the catch. 0 severe pops on the receiver's arm. The hands ≥ 0.3 m in front of the chest as the target *(decode)*. | R09@21.4–21.6 · R09@39.2–39.4 · [W23] |
| `hero_3v3_catch` (no code path) | As `ai_3v3_catch`, on me (R10@57.2 a low two-hand catch into the rise). | One `passFlight` instance (`ThreeVThreeMode.ts:276`) serves my passes only. Mates never pass back; the hero gets the ball only through the reset's `giveBallTo('me')` warp (MAP). | Never recorded (0 of 81). | FOUND with ≥ 3 attempts; the catch targets above. | R10@57.2–57.4 · R06@5.5 · [W23] |
| `ai_3v3_pass` (no code path) | A foe passes to a foe (R09@7.3–7.7 a two-hand pass off a pick-up). | The foe team is one `carrierId 'foeTeam'` token (`ThreeVThreeMode.ts:264`). | Never recorded. | FOUND with ≥ 3 attempts; the pass and catch targets above on both foe bodies. | R09@7.3–7.7 · [W22] |

## 10. Defence (22 defence actions, plus both reactions and `ai_1v1_boxout`, and 2 supplemental windows)

Shared (a):
- **Stance.** Low and wide, the weight on the balls of the feet, the chin over the knees, the hands wider than the knees
  with the palms up [W17]; the feet a little wider than the shoulders [W16]. R08@15.6–17.0; R10@8.3–8.8.
- **Slide.** A push off the instep of the trail foot while the lead foot extends, the head level [W16]. Crossing the feet
  compromises the base; a beaten defender opens up and runs [W18]. R10@14.9–15.2.
- **Closeout.** A sprint "with long steps", then "short choppy steps", one hand up [W19]; chop steps from about 8 ft, the
  high hand on the shooter's strong side [W20]. R10@0.0–0.6 is late: the jump comes after the ball has gone.
- **Contest and block.** Jump "straight up without leaning forward", after the shooter commits, then land [W24] (R10@25.9–26.2;
  R10@44.3–44.7; R10@57.8; R08@5.8).
- **Steal.** A poke taps the ball "during a dribble" [W25] (R10@8.6–9.3).

2K: the cutoff is "a quick one-step" or "a larger, lunging step"; the contest is "hands-up defense" [W5].

Shared (b):
- every AI body moves at a unit wish × a constant (3.6 m/s on the 1v1 rival, 3.8 on the 3v3 foes), with no acceleration and
  the `sprint` flag ignored (MAP);
- the defence loops are 78_30 / 78_26 / 78_24 captures, played 0.89–1.37× real at `a37a90ce` and 1.00–1.01× after 2b (*2b*;
  the plan's 1.8–2.7× assumed 60 fps);
- [AI-ARMS] hides every AI arm.

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_def_stance` | Low and wide, the chin over the knees, the hands wider than the knees, the eyes on the handler [W17] (R08@15.6–17.0). | `defend_idle` → `bball_defend_stance` → cap `bball_mc_defend_stance` (78_30); `HoopsPosture.P.defend` (lean 10, spine1 8). | Knee bend drifts 66.8° → 39–42° over a session (*plan*); slide p90 7.37 cm; 13.2 wrong-way elbow frames. | Knee bend ≥ 45° throughout, and within ±5° of the first take across 10 takes. Hands wider than the knees ≥ 70% of frames *(decode)*. Head on the handler ≤ 20° p90. Slide p90 ≤ 3 cm. | R08@15.6–17.0 · R10@8.3–8.8 · [W17] |
| `hero_1v1_def_slide` | Push off the trail foot, the lead foot extends 0.3–0.5 m, back to width, the head level [W16]; no knock-kneed cross [W18]. | `defend_slide(_right)` → cap `bball_mc_defend_slide_*` (78_30); `slideDirFor`. | Slide p90 15.4 cm; 19.4 skates; 2.2 severe. The trailing knee crosses in (*plan*). | Slide p90 ≤ 3 cm. Cadence within ±15% of §1's slide at 1.5 and 3.0 m/s. The knees never cross the midline (knee gap ≥ 0.2 m) *(decode)*. Head bob ≤ 5 cm *(decode)*. 0 severe. | R08@15.6–17.0 · R10@8.3–8.8 · [W16] |
| `hero_1v1_def_backpedal` | "When retreating, drop the outside foot backward and push off with the front foot" [W17]; the chest up, the hips low; turn and run when beaten [W18] (R10@14.9–15.2). | `carry_back` / `defend_backpedal` → cap `bball_mc_defend_backpedal` (78_24; 0.89× real at `a37a90ce`, 1.01× after 2b, *2b*). | The backpedal pitches the body onto a knee (*plan*). Slide p90 12.6 cm; 22.4 wrong-way elbow frames; 8.0 pops, 1.6 severe. | Trunk pitch within 10–30° forward on every frame *(decode)*. Slide p90 ≤ 3 cm. A beaten defender turns and runs: 0 slide frames at > 2.5 m/s. | R10@14.9–15.2 · [W17] [W18] |
| `hero_1v1_def_closeout` | Sprint, then chop the last ~8 ft (≈2.4 m) in short steps, the hips low, one hand high on the shooter's strong side [W19] [W20]. | `closeout` → `bball_closeout` (authored 0.4 s loop, a static rig-Right hand at 2.05 m, `buildCloseout`), live only while `job === 'closeout'` (MAP). | Snaps the body upright out of the backpedal (*plan*). Slide p90 14.5 cm; 22.4 skates; 2.4 severe. | ≥ 3 chop steps in the last 1.5 m (foot contacts 0.2–0.35 m apart). Hips ≥ 8 cm lower at the stop than on the run. The high hand on the shooter's shooting side. Slide p90 ≤ 3 cm. 0 severe. | [W19] [W20] · R10@0.0–0.6 |
| `hero_1v1_def_contest` | A straight-up arm in the shot lane as the ball leaves (R10@25.9–26.2; R08@5.8; R10@57.8). | `hold('bball_hand_up')` (`OneVOneMode.ts:1815`): a static hand at 2.02 m with a 0.7 s sway. | `hand_up` raises no hand: it ends −0.05 m relative to the head. 33.8 wrong-way elbow frames; thoracic still 0.88. | Contest hand ≥ +0.20 m over the head at the shooter's release, drawn. The hand on the shooter's shooting side. Wrong-way elbow frames ≤ 1. Head on the ball ≤ 20°. | R10@25.9–26.2 · R08@5.8 · [W24] |
| `hero_1v1_def_block` | Wait for the commit, a dip, a two-foot vertical jump, the hand at the ball's highest point, then a landing [W24]. | `bball_block_reach` (LOAD at t 0, the hands up at 0.25 s, 0.5 s long, `buildBlockReach` `basketball.ts:315`) plus `contact.hop('me', JUMP_VY)` on the same frame (`JUMP_VY` 3.0, `OneVOneMode.ts:269`). The clip ends before feet-down (MAP S27). | Feet 0.49 m (the hop is real), but the dip plays in the air. 11.2 pops. Slide p90 17.3 cm before the jump. No landing. | The dip's lowest hips ≥ 80 ms before the take-off. The apex within ±80 ms of the ball's closest pass. A landing after every block, with the knees bending ≥ 20° on touchdown *(decode)*. 0 steering in the air. | [W24] · R10@25.8–26.2 |
| `hero_1v1_def_steal` | A fingertip poke "during a dribble", or a strip "swiping upward when the ball is held low" [W25] (R10@8.6–9.3: the reach at the ball, then he dribbles away). | `bball_steal_reach` (rig-Right only, ≈0.38 m in 0.15 s, `buildStealReach`). A whiff is a 0.45 s stun with no clip (MAP). | The ball launches 0.15 s before the hand arrives (MAP). No left-hand steal. 2.75 pops; slide p90 7.91 cm. | The reaching hand within 0.10 m of the ball before it comes free. A left-hand mirror. Hips ≥ 5 cm lower through the reach. A whiff recovery clip. ≤ 4 pops. | R10@8.6–9.3 · R07@4.8–5.0 · [W25] |
| `hero_1v1_react` | Bumped: a stagger toward the push (R08@21.0–21.6 a drive into contact). Posterized: a hoops fall and get-up. | `bball_contact_react` (`buildContactReact`: 0.32 s, spine −18° at 0.12 s, *read*). Posterized → `SPORT_CLIP.karateKnockdown` → `karate_floor_hold` → `karate_get_up` (`OneVOneMode.ts:3310/1001`). | Stands the body up and throws the head back with no stagger (2 attempts: 10.5 pops). The fall is a fighter's. | A stagger ≥ 0.2 m toward the push on every contact event; 0 `karate_*` clips on a hoops body; `contact_react` call sites ≤ 5, each a real bump. | R08@21.0–21.6 · R07@12.2–12.8 |
| `hero_1v1_boxout` | "pivot facing the basket, bend over, get wide with your feet and arms out, and put your backside into the offensive player", then "go get it" [W21] (R07@0.0–0.5 a backside into a man). | L2 → tree `box_out` → `bball_defend_stance` (`basketballTree.ts:106`), the same clip as the on-ball stance. | L2 freezes the stance for 1.3–1.9 s (*plan*). Thoracic still 0.96; hand over head −0.29 m (the arms down); slide p90 6.62 cm. | A seal: hips within 0.5 m of the opponent, back to him ±30°, base ≥ 1.3× shoulder width, both hands ≥ shoulder height, held ≥ 0.4 s before the ball comes off, facing the rim ±30°. | [W21] · R07@0.0–0.5 |
| `hero_1v1_boxout_board` (supp.) | The seal, then the pursuit: release the man, jump with both arms extended, grab it with both hands, "rip it down", chin it [W21] (R08@28.8–29.5). | The same L2 stance. The board is `liveBoard` (`OneVOneMode.ts:3052`) with `resolvePickup`'s fixed 2.15 m reach (MAP). | 32.6 skates; slide p90 10.5 cm; the ball warped to the palm. | 0 root teleports in the window. Feet ≥ 0.3 m on the grab. Both hands on the ball, chinned within 300 ms. | R08@28.8–29.5 · [W21] |
| `ai_1v1_def_slide` | As `hero_1v1_def_slide`, on the rival. | `DefenderBrain` → `foeVel … .scale(3.6)` against the 2.0 m/s slide reference at `RATE_MAX` 1.85. | Slide p90 9.6 cm, max 20.6; 15.2 locked-elbow frames; [AI-ARMS] hides the arms. | Root acceleration p99 ≤ 34 m/s². Slide p90 ≤ 3 cm. Cadence within ±15% of §1 at 1.5, 3.0 and 4.2 m/s (a crossover run above 2.5). AI drawn hand ≤ 0.05 m off its bone. | R10@8.3–8.8 · [W16] |
| `ai_1v1_def_backpedal` | As the hero's. | The same capture on the rival; his velocity is a unit step. | 80.4 wrong-way elbow frames; slide p90 9.47 cm. | As the hero's; wrong-way elbow frames ≤ 1; acceleration p99 ≤ 34 m/s². | R10@14.9–15.2 · [W17] |
| `ai_1v1_closeout` | As the hero's. | `DefenderBrain`'s closeout job, sticky to `ARMS_LENGTH` (1.25, `BasketballCore.ts:604`) + 0.1, at the constant 3.6 m/s (MAP). | Stops dead inside the dead zone (MAP). 41.8 wrong-way elbow frames; slide max 21.8 cm. | ≥ 3 chops in the last 1.5 m. Hips ≥ 8 cm lower at the stop. A deceleration ≥ 0.4 s long *(decode)*. The high hand drawn. | [W19] [W20] · R10@0.0–0.6 |
| `ai_1v1_contest` | As the hero's. | `foeAnimTree.hold('bball_hand_up')` on the take-off (`OneVOneMode.ts:2156`) and on a late closeout (`:3219`). | The hand arrives late (the apex ≈0.16 s after the release, MAP). 20.8 wrong-way elbow frames. The drawn hand hangs at the side [AI-ARMS]. | Contest hand ≥ +0.20 m over the head at the release, drawn; wrong-way elbow frames ≤ 1. | R08@10.0–10.1 · [W24] |
| `ai_1v1_block` | As the hero's; the rim protector meets the ball near rim height. | `bball_block_reach` + `contact.hop('foe', JUMP_VY)`. `RIM_PROTECT` jumps at flight k 0.10–0.28 and "meets" at k 0.34 (`DriveFlight.ts:60`). | 96.7 wrong-way elbow frames; feet 0.49 m. The swat is decided while the hand is 0.09–0.31 m off the floor (MAP). | The apex within ±80 ms of the ball's closest pass. The hand ≥ 2.9 m at the meet on a rim protection *(decode)*. A landing after every block. Wrong-way elbow frames ≤ 1. | [W24] · R10@25.8–26.2 |
| `ai_1v1_steal` | As the hero's. | The brain rolls `aggression * 0.02` per frame inside 1.1 m (`BasketballCore.ts:767`) → `stripBall`, with no exposure read and no whiff. 3v3 has `AI_STEAL_CHANCE` 0.22 and a 1.2 s cooldown (`ThreeVThreeMode.ts:423`). | 92.8 wrong-way elbow frames. The hand is invisible [AI-ARMS]. The ball comes free before the hand (MAP). | The reaching hand within 0.10 m of the ball before it comes free. A whiff on a failed roll (the hand reaches, the ball stays). No guaranteed strip. | R10@8.6–9.3 · [W25] |
| `ai_1v1_react` | A bite is a weight shift toward the fake; an ankle-break is a stumble or a slip and a scramble up. 2K: the ankle-breaker reads the defender's momentum [W5]. | `bball_contact_react`; `ANKLE_SLIP_CLIP` settles to `karate_floor_hold` (`OneVOneMode.ts:2911`); `ANKLE_STUMBLE_CLIP` (`:2920`); `karateKnockdown` (`:2376/2750/2769`). | 49.6 wrong-way elbow frames. The slip jumps to the fighter's floor pose (MAP). | A stagger ≥ 0.2 m toward the push. A hoops slip that lands on the hip and a hand with ≤ 0.12 m per frame of root motion *(decode)*. 0 `karate_*` on a hoops body. `contact_react` call sites ≤ 5. | [W5] · R10@14.9–15.2 (the beaten defender turns) |
| `ai_1v1_boxout` | As the hero's box-out, facing the rim [W21]. | `DefenderBrain` job `'boxout'` at `boxOutSpot` (`HoopsOffball.ts:142`), which faces the man; the clip is the stance. | 39.6 wrong-way elbow frames. The target is a cloned stale spot (MAP). | The seal as the hero's, facing the rim ±30°; the target re-read every frame (≤ 0.3 m stale). | [W21] · R07@0.0–0.5 |
| `hero_3v3_def_slide` | As `hero_1v1_def_slide`. | The 3v3 tree; no `FootPlant` in 3v3 (grep). | Only 4% of the travel is sideways; slide p90 14.9 cm; 23.6 skates. | Sideways share ≥ 60% of root travel on a slide window *(decode)*; slide p90 ≤ 3 cm; within 10% of 1v1. | R08@15.6–17.0 · [W16] |
| `hero_3v3_def_contest` | As `hero_1v1_def_contest`. | `me.tree.hold('bball_hand_up')` (`ThreeVThreeMode.ts:849`). | Hand over head −0.10 m; 28.0 wrong-way elbow frames; 27.8 skates. | As 1v1's contest. | R10@44.3–44.7 · [W24] |
| `hero_3v3_def_block` | As `hero_1v1_def_block`. | `contestJump` sets `myJumpAge = 0` (`ThreeVThreeMode.ts:512–514`), but the logged "my block jump" is a 0.08–0.17 m hop (*plan*). | Feet 0.07 m. | Feet ≥ 0.35 m on every logged block jump; the dip, apex and landing targets as 1v1. | [W24] · R10@25.8–26.2 |
| `hero_3v3_def_steal` | As `hero_1v1_def_steal`. | `bball_steal_reach`. The strip direction is computed from the hero even when a mate had the ball (MAP). | 0.33 pops (nothing moves); thoracic still 0.77; slide p90 15.6 cm. | As 1v1's steal; the strip vector from the victim. | R10@8.6–9.3 · [W25] |
| `ai_3v3_closeout` | As `ai_1v1_closeout`. | `DefenderBrain` on the foes at `.scale(3.8)` (`ThreeVThreeMode.ts:1473`). | Slide p90 9.08 cm, max 18.1; thoracic still 0.17. | As `ai_1v1_closeout`. | [W19] · R10@0.0–0.6 |
| `ai_3v3_contest` | As `ai_1v1_contest`. | `wall.tree.hold('bball_hand_up')` (`ThreeVThreeMode.ts:1923`) and on a late closeout (`:2795`). | 33.4 locked-elbow frames; hand over head +0.18 m (the rig), but the drawn arm hangs [AI-ARMS]. | Drawn contest hand ≥ +0.20 m over the head; AI drawn hand ≤ 0.05 m off its bone. | R10@57.8 · [W24] |
| `ai_3v3_block` | As `ai_1v1_block`. | `bball_block_reach` with a sine root hop (0.46 m, 0.75 s, MAP); the apex ≈0.23 s after the release (MAP). | Feet 0.50 m; 6.83 pops, 1.17 severe. | The apex within ±80 ms of the ball's closest pass; a landing; 0 severe. | [W24] · R10@6.4–6.6 |
| `ai_3v3_slide` | As `ai_1v1_def_slide`. | Foes at 3.8 m/s, the same slide captures. | Slide p90 10.5 cm; 14.8 skates. | As `ai_1v1_def_slide`. | R08@15.6–17.0 · [W16] |
| `ai_3v3_help` | Help defence: a step into the lane with the hands up, then a recovery closeout (R07@14.9–16.2 the defenders at the rim, arms up). | The mates' tree plays closeout / slide / hand_up while `TeammateBrain` (no defence branch, MAP) steers them to offensive spots. | Slide p90 14.1 cm; 20.2 skates; thoracic still 0.11 (thrash). | A defence branch for mates: a help step ≥ 0.5 m toward the lane with the hands ≥ shoulder height, then a closeout that meets the chop targets *(decode)*. Slide p90 ≤ 3 cm. Clip switches ≥ 250 ms apart. | R07@14.9–16.2 · [W19] |

## 11. Rebounds and box-outs (6 catalogue + 1 no-code-path + 2 supplemental)

Shared (a):
- "Keep your eye on the flight of the ball", jump "with both arms extended, grab it strongly with both hands, and 'rip it
  down'", then chin it "with elbows out" [W21].
- The frames:
  - R08@28.8–29.5: the jump, the ball taken at the top and landed at the chin;
  - R10@28.6–29.0: both hands on the ball above the rim;
  - R07@2.3–2.5: a loose ball grabbed two-handed to the chest.

Shared (b): no rebound, tip, grab or chin clip exists. A board is `giveBall` in 1v1 (`OneVOneMode.ts:594`, a palm warp) or
`resetPossession(true)` in 3v3 after the "YOUR BOARD" / "OFFENSIVE BOARD — PUT IT BACK!" banner
(`ThreeVThreeMode.ts:2610–2615`), which teleports the body.

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_rebound` | Jump, two hands at the top, chin it, land wide [W21]. | `giveBall('me')` after `resolvePickup` (a 2.15 m static reach, MAP). | The ball warps 0.7–1.4 m into the palm (*plan*); feet 0.01 m (nobody jumps); 8.67 pops. | Feet ≥ 0.3 m off the floor at the grab. Both hands on the ball, chinned within 300 ms. Ball ≤ 0.12 m per frame at the grab. 0 root teleports. | R08@28.8–29.5 · [W21] |
| `hero_3v3_rebound` | As above; a put-back goes up from where it was secured (R08@30.0–30.4 two hands overhead into the put-back). | `resetPossession(true)` on any board by my team, even under "OFFENSIVE BOARD — PUT IT BACK!" (`ThreeVThreeMode.ts:2615`). | 2 attempts: feet 0.00 m. The board window teleports in 4 of 5 (`hero_3v3_rebound_board`, *plan*). | As 1v1; the put-back played from where the ball was secured (0 resets inside a rebound window). | R08@28.8–30.4 · [W21] |
| `ai_3v3_rebound` | As above. | The same reset. The AI rebounder glides frozen in the `layup_gather` end pose (*plan*). | The body jumps 4.3 m and the ball 5.7–6.0 m at the "grab" (*plan*); 35.2 skates; feet 0.04 m. | As above, on the AI; 0 teleports; the freeze re-checked after the `freezeAtEnd` hotfix. | R10@28.6–29.0 · [W21] |
| `ai_1v1_rebound` (no code path) | As above, on the rival. | A defensive board sends both bodies to the check: `giveBall('foe')`, then the reset (MAP). 5 of 5 `ai_1v1_rebound_board` windows teleport the root (*plan*). | Never recorded as a rebound (the anchor needs a still body). | FOUND with ≥ 3 attempts; feet ≥ 0.3 m; two hands, chinned within 300 ms; 0 teleports. | R08@28.8–29.5 · [W21] |
| `ai_1v1_boxout` | Its row is in §10. | | | | |
| `ai_3v3_boxout` | The seal facing the rim, the arms out, then the pursuit [W21] (R07@0.0–0.5). | `startBoxOut` (`ThreeVThreeMode.ts:2450`) → `boxOutSpot`, which faces the man; the clip is the stance. | Thoracic still 0.04 (a head-whip); slide p90 14.2 cm; 20.2 skates. | The seal as §10's box-out; facing the rim ±30°; slide p90 ≤ 3 cm. | [W21] · R07@0.0–0.5 |
| `ai_1v1_rebound_board` (supp.) | The rival comes down with it. | The teleport above. | 5 of 5 windows teleport (*plan*); 53.2 wrong-way elbow frames. | 0 root teleports inside a rebound window; the rebound targets. | R08@28.8–29.5 · [W21] |
| `hero_3v3_rebound_board` (supp.) | The seal, the jump and the grab. | `resetPossession(true)`. | 4 of 5 teleport (*plan*); 17.2 skates. | 0 teleports; feet ≥ 0.3 m; chinned within 300 ms. | R10@28.6–29.0 · [W21] |
| `hero_1v1_boxout_board` (supp.) | Its row is in §10. | | | | |

## 12. Idles, reactions and celebrations (6 catalogue + 1 no-code-path)

Shared (a):
- **A dribble idle.** The hand rides the top of the ball, low, with the head up [W7]: R09@33.9–34.4 the hand on top at knee
  height; R10@10.2–10.8 an upright walk dribble; R06@1.5–1.9 a knee-high dribble out of a landing.
- **A make.** An ordinary bucket gets a jog back; a big play gets a real celebration. In the frames: R04@7.0–7.5 a hug;
  R04@9.0–9.5 a chest-to-chest hug; R04@11.5–12.0 hands clasped high; R04@12.5–13.5 the arms swung up to the crowd;
  R09@49.2–49.4 the hands on the head.

2K: ordinary buckets stay quick, and big plays get the cut.

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_1v1_idle` | The ball at the hip, the dribbling hand riding it, the eyes forward [W7]. | `idle_dribble` → cap `bball_mc_dribble_idle`. The carry's hand stays at the waist while the ball bounces ankle-to-thigh (*plan*). | The palm never meets the ball at the top of the bounce (*plan*). 1.2% of hero dribble frames are drawn right (*plan*). 1.67 pops. | Palm within 0.08 m of the ball at every bounce top; ball drawn right ≥ 95%; head error to the defender or the ball ≤ 20° p90; slide p90 ≤ 3 cm. | R09@33.9–34.4 · R10@10.2–10.8 · [W7] |
| `hero_1v1_celebrate` | A jog back on a bucket. On a poster or a game winner: a chest-to-chest, the arms up (R04@9.0–9.5, R04@12.5–13.5). | `meAnimTree.beat('bball_score_celebrate')` (`OneVOneMode.ts:1025`) = `dunk_celebrate_big` → cap `dunk_mc_celebrate_big` (a crouched one-arm punch, *plan*), for `CELEBRATE_SEC` 0.8 (`HoopsPosture.ts:118`), then a reset. | 11 of 20 move the hands ≤ 0.26 m (*plan*). The reset teleports inside the window (*plan*). | Ordinary make: a jog back with ≥ 0.4 m of hand travel, and make-to-next-check within ±0.2 s of `base2`. Big play: a replay cut ≤ 2.5 s plus a celebration with ≥ 0.4 m of hand travel. 0 reset teleports inside the window. | R04@9.0–9.5 · R04@12.5–13.5 |
| `ai_1v1_idle` | The rival at the check: a live dribble, the eyes on the defender. | `dribble_idle` / `idle_stand` on the rival; his carry runs only at speed ≥ 0.3 (MAP). | Slide p90 10.7 cm; 7.0 pops, 0.8 severe (his velocity steps). | As `hero_1v1_idle`; acceleration p99 ≤ 34 m/s². | R10@10.2–10.8 · [W7] |
| `ai_1v1_react` | Its row is in §10. | | | | |
| `hero_1v1_react` | Its row is in §10. | | | | |
| `ai_1v1_celebrate` (no code path) | The rival celebrates his make (R04@7.0–7.5 a hug; R04@11.5–12.0 hands clasped high). | `celebrate: false` in the rival's posture feed (`OneVOneMode.ts:1970`); no beat on his make (MAP). | Never recorded. | FOUND with ≥ 3 attempts. ≥ 0.4 m of hand travel. No real names in any label: a grep over `DunkCuts` `CELEBRATIONS`, which today credits 'Brandon Ruffin' and 'Vince Carter' (`DunkCuts.ts:72–73`). | R04@7.0–7.5 · R04@11.5–12.0 |
| `ai_3v3_offball` | A cutter or spacer runs without the ball, the arms pumping, the hands up for a lob (R10@26.6–27.4 two ball-less runners to the boards; R10@55.3–55.8 a sprint under a lob; R09@18.4–18.8 a run to the lob, the hands up). | `run_forward` resolves to `bball_mc_drive` (`mocapOpponents.ts:314`: `replaces: 'run_forward'`), a dribbling sprint. Mates move at 4.2 m/s × multipliers with no acceleration (`ThreeVThreeMode.ts:1411`). | 5 of 5 dribble air (*plan*). Slide p90 14.0 cm; 18.2 skates; 22.6 wrong-way elbow frames. | No ball-less body plays a dribbling clip (a clip-scope test). Cadence within ±15% of §1's run and sprint. Acceleration p99 ≤ 34 m/s². Slide p90 ≤ 3 cm. | R10@26.6–27.4 · R10@55.3–55.8 · §1 |

## 13. Carnival (3)

| id | (a) real · 2K | (b) code | (c) gap (measured) | (d) target | cite |
|---|---|---|---|---|---|
| `hero_carn_slam_charge` | The gather: the ball in both hands at the hip in a loaded crouch (R06@0.4–0.5), then brought to the chest with the knee up (R02@1.6–2.4). | `slamRush` `gather()` beats `SPORT_CLIP.dunkChargeGather` with `holdEnd` (`carnivalEvents.ts:78`). The ball is a textured sphere attached to rig `RightHand` (*plan*, hotfix 1/6). | At 71ea8f3: a one-way gather looped (a snap every 0.5 s) with no ball; 10.0 pops, 4.0 severe. After the hotfix the ball draws on the left (*plan*). | The gather held without a snap (0 wraps). Ball drawn right 100%. Both hands within 0.12 m of the ball through the hold. ≤ 4 pops, 0 severe. | R06@0.4–0.5 · R02@1.6–2.4 · [DUNK] |
| `hero_carn_slam_launch` | A real dunk: the flight, the flush at the rim, a hang or the landing (R02@3.8–5.6; R05@1.2–1.8). | `SPORT_CLIP.dunkLaunchPower` beaten out of the held load, settling to idle (`carnivalEvents.ts:109`). No flight, no rim, no landing; the result is the event's roll. | A 0.12 m hop with the arms in a T (*plan*): 42.0 locked-elbow frames, 2.0 severe, feet 0.12 m. | Feet ≥ 0.6 m; the flush hand ≤ 0.2 m from the ring; ball drawn right 100%; locked-elbow frames ≤ 35; the made or missed flush matches the roll. | R02@3.8–5.6 · R05@1.2–1.8 · [DUNK] |
| `ai_carn_react` | Party-goers react to who took the event, standing on the floor: the arms swung up (R04@12.5–13.5), the hands on the head (R09@49.2–49.4). | The winner gets `SPORT_CLIP.scoreCelebrate` and the loser `SPORT_CLIP.karateHitReact` (`CourtCarnivalMode.ts:265–266/305–306`). | The loser plays a fighter's flinch. Party-goer b0 floats (feet 0.55 m). 21.8 locked-elbow frames. | 0 `karate_*` clips on a hoops body. A loser reaction with ≥ 0.3 m of hand travel (hands to the head or hips) *(decode)*. Every party-goer's feet within 0.03 m of the floor. | R04@12.5–13.5 · R09@49.2–49.4 |

---

## 14. Coverage

- **81 catalogue actions**, checked by script: every `CATALOGUE` id in `_hoops-motion-probe.mts` appears as a row id here,
  with no extras and no misses. Per family (the catalogue's own family labels):

  | family | actions | where |
  |---|---|---|
  | jumpers | 8, incl. `ai_3v3_mate_shot` | §3 |
  | 3PT | 4 | §4 |
  | layups/floaters/hooks | 5 | §5 |
  | post moves | 5 | §6 |
  | game dunks | 4 | §7 |
  | handles | 12 | §8 |
  | passes/catches | 4 | §9 |
  | defense | 22 | §10 |
  | rebounds/box-out | 7 | §11, `hero_1v1_boxout` and `ai_1v1_boxout` in §10 |
  | idles/reactions | 7 | §12, both reactions in §10 |
  | carnival | 3 | §13 |

- **The five no-code-path actions** (`ai_1v1_rebound`, `ai_1v1_celebrate`, `hero_3v3_catch`, `ai_3v3_pass`,
  `ai_3v3_mate_shot`) each have a row with a FOUND target.
- **The 5 supplemental windows:** `hero_1v1_drive_finish`, `hero_3v3_drive_finish` (§5), `hero_1v1_boxout_board` (§10),
  `ai_1v1_rebound_board` and `hero_3v3_rebound_board` (§11).
- **Citations.** Every row has a measurable target and cites a reel timestamp read from frames in this pass, a named
  reference, or both.
- **Actions with no reel evidence.** These rest on named references only, because no instance was found in any window
  scrubbed:
  - `hero_1v1_stepback` [W14], `hero_1v1_spin` [W7] [W8], `hero_1v1_hesi` [W9] [W7], `hero_1v1_inout` [W7],
    `ai_1v1_hesi` [W14] [W9], `hero_1v1_fade` [W29];
  - the post rows [W13] [W15] [W30] [W31] (R08@8.3–9.0 is only a shield);
  - the euro step inside `hero_1v1_drive_finish` [W11];
  - the metadata tags R10 with a behind-the-back and a euro step, but neither was found in its frames.
- **Weaker sources, said plainly.**
  - [W18], [W22] and [W26] are search snippets, because the pages refused the fetch.
  - The slide cadence band in §1 is derived from push-step length, not from a study.
  - The run band above 3.83 m/s extrapolates [W27].
  - Numbers marked *MAP* and *plan* were not re-measured in this pass.

## 15. What the later phases take from here

| phase | uses |
|---|---|
| 2b | §1's cadence bands, to check the regenerated subject-78 clips |
| 3 | §0 feet, hands, right-hand and seam targets; §1 cadence; §8's dribble-contact and ball-path targets |
| 4 | §8 row by row: the crossing point, the between and behind flags, spin degrees, the hesi hitch, the one-hand in-and-out |
| 5 | §10's stance, slide and closeout targets and §1's slide bands; the weight-class scope in §0 |
| 6 | §5's rows and the rim/defender table; §6's post targets |
| 7 | §2 in full; §4 (3PT); §13 (carnival) |
| 8 | §7 plus [DUNK] |
| 9 | §0's look and shield targets, per row |
| 10 | §0's active hands and rim-aware finish; §10's contest, block, steal and reaction rows; the rim/defender table |
| 11 | §9 and §11, including the four FOUND targets |
| 12 | §12's celebration rows; `ai_1v1_celebrate` FOUND; no real names |
| 13 | every (d) above, re-measured against `base2` |
