# Playbook quiz cards — DRAFTS for the owner's approval

**Owner decision 6 (2026-10-06):** "Playbook quiz cards: draft them, the owner approves before they ship." This file is
the draft. **None of these ship:** no Playbook quiz card is in the Knowledge Feed packs, and
`lib/knowledge/playbookQuizDrafts.test.ts` fails if one appears before this file says it was approved.

**88 questions, one per content section** of the ten chapters of *The Neuro-Mechanic Playbook — Elijah Bonds*. The trainer's notes and the
"What to Remember" lists are not quizzed (the remember lists are already Playbook lesson cards). Three short sections
only introduce the one after them (7.7 "Drill 5", 8.6 "Movement 4", 8.8 "Movement 5", each a heading over its own
"how to" section) and share that section's question. The answers sit mostly on B as drafted; the feed shows every
quiz's options in a shuffled order (lib/knowledge/quiz.ts optionOrder), so that does not reach a player.

**How each draft is built.** The question asks about one line of the book. The right answer is that line's own claim,
in the book's words wherever they fit on a button. The wrong answers are plausible but contradicted by, or absent from,
the book. Under each one is **the exact book line** it comes from, quoted verbatim from
`lib/education/playbook.data.json`; the test checks every quote is still in the book, so a re-import that changes a line
turns that draft red instead of leaving a stale question.

**To approve:** mark each draft ✅ (ship), ✏️ (ship with your edit) or ❌ (drop) — or "ship all". On approval they become
`quiz` cards in the Playbook pack (ids `playbook.q-<chapter>-<section>`), validated like every other card, and the guest
preview rule (first 5 Playbook cards) applies to them too. Questions use "the Playbook" voice so a card never reads as
our advice.

## Chapter 1 — The Body's Control Panel

### 1. §1.0 · Your Body Has a Governor

**Q.** In the Playbook, what does the nervous system's 'governor' care about above all?

- A. How much horsepower you built in the weight room
- B. Survival
- C. How many reps you did today
- D. Your vertical jump number

**Answer:** B — Survival

**Book line** (ch. 1, "Your Body Has a Governor"):

> A governor does not care how much horsepower you built in the weight room. It cares about one thing: survival.

Owner: ☐ ship ☐ edit ☐ drop

### 2. §1.2 · Why Strong Isn't Enough

**Q.** Why can a 'governed' athlete squat four hundred pounds and still not jump high?

- A. The nervous system will not release the strength while it has flagged a vulnerability
- B. Squats make athletes slower
- C. Strength only counts after age 18
- D. They need more plyometrics

**Answer:** A — The nervous system will not release the strength while it has flagged a vulnerability

**Book line** (ch. 1, "Why Strong Isn't Enough"):

> The nervous system will not release it, because somewhere in the kinetic chain — at the ankle, at the hip, at the thoracic spine, in the breathing pattern — there is a structural vulnerability that the governor has flagged.

Owner: ☐ ship ☐ edit ☐ drop

### 3. §1.4 · The Sequence That Changes Everything

**Q.** What is the Playbook's four-step sequence, in order?

- A. Load → Perform → Assess → Correct
- B. Assess → Correct → Load → Perform
- C. Correct → Assess → Perform → Load
- D. Perform → Load → Correct → Assess

**Answer:** B — Assess → Correct → Load → Perform

**Book line** (ch. 1, "The Sequence That Changes Everything"):

> Assess → Correct → Load → Perform.

Owner: ☐ ship ☐ edit ☐ drop

### 4. §1.5 · What This Means for You Tonight

**Q.** A coach sees a lazy-looking lateral slide on film. What does the Playbook say not to default to?

- A. Ankle work
- B. Breathing resets
- C. Cone drills
- D. The five-minute check

**Answer:** C — Cone drills

**Book line** (ch. 1, "What This Means for You Tonight"):

> If you are a coach and an athlete's lateral slide looks lazy on film, do not default to cone drills.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 2 — The Foundation of Force

### 5. §2.0 · The Pressure Cylinder

**Q.** Why does the Playbook say a youth athlete needs a hydraulic model of the trunk?

- A. Every landing is a pressure event
- B. It makes the spine more flexible
- C. It replaces strength training
- D. It only matters for adults

**Answer:** A — Every landing is a pressure event

**Book line** (ch. 2, "The Pressure Cylinder"):

> Because every landing is a pressure event.

Owner: ☐ ship ☐ edit ☐ drop

### 6. §2.1 · Cavity 1: The Cranial Vault (Your Head)

**Q.** What does forward head posture shorten, according to the Playbook?

- A. The hamstrings
- B. The small muscles at the base of the skull (the suboccipitals)
- C. The calf muscles
- D. The diaphragm

**Answer:** B — The small muscles at the base of the skull (the suboccipitals)

**Book line** (ch. 2, "Cavity 1: The Cranial Vault (Your Head)"):

> Forward head posture — ear sitting clearly in front of the shoulder — shortens the small muscles at the base of the skull (the suboccipitals).

Owner: ☐ ship ☐ edit ☐ drop

### 7. §2.2 · Cavity 2: The Thoracic Cage (Your Rib Cage)

**Q.** When the rib V-angle opens wider than about 90 degrees, what is lost?

- A. Grip strength
- B. The zone of apposition (ZOA)
- C. Ankle eversion
- D. The foot tripod

**Answer:** B — The zone of apposition (ZOA)

**Book line** (ch. 2, "Cavity 2: The Thoracic Cage (Your Rib Cage)"):

> When the rib cage is flared — the V-angle where the bottom ribs meet at the breastbone opens wider than about 90 degrees — the ZOA is lost.

Owner: ☐ ship ☐ edit ☐ drop

### 8. §2.3 · Cavity 3: The Pelvic Basin (Your Pelvis and Floor)

**Q.** In the pressure cylinder, which part is the inferior (bottom) piston?

- A. The diaphragm
- B. The abdominal wall
- C. The pelvic floor
- D. The skull

**Answer:** C — The pelvic floor

**Book line** (ch. 2, "Cavity 3: The Pelvic Basin (Your Pelvis and Floor)"):

> The pelvic floor is the inferior piston of the pressure cylinder.

Owner: ☐ ship ☐ edit ☐ drop

### 9. §2.4 · Your Breath Is the Control Dial

