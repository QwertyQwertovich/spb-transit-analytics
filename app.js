/* =========================================================
   app.js — SPb Transit Analytics Dashboard
   ========================================================= */

'use strict';

// ── Constants ─────────────────────────────────────────────
const EXCLUDED_OPERATORS = [
  'ИП Гиляев Михаил Викторович',
  'ИП Марковчин Александр Петрович',
  'ИП Кулик Владимир Владимирович',
  'ООО "ПТК"',
];

const GET_NAME = 'ГУП "Горэлектротранс"';

const SUBURBAN_DISTRICTS = [
  'Кронштадтский район',
  'Курортный район',
  'Петродворцовый район',
  'Пушкинский район',
  'Колпинский район',
  'Красносельский район',
];

// ── State ─────────────────────────────────────────────────
const state = {
  summary: null,
  summary: {}, routes: [], cube: [], mapShapes: null,
  filteredRoutes: [], page: 0, pageSize: 20, sortCol: 'speed_median', sortDir: -1,
  charts: {}, mapInstance: null, speedMin: 0, speedMax: 30,
  tabInitialized: new Set(['overview']),
};

// ── Helpers ───────────────────────────────────────────────
const fmt1   = v => v == null ? '—' : Number(v).toFixed(1);
const fmtKm  = v => v == null ? '—' : Math.round(v).toLocaleString('ru');
const wMed   = (items, valKey, wKey) => {
  // Weighted median approximation (weighted average of medians)
  const total = items.reduce((s, i) => s + (i[wKey] || 0), 0);
  if (!total) return items.reduce((s, i) => s + (i[valKey] || 0), 0) / items.length;
  return items.reduce((s, i) => s + (i[valKey] || 0) * (i[wKey] || 0), 0) / total;
};

function speedColor(kmh, min, max) {
  min = min ?? state.speedMin;
  max = max ?? state.speedMax;
  const t = Math.max(0, Math.min(1, (kmh - min) / (max - min)));
  if (t < 0.5) {
    const u = t * 2;
    return `rgb(${Math.round(224 + (240 - 224) * u)},${Math.round(85 + (160 - 85) * u)},${Math.round(85 + (80 - 85) * u)})`;
  }
  const u = (t - 0.5) * 2;
  return `rgb(${Math.round(240 + (56 - 240) * u)},${Math.round(160 + (201 - 160) * u)},${Math.round(80 + (164 - 80) * u)})`;
}

function computeSpeedRange(routes) {
  const speeds = routes.map(r => r.speed_median).filter(v => v > 0).sort((a, b) => a - b);
  if (!speeds.length) return;
  const p5  = speeds[Math.floor(speeds.length * 0.05)] ?? speeds[0];
  const p95 = speeds[Math.floor(speeds.length * 0.95)] ?? speeds[speeds.length - 1];
  state.speedMin = Math.floor(p5);
  state.speedMax = Math.ceil(p95);
  updateSpeedLegend();
}

function updateSpeedLegend() {
  document.querySelectorAll('.speed-legend-min').forEach(el => { el.textContent = `${state.speedMin} км/ч`; });
  document.querySelectorAll('.speed-legend-max').forEach(el => { el.textContent = `${state.speedMax} км/ч`; });
}

function typeName(t) {
  const m = { bus: 'Автобус', bus_city: 'Автобус (город)', tram: 'Трамвай', trolleybus: 'Троллейбус', metro: 'Метро' };
  return m[t] || t;
}
function typeClass(t) {
  const m = { bus: 'bus', bus_city: 'bus', tram: 'tram', trolleybus: 'trolleybus', metro: 'metro' };
  return m[t] || 'other';
}
function typeColor(t, alpha = 0.75) {
  const m = {
    bus:        `rgba(91,138,240,${alpha})`,
    bus_city:   `rgba(120,160,255,${alpha})`,
    tram:       `rgba(224,85,85,${alpha})`,
    trolleybus: `rgba(56,201,164,${alpha})`,
    metro:      `rgba(168,85,247,${alpha})`,
  };
  return m[t] || `rgba(240,160,80,${alpha})`;
}

