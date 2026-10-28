'use client';

// JumpCamera — the jump station's live take for one athlete (COMBINE-DAY, 2026-10-25). The readiness check's camera path
// (components/readiness/readiness-check.tsx), used the same way: the phone's camera through the pose pipeline the Mirror
// uses (lib/pose/PoseService.ts), SHOWN ONLY THROUGH SelfView (components/games/body-play.tsx — the app's one self-view;
// Z-P4-4, components/games/bodyPlay.scan.test.ts). Stand still two seconds, then jump: lib/combine/jumpTake.ts reads the
// jumps with the jump check's own code. Each counted jump is handed back as an attempt (a number); no frame is kept.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Square } from 'lucide-react';
import { poseService } from '@/lib/pose/PoseService';
import { MirrorWakeLock, type WakeLockApiLike } from '@/lib/mirror/liveCamera';
import { JumpTake, type TakeView } from '@/lib/combine/jumpTake';
import { SelfView, CAMERA_NOTE } from '@/components/games/body-play';
// TOOLS-EASY (2026-10-28): the shared setup card, the one voice, and each no-mark's reason and fix
import { JumpTakeHud } from '@/components/tools-easy/jump-take-hud';
import { useOneVoice } from '@/components/tools-easy/use-one-voice';
import { SetupReader, type SetupWord } from '@/lib/tools-easy/setup';
import { STOP_AND_READ, TAKE_STAND_LINE } from '@/lib/tools-easy/copy';

type Phase = 'idle' | 'starting' | 'live' | 'reading';

export function JumpCamera({ jumps, athlete, onAttempts }: { jumps: number; athlete: string; onAttempts: (a: { value: number | null }[]) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [live, setLive] = useState<TakeView>({ step: 'stand', jumps: 0, asked: jumps, why: null });
  const [why, setWhy] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupWord | null>(null);
  const voice = useOneVoice('combine');
  const take = useRef<JumpTake | null>(null);
  const off = useRef<(() => void)[]>([]);
  const wake = useRef<MirrorWakeLock | null>(null);

  const release = useCallback(() => {
    for (const f of off.current.splice(0)) f();
    void wake.current?.release();
    const svc = poseService();
    svc.endHighRate();
    if (svc.status.source === 'camera') svc.stop();
  }, []);
  useEffect(() => () => { release(); wake.current?.dispose(); }, [release]);

  const finish = useCallback(() => {
    const t = take.current;
    take.current = null;
    release();
    voice.hush();
    if (!t) return;
    setPhase('reading');
    const r = t.finish();
    setPhase('idle');
    if (!r.ok) { setWhy(r.why); return; }
    setWhy(null);
    onAttempts(r.attempts);
  }, [onAttempts, release, voice]);

  const start = useCallback(async () => {
    setWhy(null);
    setPhase('starting');
    const svc = poseService();
    const ok = await svc.start();
    if (!ok) { setWhy(svc.why ?? 'The camera did not start.'); setPhase('idle'); return; }
    void svc.requestHighRate();   // the jump check's own ask: 60 Hz where the phone holds it
    wake.current ??= new MirrorWakeLock((navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null, document);
    void wake.current.hold();
    const cam = svc.status.camera;
    const t = new JumpTake({ jumps, aspect: cam && cam.height ? cam.width / cam.height : 4 / 3, cameraFps: cam?.frameRate ?? null });
    take.current = t;
    let done = false;
    const reader = new SetupReader('front');
    let shownWord = '', saidId = 0;
    voice.say(`${athlete}. ${TAKE_STAND_LINE}`);
    off.current.push(svc.onFrame((fr) => {
      if (done) return;
      const f = { t: fr.t, present: fr.present, image: fr.present ? fr.image.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.v })) : [], ...(fr.world ? { world: fr.world } : {}) };
      const v = t.push(f);
      setLive(v);
      if (v.step === 'stand') {
        const w = reader.push(f);
        if (w.word !== shownWord) { shownWord = w.word; setSetup(w); if (!w.ready) voice.say(w.word); }
      }
      if (v.say && v.say.id !== saidId) { saidId = v.say.id; voice.say(v.say.text); }
      if (v.step === 'done') { done = true; finish(); }
    }));
    setLive({ step: 'stand', jumps: 0, asked: jumps, why: null });
    setSetup(null);
    setPhase('live');
  }, [athlete, finish, jumps, voice]);

  const on = phase === 'live' || phase === 'starting';
  return (
    <div className="space-y-3" data-combine-camera={phase}>
      {/* collapsed (not unmounted) outside a take: the camera attaches to it on Start (the readiness check's pattern) */}
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${on ? '' : 'hidden'}`} style={{ aspectRatio: '3 / 4', maxHeight: '62vh' }}>
        <SelfView className="absolute inset-0 h-full w-full rounded-none" style={{ aspectRatio: 'auto' }} />
        {phase === 'live' && (
          <div data-combine-caption><JumpTakeHud v={live} setup={setup} who={athlete} /></div>
        )}
      </div>
      {why && <p role="alert" className="text-sm text-[#FFB020]" data-combine-why>{why}</p>}
      {on ? (
        <button type="button" onClick={finish} data-combine-stop className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 font-bold text-black">
          <Square className="h-4 w-4" /> {STOP_AND_READ}
        </button>
      ) : (
        <button type="button" onClick={() => void start()} disabled={phase === 'reading'} data-combine-start-camera
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-fel-cyan px-4 font-bold text-black disabled:opacity-50">
          {phase === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {jumps === 1 ? 'Start the camera: 1 jump' : `Start the camera: ${jumps} jumps`}
        </button>
      )}
      <p className="text-[11px] text-fel-dim">{CAMERA_NOTE}</p>
    </div>
  );
}