**Q.** Why does the Playbook call breath the control dial?

- A. It is the only autonomic function you can also run on purpose
- B. It is the fastest way to build muscle
- C. It sets your heart rate directly
- D. It replaces a warm-up

**Answer:** A — It is the only autonomic function you can also run on purpose

**Book line** (ch. 2, "Your Breath Is the Control Dial"):

> Breath is the only autonomic function you can also run on purpose.

Owner: ☐ ship ☐ edit ☐ drop

### 10. §2.6 · Force From the Ground Up

**Q.** To slide left, which way does the right foot push the ground?

- A. To the left
- B. To the right
- C. Straight down only
- D. Backward

**Answer:** B — To the right

**Book line** (ch. 2, "Force From the Ground Up"):

> To slide left, the right foot pushes the ground to the right.

Owner: ☐ ship ☐ edit ☐ drop

### 11. §2.7 · The Foot Tripod

**Q.** What are the three points of the foot tripod?

- A. Toes, arch and heel edge
- B. Center of the heel, base of the first metatarsal, base of the fifth metatarsal
- C. Big toe, little toe and ankle bone
- D. Heel, arch and ball of the foot only

**Answer:** B — Center of the heel, base of the first metatarsal, base of the fifth metatarsal

**Book line** (ch. 2, "The Foot Tripod"):

> Three points of ground contact make a stable foot: the center of the heel, the base of the first metatarsal (the big-toe joint), and the base of the fifth metatarsal (the pinky-toe joint).

Owner: ☐ ship ☐ edit ☐ drop

### 12. §2.8 · Movement Snack: The Ankle Architecture Reset

**Q.** In the Single-Leg Oscillatory Pogo, what does a mushy or heavy bounce mean?

- A. You are bouncing too high
- B. The arch collapsed and is absorbing energy instead of returning it
- C. You need heavier shoes
- D. The drill is working

**Answer:** B — The arch collapsed and is absorbing energy instead of returning it

**Book line** (ch. 2, "Movement Snack: The Ankle Architecture Reset"):

> Mushy or heavy means the arch collapsed and is absorbing energy instead of returning it.

Owner: ☐ ship ☐ edit ☐ drop

### 13. §2.10 · Putting the Cylinder and the Ground Together

**Q.** An athlete foam-rolls for twenty minutes and still looks flat in the first step. What does the Playbook suggest instead?

- A. Roll for longer
- B. Two minutes of tripod and short foot plus one minute of long-exhale rib resets
- C. Skip the warm-up
- D. Heavier squats

**Answer:** B — Two minutes of tripod and short foot plus one minute of long-exhale rib resets

**Book line** (ch. 2, "Putting the Cylinder and the Ground Together"):

> Two minutes of tripod and short foot plus one minute of long-exhale rib resets will usually beat passive rolling for court transfer.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 3 — The 5-Minute Movement Check

### 14. §3.0 · Why 5 Minutes Is Enough to Find the Problem

**Q.** The quick check treats the body as three building blocks stacked on what?

- A. A foot-and-ankle foundation
- B. The shoulders
- C. A barbell
- D. The knees

**Answer:** A — A foot-and-ankle foundation

**Book line** (ch. 3, "Why 5 Minutes Is Enough to Find the Problem"):

> You need a fast visual system that treats the body as three building blocks — cranial vault, thoracic cage, pelvic basin — stacked on a foot-and-ankle foundation.

Owner: ☐ ship ☐ edit ☐ drop

### 15. §3.2 · The 5 Checks

**Q.** In Check 1, the Heel Line, where do you stand and what do you look at?

- A. In front, at the toes
- B. Behind the athlete, at the heel bone
- C. At the side, at the ear
- D. Behind, at the shoulder blades

**Answer:** B — Behind the athlete, at the heel bone

**Book line** (ch. 3, "The 5 Checks"):

> Stand behind the athlete. Look at the heel bone (calcaneus).

Owner: ☐ ship ☐ edit ☐ drop

### 16. §3.3 · Check 2: The Knee Window (view from the front)

**Q.** In Check 2, the Knee Window, what are inward-facing 'squinting kneecaps' a flag for?

- A. ACL risk
- B. Strong quads
- C. A good jump
- D. Nothing — they are normal

**Answer:** A — ACL risk

**Book line** (ch. 3, "Check 2: The Knee Window (view from the front)"):

> Inward-facing kneecaps — ‘squinting kneecaps’ — are an ACL-risk flag and often trace back to the foot findings from Check 1.

Owner: ☐ ship ☐ edit ☐ drop

### 17. §3.4 · Check 3: The Hip Level Check (view from the front, waistline)

**Q.** In the Hip Level Check, how big a difference between the hip points is significant?

- A. Any difference at all
- B. More than about one finger-width
- C. More than a hand-width
- D. Only if it hurts

**Answer:** B — More than about one finger-width

**Book line** (ch. 3, "Check 3: The Hip Level Check (view from the front, waistline)"):

> A difference of more than about one finger-width is significant.

Owner: ☐ ship ☐ edit ☐ drop

### 18. §3.5 · Check 4: The Rib Angle (view from the front, chest)

**Q.** In the Rib Angle check, what is the ideal angle of the V where the bottom ribs meet?

- A. About 45 degrees
- B. Roughly 90 degrees
- C. About 135 degrees
- D. As wide as possible

**Answer:** B — Roughly 90 degrees

**Book line** (ch. 3, "Check 4: The Rib Angle (view from the front, chest)"):

> Ideal is roughly a 90-degree angle.

Owner: ☐ ship ☐ edit ☐ drop

### 19. §3.6 · Check 5: The Head Float (view from the side)

**Q.** In the Head Float check, the vertical line from the earlobe should pass through what?

- A. The elbow
- B. The hip point
- C. The bony tip of the shoulder (the acromion)
- D. The front of the chest

**Answer:** C — The bony tip of the shoulder (the acromion)

**Book line** (ch. 3, "Check 5: The Head Float (view from the side)"):

> That line should pass through the bony tip of the shoulder (the acromion).

Owner: ☐ ship ☐ edit ☐ drop

### 20. §3.7 · The Single-Leg Wobble Test

**Q.** In the Single-Leg Wobble Test, what is the headline finding?

