'use client';

// PUBLISH (NEX-02 + NEX-04, round 8). The owner publishes a venue as a REVIEWED FILE: this panel runs the publish gate
// (lib/nexus-studio/publishGate.ts — the keep-out zone, the phone budget, readability) and, when it passes, downloads the
// publication with the path it goes to in the repo. Committing it in a PR is the publish; the merge ships it as the mode's default
// place, with Restore on the splash (lib/nexus-studio/published.ts). Nothing is sent anywhere from here.

import { useMemo, useState } from 'react';
import { Upload, X, Check, AlertTriangle, Smartphone, Link2 } from 'lucide-react';
import type { StudioProject, StudioVenue } from '@/lib/nexus-studio/doc';
import { exportVenue } from '@/lib/nexus-studio/exportVenue';
import { scriptsForVenue } from '@/lib/nexus-studio/scripts';
import { publishGate, type GateProblem, type PhoneSample } from '@/lib/nexus-studio/publishGate';
import { packPublished, publishModesFor, publishedPath } from '@/lib/nexus-studio/published';
import { C } from './ui';

export interface PublishOutcome { ok: boolean; problems: GateProblem[]; path?: string; text?: string; name?: string }

/** Pure: what Publish does for this venue, mode and phone column (the gate, then the file). */
export function publishVenue(venue: StudioVenue, project: Pick<StudioProject, 'scripts'>, mode: string, phone: PhoneSample | null, now = new Date()): PublishOutcome {
  // the publication carries the venue's scripts, never a cast (packPublished drops it; none is resolved here)
  const exp = exportVenue(venue, null, scriptsForVenue(project.scripts, venue.id));
  const gate = publishGate(exp, phone);
  if (!gate.ok || !phone) return { ok: false, problems: gate.problems };
  const pub = packPublished(exp, mode, phone, now);
  return { ok: true, problems: [], path: publishedPath(pub), name: `${pub.venue.venueId}.venue.json`, text: `${JSON.stringify(pub, null, 2)}\n` };
}

export function PublishPanel({ venue, project, phoneSample, onMeasurePhone, onClose }: {
  venue: StudioVenue; project: StudioProject; phoneSample: PhoneSample | null; onMeasurePhone(): void; onClose(): void;
}) {
  const modes = useMemo(() => publishModesFor(venue.base.target), [venue.base.target]);
  const [mode, setMode] = useState(modes[0]?.mode ?? venue.base.target);
  const [out, setOut] = useState<PublishOutcome | null>(null);
  // NEX-06: a share link (practice only, signed-in players open it; lib/nexus-studio/share.ts) — the server re-runs every check
  const [share, setShare] = useState<{ state: 'idle' | 'making' } | { state: 'made'; url: string } | { state: 'refused'; lines: string[] }>({ state: 'idle' });
  const makeLink = async () => {
    setShare({ state: 'making' });
    const exp = exportVenue(venue, null, scriptsForVenue(project.scripts, venue.id));
    const r = await fetch('/api/studio/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ venue: exp, phone: phoneSample }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { url?: string; problems?: string[]; message?: string; error?: string } | null;
    if (r?.ok && j?.url) { setShare({ state: 'made', url: new URL(j.url, window.location.origin).toString() }); return; }
    setShare({ state: 'refused', lines: j?.problems ?? [j?.message ?? (r?.status === 503 ? 'Share links are not open yet.' : r?.status === 404 ? 'Share links are not switched on.' : 'Could not make a link.')] });
  };

  const run = () => {
    const r = publishVenue(venue, project, mode, phoneSample);
    setOut(r);
    if (r.ok && r.text && r.name) {
      const url = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div className="border-t px-3 py-2 text-[12px]" style={{ borderColor: C.line, background: C.surface2 }} data-testid="publish-panel" role="region" aria-label="Publish">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold uppercase tracking-[0.12em]" style={{ color: C.cyan }}>Publish</span>
        <label className="flex items-center gap-1.5" style={{ color: C.dim }}>
          to
          <select aria-label="Publish to" value={mode} onChange={(e) => { setMode(e.target.value); setOut(null); }} className="rounded border bg-transparent px-1 py-0.5" style={{ borderColor: C.line, color: C.text, background: C.surface }}>
            {modes.map((m) => <option key={m.mode} value={m.mode}>{m.label} · {m.depth === 'full' ? 'the whole venue' : 'its look'}</option>)}
          </select>
        </label>
        <span className="flex items-center gap-1" style={{ color: phoneSample ? C.emerald : C.gold }} data-testid="publish-phone">
          <Smartphone className="h-3.5 w-3.5" aria-hidden />
          {phoneSample ? `phone: ${Math.round(phoneSample.drawCalls)} draws · ${Math.round(phoneSample.textureMb)} MB · ${phoneSample.skinnedBodies} bodies` : 'not measured on Phone'}
        </span>
        {!phoneSample && <button type="button" onClick={onMeasurePhone} className="rounded px-2 py-0.5" style={{ color: C.cyan, background: 'rgba(0,229,255,0.12)' }}>Measure on Phone</button>}
        <button type="button" onClick={run} className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold" style={{ background: C.cyan, color: '#050505' }}>
          <Upload className="h-3.5 w-3.5" aria-hidden /> Check and download
        </button>
        <button type="button" onClick={() => { void makeLink(); }} disabled={share.state === 'making'} className="flex items-center gap-1.5 rounded-md border px-3 py-1" style={{ borderColor: C.line, color: C.text }} data-testid="share-make">
          <Link2 className="h-3.5 w-3.5" aria-hidden /> Make a share link
        </button>
        <button type="button" onClick={onClose} aria-label="Close publish" className="rounded p-1" style={{ color: C.dim }}><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="mt-1" style={{ color: C.dim }}>
        A published venue becomes this mode’s default place for every player (they can restore the original in one tap). It must keep off the court and out of the play camera’s view, fit a phone, and read as clearly as the places the game ships. Characters are never published.
      </p>
      {out && !out.ok && (
        <ul className="mt-2 space-y-1" data-testid="publish-refused" aria-label="Why it cannot be published">
          {out.problems.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5" style={{ color: C.ember }}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {p.message}</li>
          ))}
        </ul>
      )}
      {share.state === 'made' && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5" style={{ color: C.emerald }} data-testid="share-made">
          <Check className="h-3.5 w-3.5" aria-hidden /> Link made — anyone signed in can play it, as practice. It is shown once: <code className="break-all">{share.url}</code>
        </p>
      )}
      {share.state === 'refused' && (
        <ul className="mt-2 space-y-1" data-testid="share-refused">{share.lines.map((l, i) => <li key={i} style={{ color: C.ember }}>{l}</li>)}</ul>
      )}
      {out?.ok && (
        <p className="mt-2 flex items-start gap-1.5" style={{ color: C.emerald }} data-testid="publish-ok">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Passed. Downloaded <b>{out.name}</b> — commit it as <code className="break-all">{out.path}</code> and list it in <code>published/index.ts</code>; the merge publishes it.</span>
        </p>
      )}
    </div>
  );
}
