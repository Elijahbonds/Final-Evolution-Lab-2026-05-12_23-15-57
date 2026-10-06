'use client';
import type { Wardrobe } from '@/lib/babylon/core/kit';
import type { AccessoryId } from '@/lib/babylon/core/accessories';
import type { CreatorDoc, CreatorPart, PaintLayer, PaintRegion, PartBone, SlotFrame, Vec3 } from '@/lib/creator/look/doc';
import type { HeroBodyKind } from '@/lib/babylon/core/heroBody';
import type { Atom } from '@/lib/babylon/creator/paint/bodyChart';
import type { StudioFocus, StudioShot, StudioTab } from '@/lib/creator/look/studio/framing';
import type { StudioAction } from '@/lib/creator/look/studio/input';
import type { StudioVenue } from '@/lib/creator/look/studio/poses';
import type { PhotoShot } from '@/components/closet/studio/photo-mode';

// AvatarPreview — the Closet's live 3D preview: the FORGED hero
// (public/models/fel-hero.glb, scripts/avatar/forge.mts) wearing the draft
// look, so what the player designs here is the model they play with. The
// draft is applied through the SAME identity pipe the game uses
// (playerIdentity.applyIdentity), not a parallel preview-only mapping — a
// color that looks right here cannot look different in a mode.
//
// CREATOR-PLAN phase 4d (2026-10-06): THIS IS THE STUDIO'S STAGE. The same preview, grown up — not a second editor:
//   - the stage (lib/babylon/creator/studio/stageRig.ts): studio light and the environment map, the plinth, the camera
//     moving between full body / bust / face as the tab or the selection asks, the turntable, poses and venue light,
//     and RENDER ON DEMAND (a frame is drawn only when something changed or moves);
//   - direct manipulation on the real body (bodyPick.ts): tap to select a region or a part, drag the selected part (it
//     snaps to the bone that owns the skin under the pointer), drag a sticker over the surface, and on-model knobs to
//     move / rotate / scale the selected part — every change goes back to the Closet as an edit (one undo step a drag);
//   - every input: mouse (drag spins, right/shift-drag orbits, wheel zooms), touch (one finger spins, two orbit and
//     pinch), a gamepad (read through lib/input/profiles while one is connected);
//   - photo mode's shot (`capture`): the scene's felPresentation context is 'photo' for the shot, 'studio' otherwise;
//   - the scene says its quality tier (felTier), so a phone gets the phone paint size (3/4c's tier-aware textures);
//   - `?perf` shows what the stage is drawing and why.

import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FaceConfig, JerseyConfig } from '@/lib/closet/wearable-catalog';

export interface StudioEvents {
  /** a tap on the body: the region it selects (a second tap on the same spot widens it), the finest region there and
   *  where on that finest region the tap was (for "stamp here") */
  onTapBody(t: { region: PaintRegion; atom: Atom; finest: PaintRegion; xy: { x: number; y: number } | null }): void;
  onTapPart(id: string): void;
  onTapEmpty(): void;
  /** the selected part dragged over the body: the bone it snapped to and its place on it; `group` is one per drag */
  onMovePart(id: string, at: { bone: PartBone; pos: Vec3 }, group: string): void;
  /** a knob turned or scaled the selected part */
  onTransformPart(id: string, patch: Partial<Pick<CreatorPart, 'pos' | 'rot' | 'scale'>>, group: string): void;
  /** the selected sticker dragged over the body */
  onMoveSticker(id: string, at: { region: PaintRegion; x: number; y: number }, group: string): void;
  /** a pad button the Closet acts on (undo, tabs, photo, before/after, …) */
  onPadAction(a: StudioAction): void;
  /** the player took the turntable over (a drag or the pad stopped the auto spin) */
  onSpin?(on: boolean): void;
}

export interface StudioStats { drawn: number; skipped: number; reasons: string[]; activeMeshes: number; drawCalls: number; tier: string }

export interface StudioApi {
  setShot(s: StudioShot | 'in' | 'out'): void;
  setAutoSpin(on: boolean): void;
  playPose(id: string): void;
  setVenue(id: StudioVenue['id']): void;
  capture(o: { pose: string; venue: string }): Promise<PhotoShot | null>;
  stats(): StudioStats;
}