- A. A mild wobble on both sides
- B. One side stable and the other failing
- C. Holding for more than a minute
- D. Which foot is bigger

**Answer:** B — One side stable and the other failing

**Book line** (ch. 3, "The Single-Leg Wobble Test"):

> If one side is stable and the other fails, that asymmetry is your headline finding — more important than a mild bilateral wobble.

Owner: ☐ ship ☐ edit ☐ drop

### 21. §3.9 · What to Do With Findings

**Q.** With 1–2 red flags, what does the Playbook's triage say to do?

- A. Stop all training
- B. Keep training, but address the specific faults before you add intensity
- C. Ignore them
- D. Add intensity first

**Answer:** B — Keep training, but address the specific faults before you add intensity

**Book line** (ch. 3, "What to Do With Findings"):

> 1–2 red flags: Keep training, but address the specific faults before you add intensity.

Owner: ☐ ship ☐ edit ☐ drop

### 22. §3.10 · How to Run This Before Practice

**Q.** How many athletes per practice does the Playbook suggest a coach screens?

- A. Two
- B. The whole team
- C. One a week
- D. Ten

**Answer:** A — Two

**Book line** (ch. 3, "How to Run This Before Practice"):

> Coaches: pick two athletes per practice to screen while the team foam-rolls or shoots free throws.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 4 — Unlocking the Joints

### 23. §4.0 · Joint 1 — The Ankle

**Q.** What does the Playbook call the most common mobility deficit in basketball athletes?

- A. Limited shoulder rotation
- B. Limited dorsiflexion
- C. Tight hamstrings
- D. Weak wrists

**Answer:** B — Limited dorsiflexion

**Book line** (ch. 4, "Joint 1 — The Ankle"):

> Limited dorsiflexion is the most common mobility deficit in basketball athletes.

Owner: ☐ ship ☐ edit ☐ drop

### 24. §4.2 · Joint 2 — The Hip

**Q.** Restricted hip external rotation is a root driver of what?

- A. Shooting slumps
- B. Defensive stance breakdowns
- C. Ankle sprains only
- D. Slow reaction time

**Answer:** B — Defensive stance breakdowns

**Book line** (ch. 4, "Joint 2 — The Hip"):

> Restricted hip external rotation is a root driver of defensive stance breakdowns — the athlete cannot sit into a wide base without the knees collapsing or the low back taking over.

Owner: ☐ ship ☐ edit ☐ drop

### 25. §4.3 · The Hip 90/90 Position — Mobility Home Base

**Q.** In the 90/90 position, which way is each hip working?

- A. Both in external rotation
- B. Front hip in external rotation, rear hip in internal rotation
- C. Both in internal rotation
- D. Neither — it is a rest position

**Answer:** B — Front hip in external rotation, rear hip in internal rotation

**Book line** (ch. 4, "The Hip 90/90 Position — Mobility Home Base"):

> This loads both directions at once: the front hip is in external rotation, the rear hip is in internal rotation.

Owner: ☐ ship ☐ edit ☐ drop

### 26. §4.5 · Joint 3 — The Thoracic Spine

**Q.** How much thoracic rotation to each side does the Playbook call a reasonable expectation in a healthy athlete?

- A. About 10 degrees
- B. Roughly 45 to 50 degrees
- C. A full 90 degrees
- D. As much as the lower back allows

**Answer:** B — Roughly 45 to 50 degrees

**Book line** (ch. 4, "Joint 3 — The Thoracic Spine"):

> From the Blueprint's seated rotation screen: roughly 45 to 50 degrees of thoracic rotation to each side is a reasonable expectation in a healthy athlete.

Owner: ☐ ship ☐ edit ☐ drop

### 27. §4.6 · The 7-Minute Daily Joint Unlock

**Q.** How long is the Daily Joint Unlock, and what does it need?

- A. 7 minutes, no equipment
- B. 20 minutes, a foam roller
- C. 45 minutes, a mobility class
- D. 2 minutes, a band

**Answer:** A — 7 minutes, no equipment

**Book line** (ch. 4, "The 7-Minute Daily Joint Unlock"):

> Total: 7 minutes. No equipment. Any room.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 5 — The Pre-Game Nervous System Wake-Up

### 28. §5.0 · Why Static Stretching Before a Game Is the Wrong Call

**Q.** For how long after static stretching may force production be reduced, according to the Playbook?

- A. About 30 seconds
- B. Up to 30 minutes
- C. Two days
- D. It is never reduced

**Answer:** B — Up to 30 minutes

**Book line** (ch. 5, "Why Static Stretching Before a Game Is the Wrong Call"):

> The effect may persist for up to 30 minutes and varies by stretch duration and muscle group — treat it as a guideline rather than a universal rule.

Owner: ☐ ship ☐ edit ☐ drop

### 29. §5.1 · The 10-Minute Pre-Game Protocol

**Q.** What does the Playbook say about the order of the pre-game phases?

- A. Shuffle them for variety
- B. Run them in order — each phase sets up the next
- C. Do only the ones you like
- D. Start with the jumps

**Answer:** B — Run them in order — each phase sets up the next

**Book line** (ch. 5, "The 10-Minute Pre-Game Protocol"):

> Run the phases in order. Do not shuffle them. Each phase sets up the next — release, pressurize, feet, joints, rhythm, launch.

Owner: ☐ ship ☐ edit ☐ drop

### 30. §5.2 · Phase 1: Release the Locks (2 minutes)

**Q.** Phase 1 clears the two most common tight spots before a game. Which two?

- A. Wrists and neck
- B. Ankles and hip flexors
- C. Hamstrings and shoulders
- D. Calves and lower back

**Answer:** B — Ankles and hip flexors

**Book line** (ch. 5, "Phase 1: Release the Locks (2 minutes)"):

> What it is: two quick contract-relax cycles for the two most common tight spots in athletes before a game — ankles and hip flexors.

Owner: ☐ ship ☐ edit ☐ drop

### 31. §5.3 · Phase 2: Pressurize the System (1 minute)

**Q.** In the Phase 2 IAP breath, how long is the exhale?

- A. Two seconds
- B. Four seconds
- C. Six seconds
- D. Twelve seconds

**Answer:** C — Six seconds

**Book line** (ch. 5, "Phase 2: Pressurize the System (1 minute)"):

