// crowdStands — a venue's crowd, mounted: real fans near, cards far, one director, reactions (w3-crowds, A9.9).
//
// `mountCrowd(scene, venue)` returns at once and builds in the background (the bake loads five bodies). It lays the seats
// (crowdLayout), splits them by the device's tier into baked-animation fans and cards, and drives both from one
// CrowdDirector. Each block of fans (one stand × one body) is ONE draw: a clone of the body's mesh sharing its geometry,
// with a thin instance per fan carrying its matrix and its four VAT numbers. A reaction rewrites only the fans whose clip
// changed, and only their four numbers.
//
// What the crowd stays out of, on purpose (each costs a pass over hundreds of skinned vertices for nothing):
//   · the shadow map — the rig adds every new mesh it can; a crowd in a stand throws a shadow onto the stand behind it,
//     unseen at this distance, and a skinned caster can never be cached (ShadowCache);
//   · the ink hull (autoInk inks any mesh with a skeleton) — a second draw of every fan for a contour under a pixel wide;
//   · the glow layer's occluders and the glossy floor's mirror (both take any mesh with a skeleton) — the stands are not
//     what a lamp's halo hides behind, and a floor's reflection never reaches the stands.
// These are undone from here, on the crowd's own meshes, rather than taught to the shared scene modules.
//
// Phones get cards only (crowdLayout.CROWD_TIER) from a painted atlas: no crowd GLB, no float texture, five draws.
// The governor's 'still' level (PerfGovernor) stops the crowd's clock: every fan holds its pose, cards stop bobbing.

import { BoundingInfo, Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import { registerPerfTarget } from '../../core/perfGuard';
import type { PerfLevel } from '../../core/PerfGovernor';
import { crowdBake, type CrowdBake } from './crowdBake';
import { CARD_H, CARD_POSES, CARD_W, cardMaterial, cardQuad, paintAtlas, snapshotAtlas, type CardAtlas, type CardPose } from './crowdCards';
import { SEAT_TOP_M } from './crowdClips';
import { layoutSeats, splitSeats, crowdTierOf, type CrowdVenue, type Seat, type CrowdTierName } from './crowdLayout';
import { CrowdDirector, type ClipChange, type ReactionKind } from './crowdReact';
import { loopOffset, startOffset, type CrowdClipName } from './crowdVat';

export interface CrowdOptions {
  /** 'mobile' | 'desktop' | 'high' (scene.metadata.felTier when omitted). */
  tier?: string;
  seed?: number;
  /** Scales the tier's fan and card counts (a venue that wants fewer). */
  scale?: number;
  /** Read at each reaction: reduced motion keeps reactions small (motionPolicy().reduced). */
  reduced?: () => boolean;
  /** Frames the scene draws before the crowd starts building (DEFER_FRAMES). 0 builds at once (tests). */
  deferFrames?: number;
}

/** The crowd starts building this many rendered frames after it is mounted (well after the mode's load has returned). */
export const DEFER_FRAMES = 20;

/**
 * Every mesh the crowd makes is named under this prefix. The '__' is the rig's own "not scenery" mark: LightRig skips a '__'
 * mesh when it registers shadow casters (as the kart's merged parts do), so no fan, card or bench is ever a caster — not even for
 * the frames before the quarantine below would take it out — and the phone's shadow cache never has the crowd in its ledger.
 * (Recorded so it is not re-diagnosed: a 3-Point phone frame of 195 draws, first read as the crowd thrashing the cache, is the
 * cache's re-bake frame after the capture rig turns shadows back on — the build without the crowd measures 191 on the same frame
 * and 127 after it; with the crowd, 131.)
 */
export const CROWD_MESH = '__crowd_';

/** Resolves after the scene has rendered `n` more frames (or the scene is disposed). */
export function afterFrames(scene: Scene, n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const obs = scene.onAfterRenderObservable.add(() => { if (--left <= 0) { scene.onAfterRenderObservable.remove(obs); resolve(); } });
    scene.onDisposeObservable.addOnce(() => { scene.onAfterRenderObservable.remove(obs); resolve(); });
  });
}

export interface CrowdHandle {
  readonly tier: CrowdTierName;
  /** Seats laid, and how many are real fans / cards (known at once; the meshes land when the bake is done). */
  readonly seats: number;
  readonly fans: number;
  readonly cards: number;
  /** Resolves when the meshes are in the scene (false: the crowd could not be built, the cards stand alone or nothing does). */
  readonly ready: Promise<boolean>;
  react(kind: ReactionKind, strength?: number): void;
  /** The meshes the crowd draws (for tests and the probes). */
  meshes(): AbstractMesh[];
  /** The director (tests read who plays what). */
  readonly director: CrowdDirector;
  dispose(): void;
}

