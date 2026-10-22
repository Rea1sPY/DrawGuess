/* تست‌های «حدس نقاشی»:  node tests/run-tests.js  (بدون وابستگی) */
'use strict';
const assert = require('assert');
const path = require('path');
const core = require(path.join(__dirname, '..', 'core.js'));
const { start } = require(path.join(__dirname, '..', 'server.js'));

let pass = 0, fail = 0;
const queue = [];
const test = (name, fn) => queue.push({ name, fn });
const T0 = 1_000_000;
const FAST = { chooseMs: 1000, roundEndMs: 500, drawerGoneMs: 2000, drawTimes: [5, 40, 60] };

function mkRoom(n, opts, cfg) {
  const room = core.createRoom('12345', T0, cfg || FAST);
  const ps = [];
  for (let i = 0; i < n; i++) { const r = core.addPlayer(room, 'بازیکن' + (i + 1), T0); ps.push(r.player); core.setConnected(room, r.player.id, true, T0); }
  if (opts && opts.rounds) core.setSettings(room, ps[0].id, { rounds: opts.rounds });
  return { room, ps };
}
function startDrawing(n, opts) {
  const { room, ps } = mkRoom(n, opts);
  assert.ok(core.startGame(room, ps[0].id, T0).ok);
  const drawer = ps.find((p) => p.id === room.turn.drawerId);
  assert.ok(core.chooseWord(room, drawer.id, 0, T0 + 10).ok);
  return { room, ps, drawer, guessers: ps.filter((p) => p !== drawer), word: room.turn.word };
}

console.log('اتاق و بازیکن‌ها');
test('نام تکراری شماره می‌گیرد و نام خالی رد می‌شود', () => {
  const room = core.createRoom('1', T0);
  const a = core.addPlayer(room, 'علی', T0).player, b = core.addPlayer(room, ' علی ', T0).player;
  assert.strictEqual(a.name, 'علی'); assert.notStrictEqual(b.name, a.name); assert(b.name.startsWith('علی'));
  assert(core.addPlayer(room, '   ', T0).error);
});
test('نام بلند کوتاه و کاراکتر کنترلی پاک می‌شود', () => {
  const room = core.createRoom('1', T0);
  const p = core.addPlayer(room, 'a\u0000b\n' + 'x'.repeat(50), T0).player;
  assert(p.name.length <= 16); assert(!/[\u0000-\u001f]/.test(p.name));
});
test('حداکثر ۱۲ بازیکن', () => {
  const room = core.createRoom('1', T0);
  for (let i = 0; i < 12; i++) assert(core.addPlayer(room, 'p' + i, T0).player);
  assert(core.addPlayer(room, 'extra', T0).error);
});
test('اولین بازیکن میزبان است و با خروج او میزبان منتقل می‌شود', () => {
  const { room, ps } = mkRoom(3);
  assert.strictEqual(room.hostId, ps[0].id);
  core.removePlayer(room, ps[0].id, T0);
  assert.strictEqual(room.hostId, ps[1].id);
});
test('تنظیمات: فقط میزبان، فقط در سالن، مقادیر معتبر', () => {
  const { room, ps } = mkRoom(2);
  assert(core.setSettings(room, ps[1].id, { rounds: 3 }).error);
  assert(core.setSettings(room, ps[0].id, { rounds: 9 }).error);
  assert(core.setSettings(room, ps[0].id, { drawTime: 7 }).error);
  assert(core.setSettings(room, ps[0].id, { categories: [] }).error);
  assert(core.setSettings(room, ps[0].id, { categories: ['nope'] }).error);
  assert(core.setSettings(room, ps[0].id, { rounds: 3, drawTime: 60, categories: ['animals'] }).ok);
  assert.deepStrictEqual(room.settings.categories, ['animals']);
  core.startGame(room, ps[0].id, T0);
  assert(core.setSettings(room, ps[0].id, { rounds: 1 }).error);
});

