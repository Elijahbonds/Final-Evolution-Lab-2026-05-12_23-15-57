# Mirror capture protocol — tuning the thresholds on real people

**Your decision (2026-10-07):** the Mirror's and the Quick Screen's thresholds are finished by a capture you lead. You
and 2 other adults, on 2 phones (a mid-range Android and an iPhone), record **pose numbers only, never video**. **No
minors**: nobody under 18 is recorded, and nobody under 18 is in the shot. Every grader is then replayed against the
recordings, and each threshold moves from PROPOSED to TUNED when you sign it off.

This page is the whole job, in order. Allow about **20 minutes per person** with both phones recording at once, so about
**an hour** for the three of you, plus 15 minutes to set up.

---

## 1. What you need

- **Two phones:** the mid-range Android (Chrome) and the iPhone (Safari). Both charged above 50 %, or on a charger.
- **Your Mac,** with this repo, running the dev server (step 4). The recorder page exists only on the dev server.
- **Somewhere to prop the phones** upright at about hip height (a shelf, a chair with books, two phone stands).
- **A room** with about 3 m of clear floor in front of the phones and 2 m across, and a clear patch of **wall** (for the
  knee-to-wall test). A lamp you can switch to on its own (for the dim-light takes).
- **Three adults:** you (**P1**) and two others (**P2**, **P3**). Each wears fitted clothes in a colour unlike the wall,
  bare feet or flat shoes, and hair tied back.

## 2. The ground rules (read these to the two adults)

- **Numbers only, never video.** The phone shows the camera picture on its own screen while you record, and nowhere
  else. It is never saved and never sent. What is kept is 33 body points per frame (positions and how clearly each was
  seen). The page has no upload button and sends nothing.
- **No minors.** Nobody under 18 takes part, and nobody under 18 walks into the shot. If someone does, stop and
  re-record that take.
- **Aliases, never names.** People are P1 (you), P2 and P3. Nothing in a file names anyone. The capture set has no notes
  box, because a note is where a name would slip in.
- **Faults are done on purpose, gently.** About half the takes are a named fault (knees caving in, heels lifting). Do
  each one only as far as is comfortable. The landing-with-knees-in hops are optional. Anyone can skip any take or stop
  at any time.

## 3. Consent (read this to P2 and P3, and get a yes from each)

Read this aloud, or show it on screen, and wait for a clear yes from each person. They tick the second box on the
phone only after they have said yes.

> "I'm recording how your body moves, to tune the coaching in Final Evolution Lab. The phone does **not** save any video
> or photo of you. It saves only numbers: 33 points on your body, about 30 times a second, and how clearly the camera saw
> each one. The file is labelled with an alias (P2 or P3), never your name.
>
> You'll do some moves well and some on purpose a bit wrong, gently. Skip anything you don't want to do, and stop
> whenever you like.
>
> The numbers stay with me and are used only to tune the app's movement checks. I might add them to the app's code
> repository, which is **public**, under your alias. Is that OK, yes or no? If it's no, I'll keep your numbers on my
> computer only.
>
> If you change your mind later, tell me and I'll delete your files.
>
> Are you 18 or over, and happy to go ahead?"

Write down each person's answer to the repository question (yes/no) next to their alias, in your own notes, **not** in
any file you record. If anyone says no, see step 9.

## 4. Set up the Mac and the phones

**The dev server, over HTTPS.** A phone only allows the camera on a secure page. From `FEL-full-app/` in your usual
checkout:

```
npx next dev --experimental-https -H 0.0.0.0 -p 3443
```

Find the Mac's address on your Wi-Fi (System Settings › Wi-Fi › Details, for example `192.168.1.20`). On each phone,
open:

```
https://192.168.1.20:3443/dev/pose-record?set=capture
```

The phone will warn that the certificate is not trusted. On Android Chrome, tap Advanced › Proceed. On the iPhone,
tap Show Details › visit this website. If the camera still will not start:

- **Android:** plug it into the Mac, turn on USB debugging, open `chrome://inspect` on the Mac, and forward port 3443 to
  `localhost:3443`. On the phone, open `https://localhost:3443/dev/pose-record?set=capture`.
