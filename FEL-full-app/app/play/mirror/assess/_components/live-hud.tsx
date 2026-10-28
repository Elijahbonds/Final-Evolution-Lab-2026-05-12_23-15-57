'use client';

// What the athlete sees across the room while a test runs (SCREEN-REALTIME; SCREEN A: nothing to READ during a rep).
//
// While a rep is up (calibrate / calibrateSide / countdown / active / paused) the only things on the stage are the
// skeleton, ONE big rep number (green for FLASH_MS on a counted rep), the countdown number, colour (flash, skeleton)
// and the "Something hurts: stop" button. The move name, the cue, the framing chips, the dim-light line, the
// rejection and retry boxes and the paused card's words all live on the steps where reading is safe (framing /
// position / the done beats / the mini-result) or are spoken instead. After each test the pain check is a full-screen
// Yes/No with targets at least a quarter of the screen tall, and it waits for the tap — no timeout, no default.
import { Check, Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { RunnerView } from '@/lib/assess/runner';
import { testDef, type Side } from '@/lib/assess/protocol';
import { FRAMING_IN_FRAME, JUMP_LAND_TALL, READ_CLEAR, READ_PARTIAL, SCREEN_TEST_NAMES } from '@/lib/screen/copy';
import { SIDE_TURNED } from '@/lib/mirror/framing';
import { cuesDue, cueFlash, FLASH_COLOUR, FLASH_MS } from '@/lib/screen/realtime-cues';
import { JUMP_GO, JUMP_HOW, JUMP_HOW_FREE, SETUP_EYEBROW, SETUP_PLACE, SETUP_READY_LINE, setupHeadline } from '@/lib/vertical/copy';
import { ArmSwing, HandsOnHips, SetupPicture } from '@/components/vertical/setup-picture';

/** SCREEN A: a rep is up on these steps — voice and colour only, no reading. */
const NO_READING: ReadonlySet<RunnerView['step']> = new Set(['calibrate', 'calibrateSide', 'countdown', 'active', 'paused']);

export function LiveHud({ view, voiceOn = true, onPain, onTakeoff, onStop }: {
  view: RunnerView; voiceOn?: boolean; onPain: (pain: boolean) => void; onTakeoff: (s: Side) => void; onStop: () => void;
}) {
  const v = view;
  const lastCue = useRef(0);

  // exactly one tone per pulse: a counted rep (one 'captured' pulse) plays once, each countdown beat beeps once
  const newest = v.flashCues?.[v.flashCues.length - 1]?.id ?? 0;
  useEffect(() => {
    for (const c of cuesDue(lastCue.current, v.flashCues)) { lastCue.current = c.id; cueFlash(c.kind); }
  }, [newest]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the newest pulse id only

  const noReading = NO_READING.has(v.step) && voiceOn;        // voice off: the caption under the picture carries the words
  const inTest = v.step === 'position' || v.step === 'countdown' || v.step === 'active' || v.step === 'paused' || v.step === 'calibrateSide';
  const showGuide = v.step === 'framing' || v.step === 'position' || v.step === 'calibrate' || v.step === 'calibrateSide';
  const framingOk = !!v.framing?.ok || v.setupReady;
  const sideOn = v.view === 'side';
  const flashColour = v.flash ? FLASH_COLOUR[v.flash] : null;
  // the big rep number flashes green for FLASH_MS on a counted rep (a rep that did not count leaves it unchanged)
  const counted = v.flash === 'captured';

  return (
    <div className="absolute inset-0">
      {/* full-screen colour flash */}
      {flashColour ? (
        <div key={newest || v.flash} className="pointer-events-none absolute inset-0 z-[5] motion-safe:animate-pulse" style={{ backgroundColor: flashColour, opacity: 0.55, animationDuration: `${FLASH_MS}ms` }} aria-hidden />
      ) : null}

      {/* move header: readable from ~3 m — never while a rep is up (SCREEN A) */}
      {/* VERTICAL-EASY: a run of one move (the jump alone) has no "Move 1 of 1" header — the how-to card below says it */}
      {v.move && !noReading && v.move.total > 1 ? (
        <div className="absolute inset-x-2 top-2 z-[6] text-center">
          <p className="text-[16px] font-bold uppercase tracking-[0.2em] text-white/70">Move {v.move.index} of {v.move.total}</p>
          <p className="mt-0.5 text-[clamp(28px,8vw,44px)] font-black leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{v.test && v.test in SCREEN_TEST_NAMES ? SCREEN_TEST_NAMES[v.test as keyof typeof SCREEN_TEST_NAMES] : v.move.name}</p>
          <p className="mt-1 text-[clamp(16px,4.5vw,22px)] font-bold leading-snug text-[#00E5FF]">{v.move.cue}</p>
        </div>
      ) : !noReading && (v.test || v.label) && !(v.move && v.move.total === 1) ? (
        <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-[6]">
          {v.test ? <span className="rounded-full bg-black/60 px-3 py-1 text-[16px] font-bold text-white/85">{v.test in SCREEN_TEST_NAMES ? SCREEN_TEST_NAMES[v.test as keyof typeof SCREEN_TEST_NAMES] : testDef(v.test).short}</span> : null}
          {v.label ? <span className="rounded-full bg-[#00E5FF] px-3 py-1 text-[16px] font-black tracking-wide text-black">{v.label}</span> : null}
        </div>
      ) : null}

      {/* SCREEN A: one big rep number instead of the dots, centre-top, at least 30% of the stage tall */}
      {/* VERTICAL-EASY: nothing counted yet while the athlete gets set — the big "0 / 3" waits for the countdown */}
      {inTest && v.reps.target && !(v.step === 'position' && v.reps.count === 0) ? (
        <div data-rep-counter aria-label={`${v.reps.count} of ${v.reps.target} counted`}
          className={`pointer-events-none absolute inset-x-0 top-1 z-[6] text-center font-black leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)] text-[clamp(160px,40vh,320px)] ${counted ? 'text-[#00FF9D]' : 'text-white'}`}>
          {v.reps.count}<span className="text-white/50"> / </span>{v.reps.target}
        </div>
      ) : null}

      {/* reading-quality badge (UX §3): icon + word, two states, never a percentage; while a rep is up only the icon */}
      {v.readQuality ? (
        <div data-read-quality={v.readQuality} aria-label={v.readQuality === 'clear' ? READ_CLEAR : READ_PARTIAL}
          className={`pointer-events-none absolute bottom-3 left-3 z-[6] flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-[16px] font-bold ${v.readQuality === 'clear' ? 'text-white' : 'text-[#FFB020]'}`}>
          {v.readQuality === 'clear' ? <Eye aria-hidden className="h-5 w-5" /> : <EyeOff aria-hidden className="h-5 w-5" />}
          {!noReading ? <span>{v.readQuality === 'clear' ? READ_CLEAR : READ_PARTIAL}</span> : null}
        </div>
      ) : null}

      {/* setup helper */}
      {showGuide ? (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 z-[2] h-full w-full" aria-hidden>
            <g data-framing-ghost={sideOn ? 'side' : 'front'} fill="none" stroke={framingOk ? '#00FF9D' : '#00E5FF'} strokeWidth="0.6" strokeDasharray={framingOk ? '0' : '2 1.5'}>
              <circle cx="50" cy="16" r="5" />
              {sideOn
                ? <path d="M47 24 L54 24 L55 50 L53 52 L54 86 L50 86 L49 56 L47 86 L44 86 L46 52 L45 50 Z" />
                : <path d="M42 24 L58 24 L61 50 L56 52 L55 86 L51 86 L50 56 L49 86 L45 86 L44 52 L39 50 Z" />}
              <rect x="30" y="86" width="40" height="6" rx="1" />
            </g>
          </svg>
          {/* the state is never colour alone: a check (always) and the words (only where reading is safe) */}
          {framingOk ? (
            <div data-in-frame className="pointer-events-none absolute right-3 top-3 z-[6] flex items-center gap-1.5 rounded-full bg-[#00FF9D] px-3 py-1 text-[16px] font-black text-black">
              <Check aria-hidden className="h-5 w-5" strokeWidth={3} />{!noReading ? <span>{FRAMING_IN_FRAME}</span> : null}
            </div>
          ) : null}
          {sideOn && !framingOk && !noReading ? (
            <p data-turn-side className="absolute inset-x-3 top-[10rem] z-[6] text-center text-[clamp(18px,5vw,24px)] font-black text-[#00E5FF]">{SIDE_TURNED}</p>
          ) : null}
          {/* VERTICAL-EASY (2026-10-27): the setup says itself — a picture of where the device goes, then ONE big word: the
              fix ("Step back", "Whole body in view") in amber, or "Ready" in green with a tick. The full sentence sits under
              it. Before: a line of distances to read ("hip height, 2–3 m away, portrait or landscape") and the fix below. */}
          {(() => {
            const head = setupHeadline(v.framing ?? null, v.setupReady || (v.step === 'calibrate' && framingOk));
            return (
              <div data-setup-card={head.ready ? 'ready' : 'fix'} className="absolute inset-x-3 bottom-20 z-[6] rounded-2xl border border-white/15 bg-black/75 p-3 text-center backdrop-blur">
                <p className="text-[16px] font-bold uppercase tracking-[0.14em] text-white/55">{SETUP_EYEBROW}</p>
                <p data-setup-word className={`mt-1 flex items-center justify-center gap-2 text-[clamp(28px,8vw,40px)] font-black leading-none ${head.ready ? 'text-[#00FF9D]' : 'text-[#FFB020]'}`}>
                  {head.ready ? <Check aria-hidden className="h-8 w-8" strokeWidth={3} /> : null}{head.word}
                </p>
                {head.ready
                  ? (v.step === 'calibrate' ? <p className="mt-2 text-[16px] leading-snug text-white/85">{SETUP_READY_LINE}</p> : null)
                  : (
                    <div className="mt-2 flex items-center gap-3 text-left">
                      <SetupPicture className="h-16 w-auto shrink-0" />
                      <p className="text-[16px] leading-snug text-white/85">{v.framing?.instruction && v.framing.worst !== 'noBody' ? v.framing.instruction : SETUP_PLACE}</p>
                    </div>
                  )}
              </div>
            );
          })()}
        </>
      ) : null}
      {/* MIRROR flight-time (PM): written only, under the jump setup — the flight time reads truest on straight legs */}
      {v.test === 'T5' && !noReading ? (
        <p data-jump-land-tall className="absolute inset-x-3 top-[10rem] z-[6] text-center text-[clamp(18px,5vw,24px)] font-black text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{JUMP_LAND_TALL}</p>
      ) : null}
      {/* VERTICAL-EASY: the jump's one rule as a picture, before the countdown: hands on hips for the jump check, arms
          free for "Measure my vertical" (owner, 2026-10-27: allow arm swing) */}
      {v.test === 'T5' && v.step === 'position' ? (
        <div data-jump-how={v.armsFree ? 'arms-free' : 'hands-on-hips'} className="absolute inset-x-3 top-[13rem] z-[6] flex items-center justify-center gap-3 rounded-2xl bg-black/60 px-3 py-2">
          {v.armsFree ? <ArmSwing className="h-14 w-auto shrink-0" /> : <HandsOnHips className="h-14 w-auto shrink-0" />}
          <p className="text-[16px] font-bold leading-snug text-white">{v.armsFree ? JUMP_HOW_FREE : JUMP_HOW}</p>
        </div>
      ) : null}
      {/* VERTICAL-EASY: "3, 2, 1, Jump!" — the word, big, for the moment the countdown ends */}
      {v.test === 'T5' && v.step === 'active' && v.flash === 'start' ? (
        <div data-jump-go className="pointer-events-none absolute inset-0 z-[7] grid place-items-center">
          <span className="text-[clamp(72px,22vw,140px)] font-black uppercase leading-none text-[#00FF9D] drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">{JUMP_GO}</span>
        </div>
      ) : null}
      {v.dimWarning && !noReading ? (
        <p className="absolute inset-x-3 top-[7.5rem] z-[6] text-center text-[16px] font-bold text-[#FFB020]">Low light — move closer to a window if you can</p>
      ) : null}
      {(v.step === 'calibrate' || v.step === 'calibrateSide') && v.hold > 0 ? (
        <div className="absolute inset-x-10 bottom-24 z-[6] h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-[#00FF9D] transition-[width]" style={{ width: `${Math.round(v.hold * 100)}%` }} />
        </div>
      ) : null}

      {/* countdown */}
      {v.step === 'countdown' && v.countdown ? (
        <div className="absolute inset-0 z-[7] grid place-items-center">
          <span className="text-[clamp(120px,32vw,180px)] font-black leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">{v.countdown}</span>
        </div>
      ) : null}

      {/* a rep that did not count: the low tone and the amber flash say it; the words stay for the steps that may show them */}
      {v.rejection && !noReading ? (
        <div data-rejection className="absolute inset-x-4 bottom-28 z-[6] rounded-2xl border border-[#FFB020]/50 bg-black/80 px-4 py-3 text-center">
          <p className="text-[clamp(16px,4.5vw,22px)] font-bold text-[#FFB020]">{v.rejection.text}</p>
        </div>
      ) : null}
      {v.retryMessage && !noReading ? (
        <div data-retry className="absolute inset-x-4 bottom-28 z-[6] rounded-2xl border border-[#FFB020]/50 bg-black/80 px-4 py-3 text-center">
          <p className="text-[clamp(16px,4.5vw,22px)] font-bold text-[#FFB020]">{v.retryMessage}</p>
        </div>
      ) : null}

      {/* tracking lost: a dark pause (the fix is spoken); the words stay only when the voice is off */}
      {v.step === 'paused' ? (
        <div data-tracking-loss className="absolute inset-0 z-[8] grid place-items-center bg-black/60 px-6 text-center" aria-hidden={voiceOn}>
          {!voiceOn ? <p className="text-[clamp(20px,5.5vw,30px)] font-black leading-tight">{v.instruction}</p> : null}
        </div>
      ) : null}

      {/* done beat */}
      {(v.step === 'partDone' && v.done) || (v.step === 'miniResult' && v.mini) ? (
        <div data-done-beat className="absolute inset-0 z-[8] grid place-items-center bg-black/60 px-6 text-center">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#00FF9D] text-black"><Check aria-hidden className="h-9 w-9" /></span>
            <p className="mt-3 text-[clamp(24px,7vw,32px)] font-black leading-tight">{v.step === 'miniResult' && v.mini ? v.mini.text : 'Done'}</p>
          </div>
        </div>
      ) : null}

      {/* after each test (SCREEN A): one big tap, at least a quarter of the screen tall; it waits — no timeout, no default */}
      {v.step === 'pain' || v.step === 'painCheck' ? (
        <div data-pain-check className="absolute inset-0 z-[9] flex flex-col bg-black/70 px-5 py-5 text-center">
          <p className="shrink-0 text-[clamp(24px,6vw,34px)] font-black leading-tight">{v.step === 'pain' ? 'Any pain right now?' : 'Any pain in that one?'}</p>
          <p className="mx-auto mt-1 max-w-sm shrink-0 text-[16px] text-white/65">If something hurts, the screen stops here and nothing is saved.</p>
          <div className="mt-4 flex min-h-0 flex-1 gap-3">
            <button type="button" onClick={() => onPain(false)} data-pain="no" className="min-h-[25%] flex-1 self-stretch rounded-3xl bg-[#00FF9D] text-[22px] font-black text-black">No</button>
            <button type="button" onClick={() => onPain(true)} data-pain="yes" className="min-h-[25%] flex-1 self-stretch rounded-3xl bg-[#FFB020] text-[22px] font-black text-black">Yes</button>
          </div>
        </div>
      ) : null}
      {!v.handsFree && v.step === 'takeoff' ? (
        <Prompt title="Which foot do you take off from?" note="Asked once. Your sided results are labelled with your jumping leg.">
          <button type="button" onClick={() => onTakeoff('left')} className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-[18px] font-black text-black">Left</button>
          <button type="button" onClick={() => onTakeoff('right')} className="inline-flex min-h-12 items-center rounded-full bg-white px-7 text-[18px] font-black text-black">Right</button>
        </Prompt>
      ) : null}

      {inTest || v.step === 'calibrate' ? (
        <div className="absolute bottom-3 right-3 z-[6]">
          <button type="button" onClick={onStop} data-stop className="inline-flex min-h-12 items-center rounded-2xl border border-[#FFB020]/60 bg-black/70 px-3 text-[16px] font-bold text-[#FFB020]">
            Something hurts: stop
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Prompt({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-[9] grid place-items-center bg-black/65 px-6 text-center">
      <div>
        <p className="text-[26px] font-black leading-tight">{title}</p>
        <p className="mx-auto mt-2 max-w-sm text-[16px] text-white/65">{note}</p>
        <div className="mt-5 flex justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}
