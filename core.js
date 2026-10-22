'use strict';
/*
 * هسته منطق «حدس نقاشی» — بدون شبکه و بدون DOM؛ فقط وضعیت اتاق و قوانین بازی.
 * سرور (server.js) فقط این توابع را صدا می‌زند و نتیجه را به بازیکنان می‌فرستد.
 * مهم: کلمه مخفی فقط در viewFor برای نقاش (و پس از پایان نوبت برای همه) ساخته می‌شود.
 */
const crypto = require('crypto');
require('./words.js');
const BANK = globalThis.SPY.WORD_BANK;

// دسته‌هایی که برای نقاشی مناسب‌اند (پیش‌فرض اتاق)
const DRAW_CATS = ['animals', 'birds', 'sea', 'insects', 'daily', 'home', 'electronics', 'cars', 'transport',
  'persian-food', 'foreign-food', 'fruits', 'vegetables', 'drinks', 'sweets', 'sports', 'jobs', 'tools', 'school',
  'medical', 'nature', 'weather', 'space', 'clothes', 'toys', 'instruments', 'buildings', 'places', 'fantasy', 'sport-gear']
  .filter((id) => BANK.some((c) => c.id === id));
const CAT_META = BANK.map((c) => ({ id: c.id, name: c.name, icon: c.icon, count: c.words.length }));

const LIMITS = { minPlayers: 2, maxPlayers: 12, maxName: 16, maxChat: 120, chatKeep: 60, maxStrokes: 400, maxPoints: 30000, maxSegPoints: 80, maxRounds: 5 };
const DEFAULT_CFG = { chooseMs: 15000, roundEndMs: 6000, drawerGoneMs: 10000, drawTimes: [40, 60, 80, 100, 120] };
const rnd = (n) => crypto.randomInt(n);