console.log('شروع بازی و نوبت‌ها');
test('شروع: فقط میزبان و حداقل ۲ بازیکن آنلاین', () => {
  const one = mkRoom(1);
  assert(core.startGame(one.room, one.ps[0].id, T0).error);
  const { room, ps } = mkRoom(3);
  assert(core.startGame(room, ps[1].id, T0).error);
  core.setConnected(room, ps[1].id, false, T0); core.setConnected(room, ps[2].id, false, T0);
  assert(core.startGame(room, ps[0].id, T0).error);
});
test('بعد از شروع: مرحله انتخاب با ۳ گزینه؛ فقط نقاش انتخاب می‌کند', () => {
  const { room, ps } = mkRoom(3);
  assert(core.startGame(room, ps[0].id, T0).ok);
  assert.strictEqual(room.phase, 'choosing'); assert.strictEqual(room.turn.options.length, 3);
  assert.strictEqual(new Set(room.turn.options).size, 3);
  const other = ps.find((p) => p.id !== room.turn.drawerId);
  assert(core.chooseWord(room, other.id, 0, T0).error);
  assert(core.chooseWord(room, room.turn.drawerId, 5, T0).error);
  assert(core.chooseWord(room, room.turn.drawerId, 1, T0).ok); assert.strictEqual(room.phase, 'drawing');
});
test('عدم انتخاب تا پایان مهلت: کلمه خودکار انتخاب می‌شود', () => {
  const { room, ps } = mkRoom(3); core.startGame(room, ps[0].id, T0);
  core.tick(room, T0 + 500); assert.strictEqual(room.phase, 'choosing');
  core.tick(room, T0 + 1001); assert.strictEqual(room.phase, 'drawing'); assert(room.turn.word);
});
test('هر بازیکن در هر دور یک‌بار نقاش می‌شود و پس از آخرین نوبت بازی تمام می‌شود', () => {
  const { room, ps } = mkRoom(3, { rounds: 2 }); core.startGame(room, ps[0].id, T0);
  const drawers = []; let t = T0;
  while (room.phase !== 'gameOver') {
    drawers.push(room.turn.drawerId);
    t += 1100; core.tick(room, t);                       // انتخاب خودکار
    t += 81000; core.tick(room, t);                      // پایان زمان نقاشی (۸۰ ثانیه پیش‌فرض)
    assert.strictEqual(room.phase, 'roundEnd');
    t += 600; core.tick(room, t);
    assert(drawers.length <= 6);
  }
  assert.strictEqual(drawers.length, 6);
  ps.forEach((p) => assert.strictEqual(drawers.filter((d) => d === p.id).length, 2));
  assert.deepStrictEqual(drawers.slice(0, 3).sort(), drawers.slice(3).sort());
});
test('بازی دوباره: فقط میزبان، امتیازها صفر می‌شود', () => {
  const { room, ps } = mkRoom(2, { rounds: 1 }); core.startGame(room, ps[0].id, T0);
  let t = T0; while (room.phase !== 'gameOver') { t += 41000; core.tick(room, t); }
  ps[0].score = 50;
  assert(core.playAgain(room, ps[1].id, t).error);
  assert(core.playAgain(room, ps[0].id, t).ok);
  assert.strictEqual(room.phase, 'lobby'); assert.strictEqual(ps[0].score, 0);
});

