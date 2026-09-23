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