/* ---------- نرمال‌سازی و مقایسه حدس (مثل بازی جاسوس) ---------- */
const MAP = { 'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ك': 'ک', 'ۀ': 'ه', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'آ': 'ا', 'ؤ': 'و' };
function normalize(s) {
  s = String(s == null ? '' : s);
  try { s = s.normalize('NFKC'); } catch (e) { /* ignore */ }
  s = s.replace(/[يىئكۀةأإٱآؤ]/g, (ch) => MAP[ch]);
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function lev(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function matches(guess, word) {
  const a = normalize(guess), b = normalize(word);
  if (!a || !b) return false;
  if (a === b) return true;
  return b.length >= 7 && Math.abs(a.length - b.length) <= 1 && lev(a, b) <= 1;
}
function isClose(guess, word) {
  const a = normalize(guess), b = normalize(word);
  return b.length >= 4 && a.length >= 3 && a !== b && lev(a, b) <= 1;
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const isLetter = (ch) => ch !== ' ' && ch !== '\u200c';
const letterCount = (w) => Array.from(w).filter(isLetter).length;

/* ---------- ساخت اتاق و بازیکن ---------- */
function createRoom(code, now, opts) {
  return {
    code, createdAt: now, lastActive: now, version: 0, hostId: null,
    cfg: Object.assign({}, DEFAULT_CFG, opts || {}),
    settings: { rounds: 2, drawTime: 80, categories: DRAW_CATS.slice() },
    players: [], phase: 'lobby', seq: 0, chat: [], used: new Set(),
    queue: [], turnNo: 0, totalTurns: 0, turn: null, lastRoundEnd: null,
    strokes: [], strokePoints: 0, outbox: [], endedReason: '',
  };
}
const touch = (room) => { room.version++; };
const find = (room, id) => room.players.find((p) => p.id === id);
const present = (room) => room.players.filter((p) => p.connected);

function pushChat(room, msg) {
  room.chat.push(Object.assign({ id: ++room.seq, aud: 'all' }, msg));
  if (room.chat.length > LIMITS.chatKeep) room.chat.splice(0, room.chat.length - LIMITS.chatKeep);
}
const sys = (room, text) => pushChat(room, { k: 'sys', text });

function addPlayer(room, rawName, now) {
  const base = cleanText(rawName, LIMITS.maxName);
  if (!base) return { error: 'نام را وارد کنید.' };
  if (room.players.length >= LIMITS.maxPlayers) return { error: 'اتاق پر است.' };
  let name = base, k = 2;
  while (room.players.some((p) => normalize(p.name) === normalize(name))) name = cleanText(`${base.slice(0, LIMITS.maxName - 3)} ${fa(k++)}`, LIMITS.maxName);
  const p = { id: 'p' + crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(16).toString('hex'), name, score: 0, connected: false, lastSeen: now, guessed: false, gain: 0 };
  room.players.push(p);
  if (!room.hostId) room.hostId = p.id;
  sys(room, `${name} وارد اتاق شد.`);
  room.lastActive = now; touch(room);
  return { player: p };
}

function setConnected(room, pid, on, now) {
  const p = find(room, pid);
  if (!p) return;
  p.lastSeen = now;
  if (p.connected !== on) { p.connected = on; touch(room); }
}

function removePlayer(room, pid, now) {
  const i = room.players.findIndex((p) => p.id === pid);
  if (i < 0) return;
  const [p] = room.players.splice(i, 1);
  sys(room, `${p.name} از اتاق خارج شد.`);
  if (room.hostId === pid) {
    const next = present(room)[0] || room.players[0];
    room.hostId = next ? next.id : null;
    if (next) sys(room, `${next.name} میزبان جدید است.`);
  }
  room.lastActive = now; touch(room);
}

function setSettings(room, pid, patch) {
  if (pid !== room.hostId) return { error: 'فقط میزبان می‌تواند تنظیمات را عوض کند.' };
  if (room.phase !== 'lobby') return { error: 'تنظیمات فقط قبل از شروع قابل تغییر است.' };
  const s = room.settings;
  if (patch && patch.rounds !== undefined) {
    const r = Number(patch.rounds);
    if (!Number.isInteger(r) || r < 1 || r > LIMITS.maxRounds) return { error: 'تعداد دور نامعتبر است.' };
    s.rounds = r;
  }
  if (patch && patch.drawTime !== undefined) {
    const t = Number(patch.drawTime);
    if (!room.cfg.drawTimes.includes(t)) return { error: 'زمان نقاشی نامعتبر است.' };
    s.drawTime = t;
  }
  if (patch && patch.categories !== undefined) {
    if (!Array.isArray(patch.categories)) return { error: 'دسته‌ها نامعتبر است.' };
    const ids = Array.from(new Set(patch.categories.filter((id) => typeof id === 'string' && BANK.some((c) => c.id === id))));
    if (!ids.length) return { error: 'حداقل یک دسته را انتخاب کنید.' };
    s.categories = ids;
  }
  touch(room);
  return { ok: true };
}

/* ---------- شروع بازی و نوبت‌ها ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startGame(room, pid, now) {
  if (pid !== room.hostId) return { error: 'فقط میزبان می‌تواند بازی را شروع کند.' };
  if (room.phase !== 'lobby') return { error: 'بازی قبلاً شروع شده است.' };
  if (present(room).length < LIMITS.minPlayers) return { error: `حداقل ${fa(LIMITS.minPlayers)} بازیکن لازم است.` };
  room.players.forEach((p) => { p.score = 0; p.guessed = false; p.gain = 0; });
  const order = shuffle(present(room).map((p) => p.id));
  room.queue = [];
  for (let r = 1; r <= room.settings.rounds; r++) order.forEach((id) => room.queue.push({ drawerId: id, round: r }));
  room.totalTurns = room.queue.length; room.turnNo = 0; room.used = new Set(); room.turn = null; room.lastRoundEnd = null; room.endedReason = '';
  sys(room, 'بازی شروع شد!');
  room.lastActive = now;
  beginNextTurn(room, now);
  return { ok: true };
}

function pickOptions(room) {
  const cats = BANK.filter((c) => room.settings.categories.includes(c.id));
  let pool = [];
  cats.forEach((c) => c.words.forEach((w) => { if (!room.used.has(w)) pool.push(w); }));
  if (pool.length < 3) { room.used = new Set(); cats.forEach((c) => c.words.forEach((w) => pool.push(w))); }
  const out = [];
  while (out.length < 3 && pool.length) { const i = rnd(pool.length); out.push(pool[i]); pool.splice(i, 1); }
  return out;
}

function beginNextTurn(room, now) {
  while (room.queue.length) {
    const t = room.queue.shift();
    const drawer = find(room, t.drawerId);
    if (!drawer || !drawer.connected) continue;
    room.players.forEach((p) => { p.guessed = false; p.gain = 0; });
    room.turnNo++;
    room.turn = { drawerId: t.drawerId, round: t.round, options: pickOptions(room), word: null, chooseEndsAt: now + room.cfg.chooseMs, startedAt: 0, endsAt: 0, drawMs: room.settings.drawTime * 1000, mask: null, hintsShown: 0, hintFracs: [], correct: 0, nextAt: 0 };
    room.strokes = []; room.strokePoints = 0; room.outbox.push({ kind: 'reset' });
    room.phase = 'choosing';
    touch(room);
    return;
  }
  finishGame(room, now, '');
}

function finishGame(room, now, note) {
  room.phase = 'gameOver'; room.endedReason = note || '';
  room.turn = room.turn || null;
  sys(room, note || 'بازی تمام شد!');
  room.lastActive = now; touch(room);
}

function chooseWord(room, pid, idx, now) {
  if (room.phase !== 'choosing') return { error: 'الان زمان انتخاب کلمه نیست.' };
  if (!room.turn || room.turn.drawerId !== pid) return { error: 'فقط نقاش کلمه را انتخاب می‌کند.' };
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= room.turn.options.length) return { error: 'انتخاب نامعتبر است.' };
  beginDrawing(room, room.turn.options[i], now);
  return { ok: true };
}

function beginDrawing(room, word, now) {
  const t = room.turn;
  t.word = word; room.used.add(word);
  t.startedAt = now; t.endsAt = now + t.drawMs;
  t.mask = Array.from(word).map((ch) => (isLetter(ch) ? null : ch)); // null = هنوز مخفی
  const n = letterCount(word);
  t.hintFracs = n >= 7 ? [0.5, 0.75] : n >= 4 ? [0.6] : [];
  room.phase = 'drawing';
  const d = find(room, t.drawerId);
  sys(room, `${d ? d.name : 'نقاش'} در حال نقاشی است!`);
  touch(room);
}

function endTurn(room, now, reason) {
  const t = room.turn, drawer = find(room, t.drawerId);
  const gains = {};
  room.players.forEach((p) => { if (p.gain) gains[p.id] = p.gain; });
  room.lastRoundEnd = { word: t.word, gains, reason, drawerId: t.drawerId };
  room.phase = 'roundEnd'; t.nextAt = now + room.cfg.roundEndMs;
  const w = `«${t.word}»`;
  if (reason === 'all') sys(room, `همه حدس زدند! کلمه ${w} بود.`);
  else if (reason === 'drawer-left') sys(room, `نقاش خارج شد. کلمه ${w} بود.`);
  else sys(room, `زمان تمام شد! کلمه ${w} بود.`);
  void drawer; touch(room);
}

/* ---------- نقاشی ---------- */
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function validSeg(seg) {
  if (!seg || typeof seg.id !== 'string' || !/^[\w-]{1,16}$/.test(seg.id)) return null;
  if (typeof seg.c !== 'string' || !COLOR_RE.test(seg.c)) return null;
  const w = Number(seg.w);
  if (!(w >= 1 && w <= 80)) return null;
  if (!Array.isArray(seg.pts) || !seg.pts.length || seg.pts.length > LIMITS.maxSegPoints) return null;
  const pts = [];
  for (const p of seg.pts) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]), y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 750) return null;
    pts.push([Math.round(x), Math.round(y)]);
  }
  return { id: seg.id, c: seg.c.toLowerCase(), w: Math.round(w), pts };
}

