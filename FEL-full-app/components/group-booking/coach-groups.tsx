'use client';
// CoachGroups — GROUP-BOOKING (owner, 2026-11-02): the coach's group board. One line per group — people, waitlist, and
// whether it is under the minimum — then, opened: the sessions (tap one for its roster: present / missed, paid in person),
// move gym, open the same slot at another gym, message the group (into each member's existing program thread), and the
// under-6 decision (run / merge / cancel; nothing is automatic). Below: make-up slots with people in them, in-person 1:1s,
// the gyms' addresses (blank until the owner types them), new group, and invite a trainer.
import { useCallback, useEffect, useState } from 'react';
import { SHOP_LOOK as L } from '@/components/shop/look';
import { OpensSoon } from '@/components/shop/opens-soon';
import { COACH_API, postJson } from '@/lib/group-booking/client';
import { errorLine } from '@/lib/group-booking/copy';

interface SessionRow { slotKey: string; label: string; startsAt: string; taken: number }
interface GroupRow {
  id: string; name: string; gymId: string; gymName: string; days: string; time: string; status: string; decision: string | null; trainerName: string;
  people: number; minSeats: number; maxSeats: number; waitlist: number; line: string; notice: { line: string } | null; startLabel: string; endLabel: string; sessions: SessionRow[];
}
interface Board {
  available: boolean; role?: 'owner' | 'trainer'; groups?: GroupRow[]; todo?: string[];
  makeups?: { slotKey: string; gymName: string; label: string; taken: number }[];
  oneOnOne?: { id: string; client: string; trainer: string; gymName: string; startsAt: string; status: string; paid: boolean; priceLabel: string }[];
  gyms?: { id: string; name: string; address: string | null }[];
  trainers?: { id: string; name: string; status: string; invitePath: string | null; bookable: boolean }[];
  form?: { hours: { hour: number; label: string }[]; dayPairs: { id: string; label: string }[]; minSeats: number; maxSeats: number; weeks: number };
  error?: string;
}
interface RosterRow { seatId: string; name: string; status: string; kind: string; group: string; passId: string; passKind: string | null; paid: boolean; priceLabel: string | null }

const input = 'min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#0b0d12] px-3 text-sm text-white';
const small = 'fel-press inline-flex min-h-10 items-center rounded-full border border-white/20 px-3 text-xs font-semibold text-white';
const on = 'bg-white/[0.16]';
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

