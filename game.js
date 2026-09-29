'use strict';

// 핸드드립 카페: 화면·입력·흐름. 규칙은 logic.js (LOGIC) 에 있다.
(() => {
const C = LOGIC;

// ---------- 모양 ----------
const W = 400, H = 800;
const INK = '#3b2416';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const Y_TICKETS = 80, Y_COUNTER = 204, Y_KETTLE = 232, Y_TABS = 296, Y_PANEL = 358, PANEL_H = 392, Y_BOOK = 756;

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
  ruined: () => { tone(140, 0.35, 'sawtooth', 0.1, -80); setTimeout(() => tone(90, 0.3, 'square', 0.07, -30), 160); },
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
const ruinFlash = {};                // 자리 번호 → 망쳤을 때 빨갛게 번쩍이는 남은 시간
let mode = store.get('cafeMode') === 'normal' ? 'normal' : 'easy';           // 처음엔 쉬움
const bestKey = (m) => `cafeBest_${m}`, dayKey = (m) => `cafeBestDay_${m}`;
let best = Number(store.get(bestKey(mode))) || 0, bestDay = Number(store.get(dayKey(mode))) || 0;
function setMode(m) { mode = m; store.set('cafeMode', m); best = Number(store.get(bestKey(m))) || 0; bestDay = Number(store.get(dayKey(m))) || 0; }
// 기록 저장: 난이도별로 따로, 로비 카드(cafeBest)에는 두 난이도 중 큰 값
function saveRecords() {
  if (g.coins > best) { best = g.coins; store.set(bestKey(mode), String(best)); }
  if (g.day > bestDay) { bestDay = g.day; store.set(dayKey(mode), String(bestDay)); }
  store.set('cafeBest', String(Math.max(Number(store.get(bestKey('easy'))) || 0, Number(store.get(bestKey('normal'))) || 0)));
}
let clock = 0;

function startGame(m) {
  if (m) setMode(m);
  g = C.newGame(Math.random, mode);
  focus = 0; texts = []; particles = []; banner = null; holds.clear(); crowd.clear(); for (const k of Object.keys(ruinFlash)) delete ruinFlash[k];
  state = 'play';
  hideOverlay();
  updateHud();
  handleEvents();
}

// ---------- 이벤트 (소리·글자) ----------
const qWord = (q) => (q >= 0.95 ? ['완벽!', '#8fe0b0'] : q >= 0.7 ? ['좋아요', '#f6c85f'] : ['아쉬워요', '#ff9a8a']);
function say(text, x, y, color = '#fff', size = 22) { texts.push({ text, x, y, t: 0, color, size }); }
function tabRect(si) {
  const n = g.stations.length, gap = 8, w = (380 - (n - 1) * gap) / n;
  return { x: 10 + si * (w + gap), y: Y_TABS, w, h: 56 };
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
      customerLeaves(e.order, true);
      const r = tabRect(e.station);
      say(`+${e.coins.toLocaleString()}`, r.x + r.w / 2, r.y + 20, P.butter, 24);
      say('⭐'.repeat(e.stars), r.x + r.w / 2, r.y + 46, '#fff', 20);
      for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 100; particles.push({ x: r.x + r.w / 2, y: r.y + 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.6, col: [P.butter, P.peach, P.mint][i % 3] }); }
      sfx.served(e.stars);
      updateHud();
    } else if (e.type === 'ruined') {
      const r = tabRect(e.station), m = C.menuOf(e.order.menuId);
      ruinFlash[e.station] = 1.6;
      say('☠ 망했어요', r.x + r.w / 2, r.y + 26, '#ff9a8a', 22);
      for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 110; particles.push({ x: r.x + r.w / 2, y: r.y + 28, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.7, col: i % 2 ? '#6b3f1d' : '#3b2416' }); }
      banner = e.reason === 'pour'
        ? { text: '💥 커피를 망쳤어요!', sub: `뜸이 끝나고 너무 오래 뒀어요. ${m.emoji} ${m.name} 처음부터 다시!`, t: 0, bad: true }
        : { text: '🥶 커피가 식었어요!', sub: `다 내리고 너무 오래 뒀어요. ${m.emoji} ${m.name} 처음부터 다시!`, t: 0, bad: true };
      sfx.ruined();
    } else if (e.type === 'left') { customerLeaves(e.order, false); banner = { text: '😢 손님이 떠났어요', sub: '❤️ 하나를 잃었어요', t: 0, bad: true }; sfx.left(); }
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
  saveRecords();
  updateHud();
  const nextDay = g.day + 1;
  const newMenus = C.MENUS.filter((m) => m.unlockDay === nextDay);
  const moreSeats = C.stationCount(nextDay) > g.stations.length;
  const avg = g.dayServed ? (g.dayStars / g.dayServed).toFixed(1) : '-';
  sfx.day();
  showOverlay(`
    <h2 class="inked">Day ${g.day} 마감!</h2>
    <span class="tag">${g.cfg.name}</span>
    <div class="big inked">+${g.dayCoins.toLocaleString()}</div>
    <span class="tag">${'❤️'.repeat(g.hearts)}${'🖤'.repeat(g.maxHearts - g.hearts)}</span>
    <div class="card"><dl class="stats">
      <dt>만든 커피</dt><dd>${g.dayServed}잔</dd>
      <dt>놓친 손님</dt><dd>${g.dayLost}명</dd>
      <dt>망친 커피</dt><dd>${g.dayRuined}잔</dd>
      <dt>평균 별</dt><dd>${avg}</dd>
      <dt>지금까지</dt><dd>${g.coins.toLocaleString()}</dd>
    </dl></div>
    ${newMenus.length || moreSeats ? `<div class="card" style="text-align:center">🎉 내일은<br>${newMenus.map((m) => `<b>${m.emoji} ${m.name}</b> 메뉴가 열려요`).join('<br>')}${moreSeats ? `<br><b>☕ 자리가 ${C.stationCount(nextDay)}개</b>로 늘어요` : ''}</div>` : ''}
    <button data-act="next">다음 날</button>
    <button class="sub" data-act="book">📖 레시피북</button>`);
}