function shortName(s, len = 26) {
  if (!s) return '—';
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

// ── Cube Query ────────────────────────────────────────────
function queryCube(filters = {}, groupBy = null) {
  const def = { operator_name: ['All'], district: ['All'], transport_type: ['All'], urban: ['All'] };
  const target = { ...def };
  
  for (const k in filters) {
    if (Array.isArray(filters[k]) && filters[k].length > 0) target[k] = filters[k];
    else if (filters[k] && filters[k] !== 'All') target[k] = [filters[k]];
  }

  if (groupBy) target[groupBy] = null; // We want all distinct values for this dimension
  
  // Helper for weighted median approximation
  const wMedCube = (items, valKey, wKey) => {
    const total = items.reduce((s, i) => s + (i[wKey] || 0), 0);
    if (!total) return items.reduce((s, i) => s + (i[valKey] || 0), 0) / (items.length || 1);
    return items.reduce((s, i) => s + (i[valKey] || 0) * (i[wKey] || 0), 0) / total;
  };

  // If we only have 1 value per filter, it's an exact cube match
  const isExact = Object.values(target).every(v => v === null || v.length === 1);
  
  if (isExact) {
    return state.cube.filter(row => {
      for (const key of Object.keys(def)) {
        const t = target[key];
        if (t !== null && row[key] !== t[0]) return false;
        if (t === null && row[key] === 'All') return false; 
      }
      return row.routes > 0;
    });
  }
  
  // For multi-select, we must fetch the granular slices and combine them
  // We need rows where grouped dimension != 'All', and other dimensions are exactly the selected values (NOT 'All')
  const rawSlices = state.cube.filter(row => {
    for (const key of Object.keys(def)) {
      const t = target[key];
      if (t === null) {
        if (row[key] === 'All') return false;
      } else {
        // If 'All' is in the target array, we need the 'All' row for this dimension
        if (t.includes('All')) {
          if (row[key] !== 'All') return false;
        } else {
          // If specific values are selected, match any of them, but NOT 'All'
          if (!t.includes(row[key])) return false;
        }
      }
    }
    return row.routes > 0;
  });
  
  // Group by the `groupBy` dimension
  if (!groupBy) {
    return [{
      routes: rawSlices.reduce((s, r) => s + r.routes, 0),
      total_km: rawSlices.reduce((s, r) => s + r.total_km, 0),
      speed_median: wMedCube(rawSlices, 'speed_median', 'total_km'),
      speed_mean: wMedCube(rawSlices, 'speed_mean', 'total_km'),
      speed_p25: wMedCube(rawSlices, 'speed_p25', 'total_km'),
      speed_p75: wMedCube(rawSlices, 'speed_p75', 'total_km'),
    }];
  }
  
  const groups = {};
  rawSlices.forEach(row => {
    const k = row[groupBy];
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  });
  
  return Object.keys(groups).map(k => {
    const list = groups[k];
    return {
      [groupBy]: k,
      routes: list.reduce((s, r) => s + r.routes, 0),
      total_km: list.reduce((s, r) => s + r.total_km, 0),
      speed_median: wMedCube(list, 'speed_median', 'total_km'),
      speed_mean: wMedCube(list, 'speed_mean', 'total_km'),
      speed_p25: wMedCube(list, 'speed_p25', 'total_km'),
      speed_p75: wMedCube(list, 'speed_p75', 'total_km'),
    };
  });
}

// ── Data loading ──────────────────────────────────────────
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}

async function loadAll() {
  const base = 'data/processed/';
  [state.summary, state.routes, state.cube] =
    await Promise.all([
      loadJSON(base + 'summary.json'),
      loadJSON(base + 'routes_stats.json'),
      loadJSON(base + 'cube_stats.json'),
    ]);
  computeSpeedRange(state.routes);
}

// ── Navigation ────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${tab}`).classList.add('active');

      // Lazy rendering
      if (!state.tabInitialized.has(tab)) {
        state.tabInitialized.add(tab);
        if (tab === 'districts') renderDistricts();
        if (tab === 'operators') renderOperators();
        if (tab === 'types')     renderTypes();
        if (tab === 'compare')   initCompareFilters();
        if (tab === 'map')       initMap();
      }
    });
  });
}

// ── Chart defaults ────────────────────────────────────────
function chartDefaults(extra = {}) {
  const base = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#7a8aaa', font: { family: 'Inter', size: 11 } } },
    },
    scales: {},
  };

  // Merge plugins
  const plugins = { ...base.plugins, ...(extra.plugins || {}) };
  if (extra.plugins?.legend) plugins.legend = { ...base.plugins.legend, ...extra.plugins.legend };
  if (extra.plugins?.tooltip) plugins.tooltip = extra.plugins.tooltip;

  // Merge scales
  const scaleDefaults = { grid: { color: 'rgba(99,120,180,.1)' }, ticks: { color: '#7a8aaa', font: { family: 'Inter', size: 11 } } };
  const scales = {};
  for (const [k, v] of Object.entries(extra.scales || {})) {
    scales[k] = { ...scaleDefaults, ...v };
    if (v.grid) scales[k].grid = { ...scaleDefaults.grid, ...v.grid };
  }

  return {
    responsive: true,
    maintainAspectRatio: true,
    ...(extra.indexAxis ? { indexAxis: extra.indexAxis } : {}),
    plugins,
    scales,
  };
}

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

