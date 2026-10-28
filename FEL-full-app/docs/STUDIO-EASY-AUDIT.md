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

AFTER_TABLE

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
