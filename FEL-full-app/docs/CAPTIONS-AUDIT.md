# Captions audit — spoken lines across modes and lessons (A11-04)

lane/a11y-design, 2026-10-25. Closes docs/LAUNCH-CHECKLIST.md E6 ("unknown, partly done"): the audit is recorded here.

**Method.** `npx tsx scripts/a11y/captions-audit.mts` finds every place the app speaks (speakNatural, a natural
speaker, `speechSynthesis.speak`, `speakCues`, a voice hook, `VoiceKit.play`) and looks in the same handler for the line
reaching a screen or a live region (`playCaptioned` / a `caption` field, `setHud({ mic })` → the caption bus and
`components/games/mic-caption.tsx`, a React state set with the text, an `aria-live` region). Every site it could not
confirm was read by hand; the verdicts are below. The modes' MC, sidekick, player and coach lines go through
`ModeMic` (`lib/babylon/audio/mic/ModeMic.ts`), which puts each line on the HUD's `mic` key when the audio starts — or
at once when the voice is off or its bank is missing (`captionWithoutAudio`) — and `hudCaptions.ts` announces it.

**Result: 37 speech sites. Every spoken line a player must act on has an on-screen equivalent.** No uncaptioned
spoken line was found in the modes, the Mirror, the Quick Screen, the drills or Prove It.

| Where | Spoken | On screen | Verdict |
|---|---|---|---|
| The court modes' mic (`ModeMic` / `MicDirector`: dunk, dunk duel, 1v1, 3v3, 3PT, Court Carnival) | MC, sidekick, coach and player lines | HUD `mic` + `micWho` (MicCaption), announced politely (`hudCaptions.ts`) | captioned |
| `ModeMic` crowd channel | crowd chants and reactions | **not captioned** (`caption = c.channel !== 'crowd'`) | by design: ambient sound, not speech a player acts on. **Owner call** below |
| Brain Brawl seat lines (`BrainBrawlMode.speak`) | none — speech bubbles are text | the bubble (`say1`/`say2` on the HUD) | text, nothing to caption |
| Brain Brawl host (`BrainBrawlMode.ts:280`) | the host's line | `VoiceKit.play({ caption })` | captioned |
| Dance host (`DanceMode.ts:700`), Music studio Okta (`StudioMode.tsx`) | host lines | `hostCaption` → MicCaption | captioned |
| Adventure / story (`story/voice.ts`, `AdventureMode.ts:461`) | story lines | every line a `critical` cue on the caption bus, always | captioned |
| Body play coach (`lib/move/bodyPlay.ts:431`), drills (`use-live-drill.ts:67`) | coach cues | `VoiceKit.play({ caption })` / `playCaptioned` | captioned |
| Mirror (`mirror-harness.tsx`): live cues, deeper, framing, refusal, station lines | coach cues | the cue chip (`setCue`), `setDunkSaid`, the station's `runner.say` on the stage | captioned |
| Mirror square-up line (`:657`) | "square up" once a session | `squareUpSaid` → the line in the summary (`:1430`) | captioned |
| Mirror screen result (`:944`) | the server's message | `setScreenMessage` | captioned |
| Quick Screen (`assess-app.tsx`, `use-voice.ts`) | every instruction | the caption bar + an `aria-live` region; voice off keeps the caption | captioned |
| Prove It (`prove-it.tsx`): result, "Next up!", "Go when ready", rim hang, "10 seconds" | announcer lines | the result line and the next athlete's name (`:906`, `:911`), the big GO / RIM word (`:865`) and the refusal line (`:886`), the "Next up in N" countdown (`:908`) | captioned (an equivalent, not the words verbatim, for "Go when ready" and "10 seconds") |
| Party voice (`components/party/social/party-voice.tsx`) | people talking, live | — | live human voice: out of scope for captions (no live transcription; owner call below) |

**Lessons.** The Playbook (`components/education/chapter-reader.tsx`) is text with steps; its `<video>` slot plays a
film when `lib/education/films.json` lists one, and that list is empty today, so no lesson speaks yet. The slot has no
`<track kind="captions">` and no accessible name: the first film to ship needs both. Routed (not this lane's file): add a
`captions` WebVTT path beside each film in `films.json` and render `<track kind="captions" srclang="en" default>` plus an
`aria-label` from the lesson title — teacher-platform (EDU-05, own-storage media) owns that work in wave 3. The same
applies to the coach's demo video (`app/coach/_components/today-view.tsx:441`, coach lanes) and the exercise library's
films (`components/library/library-demo.tsx:178`, library lanes): today their sources are silent demonstrations; a film
with speech needs a track.

**Owner calls**

1. Crowd chants: (a, recommended) leave them uncaptioned — they are ambience, and a caption bar full of "DE-FENSE" would
   bury the lines a player acts on; (b) caption them at the quiet `ambient` importance (`captions.ts`), which ages out
   after 2.5 s and is dropped first when the bar is full.
2. Live party voice: (a, recommended) no transcription — it would send people's voices to a speech service, which the
   privacy rules do not allow for teens; (b) a device-only transcription where the browser offers one, adults only.
