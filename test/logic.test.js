'use strict';
// 핸드드립 카페 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DT = 0.01;
const stepOf = (g, si) => { const st = g.stations[si]; return st.order ? L.stepsFor(L.menuOf(st.order.menuId))[st.idx] : null; };

test('recipes: first pour blooms with twice the beans; hot and iced steps', () => {
  for (const m of L.MENUS) {
    assert.strictEqual(m.pours[0], m.beans * 2, m.id);
    assert.strictEqual(m.pours.length, 4);
    assert.ok(m.grind >= 0 && m.grind < L.GRINDS.length);
  }
  assert.strictEqual(L.totalWater(L.menuOf('hot')), 300);
  assert.strictEqual(L.totalWater(L.menuOf('ice')) + L.menuOf('ice').ice, 300);
  assert.deepStrictEqual(L.stepsFor(L.menuOf('hot')), ['beans', 'grind', 'temp', 'rinse', 'pour1', 'pour2', 'pour3', 'pour4', 'serve']);
  assert.deepStrictEqual(L.stepsFor(L.menuOf('ice')), ['beans', 'grind', 'temp', 'rinse', 'ice', 'pour1', 'pour2', 'pour3', 'pour4', 'swirl', 'serve']);
});

test('days: menus unlock one per day, a third station from day 4, a heart back each morning', () => {
  const g = L.newGame(rng(1));
  assert.strictEqual(g.day, 1);
  assert.deepStrictEqual(L.unlockedMenus(1).map((m) => m.id), ['hot']);
  assert.strictEqual(L.unlockedMenus(7).length, L.MENUS.length);
  assert.strictEqual(L.stationCount(3), 2);
  assert.strictEqual(L.stationCount(4), 3);
  g.hearts = 1;
  L.nextDay(g);
  assert.strictEqual(g.hearts, 2);
  for (let d = 1; d < 20; d++) {
    assert.ok(L.pourWindow(d + 1) <= L.pourWindow(d) && L.pourWindow(d) >= 15);
    assert.ok(L.spawnGap(d + 1) <= L.spawnGap(d) && L.spawnGap(d) >= 12);
  }
});

test('the queue is capped and an order cannot go to a busy station', () => {
  const g = L.newGame(rng(2));
  for (let k = 0; k < 10; k++) L.spawnOrder(g);
  assert.strictEqual(g.orders.length, L.MAX_QUEUE);
  assert.ok(L.assign(g, g.orders[0].id, 0));
  assert.ok(!L.assign(g, g.orders[1].id, 0), 'station 0 is busy');
  assert.ok(!L.assign(g, g.orders[0].id, 1), 'order already placed');
  assert.strictEqual(L.freeStation(g), 1);
});

test('a customer who waits too long leaves and costs a heart; no hearts left ends the game', () => {
  const g = L.newGame(rng(3));
  g.spawnT = 1e9;
  L.spawnOrder(g);
  const p = g.orders[0].patience;
  for (let t = 0; t < p + 1; t += 0.5) L.update(g, 0.5);
  assert.strictEqual(g.orders.length, 0);
  assert.strictEqual(g.hearts, g.maxHearts - 1);
  L.nextDay(g);                                               // 영업이 끝난 날에는 시간이 안 가므로 다음 날에서
  g.spawnT = 1e9; g.hearts = 1;
  L.spawnOrder(g);
  for (let t = 0; t < p + 1 && !g.over; t += 0.5) L.update(g, 0.5);
  assert.ok(g.over);
});

test('waiting too long between pours ruins the cup and the station starts that order again', () => {
  const g = L.newGame(rng(4));
  g.spawnT = 1e9;
  L.spawnOrder(g);
  L.assign(g, g.orders[0].id, 0);
  const st = g.stations[0];
  st.idx = L.stepsFor(L.menuOf('hot')).indexOf('pour2'); st.res = [1, 1, 1, 1, 1];
  st.window = 1;
  for (let t = 0; t < 1.2; t += DT) L.update(g, DT);
  assert.strictEqual(g.stations[0].idx, 0);
  assert.strictEqual(g.stations[0].order, g.orders[0]);
  assert.strictEqual(g.ruined, 1);
});

test('changing an order keeps the steps that still match and redoes from the first one that differs', () => {
  const g = L.newGame(rng(5));
  for (let d = 1; d < 5; d++) L.nextDay(g);                   // 5일차: 메뉴가 여럿
  g.orders = [];
  const o = L.spawnOrder(g);
  o.menuId = 'hot';
  L.assign(g, o.id, 0);
  const st = g.stations[0];
  st.idx = 3; st.res = [1, 1, 1];                             // 원두·분쇄·온도까지 함 (붓기 전이라 바꿀 수 있다)
  o.changeAt = 0;
  L.update(g, DT);
  const next = L.menuOf(o.menuId);
  assert.ok(o.changed && next.id !== 'hot');
  assert.ok(!!next.ice, 'a hot order switches to an iced one when possible');
  const cur = L.menuOf('hot');
  const firstDiff = ['beans', 'grind', 'temp'].findIndex((k) => String(cur[k === 'grind' ? 'grind' : k]) !== String(next[k]));
  assert.strictEqual(st.idx, firstDiff === -1 ? 3 : firstDiff);
  assert.strictEqual(st.res.length, st.idx);
});