function drawerCheck(room, pid) {
  if (room.phase !== 'drawing') return 'الان زمان نقاشی نیست.';
  if (!room.turn || room.turn.drawerId !== pid) return 'فقط نقاش می‌تواند نقاشی کند.';
  return '';
}

function addStroke(room, pid, rawSeg) {
  const err = drawerCheck(room, pid);
  if (err) return { error: err };
  const seg = validSeg(rawSeg);
  if (!seg) return { error: 'داده نقاشی نامعتبر است.' };
  const last = room.strokes[room.strokes.length - 1];
  if (last && last.id === seg.id) {
    last.pts.push(...seg.pts);
  } else {
    if (room.strokes.length >= LIMITS.maxStrokes) return { error: 'تعداد خط‌ها به حد مجاز رسید.' };
    room.strokes.push({ id: seg.id, c: seg.c, w: seg.w, pts: seg.pts.slice() });
  }
  room.strokePoints += seg.pts.length;
  if (room.strokePoints > LIMITS.maxPoints) return { error: 'نقاشی بیش از حد بزرگ شد.' };
  room.outbox.push({ kind: 'seg', seg, except: pid });
  return { ok: true };
}
function undoStroke(room, pid) {
  const err = drawerCheck(room, pid);
  if (err) return { error: err };
  const s = room.strokes.pop();
  if (s) { room.strokePoints -= s.pts.length; room.outbox.push({ kind: 'undo', id: s.id, except: pid }); }
  return { ok: true };
}
function clearCanvas(room, pid) {
  const err = drawerCheck(room, pid);
  if (err) return { error: err };
  room.strokes = []; room.strokePoints = 0;
  room.outbox.push({ kind: 'clear', except: pid });
  return { ok: true };
}

