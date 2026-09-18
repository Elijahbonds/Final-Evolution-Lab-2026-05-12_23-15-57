// BootSplash — the console ritual (Shell 03 §1.2): cartridge insert → venue art
// boot with progress → READY gate → 3-2-1 → GO. Doubles as the loading cover
// (no raw spinner anywhere) and renders the error/retry state from the harness.

import React, { useEffect, useState } from 'react';
import type { ModePhase } from '@/lib/babylon';
import { venueThumb } from '@/lib/babylon/ui/venueThumbs';
import { CardSlot } from './card-slot';
import { BASKETBALL_MODE_IDS, COURT_LOCATIONS, readCourtLocation, readyCourtLocations, writeCourtLocation, type CourtLocationId } from '@/lib/babylon/nexus/courtLocations';
import { BALL_SKINS, readBallSkin, readyBallSkins, writeBallSkin, type BallSkinId } from '@/lib/babylon/nexus/ballSkins';
import { readyVenues, readBoardVenue, writeBoardVenue, type BoardDiscipline } from '@/lib/babylon/nexus/boardVenues';
import { readyWeathers, readWeather, writeWeather, WEATHER_FAMILY_OF, type WeatherPick } from '@/lib/babylon/nexus/weather';
import { readyMusicStages, readMusicStage, writeMusicStage, type MusicStageId } from '@/lib/babylon/music/musicStage';
import { skinsFor, readBoardSkin, writeBoardSkin } from '@/lib/babylon/nexus/boardSkins';
import { readyCourses, readCourse, writeCourse } from '@/lib/babylon/core/RaceCourse';
import { readyVehicles, readVehicle, writeVehicle, type RaceKind } from '@/lib/babylon/racing/garage';
import { readyWeapons, readWeapon, writeWeapon } from '@/lib/babylon/combat/arsenal';
import { arenasFor, readCombatArena, writeCombatArena, COMBAT_MODE_IDS, type CombatModeId } from '@/lib/babylon/combat/arenas';
import { tierList, readTier, writeTier, profileFor, type Tier } from '@/lib/babylon/core/Difficulty';
import {
  readySchools, readBlend, writeBlend, blendName, schoolById, blendTraits, STYLE_TRAIT_KEYS,
  type StyleBlend,
} from '@/lib/babylon/combat/schools';

// M37 E12 FIX: venue slugs resolve to PROCEDURAL canvas thumbnails (venueThumbs)
// instead of /img/venues/*.jpg files that 404 on every mode route.
const VENUE_ART: Record<string, { venue: string; sub: string; tint: string }> = {
  dunk: { venue: 'venice-court', sub: 'VENICE BEACH COURT', tint: '#ffb36b' },
  karate: { venue: 'shimogamo-dojo', sub: 'SHIMOGAMO DOJO', tint: '#ff9d5c' },
  football: { venue: 'gridiron', sub: 'THE GRIDIRON', tint: '#9fb7ff' },
  skateboard: { venue: 'skatepark', sub: 'VENICE SKATEPARK', tint: '#ffd75e' },
  snowboard_slalom: { venue: 'mountain-slope', sub: 'MOUNTAIN SLOPE', tint: '#cfe8ff' },
  snowboard: { venue: 'mountain-slope', sub: 'MOUNTAIN SLOPE', tint: '#cfe8ff' },
  surf: { venue: 'surf-break', sub: 'SURF BREAK', tint: '#37b6d9' },
  tennis: { venue: 'tennis-court', sub: 'CENTRE COURT', tint: '#7bd88f' },
  golf: { venue: 'coastal-links', sub: 'COASTAL LINKS', tint: '#8fe0a0' },
  baseball: { venue: 'ballpark', sub: 'THE BALLPARK', tint: '#ffd08a' },
  soccer: { venue: 'fc-stadium', sub: 'FC STADIUM', tint: '#7be0a8' },
  velocitykart: { venue: 'skatepark', sub: 'BOARDWALK LOOP', tint: '#ffb36b' },
  aeroaces: { venue: 'surf-break', sub: 'BAY CIRCUIT', tint: '#22d3ee' },
  default: { venue: 'default', sub: 'FINAL EVOLUTION', tint: '#22d3ee' },
};

