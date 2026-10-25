# Camera-assisted async form review

Lane `lane/coach-video-review`, 2026-10-24. This is item 3 in the owner's coaching order: "the camera counts reps and flags
the bad one." TrueCoach, ATG and CoachNow have a coach watch every client video by hand. Here the phone does that work
first, and only pose data is sent.

**State:**
- The client side and the coach side are built, tested and measured.
- **Sending stays closed until the owner applies the pending SQL** (§7).
- Teens can't send (§4). Video clips aren't built (§5).

## 1. What the client does

1. On **Today**, each exercise the camera can read has a link: **Film a set — the camera counts reps and flags the bad
   one**. The link appears for a squat, a lunge or split squat, a hinge or deadlift, and a push-up
   (`lib/coach/formReview/movements.ts reviewMovementFor`).
2. `/coach/form-review?slot=…` shows one setup line, then **Start the camera**. The camera runs through the Mirror's own
   pose service (`lib/pose/PoseService.ts`). The client sees a self-view with the tracked skeleton and a live rep count.
3. When the client presses **Stop**, the phone shows:
   - the rep count and the worst flag, for example "6 reps counted. Left knee caves on rep 3.";
   - a strip with one chip per rep (clean, flagged, minor fault, or not read);
   - every flag with its reason and the Mirror's own cue for that fault;
   - the flagged rep replayed as a skeleton beside the client's best rep.
4. All of step 3 happens on the phone before anything is sent. The page always says: "Your video stays on your phone.
   Your coach gets the rep data and a skeleton replay."
5. **Send the rep data to my coach** posts pose data only (§3). Under **Sets you sent**, each set shows Waiting or
   Reviewed, and the client can delete it.

## 2. What the coach sees

**Clients → Form reviews** sits under "Needs you today":
- **To review** and **Reviewed** tabs. Unreviewed sets come first, and flagged sets come first among those.
- Each set shows the client, the exercise and its age, the worst flag in amber ("Left knee caves on rep 3 · +1 more"),
  the set score, and the trend for that movement ("Up 13 on the last set.", with small bars).
- Opening a set shows the rep strip and the flagged rep's skeleton replay (Play and scrub) beside the best rep. The joints
  the fault is read from are ringed.
- The coach replies with a **cue from the catalogue**, a short note (500 characters at most), or both. The reply is posted
  to the program's thread (ProgramMessage), and the set is marked reviewed. **Mark reviewed** marks it without a message.
  A double tap can't post twice (409). If the thread write fails, the set goes back to To review.
- The attention board shows "N filmed sets to review — the flagged rep first", which links to the queue.

The catalogue cues are:
- the flagged fault's own cue card (cue, escalate, regress);
- the set-up cues that fit the pattern (`lib/coach/taxonomy.ts SETUP_CUES`).

The request names a cue by id, and the server looks up the words.

**No voice note.** The thread stores text only (`ProgramMessage.body`). Audio would need its own storage and a schema
change. That is a follow-up, not something to fake.

Screenshots from the rig are in `scratchpad/round7/coach-video-review/shots/`: the phone at 390 px and the desktop at
1280 px, for both the record flow and the coach queue.

## 3. What is sent, and what is not

`lib/coach/formReview/payload.ts`. A submission holds:
- the movement, the program and the slot;
- the camera's aspect ratio and the set's duration;
- each rep's window, faults, knee side and whether it was read;
- keypoint tracks for at most 4 reps: up to 3 flagged reps and the best rep. Each track has 17 image joints, x and y in
  thousandths of the frame, and visibility, at 20 fps.

A 6-rep squat set measured **18.8 KB** of JSON.

No video, image or audio is sent:
- `parseSubmission` refuses any field outside that shape at any level: `video`, `clip`, an image, a data: URL. Each is
  answered `400 unexpected_field`.
- The scores and flags are recomputed on the server from the reps' faults, so the client's screen and the coach's queue
  agree.
- `tests/coach-video-review/privacy.test.ts` checks the feature's files statically. They contain no MediaRecorder, no
  canvas capture, no FormData or Blob body, no signed upload, and no direct getUserMedia. The test includes positive
  controls.

## 4. Who may send (the gates already in the app)

`lib/coach/formReview/gate.ts`:
1. **Live roster link.** The coach is the program's coach, and the client's CoachClient link is live. If the link ends,
   the set leaves the coach's queue. The client keeps it.
2. **Adults:** `canSaveScanNumbers` (verified 18+ and the AB-04 opt-in), called in the route itself. This is GAP 1 row
   **1k** in `lib/privacy/scanSaveGate.ts`. If an adult hasn't opted in, the page points to `/account`.
