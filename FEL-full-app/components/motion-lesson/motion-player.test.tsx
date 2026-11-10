// EDU-05 motion lessons, phase B: the player and the preview page, held without a browser (no DOM in this runner: a server
// render and the sources, as components/hoops-cam/coach-shots.test.tsx does). The pixels — 44 px targets, the first
// screen's words and font sizes, the body moving on two bodies — are measured by scripts/probes/motion-lesson/rig.mts.
//   · first paint: the box says it is loading, the controls are there and OFF until the body is ready (never a dead tap on
//     a stage that is not there), and the stage is asked for the whole lesson, as recorded, at full speed;
//   · every control is a real button in the 44 px chip (min-h-11), with its pressed state for a screen reader;
//   · the text is the type scale's label, small and heading only: three sizes (the page's title makes four);
//   · the stage is a new CONSUMER: it spawns through CharacterLibrary, builds through buildPoseClip, plays under the
//     library's clip scope with `ex_ml_` names (the scope's own rule lets them), and edits no rig, solver or clip file;
//   · the preview is dark: the page asks canPreviewMotion, makes no request, and nothing in the app links to it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

const seen: { props: Record<string, unknown> | null } = { props: null };
vi.mock('next/dynamic', () => ({ default: () => function Stage(p: Record<string, unknown>) { seen.props = p; return null; } }));

import { MotionPlayer } from './motion-player';
import { MotionPreview } from './motion-preview';
import { MOTION_COPY } from './copy';
import type { MotionLesson } from '@/lib/motion-lesson/format';
import { loadSample, SAMPLE_LESSONS } from '@/lib/motion-lesson/samples';
import { scopeAllows, scopeForMode, suiteOfClip } from '@/lib/babylon/anim/clipScope';

const ROOT = path.join(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tags = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[0]);
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

describe('the player\'s first paint', () => {
  let lesson: MotionLesson, html: string, asked: Record<string, unknown>;
  beforeAll(async () => {
    lesson = (await loadSample('low-jumps'))!;
    html = renderToStaticMarkup(createElement(MotionPlayer, { lessonId: 'low-jumps', lesson }));
    asked = seen.props!;
  });

  it('says it is loading, in a status line, and shows no badge over an empty box', () => {
    expect(html).toContain('data-motion-state="loading"');
    expect(html).toMatch(new RegExp(`<p[^>]*role="status"[^>]*>${MOTION_COPY.loading}</p>`));
    expect(html).not.toContain('data-motion-badge');
  });

  it('asks the stage for the whole lesson, as recorded, at full speed, playing', () => {
    expect(asked).toMatchObject({ lessonId: 'low-jumps', speed: 1, playing: true, ask: { from: 0, to: lesson.duration, mirror: false } });
    expect(asked.keys).toBe(lesson.keys);
  });

  it('every control is a button in the 44 px chip, off until the body is ready, with its pressed state', () => {
    const buttons = tags(html, /<button[^>]*>/g);
    expect(buttons).toHaveLength(3 + 1 + lesson.phrases.length);   // Pause, Slow, Mirror · All + each phrase
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      expect(b).toMatch(/class="[^"]*\bmin-h-11\b/);
      expect(b).toContain('disabled=""');
      expect(b).toMatch(/aria-pressed="(true|false)"/);
    }
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*data-motion-phrase="all"/);   // the whole lesson is what loops first
    expect(html).toContain(`>${MOTION_COPY.pause}</button>`);
    for (const p of lesson.phrases) expect(html).toContain(`>${p.label}</button>`);
  });

  it('is a do-this screen: under 25 words, in three text sizes (12, 14, 20 px)', () => {
    expect(words(html).length).toBeLessThanOrEqual(25);
    const sizes = new Set(tags(html, /text-\[\d+px\]/g));
    expect([...sizes].sort()).toEqual(['text-[12px]', 'text-[14px]', 'text-[20px]']);
  });

  it('a lesson with one phrase has no loop row; the cue line starts on the lesson\'s title', () => {
    const one = renderToStaticMarkup(createElement(MotionPlayer, { lessonId: 'x', lesson: { ...lesson, phrases: lesson.phrases.slice(0, 1) } }));
    expect(one).not.toContain('data-motion-phrases');
    expect(html).toMatch(new RegExp(`data-motion-cue="place"[^>]*>${lesson.title}<`));
  });
});

