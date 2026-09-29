'use strict';

// 핸드드립 카페: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// 손님이 주문을 넣으면, 자리(드리퍼)에 올려 레시피대로 커피를 내린다. 한 잔의 순서:
//   핫    : 원두 계량 → 분쇄 → 물 온도 → 린싱 → 푸어 4번 → 서빙
//   아이스: 원두 계량 → 분쇄 → 물 온도 → 린싱 → 얼음 계량 → 푸어 4번 → 저어주기 → 서빙
// 주전자(물 온도)는 자리들이 함께 쓴다. 한 자리에서 뜸 들이는 동안 다른 주문을 만지다 보면 온도가 식거나 엉킨다.

// 분쇄도 (작을수록 곱다)
const GRINDS = ['고움', '중간 고움', '중간', '굵음'];

// 메뉴. pours 는 푸어마다 넣는 물(g)이고 합이 총 물양. 첫 푸어는 원두의 2배로 뜸을 들인다.
// 근거: 핫 = 테츠 카스야 4:6 (20g · 300g · 92°C), 아이스 = 일본식 급랭 (원두 20g · 뜨거운 물 200g · 얼음 100g)
const MENUS = [
  { id: 'hot', name: '핫 핸드드립', emoji: '☕', ice: 0, beans: 20, temp: 92, grind: 1, pours: [40, 110, 90, 60], price: 4500, unlockDay: 1 },
  { id: 'ice', name: '아이스 핸드드립', emoji: '🧊', ice: 100, beans: 20, temp: 94, grind: 0, pours: [40, 60, 60, 40], price: 5000, unlockDay: 2 },
  { id: 'hotLight', name: '핫 라이트', emoji: '🌼', ice: 0, beans: 18, temp: 94, grind: 0, pours: [36, 84, 80, 70], price: 5000, unlockDay: 3 },
  { id: 'hotDark', name: '핫 다크', emoji: '🌰', ice: 0, beans: 22, temp: 88, grind: 2, pours: [44, 116, 90, 80], price: 5000, unlockDay: 4 },
  { id: 'iceDark', name: '아이스 다크', emoji: '🥃', ice: 110, beans: 22, temp: 90, grind: 1, pours: [44, 66, 66, 44], price: 5500, unlockDay: 5 },
  { id: 'hotLarge', name: '핫 라지', emoji: '🫖', ice: 0, beans: 25, temp: 92, grind: 1, pours: [50, 140, 110, 75], price: 6000, unlockDay: 6 },
  { id: 'iceLarge', name: '아이스 라지', emoji: '🍹', ice: 125, beans: 25, temp: 94, grind: 0, pours: [50, 75, 75, 50], price: 6500, unlockDay: 7 },
];
const menuOf = (id) => MENUS.find((m) => m.id === id);
const totalWater = (m) => m.pours.reduce((a, b) => a + b, 0);

// ---------- 손에 잡히는 수치 ----------
const DAY_LEN = 90;                 // 손님이 오는 시간(초). 그 뒤엔 남은 주문만 마무리
const WAITS = [10, 8, 8];           // 푸어 뒤 다음 푸어까지 뜸 들이는 시간(초): 뜸 10초, 이후 8초씩 (다른 자리를 만질 틈)
const CRANKS = 10;                  // 원두 갈기 탭 수
const SWIRLS = 5;                   // 저어주기 탭 수
const POUR_RATE = 12;               // 초당 붓는 물(g)
const HEAT_RATE = 6, COOL_RATE = 0.25, COOL_TAP = 3, ROOM_TEMP = 20, MAX_TEMP = 100;
const MAX_QUEUE = 5, MAX_HEARTS = 3;

