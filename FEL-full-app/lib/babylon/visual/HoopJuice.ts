// HoopJuice — Venice juice LOOK (PM brief VENICE-JUICE-LOOK, 2026-09-06): what the HOOP does on the make's contact beat.
//
// The Meshy hoop (`hoop.glb`) is ONE mesh — pole, board, rim and net in `Mesh_0` under one `Material.001` — so scaling
// any of it squashes the whole stand. Nothing here touches `meshy_hoop_*` transforms. The three beats are:
//   #1 rim spring  — a juice-only torus (`juice_rim`) at the play rim, shown for the beat. DUNK-HANDS-RIM (2026-09-08): a real
//                    rim flexes DOWN on a dunk — the ring DIPS 3.5 cm on the contact and rings back up damped (7 Hz) over
//                    450 ms; the old XZ pulse (1.0 → 1.06 → 1.0 over 140 ms) rides on top. A RIM HANG holds the ring pulled
//                    5 cm down for as long as SLAM is held, then the spring plays from the held dip (`hold`).
//   #2 net squash  — a juice-only wireframe cylinder (`juice_net`) hung from the rim: y 1 → ~0.7 → 1 over 300 ms, and a sway
//                    that keeps ringing after the ball is through (a damped 2.5 Hz pendulum out to 900 ms — the net used to
//                    stop dead with the squash, 130 ms after the contact)
//   #3 hoop flash  — a warm emissive pulse on a CLONE of the play hoop's `Material.001` (the container shares materials
//                    across every hoop, so the clone keeps the far hoop and the other courts out of it), ~90 ms
// Everything is hidden/restored when the beat ends. Make only — the modes call punch() from contactPunch, never on a miss.
// The curves are pure (core/DunkHands: rimSpring / netSway) so the tests hold them.
import { Color3, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import { rimSpring, netSway, RIM_SPRING_SEC, NET_SWAY_SEC, RIM_HOLD_DIP_M } from '../core/DunkHands';

const FLASH_S = 0.06;   // flash: peak at ~30 ms (1–2 frames), exact restore after
const BEAT_S = Math.max(RIM_SPRING_SEC, NET_SWAY_SEC, FLASH_S);
const HOLD_TAU = 0.05;   // the held dip eases in (a hang is a pull, not a pop)
const FLASH_COLOR = Color3.FromHexString('#FFD79A');

export class HoopJuice {
  private readonly rimRing: Mesh;
  private readonly netPivot: TransformNode;
  private readonly net: Mesh;
  private t = -1;
  private held = false; private holdK = 0;   // DUNK-HANDS-RIM: a rim hang keeps the ring pulled down until the release
  private flashMats: { mat: PBRMaterial; base: Color3 }[] | null = null;
  /** A+ P3: every hoop mesh the punch re-materialised, with its ORIGINAL material — restored at beat end and on dispose */
  private swapped: { mesh: AbstractMesh; original: import('@babylonjs/core').Material | null }[] = [];
  private obs: Observer<Scene> | null = null;
  /** for the probe / outbox: which meshes and materials the last punch touched */
  readonly used = { rim: 'juice_rim', net: 'juice_net', flash: [] as string[] };

  constructor(private readonly scene: Scene, private readonly rim: Vector3) {
    // #1 the rim ring — regulation 0.45 m rim as the procedural 'rim' torus draws it (0.90 × 0.055 at scale 1)
    this.rimRing = MeshBuilder.CreateTorus('juice_rim', { diameter: 0.90, thickness: 0.06, tessellation: 24 }, scene);
    this.rimRing.position.copyFrom(rim); this.rimRing.isPickable = false; this.rimRing.isVisible = false;
    const rm = new StandardMaterial('juice_rim_m', scene);
    rm.emissiveColor = Color3.FromHexString('#FFB35C'); rm.disableLighting = true; rm.alpha = 0.7; rm.diffuseColor = Color3.Black();
    this.rimRing.material = rm;
    // #2 the net — hung from the rim so scaling the pivot's y squashes it upward toward the ring, not through the floor
    this.netPivot = new TransformNode('juice_net_pivot', scene); this.netPivot.position.copyFrom(rim);
    this.net = MeshBuilder.CreateCylinder('juice_net', { height: 0.42, diameterTop: 0.82, diameterBottom: 0.44, tessellation: 12, cap: Mesh.NO_CAP }, scene);
    this.net.parent = this.netPivot; this.net.position.y = -0.21; this.net.isPickable = false; this.net.isVisible = false;
    const nm = new StandardMaterial('juice_net_m', scene);
    nm.emissiveColor = Color3.White(); nm.disableLighting = true; nm.wireframe = true; nm.alpha = 0.85;
    this.net.material = nm;
  }

  /** The make's contact beat. Idempotent while a beat is running (the modes latch contactPunch once per attempt anyway). */
  /** `escalate`: a make that RATTLED first (RIM PLAY, 2026-09-18) arrives with a graze still ringing — the punch restarts over
   *  it instead of being swallowed by the running beat (a punch over a punch is still ignored). */
  punch(escalate = false): void {
    if (this.t >= 0 && !(escalate && !this.flashMats)) return;
    this.t = 0; this.amp = 1;
    this.rimRing.isVisible = true; this.net.isVisible = true;
    this.rimRing.scaling.set(1, 1, 1); this.rimRing.position.copyFrom(this.rim); this.netPivot.scaling.set(1, 1, 1); this.netPivot.rotation.set(0, 0, 0);
    this.flashMats = this.cloneHoopMaterials();   // fresh clones per beat; restoreMaterials() puts the originals back
    console.info(`[JUICE-LOOK] punch: rim spring + net squash + hoop flash on ${this.used.flash.length} material(s)`);
    if (!this.obs) this.obs = this.scene.onBeforeRenderObservable.add(() => this.tick(this.scene.getEngine().getDeltaTime() / 1000));
  }

  /** THE MISS RATTLES THE IRON (hoops detail pass, 2026-09-18): a clank off the front used to leave the ring and the net
   *  dead still while the ball flew off — the graze is the spring and the sway at half strength with NO flash and no
   *  material clone (the flash is the make's). Idempotent while a beat runs. */
  graze(): void {
    if (this.t >= 0 || this.held) return;
    this.t = 0; this.amp = 0.5;
    this.rimRing.isVisible = true; this.net.isVisible = true;
    this.rimRing.scaling.set(1, 1, 1); this.rimRing.position.copyFrom(this.rim); this.netPivot.scaling.set(1, 1, 1); this.netPivot.rotation.set(0, 0, 0);
    if (!this.obs) this.obs = this.scene.onBeforeRenderObservable.add(() => this.tick(this.scene.getEngine().getDeltaTime() / 1000));
  }
  private amp = 1;   // the beat's amplitude: 1 for the make's punch, 0.5 for a graze

  /** DUNK-HANDS-RIM: a rim HANG — on, the ring stays pulled down (RIM_HOLD_DIP_M) and the net stays squashed while SLAM is
   *  held; off, the spring plays from the held dip (a fresh beat — the ring rings back up, the net swings). Make only. */
  hold(on: boolean): void {
    if (on === this.held) return;
    this.held = on;
    if (on) { this.rimRing.isVisible = true; this.net.isVisible = true; console.info('[JUICE-LOOK] rim hang: ring held down'); if (!this.obs) this.obs = this.scene.onBeforeRenderObservable.add(() => this.tick(this.scene.getEngine().getDeltaTime() / 1000)); }
    else { this.t = 0; this.holdK = 0; console.info('[JUICE-LOOK] rim hang release: the ring springs back'); }
  }
  /** Whether a hang is holding the ring (probe / outbox). */
  get holding(): boolean { return this.held; }

  /** The play hoop's Meshy meshes are the `meshy_hoop_*` meshes within 3 m of the rim; each gets its own material clone. */
  private cloneHoopMaterials(): { mat: PBRMaterial; base: Color3 }[] {
    const out: { mat: PBRMaterial; base: Color3 }[] = [];
    const seen = new Map<number, PBRMaterial>();
    for (const m of this.scene.meshes as AbstractMesh[]) {
      if (!m.name.startsWith('meshy_hoop_') || !m.material || !(m.material instanceof PBRMaterial)) continue;
      const bb = m.getBoundingInfo().boundingBox;
      const near = Vector3.Distance(bb.centerWorld, this.rim) < 3 || (bb.minimumWorld.z - 1 < this.rim.z && bb.maximumWorld.z + 1 > this.rim.z && Math.abs(bb.centerWorld.x - this.rim.x) < 1.5);
      if (!near) continue;
      let clone = seen.get(m.material.uniqueId);
      if (!clone) { clone = m.material.clone(`${m.material.name}_juice`); seen.set(m.material.uniqueId, clone); out.push({ mat: clone, base: clone.emissiveColor.clone() }); if (!this.used.flash.includes(`${m.name}:${clone.name}`)) this.used.flash.push(`${m.name}:${clone.name}`); }
      this.swapped.push({ mesh: m, original: m.material });
      m.material = clone;
    }
    return out;
  }

  private tick(dt: number): void {
    // a HANG: the ring eases down to the held dip and stays; the net stays squashed with a slow sway; the flash runs its own clock
    if (this.held) {
      this.holdK = Math.min(1, this.holdK + dt / HOLD_TAU);
      const k = this.holdK * this.holdK * (3 - 2 * this.holdK);
      this.rimRing.position.y = this.rim.y - RIM_HOLD_DIP_M * k; this.rimRing.scaling.set(1, 1, 1);
      this.netPivot.scaling.y = 1 - 0.18 * k; this.netPivot.rotation.z = 0.03 * Math.sin(performance.now() / 180) * k;
      if (this.flashMats && this.t >= 0) { this.t += dt; this.flashTick(this.t); }
      return;
    }
    if (this.t < 0) return;
    this.t += dt;
    const t = this.t;
    // #1 the ring: the dip springs back up (damped), the XZ pulse on top
    if (t < RIM_SPRING_SEC) { const s = rimSpring(t); this.rimRing.position.y = this.rim.y + s.dip * this.amp; const xz = 1 + (s.xz - 1) * this.amp; this.rimRing.scaling.set(xz, 1, xz); }
    else if (this.rimRing.isVisible) { this.rimRing.scaling.set(1, 1, 1); this.rimRing.position.copyFrom(this.rim); this.rimRing.isVisible = false; }
    // #2 the net: squash, then the sway rings on
    if (t < NET_SWAY_SEC) { const n = netSway(t); this.netPivot.scaling.y = 1 + (n.squash - 1) * this.amp; this.netPivot.rotation.z = n.sway * this.amp; }
    else if (this.net.isVisible) { this.netPivot.scaling.y = 1; this.netPivot.rotation.z = 0; this.net.isVisible = false; }
    // #3 warm emissive pulse on the cloned hoop material(s)
    this.flashTick(t);
    if (t >= BEAT_S) { this.t = -1; this.restoreMaterials(); }
  }
  private flashTick(t: number): void {
    if (!this.flashMats) return;
    if (t < FLASH_S) { const a = Math.sin((t / FLASH_S) * Math.PI) * 0.9; for (const f of this.flashMats) f.mat.emissiveColor = Color3.Lerp(f.base, FLASH_COLOR, a); }
    else for (const f of this.flashMats) f.mat.emissiveColor.copyFrom(f.base);
  }

  /** A+ P3: the hoop meshes get their ORIGINAL material back and the juice clones are disposed — nothing sticky. */
  private restoreMaterials(): void {
    for (const s of this.swapped) if (!s.mesh.isDisposed()) s.mesh.material = s.original;
    this.swapped = [];
    if (this.flashMats) { for (const f of this.flashMats) f.mat.dispose(); this.flashMats = null; }
    console.info('[JUICE-LOOK] hoop materials restored');
  }

  dispose(): void {
    this.restoreMaterials();
    if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs);
    this.rimRing.material?.dispose(); this.rimRing.dispose(); this.net.material?.dispose(); this.net.dispose(); this.netPivot.dispose();
  }
}
