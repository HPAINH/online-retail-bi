(() => {
const ND = D.dates.length;
const IDX = Object.fromEntries(D.dates.map((d, i) => [d, i]));
const DT = D.dayType;
const WEEKDAY = D.dates.map(d => { const [y, m, dd] = d.split('-').map(Number); return (new Date(y, m - 1, dd).getDay() + 6) % 7; });
const WEEK_OF = new Int32Array(ND);
const WEEK_START = [];
{
  let w = -1;
  for (let i = 0; i < ND; i++) { if (i === 0 || WEEKDAY[i] === 0) { w++; WEEK_START.push(i); } WEEK_OF[i] = w; }
}
const NW = WEEK_START.length;
const WEEK_TYPE = WEEK_START.map((s, w) => {
  if (w === 0 || w === NW - 1) return 'calendar';
  for (let i = s; i < ND && WEEK_OF[i] === w; i++) if (DT[i] !== 'regular' && WEEKDAY[i] !== 5) return 'calendar';
  return 'regular';
});
const SEG_START = IDX['2010-03-01'];
const SEG_NAMES = { returning: 'Повторные', new: 'Новые', guest: 'Без ID' };
const METRICS = {
  orders: { name: 'Заказы', fmt: v => fmtInt(v) },
  revenue: { name: 'Выручка', fmt: v => fmtGBP(v) },
  aov: { name: 'Средний чек', fmt: v => fmtGBP(v) },
  customers: { name: 'Покупатели', fmt: v => fmtInt(v) },
  newc: { name: 'Новые покупатели', fmt: v => fmtInt(v) },
};
const ALERT_METRIC = { orders: 'orders', revenue: 'revenue', aov: 'aov', customers: 'customers' };

const S = { from: 0, to: ND - 1, grp: -1, seg: -1, clean: true, metric: 'orders', grain: 'day', sel: IDX['2010-12-19'], dim: 'g' };

const $ = id => document.getElementById(id);
const tip = $('tip');
const nf = new Intl.NumberFormat('ru-RU');
function fmtInt(v) { return v == null || !isFinite(v) ? '—' : nf.format(Math.round(v)); }
function fmtGBP(v) { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(2).replace('.', ',') + ' млн' : a >= 1e4 ? (a / 1e3).toFixed(0) + ' тыс.' : nf.format(Math.round(a)); return (v < 0 ? '−' : '') + '£' + s; }
function fmtPct(v, d = 1) { return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d).replace('.', ',') + '%'; }
function fmtDev(v) { if (v == null || !isFinite(v)) return '—'; const s = Math.abs(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0).replace('.', ','); return (v > 0 ? '+' : v < 0 ? '−' : '') + s + '%'; }
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
function fmtDate(i, long) { const [y, m, d] = D.dates[i].split('-').map(Number); return long ? `${d} ${MON[m - 1]} ${y}, ${WD[WEEKDAY[i]]}` : `${d} ${MON[m - 1]} ${String(y).slice(2)}`; }
function fmtPeriod(p, long) {
  if (S.grain === 'day') return fmtDate(p, long);
  const s = WEEK_START[p], e = p + 1 < NW ? WEEK_START[p + 1] - 1 : ND - 1;
  return `неделя ${fmtDate(s)} — ${fmtDate(e)}`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

function nPeriods() { return S.grain === 'day' ? ND : NW; }
function periodOf(d) { return S.grain === 'day' ? d : WEEK_OF[d]; }
function periodType(p) { if (S.grain === 'week') return WEEK_TYPE[p]; return DT[p] === 'regular' ? 'regular' : DT[p] === 'closed' ? 'closed' : 'calendar'; }
function periodStart(p) { return S.grain === 'day' ? p : WEEK_START[p]; }
function excluded(p) { return periodType(p) === 'closed' || (S.seg >= 0 && periodStart(p) < SEG_START); }

function aggregate(f, grain) {
  const n = grain === 'day' ? ND : NW, per = grain === 'day' ? (d => d) : (d => WEEK_OF[d]);
  const rev = new Float64Array(n), ord = new Float64Array(n), lin = new Float64Array(n), cust = new Float64Array(n), newc = new Float64Array(n);
  const seen = new Set(), seenNew = new Set();
  const O = D.O;
  for (let i = 0; i < O.d.length; i++) {
    if (f.grp >= 0 && O.g[i] !== f.grp) continue;
    if (f.seg >= 0 && O.s[i] !== f.seg) continue;
    const p = per(O.d[i]);
    rev[p] += O.r[i] + (f.clean ? 0 : O.f[i]); ord[p]++; lin[p] += O.l[i];
    if (O.c[i] >= 0) {
      const key = p * 100000 + O.c[i];
      if (!seen.has(key)) { seen.add(key); cust[p]++; }
      if (O.s[i] === 1 && !seenNew.has(key)) { seenNew.add(key); newc[p]++; }
    }
  }
  const aov = new Float64Array(n);
  for (let p = 0; p < n; p++) aov[p] = ord[p] ? rev[p] / ord[p] : NaN;
  return { revenue: rev, orders: ord, lines: lin, customers: cust, newc, aov };
}

function baselinePeriods(p) {
  const r = [], step = S.grain === 'day' ? 7 : 1;
  for (let k = 1; k <= 4; k++) { const q = p - step * k; if (q >= 0 && periodType(q) === 'regular' && !excluded(q)) r.push(q); }
  return r;
}
function detect(A, metric) {
  const n = nPeriods(), x = A[metric];
  const base = new Array(n).fill(null), ld = new Array(n).fill(null), vol = new Array(n).fill(0);
  for (let p = 0; p < n; p++) {
    if (excluded(p)) continue;
    const bp = baselinePeriods(p);
    if (bp.length < 2) continue;
    const m = median(bp.map(q => x[q]).filter(isFinite));
    if (m == null || !(m > 0)) continue;
    base[p] = m; vol[p] = median(bp.map(q => A.orders[q]));
    if (isFinite(x[p])) ld[p] = Math.log(Math.max(x[p], 1e-9) / m);
  }
  const pool = [];
  for (let p = 0; p < n; p++) if (ld[p] != null && vol[p] >= 10 && periodType(p) === 'regular') pool.push(ld[p]);
  const med = median(pool), sigma = 1.4826 * median(pool.map(v => Math.abs(v - med)));
  const flags = new Array(n).fill(false);
  for (let p = 0; p < n; p++) {
    if (ld[p] == null || vol[p] < 10 || !sigma) continue;
    flags[p] = Math.abs(ld[p] / sigma) >= 4.5 && Math.abs(x[p] / base[p] - 1) >= 0.25;
  }
  return { base, flags };
}

let A = null;
function recompute() { A = aggregate(S, S.grain); }

function sumR(arr, a, b) { let s = 0; for (let i = a; i <= b; i++) s += arr[i]; return s; }
function periodKPI(f, a, b) {
  let rev = 0, ord = 0; const cust = new Set(), nw = new Set();
  const O = D.O;
  for (let i = 0; i < O.d.length; i++) {
    const d = O.d[i];
    if (d < a || d > b) continue;
    if (f.grp >= 0 && O.g[i] !== f.grp) continue;
    if (f.seg >= 0 && O.s[i] !== f.seg) continue;
    rev += O.r[i] + (f.clean ? 0 : O.f[i]); ord++;
    if (O.c[i] >= 0) { cust.add(O.c[i]); if (O.s[i] === 1) nw.add(O.c[i]); }
  }
  let canc = 0; const X = D.X;
  for (let i = 0; i < X.d.length; i++) {
    const d = X.d[i];
    if (d < a || d > b) continue;
    if (f.grp >= 0 && X.g[i] !== f.grp) continue;
    if (f.seg >= 0 && X.s[i] !== f.seg) continue;
    canc += X.v[i] - (f.clean ? X.fv[i] : 0);
  }
  return { revenue: rev, orders: ord, aov: ord ? rev / ord : NaN, customers: cust.size, newc: nw.size, canc: rev ? canc / rev : NaN };
}

function renderKPIs() {
  const len = S.to - S.from + 1;
  const cur = periodKPI(S, S.from, S.to);
  const prev = S.from - len >= 0 ? periodKPI(S, S.from - len, S.from - 1) : null;
  const items = [
    ['Выручка', fmtGBP(cur.revenue), 'revenue', 'rel'],
    ['Заказы', fmtInt(cur.orders), 'orders', 'rel'],
    ['Средний чек', fmtGBP(cur.aov), 'aov', 'rel'],
    ['Покупатели', fmtInt(cur.customers), 'customers', 'rel'],
    ['Новые покупатели', fmtInt(cur.newc), 'newc', 'rel'],
    ['Доля отмен', fmtPct(cur.canc, 1), 'canc', 'pp'],
  ];
  $('kpis').innerHTML = items.map(([k, v, key, mode]) => {
    let d = '<span class="d">нет прошлого периода той же длины</span>';
    if (prev && isFinite(prev[key]) && prev[key] && isFinite(cur[key])) {
      const diff = mode === 'pp' ? (cur[key] - prev[key]) * 100 : cur[key] / prev[key] - 1;
      const txt = mode === 'pp' ? (diff >= 0 ? '+' : '−') + Math.abs(diff).toFixed(1).replace('.', ',') + ' п.п.' : fmtDev(diff);
      const good = key === 'canc' ? diff < 0 : diff > 0;
      d = `<span class="d ${Math.abs(diff) < 1e-9 ? '' : good ? 'up' : 'down'}">${txt} к прошлому периоду</span>`;
    }
    return `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span>${d}</div>`;
  }).join('');
  const parts = [];
  if (S.grp >= 0) parts.push(D.groups[S.grp]);
  if (S.seg >= 0) parts.push('клиенты: ' + SEG_NAMES[D.segments[S.seg]].toLowerCase());
  if (!S.clean) parts.push('с ошибочными строками');
  $('scope').textContent = `${fmtDate(S.from)} — ${fmtDate(S.to)} · ${parts.length ? parts.join(' · ') : 'весь магазин'}`;
}

const CARDS = {
  1: { big: '£285 тыс.', day: '2011-12-09', metric: 'revenue', grain: 'day', clean: false, dim: 'g', text: 'дали три ошибочные строки: две отменены через 12–16 минут, в третьей цена в 109 раз выше обычной для этого товара. Карточка выключает очистку — видно, что сделала бы ошибка.' },
  2: { big: '−74%', day: '2010-12-19', metric: 'orders', grain: 'day', clean: true, dim: 'g', text: 'заказов в последнее воскресенье перед Рождеством 2010. Годом ранее было −53%; дополнительное падение совпадает со снегопадами.' },
  3: { big: '72%', day: '2010-08-01', metric: 'aov', grain: 'day', clean: true, dim: 's', text: 'выручки дня дал один оптовый клиент — средний чек ×2,9. Топ-10 клиентов — 14% всей выручки за 2 года.' },
  4: { big: '−77%', day: '2010-12-06', metric: 'newc', grain: 'week', clean: true, dim: 's', text: 'новых клиентов в декабре 2010 к ноябрю. Декабрьская когорта почти не возвращается: 9% через месяц.' },
};
function goCard(id) {
  const c = CARDS[id];
  Object.assign(S, { grp: -1, seg: -1, from: 0, to: ND - 1, metric: c.metric, grain: c.grain, clean: c.clean, sel: IDX[c.day], dim: c.dim });
  syncControls(); recompute(); renderAll();
  $('c-trend').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function renderCards() {
  $('incidents').innerHTML = D.inc.filter(r => CARDS[r.incident_id]).map(r => {
    const c = CARDS[r.incident_id];
    return `<button class="inc${r.kind === 'Ошибка данных' ? ' dq' : ''}" type="button" data-id="${r.incident_id}"><span class="when">${esc(r.kind)}</span><span class="big">${c.big}</span><span class="t">${esc(r.title)}</span><p>${esc(c.text)}</p></button>`;
  }).join('');
  $('incidents').querySelectorAll('.inc').forEach(b => b.addEventListener('click', () => goCard(+b.dataset.id)));
}

function showTip(html, ev) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { tip.hidden = true; }
function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10) * p; }
function axisFmt(v, metric) {
  const money = metric === 'revenue' || metric === 'aov';
  const s = v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' млн' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',') + ' тыс' : String(Math.round(v));
  return (money ? '£' : '') + s;
}

