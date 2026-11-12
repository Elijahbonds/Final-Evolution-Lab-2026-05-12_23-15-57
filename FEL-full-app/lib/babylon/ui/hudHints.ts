// hudHints — CLEAR THE SCREEN (hoops-p08, 2026-11-12; docs/HOOPS-AAA-GAP-SHOW.md §4 sinker 2, §5 "first three moves" 1).
//
// The audit's phone shots: the MC's subtitle box over the hero in four of four play shots, the 3v3's subtitle + pass chip + control
// hint stacked on one spot, and pad and keyboard words ("SQUARE (L)", "L2 (F)", "J ·", "X — NEXT PROP FAMILY · D-PAD …") on a
// touch screen that has none of those buttons. This is the pure half of the fix (no React, no DOM, no Babylon), read by the hoops
// hosts in components/games:
//   1. CAPTIONS WHILE THE VOICE IS ON — `showMicCaption`: a line whose audio actually started (ModeMic marks it `micVoiced`) is heard,
//      so its subtitle stays off unless the player asked for subtitles (the CC chip beside MC) or the knob turns the old behaviour
//      back on. A line with no audio (voice off, no bank, no Web Audio) still shows: the words are the only way it lands. Screen
//      readers are untouched — they read `mic` from the harness's caption bus, not from this box.
//   2. HINTS FOR THE FIRST PLAYS ONLY — `HintBudget`: the control hint shows for the first `hud.hintPlays` plays of a mode in this
//      browser session, then stops (a rule warning — "GET OUT OF THE PAINT" — is not a control hint and always shows).
//   3. NO PAD OR KEYBOARD WORDS ON A TOUCH SCREEN — `touchHint`: a pad button that the touch deck has under the same slot is named by
//      the deck's own word (SQUARE (L) is the X slot: SHOOT on the 1v1 deck); any part of the line that still names a pad or a key
//      ("L1 BOXES OUT", "D-PAD picks inside …") is dropped, and a line with nothing left is not shown. `passKey` is the 3v3 pass chip's
//      button in the device's own name.
import { feel } from '@/lib/feel-panel/feel';
export { MC_SUBS_WITH_VOICE, showMicCaption, CC_STORAGE_KEY, readCcPref, writeCcPref } from './micSubtitles';
import { MODE_VERBS } from './modeVerbs';
import { PAD_LABELS, type PadFamily } from '@/lib/input/padLabels';

/** hud.hintPlays: the control hint shows for this many plays of a mode per browser session. 0 = always, as before. */
export const HINT_PLAYS = 3;

export type HintDevice = 'pad' | 'touch' | 'keys';

// ── 2. the hint budget ────────────────────────────────────────────────────────────────────────────────────────────────
/** A line that is a rule warning, not a control hint: always shown. */
const ALWAYS = /^GET OUT OF THE PAINT$/;

/** The HUD keys whose change ends a play: a score (either side), the next ball of a rack, the next dunk, the next event. */
const PLAY_KEYS = ['score', 'foeScore', 'myScore', 'theirScore', 'rivalScore', 'p1Score', 'p2Score', 'ballIdx', 'dunkNum', 'eventNum'] as const;

/** Plays seen per mode in this page's session (and in sessionStorage, so a reload of the same tab keeps counting). */
const seen = new Map<string, number>();
const SS_KEY = 'fel.hud.hintPlays.v1';
function loadSeen(mode: string): number {
  if (seen.has(mode)) return seen.get(mode)!;
  let n = 0;
  try { if (typeof sessionStorage !== 'undefined') n = Number(JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}')[mode] ?? 0) || 0; } catch { /* storage blocked */ }
  seen.set(mode, n); return n;
}
function saveSeen(mode: string, n: number): void {
  seen.set(mode, n);
  try {
    if (typeof sessionStorage === 'undefined') return;
    const all = JSON.parse(sessionStorage.getItem(SS_KEY) ?? '{}') as Record<string, number>;
    all[mode] = n; sessionStorage.setItem(SS_KEY, JSON.stringify(all));
  } catch { /* storage blocked: this page only */ }
}
/** Tests: forget every mode's count. */
export function resetHintPlays(): void {
  seen.clear();
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SS_KEY); } catch { /* storage blocked */ }
}

/**
 * Counts a mode's plays from the HUD it draws: one play ends each time a PLAY_KEYS value changes, or a shot or dunk starts (the
 * meter `shotMeterT` rises from 0). The first values it sees are the starting score, not a play.
 */
export class HintBudget {
  private last = new Map<string, unknown>();
  private meterUp = false;
  constructor(readonly mode: string) {}
  /** Feed the HUD each time it changes. Returns the plays seen so far in this mode this session. */
  observe(hud: Readonly<Record<string, unknown>>): number {
    let n = loadSeen(this.mode), plays = 0;
    for (const k of PLAY_KEYS) {
      if (!(k in hud)) continue;
      const v = hud[k];
      if (this.last.has(k) && this.last.get(k) !== v) plays++;
      this.last.set(k, v);
    }
    const m = typeof hud.shotMeterT === 'number' ? hud.shotMeterT : 0;
    if (m > 0 && !this.meterUp) plays++;
    this.meterUp = m > 0;
    if (plays) { n += plays; saveSeen(this.mode, n); }
    return n;
  }
  /** The hint to draw now, after the budget (the line, or ''). */
  gate(line: string): string {
    if (!line) return '';
    if (ALWAYS.test(line)) return line;
    const cap = Math.round(feel('hud.hintPlays', HINT_PLAYS));
    if (cap <= 0) return line;
    return loadSeen(this.mode) < cap ? line : '';
  }
}