// ── Overview tab ──────────────────────────────────────────
function renderOverview() {
  const s = state.summary;
  const routes = state.routes;
  const totalRoutes = routes.length;
  const totalOps    = new Set(routes.map(r => r.operator_name).filter(Boolean)).size;

  const kpis = [
    { label: 'Маршрутов',       value: totalRoutes,                          unit: 'в расписании' },
    { label: 'Перевозчиков',    value: totalOps,                             unit: '', cls: 'accent2' },
    { label: 'Остановок',       value: s.total_stops.toLocaleString('ru'),   unit: '' },
    { label: 'Районов',         value: s.total_districts,                    unit: 'охвачено' },
    { label: 'Медиана скорости',value: fmt1(s.city_speed_median),            unit: 'км/ч по городу', cls: 'accent' },
    { label: 'Средняя скорость',value: fmt1(s.city_speed_mean),              unit: 'км/ч' },
    { label: 'Q25 / Q75',       value: `${fmt1(s.city_speed_p25)} / ${fmt1(s.city_speed_p75)}`, unit: 'км/ч' },
    { label: 'Км проанализировано', value: fmtKm(s.total_km_analyzed / 1e6) + ' млн', unit: 'пасс-км' },
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.cls || ''}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
      ${k.unit ? `<div class="kpi-unit">${k.unit}</div>` : ''}
    </div>`).join('');

  // Speed distribution histogram
  const speeds = routes.map(r => r.speed_median).filter(v => v > 0);
  const bins = 30, minS = 0, maxS = 65;
  const hist = Array(bins).fill(0);
  speeds.forEach(v => { const i = Math.min(Math.floor((v - minS) / (maxS - minS) * bins), bins - 1); if (i >= 0) hist[i]++; });
  const histLabels = hist.map((_, i) => ((minS + (i + 0.5) * (maxS - minS) / bins)).toFixed(1));

  destroyChart('cityDistChart');
  state.charts.cityDist = new Chart(document.getElementById('cityDistChart'), {
    type: 'bar',
    data: {
      labels: histLabels,
      datasets: [{ data: hist, backgroundColor: histLabels.map(l => speedColor(+l, 10, 35)), borderWidth: 0, borderRadius: 3 }]
    },
    options: chartDefaults({
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: c => `~${c[0].label} км/ч`, label: c => `${c.raw} маршрутов` } }
      },
      scales: {
        x: { title: { display: true, text: 'Медиана скорости, км/ч', color: '#7a8aaa' } },
        y: { title: { display: true, text: 'Маршрутов', color: '#7a8aaa' } },
      }
    })
  });

  // Types overview stacked
  const types = queryCube({}, 'transport_type').filter(t => t.transport_type !== 'bus_city')
    .sort((a, b) => b.speed_median - a.speed_median);
  destroyChart('typeOverviewChart');
  state.charts.typeOverview = new Chart(document.getElementById('typeOverviewChart'), {
    type: 'bar',
    data: {
      labels: types.map(t => typeName(t.transport_type)),
      datasets: [
        { label: 'Q25',     data: types.map(t => t.speed_p25), backgroundColor: types.map(t => typeColor(t.transport_type, 0.2)), borderRadius: 4, borderWidth: 0, stack: 's' },
        { label: 'Медиана', data: types.map(t => t.speed_median - t.speed_p25), backgroundColor: types.map(t => typeColor(t.transport_type, 0.85)), borderRadius: 4, borderWidth: 0, stack: 's' },
        { label: 'Q75',     data: types.map(t => t.speed_p75 - t.speed_median), backgroundColor: types.map(t => typeColor(t.transport_type, 0.3)), borderRadius: 4, borderWidth: 0, stack: 's' },
      ]
    },
    options: chartDefaults({
      plugins: {
        legend: { labels: { color: '#7a8aaa', font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => {
          const d = types[c.dataIndex];
          return [`Q25: ${fmt1(d.speed_p25)}`, `Медиана: ${fmt1(d.speed_median)}`, `Q75: ${fmt1(d.speed_p75)}`];
        }}}
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: 'км/ч', color: '#7a8aaa' } }
      }
    })
  });

  // Top/bottom routes
  const sorted = [...routes].filter(r => r.speed_median > 0).sort((a, b) => b.speed_median - a.speed_median);
  const top10 = sorted.slice(0, 10);
  const bot10 = sorted.slice(-10).reverse();
  const combined = [...top10, ...bot10];

  destroyChart('topRoutesChart');
  state.charts.topRoutes = new Chart(document.getElementById('topRoutesChart'), {
    type: 'bar',
    data: {
      labels: combined.map(r => r.short_name || r.route_id),
      datasets: [{ data: combined.map(r => r.speed_median), backgroundColor: combined.map(r => speedColor(r.speed_median, 10, 35)), borderRadius: 4, borderWidth: 0 }]
    },
    options: chartDefaults({
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: c => `Маршрут ${combined[c[0].dataIndex].short_name}`,
          label: c => [`Медиана: ${fmt1(c.raw)} км/ч`, `Перевозчик: ${combined[c[0].dataIndex].operator_name || '—'}`, `Тип: ${typeName(combined[c[0].dataIndex].transport_type)}`]
        }}
      },
      scales: { x: { title: { display: true, text: 'Медиана скорости, км/ч', color: '#7a8aaa' } } }
    })
  });
}

// ── Routes table ──────────────────────────────────────────
function initRoutesFilters() {
  const ops   = [...new Set(state.routes.map(r => r.operator_name).filter(Boolean))].sort();
  const dists = [...new Set(state.routes.flatMap(r => r.districts || []).filter(Boolean))].sort();

  const opSel = document.getElementById('filterOperator');
  ops.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = op; opSel.appendChild(o); });

  const dSel = document.getElementById('filterDistrict');
  dists.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = d; dSel.appendChild(o); });

  ['filterSearch', 'filterType', 'filterOperator', 'filterDistrict', 'filterUrban'].forEach(id =>
    document.getElementById(id).addEventListener('input', () => { state.page = 0; applyRouteFilters(); })
  );
  document.getElementById('btnResetFilters').addEventListener('click', resetRouteFilters);

  document.querySelectorAll('#routesTable th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (state.sortCol === col) state.sortDir *= -1;
      else { state.sortCol = col; state.sortDir = -1; }
      document.querySelectorAll('#routesTable th').forEach(h => {
        h.classList.remove('sorted');
        const icon = h.querySelector('.sort-icon');
        if (icon) icon.textContent = '↕';
      });
      th.classList.add('sorted');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = state.sortDir === -1 ? '↓' : '↑';
      state.page = 0;
      renderRoutesTable();
    });
  });

  applyRouteFilters();
}

function resetRouteFilters() {
  ['filterSearch', 'filterType', 'filterOperator', 'filterDistrict', 'filterUrban'].forEach(id => {
    document.getElementById(id).value = '';
  });
  state.page = 0;
  applyRouteFilters();
}

function applyRouteFilters() {
  const search   = document.getElementById('filterSearch').value.toLowerCase();
  const type     = document.getElementById('filterType').value;
  const operator = document.getElementById('filterOperator').value;
  const district = document.getElementById('filterDistrict').value;
  const urban    = document.getElementById('filterUrban').value;

  state.filteredRoutes = state.routes.filter(r => {
    if (search   && !r.short_name?.toLowerCase().includes(search) && !r.long_name?.toLowerCase().includes(search)) return false;
    if (type     && r.transport_type !== type) return false;
    if (operator && r.operator_name !== operator) return false;
    if (district && !(r.districts || []).includes(district)) return false;
    if (urban !== '' && String(r.urban) !== urban) return false;
    return true;
  });

  // Update adaptive color range
  computeSpeedRange(state.filteredRoutes.length > 5 ? state.filteredRoutes : state.routes);

  renderRoutesTable();
}

function renderRoutesTable() {
  const { filteredRoutes: rows, sortCol, sortDir, page, pageSize } = state;

  const sorted = [...rows].sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av == null) return 1; if (bv == null) return -1;
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur   = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, (cur + 1) * pageSize);

  document.getElementById('routeCount').textContent = `${total} маршрутов`;
  document.getElementById('tableInfo').textContent  = `Показано ${slice.length} из ${total}`;

  const tbody = document.getElementById('routesBody');
  tbody.innerHTML = slice.map(r => {
    const col  = speedColor(r.speed_median);
    const dists = (r.districts || []).slice(0, 3).map(d => `<span class="district-tag">${d}</span>`).join('');
    const more  = (r.districts || []).length > 3 ? `<span class="district-tag">+${(r.districts || []).length - 3}</span>` : '';
    return `<tr>
      <td style="font-weight:600">${r.short_name || r.route_id}</td>
      <td><span class="type-pill type-${typeClass(r.transport_type)}">${typeName(r.transport_type)}</span></td>
      <td><span class="speed-badge"><span class="speed-dot" style="background:${col}"></span>${fmt1(r.speed_median)}</span></td>
      <td style="font-family:var(--mono);font-size:.8rem">${fmt1(r.speed_mean)}</td>
      <td style="font-family:var(--mono);font-size:.8rem;color:var(--text-dim)">${fmt1(r.speed_p25)}</td>
      <td style="font-family:var(--mono);font-size:.8rem;color:var(--text-dim)">${fmt1(r.speed_p75)}</td>
      <td style="font-family:var(--mono);font-size:.8rem;color:var(--text-dim)">${fmtKm(r.total_km)} км</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;font-size:.78rem">${r.operator_name || '—'}</td>
      <td><div class="district-tags">${dists}${more}</div></td>
    </tr>`;
  }).join('');

  renderPagination(pages, cur);
}

function renderPagination(pages, cur) {
  const el = document.getElementById('pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }
  const btns = [];
  const add = (i, label) => btns.push(`<button class="page-btn ${i === cur ? 'active' : ''}" data-page="${i}">${label}</button>`);
  add(0, '«');
  const range = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - cur) <= 2) range.push(i);
  }
  let prev = -1;
  range.forEach(i => {
    if (prev !== -1 && i - prev > 1) btns.push(`<span style="color:var(--text-muted);padding:4px">…</span>`);
    add(i, i + 1); prev = i;
  });
  add(pages - 1, '»');
  el.innerHTML = btns.join('');
  el.innerHTML = btns.join('');
  el.querySelectorAll('.page-btn').forEach(btn =>
    btn.addEventListener('click', () => { state.page = +btn.dataset.page; renderRoutesTable(); })
  );
}

// ── Compare tab ───────────────────────────────────────────
function getMultiValues(id) {
  const cbs = document.querySelectorAll(`#${id} input[type="checkbox"]:checked`);
  return Array.from(cbs).map(cb => cb.value);
}

