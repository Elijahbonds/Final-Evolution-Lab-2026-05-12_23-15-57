// CameraHelpPanel — a failed camera, said with what to do about it (QA P1-23, 2026-09-27). The words are lib/camera/cameraHelp.
import type { CameraHelp } from '@/lib/camera/cameraHelp';

export function CameraHelpPanel({ help, onRetry, onButtons }: { help: CameraHelp; onRetry?: () => void; onButtons?: () => void }) {
  return (
    <div data-camera-help={help.failure} className="mt-4 rounded-xl border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-3 text-left text-[13px] text-[#ff8da8]">
      <p className="font-bold text-[#ffb3c4]">{help.title}</p>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-white/75">
        {help.steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      {(onRetry || (help.alternative && onButtons)) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {onRetry && <button type="button" onClick={onRetry} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white">Try again</button>}
          {help.alternative && onButtons && <button type="button" onClick={onButtons} className="rounded-lg border border-[#00E5FF]/50 px-3 py-1.5 text-xs font-bold text-[#00E5FF]">{help.alternative}</button>}
        </div>
      )}
    </div>
  );
}