// ── 3. the device's own words ─────────────────────────────────────────────────────────────────────────────────────────
/** A pad or keyboard word left in a line: a face-button name, a trigger or shoulder, SHIFT, the d-pad, a key in brackets, or a lone
 *  letter used as a button ("X — …", "J · …", "+ J TO PASS"). */
const PAD_WORD = /\b(SQUARE|TRIANGLE|CIRCLE|CROSS|BOTTOM BUTTON|L1|L2|R1|R2|LB|RB|LT|RT|SHIFT|D-PAD|DPAD|SPACE|ESC)\b|\([A-Z]( \+ [A-Z])?\)|(^|[\s+])[ABXYJKLIQE](?=\s[—·:]|\sTO\b|$)/;

/** Pad button names in the hoops lines → the canonical slot they press (the PlayStation face names, the keyboard letter beside). */
const SLOT_WORDS: ReadonlyArray<[RegExp, 'A' | 'B' | 'X' | 'Y']> = [
  [/\bSQUARE(?: \([A-Z]\))?/g, 'X'],
  [/\bTRIANGLE(?: \([A-Z]\))?/g, 'Y'],
  [/\bCIRCLE(?: \([A-Z]\))?/g, 'B'],
  [/\bBOTTOM BUTTON(?: \([A-Z]\))?/g, 'A'],
  [/(?<=\+ )J(?= TO\b)/g, 'A'],
];

/** Words after a button that read on as they are ("SHOOT AT THE RIM", "SHOOT ALONE = LAY IT IN", "LET GO OF SHOOT IN THE GREEN"). */
const CONNECTORS = new Set(['TO', 'AT', 'IN', 'ON', 'ALONE', 'FOR', 'AND', 'OR', 'WITH', 'CALLS']);

/** What the touch deck's slot is called in this mode, but only when the slot presses that same button (the dunk's Y is RUN, a held
 *  trigger — "Y — SELF-LOB" must not become "RUN — SELF-LOB"). */
function deckWord(mode: string, slot: 'A' | 'B' | 'X' | 'Y'): string {
  const cfg = MODE_VERBS[mode]; if (!cfg) return '';
  const b = cfg.buttons['ABXY'.indexOf(slot)];
  const e = b?.emit as { t?: string; btn?: string } | null | undefined;
  return b && b.label && e && e.t === 'button' && e.btn === slot ? b.label : '';
}

/**
 * The line a touch screen shows: deck words for the pad buttons the deck has, then every ' · ' part that still names a pad or a key
 * dropped. '' when nothing is left.
 */
export function touchHint(line: string, mode: string): string {
  if (!line) return '';
  let s = line;
  // the turbo: "R2 + SQUARE (SHIFT + L)" (the dunk at the rim) and "R2 (SHIFT)" are the TURBO pad on a hoops deck
  if (MODE_VERBS[mode]?.turbo) s = s.replace(/\bR2(?: \(SHIFT\))? SPRINT\b/g, 'TURBO = SPRINT').replace(/\bR2(?: \(SHIFT\))?(?= \+)/g, 'TURBO').replace(/\s\(SHIFT \+ [A-Z]\)/g, '');
  for (const [re, slot] of SLOT_WORDS) {
    const w = deckWord(mode, slot); if (!w) continue;
    // the deck's word, then: "<W> TO <W>" stays for the tidy below; "<W> TO …" is "TAP <W> TO …"; "<W> <VERB>" is "<W> = <VERB>"
    // when the verb is not the button's own word ("SHOOT = STEAL ON THE CROSSOVER"); a connector ("AT THE RIM", "ALONE") reads as is
    s = s.replace(re, (_m: string, ...rest: unknown[]) => {
      const at = rest[rest.length - 2] as number, str = rest[rest.length - 1] as string;
      const next = /^ ([A-Z!]+)/.exec(str.slice(at + _m.length))?.[1] ?? '';
      if (next === 'TO' && !str.slice(at + _m.length).startsWith(` TO ${w}`)) return `TAP ${w}`;
      return next && next !== w && !CONNECTORS.has(next) ? `${w} =` : w;
    });
  }
  // tidy what the swap leaves: "SHOOT SHOOT" → "SHOOT", "BLOCK TO BLOCK" → "TAP BLOCK", "HOLD CHARGE = TAKE THE CHARGE" → "HOLD CHARGE"
  s = s.replace(/\b([A-Z!]+) \1\b/g, '$1').replace(/\b([A-Z!]+) TO \1\b/g, 'TAP $1').replace(/\b(CHARGE)(?: =)? TAKE THE CHARGE\b/g, '$1');
  // a part that opens on a face letter ("Y GO UP", "B KICK-UP") names a pad button too
  const parts = s.split(/\s·\s/).map((p) => p.trim()).filter((p) => p && !PAD_WORD.test(p) && !/^[ABXY]\s(?=[A-Z])/.test(p));
  return parts.join(' · ');
}

/** The hint as this device should read it ('' = nothing to show). Pad and keys keep the line as the mode wrote it. */
export function hintForDevice(line: string, mode: string, device: HintDevice): string {
  return device === 'touch' ? touchHint(line, mode) : line;
}

/** The 3v3 pass chip's button: the deck needs none (its button says PASS), a pad its own word for A, the keyboard J (as before). */
export function passKey(device: HintDevice, family: PadFamily | null): string {
  if (device === 'touch') return '';
  if (device === 'pad') return PAD_LABELS[family ?? 'generic'].A;
  return PAD_LABELS.keyboard.A;
}