function renderTrend() {
  const el = $('c-trend');
  const W = Math.max(320, el.clientWidth), H = W < 600 ? 240 : 300;
  const m = { l: 58, r: 12, t: 12, b: 26 };
  const x = A[S.metric];
  const { base, flags } = detect(A, S.metric);
  const a = periodOf(S.from), b = periodOf(S.to);
  const xs = p => m.l + (b === a ? 0 : (p - a) / (b - a)) * (W - m.l - m.r);
  let mx = 0;
  for (let p = a; p <= b; p++) { if (excluded(p)) continue; if (isFinite(x[p])) mx = Math.max(mx, x[p]); if (base[p] != null) mx = Math.max(mx, base[p]); }
  mx = niceMax(mx * 1.05);
  const ys = v => m.t + (1 - Math.min(v, mx) / mx) * (H - m.t - m.b);
  const step = (W - m.l - m.r) / Math.max(1, b - a);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${METRICS[S.metric].name}">`;
  for (let p = a; p <= b; p++) {
    const t = periodType(p);
    if (t !== 'regular' && !(S.grain === 'day' && WEEKDAY[p] === 5)) s += `<rect class="holband" x="${xs(p) - step / 2}" y="${m.t}" width="${Math.max(step, 1)}" height="${H - m.t - m.b}"/>`;
  }
  for (let k = 0; k <= 4; k++) { const v = mx * k / 4, y = ys(v); s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${axisFmt(v, S.metric)}</text>`; }
  const spanDays = S.to - S.from;
  let lastLabel = -1e9;
  for (let p = a; p <= b; p++) {
    const d0 = periodStart(p), [, mm, dd] = D.dates[d0].split('-').map(Number);
    const newMonth = S.grain === 'day' ? dd === 1 : (p === a || D.dates[WEEK_START[p - 1]].slice(5, 7) !== D.dates[d0].slice(5, 7));
    const every = spanDays > 400 ? 3 : spanDays > 120 ? 1 : 0;
    if (newMonth && (every === 0 || (mm - 1) % every === 0) && xs(p) - lastLabel > 46) { s += `<text x="${xs(p)}" y="${H - 8}" text-anchor="middle">${MON[mm - 1]} ${D.dates[d0].slice(2, 4)}</text>`; lastLabel = xs(p); }
  }
  let pb = '', pl = '', prevB = false, prevL = false;
  for (let p = a; p <= b; p++) {
    if (excluded(p)) { prevB = prevL = false; continue; }
    if (base[p] != null) { pb += (prevB ? 'L' : 'M') + xs(p).toFixed(1) + ',' + ys(base[p]).toFixed(1); prevB = true; } else prevB = false;
    if (isFinite(x[p])) { pl += (prevL ? 'L' : 'M') + xs(p).toFixed(1) + ',' + ys(x[p]).toFixed(1); prevL = true; } else prevL = false;
  }
  s += `<path class="base" d="${pb}"/><path class="line" d="${pl}"/>`;
  const sp = periodOf(S.sel);
  if (sp >= a && sp <= b) s += `<line class="selline" x1="${xs(sp)}" x2="${xs(sp)}" y1="${m.t}" y2="${H - m.b}"/>`;
  let nA = 0;
  for (let p = a; p <= b; p++) if (flags[p] && periodType(p) === 'regular') { nA++; s += `<circle class="adot" cx="${xs(p)}" cy="${ys(x[p])}" r="4.5"/>`; }
  if (sp >= a && sp <= b && isFinite(x[sp]) && !excluded(sp)) s += `<circle class="seldot" cx="${xs(sp)}" cy="${ys(x[sp])}" r="5"/>`;
  s += `<line class="cross" id="tr-cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><rect id="tr-hit" x="${m.l - step / 2}" y="0" width="${W - m.l - m.r + step}" height="${H}" fill="transparent" style="cursor:pointer"/></svg>`;
  el.innerHTML = s;
  const hit = $('tr-hit'), cross = $('tr-cross');
  const pAt = ev => { const r = el.querySelector('svg').getBoundingClientRect(); const xx = (ev.clientX - r.left) * W / r.width; return Math.max(a, Math.min(b, Math.round(a + (xx - m.l) / step))); };
  hit.addEventListener('mousemove', ev => {
    const p = pAt(ev);
    cross.setAttribute('x1', xs(p)); cross.setAttribute('x2', xs(p)); cross.setAttribute('visibility', 'visible');
    const t = periodType(p);
    const dn = S.grain === 'day' ? D.dayName[p] : '';
    const status = t === 'closed' ? (dn || 'магазин закрыт') : t === 'calendar' ? `сезонный период${dn ? ': ' + dn : ''}` : flags[p] ? '<span style="color:#ff8a8a">аномалия</span>' : 'в норме';
    const dev = base[p] ? x[p] / base[p] - 1 : null;
    showTip(`<b>${fmtPeriod(p, true)}</b><div class="r"><span>${METRICS[S.metric].name}</span><span>${t === 'closed' ? '—' : METRICS[S.metric].fmt(x[p])}</span></div><div class="r"><span>Норма</span><span>${base[p] != null ? METRICS[S.metric].fmt(base[p]) : '—'}</span></div><div class="r"><span>Отклонение</span><span>${fmtDev(dev)}</span></div><div class="r"><span>Статус</span><span>${status}</span></div>`, ev);
  });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  hit.addEventListener('click', ev => { S.sel = periodStart(pAt(ev)); renderTrend(); renderTree(); renderSlices(); });
  $('trend-title').textContent = `${METRICS[S.metric].name} ${S.grain === 'day' ? 'по дням' : 'по неделям'}`;
  const segNote = S.seg >= 0 ? ' Сегменты клиентов отслеживаются с марта 2010: раньше нет истории покупок.' : '';
  const guestNote = S.seg === 2 && (S.metric === 'customers' || S.metric === 'newc') ? ' У заказов без ID клиента покупатели не считаются.' : '';
  $('trend-note').textContent = `Аномалий в выбранном периоде и срезе: ${nA}. Серые полосы — дни, когда магазин закрыт, и сезонные периоды (перед Рождеством, первая неделя января); в норму они не входят.${segNote}${guestNote}`;
}

function treeFor(p) {
  const bp = baselinePeriods(p);
  if (excluded(p) || bp.length < 2) return null;
  const mean = arr => bp.reduce((s, q) => s + arr[q], 0) / bp.length;
  const R = A.revenue[p], O = A.orders[p], L = A.lines[p];
  const Rb = mean(A.revenue), Ob = mean(A.orders), Lb = mean(A.lines);
  if (!R || !O || !L || !Rb || !Ob || !Lb) return null;
  const lO = Math.log(O / Ob), lL = Math.log((L / O) / (Lb / Ob)), lV = Math.log((R / L) / (Rb / Lb));
  const tot = lO + lL + lV, delta = R - Rb, share = v => Math.abs(tot) > 1e-9 ? delta * v / tot : 0;
  return { R, O, L, Rb, Ob, Lb, delta, parts: [['Заказы', share(lO)], ['Строк в заказе', share(lL)], ['Сумма строки', share(lV)]] };
}
function devCls(x) { return Math.abs(x) < 0.005 ? '' : x > 0 ? 'up' : 'down'; }
function renderTree() {
  const p = periodOf(S.sel), t = treeFor(p);
  $('tree-title').textContent = `Дерево выручки: ${fmtPeriod(p, true)}`;
  if (!t) { $('tree').innerHTML = '<p class="note">Для этого периода нет нормы: магазин закрыт, период сезонный или не хватает таких же обычных периодов в прошлом.</p>'; $('c-contrib').innerHTML = ''; return; }
  const node = (k, v, b, root, f) => { const dev = v / b - 1; return `<div class="node${root ? ' root' : ''}"><span class="k">${k}</span><span class="v">${f(v)}</span><span class="d ${devCls(dev)}">${fmtDev(dev)} к норме</span><span class="b">норма ${f(b)}</span></div>`; };
  $('tree').innerHTML = node('Выручка', t.R, t.Rb, true, fmtGBP) + node('Заказы', t.O, t.Ob, false, fmtInt)
    + node('Строк в заказе', t.L / t.O, t.Lb / t.Ob, false, v => v.toFixed(1).replace('.', ','))
    + node('Сумма строки', t.R / t.L, t.Rb / t.Lb, false, v => '£' + v.toFixed(2).replace('.', ','));
  const el = $('c-contrib');
  const W = Math.max(300, el.clientWidth), rowH = 30, H = rowH * 3 + 24, lw = W < 480 ? 120 : 160, vw = 90;
  const mx = Math.max(1, ...t.parts.map(q => Math.abs(q[1]))), cx = lw + (W - lw - vw) / 2, half = (W - lw - vw) / 2 - 4;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Вклад множителей"><line class="zero" x1="${cx}" x2="${cx}" y1="0" y2="${rowH * 3}"/>`;
  t.parts.forEach(([n, v], k) => {
    const y = k * rowH + 6, w = Math.abs(v) / mx * half;
    s += `<text class="lab" x="0" y="${y + 13}">${n}</text><rect class="bar${v < 0 ? ' neg' : ''}" x="${v < 0 ? cx - w : cx}" y="${y}" width="${Math.max(w, 1)}" height="18" rx="3"/><text class="val" x="${W}" y="${y + 13}" text-anchor="end">${v >= 0 ? '+' : ''}${fmtGBP(v)}</text>`;
  });
  s += `<text x="${cx}" y="${H - 4}" text-anchor="middle">итого ${t.delta >= 0 ? '+' : ''}${fmtGBP(t.delta)} к норме (${fmtDev(t.R / t.Rb - 1)})</text></svg>`;
  el.innerHTML = s;
}

function renderSlices() {
  const p = periodOf(S.sel), bp = baselinePeriods(p), el = $('c-slices');
  const per = S.grain === 'day' ? (d => d) : (d => WEEK_OF[d]);
  const O = D.O;
  const top = [];
  for (let i = 0; i < O.d.length; i++) {
    if (per(O.d[i]) !== p) continue;
    if (S.grp >= 0 && O.g[i] !== S.grp) continue;
    if (S.seg >= 0 && O.s[i] !== S.seg) continue;
    top.push(i);
  }
  const totalRev = top.reduce((s, i) => s + O.r[i] + (S.clean ? 0 : O.f[i]), 0);
  top.sort((x, y) => (O.r[y] + (S.clean ? 0 : O.f[y])) - (O.r[x] + (S.clean ? 0 : O.f[x])));
  $('top-orders').innerHTML = top.length ? `<p class="note" style="margin:10px 0 4px">Крупнейшие заказы периода — так видно, не держится ли метрика на одном клиенте:</p><div class="tablewrap"><table class="t"><thead><tr><th>Заказ</th><th>Страна</th><th>Строк</th><th>Сумма</th><th>Доля периода</th></tr></thead><tbody>${top.slice(0, 3).map(i => { const v = O.r[i] + (S.clean ? 0 : O.f[i]); return `<tr><td>${O.c[i] >= 0 ? 'клиент ' + D.custIds[O.c[i]] : 'без ID'}${O.f[i] > 0 && !S.clean ? ' <span class="chip red">отменён</span>' : ''}</td><td>${esc(D.countries[O.k[i]])}</td><td>${O.l[i]}</td><td>${fmtGBP(v)}</td><td>${fmtPct(v / totalRev, 0)}</td></tr>`; }).join('')}</tbody></table></div>` : '';
  if (excluded(p) || bp.length < 2) { el.innerHTML = '<p class="note">Для этого периода нет нормы.</p>'; return; }
  const dim = S.dim, names = dim === 'g' ? D.groups : D.segments.map(x => SEG_NAMES[x]);
  const fact = new Float64Array(names.length), base = new Float64Array(names.length), bset = new Set(bp);
  for (let i = 0; i < O.d.length; i++) {
    if (S.grp >= 0 && O.g[i] !== S.grp) continue;
    if (S.seg >= 0 && O.s[i] !== S.seg) continue;
    const q = per(O.d[i]), v = O.r[i] + (S.clean ? 0 : O.f[i]), k = dim === 'g' ? O.g[i] : O.s[i];
    if (q === p) fact[k] += v; else if (bset.has(q)) base[k] += v / bp.length;
  }
  const rows = names.map((n, k) => ({ k, n, f: fact[k], b: base[k], d: fact[k] - base[k] })).filter(r => r.f || r.b).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  const W = Math.max(300, el.clientWidth), rowH = 28, H = rowH * rows.length + 6, lw = W < 480 ? 110 : 140, vw = 130;
  const mx = Math.max(1, ...rows.map(r => Math.abs(r.d))), cx = lw + (W - lw - vw) / 2, half = (W - lw - vw) / 2 - 4;
  const filt = dim === 'g' ? S.grp : S.seg;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Вклад срезов"><line class="zero" x1="${cx}" x2="${cx}" y1="0" y2="${H}"/>`;
  rows.forEach((r, n) => {
    const y = n * rowH + 4, w = Math.abs(r.d) / mx * half;
    s += `<g class="row" data-k="${r.k}"><rect x="0" y="${y - 2}" width="${W}" height="${rowH}" fill="transparent"/><text class="lab" x="0" y="${y + 13}"${filt === r.k ? ' style="font-weight:600;fill:var(--accent)"' : ''}>${esc(r.n)}</text><rect class="bar${r.d < 0 ? ' neg' : ''}" x="${r.d < 0 ? cx - w : cx}" y="${y}" width="${Math.max(w, 1)}" height="18" rx="3"/><text class="val" x="${W}" y="${y + 13}" text-anchor="end">${r.d >= 0 ? '+' : ''}${fmtGBP(r.d)} · ${fmtDev(r.b ? r.f / r.b - 1 : null)}</text></g>`;
  });
  el.innerHTML = s + '</svg>';
  el.querySelectorAll('.row').forEach(g => {
    const r = rows.find(z => z.k === +g.dataset.k);
    g.addEventListener('mousemove', ev => showTip(`<b>${esc(r.n)}</b><div class="r"><span>Выручка</span><span>${fmtGBP(r.f)}</span></div><div class="r"><span>Норма</span><span>${fmtGBP(r.b)}</span></div>`, ev));
    g.addEventListener('mouseleave', hideTip);
    g.addEventListener('click', () => { const k = +g.dataset.k; if (dim === 'g') S.grp = S.grp === k ? -1 : k; else S.seg = S.seg === k ? -1 : k; hideTip(); syncControls(); recompute(); renderAll(); });
  });
}

function renderLog() {
  const fmtD = s => fmtDate(IDX[s] ?? 0, true).replace(/, \S+$/, '');
  $('log').innerHTML = D.inc.map(r => {
    const when = r.date_from === r.date_to ? fmtD(r.date_from) : `${fmtD(r.date_from)} — ${fmtD(r.date_to)}`;
    return `<article class="logitem"><div><div class="when">${when}</div><div class="kind">${esc(r.kind)}</div></div><h3>${esc(r.title)}</h3><dl><dt>Сигнал</dt><dd>${esc(r.signal)}</dd><dt>Причина</dt><dd>${esc(r.root_cause)}</dd><dt>Влияние</dt><dd>${esc(r.impact)}</dd><dt>Что поменять</dt><dd>${esc(r.action)}</dd></dl></article>`;
  }).join('');
  const byDate = new Map();
  D.inc.forEach(r => String(r.alert_dates).split(';').forEach(d => byDate.set(d, r.title)));
  const mName = { orders: 'заказы', revenue: 'выручка', aov: 'средний чек', customers: 'покупатели' };
  const sName = { total: 'весь магазин', country: 'страна', segment: 'клиенты' };
  let explained = 0, regular = 0;
  const rows = D.alerts.map((a, i) => {
    const [grain, d, st, sv, met, val, base, dev, z, pt] = a;
    let status;
    if (pt !== 'regular') status = '<span class="chip">сезонный период</span>';
    else { regular++; const t = byDate.get(D.dates[d]); if (t) { explained++; status = `<span class="chip red">${esc(t)}</span>`; } else status = '<span class="chip">не разобран</span>'; }
    const label = st === 'segment' ? SEG_NAMES[sv] : sv;
    const f = met === 'revenue' || met === 'aov' ? fmtGBP : fmtInt;
    return `<tr class="click" data-i="${i}"><td>${grain === 'day' ? 'день' : 'неделя'}</td><td>${fmtDate(d)}</td><td class="txt" style="min-width:150px">${sName[st]}: ${esc(label)}</td><td class="txt" style="min-width:100px">${mName[met]}</td><td>${f(val)}</td><td>${f(base)}</td><td class="${dev < 0 ? 'neg' : 'pos'}">${fmtDev(dev)}</td><td>${String(z).replace('.', ',')}</td><td class="txt">${status}</td></tr>`;
  }).join('');
  $('alerts').innerHTML = `<p class="note" style="margin:8px 0">${D.alerts.length} алертов из витрины mart_alerts (дни и недели). В обычные периоды — ${regular}, из них разобрано в журнале ${explained}. Порог: |z| ≥ 4,5 и отклонение ≥ 25%, в норме не меньше 10 заказов.</p><table class="t"><thead><tr><th>Шаг</th><th>Начало</th><th>Срез</th><th>Метрика</th><th>Факт</th><th>Норма</th><th>Откл.</th><th>z</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table>`;
  $('alerts').querySelectorAll('tr.click').forEach(tr => tr.addEventListener('click', () => {
    const [grain, d, st, sv, met] = D.alerts[+tr.dataset.i];
    Object.assign(S, { grp: st === 'country' ? D.groups.indexOf(sv) : -1, seg: st === 'segment' ? D.segments.indexOf(sv) : -1, metric: ALERT_METRIC[met], grain, sel: d, from: 0, to: ND - 1, clean: true });
    syncControls(); recompute(); renderAll();
    $('c-trend').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}

const COH_BINS = [[0.05, '<5%', '--seq-0'], [0.1, '5–10%', '--seq-1'], [0.15, '10–15%', '--seq-2'], [0.2, '15–20%', '--seq-3'], [0.25, '20–25%', '--seq-4'], [0.3, '25–30%', '--seq-5'], [Infinity, '30%+', '--seq-6']];
function renderCohorts() {
  const el = $('c-cohort');
  const months = [...new Set(D.cohorts.map(r => r[0]))].sort();
  const size = {}, val = {};
  D.cohorts.forEach(([cm, off, n]) => { if (off === 0) size[cm] = n; val[cm + '|' + off] = n; });
  const maxOff = 12, W = Math.max(300, el.clientWidth), lw = 74, rowH = W < 480 ? 14 : 17, cw = (W - lw) / maxOff, H = rowH * months.length + 22;
  const showText = cw >= 34;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Удержание по когортам">`;
  for (let o = 1; o <= maxOff; o++) s += `<text x="${lw + (o - 0.5) * cw}" y="11" text-anchor="middle">+${o}</text>`;
  months.forEach((cm, r) => {
    const y = 16 + r * rowH, [yy, mm] = cm.split('-').map(Number);
    s += `<text x="${lw - 6}" y="${y + rowH - 4}" text-anchor="end" style="font-size:${W < 480 ? 10 : 11}px">${MON[mm - 1]} ${String(yy).slice(2)} · ${size[cm]}</text>`;
    for (let o = 1; o <= maxOff; o++) {
      const n = val[cm + '|' + o];
      if (n == null) continue;
      const rr = n / size[cm], bin = COH_BINS.find(b => rr < b[0]);
      s += `<rect class="cell" x="${lw + (o - 1) * cw}" y="${y}" width="${cw}" height="${rowH}" fill="var(${bin[2]})" data-t="${MON[mm - 1]} ${yy} · +${o} мес.: ${n} из ${size[cm]} (${fmtPct(rr, 0)})"/>`;
      if (showText) s += `<text x="${lw + (o - 0.5) * cw}" y="${y + rowH - 4}" text-anchor="middle" style="font-size:10px;fill:${rr >= 0.2 ? '#fff' : 'var(--ink-2)'};pointer-events:none">${Math.round(rr * 100)}</text>`;
    }
  });
  el.innerHTML = s + '</svg>';
  el.querySelector('svg').addEventListener('mousemove', ev => { const t = ev.target.dataset && ev.target.dataset.t; if (t) showTip(t, ev); else hideTip(); });
  el.querySelector('svg').addEventListener('mouseleave', hideTip);
  $('cohort-legend').innerHTML = COH_BINS.map(b => `<span><i style="background:var(${b[2]})"></i>${b[1]}</span>`).join('');
}

function renderConc() {
  const el = $('c-conc');
  const W = Math.max(300, el.clientWidth), H = 220, m = { l: 44, r: 12, t: 10, b: 26 };
  const n = D.conc.length, xs = r => m.l + (r - 1) / (n - 1) * (W - m.l - m.r), ys = v => m.t + (1 - v / 0.4) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Концентрация выручки">`;
  for (const v of [0, 0.1, 0.2, 0.3, 0.4]) s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${m.l - 6}" y="${ys(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  for (const r of [1, 10, 25, 50, 100]) s += `<text x="${xs(r)}" y="${H - 8}" text-anchor="middle">${r}</text>`;
  s += `<path class="area" d="M${xs(1)},${ys(0)} ${D.conc.map(c => `L${xs(c[0])},${ys(c[5])}`).join(' ')} L${xs(n)},${ys(0)}Z"/><path class="line" d="${D.conc.map((c, i) => `${i ? 'L' : 'M'}${xs(c[0])},${ys(c[5])}`).join(' ')}"/>`;
  for (const r of [10, 100]) { const c = D.conc[r - 1]; s += `<circle class="dot" cx="${xs(r)}" cy="${ys(c[5])}" r="4" style="fill:var(--accent)"/><text class="val" x="${xs(r) - 6}" y="${ys(c[5]) - 8}" text-anchor="end">топ-${r}: ${fmtPct(c[5], 0)}</text>`; }
  s += `<rect id="conc-hit" x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent"/></svg>`;
  el.innerHTML = s;
  $('conc-hit').addEventListener('mousemove', ev => {
    const r0 = el.querySelector('svg').getBoundingClientRect(), xx = (ev.clientX - r0.left) * W / r0.width;
    const r = Math.max(1, Math.min(n, Math.round(1 + (xx - m.l) / (W - m.l - m.r) * (n - 1)))), c = D.conc[r - 1];
    showTip(`<b>Топ-${r} клиентов</b><div class="r"><span>Доля выручки</span><span>${fmtPct(c[5], 1)}</span></div><div class="r"><span>Клиент №${r}</span><span>${esc(c[2])}, ${fmtGBP(c[3])}</span></div>`, ev);
  });
  $('conc-hit').addEventListener('mouseleave', hideTip);
  const c1 = D.conc[0];
  $('conc-note').textContent = `Клиентов с ID — 5 852. Крупнейший (${c1[2]}) дал ${fmtPct(c1[4], 1)} всей выручки за 2 года. За весь период, без учёта фильтров.`;
}

function renderCountries() {
  const len = S.to - S.from + 1, hasPrev = S.from - len >= 0;
  const acc = (a, b) => {
    const m = new Map(); const O = D.O;
    for (let i = 0; i < O.d.length; i++) {
      const d = O.d[i]; if (d < a || d > b) continue;
      if (S.seg >= 0 && O.s[i] !== S.seg) continue;
      const k = O.k[i]; let o = m.get(k); if (!o) { o = { r: 0, n: 0, c: new Set() }; m.set(k, o); }
      o.r += O.r[i] + (S.clean ? 0 : O.f[i]); o.n++; if (O.c[i] >= 0) o.c.add(O.c[i]);
    }
    return m;
  };
  const cur = acc(S.from, S.to), prev = hasPrev ? acc(S.from - len, S.from - 1) : new Map();
  const total = [...cur.values()].reduce((s, o) => s + o.r, 0);
  const rows = [...cur.entries()].sort((a, b) => b[1].r - a[1].r).slice(0, 15);
  $('country-table').innerHTML = `<table class="t"><thead><tr><th>Страна</th><th>Выручка</th><th>Доля</th><th>Заказы</th><th>Средний чек</th><th>Покупатели</th><th>Δ выручки</th></tr></thead><tbody>${rows.map(([k, o]) => { const p = prev.get(k); const dv = hasPrev && p && p.r ? o.r / p.r - 1 : null; return `<tr><td>${esc(D.countries[k])}</td><td>${fmtGBP(o.r)}</td><td>${fmtPct(o.r / total, 1)}</td><td>${fmtInt(o.n)}</td><td>${fmtGBP(o.r / o.n)}</td><td>${fmtInt(o.c.size)}</td><td class="${dv == null ? '' : dv < 0 ? 'neg' : 'pos'}">${fmtDev(dv)}</td></tr>`; }).join('')}</tbody></table><p class="note" style="margin-top:6px">Показаны 15 крупнейших стран из ${cur.size}.</p>`;
}

function renderDQ() {
  $('dq').innerHTML = `<table class="t"><thead><tr><th>Проверка</th><th>Строк</th><th>Статус</th><th style="text-align:left">Что делаем</th></tr></thead><tbody>${D.dq.map(([n, bad, act]) => `<tr><td style="white-space:normal;min-width:200px">${esc(n)}</td><td>${fmtInt(bad)}</td><td>${bad ? '<span class="chip red">найдено</span>' : '<span class="chip ok">OK</span>'}</td><td class="txt">${esc(act)}</td></tr>`).join('')}</tbody></table>`;
}

function syncControls() {
  $('f-from').value = D.dates[S.from]; $('f-to').value = D.dates[S.to];
  $('f-grp').value = S.grp; $('f-seg').value = S.seg; $('f-clean').checked = S.clean;
  document.querySelectorAll('#seg-metric button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === S.metric));
  document.querySelectorAll('#seg-grain button').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === S.grain));
  document.querySelectorAll('#seg-dim button').forEach(b => b.setAttribute('aria-pressed', b.dataset.dim === S.dim));
}
function renderAll() {
  const safe = (f, id) => { try { f(); } catch (e) { const el = $(id); if (el) el.innerHTML = `<p class="note" style="color:var(--alert)">Ошибка отрисовки: ${esc(e.message)}</p>`; console.error(e); } };
  safe(renderKPIs, 'kpis'); safe(renderTrend, 'c-trend'); safe(renderTree, 'tree'); safe(renderSlices, 'c-slices'); safe(renderCountries, 'country-table');
}

function init() {
  $('f-grp').innerHTML = '<option value="-1">Все страны</option>' + D.groups.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join('');
  $('f-seg').innerHTML = '<option value="-1">Все клиенты</option>' + D.segments.map((n, i) => `<option value="${i}">${SEG_NAMES[n]}</option>`).join('');
  ['f-from', 'f-to'].forEach(id => { $(id).min = D.dates[0]; $(id).max = D.dates[ND - 1]; });
  $('f-from').addEventListener('change', e => { const i = IDX[e.target.value]; if (i != null) S.from = Math.min(i, S.to); syncControls(); renderAll(); });
  $('f-to').addEventListener('change', e => { const i = IDX[e.target.value]; if (i != null) S.to = Math.max(i, S.from); syncControls(); renderAll(); });
  $('f-grp').addEventListener('change', e => { S.grp = +e.target.value; recompute(); renderAll(); });
  $('f-seg').addEventListener('change', e => { S.seg = +e.target.value; recompute(); renderAll(); });
  $('f-clean').addEventListener('change', e => { S.clean = e.target.checked; recompute(); renderAll(); });
  $('f-reset').addEventListener('click', () => { Object.assign(S, { from: 0, to: ND - 1, grp: -1, seg: -1, clean: true }); syncControls(); recompute(); renderAll(); });
  document.querySelectorAll('#seg-metric button').forEach(b => b.addEventListener('click', () => { S.metric = b.dataset.m; syncControls(); renderTrend(); }));
  document.querySelectorAll('#seg-grain button').forEach(b => b.addEventListener('click', () => { S.grain = b.dataset.g; syncControls(); recompute(); renderAll(); }));
  document.querySelectorAll('#seg-dim button').forEach(b => b.addEventListener('click', () => { S.dim = b.dataset.dim; syncControls(); renderSlices(); }));
  $('alerts-btn').addEventListener('click', () => { const el = $('alerts'); el.hidden = !el.hidden; $('alerts-btn').textContent = el.hidden ? 'Показать все алерты системы' : 'Скрыть алерты'; });
  renderCards(); renderLog(); renderDQ();
  syncControls(); recompute(); renderAll(); renderCohorts(); renderConc();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { renderAll(); renderCohorts(); renderConc(); }, 150); });
}
init();
})();