// 자리는 처음부터 2개, 4일차부터 3개. 주문이 겹치면 동시에 만든다
const stationCount = (day) => (day >= 4 ? 3 : 2);
// 뜸 시간이 끝나고 이 시간 안에 다음 푸어를 시작하지 않으면 커피가 망가진다 (날이 갈수록 조금씩 빠듯해진다).
// 다른 자리에서 원두 계량·분쇄·온도·린싱까지 한 번 하고 돌아올 수 있는 길이로 잡았다
const pourWindow = (day) => Math.max(15, 30 - day * 1.5);
// 마지막 푸어를 끝낸 뒤 이 시간 안에 서빙하지 않으면 식어서 못 마신다
const SERVE_WINDOW = 22;
const unlockedMenus = (day) => MENUS.filter((m) => m.unlockDay <= day);
const patienceFor = (day, m) => Math.max(75, 130 - day * 6) + (m.ice ? 10 : 0);
// 손님 사이 간격(초): 한 잔에 40~50초가 걸리고 자리는 2~3개라, 1일차에도 주문이 두 개쯤 겹친다
const GAPS = [26, 24, 22, 20, 18, 17, 16, 15];
const spawnGap = (day) => Math.max(12, GAPS[Math.min(day, GAPS.length) - 1] - Math.max(0, day - GAPS.length) * 0.5);

function stepsFor(m) {
  const s = ['beans', 'grind', 'temp', 'rinse'];
  if (m.ice) s.push('ice');
  s.push('pour1', 'pour2', 'pour3', 'pour4');
  if (m.ice) s.push('swirl');
  s.push('serve');
  return s;
}
// 단계가 요구하는 값. 주문이 바뀔 때 어디까지 다시 해야 하는지 비교하는 데 쓴다
function sigOf(m, id) {
  if (id === 'beans') return String(m.beans);
  if (id === 'grind') return String(m.grind);
  if (id === 'temp') return String(m.temp);
  if (id === 'ice') return String(m.ice);
  if (id.startsWith('pour')) return String(m.pours[Number(id.slice(4)) - 1]);
  return '';
}

// ---------- 새 게임·하루 ----------
function newStation() {
  return { order: null, idx: 0, res: [], beans: 0, ice: 0, grindSel: -1, cranks: 0, rinse: 0, poured: 0, wait: 0, swirls: 0, water: 0, window: 0, windowSaved: 0, cold: 0, hold: null, holdT: 0 };
}

function newGame(rng = Math.random) {
  const g = { day: 0, coins: 0, hearts: MAX_HEARTS, over: false, events: [], nextId: 1, best: { stars3: 0 }, served: 0, ruined: 0, rng };
  nextDay(g);
  return g;
}

function nextDay(g) {
  g.day++;
  g.clock = 0;
  g.phase = 'open';                                   // open → closing → done
  g.spawnT = 1.5;                                     // 첫 손님은 금방 온다
  g.orders = [];
  g.stations = Array.from({ length: stationCount(g.day) }, newStation);
  g.kettle = { temp: 85, heat: false };
  g.dayCoins = 0; g.dayServed = 0; g.dayLost = 0; g.dayStars = 0; g.dayRuined = 0;
  if (g.day > 1 && g.hearts < MAX_HEARTS) g.hearts++;
  const newMenus = MENUS.filter((m) => m.unlockDay === g.day);
  g.events.push({ type: 'day', day: g.day, newMenus: newMenus.map((m) => m.id) });
}

// ---------- 주문 ----------
function spawnOrder(g) {
  if (g.orders.length >= MAX_QUEUE) return null;       // 줄이 꽉 차면 손님이 그냥 돌아간다
  const list = unlockedMenus(g.day);
  // 새로 열린 메뉴가 조금 더 자주 나오도록
  const pool = list.concat(list.filter((m) => m.unlockDay === g.day));
  const m = pool[Math.floor(g.rng() * pool.length)];
  const p = patienceFor(g.day, m);
  const o = { id: g.nextId++, menuId: m.id, patience: p, patienceMax: p, station: -1, assignedT: 0, changeAt: null, changed: false };
  g.orders.push(o);
  g.events.push({ type: 'order', order: o });
  return o;
}

