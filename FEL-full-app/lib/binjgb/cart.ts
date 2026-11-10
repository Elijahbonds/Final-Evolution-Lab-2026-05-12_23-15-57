// lib/binjgb/cart.ts — BINJGB-SHELF-1 load-your-own: the checks a picked file must pass BEFORE the player sees a byte
// (Cyber L2 + OQ-2, review 9caccc46 / 067e0dce). Pure: no DOM, no network, no storage. The Worker runs validateCart.
//
// Order (no partial load anywhere):
//   1. checkFileMeta — File.size against the hard cap of 8,388,608 bytes and the extension allow-list, BEFORE any read.
//   2. validateCart — in a Worker: archive magic (zip / 7z / rar are rejected, never unpacked), then the header rules:
//      length a power of two ≥ 32 KiB that matches the size byte at 0x148, the header checksum at 0x14D (over
//      0x134–0x14C), the cartridge type at 0x147 on the mapper allow-list, and a sane colour flag at 0x143.
// No logo bytes are compared, so none ship (OQ-2).

/** Hard cap: 8 MiB, the largest real cartridge (Cyber L2). */
export const LOCAL_FILE_MAX_BYTES = 8_388_608;
/** The smallest real cartridge. */
export const CART_MIN_BYTES = 32 * 1024;
/** Extensions accepted, lower-case. Nothing else; no archives. */
export const LOCAL_FILE_EXTENSIONS = ['.gb', '.gbc'] as const;
/** The file input's accept attribute. */
export const LOCAL_FILE_ACCEPT = LOCAL_FILE_EXTENSIONS.join(',');

/** Cartridge types (0x147) the vendored binjgb build runs: plain, MBC1, MBC2, plain+RAM, MBC3, MBC5 families. */
export const MAPPER_ALLOW_LIST: ReadonlySet<number> = new Set([
  0x00, 0x01, 0x02, 0x03, 0x05, 0x06, 0x08, 0x09, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e,
]);

export type CartReject = 'too-big' | 'empty' | 'wrong-type' | 'archive' | 'bad-header';
export type CartCheck = { ok: true } | { ok: false; reason: CartReject };

/** Step 1, before any read: size and extension only (File.name and File.size). */
export function checkFileMeta(file: { name: string; size: number }): CartCheck {
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, reason: 'empty' };
  if (file.size > LOCAL_FILE_MAX_BYTES) return { ok: false, reason: 'too-big' };
  const name = (file.name ?? '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot) : '';
  if (!(LOCAL_FILE_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, reason: 'wrong-type' };
  return { ok: true };
}

const ARCHIVE_MAGIC: readonly number[][] = [
  [0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08],   // zip
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],                                           // 7z
  [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],                                           // rar
];

/** Does the buffer start like a zip, 7z or rar archive? */
export function hasArchiveMagic(bytes: Uint8Array): boolean {
  return ARCHIVE_MAGIC.some((m) => m.length <= bytes.length && m.every((b, i) => bytes[i] === b));
}

/** The header checksum the byte at 0x14D must hold (computed over 0x134–0x14C). */
export function headerChecksum(bytes: Uint8Array): number {
  let x = 0;
  for (let i = 0x134; i <= 0x14c; i++) x = (x - bytes[i] - 1) & 0xff;
  return x;
}

const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

/**
 * Header rules only (no size cap, no archive check): what a cartridge image looks like. T-NO-GAME-FILES reuses this to
 * find cart bytes anywhere in the tree.
 */
export function looksLikeCart(bytes: Uint8Array): boolean {
  const n = bytes.length;
  if (n < CART_MIN_BYTES || !isPowerOfTwo(n)) return false;
  const sizeByte = bytes[0x148];
  if (sizeByte > 8 || CART_MIN_BYTES << sizeByte !== n) return false;
  if (!MAPPER_ALLOW_LIST.has(bytes[0x147])) return false;
  const cgb = bytes[0x143];
  if (!(cgb < 0x80 || cgb === 0x80 || cgb === 0xc0)) return false;
  return headerChecksum(bytes) === bytes[0x14d];
}

/** Step 2, in the Worker, on the bytes: no archives, and the header rules. Never unpacks, never partially loads. */
export function validateCart(buf: ArrayBuffer): CartCheck {
  const bytes = new Uint8Array(buf);
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > LOCAL_FILE_MAX_BYTES) return { ok: false, reason: 'too-big' };
  if (hasArchiveMagic(bytes)) return { ok: false, reason: 'archive' };
  return looksLikeCart(bytes) ? { ok: true } : { ok: false, reason: 'bad-header' };
}