function Roster({ slotKey, onChange }: { slotKey: string; onChange: (line: string) => void }) {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const load = useCallback(() => {
    fetch(`${COACH_API}?slot=${encodeURIComponent(slotKey)}`).then((r) => r.json()).then((j) => setRows(j.rows ?? [])).catch(() => setRows([]));
  }, [slotKey]);
  useEffect(() => { load(); }, [load]);
  const act = async (body: Record<string, unknown>) => {
    const r = await postJson(fetch, COACH_API, body);
    if (!r || r.status >= 300) onChange(errorLine(r?.json.error));
    load();
  };
  if (rows === null) return <p className={L.lede}>Loading…</p>;
  if (!rows.length) return <p className={L.lede} data-roster-empty>Nobody booked yet.</p>;
  return (
    <ul className={`${L.rows} mt-2`} data-roster={slotKey}>
      {rows.map((r) => (
        <li key={r.seatId}>
          <div className={`${L.row} flex-wrap py-2`} data-seat={r.seatId}>
            <span className="min-w-0">{r.name}<span className="block text-xs text-fel-soft">{r.kind === 'makeup' ? `Make-up · ${r.group}` : r.passKind === 'drop_in' ? 'Drop-in' : r.passKind === 'full' ? 'Full 8 weeks' : 'Package'} · {r.priceLabel}</span></span>
            <span className="flex flex-wrap gap-1">
              <button type="button" className={`${small} ${r.status === 'present' ? on : ''}`} aria-pressed={r.status === 'present'} data-mark="present" onClick={() => { void act({ action: 'mark', seatId: r.seatId, status: r.status === 'present' ? 'booked' : 'present' }); }}>Present</button>
              <button type="button" className={`${small} ${r.status === 'missed' ? on : ''}`} aria-pressed={r.status === 'missed'} data-mark="missed" onClick={() => { void act({ action: 'mark', seatId: r.seatId, status: r.status === 'missed' ? 'booked' : 'missed' }); }}>Missed</button>
              <button type="button" className={`${small} ${r.paid ? on : ''}`} aria-pressed={r.paid} data-paid onClick={() => { void act({ action: 'paid', passId: r.passId, paid: !r.paid }); }}>{r.paid ? 'Paid ✓' : 'Paid in person'}</button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function GroupPanel({ g, gyms, owner, act }: { g: GroupRow; gyms: Board['gyms']; owner: boolean; act: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  return (
    <li className="fel-surface rounded-2xl p-4" data-group={g.id}>
      <button type="button" className="w-full text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <p className={L.cardTitle}>{g.name}</p>
        <p className={L.cardLine}>{g.gymName} · {g.days} · {g.time} · {g.trainerName}{g.status !== 'open' ? ` · ${g.status}` : ''}</p>
        <p className={`${L.cardPrice} pt-1 ${g.people < g.minSeats ? 'text-amber-200' : ''}`} data-group-line>{g.line}</p>
      </button>
      {g.notice && owner ? (
        <div className="mt-3 rounded-xl bg-amber-200/10 p-3" data-cutoff-notice>
          <p className="text-sm text-amber-100">{g.notice.line}</p>
          <div className="mt-2 flex gap-2">
            {(['run', 'merge', 'cancel'] as const).map((d) => <button key={d} type="button" className={small} data-decide={d} onClick={() => { void act({ action: 'decide', groupId: g.id, decision: d }, d === 'run' ? 'It runs.' : d === 'merge' ? 'Marked to merge. Move people with a message.' : 'Group cancelled.'); }}>{d === 'run' ? 'Run it' : d === 'merge' ? 'Merge' : 'Cancel group'}</button>)}
          </div>
        </div>
      ) : null}
      {open ? (
        <div className="mt-3">
          <p className={L.sectionTitle}>Sessions</p>
          <div className={L.chips}>
            {g.sessions.map((s) => <button key={s.slotKey} type="button" data-session={s.slotKey} className={`${L.chip} ${slot === s.slotKey ? L.chipOn : ''}`} onClick={() => setSlot(slot === s.slotKey ? null : s.slotKey)}>{s.label} · {s.taken}/{g.maxSeats}</button>)}
          </div>
          {slot ? <Roster slotKey={slot} onChange={setNote} /> : null}
          {owner && g.status === 'open' ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-fel-soft">Move to gym
                <select className={input} value="" onChange={(e) => { if (e.target.value) void act({ action: 'move_gym', groupId: g.id, gymId: e.target.value }, 'Moved. Tell the group with a message.'); }} data-move-gym>
                  <option value="">Pick a gym</option>
                  {(gyms ?? []).filter((x) => x.id !== g.gymId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-fel-soft">Open this slot at another gym
                <select className={input} value="" onChange={(e) => { if (e.target.value) void act({ action: 'open_at_gym', groupId: g.id, gymId: e.target.value }, 'Opened at that gym too.'); }}>
                  <option value="">Pick a gym</option>
                  {(gyms ?? []).filter((x) => x.id !== g.gymId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            </div>
          ) : null}
          <div className="mt-4">
            <label className="text-xs text-fel-soft" htmlFor={`msg-${g.id}`}>Message the group</label>
            <textarea id={`msg-${g.id}`} className={`${input} min-h-20 py-2`} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
            <button type="button" className={`${small} mt-2`} disabled={!text.trim()} onClick={() => { void act({ action: 'message', groupId: g.id, text }, 'Sent.').then(() => setText('')); }}>Send</button>
          </div>
          {note ? <p className={L.alert} role="alert">{note}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function NewGroup({ form, gyms, act }: { form: NonNullable<Board['form']>; gyms: NonNullable<Board['gyms']>; act: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [gymId, setGymId] = useState(gyms[0]?.id ?? '');
  const [dayPair, setDayPair] = useState(form.dayPairs[0]?.id ?? 'mon_wed');
  const [hour, setHour] = useState(form.hours[0]?.hour ?? 17);
  const [startDate, setStartDate] = useState('');
  return (
    <details className="mt-6" data-new-group>
      <summary className={`${L.sectionTitle} cursor-pointer`}>New group</summary>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Name" />
        <select className={input} value={gymId} onChange={(e) => setGymId(e.target.value)} aria-label="Gym">{gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <select className={input} value={dayPair} onChange={(e) => setDayPair(e.target.value)} aria-label="Days">{form.dayPairs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        <select className={input} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Time">{form.hours.map((h) => <option key={h.hour} value={h.hour}>{h.label}</option>)}</select>
        <label className="text-xs text-fel-soft">Week 1 starts<input type="date" className={input} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
      </div>
      <p className={`${L.cardLine} mt-2`}>{form.weeks} weeks · {form.minSeats}–{form.maxSeats} people</p>
      <button type="button" className={`${small} mt-2`} onClick={() => { void act({ action: 'create_group', name, gymId, dayPair, hour, startDate }, 'Group added.'); }}>Add group</button>
    </details>
  );
}

export function CoachGroups() {
  const [board, setBoard] = useState<Board | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(COACH_API).then(async (r) => setBoard((await r.json().catch(() => ({ available: false }))) as Board)).catch(() => setBoard({ available: false }));
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = useCallback(async (body: Record<string, unknown>, ok: string) => {
    const r = await postJson(fetch, COACH_API, body);
    if (r && r.status < 300) {
      if (typeof r.json.invitePath === 'string') setLink(`${window.location.origin}${r.json.invitePath}`);
      setMsg(body.action === 'message' ? `Sent to ${r.json.sent ?? 0}${r.json.noThread ? `; ${r.json.noThread} have no program thread with you yet` : ''}.` : ok);
    } else setMsg(errorLine(r?.json.error));
    load();
  }, [load]);
  if (board === null) return <p className={L.lede}>Loading…</p>;
  if (board.error === 'not_a_coach') return <p className={L.lede}>Groups are run by the coach and their trainers.</p>;
  if (!board.available) return <OpensSoon />;
  const owner = board.role === 'owner';
  return (
    <section data-coach-groups>
      {(board.todo ?? []).length ? <ul className="mb-4 flex flex-col gap-1" data-owner-todo>{(board.todo ?? []).map((t) => <li key={t} className={L.cardLine}>· {t}</li>)}</ul> : null}
      <ul className="flex flex-col gap-3">
        {(board.groups ?? []).map((g) => <GroupPanel key={g.id} g={g} gyms={board.gyms} owner={owner} act={act} />)}
      </ul>
      {!(board.groups ?? []).length ? <p className={L.lede}>No groups yet.</p> : null}
      {msg ? <p role="status" className={L.alert}>{msg}</p> : null}

      {(board.makeups ?? []).length ? (
        <div className={L.section}>
          <h2 className={L.sectionTitle}>Make-ups</h2>
          {(board.makeups ?? []).map((m) => (
            <details key={m.slotKey} className="mt-2"><summary className={`${L.cardLine} cursor-pointer`}>{m.label} · {m.gymName} · {m.taken}</summary><Roster slotKey={m.slotKey} onChange={setMsg} /></details>
          ))}
        </div>
      ) : null}

      {(board.oneOnOne ?? []).length ? (
        <div className={L.section}>
          <h2 className={L.sectionTitle}>1:1 in person</h2>
          <ul className={L.rows}>
            {(board.oneOnOne ?? []).map((s) => (
              <li key={s.id}><div className={`${L.row} flex-wrap py-2`}>
                <span>{s.client}<span className="block text-xs text-fel-soft">{when(s.startsAt)} · {s.gymName} · {s.trainer} · {s.priceLabel}</span></span>
                <span className="flex gap-1">
                  <button type="button" className={`${small} ${s.status === 'present' ? on : ''}`} onClick={() => { void act({ action: 'mark_1on1', id: s.id, status: s.status === 'present' ? 'booked' : 'present' }, 'Saved.'); }}>Present</button>
                  <button type="button" className={`${small} ${s.status === 'missed' ? on : ''}`} onClick={() => { void act({ action: 'mark_1on1', id: s.id, status: s.status === 'missed' ? 'booked' : 'missed' }, 'Saved.'); }}>Missed</button>
                  <button type="button" className={`${small} ${s.paid ? on : ''}`} onClick={() => { void act({ action: 'paid_1on1', id: s.id, paid: !s.paid }, 'Saved.'); }}>{s.paid ? 'Paid ✓' : 'Paid in person'}</button>
                </span>
              </div></li>
            ))}
          </ul>
        </div>
      ) : null}

      {owner ? (
        <>
          {board.form && board.gyms ? <NewGroup form={board.form} gyms={board.gyms} act={act} /> : null}
          <details className="mt-6" data-gyms>
            <summary className={`${L.sectionTitle} cursor-pointer`}>Gyms</summary>
            {(board.gyms ?? []).map((g) => (
              <label key={g.id} className="mt-2 block text-xs text-fel-soft">{g.name}
                <input className={input} defaultValue={g.address ?? ''} placeholder="Address (shown to people who join)" maxLength={200}
                  onBlur={(e) => { if (e.target.value !== (g.address ?? '')) void act({ action: 'set_address', gymId: g.id, address: e.target.value }, 'Address saved.'); }} />
              </label>
            ))}
          </details>
          <details className="mt-6" data-trainers>
            <summary className={`${L.sectionTitle} cursor-pointer`}>Trainers</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {(board.trainers ?? []).map((t) => <li key={t.id} className={L.cardLine}>{t.name} · {t.status}{t.bookable ? ' · bookable' : ''}</li>)}
            </ul>
            <div className="mt-2 flex gap-2">
              <input className={input} placeholder="Trainer's name" value={invite} onChange={(e) => setInvite(e.target.value)} maxLength={60} aria-label="Trainer's name" />
              <button type="button" className={small} disabled={!invite.trim()} onClick={() => { void act({ action: 'invite_trainer', name: invite }, 'Invite made. Send them the link.').then(() => setInvite('')); }}>Invite</button>
            </div>
            {link ? <p className={`${L.cardLine} mt-2 break-all`} data-invite-link>{link}</p> : null}
          </details>
        </>
      ) : null}
    </section>
  );
}