console.log('حدس و امتیاز');
test('حدس درست: امتیاز بر اساس زمان باقی‌مانده و پاداش نقاش', () => {
  const { room, drawer, guessers, word } = startDrawing(3);
  const t = room.turn;
  const early = core.guess(room, guessers[0].id, word, t.startedAt + 1000);
  assert(early.correct);
  const late = core.guess(room, guessers[1].id, '  ' + word + ' ', t.endsAt - 1000);
  assert(late.correct || room.phase === 'roundEnd');
  assert(guessers[0].gain > guessers[1].gain, `${guessers[0].gain} > ${guessers[1].gain}`);
  assert(guessers[0].gain <= 400 && guessers[1].gain >= 100);
  assert(drawer.score > 0);
});
test('حدس غلط پیام عادی است و امتیاز نمی‌دهد؛ «نزدیک شدی» فقط برای خود فرد', () => {
  const { room, guessers, word } = startDrawing(3);
  const near = Array.from(word).slice(0, -1).join('') + 'ژ';
  core.guess(room, guessers[0].id, 'کاملا اشتباه', room.turn.startedAt + 100);
  core.guess(room, guessers[0].id, near, room.turn.startedAt + 200);
  // کلمه‌های بلند (۷ حرف به بالا) یک اشتباه تایپی را می‌پذیرند؛ در غیر این صورت امتیازی نیست
  if (core.matches(near, word)) assert(guessers[0].score > 0); else assert.strictEqual(guessers[0].score, 0);
  const v0 = core.viewFor(room, guessers[0].id, T0), v1 = core.viewFor(room, guessers[1].id, T0);
  assert(v0.chat.some((m) => m.k === 'msg' && m.text === 'کاملا اشتباه'));
  assert(v1.chat.some((m) => m.k === 'msg' && m.text === 'کاملا اشتباه'));
  if (!core.matches(near, word) && core.isClose(near, word)) { assert(v0.chat.some((m) => m.k === 'close')); assert(!v1.chat.some((m) => m.k === 'close')); }
});
test('نقاش نمی‌تواند در حین نقاشی پیام بدهد', () => {
  const { room, drawer } = startDrawing(3);
  assert(core.guess(room, drawer.id, 'سلام', T0 + 20).error);
});
test('پیام کسی که حدس زده فقط برای حدس‌زننده‌ها و نقاش دیده می‌شود', () => {
  const { room, drawer, guessers, word } = startDrawing(4);
  core.guess(room, guessers[0].id, word, room.turn.startedAt + 100);
  core.guess(room, guessers[0].id, 'راز-خصوصی', room.turn.startedAt + 200);
  const seen = (p) => core.viewFor(room, p.id, T0).chat.some((m) => m.text === 'راز-خصوصی');
  assert(seen(guessers[0])); assert(seen(drawer)); assert(!seen(guessers[1])); assert(!seen(guessers[2]));
});
test('همه حدس بزنند: نوبت فوراً تمام می‌شود', () => {
  const { room, guessers, word } = startDrawing(3);
  guessers.forEach((g) => core.guess(room, g.id, word, room.turn.startedAt + 500));
  assert.strictEqual(room.phase, 'roundEnd'); assert.strictEqual(room.lastRoundEnd.reason, 'all');
});
test('پایان زمان نقاشی: roundEnd با دلیل time', () => {
  const { room } = startDrawing(3);
  core.tick(room, room.turn.endsAt + 1);
  assert.strictEqual(room.phase, 'roundEnd'); assert.strictEqual(room.lastRoundEnd.reason, 'time');
});
test('یک نفر دوبار نمی‌تواند امتیاز بگیرد', () => {
  const { room, guessers, word } = startDrawing(4);
  core.guess(room, guessers[0].id, word, room.turn.startedAt + 100);
  const s = guessers[0].score;
  core.guess(room, guessers[0].id, word, room.turn.startedAt + 200);
  assert.strictEqual(guessers[0].score, s);
});
test('حدس فارسی با اشکال نگارشی (ی/ک عربی، فاصله، نیم‌فاصله) درست است', () => {
  assert(core.matches('قورمه سبزی', 'قورمه‌سبزی'));
  assert(core.matches('كباب كوبيده', 'کباب کوبیده'));
  assert(core.matches('  سیب ', 'سیب'));
  assert(!core.matches('موز', 'سیب'));
});

console.log('امنیت کلمه مخفی');
test('کلمه در نمای حدس‌زننده‌ها نیست، در نمای نقاش هست', () => {
  const { room, drawer, guessers, word } = startDrawing(4);
  guessers.forEach((g) => assert(!JSON.stringify(core.viewFor(room, g.id, T0)).includes(word), 'نشت کلمه برای حدس‌زننده'));
  assert(JSON.stringify(core.viewFor(room, drawer.id, T0)).includes(word));
});
test('در مرحله انتخاب، گزینه‌ها فقط برای نقاش است', () => {
  const { room, ps } = mkRoom(3); core.startGame(room, ps[0].id, T0);
  const opts = room.turn.options;
  ps.forEach((p) => {
    const s = JSON.stringify(core.viewFor(room, p.id, T0));
    if (p.id === room.turn.drawerId) opts.forEach((o) => assert(s.includes(o)));
    else opts.forEach((o) => assert(!s.includes(o), 'نشت گزینه‌ها'));
  });
});
test('پس از پایان نوبت کلمه برای همه نمایش داده می‌شود', () => {
  const { room, guessers, word } = startDrawing(3);
  core.tick(room, room.turn.endsAt + 1);
  assert(JSON.stringify(core.viewFor(room, guessers[0].id, T0)).includes(word));
});
test('کلمه در پیام «حدس زد» سیستم نیست', () => {
  const { room, guessers, word } = startDrawing(4);
  core.guess(room, guessers[0].id, word, room.turn.startedAt + 100);
  const other = core.viewFor(room, guessers[1].id, T0);
  assert(!JSON.stringify(other).includes(word));
  assert(other.chat.some((m) => m.k === 'ok'));
});
test('راهنما حروف را رفته‌رفته نشان می‌دهد ولی هیچ‌وقت همه را', () => {
  const { room, guessers } = startDrawing(3);
  const t = room.turn; const n = t.mask.filter((m) => m === null).length;
  core.tick(room, t.startedAt + t.drawMs * 0.8);
  const v = core.viewFor(room, guessers[0].id, T0);
  const hidden = v.turn.hint.filter((h) => h === '_').length;
  assert(hidden >= 2); assert(hidden <= n);
  assert.strictEqual(v.turn.hint.length, Array.from(t.word).length);
});

