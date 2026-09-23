# Models pass — ten phases (2026-09-22)

Owner ask: "better models for all the modes" (22 rigged Meshy characters + their running / walking clips,
`~/Downloads/Meshy_models_20260922_120651`), "planes and karts" (10 static textured vehicle bodies,
`~/Downloads/Meshy_models_20260922_122622`), "do the models pass after this one, all modes, animations too". Decisions:
the owner casts hero / rival per mode from a contact sheet (the one stop); commit per green phase; ONE deploy at the end.
Standing rules: baked textured GLBs or nothing; characters must be rigged; opponents are roster-only; the scan hero is the
owner's only (env allowlist); the kit body is everyone else's default.

Staged for the browser as symlinks (never tracked): `public/models/incoming-characters`, `public/models/incoming-vehicles`.
Inventory: `~/Claude/outbox/finish-release/meshy-2026-09-22/INVENTORY.md`.

1 Baseline + inventory — what every mode's bodies are today (hero, rivals, crowd, vehicles), the roster's 22-bone rig and its
  clip set, the drop's rigs (24 joints: `Spine01/Spine02/neck` spellings, arms bound at ~110° — a T/A bind unlike the
  roster's 14°), the vehicles' size (1.4 M triangles, 60 MB), the fps / GPU-memory numbers per mode.
2 The route — measured on ONE character both ways: (a) the Meshy rig driven directly (a rename map in rigNormalize + the
  bind frame) vs (b) `scripts/meshy/skin-transfer.py` onto the FEL 22-bone skeleton (the roster's proven path). Gate 0,
  idle / run / a sport clip, T-frames, arm reach; pick the route.
3 The pipeline — one script converts all 22 (Blender 5.1 batch), decimates and packs textures to the tier budgets
  (desktop ≤ 6 MB / 2K, mobile ≤ 2 MB / 1K), writes `public/models/athletes/<name>.glb` + a manifest; Gate 0 on all.
4 The contact sheet — a dev-only viewer (`/dev/model?url=`, no auth, the /dev/mode pattern) and a probe that renders
  front / three-quarter / running frames per character to `~/Claude/outbox/finish-release/meshy-2026-09-22/SHEET/`;
  the owner casts (hero / rival / crowd per mode) — the one stop of the pass.
5 The vehicles — `bake-prop.py` the 10 bodies (forward axis, real metres, pivot, decimate, 2K), seat them on the kart and
  aircraft roots (the physics boxes stay), fps and draw calls before / after.
6 Animation on the new bodies — the FEL clip set on every converted character (idle, run, the sport clips) under the
  readability probe: T-frames, contact clips, foot planting; the Meshy running / walking clips imported beside them if the
  rig is kept.
7 Casting applied — the roster and hero-body tables take the owner's sheet: per-mode rivals and crowd, the kit-body
  default, the mobile variants; roster-only for opponents; the scan stays the owner's.
8 Performance — GPU memory / skinned vertices / fps per mode before vs after on both tiers; the budget holds or the
  decimation ratchets.
9 Presentation — the pickers (Closet, rivals), names on the cards, the sheet's names in the HUD where a rival is named.
10 Ship — every mode's smoke green with the new bodies, the one deploy, the summary.

## Landed (2026-09-22)

| phase | commit | what |
|---|---|---|
| 1+2 | 13b76ee | inventory + plan; `/dev/model` viewer; `_model-sheet.mts`; the route test: the shipped Meshy rig is REJECTED by Gate 0 (Spine01/Spine02/neck, A-pose bind) → route B, `skin-transfer.py` onto the T-posed 22-joint donor |
| 3 | bed5449 | `batch-meshy22.sh`: all 22 onto the FEL rig, two tier packs, a manifest — 0 errors |
| 4 | measurement | the contact sheet: 22 of 22 clean (22 joints, 1.78 m, 238 clips, 0 locked-T frames) |
| 5 | 0582fd3 | `batch-vehicles.sh` + `vehicleBody.ts`: the 10 planes and karts baked (~4 MB each from 35–61 MB), seated on the kart and aircraft roots |
| 6 | 05aeee8 | converted bodies as the hero in five sports: every sport clip plays, 60 fps, no locked T; the smoke gained `HERO=` and a perf sample |
| 7 | 7301321 | the cast: 22 into the roster, `MODE_CAST` for 25 modes (rivals and crowd draw from a mode's cast first); the owner chose rivals + crowd by look, heroes stay the player's body |
| 7b | 7cf5f22 | the 22 pass the shipped-avatar gate (float32 skins, sibling manifests) |
| 8 | measurement | performance with the cast in the crowded modes (table below) |
| 9 | in 7301321 | the sheet reads the cast (`cast-sheet.py`); the Closet / rival pickers were not touched: heroes stay the player's body, so there is nothing new to pick |
| 10 | pending | every enabled mode's smoke with the new bodies; the one deploy |

### Phase 8 — performance with the cast (0.6 / 1K pack, 15 s under the intent drivers)

| mode | fps median / p10 | active meshes max | skinned vertices max |
|---|---|---|---|
| threevthree | 60 / 59.9 | 121 | 241,180 |
| volleyball | 60 / 59.9 | 115 | 322,452 |
| skateboard | 60 / 59.9 | 170 | 218,805 |
| carnival | 60 / 59.9 | 31 | 48,878 |
| dunkduel | 60 / 59.9 | 93 | 151,972 |
| onevone | 60 / 59.9 | 100 | 158,556 |

The budget holds in every crowded mode; the decimation does not ratchet. No pre-cast skinned-vertex baseline exists (the
sample was added to the smoke in phase 6, after the cast bodies were already the roster).

### Phase 10 — every enabled mode with the new bodies
(pending: the all-modes smoke)

### Open
- the plane bodies carry a pilot sculpted into the cockpit; the hero sits on the seat anchor over it
- the Meshy running / walking clips were not imported: the bodies play the FEL clip set on the same rig; the Meshy clips would need a retarget onto the 22-bone rig
- 7301321 was pushed with one red test (the shipped-avatar gate); 7cf5f22 fixed it before anything deployed
