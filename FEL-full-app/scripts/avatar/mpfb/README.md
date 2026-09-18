# MPFB2 → FEL hero (ship pass 3, rung 1)

Blender authors, the forge finishes.

1. `blender -b --python scripts/avatar/mpfb/dress.py -- --out <mpfb-dressed.glb>`
   creates the human (metres), adds the **mixamo** rig, a CC0 skin, shirt,
   shorts, boots and eyes from the unpacked asset packs, decimates to budget,
   exports a GLB with textures. Requires Blender 5.1 with the MPFB2 extension
   installed from `~/Developer/FEL-swarm/tools/mpfb2` and the asset packs under
   MPFB2's user data (`…/extensions/.user/user_default/mpfb/data`).
2. `npx tsx scripts/avatar/import-mpfb.mts <mpfb-dressed.glb> <fel-hero.glb>`
   strips `mixamorig:`, folds extra bones into their kept parents with their
   weights, names materials to the contract (skin / jersey / shorts / shoes /
   eyes / hair), and writes the hero.
3. `/dev/rig?avatar=/models/candidates/<file>.glb&anim=/models/clips/npc_ericnash_run.glb`
   runs the Phase 0 rig audit on the result.
