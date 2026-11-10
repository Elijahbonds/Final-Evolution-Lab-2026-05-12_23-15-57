'use client';
// ApplyForm — PLAT-P10 (EDU-01, 2026-11-03): a teacher's application. Phone first: one column, the discipline as chips,
// two text boxes and up to three links, then the one primary. The words are checked on the device by the same screen the
// route runs (lib/teach/apply.ts checkApplication), so a claim or medical word is caught before it is sent.
import { useState } from 'react';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { APPLY_LIMITS, DISCIPLINES, checkApplication, type DisciplineId } from '@/lib/teach/apply';
import { TEACH_COPY as T } from './copy';
import { TEACH_LOOK as L } from './look';

export function ApplyForm({ onSent }: { onSent?: () => void }) {
  const [discipline, setDiscipline] = useState<DisciplineId | null>(null);
  const [bio, setBio] = useState('');
  const [sample, setSample] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [errors, setErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const body = { discipline, bio, sample, links: links.filter((l) => l.trim()) };
    const check = checkApplication(body);
    if (!check.ok) { setErrors(check.errors); return; }
    setBusy(true); setErrors([]);
    try {
      const r = await fetch('/api/teach/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setSent(true); onSent?.(); return; }
      setErrors(j.error === 'adults_only' ? [T.adultsOnly] : j.error === 'opens_soon' ? [T.opensSoon] : Array.isArray(j.errors) ? j.errors : ['That did not send. Try again.']);
    } catch { setErrors(['That did not send. Try again.']); }
    finally { setBusy(false); }
  };

  if (sent) return <p className={L.ok} role="status" data-teach-sent>{T.pending}</p>;
  return (
    <form className="space-y-4" data-teach-apply onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <fieldset className="space-y-2">
        <legend className={L.label}>{T.discipline}</legend>
        <div className={L.chips}>
          {DISCIPLINES.map((d) => (
            <button key={d.id} type="button" aria-pressed={discipline === d.id} onClick={() => setDiscipline(d.id)} data-teach-discipline={d.id}
              className={`${L.chip} ${discipline === d.id ? L.chipOn : ''}`}>{d.label}</button>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1">
        <span className={L.label}>{T.bio}</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={APPLY_LIMITS.bio} placeholder={T.bioHint} className={L.area} data-teach-bio />
      </label>
      <label className="block space-y-1">
        <span className={L.label}>{T.sample}</span>
        <textarea value={sample} onChange={(e) => setSample(e.target.value)} maxLength={APPLY_LIMITS.sample} placeholder={T.sampleHint} className={`${L.area} min-h-32`} data-teach-sample />
      </label>
      <fieldset className="space-y-2">
        <legend className={L.label}>{T.links}</legend>
        {links.map((l, i) => (
          <input key={i} value={l} inputMode="url" placeholder="https://" aria-label={`Link ${i + 1}`} className={L.input} data-teach-link={i}
            onChange={(e) => setLinks((ls) => ls.map((x, k) => (k === i ? e.target.value : x)))} />
        ))}
        {links.length < APPLY_LIMITS.links && <button type="button" className={L.chip} onClick={() => setLinks((ls) => [...ls, ''])}>Add a link</button>}
      </fieldset>
      {errors.length > 0 && <ul className="space-y-1" role="alert" data-teach-errors>{errors.map((e) => <li key={e} className={L.error}>{e}</li>)}</ul>}
      <div className={busy ? 'pointer-events-none opacity-60' : ''}><PrimaryCta onClick={() => void send()} testId="teach-send">{T.send}</PrimaryCta></div>
    </form>
  );
}