function assign(g, orderId, si) {
  const o = g.orders.find((x) => x.id === orderId), st = g.stations[si];
  if (!o || !st || st.order || o.station >= 0) return false;
  Object.assign(st, newStation());
  st.order = o; o.station = si; o.assignedT = 0;
  if (g.day >= 3 && g.rng() < 0.15) o.changeAt = 6 + g.rng() * 14;     // 가끔 손님이 주문을 바꾼다
  g.events.push({ type: 'assign', order: o, station: si });
  return true;
}

const freeStation = (g) => g.stations.findIndex((s) => !s.order);

function releaseStation(g, o) {
  if (o.station >= 0) g.stations[o.station] = newStation();
  o.station = -1;
}

// 손님이 주문을 바꾼다: 값이 달라지는 첫 단계부터 다시 해야 한다
function changeOrder(g, o) {
  const st = g.stations[o.station], cur = menuOf(o.menuId);
  const cands = unlockedMenus(g.day).filter((m) => m.id !== cur.id);
  const opposite = cands.filter((m) => !!m.ice !== !!cur.ice);
  const pickFrom = opposite.length ? opposite : cands;
  if (!pickFrom.length) return;
  const next = pickFrom[Math.floor(g.rng() * pickFrom.length)];
  const oldSteps = stepsFor(cur), newSteps = stepsFor(next);
  let redo = st.idx;                                    // 이미 끝낸 단계 중 처음으로 달라지는 곳
  for (let i = 0; i < st.idx; i++) {
    if (oldSteps[i] !== newSteps[i] || sigOf(cur, oldSteps[i]) !== sigOf(next, newSteps[i])) { redo = i; break; }
  }
  o.menuId = next.id; o.changed = true;
  if (redo < st.idx) {
    st.res.length = redo; st.idx = redo;
    newSteps.forEach((id, i) => {
      if (i < redo) return;
      if (id === 'beans') st.beans = 0;
      if (id === 'grind') { st.grindSel = -1; st.cranks = 0; }
      if (id === 'rinse') st.rinse = 0;
      if (id === 'ice') st.ice = 0;
    });
  }
  g.events.push({ type: 'changed', order: o, from: cur.id, to: next.id, redo });
}

// ---------- 손으로 하는 동작 ----------
const q3 = (dev, good, ok) => (dev <= good ? 1 : dev <= ok ? 0.7 : 0.4);

function finishStep(g, si, q) {
  const st = g.stations[si], steps = stepsFor(menuOf(st.order.menuId));
  st.res.push(q);
  g.events.push({ type: 'step', station: si, step: steps[st.idx], q });
  st.idx++;
  st.hold = null;
}