console.log('نقاشی');
const seg = (o) => Object.assign({ id: 's1', c: '#ff0000', w: 8, pts: [[10, 10], [20, 20]] }, o);
test('فقط نقاش در مرحله نقاشی می‌تواند بکشد', () => {
  const { room, drawer, guessers } = startDrawing(3);
  assert(core.addStroke(room, guessers[0].id, seg()).error);
  assert(core.addStroke(room, drawer.id, seg()).ok);
  assert.strictEqual(room.strokes.length, 1);
  const { room: r2, ps } = mkRoom(2); core.startGame(r2, ps[0].id, T0);
  assert(core.addStroke(r2, r2.turn.drawerId, seg()).error);
});
test('داده نقاشی نامعتبر رد می‌شود', () => {
  const { room, drawer } = startDrawing(3);
  [seg({ c: 'red' }), seg({ c: '#12345' }), seg({ w: 0 }), seg({ w: 500 }), seg({ pts: [] }), seg({ pts: [[2000, 5]] }), seg({ pts: [[5, 5, 5]] }), seg({ pts: [['a', 'b']] }), seg({ id: '../x' }), seg({ pts: Array.from({ length: 200 }, () => [1, 1]) }), null, 'x']
    .forEach((bad) => assert(core.addStroke(room, drawer.id, bad).error, JSON.stringify(bad).slice(0, 40)));
  assert.strictEqual(room.strokes.length, 0);
});
test('ادامه همان خط، خط جدید، برگردان و پاک کردن', () => {
  const { room, drawer } = startDrawing(3);
  core.addStroke(room, drawer.id, seg()); core.addStroke(room, drawer.id, seg({ pts: [[30, 30]] }));
  assert.strictEqual(room.strokes.length, 1); assert.strictEqual(room.strokes[0].pts.length, 3);
  core.addStroke(room, drawer.id, seg({ id: 's2' }));
  assert.strictEqual(room.strokes.length, 2);
  core.undoStroke(room, drawer.id); assert.strictEqual(room.strokes.length, 1);
  core.clearCanvas(room, drawer.id); assert.strictEqual(room.strokes.length, 0);
});
test('رویدادهای نقاشی به خود نقاش برگردانده نمی‌شوند (except)', () => {
  const { room, drawer } = startDrawing(3);
  room.outbox.length = 0; core.addStroke(room, drawer.id, seg());
  assert.strictEqual(room.outbox[0].kind, 'seg'); assert.strictEqual(room.outbox[0].except, drawer.id);
});
test('سقف تعداد خط‌ها', () => {
  const { room, drawer } = startDrawing(3);
  let err = null;
  for (let i = 0; i < 450 && !err; i++) err = core.addStroke(room, drawer.id, seg({ id: 'k' + i })).error;
  assert(err); assert(room.strokes.length <= 400);
});
test('نوبت جدید بوم را خالی می‌کند', () => {
  const { room, drawer } = startDrawing(3);
  core.addStroke(room, drawer.id, seg());
  core.tick(room, room.turn.endsAt + 1); core.tick(room, room.turn.nextAt + 1);
  assert.strictEqual(room.strokes.length, 0); assert.strictEqual(room.phase, 'choosing');
});

