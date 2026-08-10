'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameProps } from '@/components/games/game-shell';
import { QUIZ_CATEGORIES, QUIZ_BANK, type QuizQuestion } from '@/lib/quiz-data';
import { SessionRecorder } from '@/lib/game-systems';
import { QuizCore } from '@/lib/feel/quiz-core';

// M10 Row 2 retrofit — the wheel + adaptive-difficulty bank selection stay
// (this app's bank is richer, so we keep it). All SCORING now runs through the
// M9 shared QuizCore: speed-scaled points, streak-multiplier (×3 cap) carried
// across rounds, single-consume timeouts. Feel numbers // TUNE(elijah).
const DIFF_POINTS: Record<string, number> = { hard: 30, medium: 20, easy: 10 }; // TUNE(elijah)

type Phase = 'intro' | 'spin' | 'question' | 'reveal' | 'done';

export default function BrainBrawlGame({ grade, prq, onEnd, gamepad }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [category, setCategory] = useState<(typeof QUIZ_CATEGORIES)[number] | null>(null);
  const [qTime, setQTime] = useState(15);
  const [qMax, setQMax] = useState(15);
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const statsRef = useRef({ score: 0, answered: 0, correct: 0, start: 0 });
  const recRef = useRef(new SessionRecorder());
  const usedRef = useRef<Set<string>>(new Set());
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const spinRef = useRef<any>({ angle: 0, vel: 0, spinning: false, target: -1 });
  const qcRef = useRef<QuizCore | null>(null);
  const streakRef = useRef(0);
  const phaseRef = useRef<Phase>('intro');
  phaseRef.current = phase;

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase('done');
    const s = statsRef.current;
    const dur = Math.round((Date.now() - (s.start || Date.now())) / 1000);
    onEndRef.current?.({
      score: s.score,
      won: s.answered > 0 && s.correct / s.answered >= 0.6,
      duration: Math.min(dur, 120),
      headline: `${s.correct}/${s.answered} CORRECT`,
      tallies: recRef.current.tallies(), maxCombo: recRef.current.bestChain,
    });
  }, []);

  // global 120s clock
  useEffect(() => {
    if (phase === 'intro' || phase === 'done') return;
    const iv = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(iv); finish(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'intro' || phase === 'done', finish]);

  // per-question timer
  useEffect(() => {
    if (phase !== 'question') return;
    const iv = setInterval(() => {
      setQTime((t) => {
        if (t <= 0.1) { clearInterval(iv); handleAnswer(-1); return 0; }
        return Math.round((t - 0.1) * 10) / 10;
      });
    }, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const difficulty = () => {
    const s = statsRef.current;
    if (s.answered < 2) return 'easy';
    const acc = s.correct / s.answered;
    return acc > 0.8 ? 'hard' : acc >= 0.6 ? 'medium' : 'easy';
  };

  const startSpin = useCallback(() => {
    if (spinRef.current.spinning) return;
    setPhase('spin');
    spinRef.current.spinning = true;
    spinRef.current.vel = (720 * Math.PI) / 180; // 720°/s
    spinRef.current.target = Math.floor(Math.random() * 7);
  }, []);

  const landOn = useCallback((idx: number) => {
    const cat = QUIZ_CATEGORIES?.[idx] ?? QUIZ_CATEGORIES[0];
    setCategory(cat);
    const diff = difficulty();
    const pool = (QUIZ_BANK?.[cat.key] ?? []).filter((q) => q.difficulty === diff && !usedRef.current.has(q.q));
    const fallback = (QUIZ_BANK?.[cat.key] ?? []).filter((q) => !usedRef.current.has(q.q));
    const pick = (pool.length ? pool : fallback.length ? fallback : QUIZ_BANK?.[cat.key] ?? [])[Math.floor(Math.random() * Math.max(pool.length || fallback.length || 1, 1))];
    if (!pick) { finish(); return; }
    usedRef.current.add(pick.q);
    const limit = pick.difficulty === 'hard' ? 10 : pick.difficulty === 'medium' ? 12 : 15;
    // Score this round through the shared QuizCore. A single-question deck per
    // round lets us keep the wheel's adaptive pick; streak carries across
    // rounds via the public field so the ×3 multiplier builds over the game.
    const qc = new QuizCore({
      questions: [{ q: pick.q, options: pick.options, answer: pick.answer, points: DIFF_POINTS[pick.difficulty] ?? 10 }],
      questionTimeMs: limit * 1000,
    });
    qc.streak = streakRef.current;
    qc.next(); // sets current + starts the per-question clock
    qcRef.current = qc;
    setQuestion(pick); setQTime(limit); setQMax(limit); setPicked(null);
    setPhase('question');
  }, [finish]);

  const handleAnswer = useCallback((idx: number) => {
    if (phaseRef.current !== 'question') return;
    setPicked(idx);
    setPhase('reveal');
    const qc = qcRef.current;
    if (qc && qc.current) {
      // idx < 0 is the per-question timeout tick. QuizCore owns the semantics:
      // speed-scaled earn, streak reset on wrong/timeout, single consume.
      const res = idx < 0 ? qc.timeout() : qc.answer(idx);
      streakRef.current = qc.streak;
      const gained = res.result === 'correct' ? res.earned : 0;
      statsRef.current.score += gained;
      statsRef.current.answered += 1;
      if (res.result === 'correct') {
        statsRef.current.correct += 1;
        recRef.current.recordHit();
        recRef.current.recordChain(qc.streak);
      } else {
        recRef.current.recordMiss();
      }
      setScore(statsRef.current.score);
      setAnswered(statsRef.current.answered);
      setCorrect(statsRef.current.correct);
    }
    setTimeout(() => {
      if (endedRef.current) return;
      setPhase('spin');
      setTimeout(() => startSpin(), 50);
    }, 1400);
  }, [startSpin]);

  // keyboard shortcuts 1-4 to answer
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') { e.preventDefault(); handleAnswer(parseInt(e.key) - 1); }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  });

  // wheel canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    const S = 340;
    canvas.width = S; canvas.height = S;
    let raf = 0; let last = 0;
    const seg = (Math.PI * 2) / 7;

    const loop = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      const sp = spinRef.current;
      if (sp.spinning) {
        sp.angle += sp.vel * dt;
        sp.vel *= Math.pow(0.35, dt); // eased deceleration
        if (sp.vel < 0.4) {
          sp.spinning = false; sp.vel = 0;
          // determine segment under pointer (top)
          const norm = ((-sp.angle - Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const idx = Math.floor(norm / seg) % 7;
          setTimeout(() => landOn(((idx % 7) + 7) % 7), 350);
        }
      }
      ctx.clearRect(0, 0, S, S);
      const cx = S / 2, cy = S / 2, r = S / 2 - 14;
      for (let i = 0; i < 7; i++) {
        const a0 = sp.angle + i * seg, a1 = a0 + seg;
        const cat = QUIZ_CATEGORIES?.[i];
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath();
        ctx.fillStyle = `${cat?.color ?? '#333'}26`;
        ctx.fill();
        ctx.strokeStyle = cat?.color ?? '#333'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(a0 + seg / 2);
        ctx.textAlign = 'right'; ctx.fillStyle = cat?.color ?? '#fff';
        ctx.font = 'bold 13px "Barlow Condensed", sans-serif';
        ctx.fillText((cat?.label ?? '').toUpperCase(), r - 12, 4);
        ctx.restore();
      }
      // hub
      ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fillStyle = '#0F0F13'; ctx.fill();
      ctx.strokeStyle = '#A855F7'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#A855F7'; ctx.textAlign = 'center'; ctx.font = 'bold 13px "Barlow Condensed", sans-serif';
      ctx.fillText('BRAWL', cx, cy + 4);
      // pointer at top
      ctx.beginPath(); ctx.moveTo(cx - 12, 6); ctx.lineTo(cx + 12, 6); ctx.lineTo(cx, 30); ctx.closePath();
      ctx.fillStyle = '#00E5FF'; ctx.fill();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [landOn]);

  const acc = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  return (
    <div className="relative mx-auto min-h-[70vh] max-w-[960px] overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,0.18),#050505_70%)] p-4">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(0,229,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(0,229,255,0.2)_1px,transparent_1px)] [background-size:36px_36px]" />

      {/* HUD */}
      <div className="relative z-10 mx-auto flex w-full max-w-xl items-center justify-between rounded-lg bg-[#0F0F13]/85 px-4 py-2.5 ring-1 ring-white/10">
        <div className="text-center">
          <div className="font-mono text-[28px] font-bold leading-none text-[#A855F7]">{score}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">Score</div>
        </div>
        <div className="text-center">
          <div className={`font-mono text-[28px] font-bold leading-none ${timeLeft <= 15 ? 'text-[#FF3366] fel-pulse' : 'text-white'}`}>
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">Clock</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[28px] font-bold leading-none text-[#00FF9D]">{acc}%</div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">Accuracy</div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-mono text-xs" style={{ color: grade?.color }}>PRQ {Math.round(prq)} · {grade?.label}</div>
          <div className="font-mono text-[10px] text-white/40">DIFF: {difficulty().toUpperCase()}</div>
        </div>
      </div>

      <div className="relative z-10 mt-6 flex flex-col items-center">
        {phase === 'intro' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h2 className="fel-heading text-4xl font-bold text-white">BRAIN BRAWL</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
              120 seconds. Spin the wheel, answer under pressure. Accuracy raises the difficulty — and the payout. Speed earns bonus points.
            </p>
            <button
              onClick={() => { statsRef.current.start = Date.now(); startSpin(); }}
              className="fel-heading mt-6 rounded-md bg-[#A855F7] px-10 py-3 text-xl font-bold text-white transition-all hover:shadow-[0_0_28px_rgba(168,85,247,0.55)]"
            >
              SPIN THE WHEEL
            </button>
          </motion.div>
        )}

        <div className={phase === 'spin' || phase === 'intro' ? 'mt-4' : 'hidden'}>
          <canvas ref={canvasRef} className="mx-auto" style={{ width: 300, height: 300 }} />
          {phase === 'spin' && !spinRef.current?.spinning && (
            <p className="mt-2 text-center font-mono text-xs text-white/40">Landing…</p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {(phase === 'question' || phase === 'reveal') && question && (
            <motion.div
              key={question.q}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              className="w-full max-w-xl"
            >
              <div className="flex items-center justify-between">
                <span
                  className="fel-heading rounded px-2.5 py-0.5 text-sm font-bold"
                  style={{ background: `${category?.color}20`, color: category?.color, border: `1px solid ${category?.color}55` }}
                >
                  {category?.label?.toUpperCase()} · {question.difficulty.toUpperCase()}
                </span>
                <span className={`font-mono text-lg font-bold ${qTime <= 3 ? 'text-[#FF3366]' : 'text-white/70'}`}>{qTime.toFixed(1)}s</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all" style={{ width: `${(qTime / qMax) * 100}%`, background: category?.color ?? '#00E5FF' }} />
              </div>
              <h3 className="mt-5 text-lg font-semibold leading-snug text-white">{question.q}</h3>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {(question.options ?? []).map((opt, i) => {
                  const revealed = phase === 'reveal';
                  const isAnswer = i === question.answer;
                  const isPicked = i === picked;
                  return (
                    <button
                      key={i}
                      disabled={revealed}
                      onClick={() => handleAnswer(i)}
                      className={`rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                        revealed
                          ? isAnswer
                            ? 'border-[#00FF9D] bg-[#00FF9D]/15 text-[#00FF9D]'
                            : isPicked
                              ? 'border-[#FF3366] bg-[#FF3366]/15 text-[#FF3366]'
                              : 'border-white/10 bg-[#16161A] text-white/40'
                          : 'border-white/10 bg-[#16161A] text-white/85 hover:border-[#A855F7]/60 hover:bg-[#A855F7]/10'
                      }`}
                    >
                      <span className="mr-2 font-mono text-xs text-white/40">{String.fromCharCode(65 + i)}</span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
