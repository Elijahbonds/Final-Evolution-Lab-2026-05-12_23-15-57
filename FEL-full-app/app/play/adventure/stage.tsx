'use client';

// /play/adventure — the story on the real ModeHarness (ADVENTURE PLAN Phase B). Mounts MODES.adventure, whose story face
// (AdventureMode adventureFace) plays the hub and Chapter 1. The flow:
//   1. the device save is read; a first run (no partner) shows the PARTNER PICKER (a creature or a character, the
//      player's choice), written to the device save under the save policy (a teen's save never leaves the device);
//   2. the CONTROLS SCREEN before START (the start screen's button map and the Adventure's keyboard / touch columns);
//   3. play: nothing on screen but the HUD (meters, the objective line) and, while a scene plays, the DIALOGUE BOX
//      (its PLACEHOLDER tag on a placeholder chapter's lines);
//   4. pause: the controls again, the MIRROR on/off toggle, and the REBINDING screen.
// lane/story (2026-11-21; docs/STORY-FINISH-PLAN.md): the START screen says where you are (story.startProgress: START, CONTINUE at
// the saved step, or EXPLORE THE HUB once every chapter is played); a chapter's END CARD (story.endCard) says what it gave you and
// what comes next ("to be continued" until the owner's next chapter); and the start screen, the pause screen and the end card each
// have the WAY OUT — back to Venice when the story was opened from Venice's story gate (?from=venice), else back to Play.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { runMode, InputBus, type ModePhase, type HudValue } from '@/lib/babylon';
import { MODES } from '@/lib/babylon/modes/registry';
import { TouchOverlay } from '@/lib/babylon/ui/TouchOverlay';
import { buttonMap } from '@/lib/creator/cardSlot';
import { CONTROLS_SHEET } from '@/lib/babylon/adventure/host/inputMap';
import { storyUi } from '@/lib/babylon/adventure/story/uiBridge';
import { loadStorySave, savePartnerPick, type PartnerPick } from '@/lib/babylon/adventure/story/party';
import { partnerSlotChoices } from '@/lib/babylon/adventure/partner/identity';
import { readLocalLook } from '@/lib/creator/localLook';
import { STORY_INDEX } from '@/lib/babylon/adventure/story/data';
import { storyExitFor } from '@/lib/adventure/venice/storyDoor';
import { progressLine, startProgressOn, storyProgress, type StoryProgress } from '@/lib/babylon/adventure/story/progress';
import { StoryEndCard } from '@/components/adventure/StoryEndCard';
import { shown } from '@/lib/babylon/adventure/story/shown';
import { DialogueBox } from '@/components/adventure/DialogueBox';
import { PartnerPicker } from '@/components/adventure/PartnerPicker';
import { RebindPanel } from '@/components/adventure/RebindPanel';
import { AdventureRadial } from '@/components/adventure/AdventureRadial';
// look pass C2 (story.titleCard): the READY screen as a title card, the controls one tap away; the picker's silhouette cards
import { StoryTitleCard } from '@/components/adventure/StoryTitleCard';
import { storyTitleCardOn } from '@/lib/babylon/adventure/story/titleCard';

const MODE_KEY = 'adventure';
/** The route's name, as app/play/adventure/page.tsx titles it. */
export const ADVENTURE_TITLE = 'The Adventure';

type Gate = 'checking' | 'pick' | 'ready';

