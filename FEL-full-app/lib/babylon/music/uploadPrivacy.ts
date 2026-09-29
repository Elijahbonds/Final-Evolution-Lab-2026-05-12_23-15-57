// MUSIC-SUITE P5 (2026-09-25), "The Flip, for real" — UPLOADS STAY ON THE DEVICE (owner decision #15).
//
// Decision #15: the player may flip their own file, after ticking "I made this or I own the rights", and "songs
// containing uploads stay device-private until online review exists". P3 left the mark (ProjectFlipSource.upload, set
// only by YOUR FILE — a mic take is not an upload) and studioEdit.publishedHasUpload, but nothing READ it.
//
// MUSIC-SUITE P5 FIX PASS (2026-09-25): WHAT "DEVICE-PRIVATE" CLOSES. P5 read it as "no library, no dance floor, no
// walk-out" for any PROJECT that held an upload anywhere — an unused bank D, a saved chop kit — so a player who once
// loaded their own file lost SEND TO THE DANCE FLOOR (decision #7) and the Academy library, and gained nothing for
// privacy: none of those leaves the device today. The library is IndexedDB + localStorage on this device (its server
// calls are unimplemented SYNC SEAMs, StudioLibrary.ts), the dance export is an audio-free chart of drum hits in
// localStorage (DanceExport.ts: "Nothing here reads, bundles or fetches audio"), and the walk-out plays on this device
// only (DunkMode reads it from localStorage; its end card prints the title — nothing is sent). P3 had deliberately let an
// upload song publish to the device library and keyed the future sharing pass on publishedHasUpload. The review and the
// builder both put it to the owner; until the owner answers, this reads the decision's own words:
//   · "device-private" = never shared OFF the device. The doors that stay shut are the ones that would leave it: the
//     room's onPublish hook (the Creator Card pipeline — unwired today) and the library's SYNC SEAMs (online sharing is
//     decision #18's later pass, which keys on publishedHasUpload). The library, the dance floor and the walk-out are on
//     the device and stay open.
//   · "songs CONTAINING uploads" = what the SONG plays: its grid rows' chops and its sections' own chops. An upload that
//     only sits in a bank or a saved kit is not in the song (the review measured the old rule firing on an idle bank D).
//   · THE ONE-LINE SWITCH: UPLOAD_DOORS. Setting library / danceFloor / walkOut to false puts back P5's stricter reading
//     (the room, the library and the walk-out all read this table; tested both ways).
// The room still says, in one line, that the song uses an upload and stays on this device.

import type { ProjectFlip, ProjectFlipRow, ProjectFlipSource, ProjectSection } from './StudioProject';

/** Where a song can go. The first three stay on this device; `offDevice` is anything that sends it elsewhere. */
export type UploadDoor = 'library' | 'danceFloor' | 'walkOut' | 'offDevice';
export type UploadDoors = Readonly<Record<UploadDoor, boolean>>;
/**
 * Owner decision #15, as this build reads it — THE SWITCH: may a song that plays an upload go through this door?
 * `false` for all three on-device doors is P5's first (stricter) reading.
 */
export const UPLOAD_DOORS: UploadDoors = { library: true, danceFloor: true, walkOut: true, offDevice: false };

export interface UploadPrivacy {
  /** the song plays an uploaded file: it stays on this device (UPLOAD_DOORS says which doors that closes) */
  private: boolean;
  /** the uploaded files' names (grid rows first, then sections; each once) */
  uploads: string[];
  /** the doors closed to this song (none when it plays no upload) */
  closed: UploadDoor[];
  /** the one line the room shows, or null */
  line: string | null;
}

/** Is this source a YOUR FILE upload (decision #15's mark)? Only `true` counts, as the project's door keeps it. */
export const isUpload = (s: Pick<ProjectFlipSource, 'upload'> | null | undefined): boolean => s?.upload === true;

/** The statement YOUR FILE asks for (FlipShelf's tick). */
export const OWN_RIGHTS_TICK = 'I made this or I own the rights';
/** The note an upload keeps once the player ticked (the day it was ticked). */
export function tickedUploadNote(now: number): string {
  return `Uploaded by the player, who ticked "${OWN_RIGHTS_TICK}" (${new Date(now).toISOString().slice(0, 10)}).`;
}
/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25), decision #15's tick for uploads made BEFORE it existed: P3 / P4 (deployed) took
 * YOUR FILE with no tick (note 'Uploaded by the player — their own recording.'), and those sources live on in saved
 * projects, banks and kits. Such an upload asks for the tick before it is sent to a row, recorded or saved as a kit.
 */
