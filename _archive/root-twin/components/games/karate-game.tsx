'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '@/components/games/game-shell';
import { createShake, triggerShake, updateShake, applyShake, resetShake, addPopup, createPopups, updatePopups, drawPopups, createFlash as createJFlash, triggerFlash as triggerJFlash, drawFlash as drawJFlash } from '@/lib/canvas-juice';
import { SessionRecorder } from '@/lib/game-systems';
import { createDragonMoment, triggerDragonMoment, updateDragonMoment, drawDragonOverlay, applyDragonZoom, type DragonMomentState } from '@/lib/camera-director';
import { createHitStop, triggerHitStop, updateHitStop } from '@/lib/impact-system';

// M8.4 — endless archetypes: visually distinct at spawn
type ArchKind = 'striker' | 'grappler' | 'rusher';
const ARCH_KINDS: ArchKind[] = ['striker', 'grappler', 'rusher'];
const ARCH_STYLE: Record<ArchKind, { color: string; glow: string; scale: number; label: string }> = {
  // TUNE(elijah) — archetype silhouettes
  striker:  { color: '#FF3366', glow: '#FF336688', scale: 0.96, label: 'STRIKER' },
  grappler: { color: '#A855F7', glow: '#A855F788', scale: 1.18, label: 'GRAPPLER' },
  rusher:   { color: '#FFD700', glow: '#FFD70088', scale: 0.82, label: 'RUSHER' },
};

interface Foe {
  x: number; y: number; hp: number; maxHp: number; dir: number;
  attackCd: number; staggered: number; attacking: number; alive: boolean;
  dying: number; // M8.3 — >0 = mid death stagger (knocked back) before particles pop
  kind: ArchKind; // M8.4 archetype
}