> Exhale through pursed lips for six seconds — feel the ribs compress.

Owner: ☐ ship ☐ edit ☐ drop

### 32. §5.4 · Phase 3: Wake Up the Tripod (1 minute)

**Q.** In Phase 3, how long do you hold the short-foot activation?

- A. One second
- B. Three seconds
- C. Ten seconds
- D. One minute

**Answer:** B — Three seconds

**Book line** (ch. 5, "Phase 3: Wake Up the Tripod (1 minute)"):

> Draw the big-toe base gently toward the heel without curling the toes (short foot activation). Hold three seconds.

Owner: ☐ ship ☐ edit ☐ drop

### 33. §5.5 · Phase 4: Open the Joints (2 minutes)

**Q.** What is Phase 4, Open the Joints?

- A. Long static stretches
- B. Quick joint circles for ankles and hips, moving through range with intent
- C. Chapter 4's full seven-minute unlock
- D. Foam rolling

**Answer:** B — Quick joint circles for ankles and hips, moving through range with intent

**Book line** (ch. 5, "Phase 4: Open the Joints (2 minutes)"):

> What it is: quick joint circles for ankles and hips — not stretching, just moving through range with intent.

Owner: ☐ ship ☐ edit ☐ drop

### 34. §5.6 · Phase 5: Build the Rhythm (2 minutes)

**Q.** In Phase 5's pogos, how much knee bend does the Playbook allow?

- A. None at all
- B. 15 to 20 degrees max
- C. About 45 degrees
- D. A full squat

**Answer:** B — 15 to 20 degrees max

**Book line** (ch. 5, "Phase 5: Build the Rhythm (2 minutes)"):

> Begin bouncing on the balls of the feet — minimal knee bend (15 to 20 degrees max).

Owner: ☐ ship ☐ edit ☐ drop

### 35. §5.8 · Phase 6: Prime the Launch (2 minutes)

**Q.** How many rounds of the Jump Readiness Sequence does Phase 6 call for?

- A. One
- B. Three
- C. Five
- D. Ten

**Answer:** B — Three

**Book line** (ch. 5, "Phase 6: Prime the Launch (2 minutes)"):

> Three rounds is enough when each round is honest.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 6 — Jumping and Landing Mechanics

### 36. §6.0 · How a Jump Actually Works

**Q.** Once you leave the floor, what sets your jump height?

- A. Swinging your arms in the air
- B. Vertical velocity at takeoff
- C. How long you dip
- D. Your shoe size

**Answer:** B — Vertical velocity at takeoff

**Book line** (ch. 6, "How a Jump Actually Works"):

> Height is set by vertical velocity at takeoff.

Owner: ☐ ship ☐ edit ☐ drop

### 37. §6.1 · Concept 1: The Countermovement Is Where the Jump Is Won

**Q.** What does the Playbook call the bigger gift of the countermovement?

- A. Stretching the hamstrings
- B. Time for the nervous system to get online
- C. A rest at the bottom
- D. Looking more athletic

**Answer:** B — Time for the nervous system to get online

**Book line** (ch. 6, "Concept 1: The Countermovement Is Where the Jump Is Won"):

> The Blueprint is blunt here: the spring is real, but the bigger gift of the countermovement is time for the nervous system to get online.

Owner: ☐ ship ☐ edit ☐ drop

### 38. §6.2 · Concept 2: The 90-Degree Law for Approach Jumps

**Q.** In the 90-Degree Law, what should be at roughly 90 degrees when the plant foot owns the floor?

- A. The elbow
- B. The knee
- C. The ankle
- D. The torso lean

**Answer:** B — The knee

**Book line** (ch. 6, "Concept 2: The 90-Degree Law for Approach Jumps"):

> As a coaching law for youth athletes: the knee should hit roughly 90 degrees of flexion at the moment the plant foot owns the floor.

Owner: ☐ ship ☐ edit ☐ drop

### 39. §6.3 · What a Dangerous Landing Looks Like — and What to Listen For

**Q.** In a safe landing, in what order do the joints absorb force?

- A. Hip, then knee, then ankle
- B. Ankle first, then knee, then hip
- C. Knee only
- D. All locked straight

**Answer:** B — Ankle first, then knee, then hip

**Book line** (ch. 6, "What a Dangerous Landing Looks Like — and What to Listen For"):

> A safe landing absorbs force across three joints — ankle first, then knee, then hip.

Owner: ☐ ship ☐ edit ☐ drop

### 40. §6.4 · Drill 1: The Countermovement Geometry Check (60 seconds)

**Q.** In the Countermovement Geometry Check, how long do you hold the bottom position?

- A. One second
- B. Three seconds
- C. Ten seconds
- D. You don't hold it — you jump

**Answer:** B — Three seconds

**Book line** (ch. 6, "Drill 1: The Countermovement Geometry Check (60 seconds)"):

> Hold that position for three seconds.

Owner: ☐ ship ☐ edit ☐ drop

### 41. §6.6 · Drill 2: The Oscillatory Pogo Progression

**Q.** How long should the pogo base be built before high boxes or depth jumps?

- A. One day
- B. Two to four weeks
- C. A full season
- D. No base is needed

**Answer:** B — Two to four weeks

**Book line** (ch. 6, "Drill 2: The Oscillatory Pogo Progression"):

> Do not jump onto high boxes or do depth jumps without first spending two to four weeks building this base.

Owner: ☐ ship ☐ edit ☐ drop

### 42. §6.7 · Weeks 1–2: Bilateral Pogos (Both Feet)

**Q.** What do weeks 1–2 of the pogo progression prescribe?

- A. Three sets of about 20 contacts, both feet
- B. One set of 100 contacts
- C. Single-leg pogos only
- D. Depth jumps

**Answer:** A — Three sets of about 20 contacts, both feet

**Book line** (ch. 6, "Weeks 1–2: Bilateral Pogos (Both Feet)"):

> Carry Phase 5 of the warm-up into training sets: three sets of about 20 contacts, crisp pop sound, arms in opposition, no heel slap.

Owner: ☐ ship ☐ edit ☐ drop

### 43. §6.8 · Weeks 3–4: Unilateral Pogos (One Foot)

**Q.** What do one-foot pogos in weeks 3–4 expose immediately?

