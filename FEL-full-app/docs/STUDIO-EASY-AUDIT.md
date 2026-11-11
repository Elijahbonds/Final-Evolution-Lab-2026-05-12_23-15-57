# Nexus Studio: the ease and accessibility audit (STUDIO-EASY)

**Owner, 2026-10-28:** "Gameplay needs to be really clean. All tools need to be accessible, easy to use." The owner
confirmed this covers Nexus Studio and the editor. They want Nexus to be the best editor and game builder, and they build
the app with it.

- **Lane:** `lane/studio-easy`, cut from `origin/lane/finish-release` at `f7b6de6b`.
- **Merged in:** `lane/nexus-publish`, on the coordinator's decision 1 (section 6).
- **Measured on:** the "before" bundle was frozen at `f7b6de6b`. The "after" bundle is `058459b6` plus the merge.

## How it was measured

`scripts/probes/_studio-easy-probe.mts` drives the real `/studio` page module, `app/studio/page.tsx`, in headless
Chromium. The page sits between the real StatusRail and TabBar, as `app/layout.tsx` mounts it.

- **The bundle.** esbuild builds it through the a11y rig (`scripts/a11y/rig.mts`). Babylon is in the bundle, so the
  viewport is the mode's own engine path, on SwiftShader.
- **The server.** A throwaway http server serves `public/`.
- **The APIs.** Each page answers them with `page.route`:
  - the AI switch, off as production ships it, or on for the AI task;
  - a canned CELL answer;
  - one saved Closet look.
- **Widths.** 390 × 844 for a phone and 1280 × 800 for a desktop. Each run held the shared gate lock for 15 minutes or
  less.

Per task and width, the probe records:

- **taps:** clicks, as the probe counted them.
- **keys:** shortcut presses.
- **est. s:** a keystroke-level estimate of a person's time. Each tap costs think 1.35 s + point 1.1 s + press 0.2 s.
  Each key costs think 1.35 s + 0.28 s. Measured app waits are added.
- **words:** visible words inside the window.
- **dead end:** set when the task cannot be finished.

The probe also takes a jpg of each step. The accessibility pass covers:

- the audit's static scan per track: names, contrast, target size and landmarks (`scripts/a11y/inpage.ts`, judged by
  `lib/a11y/wcag.ts`);
- a real Tab pass;
- 200 % zoom;
- reduced motion.

Reproduce:

```
npx tsx scripts/probes/_studio-easy-probe.mts <out> before --build-only
flock /home/user/wt/gate-queue.lock timeout 900 npx tsx scripts/probes/_studio-easy-probe.mts <out> before --widths=desktop
flock /home/user/wt/gate-queue.lock timeout 900 npx tsx scripts/probes/_studio-easy-probe.mts <out> before --widths=desktop,phone --a11y
```

## 1. Per task: before

The "before" bundle is the shipped Studio at `f7b6de6b`. Rig waits are omitted where they were under 2 s.

### Start a new project

| | Desktop | Phone |
|---|---|---|
| Taps / keys | Dead end: no way to start a second project | Dead end |
| First visit | Opens on "My first venue": an empty court, 139 words on screen, no first step said | 104 words; the page is 735 px wide |
| Discoverability | No guide, no empty-state action, no template | Same |
| Errors and dead ends | One project per device. Starting over means Import or clearing site data. | Same |

### Make a first court that looks like something

Night light, floods and the walk-in intro played.

| | Desktop | Phone |
|---|---|---|
| Taps / keys | 7 taps + 1 key, est. 21.1 s | 7 + 1, est. 20.2 s, with a sideways scroll |
| Discoverability | Four places: the Mood list, the Stamps tab, the Intro list, the preview button | Same, off-screen |
| Hidden step | After a stamp is placed it is the selection, so the inspector shows the group. **Esc** is needed to get the court's own settings back. Nothing says so. | Same |

### Place and edit a venue element

A floodlight, then its colour.