export function uploadNeedsTick(s: Pick<ProjectFlipSource, 'upload' | 'note'> | null | undefined): boolean {
  return isUpload(s) && !(s?.note ?? '').includes(`ticked "${OWN_RIGHTS_TICK}"`);
}

/** The doors closed to a song that plays an upload (`doors` = the switch; tests pass the other reading). */
export function closedDoors(doors: UploadDoors = UPLOAD_DOORS): UploadDoor[] {
  return (Object.keys(doors) as UploadDoor[]).filter((d) => !doors[d]);
}

const DOOR_WORDS: Record<Exclude<UploadDoor, 'offDevice'>, string> = { library: 'publishing', walkOut: 'walk-outs', danceFloor: 'the dance floor' };

/** The line the room shows while a song plays an upload. */
export function uploadPrivateLine(uploads: readonly string[], doors: UploadDoors = UPLOAD_DOORS): string {
  const what = uploads.length === 1 ? `your upload "${uploads[0]}"` : `${uploads.length} of your uploads`;
  const shut = closedDoors(doors).filter((d): d is Exclude<UploadDoor, 'offDevice'> => d !== 'offDevice').map((d) => DOOR_WORDS[d]);
  if (shut.length) return `Device-only: this song uses ${what} — ${shut.join(', ')} open${shut.length === 1 ? 's' : ''} once FEL can review uploads online.`;
  return `Device-only: this song uses ${what} — your library, the dance floor and your walk-out work on this device; sharing it online opens once FEL can review uploads.`;
}

/** What a song plays: its grid rows' chops and its sections' own chops (not an idle bank or a saved kit). */
export type UploadScope = {
  flipRows: readonly Pick<ProjectFlipRow, 'source'>[];
  sections?: readonly Pick<ProjectSection, 'chops'>[];
  /** read by projectUploads only (a bank or a kit is in the project, not in the song) */
  flip?: Pick<ProjectFlip, 'source'> & Partial<Pick<ProjectFlip, 'otherBanks' | 'kits'>>;
};

const names = (sources: readonly (ProjectFlipSource | null | undefined)[]): string[] => {
  const out: string[] = [];
  for (const s of sources) if (s && isUpload(s) && !out.includes(s.label)) out.push(s.label);
  return out;
};

/** The SONG's upload state (pure): what its grid rows and sections play. StudioLibrary (read by DunkMode) imports this file. */
export function projectUploadPrivacy(p: UploadScope, doors: UploadDoors = UPLOAD_DOORS): UploadPrivacy {
  const uploads = names([...p.flipRows.map((r) => r.source), ...(p.sections ?? []).flatMap((sec) => (sec.chops ?? []).map((r) => r.source))]);
  return uploads.length
    ? { private: true, uploads, closed: closedDoors(doors), line: uploadPrivateLine(uploads, doors) }
    : { private: false, uploads, closed: [], line: null };
}

/** Every upload the PROJECT holds, in the song or not (its banks and kits too). */
export function projectUploads(p: UploadScope): string[] {
  const f = p.flip;
  return names([
    ...(f ? [f.source, ...(f.otherBanks ?? []).map((b) => b?.source ?? null), ...(f.kits ?? []).map((k) => k.bank.source)] : []),
    ...p.flipRows.map((r) => r.source),
    ...(p.sections ?? []).flatMap((sec) => (sec.chops ?? []).map((r) => r.source)),
  ]);
}

/** May a song with this upload state use `door`? (No upload: every door.) */
export function uploadDoorOpen(door: UploadDoor, u: Pick<UploadPrivacy, 'private'>, doors: UploadDoors = UPLOAD_DOORS): boolean {
  return !u.private || doors[door];
}

/** A published song's rows (StudioLibrary sequencer.tracks) carry an upload's chop — the library's own guard. */
export function tracksHaveUpload(tracks: readonly unknown[]): boolean {
  return tracks.some((t) => {
    const chop = t && typeof t === 'object' ? (t as { chop?: { source?: { upload?: unknown } } }).chop : undefined;
    return chop?.source?.upload === true;
  });
}

/** What the library says when a closed door refuses an upload song (a caller that skipped the room). */
export const LIBRARY_UPLOAD_LINE = 'This song uses an uploaded file, so it stays on this device until FEL can review uploads online — nothing was published';
export const WALKOUT_UPLOAD_LINE = 'This song uses an uploaded file, so it can\'t be your walk-out until FEL can review uploads online — nothing was changed';