- A. Ankle weakness and asymmetry
- B. Shoulder tightness
- C. Breathing problems
- D. Nothing new

**Answer:** A — Ankle weakness and asymmetry

**Book line** (ch. 6, "Weeks 3–4: Unilateral Pogos (One Foot)"):

> This exposes ankle weakness and asymmetry immediately.

Owner: ☐ ship ☐ edit ☐ drop

### 44. §6.9 · Drill 3: The Safe Landing Check

**Q.** In the Safe Landing Check, what do you step off, and how long do you hold the landing?

- A. A 12-inch box; three seconds
- B. A 36-inch box; one second
- C. The floor; ten seconds
- D. A chair; no hold

**Answer:** A — A 12-inch box; three seconds

**Book line** (ch. 6, "Drill 3: The Safe Landing Check"):

> Safe landing check: step off a 12-inch box. Land softly, hold the landing position for 3 seconds without knee cave or forward trunk collapse.

Owner: ☐ ship ☐ edit ☐ drop

### 45. §6.11 · What Parents Should Watch on Film

**Q.** In the fifteen-minute driveway session, at what effort are the three countermovement jumps done?

- A. Maximum effort
- B. Seventy percent
- C. Thirty percent
- D. Whatever feels good

**Answer:** B — Seventy percent

**Book line** (ch. 6, "What Parents Should Watch on Film"):

> then three submaximal countermovement jumps at seventy percent effort for pattern proof — not testing day.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 7 — SAQ Made Simple

### 46. §7.0 · Why Ladder Drills Are the Wrong Starting Point

**Q.** What kind of problem does the Playbook say speed is?

- A. A footwork problem
- B. A force problem
- C. A flexibility problem
- D. A shoe problem

**Answer:** B — A force problem

**Book line** (ch. 7, "Why Ladder Drills Are the Wrong Starting Point"):

> Speed is a force problem.

Owner: ☐ ship ☐ edit ☐ drop

### 47. §7.1 · Drill 1 — The Wall Drive

**Q.** In the Wall Drive, where does the forward lean come from?

- A. The head and chest only
- B. The waist
- C. The ankles — the entire body, like a ramp
- D. The knees

**Answer:** C — The ankles — the entire body, like a ramp

**Book line** (ch. 7, "Drill 1 — The Wall Drive"):

> Lean your ENTIRE body forward from the ankles — not just the head and chest.

Owner: ☐ ship ☐ edit ☐ drop

### 48. §7.3 · Drill 2 — The 3-Step Decel

**Q.** In the 3-Step Decel, how far should the planted knee bend on landing?

- A. Barely at all
- B. At least 90 degrees
- C. Exactly 45 degrees
- D. Until the knee touches the floor

**Answer:** B — At least 90 degrees

**Book line** (ch. 7, "Drill 2 — The 3-Step Decel"):

> Let the knee bend deeply on landing — at least 90 degrees — and let the hip drop back and down simultaneously.

Owner: ☐ ship ☐ edit ☐ drop

### 49. §7.4 · Drill 3 — The Lateral Bound and Stick

**Q.** In the Lateral Bound and Stick, how long do you hold the single-leg landing?

- A. Half a second
- B. Two full seconds
- C. Ten seconds
- D. No hold — bound straight back

**Answer:** B — Two full seconds

**Book line** (ch. 7, "Drill 3 — The Lateral Bound and Stick"):

> LAND on the opposite foot. Single-leg landing. HOLD for two full seconds.

Owner: ☐ ship ☐ edit ☐ drop

### 50. §7.5 · Drill 4 — The T-Drill (No Cones Needed)

**Q.** How is the T-Drill laid out?

- A. A marker 10 yards ahead, with markers 5 yards to its left and right
- B. Four markers in a square, 5 yards apart
- C. A straight line of 10 cones
- D. Two markers 20 yards apart

**Answer:** A — A marker 10 yards ahead, with markers 5 yards to its left and right

**Book line** (ch. 7, "Drill 4 — The T-Drill (No Cones Needed)"):

> Place one start marker. Place one marker 10 yards straight ahead. Place one marker 5 yards to the left of the forward marker. Place one marker 5 yards to the right.

Owner: ☐ ship ☐ edit ☐ drop

### 51. §7.8 · Setup and Execution

**Q.** In the Resisted March to Sprint, what does the working athlete lean into?

- A. A wall
- B. A resistance band
- C. A partner's shoulders
- D. A sled

**Answer:** C — A partner's shoulders

**Book line** (ch. 7, "Setup and Execution"):

> The working athlete places their hands on the back of a partner's shoulders.

Owner: ☐ ship ☐ edit ☐ drop

### 52. §7.9 · Common Errors and Fast Fixes

**Q.** Lateral bounds are turning into diagonal hops with a falling stick. What is the fix?

- A. Add two feet of distance
- B. Shrink distance until the stick is silent and balanced for two seconds
- C. Bound faster
- D. Skip the stick

**Answer:** B — Shrink distance until the stick is silent and balanced for two seconds

**Book line** (ch. 7, "Common Errors and Fast Fixes"):

> Fix: shrink distance until the stick is silent and balanced for two seconds.

Owner: ☐ ship ☐ edit ☐ drop

### 53. §7.10 · A 15-Minute Coach Script

**Q.** In the 15-minute coach script, what does the coach watch during the Lateral Bound and Stick?

- A. Distance
- B. Knees, not distance
- C. The stopwatch
- D. Arm action

**Answer:** B — Knees, not distance

**Book line** (ch. 7, "A 15-Minute Coach Script"):

> Minute 6–10: Lateral Bound and Stick, six each way. Coach watches knees, not distance.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 8 — Strength Without Strain

### 54. §8.0 · The Developing Frame — Why Technique Comes Before Load

**Q.** Around what age do growth plates in adolescent athletes fully close?

- A. 10–12
- B. Around 17–18
- C. 21–25
- D. They never close

**Answer:** B — Around 17–18

**Book line** (ch. 8, "The Developing Frame — Why Technique Comes Before Load"):

> The growth plates in adolescent athletes do not fully close until around 17–18 years old — often earlier for females, later for males.

Owner: ☐ ship ☐ edit ☐ drop

### 55. §8.1 · Movement 1 — The Hip Hinge

**Q.** In the bodyweight RDL, when do you stop lowering?

