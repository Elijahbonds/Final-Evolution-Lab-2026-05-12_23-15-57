// hoops-gap rig: the static server the driver reads (hoops-p05: committed, because the one before lived in a scratch folder).
//   node serve.mjs <siteDir> [port]      (port default 3695, hoops-p05's row in docs/LANES.md)
// Serves <siteDir> (build.mjs's <tag>.html / <tag>.js) and, for anything not there, the app's public/ (models, textures, audio).
// No cache headers, no directory listing, GET only. Stop it by its own PID (printed), never by name.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../../../public');
const [site, port = '3695'] = process.argv.slice(2);
if (!site) { console.error('usage: node serve.mjs <siteDir> [port]'); process.exit(2); }
const SITE = path.resolve(site);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ktx2': 'image/ktx2', '.env': 'application/octet-stream', '.hdr': 'application/octet-stream', '.css': 'text/css', '.txt': 'text/plain' };
const find = (rel) => { for (const root of [SITE, PUBLIC]) { const f = path.join(root, rel); if (f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return f; } return null; };
http.createServer((req, res) => {
  let rel; try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { rel = '/'; }
  const f = req.method === 'GET' || req.method === 'HEAD' ? find(path.normalize(rel).replace(/^([/\\])+/, '')) : null;
  if (!f) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] ?? 'application/octet-stream', 'content-length': fs.statSync(f).size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(f).pipe(res);
}).listen(Number(port), '127.0.0.1', () => console.log(`hoops-gap site ${SITE} (+ public/) on http://127.0.0.1:${port} pid ${process.pid}`));
