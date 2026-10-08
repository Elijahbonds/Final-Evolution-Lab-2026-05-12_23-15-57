/**
 * The bridge between the story's scene (AdventureMode's story face) and the page's overlays (Phase B): the dialogue
 * box, the objective line and the pause screen's settings. Framework-free (a tiny observable for React's
 * useSyncExternalStore); the mode PUBLISHES what the box shows, the page sends COMMANDS back (a tap, a hold, a choice,
 * a skip, the Mirror toggle, a rebind). One per page; the mode binds its commands on load and unbinds on dispose.
 */

import type { StoryChoice } from './format';

export interface StoryDialogueSnapshot {
  speaker: string;
  text: string;
  shown: number;
  placeholder: boolean;
  choices: readonly StoryChoice[] | null;
  choiceIndex: number;
  hold01: number;
}

export interface StoryUiSnapshot {
  /** A story is mounted. */
  live: boolean;
  dialogue: StoryDialogueSnapshot | null;
  objective: string | null;
  chapterTitle: string | null;
  placeholderChapter: boolean;
  mirror: boolean;
  /** 'free' once the chapters run out (the hub is free roam). */
  storyMode: 'chapter' | 'free';
}

export interface StoryUiCommands {
  press(): void;
  release(): void;
  choose(i: number): void;
  skip(): void;
  setMirror(on: boolean): void;
  /** The pause screen stored new bindings: the mode reloads them into its mapper. */
  reloadBindings(): void;
}

/** Who is playing, for the save policy (the page reads the closet; the mode stores with it). */
export interface StoryWho { signedIn: boolean; closet?: unknown }

const EMPTY: StoryUiSnapshot = { live: false, dialogue: null, objective: null, chapterTitle: null, placeholderChapter: false, mirror: false, storyMode: 'chapter' };

export class StoryUiBridge {
  private snap: StoryUiSnapshot = EMPTY;
  private key = '';
  private readonly subs = new Set<() => void>();
  private cmds: StoryUiCommands | null = null;
  who: StoryWho = { signedIn: false };

  getSnapshot = (): StoryUiSnapshot => this.snap;
  subscribe = (fn: () => void): (() => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };

  /** The mode publishes; listeners hear only a real change. */
  publish(next: StoryUiSnapshot): void {
    const key = JSON.stringify(next);
    if (key === this.key) return;
    this.key = key;
    this.snap = next;
    for (const fn of [...this.subs]) { try { fn(); } catch { /* a listener's bug is its own */ } }
  }

  bind(c: StoryUiCommands | null): void { this.cmds = c; if (!c) this.publish(EMPTY); }

  get command(): StoryUiCommands {
    const c = this.cmds;
    return {
      press: () => c?.press(), release: () => c?.release(), choose: (i) => c?.choose(i), skip: () => c?.skip(),
      setMirror: (on) => c?.setMirror(on), reloadBindings: () => c?.reloadBindings(),
    };
  }
}

/** The page's one bridge. */
export const storyUi = new StoryUiBridge();