/**
 * The fighting modes, split by what they let you choose.
 *
 * WEAPON is for the modes whose fight is a weapon duel; STYLE is for the karate modes, which is what the
 * owner asked for ("for the karate modes allow them to select their fighting style"). Duel gets both: it is
 * the weapon mode, and a school changes how you carry whatever you brought.
 */
const WEAPON_MODES = new Set(['mixedcombat', 'duel']);
const STYLE_MODES = new Set(['karate', 'karate-vs', 'duel', 'showdown', 'mixedcombat']);

/**
 * Modes that face you with an opponent, and therefore offer a DIFFICULTY.
 *
 * Not every mode: a time trial, a routine and a quiz have nobody to be difficult. Offering a tier where
 * nothing reads it is the hollow-picker failure the pickerReach test exists to catch.
 */
const TIER_MODES = new Set(['velocitykart', 'aeroaces', 'football']);
/** WEATHER (docs/SPEC-WEATHER.md): the outdoor modes that read the pick — pickerReach keeps this honest; WEATHER_FAMILY_OF in nexus/weather names the family. */
const WEATHER_MODES = new Set(['golf', 'soccer', 'tennis', 'football']);
// Deliberately SHORT, and it grows as modes are wired rather than ahead of them. The first draft listed
// eighteen — every mode with an opponent — and sixteen of those read nothing, which is the exact hollow
// picker the pickerReach guard exists to catch. Dunk, 1v1, 3v3 and the net sports already have their own
// tiering that works; unifying them onto this ladder is follow-up, and until it happens they are not listed.

/** Which racing mode this splash belongs to, or null. */
const RACE_OF: Record<string, RaceKind> = { velocitykart: 'kart', aeroaces: 'aero' };

/** A course's world, as a venueThumbs palette — so the cover art follows the MAP you picked. */
const RACE_THUMB: Record<string, string> = {
  park: 'skatepark', slope: 'mountain-slope', pitch: 'fc-stadium',
  street: 'venice-court', orbit: 'orbit',
  volcano: 'default', city: 'night-rooftop',   // MAP EXPANSION: the caldera keeps the cover, the skyline takes the rooftop's night
  harbor: 'surf-break',                        // the marina shares the coast's card
};

/** A vehicle's three bars, drawn small enough to sit under a chip. */
function Bars({ bars, tint }: { bars: { speed: number; hold: number; edge: number }; tint: string }) {
  return (
    <span aria-hidden className="flex items-end gap-[2px]" style={{ height: 10 }}>
      {([bars.speed, bars.hold, bars.edge]).map((v, i) => (
        <span key={i} className="inline-block w-[3px] rounded-sm"
          style={{ height: Math.max(2, Math.round(v * 10)), background: tint, opacity: 0.55 + v * 0.45 }} />
      ))}
    </span>
  );
}

