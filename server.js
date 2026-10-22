'use strict';
/*
 * سرور «حدس نقاشی» — فقط با ماژول‌های خود Node (بدون npm install).
 *  - فایل‌های ظاهر بازی از پوشه public سرو می‌شوند.
 *  - ارسال به بازیکن‌ها: SSE (GET /api/events)   - دریافت از بازیکن‌ها: POST /api/act
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./core.js');

const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };
const MAX_ROOMS = 500;
const MAX_BODY = 32 * 1024;

function start(port, options) {
  const opts = Object.assign({ cfg: {}, quiet: false }, options || {});
  const rooms = new Map(); // code → { room, clients: Map(pid → Set(res)) }
  const ipHits = new Map();
  const actHits = new Map();

  const json = (res, status, obj) => {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('json')); } });
      req.on('error', reject);
    });
  }

  function limitIp(req) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
    const now = Date.now();
    const rec = ipHits.get(ip) || { n: 0, t: now };
    if (now - rec.t > 10 * 60 * 1000) { rec.n = 0; rec.t = now; }
    rec.n++; ipHits.set(ip, rec);
    return rec.n <= (opts.maxJoinsPer10Min || 60);
  }
  function limitAct(pid) {
    const sec = Math.floor(Date.now() / 1000);
    const rec = actHits.get(pid) || { s: sec, n: 0 };
    if (rec.s !== sec) { rec.s = sec; rec.n = 0; }
    rec.n++; actHits.set(pid, rec);
    return rec.n <= 60;
  }

  function newCode() {
    for (let i = 0; i < 50; i++) {
      const c = String(crypto.randomInt(10000, 100000));
      if (!rooms.has(c)) return c;
    }
    return null;
  }

  function auth(code, pid, token) {
    const entry = rooms.get(String(code));
    if (!entry) return null;
    const p = core.find(entry.room, String(pid));
    if (!p || typeof token !== 'string' || token.length !== p.token.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(p.token))) return null;
    return { entry, player: p };
  }

  /* ---------- ارسال به کلاینت‌ها ---------- */
  const sse = (res, event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { /* closed */ } };

  function flush(entry) {
    const room = entry.room;
    const out = room.outbox.splice(0);
    out.forEach((o) => {
      entry.clients.forEach((set, pid) => {
        if (o.except && o.except === pid) return;
        set.forEach((res) => {
          if (o.kind === 'seg') sse(res, 'seg', o.seg);
          else if (o.kind === 'undo') sse(res, 'undo', { id: o.id });
          else sse(res, o.kind, {});
        });
      });
    });
    const now = Date.now();
    entry.clients.forEach((set, pid) => {
      if (!set.size) return;
      const view = core.viewFor(room, pid, now);
      set.forEach((res) => sse(res, 'state', view));
    });
  }

  function mutate(entry, fn) {
    const before = entry.room.version;
    const result = fn();
    if (entry.room.version !== before || entry.room.outbox.length) flush(entry);
    return result;
  }

  /* ---------- مسیرها ---------- */
  async function handleApi(req, res, url) {
    const route = url.pathname;
    if (req.method === 'GET' && route === '/api/meta') {
      return json(res, 200, { categories: core.CAT_META, defaultCategories: core.DRAW_CATS, drawTimes: entryCfg().drawTimes, maxRounds: core.LIMITS.maxRounds, maxPlayers: core.LIMITS.maxPlayers });
    }
    if (req.method === 'GET' && route === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });

    if (req.method === 'GET' && route === '/api/check') {
      const a = auth(url.searchParams.get('room'), url.searchParams.get('pid'), url.searchParams.get('token'));
      return json(res, a ? 200 : 404, { ok: !!a });
    }

    if (req.method === 'GET' && route === '/api/events') {
      const a = auth(url.searchParams.get('room'), url.searchParams.get('pid'), url.searchParams.get('token'));
      if (!a) return json(res, 404, { error: 'اتاق یا بازیکن پیدا نشد.' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const { entry, player } = a;
      let set = entry.clients.get(player.id);
      if (!set) { set = new Set(); entry.clients.set(player.id, set); }
      set.add(res);
      mutate(entry, () => core.setConnected(entry.room, player.id, true, Date.now()));
      sse(res, 'state', core.viewFor(entry.room, player.id, Date.now()));
      sse(res, 'strokes', ['drawing', 'roundEnd'].includes(entry.room.phase) ? entry.room.strokes : []);
      const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* closed */ } }, 15000);
      req.on('close', () => {
        clearInterval(hb);
        set.delete(res);
        if (!set.size) { entry.clients.delete(player.id); mutate(entry, () => core.setConnected(entry.room, player.id, false, Date.now())); }
      });
      return undefined;
    }

    if (req.method === 'POST' && (route === '/api/create' || route === '/api/join')) {
      if (!limitIp(req)) return json(res, 429, { error: 'درخواست‌های زیاد؛ کمی بعد دوباره امتحان کنید.' });
      const body = await readBody(req);
      let entry;
      if (route === '/api/create') {
        if (rooms.size >= MAX_ROOMS) return json(res, 503, { error: 'سرور شلوغ است؛ بعداً امتحان کنید.' });
        const code = newCode();
        if (!code) return json(res, 503, { error: 'ساخت اتاق ممکن نشد.' });
        entry = { room: core.createRoom(code, Date.now(), opts.cfg), clients: new Map() };
        rooms.set(code, entry);
      } else {
        entry = rooms.get(String(body.room || '').trim());
        if (!entry) return json(res, 404, { error: 'اتاقی با این کد پیدا نشد.' });
      }
      const r = core.addPlayer(entry.room, body.name, Date.now());
      if (r.error) { if (route === '/api/create') rooms.delete(entry.room.code); return json(res, 400, { error: r.error }); }
      flush(entry);
      return json(res, 200, { room: entry.room.code, pid: r.player.id, token: r.player.token, name: r.player.name });
    }

    if (req.method === 'POST' && route === '/api/act') {
      const body = await readBody(req);
      const a = auth(body.room, body.pid, body.token);
      if (!a) return json(res, 404, { error: 'اتاق یا بازیکن پیدا نشد.' });
      if (!limitAct(a.player.id)) return json(res, 429, { error: 'آهسته‌تر!' });
      const { entry, player } = a, room = entry.room, now = Date.now();
      let r;
      r = mutate(entry, () => {
        switch (body.type) {
          case 'start': return core.startGame(room, player.id, now);
          case 'settings': return core.setSettings(room, player.id, body.patch || {});
          case 'choose': return core.chooseWord(room, player.id, body.idx, now);
          case 'seg': return core.addStroke(room, player.id, body.seg);
          case 'undo': return core.undoStroke(room, player.id);
          case 'clear': return core.clearCanvas(room, player.id);
          case 'guess': return core.guess(room, player.id, body.text, now);
          case 'again': return core.playAgain(room, player.id, now);
          case 'leave': core.removePlayer(room, player.id, now); return { ok: true, left: true };
          default: return { error: 'دستور نامعتبر است.' };
        }
      });
      if (r && r.left) {
        const set = entry.clients.get(player.id);
        if (set) { set.forEach((res) => { try { res.end(); } catch (e) { /* closed */ } }); entry.clients.delete(player.id); }
      }
      return json(res, r && r.error ? 400 : 200, r || { ok: true });
    }
    return json(res, 404, { error: 'مسیر پیدا نشد.' });
  }
  const entryCfg = () => Object.assign({ drawTimes: [40, 60, 80, 100, 120] }, opts.cfg);

  function serveStatic(req, res, url) {
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC, p));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      handleApi(req, res, url).catch((e) => { if (!res.headersSent) json(res, 400, { error: e.message === 'big' ? 'درخواست بزرگ است.' : 'درخواست نامعتبر است.' }); });
    } else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  });

  // زمان‌سنج مرکزی: نوبت‌ها، راهنماها و پاک‌سازی اتاق‌های رهاشده
  const ticker = setInterval(() => {
    const now = Date.now();
    rooms.forEach((entry, code) => {
      mutate(entry, () => core.tick(entry.room, now));
      const idle = now - entry.room.lastActive;
      const anyone = entry.room.players.some((p) => p.connected);
      if ((!anyone && idle > (opts.idleMs || 30 * 60 * 1000)) || idle > 6 * 60 * 60 * 1000) {
        entry.clients.forEach((set) => set.forEach((res) => { try { res.end(); } catch (e) { /* closed */ } }));
        rooms.delete(code);
      }
    });
    if (actHits.size > 5000) actHits.clear();
  }, opts.tickMs || 400);
  ticker.unref();

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      if (!opts.quiet) console.log(`حدس نقاشی روی پورت ${server.address().port} اجرا شد`);
      resolve({ server, rooms, close: () => new Promise((r) => { clearInterval(ticker); rooms.forEach((e) => e.clients.forEach((s) => s.forEach((x) => { try { x.end(); } catch (e2) { /* closed */ } }))); server.close(() => r()); server.closeAllConnections && server.closeAllConnections(); }) });
    });
  });
}

module.exports = { start };
if (require.main === module) start(Number(process.env.PORT) || 3000);