- A. When your hands touch the floor
- B. Before the lower back rounds
- C. At a full squat
- D. When your knees lock

**Answer:** B — Before the lower back rounds

**Book line** (ch. 8, "Movement 1 — The Hip Hinge"):

> STOP before the lower back rounds.

Owner: ☐ ship ☐ edit ☐ drop

### 56. §8.3 · Movement 2 — The Split Squat

**Q.** Why does the Playbook favour the split squat for basketball?

- A. It is easier than a squat
- B. Basketball is a single-leg sport pretending to be a two-leg sport
- C. It needs no balance
- D. It builds arm strength

**Answer:** B — Basketball is a single-leg sport pretending to be a two-leg sport

**Book line** (ch. 8, "Movement 2 — The Split Squat"):

> Why it matters: basketball is a single-leg sport pretending to be a two-leg sport.

Owner: ☐ ship ☐ edit ☐ drop

### 57. §8.4 · Movement 3 — The Glute Bridge

**Q.** Why are most youth athletes' glutes inhibited, according to the Playbook?

- A. Too much running
- B. Excessive sitting
- C. Too much stretching
- D. Growth plates

**Answer:** B — Excessive sitting

**Book line** (ch. 8, "Movement 3 — The Glute Bridge"):

> Most youth athletes have significantly inhibited glutes from excessive sitting — the hip flexors shorten and neurologically quiet the glutes through reciprocal inhibition (when one muscle group tightens, its opposite group down-regulates).

Owner: ☐ ship ☐ edit ☐ drop

### 58. §8.5 · Glute Bridge with Pressure Cylinder

**Q.** In the Glute Bridge with Pressure Cylinder, when do you drive the hips up?

- A. On the inhale
- B. On the exhale
- C. While holding your breath
- D. It doesn't matter

**Answer:** B — On the exhale

**Book line** (ch. 8, "Glute Bridge with Pressure Cylinder"):

> On the exhale, drive the hips UP by squeezing the glutes.

Owner: ☐ ship ☐ edit ☐ drop

### 59. §8.7 · Scapular-Controlled Push-Up

**Q.** In the scapular-controlled push-up, at what angle are the elbows?

- A. Flared wide like a T
- B. Tucked tight like a military press
- C. About 45 degrees from the body
- D. Straight out to the sides

**Answer:** C — About 45 degrees from the body

**Book line** (ch. 8, "Scapular-Controlled Push-Up"):

> Elbows at about 45 degrees from the body (not flared wide like a T, not tucked tight like a military press).

Owner: ☐ ship ☐ edit ☐ drop

### 60. §8.9 · Breathing Plank

**Q.** What is the breathing rhythm of the Breathing Plank?

- A. Hold your breath for 30 seconds
- B. 4 seconds in, 6 seconds out
- C. Quick breaths through the mouth
- D. 6 in, 4 out

**Answer:** B — 4 seconds in, 6 seconds out

**Book line** (ch. 8, "Breathing Plank"):

> Take a full IAP breath cycle: 4 seconds in, 6 seconds out, without losing the brace.

Owner: ☐ ship ☐ edit ☐ drop

### 61. §8.11 · The Weekly Bodyweight Strength Template

**Q.** When does the template say to add load, bands or backpack weight?

- A. From the first week
- B. Only when the bodyweight version is boringly solid
- C. When the athlete asks
- D. After every session

**Answer:** B — Only when the bodyweight version is boringly solid

**Book line** (ch. 8, "The Weekly Bodyweight Strength Template"):

> Do not add load, bands, or backpack weight until the bodyweight version is boringly solid — no shaking, full holds, matching left-to-right quality on split squats and single-leg bridges.

Owner: ☐ ship ☐ edit ☐ drop

### 62. §8.12 · Progressions Without a Weight Room

**Q.** In the split squat progression, when do light dumbbells come in?

- A. At the start
- B. Only after the elevated version is stable
- C. Never
- D. After one week

**Answer:** B — Only after the elevated version is stable

**Book line** (ch. 8, "Progressions Without a Weight Room"):

> light dumbbells only after the elevated version is stable.

Owner: ☐ ship ☐ edit ☐ drop

### 63. §8.13 · Where This Fits With Sport Practice

**Q.** Where does the Playbook say SAQ from Chapter 7 should go in the week?

- A. After grinding conditioning
- B. Before grinding conditioning, on fresh legs
- C. Right after a lower-body strength day
- D. The night before a game

**Answer:** B — Before grinding conditioning, on fresh legs

**Book line** (ch. 8, "Where This Fits With Sport Practice"):

> SAQ from Chapter 7 prefers fresh legs — put it before grinding conditioning, not after.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 9 — The Reset Button

### 64. §9.0 · Recovery Is When the Adaptation Happens

**Q.** Who does the Playbook say wins: six training days with poor recovery, or four with complete recovery?

- A. Six days, poor recovery
- B. Four days, complete recovery
- C. They come out even
- D. Whoever trains harder

**Answer:** B — Four days, complete recovery

**Book line** (ch. 9, "Recovery Is When the Adaptation Happens"):

> An athlete who trains six days a week and recovers poorly will be outperformed by an athlete who trains four days a week and recovers completely.

Owner: ☐ ship ☐ edit ☐ drop

### 65. §9.1 · Your Breath Is the Switch — Sympathetic to Parasympathetic

**Q.** Which kind of breathing biases the system toward parasympathetic activation?

- A. Apical breathing — high chest and shoulders
- B. Diaphragmatic breathing — belly first, then 360-degree rib expansion
- C. Holding your breath
- D. Fast mouth breathing

**Answer:** B — Diaphragmatic breathing — belly first, then 360-degree rib expansion

**Book line** (ch. 9, "Your Breath Is the Switch — Sympathetic to Parasympathetic"):

> Diaphragmatic breathing — belly first, then 360-degree rib expansion — stimulates the vagus nerve pathway and biases the system toward parasympathetic activation.

Owner: ☐ ship ☐ edit ☐ drop

### 66. §9.2 · Protocol 1 — The 4-6 Recovery Breath

**Q.** In the 4-6 Recovery Breath, why is the exhale longer than the inhale?

- A. It burns more calories
- B. The longer exhale is the parasympathetic nudge
- C. It strengthens the lungs
- D. It is easier to count

