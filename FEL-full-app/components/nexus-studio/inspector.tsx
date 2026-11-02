'use client';

// The inspector: the selected object's fields, or — with nothing selected — the venue's: its light (mood), sky and haze,
// ground, dressing, weather and the broadcast camera. Every field is a command (lib/nexus-studio/edits.ts); typing into one
// is a single undo step until it loses focus. §11: with more than one object selected, the group's panel — its make-up and the
// actions that take the whole selection in one step (duplicate, copy, hide, lock, turn, delete, save as a stamp).

import { Copy, Film, Trash2, Clapperboard, ClipboardCopy, Eye, EyeOff, Lock, Unlock, RotateCcw, RotateCw, PackagePlus } from 'lucide-react';
import {
  BACKDROPS, DECAL_KINDS, FIXTURE_ROLES, GROUND_KINDS, INTROS, LIMITS, MOODS, REPLAY_ANGLES,
  type StudioIntro, type StudioMood, type StudioObject, type StudioProject, type StudioReplayAngle, type StudioSky, type StudioVenue, type StudioWeather,
} from '@/lib/nexus-studio/doc';
import { editObject, editVenue } from '@/lib/nexus-studio/edits';
import type { Command, ObjectPatch } from '@/lib/nexus-studio/commands';
import { catalogIdOf, catalogItem } from '@/lib/nexus-studio/catalog';
import { targetOf, PLAYTEST_TARGETS } from '@/lib/nexus-studio/targets';
import { readyWeathers } from '@/lib/babylon/nexus/weather';
import { CastSlotField } from './characters';
import { C, ColorField, NumberField, PanelTitle, Row, Select, TextField, Toggle, ToolButton } from './ui';

const MOOD_LABEL: Record<StudioMood, string> = {
  goldenHour: 'Golden hour', daylight: 'Daylight', dojoWarm: 'Dojo warm', nightGame: 'Night game', alpine: 'Alpine', overcast: 'Overcast', dusk: 'Dusk', indoorArena: 'Indoor arena',
};
const INTRO_LABEL: Record<StudioIntro, string> = { none: 'None', establish: 'Establishing crane', walkIn: 'Crane + walk-in' };
const DEG = 180 / Math.PI;
const DEFAULT_SKY: StudioSky = { top: '#ffb37a', bottom: '#2a0f12', fog: '#4a1e22', sun: '#ffe7b0', ambient: 0.7, fogDensity: 0.004 };

export interface InspectorProps {
  venue: StudioVenue;
  object: StudioObject | null;
  run(cmd: Command): void;
  seal(): void;
  onDelete(id: string): void;
  onDuplicate(id: string): void;
  onPreviewIntro(kind: 'establish' | 'walkIn'): void;
  onPreviewReplay(angle: StudioReplayAngle): void;
  /** Track 3: the project, for the venue's character slot (its characters). */
  project?: StudioProject;
  /** §11: every selected object, when more than one is (the group's panel replaces the object's). */
  group?: readonly StudioObject[];
  groupActions?: GroupActions;
}

/** §11: what the group's panel can do — each one command over the whole selection. */
export interface GroupActions {
  duplicate(): void;
  copy(): void;
  remove(): void;
  flag(key: 'hidden' | 'locked'): void;
  turn(deg: number): void;
  saveStamp(): void;
}

const KIND_NAME: Record<StudioObject['type'], string> = {
  fixture: 'light', crowdStand: 'stand', decal: 'mark', cameraMark: 'camera mark', specProp: 'dressing prop', kitProp: 'kit prop', meshyProp: 'scan',
};

/** Pure: a group's make-up, most first ("4 lights · 2 stands · 1 kit prop"). */
export function groupSummary(objects: readonly StudioObject[]): string {
  const n = new Map<StudioObject['type'], number>();
  for (const o of objects) n.set(o.type, (n.get(o.type) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t, k]) => `${k} ${KIND_NAME[t]}${k === 1 ? '' : 's'}`).join(' · ');
}

