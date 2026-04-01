'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const TYPE_LABELS = {
  server: 'Сервер', router: 'Маршрутизатор', switch: 'Комутатор',
  printer: 'Принтер', computer: "Комп'ютер", camera: 'IP-камера', other: 'Інший',
};
const STATUS_LABELS = { up: 'Активний', down: 'Недоступний', unstable: 'Нестабільний', unknown: 'Невідомо' };
const METHOD_LABELS = { ping: 'Ping (ICMP)', snmp: 'SNMP' };

// ── State ──────────────────────────────────────────────────────────────────────
let devices = [];
let editingId = null;
let historyChart = null;

// ── DOM refs ───────────────────────────────────────────────────────────────────
const grid          = document.getElementById('device-grid');
const emptyMsg      = document.getElementById('empty-msg');
const searchInput   = document.getElementById('search');
const filterType    = document.getElementById('filter-type');
const filterStatus  = document.getElementById('filter-status');
const statTotal     = document.getElementById('stat-total');
const statUp        = document.getElementById('stat-up');
const statDown      = document.getElementById('stat-down');

const deviceModal   = document.getElementById('device-modal');
const deviceForm    = document.getElementById('device-form');
const modalTitle    = document.getElementById('modal-title');
const fName         = document.getElementById('f-name');
const fHost         = document.getElementById('f-host');
const fType         = document.getElementById('f-type');
const fMethod       = document.getElementById('f-method');

const detailModal   = document.getElementById('detail-modal');
const detailName    = document.getElementById('detail-name');
const detailHost    = document.getElementById('detail-host');
const detailMeta    = document.getElementById('detail-meta');

// ── WebSocket ──────────────────────────────────────────────────────────────────
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.type === 'init') {
      devices = msg.devices;
      renderAll();
    } else if (msg.type === 'status_change') {
      const idx = devices.findIndex(d => d.id === msg.device.id);
      if (idx !== -1) {
        const prev = devices[idx].status;
        devices[idx] = msg.device;
        if (prev !== msg.device.status) showToast(msg.device);
      }
      renderAll();
    }
  };

  ws.onclose = () => setTimeout(connectWS, 3000);
}

// ── Render ─────────────────────────────────────────────────────────────────────
function filtered() {
  const q    = searchInput.value.toLowerCase();
  const type = filterType.value;
  const st   = filterStatus.value;
  return devices.filter(d =>
    (!q    || d.name.toLowerCase().includes(q) || d.host.toLowerCase().includes(q)) &&
    (!type || d.device_type === type) &&
    (!st   || d.status === st)
  );
}

function renderAll() {
  updateStats();
  const list = filtered();
  emptyMsg.style.display = list.length ? 'none' : '';

  // Remove cards for deleted devices
  [...grid.querySelectorAll('.card')].forEach(el => {
    if (!list.find(d => d.id === +el.dataset.id)) el.remove();
  });

  list.forEach(d => {
    const existing = grid.querySelector(`.card[data-id="${d.id}"]`);
    const card = buildCard(d);
    if (existing) grid.replaceChild(card, existing);
    else grid.appendChild(card);
  });
}

