// JUMBOTRON (vis-court, wave 2, 2026-10-13) — the video board over the outfield, with the numbers of the last ball in play.
//
// The audit (derby): "A jumbotron with replay and Statcast numbers (DynamicTexture)". A screen on a frame above the wall, turned to
// the plate, painted with the derby's header (HR and outs) and, after every contact, the Statcast card: EXIT VELO, LAUNCH ANGLE,
// DISTANCE. The replay half is the shared replay director (the whole picture, letterboxed), not a second renderer on a board.
// The numbers are read from the ball the game already flew (court/flightRead); the board only shows them.
//
// Named `court_jumbotron_*` — NOT an LED wall by the glow's regex: a halo over a screen this size whites the text out (the lesson
// of the first stadium capture). It is lit by its own emissive texture.

import { Color3, MeshBuilder, PBRMaterial, StandardMaterial } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import { makeTexture, repaint } from './texture';

export interface JumboState {
  /** top line, e.g. "HOME RUN DERBY" */ title: string;
  /** the running board: "HR 3 · OUTS 1" */ board: string;
  /** the last ball: three lines, or none */ card: readonly string[] | null;
  /** flashes the card's colour on a home run */ homer: boolean;
}

/** Pure: the board's line for the tally. */
export const boardLine = (homers: number, outs: number, cap: number): string => `HR ${homers}  ·  OUTS ${outs}/${cap}`;

export interface JumbotronHandle { show(s: JumboState): void; readonly meshes: readonly Mesh[]; dispose(): void }

export const JUMBO_W = 1024, JUMBO_H = 448;

export function paintJumbotron(g: CanvasRenderingContext2D, s: JumboState): void {
  const W = JUMBO_W, H = JUMBO_H;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, s.homer ? '#3b1b05' : '#0b1730'); grad.addColorStop(1, '#050913');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.fillStyle = s.homer ? '#ffb020' : '#2f6df6'; g.fillRect(0, 0, W, 70);
  g.fillStyle = '#ffffff'; g.font = '900 46px system-ui, "Arial Black", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(s.title, 28, 37, W - 56);
  g.fillStyle = '#9fd3ff'; g.font = '800 54px system-ui, Arial, sans-serif'; g.fillText(s.board, 28, 120, W - 56);
  if (s.card) {
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(20, 160, W - 40, H - 180);
    s.card.slice(0, 3).forEach((line, i) => {
      g.fillStyle = i === 0 ? '#ffffff' : '#ffe08a'; g.font = `900 ${i === 0 ? 74 : 66}px system-ui, "Arial Black", sans-serif`;
      g.fillText(line, 44, 218 + i * 86, W - 90);
    });
  } else {
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = '800 54px system-ui, Arial, sans-serif'; g.fillText('STEP UP TO THE PLATE', 44, 280, W - 90);
  }
}

export function buildJumbotron(scene: Scene, at: { x: number; y: number; z: number }, yaw: number, width = 9): JumbotronHandle {
  const tex = makeTexture(scene, 'court_jumbotron_tex', JUMBO_W, JUMBO_H);
  const mat = new StandardMaterial('court_jumbotron_m', scene);
  mat.disableLighting = true; mat.fogEnabled = false; mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.White().scale(0.9); if (tex) mat.emissiveTexture = tex;
  const h = width * JUMBO_H / JUMBO_W;
  const screen = MeshBuilder.CreatePlane('court_jumbotron_screen', { width, height: h }, scene);
  screen.position.set(at.x, at.y, at.z); screen.rotation.y = yaw; screen.material = mat; screen.isPickable = false; screen.receiveShadows = false;
  const frameM = new PBRMaterial('court_jumbotron_frame_m', scene); frameM.albedoColor = Color3.FromHexString('#1a1d24'); frameM.metallic = 0.4; frameM.roughness = 0.6;
  const frame = MeshBuilder.CreateBox('court_jumbotron_frame', { width: width + 0.5, height: h + 0.5, depth: 0.4 }, scene);
  // the frame sits behind the face: the face looks along (−sin yaw, −cos yaw), so "behind" is (+sin yaw, +cos yaw)
  frame.position.set(at.x + Math.sin(yaw) * 0.25, at.y, at.z + Math.cos(yaw) * 0.25); frame.rotation.y = yaw; frame.material = frameM; frame.isPickable = false;
  const draw = (s: JumboState): void => repaint(tex, (g) => paintJumbotron(g, s));
  draw({ title: 'HOME RUN DERBY', board: boardLine(0, 0, 0), card: null, homer: false });
  const meshes = [screen, frame];
  return { show: draw, meshes, dispose() { for (const m of meshes) m.dispose(); mat.dispose(); frameM.dispose(); tex?.dispose(); } };
}