export function Inspector(p: InspectorProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4" data-testid="inspector">
      {p.group && p.group.length > 1 && p.groupActions ? <GroupFields objects={p.group} a={p.groupActions} /> : p.object ? <ObjectFields {...p} object={p.object} /> : <VenueFields {...p} />}
    </div>
  );
}

function GroupFields({ objects, a }: { objects: readonly StudioObject[]; a: GroupActions }) {
  const locked = objects.filter((o) => o.locked).length;
  const allHidden = objects.every((o) => o.hidden), allLocked = locked === objects.length;
  return (
    <>
      <PanelTitle right={
        <span className="flex gap-1">
          <ToolButton title="Duplicate the selection" shortcut="Ctrl+D" onClick={a.duplicate}><Copy className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="Copy (paste into any venue)" shortcut="Ctrl+C" onClick={a.copy}><ClipboardCopy className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="Delete the selection" shortcut="Del" onClick={a.remove} disabled={allLocked}><Trash2 className="h-3.5 w-3.5" style={{ color: allLocked ? undefined : C.crimson }} /></ToolButton>
        </span>
      }>{objects.length} objects</PanelTitle>
      <p className="px-3 pb-2 text-[12px]" style={{ color: C.dim }} data-testid="group-summary">{groupSummary(objects)}{locked ? ` · ${locked} locked (they stay put)` : ''}</p>
      <Row label="Move / turn" hint="The gizmo moves, turns and scales the group about its centre; one undo step per drag">
        <span className="flex items-center gap-1">
          <ToolButton title="Turn the group 15° left" onClick={() => a.turn(15)}><RotateCcw className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="Turn the group 15° right" onClick={() => a.turn(-15)}><RotateCw className="h-3.5 w-3.5" /></ToolButton>
          <span className="text-[12px]" style={{ color: C.dim }}>W / E / R drag · arrows nudge</span>
        </span>
      </Row>
      <Row label="Show / lock">
        <span className="flex items-center gap-1">
          <ToolButton title={allHidden ? 'Show all' : 'Hide all (not drawn, not exported)'} shortcut="H" onClick={() => a.flag('hidden')}>{allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</ToolButton>
          <ToolButton title={allLocked ? 'Unlock all' : 'Lock all (no moving or deleting)'} shortcut="L" onClick={() => a.flag('locked')}>{allLocked ? <Lock className="h-3.5 w-3.5" style={{ color: C.gold }} /> : <Unlock className="h-3.5 w-3.5" />}</ToolButton>
        </span>
      </Row>
      <Row label="Stamp" hint="Keep this group in the project as a prefab stamp (the Stamps tab places it again)">
        <ToolButton title="Save selection as stamp" onClick={a.saveStamp}><PackagePlus className="h-3.5 w-3.5" /> <span>Save as stamp</span></ToolButton>
      </Row>
      <p className="px-3 pt-2 text-[12px]" style={{ color: C.dim }}>Ctrl-click or Shift-click to add or drop one; Shift-drag a box in the view to add what it frames.</p>
    </>
  );
}

function ObjectFields({ venue, object: o, run, seal, onDelete, onDuplicate }: InspectorProps & { object: StudioObject }) {
  const set = (patch: ObjectPatch, field: string) => run(editObject(venue, o.id, patch, field));
  const t = o.t;
  const lock = !!o.locked;
  const src = catalogItem(catalogIdOf(o))?.source ?? o.type;
  return (
    <>
      <PanelTitle right={
        <span className="flex gap-1">
          <ToolButton title="Duplicate" shortcut="Ctrl+D" onClick={() => onDuplicate(o.id)}><Copy className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton title="Delete" shortcut="Del" onClick={() => onDelete(o.id)} disabled={lock}><Trash2 className="h-3.5 w-3.5" style={{ color: lock ? undefined : C.crimson }} /></ToolButton>
        </span>
      }>Inspector</PanelTitle>
      <p className="px-3 pb-2 text-[12px]" style={{ color: C.dim }}>{src}{lock ? ' · locked' : ''}</p>
      <Row label="Name"><TextField label="Name" value={o.name} onChange={(v) => set({ name: v.slice(0, LIMITS.name) }, 'name')} onDone={seal} /></Row>
      <Row label="Position">
        <span className="grid grid-cols-3 gap-1">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <NumberField key={axis} label={`Position ${axis}`} value={t.p[i]} step={0.25} disabled={lock}
              onChange={(n) => { const p = [...t.p] as typeof t.p; p[i] = n; set({ t: { ...t, p } }, `position ${axis}`); }} onDone={seal} />
          ))}
        </span>
      </Row>
      <Row label="Turn (°)"><NumberField label="Turn" value={Math.round(t.ry * DEG * 10) / 10} step={15} disabled={lock} onChange={(d) => set({ t: { ...t, ry: d / DEG } }, 'turn')} onDone={seal} /></Row>
      {o.type !== 'crowdStand' && (
        <Row label="Scale"><NumberField label="Scale" value={t.s} step={0.1} min={LIMITS.scaleMin} max={LIMITS.scaleMax} disabled={lock} onChange={(s) => set({ t: { ...t, s: Math.min(LIMITS.scaleMax, Math.max(LIMITS.scaleMin, s)) } }, 'scale')} onDone={seal} /></Row>
      )}
      <div className="mx-3 my-2 border-t" style={{ borderColor: C.line }} />
      {o.type === 'specProp' && (
        <Row label="Colour" hint="Leave off for the prop's own colour">
          <span className="flex items-center gap-2">
            <Toggle label="Own colour" on={!!o.color} disabled={lock} onChange={(on) => set({ color: on ? '#ffd9a0' : undefined }, 'colour')} />
            {o.color && <ColorField label="Colour" value={o.color} disabled={lock} onChange={(c) => set({ color: c }, 'colour')} onDone={seal} />}
          </span>
        </Row>
      )}
      {o.type === 'kitProp' && (
        <>
          <Row label="Model"><code className="text-[12px]" style={{ color: C.dim }}>{o.kit}/{o.model}</code></Row>
          <Row label="Tint" hint="A multiply over the kit's palette (VenueProps)">
            <span className="flex items-center gap-2">
              <Toggle label="Tint" on={!!o.tint} disabled={lock} onChange={(on) => set({ tint: on ? '#63d452' : undefined }, 'tint')} />
              {o.tint && <ColorField label="Tint" value={o.tint} disabled={lock} onChange={(c) => set({ tint: c }, 'tint')} onDone={seal} />}
            </span>
          </Row>
        </>
      )}
      {o.type === 'meshyProp' && <Row label="Scan"><code className="text-[12px]" style={{ color: C.dim }}>/models/meshy/{o.key}.glb</code></Row>}
      {o.type === 'fixture' && (
        <>
          <Row label="Role" hint="FixtureLights: a flood throws a spot, a lamp and a lantern a point light">
            <Select label="Role" value={o.role} disabled={lock} options={FIXTURE_ROLES.map((r) => ({ value: r, label: r === 'flood' ? 'Floodlight' : r === 'lamp' ? 'Lamp' : 'Lantern' }))} onChange={(r) => set({ role: r }, 'role')} />
          </Row>
          <Row label="Light"><ColorField label="Light colour" value={o.color} disabled={lock} onChange={(c) => set({ color: c }, 'light')} onDone={seal} /></Row>
          <Row label="Height (m)"><NumberField label="Height" value={o.height} step={0.5} min={LIMITS.fixtureHeight[0]} max={LIMITS.fixtureHeight[1]} disabled={lock} onChange={(h) => set({ height: h }, 'height')} onDone={seal} /></Row>
          <p className="px-3 pt-1 text-[12px]" style={{ color: C.dim }}>Lights the venue on desktop and TV (FixtureLights); a phone draws the lit head only.</p>
        </>
      )}
      {o.type === 'crowdStand' && (
        <>
          <Row label="Width (m)"><NumberField label="Width" value={o.width} step={1} disabled={lock} onChange={(w) => set({ width: w }, 'width')} onDone={seal} /></Row>
          <Row label="Rows"><NumberField label="Rows" value={o.rows} step={1} min={1} max={12} disabled={lock} onChange={(r) => set({ rows: Math.round(r) }, 'rows')} onDone={seal} /></Row>
          <Row label="Row step (m)">
            <span className="grid grid-cols-2 gap-1">
              <NumberField label="Row depth" value={o.step[0]} step={0.05} disabled={lock} onChange={(d) => set({ step: [d, o.step[1]] }, 'row depth')} onDone={seal} />
              <NumberField label="Row rise" value={o.step[1]} step={0.05} disabled={lock} onChange={(r) => set({ step: [o.step[0], r] }, 'row rise')} onDone={seal} />
            </span>
          </Row>
          <Row label="Posture"><Select label="Posture" value={o.posture} disabled={lock} options={[{ value: 'seated', label: 'Seated' }, { value: 'standing', label: 'Standing' }]} onChange={(v) => set({ posture: v }, 'posture')} /></Row>
          <Row label="Benches"><Toggle label="Benches" on={o.benches} disabled={lock} onChange={(b) => set({ benches: b }, 'benches')} /></Row>
          <Row label="Empty seats"><NumberField label="Empty share" value={o.gaps} step={0.05} min={0} max={0.9} disabled={lock} onChange={(g) => set({ gaps: g }, 'gaps')} onDone={seal} /></Row>
          <p className="px-3 pt-1 text-[12px]" style={{ color: C.dim }}>Fans face the stand's front (the arrow). No seat is laid between the play camera and the play.</p>
        </>
      )}
      {o.type === 'decal' && (
        <Row label="Mark"><Select label="Mark" value={o.kind} disabled={lock} options={DECAL_KINDS.map((k) => ({ value: k, label: k }))} onChange={(k) => set({ kind: k }, 'mark')} /></Row>
      )}
      {o.type === 'cameraMark' && <p className="px-3 text-[12px]" style={{ color: C.dim }}>Where the broadcast intro and the replay angles frame the play. Without one, the mode's own hero spot.</p>}
    </>
  );
}

