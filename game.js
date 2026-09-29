'use strict';

// 핸드드립 카페: 화면·입력·흐름. 규칙은 logic.js (LOGIC) 에 있다.
(() => {
const C = LOGIC;

// ---------- 모양 ----------
const W = 400, H = 760;
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const Y_TICKETS = 68, Y_KETTLE = 160, Y_TABS = 230, Y_PANEL = 300, PANEL_H = 400, Y_BOOK = 706;

const SHORT = { hot: ['핫'], ice: ['아이스'], hotLight: ['핫', '라이트'], hotDark: ['핫', '다크'], iceDark: ['아이스', '다크'], hotLarge: ['핫', '라지'], iceLarge: ['아이스', '라지'] };
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪'];

// ---------- 캔버스 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 62;
  const scale = Math.min((innerWidth - 24) / W, (innerHeight - 28 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = Math.max(cssW, Math.min(innerWidth - 20, 340)) + 'px';
  $('wrap').style.width = cssW + 'px';
  $('wrap').style.margin = '0 auto';
}
addEventListener('resize', fit);

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------- 저장·소리 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let muted = store.get('cafeMuted') === '1';
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), gn = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  bell: () => { tone(1320, 0.12, 'sine', 0.09); setTimeout(() => tone(1760, 0.18, 'sine', 0.08), 90); },
  tap: () => tone(560, 0.04, 'triangle', 0.07, 100),
  good: () => tone(720, 0.09, 'sine', 0.1, 260),
  ok: () => tone(520, 0.09, 'triangle', 0.09),
  bad: () => tone(170, 0.16, 'square', 0.06, -50),
  crank: () => tone(240 + Math.random() * 80, 0.04, 'sawtooth', 0.05),
  served: (s) => [523, 659, 784, 1047].slice(0, 2 + s).forEach((f, i) => setTimeout(() => tone(f, 0.12, 'triangle', 0.1), i * 80)),
  left: () => [400, 300, 220].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sawtooth', 0.07), i * 110)),
  changed: () => [880, 660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.06), i * 90)),
  day: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.1), i * 100)),
  end: () => [784, 659, 523, 392].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 140)),
};

// ---------- 상태 ----------
let state = 'menu';               // menu | play | paused | summary | recipe | over
let g = null;                     // 게임 규칙 상태 (logic.js)
let focus = 0;                    // 보고 있는 자리
let buttons = [];                 // 이번 프레임에 그려진 누를 곳
const holds = new Map();          // 누르고 있는 손가락 → 버튼
let texts = [], particles = [], banner = null;
let best = Number(store.get('cafeBest')) || 0, bestDay = Number(store.get('cafeBestDay')) || 0;
let clock = 0;

function startGame() {
  g = C.newGame(Math.random);
  focus = 0; texts = []; particles = []; banner = null; holds.clear();
  state = 'play';
  hideOverlay();
  updateHud();
  handleEvents();
}

// ---------- 이벤트 (소리·글자) ----------
const qWord = (q) => (q >= 0.95 ? ['완벽!', '#7ee39a'] : q >= 0.7 ? ['좋아요', '#ffd23f'] : ['아쉬워요', '#ff8a8a']);
function say(text, x, y, color = '#fff', size = 22) { texts.push({ text, x, y, t: 0, color, size }); }
function tabRect(si) {
  const n = g.stations.length, gap = 8, w = (380 - (n - 1) * gap) / n;
  return { x: 10 + si * (w + gap), y: Y_TABS, w, h: 62 };
}

function handleEvents() {
  if (!g) return;
  for (const e of g.events.splice(0)) {
    if (e.type === 'order') sfx.bell();
    else if (e.type === 'assign') { focus = e.station; sfx.tap(); }
    else if (e.type === 'step') {
      const [w, col] = qWord(e.q); say(w, W / 2, Y_PANEL + 60, col, 30);
      (e.q >= 0.7 ? sfx.good : sfx.bad)();
    } else if (e.type === 'served') {
      const r = tabRect(e.station);
      say(`+${e.coins.toLocaleString()}`, r.x + r.w / 2, r.y + 20, '#ffd23f', 24);
      say('⭐'.repeat(e.stars), r.x + r.w / 2, r.y + 46, '#fff', 20);
      for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 100; particles.push({ x: r.x + r.w / 2, y: r.y + 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.6, col: ['#ffd23f', '#ff9ecb', '#7ee39a'][i % 3] }); }
      sfx.served(e.stars);
      updateHud();
    } else if (e.type === 'left') { banner = { text: '😢 손님이 떠났어요', sub: '❤️ 하나를 잃었어요', t: 0, bad: true }; sfx.left(); }
    else if (e.type === 'changed') {
      const a = C.menuOf(e.from), b = C.menuOf(e.to);
      banner = { text: `✏️ 주문이 바뀌었어요!`, sub: `${a.emoji} ${a.name} → ${b.emoji} ${b.name}`, t: 0, bad: true };
      sfx.changed();
    } else if (e.type === 'day') {
      const nm = e.newMenus.map((id) => C.menuOf(id));
      banner = { text: `Day ${e.day}`, sub: nm.length ? `새 메뉴 ${nm.map((m) => m.emoji + ' ' + m.name).join(', ')}` : '', t: 0 };
      sfx.day();
    } else if (e.type === 'dayEnd') showSummary();
    else if (e.type === 'over') gameOver();
  }
}