console.log('قطع شدن ارتباط');
test('نقاش قطع شود: پس از مهلت نوبت تمام می‌شود', () => {
  const { room, drawer } = startDrawing(3);
  core.setConnected(room, drawer.id, false, T0 + 100);
  core.tick(room, T0 + 1000); assert.strictEqual(room.phase, 'drawing');
  core.tick(room, T0 + 2500); assert.strictEqual(room.phase, 'roundEnd'); assert.strictEqual(room.lastRoundEnd.reason, 'drawer-left');
});
test('نقاش در مرحله انتخاب قطع شود: نوبت رد می‌شود', () => {
  const { room, ps } = mkRoom(3); core.startGame(room, ps[0].id, T0);
  const d = room.turn.drawerId; core.setConnected(room, d, false, T0);
  core.tick(room, T0 + 2500);
  assert(room.phase === 'choosing' && room.turn.drawerId !== d);
});
test('اتصال مجدد در مهلت: بازی ادامه دارد', () => {
  const { room, drawer } = startDrawing(3);
  core.setConnected(room, drawer.id, false, T0 + 100); core.setConnected(room, drawer.id, true, T0 + 900);
  core.tick(room, T0 + 3000); assert.strictEqual(room.phase, 'drawing');
});
test('کمتر از ۲ بازیکن مانده: بازی تمام می‌شود', () => {
  const { room, ps } = mkRoom(2); core.startGame(room, ps[0].id, T0);
  core.removePlayer(room, ps[1].id, T0 + 10); core.tick(room, T0 + 20);
  assert.strictEqual(room.phase, 'gameOver');
});

/* ---------- سرور واقعی (HTTP + SSE) ---------- */
function sseClient(base, s) {
  const out = { raw: '', events: [], stop: null };
  const ctrl = new AbortController(); out.stop = () => ctrl.abort();
  out.ready = (async () => {
    const r = await fetch(`${base}/api/events?room=${s.room}&pid=${s.pid}&token=${s.token}`, { signal: ctrl.signal });
    out.status = r.status;
    if (r.status !== 200) return;
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /event: (\w+)/.exec(chunk), data = /data: (.*)/.exec(chunk);
            if (ev && data) { const e = { type: ev[1], data: JSON.parse(data[1]) }; out.events.push(e); if (e.type === 'state') out.view = e.data; if (e.type === 'state' && e.data.phase === 'roundEnd') out.sealed = true; if (!out.sealed) out.raw += chunk; }
          }
        }
      } catch (e) { /* aborted */ }
    })();
  })();
  return out;
}
const post = async (base, p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(25); } return false; }