| | Desktop | Phone |
|---|---|---|
| Taps / keys | 3 taps + 1 key, est. 11.6 s | 3 + 1, est. 11.1 s; **the inspector is off screen to the right** |
| Words | 119 | 47 in view |
| Undo | Ctrl+Z took the colour back; Redo lit | Same |
| Arrow keys | **Clash.** → nudged the light 0.5 m **and** the menus' arrow focus moved focus from Floodlight to Lamp post | Same |

### Build with the AI builder

| | Desktop | Phone |
|---|---|---|
| Switch off (production default) | "The Studio's AI builder is coming soon." over a greyed form with 5 disabled examples. **Dead end, no way on.** | Same |
| Switch on | 4 taps + 1 key, rig 15.3 s (CELL's answer 1.5 s), est. 14.9 s | 4 + 1, est. 14.3 s |
| Undo | One Ctrl+Z took the whole build back | Same |

### Make or cast a character

| | Desktop | Phone |
|---|---|---|
| Taps | 4: Characters, From my Closet, a look, Cast. Est. 10.6 s | 4, est. 10.6 s |
| With no saved look | "No saved looks…" said only that there were none. The way on was to paste a code. | Same |

### Add a script

| | Desktop | Phone |
|---|---|---|
| Taps | 2: Scripts, "Point won → cheer". Est. 5.3 s | 2; the page is 520 px wide |
| Keyboard | **No graph node takes focus** (mouse only) | Same |
| Empty state | "Make a script to start." with no button | Same |

### Test-play

| | Desktop | Phone |
|---|---|---|
| Taps | 1, which opens a new tab at `/dev/mode/tiebreak?venue=…` | 1 |
| Production | **Dead end:** "Play-test runs in a development build only." `/dev/mode` is a 404 there | Same |

### Save

| | Desktop | Phone |
|---|---|---|
| Taps | 0. Autosave went "Unsaved changes" → "Saved on this device" in 1.7 s | 0, in 1.3 s |
| Lost work | None found. It also flushes on hide and unload, and says so when the device won't keep it. | Same |

### Reopen

| | Desktop | Phone |
|---|---|---|
| Taps | 0. The project came back (1 object before, 1 after) | 0 |
| Project list | None: one project per device | None |
| Undo history | Gone after a reopen. Expected: it lasts one session. | Same |

### Publish or share

| | Desktop | Phone |
|---|---|---|
| Result | **Dead end.** Export (`.nexus.json`, 1 tap) is the only way to hand a project on | Same |
| On other branches | Publish is on `lane/nexus-publish`, unmerged. Account save is on `lane/studio-save` (#373), held. | |

### Across tasks

- **Text.** 35 of 85 visible text runs were under 12 px (10 and 11 px), across 6 sizes.
- **Jargon on screen:**
  - "FixtureLights · flood" and "NexusWebScene prop" on every asset;
  - "Building the venue on the mode's own engine path…";
  - "Budget · desktop";
  - "tennis court · venue settings";
  - "Closet share codes".
- **Chrome around a full-screen editor.** On desktop the page scrolls 57 px (857 of 800), which pushes the budget strip
  below the fold. On a phone the TabBar sits over the editor.
- **Icon-only header.** Save, Export and Import are bare icons, and a touch screen shows no tooltip.

## 2. Accessibility: before

| Check | Desktop | Phone | Notes |
|---|---|---|---|
| Static scan: names, labels, contrast, target size, per track | 0 critical, 0 serious, 1 moderate per track (landmark) | Same | The editor's controls are named |
| Tab pass | 7 moderate (focus-order). **12 Tabs to the first asset.** The viewport and inspector were **not reached within 120 Tabs** (the asset grid is ~150 stops) | **22 serious focus-obscured:** the TabBar covers focused assets. 8 focus-order | |
| Keyboard-only operation | Asset placement works. The viewport can be reached only after the asset list. Gizmo drags are mouse-only; arrows nudge instead. Script nodes are mouse-only | Same | |
| Keys off the Venues track | Ctrl+Z did nothing on Characters, Scripts and the AI builder. Ctrl+S opened the browser's "Save page" | Same | Read from the code; the handler lived in `venue-editor.tsx` only |
| Screen reader labels | Every control named (static scan). The viewport canvas is labelled. Script nodes are unlabelled SVG | Same | |
| Contrast | 0 findings | 0 | |
| Target size | 0 findings, by the spacing exception. Row icons were 16 px | | |
| Reduced motion | 0 animations running | | The intro preview already honours it |
| 200 % zoom (640 × 400) | **Sideways scroll:** 735 px in a 640 px window | | |

## 3. Ranked top-15 friction points (before)

1. **The phone cannot use the editor.** 735 px wide at 390, the inspector off screen, the 3D view a ~130 px sliver, the
   TabBar over it.
2. **No first step.** It opens on an empty court with 139 words of engine terms. A first court by hand is 7 taps + 1 key
   from 4 places, with a hidden Esc.
3. **Publish and share are a dead end.** Export is the only way on.
4. **Play-test works in a development build only.** The owner's live build cannot test-play.
5. **The AI builder is off by default.** "Coming soon" sits over a greyed form, with no way on.
6. **No new project and no project list.** One project per device.
7. **Keyboard.** The viewport and inspector are more than 120 Tabs away, and script nodes cannot take focus.
8. **App chrome round a full-screen editor.**
   - The desktop page scrolls, so the budget strip is below the fold.
   - The phone TabBar hides 22 focus stops.
   - **Arrow keys nudge and move focus at once** (measured).
9. **Undo, Redo and Save keys work on one track only.** Ctrl+S elsewhere opens the browser's save box. The keys are
   undiscoverable: tooltips only, no list.
10. **Small text.** 35 of 85 runs are under 12 px.
11. **Engine words on screen**, e.g. "FixtureLights · flood" and "engine path".
12. **Empty states with no action:** Characters, Scripts, AI off.
13. **Icon-only header actions.** A touch screen has no tooltip.
14. **A character needs a saved Closet look**, and the message did not say how to make one.
15. **200 % zoom scrolls sideways.**

**What already works well:**

- autosave in 1.3–1.7 s with no tap, and a flush on hide;
- reopen restores the project;
- undo is exact, and an AI build is one step;
- 0 critical or serious static findings;
- 0 animations under reduced motion.

## 4. The best editors: the ease bar, and the patterns adopted

| Editor | Pattern | Here |
|---|---|---|
| **Canva** | Start from a template; one tap gives a finished design you then change | **Adopted:** "Make it for me" builds a whole court in one undo step |
| **Roblox Studio** | A guided first place, and a Toolbox you drag from | **Adopted:** the three-step first-court guide; one-tap placement was already there |
| **Unity Hub / Figma** | A project list: New, Open, Recent | **Adopted:** Projects (New, Open, Delete, Export), on this device |
| **Figma** | "?" lists every shortcut; the same keys work everywhere | **Adopted:** the Help sheet, and Undo/Redo/Save/"?" on every track |
| **Figma** | After you place a thing, arrows nudge it | **Adopted:** placement gives the 3D view focus; the menus' arrow focus stands aside on `/studio` |
| **Canva mobile** | The editor as a bottom sheet with a thumb bar | **Adopted** from `lane/nexus-publish` (NEX-05) |
| **Figma / Canva** | A big, labelled Share in the top bar | **Partly:** Play-test in production; labelled Export, Projects and Help. Publish lives in the bottom strip (nexus-publish); a top-bar Publish is a follow-up |
| **All four** | Every empty panel says what goes there and offers the one action | **Adopted:** Characters, Scripts, AI off |
| **Unity / Figma** | Version history | Not done. Undo lasts one session; studio-save's server save is held (#373) |
| **Roblox Toolbox** | Thumbnails on assets | Not done; follow-up |

## 5. The fixes, before → after

Measured on the "after" bundle (`00b6255b` code; the later commits are docs, the probe and the release merges). "est." is the
keystroke-level estimate. On the rig Play-test and "Play it" open the development hand-off, because the rig is a
development build; the production path is held by `lib/nexus-studio/playtestLive.test.ts` against the shipped runtime.

### Tasks

| Task | Desktop before → after | Phone before → after |
|---|---|---|
| Start a new project | **Dead end → 2 taps** (Projects, New project), est. 5.3 s. The old project moves to the list | **Dead end → 2 taps**, est. 5.3 s |
| A first court that looks like something | **7 taps + 1 key, est. 21.1 s, from 4 places, hidden Esc → 2 taps, est. 5.3 s** ("Make it for me" (1), "Play it" (2)) | **7 + 1, est. 20.2 s, sideways scroll → 2 taps, est. 6.3 s** |
| Place and edit an element | 3 + 1, est. 11.6 s → 3 + 1, est. 11.2 s; undo exact | 3 + 1 with the inspector **off screen** → the inspector is a sheet tab. ~~Open: the colour fill timed out on the phone~~ **Closed by studio-22 (§8):** the rig never pressed Inspect; with the Inspect tap it is **4 taps + 1 key**, and the light's colour is now on the first screen when Inspect opens (it was 192 px below) |
| Arrow keys after placing | **Nudge + focus jumped** to the next control → **nudge only, focus stays on the 3D view** | Same fix, measured |
| AI builder, switch off (default) | "Coming soon" over a greyed form, **dead end** → an honest line (it runs on a paid AI service) and **Build by hand / Make your first court** | Same |
| AI builder, switch on | 4 + 1, est. 14.9 s → 4 + 1, est. 14.6 s; one Ctrl+Z takes it back | 4 + 1, est. 14.3 → 14.5 s |
| Character | 4 taps, est. 10.6 s → same. With no saved look the message now says how to make one, with an Open the Closet link | Same |
| Script | 2 taps → 2 taps (or 1 from the new empty state); **0 → 5 graph nodes take focus**; nodes move with the arrows and connect from a list | Same |
| Test-play | 1 tap; **production dead end → plays in production** on the game's own page as practice | Same |
| Save | 0 taps, autosave 1.7 s → 0 taps, 1.9 s | 0 taps, 1.3 → 1.5 s |
| Reopen | Restored → restored, and the other projects are listed under Projects | Same |
| Publish / share | **Dead end → Publish: 2 taps** (Publish, Check and download): it passed and downloaded the reviewed venue file to commit. "Make a share link" says "Share links are not switched on" (`STUDIO_SHARE_ENABLED` is off: an owner call) | **Dead end → 2 taps**; it passed on the phone too (the phone measure ran first) |

### Across tasks

| | Before | After |
|---|---|---|
| Phone page width at 390 | 735 px (overflow 345) | **390** (no sideways scroll), on every task screen measured |
| Desktop page height at 800 | 857 (the budget strip below the fold) | **800** |
| Text runs under 12 px (desktop, first screen) | 35 of 85 | **0 of 90** (the script graph's SVG node labels measured 10 to 11 px; raised to 12 px after the measure, not re-measured) |
| Distinct font sizes (desktop, first screen) | 6 (10–20) | 4 (12–20) |
| Words on the first screen (desktop) | 139, engine words included | 173, including the guide's card (about 30 words); the engine words are gone |

### Accessibility

| Check | Before | After |
|---|---|---|
| Static scan per track (desktop and phone) | 0 critical, 0 serious, 1 moderate (landmark) | Same: 0 / 0 / 1 |
| Tab pass, desktop | 120+ stops, the viewport **not reached**; 12 Tabs to the first asset | **62 stops in all; the 3D view at Tab 26**, the first asset at 14; skip links are first |
| Tab pass, phone | 22 serious focus-obscured (the TabBar) | **1 serious** (the canvas focus ring sits under the sheet's edge) |
| New finding | — | 1 critical focus-visible: the 3D view's canvas showed no ring when focused (it was never reached before). Fixed after the measure: the canvas's `outline-none` now gives way to the focus ring on `:focus-visible` (not re-measured) |
| Reduced motion | 0 animations running | 0 (the guide's hint pulse is off under reduced motion, the device's setting or the app's) |
| 200 % zoom (640 × 400) | Sideways scroll, 735 in 640 | **No sideways scroll** (640) |
| Keyboard on every track | Ctrl+Z / Ctrl+S on Venues only | Undo, Redo, Save and "?" on every track; Help lists every key |


## 6. The nexus-publish merge (coordinator decision 1)

`origin/lane/nexus-publish` (`e62518b8`) was merged with a merge commit, `47a0ee64`. The branch itself was not touched.

**Conflicts, and the side kept:**

- **`components/nexus-studio/studio-app.tsx`:**
  - imports: ours;
  - the header's action group: theirs' wrapping class, with ours' Projects and Help;
  - the AI track: theirs' phone stack, with ours' two ways on.
- **`components/nexus-studio/script-editor.tsx`:** theirs' stacked phone layout, its 11 px raised to 12 px.
- **`lib/nav/reachability.test.ts`:** both rows.
- **`lib/privacy/u13-lock-log.test.ts`:** ours first. PARENT was then re-pinned to `47a0ee64`, the first commit carrying
  every pending SQL file.
- **`docs/LANES.md`:** both rows.

Auto-merged, both sides kept: `venue-editor.tsx`, `characters.tsx`, `budget-meter.tsx`, `lib/data-rights/registry.ts`.

**What it brings:**

- the Studio on a phone;
- Publish with its gates (it downloads a reviewed JSON to commit);
- share links, HELD behind `STUDIO_SHARE_ENABLED`, which is off;
- published venues as the default place, with Restore.

Its table stays behind the pending-schema seam: `prisma/pending/2026-10-26-studio-share.sql` plus the data-rights
registry entry. `schema.prisma` and `public/_prisma/**` are untouched.

## 7. Gate (merged with `lane/finish-release` 82e88b7c, Node 22, database variables unset)

| Step | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `ci-suite` | 208 passed, 1 failed (`input-contract-tests.ts`), 11 skipped (the DB suites). The one failure came from this lane's new `/play/shared` index page; it is fixed with a reviewed exemption, and `input-contract-tests.ts` (12 checks) and `smokeTest.ts` (10 checks) pass when re-run alone. |
| `vitest run` | 2,050 files passed, 4 failed, 6 skipped; 27,336 tests passed, 4 failed, 54 skipped, 1 todo |

The 4 vitest failures:

1. **`lib/feel-panel/sessionGate.test.ts`.** The GameShell pin read
   `...(playtestRun ? …)`. nexus-publish made it `playtestRun || shareRun`, so a share run also starts unpaid. The pin now
   accepts that form; its meaning is unchanged. Fixed and re-run: `lib/feel-panel` and `components/nexus-studio` pass
   (139 tests).
2. **`lib/session-payout.test.ts`** (environmental). This "where the captures are on this machine" test runs only when
   `~/Claude/outbox` exists. On this container that folder holds one unrelated file (`vbt-routed.md`, 2026-10-25), so the
   cited capture files are missing. The test reads no file this lane changed.
3. **`lib/sessions/modeScoreRules.test.ts`** (environmental). Same cause as 2.
4. **`tests/signature-programs/server.test.ts`**, "a checkpoint week decides from the retests". The release's own test,
   pinned to `NOW = 2026-10-25`. No file it reads differs from `82e88b7c`, so it fails on the release as well.

## 8. studio-22: the last four, and 22 of 22 (2026-11-11)

Owner, 2026-11-11, on `docs/SWITCH-ON.md` §5's 18 of 22: "Fix the last 4 first", then the Studio goes on. Lane `lane/studio-22`,
cut from `lane/finish-release` at `bd030d9d`. SWITCH-ON's diagnosis ("the rig, not the Studio") was a claim; it was checked, and it
was half right.

**What was wrong, measured:**

| Run that did not finish | What it really was | Fix |
|---|---|---|
| Play-test, desktop and phone; first court, phone ("Invalid URL") | The rig. Reproduced on `bd030d9d`, 4 of 4 (desktop first court too): the rig read the new tab's address the moment the tab existed, when Playwright still reports an empty one. And the rig never followed the tab: on its static server `/dev/mode/tiebreak` was a 404, so "done" had only ever meant "a tab opened". | The rig waits for the tab's own address, and serves the real game page (`scripts/probes/studio-22/game-entry.tsx`, built by `game-build.mjs`) on the same origin, so a press is followed into the game: the engine drawing, the runtime's answer for which Studio venue the mode loads (it must be the one the Studio handed over), the run started as practice, a picture. `--prod` builds the Studio as production runs it, where Play-test hands the court over in the same tab to `/play/tennis?variant=tiebreak&share=…`. |
| The light's colour, phone | **Both.** The rig: it asked Playwright whether a colour field was visible to decide whether to press Inspect, and Playwright counted the colour inside the hidden sheet (no box, no client rects, its panel `display:none`) as visible, so the rig never pressed Inspect and the fill timed out, 9 of 9. The Studio: once a person does press Inspect, the phone's sheet is 108 px tall and the light's colour sat **192 px below the screen** inside it, under the Name / Position / Turn / Scale rows every object shares (`scripts/probes/studio-22/inspect-phone.mts`). | The rig presses the Inspect tab, as a person does. The Studio: opening Inspect on a phone (or picking another object while it is open) scrolls the sheet to the object's own fields (`lib/nexus-studio/phoneInspect.ts`; `inspector.tsx` marks where they start; `venue-editor.tsx` runs it). The light's role and colour are on the first screen: **192 px below → 0**. Desktop unchanged. Tests: `lib/nexus-studio/phoneInspect.test.ts`, `components/nexus-studio/phone-inspect.test.tsx`. |

Two more rig faults found on the way, both fixed: the rig's waits polled once per animation frame, and the game page draws
0.2 to 0.5 frames a second at 1280 × 800 on this shared machine's software renderer, so a 6 s check ran once or not at all (it
failed desktop first court once); they poll on a 100 ms timer now. And the game page's stylesheet was served without its type.

**The series: production build, 3 runs, both widths (`scripts/probes/studio-22/series.sh`, `summary.mjs`): 66 of 66 task runs
done, 22 of 22 in every run.** Tap counts, the same in all three runs:

| Task | Desktop | Phone | Against §5 |
|---|---|---|---|
| New project | 2 taps, 3 of 3 | 2 taps, 3 of 3 | Holds |
| First court ("Make it for me", "Play it") | 2 taps, 3 of 3; the game loads the Studio's court: night light, 4 Studio floodlights in the scene | 2 taps, 3 of 3; same | Holds, and now followed into the game |
| Place a light, change its colour, undo | 3 taps + 1 key, 3 of 3; colour on the first screen | **4 taps + 1 key** (Floodlight, Inspect, the colour picker's open and pick; Ctrl+Z), 3 of 3; colour on the first screen | Phone: first measured result (§5 had it open) |
| Arrow keys after placing | 1 tap + 1 key, nudge 0 → 0.5, focus stays on the 3D view, 3 of 3 | Same | Holds |
| AI builder (switch on) | 4 taps + 1 key, 3 of 3 | 4 + 1, 3 of 3 | Holds |
| Character | 4 taps, 3 of 3 | 4 taps, 3 of 3 | Holds |
| Script | 2 taps, 5 graph nodes take focus, 3 of 3 | Same | Holds |
| Play-test | 1 tap, 3 of 3: same tab to `/play/tennis?variant=tiebreak&share=…`, the mode loads the Studio's venue (source "shared", not competitive), the run starts with `playtest: true` | Same, 3 of 3 | Holds, and now followed into the game |
| Save | 0 taps to save (1 tap is the edit itself), autosave 1.6 to 2.0 s, 3 of 3 | 0 (+1 edit), 1.5 to 1.6 s, 3 of 3 | Holds |
| Reopen | Restored (1 tap is the edit), 3 of 3 | Same | Holds |
| Publish | 2 taps; the publish gate passed and downloaded the venue file, 3 of 3 | 2 taps (the phone measure first), 3 of 3 | Holds |

The development build (the configuration §5 measured, Play-test opening `/dev/mode/tiebreak?venue=` in a new tab): see
`docs/SWITCH-ON.md` §5 for its run.

Pictures (scratch, not committed): the game running from the Studio, `prod/{desktop,phone}-{playtest,firstcourt}-game-run{1,2,3}.jpg`;
the phone's Inspect before and after, `inspect-390-before.jpg` and `inspect-390-prod.jpg`.