function buildCard(d) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = d.id;
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${d.name} — ${STATUS_LABELS[d.status] ?? d.status}`);

  const rtt = d.response_time != null ? `${d.response_time} мс` : '—';
  const last = d.last_seen
    ? new Date(d.last_seen).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    : '—';

  card.innerHTML = `
    <span class="card__indicator card__indicator--${d.status}"></span>
    <div class="card__body">
      <div class="card__name">${esc(d.name)}</div>
      <div class="card__meta">
        <span class="card__host">${esc(d.host)}</span>
        <span class="card__badge">${TYPE_LABELS[d.device_type] ?? d.device_type}</span>
        <span class="card__badge">${METHOD_LABELS[d.check_method] ?? d.check_method}</span>
      </div>
    </div>
    <div>
      <div class="card__status-text card__status-text--${d.status}">${STATUS_LABELS[d.status] ?? d.status}</div>
      <div class="card__rtt">${rtt}</div>
    </div>
    <div class="card__actions">
      <button class="btn btn--ghost btn--sm js-edit"   data-id="${d.id}">Редагувати</button>
      <button class="btn btn--danger btn--sm js-delete" data-id="${d.id}">Видалити</button>
    </div>
  `;

  card.addEventListener('click', e => {
    if (!e.target.closest('button')) openDetail(d.id);
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.target.closest('button')) openDetail(d.id);
  });
  card.querySelector('.js-edit').addEventListener('click', e => {
    e.stopPropagation(); openEdit(d.id);
  });
  card.querySelector('.js-delete').addEventListener('click', e => {
    e.stopPropagation(); deleteDevice(d.id);
  });

  return card;
}

function updateStats() {
  const up   = devices.filter(d => d.status === 'up').length;
  const down = devices.filter(d => d.status === 'down').length;
  statTotal.textContent = `Всього: ${devices.length}`;
  statUp.textContent    = `▲ ${up}`;
  statDown.textContent  = `▼ ${down}`;
}

// ── Add / Edit modal ───────────────────────────────────────────────────────────
document.getElementById('btn-add').addEventListener('click', openAdd);
document.getElementById('btn-cancel').addEventListener('click', () => deviceModal.close());
document.getElementById('btn-detail-close').addEventListener('click', () => detailModal.close());
deviceForm.addEventListener('submit', saveDevice);

function openAdd() {
  editingId = null;
  modalTitle.textContent = 'Новий пристрій';
  deviceForm.reset();
  deviceModal.showModal();
}

function openEdit(id) {
  const d = devices.find(d => d.id === id);
  if (!d) return;
  editingId = id;
  modalTitle.textContent = 'Редагувати пристрій';
  fName.value   = d.name;
  fHost.value   = d.host;
  fType.value   = d.device_type;
  fMethod.value = d.check_method;
  deviceModal.showModal();
}

async function saveDevice(e) {
  e.preventDefault();
  const body = { name: fName.value.trim(), host: fHost.value.trim(), device_type: fType.value, check_method: fMethod.value };
  try {
    if (editingId) {
      const res = await fetch(`/api/devices/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const updated = await res.json();
      const idx = devices.findIndex(d => d.id === editingId);
      if (idx !== -1) devices[idx] = updated;
    } else {
      const res = await fetch('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const created = await res.json();
      devices.push(created);
    }
    deviceModal.close();
    renderAll();
  } catch (err) {
    alert('Помилка збереження: ' + err.message);
  }
}

async function deleteDevice(id) {
  if (!confirm('Видалити пристрій?')) return;
  await fetch(`/api/devices/${id}`, { method: 'DELETE' });
  devices = devices.filter(d => d.id !== id);
  renderAll();
}

// ── Detail / history modal ─────────────────────────────────────────────────────
async function openDetail(id) {
  const d = devices.find(d => d.id === id);
  if (!d) return;

  detailName.textContent = d.name;
  detailHost.textContent = d.host;

  const [histRes, uptimeRes] = await Promise.all([
    fetch(`/api/devices/${id}/history`).then(r => r.json()),
    fetch(`/api/devices/${id}/uptime`).then(r => r.json()),
  ]);

  const uptime = uptimeRes.uptime != null ? `${uptimeRes.uptime}%` : '—';
  const rtt    = d.response_time != null ? `${d.response_time} мс` : '—';
  const last   = d.last_seen ? new Date(d.last_seen).toLocaleString('uk-UA') : '—';

  detailMeta.innerHTML = `
    <div class="detail-tag"><span>Тип: </span><strong>${TYPE_LABELS[d.device_type] ?? d.device_type}</strong></div>
    <div class="detail-tag"><span>Метод: </span><strong>${METHOD_LABELS[d.check_method] ?? d.check_method}</strong></div>
    <div class="detail-tag"><span>Статус: </span><strong>${STATUS_LABELS[d.status] ?? d.status}</strong></div>
    <div class="detail-tag"><span>RTT: </span><strong>${rtt}</strong></div>
    <div class="detail-tag"><span>Uptime 24 год: </span><strong>${uptime}</strong></div>
    <div class="detail-tag"><span>Остання відповідь: </span><strong>${last}</strong></div>
  `;

  renderChart(histRes);
  detailModal.showModal();
}

function renderChart(history) {
  const ctx = document.getElementById('history-chart');

  if (historyChart) { historyChart.destroy(); historyChart = null; }

  if (!history.length) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = history.map(h => new Date(h.checked_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }));
  const rtts   = history.map(h => h.response_time ?? null);
  const colors = history.map(h => h.status === 'up' ? '#22c55e' : h.status === 'unstable' ? '#f59e0b' : '#ef4444');

  historyChart = new Chart(ctx, {
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
        x: { ticks: { color: '#8892a4', maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: '#2e3349' }, beginAtZero: true },
      },
    },
  });
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(device) {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast toast--${device.status}`;
  const icon = device.status === 'up' ? '✅' : device.status === 'down' ? '🔴' : '⚠️';
  toast.textContent = `${icon} ${device.name}: ${STATUS_LABELS[device.status] ?? device.status}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ── Filters ────────────────────────────────────────────────────────────────────
searchInput.addEventListener('input',  renderAll);
filterType.addEventListener('change',  renderAll);
filterStatus.addEventListener('change', renderAll);

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────────────────────
connectWS();
