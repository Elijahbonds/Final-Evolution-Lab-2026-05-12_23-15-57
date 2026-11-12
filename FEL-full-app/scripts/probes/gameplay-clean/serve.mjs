// gameplay-clean: the rig's static server — ONE port (the lane's, 3661), a site per HOST NAME, so a before-build and an after-build
// can be measured in the same gate hold without a second port:
//   node serve.mjs <port> 127.0.0.1=<siteDirA> localhost=<siteDirB>      then audit.mjs with HOST=127.0.0.1 or HOST=localhost
// GET / HEAD only (anything else answers 501, as python's http.server did: the audit leaves that out of its error count); symlinks
// are followed (build.mjs links public/ in); no directory listings. Binds 127.0.0.1 and ::1 only.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [PORT, ...MAP] = process.argv.slice(2);
const ROOTS = Object.fromEntries(MAP.map((m) => { const i = m.indexOf('='); return [m.slice(0, i), path.resolve(m.slice(i + 1))]; }));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
const handler = (req, res) => {
  const root = ROOTS[String(req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '')];
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(501); res.end(); return; }
  if (!root) { res.writeHead(404); res.end('no site for this host'); return; }
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, path.normalize(p));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end('File not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
};
http.createServer(handler).listen(Number(PORT), '127.0.0.1', () => console.log(`serving ${JSON.stringify(ROOTS)} on :${PORT}`));
http.createServer(handler).listen(Number(PORT), '::1').on('error', () => { /* no IPv6 loopback: localhost resolves to 127.0.0.1 */ });