function VenueFields({ venue: v, run, seal, onPreviewIntro, onPreviewReplay, project }: InspectorProps) {
  const set = (patch: Parameters<typeof editVenue>[1], field: string) => run(editVenue(v, patch, field));
  const target = targetOf(v.base.target);
  const sky = v.sky;
  const setSky = (k: keyof StudioSky, val: string | number) => set({ sky: { ...(sky ?? DEFAULT_SKY), [k]: val } }, `sky ${k}`);
  const weathers = readyWeathers(target?.weatherFamily ?? 'court');
  return (
    <>
      <PanelTitle>Venue</PanelTitle>
      <Row label="Name"><TextField label="Venue name" value={v.name} onChange={(n) => set({ name: n.slice(0, LIMITS.name) }, 'name')} onDone={seal} /></Row>
      <Row label="Plays in" hint="The mode that loads this venue, and the court it is laid over (one undo step to switch)">
        <Select label="Plays in" value={v.base.target} options={Object.values(PLAYTEST_TARGETS).map((t) => ({ value: t.key, label: `${t.label} · ${t.spec}` }))}
          onChange={(k) => {
            const t = targetOf(k); if (!t || k === v.base.target) return;
            // a weather the new mode's family cannot draw falls back to natural (the picker would not offer it)
            const ok = readyWeathers(t.weatherFamily).some((w) => w.id === v.weather);
            set({ base: { spec: t.spec, target: t.key }, ...(ok ? {} : { weather: 'natural' as StudioWeather }) }, 'plays in');
          }} />
      </Row>
      {target?.furniture && <p className="px-3 pb-1 text-[12px]" style={{ color: C.dim }}>{target.label} lays its own field over the {v.base.spec} ground (shown in the view); the floor colours apply under it.</p>}

      {project && (<><PanelTitle>Cast</PanelTitle><CastSlotField project={project} venue={v} run={run} /></>)}

      <PanelTitle>Light &amp; sky</PanelTitle>
      <Row label="Mood" hint="LightRig: the sun, the fill, the grade, the sky dome's glow"><Select label="Mood" value={v.mood} options={MOODS.map((m) => ({ value: m, label: MOOD_LABEL[m] }))} onChange={(m) => set({ mood: m }, 'mood')} /></Row>
      <Row label="Own sky"><Toggle label="Own sky" on={!!sky} onChange={(on) => set({ sky: on ? { ...DEFAULT_SKY } : undefined }, 'sky')} /></Row>
      {sky && (
        <>
          <Row label="Sky top"><ColorField label="Sky top" value={sky.top} onChange={(c) => setSky('top', c)} onDone={seal} /></Row>
          <Row label="Horizon"><ColorField label="Horizon" value={sky.bottom} onChange={(c) => setSky('bottom', c)} onDone={seal} /></Row>
          <Row label="Sun"><ColorField label="Sun" value={sky.sun} onChange={(c) => setSky('sun', c)} onDone={seal} /></Row>
          <Row label="Haze" hint="Atmosphere: the fog's colour"><ColorField label="Haze" value={sky.fog} onChange={(c) => setSky('fog', c)} onDone={seal} /></Row>
          <Row label="Haze density"><NumberField label="Haze density" value={sky.fogDensity ?? 0.004} step={0.001} min={0} max={0.08} onChange={(n) => setSky('fogDensity', n)} onDone={seal} /></Row>
          <Row label="Ambient"><NumberField label="Ambient" value={sky.ambient ?? 0.7} step={0.05} min={0} max={2} onChange={(n) => setSky('ambient', n)} onDone={seal} /></Row>
        </>
      )}
      <Row label="Horizon art"><Select label="Horizon art" value={v.backdrop ?? ''} options={[{ value: '', label: "The court's own" }, ...BACKDROPS.map((b) => ({ value: b, label: b }))]} onChange={(b) => set({ backdrop: (b || undefined) as StudioVenue['backdrop'] }, 'horizon')} /></Row>
      <Row label="Painted sky" hint="No baked photograph: the painted horizon is the sky (a night place)"><Toggle label="Painted sky" on={!!v.paintedSky} onChange={(on) => set({ paintedSky: on ? true : undefined }, 'painted sky')} /></Row>

      <PanelTitle>Ground &amp; dressing</PanelTitle>
      <Row label="Surface"><Select label="Surface" value={v.ground?.kind ?? ''} options={[{ value: '', label: "The court's own" }, ...GROUND_KINDS.map((g) => ({ value: g, label: g }))]} onChange={(k) => set({ ground: { ...v.ground, kind: (k || undefined) as NonNullable<StudioVenue['ground']>['kind'] } }, 'surface')} /></Row>
      <Row label="Floor colour">
        <span className="flex items-center gap-2">
          <Toggle label="Own floor colour" on={!!v.ground?.color} onChange={(on) => set({ ground: { ...v.ground, color: on ? '#2b6cb0' : undefined } }, 'floor colour')} />
          {v.ground?.color && <ColorField label="Floor colour" value={v.ground.color} onChange={(c) => set({ ground: { ...v.ground, color: c } }, 'floor colour')} onDone={seal} />}
        </span>
      </Row>
      <Row label="Line colour">
        <span className="flex items-center gap-2">
          <Toggle label="Own line colour" on={!!v.ground?.line} onChange={(on) => set({ ground: { ...v.ground, line: on ? '#ffffff' : undefined } }, 'line colour')} />
          {v.ground?.line && <ColorField label="Line colour" value={v.ground.line} onChange={(c) => set({ ground: { ...v.ground, line: c } }, 'line colour')} onDone={seal} />}
        </span>
      </Row>
      <Row label="Court dressing" hint="The court's own CC0 set (VenueProps)"><Select label="Court dressing" value={v.baseDressing} options={[{ value: 'keep', label: 'Keep' }, { value: 'none', label: 'Bare' }]} onChange={(d) => set({ baseDressing: d }, 'dressing')} /></Row>
      {!target?.furniture && (
        <Row label="Glossy floor" hint="GlossyFloor: a varnished mirror on a wooden court (desktop/TV), in the viewport and in the mode">
          <Toggle label="Glossy floor" on={v.glossyFloor} onChange={(on) => set({ glossyFloor: on, ...(on && !v.ground?.kind ? { ground: { ...v.ground, kind: 'court' } } : {}) }, 'glossy floor')} />
        </Row>
      )}

      <PanelTitle>Weather</PanelTitle>
      {target?.modeWeather
        ? <p className="px-3 text-[12px]" style={{ color: C.dim }} data-testid="mode-weather">{target.modeWeather}</p>
        : (
          <Row label="Weather" hint="WeatherFx: the look only; the mode's handling never reads it">
            <Select label="Weather" value={v.weather} options={weathers.map((w) => ({ value: w.id as StudioWeather, label: w.name.charAt(0) + w.name.slice(1).toLowerCase() }))} onChange={(w) => set({ weather: w }, 'weather')} />
          </Row>
        )}

      <PanelTitle>Broadcast camera</PanelTitle>
      <Row label="Intro" hint="CameraDirector.establish: a crane over the venue, then the play camera. Skipped by the first press.">
        <span className="flex items-center gap-1">
          <Select label="Intro" value={v.intro} options={INTROS.map((i) => ({ value: i, label: INTRO_LABEL[i] }))} onChange={(i) => set({ intro: i }, 'intro')} />
          <ToolButton title="Preview the intro" disabled={v.intro === 'none'} onClick={() => { if (v.intro !== 'none') onPreviewIntro(v.intro); }}><Clapperboard className="h-3.5 w-3.5" /></ToolButton>
        </span>
      </Row>
      <div className="px-3 pt-1 text-[12px]" style={{ color: C.dim }}>Replay angles (broadcastShots) — tick to keep, click the camera to look through it:</div>
      <ul className="grid grid-cols-2 gap-1 px-3 pt-1">
        {REPLAY_ANGLES.map((a) => {
          const on = v.replayAngles.includes(a);
          return (
            <li key={a} className="flex items-center justify-between rounded-md border px-2 py-1" style={{ borderColor: on ? C.cyan : C.line }}>
              <label className="flex items-center gap-1.5 text-[12px]" style={{ color: on ? C.cyan : C.text }}>
                <input type="checkbox" checked={on} onChange={() => set({ replayAngles: on ? v.replayAngles.filter((x) => x !== a) : [...v.replayAngles, a] }, 'replay angles')} />
                {a}
              </label>
              <button type="button" onClick={() => onPreviewReplay(a)} title={`Look through the ${a} angle`} aria-label={`Preview the ${a} angle`} className="rounded p-0.5 hover:bg-white/5"><Film className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>
            </li>
          );
        })}
      </ul>
      <p className="px-3 pt-2 text-[12px]" style={{ color: C.dim }}>{target?.replays
        ? `${target.label} opens on the intro you pick and replays its big moments through the ticked angles, in this order${v.replayAngles.length ? '' : ' (none ticked: its own cut)'}.`
        : `${target?.label ?? 'This mode'} opens on the intro you pick. It has no replays, so the angles are kept for a mode that does.`}</p>
    </>
  );
}
