'use client';

// A one-shot confetti burst over the card on a win or a record. One small canvas, ~120 rects, 1.8 s, then it stops and
// clears — no library, no loop left running. Never mounted under reduced motion (the card decides).

import { useEffect, useRef } from 'react';

const COLORS = ['#FFD700', '#00E5FF', '#00FF9D', '#A855F7', '#FF3366', '#FFFFFF'];
const LIFE_MS = 1800;

export function Confetti({ gold = false }: { gold?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    const n = Math.round(Math.min(140, Math.max(60, w / 12)));
    const palette = gold ? ['#FFD700', '#FFE680', '#FFB020', '#FFFFFF'] : COLORS;
    const parts = Array.from({ length: n }, (_, i) => {
      const side = i % 2 === 0 ? 0.18 : 0.82;   // two cannons, either side of the headline
      const ang = (-Math.PI / 2) + (side < 0.5 ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.9;
      const sp = (0.55 + Math.random() * 0.75) * Math.max(h, 500) * 0.0028;
      return {
        x: w * side, y: h * 0.42, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        s: 5 + Math.random() * 7, c: palette[i % palette.length],
      };
    });
    const t0 = performance.now();
    let raf = 0;
    let last = t0;
    const frame = (t: number) => {
      const dt = Math.min(40, t - last) / 16.67; last = t;
      const age = t - t0;
      ctx.clearRect(0, 0, w, h);
      const fade = age > LIFE_MS * 0.65 ? Math.max(0, 1 - (age - LIFE_MS * 0.65) / (LIFE_MS * 0.35)) : 1;
      for (const p of parts) {
        p.vy += 0.16 * dt; p.vx *= 0.992; p.x += p.vx * dt * 4; p.y += p.vy * dt * 4; p.r += p.vr * dt;
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (age < LIFE_MS) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [gold]);
  return <canvas ref={ref} aria-hidden data-end-confetti className="pointer-events-none absolute inset-0 h-full w-full" />;
}
