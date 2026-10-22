# Phone test checklist

For the owner, on your own phone, on the live site. One pass covers every mode on the Play shelf: 33 modes in 7
families (`lib/nav/families.ts`). Allow about 10 minutes for each family.

The game reports its own problems to the server (`game_diag`). The last section shows how to read them back.

---

## Before you start

- **Sign in as yourself.** The diagnostics are filed under your account, which is how you find them later. Only
  `/try` works without signing in.
- Note the **time** you start, the **phone model**, and **Wi-Fi or mobile data**.
- Sound **on**, silent switch **off**.
- Motion setting on **AUTO** (the chip on each mode's start screen).
- **Battery above 50%**, low-power mode **off** (low-power mode slows the game on purpose).

## How to report a problem

One line for each problem:

> **mode** · what you did · what you saw · the time

- A **screenshot** or **screen recording** is worth more than any description.
- "Felt off" counts: name the moment ("the jump after the run-up felt late").
- If a mode **crashes or shows an error screen**, write down the exact words on the screen.

---

## Every mode: the generic checks

Do these in the first mode of each family, and in any mode that feels different.

**1. Load time.** Count from tapping the mode to the **READY** card, then to being able to play.

- Good: under about 15 s on Wi-Fi.
- Report: the seconds, and whether it got stuck on one step. "Load timed out" is always a report.

**2. Smoothness.** Play for 30 seconds.

- Good: steady motion, no freezes.
- Report: a freeze longer than half a second, especially in the first few seconds of play; constant stutter; the phone
  getting hot.

**3. Sound.** Music and effects start after your first tap.

- Report: silence, sound that cuts out, or sound that keeps playing after you leave.

**4. The controls overlay.** On the left, a stick with small d-pad arrows beside it. On the right, four buttons in a
diamond, each with a word on it.

- Good: each button does what its word says, and a held button shows a ring.
- Report: a button that does nothing, a wrong label, or your thumb covering something you need to see.

**5. Portrait, then landscape.** Turn the phone during play.

- Good: in landscape the game fills the screen like a console game. In portrait it uses most of the screen. Your
  player stays in view.
- Report: the player lost off the edge, the camera jumping, squashed text, or a button under the notch.

**6. Leave and come back.** Switch to another app for 10 seconds, then return.

- Good: the game is paused, or carries on cleanly.
- Report: a black screen, an error screen, or lost sound.

**7. The end screen.** Finish a round.

- Good: the score and the buttons (Play again, Next) all work.
- Report: a button that does nothing, or a score that looks wrong.

**8. Ten minutes in one mode** (once in the whole pass; pick Dunk or 3v3).

- Report: the page reloading on its own, the phone getting hot, or the game slowing down over time.

---

## Hoops

### Flight Night (Dunk), `/play/dunk`

Also try **`/try`** signed out: the guest's first dunk.

- Hold **RUN** to run up, then let go or tap to jump.
- Press **SLAM** in the window at the top.
- Try **STYLE** and **PROP** on later dunks.
- Good: run, jump and dunk, then a score card. Dunk 1 on `/try` is plain; the crowd and props arrive after it.
- Report: the jump firing early or late, a slam window you can never hit, or the camera losing you.

### Ones (1v1), `/play/onevone`

- Move with the stick. Flick it the other way for a crossover.
- Hold **SHOOT**, then release at the top of the meter.
- On defence: tap **SHOOT** to steal, **BLOCK**, and hold **CHARGE**.
- Good: first to 11 plays through; the meter feels fair.
- Report: the ball leaving your hand wrong, the AI stuck, or the score not counting.

### Threes (3v3), `/play/threevthree`

- **PASS** to a teammate, call a **SCREEN**, hold and release **SHOOT**.
- Play the whole 90-second clock.
- Good: teammates move and catch passes; first to 21 or the clock ends the game.
- Report: a teammate frozen, a pass to nobody, or a hand going through the ball.

### Downtown (3-Point), `/play/threepoint`

- One press of **SHOOT** for each shot. The timing is the whole game.
- Shoot a full rack.
- Good: one press is one shot, and good timing goes in.
- Report: a press that does nothing, a double shot, or a long wait before play starts (this mode loads slowest).

### Prove It (Dunk Duel), `/play/dunkduel`

- Run up and slam as in Dunk.
- Use **PROP** to bring out the chair.
- Good: you and the rival take turns, and a winner is called.
- Report: the rival's turn never ending, or the chair not appearing.

---

## Combat

### The Hundred (Karate), `/play/karate`

- **JAB**, **KICK** and **HEAVY**.
- Tap **DASH** to dash; hold it to guard.
- Last a few waves.
- Good: hits land with a clear reaction, and waves keep coming.
- Report: hits passing through enemies, being stuck in a guard, or a long load.

### Storm Duel (Karate VS), `/play/karate-vs`

- The same buttons as Karate. Double-tap **DASH** for the chakra dash.
- Chain two hits.
- Good: combos chain, and a winner is called.
- Report: the second hit dropping a combo, or the opponent standing still.

### Ring's Edge (Mixed Combat), `/play/mixedcombat`

- **STRIKE**, **KICK** and **HEAVY**. Hold **DASH** to guard.
- Good: a full fight to a result.
- Report: fighters stuck together, or the camera inside a wall.

### Duel, `/play/duel`

- Pick a weapon: **FISTS**, **BLADE** or **STAFF**. **BLOCK** to defend.
- Good: reach matters, and a winner is called.
- Report: a weapon that does nothing.

### Showdown, `/play/showdown`

- **JAB**, **KICK** and **GUARD**. Save **ULTIMATE**. Swap to your partner.
- Good: the partner swap works, and the ultimate lands.
- Report: the ultimate never charging, or the partner missing.

---

## Board

### Venice Lines (Skateboard), `/play/skateboard`

- Hold **PUMP** for speed, then **POP** to jump, **FLIP** and **GRAB** in the air.
- Good: tricks score, and you land or bail clearly.
- Report: falling through the ground, or tricks not scoring.

### Gate Crasher (Snowboard), `/play/snowboard`

- Steer through the gates. **JUMP**, **SPIN**, **GRAB**. Hold **TUCK** for speed.
- Good: the slope and the gates are clearly visible.
- Report: **an all-white screen where you cannot see the slope** (a known old issue, possibly fixed), or missed gates
  not counting.

### The Break (Surf), `/play/surf`

- Hold **CARVE** on the wave, **CUTBACK**, then **AIR** off the lip and **GRAB**.
- Good: the wave carries you, and tricks score.
- Report: the board stuck, or the wave missing.

### Stomp (Big Air), `/play/big-air`

- Run up with the **d-pad's left and right arrows** (beside the stick) in rhythm, then **SPIN** in the air and **STOMP** to land.
- Good: rhythm gives speed, and a clean landing scores.
- Report: the arrows doing nothing, or every landing failing.

---

## Racing

### Velocity Kart, `/play/velocity-kart`

- Hold **GAS**. Hold **DRIFT** through a corner. Use **FIRE** for items, **BRAKE** to slow.
- Good: a full race to a finish position.
- Report: going through walls, the race not ending, or stutter in the first lap (this mode is heavy on a phone).

### Aero Aces, `/play/aero-aces`

- **GAS** and **BRAKE**. **FIRE**. **STUNT**.
- Good: flying through the course to a result.
- Report: the plane stuck, or the camera lost.

### Free Run, `/play/freerun`

- **JUMP** to vault, **SLIDE**, and **FLIP / KICK** in the air or at hazards. Save **OVERDRIVE**.
- Good: the run flows, and obstacles respond.
- Report: stuck on a ledge, or a vault that never triggers.

### Beach Sprint, `/play/sprint`

- Alternate the **d-pad's left and right arrows** in a steady rhythm. Mashing is slower than rhythm.
- Good: rhythm wins.
- Report: no speed from the arrows.

---

## Field & Court

### Breakaway (Football), `/play/football`

- **HURDLE**, **JUKE L** and **JUKE R** past tacklers. Hold **TRUCK** to run through one.
- Good: tackles and jukes read clearly.
- Report: a juke that does nothing, or the camera too close or too far.

### Twelve Yards (Soccer), `/play/soccer`

- **STRIKE** for a penalty. **CLASSIC** at the start of a kick switches to classic pens.
- Good: aim and power make sense, and the keeper reacts.
- Report: the ball going nowhere.

### Moonshot Derby (Baseball), `/play/baseball`

- **SWING** at pitches. **BAT FLIP** to build up a big swing.
- Good: timing decides the distance.
- Report: a swing that never connects.

### Match Point (Tennis), `/play/tennis`

- **DRIVE**, **SLICE**, **DROP** and **LOB**. Play a full game.
- Good: rallies happen, and the shot types differ.
- Report: the ball through the racket, or the score not counting.

### Beach Rally (Volleyball), `/play/volleyball`

- **HIT** and **BLOCK**. Call the set with **QUICK** or **HIGH**.
- Good: rallies and points.
- Report: the ball stuck, or a hit that does nothing.

### The Loop (Golf), `/play/golf`

- Choose with **CLUB**, set the **PAD**, then **SWING** on the meter.
- Good: shots go where the meter says.
- Report: a ball lost off the map, or a meter that never stops.

### Tiebreak Blitz, `/play/tiebreak`

- The two big **SWING** buttons, left and right.
- **Watch the first 10 seconds in portrait.**
- Good: you stay in view.
- Report: **the camera losing your player or jumping in portrait.** The test rig saw this in 4 of 5 loads, and this
  phone check decides whether it needs fixing.

---

## Party

### Game Night (Court Carnival), `/play/carnival`

- **GO**, **TRICK**, **POWER**, and hold **CHARGE**. Play through two or more events.
- Good: each event explains itself, and the next one loads.
- Report: an event whose hint does not match the buttons.

### Brain Brawl, `/play/brain-brawl`

- Answer with **A, B, C or D**.
- Good: questions read clearly, and the score counts.
- Report: text cut off, or an answer not registering.

### Spot the Scene, `/play/who-scene-it`

- Pick the place with **A–D** while the scene shows behind the card.
- Good: the scene loads behind each question.
- Report: a blank scene.

### Hang Time, `/play/irl`

- Allow motion access, then jump holding the phone safely. **Do not throw it.**
- Good: it measures your jump.
- Report: no motion prompt, or zero every time. This mode sends no `game_diag`, so describe it.

---

## Craft

### The Cypher (Dance), `/play/dance`

- **TAP** on the beat. In MATCH mode, use **A, B, X and Y**.
- Good: taps judged on the beat, and the music in sync.
- Report: the beat and the judging drifting apart.

### Groove Academy (Music), `/play/music`

- Make a short loop, play it back.
- Good: sound plays when you tap.
- Report: silence, or lag between tap and sound. This mode sends no `game_diag`.

### The Read (Acting), `/play/acting`

- Allow the microphone and read a line. Audio never leaves the phone.
- Good: your delivery is scored.
- Report: no mic prompt, or always zero. This mode sends no `game_diag`.

### The Nexus Initiative (Story), `/story`

- Open the map and start the first node.
- Good: the map loads, and the node opens its mode.
- Report: a node that will not open. This mode sends no `game_diag`.

---

## Off the shelf (once each)

- **Party with a friend:** `/party`, two phones, join by code, chat, Start together. The full steps are in
  `docs/OWNER-RUNBOOK.md` §13.
- **Couch room:** `/play/party` on a TV or laptop, with phones joining as controllers.
- **Feel panel** (only after runbook §12): `/play/threevthree?playtest=1`, then the **FEEL** tab on the left edge.

---

## Reading back what the phone reported (`game_diag`)

Every mode run through the game engine reports problems on its own. You do not need to do anything during play.

| Kind | What it means, in plain language |
|---|---|
| `load` | a slow, stuck or failed load, or the "warming up" step hitting its limit |
| `frame` | the camera lost your player and had to re-centre |
| `cam` | the camera got boxed in and switched to an overhead view |
| `ident` | a character's look failed to load |
| `clip` | an animation was missing |
| `context` | the phone's graphics reset (often after switching apps) |

Each kind is sent at most once every 10 seconds, so a count is "how often", not "how many frames".

Music, Acting, Hang Time and Story send none. React page crashes go to the server log, not here (see "Crashes" below).

### Option 1: on the phone, in the browser

This needs your account's role to be `admin` (`docs/OWNER-RUNBOOK.md` §12). While signed in, open:

```
https://<SITE_HOST>/api/admin/diag?hours=3
```

- `byMode`: counts of each kind for each mode.
- `recent`: the last 50 lines.
- `user` means a signed-in player and `guest` a guest. Your own lines are the `user` lines from the time of your pass.
- `hours` can be 1 to 336 (two weeks).

### Option 2: read-only SQL (yours, against production)

Your own pass only (replace the id and the start time):

```sql
SELECT "createdAt", props->>'mode' AS mode, props->>'kind' AS kind, props->>'detail' AS detail
FROM "AnalyticsEvent"
WHERE name = 'game_diag' AND "userId" = '<your user id>' AND "createdAt" > '<pass start, e.g. 2026-10-21 18:00>'
ORDER BY "createdAt";
```

Every phone, last 7 days, by mode:

```sql
SELECT props->>'mode' AS mode, props->>'kind' AS kind, count(*)
FROM "AnalyticsEvent"
WHERE name = 'game_diag' AND "createdAt" > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

Pre-warm cap hits and load timeouts (`docs/SHIP-READINESS.md` §6, calls 1 and 2):

```sql
SELECT props->>'mode' AS mode, props->>'detail' AS detail, count(*)
FROM "AnalyticsEvent"
WHERE name = 'game_diag' AND props->>'kind' = 'load'
  AND (props->>'detail' LIKE 'shader pre-warm hit its cap%' OR props->>'detail' LIKE '%load timed out%')
  AND "createdAt" > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

### Crashes (not in `game_diag`)

A page crash shows the crash screen and writes a `[FEL-CRASH]` line to the server log. To read it (assumption: the
default Cloud Logging setup of the Firebase backend):

```sh
gcloud logging read 'textPayload:"[FEL-CRASH]" OR jsonPayload.message:"[FEL-CRASH]"' --project final-evolution-lab --freshness=1d --limit 50
```

### What counts as a clean pass

- **Zero** `load` lines that say "failed" or "timed out" during your pass.
- **No** crash screen.
- A few `frame` or `context` lines are worth a look, but they are not a failure on their own. Tiebreak `frame` lines in
  portrait are the known one.

Send the lines with your notes, and the launch checklist rows A2, A3 and B5 can be updated
(`docs/LAUNCH-CHECKLIST.md`).
