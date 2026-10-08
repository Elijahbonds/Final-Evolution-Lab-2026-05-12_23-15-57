// The Mac hair bake's contract (2026-10-07, the hair expansion): scripts/avatar/mpfb/bake-hair.py cannot run here (no
// Blender), so this pins what it reads and writes against the game's side — the guide export-hair.ts writes, the slug
// rule both use, the mesh and material names, the budget it decimates to, the 22-bone armature — so they cannot drift.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HAIR_STYLES } from '../../../closet/wearable-catalog';
import { HAIR_BUDGET } from './renderHair';

const py = readFileSync('scripts/avatar/mpfb/bake-hair.py', 'utf8');
const mts = readFileSync('scripts/avatar/export-hair.ts', 'utf8');
/** export-hair.ts' rule, restated: the test below proves the script carries exactly this. */
const slug = (style: string) => style.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** bake-hair.py's rule, run in JS: every non-alphanumeric → '-', runs collapsed, ends trimmed. */
const pySlug = (style: string) => { let s = [...style.toLowerCase()].map((c) => (/[a-z0-9]/.test(c) ? c : '-')).join(''); while (s.includes('--')) s = s.replace('--', '-'); return s.replace(/^-+|-+$/g, ''); };

describe('the Mac hair bake reads what export-hair writes and writes what a loader would read', () => {
  it('both scripts name every catalog style the same file', () => {
    expect(mts).toContain(".toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')");
    expect(py).toContain("SLUG = ''.join(c if c.isalnum() else '-' for c in STYLE.lower())");
    for (const s of HAIR_STYLES) expect(pySlug(s), s).toBe(slug(s));
    expect(slug('High-Top Fade')).toBe('high-top-fade');
  });
  it('reads the guide where export-hair writes it, and the kit armature (22 bones, nothing else)', () => {
    expect(mts).toContain("join('scripts', 'avatar', 'out', 'hair')");
    expect(py).toContain("os.path.join(APP, 'scripts', 'avatar', 'out', 'hair', f'{SLUG}-{SEX}.obj')");
    expect(py).toContain("fel-kit-{SEX}.glb");
    expect(py).toContain('len(rig.data.bones) != 22');
    expect(py).toMatch(/use_selection=True, export_skins=True/);
  });
  it('writes one HairPack_<slug> mesh with a hair.<slug> material, within the desktop budget', () => {
    expect(py).toContain("NAME = f'HairPack_{SLUG}'");
    expect(py).toContain("MAT = f'hair.{SLUG}'");
    expect(py).toContain("os.path.join(APP, 'public', 'models', 'hair', f'{SLUG}-{SEX}.glb')");
    const tris = Number(/TRIS = int\(flag\('--tris', '(\d+)'\)\)/.exec(py)?.[1]);
    expect(tris).toBeLessThanOrEqual(HAIR_BUDGET.desktop.tris);
  });
  it('says plainly that it is untested, and that nothing loads it yet', () => {
    expect(py).toMatch(/^# UNTESTED/m);
    expect(py).toContain('wired in NOWHERE today');
  });
});
