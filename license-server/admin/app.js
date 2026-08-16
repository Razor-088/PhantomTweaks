(function() {
  const API = window.location.origin;
  let token = localStorage.getItem('pt_admin_token');
  let currentLicense = null;
  let page = 0;
  const PAGE_SIZE = 30;

  // ── Screens ──
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  // ── Auth ──
  async function login(user, pass) {
    const r = await fetch(`${API}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    token = data.token;
    localStorage.setItem('pt_admin_token', token);
    return data;
  }

  function logout() {
    token = null;
    localStorage.removeItem('pt_admin_token');
    showScreen('login-screen');
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  }

  async function apiFetch(path, opts = {}) {
    const r = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeaders(), ...opts.headers } });
    if (r.status === 401) { logout(); throw new Error('Sesión expirada'); }
    return r.json();
  }

  // ── Login form ──
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    try {
      await login(
        document.getElementById('login-user').value,
        document.getElementById('login-pass').value
      );
      showScreen('dashboard-screen');
      loadDashboard();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  // ── Dashboard ──
  async function loadDashboard() {
    try {
      const data = await apiFetch('/api/admin/licenses?limit=50&offset=' + (page * PAGE_SIZE));
      renderStats(data.counts || {});
      renderLicenses(data.licenses || []);
    } catch (err) {
      console.error(err);
    }
  }

  function renderStats(counts) {
    const bar = document.getElementById('stats-bar');
    bar.innerHTML = [
      { n: counts.total || 0, l: 'Total' },
      { n: counts.active || 0, l: 'Activas' },
      { n: counts.expired || 0, l: 'Expiradas' },
      { n: counts.revoked || 0, l: 'Revocadas' },
      { n: counts.suspended || 0, l: 'Suspendidas' },
    ].map(s => `<div class="stat-card"><div class="num">${s.n}</div><div class="lbl">${s.l}</div></div>`).join('');
  }

  function renderLicenses(list) {
    const body = document.getElementById('licenses-body');
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--dim)">No hay licencias</td></tr>';
      return;
    }
    body.innerHTML = list.map(l => `
      <tr>
        <td><code style="color:var(--accent)">${maskKey(l.license_key)}</code></td>
        <td><span class="badge badge-${l.status}">${l.status}</span></td>
        <td>${l.license_type}</td>
        <td>${l.activation_count}/${l.max_activations}</td>
        <td>${l.expires_at ? new Date(l.expires_at).toLocaleDateString('es-ES') : 'Lifetime'}</td>
        <td>${new Date(l.created_at).toLocaleDateString('es-ES')}</td>
        <td>${l.last_validation ? timeAgo(l.last_validation) : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="window._viewLicense('${l.license_key}')">Ver</button></td>
      </tr>
    `).join('');
  }

  function maskKey(key) {
    if (!key) return '—';
    const parts = key.split('-');
    if (parts.length >= 3) {
      return parts[0] + '-****-****-' + (parts[parts.length-1] || '');
    }
    return key;
  }

  function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days}d`;
  }

  // ── Search ──
  document.getElementById('search-btn').addEventListener('click', async () => {
    const q = document.getElementById('search-input').value.trim();
    if (!q) { page = 0; return loadDashboard(); }
    try {
      const data = await apiFetch(`/api/admin/licenses?search=${encodeURIComponent(q)}&limit=50`);
      renderLicenses(data.licenses || []);
    } catch (err) { console.error(err); }
  });

  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('search-btn').click();
  });

  // ── Create License ──
  document.getElementById('create-btn').addEventListener('click', () => {
    document.getElementById('create-modal').classList.add('open');
    document.getElementById('create-result').style.display = 'none';
  });

  document.getElementById('create-cancel').addEventListener('click', () => {
    document.getElementById('create-modal').classList.remove('open');
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/api/admin/licenses', {
        method: 'POST',
        body: JSON.stringify({
          license_type: document.getElementById('create-type').value,
          max_activations: parseInt(document.getElementById('create-max').value),
        }),
      });
      const resultBox = document.getElementById('create-result');
      resultBox.style.display = 'block';
      resultBox.textContent = `Licencia creada: ${data.license_key}\nTipo: ${data.license_type}\nDispositivos: ${data.max_activations}\nExpira: ${data.expires_at || 'Lifetime'}`;
      loadDashboard();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // ── View License Detail ──
  window._viewLicense = async function(key) {
    try {
      currentLicense = await apiFetch(`/api/admin/licenses/${key}`);
      renderDetail(currentLicense);
      document.getElementById('detail-modal').classList.add('open');
    } catch (err) { alert(err.message); }
  };

  function renderDetail(l) {
    const body = document.getElementById('detail-body');
    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item full"><div class="dl">Licencia</div><div class="dv" style="color:var(--accent);font-family:monospace">${l.license_key}</div></div>
        <div class="detail-item"><div class="dl">Estado</div><div class="dv"><span class="badge badge-${l.status}">${l.status}</span></div></div>
        <div class="detail-item"><div class="dl">Tipo</div><div class="dv">${l.license_type}</div></div>
        <div class="detail-item"><div class="dl">Dispositivos</div><div class="dv">${l.activation_count} / ${l.max_activations}</div></div>
        <div class="detail-item"><div class="dl">HWID</div><div class="dv" style="font-family:monospace;font-size:11px">${l.hwid || 'No activado'}</div></div>
        <div class="detail-item"><div class="dl">Expira</div><div class="dv">${l.expires_at ? new Date(l.expires_at).toLocaleDateString('es-ES') : 'Lifetime'}</div></div>
        <div class="detail-item"><div class="dl">Creada</div><div class="dv">${new Date(l.created_at).toLocaleString('es-ES')}</div></div>
        <div class="detail-item"><div class="dl">Última validación</div><div class="dv">${l.last_validation ? new Date(l.last_validation).toLocaleString('es-ES') : '—'}</div></div>
        <div class="detail-item"><div class="dl">Última IP</div><div class="dv">${l.last_ip || '—'}</div></div>
        <div class="detail-item"><div class="dl">Última versión</div><div class="dv">${l.last_version || '—'}</div></div>
        <div class="detail-item"><div class="dl">Order ID</div><div class="dv">${l.sellauth_order_id || '—'}</div></div>
        <div class="detail-item"><div class="dl">Email</div><div class="dv">${l.sellauth_customer_email || '—'}</div></div>
        <div class="detail-item"><div class="dl">Grace offline</div><div class="dv">${l.offline_grace_days} días</div></div>
      </div>
    `;
  }

  document.getElementById('detail-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.remove('open');
  });

  // ── Actions ──
  document.getElementById('detail-revoke').addEventListener('click', async () => {
    if (!currentLicense || !confirm('¿Revocar esta licencia?')) return;
    await apiFetch(`/api/admin/licenses/${currentLicense.license_key}/revoke`, { method: 'POST' });
    document.getElementById('detail-modal').classList.remove('open');
    loadDashboard();
  });

  document.getElementById('detail-suspend').addEventListener('click', async () => {
    if (!currentLicense) return;
    await apiFetch(`/api/admin/licenses/${currentLicense.license_key}/suspend`, { method: 'POST' });
    document.getElementById('detail-modal').classList.remove('open');
    loadDashboard();
  });

  document.getElementById('detail-reactivate').addEventListener('click', async () => {
    if (!currentLicense) return;
    await apiFetch(`/api/admin/licenses/${currentLicense.license_key}/reactivate`, { method: 'POST' });
    document.getElementById('detail-modal').classList.remove('open');
    loadDashboard();
  });

  document.getElementById('detail-reset-hwid').addEventListener('click', async () => {
    if (!currentLicense || !confirm('¿Resetear HWID? El usuario podrá activar en otro dispositivo.')) return;
    await apiFetch(`/api/admin/licenses/${currentLicense.license_key}/reset-hwid`, { method: 'POST' });
    document.getElementById('detail-modal').classList.remove('open');
    loadDashboard();
  });

  // ── Init ──
  if (token) {
    showScreen('dashboard-screen');
    loadDashboard();
  } else {
    showScreen('login-screen');
  }
})();