// 동작을 넣는다. down=true 는 누름(또는 탭), false 는 뗌(누르고 있던 것만 의미가 있다).
// name: add(담기, 누르고 있기) · sub(덜기) · confirm(확정) · grind(분쇄도 고르기, arg) · crank(갈기) · rinse(누르고 있기)
//       · pour(누르고 있기) · swirl · serve
function act(g, si, name, down = true, arg) {
  const st = g.stations[si];
  if (!st || !st.order || g.over) return false;
  const m = menuOf(st.order.menuId), steps = stepsFor(m), step = steps[st.idx];
  if (!step) return false;

  // 누르고 있는 동작을 뗄 때
  if (!down) {
    if (st.hold !== name) return false;
    if (name === 'add') { st.hold = null; return true; }
    if (name === 'rinse') {
      const r = st.rinse; st.hold = null;
      if (r < 0.05) return false;
      const q = r >= 0.5 && r <= 0.85 ? 1 : (r >= 0.3 && r < 0.5) || (r > 0.85) ? 0.7 : 0.4;
      st.rinse = 0;
      finishStep(g, si, q);
      return true;
    }
    if (name === 'pour') {
      const k = Number(step.slice(4)), got = st.poured, want = m.pours[k - 1];
      st.hold = null;
      if (got < 1) { st.window = st.windowSaved; return false; }          // 살짝 눌렀다 뗀 건 붓기로 치지 않는다: 제한 시간은 계속 간다
      const tdev = Math.abs(g.kettle.temp - m.temp);
      const tf = tdev <= 2 ? 1 : tdev <= 5 ? 0.85 : 0.6;
      const q = q3(Math.abs(got - want), 3, 8) * tf;
      st.water += got; st.poured = 0;
      if (k < 4) st.wait = WAITS[k - 1]; else st.cold = SERVE_WINDOW;
      finishStep(g, si, q);
      return true;
    }
    return false;
  }

  if (step === 'beans' || step === 'ice') {
    const key = step === 'beans' ? 'beans' : 'ice';
    if (name === 'add') { st.hold = 'add'; st.holdT = 0; return true; }
    if (name === 'sub') { st[key] = Math.max(0, st[key] - (key === 'beans' ? 0.5 : 5)); return true; }
    if (name === 'confirm') {
      const dev = Math.abs(st[key] - m[key]);
      finishStep(g, si, key === 'beans' ? q3(dev, 0.5, 1.5) : q3(dev, 5, 10));
      return true;
    }
    return false;
  }
  if (step === 'grind') {
    if (name === 'grind') { if (arg < 0 || arg >= GRINDS.length) return false; st.grindSel = arg; st.cranks = 0; return true; }
    if (name === 'crank') {
      if (st.grindSel < 0) return false;
      st.cranks++;
      if (st.cranks >= CRANKS) finishStep(g, si, [1, 0.6, 0.3, 0.3][Math.min(3, Math.abs(st.grindSel - m.grind))]);
      return true;
    }
    return false;
  }
  if (step === 'temp') {
    if (name !== 'confirm') return false;
    finishStep(g, si, q3(Math.abs(g.kettle.temp - m.temp), 1, 3));
    return true;
  }
  if (step === 'rinse') {
    if (name === 'rinse') { st.hold = 'rinse'; st.holdT = 0; st.rinse = 0; return true; }
    return false;
  }
  if (step.startsWith('pour')) {
    if (name === 'pour' && st.wait <= 0) { st.hold = 'pour'; st.holdT = 0; st.poured = 0; st.windowSaved = st.window; st.window = 0; return true; }
    return false;
  }
  if (step === 'swirl') {
    if (name !== 'swirl') return false;
    st.swirls++;
    if (st.swirls >= SWIRLS) finishStep(g, si, 1);
    return true;
  }
  if (step === 'serve') {
    if (name !== 'serve') return false;
    serve(g, si);
    return true;
  }
  return false;
}

function starsOf(q) { return q >= 0.88 ? 3 : q >= 0.7 ? 2 : 1; }

function serve(g, si) {
  const st = g.stations[si], o = st.order, m = menuOf(o.menuId);
  const q = st.res.reduce((a, b) => a + b, 0) / st.res.length;
  const stars = starsOf(q);
  const tip = o.patience / o.patienceMax > 0.5 ? Math.round(m.price * 0.1) : 0;
  const coins = Math.round(m.price * [0.7, 1, 1.3][stars - 1]) + tip;
  g.coins += coins; g.dayCoins += coins; g.served++; g.dayServed++; g.dayStars += stars;
  if (stars === 3) g.best.stars3++;
  g.orders = g.orders.filter((x) => x !== o);
  g.stations[si] = newStation();
  g.events.push({ type: 'served', order: o, menu: m, stars, coins, tip, q, station: si });
}

// 시간을 넘겨 커피를 망쳤다: 그 자리는 같은 주문을 처음부터 다시 내려야 한다 (손님 참을성은 계속 줄어든다)
function ruin(g, si, reason) {
  const st = g.stations[si], o = st.order;
  const progress = st.idx;
  g.stations[si] = Object.assign(newStation(), { order: o });
  g.ruined++; g.dayRuined++;
  g.events.push({ type: 'ruined', order: o, station: si, reason, progress });
}