// ---------- 하루 마감·게임 오버 ----------
function showSummary() {
  state = 'summary';
  if (g.coins > best) { best = g.coins; store.set('cafeBest', String(best)); }
  if (g.day > bestDay) { bestDay = g.day; store.set('cafeBestDay', String(bestDay)); }
  updateHud();
  const nextDay = g.day + 1;
  const newMenus = C.MENUS.filter((m) => m.unlockDay === nextDay);
  const moreSeats = C.stationCount(nextDay) > g.stations.length;
  const avg = g.dayServed ? (g.dayStars / g.dayServed).toFixed(1) : '-';
  sfx.day();
  showOverlay(`
    <h2 class="inked">Day ${g.day} 마감!</h2>
    <div class="big inked">+${g.dayCoins.toLocaleString()}</div>
    <span class="tag">${'❤️'.repeat(g.hearts)}${'🖤'.repeat(C.MAX_HEARTS - g.hearts)}</span>
    <div class="card"><dl class="stats">
      <dt>만든 커피</dt><dd>${g.dayServed}잔</dd>
      <dt>놓친 손님</dt><dd>${g.dayLost}명</dd>
      <dt>평균 별</dt><dd>${avg}</dd>
      <dt>지금까지</dt><dd>${g.coins.toLocaleString()}</dd>
    </dl></div>
    ${newMenus.length || moreSeats ? `<div class="card" style="text-align:center">🎉 내일은<br>${newMenus.map((m) => `<b>${m.emoji} ${m.name}</b> 메뉴가 열려요`).join('<br>')}${moreSeats ? `<br><b>☕ 자리가 ${C.stationCount(nextDay)}개</b>로 늘어요` : ''}</div>` : ''}
    <button data-act="next">다음 날</button>
    <button class="sub" data-act="book">📖 레시피북</button>`);
}