export default function KarateGame({ grade, prq, onEnd, gamepad }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const stateRef = useRef<any>(null);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const gradeRef = useRef(grade);
  gradeRef.current = grade;

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;

    const W = 960, H = 540;
    canvas.width = W; canvas.height = H;

    const bg = new Image();
    bg.src = '/backdrops/karate.jpg';

    const st = {
      t: 0, last: 0, score: 0, wave: 1, combo: 0, comboT: 0, mult: 1,
      neural: 0, burst: 0, flash: 0, slowmo: 0,
      px: 240, py: H - 120, php: 100, pface: 1,
      attack: 0, attackType: '' as string, block: false, counterT: 0,
      keys: {} as Record<string, boolean>,
      foes: [] as Foe[], startTime: Date.now(),
      particles: [] as any[],
      shake: createShake(),
      popups: createPopups(),
      jflash: createJFlash(),
      dragon: createDragonMoment(),
      // M8.3 — impact hit-stop + wave-clear breather state
      hitStop: createHitStop(),
      pendingWave: 0, waveClearT: 0, kills: 0, waveKills: 0, waveMsg: '', waveMsgT: 0,
    };
    stateRef.current = st;
    const rec = new SessionRecorder();

    const spawnWave = (w: number) => {
      const count = w >= 13 ? 3 : w >= 7 ? 2 : 1;
      st.foes = [];
      for (let i = 0; i < count; i++) {
        const hp = 40 + w * 8;
        st.foes.push({ x: W - 200 - i * 90, y: H - 120, hp, maxHp: hp, dir: -1, attackCd: 1.2 + Math.random(), staggered: 0, attacking: 0, alive: true, dying: 0, kind: ARCH_KINDS[(w + i) % 3] });
      }
    };
    spawnWave(1);

    const aggr = (w: number) => Math.min(0.6 + (w - 1) * 0.08, 1.4);
    const spd = (w: number) => (w >= 13 ? 1.15 : 1 + (w - 1) * 0.012) * (gradeRef.current?.speedMult ?? 1);

    const doStrike = (type: 'jab' | 'kick' | 'special') => {
      if (st.attack > 0 || st.block) return;
      const pts = type === 'jab' ? 1 : type === 'kick' ? 2 : 3;
      const range = type === 'jab' ? 90 : type === 'kick' ? 120 : 140;
      const dmg = (type === 'jab' ? 10 : type === 'kick' ? 16 : 26) * (st.counterT > 0 ? 1.6 : 1);
      st.attack = type === 'jab' ? 0.22 : type === 'kick' ? 0.34 : 0.5;
      st.attackType = type;
      // M8.2: Dragon Strike Moment on special
      if (type === 'special') triggerDragonMoment(st.dragon);
      let hit = false;
      for (const f of st.foes) {
        if (!f.alive) continue;
        if (Math.abs(f.x - st.px) < range + 40 && ((f.x - st.px) * st.pface > 0 || Math.abs(f.x - st.px) < 60)) {
          f.hp -= dmg; f.staggered = 0.45; hit = true;
          // M8.3 — visible knockback proportional to hit power (dragon strike shoves hardest)
          f.x += st.pface * (type === 'special' ? 64 : type === 'kick' ? 34 : 22); // TUNE(elijah)
          f.x = Math.max(60, Math.min(W - 60, f.x));
          for (let i = 0; i < 8; i++) st.particles.push({ x: f.x, y: f.y - 60, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 200, life: 0.5, color: st.burst > 0 ? '#A855F7' : '#00E5FF' });
          if (f.hp <= 0 && f.dying <= 0) {
            // M8.3 — endless enemy death: 2-frame stagger + knockback BEFORE death
            // particles. Foe stays visible (dying) so the hit reads before it pops.
            f.dying = 0.055; // TUNE(elijah) — ~2-3 frames
            f.x += st.pface * 40; f.x = Math.max(60, Math.min(W - 60, f.x)); // extra death shove
            triggerHitStop(st.hitStop, 0.04); // TUNE(elijah) — shared impact punch
          }
        }
      }
      if (hit) {
        st.combo += 1; st.comboT = 0.5;
        rec.recordHit(); rec.recordChain(st.combo);
        st.mult = (1 + Math.min(st.combo, 10) * 0.1) * (st.burst > 0 ? 1.5 : 1);
        const gained = Math.round(pts * st.mult * (st.counterT > 0 ? 2 : 1));
        st.score += gained;
        addPopup(st.popups, `+${gained}`, st.foes.find(f => f.alive)?.x ?? st.px + 60, st.py - 120, st.burst > 0 ? '#A855F7' : '#00E5FF');
        triggerShake(st.shake, type === 'special' ? 8 : 4, type === 'special' ? 180 : 100);
        st.neural = Math.min(100, st.neural + (type === 'special' ? 10 : 6));
        if (st.neural >= 80 && st.burst <= 0) st.burst = 6;
        st.counterT = 0;
      } else {
        st.combo = 0; st.mult = st.burst > 0 ? 1.5 : 1;
        rec.recordMiss();
      }
    };

    const kd = (e: KeyboardEvent) => {
      const k = e?.key?.toLowerCase?.() ?? '';
      st.keys[k] = true;
      if (k === 'j') doStrike('jab');
      if (k === 'k') doStrike('kick');
      if (k === ';') doStrike('special');
      if (k === 'l') st.block = true;
      if (['j', 'k', 'l', ';', 'a', 'd', 'w', 's'].includes(k)) e.preventDefault?.();
    };
    const ku = (e: KeyboardEvent) => {
      const k = e?.key?.toLowerCase?.() ?? '';
      st.keys[k] = false;
      if (k === 'l') { st.block = false; st.counterT = 0.15; }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    (canvas as any).felAction = (a: string, down: boolean) => {
      if (a === 'jab' && down) doStrike('jab');
      if (a === 'kick' && down) doStrike('kick');
      if (a === 'special' && down) doStrike('special');
      if (a === 'block') { if (down) st.block = true; else { st.block = false; st.counterT = 0.15; } }
      if (a === 'left') st.keys['a'] = down;
      if (a === 'right') st.keys['d'] = down;
    };

    const drawFighter = (x: number, y: number, face: number, color: string, glow: string, blocking: boolean, attackT: number, attackType: string, scale = 1) => {
      ctx.save();
      ctx.translate(x, y); ctx.scale(face * scale, scale);
      ctx.shadowColor = glow; ctx.shadowBlur = 18;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round';
      // head
      ctx.beginPath(); ctx.arc(0, -95, 13, 0, Math.PI * 2); ctx.fill();
      // torso
      ctx.beginPath(); ctx.moveTo(0, -80); ctx.lineTo(0, -35); ctx.stroke();
      // arms
      const punch = attackT > 0 && attackType === 'jab' ? 38 : attackT > 0 && attackType === 'special' ? 46 : 0;
      ctx.beginPath();
      if (blocking) { ctx.moveTo(0, -72); ctx.lineTo(22, -85); ctx.moveTo(0, -60); ctx.lineTo(24, -66); }
      else { ctx.moveTo(0, -72); ctx.lineTo(26 + punch, -78); ctx.moveTo(0, -62); ctx.lineTo(18 + punch * 0.5, -50); }
      ctx.stroke();
      // legs
      const kick = attackT > 0 && attackType === 'kick' ? 44 : 0;
      ctx.beginPath();
      ctx.moveTo(0, -35); ctx.lineTo(kick ? 34 + kick : 14, kick ? -42 : 0);
      ctx.moveTo(0, -35); ctx.lineTo(-14, 0);
      ctx.stroke();
      ctx.restore();
    };

    let raf = 0;
    const loop = (now: number) => {
      if (endedRef.current) return;
      const rawDt = Math.min((now - (st.last || now)) / 1000, 0.05);
      st.last = now;
      // M8.2: Dragon moment update (uses real dt, outputs timeScale)
      updateDragonMoment(st.dragon, rawDt);
      // M8.3 — shared hit-stop punch on enemy death, scales game dt to 0 briefly.
      const hitScale = updateHitStop(st.hitStop, rawDt);
      const dragonScale = st.dragon.active ? st.dragon.timeScale : 1;
      const dt = (st.slowmo > 0 ? rawDt * 0.35 : rawDt) * dragonScale * hitScale;
      st.t += dt;
      if (st.slowmo > 0) st.slowmo -= rawDt;
      if (st.flash > 0) st.flash -= rawDt;
      if (st.burst > 0) { st.burst -= rawDt; if (st.burst <= 0) { st.neural = 0; st.mult = 1 + Math.min(st.combo, 10) * 0.1; } }
      if (st.attack > 0) st.attack -= dt;
      if (st.counterT > 0) st.counterT -= dt;
      if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) { st.combo = 0; st.mult = st.burst > 0 ? 1.5 : 1; } }

      // gamepad input
      if (gamepad) {
        if (gamepad.left) st.keys['a'] = true;
        if (gamepad.right) st.keys['d'] = true;
        if (!gamepad.left && !st.keys['a']) st.keys['a'] = false;
        if (!gamepad.right && !st.keys['d']) st.keys['d'] = false;
        if (gamepad.x) doStrike('jab');
        if (gamepad.y) doStrike('kick');
        if (gamepad.b) doStrike('special');
        if (gamepad.lb || gamepad.rb) { st.block = true; } else if (st.block && !st.keys['l']) { st.block = false; st.counterT = 0.15; }
      }

      // juice updates
      updateShake(st.shake, dt);
      updatePopups(st.popups, dt);

      // movement
      const mv = 240 * (gradeRef.current?.speedMult ?? 1);
      if (st.keys['a']) { st.px -= mv * dt; st.pface = -1; }
      if (st.keys['d']) { st.px += mv * dt; st.pface = 1; }
      st.px = Math.max(60, Math.min(W - 60, st.px));

      // foes AI
      const a = aggr(st.wave), sm = spd(st.wave);
      let aliveCount = 0;
      for (const f of st.foes) {
        // M8.3 — dying enemies: hold a couple frames (knocked back), THEN pop into
        // death particles. They still block wave-clear until they finish.
        if (f.dying > 0) {
          aliveCount++;
          f.dying -= rawDt;
          if (f.dying <= 0) {
            f.alive = false; f.dying = 0;
            st.kills += 1; st.waveKills += 1;
            st.slowmo = 0.35; st.flash = 0.15;
            for (let i = 0; i < 16; i++) st.particles.push({ x: f.x, y: f.y - 60, vx: (Math.random() - 0.5) * 400, vy: -Math.random() * 320, life: 0.8, color: '#FFD700' });
          }
          continue;
        }
        if (!f.alive) continue;
        aliveCount++;
        if (f.staggered > 0) { f.staggered -= dt; continue; }
        const dx = st.px - f.x;
        f.dir = dx > 0 ? 1 : -1;
        if (Math.abs(dx) > 85) f.x += f.dir * 110 * sm * dt;
        f.attackCd -= dt * a;
        if (f.attacking > 0) {
          f.attacking -= dt;
          if (f.attacking <= 0 && Math.abs(dx) < 110) {
            const blocked = st.block && ((dx < 0 && st.pface === -1) || (dx > 0 && st.pface === 1) || true); // 90° front cone — block covers front
            const facingFoe = (f.x - st.px) * st.pface > 0;
            if (st.block && facingFoe) {
              st.counterT = 0.15;
              for (let i = 0; i < 6; i++) st.particles.push({ x: st.px + st.pface * 30, y: st.py - 70, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 150, life: 0.4, color: '#00FF9D' });
            } else {
              st.php -= 7 + st.wave; st.flash = 0.1;
            }
          }
        } else if (f.attackCd <= 0 && Math.abs(dx) < 120) {
          f.attacking = 0.3; f.attackCd = Math.max(0.6, 1.6 - a * 0.6) + Math.random() * 0.5;
        }
      }
      // M8.3 — WAVE CLEAR: banner + kill count + 1s breather; the next wave does
      // not spawn until the breather elapses AND the death particles have cleared.
      if (aliveCount === 0 && st.pendingWave === 0) {
        st.pendingWave = st.wave + 1;
        st.waveClearT = 1.0; // TUNE(elijah) — breather
        st.score += 5 * st.wave;
        st.waveMsg = `WAVE ${st.wave} CLEAR · ${st.waveKills} KO`;
        st.waveMsgT = 1.6;
      }
      if (st.pendingWave > 0) {
        if (st.waveClearT > 0) st.waveClearT -= rawDt;
        if (st.waveClearT <= 0 && st.particles.length === 0) {
          st.wave = st.pendingWave; st.pendingWave = 0; st.waveKills = 0;
          spawnWave(st.wave);
        }
      }
      if (st.waveMsgT > 0) st.waveMsgT -= rawDt;

      // particles
      st.particles = (st.particles ?? []).filter((p: any) => { p.life -= rawDt; p.x += p.vx * rawDt; p.y += p.vy * rawDt; p.vy += 500 * rawDt; return p.life > 0; });

      if (st.php <= 0 && !endedRef.current) {
        endedRef.current = true;
        const dur = Math.round((Date.now() - st.startTime) / 1000);
        onEndRef.current?.({ score: st.score, won: st.wave >= 5, duration: dur, headline: `WAVE ${st.wave} · KO`, tallies: rec.tallies(), maxCombo: rec.bestChain });
        return;
      }

      // ===== RENDER =====
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      applyDragonZoom(ctx, W, H, st.dragon);
      applyShake(ctx, st.shake);
      if (bg.complete && bg.naturalWidth > 0) {
        ctx.drawImage(bg, 0, 0, W, H);
        ctx.fillStyle = 'rgba(5,5,5,0.35)'; ctx.fillRect(0, 0, W, H);
      } else { ctx.fillStyle = '#0F0F13'; ctx.fillRect(0, 0, W, H); }

      // floor shadow line
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H - 106, W, 4);

      // aura
      const auraColor = st.burst > 0 ? '#A855F7' : gradeRef.current?.color ?? '#00E5FF';
      const ag = ctx.createRadialGradient(st.px, st.py - 55, 10, st.px, st.py - 55, 90);
      ag.addColorStop(0, `${auraColor}33`); ag.addColorStop(1, 'transparent');
      ctx.fillStyle = ag; ctx.fillRect(st.px - 100, st.py - 160, 200, 200);

      drawFighter(st.px, st.py, st.pface, '#EDEDF2', auraColor, st.block, st.attack, st.attackType);
      for (const f of st.foes) {
        if (!f.alive && f.dying <= 0) continue;
        const dyingFoe = f.dying > 0;
        const style = ARCH_STYLE[f.kind]; // M8.4
        drawFighter(f.x, f.y, f.dir, dyingFoe ? '#FFD700' : f.staggered > 0 ? '#FF8899' : style.color, dyingFoe ? '#FFD70088' : style.glow, false, f.attacking > 0 ? 0.2 : 0, 'jab', dyingFoe ? style.scale * 0.94 : style.scale);
        if (!dyingFoe) {
          // foe hp bar
          ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(f.x - 28, f.y - 130, 56, 5);
          ctx.fillStyle = style.color; ctx.fillRect(f.x - 28, f.y - 130, 56 * Math.max(f.hp / f.maxHp, 0), 5);
          // M8.4 — archetype label above foe
          ctx.font = 'bold 10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = style.color;
          ctx.fillText(style.label, f.x, f.y - 138);
        }
      }

      for (const p of st.particles) { ctx.globalAlpha = Math.max(p.life * 2, 0); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
      ctx.globalAlpha = 1;

      // ===== HUD =====
      // Scoreboard top-center
      ctx.fillStyle = 'rgba(15,15,19,0.85)';
      ctx.fillRect(W * 0.2, 8, W * 0.6, 52);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(W * 0.2, 8, W * 0.6, 52);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 28px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(st.score), W / 2, 44);
      ctx.font = '600 14px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#00E5FF';
      ctx.fillText(`KARATE ENDLESS · WAVE ${st.wave}`, W / 2, 20);
      // health bar
      const hpw = 240, hpx = W * 0.2 + 12, hpy = 66;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(hpx, hpy, hpw, 10);
      const hpr = Math.max(st.php / 100, 0);
      const hg = ctx.createLinearGradient(hpx, 0, hpx + hpw, 0);
      hg.addColorStop(0, '#00FF9D'); hg.addColorStop(0.6, '#FFD700'); hg.addColorStop(1, '#FF3366');
      ctx.fillStyle = hg; ctx.fillRect(hpx, hpy, hpw * hpr, 10);
      // PRQ ticker top-right
      ctx.textAlign = 'right'; ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillStyle = gradeRef.current?.color ?? '#00FF9D';
      ctx.fillText(`PRQ ${Math.round(prq)} · ${gradeRef.current?.label ?? ''}`, W - 14, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`AGGR ${a.toFixed(2)} · SPD ×${sm.toFixed(2)}`, W - 14, 42);
      // combo center-right
      if (st.combo > 1) {
        const pulse = 1 + Math.min(st.comboT, 0.2);
        ctx.save(); ctx.translate(W - 90, H / 2); ctx.scale(pulse, pulse);
        ctx.textAlign = 'center';
        ctx.fillStyle = st.burst > 0 ? '#A855F7' : '#00E5FF';
        ctx.font = 'bold 34px "Barlow Condensed", sans-serif';
        ctx.fillText(`×${st.mult.toFixed(1)}`, 0, 0);
        ctx.font = '600 13px "Barlow Condensed", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(`${st.combo} CHAIN`, 0, 18);
        ctx.restore();
      }
      // NeuralDrive left edge bar
      ctx.fillStyle = 'rgba(15,15,19,0.85)'; ctx.fillRect(10, H * 0.25, 12, H * 0.5);
      const ng = ctx.createLinearGradient(0, H * 0.75, 0, H * 0.25);
      ng.addColorStop(0, '#00E5FF'); ng.addColorStop(1, '#A855F7');
      ctx.fillStyle = ng;
      const nh = (st.neural / 100) * H * 0.5;
      ctx.fillRect(10, H * 0.75 - nh, 12, nh);
      if (st.burst > 0) {
        ctx.strokeStyle = '#A855F7'; ctx.lineWidth = 2; ctx.strokeRect(8, H * 0.25 - 2, 16, H * 0.5 + 4);
        ctx.textAlign = 'left'; ctx.fillStyle = '#A855F7'; ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.fillText('NEURAL BURST', 28, H * 0.5);
      }
      if (st.counterT > 0) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#00FF9D'; ctx.font = 'bold 16px "Barlow Condensed", sans-serif';
        ctx.fillText('COUNTER WINDOW', st.px, st.py - 150);
      }
      if (st.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${0.3 * (st.flash / 0.15)})`; ctx.fillRect(0, 0, W, H); }
      // M8.3 — WAVE CLEAR banner
      if (st.waveMsgT > 0 && st.waveMsg) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.globalAlpha = Math.min(1, st.waveMsgT);
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 42px "Barlow Condensed", sans-serif';
        ctx.fillText(st.waveMsg, W / 2, H / 2 - 24);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      drawPopups(ctx, st.popups);
      // M8.2: Dragon moment crimson overlay
      drawDragonOverlay(ctx, W, H, st.dragon);
      ctx.restore(); // end shake + dragon zoom transform

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [started, prq]);

  const act = (a: string, down: boolean) => (canvasRef.current as any)?.felAction?.(a, down);

  return (
    <div className="select-none">
      <div className="relative mx-auto w-full max-w-[960px]">
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10 bg-[#0F0F13]" style={{ aspectRatio: '16/9' }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
            <h2 className="fel-heading text-4xl font-bold text-white">KARATE ENDLESS</h2>
            <p className="mt-2 max-w-md text-center text-sm text-white/60">
              Survive escalating waves. Chain strikes inside the 0.5s window to build your multiplier.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs text-white/55">
              <span>□ J — Jab (1pt)</span><span>△ K — Kick (2pt)</span>
              <span>✕ L — Block (hold)</span><span>○ ; — Special (3pt)</span>
              <span>A / D — Move</span><span>Block → 0.15s counter</span>
            </div>
            <button onClick={() => setStarted(true)} className="fel-heading mt-6 rounded-md bg-[#00E5FF] px-10 py-3 text-xl font-bold text-black transition-all hover:shadow-[0_0_28px_rgba(0,229,255,0.5)]">
              FIGHT
            </button>
          </div>
        )}
      </div>
      {/* touch controls */}
      {started && (
        <div className="mx-auto mt-3 flex max-w-[960px] items-center justify-between gap-2 !hidden">
          <div className="flex gap-2">
            <button onTouchStart={() => act('left', true)} onTouchEnd={() => act('left', false)} onMouseDown={() => act('left', true)} onMouseUp={() => act('left', false)} className="h-14 w-14 rounded-full border border-white/20 bg-[#16161A] text-xl text-white">◀</button>
            <button onTouchStart={() => act('right', true)} onTouchEnd={() => act('right', false)} onMouseDown={() => act('right', true)} onMouseUp={() => act('right', false)} className="h-14 w-14 rounded-full border border-white/20 bg-[#16161A] text-xl text-white">▶</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onTouchStart={() => act('kick', true)} className="h-12 w-12 rounded-full border border-[#00FF9D]/50 bg-[#16161A] text-sm font-bold text-[#00FF9D]">△</button>
            <button onTouchStart={() => act('special', true)} className="h-12 w-12 rounded-full border border-[#FF3366]/50 bg-[#16161A] text-sm font-bold text-[#FF3366]">○</button>
            <button onTouchStart={() => act('jab', true)} className="h-12 w-12 rounded-full border border-[#00E5FF]/50 bg-[#16161A] text-sm font-bold text-[#00E5FF]">□</button>
            <button onTouchStart={() => act('block', true)} onTouchEnd={() => act('block', false)} className="h-12 w-12 rounded-full border border-[#FFD700]/50 bg-[#16161A] text-sm font-bold text-[#FFD700]">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