describe('the preview', () => {
  it('offers each lesson as a 44 px chip, the first one picked; no player until its file has opened', () => {
    const html = renderToStaticMarkup(createElement(MotionPreview));
    const chips = tags(html, /<button[^>]*data-motion-sample="[^"]*"[^>]*>/g);
    expect(chips).toHaveLength(SAMPLE_LESSONS.length);
    for (const c of chips) expect(c).toMatch(/class="[^"]*\bmin-h-11\b/);
    expect(chips[0]).toContain('aria-pressed="true"');
    expect(chips.slice(1).every((c) => c.includes('aria-pressed="false"'))).toBe(true);
    expect(html).not.toContain('data-motion-player');
  });

  it('is dark: the page asks canPreviewMotion, makes no request and stores nothing; nothing in the app links to it', () => {
    const page = read('app/teach/motion/page.tsx');
    expect(page).toMatch(/canPreviewMotion\(\{ signedIn: true, admin, author \}\)\s*\?\s*<MotionPreview \/>\s*:\s*<p[^>]*data-motion-soon/);
    expect(page).toContain("redirect(loginPath('/teach/motion'))");
    for (const f of ['app/teach/motion/page.tsx', 'components/motion-lesson/motion-preview.tsx', 'components/motion-lesson/motion-player.tsx', 'components/motion-lesson/motion-stage.tsx', 'lib/motion-lesson/samples.ts', 'lib/motion-lesson/playback.ts']) {
      expect(read(f), f).not.toMatch(/\bfetch\(|localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/);
    }
    const links: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
        if (!/\.(tsx?|json)$/.test(e.name) || /\.test\.tsx?$/.test(e.name) || p === 'app/teach/motion/page.tsx') continue;
        if (/['"`]\/teach\/motion/.test(read(p))) links.push(p);   // a link is a quoted path (a comment may name the page)
      }
    };
    for (const d of ['app', 'components', 'lib', 'messages']) if (fs.existsSync(path.join(ROOT, d))) walk(d);
    expect(links).toEqual([]);
  });
});

describe('the stage is a new consumer of the rig, not an edit to it', () => {
  const src = read('components/motion-lesson/motion-stage.tsx');
  it('spawns through CharacterLibrary as the player, builds through buildPoseClip, plays through the body\'s own animator', () => {
    expect(src).toContain("CharacterLibrary.spawn(scene, DEFAULT_HERO_URL, { role: 'player', startClip: 'idle_stand', deferHeroCapture: true })");
    expect(src).toMatch(/buildPoseClip\(scene, hero\.skeleton, name, c\.total, c\.keys, \{ smooth: true, prefilter: 1 \}\)/);
    expect(src).toContain('hero.animator.register(g)');
    expect(src).toContain('hero.animator.play(c.name');
    // no bone is posed, moved or renamed here: the only writes to the body are the animator's
    expect(src).not.toMatch(/rotationQuaternion\s*=|\.bones\[[^\]]*\]\.|setAbsolutePosition|bone\.name\s*=|skeleton\.returnToRest/);
  });

  it('plays under the library\'s clip scope, and the scope\'s own rule lets a lesson\'s clip names through', () => {
    expect(src).toContain("felModeId = 'library'");
    expect(src).toContain('const name = `ex_ml_${++clipSerial}`');
    const scope = scopeForMode('library');
    expect(scope).not.toBeNull();
    expect(suiteOfClip('ex_ml_1')).toBe('exercise');
    expect(scopeAllows(scope, 'ex_ml_1')).toBe(true);
    expect(scopeAllows(scopeForMode('dunk'), 'ex_ml_1')).toBe(false);   // the control: a game mode's bodies cannot play one
  });

  it('the canvas is a keyboard stop in its place (tabindex 0, never Babylon\'s 1), with a focus ring', () => {
    expect(src).toContain('engine.canvasTabIndex = 0;');
    expect(src).toContain('canvas.tabIndex = 0;');
    expect(src).not.toMatch(/tabIndex = [1-9]/);
    expect(src).toMatch(/canvas\.className = '[^']*focus-visible:outline-fel-cyan/);
    expect(src).toContain("canvas.setAttribute('aria-label'");
  });

  it('shows the body only once it is drawn and measured off its bind pose; a parked library stage is released first', () => {
    expect(src).toContain('if (!atBindPose(hero.skeleton))');
    expect(src).toContain("setState('failed')");
    expect(src).toMatch(/async function buildStage[^{]*\{\s*releaseParkedStage\(\);/);
  });
});
