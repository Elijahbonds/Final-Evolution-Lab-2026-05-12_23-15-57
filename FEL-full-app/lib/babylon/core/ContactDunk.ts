// CONTACT DUNKS — dunked ON, not dunked beside (2026-09-12).
//
// Owner's asks: "contact dunks", "body bag dunks, chest to chest dunked on".
//
// A poster already existed in 1v1: the bump floors the defender, shakes the camera, hit-stops the frame.
// Mechanically that is a body bag. But the DEFENDER IS SHOVED AWAY at the bump (bumpShove pushes him off
// the drive line), so by the time the ball reaches the iron he is somewhere else and the dunk happens
// NEXT TO a bystander. "Chest to chest" is precisely the thing that was missing.
//
// So a contact dunk pulls the victim INTO it: he is planted between the dunker and the ring, squared up,
// and held there for the flight. The shove becomes the FALL — backward, away from the rim, after the ball
// is through — because that is the order those two things happen in.
//
// Pure maths on Vector3 only, so the geometry is testable without a scene.

import { Vector3 } from '@babylonjs/core';

/** What kind of dunk the contact makes this. */
export type ContactDunkKind =
  /** Nobody there: a clean slam. */
  | 'clean'
  /** A body in the way, beaten late — you go through his shoulder. */
  | 'through'
  /** A SET body squarely under the rim. This is the poster. */
  | 'poster'
  /** A set body, a strong contest, and you still finished. The body bag. */
  | 'body_bag';

export interface ContactRead {
  /** 0..1 of how hard the contest was. */
  strength01: number;
  /** He was SET — planted, not sliding. A poster needs a body that chose to be there. */
  set: boolean;
  /** Is there a defender in the drive at all? */
  present: boolean;
}

/**
 * Which dunk this is.
 *
 * The distinction matters because it decides whether the victim gets pulled into the animation. A 'through'
 * is a shoulder you went past; a poster is a man you went OVER, and only the second one should reposition
 * a body — dragging a late-sliding defender under the rim would look like a teleport.
 */
export function dunkKindFor(read: ContactRead): ContactDunkKind {
  if (!read.present) return 'clean';
  if (!read.set) return 'through';
  return read.strength01 >= 0.6 ? 'body_bag' : 'poster';
}

/** Does this dunk put the victim IN the animation? */
export function isContactDunk(kind: ContactDunkKind): boolean {
  return kind === 'poster' || kind === 'body_bag';
}

/** Chest to chest: how far in front of the victim the dunker's body ends up. Two torsos touching. */
export const CHEST_GAP = 0.52;
/** How far off the ring the victim stands when he is being dunked on. */
export const POSTER_STANDOFF = 0.95;

export interface PosterPlant {
  /** Where the victim stands to be dunked on. */
  spot: Vector3;
  /** The yaw he faces: at the dunker, because he is contesting, not watching. */
  faceYaw: number;
}

/**
 * Plant the victim between the dunker and the ring.
 *
 * This is what makes it chest-to-chest rather than adjacent. He sits a body's width off the rim on the
 * side the drive is coming from, so the flight path goes straight through him — which is the whole image.
 */
export function posterPlant(rimFloor: Vector3, dunkerPos: Vector3): PosterPlant {
  const toDunker = new Vector3(dunkerPos.x - rimFloor.x, 0, dunkerPos.z - rimFloor.z);
  if (toDunker.lengthSquared() < 1e-6) toDunker.set(0, 0, 1);
  toDunker.normalize();
  const spot = new Vector3(
    rimFloor.x + toDunker.x * POSTER_STANDOFF,
    rimFloor.y,
    rimFloor.z + toDunker.z * POSTER_STANDOFF,
  );
  return { spot, faceYaw: Math.atan2(dunkerPos.x - spot.x, dunkerPos.z - spot.z) };
}

/**
 * How he goes down.
 *
 * Backward and away from the ring — a man dunked on falls the way he was leaning, which is back into the
 * lane he was defending. The old shove pushed him SIDEWAYS off the drive line, which read as being
 * brushed aside rather than being finished over.
 */
export function posterFall(rimFloor: Vector3, victimPos: Vector3, kind: ContactDunkKind): Vector3 {
  const away = new Vector3(victimPos.x - rimFloor.x, 0, victimPos.z - rimFloor.z);
  if (away.lengthSquared() < 1e-6) away.set(0, 0, 1);
  away.normalize();
  const force = kind === 'body_bag' ? 3.4 : 2.2;
  return new Vector3(away.x * force, 0.6, away.z * force);
}

/** What the crowd is told. A body bag deserves louder than a poster, and a poster louder than a bump. */
export function contactBanner(kind: ContactDunkKind): string {
  switch (kind) {
    case 'body_bag': return 'BODY BAG!!!';
    case 'poster': return 'POSTERIZED!';
    case 'through': return 'THROUGH THE CONTACT!';
    case 'clean': default: return 'SLAM!';
  }
}

/** Hit-stop for the flush, in ms. The bigger the contact, the longer the frame holds. */
export function contactHitStopMs(kind: ContactDunkKind): number {
  switch (kind) {
    case 'body_bag': return 110;
    case 'poster': return 80;
    case 'through': return 45;
    case 'clean': default: return 30;
  }
}

/**
 * When the victim is released from the plant.
 *
 * He is held through the flight and let go at the flush, so the fall happens AFTER the ball is through
 * rather than at the moment of contact. Expressed as a fraction of the dunk flight.
 */
export const POSTER_RELEASE_K = 0.82;