**Answer:** B — The longer exhale is the parasympathetic nudge

**Book line** (ch. 9, "Protocol 1 — The 4-6 Recovery Breath"):

> Make the exhale longer than the inhale. The longer exhale is the parasympathetic nudge.

Owner: ☐ ship ☐ edit ☐ drop

### 67. §9.4 · Protocol 2 — The Pre-Sleep Wind-Down

**Q.** When does the Pre-Sleep Wind-Down start?

- A. Right after dinner
- B. 20–30 minutes before intended sleep time
- C. After you are in bed with the lights off
- D. An hour after waking

**Answer:** B — 20–30 minutes before intended sleep time

**Book line** (ch. 9, "Protocol 2 — The Pre-Sleep Wind-Down"):

> Timing: start this routine 20–30 minutes before intended sleep time.

Owner: ☐ ship ☐ edit ☐ drop

### 68. §9.5 · Step 1 — Technology Off

**Q.** How long before the wind-down routine do screens go off?

- A. 10 minutes
- B. One minute
- C. Two hours
- D. They can stay on for the alarm

**Answer:** A — 10 minutes

**Book line** (ch. 9, "Step 1 — Technology Off"):

> Screens off 10 minutes before this routine begins.

Owner: ☐ ship ☐ edit ☐ drop

### 69. §9.6 · Step 2 — Legs Up the Wall (5 minutes)

**Q.** How long do you stay in Legs Up the Wall?

- A. 30 seconds
- B. 5 minutes
- C. 20 minutes
- D. Until you fall asleep

**Answer:** B — 5 minutes

**Book line** (ch. 9, "Step 2 — Legs Up the Wall (5 minutes)"):

> Stay for 5 minutes.

Owner: ☐ ship ☐ edit ☐ drop

### 70. §9.7 · Step 3 — Supine Spinal Twist (2 minutes each side)

**Q.** In the Sleep Breath, how do you exhale?

- A. Through the mouth for 2 seconds
- B. Through the nose for 6–8 seconds
- C. Through pursed lips for 4 seconds
- D. You hold it instead

**Answer:** B — Through the nose for 6–8 seconds

**Book line** (ch. 9, "Step 3 — Supine Spinal Twist (2 minutes each side)"):

> Exhale through the nose (not the mouth) for 6–8 seconds.

Owner: ☐ ship ☐ edit ☐ drop

### 71. §9.8 · Protocol 3 — The Sleep Quality Checklist for Parents

**Q.** How often should parents run the Sleep Quality Checklist?

- A. Every night, with alarm
- B. Weekly
- C. Once a year
- D. Only after a loss

**Answer:** B — Weekly

**Book line** (ch. 9, "Protocol 3 — The Sleep Quality Checklist for Parents"):

> Audit weekly.

Owner: ☐ ship ☐ edit ☐ drop

### 72. §9.9 · Why Sleep Matters for Athletic Development

**Q.** When does growth hormone secretion peak?

- A. During deep sleep
- B. During a game
- C. Right after breakfast
- D. During a cold shower

**Answer:** A — During deep sleep

**Book line** (ch. 9, "Why Sleep Matters for Athletic Development"):

> Growth hormone secretion peaks during deep sleep.

Owner: ☐ ship ☐ edit ☐ drop

### 73. §9.11 · Tournament and Back-to-Back Days

**Q.** Between two games on the same day, how many rounds of 4-6 breathing does the Playbook suggest?

- A. None — stay hyped
- B. 6–8 rounds
- C. 50 rounds
- D. The full pre-sleep wind-down

**Answer:** B — 6–8 rounds

**Book line** (ch. 9, "Tournament and Back-to-Back Days"):

> Use 6–8 rounds of 4-6 breathing in a quiet chair, sip water, light snack if timing allows, then a short reactivation from Chapter 5 before tip — feet, hips, cylinder, two light jumps.

Owner: ☐ ship ☐ edit ☐ drop

### 74. §9.12 · Troubleshooting the Protocols

**Q.** If the 4-6 breath makes an athlete anxious, what does the Playbook suggest?

- A. Stop breathing drills for good
- B. Shorten the exhale to five seconds for a week and sit instead of lying down
- C. Lengthen the exhale to ten seconds
- D. Do it in the car

**Answer:** B — Shorten the exhale to five seconds for a week and sit instead of lying down

**Book line** (ch. 9, "Troubleshooting the Protocols"):

> If the 4-6 breath makes the athlete anxious, shorten the exhale to five seconds for a week, keep the nasal inhale, and sit instead of lying down.

Owner: ☐ ship ☐ edit ☐ drop

### 75. §9.13 · A Note to Athletes Who Think Recovery Is Soft

**Q.** How does the Playbook reframe recovery for hard workers?

- A. A loophole for people who can't handle drills
- B. How you earn the right to train hard again tomorrow
- C. Something only pros need
- D. Optional on game weeks

**Answer:** B — How you earn the right to train hard again tomorrow

**Book line** (ch. 9, "A Note to Athletes Who Think Recovery Is Soft"):

> Recovery is how you earn the right to train hard again tomorrow with a nervous system that still trusts you.

Owner: ☐ ship ☐ edit ☐ drop

## Chapter 10 — The Parent's Cheat Sheet

### 76. §10.0 · Section 1 — The Red Flags: What to Watch For

**Q.** What does the Playbook ask a parent to do with a red flag?

- A. Diagnose the problem
- B. Recognize the flag and ask questions
- C. Pull the athlete from the team
- D. Ignore it until it repeats

**Answer:** B — Recognize the flag and ask questions

**Book line** (ch. 10, "Section 1 — The Red Flags: What to Watch For"):

> You do not need to diagnose the problem. You need to recognize the flag and ask questions.

Owner: ☐ ship ☐ edit ☐ drop

### 77. §10.1 · Red Flag 1 — Pain Is Normalized

**Q.** Which of these does the Playbook say is NOT normal soreness?

- A. A dull ache 24–48 hours after a hard session
- B. General heaviness the next day
- C. Pain that persists beyond 72 hours
- D. Tired legs after a tournament

**Answer:** C — Pain that persists beyond 72 hours

**Book line** (ch. 10, "Red Flag 1 — Pain Is Normalized"):

> Sharp pain during movement, joint pain, or pain that persists beyond 72 hours is not.

