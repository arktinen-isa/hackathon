'use strict';

// ─────────────────────────── Constants ───────────────────────────

const ICONS = {
  server:   '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
  router:   '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="11" width="18" height="10" rx="2"/><line x1="12" y1="11" x2="12" y2="3"/><line x1="8" y1="7" x2="8" y2="11"/><line x1="16" y1="7" x2="16" y2="11"/></svg>',
  switch:   '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="8" width="20" height="8" rx="2"/><line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/></svg>',
  printer:  '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  computer: '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  camera:   '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  other:    '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
};

const TYPE_LABELS = {
  server: 'Сервер', router: 'Маршрутизатор', switch: 'Комутатор',
  printer: 'Принтер', computer: "Комп'ютер", camera: 'IP-камера', other: 'Інший',
};
const STATUS_LABELS = {
  up: 'Активний', down: 'Недоступний', slow: 'Повільний',
  unstable: 'Нестабільний', unknown: 'Невідомо',
};
const EVENT_ICONS = { up: '✅', down: '🔴', slow: '🟠', unstable: '⚠️', unknown: '⚪' };
const STATUS_COLORS = {
  up: '#22c55e', down: '#ef4444', slow: '#f97316',
  unstable: '#f59e0b', unknown: '#94a3b8',
};

// ─────────────────────────── State ───────────────────────────

let devices = [];
let editingId = null;
let historyChart = null;
let rttChart = null;
let donutChart = null;
let scanTimer = null;
let topoGraph = null;
let currentView = 'dashboard';
let uptimeCache = {};      // { deviceId: pct }
let detailDeviceId = null;

// ─────────────────────────── DOM refs ───────────────────────────

const sidebar        = document.getElementById('sidebar');
const sidebarToggle  = document.getElementById('sidebar-toggle');
const appMain        = document.getElementById('app-main');
const viewTitle      = document.getElementById('view-title');
const topbarTime     = document.getElementById('topbar-time');
const wsDot          = document.getElementById('ws-dot');
const wsLabel        = document.getElementById('ws-label');

const deviceGrid     = document.getElementById('device-grid');
const emptyMsg       = document.getElementById('empty-msg');
const searchInput    = document.getElementById('search');
const filterType     = document.getElementById('filter-type');
const filterStatus   = document.getElementById('filter-status');

const deviceModal    = document.getElementById('device-modal');
const deviceForm     = document.getElementById('device-form');
const modalTitle     = document.getElementById('modal-title');
const fName          = document.getElementById('f-name');
const fHost          = document.getElementById('f-host');
const fType          = document.getElementById('f-type');
const fMethod        = document.getElementById('f-method');
const fRtt           = document.getElementById('f-rtt');
const fCommunity     = document.getElementById('f-community');
const btnSave        = document.getElementById('btn-save');

const detailModal    = document.getElementById('detail-modal');
const detailName     = document.getElementById('detail-name');
const detailHost     = document.getElementById('detail-host');
const detailMeta     = document.getElementById('detail-meta');
const btnMaintenanceToggle = document.getElementById('btn-maintenance-toggle');

const scanModal      = document.getElementById('scan-modal');
const scanResults    = document.getElementById('scan-results');
const scanProgress   = document.getElementById('scan-progress');
const scanProgressBar= document.getElementById('scan-progress-bar');
const btnScan        = document.getElementById('btn-scan');
const btnScanClose   = document.getElementById('btn-scan-close');
const scanSubnetInput= document.getElementById('scan-subnet');

const tableSearch    = document.getElementById('table-search');
const tableFilter    = document.getElementById('table-filter');
const deviceTbody    = document.getElementById('device-tbody');
const rttDeviceSelect= document.getElementById('rtt-device-select');

// ═══════════════════════════════════════════════════════════
// SIDEBAR COLLAPSE
// ═══════════════════════════════════════════════════════════

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
});
if (localStorage.getItem('sidebar_collapsed') === '1') {
  sidebar.classList.add('collapsed');
}

// ═══════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════

const VIEW_TITLES = { dashboard: 'Дашборд', devices: 'Пристрої', topology: 'Топологія мережі' };

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view)
  );
  document.querySelectorAll('.view').forEach(el => el.classList.add('view--hidden'));
  document.getElementById(`view-${view}`).classList.remove('view--hidden');
  viewTitle.textContent = VIEW_TITLES[view] ?? view;

  if (view === 'topology') {
    setTimeout(renderTopology, 50);
  } else if (view === 'dashboard') {
    refreshDashboard();
  }
}