function updateMsLabel(id) {
  const details = document.getElementById(id);
  if (!details) return;
  const cbs = details.querySelectorAll('input[type="checkbox"]');
  const checked = Array.from(cbs).filter(cb => cb.checked);
  const label = details.querySelector('.ms-label');
  
  if (checked.length === cbs.length) label.textContent = 'Все';
  else if (checked.length === 0) label.textContent = 'Ничего';
  else if (checked.length === 1) label.textContent = checked[0].parentNode.textContent.trim();
  else label.textContent = `Выбрано: ${checked.length}`;
}

function initCompareFilters() {
  const ops   = [...new Set(state.routes.map(r => r.operator_name).filter(Boolean))].sort();
  const dists = [...new Set(state.routes.flatMap(r => r.districts || []).filter(Boolean))].sort();

  const msOptionsOp = document.getElementById('msOptionsOp');
  msOptionsOp.innerHTML = '';
  ops.forEach(op => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${op}" checked> ${shortName(op, 30)}`;
    msOptionsOp.appendChild(lbl);
  });

  const msOptionsDist = document.getElementById('msOptionsDist');
  msOptionsDist.innerHTML = '';
  dists.forEach(d => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${d}" checked> ${d}`;
    msOptionsDist.appendChild(lbl);
  });

  ['cmpFilterType', 'cmpFilterDist', 'cmpFilterOp', 'cmpFilterUrban'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      updateMsLabel(id);
      renderCompare();
    });
    updateMsLabel(id);
  });
  
  document.getElementById('cmpGroupBy').addEventListener('change', renderCompare);

  document.getElementById('btnCmpReset').addEventListener('click', () => {
    ['cmpFilterType', 'cmpFilterDist', 'cmpFilterOp', 'cmpFilterUrban'].forEach(id => {
      document.querySelectorAll(`#${id} input[type="checkbox"]`).forEach(cb => cb.checked = true);
      updateMsLabel(id);
    });
    renderCompare();
  });

  // Close details on outside click
  document.addEventListener('click', e => {
    document.querySelectorAll('.multi-select').forEach(details => {
      if (!details.contains(e.target)) details.removeAttribute('open');
    });
  });

  renderCompare();
}