Owner: ☐ ship ☐ edit ☐ drop

### 78. §10.2 · Red Flag 2 — No Mobility or Movement Prep Before Intensity

**Q.** About how long does the Chapter 5 pre-game protocol take?

- A. About 10 minutes
- B. About 45 minutes
- C. About 2 minutes
- D. About an hour

**Answer:** A — About 10 minutes

**Book line** (ch. 10, "Red Flag 2 — No Mobility or Movement Prep Before Intensity"):

> The pre-game protocol in Chapter 5 takes about 10 minutes.

Owner: ☐ ship ☐ edit ☐ drop

### 79. §10.3 · Red Flag 3 — Heavier in Training Than in Games

**Q.** In-season, what does general sports science support doing with training volume?

- A. Increasing it
- B. Reducing it relative to the off-season while maintaining intensity
- C. Cutting intensity and keeping volume
- D. Stopping all strength work

**Answer:** B — Reducing it relative to the off-season while maintaining intensity

**Book line** (ch. 10, "Red Flag 3 — Heavier in Training Than in Games"):

> General sports science consensus supports reducing total training volume in-season relative to the off-season — maintaining intensity while cutting volume allows performance to peak at competition while managing cumulative tissue load.

Owner: ☐ ship ☐ edit ☐ drop

### 80. §10.4 · Red Flag 4 — Single-Sport Specialization Before Age 14 Without Physical Preparation

**Q.** Year-round single-sport training below what age is associated with more overuse injury and burnout?

- A. 10
- B. 14
- C. 18
- D. 21

**Answer:** B — 14

**Book line** (ch. 10, "Red Flag 4 — Single-Sport Specialization Before Age 14 Without Physical Preparation"):

> Year-round single-sport training in athletes younger than 14 is associated with higher rates of overuse injury and burnout.

Owner: ☐ ship ☐ edit ☐ drop

### 81. §10.5 · Red Flag 5 — The Athlete Stops Enjoying the Sport

**Q.** An athlete who loved the game becomes reluctant to go to practice, with no obvious reason. What does the Playbook say it may be?

- A. A motivational failure
- B. Overtraining — a physiological signal
- C. Laziness
- D. A phase to ignore

**Answer:** B — Overtraining — a physiological signal

**Book line** (ch. 10, "Red Flag 5 — The Athlete Stops Enjoying the Sport"):

> This is not a motivational failure. It is a physiological signal.

Owner: ☐ ship ☐ edit ☐ drop

### 82. §10.6 · Red Flag 6 — Rapid Technique Degradation Late in Sessions or Games

**Q.** What does late-session technique breakdown mean, according to the Playbook?

- A. Mental toughness training
- B. The athlete has exceeded their technical training capacity
- C. The drill is too easy
- D. Nothing — it is normal

**Answer:** B — The athlete has exceeded their technical training capacity

**Book line** (ch. 10, "Red Flag 6 — Rapid Technique Degradation Late in Sessions or Games"):

> Form breakdown late in a session — knee caving in, back rounding on hinges, arm swing disappearing, landings getting loud and stiff — means the athlete has exceeded their technical training capacity.

Owner: ☐ ship ☐ edit ☐ drop

### 83. §10.7 · Section 2 — Questions to Ask Any Coach

**Q.** What do a coach's answers to precise questions tell you more about than the facility tour?

- A. The coach's salary
- B. Program quality
- C. The team's schedule
- D. Nothing

**Answer:** B — Program quality

**Book line** (ch. 10, "Section 2 — Questions to Ask Any Coach"):

> The answers tell you more about program quality than the facility tour or the win-loss record.

Owner: ☐ ship ☐ edit ☐ drop

### 84. §10.8 · Section 3 — Training Load Management

**Q.** What should training load match, according to the Playbook?

- A. A fixed calendar PDF
- B. What the athlete's nervous system can currently express with good technique
- C. What older athletes do
- D. The number of hours available

**Answer:** B — What the athlete's nervous system can currently express with good technique

**Book line** (ch. 10, "Section 3 — Training Load Management"):

> What appropriate training volume looks like for ages 13–18 starts with one principle: load should match what the athlete's nervous system can currently express with good technique — not what a fixed calendar PDF demands.

Owner: ☐ ship ☐ edit ☐ drop

### 85. §10.9 · Weekly Volume Guideline (Starting Reference)

**Q.** In-season, about how many hard strength/power sessions a week does the starting reference cap?

- A. About 3
- B. About 7
- C. About 10
- D. No cap

**Answer:** A — About 3

**Book line** (ch. 10, "Weekly Volume Guideline (Starting Reference)"):

> Cap total hard strength/power sessions around 4–5 off-season and about 3 in-season — assuming 8–10 hours of sleep and solid nutrition.

Owner: ☐ ship ☐ edit ☐ drop

### 86. §10.12 · How to Talk to Coaches Without Starting a War

**Q.** How does the Playbook suggest opening a conversation with a coach?

- A. Lead with accusation
- B. Lead with observation, not accusation
- C. Email the club director first
- D. Post about it online

**Answer:** B — Lead with observation, not accusation

**Book line** (ch. 10, "How to Talk to Coaches Without Starting a War"):

> Lead with observation, not accusation.

Owner: ☐ ship ☐ edit ☐ drop

### 87. §10.13 · Multi-Team Math

**Q.** If the monthly calendar shows four high-intensity days in a row, what should happen?

- A. Nothing — fees are paid
- B. Something becomes a technical day, a mobility day, or a rest day
- C. Add a fifth
- D. Move them all to the weekend

**Answer:** B — Something becomes a technical day, a mobility day, or a rest day

**Book line** (ch. 10, "Multi-Team Math"):

> If you see four high-intensity days in a row, something has to become a technical day, a mobility day, or a rest day — even if a fee already paid makes that emotionally hard.

Owner: ☐ ship ☐ edit ☐ drop

### 88. §10.14 · Your Role as the Architect

**Q.** What is the one thing the Playbook says no book can give your athlete?

- A. Talent
- B. Consistency
- C. A coach
- D. Equipment

**Answer:** B — Consistency

**Book line** (ch. 10, "Your Role as the Architect"):

> The one thing no book can give your athlete is consistency.

Owner: ☐ ship ☐ edit ☐ drop