export function AdventureStoryStage({ signedIn }: { signedIn: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const busRef = useRef<InputBus | null>(null);
  const mountedRef = useRef(false);
  const [gate, setGate] = useState<Gate>('checking');
  const [slots, setSlots] = useState<{ id: string; label: string }[]>([]);
  const [phase, setPhase] = useState<ModePhase>('loading');
  const [hud, setHud] = useState<Record<string, HudValue>>({});
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);
  const [rebind, setRebind] = useState(false);
  // lane/story: where the story stands on this device (the start screen), and the way out (Venice or Play)
  const [progress, setProgress] = useState<StoryProgress | null>(null);
  const [exit, setExit] = useState(() => storyExitFor(null));
  useEffect(() => { try { setExit(storyExitFor(window.location.search)); } catch { /* Play */ } }, []);
  const ui = useSyncExternalStore(storyUi.subscribe, storyUi.getSnapshot, storyUi.getSnapshot);
  // look pass C2: read after mount (the feel panel lives in the browser), before the picker or the READY screen can show
  const [titleCard, setTitleCard] = useState(false);
  useEffect(() => { setTitleCard(storyTitleCardOn()); }, []);

  useEffect(() => { try { setTouch(window.matchMedia('(pointer: coarse)').matches); } catch { setTouch(false); } }, []);

  // 1. who is playing (the save policy) and whether they have a partner yet
  useEffect(() => {
    let off = false;
    (async () => {
      let closet: unknown = null;
      if (signedIn) {
        try { const r = await fetch('/api/v1/closet', { cache: 'no-store' }); if (r.ok) closet = await r.json(); } catch { closet = null; }
      }
      if (off) return;
      storyUi.who = { signedIn, closet };
      let local: { face?: unknown } | null = null;
      try { local = readLocalLook() as { face?: unknown } | null; } catch { local = null; }
      try { setSlots(partnerSlotChoices(closet as never, local)); } catch { setSlots([]); }
      const { save } = loadStorySave(Date.now());
      try { setProgress(startProgressOn() ? storyProgress(save) : null); } catch { setProgress(null); }
      setGate(save.partner ? 'ready' : 'pick');
    })();
    return () => { off = true; };
  }, [signedIn]);

  const pick = (p: PartnerPick) => {
    const { save } = loadStorySave(Date.now());
    const r = savePartnerPick(save, p, { now: Date.now(), who: storyUi.who });
    if (!r) { setErr('that partner could not be made'); return; }
    // a device without storage still plays: the mode falls back to the default partner for this session
    setGate('ready');
  };

  // 2. the harness, once the party exists
  useEffect(() => {
    const canvas = canvasRef.current;
    const def = MODES[MODE_KEY];
    if (gate !== 'ready' || !canvas || mountedRef.current) return;
    mountedRef.current = true;
    if (!def) { setErr('the adventure mode is not registered'); return; }
    const bus = new InputBus();
    busRef.current = bus;
    let stop: (() => void) | null = null;
    let disposed = false;
    const startTimer = setTimeout(() => {
      if (disposed) return;
      runMode(def, {
        canvas,
        input: bus,
        onPhase: (p, d) => { if (!disposed) { setPhase(p); if (p === 'error') setErr(String(d)); } },
        onHud: (h) => { if (!disposed) setHud((prev) => ({ ...prev, ...h })); },
        // PUBLIC-POLISH (2026-11-02, live sweep D4): the server said who this is, so a guest's spawn does not ask the closet
        // (a 401 and a console error for every guest; FIRST-DUNK-BUDGET's flag, as /try passes it)
        guest: !signedIn,
        // account XP waits for the session route to take a new mode (Phase B report); the Adventure level is in the save
        resultSink: async () => {},
      }).then((s) => { if (disposed) s(); else stop = s; })
        .catch((e) => { if (!disposed) setErr(String(e?.message ?? e)); });
    }, 0);
    return () => { disposed = true; mountedRef.current = false; stop?.(); clearTimeout(startTimer); };
  }, [gate, signedIn]);

  const start = () => busRef.current?.emit({ t: 'button', btn: 'START', pressed: true });
  const playing = phase === 'playing' || phase === 'countdown';
  const chapter = STORY_INDEX.chapters[0];
  const startTitle = shown(progress ? progressLine(progress) : chapter?.title ?? '');
  const startWord = progress ? progress.button : 'START';
  const back = (
    <a href={exit.href} data-testid="adventure-exit" className="rounded border border-white/20 px-4 py-2 text-[12px] font-bold tracking-wide text-white/80">
      {exit.label.toUpperCase()}
    </a>
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-mono text-xs text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none outline-none" />
      {gate === 'pick' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 p-4">
          {/* PUBLIC-POLISH (2026-11-02, live sweep J5): the route's own name (its page title), not "[PLACEHOLDER]". The chapter,
              move and monster names stay [PLACEHOLDER] until the owner names them (their own guards hold that). */}
          <p className="text-[12px] tracking-[0.3em] text-white/50">{ADVENTURE_TITLE.toUpperCase()}</p>
          <PartnerPicker slots={slots} onPick={pick} cards={titleCard} />
          {err && <p className="text-red-400">{err}</p>}
        </div>
      )}
      {gate === 'ready' && playing && <Hud hud={hud} />}
      {gate === 'ready' && playing && ui.dialogue && <DialogueBox d={ui.dialogue} cmd={storyUi.command} />}
      {gate === 'ready' && (phase === 'ready' || phase === 'loading') && titleCard && (
        <StoryTitleCard kicker={ADVENTURE_TITLE.toUpperCase()} line={startTitle} title={progress?.chapterTitle ? shown(progress.chapterTitle) : null}
          ready={phase === 'ready'} word={startWord} back={back} err={err} onStart={start} controls={<Controls />} />
      )}
      {gate === 'ready' && (phase === 'ready' || phase === 'loading') && !titleCard && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 p-4">
          <p className="text-[12px] tracking-[0.3em] text-white/50" data-testid="adventure-start-title">THE ADVENTURE · {startTitle}</p>
          {progress?.chapterTitle && <p className="text-[12px] font-bold text-white/80" data-testid="adventure-start-chapter">{shown(progress.chapterTitle)}</p>}
          <Controls />
          <div className="flex items-center gap-3">
            {back}
            <button type="button" disabled={phase !== 'ready'} onClick={(e) => { e.currentTarget.blur(); start(); }} data-testid="adventure-start"
              className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black disabled:opacity-40">
              {phase === 'ready' ? startWord : 'LOADING…'}
            </button>
          </div>
          {err && <p className="text-red-400">{err}</p>}
        </div>
      )}
      {phase === 'paused' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/75 p-4">
          <p className="text-[12px] tracking-[0.3em] text-white/50">PAUSED{ui.objective ? ` · ${ui.objective.toUpperCase()}` : ''}</p>
          <div className="flex gap-2">
            <button type="button" data-testid="adventure-mirror-toggle" onClick={(e) => { e.currentTarget.blur(); storyUi.command.setMirror(!ui.mirror); }}
              className={`rounded px-3 py-1 font-bold ${ui.mirror ? 'bg-[#facc15] text-black' : 'bg-white/10'}`}>
              MIRROR {ui.mirror ? 'ON' : 'OFF'}
            </button>
            <button type="button" onClick={(e) => { e.currentTarget.blur(); setRebind((v) => !v); }} className="rounded bg-white/10 px-3 py-1 font-bold">
              {rebind ? 'CONTROLS' : 'REBIND'}
            </button>
          </div>
          {ui.mirror && <p className="max-w-md text-center text-[12px] text-white/50">Mirror: real punches, kicks, guards and slips charge your special (estimated engagement, never a measurement). Never required.</p>}
          {rebind ? <RebindPanel onSaved={() => storyUi.command.reloadBindings()} /> : <Controls />}
          <div className="flex items-center gap-3">
            {back}
            <button type="button" onClick={(e) => { e.currentTarget.blur(); start(); }} className="rounded bg-[#00E5FF] px-6 py-2 font-bold text-black">RESUME</button>
          </div>
          <p className="text-[12px] text-white/50">Your progress is saved on this device at every step.</p>
        </div>
      )}
      {gate === 'ready' && playing && ui.ending && !ui.dialogue && (
        <StoryEndCard ending={ui.ending} exit={exit} onExplore={() => storyUi.command.dismissEnding()} />
      )}
      {phase === 'error' && <p className="absolute left-3 top-3 z-20 text-red-400">{err}</p>}
      {touch && busRef.current && playing && !ui.dialogue && !ui.ending && (
        <>
          <TouchOverlay bus={busRef.current} modeId={MODE_KEY} visible />
          <AdventureRadial bus={busRef.current} />
        </>
      )}
    </div>
  );
}