function renderCompare() {
  const groupBy = document.getElementById('cmpGroupBy').value;
  
  let fType  = getMultiValues('cmpFilterType');
  let fDist  = getMultiValues('cmpFilterDist');
  let fOp    = getMultiValues('cmpFilterOp');
  let fUrban = getMultiValues('cmpFilterUrban');
  
  // If all are selected, it's equivalent to 'All'
  if (fType.length === 4) fType = ['All'];
  if (fDist.length === document.querySelectorAll('#msOptionsDist input').length) fDist = ['All'];
  if (fOp.length === document.querySelectorAll('#msOptionsOp input').length) fOp = ['All'];
  if (fUrban.length === 2) fUrban = ['All'];

  // Query OLAP cube directly
  let data = queryCube({ transport_type: fType, district: fDist, operator_name: fOp, urban: fUrban }, groupBy);
  
  // Sort by median speed
  data.sort((a, b) => b.speed_median - a.speed_median);

  // Update UI headers
  const typeLabel = fType[0] !== 'All' ? document.getElementById('cmpFilterType').querySelector('.ms-label').textContent : '';
  const opLabel   = fOp[0] !== 'All' ? document.getElementById('cmpFilterOp').querySelector('.ms-label').textContent : '';
  const distLabel = fDist[0] !== 'All' ? document.getElementById('cmpFilterDist').querySelector('.ms-label').textContent : '';
  const urbLabel  = fUrban[0] !== 'All' ? document.getElementById('cmpFilterUrban').querySelector('.ms-label').textContent : '';

  const activeFilters = [typeLabel, opLabel, distLabel, urbLabel].filter(Boolean);
  let title = 'Сравнение ';
  if (groupBy === 'operator_name') title += 'перевозчиков';
  else if (groupBy === 'district') title += 'районов';
  else title += 'типов транспорта';
  
  if (activeFilters.length) title += ' (' + activeFilters.join(', ') + ')';

  document.getElementById('cmpTitle').textContent = title;
  
  // Total routes for this filter combination
  const totalRes = queryCube({ transport_type: fType, district: fDist, operator_name: fOp, urban: fUrban }, null);
  const totalRoutes = totalRes.length ? totalRes[0].routes : 0;
  document.getElementById('cmpRouteCount').textContent = `${totalRoutes} маршрутов`;
  
  document.getElementById('cmpTableInfo').textContent  = `Найдено ${data.length} групп`;

  const groupLabelMap = { operator_name: 'Перевозчик', district: 'Район', transport_type: 'Тип ТС' };
  document.getElementById('cmpTh-name').textContent = groupLabelMap[groupBy] || 'Группа';

  if (data.length === 0) {
    document.getElementById('cmpChartWrap').innerHTML = `<div class="cmp-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>Нет данных для заданных фильтров</div>`;
    document.getElementById('cmpBody').innerHTML = '';
    return;
  }
  document.getElementById('cmpChartWrap').innerHTML = '<canvas id="cmpChart" height="80"></canvas>';

  // Render chart
  const minSpd = data[data.length - 1].speed_median;
  const maxSpd = data[0].speed_median;
  
  state.charts.compareChart = new Chart(document.getElementById('cmpChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => groupBy === 'transport_type' ? typeName(d[groupBy]) : shortName(d[groupBy], 25)),
      datasets: [{
        label: 'Медиана',
        data: data.map(d => d.speed_median),
        backgroundColor: data.map(d => speedColor(d.speed_median, minSpd - 2, maxSpd + 2)),
        borderRadius: 4, borderWidth: 0
      }]
    },
    options: chartDefaults({
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${fmt1(c.raw)} км/ч (${data[c.dataIndex].routes} марш.)` } }
      },
      scales: { y: { title: { display: true, text: 'Медиана км/ч', color: '#7a8aaa' } } }
    })
  });

  // Render table
  const tbody = document.getElementById('cmpBody');
  tbody.innerHTML = data.map((d, i) => {
    const col = speedColor(d.speed_median, minSpd - 2, maxSpd + 2);
    let rankBadge = `<div class="rank-badge rank-n">${i+1}</div>`;
    if (i === 0) rankBadge = `<div class="rank-badge rank-1">1</div>`;
    else if (i === 1) rankBadge = `<div class="rank-badge rank-2">2</div>`;
    else if (i === 2) rankBadge = `<div class="rank-badge rank-3">3</div>`;

    const nameVal = d[groupBy];
    const name = groupBy === 'transport_type' ? `<span class="type-pill type-${typeClass(nameVal)}">${typeName(nameVal)}</span>` : nameVal;

    return `<tr>
      <td>${rankBadge}</td>
      <td style="font-weight:600">${name}</td>
      <td><span class="speed-badge"><span class="speed-dot" style="background:${col}"></span>${fmt1(d.speed_median)}</span></td>
      <td style="font-family:var(--mono);font-size:.8rem">${fmt1(d.speed_mean)}</td>
      <td style="font-family:var(--mono);font-size:.8rem;color:var(--text-dim)">${fmt1(d.speed_p25)} / ${fmt1(d.speed_p75)}</td>
      <td>${d.routes}</td>
      <td style="font-family:var(--mono);font-size:.8rem;color:var(--text-dim)">${fmtKm(d.total_km)}</td>
    </tr>`;
  }).join('');
}

// ── Districts tab ─────────────────────────────────────────
function renderDistricts() {
  const data = queryCube({}, 'district').sort((a, b) => b.speed_median - a.speed_median);
  const minD = data[data.length - 1]?.speed_median ?? 14;
  const maxD = data[0]?.speed_median ?? 30;

  destroyChart('districtSpeedChart');
  state.charts.districtSpeed = new Chart(document.getElementById('districtSpeedChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.district),
      datasets: [{ label: 'Медиана км/ч', data: data.map(d => d.speed_median), backgroundColor: data.map(d => speedColor(d.speed_median, minD, maxD)), borderRadius: 5, borderWidth: 0 }]
    },
    options: chartDefaults({
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${fmt1(c.raw)} км/ч` } } },
      scales: { x: { title: { display: true, text: 'Медиана скорости, км/ч', color: '#7a8aaa' } } }
    })
  });

  destroyChart('districtIqrChart');
  state.charts.districtIqr = new Chart(document.getElementById('districtIqrChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.district),
      datasets: [
        { label: 'Q25',     data: data.map(d => d.speed_p25),                    backgroundColor: 'rgba(91,138,240,.25)', borderRadius: 4, borderWidth: 0, stack: 's' },
        { label: 'Медиана', data: data.map(d => d.speed_median - d.speed_p25),   backgroundColor: 'rgba(91,138,240,.65)', borderRadius: 4, borderWidth: 0, stack: 's' },
        { label: 'Q75',     data: data.map(d => d.speed_p75 - d.speed_median),   backgroundColor: 'rgba(91,138,240,.2)',  borderRadius: 4, borderWidth: 0, stack: 's' },
      ]
    },
    options: chartDefaults({
      indexAxis: 'y',
      plugins: {
        legend: { labels: { color: '#7a8aaa' } },
        tooltip: { callbacks: { label: (c) => {
          const d = data[c.dataIndex];
          return [`Q25: ${fmt1(d.speed_p25)} км/ч`, `Медиана: ${fmt1(d.speed_median)} км/ч`, `Q75: ${fmt1(d.speed_p75)} км/ч`];
        }}}
      },
      scales: {
        x: { stacked: true, title: { display: true, text: 'км/ч', color: '#7a8aaa' } },
        y: { stacked: true }
      }
    })
  });

  document.getElementById('districtComparison').innerHTML = renderComparisonRows(data, 'district', minD, maxD);
}

