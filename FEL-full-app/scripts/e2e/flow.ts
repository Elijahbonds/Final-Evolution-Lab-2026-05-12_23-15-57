// What a key-flow test is, and how the runner treats one that fails (QG-01, quality-gates lane, 2026-10-25).
//
// A flow drives a real page through what a person does (fill, tap, wait) and asserts what they would see and what the
// page sent. It FAILS on a page error (an uncaught exception), on a request that tried to leave the rig, and on any
// assertion. Retries and the quarantine are the runner's (scripts/e2e/run.ts), not the flow's.
import type { Browser, Page } from 'playwright-core';
import { join } from 'node:path';
import { Session, type SessionOptions } from './rig';

export interface FlowContext {
  browser: Browser;
  /** where this attempt writes its screenshots */
  out: string;
  session(o: SessionOptions): Session;
  shot(page: Page, name: string): Promise<string>;
  log(line: string): void;
}

export interface Flow {
  /** stable id: the quarantine list and the report name flows by it */
  name: string;
  /** one line, plain language: what a person does */
  title: string;
  timeoutMs?: number;
  run(ctx: FlowContext): Promise<void>;
}

export function makeContext(browser: Browser, out: string, logs: string[], sessions: Session[]): FlowContext {
  return {
    browser, out,
    session(o) { const s = new Session(browser, o); sessions.push(s); return s; },
    async shot(page, name) { const file = join(out, `${name}.png`); await page.screenshot({ path: file, fullPage: false }).catch(() => {}); return file; },
    log(line) { logs.push(line); },
  };
}

/** The checks every flow gets for free, after its own: no page error, nothing tried to leave the rig. */
export function hygiene(sessions: Session[]): string[] {
  const out: string[] = [];
  for (const s of sessions) {
    for (const e of s.errors) out.push(`page error: ${e.split('\n')[0]}`);
    for (const b of s.blocked) out.push(`a request tried to leave the rig: ${b}`);
  }
  return out;
}
