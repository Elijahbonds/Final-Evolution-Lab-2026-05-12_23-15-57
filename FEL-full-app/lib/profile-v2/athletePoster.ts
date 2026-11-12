// THE ATHLETE POSTER (lane/profile-character, owner 2026-10-27: "Make the profile show your actual character, not some
// stick figure"). The profile shows the account's real 3D athlete (components/profile-v2/athlete-3d.tsx). The 3D takes
// seconds on a phone, so the first time it renders, the stage keeps a picture of it ON THIS DEVICE (IndexedDB,
// posterStore.ts) and every later visit paints that picture at once, then fades into the live 3D.
//
// The picture is kept per account and per LOOK, so it is never someone else's and never yesterday's clothes:
//   owner   ownerKey(userId) — a hash, so the device store does not carry the raw account id;
//   look    the server's stamp (the AvatarLook and AthleteBuild rows' updatedAt: every Closet save, Creator save, slot
//           switch and card skin writes one of them, on any device) + the device's own copy of the look (a teen's look
//           lives only on the device, lib/creator/localLook.ts) + POSTER_VERSION (bumped when the framing changes);
//   idHash  the identity the 3D actually wore (playerIdentity.resolveIdentity), checked once the 3D is live, so a change
//           the two stamps cannot see (a catalogue colour, the scan body) re-takes the picture on that visit.
// Nothing here leaves the device: the picture is drawn from the canvas on the phone and stored on the phone.
//
// Pure: no window, no Babylon. The store and the canvas work live in posterStore.ts and athlete-3d.tsx.

/** The device's own copy of the look (lib/creator/localLook.ts LOCAL_LOOK_KEY — the same string, held here so the
 *  profile's first paint does not load the Creator's modules to read one key; athletePoster.test.ts keeps them equal). */
export const DEVICE_LOOK_KEY = 'fel.myplayer.look.v1';

/** Bump when the stage's camera, light or crop changes, so every kept picture is re-taken once. */
export const POSTER_VERSION = 1;

/** The picture's shape: a portrait, 2 wide by 3 tall, at most this many pixels (the owner's "around 400×600"). */
export const POSTER_MAX_W = 400;
export const POSTER_MAX_H = 600;
export const POSTER_ASPECT = POSTER_MAX_W / POSTER_MAX_H;

/** A 64-bit FNV-1a, as 16 hex characters. Not a secret — only a stable, short key that is not the raw input. */
export function hash64(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 7);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** The device store's key for an account. */
export function ownerKey(userId: string): string { return hash64(`fel-athlete-poster:${userId}`); }

type Stampish = Date | string | number | null | undefined;
const stampOf = (d: Stampish): string => {
  if (d == null) return '-';
  const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(d);
  return Number.isFinite(t) ? String(t) : '-';
};

/** The server's half of the look stamp: when the look rows last changed. */
export function serverLookStamp(lookUpdatedAt: Stampish, buildUpdatedAt: Stampish): string {
  return hash64(`${stampOf(lookUpdatedAt)}|${stampOf(buildUpdatedAt)}`);
}

/** What the stage hands the device store: whose picture, and which look it must show. */
export interface PosterKey { owner: string; stamp: string }

/** The whole look hash a kept picture must match: the server stamp, the device's copy of the look, the version. */
export function posterHash(serverStamp: string, deviceLook: string | null): string {
  return hash64(`v${POSTER_VERSION}|${serverStamp}|${deviceLook == null ? '-' : hash64(deviceLook)}`);
}

/** A stable hash of a resolved identity (key order does not matter; functions and undefined are dropped). */
export function identityHash(id: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.keys(o).sort().reduce<Record<string, unknown>>((a, k) => { const x = o[k]; if (x !== undefined && typeof x !== 'function') a[k] = norm(x); return a; }, {});
    }
    return v;
  };
  return hash64(JSON.stringify(norm(id) ?? null));
}

/** What the device keeps for an account. */
export interface PosterRecord { hash: string; idHash: string; blob: Blob; w: number; h: number; at: number }

/** Whether a kept record may be shown now: the same look, and a picture in it. */
export function posterUsable(rec: Pick<PosterRecord, 'hash' | 'blob'> | null | undefined, hash: string): boolean {
  return !!rec && rec.hash === hash && !!rec.blob && (rec.blob as Blob).size > 0;
}

/** Whether to take (or re-take) the picture once the 3D is live. */
export function posterStale(rec: Pick<PosterRecord, 'hash' | 'idHash'> | null | undefined, hash: string, idHash: string): boolean {
  return !rec || rec.hash !== hash || rec.idHash !== idHash;
}

/**
 * The part of the canvas the picture keeps: a 2:3 column, the canvas's full height, centred (the camera looks at the
 * athlete's middle, and the stage frames by height, so the column is the athlete at any stage width). A canvas narrower
 * than 2:3 keeps its full width and the column is shorter. Then scaled to fit 400×600, never up.
 */
export function posterCrop(cw: number, ch: number): { sx: number; sy: number; sw: number; sh: number; w: number; h: number } {
  const W = Math.max(1, Math.round(cw)), H = Math.max(1, Math.round(ch));
  let sw = Math.round(H * POSTER_ASPECT), sh = H;
  if (sw > W) { sw = W; sh = Math.min(H, Math.round(W / POSTER_ASPECT)); }
  const sx = Math.round((W - sw) / 2), sy = Math.round((H - sh) / 2);
  const k = Math.min(1, POSTER_MAX_W / sw, POSTER_MAX_H / sh);
  return { sx, sy, sw, sh, w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
}

/** The hardware scaling level that renders a canvas `cssH` tall at `POSTER_MAX_H` device pixels (never coarser than `live`). */
export function snapshotScaling(cssH: number, live: number): number {
  if (!(cssH > 0)) return live;
  return Math.min(live, cssH / POSTER_MAX_H);
}