/* ---------- حدس و گفتگو ---------- */
function guess(room, pid, rawText, now) {
  const p = find(room, pid);
  if (!p) return { error: 'بازیکن پیدا نشد.' };
  const text = cleanText(rawText, LIMITS.maxChat);
  if (!text) return { error: 'پیام خالی است.' };
  room.lastActive = now;
  const t = room.turn;
  if (room.phase !== 'drawing') { pushChat(room, { k: 'msg', pid, name: p.name, text }); touch(room); return { ok: true }; }
  if (t.drawerId === pid) return { error: 'نقاش در حین نقاشی نمی‌تواند پیام بدهد.' };
  if (p.guessed) { pushChat(room, { k: 'msg', pid, name: p.name, text, aud: 'g' }); touch(room); return { ok: true }; }
  if (matches(text, t.word)) {
    const frac = Math.max(0, Math.min(1, (t.endsAt - now) / t.drawMs));
    const pts = 100 + Math.round(300 * frac);
    p.guessed = true; p.gain += pts; p.score += pts; t.correct++;
    const d = find(room, t.drawerId);
    if (d) { const bonus = Math.round(pts * 0.4); d.gain += bonus; d.score += bonus; }
    pushChat(room, { k: 'ok', pid, name: p.name, text: `${p.name} کلمه را حدس زد!` });
    touch(room);
    const guessers = room.players.filter((x) => x.connected && x.id !== t.drawerId);
    if (guessers.length && guessers.every((x) => x.guessed)) endTurn(room, now, 'all');
    return { ok: true, correct: true };
  }
  pushChat(room, { k: 'msg', pid, name: p.name, text });
  if (isClose(text, t.word)) pushChat(room, { k: 'close', aud: 'p', to: pid, text: 'نزدیک شدی!' });
  touch(room);
  return { ok: true };
}

/* ---------- زمان ---------- */
function revealHint(room) {
  const t = room.turn;
  const hidden = [];
  t.mask.forEach((m, i) => { if (m === null) hidden.push(i); });
  if (hidden.length <= 2) return;
  const i = hidden[rnd(hidden.length)];
  t.mask[i] = Array.from(t.word)[i];
}