// ── Operators tab ─────────────────────────────────────────
function renderOperators() {
  const data = queryCube({}, 'operator_name').sort((a, b) => b.speed_median - a.speed_median);
  const minO = data[data.length - 1]?.speed_median ?? 14;
  const maxO = data[0]?.speed_median ?? 25;

  destroyChart('opSpeedChart');
  state.charts.opSpeed = new Chart(document.getElementById('opSpeedChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => shortName(d.operator_name, 30)),
      datasets: [{
        label: 'Медиана скорости',
        data: data.map(d => d.speed_median),
        backgroundColor: data.map(d => speedColor(d.speed_median, minO, maxO)),
        borderRadius: 5, borderWidth: 0,
      }]
    },
    options: chartDefaults({
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: c => data[c[0].dataIndex].operator_name,
          label: c => [`Медиана: ${fmt1(c.raw)} км/ч`, `Маршрутов: ${data[c[0].dataIndex].routes}`, `Общ. км: ${fmtKm(data[c[0].dataIndex].total_km)}`]
        }}
      },
      scales: { x: { title: { display: true, text: 'км/ч', color: '#7a8aaa' } } }
    })
  });

  destroyChart('opRoutesChart');
  state.charts.opRoutes = new Chart(document.getElementById('opRoutesChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => shortName(d.operator_name, 30)),
      datasets: [
        { label: 'Маршрутов', data: data.map(d => d.routes),  backgroundColor: 'rgba(91,138,240,.6)', borderRadius: 5, borderWidth: 0, yAxisID: 'y' },
        { label: 'Млн км',    data: data.map(d => +(d.total_km / 1e6).toFixed(3)), backgroundColor: 'rgba(56,201,164,.6)', borderRadius: 5, borderWidth: 0, yAxisID: 'y2' },
      ]
    },
    options: chartDefaults({
      plugins: { legend: { labels: { color: '#7a8aaa' } } },
      scales: {
        y:  { position: 'left',  title: { display: true, text: 'Маршрутов', color: '#7a8aaa' } },
        y2: { position: 'right', title: { display: true, text: 'Млн км',    color: '#7a8aaa' }, grid: { drawOnChartArea: false } }
      }
    })
  });

  document.getElementById('operatorComparison').innerHTML = renderComparisonRows(data, 'operator_name', minO, maxO);
}

