// lib/program-ask/table.ts — PROGRAM-ASK (2026-11-02): a built program as readable Markdown tables, so the owner can judge
// the programming on paper (docs/PROGRAM-ASK.md is written from this by scripts/program-ask/sample.ts).
//
// Pure.
import { SLOT_LABEL } from './copy';
import type { BuiltProgram, ProgramItem } from './types';

export function doseText(i: Pick<ProgramItem, 'sets' | 'reps' | 'workSeconds' | 'perSide'>): string {
  if (typeof i.workSeconds === 'number' && i.workSeconds > 0) return `${i.sets} × ${i.workSeconds} s${i.perSide ? ' each side' : ''}`;
  return `${i.sets} × ${i.reps ?? ''}`.trim();
}

const restText = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);

export function programTables(p: BuiltProgram, o: { weeks?: number[]; days?: string[] } = {}): string {
  const out: string[] = [];
  const weeks = p.weeks.filter((w) => !o.weeks || o.weeks.includes(w.n));
  const firstKey = new Set<string>();
  for (const w of weeks) {
    out.push(`### Week ${w.n} · ${w.label}${w.lighter ? ' (lighter)' : ''}${w.checkpoint ? ' · checkpoint after' : ''}`);
    out.push('');
    for (const d of w.days) {
      if (o.days && !o.days.includes(d.key)) continue;
      // after the first week, a day that repeats a template is shown once per week
      const seen = `${w.n}/${d.key}`;
      if (firstKey.has(seen)) continue;
      firstKey.add(seen);
      out.push(`**${d.day} · ${d.title} (${d.key}) · about ${d.minutes} min**`);
      out.push('');
      out.push('| | Exercise | Job | Dose | Rest | Effort | Tempo / note |');
      out.push('|---|---|---|---|---|---|---|');
      out.push(`| | Warm-up: ${d.warmup.map((s) => s.name).join(', ')} | | ${Math.round(d.warmup.reduce((a, s) => a + s.seconds, 0) / 60)} min | | | |`);
      for (const b of d.blocks) for (const i of b.items) {
        out.push(`| ${i.label} | ${i.name} | ${b.kind === 'filler' ? (i.slot === 'mobility' ? 'easy range' : 'finisher') : SLOT_LABEL[i.slot]} | ${doseText(i)} | ${i.restSeconds ? restText(i.restSeconds) : '→ next'} | ${i.effortWords} | ${[i.tempo ? `tempo ${i.tempo}` : null, i.note].filter(Boolean).join(' · ')} |`);
      }
      out.push(`| | Cool-down: ${d.cooldown.map((s) => s.name).join(', ')} | | ${Math.round(d.cooldown.reduce((a, s) => a + s.seconds, 0) / 60)} min | | | |`);
      out.push('');
    }
  }
  return out.join('\n');
}

export function volumeTable(p: BuiltProgram): string {
  const head = `| Group | Range (sets/week) | ${p.weeks.map((w) => `W${w.n}${w.lighter ? '*' : ''}`).join(' | ')} |`;
  const sep = `|---|---|${p.weeks.map(() => '---').join('|')}|`;
  const rows = p.volume.map((v) => `| ${v.group} | ${v.range[0]}–${v.range[1]} | ${v.perWeek.join(' | ')} |`);
  return [head, sep, ...rows, '', '\\* lighter week: fewer sets on purpose.'].join('\n');
}