function heat(g, on) { g.kettle.heat = !!on; }
function cool(g) { g.kettle.temp = Math.max(ROOM_TEMP, g.kettle.temp - COOL_TAP); }

// ---------- 시간 ----------
function update(g, dt) {
  if (g.over || g.phase === 'done') return;
  g.clock += dt;

  // 주전자: 누르고 있으면 데워지고, 아니면 서서히 식는다
  const k = g.kettle;
  k.temp = k.heat ? Math.min(MAX_TEMP, k.temp + HEAT_RATE * dt) : Math.max(ROOM_TEMP, k.temp - COOL_RATE * dt);

  // 손님 도착
  if (g.phase === 'open') {
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      spawnOrder(g);
      g.spawnT = spawnGap(g.day) * (0.8 + g.rng() * 0.4);
    }
    if (g.clock >= DAY_LEN) g.phase = 'closing';
  }

  // 자리마다: 뜸 시간, 누르고 있는 동작
  g.stations.forEach((st, si) => {
    if (!st.order) return;
    st.order.assignedT += dt;
    if (st.wait > 0) {
      st.wait = Math.max(0, st.wait - dt);
      if (st.wait === 0) st.window = pourWindow(g.day);           // 뜸이 끝났다: 이제 정해진 시간 안에 부어야 한다
    }
    if (st.window > 0 && !st.hold) {
      st.window -= dt;
      if (st.window <= 0) { ruin(g, si, 'pour'); return; }
    }
    if (st.cold > 0) {
      st.cold -= dt;
      if (st.cold <= 0) { ruin(g, si, 'cold'); return; }
    }
    if (!st.hold) return;
    st.holdT += dt;
    const m = menuOf(st.order.menuId);
    if (st.hold === 'add') {
      const step = stepsFor(m)[st.idx];
      if (step === 'beans') st.beans += Math.min(3 + st.holdT * 4, 12) * dt;
      else if (step === 'ice') st.ice += Math.min(20 + st.holdT * 40, 90) * dt;
    } else if (st.hold === 'rinse') st.rinse = Math.min(1, st.rinse + 0.5 * dt);
    else if (st.hold === 'pour') st.poured += POUR_RATE * dt;
  });

  // 주문 바꾸기, 참을성
  for (const o of g.orders.slice()) {
    if (o.station >= 0 && o.changeAt !== null && o.assignedT >= o.changeAt) {
      const st = g.stations[o.station], steps = stepsFor(menuOf(o.menuId));
      if (st.idx >= steps.indexOf('pour1')) o.changeAt = null;          // 붓기 시작한 뒤에는 바꿀 수 없다
      else if (!st.hold) { changeOrder(g, o); o.changeAt = null; }       // 누르고 있는 중이면 뗄 때까지 미룬다
    }
    o.patience -= dt;
    if (o.patience <= 0) {
      releaseStation(g, o);
      g.orders = g.orders.filter((x) => x !== o);
      g.hearts--; g.dayLost++;
      g.events.push({ type: 'left', order: o });
    }
  }

  if (g.hearts <= 0) { g.over = true; g.events.push({ type: 'over' }); return; }
  if (g.phase === 'closing' && !g.orders.length) { g.phase = 'done'; g.events.push({ type: 'dayEnd' }); }
}

const LOGIC = {
  GRINDS, MENUS, menuOf, totalWater, DAY_LEN, WAITS, CRANKS, SWIRLS, POUR_RATE, MAX_QUEUE, MAX_HEARTS,
  stationCount, pourWindow, SERVE_WINDOW, unlockedMenus, patienceFor, spawnGap, stepsFor, sigOf, newGame, nextDay, spawnOrder, assign, freeStation,
  act, heat, cool, update, starsOf,
};
if (typeof module !== 'undefined') module.exports = LOGIC;