// ── Types tab ─────────────────────────────────────────────
function renderTypes() {
  const order = ['bus', 'bus_city', 'tram', 'trolleybus', 'metro'];
  const data  = queryCube({}, 'transport_type').sort((a, b) => {
    const ai = order.indexOf(a.transport_type), bi = order.indexOf(b.transport_type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  destroyChart('typeDetailChart');
  state.charts.typeDetail = new Chart(document.getElementById('typeDetailChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => typeName(d.transport_type)),
      datasets: [
        { label: 'Q25',     data: data.map(d => d.speed_p25),                  backgroundColor: data.map(d => typeColor(d.transport_type, 0.25)), borderRadius: 6, borderWidth: 0, stack: 's' },
        { label: 'Медиана', data: data.map(d => d.speed_median - d.speed_p25), backgroundColor: data.map(d => typeColor(d.transport_type, 0.8)),  borderRadius: 6, borderWidth: 0, stack: 's' },
        { label: 'Q75',     data: data.map(d => d.speed_p75 - d.speed_median), backgroundColor: data.map(d => typeColor(d.transport_type, 0.3)),  borderRadius: 6, borderWidth: 0, stack: 's' },
      ]
    },
    options: chartDefaults({
      plugins: {
        legend: { labels: { color: '#7a8aaa' } },
        tooltip: { callbacks: { label: (c) => {
          const d = data[c.dataIndex];
          return [`Q25: ${fmt1(d.speed_p25)}`, `Медиана: ${fmt1(d.speed_median)}`, `Q75: ${fmt1(d.speed_p75)}`, `Среднее: ${fmt1(d.speed_mean)}`];
        }}}
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: 'км/ч', color: '#7a8aaa' } }
      }
    })
  });

  document.getElementById('typeComparison').innerHTML = `
    <div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
      ${data.map(d => `
        <div class="panel" style="padding:18px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <span class="type-pill type-${typeClass(d.transport_type)}" style="font-size:.8rem">${typeName(d.transport_type)}</span>
            <span style="font-size:.75rem;color:var(--text-dim)">${d.routes} маршрутов</span>
          </div>
          ${statRow('Медиана', fmt1(d.speed_median) + ' км/ч', 'accent')}
          ${statRow('Среднее', fmt1(d.speed_mean) + ' км/ч')}
          ${statRow('Q25 / Q75', `${fmt1(d.speed_p25)} / ${fmt1(d.speed_p75)} км/ч`)}
          ${statRow('Мин / Макс', `${fmt1(d.speed_min)} / ${fmt1(d.speed_max)} км/ч`)}
          ${statRow('Км в расп.', fmtKm(d.total_km))}
        </div>
      `).join('')}
    </div>`;
}

