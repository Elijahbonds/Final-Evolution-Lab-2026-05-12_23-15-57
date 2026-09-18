// PlayerRing — "add a stamina ring around the player and a player indicator so you know who you are controlling. Put
// an icon of their choice at the bottom that's relevant to their creator card — a basketball, musical note, camera,
// controller for gamer, dance" (owner, 2026-09-17).
//
// A flat ring at the feet whose arc is the stamina (the turbo tank where the mode has one), in the player's colour; a
// glyph puck LOW, beside the ring on the camera's right (owner: "put the icon low next to the stamina bar"). The ring rides
// the root; the puck follows the root each frame at a camera-relative offset; the glyph is drawn once, the arc only when it changes.
import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Scene } from '@babylonjs/core';

export type RingIcon = 'basketball' | 'music' | 'camera' | 'controller' | 'dance' | 'art' | 'pen' | 'chef' | 'fashion';
/** The glyph per icon — emoji, which every platform's canvas draws (no font to ship). */
export const RING_GLYPH: Record<RingIcon, string> = { basketball: '🏀', music: '♪', camera: '🎥', controller: '🎮', dance: '💃', art: '🎨', pen: '✍', chef: '🍳', fashion: '👕' };

export interface PlayerRingHandle { set(stamina01: number): void; setIcon(icon: RingIcon): void; dispose(): void }

/** True when a MODE mounted its own ring in this scene (1v1, 3v3, 3PT, dunk, the three fight modes) — the harness stays out. */
export function modeOwnsPlayerRing(scene: Scene): boolean { return !!(scene.metadata as { felPlayerRingMode?: boolean } | null)?.felPlayerRingMode; }

export function mountPlayerRing(scene: Scene, root: TransformNode, opts: { color?: string; icon?: RingIcon; radius?: number; stamina?: boolean; harness?: boolean; y?: number } = {}): PlayerRingHandle {
  if (!opts.harness) ((scene.metadata ??= {}) as { felPlayerRingMode?: boolean }).felPlayerRingMode = true;   // PLAYER RING (all modes, 2026-09-17): a mode's own ring wins
  const color = Color3.FromHexString(opts.color ?? '#22d3ee'); const R = opts.radius ?? 0.62;
  // the ring: a disc at the feet with a dynamic texture (an arc for the stamina over a faint full ring)
  const ring = MeshBuilder.CreateDisc('player_ring', { radius: R, tessellation: 48 }, scene);
  ring.rotation.x = Math.PI / 2; ring.position.y = (opts.y ?? 0) + 0.025; ring.parent = root;   // `y`: the hero's ground in root space (a kart's root sits at axle height) ring.isPickable = false; ring.renderingGroupId = 0;
  const tex = new DynamicTexture('player_ring_tex', { width: 256, height: 256 }, scene, false); tex.hasAlpha = true;
  const mat = new StandardMaterial('player_ring_mat', scene); mat.diffuseTexture = tex; mat.emissiveTexture = tex; mat.opacityTexture = tex; mat.disableLighting = true; mat.backFaceCulling = false; mat.useAlphaFromDiffuseTexture = true;
  ring.material = mat;
  let drawn = -1;
  const draw = (v: number) => {
    const ctx = tex.getContext() as CanvasRenderingContext2D; ctx.clearRect(0, 0, 256, 256);
    const c = 128, rad = 108, hex = color.toHexString();
    ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(c, c, rad, 0, Math.PI * 2); ctx.stroke();   // the full ring, faint
    if (v > 0.005) { ctx.strokeStyle = hex; ctx.beginPath(); ctx.arc(c, c, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v); ctx.stroke(); }   // the stamina arc, from the top clockwise
    tex.update(); drawn = v;
  };
  draw(opts.stamina === false ? 1 : 1);
  // the indicator: a billboard puck LOW beside the ring, on the camera's right, with the glyph
  const tag = MeshBuilder.CreatePlane('player_tag', { width: 0.42, height: 0.42 }, scene);
  tag.billboardMode = Mesh.BILLBOARDMODE_ALL; tag.isPickable = false;
  const right = new Vector3(1, 0, 0);
  const follow = scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera; if (cam) { cam.getDirectionToRef(Vector3.Right(), right); right.y = 0; if (right.lengthSquared() < 1e-4) right.set(1, 0, 0); right.normalize(); }
    const at = root.getAbsolutePosition();
    tag.position.set(at.x + right.x * (R + 0.24), at.y + (opts.y ?? 0) + 0.2, at.z + right.z * (R + 0.24));
  });
  const tagTex = new DynamicTexture('player_tag_tex', { width: 256, height: 256 }, scene, false); tagTex.hasAlpha = true;
  const tagMat = new StandardMaterial('player_tag_mat', scene); tagMat.diffuseTexture = tagTex; tagMat.emissiveTexture = tagTex; tagMat.opacityTexture = tagTex; tagMat.disableLighting = true; tagMat.backFaceCulling = false; tagMat.useAlphaFromDiffuseTexture = true;
  tag.material = tagMat;
  const drawTag = (icon: RingIcon) => {
    const ctx = tagTex.getContext() as CanvasRenderingContext2D; ctx.clearRect(0, 0, 256, 256);
    const hex = color.toHexString();
    ctx.fillStyle = 'rgba(8,10,14,0.72)'; ctx.beginPath(); ctx.arc(128, 128, 96, 0, Math.PI * 2); ctx.fill();   // the puck
    ctx.lineWidth = 10; ctx.strokeStyle = hex; ctx.beginPath(); ctx.arc(128, 128, 96, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '110px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.fillText(RING_GLYPH[icon], 128, 136);
    ctx.fillStyle = hex; ctx.beginPath(); ctx.moveTo(96, 236); ctx.lineTo(160, 236); ctx.lineTo(128, 292); ctx.closePath(); ctx.fill();   // the chevron: this one is you
    tagTex.update();
  };
  drawTag(opts.icon ?? 'basketball');
  return {
    set(v: number) { const q = Math.round(Math.max(0, Math.min(1, v)) * 50) / 50; if (q !== drawn) draw(q); },
    setIcon(icon: RingIcon) { drawTag(icon); },
    dispose() { scene.onBeforeRenderObservable.remove(follow); ring.dispose(); tag.dispose(); tex.dispose(); tagTex.dispose(); mat.dispose(); tagMat.dispose(); },
  };
}