export interface StudioProps {
  tab: StudioTab;
  focus: StudioFocus;
  /** the part the Parts tab has selected (its knobs show on the body) */
  selectedPart: CreatorPart | null;
  /** the selected paint layer when it is placed by position (a stamp, text, a drawing): drag it over the body */
  sticker: PaintLayer | null;
  /** the selected layer's region (a tap on the same spot widens from it) */
  region: PaintRegion | null;
  /** knobs on or off (they hide in photo mode and during before/after) */
  knobs: boolean;
  events: StudioEvents;
  apiRef?: MutableRefObject<StudioApi | null>;
}

/** What "before" shows: the look as it was (the Closet's before/after toggle). */
export type PreviewLook = Pick<AvatarPreviewProps, 'face' | 'palette' | 'jersey' | 'wardrobe' | 'accessories' | 'creator' | 'wornParts' | 'frame' | 'presentation'>;

export interface AvatarPreviewProps {
  face: FaceConfig;
  palette: { jersey: string; shorts: string; shoes: string; accent: string };
  jersey: JerseyConfig;
  /** equipped wearable ids per kit slot (ship pass 3: the fitted garment library) */
  wardrobe?: Wardrobe;
  /** IMPROVE (2026-10-06): the accessories the equipped items render as, and the draft Creator doc — the same two
   *  fields resolveIdentity fills at spawn, so the preview shows what the game will. */
  accessories?: readonly AccessoryId[];
  creator?: CreatorDoc | null;
  /** CREATOR-PLAN phase 2: equipped items that render as parts (the Nexus Visor) — resolveIdentity's `wornParts`. */
  wornParts?: readonly CreatorPart[];
  /** CREATOR-PLAN phase 4a: the selected slot's body (the preview respawns when it changes; absent: the body this
   *  account plays, as before) and its height / build (cosmetic, clamped like every mode outside ranked). */
  body?: HeroBodyKind;
  frame?: SlotFrame | null;
  /** CREATOR-PLAN phase 4b: the slot's Studio size (owner decision 2026-10-06: giant and tiny builds show here and in
   *  photos only). Stamped on THIS scene's metadata and read back from it (shape/presentation.ts); never in a mode. */
  presentation?: number | null;
  /** CREATOR-PLAN phase 4c: told the face morph names the loaded body carries (faceMorphs.morphNamesOf) after every spawn
   *  and respawn, so the Closet's face sliders are built from the body, not a fixed table. */
  onMorphs?: (names: string[]) => void;
  /** CREATOR-PLAN phase 4d: the Studio (above). */
  studio?: StudioProps;
  /** Phase 4d: while set, the stage shows this look instead (before/after); the edits underneath are untouched. */
  before?: PreviewLook | null;
}

const WATCHED: (keyof PreviewLook)[] = ['face', 'palette', 'jersey', 'wardrobe', 'accessories', 'creator', 'wornParts', 'frame', 'presentation'];
const MOOD_IDS = ['goldenHour', 'daylight', 'dojoWarm', 'nightGame', 'alpine', 'overcast'];

