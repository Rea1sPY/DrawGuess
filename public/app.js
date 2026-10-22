/* کلاینت «حدس نقاشی» */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const W = 1000, H = 750;
  const COLORS = ['#111111', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#92400e', '#9ca3af'];
  const SIZES = [4, 9, 16, 30];
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const hue = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const initial = (n) => Array.from(String(n).trim())[0] || '؟';
  const avatar = (p, size) => `<span class="av" style="--h:${hue(p.id || p.name)};${size ? `--s:${size}px` : ''}">${esc(initial(p.name))}</span>`;
  const TG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 2.8 11.6c-.9.3-.9 1.5 0 1.8l4.7 1.5 1.8 5.6c.2.6 1 .8 1.4.3l2.6-2.4 4.8 3.5c.6.4 1.4.1 1.6-.6L23.2 5.6c.2-.8-.5-1.5-1.3-1.3zM9.4 14.2l9-5.6-6.9 6.5-.3 3.1-1.8-4z"/></svg>';
  const credit = () => `<a class="credit" href="https://t.me/MateoHastam" target="_blank" rel="noopener"><span class="tg">${TG}</span><span>ساخته‌شده توسط <b>ReaLsPY</b> · <bdi dir="ltr">@MateoHastam</bdi></span></a>`;

  const S = { session: null, view: null, meta: null, offset: 0, es: null, strokes: [], color: COLORS[0], size: SIZES[1], eraser: false, mounted: false, lastChatId: 0, confettiDone: false, modal: null, error: '', connLost: false };
  const toast = (msg) => { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2400); };

  function saveSession() { try { localStorage.setItem('dg.session', JSON.stringify(S.session)); } catch (e) { /* ignore */ } }
  function loadSession() { try { return JSON.parse(localStorage.getItem('dg.session') || 'null'); } catch (e) { return null; } }
  function clearSession() { S.session = null; S.view = null; S.mounted = false; try { localStorage.removeItem('dg.session'); } catch (e) { /* ignore */ } if (S.es) { S.es.close(); S.es = null; } }
  const savedName = () => { try { return localStorage.getItem('dg.name') || ''; } catch (e) { return ''; } };

  async function api(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { error: j.error || 'خطا در ارتباط با سرور', status: r.status };
      return j;
    } catch (e) { return { error: 'اتصال به سرور برقرار نشد.', status: 0 }; }
  }
  const act = (type, extra) => api('/api/act', Object.assign({ room: S.session.room, pid: S.session.pid, token: S.session.token, type }, extra || {}));

  /* ---------------- صفحه اول ---------------- */
  function renderHome() {
    S.mounted = false;
    const q = new URLSearchParams(location.search).get('room') || '';
    $app.innerHTML = `<div class="home">
      <div class="doodles"><span>🖌️</span><span>⭐</span><span>✏️</span><span>🎨</span></div>
      <div class="logo"><div class="emblem">🎨</div><h1>حدس نقاشی</h1><p>یکی نقاشی می‌کشد، بقیه حدس می‌زنند!</p></div>
      <div class="glass">
        ${S.error ? `<div class="note" style="margin:0">${esc(S.error)}</div>` : ''}
        <input class="inp" id="nameInp" maxlength="16" placeholder="اسم تو" value="${esc(savedName())}" autocomplete="off">
        <button class="btn primary" id="createBtn">ساخت اتاق جدید</button>
        <div class="sep">یا با کد اتاق وارد شو</div>
        <div class="joinrow"><input class="inp" id="codeInp" inputmode="numeric" maxlength="5" placeholder="12345" value="${esc(q.replace(/\D/g, '').slice(0, 5))}" autocomplete="off"><button class="btn blue" id="joinBtn">ورود</button></div>
      </div>
      <div class="feat"><span>🎯 ۲ تا ۱۲ بازیکن</span><span>⚡ بدون ثبت‌نام</span><span>📱 روی گوشی و کامپیوتر</span></div>
      ${credit()}
    </div>`;
    const name = () => document.getElementById('nameInp').value.trim();
    const enter = async (path, body) => {
      if (!name()) { S.error = 'اول اسمت را بنویس.'; return renderHome(); }
      try { localStorage.setItem('dg.name', name()); } catch (e) { /* ignore */ }
      const r = await api(path, body);
      if (r.error) { S.error = r.error; return renderHome(); }
      S.error = ''; S.session = { room: r.room, pid: r.pid, token: r.token, name: r.name }; saveSession();
      history.replaceState(null, '', location.pathname); connect();
    };
    document.getElementById('createBtn').onclick = () => enter('/api/create', { name: name() });
    document.getElementById('joinBtn').onclick = () => enter('/api/join', { name: name(), room: document.getElementById('codeInp').value.replace(/\D/g, '') });
    document.getElementById('codeInp').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('joinBtn').click(); });
  }

  /* ---------------- ارتباط زنده ---------------- */
  function connect() {
    if (S.es) S.es.close();
    const s = S.session;
    const es = new EventSource(`/api/events?room=${encodeURIComponent(s.room)}&pid=${encodeURIComponent(s.pid)}&token=${encodeURIComponent(s.token)}`);
    S.es = es;
    es.addEventListener('open', () => { if (S.connLost) { S.connLost = false; toast('دوباره وصل شدی'); } });
    es.addEventListener('state', (e) => { S.view = JSON.parse(e.data); S.offset = S.view.now - Date.now(); onState(); });
    es.addEventListener('reset', () => { S.strokes = []; clearCanvas(); });
    es.addEventListener('clear', () => { S.strokes = []; clearCanvas(); });
    es.addEventListener('strokes', (e) => { S.strokes = JSON.parse(e.data); redraw(); });
    es.addEventListener('seg', (e) => applySeg(JSON.parse(e.data)));
    es.addEventListener('undo', (e) => { const { id } = JSON.parse(e.data); S.strokes = S.strokes.filter((x) => x.id !== id); redraw(); });
    es.addEventListener('error', async () => {
      S.connLost = true;
      const s2 = S.session; if (!s2) return;
      try {
        const r = await fetch(`/api/check?room=${s2.room}&pid=${s2.pid}&token=${s2.token}`);
        if (r.status === 404) { clearSession(); S.error = 'اتاق بسته شده یا از آن خارج شده‌ای.'; renderHome(); }
      } catch (err) { /* offline: EventSource keeps retrying */ }
    });
  }

  const now = () => Date.now() + S.offset;
  const me = () => S.view && S.view.players.find((p) => p.id === S.view.you);
  const isHost = () => S.view && S.view.hostId === S.view.you;
  const isDrawer = () => !!(S.view && S.view.turn && S.view.turn.drawerId === S.view.you && ['choosing', 'drawing'].includes(S.view.phase));

  /* ---------------- ساختار ثابت اتاق (بوم هیچ‌وقت دوباره ساخته نمی‌شود) ---------------- */
  function mountRoom() {
    $app.innerHTML = `<div class="rbar"><span class="chip">کد اتاق <b id="codeChip"></b></span><button class="btn small ghost" id="shareBtn">دعوت</button><span class="grow"></span><button class="btn small danger" id="leaveBtn">خروج</button></div>
      <div id="lobby"></div>
      <div id="game" class="hide">
        <div id="status" class="status"></div>
        <div id="tbar" class="tbar"><i id="tfill"></i></div>
        <div id="hintbar"></div>
        <div class="cwrap"><canvas id="cv" width="${W}" height="${H}"></canvas><div id="overlay"></div></div>
        <div id="tools" class="tools"></div>
      </div>
      <div id="final" class="hide"></div>
      <div class="chatbox"><div id="chat"></div><form id="gform" autocomplete="off"><input class="inp" id="ginput" maxlength="120" placeholder="بنویس…"><button class="btn primary" type="submit">ارسال</button></form></div>
      <div id="plist" class="card" style="margin-top:12px"></div><div id="modalHost"></div>`;
    document.getElementById('codeChip').textContent = S.session.room;
    document.getElementById('shareBtn').onclick = share;
    document.getElementById('leaveBtn').onclick = () => askModal('خروج از اتاق؟', 'از این اتاق خارج می‌شوی.', 'خروج', leave);
    document.getElementById('gform').onsubmit = (e) => { e.preventDefault(); sendGuess(); };
    setupCanvas();
    S.mounted = true; S.lastChatId = 0;
  }

  async function share() {
    const url = `${location.origin}/?room=${S.session.room}`;
    const text = `بیا «حدس نقاشی» بازی کنیم! کد اتاق: ${S.session.room}\n${url}`;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { /* cancelled */ } }
    try { await navigator.clipboard.writeText(text); toast('لینک دعوت کپی شد'); } catch (e) { prompt('این متن را کپی کن:', text); }
  }
  async function leave() { await act('leave'); clearSession(); S.error = ''; renderHome(); }
  async function sendGuess() {
    const inp = document.getElementById('ginput'); const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    const r = await act('guess', { text });
    if (r.error) toast(r.error);
  }

  /* ---------------- به‌روزرسانی از روی وضعیت ---------------- */
  function onState() {
    if (!S.mounted) mountRoom();
    const v = S.view;
    const inGame = ['choosing', 'drawing', 'roundEnd'].includes(v.phase);
    document.getElementById('lobby').classList.toggle('hide', v.phase !== 'lobby');
    document.getElementById('game').classList.toggle('hide', !inGame);
    document.getElementById('final').classList.toggle('hide', v.phase !== 'gameOver');
    if (v.phase !== 'gameOver') S.confettiDone = false;
    document.body.classList.toggle('ingame', inGame);
    document.getElementById('plist').classList.toggle('hide', v.phase === 'lobby');
    if (v.phase === 'lobby') renderLobby();
    if (inGame) { renderStatus(); renderOverlay(); renderTools(); document.getElementById('cv').classList.toggle('nodraw', !(v.phase === 'drawing' && isDrawer())); }
    if (v.phase === 'gameOver') renderFinal();
    renderChat(); renderPlayers();
    const gi = document.getElementById('ginput');
    const blocked = v.phase === 'drawing' && isDrawer();
    gi.disabled = blocked; gi.placeholder = blocked ? 'نقاش نمی‌تواند پیام بدهد' : (v.phase === 'drawing' ? 'حدست را بنویس…' : 'بنویس…');
    renderModal();
  }

  const playerRow = (p, v) => `<div class="pl ${p.connected ? '' : 'off'} ${p.guessed ? 'ok' : ''} ${p.id === v.you ? 'me' : ''}">${avatar(p)}<span class="nm">${esc(p.name)}</span>${p.id === v.hostId ? '<span class="tag">👑 میزبان</span>' : ''}${p.drawer ? '<span class="tag">🖌️ نقاش</span>' : ''}<span class="sc">${fa(p.score)}</span></div>`;

  function renderLobby() {
    const v = S.view, host = isHost(), st = v.settings;
    const catNames = S.meta ? st.categories.length === S.meta.defaultCategories.length ? 'همه دسته‌های نقاشی‌پذیر' : `${fa(st.categories.length)} دسته` : '';
    const times = (S.meta ? S.meta.drawTimes : [40, 60, 80, 100, 120]);
    document.getElementById('lobby').innerHTML = `
      <div class="card codecard" data-a="copycode"><h3>کد اتاق را به دوستانت بده</h3><div class="big-code">${esc(v.code)}</div><div class="hint">برای کپی کردن کد لمسش کن</div></div>
      <div class="card"><h3>بازیکن‌ها (${fa(v.players.length)})</h3><div class="plist">${v.players.map((p) => playerRow(p, v)).join('')}</div></div>
      <div class="card"><h3>تنظیمات ${host ? '' : '(فقط میزبان تغییر می‌دهد)'}</h3>
        <div class="row"><span>تعداد دور</span><div class="stepper"><button data-a="rounds" data-d="-1" ${host && st.rounds > 1 ? '' : 'disabled'}>−</button><b>${fa(st.rounds)}</b><button data-a="rounds" data-d="1" ${host && st.rounds < 5 ? '' : 'disabled'}>+</button></div></div>
        <div class="row" style="display:block"><div style="margin-bottom:8px">زمان نقاشی (ثانیه)</div><div class="chips">${times.map((t) => `<button class="opt ${st.drawTime === t ? 'on' : ''}" data-a="time" data-v="${t}" ${host ? '' : 'disabled'}>${fa(t)}</button>`).join('')}</div></div>
        <div class="row"><span>دسته کلمه‌ها</span>${host ? `<button class="btn small ghost" data-a="cats">${catNames}</button>` : `<span class="tag">${catNames}</span>`}</div>
      </div>
      ${S.error ? `<div class="note">${esc(S.error)}</div>` : ''}
      <div class="card" style="background:transparent;padding:0">${host ? `<button class="btn primary" data-a="start" ${v.players.length < 2 ? 'disabled' : ''}>شروع بازی</button>${v.players.length < 2 ? '<div class="center tag" style="margin-top:6px;color:var(--muted)">حداقل ۲ بازیکن لازم است</div>' : ''}` : '<div class="center" style="color:var(--muted)">منتظر شروع بازی توسط میزبان…</div>'}</div>${credit()}`;
  }

  function renderStatus() {
    const v = S.view, t = v.turn; if (!t) return;
    const drawer = v.players.find((p) => p.id === t.drawerId);
    document.getElementById('status').innerHTML = `<span>دور ${fa(t.round)} از ${fa(t.rounds)}</span><span class="timer" id="timer">--</span><span class="who">${drawer ? avatar(drawer, 26) : ''}<span>${esc(drawer ? drawer.name : '')}</span></span>`;
    const hb = document.getElementById('hintbar');
    if (v.phase === 'drawing') {
      if (isDrawer()) hb.innerHTML = `<div class="wordbar"><div class="lbl">کلمه تو را بکش:</div><div class="w">${esc(t.word)}</div></div>`;
      else hb.innerHTML = `<div class="hintrow" aria-label="راهنما">${t.hint.map((ch) => (ch === ' ' || ch === '\u200c' ? '<span class="hb gap"></span>' : `<span class="hb ${ch === '_' ? 'empty' : ''}">${ch === '_' ? '_' : esc(ch)}</span>`)).join('')}</div>`;
    } else if (v.phase === 'choosing') hb.innerHTML = `<div class="wordbar"><div class="lbl">${isDrawer() ? 'یک کلمه انتخاب کن' : esc(drawer ? drawer.name : '') + ' در حال انتخاب کلمه است…'}</div></div>`;
    else hb.innerHTML = `<div class="wordbar"><div class="lbl">نوبت تمام شد</div></div>`;
    tickTimer();
  }

  function tickTimer() {
    const el = document.getElementById('timer'), v = S.view;
    if (!el || !v || !v.turn) return;
    let end = 0;
    if (v.phase === 'choosing') end = v.turn.chooseEndsAt; else if (v.phase === 'drawing') end = v.turn.endsAt; else end = v.turn.nextAt;
    const left = Math.max(0, Math.ceil((end - now()) / 1000));
    el.textContent = fa(left);
    el.classList.toggle('warn', v.phase === 'drawing' && left <= 10);
    const total = v.phase === 'choosing' ? 15 : v.phase === 'drawing' ? v.turn.drawMs / 1000 : 6;
    const fill = document.getElementById('tfill'), bar = document.getElementById('tbar');
    if (fill) { fill.style.width = Math.max(0, Math.min(100, (end - now()) / (total * 10))) + '%'; bar.classList.toggle('warn', v.phase === 'drawing' && left <= 10); }
  }
  setInterval(tickTimer, 250);

  function renderOverlay() {
    const v = S.view, t = v.turn, ov = document.getElementById('overlay'); if (!t) return;
    if (v.phase === 'choosing') {
      ov.className = 'show';
      ov.innerHTML = isDrawer()
        ? `<div class="ov"><h2>کدام را بکشی؟</h2><div class="wopts">${(t.options || []).map((w, i) => `<button class="btn blue" data-a="choose" data-i="${i}">${esc(w)}</button>`).join('')}</div></div>`
        : `<div class="ov"><h2>${esc((v.players.find((p) => p.id === t.drawerId) || {}).name || '')} دارد کلمه انتخاب می‌کند…</h2><div style="font-size:40px">🤔</div></div>`;
    } else if (v.phase === 'roundEnd') {
      ov.className = 'show';
      const gains = Object.keys(t.gains || {}).map((id) => ({ p: v.players.find((x) => x.id === id), g: t.gains[id] })).filter((x) => x.p).sort((a, b) => b.g - a.g);
      ov.innerHTML = `<div class="ov"><div class="lbl" style="color:var(--muted)">کلمه این بود:</div><div class="w">${esc(t.word)}</div><div class="gains">${gains.length ? gains.map((x) => `<div><span>${esc(x.p.name)}</span><b>+${fa(x.g)}</b></div>`).join('') : '<div style="justify-content:center;color:var(--muted)">کسی امتیاز نگرفت</div>'}</div></div>`;
    } else { ov.className = ''; ov.innerHTML = ''; }
  }

  function renderTools() {
    const el = document.getElementById('tools'), v = S.view;
    if (!(v.phase === 'drawing' && isDrawer())) { el.innerHTML = ''; return; }
    el.innerHTML = COLORS.map((c) => `<button class="sw ${!S.eraser && S.color === c ? 'on' : ''}" style="background:${c}" data-a="color" data-v="${c}" aria-label="رنگ"></button>`).join('')
      + SIZES.map((s) => `<button class="szb ${S.size === s ? 'on' : ''}" data-a="size" data-v="${s}" aria-label="اندازه"><i style="width:${Math.max(4, s / 2)}px;height:${Math.max(4, s / 2)}px"></i></button>`).join('')
      + `<button class="tbtn ${S.eraser ? 'on' : ''}" data-a="eraser">پاک‌کن</button><button class="tbtn" data-a="undo">↩ برگردان</button><button class="tbtn" data-a="clear">🗑 پاک کردن همه</button>`;
  }

  function renderChat() {
    const v = S.view, box = document.getElementById('chat');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = v.chat.map((m) => {
      if (m.k === 'msg') return `<div class="m ${m.pid === v.you ? 'mine' : ''}"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`;
      return `<div class="m ${m.k}">${esc(m.text)}</div>`;
    }).join('');
    if (atBottom || !S.lastChatId) box.scrollTop = box.scrollHeight;
    const last = v.chat.length ? v.chat[v.chat.length - 1].id : 0;
    if (S.lastChatId && v.chat.some((m) => m.id > S.lastChatId && m.k === 'ok')) beep();
    S.lastChatId = last || S.lastChatId || 1;
  }

  function renderPlayers() {
    const v = S.view;
    document.getElementById('plist').innerHTML = `<h3>بازیکن‌ها</h3><div class="plist">${v.players.slice().sort((a, b) => b.score - a.score).map((p) => playerRow(p, v)).join('')}</div>`;
  }

  function renderFinal() {
    const v = S.view, sorted = v.players.slice().sort((a, b) => b.score - a.score);
    const top = sorted.length ? sorted[0].score : 0;
    const winners = top > 0 ? sorted.filter((p) => p.score === top) : [];
    const pod = (p, cls, medal) => p ? `<div class="pod ${cls}">${cls === 'p1' && top > 0 ? '<div class="crown">👑</div>' : ''}${avatar(p, cls === 'p1' ? 58 : 46)}<div class="nm">${esc(p.name)}</div><div class="pt">${fa(p.score)}</div><div class="bar">${medal}</div></div>` : '';
    const rest = sorted.slice(3);
    document.getElementById('final').innerHTML = `<div class="final"><h2>${winners.length ? '🏆 ' + (winners.length > 1 ? 'برنده‌ها: ' : 'برنده: ') + esc(winners.map((w) => w.name).join('، ')) : 'بازی تمام شد'}</h2>
      ${v.endedReason ? `<div class="center hint" style="margin-bottom:8px">${esc(v.endedReason)}</div>` : ''}
      <div class="podium">${pod(sorted[1], 'p2', '🥈')}${pod(sorted[0], 'p1', '🥇')}${pod(sorted[2], 'p3', '🥉')}</div>
      ${rest.length ? `<div class="card"><div class="plist">${rest.map((p) => playerRow(p, v)).join('')}</div></div>` : ''}
      <div class="card" style="background:transparent;border:0;box-shadow:none;padding:0">${isHost() ? '<button class="btn primary" data-a="again">بازی دوباره</button>' : '<div class="center hint">منتظر میزبان برای بازی دوباره…</div>'}</div>${credit()}</div>`;
    if (!S.confettiDone && top > 0) { S.confettiDone = true; confetti(); }
  }

  function confetti() {
    const c = document.createElement('canvas'); c.id = 'confetti'; document.body.appendChild(c);
    const x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cols = ['#a78bfa', '#7c3aed', '#e879f9', '#38bdf8', '#fbbf24', '#f472b6'];
    const ps = Array.from({ length: 110 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3, r: Math.random() * 6, vr: -.2 + Math.random() * .4, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    (function frame(t) {
      x.clearRect(0, 0, c.width, c.height);
      ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore(); });
      if (t - t0 < 3600) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  /* ---------------- مودال ---------------- */
  function askModal(title, text, okLabel, onOk) { S.modal = { title, text, okLabel, onOk }; renderModal(); }
  function renderModal() {
    const host = document.getElementById('modalHost'); if (!host) return;
    const m = S.modal;
    if (!m) { host.innerHTML = ''; return; }
    if (m.cats) {
      const sel = m.sel;
      host.innerHTML = `<div class="modal"><div class="sheet"><h2>دسته کلمه‌ها</h2><div class="chips"><button class="opt" data-m="all">همه</button><button class="opt" data-m="none">هیچ‌کدام</button><button class="opt" data-m="def">پیش‌فرض</button></div>
        <div class="cats">${S.meta.categories.map((c) => `<button class="opt ${sel.has(c.id) ? 'on' : ''}" data-m="cat" data-id="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
        <div class="joinrow"><button class="btn primary" style="width:auto" data-m="save">ذخیره</button><button class="btn ghost" style="width:100px" data-m="close">بستن</button></div></div></div>`;
      return;
    }
    host.innerHTML = `<div class="modal"><div class="sheet"><h2>${esc(m.title)}</h2><div style="color:var(--muted)">${esc(m.text)}</div><div class="joinrow"><button class="btn danger" style="width:auto" data-m="ok">${esc(m.okLabel)}</button><button class="btn ghost" style="width:100px" data-m="close">انصراف</button></div></div></div>`;
  }

  /* ---------------- کلیک‌ها ---------------- */
  $app.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-m]');
    if (m) {
      const k = m.dataset.m, md = S.modal;
      if (k === 'close') { S.modal = null; renderModal(); }
      else if (k === 'ok') { const f = md.onOk; S.modal = null; renderModal(); f(); }
      else if (md && md.cats) {
        if (k === 'cat') { md.sel.has(m.dataset.id) ? md.sel.delete(m.dataset.id) : md.sel.add(m.dataset.id); }
        else if (k === 'all') md.sel = new Set(S.meta.categories.map((c) => c.id));
        else if (k === 'none') md.sel = new Set();
        else if (k === 'def') md.sel = new Set(S.meta.defaultCategories);
        else if (k === 'save') {
          if (!md.sel.size) return toast('حداقل یک دسته را انتخاب کن.');
          const r = await act('settings', { patch: { categories: Array.from(md.sel) } }); if (r.error) toast(r.error);
          S.modal = null;
        }
        renderModal();
      }
      return;
    }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a;
    let r;
    if (k === 'copycode') { try { await navigator.clipboard.writeText(S.view.code); toast('کد اتاق کپی شد'); } catch (err) { toast('کد اتاق: ' + S.view.code); } return; }
    if (k === 'rounds') r = await act('settings', { patch: { rounds: S.view.settings.rounds + Number(a.dataset.d) } });
    else if (k === 'time') r = await act('settings', { patch: { drawTime: Number(a.dataset.v) } });
    else if (k === 'cats') { S.modal = { cats: true, sel: new Set(S.view.settings.categories) }; renderModal(); }
    else if (k === 'start') { S.error = ''; r = await act('start'); if (r && r.error) { S.error = r.error; renderLobby(); } }
    else if (k === 'choose') r = await act('choose', { idx: Number(a.dataset.i) });
    else if (k === 'again') r = await act('again');
    else if (k === 'color') { S.color = a.dataset.v; S.eraser = false; renderTools(); }
    else if (k === 'size') { S.size = Number(a.dataset.v); renderTools(); }
    else if (k === 'eraser') { S.eraser = !S.eraser; renderTools(); }
    else if (k === 'undo') { r = await act('undo'); S.strokes.pop(); redraw(); }
    else if (k === 'clear') { S.strokes = []; clearCanvas(); r = await act('clear'); }
    if (r && r.error && k !== 'start') toast(r.error);
  });

  /* ---------------- بوم نقاشی ---------------- */
  let cv, ctx;
  function clearCanvas() { if (!ctx) return; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); }
  function drawStroke(s, from) {
    ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = s.pts;
    if (p.length === 1 || (from === 0 && p.length === 1)) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath();
    const start = Math.max(0, from - 1);
    ctx.moveTo(p[start][0], p[start][1]);
    for (let i = start + 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }
  function redraw() { if (!ctx) return; clearCanvas(); S.strokes.forEach((s) => drawStroke(s, 0)); }
  function applySeg(seg) {
    if (!ctx) return;
    let s = S.strokes[S.strokes.length - 1];
    if (s && s.id === seg.id) { const from = s.pts.length; s.pts.push(...seg.pts); drawStroke(s, from); }
    else { s = { id: seg.id, c: seg.c, w: seg.w, pts: seg.pts.slice() }; S.strokes.push(s); drawStroke(s, 0); }
  }

  function setupCanvas() {
    cv = document.getElementById('cv'); ctx = cv.getContext('2d'); clearCanvas(); redraw();
    let cur = null, buf = [], timer = null;
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(W, Math.round((e.clientX - r.left) * W / r.width))), Math.max(0, Math.min(H, Math.round((e.clientY - r.top) * H / r.height)))]; };
    const canDraw = () => S.view && S.view.phase === 'drawing' && isDrawer();
    const flushSeg = () => {
      if (!cur || !buf.length) return;
      const pts = buf.splice(0, 80);
      act('seg', { seg: { id: cur.id, c: cur.c, w: cur.w, pts } });
      if (buf.length) flushSeg();
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!canDraw()) return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const p = pos(e);
      cur = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), c: S.eraser ? '#ffffff' : S.color, w: S.eraser ? Math.max(S.size, 16) : S.size, pts: [p] };
      S.strokes.push(cur); drawStroke(cur, 0); buf = [p];
      timer = setInterval(flushSeg, 70);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!cur) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ev) => {
        const p = pos(ev), last = cur.pts[cur.pts.length - 1];
        if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 2) return;
        cur.pts.push(p); buf.push(p); drawStroke(cur, cur.pts.length - 1);
      });
    });
    const end = (e) => { if (!cur) return; try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } clearInterval(timer); flushSeg(); cur = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------------- صدا ---------------- */
  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880].forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; g.gain.value = 0.05; o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + i * 0.1); o.stop(actx.currentTime + i * 0.1 + 0.12); });
    } catch (e) { /* ignore */ }
  }

  /* ---------------- شروع ---------------- */
  fetch('/api/meta').then((r) => r.json()).then((m) => { S.meta = m; if (S.view) onState(); }).catch(() => {});
  const saved = loadSession();
  if (saved) {
    fetch(`/api/check?room=${saved.room}&pid=${saved.pid}&token=${saved.token}`).then((r) => {
      if (r.status === 200) { S.session = saved; connect(); } else { clearSession(); renderHome(); }
    }).catch(() => renderHome());
  } else renderHome();
  if (window.DG_TEST) window.__dg = S;
})();