interface FanBlock { mesh: Mesh; settings: Float32Array; index: Map<number, number>; dirty: boolean }

const ZERO = new Float32Array(16);
const CARD_POSE_OF: Record<CrowdClipName, CardPose> = {
  sit_idle: 0, sit_clap: 0, sit_groan: 0, sit_cheer: 1, rise: 2, sit_down: 0,
  stand_idle: 2, stand_clap: 2, stand_groan: 2, stand_cheer: 3,
};

export function mountCrowd(scene: Scene, venue: CrowdVenue, opts: CrowdOptions = {}): CrowdHandle {
  const tier = crowdTierOf(opts.tier ?? (scene.metadata as { felTier?: string } | null)?.felTier);
  const seats = layoutSeats(venue, opts.seed ?? 11);
  const { fans, cards } = splitSeats(seats, tier, opts.scale ?? 1);
  // the director runs fans then cards: index i < fans.length is a fan, the rest are cards
  const all: Seat[] = [...fans, ...cards];
  const director = new CrowdDirector(all.map((s) => ({ home: s.posture, along: s.along })));
  const reduced = opts.reduced ?? (() => false);
  let disposed = false;
  let clock = 0;
  let still = false;
  let bake: CrowdBake | null = null;
  const blocks: FanBlock[] = [];
  const fanBlock: { block: FanBlock; slot: number }[] = [];
  const cardMeshes: Mesh[][] = [];   // [variant][pose]
  const cardBufs: Float32Array[][] = [];
  const cardSlot: { variant: number; slot: number; pose: CardPose; placed: boolean; yaw: number }[] = [];
  const cardCounts: number[][] = [];
  const animatingCards = new Set<number>();
  const owned: AbstractMesh[] = [];
  let cardMat: PBRMaterial | null = null;
  let atlas: CardAtlas | null = null;
  let benchMat: PBRMaterial | null = null;
  let quarantineFrames = 90;

  // ── the fans ────────────────────────────────────────────────────────────────────────────────────────────────────
  const buildFans = (b: CrowdBake): void => {
    const byKey = new Map<string, number[]>();
    fans.forEach((s, i) => {
      const body = s.body % b.bodies.length;
      const k = `${s.stand}|${body}`;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(i);
    });
    const place = new Matrix(), q = new Quaternion(), p = new Vector3();
    for (const [k, list] of byKey) {
      const [stand, bodyS] = k.split('|');
      const body = b.bodies[Number(bodyS)];
      const mesh = body.mesh.clone(`${CROWD_MESH}${stand}_${bodyS}`, null, true) as Mesh;
      // its OWN geometry: a thin instance's extra buffers (the VAT numbers) are set on the geometry, so two blocks sharing
      // one would share one settings buffer (and a disposed block would leave the others drawing with none)
      mesh.makeGeometryUnique();
      mesh.parent = null;
      mesh.setEnabled(true);
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.bakedVertexAnimationManager = body.manager;
      mesh.material = b.material;
      mesh.freezeWorldMatrix(body.w0);
      const mats = new Float32Array(16 * list.length), settings = new Float32Array(4 * list.length);
      const index = new Map<number, number>();
      const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
      list.forEach((fi, j) => {
        const s = fans[fi];
        p.set(s.pos[0], s.pos[1], s.pos[2]);
        Quaternion.RotationYawPitchRollToRef(s.yaw, 0, 0, q);
        Matrix.ComposeToRef(Vector3.OneReadOnly as Vector3, q, p, place);
        body.w0.multiply(place).multiply(body.w0inv).copyToArray(mats, j * 16);
        const idle = s.posture === 'seated' ? b.ranges.sit_idle : b.ranges.stand_idle;
        settings.set([idle.start, idle.end, loopOffset(idle, s.phase), idle.speed], j * 4);
        index.set(fi, j);
        lo.minimizeInPlaceFromFloats(s.pos[0] - 1, s.pos[1] - 0.2, s.pos[2] - 1);
        hi.maximizeInPlaceFromFloats(s.pos[0] + 1, s.pos[1] + 2.5, s.pos[2] + 1);
      });
      mesh.thinInstanceSetBuffer('matrix', mats, 16, true);
      mesh.thinInstanceSetBuffer('bakedVertexAnimationSettingsInstanced', settings, 4, false);
      // the block's cull volume, in the mesh's own space (its frozen world is the body's load transform)
      const corners = [lo, hi, new Vector3(lo.x, lo.y, hi.z), new Vector3(lo.x, hi.y, lo.z), new Vector3(hi.x, lo.y, lo.z), new Vector3(hi.x, hi.y, lo.z), new Vector3(hi.x, lo.y, hi.z), new Vector3(lo.x, hi.y, hi.z)]
        .map((c) => Vector3.TransformCoordinates(c, body.w0inv));
      const llo = corners.reduce((a, c) => Vector3.Minimize(a, c)), lhi = corners.reduce((a, c) => Vector3.Maximize(a, c));
      mesh.setBoundingInfo(new BoundingInfo(llo, lhi, body.w0));   // the world matrix is frozen: hand the box its world now
      mesh.doNotSyncBoundingInfo = true;
      const block: FanBlock = { mesh, settings, index, dirty: false };
      blocks.push(block);
      list.forEach((fi, j) => { fanBlock[fi] = { block, slot: j }; });
      owned.push(mesh);
    }
  };

  const applyFan = (c: ClipChange): void => {
    const fb = fanBlock[c.fan];
    if (!fb || !bake) return;
    const r = bake.ranges[c.clip];
    const off = c.idle && c.since === -Infinity ? loopOffset(r, all[c.fan].phase) : startOffset(c.since, r);
    fb.block.settings.set([r.start, r.end, off, r.speed], fb.slot * 4);
    fb.block.dirty = true;
  };

  // ── the cards ───────────────────────────────────────────────────────────────────────────────────────────────────
  const buildCards = (a: CardAtlas): void => {
    cardMat = cardMaterial(scene, a);
    const per: number[][] = Array.from({ length: a.variants }, () => []);
    cards.forEach((_, j) => per[(cards[j].body + j) % a.variants].push(j));
    for (let v = 0; v < a.variants; v++) {
      cardMeshes[v] = []; cardBufs[v] = []; cardCounts[v] = [0, 0, 0, 0];
      const n = per[v].length;
      for (let pz = 0; pz < CARD_POSES; pz++) {
        const m = cardQuad(scene, `${CROWD_MESH}card_${v}_${pz}`, a.cell(v, pz as CardPose));
        m.material = cardMat;
        m.isPickable = false;
        m.receiveShadows = false;
        const buf = new Float32Array(Math.max(1, n) * 16);
        cardBufs[v][pz] = buf;
        cardMeshes[v][pz] = m;
        owned.push(m);
        if (n) { m.thinInstanceSetBuffer('matrix', buf, 16, false); m.alwaysSelectAsActiveMesh = true; }
        m.setEnabled(false);
      }
      per[v].forEach((j, slot) => {
        const s = cards[j];
        const yaw = Math.atan2(venue.eye[0] - s.pos[0], venue.eye[2] - s.pos[2]);
        const pose: CardPose = s.posture === 'seated' ? 0 : 2;
        cardSlot[j] = { variant: v, slot, pose, placed: false, yaw };
        writeCard(j, pose, 0);
      });
    }
    refreshCardMeshes();
  };
  const cardM = new Matrix(), cq = new Quaternion(), cp = new Vector3(), cs = new Vector3(CARD_W, CARD_H, 1);
  const writeCard = (j: number, pose: CardPose, dy: number): void => {
    const c = cardSlot[j];
    if (!c) return;
    const s = cards[j];
    const moved = !c.placed || pose !== c.pose;
    if (c.placed && pose !== c.pose) {
      cardBufs[c.variant][c.pose].set(ZERO, c.slot * 16);
      cardCounts[c.variant][c.pose]--;
      cardMeshes[c.variant][c.pose].thinInstanceBufferUpdated('matrix');
    }
    if (moved) cardCounts[c.variant][pose]++;
    Quaternion.RotationYawPitchRollToRef(c.yaw, 0, 0, cq);
    cp.set(s.pos[0], s.pos[1] + dy, s.pos[2]);
    Matrix.ComposeToRef(cs, cq, cp, cardM);
    cardM.copyToArray(cardBufs[c.variant][pose], c.slot * 16);
    c.pose = pose; c.placed = true;
    cardMeshes[c.variant][pose].thinInstanceBufferUpdated('matrix');
  };
  const refreshCardMeshes = (): void => {
    for (let v = 0; v < cardMeshes.length; v++) for (let pz = 0; pz < CARD_POSES; pz++) {
      const m = cardMeshes[v][pz];
      const want = cardCounts[v][pz] > 0;
      if (m.isEnabled(false) !== want) m.setEnabled(want);
    }
  };
  /** A card's pose and hop for the clip it plays, `t` seconds in. */
  const cardFrame = (clip: CrowdClipName, t: number, calm: boolean): { pose: CardPose; dy: number } => {
    const base = CARD_POSE_OF[clip];
    if (clip === 'stand_cheer') {
      const ph = (t % 1.2) / 1.2;
      const upNow = ph > 0.2 && ph < 0.85;
      return { pose: upNow ? 3 : 2, dy: calm ? 0 : Math.max(0, Math.sin(ph * Math.PI * 2 * 2)) * 0.07 };
    }
    if (clip === 'sit_cheer') {
      const upNow = t > 0.2 && t < 1.3;
      return { pose: upNow ? 1 : 0, dy: calm ? 0 : Math.max(0, Math.sin(t * Math.PI * 3.8)) * 0.04 };
    }
    if (clip === 'rise') return { pose: t > 0.3 ? 2 : 0, dy: 0 };
    if (clip === 'sit_down') return { pose: t > 0.3 ? 0 : 2, dy: 0 };
    if (clip === 'sit_groan' || clip === 'stand_groan') return { pose: base, dy: -0.06 * Math.min(1, t / 0.4) * (t < 1.4 ? 1 : Math.max(0, (1.8 - t) / 0.4)) };
    if (clip === 'sit_clap' || clip === 'stand_clap') return { pose: base, dy: calm ? 0 : Math.abs(Math.sin(t * Math.PI * 6.6)) * 0.012 };
    return { pose: base, dy: 0 };
  };
  const applyCard = (c: ClipChange): void => {
    const j = c.fan - fans.length;
    if (!cardSlot[j]) return;
    if (c.idle) { animatingCards.delete(j); writeCard(j, CARD_POSE_OF[c.clip], 0); }
    else animatingCards.add(j);
  };

  // ── benches under seated rows that have no seats of their own ──────────────────────────────────────────────────
  const buildBenches = (): void => {
    const planks: number[] = [];
    for (const st of venue.stands) {
      if (!st.benches) continue;
      const [dz, dy] = st.step;
      const c = Math.cos(st.yaw), sn = Math.sin(st.yaw);
      const at = (x: number, lz: number, ly: number): [number, number, number] => [st.front[0] + x * c + lz * sn, st.front[1] + ly, st.front[2] - x * sn + lz * c];
      for (let r = 0; r < st.rows; r++) {
        const rowZ = -r * dz - dz * 0.5;
        // the footboard the row's feet rest on, and the seat plank behind it at seat height
        planks.push(...at(0, rowZ + 0.18, r * dy - 0.04), st.width, 0.08, 0.5, st.yaw);
        if (st.posture === 'seated') planks.push(...at(0, rowZ - 0.12, r * dy + SEAT_TOP_M - 0.04), st.width, 0.07, 0.36, st.yaw);
      }
      // the two side frames, from the front row's foot to the back row's seat
      const back = (st.rows - 1) * dy + SEAT_TOP_M;
      for (const side of [-1, 1]) {
        const x = side * (st.width / 2 + 0.05);
        planks.push(...at(x, -(st.rows * dz) / 2, back / 2 - 0.05), 0.1, back + 0.1, st.rows * dz, st.yaw);
      }
    }
    if (!planks.length) return;
    const box = MeshBuilder.CreateBox(`${CROWD_MESH}bleachers`, { size: 1 }, scene);
    benchMat = new PBRMaterial('crowd_bleachers_mat', scene);
    benchMat.albedoColor = Color3.FromHexString('#9aa3ad'); benchMat.metallic = 0.55; benchMat.roughness = 0.45;
    box.material = benchMat;
    box.isPickable = false;
    box.receiveShadows = true;
    const n = planks.length / 7;
    const mats = new Float32Array(16 * n);
    const m = new Matrix(), q = new Quaternion(), p = new Vector3(), sc = new Vector3();
    for (let i = 0; i < n; i++) {
      const o = i * 7;
      p.set(planks[o], planks[o + 1], planks[o + 2]); sc.set(planks[o + 3], planks[o + 4], planks[o + 5]);
      Quaternion.RotationYawPitchRollToRef(planks[o + 6], 0, 0, q);
      Matrix.ComposeToRef(sc, q, p, m);
      m.copyToArray(mats, i * 16);
    }
    box.thinInstanceSetBuffer('matrix', mats, 16, true);
    owned.push(box);
  };

  // ── keeping the crowd out of the passes it has no business in ───────────────────────────────────────────────────
  const quarantine = (): void => {
    const crowdMeshes = owned;
    for (const light of scene.lights) {
      const gens = (light as unknown as { getShadowGenerators?(): Map<unknown, { removeShadowCaster(m: AbstractMesh, d?: boolean): unknown; getShadowMap(): { renderList: AbstractMesh[] | null } | null }> | null }).getShadowGenerators?.();
      if (!gens) continue;
      for (const g of gens.values()) for (const m of crowdMeshes) if (g.getShadowMap()?.renderList?.includes(m)) g.removeShadowCaster(m, false);
    }
    for (const layer of scene.effectLayers) {
      const l = layer as unknown as { removeIncludedOnlyMesh?(m: AbstractMesh): void; hasMesh?(m: AbstractMesh): boolean };
      for (const m of crowdMeshes) if (l.hasMesh?.(m)) l.removeIncludedOnlyMesh?.(m);
    }
    for (const t of scene.textures) {
      const list = (t as unknown as { renderList?: AbstractMesh[] | null }).renderList;
      if (!list || t.name === 'crowd_card_atlas') continue;
      for (const m of crowdMeshes) { const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); }
    }
    for (const m of crowdMeshes) m.renderOutline = false;
  };

  // ── the clock ───────────────────────────────────────────────────────────────────────────────────────────────────
  let obs: Observer<Scene> | null = null;
  const tick = (): void => {
    if (disposed) return;
    const dt = Math.min(0.1, Math.max(0, scene.getEngine().getDeltaTime() / 1000));
    if (!still) clock += dt;
    bake?.setClock(clock);
    if (quarantineFrames > 0) { quarantineFrames--; if (quarantineFrames % 15 === 0 || quarantineFrames > 85) quarantine(); }
    const changes = director.tick(clock);
    for (const c of changes) { if (c.fan < fans.length) applyFan(c); else applyCard(c); }
    for (const b of blocks) if (b.dirty) { b.dirty = false; b.mesh.thinInstanceBufferUpdated('bakedVertexAnimationSettingsInstanced'); }
    if (animatingCards.size && !still) {
      const calm = reduced();
      for (const j of animatingCards) {
        const i = j + fans.length;
        const t = clock - director.sinceOf(i);
        const f = cardFrame(director.clipOf(i), t, calm);
        writeCard(j, f.pose, f.dy);
      }
    }
    if (changes.length || animatingCards.size) refreshCardMeshes();
  };
  const ready = (async (): Promise<boolean> => {
    // NOT DURING THE MODE'S LOAD: the harness gives load() a watchdog, and five GLBs, the bake and the card snapshot are
    // the crowd's business, not the venue's — they start once the scene has drawn `deferFrames` frames of play
    if ((opts.deferFrames ?? DEFER_FRAMES) > 0) await afterFrames(scene, opts.deferFrames ?? DEFER_FRAMES);
    if (disposed) return false;
    buildBenches();
    if (tier !== 'mobile' && fans.length + cards.length > 0) {
      bake = await crowdBake(scene);
      if (disposed) return false;
      if (bake) {
        buildFans(bake);
        if (cards.length) { atlas = await snapshotAtlas(scene, bake); if (disposed) { atlas.dispose(); return false; } }
      }
    }
    if (!atlas && cards.length) atlas = paintAtlas(scene, 4, opts.seed ?? 5);
    if (atlas && cards.length) buildCards(atlas);
    quarantine();
    obs = scene.onBeforeRenderObservable.add(tick);
    return blocks.length > 0 || cards.length > 0;
  })().catch((e) => { console.warn('[FEL-CROWD] crowd not built', (e as Error)?.message ?? e); return false; });

  const target = {
    setPerfLevel(level: Readonly<PerfLevel>): void { still = level.crowd === 'still'; },
  };
  const unperf = registerPerfTarget(scene, target);

  return {
    tier, seats: seats.length, fans: fans.length, cards: cards.length, ready, director,
    react(kind: ReactionKind, strength = 1): void {
      if (disposed) return;
      director.react(kind, strength, clock, reduced());
    },
    meshes: () => owned.slice(),
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unperf();
      if (obs) scene.onBeforeRenderObservable.remove(obs);
      for (const m of owned) m.dispose(false, false);
      cardMat?.dispose(); benchMat?.dispose();
      atlas?.dispose();
    },
  };
}