- **iPhone (or both phones):** make a certificate the phones trust with `mkcert`. This is a tool on your Mac, not an app
  dependency. Keep the files outside the repo, for example in `~/FEL-captures/certs`.
  1. Run `brew install mkcert`, then `mkcert -install`, then `mkcert 192.168.1.20 localhost`.
  2. Restart the server with `--experimental-https-key <the -key.pem file> --experimental-https-cert <the .pem file>`.
  3. AirDrop `rootCA.pem` (from `mkcert -CAROOT`) to the iPhone and install the profile.
  4. Turn it on in Settings › General › About › Certificate Trust Settings.

**On each phone:**

1. **Turn auto-lock off.** If the screen locks mid-take, the take is lost.
   - iPhone: Settings › Display & Brightness › Auto-Lock › **Never**.
   - Android: Settings › Display › Screen timeout › the longest setting. Keep the recorder page open so the screen
     stays on.
   - Put each setting back afterwards.
2. Turn on **Do Not Disturb** so a call or a notification does not take the screen.
3. Close other apps. Turn the brightness up. Lock the rotation, with the phone **upright (portrait)**.
4. On the recorder page:
   - **Take set** is already **Mirror capture** (from `?set=capture`).
   - Choose the **Person** (P1, P2 or P3) and the **Phone**: Mid-range Android (written `android-mid` in the file
     name) or iPhone (`iphone`).
   - Tick **"Everyone in this capture is 18 or over"**, and tick **"They read the consent … and said yes"** once they
     have.
   - Set **Lead-in** to **10 s**.
5. Tap **Start camera**. The skeleton appears over the picture when the model has you.

## 5. Where the phones go

- **Side by side, both upright,** front (selfie) camera facing the person, so the prompts on the screen face them too.
- **About hip height** (0.9 to 1.1 m), level, not tilted up or down.
- **2.5 to 3 m from where the person stands,** square to them. Stand on the spot and check the live line at the top
  of the picture. Head to feet must be in the shot, with a hand's room above the head. The jump needs more: if the line
  says "Leave room above your head", step back.
- **Mark the spot** on the floor with tape. Everyone stands on the same mark.
- **Behind the person:** a plain wall, no window, no mirror, nobody walking through.

## 6. Light

- Room lights on, light falling on the person from the front or the side. **No bright window behind them.**
- Leave the light as it is for every take except the two light takes at the end. Those are meant to be bad on purpose:
  `light.dim` with one lamp, and `light.far` from as far back as the room allows.

## 7. Recording a person

1. Both phones are set to the same person, with both statements ticked, and Start camera done.
2. Tap **Record all remaining** on both phones, within a second of each other. Both run the same takes with the same
   timing, so they stay together. Walk to the mark during the lead-in.
3. Each take shows a big prompt, counts down **3-2-1** (keep still and ready), then **GO**. Do the move. A beep marks
   the end. The next take's lead-in starts by itself.
4. **A take went wrong?** Someone walked in, a phone fell over, the wrong leg, a minor in the shot. Tap **Stop take** on
   both phones, then **Re-record** that take on both. To pause everything, press **Cancel take** (or Esc on a
   keyboard).
5. Between people: tap **Download all takes** on both phones (step 8), then reload the page and set the next person.

**Reps:** good takes are 5 reps (squat, press/row, hinge, push-up) or 3 (the rest). Fault takes are 3. Every take, its
label and its prompt are in the table at the end of this page (section 11). The jump takes ask the camera for 60 fps.
Each take saves the rate that phone really managed, so the report can show what each phone holds.

## 8. Saving, naming and sending the files

- **Download all takes** saves one file per person per phone. The name is set for you:
  `fel-capture-P2-android-mid-2026-10-09-1530.json` (alias, phone, date, time). That makes **6 files** in all
  (3 people × 2 phones), each about 70 MB (the button shows the size). **Never rename a file to include a name.**
- The iPhone saves to Files › Downloads. Android saves to Downloads.
- **Getting the files to the Mac:** AirDrop from the iPhone. Nearby Share or a USB cable from the Android. **Not**
  email, a chat app or a cloud drive: those copy the files to someone else's servers.
- Put the files in a folder **outside the repo**, for example `~/FEL-captures/`. Once they are ingested (step 9),
  delete them from the phones.
- **Never video.** If a phone offers to record the screen, or someone takes a photo, delete it. The recorder never
  needs one.

## 9. Ingest, then replay every grader

**A dry run first (optional, 2 minutes, no phones).** This writes two synthetic recorder files, built from the app's
own synthetic bodies (no person), and puts them through the same steps:

