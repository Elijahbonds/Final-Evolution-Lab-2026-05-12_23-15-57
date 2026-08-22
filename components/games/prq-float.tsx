'use client';

/**
 * M8.4 — PRQ surfacing.
 * Lightweight floating "+N PRQ" reward text that rises & fades at the moment of
 * a score / kill / dunk. Purely cosmetic feedback — does NOT touch gameplay or
 * real PRQ math. Emitters live in each game's mutable state ref; the layer below
 * renders whatever the HUD hands it each frame.
 */

export const PRQ_LIFE = 1.15; // TUNE(elijah) — seconds a popup stays alive

export interface PrqPop {
  id: number;
  amt: number;   // PRQ shards surfaced
  life: number;  // seconds remaining
  x: number;     // horizontal anchor, 0..100 (% of frame)
  tone: string;  // colour
}

/** Mutable emitter state stored inside a game's ref. */
export interface PrqEmitter {
  pops: PrqPop[];
  nextId: number;
}

export function createPrqEmitter(): PrqEmitter {
  return { pops: [], nextId: 1 };
}

/** Fire a popup. `x` defaults to a slight jitter around centre. */
export function spawnPrq(e: PrqEmitter, amt: number, tone = '#00FF9D', x = 50 + (Math.random() - 0.5) * 14) {
  e.pops.push({ id: e.nextId++, amt, life: PRQ_LIFE, x, tone });
  if (e.pops.length > 8) e.pops.shift(); // TUNE(elijah) — cap on-screen popups
}

/** Advance lifetimes; call once per frame. Returns a *copy* safe to hand to the HUD. */
export function updatePrq(e: PrqEmitter, dt: number): PrqPop[] {
  for (const p of e.pops) p.life -= dt;
  e.pops = e.pops.filter((p) => p.life > 0);
  return e.pops.map((p) => ({ ...p }));
}

/** DOM overlay — render inside a `relative` HUD container. */
export function PrqFloatLayer({ pops }: { pops: PrqPop[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pops.map((p) => {
        const prog = 1 - p.life / PRQ_LIFE; // 0 → 1 over lifetime
        const top = 48 - prog * 26; // TUNE(elijah) — rise distance
        const opacity = Math.min(1, p.life * 2.6) * (1 - prog * 0.15);
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${top}%`,
              transform: `translate(-50%,-50%) scale(${0.9 + prog * 0.25})`,
              opacity,
              color: p.tone,
              fontWeight: 900,
              fontSize: '1.35rem',
              fontFamily: 'var(--font-display), "Barlow Condensed", sans-serif',
              letterSpacing: '0.04em',
              textShadow: `0 0 14px ${p.tone}, 0 2px 6px rgba(0,0,0,0.8)`,
              whiteSpace: 'nowrap',
            }}
          >
            +{p.amt} PRQ
          </div>
        );
      })}
    </div>
  );
}