function gameOver() {
  state = 'over';
  if (g.coins > best) { best = g.coins; store.set('cafeBest', String(best)); }
  if (g.day > bestDay) { bestDay = g.day; store.set('cafeBestDay', String(bestDay)); }
  updateHud();
  sfx.end();
  const isBest = g.coins >= best && g.coins > 0;
  setTimeout(() => showOverlay(`
    <h2 class="inked">카페 문 닫음…</h2>
    <div class="big inked">${g.coins.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${best.toLocaleString()}`}</span>
    <div class="card"><dl class="stats">
      <dt>버틴 날</dt><dd>Day ${g.day}</dd>
      <dt>만든 커피</dt><dd>${g.served}잔</dd>
      <dt>별 3개</dt><dd>${g.best.stars3}잔</dd>
    </dl></div>
    <button data-act="again">다시 오픈</button>`), 700);
}

// ---------- 오버레이 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

function recipeRows(day) {
  return C.MENUS.map((m) => {
    const locked = m.unlockDay > day;
    const cum = m.pours.reduce((a, v) => { a.push((a.length ? a[a.length - 1] : 0) + v); return a; }, []);
    return `<div class="row ${locked ? 'off' : ''}"><b>${m.emoji} ${m.name}</b>${locked ? ` 🔒 ${m.unlockDay}일차에 열려요` : ''}<br>
      원두 ${m.beans}g · 물 ${m.temp}°C · 분쇄 ${C.GRINDS[m.grind]}${m.ice ? ` · 얼음 ${m.ice}g` : ''}<br>
      푸어 ${m.pours.join(' + ')} = ${C.totalWater(m)}g <span style="color:#6b5c95">(누적 ${cum.join('→')})</span></div>`;
  }).join('');
}
function showBook(back) {
  const day = g ? g.day : 7;
  showOverlay(`
    <h2 class="inked">📖 레시피북</h2>
    <div class="book">${recipeRows(day)}
      <div class="note">핫: 테츠 카스야 4:6 방식(20g · 300g · 92°C) 참고<br>아이스: 일본식 급랭 — 얼음을 서버에 먼저 담고 그 위로 내려요<br>첫 푸어는 원두의 2배로 뜸을 들이고, 뜸 시간은 게임에서 짧게 줄였어요</div>
    </div>
    <button data-act="${back}">닫기</button>`);
}

function showMenu() {
  state = 'menu';
  showOverlay(`
    <h1>핸드드립 <span class="p">카페</span></h1>
    <p>주문은 밀려오고, 레시피는 헷갈리고…<br>원두·분쇄·온도·린싱·<b>푸어 4번</b>까지 정확하게!</p>
    <button data-act="start">오픈하기</button>
    <button class="sub" data-act="bookMenu">📖 레시피북</button>
    ${bestDay ? `<span class="tag">🏆 최고 ${best.toLocaleString()} · Day ${bestDay}</span>` : ''}
    <div class="card">
      🧾 주문 카드를 눌러 빈 자리에 올려요<br>
      ⚖️ 계량 → ⚙️ 분쇄 → 🌡 온도 → 🚿 린싱 → 💧 푸어 ×4<br>
      🧊 아이스는 얼음 계량과 저어주기가 더 있어요<br>
      🔥 주전자는 모든 자리가 같이 써요. 식기 전에 다시 데워요!
    </div>`);
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'start' || act === 'again') startGame();
  else if (act === 'next') { C.nextDay(g); focus = 0; texts = []; state = 'play'; hideOverlay(); updateHud(); handleEvents(); }
  else if (act === 'book') showBook('backSummary');
  else if (act === 'bookMenu') showBook('backMenu');
  else if (act === 'bookPlay') { state = 'play'; hideOverlay(); }
  else if (act === 'backSummary') showSummary();
  else if (act === 'backMenu') showMenu();
  else if (act === 'continue') resume();
});
function releaseAll() { for (const b of holds.values()) b.up && b.up(); holds.clear(); if (g) C.heat(g, false); }
function pause() {
  if (state !== 'play') return;
  releaseAll();
  state = 'paused';
  showOverlay(`<h2 class="inked">일시정지</h2><button data-act="continue">계속하기</button>`);
}
function resume() { if (state !== 'paused') return; state = 'play'; hideOverlay(); }
function openBook() {
  if (state !== 'play') return;
  releaseAll();
  state = 'recipe';
  showBook('bookPlay');
}

// ---------- 그리기 도구 ----------
function label(text, x, y, size, fill = '#fff', align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function plain(text, x, y, size, fill = INK, align = 'center') {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
function emoji(e, x, y, size, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
  ctx.fillText(e, x, y + size * 0.05);
  ctx.globalAlpha = 1;
}
function panel(x, y, w, h, r, fill, lift = 4) {
  ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill();
  ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
}
function wrap(text, x, y, maxW, size, color, lh = size * 1.35, align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  const words = text.split(' '); let line = '', yy = y;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { plain(line, x, yy, size, color, align); yy += lh; line = w; } else line = t;
  }
  if (line) plain(line, x, yy, size, color, align);
  return yy;
}

// 누를 곳을 그리고, 이번 프레임 목록에 넣는다
function btn(id, x, y, w, h, text, o = {}) {
  const b = { id, x, y, w, h, hold: !!o.hold, down: o.down, up: o.up, tap: o.tap, disabled: !!o.disabled };
  buttons.push(b);
  const pressed = [...holds.values()].some((v) => v.id === id);
  const fill = b.disabled ? '#d9d3ea' : (o.color || '#ffd23f');
  ctx.globalAlpha = b.disabled ? 0.65 : 1;
  panel(x, y + (pressed ? 3 : 0), w, h, o.r || 20, fill, pressed ? 1 : 5);
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => label(ln, x + w / 2, y + (pressed ? 3 : 0) + h / 2 + (i - (lines.length - 1) / 2) * (o.size || 20) * 1.15, o.size || 20, b.disabled ? '#b5acd0' : '#fff'));
  ctx.globalAlpha = 1;
  return b;
}

// ---------- 그리기 ----------
const menuOfOrder = (o) => C.menuOf(o.menuId);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function drawTopBar() {
  panel(10, 8, 92, 34, 17, '#ffd23f', 3);
  plain(`Day ${g.day}`, 56, 26, 21, INK);
  for (let i = 0; i < C.MAX_HEARTS; i++) emoji(i < g.hearts ? '❤️' : '🖤', 128 + i * 30, 25, 24, i < g.hearts ? 1 : 0.5);
  const left = Math.max(0, C.DAY_LEN - g.clock);
  label(g.phase === 'open' ? `영업 ${fmtTime(left)}` : '마감 준비 중', W - 12, 25, 18, g.phase === 'open' ? '#fff' : '#ffd23f', 'right');
  panel(10, 48, 380, 10, 5, '#ffffff', 2);
  ctx.fillStyle = '#7dffb0'; roundRect(ctx, 12, 50, Math.max(8, 376 * Math.min(1, g.clock / C.DAY_LEN)), 6, 3); ctx.fill();
}

function drawTickets() {
  const n = 5, w = 72, gap = 5, x0 = (W - (n * w + (n - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (w + gap), y = Y_TICKETS, h = 84;
    const o = g.orders[i];
    if (!o) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 14); ctx.stroke(); ctx.setLineDash([]); continue; }
    const m = menuOfOrder(o), taken = o.station >= 0, k = o.patience / o.patienceMax;
    const flash = o.changed && Math.sin(clock * 12) > 0;
    const b = btn(`ticket:${o.id}`, x, y, w, h, '', { color: taken ? '#e6e0f7' : flash ? '#ffd0d8' : '#ffffff', tap: () => assignTicket(o.id), r: 14 });
    emoji(m.emoji, x + w / 2, y + 22, 26, taken ? 0.5 : 1);
    (SHORT[m.id] || [m.name]).forEach((ln, j, arr) => plain(ln, x + w / 2, y + 47 + (j - (arr.length - 1) / 2) * 13, 13, INK));
    // 참을성 막대
    ctx.fillStyle = 'rgba(43,29,82,.2)'; roundRect(ctx, x + 6, y + h - 14, w - 12, 8, 4); ctx.fill();
    ctx.fillStyle = k > 0.5 ? '#3ecf6e' : k > 0.25 ? '#ffb000' : '#ff3b5c';
    roundRect(ctx, x + 6, y + h - 14, Math.max(6, (w - 12) * k), 8, 4); ctx.fill();
    if (taken) label(`${o.station + 1}번`, x + w - 4, y + 8, 12, '#fff', 'right');
    if (!taken && k < 0.25 && Math.sin(clock * 10) > 0) { ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 3; roundRect(ctx, x, y, w, h, 14); ctx.stroke(); }
  }
  if (!g.orders.length) plain(g.phase === 'open' ? '손님을 기다리는 중…' : '마지막 주문을 마무리해요', W / 2, Y_TICKETS + 42, 17, 'rgba(255,255,255,.85)');
  else if (g.day === 1 && g.orders.some((o) => o.station < 0)) label('👆 주문 카드를 눌러 자리에 올려요', W / 2, Y_TICKETS + 100, 15, '#ffd23f');
}

function neededTemps() {
  const out = [];
  g.stations.forEach((st, si) => {
    if (!st.order) return;
    const m = menuOfOrder(st.order), step = C.stepsFor(m)[st.idx];
    if (step === 'temp' || (step && step.startsWith('pour'))) out.push({ si, temp: m.temp });
  });
  return out;
}

function drawKettle() {
  const y = Y_KETTLE, k = g.kettle;
  panel(10, y, 380, 62, 16, '#fff8ec', 4);
  plain('🌡', 28, y + 22, 22);
  const fs = g.stations[focus], fm = fs && fs.order ? menuOfOrder(fs.order) : null;
  const dev = fm ? Math.abs(k.temp - fm.temp) : 0;
  plain(`${k.temp.toFixed(1)}°C`, 92, y + 22, 24, fm && dev > 2 ? '#ff3b5c' : INK);
  if (fm) plain(`필요 ${fm.temp}°C`, 92, y + 46, 13, '#6b5c95');
  // 온도 막대 (20 ~ 100°C)
  const bx = 140, bw = 128, by = y + 16, bh = 18, lo = 20, hi = 100, pos = (t) => bx + ((t - lo) / (hi - lo)) * bw;
  ctx.fillStyle = 'rgba(43,29,82,.15)'; roundRect(ctx, bx, by, bw, bh, 9); ctx.fill();
  const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#5fb8ff'); gr.addColorStop(0.6, '#ffb000'); gr.addColorStop(1, '#ff3b5c');
  ctx.fillStyle = gr; roundRect(ctx, bx, by, Math.max(9, pos(k.temp) - bx), bh, 9); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, bx, by, bw, bh, 9); ctx.stroke();
  // 필요한 온도 표시 (보고 있는 자리는 크게)
  for (const n of neededTemps()) {
    const x = pos(n.temp);
    ctx.fillStyle = n.si === focus ? '#ff5fa2' : 'rgba(255,95,162,.55)';
    ctx.beginPath(); ctx.moveTo(x, by + bh + 2); ctx.lineTo(x - 5, by + bh + 11); ctx.lineTo(x + 5, by + bh + 11); ctx.closePath(); ctx.fill();
  }
  btn('heat', 278, y + 5, 64, 52, '🔥', { hold: true, size: 26, color: '#ff8a5a', r: 18, down: () => C.heat(g, true), up: () => C.heat(g, false) });
  btn('cool', 348, y + 5, 36, 52, '💧', { size: 22, color: '#5fb8ff', r: 18, tap: () => { C.cool(g); sfx.tap(); } });
}

function drawTabs() {
  g.stations.forEach((st, si) => {
    const r = tabRect(si), o = st.order, sel = si === focus;
    btn(`tab:${si}`, r.x, r.y, r.w, r.h, '', { color: sel ? '#ffd23f' : '#ffffff', tap: () => { focus = si; sfx.tap(); }, r: 16 });
    if (!o) { plain(`${si + 1}번 자리`, r.x + r.w / 2, r.y + 22, 15, '#6b5c95'); plain('비어 있어요', r.x + r.w / 2, r.y + 42, 13, '#a99fc9'); return; }
    const m = menuOfOrder(o), steps = C.stepsFor(m);
    emoji(m.emoji, r.x + 24, r.y + 24, 26);
    plain((SHORT[m.id] || [m.name]).join(' '), r.x + 54, r.y + 20, 14, INK, 'left');
    // 진행 점
    const dotW = Math.min(9, (r.w - 24) / steps.length);
    steps.forEach((s, i) => {
      ctx.fillStyle = i < st.idx ? '#3ecf6e' : i === st.idx ? '#ff5fa2' : 'rgba(43,29,82,.25)';
      ctx.beginPath(); ctx.arc(r.x + 12 + i * dotW + dotW / 2, r.y + 50, i === st.idx ? 3.6 : 2.8, 0, Math.PI * 2); ctx.fill();
    });
    if (st.wait > 0) label(`${st.wait.toFixed(0)}s`, r.x + r.w - 10, r.y + 20, 15, '#5fd3ff', 'right');
    else if (st.hold) label('●', r.x + r.w - 10, r.y + 20, 15, '#ff3b5c', 'right');
  });
}

// 단계별 제목·안내
function stepInfo(m, st, step) {
  const steps = C.stepsFor(m), n = CIRCLED[steps.indexOf(step)] || '';
  if (step === 'beans') return [`${n} 원두 계량`, `원두 ${m.beans}g 을 담아요 (오차 ±0.5g)`];
  if (step === 'grind') return [`${n} 분쇄`, `분쇄도 「${C.GRINDS[m.grind]}」 를 고르고 손잡이를 돌려요`];
  if (step === 'temp') return [`${n} 물 온도`, `주전자를 ${m.temp}°C 에 맞추고 확인해요 (오차 ±1°C)`];
  if (step === 'rinse') return [`${n} 린싱`, '필터에 뜨거운 물을 적셔요. 초록 칸에서 손을 떼요'];
  if (step === 'ice') return [`${n} 얼음 계량`, `서버에 얼음 ${m.ice}g 을 담아요 (오차 ±5g)`];
  if (step.startsWith('pour')) {
    const k = Number(step.slice(4)), cum = m.pours.slice(0, k).reduce((a, b) => a + b, 0);
    return [`${n} ${k === 1 ? '뜸 들이기' : `푸어 ${k}/4`}`, `이번엔 ${m.pours[k - 1]}g (누적 ${cum}g). 주전자 ${m.temp}°C 를 확인해요`];
  }
  if (step === 'swirl') return [`${n} 저어주기`, '서버를 빙글빙글 돌려 얼음과 섞어요'];
  return [`${n} 서빙`, '완성! 손님에게 내가요'];
}

function drawGauge(x, y, w, h, value, max, target, tol, fillColor) {
  ctx.fillStyle = 'rgba(43,29,82,.15)'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (target !== null) { ctx.fillStyle = 'rgba(62,207,110,.45)'; ctx.fillRect(x + ((target - tol) / max) * w, y, (tol * 2 / max) * w, h); }
  ctx.fillStyle = fillColor; roundRect(ctx, x, y, Math.max(h, Math.min(1, value / max) * w), h, h / 2); ctx.fill();
  if (target !== null) { ctx.fillStyle = INK; ctx.fillRect(x + (target / max) * w - 1.5, y - 4, 3, h + 8); }
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
}

function holdBtn(id, x, y, w, h, text, si, name, o = {}) {
  return btn(id, x, y, w, h, text, { hold: true, color: o.color || '#7ee39a', disabled: o.disabled, size: o.size, down: () => { if (C.act(g, si, name, true)) sfx.tap(); }, up: () => C.act(g, si, name, false) });
}
function tapBtn(id, x, y, w, h, text, si, name, o = {}) {
  return btn(id, x, y, w, h, text, { color: o.color, disabled: o.disabled, size: o.size, tap: () => { const r = C.act(g, si, name, true, o.arg); if (r) (name === 'crank' ? sfx.crank : sfx.tap)(); else sfx.bad(); } });
}

function drawPanel() {
  const st = g.stations[focus], x = 10, y = Y_PANEL, w = 380;
  panel(x, y, w, PANEL_H, 22, '#fff8ec', 5);
  if (!st || !st.order) {
    emoji('☕', W / 2, y + 150, 64, 0.5);
    wrap(g.orders.some((o) => o.station < 0) ? '위의 주문 카드를 눌러\n이 자리에 올려요'.replace('\n', ' ') : '주문이 들어오면 여기서 커피를 내려요', W / 2, y + 230, 300, 18, '#6b5c95');
    return;
  }
  const m = menuOfOrder(st.order), step = C.stepsFor(m)[st.idx], si = focus;
  const [title, hint] = stepInfo(m, st, step);
  plain(title, x + 16, y + 26, 24, INK, 'left');
  plain(`${m.emoji} ${m.name}`, x + w - 14, y + 26, 15, '#6b5c95', 'right');
  wrap(hint, W / 2, y + 60, 340, 15, '#6b5c95', 19);
  const cy = y + 92;

  if (step === 'beans' || step === 'ice') {
    const key = step, val = st[key], target = m[key], isBeans = step === 'beans', unit = 'g';
    panel(x + 80, cy, 220, 74, 14, '#23213a', 3);
    plain(`${isBeans ? val.toFixed(1) : Math.round(val)} ${unit}`, W / 2, cy + 38, 42, '#7dffb0');
    drawGauge(x + 30, cy + 104, 320, 24, val, target * 1.4, target, isBeans ? 0.5 : 5, '#c9a36b');
    plain(`목표 ${target}g`, x + 30 + (target / (target * 1.4)) * 320, cy + 148, 15, INK);
    const by = y + 296;
    holdBtn('add', x + 14, by, 190, 84, isBeans ? '🫘 꾹 눌러\n담기' : '🧊 꾹 눌러\n담기', si, 'add', { size: 20 });
    tapBtn('sub', x + 212, by, 76, 84, isBeans ? '−0.5' : '−5', si, 'sub', { color: '#ff9ecb', size: 20 });
    tapBtn('confirm', x + 296, by, 70, 84, '확정\n✔', si, 'confirm', { color: '#5fb8ff', size: 19 });
  } else if (step === 'grind') {
    C.GRINDS.forEach((gname, i) => {
      const bx = x + 12 + i * 92, sel = st.grindSel === i;
      btn(`grind:${i}`, bx, cy + 4, 86, 66, '', { color: sel ? '#ff9ecb' : '#ffffff', size: 17, tap: () => { C.act(g, si, 'grind', true, i); sfx.tap(); } });
      const lines = gname.split(' ');
      lines.forEach((ln, j) => plain(ln, bx + 43, cy + 4 + 33 + (j - (lines.length - 1) / 2) * 19, 17, sel ? '#fff' : INK));
    });
    drawGauge(x + 30, cy + 110, 320, 22, st.cranks, C.CRANKS, null, 0, '#c9a36b');
    plain(st.grindSel < 0 ? '먼저 분쇄도를 골라요' : `${st.cranks} / ${C.CRANKS}`, W / 2, cy + 152, 16, '#6b5c95');
    tapBtn('crank', x + 60, y + 290, 260, 90, st.grindSel < 0 ? '분쇄도를\n먼저 골라요' : '⚙️ 탭탭탭! 갈기', si, 'crank', { disabled: st.grindSel < 0, size: 22 });
  } else if (step === 'temp') {
    const dev = Math.abs(g.kettle.temp - m.temp), col = dev <= 1 ? '#3ecf6e' : dev <= 3 ? '#ffb000' : '#ff3b5c';
    plain(`${g.kettle.temp.toFixed(1)}°C`, W / 2, cy + 60, 64, col);
    plain(`필요 ${m.temp}°C`, W / 2, cy + 116, 22, INK);
    wrap('위쪽 🔥 를 꾹 눌러 데우고 💧 로 식혀요', W / 2, cy + 160, 320, 15, '#6b5c95');
    tapBtn('confirm', x + 60, y + 296, 260, 84, '🌡 온도 OK!', si, 'confirm', { color: '#5fb8ff', size: 24 });
  } else if (step === 'rinse') {
    ctx.fillStyle = 'rgba(43,29,82,.15)'; roundRect(ctx, x + 30, cy + 40, 320, 34, 17); ctx.fill();
    ctx.fillStyle = 'rgba(62,207,110,.5)'; ctx.fillRect(x + 30 + 320 * 0.5, cy + 40, 320 * 0.35, 34);
    ctx.fillStyle = '#5fb8ff'; roundRect(ctx, x + 30, cy + 40, Math.max(34, 320 * st.rinse), 34, 17); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x + 30, cy + 40, 320, 34, 17); ctx.stroke();
    emoji('🚿', W / 2, cy + 130, 56);
    holdBtn('rinse', x + 30, y + 296, 320, 84, '🚿 꾹 눌러 린싱', si, 'rinse', { color: '#5fb8ff', size: 24 });
  } else if (step.startsWith('pour')) {
    const k = Number(step.slice(4)), want = m.pours[k - 1], cumTarget = m.pours.slice(0, k).reduce((a, b) => a + b, 0);
    const total = C.totalWater(m), water = st.water + st.poured;
    // 서버(유리) + 드리퍼
    const gx = x + 150, gy = cy + 30, gw = 132, gh = 168;
    ctx.fillStyle = 'rgba(255,255,255,.7)'; roundRect(ctx, gx, gy, gw, gh, 16); ctx.fill();
    const fh = Math.min(1, water / total) * (gh - 6);
    ctx.fillStyle = m.ice ? '#a67c52' : '#8a5a34'; roundRect(ctx, gx + 3, gy + gh - 3 - fh, gw - 6, fh, 12); ctx.fill();
    if (m.ice) { ctx.fillStyle = 'rgba(200,235,255,.8)'; for (let i = 0; i < 3; i++) { roundRect(ctx, gx + 12 + i * 36, gy + gh - 36 - (i % 2) * 8, 26, 26, 6); ctx.fill(); } }
    ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, gx, gy, gw, gh, 16); ctx.stroke();
    const ty = gy + gh - 3 - (cumTarget / total) * (gh - 6);
    ctx.strokeStyle = '#ff5fa2'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(gx - 10, ty); ctx.lineTo(gx + gw + 10, ty); ctx.stroke(); ctx.setLineDash([]);
    plain(`${cumTarget}g`, gx + gw + 14, ty, 14, '#ff5fa2', 'left');
    // 드리퍼
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx + 14, gy - 34); ctx.lineTo(gx + gw - 14, gy - 34); ctx.lineTo(gx + gw / 2 + 16, gy + 6); ctx.lineTo(gx + gw / 2 - 16, gy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (st.hold === 'pour') { ctx.fillStyle = '#6b3f1d'; ctx.fillRect(gx + gw / 2 - 3, gy + 6, 6, Math.max(0, gh - 3 - fh - 6)); }
    // 숫자
    plain('이번', x + 20, cy + 50, 14, '#6b5c95', 'left');
    plain(`${st.poured.toFixed(0)} / ${want}g`, x + 20, cy + 74, 20, INK, 'left');
    plain('누적', x + 20, cy + 112, 14, '#6b5c95', 'left');
    plain(`${water.toFixed(0)} / ${cumTarget}g`, x + 20, cy + 136, 17, INK, 'left');
    const tdev = Math.abs(g.kettle.temp - m.temp);
    if (tdev > 2) label(`🌡 ${g.kettle.temp.toFixed(0)}°C  (필요 ${m.temp}°C)`, W / 2, cy + 220, 16, '#ff8a8a');
    const waiting = st.wait > 0;
    holdBtn('pour', x + 30, y + 296, 320, 84, waiting ? `뜸 들이는 중… ${st.wait.toFixed(1)}s` : '💧 꾹 눌러 붓기', si, 'pour', { color: '#5fb8ff', size: waiting ? 20 : 24, disabled: waiting });
  } else if (step === 'swirl') {
    emoji('🌀', W / 2, cy + 90, 86);
    drawGauge(x + 60, cy + 170, 260, 22, st.swirls, C.SWIRLS, null, 0, '#5fb8ff');
    tapBtn('swirl', x + 60, y + 296, 260, 84, '🌀 빙글빙글!', si, 'swirl', { color: '#5fb8ff', size: 24 });
  } else if (step === 'serve') {
    const avg = st.res.reduce((a, b) => a + b, 0) / st.res.length, stars = C.starsOf(avg);
    emoji(m.emoji, W / 2, cy + 64, 84);
    plain('⭐'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, cy + 142, 32, '#ffb000');
    plain('예상 평가', W / 2, cy + 176, 14, '#6b5c95');
    tapBtn('serve', x + 60, y + 296, 260, 84, '☕ 서빙하기!', si, 'serve', { color: '#ff9ecb', size: 26 });
  }
}

function draw() {
  buttons = [];
  ctx.clearRect(0, 0, W, H);
  if (!g) return;
  drawTopBar();
  drawTickets();
  drawKettle();
  drawTabs();
  drawPanel();
  btn('book', 10, Y_BOOK, 380, 44, '📖 레시피북', { size: 18, color: '#c9b8ff', tap: openBook, r: 22 });

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y + 1, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, (0.9 - t.t) * 3);
    label(t.text, t.x, t.y, t.size, t.color);
  }
  ctx.globalAlpha = 1;
  if (banner && state === 'play') {
    const s = 1 + Math.max(0, 0.25 - banner.t) * 1.4, a = Math.min(1, (1.9 - banner.t) * 2.5);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 404); ctx.scale(s, s);
    panel(-170, -44, 340, banner.sub ? 92 : 62, 22, banner.bad ? '#ffd0d8' : '#ffd23f', 5);
    plain(banner.text, 0, banner.sub ? -14 : 0, 30, INK);
    if (banner.sub) wrap(banner.sub, 0, 22, 320, 15, '#6b5c95', 18);
    ctx.restore();
  }
}

function update(dt) {
  clock += dt;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const t of texts) { t.t += dt; t.y -= 26 * dt; }
  texts = texts.filter((t) => t.t < 0.9);
  if (banner) { banner.t += dt; if (banner.t > 1.9) banner = null; }
  if (state !== 'play' || !g) return;
  C.update(g, dt);
  handleEvents();
}

function updateHud() {
  $('coins').textContent = g ? g.coins.toLocaleString() : '0';
  $('best').textContent = best.toLocaleString();
}

// ---------- 루프 ----------
let last = performance.now(), hudT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (state !== 'paused') update(dt);
  hudT += dt; if (hudT > 0.25) { hudT = 0; updateHud(); }
  draw();
  requestAnimationFrame(frame);
}

// ---------- 입력 ----------
function assignTicket(orderId) {
  const si = C.freeStation(g);
  if (si < 0) { banner = { text: '자리가 없어요!', sub: '한 잔을 끝내면 자리가 나요', t: 0, bad: true }; sfx.bad(); return; }
  C.assign(g, orderId, si);
  handleEvents();
}

function toLogical(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
}
function hitButton(p) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (p.x >= b.x - 3 && p.x <= b.x + b.w + 3 && p.y >= b.y - 3 && p.y <= b.y + b.h + 6) return b;
  }
  return null;
}
// 누르는 순간 바로 반응한다 (떼기를 기다리지 않아서 아이폰에서 탭이 씹히지 않는다). 누르고 있는 버튼은 손가락별로 기억한다
function pressButton(b, pid) {
  if (b.disabled) { sfx.bad(); return; }
  if (b.hold) { b.down && b.down(); holds.set(pid, b); }
  else b.tap && b.tap();
}
function releasePointer(pid) {
  const b = holds.get(pid);
  if (!b) return;
  holds.delete(pid);
  b.up && b.up();
}
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  const b = hitButton(toLogical(e));
  if (!b) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  pressButton(b, e.pointerId);
});
for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(t, (e) => releasePointer(e.pointerId));
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { state === 'paused' ? resume() : pause(); return; }
  if (e.key === 'm' || e.key === 'M') toggleMute();
});
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('cafeMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// 첫 화면 뒤에 흐릿하게 보일 카페
g = C.newGame(Math.random); g.events.length = 0;
updateHud();
showMenu();
fit();
requestAnimationFrame(frame);

// 테스트용
window.__cf = {
  get g() { return g; }, get state() { return state; }, get focus() { return focus; }, set focus(v) { focus = v; },
  get buttons() { return buttons; }, get banner() { return banner; },
  startGame, update, draw, handleEvents, pause, resume, openBook, showMenu,
  press(id, pid = 1) { const b = buttons.find((x) => x.id === id); if (!b) return false; pressButton(b, pid); return true; },
  release(pid = 1) { releasePointer(pid); },
  W, H,
};
})();