```
npx tsx scripts/mirror-capture.ts demo --out ~/FEL-captures/demo
npx tsx scripts/mirror-capture.ts ingest ~/FEL-captures/demo/*.json --out ~/FEL-captures/demo/fixtures
npx tsx scripts/mirror-capture.ts report --dir ~/FEL-captures/demo/fixtures
```

For the real files, from `FEL-full-app/`:

```
npx tsx scripts/mirror-capture.ts ingest ~/FEL-captures/fel-capture-*.json
```

The ingest refuses a whole file if anything in it is not allowed, and says why:

- something that is not numbers, or a picture or video;
- no "adults only" statement, or no consent;
- a name where an alias should be;
- a take the protocol does not have.

It keeps only the numbers the graders read. It drops the time of day and the full browser name, and it never copies
notes. It writes one compressed file per person per phone to `lib/mirror/fixtures/captured/`, such as
`P2-android-mid-2026-10-09.json.gz`, about 7 MB each (measured: 270 bytes a frame compressed). It also lists any takes still to record. If someone said **no**
to the repository question, add `--out ~/FEL-captures/fixtures` for their files and keep them out of the repo (see
step 10).

Then the report:

```
npx tsx scripts/mirror-capture.ts report --out ~/FEL-captures/report.md
```

(Use `--dir ~/FEL-captures/fixtures` to replay fixtures kept outside the repo.) For every check in every grader, the
report shows:

- **Before (PROPOSED):**
  - **Hit rate:** how many good takes it left clean.
  - **False alarms:** how many good takes it flagged.
  - **Catch rate:** how many of the matching fault takes it flagged.
- **By phone:** the same three numbers for the Android and the iPhone separately.
- **A suggested TUNED value:** the line that best separates the good takes from the fault takes. If the PROPOSED value
  is already the best, it says "keep".
- **After:** the same table at the suggested value.
- **Reps counted** on good takes, for each grader that counts them.
- **The jump:** the captured 60 fps read against the same take thinned to 30 Hz. This shows what the T5 opt-in gains.
- **Frame-rate log:** what each phone held, and whether the T5 high-rate trial would hold 60 on it or fall back.

**The report never changes a threshold.** You sign each one off yourself:

1. Change the number in the file the report names. Quick Screen numbers are in `lib/screen/PROPOSED-thresholds.ts`.
   Mirror numbers are in their audit files.
2. For a register entry, set `signedOff: true` and bump `THRESHOLDS_VERSION`. Then regenerate the table in
   `docs/MIRROR-ASSESS-THRESHOLDS.md`.

A suggestion marked "≈ worst value" is an estimate, because that grader adds a persistence rule of its own. Try it
live before you sign it.

## 10. Committing the fixtures (your call)

The repo is public. The fixtures are numbers only, under aliases, and pass `lib/pose/recordingsGuard.ts`, which checks
for:

- numbers only;
- no picture, video or free text;
- adults only, consent stated, and an alias.

Even so, they describe how a real adult moves. Commit a person's fixture only if they said yes to the repository
question. Otherwise keep their files in `~/FEL-captures/fixtures` and use `--dir` for the report. All six together are
about 40 MB compressed.

## 11. Every take

44 takes, about 13 minutes of recording per person per phone, plus lead-ins. The order groups the moves so nobody
turns round more than they must. "Side" means that side of the body faces the camera. For the lunge and T3, the leg is
the front leg or the standing leg.

**Calibration stand.** The Quick Screen's graders read each person's own standing lines from these.

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `stand.front` | good | front | — | 4 | Stand still facing the camera, arms relaxed at your sides. |
| `stand.side` | good | side (left side to camera) | — | 3 | Turn so your LEFT side faces the camera. Stand still, arms at your sides. |