test('pour quality uses the average kettle temperature while pouring, not the moment you let go', () => {
  // 붓기 단계까지 진행해 둔 핫 주문 하나
  const setup = () => {
    const g = L.newGame(rng(12));
    g.spawnT = 1e9;
    L.spawnOrder(g);
    L.assign(g, g.orders[0].id, 0);
    const st = g.stations[0];
    st.idx = L.stepsFor(L.menuOf('hot')).indexOf('pour1'); st.res = [1, 1, 1, 1];
    g.kettle.temp = L.menuOf('hot').temp;
    return { g, st };
  };
  const pour = (g, st, coolAtEnd) => {
    const want = L.menuOf('hot').pours[0];
    L.act(g, 0, 'pour');
    while (st.poured < want - 0.3) L.update(g, DT);
    if (coolAtEnd) { L.cool(g); L.cool(g); L.cool(g); }         // 다 붓고 떼기 직전에 다른 자리 때문에 9°C 식힘
    L.act(g, 0, 'pour', false);
    return st.res[st.res.length - 1];
  };
  let { g, st } = setup();
  const steady = pour(g, st, false);
  ({ g, st } = setup());
  const cooledAtEnd = pour(g, st, true);
  assert.strictEqual(steady, 1);
  assert.strictEqual(cooledAtEnd, 1, 'cooling the kettle just before letting go no longer ruins a good pour');
  ({ g, st } = setup());
  g.kettle.temp = L.menuOf('hot').temp - 9;                   // 처음부터 끝까지 식은 물로 붓기
  assert.ok(pour(g, st, false) < 0.7, 'pouring with cold water the whole time still costs');
});

// 레시피대로 정확히 내리는 자동 바리스타. 한 번에 한 동작만 한다
function barista(g) {
  const k = g.kettle;
  // 주전자: 지금 온도를 맞춰야 하는 자리 중 가장 급한 곳(붓기 > 온도 확인)의 목표
  let goal = null, urgency = Infinity;
  g.stations.forEach((st, si) => {
    const s = stepOf(g, si);
    if (!s) return;
    const m = L.menuOf(st.order.menuId);
    // 뜸 들이는 동안(다음 붓기까지 4초 넘게 남음)에는 온도 확인 단계에 주전자를 맞춘다
    // 붓는 중인 자리가 있으면 그 온도를 지킨다 (점수는 붓는 동안의 평균 온도로 매긴다)
    const u = st.hold === 'pour' ? -Infinity : s.startsWith('pour') ? (st.wait > 0 ? st.wait : -st.window) : s === 'temp' ? 4 : Infinity;
    if (u < urgency) { urgency = u; goal = m.temp; }
  });
  if (goal !== null) {
    if (k.temp < goal - 0.3) L.heat(g, true);
    else { L.heat(g, false); if (k.temp > goal + 1) L.cool(g); }
  } else L.heat(g, false);

  for (let si = 0; si < g.stations.length; si++) {
    const st = g.stations[si], s = stepOf(g, si);
    if (!s) continue;
    const m = L.menuOf(st.order.menuId);
    if (s === 'beans' || s === 'ice') {
      const want = m[s], have = st[s];
      if (st.hold === 'add') { if (have >= want - 0.15) { L.act(g, si, 'add', false); return; } continue; }
      if (have < want - 0.3) { L.act(g, si, 'add'); return; }
      if (have > want + 0.3) { L.act(g, si, 'sub'); return; }
      L.act(g, si, 'confirm'); return;
    }
    if (s === 'grind') { if (st.grindSel !== m.grind) L.act(g, si, 'grind', true, m.grind); else L.act(g, si, 'crank'); return; }
    if (s === 'temp') { if (Math.abs(k.temp - m.temp) <= 0.8) { L.act(g, si, 'confirm'); return; } continue; }
    if (s === 'rinse') {
      if (st.hold === 'rinse') { if (st.rinse >= 0.65) { L.act(g, si, 'rinse', false); return; } continue; }
      L.act(g, si, 'rinse'); return;
    }
    if (s.startsWith('pour')) {
      const want = m.pours[Number(s.slice(4)) - 1];
      if (st.hold === 'pour') { if (st.poured >= want - 0.3) { L.act(g, si, 'pour', false); return; } continue; }
      if (st.wait <= 0 && Math.abs(k.temp - m.temp) <= 1.5) { L.act(g, si, 'pour'); return; }
      continue;
    }
    if (s === 'swirl' || s === 'serve') { L.act(g, si, s); return; }
  }
  // 빈 자리에 기다리는 주문을 올린다
  const free = L.freeStation(g), waiting = g.orders.find((o) => o.station < 0);
  if (free >= 0 && waiting) L.assign(g, waiting.id, free);
}

function playDay(g) {
  let stars = 0;
  for (let t = 0; t < 400 && g.phase !== 'done' && !g.over; t += DT) {
    barista(g);
    L.update(g, DT);
    for (const e of g.events.splice(0)) if (e.type === 'served') stars += e.stars;
  }
  return stars;
}

test('a perfect barista gets through the first week with three-star cups and every customer served', () => {
  for (const [mode, seed] of [['normal', 11], ['normal', 3], ['normal', 27], ['easy', 11], ['easy', 8]]) {
    const g = L.newGame(rng(seed), mode);
    for (let day = 1; day <= 7; day++) {
      const servedBefore = g.served;
      const stars = playDay(g);
      assert.ok(!g.over, `${mode} day ${day}: the game is not over`);
      assert.strictEqual(g.phase, 'done', `${mode} day ${day} ends`);
      const served = g.served - servedBefore;
      assert.ok(served >= 3, `${mode} day ${day}: served ${served}`);
      assert.strictEqual(g.dayLost, 0, `${mode} day ${day}: nobody left angry`);
      assert.strictEqual(g.dayRuined, 0, `${mode} day ${day}: no ruined cups`);
      assert.strictEqual(stars, served * 3, `${mode} day ${day}: every cup gets three stars`);
      L.nextDay(g);
    }
  }
});
