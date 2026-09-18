#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(TOOLS_DIR, '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const verb = args.find((arg) => !arg.startsWith('-')) ?? 'verify';
let failed = false;

function emit(step, status, message, extra = {}) {
  const record = {
    ts: new Date().toISOString(),
    verb,
    step,
    status,
    message,
    ...extra,
  };
  if (json) {
    console.log(JSON.stringify(record));
  } else {
    console.log(`[${status}] ${step}: ${message}`);
  }
}

function fail(step, message, extra) {
  failed = true;
  emit(step, 'failed', message, extra);
}

function routePath(route, suffix) {
  return join(APP_ROOT, 'app', ...route.replace(/^\//, '').split('/'), suffix);
}

function readManifest() {
  const path = join(APP_ROOT, 'public', 'agent-manifest.json');
  if (!existsSync(path)) {
    fail('manifest', 'public/agent-manifest.json is missing');
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail('manifest', `agent manifest is not valid JSON: ${err.message}`);
    return null;
  }
}

function verifyManifest() {
  const manifest = readManifest();
  if (!manifest) return;

  const modes = Array.isArray(manifest.modes) ? manifest.modes : [];
  if (modes.length === 0) {
    fail('modes', 'agent manifest exposes no modes');
  } else {
    emit('modes', 'ok', `manifest exposes ${modes.length} agent-controllable modes`);
  }

  for (const mode of modes) {
    const route = String(mode.route ?? '');
    if (!route.startsWith('/play/')) {
      fail('route', `mode ${mode.id ?? '(unknown)'} has a non-play route`, { route });
      continue;
    }
    const page = routePath(route, 'page.tsx');
    const loader = routePath(route, '_components/loader.tsx');
    if (!existsSync(page)) {
      fail('route', `mode ${mode.id} route is missing page.tsx`, { route });
    }
    if (!existsSync(loader)) {
      fail('route', `mode ${mode.id} route is missing _components/loader.tsx`, { route });
      continue;
    }
    const loaderSource = readFileSync(loader, 'utf8');
    if (!loaderSource.includes('GameShell')) {
      fail('route', `mode ${mode.id} route does not mount GameShell`, { route });
    }
  }

  const entry = String(manifest.pipeline?.entryPoint ?? '');
  const match = /^node\s+(.+)$/.exec(entry);
  if (!match) {
    fail('pipeline', 'pipeline.entryPoint must be a node command', { entryPoint: entry });
  } else {
    const entryFile = join(APP_ROOT, match[1]);
    if (existsSync(entryFile)) {
      emit('pipeline', 'ok', `pipeline entrypoint exists at ${relative(APP_ROOT, entryFile)}`);
    } else {
      fail('pipeline', 'pipeline entrypoint file is missing', { entryPoint: entry });
    }
  }
}

switch (verb) {
  case 'plan':
    emit('plan', 'ok', 'verify manifest JSON, route files, GameShell wiring, and pipeline entrypoint');
    break;
  case 'verify':
  case 'smoke':
  case 'run':
    verifyManifest();
    break;
  case 'build':
  case 'deploy':
    emit(verb, 'skipped', 'this repository build/deploy is handled by the host CI pipeline');
    break;
  default:
    fail('usage', `unknown verb "${verb}"`, { verbs: ['plan', 'verify', 'smoke', 'run', 'build', 'deploy'] });
}

process.exit(failed ? 1 : 0);
