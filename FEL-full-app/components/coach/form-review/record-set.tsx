'use client';

// RecordSet — the client films one set of a program exercise, and the camera does the grunt work (COACH-VIDEO-REVIEW,
// 2026-10-24).
//
//   1. The phone's camera runs the Mirror's own pose pipeline (lib/pose/PoseService.ts — the same singleton the Mirror and
//      the drills use). The picture is shown to the athlete as a self-view and goes nowhere else.
//   2. Each frame goes through lib/coach/formReview/reader.ts: the reps are counted live, and each closed rep is graded
//      by the movement's tested audit.
//   3. Stop: every rep scored, the worst rep and any rep under the line flagged with its reason ("Left knee caves on rep
//      4") and the Mirror's own cue for it — on the phone, at once, before anything is sent. The flagged rep replays as a
//      skeleton beside the best one.
//   4. Send: the POSE DATA ONLY (lib/coach/formReview/payload.ts) goes to the coach's queue, if the gates allow it
//      (lib/coach/formReview/gate.ts). Video never: there is no clip option while lib/coach/formReview/clipPolicy.ts says
//      so, and a minor never gets one.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, Loader2, Send, Square, Trash2 } from 'lucide-react';
import { poseService } from '@/lib/pose/PoseService';
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';
import { HUD_HZ, MirrorWakeLock, type WakeLockApiLike } from '@/lib/mirror/liveCamera';
import { drawSkeleton, SKELETON_COLOURS } from '@/app/play/mirror/assess/_components/skeleton';
import { MOVEMENT_SPECS } from '@/lib/coach/formReview/movements';
import { createSetReader, type SetReader } from '@/lib/coach/formReview/reader';
import { flagsFor, scoreReps, setHeadline, summarize, type RepFlag, type ScoredRep, type SetSummary } from '@/lib/coach/formReview/score';
import { buildSubmission, MAX_SET_MS, type FormReviewSubmission } from '@/lib/coach/formReview/payload';
import { VIDEO_STAYS_LINE } from '@/lib/coach/formReview/clipPolicy';
import type { RecordContext } from '@/lib/coach/formReview/gate';
import { flagResult, repChips, replayPick } from '@/lib/coach/formReview/view';
import { PoseReplay } from './pose-replay';
import { SelfView } from '@/components/games/body-play';

export const FORM_REVIEWS_API = '/api/coach/form-reviews';

type Phase = 'ready' | 'starting' | 'recording' | 'done' | 'sending' | 'sent';

interface Result { reps: ScoredRep[]; flags: RepFlag[]; set: SetSummary; submission: FormReviewSubmission }

const CHIP_CLASS: Record<string, string> = {
  clean: 'border-fel-emerald/40 text-fel-emerald',
  flagged: 'border-[#FFB020]/60 bg-[#FFB020]/10 text-[#FFB020]',
  minor: 'border-white/25 text-white/75',
  unread: 'border-white/10 text-fel-quiet',
};

/**
 * Image landmarks (normalised to the camera frame) → normalised to a box of aspect `box` that shows the frame with
 * object-fit: cover, so the overlay sits on the picture (a landscape camera in a portrait box is cropped at the sides).
 */
export function coverMap(img: readonly Lm[], camAspect: number, box: number): Lm[] {
  const sx = camAspect > box ? camAspect / box : 1, sy = camAspect > box ? 1 : box / camAspect;
  return img.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * sx, y: 0.5 + (l.y - 0.5) * sy }));
}

/** The body as the page posts it: JSON of the pose-only submission, and nothing else (no FormData, no Blob). */
export function submissionBody(sub: FormReviewSubmission): string {
  return JSON.stringify(sub);
}