export function BootSplash(props: {
  modeId: string;
  title: string;
  phase: ModePhase;
  detail?: number | string;         // countdown number or error message
  onStart: () => void;              // READY tap
  onRetry: () => void;              // error retry
}) {
  // Court locations (docs/SPEC-COURT-LOCATIONS.md): basketball splashes take their art from the player's pick.
  const isCourt = BASKETBALL_MODE_IDS.has(props.modeId);
  const [loc, setLoc] = useState<CourtLocationId>('venice');
  useEffect(() => { if (isCourt) setLoc(readCourtLocation()); }, [isCourt]);
  const art0 = VENUE_ART[props.modeId] ?? VENUE_ART.default;
  // The racing splashes take their art from the picked MAP, the same way the basketball splash takes its art
  // from the picked location — otherwise all four tracks boot behind one cover and the pick reads as cosmetic
  // text. Resolved below `race`, which is declared further down; hoisted here so `v` stays one expression.
  const raceKind = RACE_OF[props.modeId] ?? null;
  const picked = raceKind ? readCourse(raceKind) : null;
  const v = picked
    ? { venue: RACE_THUMB[picked.venue] ?? 'default', sub: picked.name, tint: picked.tint }
    : isCourt && loc !== 'venice'
      ? { venue: COURT_LOCATIONS[loc].thumb, sub: COURT_LOCATIONS[loc].sub, tint: COURT_LOCATIONS[loc].tint }
      : art0;
  const pickLocation = (id: CourtLocationId) => {
    if (id === loc) return;
    writeCourtLocation(id);
    // the venue mounts when the mode loads, so a new pick reloads the route with the pick in the URL
    const u = new URL(window.location.href); u.searchParams.set('location', id); window.location.assign(u.toString());
  };
  // WEATHER (owner, 2026-09-17): a chip beside the setting / item / card picks, on the outdoor modes that read it. It
  // reloads the route like a venue pick, because weather dresses the world at load.
  const wxFamily = WEATHER_MODES.has(props.modeId) ? WEATHER_FAMILY_OF[props.modeId] ?? null : null;
  const [wx, setWx] = useState<WeatherPick>('natural');
  useEffect(() => { if (wxFamily) setWx(readWeather(props.modeId)); }, [wxFamily, props.modeId]);
  const pickWeather = (id: WeatherPick) => {
    if (id === wx) return;
    writeWeather(id);
    const u = new URL(window.location.href); u.searchParams.set('weather', id); window.location.assign(u.toString());
  };
  // The BALL pick lives on THIS screen, beside the map pick — the owner asked for one screen that covers
  // where you are playing and what you are playing with, and a second screen for a cosmetic would be worse
  // than no picker. Unlike the location it needs no reload: the ball is dressed when the mode builds it, and
  // the mode reads the pick then, so remembering it is enough.
  const [ball, setBall] = useState<BallSkinId>('classic');
  useEffect(() => { if (isCourt) setBall(readBallSkin()); }, [isCourt]);
  const pickBall = (id: BallSkinId) => { if (id === ball) return; writeBallSkin(id); setBall(id); };

  // THE BOARD SPORTS pick a venue and a deck on this same screen, beside the court and the ball. One ritual, one place
  // to choose everything — a second setup screen for a cosmetic would be worse than no picker.
  const boardOf: Record<string, BoardDiscipline> = { skateboard: 'skate', snowboard_slalom: 'snow', snowboard: 'snow', bigair: 'snow', surf: 'surf' };
  const disc = boardOf[props.modeId] ?? null;
  const [venue, setVenue] = useState<string>('');
  const [deck, setDeck] = useState<string>('');
  useEffect(() => { if (disc) { setVenue(readBoardVenue(disc).id); setDeck(readBoardSkin(disc).id); } }, [disc]);
  const pickVenue = (id: string) => {
    if (!disc || id === venue) return;
    writeBoardVenue(disc, id);
    // the world is built at load, so a new venue reloads the route with the pick in the URL — same as the court does
    const u = new URL(window.location.href); u.searchParams.set('venue', id); window.location.assign(u.toString());
  };
  const pickDeck = (id: string) => {
    if (!disc || id === deck) return;
    writeBoardSkin(disc, id); setDeck(id);   // the deck is dressed when the rig builds; remembering it is enough
  };

  // MUSIC picks its STAGE here — the Academy is both a tool and a scored mode, so which
  // one you are walking into is chosen on the same screen as everyone else's venue. No
  // reload: the stage is the tab StudioMode opens on, and it reads the pick at mount.
  const isMusic = props.modeId === 'music';
  const [stage, setStage] = useState<MusicStageId>('studio');
  useEffect(() => { if (isMusic) setStage(readMusicStage()); }, [isMusic]);
  const pickStage = (id: MusicStageId) => { if (id === stage) return; writeMusicStage(id); setStage(id); };

  // THE RACING MODES pick a MAP and a VEHICLE on this same screen (2026-09-13, owner: "Different maps,
  // different vehicles, like the start up screen from the dunk mode"). Same ritual, same place, same rules as
  // the court and the board venue: the map reloads (the world is built at mount and cannot be swapped under a
  // running scene) and the vehicle does not (its spec is read when the mode loads).
  const race = raceKind;
  const [map, setMap] = useState<string>('');
  const [ride, setRide] = useState<string>('');
  useEffect(() => { if (race) { setMap(readCourse(race).id); setRide(readVehicle(race).id); } }, [race]);
  const pickMap = (id: string) => {
    if (!race || id === map) return;
    writeCourse(race, id);
    const u = new URL(window.location.href); u.searchParams.set('map', id); window.location.assign(u.toString());
  };
  const pickRide = (id: string) => {
    if (!race || id === ride) return;
    writeVehicle(race, id); setRide(id);
  };

  // THE FIGHT PICKS (2026-09-13). A weapon for the weapon modes, a fighting style — and a blend of two — for
  // the karate ones. Neither reloads: the moveset and the style multipliers are read when the mode loads.
  const isWeaponMode = WEAPON_MODES.has(props.modeId);
  const isStyleMode = STYLE_MODES.has(props.modeId);
  const [weapon, setWeapon] = useState<string>('fists');
  useEffect(() => { if (isWeaponMode) setWeapon(readWeapon().id); }, [isWeaponMode]);
  const pickWeapon = (id: string) => { if (id === weapon) return; writeWeapon(id); setWeapon(id); };

  const [style, setStyle] = useState<StyleBlend>({ primary: 'straight', secondary: 'straight', mix: 0 });
  useEffect(() => { if (isStyleMode) setStyle(readBlend()); }, [isStyleMode]);
  const setBlend = (next: StyleBlend) => { writeBlend(next); setStyle(next); };
  // Tapping a school sets the PRIMARY and keeps the secondary, so a blend survives changing your mind about
  // half of it. Tapping the school that is already primary is how you go back to a pure style.
  const pickSchool = (id: string) => {
    if (id === style.primary) { setBlend({ primary: id, secondary: id, mix: 0 }); return; }
    setBlend({ primary: id, secondary: style.secondary === style.primary ? id : style.secondary, mix: style.mix });
  };

  // THE ARENA (2026-09-18, owner: "an arena/map that has walls to run off of", "3 per mode minimum"). Picked here like the
  // court and the board venue, and like them it RELOADS: the walls, the floor and the sky are built at load.
  const arenaMode = (COMBAT_MODE_IDS as readonly string[]).includes(props.modeId) ? (props.modeId as CombatModeId) : null;
  const [arenaId, setArenaId] = useState<string>('');
  useEffect(() => { if (arenaMode) setArenaId(readCombatArena(arenaMode).id); }, [arenaMode]);
  const pickArena = (id: string) => {
    if (!arenaMode || id === arenaId) return;
    writeCombatArena(arenaMode, id);
    const u = new URL(window.location.href); u.searchParams.set('arena', id); window.location.assign(u.toString());
  };

  // DIFFICULTY (2026-09-13). Phase 0 measured four modes with no tiering at all and four more each inventing
  // their own; this is the one picker, reading the one shared ladder.
  const hasTiers = TIER_MODES.has(props.modeId);
  const [tier, setTier] = useState<Tier>('pro');
  useEffect(() => { if (hasTiers) setTier(readTier()); }, [hasTiers]);
  const pickTier = (t: Tier) => { if (t === tier) return; writeTier(t); setTier(t); };

  const [inserted, setInserted] = useState(false);
  // Procedural venue art generated client-side (no network request, no 404).
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setInserted(true), 60); return () => clearTimeout(t); }, []);
  useEffect(() => {
    try { setArt(venueThumb(v.venue, 960, 540)); } catch { setArt(null); }
  }, [v.venue]);
  const artOk = !!art;

  if (props.phase === 'playing' || props.phase === 'paused' || props.phase === 'ended') return null;

  return (
    <div className="absolute inset-0 z-40 overflow-hidden"
      // SHARED-START-UNSTICK: on READY the whole card is the start button. A press that misses the pill (a thumb on
      // the art, a click in the corner) used to do nothing, and a player reads a card that ignores them as a hang.
      // The pickers are buttons and keep their own clicks; everything else starts on pointer DOWN, so a hold starts too.
      onPointerDown={props.phase === 'ready' ? (e) => {
        if (!e.isPrimary || (e.target as HTMLElement).closest('button, a, input, select, label')) return;
        props.onStart();
      } : undefined}
      style={{ background: '#05060a', fontFamily: 'var(--fel-font-display, ui-monospace)', cursor: props.phase === 'ready' ? 'pointer' : undefined }}>
      {/* cartridge-insert wipe */}
      <div className="absolute inset-0 transition-transform duration-500 ease-out"
        style={{
          transform: inserted ? 'translateY(0)' : 'translateY(-100%)',
          backgroundImage: artOk
            ? `linear-gradient(180deg, rgba(5,6,10,.25), rgba(5,6,10,.92)), url(${art})`
            : `radial-gradient(120% 90% at 50% 0%, ${v.tint}22, rgba(5,6,10,.96) 70%)`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[11px] font-black tracking-[0.4em]" style={{ color: v.tint }}>{v.sub}</p>
        <h1 className="text-4xl font-black tracking-wide text-white drop-shadow-lg">{props.title}</h1>

        {props.phase === 'loading' && (
          <div className="w-56">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="fel-boot-bar h-full rounded-full" style={{ background: v.tint }} />
            </div>
            <p className="mt-2 text-[11px] tracking-widest text-white/60">LOADING ARENA…</p>
          </div>
        )}

        {props.phase === 'ready' && (
          <button
            // Blur after starting. A clicked <button> KEEPS FOCUS, and the
            // browser activates a focused button on SPACE — which is the shoot
            // and charge key in every mode here. So a player who started with a
            // mouse and then pressed space to shoot re-fired START, and
            // ModeHarness reads "playing + START" as PAUSE: the game froze
            // mid-shot, on their very first input, with no way to tell why.
            onClick={(e) => { e.currentTarget.blur(); props.onStart(); }}
            className="fel-cta mt-2 rounded-2xl px-10 py-4 text-lg font-black text-black"
            style={{ background: v.tint, boxShadow: `0 0 34px ${v.tint}66` }}>
            TAP TO START
          </button>
        )}

        {isCourt && (props.phase === 'ready' || props.phase === 'loading') && readyCourtLocations().length > 1 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">LOCATION</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyCourtLocations().map((l) => (
                <button key={l.id} type="button" onClick={() => pickLocation(l.id)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${l.id === loc ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={l.id === loc ? { background: l.tint, borderColor: l.tint } : { borderColor: `${l.tint}88` }}>
                  {l.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {isCourt && (props.phase === 'ready' || props.phase === 'loading') && readyBallSkins().length > 1 && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">BALL</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyBallSkins().map((b) => (
                <button key={b.id} type="button" onClick={() => pickBall(b.id)} title={b.sub}
                  aria-label={`${b.label} — ${b.sub}`} aria-pressed={b.id === ball}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${b.id === ball ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={b.id === ball ? { background: b.tint, borderColor: b.tint } : { borderColor: `${b.tint}88` }}>
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: b.tint2 ? `linear-gradient(135deg, ${b.tint}, ${b.tint2})` : b.tint, boxShadow: `0 0 6px ${b.tint}aa` }} />
                  {b.label}
                </button>
              ))}
            </div>
            <p className="max-w-[22rem] text-[9px] leading-tight tracking-wide text-white/40">{BALL_SKINS[ball].sub}</p>
          </div>
        )}

        {wxFamily && (props.phase === 'ready' || props.phase === 'loading') && readyWeathers(wxFamily).length > 1 && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">WEATHER</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyWeathers(wxFamily).map((w) => (
                <button key={w.id} type="button" onClick={() => pickWeather(w.id)} aria-pressed={w.id === wx}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${w.id === wx ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={w.id === wx ? { background: w.tint, borderColor: w.tint } : { borderColor: `${w.tint}88` }}>
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {disc && (props.phase === 'ready' || props.phase === 'loading') && readyVenues(disc).length > 1 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">VENUE</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyVenues(disc).map((v) => (
                <button key={v.id} type="button" onClick={() => pickVenue(v.id)} title={v.sub}
                  aria-label={`${v.name} — ${v.sub}`} aria-pressed={v.id === venue}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${v.id === venue ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={v.id === venue ? { background: v.palette.accent, borderColor: v.palette.accent } : { borderColor: `${v.palette.accent}88` }}>
                  {v.name}
                </button>
              ))}
            </div>
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {readyVenues(disc).find((v) => v.id === venue)?.sub ?? ''}
            </p>
          </div>
        )}

        {arenaMode && (props.phase === 'ready' || props.phase === 'loading') && arenasFor(arenaMode).length > 1 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">ARENA</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {arenasFor(arenaMode).map((a) => (
                <button key={a.id} type="button" onClick={() => pickArena(a.id)} title={a.sub}
                  aria-label={`${a.name} — ${a.sub}`} aria-pressed={a.id === arenaId}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${a.id === arenaId ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={a.id === arenaId ? { background: a.tint, borderColor: a.tint } : { borderColor: `${a.tint}88` }}>
                  {a.name.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {arenasFor(arenaMode).find((a) => a.id === arenaId)?.sub ?? ''}
            </p>
          </div>
        )}

        {disc && (props.phase === 'ready' || props.phase === 'loading') && skinsFor(disc).length > 1 && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">DECK</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {skinsFor(disc).map((d) => (
                <button key={d.id} type="button" onClick={() => pickDeck(d.id)} title={d.sub}
                  aria-label={`${d.label} — ${d.sub}`} aria-pressed={d.id === deck}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${d.id === deck ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={d.id === deck ? { background: d.tint, borderColor: d.tint } : { borderColor: `${d.tint}88` }}>
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: d.tint2 ? `linear-gradient(135deg, ${d.tint}, ${d.tint2})` : d.tint, boxShadow: `0 0 6px ${d.tint}aa` }} />
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isMusic && (props.phase === 'ready' || props.phase === 'loading') && readyMusicStages().length > 1 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">STAGE</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyMusicStages().map((m) => (
                <button key={m.id} type="button" onClick={() => pickStage(m.id)} title={m.sub}
                  aria-label={`${m.label} — ${m.sub}`} aria-pressed={m.id === stage}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${m.id === stage ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={m.id === stage ? { background: m.tint, borderColor: m.tint } : { borderColor: `${m.tint}88` }}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {readyMusicStages().find((m) => m.id === stage)?.sub ?? ''}
            </p>
          </div>
        )}

        {race && (props.phase === 'ready' || props.phase === 'loading') && readyCourses(race).length > 1 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">MAP</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyCourses(race).map((c) => (
                <button key={c.id} type="button" onClick={() => pickMap(c.id)} title={c.sub}
                  aria-label={`${c.name} — ${c.sub}`} aria-pressed={c.id === map}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${c.id === map ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={c.id === map ? { background: c.tint, borderColor: c.tint } : { borderColor: `${c.tint}88` }}>
                  {c.name}
                </button>
              ))}
            </div>
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {readyCourses(race).find((c) => c.id === map)?.sub ?? ''}
            </p>
          </div>
        )}

        {race && (props.phase === 'ready' || props.phase === 'loading') && readyVehicles(race).length > 1 && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">{race === 'kart' ? 'KART' : 'AIRCRAFT'}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyVehicles(race).map((r) => (
                <button key={r.id} type="button" onClick={() => pickRide(r.id)} title={r.sub}
                  aria-label={`${r.name} — ${r.sub}`} aria-pressed={r.id === ride}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${r.id === ride ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={r.id === ride ? { background: r.tint, borderColor: r.tint } : { borderColor: `${r.tint}88` }}>
                  <Bars bars={r.bars} tint={r.id === ride ? '#000' : r.tint} />
                  {r.name}
                </button>
              ))}
            </div>
            {/* the SUB names the cost. A vehicle pick with no downside is not a choice, so the screen says
                what you are giving up rather than only what you are getting. */}
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {readyVehicles(race).find((r) => r.id === ride)?.sub ?? ''}
            </p>
          </div>
        )}

        {isWeaponMode && (props.phase === 'ready' || props.phase === 'loading') && readyWeapons().length > 1 && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">WEAPON</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readyWeapons().map((w) => (
                <button key={w.id} type="button" onClick={() => pickWeapon(w.id)} title={w.sub}
                  aria-label={`${w.name} — ${w.sub}`} aria-pressed={w.id === weapon}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${w.id === weapon ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={w.id === weapon ? { background: w.tint, borderColor: w.tint } : { borderColor: `${w.tint}88` }}>
                  <Bars bars={{ speed: w.bars.reach, hold: w.bars.speed, edge: w.bars.power }} tint={w.id === weapon ? '#000' : w.tint} />
                  {w.name}
                </button>
              ))}
            </div>
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {readyWeapons().find((w) => w.id === weapon)?.sub ?? ''}
            </p>
          </div>
        )}

        {isStyleMode && (props.phase === 'ready' || props.phase === 'loading') && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">FIGHTING STYLE</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {readySchools().map((sc) => (
                <button key={sc.id} type="button" onClick={() => pickSchool(sc.id)} title={sc.sub}
                  aria-label={`${sc.name} — ${sc.sub}`} aria-pressed={sc.id === style.primary}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${sc.id === style.primary ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={sc.id === style.primary ? { background: sc.tint, borderColor: sc.tint } : { borderColor: `${sc.tint}88` }}>
                  {sc.name}
                </button>
              ))}
            </div>
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {schoolById(style.primary).sub}
            </p>

            {/* THE BLEND. A secondary school and a slider between the two — the owner's "ability to create
                different blends of fighting styles". Safe at every setting by construction: both schools
                spend the same trait budget and a mix is a convex combination, so no blend can exceed it. */}
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[9px] font-black tracking-[0.3em] text-white/35">BLEND WITH</span>
              {readySchools().filter((sc) => sc.id !== style.primary).map((sc) => (
                <button key={sc.id} type="button" aria-pressed={sc.id === style.secondary}
                  onClick={() => setBlend({ primary: style.primary, secondary: sc.id, mix: style.mix > 0 ? style.mix : 0.3 })}
                  className={`rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider transition ${sc.id === style.secondary ? 'text-black' : 'text-white/60 hover:bg-white/10'}`}
                  style={sc.id === style.secondary ? { background: sc.tint, borderColor: sc.tint } : { borderColor: 'rgba(255,255,255,0.18)' }}>
                  {sc.name}
                </button>
              ))}
            </div>

            {style.secondary !== style.primary && (
              <div className="mt-1 flex w-64 flex-col items-center gap-1">
                <input
                  type="range" min={0} max={100} step={1} value={Math.round(style.mix * 100)}
                  aria-label={`Blend balance: ${blendName(style)}`}
                  onChange={(e) => setBlend({ ...style, mix: Number(e.currentTarget.value) / 100 })}
                  className="w-full accent-white"
                />
                <span className="font-mono text-[10px] font-black tracking-wider text-white/80">{blendName(style)}</span>
                {/* the six traits of the blend you are actually going to fight with — the slider is only
                    meaningful if you can see what it does */}
                <div className="flex items-end gap-2">
                  {STYLE_TRAIT_KEYS.map((k) => {
                    const v = blendTraits(style)[k];
                    return (
                      <span key={k} className="flex flex-col items-center gap-0.5">
                        <span className="inline-block w-[6px] rounded-sm"
                          style={{ height: Math.max(2, Math.round(v * 14)), background: v >= 1 ? '#8fe0a0' : '#e0847a', opacity: 0.85 }} />
                        <span className="text-[7px] uppercase tracking-wider text-white/35">{k}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {hasTiers && (props.phase === 'ready' || props.phase === 'loading') && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-[9px] font-black tracking-[0.3em] text-white/45">OPPONENT</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {tierList().map((t) => (
                <button key={t.id} type="button" onClick={() => pickTier(t.id)} title={t.sub}
                  aria-label={`${t.name} — ${t.sub}`} aria-pressed={t.id === tier}
                  className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-wider transition ${t.id === tier ? 'text-black' : 'text-white/80 hover:bg-white/10'}`}
                  style={t.id === tier ? { background: t.tint, borderColor: t.tint } : { borderColor: `${t.tint}88` }}>
                  {t.name}
                </button>
              ))}
            </div>
            {/* the line says what the opponent is LIKE, never "easy" or "hard" — a tier is a different
                opponent, not the same one with a handicap */}
            <p className="max-w-[24rem] text-[9px] leading-tight tracking-wide text-white/40">
              {profileFor(tier).sub}
            </p>
          </div>
        )}

        {/* CARD SLOT (FINISH-RELEASE, 2026-09-15): the creator card beside the setting and the items, on every mode —
            and the button map it carries, so a player can read what every press does before the first one. */}
        {(props.phase === 'ready' || props.phase === 'loading') && <CardSlot modeId={props.modeId} />}

        {props.phase === 'countdown' && (
          <div key={String(props.detail)} className="fel-count text-8xl font-black text-white">
            {props.detail === 0 || props.detail === undefined ? 'GO!' : props.detail}
          </div>
        )}

        {props.phase === 'error' && (
          <div className="max-w-sm space-y-3">
            <p className="text-sm text-rose-300">
              {typeof props.detail === 'string' ? props.detail : 'The arena failed to load.'}
            </p>
            <button onClick={(e) => { e.currentTarget.blur(); props.onRetry(); }}
              className="rounded-2xl bg-white px-8 py-3 font-black text-black">RETRY</button>
          </div>
        )}
      </div>

      <style>{`
        .fel-boot-bar { width: 30%; animation: felboot 1.1s ease-in-out infinite alternate; }
        @keyframes felboot { from { margin-left: 0; width: 30%; } to { margin-left: 70%; width: 30%; } }
        .fel-cta { transition: transform .12s ease; }
        .fel-cta:active { transform: scale(.95); }
        .fel-count { animation: felcount .8s cubic-bezier(.2,1.4,.4,1); }
        @keyframes felcount { from { transform: scale(1.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

/** Eject wipe on quit-to-hub: call, await, then navigate. */
export function ejectTransition(mount: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;background:#05060a;z-index:60;transform:translateY(100%);' +
      'transition:transform .35s cubic-bezier(.4,0,.2,1);';
    mount.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateY(0)'; });
    setTimeout(() => { resolve(); setTimeout(() => el.remove(), 400); }, 360);
  });
}
