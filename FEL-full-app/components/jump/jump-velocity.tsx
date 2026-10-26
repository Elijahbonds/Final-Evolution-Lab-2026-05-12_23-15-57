'use client';

// JumpVelocity — each jump's take-off velocity, push-off and RSI-mod, every one labelled an estimate (JUMP-TESTS, owner
// scope addition 2026-10-25: "jump velocity & power"). Adults only (mounted on the adult jump result and in the jump
// tests). No power here: power needs a body weight (fv-profile.tsx), and is never shown to a kid or a teen.
//
// The live check keeps no frames, so it shows the take-off velocity alone; a video adds the push-off and RSI-mod.
import type { T5Extra } from '@/lib/assess/scoring';
import type { JumpKinematics } from '@/lib/jump/velocity';

export function JumpVelocity({ t5, kin }: { t5: T5Extra | null; kin: ReadonlyMap<number, JumpKinematics> }) {
  const rows = (t5?.jumps ?? []).filter((j) => j.valid && kin.has(j.index));
  if (!rows.length) return null;
  const anyRsiMod = rows.some((j) => kin.get(j.index)!.rsiMod !== null);
  return (
    <section data-jump-velocity className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-[16px] font-black text-white">Take-off speed (estimates)</h3>
      <ul className="mt-2 space-y-1">
        {rows.map((j) => {
          const k = kin.get(j.index)!;
          return (
            <li key={j.index} data-velocity-row={j.index} className="flex flex-wrap justify-between gap-x-3 text-[16px] text-white/85">
              <span>Jump {j.index}</span>
              <span>
                <span className="font-bold text-white">{k.v0Mps.toFixed(2)} m/s</span>
                {k.v0SdMps ? <span className="text-white/60"> ±{(1.96 * k.v0SdMps).toFixed(2)}</span> : null}
                {k.rsiMod !== null ? <span> · RSI-mod {k.rsiMod.toFixed(2)}</span> : null}
                {k.pushOffCm !== null ? <span className="text-white/60"> · push-off {Math.round(k.pushOffCm)} cm</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[16px] leading-snug text-white/60">
        Estimates from the video, not measurements.{anyRsiMod ? ' RSI-mod is jump height divided by the time from the start of your dip to take-off.' : ''}
      </p>
    </section>
  );
}
