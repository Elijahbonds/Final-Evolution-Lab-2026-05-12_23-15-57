// M108 — premium venue dressing flag. Same rollback pattern as M105
// PROCEDURAL_CHARACTERS and M106 PROCEDURAL_ENVIRONMENTS: default ON, a single
// env override flips every enhanced prop/ground back to its plain M107 form
// instantly, with no code change and no redeploy of logic.
//
// When true (default), buildProp/buildGround in NexusWebScene.ts render the
// broadcast-grade dressing: hoop + goal nets, a living crowd texture on the
// stands, painted signage on banners, and a spotlight/ring floor for indoor
// arenas. When false, they fall back to the plain primitives.
export const PREMIUM_DRESSING =
  process.env.NEXT_PUBLIC_PREMIUM_DRESSING !== 'false';

// M108 — mocap dunk flag. When true (default), DunkMode's POWER launch plays
// 'dunk_mocap' (the user's real DeepMotion capture, feature-retargeted to the
// rig; see anim/authored/mocapDunk.ts). Set NEXT_PUBLIC_MOCAP_DUNK=false to
// fall back to the authored 'dunk_launch' clip instantly, no redeploy of logic.
export const MOCAP_DUNK =
  process.env.NEXT_PUBLIC_MOCAP_DUNK !== 'false';

// M111 — dunk finish variety flag. When true (default), DunkMode picks the
// aerial finish from the SLAM timing (perfect → windmill, good → tomahawk,
// clean → hang, mistimed/whiffed → blown flail) and the landing from the judge
// score (big → flex celebration, modest → crouch). Set
// NEXT_PUBLIC_DUNK_FINISH_VARIETY=false to fall back to the flat M110 finish
// (hang-or-land + crouch) instantly, no logic redeploy.
export const DUNK_FINISH_VARIETY =
  process.env.NEXT_PUBLIC_DUNK_FINISH_VARIETY !== 'false';