**Squat (the Mirror's squat tab)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `squat.good` | good | front | 5 | 20 | Facing the camera: 5 slow bodyweight squats. Thighs to level, knees over your toes, heels down. |
| `squat.kneesCaveIn` | fault: knees cave in | front | 3 | 14 | 3 squats letting BOTH knees fall inward at the bottom. Only as far as is comfortable. |
| `squat.heelsLift` | fault: heels lift | front | 3 | 14 | 3 squats rising onto your toes at the bottom, so your heels lift. |
| `squat.shallow` | fault: shallow | front | 3 | 12 | 3 quarter squats: bend only a little. |
| `squat.shiftToOneSide` | fault: shift to one side | front | 3 | 14 | 3 squats shifting your hips toward your RIGHT at the bottom. |

**Split squat / lunge (the Mirror's lunge tab)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `lunge.left.good` | good | front · left leg | 3 | 16 | Facing the camera, LEFT foot forward: 3 slow split squats, back knee toward the floor. |
| `lunge.right.good` | good | front · right leg | 3 | 16 | Facing the camera, RIGHT foot forward: 3 slow split squats, back knee toward the floor. |
| `lunge.left.frontKneeCavesIn` | fault: front knee caves in | front · left leg | 3 | 16 | LEFT foot forward: 3 split squats letting the FRONT knee fall inward at the bottom. Only as far as is comfortable. |
| `lunge.left.trunkLean` | fault: trunk leans sideways | front · left leg | 3 | 16 | LEFT foot forward: 3 split squats leaning your upper body to one side at the bottom. |
| `lunge.left.shallow` | fault: shallow | front · left leg | 3 | 14 | LEFT foot forward: 3 split squats dipping only a little. |

**Press / row (the Mirror's press/row tab)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `pressRow.good` | good | front | 5 | 20 | Facing the camera, split stance: pull both elbows back, then press forward. 5 slow reps, shoulders down, body tall. |
| `pressRow.elbowFlare` | fault: elbows flare out | front | 3 | 14 | 3 press/rows letting your elbows flare out wide and high as you pull. |
| `pressRow.shrug` | fault: shoulders shrug up | front | 3 | 14 | 3 press/rows shrugging your shoulders up toward your ears on each pull. |
| `pressRow.trunkLean` | fault: trunk leans sideways | front | 3 | 14 | 3 press/rows leaning your upper body to one side on each rep. |

**Jump (Quick Screen T5 and the Mirror's jump tab).** The camera is asked for 60 fps on these.

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `jump.good` | good | front · 60 fps | 3 | 18 | Hands on hips. 3 jumps as high as you can: dip, jump, land softly, then stand still 2 seconds. |
| `jump.stiffLanding` | fault: stiff landing | front · 60 fps | 3 | 16 | Hands on hips. 3 LOW jumps landing with straight, stiff legs. Keep them small. |
| `jump.kneesCaveInLanding` | fault: knees cave in on landing (optional) | front · 60 fps | 3 | 16 | Hands on hips. 3 SMALL hops, letting the knees fall in a little as you land. Skip this if you are unsure. |
| `jump.armSwing` | fault: arm swing (hands leave hips) | front · 60 fps | 3 | 16 | 3 jumps swinging your arms up (hands leave your hips). |

**Hip hinge (the Mirror's hinge)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `hinge.good` | good | side (left side to camera) | 5 | 20 | LEFT side to the camera, hands on hips: 5 hip hinges. Push the hips back, back flat, soft knees. |
| `hinge.kneeDominant` | fault: knee-led (squats the hinge) | side (left side to camera) | 3 | 14 | 3 hinges bending the knees a lot and keeping the hips under you, more like a squat. |
| `hinge.roundedBack` | fault: rounded back, head forward | side (left side to camera) | 3 | 14 | 3 hinges letting the upper back round and the head drop forward. Only as far as is comfortable. |

**Push-up (the Mirror's push-up)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `pushup.good` | good | side (left side to camera) | 5 | 20 | LEFT side to the camera: 5 push-ups, body in one straight line (on your knees is fine). |
| `pushup.hipsSag` | fault: hips sag | side (left side to camera) | 3 | 14 | 3 push-ups letting the hips sag toward the floor. |
| `pushup.hipsPike` | fault: hips pike up | side (left side to camera) | 3 | 14 | 3 push-ups with the hips pushed up high (a pike). |
| `pushup.partial` | fault: partial reps | side (left side to camera) | 3 | 12 | 3 push-ups going only a quarter of the way down. |

**Overhead squat (Quick Screen T1)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `t1.front.good` | good | front | 3 | 16 | Facing the camera, arms straight overhead, feet shoulder-width: 3 slow overhead squats. |
| `t1.front.kneesCaveIn` | fault: knees cave in | front | 3 | 16 | Arms overhead: 3 overhead squats letting BOTH knees fall inward. Only as far as is comfortable. |
| `t1.side.good` | good | side (left side to camera) | 3 | 16 | LEFT side to the camera, arms straight overhead: 3 slow overhead squats. |
| `t1.side.armsForward` | fault: arms fall forward | side (left side to camera) | 3 | 16 | LEFT side to the camera: 3 overhead squats letting the arms fall forward in front of you. |
| `t1.side.heelsLift` | fault: heels lift | side (left side to camera) | 3 | 16 | LEFT side to the camera, arms overhead: 3 squats rising onto your toes at the bottom. |
| `t1.side.forwardLean` | fault: chest leans far forward | side (left side to camera) | 3 | 16 | LEFT side to the camera, arms overhead: 3 squats leaning the chest far forward at the bottom. |

**Knee to wall (Quick Screen T2).** Foot about a hand's width from the wall.

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `t2.left.good` | good | side (left side to camera) | 3 | 16 | LEFT side to the camera, left foot forward, a hand from the wall: rock the knee to the wall 3 times, heel down. |
| `t2.right.good` | good | side (right side to camera) | 3 | 16 | Turn round: RIGHT side to the camera, right foot forward: rock the knee to the wall 3 times, heel down. |
| `t2.left.heelLift` | fault: front heel lifts | side (left side to camera) | 3 | 16 | LEFT side to the camera, left foot forward: 3 rocks letting the front heel lift each time. |
| `t2.right.shortRange` | fault: short range (stops halfway) | side (right side to camera) | 3 | 16 | RIGHT side to the camera, right foot forward: 3 rocks going only halfway to the wall. |

**Single-leg squat (Quick Screen T3)**

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `t3.left.good` | good | front · left leg | 3 | 16 | Facing the camera, hands on hips, standing on your LEFT leg: 3 slow single-leg squats. |
| `t3.right.good` | good | front · right leg | 3 | 16 | Facing the camera, hands on hips, standing on your RIGHT leg: 3 slow single-leg squats. |
| `t3.left.kneesCaveIn` | fault: knees cave in | front · left leg | 3 | 16 | On your LEFT leg: 3 single-leg squats letting the knee fall inward. Only as far as is comfortable. |
| `t3.left.hipDrop` | fault: free-side hip drops | front · left leg | 3 | 16 | On your LEFT leg: 3 single-leg squats letting the hip of the lifted leg drop. |
| `t3.right.trunkLean` | fault: trunk leans sideways | front · right leg | 3 | 16 | On your RIGHT leg: 3 single-leg squats leaning the upper body sideways. |

**Light and distance (the "move closer, or add more light" line).** These are meant to be bad shots: the phone should
say the line, and every take above should not.

| Take | Good or fault | Camera sees | Reps | Seconds | What to do (shown on the phone) |
|---|---|---|---|---|---|
| `light.dim` | fault: dim light | front | 3 | 14 | Turn the room lights low (one lamp), then 3 bodyweight squats facing the camera. |
| `light.far` | fault: far from the phone | front | 3 | 14 | Step back as far as the room allows (5 to 6 m if you can), then 3 bodyweight squats. |

## 12. What the capture tunes

- **The Quick Screen register:** every graded check in `lib/screen/PROPOSED-thresholds.ts`. The knee cave, forward lean,
  arms forward, heel lift and depth (T1), the shin angle (T2), the knee cave, hip drop and trunk lean (T3), and the
  stiff landing and landing knee cave (T5).
- **The Mirror's audits:**
  - the squat (`squat-audit.ts`);
  - the lunge (`lungeAudit.ts`);
  - the press/row engine (`rules/config.ts`);
  - the hinge (`hingeAudit.ts`);
  - the push-up (`pushupAudit.ts`).
- **New in this phase, all PROPOSED:**
  - **The jump's 60 fps opt-in** (`lib/pose/modelChoice.ts`): it holds above 50 Hz with a detect within 12.5 ms, and
    falls back to 30 Hz otherwise.
  - **The lite model's confidence floor** (`lib/pose/confidenceFloor.ts`): a 0.5 median visibility over 1 s.

## 13. If something goes wrong

- **"Camera access was refused" / no camera prompt:** the page is not on HTTPS, or the certificate was not accepted. See
  step 4.
- **The live fps shows under 25:** close other apps, let the phone cool, plug it in. The take still saves what the phone
  did, and that number is useful in itself.
- **"Download (or reload) to switch sets":** the take set locks once a take exists, so the two sets never mix in one
  file.
- **A phone fell over or locked mid-take:** re-record that take on both phones. The report reads whichever copy was
  downloaded.
- **The ingest refused a file:** it prints why. Fix the cause and record again. Never edit a file by hand to make it pass.