/** The controls screen: the start screen's button map for this mode, then the keyboard and touch columns. */
function Controls() {
  const rows = buttonMap(MODE_KEY);
  return (
    <div className="max-h-[60vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-black/60 p-3" data-testid="adventure-controls">
      <p className="mb-2 text-[12px] font-black tracking-[0.3em] text-white/50">BUTTONS</p>
      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {rows.map((r) => (
          <p key={r.input + r.action} className="flex justify-between gap-2"><span className="text-white/50">{r.input}</span><span className="font-bold">{r.action}</span></p>
        ))}
      </div>
      <table className="w-full text-left text-[12px]">
        <thead className="text-white/50"><tr><th className="pr-2">ACTION</th><th className="pr-2">PAD</th><th className="pr-2">KEYS</th><th>TOUCH</th></tr></thead>
        <tbody>
          <tr className="border-t border-white/5"><td className="py-0.5 pr-2">STORY · FINISH A LINE · HOLD TO SKIP</td><td className="pr-2 text-white/70">A</td><td className="pr-2 text-white/70">SPACE · J</td><td className="text-white/70">TAP THE BOX</td></tr>
          {CONTROLS_SHEET.map((r) => (
            <tr key={r.action} className="border-t border-white/5"><td className="py-0.5 pr-2">{r.action}</td><td className="pr-2 text-white/70">{r.pad}</td><td className="pr-2 text-white/70">{r.keys}</td><td className="text-white/70">{r.touch}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const bar = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;

/** The HUD: the meters, the lock, the spell slot, the partner's command, and the objective line. */
function Hud({ hud }: { hud: Record<string, HudValue> }) {
  const n = (k: string) => (typeof hud[k] === 'number' ? (hud[k] as number) : 0);
  const s = (k: string) => (typeof hud[k] === 'string' ? (hud[k] as string) : null);
  return (
    <>
      {s('objective') && (
        <p className="pointer-events-none absolute left-3 top-3 z-10 max-w-[60vw] text-[12px] font-bold tracking-wide text-white/85"
          style={{ left: 'max(0.75rem, env(safe-area-inset-left))' }} data-testid="adventure-objective">◆ {s('objective')!.toUpperCase()}</p>
      )}
      <div className="pointer-events-none absolute right-3 top-3 z-10 w-56 space-y-1" style={{ right: 'max(0.75rem, env(safe-area-inset-right))' }} data-testid="adventure-hud">
        <Meter label="HP" fill={bar(n('hp'), n('hpMax'))} color="#ef4444" text={`${n('hp')}/${n('hpMax')}`} />
        <Meter label="EN" fill={bar(n('energy'), n('energyMax'))} color="#38bdf8" text={`${n('energy')}`} />
        <Meter label="SP" fill={bar(n('special'), 100)} color="#facc15" text={`${n('special')}%`} />
        {hud.fusionOpen === true && (
          <Meter label="FU" fill={bar(n('fusion'), 100)} color="#a78bfa" text={n('fused') > 0 ? `FUSED ${n('fused')}s · T${n('tier')}` : `${n('fusion')}% · T${n('tier')}`} />
        )}
        <p className="text-[12px] text-white/70">{`SLOT ${n('slot')}${s('spell') ? ` · ${s('spell')}` : ''}${s('partner') ? ` · PARTNER ${s('partner')!.toUpperCase()}` : ''}`}</p>
        {s('lock') && <p className="text-[12px] font-bold text-[#e6fbff]">◎ {s('lock')}</p>}
      </div>
    </>
  );
}

function Meter({ label, fill, color, text }: { label: string; fill: string; color: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-5 text-[12px] text-white/50">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-white/10">
        <div className="absolute inset-y-0 left-0" style={{ width: fill, background: color }} />
      </div>
      <span className="w-20 text-right text-[12px] text-white/70">{text}</span>
    </div>
  );
}
