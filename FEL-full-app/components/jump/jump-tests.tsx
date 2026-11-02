'use client';

// JumpTests — the standard jump test set on the jump check (JUMP-TESTS, 2026-10-25): squat jump, jump with arm swing,
// jump with hands on hips, single-leg left and right (with the asymmetry), and the 10-5 rebound test. Adults only: the
// caller mounts it on an adult's jump result (never for a kid or a teen), and it renders nothing unless `adult`.
//
// Each test has its own setup cue (lib/jump/protocols.ts PROTOCOLS), is filmed with the phone or picked from its videos,
// decoded and read ON THIS PHONE (lib/jump/slowmoDecode.ts, the same reader as the slow-mo jump), judged by its own
// rules with a reason beside every jump that did not count, and shown with each jump's ±, the verified rule, the
// take-off speed (estimates) and a frame-by-frame check of the take-off and landing. A result is kept only when the
// athlete taps "Keep" (lib/jump/historyStore.ts: this phone, numbers only). No power or weight question here: power is
// the optional, adults-only panel below (fv-profile.tsx). Nothing is sent.
import { useRef, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type { T5Extra } from '@/lib/assess/scoring';
import { armSwingGain, asymmetry, PROTOCOLS, sideBest, readProtocolClip, type ProtocolId, type ProtocolRead } from '@/lib/jump/protocols';
import { poseDecoder, type Decoder } from '@/lib/jump/slowmoDecode';
import { verifyJump } from '@/lib/jump/session';
import { jumpKinematics, type JumpKinematics } from '@/lib/jump/velocity';
import { historyId, keepJump, loadJumps, type JumpHistoryEntry } from '@/lib/jump/historyStore';
import { jumpTestView, lastOfTest } from '@/lib/results/jump';
import { ResultCard } from '@/components/result-card/result-card';
import { logCapture, pilotEnabled } from '@/lib/jump/pilot';
import { lbToKg } from '@/lib/jump/power';
import type { ManualRead } from '@/lib/jump/manualFrames';
import type { ReachStorage } from '@/lib/jump/reachStore';
import { BLOCK_WORDS, JumpSessionCard } from './jump-session-card';
import { JumpVelocity } from './jump-velocity';
import { FrameReview } from './frame-review';
import { FvProfile, type FvRead } from './fv-profile';

const IN = 2.54;
const inch = (cm: number) => (cm / IN).toFixed(1);
const pmIn = (cm: number) => Math.max(0.1, cm / IN).toFixed(1);

/** The order the tests are offered in, two single-leg sides as one row. */
const MENU: { id: ProtocolId | 'single'; name: string; short: string }[] = [
  { id: 'sj', name: PROTOCOLS.sj.name, short: PROTOCOLS.sj.short },
  { id: 'cmjArms', name: PROTOCOLS.cmjArms.name, short: PROTOCOLS.cmjArms.short },
  { id: 'cmjHips', name: PROTOCOLS.cmjHips.name, short: PROTOCOLS.cmjHips.short },
  { id: 'single', name: 'Single-leg jumps', short: 'Left and right, and the difference' },
  { id: 'rj105', name: PROTOCOLS.rj105.name, short: PROTOCOLS.rj105.short },
];

type Run =
  | { phase: 'reading'; done: number; total: number }
  | { phase: 'error'; why: string }
  | { phase: 'done'; read: ProtocolRead; file: File | null; fileFps: number; aspect: number; loadKg: number; kin: Map<number, JumpKinematics>; manual: ManualRead | null; kept: boolean; reviewing: boolean };

const LOADED: ReadonlySet<ProtocolId> = new Set(['sj', 'cmjHips']);
/** A video verifies at the slow-mo rate (session.ts: jump.labFps), not the live camera's 50: said so. */
const VIDEO_RATE_WORDS = 'a video needs 120 frames a second or more to verify (use your camera\'s Slo-mo)';
/** The test's own buttons' words, now the result card's one step. */
const KEEP_WORDS = 'Keep on this phone';
const AGAIN_WORDS = 'Read another video';
/** The 10-5's own sentences (the paragraph they were in, split at its full stops; the words are unchanged). */
const RJ_MEANS = 'The bounce score (RSI) is time in the air divided by time on the floor: higher is springier.';
const RJ_NEXT = 'Next: try to raise it with quicker contacts.';

// TOOLS-EASY (2026-10-28): `startOpen` — the jump tests' own door (/train/jumps) opens on the list, with no "More jump
// tests" button first; under a jump result it still starts closed.
export function JumpTests({ adult, decode, storage = null, liveT5 = null, pilot = pilotEnabled(), startOpen = false }: { adult: boolean; decode?: Decoder; storage?: ReachStorage | null; liveT5?: T5Extra | null; pilot?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [pick, setPick] = useState<ProtocolId | 'single' | null>(null);
  const [runs, setRuns] = useState<Partial<Record<ProtocolId, Run>>>({});
  const [fvReads, setFvReads] = useState<FvRead[]>([]);
  const aborts = useRef<Partial<Record<ProtocolId, AbortController>>>({});
  if (!adult) return null;

  const setRun = (id: ProtocolId, r: Run | ((old: Run | undefined) => Run)) => setRuns((all) => ({ ...all, [id]: typeof r === 'function' ? r(all[id]) : r }));

  const read = async (id: ProtocolId, file: File, loadKg: number) => {
    aborts.current[id]?.abort();
    const ac = new AbortController();
    aborts.current[id] = ac;
    setRun(id, { phase: 'reading', done: 0, total: 0 });
    try {
      const clip = await (decode ?? poseDecoder())(file, (done, total) => setRun(id, { phase: 'reading', done, total }), ac.signal);
      const r = readProtocolClip(clip.frames, clip.aspect, id);
      const kin = new Map<number, JumpKinematics>();
      if (r.ok) {
        const rebounded = new Set((r.t5.rebounds?.rebounds ?? []).map((x) => x.to));
        for (const j of r.t5.jumps) if (j.valid) kin.set(j.index, jumpKinematics(j, { frames: r.frames, front: r.front, countermovement: id !== 'sj' && !rebounded.has(j.index) }));
        if (pilot) logCapture({ test: id, source: 'video', t5: r.t5, fps: r.fps, stretch: r.stretch, loadKg, frames: r.frames, front: r.front });
        if (LOADED.has(id) && r.best) {
          const k = kin.get(r.best.index);
          setFvReads((all) => [...all, { id: historyId(), label: PROTOCOLS[id].name, loadKg, heightCm: r.best!.heightCm, plusMinusCm: r.best!.heightSdCm != null ? 1.96 * r.best!.heightSdCm : null, pushOffCm: k?.pushOffCm ?? null, cmj: id === 'cmjHips' }]);
        }
      }
      setRun(id, { phase: 'done', read: r, file, fileFps: clip.fileFps, aspect: clip.aspect, loadKg, kin, manual: null, kept: false, reviewing: false });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setRuns((all) => { const n = { ...all }; delete n[id]; return n; }); return; }
      setRun(id, { phase: 'error', why: (e as Error)?.message || 'The video could not be read.' });
    }
  };

  if (!open) {
    return (
      <button type="button" data-tests-open onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        <ClipboardList aria-hidden className="h-5 w-5" /> More jump tests: squat, arm swing, single leg, 10-5
      </button>
    );
  }
  const hipsBest = sideBest(runs.cmjHips?.phase === 'done' && runs.cmjHips.read.ok ? runs.cmjHips.read.t5 : liveT5);
  const sideOf = (id: 'singleLeft' | 'singleRight') => { const r = runs[id]; return r?.phase === 'done' && r.read.ok ? sideBest(r.read.t5) : null; };
  return (
    <section data-jump-tests className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="font-display text-[20px] font-bold uppercase tracking-[0.03em] text-white">Jump tests</h2>
      <div className="grid gap-2" role="group" aria-label="Pick a test">
        {MENU.map((m) => (
          <button key={m.id} type="button" data-test-pick={m.id} aria-pressed={pick === m.id} onClick={() => setPick(m.id)}
            className={`min-h-12 rounded-2xl px-4 py-2 text-left ${pick === m.id ? 'bg-white text-black' : 'border border-white/15 text-white'}`}>
            <span className="block text-[16px] font-black">{m.name}</span>
            <span className={`block text-[16px] ${pick === m.id ? 'text-black/70' : 'text-white/65'}`}>{m.short}</span>
          </button>
        ))}
      </div>
      {pick === 'single' ? (
        <>
          <Asym left={sideOf('singleLeft')} right={sideOf('singleRight')} />
          {(['singleLeft', 'singleRight'] as const).map((id) => (
            <TestRun key={id} id={id} pilot={pilot} run={runs[id]} onRead={read} onAbort={() => aborts.current[id]?.abort()} onUpdate={(r) => setRun(id, r)} storage={storage} hipsBest={null} />
          ))}
        </>
      ) : pick ? (
        <TestRun key={pick} id={pick} pilot={pilot} run={runs[pick]} onRead={read} onAbort={() => aborts.current[pick]?.abort()} onUpdate={(r) => setRun(pick, r)} storage={storage} hipsBest={pick === 'cmjArms' ? hipsBest : null} />
      ) : null}
      <FvProfile adult={adult} reads={fvReads} />
    </section>
  );
}

/** The single-leg difference, with its noise band (never more sure than the two reads allow). */
function Asym({ left, right }: { left: ReturnType<typeof sideBest>; right: ReturnType<typeof sideBest> }) {
  if (!left || !right) {
    return <p data-asym-missing className="text-[16px] text-white/70">Read a left and a right video to see the difference between your legs.</p>;
  }
  const a = asymmetry(left, right);
  return (
    <p data-asym className="rounded-2xl border border-white/10 p-3 text-[16px] text-white/90">
      <span className="block font-black text-white">Left {inch(left.bestCm)} in · right {inch(right.bestCm)} in</span>
      {a.higher
        ? `Your ${a.higher} leg jumped ${a.pct}% higher. Differences under ${a.bandPct}% are within the noise of these reads.`
        : `No clear difference: ${a.pct}% apart, inside the ${a.bandPct}% these reads can tell apart.`}
    </p>
  );
}

function TestRun({ id, pilot, run, onRead, onAbort, onUpdate, storage, hipsBest }: {
  id: ProtocolId; pilot: boolean; run: Run | undefined; onRead: (id: ProtocolId, f: File, loadKg: number) => void; onAbort: () => void;
  onUpdate: (r: Run | ((old: Run | undefined) => Run)) => void; storage: ReachStorage | null; hipsBest: ReturnType<typeof sideBest>;
}) {
  const def = PROTOCOLS[id];
  const [load, setLoad] = useState('');
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg');
  const n = Number(load);
  const loadKg = load.trim() && Number.isFinite(n) && n > 0 ? (unit === 'lb' ? lbToKg(n) : n) : 0;
  const take = (f: File | undefined) => { if (f) onRead(id, f, loadKg); };
  const idle = !run || run.phase === 'error';
  return (
    <div data-test-run={id} className="space-y-3 rounded-2xl border border-white/10 p-4">
      <h3 className="font-display text-[20px] font-bold uppercase tracking-[0.03em] text-white">{def.name}</h3>
      {idle ? (
        <>
          <ol data-test-steps className="list-decimal space-y-1 pl-5 text-[16px] leading-snug text-white/80">
            {def.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          {LOADED.has(id) ? (
            <div className="flex items-center gap-2">
              <label className="flex-1">
                <span className="block text-[16px] text-white/70">Holding a load? (optional)</span>
                <input data-test-load inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} placeholder="No load"
                  className="mt-1 min-h-12 w-full rounded-2xl border border-white/20 bg-black/30 px-4 text-[16px] text-white" />
              </label>
              <div role="group" aria-label="Unit" className="flex self-end">
                {(['kg', 'lb'] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}
                    className={`min-h-12 min-w-12 px-3 text-[16px] font-bold ${unit === u ? 'rounded-2xl bg-white text-black' : 'text-white/80'}`}>{u}</button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl bg-white px-4 text-[16px] font-black text-black">
              Film it
              <input data-test-film={id} type="file" accept="video/*" capture="user" className="sr-only" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <label className="flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-2xl border border-white/25 px-4 text-[16px] font-bold text-white">
              Pick a video
              <input data-test-file={id} type="file" accept="video/*" className="sr-only" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {run?.phase === 'error' && run.why ? <p data-test-error className="text-[16px] font-bold text-[#FFB020]">{run.why}</p> : null}
        </>
      ) : null}
      {run?.phase === 'reading' ? (
        <div data-test-reading className="space-y-2">
          <p className="text-[16px] text-white/80">Reading every frame on this phone{run.total ? `: ${run.done} of ${run.total}` : '…'}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#00FF9D]" style={{ width: `${run.total ? Math.round((run.done / run.total) * 100) : 3}%` }} /></div>
          <button type="button" onClick={onAbort} className="min-h-12 text-[16px] font-bold text-white/80 underline">Stop</button>
        </div>
      ) : null}
      {run?.phase === 'done' ? <TestResult id={id} pilot={pilot} run={run} onUpdate={onUpdate} storage={storage} hipsBest={hipsBest} /> : null}
    </div>
  );
}

function TestResult({ id, pilot, run, onUpdate, storage, hipsBest }: {
  id: ProtocolId; pilot: boolean; run: Extract<Run, { phase: 'done' }>; onUpdate: (r: Run | ((old: Run | undefined) => Run)) => void;
  storage: ReachStorage | null; hipsBest: ReturnType<typeof sideBest>;
}) {
  const r = run.read;
  const again = () => onUpdate({ phase: 'error', why: '' });
  const kin = run.kin;
  const best = r.ok ? r.best : null;
  const v = r.ok && best ? verifyJump(best, { poseHz: r.fps, source: 'slowmo', manual: !!run.manual }) : null;
  const shownCm = run.manual ? run.manual.heightCm : best?.heightCm ?? null;
  const shownPm = run.manual ? run.manual.plusMinusCm : best?.heightSdCm != null ? 1.96 * best.heightSdCm : null;
  const [entryId] = useState(() => historyId());
  // PLAT-P03: the last result of this test kept on this phone, read once when the result arrives (before any keep)
  const [last] = useState(() => lastOfTest(loadJumps(storage), id));
  const entryOf = (): JumpHistoryEntry | null => {
    if (!r.ok) return null;
    const k = best ? kin.get(best.index) : undefined;
    const valid = r.t5.jumps.filter((j) => j.valid).length;
    return {
      id: entryId, at: new Date().toISOString(), test: id,
      bestCm: id === 'rj105' ? r.rj?.best5HeightCm ?? null : shownCm, plusMinusCm: id === 'rj105' ? null : shownPm === null ? null : Math.round(shownPm * 10) / 10,
      jumps: valid, verified: id !== 'rj105' && !!v?.verified, manualFrames: !!run.manual, source: 'video', fps: Math.round(r.fps),
      rsi: r.rj?.best5RsiFlight ?? null, contactMs: r.rj?.best5ContactMs ?? null,
      v0Mps: run.manual ? jumpKinematics({ takeoffT: run.manual.takeoffT, heightCm: run.manual.heightCm }, { countermovement: false }).v0Mps : k?.v0Mps ?? null,
      rsiMod: run.manual ? null : k?.rsiMod ?? null,
    };
  };
  if (!r.ok) {
    return (
      <>
        <p data-test-refused className="text-[16px] font-bold text-[#FFB020]">{r.why}</p>
        <button type="button" onClick={again} className="min-h-12 text-[16px] font-bold text-white/80 underline">Try another video</button>
      </>
    );
  }
  // a manual change is a new result: kept under its own id
  const keep = () => { const e = entryOf(); if (e && keepJump(storage, run.manual ? { ...e, id: historyId() } : e, { adult: true })) onUpdate((old) => (old?.phase === 'done' ? { ...old, kept: true } : old!)); };
  const refused = r.t5.jumps.filter((j) => !j.valid).length;
  const verifiedLine = v?.verified ? 'Verified jump' : `Not verified: ${v?.blocks[0] === 'frameRate' ? VIDEO_RATE_WORDS : BLOCK_WORDS[v?.blocks[0] ?? 'notValid']}`;
  const canKeep = (id === 'rj105' ? r.rj?.best5RsiFlight != null : !!best) && !run.kept && !!storage;
  const counted = id === 'rj105' ? r.rj?.best5RsiFlight != null : !!best && shownCm !== null;
  // PLAT-P03 (2026-10-28): a counted test is ONE result card — the height (or the 10-5's bounce score), the arrow against
  // the last one of this test kept on this phone (lib/results/jump.ts: the jump's own band), what it means, and the one
  // step: keep it, or read another. Every other line the test reads is under Details, unchanged.
  const line = id === 'rj105' ? (r.rj?.best5RsiFlight != null ? RJ_MEANS : r.rj?.why ?? '')
    : id === 'cmjArms' ? armsLine(sideBest(r.t5), hipsBest) ?? verifiedLine : verifiedLine;
  const card = counted ? jumpTestView({
    test: id, bestCm: id === 'rj105' ? null : shownCm, plusMinusCm: shownPm, rsi: r.rj?.best5RsiFlight ?? null, last, line,
    next: { label: canKeep ? KEEP_WORDS : AGAIN_WORDS, href: null },
  }) : null;
  const detail = (
    <>
      {id === 'rj105' ? <Repeated read={r} /> : best && shownCm !== null ? (
        <>
          <p className="text-[16px] text-white/70">
            {shownCm.toFixed(1)} cm · jump {best.index}{run.manual ? ' · manual frames' : ''} · read at {Math.round(r.fps)} frames a second{run.loadKg > 0 ? ` · holding ${Math.round(run.loadKg)} kg` : ''}
          </p>
          <p data-test-verified={!!v?.verified} className="text-[16px] font-bold" style={{ color: v?.verified ? '#00FF9D' : 'rgba(255,255,255,0.7)' }}>{verifiedLine}</p>
        </>
      ) : <p data-test-none className="text-[18px] font-bold text-[#FFB020]">No jump counted for this test. The reason is beside each jump below.</p>}
      {id === 'sj' && best ? <p data-sj-ok className="text-[16px] text-white/80">Held squat, no dip before the take-off.</p> : null}
      {id === 'cmjArms' && best ? <ArmsGain arms={sideBest(r.t5)} hips={hipsBest} /> : null}
      {refused ? <p data-test-refused-count className="text-[16px] text-white/70">{refused} jump{refused > 1 ? 's' : ''} did not count for this test.</p> : null}
      {run.manual ? <p data-app-read className="text-[16px] text-white/70">The app&apos;s own read, before you moved the frames:</p> : null}
      <JumpSessionCard t5={r.t5} source="slowmo" />
      {!r.t5.jumps.some((j) => j.valid) && r.t5.jumps.length ? (
        // the session card shows nothing without a counted jump: the reasons are listed here instead
        <ul data-test-reasons className="space-y-1.5">
          {r.t5.jumps.map((j) => (
            <li key={j.index} data-jump-row={j.index} data-valid="false" className="text-[16px] text-white/80">
              <span className="font-bold text-white">Jump {j.index}:</span> {j.invalidWhy ?? 'not counted'}
            </li>
          ))}
        </ul>
      ) : null}
      <JumpVelocity t5={r.t5} kin={kin} />
      {id !== 'rj105' && best ? (
        run.reviewing ? (
          <FrameReview frames={r.frames} stretch={r.stretch} fileFps={run.fileFps} file={run.file} aspect={run.aspect} jump={best}
            onApply={(m) => { onUpdate((old) => (old?.phase === 'done' ? { ...old, manual: m, kept: false } : old!)); if (m && pilot) logCapture({ test: id, source: 'video', t5: r.t5, fps: r.fps, stretch: r.stretch, loadKg: run.loadKg, frames: r.frames, front: r.front, manual: { index: best.index, read: m } }); }}
            onClose={() => onUpdate((old) => (old?.phase === 'done' ? { ...old, reviewing: false } : old!))} />
        ) : (
          <button type="button" data-review-open onClick={() => onUpdate((old) => (old?.phase === 'done' ? { ...old, reviewing: true } : old!))}
            className="min-h-12 w-full rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">Check the frames</button>
        )
      ) : null}
    </>
  );
  return (
    <div data-test-result={id} className="space-y-3">
      {card ? (
        <ResultCard view={card} onNext={canKeep ? keep : again} details={<div className="space-y-3">{detail}</div>} />
      ) : <div className="space-y-3">{detail}</div>}
      {run.kept ? <p data-test-kept className="text-center text-[16px] font-bold text-[#00FF9D]">Kept in your history on this phone.</p> : null}
      {canKeep || !card ? <button type="button" onClick={again} className="min-h-12 w-full text-[16px] font-bold text-white/80 underline">{AGAIN_WORDS}</button> : null}
    </div>
  );
}

/** The arm-swing gain, in words (the test's own sentence), or null when there is nothing to compare. */
function armsLine(arms: ReturnType<typeof sideBest>, hips: ReturnType<typeof sideBest>): string | null {
  if (!arms || !hips) return null;
  const g = armSwingGain(arms, hips);
  return g.real
    ? `Your arm swing ${g.cm >= 0 ? 'added' : 'took off'} ${pmIn(Math.abs(g.cm))} in (${Math.abs(g.pct)}%) against your hands-on-hips jump.`
    : `Your arm swing and hands-on-hips jumps are within the noise of each other (±${pmIn(g.bandCm)} in).`;
}

function ArmsGain({ arms, hips }: { arms: ReturnType<typeof sideBest>; hips: ReturnType<typeof sideBest> }) {
  if (!arms) return null;
  if (!hips) return <p data-arms-missing className="text-[16px] text-white/70">Do the hands-on-hips jump too to see what your arm swing adds.</p>;
  return <p data-arms-gain className="text-[16px] text-white/85">{armsLine(arms, hips)}</p>;
}

function Repeated({ read }: { read: Extract<ProtocolRead, { ok: true }> }) {
  const rj = read.rj!;
  const est = read.fps < 120 ? ' (estimate)' : '';
  return (
    <div data-rj className="space-y-2">
      {rj.best5RsiFlight !== null ? (
        <>
          <p data-rj-best className="text-[16px] font-bold text-white">Bounce score {rj.best5RsiFlight.toFixed(2)}</p>
          <p className="text-[16px] text-white/70">Best 5 of {rj.counted} quick rebounds{est}: {(rj.best5ContactMs! / 1000).toFixed(2)} s on the floor, {inch(rj.best5HeightCm!)} in high.</p>
          <p className="text-[16px] text-white/70">{RJ_MEANS}</p>
          <p className="text-[16px] text-white/70">{RJ_NEXT}</p>
        </>
      ) : <p data-rj-why className="text-[18px] font-bold text-[#FFB020]">{rj.why}</p>}
      <p className="text-[16px] text-white/70">{rj.jumps} of 10 jumps read.</p>
      {rj.rebounds.length ? (
        <ul className="space-y-1">
          {rj.rebounds.map((x) => (
            <li key={x.to} data-rj-rebound={x.to} data-counted={x.counted} className="flex justify-between text-[16px] text-white/80">
              <span>Rebound {x.to}</span>
              <span>{x.contactMs} ms · bounce {x.rsiFlight.toFixed(2)}{x.counted ? '' : ' · too long on the floor'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
