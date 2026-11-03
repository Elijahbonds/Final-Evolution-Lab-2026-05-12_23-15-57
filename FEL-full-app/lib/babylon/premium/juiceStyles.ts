// The looks of JuiceKit's DOM text — the score pop, the beat banner, the refusal callout — with no Babylon in the import
// chain, so the readability rig (scripts/readable/scenes.tsx) draws the same strings over real backdrops and measures them
// (lane/readable, 2026-11-02; docs/READABLE.md "Text over 3D").
//
// What changed for readability, measured on the rig over the brightest backdrops (snow, sky, sunlit court):
//   - every piece of text carries a TIGHT dark edge first (`0 0 2px` + `0 2px 4px`) before its soft glow. The soft
//     24 px blur alone darkened the snow behind a cyan "WAVE CLEAR" to about 1.5:1; the tight edge sits right under
//     the strokes, so the letters hold their 3:1 on the worst frame and still glow on a dark one.
//   - the callout's pill is 0.82 dark (was 0.62: #cbd5e1 on that pill over snow was 4.0:1), and its text is 14 px at
//     the least on a phone (was 12 px: clamp(12px, 1.8vw, 16px) is 12 px at 390 wide) — the HUD's must-read floor.
import { READABLE } from '@/lib/readable/rules';

/** The dark edge every bare piece of HUD text starts its shadow with. */
export const TEXT_EDGE = '0 0 2px rgba(0,0,0,.95),0 2px 4px rgba(0,0,0,.85)';

/** The world-space score pop ("+3", "+12 PRQ"). */
export function scorePopCss(accent: string): string {
  return `font:900 clamp(22px,4vw,34px) var(--fel-font-display,ui-monospace);color:${accent};` +
    `text-shadow:${TEXT_EDGE},0 2px 12px rgba(0,0,0,.65),0 0 22px ${accent}55;`;
}

/** The centre beat banner (FIRST DOWN!, WAVE CLEAR), resting look; JuiceKit adds the pop transform. */
export function bannerCss(accent: string): string {
  return `position:absolute;left:50%;top:32%;font:900 clamp(28px,6vw,52px) var(--fel-font-display,ui-monospace);color:${accent};` +
    `letter-spacing:.06em;text-shadow:${TEXT_EDGE},0 4px 24px rgba(0,0,0,.7),0 0 34px ${accent}66;`;
}

/** The callout pill under the action ("NO BALL", "WAIT FOR THE QUESTION"). */
export const CALLOUT_PLATE = 'rgba(5,6,10,.82)';
export function calloutCss(color: string): string {
  return 'position:absolute;left:50%;top:68%;transform:translate(-50%,-50%);padding:4px 12px;border-radius:999px;' +
    `background:${CALLOUT_PLATE};font:800 clamp(${READABLE.hudPhonePx}px,1.8vw,16px) var(--fel-font-display,ui-monospace);color:${color};` +
    'letter-spacing:.12em;pointer-events:none;';
}
