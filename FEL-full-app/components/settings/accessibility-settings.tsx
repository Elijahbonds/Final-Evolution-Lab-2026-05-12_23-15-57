'use client';
// ACCESSIBILITY — the player's presentation choices in one place (lane/a11y-design, 2026-10-25): motion and flashes
// (unchanged, components/settings/motion-setting.tsx), colour vision for the game HUD (A11-03, lib/a11y/colorVision.ts) and
// the big-screen menus (A11-05, lib/design/couch.ts). Each is read the moment it applies and changes nothing about a game
// but how it looks.
import { useEffect, useState } from 'react';
import { MotionSetting } from './motion-setting';
import { COLOR_VISIONS, onColorVisionChange, readColorVision, writeColorVision, type ColorVision } from '@/lib/a11y/colorVision';
import { COUCH_PREFS, onCouchChange, readCouchPref, writeCouchPref, type CouchPref } from '@/lib/design/couch';
import { t } from '@/lib/i18n';

const VISION_LABEL: Record<ColorVision, string> = {
  off: t('settings.colorVision.off'),
  deuteranopia: t('settings.colorVision.deuteranopia'),
  protanopia: t('settings.colorVision.protanopia'),
  tritanopia: t('settings.colorVision.tritanopia'),
};
const COUCH_LABEL: Record<CouchPref, string> = {
  auto: t('settings.couch.auto'),
  on: t('settings.couch.on'),
  off: t('settings.couch.off'),
};

function Choice<T extends string>({ value, options, label, onPick }: { value: T; options: readonly T[]; label: Record<T, string>; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={o === value}
          className={`min-h-11 rounded-md border px-4 py-2 text-xs font-bold transition-colors ${o === value ? 'border-fel-cyan bg-fel-cyan/15 text-fel-cyan' : 'border-white/15 text-white/70 hover:bg-white/[0.05] hover:text-white'}`}>
          {label[o]}
        </button>
      ))}
    </div>
  );
}

export function ColorVisionSetting() {
  // first paint = the default; the stored choice is read after mount (no hydration mismatch)
  const [v, setV] = useState<ColorVision>('off');
  useEffect(() => { const sync = () => setV(readColorVision()); sync(); return onColorVisionChange(sync); }, []);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="color-vision-heading" data-setting="color-vision">
      <h3 id="color-vision-heading" className="fel-heading mb-1 text-lg font-bold text-white">{t('settings.colorVision.title')}</h3>
      <p className="mb-4 text-xs text-fel-dim">{t('settings.colorVision.body')}</p>
      <Choice value={v} options={COLOR_VISIONS} label={VISION_LABEL} onPick={(n) => { if (n !== v) { writeColorVision(n); setV(n); } }} />
    </section>
  );
}

export function CouchSetting() {
  const [p, setP] = useState<CouchPref>('auto');
  useEffect(() => { const sync = () => setP(readCouchPref()); sync(); return onCouchChange(sync); }, []);
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5" aria-labelledby="couch-heading" data-setting="couch">
      <h3 id="couch-heading" className="fel-heading mb-1 text-lg font-bold text-white">{t('settings.couch.title')}</h3>
      <p className="mb-4 text-xs text-fel-dim">{t('settings.couch.body')}</p>
      <Choice value={p} options={COUCH_PREFS} label={COUCH_LABEL} onPick={(n) => { if (n !== p) { writeCouchPref(n); setP(n); } }} />
    </section>
  );
}

/** The Account page's accessibility block. */
export function AccessibilitySettings() {
  return (
    <div className="space-y-4" data-accessibility-settings>
      <MotionSetting />
      <ColorVisionSetting />
      <CouchSetting />
    </div>
  );
}
