// THE MIC's names — the dunks, the rivals and the numbers an MC calls out after a line (2026-09-24).
//
// A pre-rendered voice cannot read a string it has never seen, so every name the game can put on screen is rendered once per MC
// as a short STINGER ("The windmill!", "Forty-seven!") and said right after the call. This table is built from the game's own
// vocabulary (DunkSystem's tricks, runway tricks and signature dunks, the game dunks, the rivals), so a dunk added there shows up
// here; the test fails if a label has no stinger.

import { DUNK_TRICKS, RUNWAY_TRICKS, SIGNATURE_DUNKS, SPIN_720 } from '@/lib/babylon/core/DunkSystem';
import { DUNK_RIVALS } from '@/lib/babylon/core/DunkRivals';

/** The labels a plain dunk is named by when no trick was thrown (DunkMode.finishBanner) and the 1v1/3v3 game dunks (HoopsDunks). */
export const PLAIN_DUNK_LABELS = ['ONE-HAND HAMMER', 'TWO-HAND HAMMER', 'ONE-HAND FLUSH', 'TWO-HAND FLUSH', 'POWER SLAM', 'CRADLE', 'REVERSE', "PAUSIN'"] as const;

export const slug = (s: string): string => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty'];
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)], o = n % 10;
  return o ? `${t}-${ONES[o]}` : t;
}

/** A game label as the voice should say it: sentence case, digits and symbols spelled out, "eastbay" as two words. */
export function speakable(label: string): string {
  const s = label.toLowerCase()
    .replace(/\b720\b/g, 'seven-twenty').replace(/\b360\b/g, 'three-sixty')
    .replace(/&/g, 'and').replace(/eastbay/g, 'east bay').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface Stinger { key: string; text: string }
/** Every stinger an MC records: the dunks (tricks, runway tricks, signatures, plain and game dunks), the rivals, the numbers 0–60. */
export function allStingers(): Stinger[] {
  const out = new Map<string, string>();
  const dunk = (label: string) => { const k = `dunk:${slug(label)}`; if (!out.has(k)) out.set(k, `${speakable(label)}!`); };
  for (const t of [...DUNK_TRICKS, SPIN_720]) dunk(t.label);
  for (const t of RUNWAY_TRICKS) dunk(t.label);
  for (const s of SIGNATURE_DUNKS) dunk(s.name);
  for (const l of PLAIN_DUNK_LABELS) dunk(l);
  for (const r of DUNK_RIVALS) out.set(`rival:${r.id}`, `${speakable(r.name)}!`);
  for (let n = 0; n <= 60; n++) out.set(`num:${n}`, `${speakable(numberWords(n))}!`);
  return [...out.entries()].map(([key, text]) => ({ key, text }));
}

/**
 * The stinger keys for a dunk's display name: a signature is called by its own name; a chain is called piece by piece
 * ("SELF-LOB → WINDMILL" → the self-lob, then the windmill). Trailing "!" and the finish banners' punctuation are ignored.
 */
export function dunkStingers(displayName: string): string[] {
  const clean = displayName.replace(/[!.]+$/g, '').trim();
  const sig = SIGNATURE_DUNKS.find((s) => s.name === clean.toUpperCase());
  if (sig) return [`dunk:${slug(sig.name)}`];
  return clean.split(/\s*→\s*/).filter(Boolean).map((p) => `dunk:${slug(p)}`);
}
