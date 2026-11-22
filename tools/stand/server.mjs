// Стенд Гардероба: статика + заглушки таверны (/api/images/upload, /thumbnail, /characters).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const ROOT = HERE;
const EXT = process.env.EXT || path.resolve(HERE, '../..');
const FA = process.env.FA || '/opt/npm-tools/node_modules/@fortawesome/fontawesome-free';
const PORT = Number(process.env.PORT || 8765);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const COLORS = ['#b4526e', '#5a7bb0', '#7a9a6a', '#c08a4a', '#8a6ab0'];

function avatarSvg(name) {
    const n = decodeURIComponent(name || '?').replace(/\.png$/, '');
    const c = COLORS[[...n].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
    const letter = [...n][0] || '?';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${c}"/><circle cx="128" cy="104" r="52" fill="rgba(255,255,255,.35)"/><rect x="48" y="170" width="160" height="90" rx="80" fill="rgba(255,255,255,.35)"/><text x="128" y="122" font-size="60" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-weight="700">${letter}</text></svg>`;
}

function send(res, code, body, type = 'text/plain') {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
}

function file(res, p) {
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, 'nope');
    send(res, 200, fs.readFileSync(p), TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream');
}

let n = 0;
http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    const p = decodeURIComponent(u.pathname);
    if (req.method === 'POST' && p === '/api/images/upload') {
        let body = '';
        req.on('data', (d) => { body += d; });
        req.on('end', () => {
            const j = JSON.parse(body);
            const dir = path.join(ROOT, 'user/images', j.ch_name || 'x');
            fs.mkdirSync(dir, { recursive: true });
            const name = `${j.filename || 'img'}_${++n}.${j.format || 'jpg'}`;
            fs.writeFileSync(path.join(dir, name), Buffer.from(j.image, 'base64'));
            send(res, 200, JSON.stringify({ path: `user/images/${j.ch_name || 'x'}/${name}` }), 'application/json');
        });
        return;
    }
    if (p === '/thumbnail') return send(res, 200, avatarSvg(u.searchParams.get('file')), 'image/svg+xml');
    if (p.startsWith('/characters/')) return send(res, 200, avatarSvg(p.slice(12)), 'image/svg+xml');
    if (p.startsWith('/User Avatars/')) return send(res, 200, avatarSvg(p.slice(14)), 'image/svg+xml');
    if (p === '/' || p === '/index.html') return file(res, path.join(ROOT, 'index.html'));
    if (p.startsWith('/scripts/extensions/third-party/wardrobe/')) return file(res, path.join(EXT, p.slice('/scripts/extensions/third-party/wardrobe/'.length)));
    if (p.startsWith('/fa/')) return file(res, path.join(FA, p.slice(4)));
    return file(res, path.join(ROOT, p));
}).listen(PORT, () => console.log(`stand on http://localhost:${PORT}`));