function gameOver() {
  state = 'over';
  saveRecords();
  updateHud();
  sfx.end();
  const isBest = g.coins >= best && g.coins > 0;
  setTimeout(() => showOverlay(`
    <h2 class="inked">카페 문 닫음…</h2>
    <span class="tag">${g.cfg.name} 난이도</span>
    <div class="big inked">${g.coins.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${best.toLocaleString()}`}</span>
    <div class="card"><dl class="stats">
      <dt>버틴 날</dt><dd>Day ${g.day}</dd>
      <dt>만든 커피</dt><dd>${g.served}잔</dd>
      <dt>별 3개</dt><dd>${g.best.stars3}잔</dd>
      <dt>망친 커피</dt><dd>${g.ruined}잔</dd>
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
      푸어 ${m.pours.join(' + ')} = ${C.totalWater(m)}g <span style="color:#8a6a52">(누적 ${cum.join('→')})</span></div>`;
  }).join('');
}
function showBook(back) {
  const day = g ? g.day : 7;
  showOverlay(`
    <h2 class="inked">📖 레시피북</h2>
    <div class="book">${recipeRows(day)}
      <div class="note">⏱ 뜸이 끝나고 ${Math.round(C.pourWindow(day, g ? g.cfg : C.MODES[mode]))}초 안에 붓기 시작하지 않으면, 또 다 내리고 ${(g ? g.cfg : C.MODES[mode]).serve}초 안에 서빙하지 않으면 커피가 망가져 처음부터 다시!<br>핫: 테츠 카스야 4:6 방식(20g · 300g · 92°C) 참고<br>아이스: 일본식 급랭 — 얼음을 서버에 먼저 담고 그 위로 내려요<br>첫 푸어는 원두의 2배로 뜸을 들이고, 뜸 시간은 게임에서 짧게 줄였어요</div>
    </div>
    <button data-act="${back}">닫기</button>`);
}

function showMenu() {
  state = 'menu';
  showOverlay(`
    <h1>핸드드립 <span class="p">카페</span></h1>
    <p>주문은 밀려오고, 레시피는 헷갈리고…<br>원두·분쇄·온도·린싱·<b>푸어 4번</b>까지 정확하게!</p>
    <button data-act="start" data-mode="easy" ${mode === 'easy' ? '' : 'class="sub"'}>😊 쉬움으로 오픈</button>
    <button data-act="start" data-mode="normal" ${mode === 'normal' ? '' : 'class="sub"'}>🔥 보통(원래 난이도)</button>
    <p class="hint">쉬움: 오차가 넓고, 목표에 다가가면 저절로 느려지고, 하트 5개</p>
    <button class="sub" data-act="bookMenu">📖 레시피북</button>
    ${bestDay ? `<span class="tag">🏆 최고 ${best.toLocaleString()} · Day ${bestDay}</span>` : ''}
    <div class="card">
      🧾 주문 카드를 눌러 빈 자리에 올려요<br>
      ⚖️ 계량 → ⚙️ 분쇄 → 🌡 온도 → 🚿 린싱 → 💧 푸어 ×4<br>
      🧊 아이스는 얼음 계량과 저어주기가 더 있어요<br>
      ⏱ 뜸이 끝나고 제한 시간 안에 붓지 않으면 커피가 망가져요<br>      🔥 주전자는 모든 자리가 같이 써요. 식기 전에 다시 데워요!
    </div>`);
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'start') startGame(btn.dataset.mode);
  else if (act === 'again') startGame();
  else if (act === 'next') { C.nextDay(g); focus = 0; texts = []; crowd.clear(); state = 'play'; hideOverlay(); updateHud(); handleEvents(); }
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
// 카페 색: 에스프레소 브라운 테두리, 크림 종이, 카라멜 나무, 초록 칠판
const P = {
  cream: '#fff4e0', paper: '#fffaf0', latte: '#f3dfc0', wood: '#c98f56', woodDark: '#8b5a2b', coffee: '#6f4327',
  chalk: '#2f4a3f', chalkLine: '#f7f1e3', butter: '#f6c85f', berry: '#d9694a', mint: '#7fc8a0', sky: '#6fb3c8', peach: '#e58f7a', muted: '#8a6a52',
};
function label(text, x, y, size, fill = P.cream, align = 'center') {
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
// 나무 판: 바탕색 위에 결 무늬
function wood(x, y, w, h, r, base = P.wood, dark = P.woodDark, lift = 4) {
  ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill();
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = dark; ctx.globalAlpha = 0.28; ctx.lineWidth = 1.4;
  for (let yy = y + 5, i = 0; yy < y + h; yy += 8, i++) {
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + w * 0.3, yy - 2 - (i % 3), x + w * 0.65, yy + 2 + (i % 2), x + w, yy); ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
}
function chalkboard(x, y, w, h, r = 10) {
  ctx.fillStyle = P.chalk; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
  ctx.strokeStyle = 'rgba(247,241,227,.16)'; ctx.lineWidth = 1.5; roundRect(ctx, x + 4, y + 4, w - 8, h - 8, r - 3); ctx.stroke();
}
function chalk(text, x, y, size, align = 'center', color = P.chalkLine) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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

// 누를 곳을 그리고, 이번 프레임 목록에 넣는다. o.draw 가 있으면 모양은 그쪽이 그린다
function btn(id, x, y, w, h, text, o = {}) {
  const b = { id, x, y, w, h, hold: !!o.hold, down: o.down, up: o.up, tap: o.tap, disabled: !!o.disabled };
  buttons.push(b);
  const pressed = [...holds.values()].some((v) => v.id === id);
  if (o.draw) { o.draw(x, y + (pressed ? 2 : 0), w, h, pressed); return b; }
  const fill = b.disabled ? '#d9cbb6' : (o.color || '#c07a3a'), dy = pressed ? 3 : 0;
  ctx.globalAlpha = b.disabled ? 0.75 : 1;
  panel(x, y + dy, w, h, o.r || 20, fill, pressed ? 1 : 5);
  if (!b.disabled) { ctx.fillStyle = 'rgba(255,255,255,.28)'; roundRect(ctx, x + 10, y + dy + 6, w - 20, 6, 3); ctx.fill(); }
  const lines = String(text).split('\n');
  lines.forEach((ln, i) => label(ln, x + w / 2, y + dy + h / 2 + (i - (lines.length - 1) / 2) * (o.size || 20) * 1.15, o.size || 20, b.disabled ? '#a99a84' : P.cream));
  ctx.globalAlpha = 1;
  return b;
}

// ---------- 그리기 ----------
const menuOfOrder = (o) => C.menuOf(o.menuId);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// 가게 처마(어닝): 빨강·크림 줄무늬에 물결 끝
function drawAwning() {
  const n = 16, w = W / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? P.paper : P.berry;
    ctx.fillRect(i * w, 0, w + 1, 14);
    ctx.beginPath(); ctx.arc(i * w + w / 2, 14, w / 2, 0, Math.PI); ctx.fill();
  }
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(i * w + w / 2, 14, w / 2, 0, Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.stroke();
}

function drawTopBar() {
  drawAwning();
  wood(10, 32, 96, 26, 10, P.wood, P.woodDark, 3);
  label(`Day ${g.day}`, 58, 46, 19, P.cream);
  for (let i = 0; i < g.maxHearts; i++) emoji(i < g.hearts ? '❤️' : '🖤', 128 + i * 24, 46, 20, i < g.hearts ? 1 : 0.45);
  const left = Math.max(0, C.DAY_LEN - g.clock);
  plain(g.phase === 'open' ? `영업 ${fmtTime(left)}` : '마감 준비 중', W - 12, 46, 18, g.phase === 'open' ? INK : P.berry, 'right');
  panel(10, 64, 380, 9, 4.5, P.paper, 2);
  ctx.fillStyle = P.mint; roundRect(ctx, 12, 66, Math.max(8, 376 * Math.min(1, g.clock / C.DAY_LEN)), 5, 2.5); ctx.fill();
}

// 주문서: 빨래줄에 집게로 걸린 종이 쪽지 (아래는 톱니)
function slipPath(x, y, w, h) {
  const t = 6, r = 8;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.lineTo(x + w, y + h - 6);
  const n = 9, tw = w / n;
  for (let i = 0; i < n; i++) { ctx.lineTo(x + w - (i + 0.5) * tw, y + h); ctx.lineTo(x + w - (i + 1) * tw, y + h - 6); }
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// ---------- 손님 ----------
// 손님은 오른쪽 문으로 걸어 들어와 자기 칸에서 기다리고, 커피를 받으면 좋아하며, 화나면 씩씩대며 나간다.
const SLOTS = 5, SLOT_W = 72, SLOT_GAP = 5, SLOT_X0 = (W - (SLOTS * SLOT_W + (SLOTS - 1) * SLOT_GAP)) / 2;
const slotX = (i) => SLOT_X0 + i * (SLOT_W + SLOT_GAP);
const FACES = ['👩', '👨', '🧑', '👧', '👦', '👵', '👴', '👱', '🧔'];
const crowd = new Map();          // 주문 번호 → 손님 { slot, x, state: in | wait | happy | sad, t, face }

function freeSlot() {
  const used = new Set([...crowd.values()].filter((c) => c.state === 'in' || c.state === 'wait').map((c) => c.slot));
  for (let i = 0; i < SLOTS; i++) if (!used.has(i)) return i;
  return 0;
}
// 주문이 생기면 손님이 문에서 출발하고, 주문이 사라지면 (서빙·떠남 이벤트로 이미 표시된 손님만 남기고) 정리한다
function syncCrowd() {
  for (const o of g.orders) {
    if (!crowd.has(o.id)) crowd.set(o.id, { id: o.id, slot: freeSlot(), x: W + 30, state: 'in', t: 0, face: FACES[(o.id * 5 + 3) % FACES.length] });
  }
  for (const [id, c] of crowd) {
    if ((c.state === 'in' || c.state === 'wait') && !g.orders.some((o) => o.id === id)) crowd.delete(id);
  }
}
function updateCrowd(dt) {
  for (const [id, c] of crowd) {
    c.t += dt;
    if (c.state === 'in') {
      const tx = slotX(c.slot) + SLOT_W / 2;
      c.x = Math.max(tx, c.x - 330 * dt);
      if (c.x <= tx) { c.state = 'wait'; c.t = 0; }
    } else if (c.state === 'happy') { if (c.t > 0.7) c.x += 260 * dt; }
    else if (c.state === 'sad') { if (c.t > 0.5) c.x += 340 * dt; }
    if (c.x > W + 40) crowd.delete(id);
  }
}
function customerLeaves(order, happy) {
  const c = crowd.get(order.id);
  if (!c) return;
  if (c.state === 'in') { crowd.delete(order.id); return; }
  c.state = happy ? 'happy' : 'sad'; c.t = 0;
}

function drawCrowd() {
  const baseY = Y_COUNTER - 21;
  const list = [...crowd.values()].sort((a, b) => a.slot - b.slot);
  for (const c of list) {
    const o = g.orders.find((x) => x.id === c.id);
    const walking = c.state === 'in' || (c.state === 'happy' && c.t > 0.7) || (c.state === 'sad' && c.t > 0.5);
    let y = baseY, tilt = 0;
    if (walking) { y -= Math.abs(Math.sin(c.t * 16)) * 5; tilt = Math.sin(c.t * 16) * 0.08; }
    else if (c.state === 'wait') y -= Math.sin(clock * 2 + c.id) * 1.5;               // 가만히 서서 살짝 들썩
    else if (c.state === 'happy') y -= Math.abs(Math.sin(c.t * 9)) * 14;             // 좋아서 폴짝
    else if (c.state === 'sad') y -= Math.abs(Math.sin(c.t * 30)) * 3;               // 씩씩
    ctx.save(); ctx.translate(c.x, y); ctx.rotate(tilt);
    // 몸(앞치마 대신 옷깃): 얼굴 아래 둥근 어깨
    ctx.fillStyle = ['#7fb7c9', '#d9694a', '#8fbf7a', '#b98ad0', '#e0a02e'][c.id % 5];
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 26, 25, 19, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    emoji(c.state === 'happy' ? '😋' : c.state === 'sad' ? '😠' : c.face, 0, 0, 42);
    ctx.restore();
    // 기분: 참을성이 줄면 땀, 바닥나기 직전엔 분노
    if (c.state === 'wait' && o) {
      const k = o.patience / o.patienceMax;
      if (k < 0.25) emoji('💢', c.x + 22, y - 16 + Math.sin(clock * 14) * 2, 20);
      else if (k < 0.5) emoji('💧', c.x + 21, y - 12, 16);
      if (o.changed && Math.sin(clock * 10) > 0) emoji('❗', c.x - 22, y - 16, 18);
    }
    if (c.state === 'happy') { emoji('❤️', c.x + 14, y - 22 - c.t * 16, 18, Math.max(0, 1 - c.t)); if (c.t > 0.3) emoji('☕', c.x - 22, y + 4, 18); }
    if (c.state === 'sad') emoji('💢', c.x + 18, y - 20, 20);
  }
  // 카운터 윗판: 손님의 아랫부분을 가린다
  wood(-6, Y_COUNTER, W + 12, 22, 8, P.wood, P.woodDark, 3);
  if (g.day === 1 && g.orders.some((o) => o.station < 0 && crowd.get(o.id) && crowd.get(o.id).state === 'wait')) label('👆 주문서를 눌러 자리에 올려요', W / 2, Y_COUNTER + 11, 14, P.butter);
  else if (!g.orders.length && !crowd.size) plain(g.phase === 'open' ? '손님을 기다리는 중…' : '마지막 주문을 마무리해요', W / 2, Y_COUNTER + 11, 14, P.cream);
}

function drawTickets() {
  const ry = Y_TICKETS + 2;
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(4, ry); ctx.lineTo(W - 4, ry); ctx.stroke();
  ctx.strokeStyle = P.woodDark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, ry); ctx.lineTo(W - 4, ry); ctx.stroke();
  const w = SLOT_W, h = 66;
  for (let i = 0; i < SLOTS; i++) {
    const x = slotX(i), y = Y_TICKETS + 10;
    const c = [...crowd.values()].find((q) => q.slot === i && q.state === 'wait');
    const o = c && g.orders.find((q) => q.id === c.id);
    if (!o) { ctx.strokeStyle = 'rgba(111,67,39,.35)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; slipPath(x, y, w, h); ctx.stroke(); ctx.setLineDash([]); continue; }
    const m = menuOfOrder(o), taken = o.station >= 0, k = o.patience / o.patienceMax;
    const urgent = !taken && k < 0.25, flash = o.changed && Math.sin(clock * 12) > 0;
    const shake = urgent ? Math.sin(clock * 30) * 1.5 : 0;
    const pop = Math.min(1, c.t * 5);                                              // 손님이 도착하면 주문서가 톡 걸린다
    btn(`ticket:${o.id}`, x, y, w, h, '', {
      tap: () => assignTicket(o.id),
      draw: (bx, by) => {
        by -= (1 - pop) * 14;
        ctx.save(); ctx.globalAlpha = pop; ctx.translate(shake, 0);
        ctx.globalAlpha = pop * (taken ? 0.6 : 1);
        ctx.fillStyle = INK; slipPath(bx, by + 4, w, h); ctx.fill();
        ctx.fillStyle = flash ? '#ffd9c9' : taken ? '#e6d8bf' : P.paper; slipPath(bx, by, w, h); ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = urgent ? P.berry : INK; slipPath(bx, by, w, h); ctx.stroke();
        emoji(m.emoji, bx + w / 2, by + 20, 24);
        (SHORT[m.id] || [m.name]).forEach((ln, j, arr) => plain(ln, bx + w / 2, by + 38 + (j - (arr.length - 1) / 2) * 12, 12, INK));
        ctx.fillStyle = 'rgba(59,36,22,.18)'; roundRect(ctx, bx + 7, by + h - 15, w - 14, 6, 3); ctx.fill();
        ctx.fillStyle = k > 0.5 ? '#5aa469' : k > 0.25 ? '#e0a02e' : P.berry;
        roundRect(ctx, bx + 7, by + h - 15, Math.max(6, (w - 14) * k), 6, 3); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = pop;
        ctx.fillStyle = P.butter; ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
        roundRect(ctx, bx + w / 2 - 7 + shake, by - 12, 14, 20, 4); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + w / 2 - 7 + shake, by - 2); ctx.lineTo(bx + w / 2 + 7 + shake, by - 2); ctx.stroke();
        if (taken) { ctx.save(); ctx.translate(bx + w - 14, by + 14); ctx.rotate(0.3); label(`${o.station + 1}번`, 0, 0, 13, P.cream); ctx.restore(); }
        ctx.globalAlpha = 1;
      },
    });
  }
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

// 주전자: 나무 선반 위 칠판에 온도, 오른쪽에 불·찬물 버튼
function drawKettle() {
  const y = Y_KETTLE, k = g.kettle;
  wood(10, y, 380, 58, 14, P.wood, P.woodDark, 4);
  chalkboard(17, y + 6, 252, 46, 10);
  emoji('🫖', 36, y + 23, 26);
  const fs = g.stations[focus], fm = fs && fs.order ? menuOfOrder(fs.order) : null;
  const dev = fm ? Math.abs(k.temp - fm.temp) : 0;
  chalk(`${k.temp.toFixed(1)}°C`, 76, y + 23, 23, 'left', fm && dev > 2 ? '#ff9a8a' : P.chalkLine);
  if (fm) chalk(`필요 ${fm.temp}°C`, 76, y + 42, 12, 'left', 'rgba(247,241,227,.7)');
  const bx = 156, bw = 104, by = y + 16, bh = 14, lo = 20, hi = 100, pos = (t) => bx + ((t - lo) / (hi - lo)) * bw;
  ctx.fillStyle = 'rgba(247,241,227,.18)'; roundRect(ctx, bx, by, bw, bh, 7); ctx.fill();
  const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#7fd3ff'); gr.addColorStop(0.6, '#ffc35a'); gr.addColorStop(1, '#ff6a4d');
  ctx.fillStyle = gr; roundRect(ctx, bx, by, Math.max(7, pos(k.temp) - bx), bh, 7); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = P.chalkLine; roundRect(ctx, bx, by, bw, bh, 7); ctx.stroke();
  for (const n of neededTemps()) {
    const x = pos(n.temp);
    ctx.fillStyle = n.si === focus ? P.butter : 'rgba(246,200,95,.55)';
    ctx.beginPath(); ctx.moveTo(x, by + bh + 2); ctx.lineTo(x - 5, by + bh + 11); ctx.lineTo(x + 5, by + bh + 11); ctx.closePath(); ctx.fill();
  }
  btn('heat', 278, y + 4, 64, 50, '🔥', { hold: true, size: 26, color: P.berry, r: 18, down: () => C.heat(g, true), up: () => C.heat(g, false) });
  btn('cool', 348, y + 4, 36, 50, '💧', { size: 22, color: P.sky, r: 18, tap: () => { C.cool(g); sfx.tap(); } });
}

// 자리: 나무 쟁반
function drawTabs() {
  g.stations.forEach((st, si) => {
    const r = tabRect(si), o = st.order, sel = si === focus;
    btn(`tab:${si}`, r.x, r.y, r.w, r.h, '', {
      tap: () => { focus = si; sfx.tap(); },
      draw: (bx, by, bw, bh) => {
        wood(bx, by, bw, bh, 14, sel ? P.butter : P.latte, sel ? '#c98f30' : P.wood, sel ? 3 : 4);
        if (sel) { ctx.lineWidth = 3.5; ctx.strokeStyle = INK; roundRect(ctx, bx + 3, by + 3, bw - 6, bh - 6, 11); ctx.stroke(); }
        if (ruinFlash[si] > 0 && Math.sin(clock * 20) > -0.3) { ctx.fillStyle = 'rgba(255,60,45,.35)'; roundRect(ctx, bx, by, bw, bh, 14); ctx.fill(); }
        if (!o) { plain(`${si + 1}번 자리`, bx + bw / 2, by + 21, 15, P.coffee); plain('비어 있어요', bx + bw / 2, by + 40, 13, P.muted); return; }
        const m = menuOfOrder(o), steps = C.stepsFor(m);
        emoji(m.emoji, bx + 24, by + 23, 26);
        const stepNow = steps[st.idx], what = st.window > 0 ? '붓기!' : st.wait > 0 ? '뜸 들이는 중' : stepInfo(m, st, stepNow)[0].replace(/^[①-⑪]\s*/, '');
        plain(what, bx + 50, by + 19, bw > 150 ? 14 : 13, st.window > 0 ? P.berry : INK, 'left');
        const dotW = Math.min(9, (bw - 24) / steps.length);
        steps.forEach((s, i) => {
          ctx.fillStyle = i < st.idx ? '#4f9a5d' : i === st.idx ? P.berry : 'rgba(59,36,22,.3)';
          ctx.beginPath(); ctx.arc(bx + 12 + i * dotW + dotW / 2, by + 45, i === st.idx ? 3.8 : 2.8, 0, Math.PI * 2); ctx.fill();
        });
        if (st.window > 0) label(`!${Math.ceil(st.window)}`, bx + bw - 10, by + 19, 17, Math.sin(clock * 12) > 0 ? '#ff5a4d' : P.cream, 'right');   // 지금 부어야 한다
        else if (st.wait > 0) label(`${Math.ceil(st.wait)}s`, bx + bw - 10, by + 19, 15, '#bfeaff', 'right');
        else if (st.cold > 0 && st.cold < 12) label(`❄${Math.ceil(st.cold)}`, bx + bw - 10, by + 19, 15, '#bfeaff', 'right');
        else if (st.hold) label('●', bx + bw - 10, by + 19, 15, P.berry, 'right');
        const urgent = (st.window > 0 && st.window < 5) || (st.cold > 0 && st.cold < 7);
        if (urgent && !sel && Math.sin(clock * 12) > 0) { ctx.lineWidth = 4; ctx.strokeStyle = '#ff3b2d'; roundRect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 12); ctx.stroke(); }
      },
    });
  });
}

// 단계별 제목·안내
function stepInfo(m, st, step) {
  const steps = C.stepsFor(m), n = CIRCLED[steps.indexOf(step)] || '';
  if (step === 'beans') return [`${n} 원두 계량`, `원두 ${m.beans}g 을 담아요 (오차 ±${g.cfg.beans[0]}g)`];
  if (step === 'grind') return [`${n} 분쇄`, `분쇄도 「${C.GRINDS[m.grind]}」 를 고르고 손잡이를 돌려요`];
  if (step === 'temp') return [`${n} 물 온도`, `주전자를 ${m.temp}°C 에 맞추고 확인해요 (오차 ±${g.cfg.temp[0]}°C)`];
  if (step === 'rinse') return [`${n} 린싱`, '필터에 뜨거운 물을 적셔요. 초록 칸에서 손을 떼요'];
  if (step === 'ice') return [`${n} 얼음 계량`, `서버에 얼음 ${m.ice}g 을 담아요 (오차 ±${g.cfg.ice[0]}g)`];
  if (step.startsWith('pour')) {
    const k = Number(step.slice(4)), cum = m.pours.slice(0, k).reduce((a, b) => a + b, 0);
    return [`${n} ${k === 1 ? '뜸 들이기' : `푸어 ${k}/4`}`, `이번엔 ${m.pours[k - 1]}g (누적 ${cum}g). 주전자 ${m.temp}°C 를 확인해요`];
  }
  if (step === 'swirl') return [`${n} 저어주기`, '서버를 빙글빙글 돌려 얼음과 섞어요'];
  return [`${n} 서빙`, '완성! 손님에게 내가요'];
}

function drawGauge(x, y, w, h, value, max, target, tol, fillColor) {
  ctx.fillStyle = 'rgba(59,36,22,.14)'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  if (target !== null) { ctx.fillStyle = 'rgba(90,164,105,.5)'; ctx.fillRect(x + ((target - tol) / max) * w, y, (tol * 2 / max) * w, h); }
  ctx.fillStyle = fillColor; roundRect(ctx, x, y, Math.max(h, Math.min(1, value / max) * w), h, h / 2); ctx.fill();
  if (target !== null) { ctx.fillStyle = INK; ctx.fillRect(x + (target / max) * w - 1.5, y - 4, 3, h + 8); }
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
}

function holdBtn(id, x, y, w, h, text, si, name, o = {}) {
  return btn(id, x, y, w, h, text, { hold: true, color: o.color || '#5aa469', disabled: o.disabled, size: o.size, down: () => { if (C.act(g, si, name, true)) sfx.tap(); }, up: () => C.act(g, si, name, false) });
}
function tapBtn(id, x, y, w, h, text, si, name, o = {}) {
  return btn(id, x, y, w, h, text, { color: o.color, disabled: o.disabled, size: o.size, tap: () => { const r = C.act(g, si, name, true, o.arg); if (r) (name === 'crank' ? sfx.crank : sfx.tap)(); else sfx.bad(); } });
}

// 김: 따뜻한 커피 위로 피어오르는 곡선
function steam(x, y, h, seed = 0) {
  ctx.strokeStyle = 'rgba(111,67,39,.28)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const bx = x + (i - 1) * 16, ph = clock * 2 + i * 1.7 + seed;
    ctx.beginPath(); ctx.moveTo(bx, y);
    for (let t = 1; t <= 6; t++) ctx.lineTo(bx + Math.sin(ph + t * 0.9) * 5, y - (t / 6) * h);
    ctx.stroke();
  }
}

function drawPanel() {
  const st = g.stations[focus], x = 10, y = Y_PANEL, w = 380;
  wood(x, y, w, PANEL_H, 22, P.wood, P.woodDark, 5);
  // 안쪽 크림 깔개
  ctx.fillStyle = P.paper; roundRect(ctx, x + 7, y + 7, w - 14, PANEL_H - 14, 16); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x + 7, y + 7, w - 14, PANEL_H - 14, 16); ctx.stroke();
  if (!st || !st.order) {
    emoji('☕', W / 2, y + 150, 64, 0.55);
    wrap(g.orders.some((o) => o.station < 0) ? '위의 주문서를 눌러 이 자리에 올려요' : '주문이 들어오면 여기서 커피를 내려요', W / 2, y + 230, 300, 18, P.muted);
    return;
  }
  const m = menuOfOrder(st.order), step = C.stepsFor(m)[st.idx], si = focus;
  const [title, hint] = stepInfo(m, st, step);
  // 칠판 제목줄
  chalkboard(x + 14, y + 14, w - 28, 38, 10);
  chalk(title, x + 28, y + 33, 22, 'left');
  // 제한 시간: 뜸이 끝난 뒤 붓기 시작까지 / 다 내린 뒤 서빙까지. 넘기면 커피가 망가진다
  const lim = st.window > 0 ? { v: st.window, max: C.pourWindow(g.day, g.cfg), tag: '⏱ 지금 부어요' } : st.cold > 0 ? { v: st.cold, max: g.cfg.serve, tag: '❄ 식기 전에' } : null;
  if (lim) {
    const kk = lim.v / lim.max, hot = kk < 0.35;
    chalk(`${lim.tag} ${lim.v.toFixed(1)}s`, x + w - 26, y + 33, 15, 'right', hot && Math.sin(clock * 12) > 0 ? '#ff8a7a' : hot ? '#ffb3a3' : P.butter);
    ctx.fillStyle = 'rgba(59,36,22,.16)'; roundRect(ctx, x + 22, y + 56, w - 44, 7, 3.5); ctx.fill();
    ctx.fillStyle = kk > 0.5 ? '#5aa469' : kk > 0.25 ? '#e0a02e' : '#e0402d'; roundRect(ctx, x + 22, y + 56, Math.max(7, (w - 44) * kk), 7, 3.5); ctx.fill();
  } else if (st.wait > 0) chalk(`뜸 들이는 중 ${st.wait.toFixed(1)}s`, x + w - 26, y + 33, 14, 'right', '#bfeaff');
  else chalk(`${m.emoji} ${m.name}`, x + w - 26, y + 33, 14, 'right', 'rgba(247,241,227,.75)');
  const tempOff = (step === 'temp' || step.startsWith('pour')) && Math.abs(g.kettle.temp - m.temp) > 2 && step !== 'temp';
  if (tempOff) wrap(`🌡 주전자 ${g.kettle.temp.toFixed(0)}°C — ${m.temp}°C 로 맞춰요!`, W / 2, y + 74, 340, 15, '#d9483a', 19);
  else wrap(hint, W / 2, y + 74, 340, 15, P.muted, 19);
  const cy = y + 96;

  if (step === 'beans' || step === 'ice') {
    const key = step, val = st[key], target = m[key], isBeans = step === 'beans';
    // 주방 저울
    wood(x + 70, cy - 4, 240, 84, 16, P.latte, P.wood, 3);
    ctx.fillStyle = '#2a2118'; roundRect(ctx, x + 84, cy + 6, 212, 60, 10); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x + 84, cy + 6, 212, 60, 10); ctx.stroke();
    plain(`${isBeans ? val.toFixed(1) : Math.round(val)} g`, W / 2, cy + 38, 40, '#b6f0c2');
    drawGauge(x + 30, cy + 110, 320, 22, val, target * 1.4, target, isBeans ? g.cfg.beans[0] : g.cfg.ice[0], isBeans ? '#a5703c' : '#9fd4e6');
    plain(`목표 ${target}g`, x + 30 + (target / (target * 1.4)) * 320, cy + 150, 15, INK);
    const by = y + 290;
    holdBtn('add', x + 16, by, 188, 84, isBeans ? '🫘 꾹 눌러\n담기' : '🧊 꾹 눌러\n담기', si, 'add', { size: 20 });
    tapBtn('sub', x + 212, by, 74, 84, isBeans ? '−0.5' : '−5', si, 'sub', { color: '#d9765f', size: 20 });
    tapBtn('confirm', x + 294, by, 70, 84, '확정\n✔', si, 'confirm', { color: '#4f9db8', size: 19 });
  } else if (step === 'grind') {
    C.GRINDS.forEach((gname, i) => {
      const bx = x + 16 + i * 89, sel = st.grindSel === i;
      btn(`grind:${i}`, bx, cy + 4, 83, 66, '', {
        tap: () => { C.act(g, si, 'grind', true, i); sfx.tap(); },
        draw: (dx, dy, dw, dh) => {
          wood(dx, dy, dw, dh, 14, sel ? P.butter : P.latte, sel ? '#c98f30' : P.wood, sel ? 2 : 4);
          if (sel) { ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, dx + 3, dy + 3, dw - 6, dh - 6, 11); ctx.stroke(); }
          const lines = gname.split(' ');
          lines.forEach((ln, j) => plain(ln, dx + dw / 2, dy + dh / 2 + (j - (lines.length - 1) / 2) * 19, 17, INK));
        },
      });
    });
    drawGauge(x + 30, cy + 110, 320, 22, st.cranks, C.CRANKS, null, 0, '#a5703c');
    plain(st.grindSel < 0 ? '먼저 분쇄도를 골라요' : `${st.cranks} / ${C.CRANKS}`, W / 2, cy + 152, 16, P.muted);
    tapBtn('crank', x + 60, y + 290, 260, 90, st.grindSel < 0 ? '분쇄도를\n먼저 골라요' : '⚙️ 탭탭탭! 갈기', si, 'crank', { disabled: st.grindSel < 0, size: 22 });
  } else if (step === 'temp') {
    const dev = Math.abs(g.kettle.temp - m.temp), col = dev <= 1 ? '#4f9a5d' : dev <= 3 ? '#e0a02e' : P.berry;
    plain(`${g.kettle.temp.toFixed(1)}°C`, W / 2, cy + 60, 64, col);
    plain(`필요 ${m.temp}°C`, W / 2, cy + 116, 22, INK);
    wrap('위쪽 🔥 를 꾹 눌러 데우고 💧 로 식혀요', W / 2, cy + 160, 320, 15, P.muted);
    tapBtn('confirm', x + 60, y + 290, 260, 84, '🌡 온도 OK!', si, 'confirm', { color: '#4f9db8', size: 24 });
  } else if (step === 'rinse') {
    ctx.fillStyle = 'rgba(59,36,22,.14)'; roundRect(ctx, x + 30, cy + 40, 320, 34, 17); ctx.fill();
    ctx.fillStyle = 'rgba(90,164,105,.5)'; ctx.fillRect(x + 30 + 320 * 0.5, cy + 40, 320 * 0.35, 34);
    ctx.fillStyle = '#9fd4e6'; roundRect(ctx, x + 30, cy + 40, Math.max(34, 320 * st.rinse), 34, 17); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; roundRect(ctx, x + 30, cy + 40, 320, 34, 17); ctx.stroke();
    emoji('🚿', W / 2, cy + 130, 56);
    holdBtn('rinse', x + 30, y + 290, 320, 84, '🚿 꾹 눌러 린싱', si, 'rinse', { color: '#4f9db8', size: 24 });
  } else if (step.startsWith('pour')) {
    const k = Number(step.slice(4)), want = m.pours[k - 1], cumTarget = m.pours.slice(0, k).reduce((a, b) => a + b, 0);
    const total = C.totalWater(m), water = st.water + st.poured;
    const gx = x + 150, gy = cy + 30, gw = 132, gh = 158;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; roundRect(ctx, gx, gy, gw, gh, 16); ctx.fill();
    const fh = Math.min(1, water / total) * (gh - 6);
    const cg = ctx.createLinearGradient(0, gy + gh - fh, 0, gy + gh); cg.addColorStop(0, m.ice ? '#b5834f' : '#8a5a34'); cg.addColorStop(1, m.ice ? '#8a5a34' : '#4a2c17');
    ctx.fillStyle = cg; roundRect(ctx, gx + 3, gy + gh - 3 - fh, gw - 6, fh, 12); ctx.fill();
    if (m.ice) { ctx.fillStyle = 'rgba(210,240,255,.85)'; for (let i = 0; i < 3; i++) { roundRect(ctx, gx + 12 + i * 36, gy + gh - 36 - (i % 2) * 8, 26, 26, 6); ctx.fill(); } }
    ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, gx, gy, gw, gh, 16); ctx.stroke();
    const ty = gy + gh - 3 - (cumTarget / total) * (gh - 6);
    ctx.strokeStyle = P.berry; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(gx - 10, ty); ctx.lineTo(gx + gw + 10, ty); ctx.stroke(); ctx.setLineDash([]);
    plain(`${cumTarget}g`, gx + gw + 14, ty, 14, P.berry, 'left');
    // 드리퍼
    ctx.fillStyle = P.paper; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx + 14, gy - 34); ctx.lineTo(gx + gw - 14, gy - 34); ctx.lineTo(gx + gw / 2 + 16, gy + 6); ctx.lineTo(gx + gw / 2 - 16, gy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5a3520'; ctx.beginPath(); ctx.moveTo(gx + 26, gy - 30); ctx.lineTo(gx + gw - 26, gy - 30); ctx.lineTo(gx + gw / 2 + 10, gy + 2); ctx.lineTo(gx + gw / 2 - 10, gy + 2); ctx.closePath(); ctx.fill();
    if (st.hold === 'pour') { ctx.fillStyle = '#6b3f1d'; ctx.fillRect(gx + gw / 2 - 3, gy + 6, 6, Math.max(0, gh - 3 - fh - 6)); }
    plain('이번', x + 22, cy + 50, 14, P.muted, 'left');
    plain(`${st.poured.toFixed(0)} / ${want}g`, x + 22, cy + 74, 20, INK, 'left');
    plain('누적', x + 22, cy + 112, 14, P.muted, 'left');
    plain(`${water.toFixed(0)} / ${cumTarget}g`, x + 22, cy + 136, 17, INK, 'left');
    const waiting = st.wait > 0;
    holdBtn('pour', x + 30, y + 290, 320, 84, waiting ? `뜸 들이는 중… ${st.wait.toFixed(1)}s` : '💧 꾹 눌러 붓기', si, 'pour', { color: '#4f9db8', size: waiting ? 20 : 24, disabled: waiting });
  } else if (step === 'swirl') {
    emoji('🌀', W / 2, cy + 90, 86);
    drawGauge(x + 60, cy + 170, 260, 22, st.swirls, C.SWIRLS, null, 0, '#9fd4e6');
    tapBtn('swirl', x + 60, y + 290, 260, 84, '🌀 빙글빙글!', si, 'swirl', { color: '#4f9db8', size: 24 });
  } else if (step === 'serve') {
    const avg = st.res.reduce((a, b) => a + b, 0) / st.res.length, stars = C.starsOf(avg, g.cfg);
    ctx.fillStyle = 'rgba(59,36,22,.22)'; ctx.beginPath(); ctx.ellipse(W / 2, cy + 100, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.paper; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W / 2, cy + 94, 66, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    emoji(m.emoji, W / 2, cy + 60, 84);
    steam(W / 2, cy + 6, 26, si);
    plain('⭐'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, cy + 148, 32, '#e0a02e');
    plain('예상 평가', W / 2, cy + 182, 14, P.muted);
    tapBtn('serve', x + 60, y + 290, 260, 84, '☕ 서빙하기!', si, 'serve', { color: P.berry, size: 26 });
  }
}

function draw() {
  buttons = [];
  ctx.clearRect(0, 0, W, H);
  if (!g) return;
  drawTopBar();
  drawTickets();
  drawCrowd();
  drawKettle();
  drawTabs();
  drawPanel();
  btn('book', 10, Y_BOOK, 380, 38, '📖 레시피북', { size: 17, color: P.coffee, tap: openBook, r: 19 });

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
    chalkboard(-170, -44, 340, banner.sub ? 92 : 62, 16);
    chalk(banner.text, 0, banner.sub ? -14 : 0, 30, 'center', banner.bad ? '#ffb3a3' : P.butter);
    if (banner.sub) { ctx.globalAlpha = a; wrapChalk(banner.sub, 0, 22, 320, 15, 18); }
    ctx.restore();
  }
}
function wrapChalk(text, x, y, maxW, size, lh) {
  ctx.font = `${size}px ${FONT}`;
  const words = text.split(' '); let line = '', yy = y;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { chalk(line, x, yy, size); yy += lh; line = w; } else line = t;
  }
  if (line) chalk(line, x, yy, size);
}

function update(dt) {
  clock += dt;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const t of texts) { t.t += dt; t.y -= 26 * dt; }
  for (const k of Object.keys(ruinFlash)) { ruinFlash[k] -= dt; if (ruinFlash[k] <= 0) delete ruinFlash[k]; }
  texts = texts.filter((t) => t.t < 0.9);
  if (banner) { banner.t += dt; if (banner.t > 1.9) banner = null; }
  if (state !== 'play' || !g) return;
  C.update(g, dt);
  handleEvents();
  syncCrowd();
  updateCrowd(dt);
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
g = C.newGame(Math.random, mode); g.events.length = 0;
updateHud();
showMenu();
fit();
requestAnimationFrame(frame);

// 테스트용
window.__cf = {
  get g() { return g; }, get state() { return state; }, get focus() { return focus; }, set focus(v) { focus = v; },
  get buttons() { return buttons; }, get banner() { return banner; }, get crowd() { return crowd; },
  startGame, update, draw, handleEvents, pause, resume, openBook, showMenu,
  press(id, pid = 1) { const b = buttons.find((x) => x.id === id); if (!b) return false; pressButton(b, pid); return true; },
  release(pid = 1) { releasePointer(pid); },
  W, H,
};
})();
