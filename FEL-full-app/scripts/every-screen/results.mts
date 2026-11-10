// EVERY-SCREEN phase 1: what the crawl saves for one screen, and how to read it back. Its own file so the report, the
// dark / lit comparison and the contact sheets can read results without loading the scorer (and its browser).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STATE, type Person } from './rig.mts';
import type { ScreenFacts, Verdict } from '../../lib/every-screen/judge.ts';
import type { Measure } from './inpage.ts';

const label = process.argv.find((a) => a.startsWith('--label='))?.slice(8);
export const ROUTES_DIR = join(STATE, label ?? 'routes');
export type Got = 'page' | 'sign-in' | 'not-found' | 'error' | `to:${string}`;

/** The scorer's version. A screen read by an older version is read again (after the screens never read), so a change to
 *  what the page side measures never leaves old and new numbers mixed in one scorecard. */
export const SCORER = 4;
export const slug = (route: string) => (route === '/' ? 'root' : route.slice(1).replace(/[\/\[\]]+/g, '_').replace(/_+$/, ''));


export interface Result {
  route: string; url: string; file: string; area: string; phase: number; tc: boolean; kind: string;
  audience: string; persona: Person | null; probe: Record<Person, Got>;
  state: 'scored' | 'alias' | 'off' | 'not-scored';
  /** why a screen was not scored, where it redirects, or what switches it off */
  reason?: string;
  final?: { status: number | null; path: string };
  facts?: ScreenFacts; verdict?: Verdict; measure?: Partial<Measure>;
  /** the visible text of the first screen and the whole page, for the dark / lit comparison */
  text?: string;
  load?: { ms: number; webgl: boolean; attempts: number; jsKb: number; longTasks: number; machineLoad?: number | null };
  /** every same-origin link on the screen, and whether they have been fetched yet (checkLinks) */
  hrefs?: { href: string; label: string }[]; linksPending?: boolean;
  /** the GET /api calls the screen made while loading (for the dark / lit comparison) */
  apis?: { url: string; status: number }[];
  /** where the faults are, for finding the shared part they come from */
  detail?: { sizeSamples: { rule: string; text: string; px: number; path: string }[]; hscrollCulprits: Record<string, string[]>; a11y: { rule: string; severity: string; target?: string; detail?: string }[] };
  shot?: string; when: string;
  /** the scorer version that read it (SCORER) */
  v?: number;
}


export function readResults(dir = ROUTES_DIR): Result[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Result).sort((a, b) => a.route.localeCompare(b.route));
}