// ═══════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════

function updateClock() {
  topbarTime.textContent = new Date().toLocaleTimeString('uk-UA', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
setInterval(updateClock, 1000);
updateClock();

// ═══════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    wsDot.className  = 'ws-dot ws-dot--connected';
    wsLabel.textContent = "З'єднано";
  };

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'init') {
      devices = msg.devices;
      onDevicesUpdated();
    } else if (msg.type === 'status_change') {
      const idx = devices.findIndex(d => d.id === msg.device.id);
      if (idx !== -1) {
        const prev = devices[idx].status;
        devices[idx] = msg.device;
        if (prev !== msg.device.status) showToast(msg.device);
      } else {
        devices.push(msg.device);
      }
      onDevicesUpdated();
    }
  };

  ws.onclose = () => {
    wsDot.className = 'ws-dot ws-dot--disconnected';
    wsLabel.textContent = 'Відключено';
    setTimeout(connectWS, 3000);
  };
}

// ═══════════════════════════════════════════════════════════
// DATA INIT
// ═══════════════════════════════════════════════════════════

async function initData() {
  try {
    const [devRes, subRes] = await Promise.all([
      fetch('/api/devices'),
      fetch('/api/scan/default_subnet'),
    ]);
    devices = await devRes.json();
    const subData = await subRes.json();
    if (scanSubnetInput && subData.subnet) scanSubnetInput.value = subData.subnet;
    onDevicesUpdated();
  } catch (e) { /* ignore */ }
}

function onDevicesUpdated() {
  renderGrid();
  if (currentView === 'dashboard') refreshDashboard();
  if (currentView === 'topology')   renderTopology();
  updateRttDeviceSelect();
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

async function refreshDashboard() {
  // Stats
  try {
    const res = await fetch('/api/dashboard');
    const stats = await res.json();
    document.getElementById('s-total').textContent = stats.total ?? 0;
    document.getElementById('s-up').textContent    = stats.up    ?? 0;
    document.getElementById('s-down').textContent  = stats.down  ?? 0;
    document.getElementById('s-slow').textContent  = stats.slow  ?? 0;
    document.getElementById('s-maint').textContent = stats.maintenance ?? 0;
    document.getElementById('s-rtt').textContent   = stats.avg_rtt != null ? stats.avg_rtt : '—';
    renderDonut(stats);
  } catch (e) { /* ignore */ }

  // Events
  try {
    const res = await fetch('/api/events?limit=40');
    const events = await res.json();
    renderEvents(events);
  } catch (e) { /* ignore */ }

  // Device table
  renderDeviceTable();

  // Uptime for each device (batch async)
  devices.forEach(d => {
    fetch(`/api/devices/${d.id}/uptime`)
      .then(r => r.json())
      .then(data => {
        uptimeCache[d.id] = data.uptime;
        if (currentView === 'dashboard') renderDeviceTable();
      })
      .catch(() => {});
  });
}

// Donut chart
function renderDonut(stats) {
  const up       = (stats.up   || 0) + (stats.slow     || 0);
  const problems = (stats.down || 0) + (stats.unstable  || 0);
  const unknown  = stats.unknown || 0;
  const total    = stats.total || 1;
  const pct      = total > 0 ? Math.round(up / total * 100) : 0;

  document.getElementById('donut-pct').textContent = pct + '%';

  const ctx = document.getElementById('donut-chart').getContext('2d');
  if (donutChart) { donutChart.destroy(); donutChart = null; }

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Активні', 'Проблеми', 'Невідомо'],
      datasets: [{
        data: [up, problems, unknown],
        backgroundColor: ['#22c55e', '#ef4444', '#94a3b8'],
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw}`,
          },
        },
      },
    },
  });
}

// RTT timeline chart
function updateRttDeviceSelect() {
  if (!rttDeviceSelect) return;
  const prevVal = rttDeviceSelect.value;
  rttDeviceSelect.innerHTML = '<option value="">Оберіть пристрій</option>';
  devices.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name} (${d.host})`;
    rttDeviceSelect.appendChild(opt);
  });
  if (prevVal) rttDeviceSelect.value = prevVal;
}

