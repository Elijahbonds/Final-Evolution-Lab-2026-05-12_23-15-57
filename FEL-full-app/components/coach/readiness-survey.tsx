'use client';
// ReadinessSurvey — COACH-DELIVERY COA-03 (2026-10-26): five quick questions beside the jump check, for a day (or a team)
// with no room to jump. Server: app/api/coach/me/readiness-survey (lib/coach/readiness/surveyServer.ts). Adults only, like
// the jump check (the page mounts it for a verified adult). The answers are health data: saved only with health data on
// (the server says so, and nothing is saved without it). What a Low does is the coach's rule, read the same way as a jump.
import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2 } from 'lucide-react';
import { localDayKey } from '@/lib/health/readiness';
import { SURVEY_INTRO, SURVEY_ITEMS, type SurveyItemId } from '@/lib/coach/readiness/survey';

export const READINESS_SURVEY_API = '/api/coach/me/readiness-survey';

interface DayView { day: string; band: 'normal' | 'low'; label: string; line: string; next: string | null; low: string; coaches: { coachName: string; ruleLine: string }[] }
interface Ctx { ok: boolean; adult: boolean; ready: boolean; healthData: boolean; consentLine: string | null; today: DayView | null }

export function ReadinessSurvey({ api = READINESS_SURVEY_API }: { api?: string }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<SurveyItemId, number>>>({});
  const [view, setView] = useState<DayView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch(api).then((r) => (r.ok ? r.json() : null)).then((j: Ctx | null) => { setCtx(j); if (j?.today) setView(j.today); }).catch(() => setCtx(null));
  }, [api]);

  const complete = SURVEY_ITEMS.every((i) => answers[i.id] != null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day: localDayKey(new Date()), answers }) });
      const j = await r.json().catch(() => ({})) as { view?: DayView; line?: string; error?: string };
      if (r.ok && j.view) { setView(j.view); setMsg(j.line ?? null); return; }
      setMsg(j.line ?? (r.status === 403 ? 'The check-in is for 18 and over for now.' : r.status === 503 ? 'The check-in opens soon.' : 'Not saved. Try again.'));
    } catch { setMsg('No connection. Try again in a moment.'); } finally { setBusy(false); }
  };

  if (!ctx) return null;
  if (!ctx.ready) return null;   // before the pending SQL the jump check stands alone
  return (
    <section className="fel-card min-w-0 space-y-3 rounded-xl p-4" data-readiness-survey>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40"><ClipboardList className="h-3.5 w-3.5" /> Five-question check-in</div>
      <p className="text-sm text-white/70">{SURVEY_INTRO}</p>
      {view ? (
        <div className="space-y-1" data-survey-result={view.band}>
          <div className="flex items-center gap-2 text-white"><CheckCircle2 className={`h-4 w-4 ${view.band === 'low' ? 'text-[#FFB020]' : 'text-[#00FF9D]'}`} /> <span className="font-semibold">{view.label}</span></div>
          <p className="text-sm text-white/75">{view.line}</p>
          {view.next && <p className="text-sm text-white/60">{view.next}</p>}
          {msg && <p className="text-xs text-white/50">{msg}</p>}
        </div>
      ) : !ctx.healthData ? (
        <p className="text-sm text-white/60" data-survey-consent>{ctx.consentLine}</p>
      ) : (
        <>
          {SURVEY_ITEMS.map((item) => (
            <fieldset key={item.id} className="min-w-0 space-y-1">
              <legend className="text-sm text-white">{item.prompt}</legend>
              <div className="grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button key={v} type="button" aria-pressed={answers[item.id] === v} onClick={() => setAnswers((a) => ({ ...a, [item.id]: v }))}
                    className={`min-h-10 rounded-lg border text-sm ${answers[item.id] === v ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/10 text-white/60'}`}>{v}</button>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-white/40"><span>{item.anchors[1]}</span><span>{item.anchors[5]}</span></div>
            </fieldset>
          ))}
          {msg && <p className="text-xs text-[#FFB020]" role="alert">{msg}</p>}
          <button type="button" disabled={!complete || busy} onClick={() => void send()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#00E5FF]/15 text-sm font-medium text-[#00E5FF] disabled:opacity-40">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save today&apos;s check-in
          </button>
        </>
      )}
    </section>
  );
}