function statRow(label, val, cls = '') {
  return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(99,120,180,.08);font-size:.8rem">
    <span style="color:var(--text-dim)">${label}</span>
    <span style="font-family:var(--mono);font-weight:600;color:${cls === 'accent' ? 'var(--accent3)' : 'var(--text)'}">${val}</span>
  </div>`;
}

// ── Comparison rows helper ────────────────────────────────
function renderComparisonRows(data, labelKey, minSpd, maxSpd) {
  const maxVal = Math.max(...data.map(d => d.speed_median));
  return `<div>${data.map(d => {
    const pct  = (d.speed_median / maxVal * 100).toFixed(1);
    const iqrL = (d.speed_p25 / maxVal * 100).toFixed(1);
    const iqrW = ((d.speed_p75 - d.speed_p25) / maxVal * 100).toFixed(1);
    const col  = speedColor(d.speed_median, minSpd, maxSpd);
    const label = d[labelKey] || '—';
    return `<div class="comparison-row">
      <div class="cmp-label" title="${label}">${label}</div>
      <div class="cmp-bar-wrap">
        <div class="cmp-bar" style="width:${pct}%;background:${col}"></div>
        <div class="cmp-bar-iqr" style="left:${iqrL}%;width:${iqrW}%"></div>
      </div>
      <div class="cmp-value">${fmt1(d.speed_median)}</div>
      <div class="cmp-sub">${d.routes != null ? d.routes + ' мар.' : ''} ${fmt1(d.speed_p25)}–${fmt1(d.speed_p75)}</div>
    </div>`;
  }).join('')}</div>`;
}

// ── Map tab ───────────────────────────────────────────────
async function initMap() {
  if (state.mapInstance) return;

  if (!state.mapShapes || !state.mapShapes.length) {
    try { state.mapShapes = await loadJSON('data/processed/map_shapes.json'); }
    catch (e) { console.error('Map shapes load error:', e); return; }
  }

  // Normalize map shapes transport_type too
  state.mapShapes.forEach(s => { if (s.transport_type === 'trolley') s.transport_type = 'trolleybus'; });

  // Populate operator filter from map shapes (only non-excluded ops)
  const excludedSet = new Set(EXCLUDED_OPERATORS);
  const ops = [...new Set(state.mapShapes
    .map(s => s.operator_name)
    .filter(op => op && !excludedSet.has(op)))].sort();
  const opSel = document.getElementById('mapFilterOp');
  ops.forEach(op => { const o = document.createElement('option'); o.value = op; o.textContent = shortName(op, 40); opSel.appendChild(o); });

  const map = L.map('map', { center: [59.93, 30.32], zoom: 11, preferCanvas: true });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO', maxZoom: 19,
  }).addTo(map);

  state.mapInstance = map;
  state.mapLayers   = L.layerGroup().addTo(map);

  ['mapFilterType', 'mapFilterOp'].forEach(id => document.getElementById(id).addEventListener('change', renderMapLayers));
  ['mapSpeedMin', 'mapSpeedMax'].forEach(id => document.getElementById(id).addEventListener('input', renderMapLayers));
  renderMapLayers();
}

function renderMapLayers() {
  if (!state.mapInstance) return;
  state.mapLayers.clearLayers();

  const excludedSet = new Set(EXCLUDED_OPERATORS);
  const typeF  = document.getElementById('mapFilterType').value;
  const opF    = document.getElementById('mapFilterOp').value;
  const spdMin = +document.getElementById('mapSpeedMin').value || 0;
  const spdMax = +document.getElementById('mapSpeedMax').value || 999;

  const shapes = state.mapShapes.filter(s => {
    if (excludedSet.has(s.operator_name)) return false;
    if (typeF && s.transport_type !== typeF) return false;
    if (opF  && s.operator_name  !== opF)  return false;
    if (s.speed_median < spdMin || s.speed_median > spdMax) return false;
    return true;
  });

  // Adaptive color range for map
  const speeds = shapes.map(s => s.speed_median).filter(v => v > 0).sort((a, b) => a - b);
  const mapMin = speeds[Math.floor(speeds.length * 0.05)] ?? 10;
  const mapMax = speeds[Math.floor(speeds.length * 0.95)] ?? 35;
  document.querySelectorAll('.map-speed-min').forEach(el => el.textContent = `${fmt1(mapMin)} км/ч`);
  document.querySelectorAll('.map-speed-max').forEach(el => el.textContent = `${fmt1(mapMax)} км/ч`);

  shapes.forEach(s => {
    const col = speedColor(s.speed_median, mapMin, mapMax);
    L.polyline(s.coords.map(c => [c[1], c[0]]), { color: col, weight: 2.5, opacity: 0.85 })
      .bindPopup(`<b>Маршрут ${s.short_name}</b><br>Тип: ${typeName(s.transport_type)}<br>Перевозчик: ${s.operator_name || '—'}<br>Медиана скорости: <b>${fmt1(s.speed_median)} км/ч</b>`, { maxWidth: 220 })
      .addTo(state.mapLayers);
  });
}

// ── Boot ──────────────────────────────────────────────────
async function boot() {
  try {
    await loadAll();
  } catch (e) {
    document.getElementById('loadingOverlay').innerHTML =
      `<div style="color:#e05555;text-align:center;padding:32px">
        Ошибка загрузки данных.<br><small style="color:#7a8aaa">${e.message}</small><br>
        <small style="color:#4a5570;margin-top:8px;display:block">Запустите: python -m http.server 8080</small>
      </div>`;
    return;
  }

  document.getElementById('headerMeta').textContent =
    `${state.routes.length} маршрутов • медиана ${fmt1(state.summary.city_speed_median)} км/ч`;

  renderOverview();
  initRoutesFilters();
  // Districts / operators / types / map → lazy on first tab click
  initNav();
  updateSpeedLegend();

  document.getElementById('loadingOverlay').classList.add('hidden');
}

boot();