export function RecordSet({ ctx, api = FORM_REVIEWS_API }: { ctx: RecordContext; api?: string }) {
  const spec = MOVEMENT_SPECS[ctx.movement];
  const [phase, setPhase] = useState<Phase>('ready');
  const [why, setWhy] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ id: string; exerciseName: string; reps: number; setScore: number | null; status: string; createdAt: string }[] | null>(null);
  const frames = useRef<PoseFrame[]>([]);
  const reader = useRef<SetReader | null>(null);
  const off = useRef<(() => void)[]>([]);
  const wake = useRef<MirrorWakeLock | null>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const latest = useRef<PoseFrame | null>(null);

  const loadMine = useCallback(() => {
    fetch(`${api}?mine=1`).then((r) => (r.ok ? r.json() : null)).then((j) => setMine(j?.available ? j.items : null)).catch(() => setMine(null));
  }, [api]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const release = useCallback(() => {
    for (const f of off.current.splice(0)) f();
    void wake.current?.release();
  }, []);
  useEffect(() => () => { release(); wake.current?.dispose(); if (poseService().status.source === 'camera') poseService().stop(); }, [release]);

  // the tracked skeleton over the self-view while recording, so the athlete can see the camera has them (the Mirror's
  // painter; repainted at the HUD's rate, not every frame — lib/mirror/liveCamera.ts HUD_HZ)
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => {
      const c = overlay.current, f = latest.current, ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const cam = poseService().status.camera;
      if (f?.present) drawSkeleton(ctx, coverMap(f.image, cam && cam.height ? cam.width / cam.height : 4 / 3, c.width / c.height), { colour: SKELETON_COLOURS.tracking, mirror: true });
    }, 1000 / HUD_HZ);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(() => {
    release();
    if (poseService().status.source === 'camera') poseService().stop();
    const all = frames.current;
    const reps = scoreReps(ctx.movement, reader.current?.reps() ?? []);
    const flags = flagsFor(ctx.movement, reps);
    const cam = poseService().status.camera;
    const aspect = cam && cam.height ? cam.width / cam.height : 4 / 3;
    const submission = buildSubmission({ programId: ctx.programId, sessionExerciseId: ctx.sessionExerciseId, movement: ctx.movement, aspect, frames: all, reps, flags });
    setResult({ reps, flags, set: summarize(reps), submission });
    setFocus(flags[0]?.rep ?? null);
    setPhase('done');
  }, [ctx, release]);

  const start = useCallback(async () => {
    setWhy(null); setResult(null); setCount(0); setSendError(null);
    frames.current = [];
    reader.current = createSetReader(ctx.movement);
    setPhase('starting');
    const svc = poseService();
    const live = await svc.start();
    if (!live) { setWhy(svc.why ?? 'The camera did not start.'); setPhase('ready'); return; }
    wake.current ??= new MirrorWakeLock((navigator as Navigator & { wakeLock?: WakeLockApiLike }).wakeLock ?? null, document);
    void wake.current.hold();
    let t0: number | null = null;
    off.current.push(svc.onFrame((f) => {
      t0 ??= f.t;
      // only what the reader and the replay need: the image landmarks, never the picture
      frames.current.push({ t: f.t, present: f.present, image: f.present ? f.image.map((l) => ({ x: l.x, y: l.y, z: l.z, v: l.v })) : [] });
      latest.current = frames.current[frames.current.length - 1];
      const closed = reader.current?.step(latest.current);
      if (closed) setCount(closed.n);
      if (f.t - t0 >= MAX_SET_MS) finish();
    }));
    setPhase('recording');
  }, [ctx.movement, finish]);

  const send = useCallback(async () => {
    if (!result) return;
    setPhase('sending'); setSendError(null);
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: submissionBody(result.submission) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSendError(j.message ?? (j.error === 'form_review_not_ready' ? 'Sending to your coach is not open yet. Your flags are above.' : 'That did not send. Try again in a moment.'));
        setPhase('done');
        return;
      }
      setPhase('sent');
      loadMine();
    } catch {
      setSendError('That did not send. Check your connection and try again.');
      setPhase('done');
    }
  }, [api, loadMine, result]);

  const remove = async (id: string) => {
    const r = await fetch(`${api}/${id}`, { method: 'DELETE' }).catch(() => null);
    if (r?.ok) setMine((m) => m?.filter((x) => x.id !== id) ?? null);
  };

  const pick = result ? replayPick(result.reps, result.flags, focus) : null;
  const canSend = !!result && result.set.reps > 0 && ctx.send.ok && ctx.ready;

  return (
    <div className="space-y-4" data-record-set={ctx.movement}>
      <div className="fel-card space-y-2 rounded-xl p-4">
        <div className="text-[11px] uppercase tracking-wider text-fel-dim">Film a set for your coach</div>
        <h1 className="text-lg font-bold text-white">{ctx.exerciseName}</h1>
        <p className="text-sm text-white/65">{spec.setup}</p>
        <p className="text-xs text-fel-dim">The camera counts your reps and reads each one. Every number is an estimate.</p>
      </div>

      {/* collapsed (not unmounted: the camera attaches to it on "Film it again") once a set has been read */}
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${result && phase !== 'recording' && phase !== 'starting' ? 'hidden' : ''}`} style={{ aspectRatio: '3 / 4' }} data-camera-box>
        {/* Z-P4-4: the camera picture is shown in one place only, SelfView (components/games/body-play.tsx), mirrored as before */}
        <SelfView className="absolute inset-0 h-full w-full rounded-none" style={{ aspectRatio: 'auto' }} />
        <canvas ref={overlay} width={480} height={640} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${phase === 'recording' ? '' : 'hidden'}`} data-live-skeleton />
        {phase === 'recording' && (
          <div className="absolute left-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-white" aria-live="polite">
            <span className="text-3xl font-black tabular-nums" data-rep-count>{count}</span>
            <span className="ml-1 text-sm text-white/70">{count === 1 ? 'rep' : 'reps'}</span>
          </div>
        )}
        {phase !== 'recording' && phase !== 'starting' && !result && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/50">
            <span><Camera className="mx-auto mb-2 h-8 w-8" />Your camera shows here. Nothing is recorded to a file.</span>
          </div>
        )}
      </div>

      {why && <p role="alert" className="text-sm text-fel-crimson">{why}</p>}

      <div className="flex gap-2">
        {phase === 'recording' ? (
          <button type="button" onClick={finish} data-record-stop className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 font-bold text-black">
            <Square className="h-4 w-4" /> Stop — I&apos;m done
          </button>
        ) : (
          <button type="button" onClick={() => void start()} disabled={phase === 'starting' || phase === 'sending'} data-record-start
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-fel-cyan px-4 font-bold text-black disabled:opacity-50">
            {phase === 'starting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {result ? 'Film it again' : 'Start the camera'}
          </button>
        )}
      </div>

      {result && (
        <div className="fel-card space-y-3 rounded-xl p-4" data-set-result>
          <p className="text-base font-semibold text-white" data-set-headline>{setHeadline(ctx.movement, result.set, result.flags)}</p>
          {result.set.setScore !== null && (
            <p className="text-xs text-white/50">Set score {result.set.setScore} / 100 (estimated) · {result.set.clean} of {result.set.read} read reps clean</p>
          )}
          <ol className="flex flex-wrap gap-1.5" aria-label="Reps" data-rep-strip>
            {repChips(ctx.movement, result.reps, result.flags).map((c) => (
              <li key={c.n}>
                <button type="button" title={c.title} aria-label={c.title} onClick={() => setFocus(c.n)} data-rep-chip={c.tone}
                  className={`min-h-9 min-w-9 rounded-lg border px-2 text-sm font-bold ${CHIP_CLASS[c.tone]} ${focus === c.n ? 'ring-2 ring-white/60' : ''}`}>{c.n}</button>
              </li>
            ))}
          </ol>
          {result.flags.length > 0 && (
            <ul className="space-y-2" data-flags>
              {result.flags.map((f) => (
                <li key={f.rep} className="rounded-lg border border-[#FFB020]/30 bg-[#FFB020]/5 p-2" data-flag={f.rep}>
                  <button type="button" onClick={() => setFocus(f.rep)} className="block w-full text-left">
                    <span className="block text-sm font-semibold text-[#FFB020]">{f.reason}{f.worst ? ' · worst rep' : ''}</span>
                    {/* CUE-REWRITE: what it means and what to do next set (lib/coach/formReview/view.ts flagResult) */}
                    {(() => { const r = flagResult(ctx.movement, f); return (<>
                      <span className="mt-0.5 block text-sm text-white/70" data-flag-means>{r.means}</span>
                      <span className="mt-0.5 block text-sm text-white/85" data-flag-next>{r.next.text}</span>
                    </>); })()}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pick && <PoseReplay tracks={result.submission.tracks} aspect={result.submission.aspect} rep={pick.rep} best={pick.best} />}
          <p className="text-xs text-white/55" data-video-line>{VIDEO_STAYS_LINE}</p>
          {phase === 'sent' ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-fel-emerald" data-sent><CheckCircle2 className="h-4 w-4" /> Sent to your coach.</p>
          ) : canSend ? (
            <button type="button" onClick={() => void send()} disabled={phase === 'sending'} data-send
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-fel-cyan/50 bg-fel-cyan/10 px-4 font-bold text-fel-cyan disabled:opacity-50">
              {phase === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send the rep data to my coach
            </button>
          ) : !ctx.send.ok ? (
            <p className="text-sm text-white/65" data-send-refused={ctx.send.error}>
              {ctx.send.message}{' '}
              {ctx.send.href && ctx.send.action && <Link href={ctx.send.href} className="text-fel-cyan underline">{ctx.send.action}</Link>}
            </p>
          ) : !ctx.ready ? (
            <p className="text-sm text-white/65" data-send-not-ready>Sending sets to your coach opens soon. Your flags are above, and nothing was sent.</p>
          ) : null}
          {sendError && <p role="alert" className="text-sm text-fel-crimson">{sendError}</p>}
        </div>
      )}

      {mine && mine.length > 0 && (
        <div className="fel-card space-y-2 rounded-xl p-4" data-my-sets>
          <div className="text-[11px] uppercase tracking-wider text-fel-dim">Sets you sent</div>
          {mine.slice(0, 6).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-white/80">{m.exerciseName} · {m.reps} reps{m.setScore !== null ? ` · ${m.setScore}` : ''}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={m.status === 'reviewed' ? 'text-fel-emerald' : 'text-fel-dim'}>{m.status === 'reviewed' ? 'Reviewed' : 'Waiting'}</span>
                <button type="button" onClick={() => void remove(m.id)} aria-label={`Delete the ${m.exerciseName} set`} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-white/50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