test('سرور: یک بازی کامل با ۳ بازیکن روی HTTP/SSE و بدون نشت کلمه', async () => {
  const srv = await start(0, { quiet: true, tickMs: 50, cfg: { chooseMs: 800, roundEndMs: 300, drawerGoneMs: 1500, drawTimes: [3, 5, 40] } });
  const base = `http://127.0.0.1:${srv.server.address().port}`;
  try {
    const c = await post(base, '/api/create', { name: 'میزبان' }); assert.strictEqual(c.status, 200); assert(/^\d{5}$/.test(c.json.room));
    const j1 = await post(base, '/api/join', { name: 'نفر دو', room: c.json.room }), j2 = await post(base, '/api/join', { name: 'نفر سه', room: c.json.room });
    assert.strictEqual(j1.status, 200); assert.strictEqual(j2.status, 200);
    const sess = [c.json, j1.json, j2.json];
    const cl = sess.map((s) => sseClient(base, s)); await Promise.all(cl.map((x) => x.ready));
    assert(await until(() => cl.every((x) => x.view && x.view.players.length === 3)));
    const act = (i, type, extra) => post(base, '/api/act', Object.assign({ room: sess[i].room, pid: sess[i].pid, token: sess[i].token, type }, extra));
    assert.strictEqual((await act(0, 'settings', { patch: { rounds: 1, drawTime: 3 } })).status, 200);
    assert.strictEqual((await act(1, 'start')).status, 400);                       // غیرمیزبان
    assert.strictEqual((await act(0, 'start')).status, 200);
    assert(await until(() => cl.every((x) => x.view.phase === 'choosing')));
    const di = cl.findIndex((x) => x.view.turn.drawerId === x.view.you);
    assert((await act(di, 'choose', { idx: 0 })).status === 200);
    assert(await until(() => cl.every((x) => x.view.phase === 'drawing')));
    const word = cl[di].view.turn.word; assert(word);
    const gi = [0, 1, 2].filter((i) => i !== di);
    assert((await act(di, 'seg', { seg: { id: 'a1', c: '#8b5cf6', w: 9, pts: [[100, 100], [300, 300]] } })).status === 200);
    assert(await until(() => cl[gi[0]].events.some((e) => e.type === 'seg')));
    assert(!cl[di].events.some((e) => e.type === 'seg'), 'نقاش نباید خط خودش را پس بگیرد');
    assert((await act(gi[0], 'seg', { seg: { id: 'x', c: '#000000', w: 5, pts: [[1, 1]] } })).status === 400);
    assert((await act(gi[0], 'guess', { text: 'اشتباه' })).status === 200);
    assert((await act(gi[0], 'guess', { text: word })).status === 200);
    assert((await act(gi[1], 'guess', { text: word })).status === 200);
    assert(await until(() => cl.every((x) => x.view.phase === 'roundEnd' || x.view.phase === 'gameOver')));
    gi.forEach((i) => assert(!cl[i].raw.includes(word), 'کلمه قبل از پایان نوبت به حدس‌زننده رسید'));
    assert(await until(() => cl.every((x) => x.view.phase === 'gameOver'), 20000));
    const final = cl[0].view.players; assert(final.some((p) => p.score > 0));
    assert.strictEqual((await act(0, 'again')).status, 200);
    assert(await until(() => cl.every((x) => x.view.phase === 'lobby')));
    cl.forEach((x) => x.stop());
  } finally { await srv.close(); }
});
test('سرور: احراز هویت، ورودی نامعتبر و فایل‌های ایستا', async () => {
  const srv = await start(0, { quiet: true });
  const base = `http://127.0.0.1:${srv.server.address().port}`;
  try {
    const c = (await post(base, '/api/create', { name: 'الف' })).json;
    assert.strictEqual((await post(base, '/api/act', { room: c.room, pid: c.pid, token: 'x'.repeat(32), type: 'start' })).status, 404);
    assert.strictEqual((await post(base, '/api/act', { room: '99999', pid: c.pid, token: c.token, type: 'start' })).status, 404);
    assert.strictEqual((await post(base, '/api/join', { name: 'ب', room: '00000' })).status, 404);
    assert.strictEqual((await post(base, '/api/join', { name: '   ', room: c.room })).status, 400);
    assert.strictEqual((await post(base, '/api/act', { room: c.room, pid: c.pid, token: c.token, type: 'hack' })).status, 400);
    const big = await fetch(base + '/api/create', { method: 'POST', body: 'x'.repeat(100000) }).then((r) => r.status).catch(() => 400);
    assert([400, 413].includes(big));
    const bad = await fetch(base + '/api/create', { method: 'POST', body: '{not json' }); assert.strictEqual(bad.status, 400);
    const home = await fetch(base + '/'); assert.strictEqual(home.status, 200); assert((await home.text()).includes('حدس نقاشی'));
    assert.strictEqual((await fetch(base + '/%2e%2e/server.js')).status === 200, false);
    assert.strictEqual((await fetch(base + '/words.js')).status, 404);              // بانک کلمات فقط سمت سرور
    assert.strictEqual((await fetch(base + '/core.js')).status, 404);
    const ev = await fetch(`${base}/api/events?room=${c.room}&pid=${c.pid}&token=bad`); assert.strictEqual(ev.status, 404);
    const meta = await (await fetch(base + '/api/meta')).json(); assert(meta.categories.length === 49);
    // سازنده در صفحه
    const html = await (await fetch(base + '/')).text(); assert(html.includes('ReaLsPY') && html.includes('MateoHastam'));
    const js = await (await fetch(base + '/app.js')).text(); assert(js.includes('ReaLsPY') && js.includes('@MateoHastam'));
  } finally { await srv.close(); }
});
test('سرور: اتاق رهاشده پاک می‌شود و محدودیت ساخت اتاق', async () => {
  const srv = await start(0, { quiet: true, tickMs: 30, idleMs: 100, maxJoinsPer10Min: 3 });
  const base = `http://127.0.0.1:${srv.server.address().port}`;
  try {
    const c = (await post(base, '/api/create', { name: 'الف' })).json;
    assert(srv.rooms.has(c.room));
    assert(await until(() => !srv.rooms.has(c.room), 3000));
    await post(base, '/api/create', { name: 'x' }); await post(base, '/api/create', { name: 'y' });
    assert.strictEqual((await post(base, '/api/create', { name: 'z' })).status, 429);
  } finally { await srv.close(); }
});

(async () => {
  for (const t of queue) {
    try { await t.fn(); pass++; console.log('  ✓ ' + t.name); } catch (e) { fail++; console.log('  ✗ ' + t.name + '\n      ' + (e && e.message)); }
  }
  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail ? 1 : 0);
})();