3. **The teen gate** (`lib/coach/teenGate.ts`):
   - under 13: never;
   - no birth year on file: the client is asked for it first;
   - 13–17: needs a guardian consent that covers coach training. None does today.

**OWNER CALL: teens.** The brief covers guardian-consented teens for pose data only. Two existing rules point the other
way:
- the owner's GAP 1 rule (`scanSaveGate.ts`): "a parent's approval is not grounds to save anybody's numbers";
- lane/coach-ai-draft (PR #436), which keeps Mirror form data adults-only "whatever a guardian said".

So the teen path is built and tested, and switched off: `TEEN_POSE_REVIEW_ENABLED = false`. A teen still films a set
and reads their own flags on the phone, as the Mirror already lets them. Turning it on is one constant. Minors never
send video either way (§5).

**assumption:** the AB-04 opt-in covers a form review's pose numbers ("There is no second consent"). Its wording says
"jump numbers". Owner call: does the form review need its own line?

## 5. The optional clip: not built (OWNER CALL)

`lib/coach/formReview/clipPolicy.ts` writes down the rule. It is tested, and `CLIP_UPLOADS_LIVE = false`. No route
accepts a clip.
- A minor never gets a clip. A guardian's consent, an opt-in or live storage doesn't change that.
- An adult gets a clip only with a tick for that one submission, and only when a rep was flagged.

**Why it isn't built.** The only private clip storage is coach-store's (`lib/coach-store/storage.ts`, bucket
`COACH_REVIEWS_BUCKET`). Reusing it is not clean:
- its object names are locked to `coach-reviews/{originals,replies}/<bookingId>/…` by another lane's security check;
- its consent lives in Booking columns;
- its 30-day delete clock starts when a paid review is delivered.

A coach-thread review has no booking. The phone side also has a gap: the Mirror has never recorded video next to the
pose.

**Proposed design, for the owner to approve or change:**
1. A new prefix `coach-reviews/form/<reviewId>/` in the same private bucket. It gets its own `assertObjectName` branch,
   added by coach-store's holder.
2. A lifecycle rule that deletes `form/` after **30 days** (owner action in GCS).
3. Two pending columns: `CoachFormReview.clipPaths` (JSONB) and `clipConsentAt`.
4. A per-submission tick with consent text the owner writes.
5. On the phone, a MediaRecorder runs beside the pose service. Only the flagged reps are cut out: `clipWindows`, up to
   3 reps, padded 0.5 s, 15 s at most in total. They are uploaded through a signed PUT. The full recording never leaves
   the phone and is dropped from memory when the page closes.
6. Clips are verified adults only. They are refused at the route, independent of the UI.

## 6. Retention (OWNER CALL)

- **Keypoint tracks are kept 90 days** (`TRACKS_KEEP_DAYS`). After that they are set to NULL by a bounded UPDATE that
  runs on the coach's queue reads, so no cron is needed. The replay then says "No replay kept".
- The numbers (scores, faults, reviewed state) stay for the trend until the client deletes the set or the account is
  erased. The foreign keys cascade.
- Follow-up: add the table to the account data export (`lib/prq-data-rights.ts`).

## 7. Owner action: the pending SQL

`prisma/pending/2026-10-24-coach-form-review.sql` adds the `CoachFormReview` table: additive only, two indexes, and
foreign keys to User and CoachingProgram. The file's header holds the Prisma model and the steps.

Until the SQL is applied:
- recording and the on-phone flags work;
- sending answers `503 form_review_not_ready`, and the page says sending opens soon;
- the coach's queue shows a not-ready line and a count of 0.

Nothing returns 500.

The u13 schema-ban pin moved to `02c1e49c`. lane/coach-ai-draft moves the same pin, so whichever lane lands second
re-pins to the merge.

## 8. How a rep is read, and the measured accuracy

`lib/coach/formReview/reader.ts` runs each movement's own tested audit on every frame:

| Movement | Audit | How a rep is counted |
|---|---|---|
| Squat | SquatAudit | squatStage's rule, with its own constants (REP_MIN_DROP / REP_END_DROP, shallow reps) |
| Lunge | LungeAudit | a depth hysteresis (see below) |
| Hinge | `stepSideRep` and `gradeRep` from `sideRepStage.ts` | the live stage's rep line |
| Push-up | `stepSideRep` and `gradeRep` from `sideRepStage.ts` | the live stage's rep line |

The lunge counts only faults that persisted `LUNGE_CUE_PERSIST_FRAMES`.

Measured on 2026-10-24 with `scripts/probes/_coach-form-review-accuracy.ts`, over 6 seeds and these sets:
- the stored fixtures, chained back to back;
- sets filmed with the synth's default jitter, drops and misses;
- the owner's real takes, as negatives.

| Movement | True reps | Counted | Flags | Flags on an injected rep | Injected reps flagged | Flags on clean sets |
|---|---|---|---|---|---|---|
| Squat | 103 | 103 | 15 | 15 | 15 / 21 | 0 |
| Lunge | 76 | 76 | 14 | 14 | 14 / 14 | 0 |
| Hinge | 77 | 77 | 12 | 12 | 12 / 12 | 0 |
| Push-up | 81 | 81 | 13 | 13 | 13 / 13 | 0 |
| **All** | **337** | **337** | **54** | **54 (100%)** | **54 / 60** | **0** |

- The 6 injected reps that were not flagged are heel lifts. Each one was detected and scored 75, which is above
  `FLAG_BELOW_SCORE`. They show in the rep strip as a minor fault.
- The knee side was right on **60 of 60** caves (left, right and both, over 12 seeds).
- Real negatives: standing still gives 0 reps for every movement. Running in place gives **1 false squat rep**. Shuffling
  gives 0.

**Findings about the live Mirror.** These are routed to the Mirror lanes, not changed here:
- **The live lunge count.** The harness feeds LungeAudit's velocity phase to RepCounter. Under the synth's default jitter
  that counted **24 of 76** lunges, but 4 of 4 noise-free. The reader here counts on LungeAudit's own `depth01`, armed at
  0.3 and closed below 0.1, which counted 76 of 76. The live lunge would likely miss reps on a real phone.
- **Side-on rep grading.** The live stage grades a rep on every frame since the previous rep closed. That hands the end of
  a faulty rep (a head still poked, a plank still sagging) to the next rep's grade. Measured, that gave 12 false flags of
  36. The reader here grades each rep on its own frames (`SIDE_REP_LEAD_MS = 0`), which gave 0.
- **Push-up setup hold under jitter.** With a 1.5 s still hold, the first push-up rep was not counted on 4 of 6 seeds,
  because jitter pauses the 1 s setup hold. The record page tells the client to stand still for a second, which is the
  same rule as the live stage.

## 9. New numbers (TUNE, owner call; nothing tuned before was changed)

| Number | Value | File |
|---|---|---|
| `FAULT_COST_BY_RANK` | 35 / 25 / 20 / 15 / 10, by coaching rank | `score.ts` |
| `FLAG_BELOW_SCORE` | 70 (one safety fault flags a rep; a lone late-order fault doesn't, unless it is the worst rep) | `score.ts` |
| `TREND_SAME_BAND` | 5 points | `score.ts` |
| `LUNGE_REP_ARM_DEPTH` / `LUNGE_REP_END_DEPTH` | 0.3 / 0.1 | `reader.ts` |
| `SIDE_REP_LEAD_MS` | 0 | `reader.ts` |
| `KNEE_SIDE_SHARE` | 0.5 | `reader.ts` |
| `TRACK_FPS` | 20 | `payload.ts` |
| `TRACKS_KEEP_DAYS` | 90 | `store.ts` |
| Clip limits (unused) | 3 reps, 0.5 s pad, 15 s | `clipPolicy.ts` |

These are coaching thresholds, not gameplay feel, so they are not feel-panel knobs (assumption: the panel is for
playtest runs).

## 10. Files

**New:**
- `lib/coach/formReview/{movements,reader,score,payload,gate,clipPolicy,reply,view,store,server}.ts` and their tests;
- `app/api/coach/form-reviews/{route,[id]/route,[id]/reply/route}.ts`;
- `app/coach/form-review/page.tsx`;
- `components/coach/form-review/{record-set,pose-replay,review-queue,review-count,film-set-link}.tsx`;
- `tests/coach-video-review/**`;
- `tests/helpers/{formReviewSets,formReviewAccuracy,fakeFormReviewDb}.ts`;
- `scripts/probes/_coach-form-review-{accuracy.ts,entry.tsx,probe.mts}`;
- the pending SQL.

**Shared, each one import and one mount:**
- `app/coach/_components/clients-view.tsx`: the queue. Changed under 24 h ago by profile-v2; coach-ai-draft also adds 3
  lines.
- `app/coach/_components/today-view.tsx`: the Film a set link.
- `components/coach/attention-panel.tsx`: the count.

**Shared, the privacy registry:**
- `lib/privacy/scanSaveGate.ts`: row 1k.
- `scanSaveGate.test.ts`: the id list gains 1k.
- `scan-save-coverage.test.ts`: a CoachFormReview detector, which tightens the check.
- `u13-lock-log.test.ts`: the PARENT pin.

**Read, not edited:** the skeleton painter `app/play/mirror/assess/_components/skeleton.ts`.