rttDeviceSelect && rttDeviceSelect.addEventListener('change', () => {
  const id = parseInt(rttDeviceSelect.value);
  if (id) loadRttChart(id);
});

async function loadRttChart(deviceId) {
  try {
    const res = await fetch(`/api/devices/${deviceId}/history?hours=1`);
    const history = await res.json();
    renderRttChart(history);
  } catch (e) { /* ignore */ }
}

function renderRttChart(history) {
  const ctx = document.getElementById('rtt-chart');
  if (rttChart) { rttChart.destroy(); rttChart = null; }
  if (!history.length) return;

  const labels = history.map(h =>
    new Date(h.checked_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  );
  const rtts   = history.map(h => h.response_time ?? null);
  const colors = history.map(h =>
    h.status === 'up' ? '#22c55e' : h.status === 'slow' ? '#f97316' :
    h.status === 'unstable' ? '#f59e0b' : '#ef4444'
  );

  rttChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'RTT (мс)',
        data: rtts,
        backgroundColor: colors,
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' }, beginAtZero: true },
      },
    },
  });
}

// Device table
function renderDeviceTable() {
  const q   = (tableSearch?.value || '').toLowerCase();
  const st  = tableFilter?.value || '';
  const list = devices.filter(d =>
    (!q  || d.name.toLowerCase().includes(q) || d.host.includes(q)) &&
    (!st || d.status === st)
  );

  deviceTbody.innerHTML = '';
  if (!list.length) {
    deviceTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--c-muted)">Немає пристроїв</td></tr>';
    return;
  }

  list.forEach(d => {
    const rtt   = d.response_time != null ? `${d.response_time} мс` : '—';
    const rttCls= d.status === 'slow' ? 'dt-rtt--slow' : 'dt-rtt--ok';
    const uptime= uptimeCache[d.id];
    const uptimePct = uptime != null ? uptime : null;
    const last  = d.last_seen
      ? new Date(d.last_seen).toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '—';

    const statusLabel = d.maintenance ? 'Обслуговування' : (STATUS_LABELS[d.status] ?? d.status);
    const statusCls   = d.maintenance ? 'maint' : d.status;

    let uptimeHtml = '—';
    if (uptimePct != null) {
      const fillCls = uptimePct < 50 ? 'uptime-bar__fill--low' : uptimePct < 90 ? 'uptime-bar__fill--mid' : '';
      uptimeHtml = `<div class="uptime-bar-wrap">
        <div class="uptime-bar"><div class="uptime-bar__fill ${fillCls}" style="width:${uptimePct}%"></div></div>
        <span class="uptime-val">${uptimePct}%</span>
      </div>`;
    }

    const tr = document.createElement('tr');
    tr.dataset.id = d.id;
    tr.innerHTML = `
      <td><span class="dt-name">${esc(d.name)}</span></td>
      <td><span class="dt-ip">${esc(d.host)}</span></td>
      <td><span class="dt-type">${TYPE_LABELS[d.device_type] ?? d.device_type}</span></td>
      <td><span class="badge badge--${statusCls}">${statusLabel}</span></td>
      <td><span class="dt-rtt ${rttCls}">${rtt}</span></td>
      <td>${uptimeHtml}</td>
      <td><span class="dt-last">${last}</span></td>
      <td>
        <label class="toggle-switch" title="Режим обслуговування">
          <input type="checkbox" class="maint-check" data-id="${d.id}" ${d.maintenance ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </td>
    `;
    tr.addEventListener('click', e => {
      if (!e.target.closest('.toggle-switch')) openDetail(d.id);
    });
    deviceTbody.appendChild(tr);
  });

  // Maintenance toggles
  deviceTbody.querySelectorAll('.maint-check').forEach(cb => {
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const id = parseInt(cb.dataset.id);
      try {
        const res = await fetch(`/api/devices/${id}/maintenance`, { method: 'POST' });
        const updated = await res.json();
        const idx = devices.findIndex(d => d.id === id);
        if (idx !== -1) devices[idx] = updated;
        renderDeviceTable();
        renderGrid();
      } catch (err) {
        showToastMsg('Помилка зміни режиму обслуговування', 'error');
      }
    });
  });
}

tableSearch?.addEventListener('input',  renderDeviceTable);
tableFilter?.addEventListener('change', renderDeviceTable);