export default function AvatarPreview(props: AvatarPreviewProps) {
  const { face, palette, jersey, wardrobe, accessories, creator, wornParts, body, frame, presentation, onMorphs, studio, before } = props;
  const onMorphsRef = useRef(onMorphs);
  onMorphsRef.current = onMorphs;
  const studioRef = useRef(studio);
  studioRef.current = studio;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const knobsRef = useRef<HTMLDivElement>(null);
  const perfRef = useRef<HTMLPreElement>(null);
  const applyRef = useRef<((p: PreviewLook) => void) | null>(null);
  const reframeRef = useRef<(() => void) | null>(null);
  const respawnRef = useRef<((kind: HeroBodyKind) => void) | null>(null);
  const knobDownRef = useRef<((kind: 'move' | 'rotate' | 'scale', e: React.PointerEvent<HTMLElement>) => void) | null>(null);
  const bodyRef = useRef<HeroBodyKind | undefined>(body);
  bodyRef.current = body;
  const [perfOn] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf'));

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const { Engine, Scene, ArcRotateCamera, Vector3 } = await import('@babylonjs/core');
      const { applyCanvasFit, fitCanvas } = await import('@/lib/babylon/core/canvasFit');
      const { detectQualityTier } = await import('@/lib/babylon/scene/QualityTier');
      const { CharacterLibrary } = await import('@/lib/babylon/core/CharacterLibrary');
      const { applyIdentity } = await import('@/lib/babylon/core/playerIdentity');
      const { applyPresentation, stampPresentation } = await import('@/lib/babylon/creator/shape/presentation');
      const { morphNamesOf } = await import('@/lib/babylon/core/faceMorphs');
      const { FRONT_ALPHA, StudioStage } = await import('@/lib/babylon/creator/studio/stageRig');
      const { BodyPicker, partAt, partsOnScreen, rayAt, snapPlacement, turnFromScreen } = await import('@/lib/babylon/creator/studio/bodyPick');
      const { ATOM_REGION, stampAt, stickerTarget, tapRegion } = await import('@/lib/babylon/creator/studio/pickMath');
      const { feel } = await import('@/lib/babylon/creator/studio/feel');
      const { BODY_HEIGHT, framingFor, stepShot } = await import('@/lib/creator/look/studio/framing');
      const { TAP_SLOP, dragKind, isTap, padActions, padAxes, twoFinger } = await import('@/lib/creator/look/studio/input');
      const { dragRatio, knobLayout, scalePart, sweptAngle } = await import('@/lib/creator/look/studio/handles');
      const { poseById } = await import('@/lib/creator/look/studio/poses');
      const { shotRenderSize } = await import('@/lib/creator/look/studio/photoCard');
      const { paintStats, prewarmPaint } = await import('@/lib/babylon/creator/paint/renderPaint');
      const { profileFor, readPad } = await import('@/lib/input/profiles');
      if (disposed || !canvasRef.current) return;

      const box = canvasRef.current;
      const fit0 = fitCanvas({ cssWidth: box.clientWidth || 260, cssHeight: box.clientHeight || 260, dpr: window.devicePixelRatio || 1 });
      const tier = detectQualityTier(box, fit0);
      const engine = new Engine(box, tier === 'desktop', { alpha: true, adaptToDeviceRatio: false, stencil: false });
      applyCanvasFit(engine, box);
      const scene = new Scene(engine);
      // phase 4d: the tier the paint, the bendable parts and the identity layer read (a phone gets the phone sizes)
      (scene.metadata ??= {}).felTier = tier;
      const cam = new ArcRotateCamera('studioCam', FRONT_ALPHA, 1.33, 3.15, new Vector3(0, 0.95, 0), scene);
      cam.minZ = 0.05;
      const stage = new StudioStage(scene, cam, { tier });

      // identity:false — the DRAFT look is applied below, not the saved one.
      // ship pass 3 rollout flag (dev only): ?hero=/models/candidates/<file>.glb previews a candidate body
      const heroParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(window.location.search).get('hero') : null;
      if (heroParam) (scene.metadata ??= {}).felHeroOverride = heroParam;
      // EVERYONE-BODY-MOCAP-OPPONENTS (2026-09-14): the Closet dresses the body this player actually plays — the scan
      // for the owner's account, otherwise their kit body (heroBody.ts). A dev ?hero= override still wins.
      const { resolveIdentity, applyProportions } = await import('@/lib/babylon/core/playerIdentity');
      const { urlForHeroBody } = await import('@/lib/babylon/core/heroBody');
      // CREATOR-PLAN phase 4a: the SELECTED SLOT's body when the Closet names one (a scan owner's Gojo slot is a kit body)
      let bodyKind: HeroBodyKind = bodyRef.current ?? (await resolveIdentity().catch(() => null))?.body ?? 'kit-male';
      let spawned = await CharacterLibrary.spawn(scene, heroParam ? '/models/fel-hero.glb' : urlForHeroBody(bodyKind), { identity: false, role: 'player' });
      if (disposed) { spawned.dispose(); stage.dispose(); engine.dispose(); return; }
      let baseScale = spawned.root.scaling.clone();
      let picker: InstanceType<typeof BodyPicker> | null = null;
      const pickerOf = () => (picker ??= new BodyPicker(spawned));
      let padIndex = -1;
      stage.setBody(spawned);
      // dev-only probe hook (scripts/_closet-scene-probe.mts): the preview is the
      // one place the identity pipe and the spawn layers meet without a login
      if (process.env.NODE_ENV === 'development') (window as unknown as { __FEL_PREVIEW__?: unknown }).__FEL_PREVIEW__ = { scene, spawned, stage };

      // dev only: ?tone=8d5524 previews a skin tone without touching the draft (per-tone captures, ship pass 3 rung 2)
      const toneParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(window.location.search).get('tone') : null;
      let photoing = false;
      applyRef.current = (p: PreviewLook) => {
        lastProps = p;
        applyIdentity(spawned, {
          proportions: null,
          face: toneParam ? { ...p.face, skinTone: `#${toneParam.replace(/^#/, '')}` } : p.face,
          palette: p.palette,
          jersey: p.jersey,
          wardrobe: p.wardrobe ?? {},
          custom: true,
          body: bodyKind,
          accessories: p.accessories ?? [],
          creator: p.creator ?? null,
          wornParts: p.wornParts ?? [],
        });
        // the slot's height and build, absolutely from the spawn's own scale (never compounding across edits)
        applyProportions(spawned, p.frame ? { heightScale: p.frame.heightScale, buildScale: p.frame.buildScale } : { heightScale: 1, buildScale: 1 }, baseScale);
        // CREATOR-PLAN phase 4b: this is the Studio, so its scene carries the slot's presentation size, applied on top of
        // the absolute scale just set (so it never compounds). Phase 4d: photo mode's shot stamps the context 'photo'.
        stampPresentation(scene, photoing ? 'photo' : 'studio', p.presentation ?? null);
        applyPresentation(spawned.root);
        // the shots are in body heights: the frame's height and the Studio size both scale the root
        stage.setHeight(BODY_HEIGHT * (spawned.root.scaling.y / (baseScale.y || 1)));
        picker?.invalidate();
        stage.gate.kick();
      };
      let lastProps: PreviewLook = { face, palette, jersey, wardrobe, accessories, creator, wornParts, frame, presentation };
      applyRef.current(lastProps);
      onMorphsRef.current?.(morphNamesOf(spawned.meshes));
      // a slot with another body: the old one goes, the new one is spawned and dressed with the same draft
      let respawning: Promise<void> | null = null;
      respawnRef.current = (kind: HeroBodyKind) => {
        if (heroParam || kind === bodyKind) return;
        const run = async () => {
          bodyKind = kind;
          const next = await CharacterLibrary.spawn(scene, urlForHeroBody(kind), { identity: false, role: 'player' });
          if (disposed) { next.dispose(); return; }
          next.root.rotation.y = spawned.root.rotation.y;
          spawned.dispose();
          spawned = next;
          picker = null;
          baseScale = spawned.root.scaling.clone();
          stage.setBody(spawned);
          applyRef.current?.(lastProps);
          onMorphsRef.current?.(morphNamesOf(spawned.meshes));
          if (!disposed) { prewarmPaint(spawned); stage.gate.kick(3000); }
        };
        respawning = (respawning ?? Promise.resolve()).then(run).catch((e) => console.error('[closet] preview respawn failed', e));
      };
      // CREATOR-PLAN phase 3: build the body's paint map in the background now, so the first paint shows at once
      prewarmPaint(spawned);
      stage.gate.kick(3000);   // phase 4d: the map builds over the next frames, so keep drawing a moment

      // ── framing: the tab or the selection decides the shot ──────────────────────────────────────────────────────
      reframeRef.current = () => {
        const st = studioRef.current;
        if (st) stage.frame(framingFor(st.tab, st.focus));
      };
      reframeRef.current();

      // ── the canvas: tap, spin, orbit, pinch, drag a part or a sticker ───────────────────────────────────────────
      type Pt = { x: number; y: number };
      type Press = { x0: number; y0: number; t0: number; x: number; y: number; t: number; vx: number; kind: ReturnType<typeof dragKind> | null; button: number; shift: boolean; onPart: boolean; onSticker: boolean; lastBone: string | null };
      const pts = new Map<number, Pt>();
      let gesture = 0;
      let press: Press | null = null;
      let two: [Pt, Pt] | null = null;
      const local = (e: { clientX: number; clientY: number }): Pt => { const r = box.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      const usingPad = () => padIndex >= 0;
      const selectedOnScreen = () => {
        const st = studioRef.current;
        const part = st?.tab === 'parts' ? st.selectedPart : null;
        if (!part) return null;
        return partsOnScreen(spawned, [part], scene, cam, box.clientWidth, box.clientHeight).find((p) => !p.mirrored) ?? null;
      };
      const hitAt = (pt: Pt) => { const r = rayAt(scene, cam, pt.x, pt.y); return pickerOf().pick(r.origin, r.dir); };
      const movePartTo = (pt: Pt) => {
        const part = studioRef.current?.selectedPart;
        if (!part || !press) return;
        const h = hitAt(pt);
        if (!h) return;
        const snap = snapPlacement(spawned, h, spawned.root.scaling.y / (baseScale.y || 1));
        if (!snap) return;
        if (snap.bone !== press.lastBone) { feel('snap', { pad: usingPad() }); press.lastBone = snap.bone; }
        studioRef.current?.events.onMovePart(part.id, snap, `studio:move:${part.id}:${gesture}`);
      };
      const moveStickerTo = (pt: Pt) => {
        const st = studioRef.current;
        const l = st?.sticker;
        const chart = pickerOf().bodyChart;
        if (!st || !l || !chart) return;
        const h = hitAt(pt);
        if (!h?.atom) return;
        const t = stickerTarget(chart, l.region, h.atom, h.rest);
        if (t) st.events.onMoveSticker(l.id, t, `studio:sticker:${l.id}:${gesture}`);
      };
      const tap = (pt: Pt) => {
        const st = studioRef.current;
        if (!st) return;
        const parts = st.tab === 'paint' && st.sticker ? [] : (lastProps.creator?.parts ?? []);
        const onPart = parts.length ? partAt(partsOnScreen(spawned, parts, scene, cam, box.clientWidth, box.clientHeight), pt.x, pt.y) : null;
        if (onPart) { feel('select', { pad: usingPad() }); st.events.onTapPart(onPart.id); return; }
        pickerOf().invalidate();
        const h = hitAt(pt);
        if (!h?.atom) { st.events.onTapEmpty(); return; }
        const chart = pickerOf().bodyChart;
        const finest = ATOM_REGION[h.atom];
        feel('select', { pad: usingPad() });
        st.events.onTapBody({ region: tapRegion(h.atom, st.region), atom: h.atom, finest, xy: chart ? stampAt(chart, finest, h.rest) : null });
      };
      const onDown = (e: PointerEvent) => {
        box.setPointerCapture?.(e.pointerId);
        const pt = local(e);
        pts.set(e.pointerId, pt);
        stage.gate.touch();
        if (pts.size === 1) {
          gesture++;
          pickerOf().invalidate();
          const st = studioRef.current;
          const sel = selectedOnScreen();
          const onPart = !!sel && Math.hypot(sel.x - pt.x, sel.y - pt.y) <= Math.max(26, sel.r);
          const onSticker = !onPart && st?.tab === 'paint' && !!st.sticker && !!hitAt(pt)?.atom;
          const now = performance.now();
          press = { x0: pt.x, y0: pt.y, t0: now, x: pt.x, y: pt.y, t: now, vx: 0, kind: null, button: e.button, shift: e.shiftKey, onPart, onSticker, lastBone: st?.selectedPart?.bone ?? null };
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          two = [a, b];
          if (press) press.kind = 'orbit';
        }
      };
      const onMove = (e: PointerEvent) => {
        if (!pts.has(e.pointerId)) return;
        const pt = local(e);
        pts.set(e.pointerId, pt);
        if (!press) return;
        if (pts.size >= 2 && two) {
          const [a, b] = [...pts.values()];
          const g = twoFinger(two, [a, b]);
          stage.zoomBy(g.pinch);
          stage.orbitBy(g.dx, g.dy);
          two = [a, b];
          return;
        }
        const now = performance.now();
        const dx = pt.x - press.x, dy = pt.y - press.y, dt = Math.max(1, now - press.t);
        if (!press.kind && Math.hypot(pt.x - press.x0, pt.y - press.y0) > TAP_SLOP) {
          press.kind = dragKind({ pointers: pts.size, button: press.button, shift: press.shift, onPart: press.onPart, onSticker: press.onSticker });
          if (press.kind === 'spin' && stage.autoSpin) { stage.setAutoSpin(false); studioRef.current?.events.onSpin?.(false); }
        }
        if (press.kind === 'spin') { stage.spinBy(dx); press.vx = 0.7 * press.vx + 0.3 * (dx / dt) * 1000; }
        else if (press.kind === 'orbit') stage.orbitBy(dx, dy);
        else if (press.kind === 'dragPart') { stage.gate.hold('drag'); movePartTo(pt); }
        else if (press.kind === 'dragSticker') { stage.gate.hold('drag'); moveStickerTo(pt); }
        press.x = pt.x; press.y = pt.y; press.t = now;
      };
      const onUp = (e: PointerEvent) => {
        if (!pts.has(e.pointerId)) return;
        const pt = local(e);
        pts.delete(e.pointerId);
        if (pts.size < 2) two = null;
        if (!press || pts.size > 0) return;
        const p = press; press = null;
        stage.gate.hold('drag', false);
        if (!p.kind && isTap(Math.hypot(pt.x - p.x0, pt.y - p.y0), performance.now() - p.t0, 1)) tap(pt);
        else if (p.kind === 'spin' && performance.now() - p.t < 80) stage.fling(p.vx);
        else if (p.kind === 'dragPart' || p.kind === 'dragSticker') feel('snap', { pad: usingPad() });
      };
      const onWheel = (e: WheelEvent) => { e.preventDefault(); stage.zoomBy(e.deltaY < 0 ? 1.08 : 1 / 1.08); };
      const noMenu = (e: Event) => e.preventDefault();
      box.addEventListener('pointerdown', onDown);
      box.addEventListener('pointermove', onMove);
      box.addEventListener('pointerup', onUp);
      box.addEventListener('pointercancel', onUp);
      box.addEventListener('wheel', onWheel, { passive: false });
      box.addEventListener('contextmenu', noMenu);

      // ── the knobs: move / rotate / scale the selected part ──────────────────────────────────────────────────────
      let knob: { kind: 'move' | 'rotate' | 'scale'; last: Pt; centre: Pt; part: CreatorPart; id: number } | null = null;
      knobDownRef.current = (kind, e) => {
        const part = studioRef.current?.selectedPart;
        const sel = selectedOnScreen();
        if (!part || !sel) return;
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        gesture++;
        pickerOf().invalidate();
        knob = { kind, last: local(e), centre: { x: sel.x, y: sel.y }, part: { ...part }, id: gesture };
        press = { x0: 0, y0: 0, t0: 0, x: 0, y: 0, t: 0, vx: 0, kind: 'dragPart', button: 0, shift: false, onPart: true, onSticker: false, lastBone: part.bone };
        stage.gate.hold('drag');
        if (stage.autoSpin) { stage.setAutoSpin(false); studioRef.current?.events.onSpin?.(false); }
        feel('select', { pad: usingPad() });
      };
      const onKnobMove = (e: PointerEvent) => {
        if (!knob) return;
        const pt = local(e);
        const ev = studioRef.current?.events;
        if (knob.kind === 'move') movePartTo(pt);
        else if (knob.kind === 'rotate') {
          const t = turnFromScreen(spawned, knob.part, cam, sweptAngle(knob.centre, knob.last, pt));
          if (t) { knob.part = { ...knob.part, ...t }; ev?.onTransformPart(knob.part.id, t, `studio:turn:${knob.part.id}:${knob.id}`); }
        } else {
          const scale = scalePart(knob.part, dragRatio(knob.centre, knob.last, pt));
          knob.part = { ...knob.part, scale };
          ev?.onTransformPart(knob.part.id, { scale }, `studio:scale:${knob.part.id}:${knob.id}`);
        }
        knob.last = pt;
      };
      const onKnobUp = () => { if (!knob) return; knob = null; press = null; stage.gate.hold('drag', false); feel('snap', { pad: usingPad() }); };
      window.addEventListener('pointermove', onKnobMove);
      window.addEventListener('pointerup', onKnobUp);
      window.addEventListener('pointercancel', onKnobUp);
      const placeKnobs = () => {
        const el = knobsRef.current;
        if (!el) return;
        const sel = studioRef.current?.knobs ? selectedOnScreen() : null;
        if (!sel) { el.style.display = 'none'; return; }
        const L = knobLayout({ x: sel.x, y: sel.y }, sel.r);
        el.style.display = 'block';
        el.style.transform = `translate(${sel.x.toFixed(1)}px, ${sel.y.toFixed(1)}px)`;
        el.style.setProperty('--ring', `${L.ring.toFixed(1)}px`);
        if (knob) knob.centre = { x: sel.x, y: sel.y };
      };

      // ── the pad (read through the input layer, only while one is connected) ─────────────────────────────────────
      let padPrev: ReturnType<typeof readPad> | null = null;
      const scanPads = () => {
        const list = navigator.getGamepads?.() ?? [];
        padIndex = -1;
        for (let i = 0; i < list.length; i++) if (list[i]?.connected) { padIndex = i; break; }
      };
      const onPadOn = () => { scanPads(); stage.gate.touch(); };
      window.addEventListener('gamepadconnected', onPadOn);
      window.addEventListener('gamepaddisconnected', onPadOn);
      scanPads();
      const pollPad = (dt: number) => {
        if (padIndex < 0) return;
        const raw = navigator.getGamepads?.()[padIndex];
        if (!raw) { padIndex = -1; return; }
        const p = readPad(raw as never, profileFor(raw));
        const axes = padAxes(p);
        if (axes.spin && stage.autoSpin) studioRef.current?.events.onSpin?.(false);
        stage.padMove(axes, dt);
        for (const a of padActions(p, padPrev)) {
          stage.gate.touch();
          if (a === 'select') tap({ x: box.clientWidth / 2, y: box.clientHeight / 2 });
          else if (a === 'shotIn' || a === 'shotOut') { stage.setShot(stepShot(stage.shot, a === 'shotIn' ? 1 : -1)); feel('shot', { pad: true }); }
          else studioRef.current?.events.onPadAction(a);
        }
        padPrev = p;
      };

      // ── the API the Closet drives (HUD buttons, keys, photo mode) ──────────────────────────────────────────────
      const stats = (): StudioStats => {
        const active = scene.getActiveMeshes();
        let draws = 0;
        for (let i = 0; i < active.length; i++) draws += active.data[i].subMeshes?.length ?? 1;
        return { drawn: stage.gate.frames, skipped: stage.gate.skipped, reasons: stage.gate.reasons(), activeMeshes: active.length, drawCalls: draws, tier };
      };
      const api: StudioApi = {
        setShot: (s) => { stage.setShot(s === 'in' || s === 'out' ? stepShot(stage.shot, s === 'in' ? 1 : -1) : s); feel('shot'); },
        setAutoSpin: (on) => stage.setAutoSpin(on),
        playPose: (id) => stage.playPose(poseById(id)),
        setVenue: (id) => stage.setVenue(id),
        capture: async ({ pose, venue }) => {
          const { CreateScreenshotUsingRenderTargetAsync } = await import('@babylonjs/core');
          const prev = { venue: stage.venue, spin: stage.autoSpin };
          photoing = true;
          stage.gate.hold('photo');
          try {
            applyRef.current?.(lastProps);   // stamps the scene's felPresentation context 'photo'
            if (venue === 'studio' || MOOD_IDS.includes(venue)) stage.setVenue(venue as StudioVenue['id']);
            stage.setAutoSpin(false);
            stage.frame({ shot: 'full', facing: -0.3 });
            stage.playPose(poseById(pose));
            // a second for the pose to land, the camera to arrive and a cape to settle (4c: step the swing before a shot)
            await new Promise((r) => setTimeout(r, 1100));
            const size = shotRenderSize(tier);
            const url = await CreateScreenshotUsingRenderTargetAsync(engine, cam, size, 'image/png', tier === 'desktop' ? 4 : 1, true);
            feel('photo', { pad: usingPad() });
            return { url, width: size.width, height: size.height };
          } catch (e) {
            console.error('[closet] photo failed', e);
            return null;
          } finally {
            photoing = false;
            applyRef.current?.(lastProps);   // back to 'studio'
            stage.setVenue(prev.venue);
            stage.setAutoSpin(prev.spin);
            stage.gate.hold('photo', false);
            reframeRef.current?.();
          }
        },
        stats,
      };
      const apiRef = studioRef.current?.apiRef;
      if (apiRef) apiRef.current = api;

      // ── render on demand ───────────────────────────────────────────────────────────────────────────────────────
      const onResize = () => { if (canvasRef.current) { applyCanvasFit(engine, canvasRef.current); stage.gate.kick(); } };
      window.addEventListener('resize', onResize);
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
      ro?.observe(box);
      const onVisible = () => { if (!document.hidden) stage.gate.kick(); };
      document.addEventListener('visibilitychange', onVisible);
      let last = performance.now();
      let n = 0;
      engine.runRenderLoop(() => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        pollPad(dt);
        stage.update(dt);
        if (++n % 15 === 0) {
          const ps = paintStats(spawned.root);
          stage.busy('paint', !!ps?.targets.some((t) => !t.complete || t.pendingTiles > 0));
        }
        if (!stage.gate.due()) return;
        scene.render();
        placeKnobs();
        if (perfRef.current && n % 20 === 0) {
          const s = stats();
          perfRef.current.textContent = `${tier} · ${engine.getFps().toFixed(0)} fps · drawn ${s.drawn} / held ${s.skipped}\n${s.activeMeshes} meshes · ~${s.drawCalls} draws · ${s.reasons.join(' ') || 'idle'}`;
        }
      });
      cleanup = () => {
        window.removeEventListener('resize', onResize);
        ro?.disconnect();
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('gamepadconnected', onPadOn);
        window.removeEventListener('gamepaddisconnected', onPadOn);
        window.removeEventListener('pointermove', onKnobMove);
        window.removeEventListener('pointerup', onKnobUp);
        window.removeEventListener('pointercancel', onKnobUp);
        box.removeEventListener('pointerdown', onDown);
        box.removeEventListener('pointermove', onMove);
        box.removeEventListener('pointerup', onUp);
        box.removeEventListener('pointercancel', onUp);
        box.removeEventListener('wheel', onWheel);
        box.removeEventListener('contextmenu', noMenu);
        if (apiRef?.current === api) apiRef.current = null;
        engine.stopRenderLoop();
        spawned.dispose();
        stage.dispose();
        scene.dispose();
        engine.dispose();
      };
    })().catch((e) => console.error('[closet] avatar preview failed', e));
    return () => { disposed = true; cleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-apply the draft on every edit — same pipe, new values (phase 4d: or the "before" look while it is held)
  const shown: PreviewLook = before ?? { face, palette, jersey, wardrobe, accessories, creator, wornParts, frame, presentation };
  useEffect(() => {
    applyRef.current?.(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, WATCHED.map((k) => shown[k]));
  // CREATOR-PLAN phase 4a: another slot's body
  useEffect(() => { if (body) respawnRef.current?.(body); }, [body]);
  // phase 4d: the tab or the selection moved — reframe
  const focusKey = studio ? `${studio.tab}|${studio.focus ? (studio.focus.kind === 'part' ? studio.focus.bone : studio.focus.region) : ''}` : '';
  useEffect(() => { reframeRef.current?.(); }, [focusKey]);

  const knob = (kind: 'move' | 'rotate' | 'scale', label: string, style: React.CSSProperties, glyph: string) => (
    <button type="button" aria-label={label} title={label} onPointerDown={(e) => knobDownRef.current?.(kind, e)}
      className="pointer-events-auto absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border-2 border-cyan-300 bg-black/70 font-display text-base font-bold text-cyan-200 shadow-[0_0_12px_rgba(0,229,255,0.6)]"
      style={style}>{glyph}</button>
  );

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ touchAction: 'none' }}
        aria-label="3D Studio stage: drag to spin, two fingers or right-drag to orbit, pinch or scroll to zoom, tap the body to select"
      />
      {/* the selected part's knobs: placed every drawn frame at its projected centre (no React render) */}
      <div ref={knobsRef} className="pointer-events-none absolute left-0 top-0" style={{ display: 'none' }}>
        <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-cyan-300/60" style={{ left: 0, top: 0, width: 'calc(var(--ring) * 2)', height: 'calc(var(--ring) * 2)' }} />
        {knob('move', 'Move the part: drag it onto the body, it snaps to the nearest bone', { left: 0, top: 0 }, '✥')}
        {knob('rotate', 'Turn the part: drag round the ring', { left: 'var(--ring)', top: 0 }, '⟳')}
        {knob('scale', 'Resize the part: drag out or in', { left: 'calc(var(--ring) * 0.7071)', top: 'calc(var(--ring) * 0.7071)' }, '⤡')}
      </div>
      {perfOn && <pre ref={perfRef} className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-emerald-300" />}
    </div>
  );
}
