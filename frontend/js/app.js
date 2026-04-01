'use strict';

const ICONS = {
  server: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg> Сервер',
  router: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="11" width="18" height="10" rx="2"></rect><line x1="12" y1="11" x2="12" y2="3"></line><line x1="8" y1="7" x2="8" y2="11"></line><line x1="16" y1="7" x2="16" y2="11"></line></svg> Маршрутизатор',
  switch: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="8" width="20" height="8" rx="2"></rect><line x1="6" y1="12" x2="6.01" y2="12"></line><line x1="10" y1="12" x2="10.01" y2="12"></line><line x1="14" y1="12" x2="14.01" y2="12"></line></svg> Комутатор',
  printer: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg> Принтер',
  computer: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> Комп\'ютер',
  camera: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg> IP-камера',
  other: '<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> Інший',
};
const STATUS_LABELS = { up: 'Активний', down: 'Недоступний', unstable: 'Нестабільний', unknown: 'Невідомо' };
const METHOD_LABELS = { ping: 'Ping (ICMP)', snmp: 'SNMP' };

let devices = [];
let editingId = null;
let historyChart = null;
let scanTimer = null;

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
const btnSave       = document.getElementById('btn-save');

const detailModal   = document.getElementById('detail-modal');
const detailName    = document.getElementById('detail-name');
const detailHost    = document.getElementById('detail-host');
const detailMeta    = document.getElementById('detail-meta');
const scanModal     = document.getElementById('scan-modal');
const scanResults   = document.getElementById('scan-results');
const scanProgress  = document.getElementById('scan-progress');
const scanProgressBar = document.getElementById('scan-progress-bar');
const btnScan       = document.getElementById('btn-scan');
const btnScanClose  = document.getElementById('btn-scan-close');
const scanSubnetInput = document.getElementById('scan-subnet');

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
      } else {
        devices.push(msg.device);
      }
      renderAll();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWS, 3000);
  };
}

async function initData() {
  try {
    const res = await fetch('/api/devices');
    const data = await res.json();
    devices = data;
    renderAll();
    
    const resSubnet = await fetch('/api/scan/default_subnet');
    const dataSubnet = await resSubnet.json();
    if(scanSubnetInput && dataSubnet.subnet) {
      scanSubnetInput.value = dataSubnet.subnet;
    }
  } catch (err) {
  }
}

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

  [...grid.querySelectorAll('.card')].forEach(el => el.remove());
  list.forEach(d => grid.appendChild(buildCard(d)));
}

