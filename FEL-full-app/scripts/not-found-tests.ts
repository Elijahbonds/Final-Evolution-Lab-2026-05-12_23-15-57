#!/usr/bin/env -S npx tsx
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/not-found.tsx'), 'utf8');

assert.match(source, /data-testid="fel-not-found"/, '404 page must expose a stable smoke-test hook');
assert.match(source, /href:\s*'\/try'/, '404 page must recover guests into a playable no-account session');
assert.match(source, /href:\s*'\/play'/, '404 page must recover signed-in players to the game shelf');
assert.match(source, /href:\s*'\/support'/, '404 page must offer a way to report stale links');
assert.doesNotMatch(source, /getServerSession|redirect\(/, '404 recovery must stay public and never auth-loop a stale link');

console.log('not-found-tests: branded stale-link recovery points to try, play, and support');
