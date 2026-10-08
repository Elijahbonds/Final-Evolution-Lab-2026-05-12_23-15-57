// bakedLine: which rendered takes say a page's line (VOICEOVER, 2026-10-06). Pure: the lookup is passed in.
//
// The pages build some lines from parts: the movement screen says "I couldn't read that one — once more." and then the framing
// fix, the station's turn and then its instruction. Each part is a fixed sentence the script records once (tools/voice/script/
// coach.csv), so a line is said with takes when the whole line has one, or when EVERY sentence in it has one (played back to
// back, VoiceKit's clip gap between them). A line with any sentence not recorded (a number, a name) is said by the browser
// voice whole: half a line in one voice and half in another sounds worse than either.

/** The line's sentences, punctuation kept ("Good. Next one." → ["Good.", "Next one."]). */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

/** The clip ids that say `text` (one for the whole line, else one per sentence), or null when it cannot be said with takes. */
export function bakedClipsFor(text: string, find: (t: string) => string | undefined): string[] | null {
  const whole = find(text);
  if (whole) return [whole];
  const parts = splitSentences(text);
  if (parts.length < 2) return null;
  const ids = parts.map((p) => find(p));
  return ids.every((x): x is string => !!x) ? ids : null;
}