// Events log
function renderEvents(events) {
  const list = document.getElementById('events-list');
  const count = document.getElementById('events-count');
  if (!events.length) {
    list.innerHTML = '<p class="events-empty">Немає подій</p>';
    if (count) count.textContent = '';
    return;
  }
  if (count) count.textContent = `${events.length} подій`;
  list.innerHTML = '';
  events.forEach(ev => {
    const icon = EVENT_ICONS[ev.new_status] ?? '⚫';
    const time = new Date(ev.occurred_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const prev = ev.prev_status ? (STATUS_LABELS[ev.prev_status] ?? ev.prev_status) : '?';
    const next = STATUS_LABELS[ev.new_status] ?? ev.new_status;
    const item = document.createElement('div');
    item.className = 'event-item';
    item.innerHTML = `
      <div class="event-icon event-icon--${ev.new_status}">${icon}</div>
      <div class="event-body">
        <div class="event-device">${esc(ev.device_name)}</div>
        <div class="event-desc">${prev} → ${next}</div>
      </div>
      <div class="event-time">${time}</div>
    `;
    list.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════════
// DEVICE GRID (devices view)
// ═══════════════════════════════════════════════════════════

function filteredDevices() {
  const q    = searchInput.value.toLowerCase();
  const type = filterType.value;
  const st   = filterStatus.value;
  return devices.filter(d =>
    (!q    || d.name.toLowerCase().includes(q) || d.host.includes(q)) &&
    (!type || d.device_type === type) &&
    (!st   || d.status === st)
  );
}

function renderGrid() {
  const list = filteredDevices();
  emptyMsg.style.display = list.length ? 'none' : '';
  [...deviceGrid.querySelectorAll('.card')].forEach(el => el.remove());
  list.forEach(d => deviceGrid.appendChild(buildCard(d)));
}

function buildCard(d) {
  const card = document.createElement('div');
  card.className = 'card' + (d.maintenance ? ' maint' : '');
  card.dataset.id = d.id;
  card.setAttribute('tabindex', '0');

  const rtt     = d.response_time != null ? `${d.response_time} мс` : '—';
  const icon    = ICONS[d.device_type] || ICONS.other;
  const statusLbl = d.maintenance ? 'Обслуговування' : (STATUS_LABELS[d.status] ?? d.status);
  const statusCls = d.maintenance ? 'maint' : d.status;
  const indCls    = d.maintenance ? 'maint' : d.status;

  const snmpHtml = (d.check_method === 'snmp' && (d.cpu_usage != null || d.ram_usage != null))
    ? `<div class="card__snmp">CPU: ${d.cpu_usage != null ? d.cpu_usage + '%' : '—'} · RAM: ${d.ram_usage != null ? d.ram_usage + '%' : '—'}</div>`
    : '';

  card.innerHTML = `
    <span class="card__indicator card__indicator--${indCls}"></span>
    <div class="card__body">
      <div class="card__name" title="${esc(d.name).replace(/"/g,'&quot;')}">${esc(d.name)}</div>
      <div class="card__meta">
        <span class="card__badge" style="display:inline-flex;align-items:center;gap:3px">${icon} ${TYPE_LABELS[d.device_type] ?? d.device_type}</span>
        <span class="card__host">${esc(d.host)}</span>
      </div>
    </div>
    <div>
      <div class="card__status-text card__status-text--${statusCls}">${statusLbl}</div>
      <div class="card__rtt">${rtt}</div>
      ${snmpHtml}
    </div>
    <div class="card__actions">
      <button class="btn btn--ghost btn--sm js-edit"    data-id="${d.id}">Редагувати</button>
      <button class="btn btn--danger btn--sm js-delete" data-id="${d.id}">Видалити</button>
    </div>
  `;

  card.addEventListener('click', e => { if (!e.target.closest('button')) openDetail(d.id); });
  card.querySelector('.js-edit').addEventListener('click', e => { e.stopPropagation(); openEdit(d.id); });
  card.querySelector('.js-delete').addEventListener('click', e => { e.stopPropagation(); deleteDevice(d.id); });
  return card;
}

searchInput.addEventListener('input',   renderGrid);
filterType.addEventListener('change',   renderGrid);
filterStatus.addEventListener('change', renderGrid);

// ═══════════════════════════════════════════════════════════
// ADD / EDIT DEVICE
// ═══════════════════════════════════════════════════════════

document.getElementById('btn-add').addEventListener('click', openAdd);
document.getElementById('btn-cancel').addEventListener('click', () => deviceModal.close());
document.getElementById('btn-detail-close').addEventListener('click', () => detailModal.close());
btnScan.addEventListener('click', startScan);
btnScanClose.addEventListener('click', stopScanPolling);
deviceForm.addEventListener('submit', saveDevice);

function openAdd() {
  editingId = null;
  modalTitle.textContent = 'Новий пристрій';
  deviceForm.reset();
  fRtt.value = '100';
  fCommunity.value = 'public';
  deviceModal.showModal();
}

function openEdit(id) {
  const d = devices.find(d => d.id === id);
  if (!d) return;
  editingId = id;
  modalTitle.textContent = 'Редагувати пристрій';
  fName.value      = d.name;
  fHost.value      = d.host;
  fType.value      = d.device_type;
  fMethod.value    = d.check_method;
  fRtt.value       = d.rtt_threshold ?? 100;
  fCommunity.value = d.snmp_community ?? 'public';
  deviceModal.showModal();
}

async function saveDevice(e) {
  e.preventDefault();
  btnSave.disabled = true;
  const orig = btnSave.textContent;
  btnSave.textContent = 'Збереження…';

  const body = {
    name: fName.value.trim(),
    host: fHost.value.trim(),
    device_type: fType.value,
    check_method: fMethod.value,
    rtt_threshold: parseInt(fRtt.value) || 100,
    snmp_community: fCommunity.value.trim() || 'public',
  };

  try {
    if (editingId) {
      const res = await fetch(`/api/devices/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      const idx = devices.findIndex(d => d.id === editingId);
      if (idx !== -1) devices[idx] = updated;
    } else {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      devices.push(await res.json());
    }
    deviceModal.close();
    renderGrid();
    if (currentView === 'dashboard') refreshDashboard();
  } catch {
    alert('Помилка збереження');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = orig;
  }
}

async function deleteDevice(id) {
  if (!confirm('Видалити пристрій?')) return;
  try {
    await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    devices = devices.filter(d => d.id !== id);
    renderGrid();
    if (currentView === 'dashboard') refreshDashboard();
  } catch {
    alert('Помилка видалення');
  }
}

// ═══════════════════════════════════════════════════════════
// DEVICE DETAIL
// ═══════════════════════════════════════════════════════════

async function openDetail(id) {
  const d = devices.find(d => d.id === id);
  if (!d) return;
  detailDeviceId = id;

  detailName.textContent = d.name;
  detailHost.textContent = d.host;

  // Maintenance toggle button
  btnMaintenanceToggle.textContent = d.maintenance ? '✓ Обслуговування' : '🔧 Обслуговування';
  btnMaintenanceToggle.className   = 'btn btn--sm ' + (d.maintenance ? 'btn--danger' : 'btn--ghost');

  let histData = [], uptimeData = { uptime: null };
  try {
    [histData, uptimeData] = await Promise.all([
      fetch(`/api/devices/${id}/history`).then(r => r.json()),
      fetch(`/api/devices/${id}/uptime`).then(r => r.json()),
    ]);
  } catch { /* ignore */ }

  const uptime = uptimeData.uptime != null ? `${uptimeData.uptime}%` : '—';
  const rtt    = d.response_time != null ? `${d.response_time} мс` : '—';
  const last   = d.last_seen ? new Date(d.last_seen).toLocaleString('uk-UA') : '—';
  const statusLbl = d.maintenance ? 'Обслуговування' : (STATUS_LABELS[d.status] ?? d.status);

  detailMeta.innerHTML = `
    <div class="detail-tag"><span>Тип: </span><strong>${TYPE_LABELS[d.device_type] ?? d.device_type}</strong></div>
    <div class="detail-tag"><span>Метод: </span><strong>${d.check_method === 'snmp' ? 'SNMP' : 'Ping (ICMP)'}</strong></div>
    <div class="detail-tag"><span>Статус: </span><strong>${statusLbl}</strong></div>
    <div class="detail-tag"><span>RTT: </span><strong>${rtt}</strong></div>
    <div class="detail-tag"><span>Поріг RTT: </span><strong>${d.rtt_threshold ?? 100} мс</strong></div>
    <div class="detail-tag"><span>Доступність 24 год: </span><strong>${uptime}</strong></div>
    <div class="detail-tag"><span>Остання відповідь: </span><strong>${last}</strong></div>
  `;

  // SNMP metrics
  const snmpSection = document.getElementById('snmp-metrics');
  if (d.check_method === 'snmp') {
    snmpSection.style.display = 'flex';
    updateSnmpDisplay(d);
    // Try to refresh from API
    fetch(`/api/devices/${id}/snmp`)
      .then(r => r.json())
      .then(m => updateSnmpDisplay({ ...d, ...m }))
      .catch(() => {});
  } else {
    snmpSection.style.display = 'none';
  }

  renderHistoryChart(histData);
  detailModal.showModal();
}

function updateSnmpDisplay(d) {
  const cpuBar = document.getElementById('snmp-cpu-bar');
  const cpuVal = document.getElementById('snmp-cpu-val');
  const ramBar = document.getElementById('snmp-ram-bar');
  const ramVal = document.getElementById('snmp-ram-val');

  if (d.cpu_usage != null) {
    cpuBar.style.width = `${Math.min(100, d.cpu_usage)}%`;
    cpuBar.style.background = d.cpu_usage > 85 ? '#ef4444' : d.cpu_usage > 65 ? '#f97316' : '#22c55e';
    cpuVal.textContent = `${d.cpu_usage}%`;
  } else {
    cpuBar.style.width = '0%';
    cpuVal.textContent = '—';
  }

  if (d.ram_usage != null) {
    ramBar.style.width = `${Math.min(100, d.ram_usage)}%`;
    ramBar.style.background = d.ram_usage > 90 ? '#ef4444' : d.ram_usage > 75 ? '#f97316' : '#4f8ef7';
    ramVal.textContent = `${d.ram_usage}%`;
  } else {
    ramBar.style.width = '0%';
    ramVal.textContent = '—';
  }
}

btnMaintenanceToggle.addEventListener('click', async () => {
  if (!detailDeviceId) return;
  try {
    const res = await fetch(`/api/devices/${detailDeviceId}/maintenance`, { method: 'POST' });
    const updated = await res.json();
    const idx = devices.findIndex(d => d.id === detailDeviceId);
    if (idx !== -1) devices[idx] = updated;
    detailModal.close();
    onDevicesUpdated();
    showToastMsg(`${updated.name}: ${updated.maintenance ? 'режим обслуговування увімкнено' : 'режим обслуговування вимкнено'}`);
  } catch {
    alert('Помилка зміни режиму');
  }
});

function renderHistoryChart(history) {
  const ctx = document.getElementById('history-chart');
  if (historyChart) { historyChart.destroy(); historyChart = null; }
  if (!history.length) return;

  const labels = history.map(h =>
    new Date(h.checked_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  );
  const rtts   = history.map(h => h.response_time ?? null);
  const colors = history.map(h =>
    h.status === 'up' ? '#22c55e' : h.status === 'slow' ? '#f97316' :
    h.status === 'unstable' ? '#f59e0b' : '#ef4444'
  );

  historyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'RTT (мс)', data: rtts, backgroundColor: colors, borderRadius: 3, borderSkipped: false }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#e2e8f0' }, beginAtZero: true },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════
// SCAN
// ═══════════════════════════════════════════════════════════

async function startScan() {
  scanResults.innerHTML = '<p class="empty">Пошук пристроїв у підмережі…</p>';
  scanProgress.style.display = 'block';
  scanProgressBar.style.width = '0%';
  scanModal.showModal();

  const subnet = scanSubnetInput?.value.trim() || null;
  try {
    await fetch('/api/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subnet }),
    });
    pollScan();
  } catch (err) {
    scanResults.innerHTML = `<p class="empty" style="color:var(--c-down)">Помилка: ${err.message}</p>`;
  }
}

function stopScanPolling() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  scanModal.close();
}

async function pollScan() {
  try {
    const data = await fetch('/api/scan/status').then(r => r.json());
    scanProgressBar.style.width = `${data.progress}%`;

    if (data.found?.length) {
      scanResults.innerHTML = '';
      data.found.forEach(dev => {
        const exists = devices.some(d => d.host === dev.ip);
        const item = document.createElement('div');
        item.className = 'scan-item';
        item.innerHTML = `
          <div>
            <div class="scan-item__ip">${dev.ip}</div>
            <div class="scan-item__meta">${esc(dev.name)} · ${TYPE_LABELS[dev.device_type] ?? dev.device_type}</div>
          </div>
          <button class="btn btn--primary btn--sm" ${exists ? 'disabled' : ''}>${exists ? 'Додано' : 'Додати'}</button>
        `;
        if (!exists) {
          item.querySelector('button').onclick = () => addFromScan(dev);
        }
        scanResults.appendChild(item);
      });
    } else if (!data.is_scanning) {
      scanResults.innerHTML = '<p class="empty">Пристроїв не знайдено</p>';
    }

    if (data.is_scanning) {
      scanTimer = setTimeout(pollScan, 1000);
    } else {
      scanProgress.style.display = 'none';
    }
  } catch { /* ignore */ }
}

async function addFromScan(dev) {
  try {
    const res = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dev.name, host: dev.ip, device_type: dev.device_type || 'other', check_method: 'ping' }),
    });
    if (!res.ok) throw new Error();
    devices.push(await res.json());
    renderGrid();
    startScan();
  } catch {
    alert('Не вдалося додати пристрій');
  }
}

// ═══════════════════════════════════════════════════════════
// TOPOLOGY (force-directed canvas)
// ═══════════════════════════════════════════════════════════

class ForceGraph {
  constructor(canvas, nodes, edges) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.nodes  = nodes;
    this.edges  = edges;
    this.animId = null;
    this.hovered = null;
    this._ticks  = 0;

    const w = canvas.width, h = canvas.height;
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
      const r = Math.min(w, h) * 0.32;
      n.x  = w / 2 + r * Math.cos(angle) + (Math.random() - .5) * 40;
      n.y  = h / 2 + r * Math.sin(angle) + (Math.random() - .5) * 40;
      n.vx = 0; n.vy = 0;
    });

    canvas.addEventListener('mousemove', this._onMouse.bind(this));
    canvas.addEventListener('mouseleave', () => { this.hovered = null; });
  }

  _onMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (this.canvas.width  / rect.width);
    const my = (e.clientY - rect.top)  * (this.canvas.height / rect.height);
    this.hovered = this.nodes.find(n => {
      const r = this._nodeR(n);
      return Math.hypot(n.x - mx, n.y - my) < r + 6;
    }) ?? null;

    const tooltip = document.getElementById('topo-tooltip');
    if (this.hovered) {
      const d = this.hovered;
      const rtt = d.response_time != null ? `RTT: ${d.response_time} мс` : '';
      tooltip.textContent = `${d.name}\n${d.host}\n${STATUS_LABELS[d.status] ?? d.status}${rtt ? '\n' + rtt : ''}`;
      const left = Math.min(e.clientX - rect.left + 12, rect.width - 200);
      const top  = Math.max(e.clientY - rect.top  - 10, 8);
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top  + 'px';
      tooltip.classList.add('visible');
    } else {
      tooltip.classList.remove('visible');
    }
  }

  _nodeR(n) {
    if (n.device_type === 'server')   return 18;
    if (n.device_type === 'router')   return 16;
    if (n.device_type === 'switch')   return 15;
    return 12;
  }

  _nodeColor(n) {
    if (n.maintenance)                 return '#8b5cf6';
    return STATUS_COLORS[n.status] ?? '#94a3b8';
  }

  tick() {
    const { nodes, edges, canvas } = this;
    const REPEL = 4000, SPRING = 0.03, SPRING_LEN = 120, CENTER = 0.004, DAMP = 0.82;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x || .01;
        const dy = nodes[j].y - nodes[i].y || .01;
        const d2 = dx * dx + dy * dy;
        const f  = REPEL / d2;
        const d  = Math.sqrt(d2);
        nodes[i].vx -= f * dx / d;
        nodes[i].vy -= f * dy / d;
        nodes[j].vx += f * dx / d;
        nodes[j].vy += f * dy / d;
      }
    }

    for (const [ai, bi] of edges) {
      const a = nodes[ai], b = nodes[bi];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const f  = (d - SPRING_LEN) * SPRING;
      a.vx += f * dx / d; a.vy += f * dy / d;
      b.vx -= f * dx / d; b.vy -= f * dy / d;
    }

    const cx = canvas.width / 2, cy = canvas.height / 2;
    for (const n of nodes) {
      n.vx += (cx - n.x) * CENTER;
      n.vy += (cy - n.y) * CENTER;
      n.vx *= DAMP; n.vy *= DAMP;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.max(30, Math.min(canvas.width  - 30, n.x));
      n.y = Math.max(30, Math.min(canvas.height - 30, n.y));
    }
    this._ticks++;
  }

  draw() {
    const { ctx, canvas, nodes, edges } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid (subtle)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Edges
    for (const [ai, bi] of edges) {
      const a = nodes[ai], b = nodes[bi];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
      const r     = this._nodeR(n);
      const color = this._nodeColor(n);
      const isHov = this.hovered === n;

      // Glow for down devices
      if (n.status === 'down' && !n.maintenance) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239,68,68,0.15)';
        ctx.fill();
      }

      // Shadow
      ctx.shadowBlur   = isHov ? 16 : 8;
      ctx.shadowColor  = color + '66';

      // Circle fill
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // White border
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isHov ? '#fff' : 'rgba(255,255,255,.85)';
      ctx.lineWidth   = isHov ? 3 : 2;
      ctx.stroke();

      // Maintenance hatching
      if (n.maintenance) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r - 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.4)';
        ctx.lineWidth   = 4;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      const label = n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name;
      ctx.fillStyle   = '#1e293b';
      ctx.font        = `${isHov ? 600 : 500} 10px system-ui`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, n.x, n.y + r + 5);

      ctx.fillStyle = '#94a3b8';
      ctx.font      = '9px monospace';
      ctx.fillText(n.host, n.x, n.y + r + 17);
      ctx.textBaseline = 'alphabetic';
    }
  }

  animate() {
    // Run physics for ~120 frames then slow down
    if (this._ticks < 120 || this._ticks % 4 === 0) this.tick();
    this.draw();
    this.animId = requestAnimationFrame(() => this.animate());
  }

  stop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
  }
}

function renderTopology() {
  const canvas = document.getElementById('topology-canvas');
  if (!canvas) return;

  // Resize canvas to container
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;

  if (topoGraph) { topoGraph.stop(); topoGraph = null; }
  if (!devices.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Немає пристроїв для відображення', canvas.width / 2, canvas.height / 2);
    return;
  }

  // Build edges: connect same /24 subnet; also connect routers to all devices in their subnet
  const nodes = devices.map(d => ({ ...d }));
  const edges = [];

  function subnet24(ip) {
    const p = ip.split('.');
    return p.length >= 3 ? `${p[0]}.${p[1]}.${p[2]}` : ip;
  }

  const subnetMap = {};
  nodes.forEach((n, i) => {
    const s = subnet24(n.host);
    if (!subnetMap[s]) subnetMap[s] = [];
    subnetMap[s].push(i);
  });

  // Connect devices in same subnet (routers/switches as hub)
  for (const [, members] of Object.entries(subnetMap)) {
    if (members.length < 2) continue;
    const hubs = members.filter(i => ['router', 'switch'].includes(nodes[i].device_type));
    if (hubs.length) {
      hubs.forEach(hub => {
        members.filter(i => i !== hub).forEach(i => {
          if (!edges.find(e => (e[0] === hub && e[1] === i) || (e[0] === i && e[1] === hub))) {
            edges.push([hub, i]);
          }
        });
      });
    } else {
      // Star from first node
      for (let i = 1; i < members.length; i++) {
        edges.push([members[0], members[i]]);
      }
    }
  }

  topoGraph = new ForceGraph(canvas, nodes, edges);
  topoGraph.animate();
}

// ═══════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════

function showToast(device) {
  const statusLbl = device.maintenance ? 'Обслуговування' : (STATUS_LABELS[device.status] ?? device.status);
  const icon = EVENT_ICONS[device.status] ?? '⚫';
  showToastMsg(`${icon} ${device.name}: ${statusLbl}`, device.status);
}

function showToastMsg(text, cls = '') {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast${cls ? ' toast--' + cls : ''}`;
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════
// AUTO-REFRESH dashboard every 30s
// ═══════════════════════════════════════════════════════════

setInterval(() => {
  if (currentView === 'dashboard') refreshDashboard();
}, 30_000);

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════

initData();
connectWS();