function tick(room, now) {
  const before = room.version;
  const t = room.turn;
  if (room.phase === 'choosing' && t) {
    const d = find(room, t.drawerId);
    if (!d || (!d.connected && now - d.lastSeen > room.cfg.drawerGoneMs)) beginNextTurn(room, now);
    else if (now >= t.chooseEndsAt) beginDrawing(room, t.options[rnd(t.options.length)], now);
  } else if (room.phase === 'drawing' && t) {
    const d = find(room, t.drawerId);
    while (t.hintsShown < t.hintFracs.length && now >= t.startedAt + t.drawMs * t.hintFracs[t.hintsShown]) { t.hintsShown++; revealHint(room); touch(room); }
    if (!d || (!d.connected && now - d.lastSeen > room.cfg.drawerGoneMs)) endTurn(room, now, 'drawer-left');
    else if (now >= t.endsAt) endTurn(room, now, 'time');
  } else if (room.phase === 'roundEnd' && t) {
    if (now >= t.nextAt) beginNextTurn(room, now);
  }
  if (['choosing', 'drawing', 'roundEnd'].includes(room.phase) && room.players.length < LIMITS.minPlayers) finishGame(room, now, 'بازیکن‌های کافی نمانده‌اند.');
  return room.version !== before;
}

function playAgain(room, pid, now) {
  if (pid !== room.hostId) return { error: 'فقط میزبان می‌تواند بازی را دوباره شروع کند.' };
  if (room.phase !== 'gameOver') return { error: 'بازی هنوز تمام نشده است.' };
  room.players.forEach((p) => { p.score = 0; p.guessed = false; p.gain = 0; });
  room.phase = 'lobby'; room.turn = null; room.queue = []; room.lastRoundEnd = null; room.strokes = []; room.strokePoints = 0;
  room.outbox.push({ kind: 'reset' });
  sys(room, 'بازگشت به سالن انتظار.');
  room.lastActive = now; touch(room);
  return { ok: true };
}

/* ---------- نمای هر بازیکن (مرز امنیتی: کلمه فقط اینجا کنترل می‌شود) ---------- */
function viewFor(room, pid, now) {
  const me = find(room, pid);
  const t = room.turn;
  const isDrawer = !!(t && t.drawerId === pid);
  const chat = room.chat.filter((m) => m.aud === 'all' || (m.aud === 'g' && (isDrawer || (me && me.guessed))) || (m.aud === 'p' && m.to === pid))
    .map((m) => ({ id: m.id, k: m.k, pid: m.pid, name: m.name, text: m.text }));
  const v = {
    now, code: room.code, you: pid, hostId: room.hostId, phase: room.phase, settings: room.settings,
    players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, guessed: p.guessed, drawer: !!(t && t.drawerId === p.id && ['choosing', 'drawing'].includes(room.phase)) })),
    chat, turn: null, endedReason: room.endedReason,
  };
  if (t && ['choosing', 'drawing', 'roundEnd'].includes(room.phase)) {
    v.turn = { drawerId: t.drawerId, round: t.round, rounds: room.settings.rounds, turnNo: room.turnNo, totalTurns: room.totalTurns, chooseEndsAt: t.chooseEndsAt, endsAt: t.endsAt, drawMs: t.drawMs, nextAt: t.nextAt };
    if (room.phase === 'choosing' && isDrawer) v.turn.options = t.options;
    if (room.phase === 'drawing') {
      v.turn.wordLength = letterCount(t.word);
      v.turn.hint = t.mask.map((m) => (m === null ? '_' : m));
      if (isDrawer) v.turn.word = t.word;
    }
    if (room.phase === 'roundEnd' && room.lastRoundEnd) { v.turn.word = room.lastRoundEnd.word; v.turn.gains = room.lastRoundEnd.gains; }
  }
  return v;
}

module.exports = { LIMITS, DRAW_CATS, CAT_META, createRoom, addPlayer, setConnected, removePlayer, setSettings, startGame, chooseWord, addStroke, undoStroke, clearCanvas, guess, tick, playAgain, viewFor, normalize, matches, isClose, find };