function buildCard(d) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = d.id;
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${d.name} — ${STATUS_LABELS[d.status] ?? d.status}`);

  const rtt  = d.response_time != null ? `${d.response_time} мс` : '—';
  const last = d.last_seen
    ? new Date(d.last_seen).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const typeIcon = ICONS[d.device_type] || ICONS.other;

  card.innerHTML = `
    <span class="card__indicator card__indicator--${d.status}"></span>
    <div class="card__body">
      <div class="card__name" title="${esc(d.name).replace(/"/g, '&quot;')}">${esc(d.name)}</div>
      <div class="card__meta">
        <span class="card__badge" style="display:inline-flex;align-items:center;gap:4px;">${typeIcon}</span>
        <span class="card__host">${esc(d.host)}</span>
        <span class="card__badge">${METHOD_LABELS[d.check_method] ?? esc(d.check_method)}</span>
      </div>
    </div>
    <div>
      <div class="card__status-text card__status-text--${d.status}">${STATUS_LABELS[d.status] ?? d.status}</div>
      <div class="card__rtt">${rtt}</div>
    </div>
    <div class="card__actions">
      <button class="btn btn--ghost btn--sm js-edit"    data-id="${d.id}">Редагувати</button>
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
  if (statUp)   statUp.textContent    = up;
  if (statDown) statDown.textContent  = down;
}

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

  btnSave.disabled = true;
  const origText = btnSave.textContent;
  btnSave.textContent = 'Збереження…';

  const body = {
    name: fName.value.trim(),
    host: fHost.value.trim(),
    device_type: fType.value,
    check_method: fMethod.value,
  };

  try {
    if (editingId) {
      const res = await fetch(`/api/devices/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Помилка сервера: ${res.status}`);
      const updated = await res.json();
      const idx = devices.findIndex(d => d.id === editingId);
      if (idx !== -1) devices[idx] = updated;
    } else {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Помилка сервера: ${res.status}`);
      const created = await res.json();
      devices.push(created);
    }
    deviceModal.close();
    renderAll();
  } catch (err) {
    alert('Помилка збереження: ' + err.message);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = origText;
  }
}

async function startScan() {
  scanResults.innerHTML = '<p class="empty">Пошук пристроїв у підмережі...</p>';
  scanProgress.style.display = 'block';
  scanProgressBar.style.width = '0%';
  scanModal.showModal();

  const subnetValue = scanSubnetInput ? scanSubnetInput.value.trim() : null;

  try {
    const payload = subnetValue ? JSON.stringify({ subnet: subnetValue }) : JSON.stringify({});
    await fetch('/api/scan/start', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
    });
    pollScan();
  } catch (err) {
    scanResults.innerHTML = `<p class="empty" style="color: var(--c-down)">Помилка запуску: ${err.message}</p>`;
  }
}

function stopScanPolling() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  scanModal.close();
}

async function pollScan() {
  try {
    const res = await fetch('/api/scan/status');
    const data = await res.json();
    
    scanProgressBar.style.width = `${data.progress}%`;
    
    if (data.found && data.found.length > 0) {
      scanResults.innerHTML = '';
      data.found.forEach(dev => {
        const item = document.createElement('div');
        item.className = 'scan-item';
        
        const exists = devices.some(d => d.host === dev.ip);
        const typeLabel = (ICONS[dev.device_type] || ICONS.other).replace(/<svg.*?<\/svg>/g, '').trim();
        
        item.innerHTML = `
          <div class="scan-item__info">
            <div class="scan-item__ip">${dev.ip}</div>
            <div class="scan-item__meta">${esc(dev.name)} • ${typeLabel}</div>
          </div>
          <button class="btn btn--primary btn--sm" id="add-scan-${dev.ip.replace(/\./g, '-')}" ${exists ? 'disabled' : ''}>
            ${exists ? 'Додано' : 'Додати'}
          </button>
        `;
        
        if (!exists) {
          const btn = item.querySelector('button');
          btn.onclick = (e) => {
            e.preventDefault();
            addFromScan(dev);
          };
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
  } catch (err) {
  }
}

async function addFromScan(dev) {
  try {
    const res = await fetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: dev.name,
        host: dev.ip,
        device_type: dev.device_type || 'other',
        check_method: 'ping'
      }),
    });
    if (!res.ok) throw new Error();
    const created = await res.json();
    devices.push(created);
    renderAll();
    startScan();
  } catch (err) {
    alert('Не вдалося додати пристрій');
  }
}

async function deleteDevice(id) {
  if (!confirm('Видалити пристрій?')) return;
  try {
    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`Помилка сервера: ${res.status}`);
    devices = devices.filter(d => d.id !== id);
    renderAll();
  } catch (err) {
    alert('Помилка видалення: ' + err.message);
  }
}

async function openDetail(id) {
  const d = devices.find(d => d.id === id);
  if (!d) return;

  detailName.textContent = d.name;
  detailHost.textContent = d.host;

  let histData = [], uptimeData = { uptime: null };
  try {
    [histData, uptimeData] = await Promise.all([
      fetch(`/api/devices/${id}/history`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`/api/devices/${id}/uptime`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]);
  } catch {
  }

  const uptime = uptimeData.uptime != null ? `${uptimeData.uptime}%` : '—';
  const rtt    = d.response_time != null ? `${d.response_time} мс` : '—';
  const last   = d.last_seen ? new Date(d.last_seen).toLocaleString('uk-UA') : '—';

  const typeLabel = (ICONS[d.device_type] || ICONS.other).replace(/<svg.*?<\/svg>/g, '').trim();

  detailMeta.innerHTML = `
    <div class="detail-tag"><span>Тип: </span><strong>${typeLabel}</strong></div>
    <div class="detail-tag"><span>Метод: </span><strong>${METHOD_LABELS[d.check_method] ?? esc(d.check_method)}</strong></div>
    <div class="detail-tag"><span>Статус: </span><strong>${STATUS_LABELS[d.status] ?? d.status}</strong></div>
    <div class="detail-tag"><span>RTT: </span><strong>${rtt}</strong></div>
    <div class="detail-tag"><span>Доступність 24 год: </span><strong>${uptime}</strong></div>
    <div class="detail-tag"><span>Остання відповідь: </span><strong>${last}</strong></div>
  `;

  renderChart(histData);
  detailModal.showModal();
}

function renderChart(history) {
  const ctx = document.getElementById('history-chart');

  if (historyChart) { historyChart.destroy(); historyChart = null; }

  if (!history.length) {
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  const labels = history.map(h =>
    new Date(h.checked_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  );
  const rtts   = history.map(h => h.response_time ?? null);
  const colors = history.map(h =>
    h.status === 'up' ? '#22c55e' : h.status === 'unstable' ? '#f59e0b' : '#ef4444'
  );

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
        x: { ticks: { color: 'var(--c-muted)', maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: 'var(--c-muted)', font: { size: 10 } }, grid: { color: 'var(--c-border)' }, beginAtZero: true },
      },
    },
  });
}

function showToast(device) {
  const container = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = `toast toast--${device.status}`;
  const icon = device.status === 'up' ? '✅' : device.status === 'down' ? '🔴' : '⚠️';
  toast.textContent = `${icon} ${device.name}: ${STATUS_LABELS[device.status] ?? device.status}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

searchInput.addEventListener('input',   renderAll);
filterType.addEventListener('change',   renderAll);
filterStatus.addEventListener('change', renderAll);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

initData();
connectWS();
