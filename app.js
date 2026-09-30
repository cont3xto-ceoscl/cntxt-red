/* app.js - CNTXT Client Portal Logic & Data Processing with Django 5.1 & PostgreSQL REST API Backend */

/* ══════════════════════════════════════════════════════════════════
   GLOBAL ENERGY CURSOR ENGINE
   Replicates the splash-screen red pulsating dot + halo effect
   across all app pages. Runs independently of the DOMContentLoaded
   main block so it activates as soon as the DOM is ready.
══════════════════════════════════════════════════════════════════ */
(function initGlobalEnergyCursor() {
  'use strict';

  let appMouseX = -500, appMouseY = -500;
  let appHaloX = -500, appHaloY = -500;
  let appRafId = null;
  let cursorReady = false;

  const dot = document.getElementById('app-cursor-dot');
  const halo = document.getElementById('app-cursor-halo');

  if (!dot || !halo) return;

  function onAppMouseMove(e) {
    appMouseX = e.clientX;
    appMouseY = e.clientY;

    if (!cursorReady) {
      cursorReady = true;
      dot.classList.add('visible');
      halo.classList.add('visible');
    }
  }

  function animateAppCursor() {
    // Dot follows cursor exactly
    dot.style.transform = `translate(calc(${appMouseX}px - 50%), calc(${appMouseY}px - 50%))`;

    // Halo lags with easing for the energy-trail feel
    appHaloX += (appMouseX - appHaloX) * 0.10;
    appHaloY += (appMouseY - appHaloY) * 0.10;
    halo.style.transform = `translate(calc(${appHaloX}px - 50%), calc(${appHaloY}px - 50%))`;

    appRafId = requestAnimationFrame(animateAppCursor);
  }

  document.addEventListener('mousemove', onAppMouseMove, { passive: true });
  appRafId = requestAnimationFrame(animateAppCursor);

  // Hide cursor when mouse leaves the window, show on re-entry
  document.addEventListener('mouseleave', () => {
    dot.classList.remove('visible');
    halo.classList.remove('visible');
    cursorReady = false;
  });
  document.addEventListener('mouseenter', () => {
    if (appMouseX !== -500) {
      dot.classList.add('visible');
      halo.classList.add('visible');
      cursorReady = true;
    }
  });
})();

/* ══════════════════════════════════════════════════════════════════
   AUTH MANAGER — JWT Authentication System
   Gestiona login, logout, refresh automático de tokens y sesiones.
   Expuesto en window.AuthManager para acceso global.
══════════════════════════════════════════════════════════════════ */
(function initAuthManager() {
  'use strict';

  const CFG = () => (window.CNTXT_CONFIG && window.CNTXT_CONFIG.AUTH) || {};
  const API_BASE = (window.location.origin.includes('127.0.0.1') || window.location.origin.includes('localhost'))
    ? 'http://127.0.0.1:8000'
    : '';
  const API_BASE_AUTH = () => `${API_BASE}/api`;

  const AuthManager = {
    _refreshTimer: null,

    // ─ Token Storage ─
    getAccessToken() {
      return localStorage.getItem(CFG().ACCESS_TOKEN_KEY || 'cntxt_access_token');
    },
    getRefreshToken() {
      return localStorage.getItem(CFG().REFRESH_TOKEN_KEY || 'cntxt_refresh_token');
    },
    getUser() {
      try {
        return JSON.parse(localStorage.getItem(CFG().USER_KEY || 'cntxt_user_data') || 'null');
      } catch { return null; }
    },
    _saveTokens(access, refresh) {
      localStorage.setItem(CFG().ACCESS_TOKEN_KEY || 'cntxt_access_token', access);
      if (refresh) localStorage.setItem(CFG().REFRESH_TOKEN_KEY || 'cntxt_refresh_token', refresh);
    },
    _saveUser(user) {
      localStorage.setItem(CFG().USER_KEY || 'cntxt_user_data', JSON.stringify(user));
    },
    _clearStorage() {
      localStorage.removeItem(CFG().ACCESS_TOKEN_KEY || 'cntxt_access_token');
      localStorage.removeItem(CFG().REFRESH_TOKEN_KEY || 'cntxt_refresh_token');
      localStorage.removeItem(CFG().USER_KEY || 'cntxt_user_data');
    },

    // ─ Auth Headers ─
    getHeaders() {
      const token = this.getAccessToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return headers;
    },

    // ─ Auth State ─
    isAuthenticated() {
      return !!this.getAccessToken();
    },

    // ─ JWT Expiry Helpers ─
    _getTokenExpiry(token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000; // ms
      } catch { return 0; }
    },

    // ─ Login ─
    async login(username, password) {
      const endpoint = CFG().LOGIN_ENDPOINT || '/auth/login/';
      const res = await fetch(`${API_BASE_AUTH()}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        if (res.status === 502) {
          throw new Error('Error 502 (Bad Gateway): El backend Gunicorn no está corriendo en el VPS. Inicia el servicio cntxt con: sudo systemctl restart cntxt');
        }
        const text = await res.text();
        throw new Error(`Error del servidor (HTTP ${res.status}): ${text.substring(0, 100)}`);
      }

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      this._saveTokens(data.access, data.refresh);
      this._saveUser(data.user);
      this._scheduleRefresh(data.access);
      return data;
    },

    // ─ Logout ─
    async logout() {
      const refresh = this.getRefreshToken();
      if (refresh) {
        try {
          const endpoint = CFG().LOGOUT_ENDPOINT || '/auth/logout/';
          await fetch(`${API_BASE_AUTH()}${endpoint}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ refresh }),
          });
        } catch {/* silent */}
      }
      this._clearStorage();
      if (this._refreshTimer) { clearTimeout(this._refreshTimer); this._refreshTimer = null; }

      const badge = document.getElementById('header-user-badge');
      if (badge) badge.style.display = 'none';
      if (typeof window.renderGlobulosPanel === 'function') window.renderGlobulosPanel();

      // Al cerrar sesión, restablecer el intro cinematográfico original
      try {
        sessionStorage.removeItem('cntxt_red_intro_dismissed');
      } catch (e) {}

      if (typeof window.playSplashIntro === 'function') {
        window.playSplashIntro(true);
      } else {
        const splash = document.getElementById('splash-overlay');
        if (splash) {
          splash.style.display = 'flex';
          splash.classList.remove('dismissed');
        }
      }
    },

    // ─ Token Refresh ─
    async refreshToken() {
      const refresh = this.getRefreshToken();
      if (!refresh) { this.logout(); return null; }
      try {
        const endpoint = CFG().REFRESH_ENDPOINT || '/auth/refresh/';
        const res = await fetch(`${API_BASE_AUTH()}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) throw new Error('Refresh failed');
        const data = await res.json();
        this._saveTokens(data.access, data.refresh || refresh);
        this._scheduleRefresh(data.access);
        return data.access;
      } catch {
        this._clearStorage();
        if (typeof window.playSplashIntro === 'function') {
          window.playSplashIntro(true);
        }
        return null;
      }
    },

    // ─ Auto Refresh Scheduler ─
    _scheduleRefresh(accessToken) {
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      const expiry = this._getTokenExpiry(accessToken);
      const margin = CFG().REFRESH_MARGIN_MS || 5 * 60 * 1000;
      const msUntilRefresh = expiry - Date.now() - margin;
      if (msUntilRefresh > 0) {
        this._refreshTimer = setTimeout(() => this.refreshToken(), msUntilRefresh);
      } else {
        // Token is already near expiry, refresh now
        setTimeout(() => this.refreshToken(), 1000);
      }
    },

    // ─ Fetch Profile ─
    async fetchMe() {
      const endpoint = CFG().ME_ENDPOINT || '/auth/me/';
      const res = await fetch(`${API_BASE_AUTH()}${endpoint}`, {
        headers: this.getHeaders()
      });
      if (!res.ok) return null;
      const user = await res.json();
      this._saveUser(user);
      return user;
    },

    // ─ UI: Show / Hide Login Overlay ─
    showLoginOverlay() {
      this._showLoginOverlay();
    },
    hideLoginOverlay() {
      this._hideLoginOverlay();
    },
    _showLoginOverlay() {
      const overlay = document.getElementById('auth-login-overlay');
      if (overlay) overlay.classList.add('active');
    },
    _hideLoginOverlay() {
      const overlay = document.getElementById('auth-login-overlay');
      if (overlay) overlay.classList.remove('active');
    },

    // ─ UI: Update Header Badge ─
    updateHeaderBadge(user) {
      if (!user) return;
      const badge = document.getElementById('header-user-badge');
      const nameEl = document.getElementById('header-user-name');
      const rolEl  = document.getElementById('header-user-rol');

      if (badge)  badge.style.display = 'flex';
      if (nameEl) nameEl.textContent = user.nombre_completo || user.username || 'Usuario';
      if (rolEl) {
        const rolLabels = {
          superadmin: 'Superadmin', ceo_coo: 'CEO / COO',
          coordinadora: 'Coordinadora', director: 'Director',
          growth_partner: 'Growth Partner'
        };
        rolEl.textContent = rolLabels[user.rol] || user.rol || 'Usuario';
        rolEl.setAttribute('data-rol', user.rol || '');
      }
    },

    // ─ Init: runs on page load ─
    async init() {
      this._bindLoginForm();
      this._bindLogoutButton();
      this._bindCloseButton();

      const token = this.getAccessToken();
      if (!token) {
        // El intro debe mantenerse intacto al abrir la web.
        // El recuadro de login se desplegará al hacer clic en "Ingresar al Portal".
        return;
      }

      // Token exists — try to use it, refresh if near expiry
      this._scheduleRefresh(token);

      // Update badge from cached user
      const cachedUser = this.getUser();
      if (cachedUser) this.updateHeaderBadge(cachedUser);

      // Fetch fresh user data in background
      this.fetchMe().then(user => {
        if (user) {
          this.updateHeaderBadge(user);
          if (typeof window.renderGlobulosPanel === 'function') window.renderGlobulosPanel();
        }
      });
    },

    // ─ Form Binding ─
    _bindLoginForm() {
      const form    = document.getElementById('auth-login-form');
      const errEl   = document.getElementById('auth-error-msg');
      const btn     = document.getElementById('auth-submit-btn');
      const spinner = document.getElementById('auth-btn-spinner');
      const btnText = btn ? btn.querySelector('.auth-btn-text') : null;
      const arrow   = btn ? btn.querySelector('.auth-btn-arrow') : null;

      if (!form) return;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-input-email')?.value?.trim() || '';
        const password = document.getElementById('auth-input-password')?.value?.trim() || '';

        if (!username || !password) {
          if (errEl) { errEl.textContent = 'Por favor ingresa usuario y contraseña.'; errEl.style.display = 'block'; }
          return;
        }

        // Show loading state
        if (btn)     btn.disabled = true;
        if (spinner) spinner.style.display = 'inline-flex';
        if (btnText) btnText.textContent = 'Verificando...';
        if (arrow)   arrow.style.display = 'none';
        if (errEl)   errEl.style.display = 'none';

        try {
          const data = await this.login(username, password);
          this._hideLoginOverlay();
          this.updateHeaderBadge(data.user);
          if (typeof window.renderGlobulosPanel === 'function') window.renderGlobulosPanel();

          // Descartar el intro tras autenticarse con éxito
          if (typeof window.dismissSplash === 'function') {
            window.dismissSplash(true);
          } else {
            const splash = document.getElementById('splash-overlay');
            if (splash) {
              try { sessionStorage.setItem('cntxt_red_intro_dismissed', '1'); } catch (e) {}
              splash.classList.add('dismissed');
              setTimeout(() => { splash.style.display = 'none'; }, 850);
            }
          }

          // Trigger data reload
          if (typeof window.loadAllDataFromAPI === 'function') window.loadAllDataFromAPI();
          if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
          showNotification(`¡Bienvenido, ${data.user.nombre_completo || data.user.username}!`, 'success');
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Error al iniciar sesión. Verifica tus credenciales.';
            errEl.style.display = 'block';
          }
        } finally {
          if (btn)     btn.disabled = false;
          if (spinner) spinner.style.display = 'none';
          if (btnText) btnText.textContent = 'Ingresar al Portal';
          if (arrow)   arrow.style.display = '';
        }
      });
    },

    _bindCloseButton() {
      const btnClose = document.getElementById('auth-modal-close');
      if (!btnClose) return;
      btnClose.addEventListener('click', () => {
        this._hideLoginOverlay();
      });
    },

    _bindLogoutButton() {
      const btnLogout = document.getElementById('btn-logout');
      if (!btnLogout) return;
      btnLogout.addEventListener('click', async () => {
        const badge = document.getElementById('header-user-badge');
        if (badge) badge.style.display = 'none';
        await this.logout();
      });
    },
  };

  window.AuthManager = AuthManager;
})();

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Auth System
  window.AuthManager.init();


  // ═══════════════════════════════════════════════════════════════════
  // DJANGO REST API CLIENT & DATA ADAPTER LAYER
  // ═══════════════════════════════════════════════════════════════════
  const API_BASE = (window.location.origin.includes('127.0.0.1') || window.location.origin.includes('localhost'))
    ? 'http://127.0.0.1:8000'
    : '';

  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  const CSRF_TOKEN = getCookie('csrftoken') || '';

  async function apiFetch(endpoint, options = {}, timeoutMs = 15000) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'X-CSRFToken': CSRF_TOKEN
    };
    // ─ Inject JWT Bearer Token automatically ─
    const accessToken = window.AuthManager && window.AuthManager.getAccessToken ? window.AuthManager.getAccessToken() : null;
    if (accessToken) {
      defaultHeaders['Authorization'] = `Bearer ${accessToken}`;
    }
    options.headers = { ...defaultHeaders, ...(options.headers || {}) };

    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (!cleanEndpoint.startsWith('/api/')) {
      cleanEndpoint = `/api${cleanEndpoint}`;
    }
    const targetUrl = `${API_BASE}${cleanEndpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    options.signal = controller.signal;

    try {
      const res = await fetch(targetUrl, options);
      clearTimeout(timeoutId);

      // ─ 401 Interceptor: token expired, try refresh ─
      if (res.status === 401 && window.AuthManager) {
        const newToken = await window.AuthManager.refreshToken();
        if (newToken) {
          // Retry the original request with new token
          options.headers['Authorization'] = `Bearer ${newToken}`;
          delete options.signal;
          const retryRes = await fetch(targetUrl, options);
          if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}`);
          if (retryRes.status === 204) return true;
          return await retryRes.json();
        }
        return null; // Auth manager will redirect to login
      }

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }
      if (res.status === 204) return true;
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`[Django API Error] ${targetUrl}:`, err);
      throw err;
    }
  }

  const ApiService = {
    async getInitialData() {
      try {
        return await apiFetch('/initial-data/', {}, 15000);
      } catch (err) {
        console.warn('Endpoint /initial-data/ no disponible o con error, consultando endpoints individuales...', err);
        const contactosRes = await apiFetch('/contactos/', {}, 10000).catch(() => apiFetch('/contacto/', {}, 10000)).catch(() => []);
        const empresasRes = await apiFetch('/empresas/', {}, 10000).catch(() => apiFetch('/empresa/', {}, 10000)).catch(() => []);
        const proyectosRes = await apiFetch('/proyectos/', {}, 10000).catch(() => apiFetch('/proyecto/', {}, 10000)).catch(() => []);

        return {
          status: 'success',
          contactos: Array.isArray(contactosRes) ? contactosRes : (contactosRes.results || []),
          empresas: Array.isArray(empresasRes) ? empresasRes : (empresasRes.results || []),
          proyectos: Array.isArray(proyectosRes) ? proyectosRes : (proyectosRes.results || [])
        };
      }
    },
    async getContactos(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await apiFetch(`/contactos/${qs ? '?' + qs : ''}`);
    },
    async createContacto(data) {
      return await apiFetch('/contactos/', { method: 'POST', body: JSON.stringify(data) });
    },
    async updateContacto(id, data) {
      return await apiFetch(`/contactos/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    async deleteContacto(id) {
      return await apiFetch(`/contactos/${id}/`, { method: 'DELETE' });
    },
    async getEmpresas() {
      return await apiFetch('/empresas/');
    },
    async createEmpresa(data) {
      return await apiFetch('/empresas/', { method: 'POST', body: JSON.stringify(data) });
    },
    async updateEmpresa(id, data) {
      return await apiFetch(`/empresas/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    async deleteEmpresa(id) {
      return await apiFetch(`/empresas/${id}/`, { method: 'DELETE' });
    },
    async getProyectos(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await apiFetch(`/proyectos/${qs ? '?' + qs : ''}`);
    },
    async createProyecto(data) {
      return await apiFetch('/proyectos/', { method: 'POST', body: JSON.stringify(data) });
    },
    async updateProyecto(id, data) {
      return await apiFetch(`/proyectos/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    async deleteProyecto(id) {
      return await apiFetch(`/proyectos/${id}/`, { method: 'DELETE' });
    },
    // Pulso Relacional (Matriz 100pts)
    async getPulsos(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await apiFetch(`/pulso-relacional/${qs ? '?' + qs : ''}`);
    },
    async createPulso(data) {
      return await apiFetch('/pulso-relacional/', { method: 'POST', body: JSON.stringify(data) });
    },
    async updatePulso(id, data) {
      return await apiFetch(`/pulso-relacional/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    async deletePulso(id) {
      return await apiFetch(`/pulso-relacional/${id}/`, { method: 'DELETE' });
    },
    // Dashboard KPIs
    async getDashboardStats() {
      return await apiFetch('/dashboard/stats/');
    },
    // Actividades (feed)
    async getActividades(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return await apiFetch(`/actividades/${qs ? '?' + qs : ''}`);
    },
  };

  function updateSyncStatusIndicator(status) {
    const dot = document.getElementById('header-sync-dot');
    const text = document.getElementById('header-sync-text');
    const btn = document.getElementById('btn-sync-status');
    if (!dot || !text) return;

    if (status === 'synced') {
      dot.className = 'sync-status-dot synced';
      text.textContent = 'PostgreSQL Conectado';
      if (btn) btn.title = 'Persistencia activa: Todos los datos están sincronizados en tiempo real con PostgreSQL.';
    } else if (status === 'saving') {
      dot.className = 'sync-status-dot saving';
      text.textContent = 'Guardando en PostgreSQL...';
      if (btn) btn.title = 'Enviando cambios a la API de Django...';
    } else {
      dot.className = 'sync-status-dot offline';
      text.textContent = 'API Django Desconectada';
      if (btn) btn.title = 'No se pudo contactar con el backend de Django en /api/';
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT & DICTIONARIES
  // ═══════════════════════════════════════════════════════════════════
  let contactsData = [];
  let masterEmpresas = [];
  let savedProjects = [];

  let currentFilter = 'all';
  let currentTagFilter = 'all';
  const selectedTagFilters = new Set();
  let currentChannelFilter = 'all';
  let currentPersonaFilter = 'all'; // B2C | B2B persona type filter
  let activeTab = 'all';
  let selectedContact = null;
  let isEditMode = false;

  // Pagination & View
  const PAGE_SIZE = 100;
  let currentPage = 1;
  let viewMode = 'grid'; // 'grid' | 'list'
  let lastFiltered = []; // cache of filtered results for select-all

  // 13 Relationship Tag Definitions
  const TAG_MAP = {
    embajador: 'Embajador de Marca',
    growth: 'Growth Partner',
    cliente_black: 'Cliente Black',
    cliente_gold: 'Cliente Gold',
    cliente_silver: 'Cliente Silver',
    cliente_bronze: 'Cliente Bronze',
    lead: 'Lead / Prospecto',
    media: 'Media & Influencers',
    aliados: 'Aliados Estratégicos',
    servicios_claves: 'Servicios Claves',
    servicios_aux: 'Servicios Auxiliares',
    equipo: 'Equipo CNTXT',
    candidatos: 'Candidatos y Talento',
    mentores: 'Mentores y Asesores',
    prospecto: 'Prospecto'
  };

  const TAG_KEYS = Object.keys(TAG_MAP);

  // 9 Prospecting Channel Definitions
  const CHANNEL_MAP = {
    fb: 'Media | Facebook',
    ig: 'Media | Instagram',
    gg: 'Media | Google',
    gmaps: 'Media | Google Maps',
    referidos: 'Referidos',
    referido: 'Referido',
    prospeccion: 'Prospección Activa',
    ferias: 'Ferias o Activaciones',
    feria_evento: 'Feria / Evento Comercial',
    oficinas: 'Oficinas CNTXT',
    capital: 'Capital Relacional',
    whatsapp: 'WhatsApp Directo',
    linkedin: 'LinkedIn',
    web: 'Sitio Web',
    directo: 'Contacto Directo'
  };

  // Pulse Vital Definitions (1 - 4) — Matriz de Intensidad Relacional (100 Puntos)
  const PULSE_DEFINITIONS = {
    1: {
      level: 1,
      code: 'p1',
      key: 'sin_pulso',
      name: 'Sin Pulso (0 - 25 pts)',
      shortName: 'Sin Pulso',
      points: '0 a 25 Puntos',
      state: 'Estado de Latencia / Recapture',
      color: '#FFCBC7',
      border: 'rgba(255, 203, 199, 0.4)',
      bg: 'rgba(255, 203, 199, 0.1)',
      cardClass: 'card-p1',
      badgeClass: 'badge-p1',
      desc: 'Relación congelada o estrictamente transaccional. El vínculo requiere confrontar miedos mediante la descalificación pasiva Sandler o reevaluar la continuidad de la cuenta.',
      kpiName: '0 - 25 Pts (Latencia)',
      subtitle: 'Latencia / Recapture',
      agentTag: '⚪ SANDLER DESCALIFICACIÓN',
      agentTagClass: 'agent-tag-p1',
      agentActionText: 'Confrontar miedos mediante descalificación pasiva Sandler y auditar continuidad de la cuenta.',
      btnClass: 'btn-p1',
      btnLabel: '⚡ Activar Protocolo Sandler'
    },
    2: {
      level: 2,
      code: 'p2',
      key: 'pulso_debil',
      name: 'Pulso Débil (26 - 50 pts)',
      shortName: 'Pulso Débil',
      points: '26 a 50 Puntos',
      state: 'Estado de Exploración / Attain',
      color: '#C7807B',
      border: 'rgba(199, 128, 123, 0.4)',
      bg: 'rgba(199, 128, 123, 0.1)',
      cardClass: 'card-p2',
      badgeClass: 'badge-p2',
      desc: 'Existe curiosidad o contacto inicial, pero falta profundidad. Se activan secuencias de nutrición R.E.D. (contenido nativo y storytelling) para elevar la sensibilidad hacia el diseño y la afinidad cultural.',
      kpiName: '26 - 50 Pts (Exploración)',
      subtitle: 'Exploración / Attain',
      agentTag: '🌸 NUTRICIÓN & STORYTELLING',
      agentTagClass: 'agent-tag-p2',
      agentActionText: 'Desplegar secuencias de nutrición R.E.D. y Conceptos Maestros para elevar afinidad cultural.',
      btnClass: 'btn-p2',
      btnLabel: '⚡ Desplegar Nutrición R.E.D.'
    },
    3: {
      level: 3,
      code: 'p3',
      key: 'pulso_intenso',
      name: 'Pulso Intenso (51 - 80 pts)',
      shortName: 'Pulso Intenso',
      points: '51 a 80 Puntos',
      state: 'Estado de Sincronía / Expand',
      color: '#94443E',
      border: 'rgba(148, 68, 62, 0.5)',
      bg: 'rgba(148, 68, 62, 0.12)',
      cardClass: 'card-p3',
      badgeClass: 'badge-p3',
      desc: 'Alta reciprocidad, vulnerabilidad y alineación con el ADN CNTXT. La presión arterial del vínculo es óptima; la persona confía plenamente y es altamente propenso a gestar nuevos proyectos o co-desarrollos de forma orgánica.',
      kpiName: '51 - 80 Pts (Sincronía)',
      subtitle: 'Sincronía / Expand',
      agentTag: '🍁 CO-DESARROLLO & EXPANSIÓN',
      agentTagClass: 'agent-tag-p3',
      agentActionText: 'Presión arterial óptima. Presentar propuesta formal de co-desarrollo o nuevo proyecto.',
      btnClass: 'btn-p3',
      btnLabel: '⚡ Iniciar Co-Desarrollo'
    },
    4: {
      level: 4,
      code: 'p4',
      key: 'tejido_integrado',
      name: 'Tejido Integrado (81 - 100 pts)',
      shortName: 'Tejido Integrado',
      points: '81 a 100 Puntos',
      state: 'Simbiosis / Growth Partner & Keep',
      color: '#621B16',
      border: 'rgba(98, 27, 22, 0.7)',
      bg: 'rgba(98, 27, 22, 0.2)',
      cardClass: 'card-p4',
      badgeClass: 'badge-p4',
      desc: 'Simbiosis total. La persona es parte del ecosistema, un Insider de la comunidad que defiende la marca, consume la experiencia y multiplica el crecimiento mediante referidos de alto nivel.',
      kpiName: '81 - 100 Pts (Simbiosis)',
      subtitle: 'Simbiosis / Growth Partner',
      agentTag: '🍷 INSIDER & MULTIPLICADOR',
      agentTagClass: 'agent-tag-p4',
      agentActionText: 'Insider total de la comunidad (Cialdini). Activar programa de Growth Partner y referidos.',
      btnClass: 'btn-p4',
      btnLabel: '⚡ Activar Círculo Insider'
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // ESTRATEGIA COMUNICACIONAL — ACCIONES PARA INTENSIFICAR / MANTENER PULSO
  // 3 posibles acciones por cada uno de los 6 criterios de medición
  // segun el estado de pulso actual (P1 a P3: Incrementar / P4: Mantener)
  // ═══════════════════════════════════════════════════════════════════
  const PULSE_CRITERIA_STRATEGIES = {
    1: {
      name: 'P1: Sin Pulso',
      shortName: 'Sin Pulso',
      goal: 'Reactivar e iniciar sintonía ontológica',
      criteria: [
        {
          id: 'dna',
          name: 'Afinidad Cultural & ADN (25 pts)',
          actions: [
            'Enviar cápsula audiovisual breve sobre Disrupción & Well-Being sin oferta comercial.',
            'Compartir historia de impacto o storytelling de diseño afín a su industria.',
            'Pregunta de curiosidad ontológica: consultar su visión experta sobre tendencias del hábitat.'
          ]
        },
        {
          id: 'ambassador',
          name: 'Proactividad de Recomendar (25 pts)',
          actions: [
            'Hacerle una introducción de alto valor con un contacto o aliado de su interés sin pedir nada a cambio.',
            'Reconocer y celebrar públicamente un hito reciente de su empresa o perfil en redes profesionales.',
            'Enviar cortesía o detalle sensorial de bienvenida para romper la inercia fría.'
          ]
        },
        {
          id: 'bi',
          name: 'Bidireccionalidad de Interacción (20 pts)',
          actions: [
            'Mensaje WhatsApp de baja presión: "Pensé en ti al ver este desarrollo y quise saludarte".',
            'Comentario de alto valor y felicitación en su última publicación profesional.',
            'Nota de voz breve de 30 segundos preguntando por un proyecto personal que haya mencionado antes.'
          ]
        },
        {
          id: 'sandler',
          name: 'Vulnerabilidad / Sandler (10 pts)',
          actions: [
            'Descalificación pasiva Sandler: "¿Aún tiene sentido explorar colaboraciones o prefieres pausarlo?".',
            'Pregunta de dolor no resuelto: indagar sobre su mayor obstáculo operativo o de espacios actual.',
            'Compartir con humildad un reto de diseño superado por CNTXT para generar empatía y desarme.'
          ]
        },
        {
          id: 'cialdini',
          name: 'Comunidad / Cialdini (10 pts)',
          actions: [
            'Invitar como oyente selecto a webinar o espacio digital exclusivo de CNTXT.',
            'Compartir informe confidencial de tendencias arquitectónicas, sensoriales y biofílicas.',
            'Extender acceso preferencial a la galería digital de casos de estudio de la marca.'
          ]
        },
        {
          id: 'map',
          name: 'Claridad del Mapa de Vida (10 pts)',
          actions: [
            'Café informal de 15 minutos sin agenda comercial para reconectar sobre sus metas del año.',
            'Preguntar sobre sus expectativas de expansión, crecimiento o sedes para este semestre.',
            'Compartir artículo prospectivo solicitando su perspectiva sobre el sector a 3 años.'
          ]
        }
      ]
    },
    2: {
      name: 'P2: Pulso Débil',
      shortName: 'Pulso Débil',
      goal: 'Nutrir afinidad cultural y profundizar confianza',
      criteria: [
        {
          id: 'dna',
          name: 'Afinidad Cultural & ADN (25 pts)',
          actions: [
            'Sesión privada de inmersión en Conceptos Maestros CNTXT orientada a sus intereses específicos.',
            'Envío de kit sensorial de diseño enfocado en bienestar, biofilia y acústica.',
            'Co-analizar un requerimiento o espacio suyo a través de la lente de Personalización CNTXT.'
          ]
        },
        {
          id: 'ambassador',
          name: 'Proactividad de Recomendar (25 pts)',
          actions: [
            'Presentar el programa de Embajadores y Growth Partners mostrando beneficios de red de confianza.',
            'Pedir su criterio sobre un prospecto o aliado conjunto para iniciar co-referenciación.',
            'Facilitarle un pase de cortesía VIP para asistir con un colega de su confianza a un evento privado.'
          ]
        },
        {
          id: 'bi',
          name: 'Bidireccionalidad de Interacción (20 pts)',
          actions: [
            'Establecer check-in quincenal consultivo para compartir avances mutuos e ideas de valor.',
            'Proponer almuerzo o café de trabajo para intercambiar visiones de negocio y hábitat.',
            'Compartir recurso de alta utilidad técnica y solicitar su retroalimentación inmediata.'
          ]
        },
        {
          id: 'sandler',
          name: 'Vulnerabilidad / Sandler (10 pts)',
          actions: [
            'Indagar sobre el impacto emocional y financiero de no resolver sus desafíos de infraestructura actuales.',
            'Conversación de sinceramiento: "¿Qué barreras internas te impiden dar el siguiente paso?".',
            'Explorar preocupaciones sobre costos, tiempos o incertidumbres con total franqueza y claridad.'
          ]
        },
        {
          id: 'cialdini',
          name: 'Comunidad / Cialdini (10 pts)',
          actions: [
            'Invitar a experiencia inmersiva presencial en el Figital Showroom de CNTXT.',
            'Conectar con otro cliente o partner activo afín para generar sinergias entre pares.',
            'Invitar a una cata privada o experiencia sensorial organizada por el ecosistema.'
          ]
        },
        {
          id: 'map',
          name: 'Claridad del Mapa de Vida (10 pts)',
          actions: [
            'Mapear proyectos de inversión o expansión personal previstos para los próximos 2 a 3 años.',
            'Identificar hitos familiares o patrimoniales clave para alinear soluciones futuras.',
            'Taller de ideación conjunta para proyectar la evolución de sus espacios a mediano plazo.'
          ]
        }
      ]
    },
    3: {
      name: 'P3: Pulso Intenso',
      shortName: 'Pulso Intenso',
      goal: 'Co-crear y escalar proyectos conjuntos',
      criteria: [
        {
          id: 'dna',
          name: 'Afinidad Cultural & ADN (25 pts)',
          actions: [
            'Invitar a co-crear un concepto de diseño disruptivo como caso de estudio de vanguardia.',
            'Publicar testimonial o caso de éxito conjunto resaltando su visión vanguardista de bienestar.',
            'Diseñar una pieza o experiencia personalizada exclusiva con ADN CNTXT para su uso directo.'
          ]
        },
        {
          id: 'ambassador',
          name: 'Proactividad de Recomendar (25 pts)',
          actions: [
            'Formalizar acuerdo de Growth Partner con esquema de colaboración y valor compartido.',
            'Solicitar introducción directa con 2 perfiles estratégicos de su red de alta confianza.',
            'Invitarlo como embajador de honor para dar bienvenida a nuevos miembros del ecosistema.'
          ]
        },
        {
          id: 'bi',
          name: 'Bidireccionalidad de Interacción (20 pts)',
          actions: [
            'Crear canal directo prioritario de mensajería (VIP Slack/WhatsApp) con el equipo directivo CNTXT.',
            'Establecer mesa de trabajo mensual de co-desarrollo e intercambio de oportunidades.',
            'Invitarlo como jurado o revisor crítico de nuevas líneas de servicio antes de su lanzamiento.'
          ]
        },
        {
          id: 'sandler',
          name: 'Vulnerabilidad / Sandler (10 pts)',
          actions: [
            'Sesión estratégica a puerta cerrada sobre protección patrimonial y planes de contingencia.',
            'Diálogo honesto sobre sinergias de capital, inversiones conjuntas y riesgos compartidos.',
            'Conversación abierta sobre su legado y trascendencia personal en sus decisiones de diseño.'
          ]
        },
        {
          id: 'cialdini',
          name: 'Comunidad / Cialdini (10 pts)',
          actions: [
            'Protagonismo como speaker invitado en cenas privadas o paneles selectos de CNTXT.',
            'Acceso prioritario como Insider a pre-lanzamientos y proyectos arquitectónicos.',
            'Integrarlo al Consejo Asesor Consultivo de Clientes / Partners de CNTXT.'
          ]
        },
        {
          id: 'map',
          name: 'Claridad del Mapa de Vida (10 pts)',
          actions: [
            'Diseñar la hoja de ruta integral de sus espacios a 5 años (residencias, sedes, inversiones).',
            'Planificar acompañamiento estratégico para su plan de retiro o sucesión empresarial.',
            'Revisión semestral de su Mapa de Vida para anticipar necesidades antes de que surjan.'
          ]
        }
      ]
    },
    4: {
      name: 'P4: Tejido Integrado',
      shortName: 'Tejido Integrado',
      goal: 'Mantener, blindar y celebrar la simbiosis',
      criteria: [
        {
          id: 'dna',
          name: 'Afinidad Cultural & ADN (25 pts)',
          actions: [
            'Sesión anual de alineación ontológica y renovación de votos de propósito compartido.',
            'Crear juntos una iniciativa o manifiesto conjunto que marque pauta en la industria.',
            'Homenaje o reconocimiento de legado como referente supremo de la cultura CNTXT.'
          ]
        },
        {
          id: 'ambassador',
          name: 'Proactividad de Recomendar (25 pts)',
          actions: [
            'Celebrar cena exclusiva de gratitud por su impacto como embajador nuclear de la marca.',
            'Co-diseñar eventos de networking exclusivo para su círculo íntimo de mayor confianza.',
            'Diseñar programa de referidos a medida con beneficios de impacto social o patrimonial.'
          ]
        },
        {
          id: 'bi',
          name: 'Bidireccionalidad de Interacción (20 pts)',
          actions: [
            'Mantener línea directa continua con socios fundadores de CNTXT para cualquier asunto vital.',
            'Encuentros periódicos de camaradería y celebración de logros mutuos sin agenda comercial.',
            'Consulta proactiva ante decisiones de expansión del ecosistema para solicitar su consejo.'
          ]
        },
        {
          id: 'sandler',
          name: 'Vulnerabilidad / Sandler (10 pts)',
          actions: [
            'Espacio seguro de confidencialidad y confianza total para deliberar dilemas de vida y empresa.',
            'Acompañamiento personal irrestricto en momentos de transición o retos del entorno.',
            'Diálogo de máxima autenticidad para blindar la relación ante cualquier fricción operativa.'
          ]
        },
        {
          id: 'cialdini',
          name: 'Comunidad / Cialdini (10 pts)',
          actions: [
            'Membresía vitalicia de máximo nivel en todas las experiencias y recintos CNTXT.',
            'Participación como anfitrión honorario en los hitos y galas anuales del ecosistema.',
            'Co-liderar mesas redondas privadas con otros líderes de la comunidad R.E.D.'
          ]
        },
        {
          id: 'map',
          name: 'Claridad del Mapa de Vida (10 pts)',
          actions: [
            'Custodiar activamente la visión patrimonial a largo plazo (5+ años) como aliado de vida.',
            'Integrar a las siguientes generaciones familiares en los planes de diseño y bienestar.',
            'Check-in trimestral de bienestar integral y actualización constante de su proyecto vital.'
          ]
        }
      ]
    }
  };

  function getContactPulse(client) {
    const p = client.pulso_vital || client.pulse;
    if (p && PULSE_DEFINITIONS[p]) return PULSE_DEFINITIONS[p];
    return PULSE_DEFINITIONS[1];
  }

  async function setContactPulse(clientId, level) {
    updateSyncStatusIndicator('saving');
    try {
      await ApiService.updateContacto(clientId, { pulso_vital: level });
      const target = contactsData.find(c => c.id === clientId);
      if (target) target.pulso_vital = level;
      updateSyncStatusIndicator('synced');
      if (activeTab === 'pulsos') renderPulsePanel();
      renderDirectory();
    } catch (err) {
      updateSyncStatusIndicator('offline');
    }
  }

  function getContactChannel(client) {
    const raw = client.canal_entrada || client.channel;
    if (raw && CHANNEL_MAP[raw]) {
      return { key: raw, name: CHANNEL_MAP[raw] };
    }
    return null;
  }

  async function setContactChannel(clientId, channelKey) {
    updateSyncStatusIndicator('saving');
    try {
      await ApiService.updateContacto(clientId, { canal_entrada: channelKey || 'directo' });
      const target = contactsData.find(c => c.id === clientId);
      if (target) target.canal_entrada = channelKey;
      updateSyncStatusIndicator('synced');
      renderDirectory();
      if (selectedContact && selectedContact.id === clientId) {
        renderModalChannels(selectedContact);
      }
    } catch (err) {
      updateSyncStatusIndicator('offline');
    }
  }

  function getContactPersona(client) {
    return client.tipo_persona || client.persona || 'natural';
  }

  async function setContactPersona(clientId, personaVal) {
    updateSyncStatusIndicator('saving');
    try {
      await ApiService.updateContacto(clientId, { tipo_persona: personaVal || 'natural' });
      const target = contactsData.find(c => c.id === clientId);
      if (target) target.tipo_persona = personaVal;
      updateSyncStatusIndicator('synced');
      renderDirectory();
      if (selectedContact && (selectedContact.id === clientId || String(selectedContact.id) === String(clientId))) {
        selectedContact.tipo_persona = personaVal;
        if (modalPersonaDisplay) modalPersonaDisplay.textContent = getContactPersonaLabel(personaVal);
      }
    } catch (err) {
      updateSyncStatusIndicator('offline');
    }
  }

  function getContactPersonaLabel(personaKey) {
    if (personaKey === 'juridica' || personaKey === 'b2b') return 'Persona Jurídica (B2B)';
    return 'Persona Natural (B2C)';
  }

  function getContactTag(client) {
    const raw = client.tipo_relacion || client.tag || 'prospecto';
    if (TAG_MAP[raw]) {
      return { key: raw, name: TAG_MAP[raw] };
    }
    return { key: 'prospecto', name: 'Prospecto' };
  }

  async function setContactTag(clientId, tagKey) {
    if (!TAG_MAP[tagKey]) return;
    updateSyncStatusIndicator('saving');
    try {
      await ApiService.updateContacto(clientId, { tipo_relacion: tagKey });
      const target = contactsData.find(c => c.id === clientId);
      if (target) target.tipo_relacion = tagKey;
      updateSyncStatusIndicator('synced');
      renderDirectory();
      if (selectedContact && selectedContact.id === clientId) {
        renderModalTags(selectedContact);
      }
      if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();
    } catch (err) {
      updateSyncStatusIndicator('offline');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM REFERENCES
  // ═══════════════════════════════════════════════════════════════════
  const clientGrid = document.getElementById('client-grid');
  const searchInput = document.getElementById('search-input');
  const clientCountEl = document.getElementById('client-count');
  const activeTagCountEl = document.getElementById('active-tag-count');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tagFilterBtns = document.querySelectorAll('.tag-filter-btn');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnOpenAddModal = document.getElementById('btn-open-add-modal');

  // Pagination DOM
  const paginationBar = document.getElementById('pagination-bar');
  const paginationInfo = document.getElementById('pagination-info');
  const btnPagePrev = document.getElementById('btn-page-prev');
  const btnPageNext = document.getElementById('btn-page-next');

  // Multi-Select Bulk Actions DOM
  const bulkActionBar = document.getElementById('bulk-action-bar');
  const bulkSelectedCount = document.getElementById('bulk-selected-count');
  const btnSelectAll = document.getElementById('btn-select-all');
  const btnDeselectAll = document.getElementById('btn-deselect-all');
  const bulkTagTrigger = document.getElementById('bulk-tag-trigger');
  const bulkTagTriggerLabel = document.getElementById('bulk-tag-trigger-label');
  const bulkTagDropdown = document.getElementById('bulk-tag-dropdown');
  const btnBulkClearTags = document.getElementById('btn-bulk-clear-tags');
  const btnBulkTagHeader = document.getElementById('btn-bulk-tag-header');
  const headerBulkDropdown = document.getElementById('header-bulk-dropdown');
  const headerBulkCount = document.getElementById('header-bulk-count');
  const headerBulkSelHint = document.getElementById('header-bulk-sel-hint');
  const btnBulkChannelHeader = document.getElementById('btn-bulk-channel-header');
  const headerBulkChannelDropdown = document.getElementById('header-bulk-channel-dropdown');
  const headerBulkChannelCount = document.getElementById('header-bulk-channel-count');
  const headerBulkChannelSelHint = document.getElementById('header-bulk-channel-sel-hint');
  const selectedIds = new Set();

  // Detail Modal DOM
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalAvatar = document.getElementById('modal-avatar');
  const modalName = document.getElementById('modal-name');
  const modalEmpresa = document.getElementById('modal-company') || document.getElementById('modal-empresa');
  const modalOficio = document.getElementById('modal-oficio');
  const modalCiudad = document.getElementById('modal-ciudad');
  const modalFname = document.getElementById('modal-fname');
  const modalSname = document.getElementById('modal-sname');
  const modalLname = document.getElementById('modal-lname');
  const modalPhone = document.getElementById('modal-phone');
  const modalEmail = document.getElementById('modal-email');
  const modalPersonaDisplay = document.getElementById('modal-persona-display');
  const modalMapsLink = document.getElementById('modal-maps-link');
  const modalBtnWapp = document.getElementById('modal-wa-btn') || document.getElementById('modal-btn-wapp');
  const modalBtnCall = document.getElementById('modal-btn-call');
  const modalBtnMail = document.getElementById('modal-btn-mail');
  const modalTagContainer = document.getElementById('modal-tag-options-container') || document.getElementById('modal-tag-container');
  const modalPulseContainer = document.getElementById('modal-pulse-container');
  const modalChannelContainer = document.getElementById('modal-channel-options-container') || document.getElementById('modal-channel-container');
  const modalPhaseContainer = document.getElementById('modal-phase-container');
  const modalNotesInput = document.getElementById('modal-notes-input');
  const modalSaveNotes = document.getElementById('modal-save-notes');

  // Edit Mode DOM
  const btnToggleEditMode = document.getElementById('btn-toggle-edit-mode');
  const editToggleLabel = document.getElementById('edit-toggle-label');
  const modalViewMode = document.getElementById('modal-view-details') || document.getElementById('modal-view-mode');
  const modalEditMode = document.getElementById('modal-edit-details') || document.getElementById('modal-edit-mode');
  const editInputNome = document.getElementById('edit-input-nome');
  const editSelectEmpresa = document.getElementById('edit-select-empresa');
  const editInputOficio = document.getElementById('edit-input-oficio');
  const editInputCiudad = document.getElementById('edit-input-ciudad');
  const editInputFname = document.getElementById('edit-input-fname');
  const editInputSname = document.getElementById('edit-input-sname');
  const editInputLname = document.getElementById('edit-input-lname');
  const editInputPhone = document.getElementById('edit-input-phone');
  const editInputEmail = document.getElementById('edit-input-email');
  const editMapsPreviewBtn = document.getElementById('edit-maps-preview-btn');

  // Persona Toggle in Edit Mode
  let currentEditPersona = 'natural';
  const btnPersonaNone = document.getElementById('edit-persona-none');
  const btnPersonaB2c = document.getElementById('edit-persona-b2c');
  const btnPersonaB2b = document.getElementById('edit-persona-b2b');

  function setEditPersona(val) {
    currentEditPersona = val;
    [btnPersonaNone, btnPersonaB2c, btnPersonaB2b].filter(Boolean).forEach(b => b.classList.remove('active'));
    if (val === 'b2b' || val === 'juridica') {
      if (btnPersonaB2b) btnPersonaB2b.classList.add('active');
    } else if (val === 'b2c' || val === 'natural') {
      if (btnPersonaB2c) btnPersonaB2c.classList.add('active');
    } else {
      if (btnPersonaNone) btnPersonaNone.classList.add('active');
    }
  }

  if (btnPersonaNone) btnPersonaNone.addEventListener('click', () => setEditPersona(''));
  if (btnPersonaB2c) btnPersonaB2c.addEventListener('click', () => setEditPersona('natural'));
  if (btnPersonaB2b) btnPersonaB2b.addEventListener('click', () => setEditPersona('juridica'));

  if (editMapsPreviewBtn) {
    editMapsPreviewBtn.addEventListener('click', () => {
      const city = editInputCiudad ? editInputCiudad.value.trim() : '';
      if (city) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(city)}`, '_blank');
      }
    });
  }

  // Add Contact Modal DOM
  const addModalOverlay = document.getElementById('add-modal-overlay');
  const addModalClose = document.getElementById('add-modal-close');
  const btnCancelAdd = document.getElementById('btn-cancel-add');
  const btnSaveNewContact = document.getElementById('btn-save-new-contact');
  const addInputNome = document.getElementById('add-input-nome');
  const addSelectEmpresa = document.getElementById('add-select-empresa');
  const addInputOficio = document.getElementById('add-input-oficio');
  const addInputCiudad = document.getElementById('add-input-ciudad');
  const addInputFname = document.getElementById('add-input-fname');
  const addInputSname = document.getElementById('add-input-sname');
  const addInputLname = document.getElementById('add-input-lname');
  const addInputPhone = document.getElementById('add-input-phone');
  const addInputEmail = document.getElementById('add-input-email');
  const addSelectTag = document.getElementById('add-select-tag');
  let selectedNewContactTag = 'cliente_gold';
  let newContactPersona = 'natural';

  // ═══════════════════════════════════════════════════════════════════
  // INITIAL DATA LOADER (DJANGO REST API)
  // ═══════════════════════════════════════════════════════════════════
  async function loadInitialData() {
    updateSyncStatusIndicator('saving');
    try {
      const data = await ApiService.getInitialData();

      // Adaptar Contactos
      contactsData = (data.contactos || []).map(c => ({
        id: c.id,
        nome: c.nombre_completo,
        nombre_completo: c.nombre_completo,
        primer_nombre: c.primer_nombre || '',
        segundo_nombre: c.segundo_nombre || '',
        apellidos: c.apellidos || '',
        numero: c.telefono || '',
        telefono: c.telefono || '',
        email: c.email || '',
        ciudad: c.ciudad || '',
        pais: c.pais || 'Colombia',
        rol: c.rol || '',
        oficio: c.rol || '',
        empresa: c.empresa_nombre || '',
        empresa_id: c.empresa,
        pulso_vital: c.pulso_vital || 1,
        fase_red: c.fase_red || 'R',
        tipo_relacion: c.tipo_relacion || 'prospecto',
        tipo_persona: c.tipo_persona || 'natural',
        canal_entrada: c.canal_entrada || 'directo',
        notas: c.notas || '',
        created_at: c.created_at
      }));

      // Adaptar Empresas
      masterEmpresas = (data.empresas || []).map(e => ({
        id: e.id,
        nome: e.nombre,
        nombre: e.nombre,
        sector: e.sector || 'General / Comercial',
        nit: e.nit || '',
        ciudad: e.ciudad || '',
        web: e.sitio_web || '',
        sitio_web: e.sitio_web || '',
        notes: e.notas || '',
        notas: e.notas || ''
      }));

      // Adaptar Proyectos
      savedProjects = (data.proyectos || []).map(p => ({
        id: p.id,
        title: p.titulo,
        flujo: p.flujo || 'b2b',
        client: p.contacto_nombre || p.empresa_nombre || '',
        contacto_id: p.contacto,
        empresa_id: p.empresa,
        amount: parseFloat(p.monto_proyectado) || 0,
        status: p.estado || 'mql',
        lineaOperativa: p.linea_operativa || '',
        categoria: p.categoria || '',
        briefUrl: p.brief_url || '',
        proposalUrl: p.proposal_url || '',
        nextStep: p.proximo_paso || '',
        dueDate: p.fecha_limite || '',
        notes: p.notas || '',
        createdAt: p.created_at
      }));

      updateSyncStatusIndicator('synced');
      console.log(`🩸 R.E.D. | Datos sincronizados: ${contactsData.length} contactos, ${masterEmpresas.length} empresas, ${savedProjects.length} proyectos.`);

      // Si no hay empresas devueltas o el array está vacío, activar respaldo
      if (!masterEmpresas || masterEmpresas.length === 0) {
        await loadEmpresasFallback();
      }

    } catch (err) {
      console.warn('Fallo al conectar con Django REST API, cargando fallback...', err);
      updateSyncStatusIndicator('offline');

      // Respaldo de contingencia desde CSV si la API no está disponible
      if (window.CNTXT_CONTACTS_CSV) {
        parseCSV(window.CNTXT_CONTACTS_CSV);
      }
      await loadEmpresasFallback();
    }

    // Doble verificación: las empresas deben existir siempre
    if (!masterEmpresas || masterEmpresas.length === 0) {
      populateMasterEmpresasFromContacts();
    }

    populateEmpresaSelects();
    renderEmpresaSectorPills();
    renderEmpresasCards();
    updateMetrics();

    syncTagFilterDropdownUI();
    renderDirectory();
    renderGlobulosPanel();
  }

  async function loadEmpresasFallback() {
    if (masterEmpresas && masterEmpresas.length > 0) return;
    try {
      const res = await fetch('data_storage.json');
      if (res.ok) {
        const ds = await res.json();
        if (ds && Array.isArray(ds.master_empresas) && ds.master_empresas.length > 0) {
          masterEmpresas = ds.master_empresas.map(e => ({
            id: e.id,
            nome: e.nome || e.nombre,
            nombre: e.nome || e.nombre,
            sector: e.sector || 'General / Comercial',
            nit: e.nit || '',
            ciudad: e.ciudad || '',
            web: e.web || e.sitio_web || '',
            sitio_web: e.web || e.sitio_web || '',
            notes: e.notes || e.notas || '',
            notas: e.notes || e.notas || ''
          }));
          console.log(`💼 Fallback R.E.D.: ${masterEmpresas.length} organizaciones empresariales cargadas desde data_storage.json.`);
          return;
        }
      }
    } catch (e) {
      console.warn('Fallback data_storage.json no disponible:', e);
    }
    populateMasterEmpresasFromContacts();
  }

  function populateMasterEmpresasFromContacts() {
    if (masterEmpresas && masterEmpresas.length > 0) return;
    const map = new Map();
    (contactsData || []).forEach((c, idx) => {
      const rawEmp = (c.empresa || '').trim();
      if (rawEmp && rawEmp.toLowerCase() !== 'particular' && rawEmp.toLowerCase() !== 'ninguna' && !map.has(rawEmp.toLowerCase())) {
        map.set(rawEmp.toLowerCase(), {
          id: c.empresa_id || `emp_${idx + 1}`,
          nome: rawEmp,
          nombre: rawEmp,
          sector: 'General / Comercial',
          nit: '',
          ciudad: c.ciudad || '',
          web: '',
          sitio_web: '',
          notes: 'Auto-registrada desde contactos R.E.D.',
          notas: 'Auto-registrada desde contactos R.E.D.'
        });
      }
    });
    if (map.size > 0) {
      masterEmpresas = Array.from(map.values());
      console.log(`💼 Fallback R.E.D.: ${masterEmpresas.length} organizaciones sintetizadas desde contactos.`);
    }
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return;
    const parsed = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(';').map(v => v.replace(/^"|"$/g, '').trim());
      if (cols.length >= 2) {
        const nome = cols[0] || 'Contacto sin nombre';
        const rawEmp = (cols[7] || '').trim();
        const hasCompany = rawEmp !== '' && rawEmp.toLowerCase() !== 'particular';
        const nomeLower = nome.toLowerCase();

        // Infer initial relationship tag
        let rel = 'prospecto';
        if (nomeLower.includes('cliente gold') || nomeLower.includes('gold')) rel = 'cliente_gold';
        else if (nomeLower.includes('cliente black') || nomeLower.includes('black')) rel = 'cliente_black';
        else if (nomeLower.includes('cliente silver') || nomeLower.includes('silver')) rel = 'cliente_silver';
        else if (nomeLower.startsWith('cliente ')) rel = 'cliente_gold';
        else if (nomeLower.includes('aliad') || nomeLower.includes('proveedor')) rel = 'aliados';
        else if (nomeLower.includes('equipo') || nomeLower.includes('cntxt') || nomeLower.includes('arquitectura')) rel = 'equipo';
        else if (nomeLower.includes('mentor') || nomeLower.includes('asesor')) rel = 'mentores';
        else if (nomeLower.includes('media') || nomeLower.includes('influencer')) rel = 'media';
        else if (nomeLower.includes('growth')) rel = 'growth';
        else if (nomeLower.includes('embajador')) rel = 'embajador';
        else if (nomeLower.includes('candidato') || nomeLower.includes('talento')) rel = 'candidatos';
        else if (nomeLower.includes('ingenier') || nomeLower.includes('topograf') || nomeLower.includes('geotecni')) rel = 'servicios_claves';
        else if (nomeLower.includes('ferret') || nomeLower.includes('acarreos') || nomeLower.includes('alquiler') || nomeLower.includes('lavadero')) rel = 'servicios_aux';
        else if (nomeLower.includes('prospecto') || nomeLower.includes('feria oriente') || nomeLower.includes('lead')) rel = 'lead';

        // Infer persona (B2B vs B2C)
        const isB2B = hasCompany || nomeLower.includes('s.a.s') || nomeLower.includes('constructora') || nomeLower.includes('inmobiliaria') || nomeLower.includes('ferreteria') || nomeLower.includes('ltda') || (cols[7] && cols[7].trim() !== '');

        parsed.push({
          id: i,
          nome: nome,
          numero: cols[1] || '',
          email: cols[2] || '',
          empresa: cols[7] || '',
          pulso_vital: ((i % 4) + 1),
          fase_red: (rel.startsWith('cliente') ? 'E' : (rel === 'aliados' || rel === 'equipo' ? 'D' : 'R')),
          tipo_relacion: rel,
          tipo_persona: isB2B ? 'juridica' : 'natural',
          canal_entrada: cols[1] ? 'whatsapp' : 'directo'
        });
      }
    }
    contactsData = parsed;
    populateMasterEmpresasFromContacts();

    const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allFilterBtn) allFilterBtn.textContent = `Todos (${contactsData.length})`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DIRECTORY RENDERING & PAGINATION
  // ═══════════════════════════════════════════════════════════════════
  function getInitials(name) {
    if (!name) return 'CN';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderDirectory() {
    if (!clientGrid) return;

    let filtered = contactsData.filter(c => {
      // 1. Búsqueda por texto
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const matchSearch = !q ||
        (c.nome && c.nome.toLowerCase().includes(q)) ||
        (c.empresa && c.empresa.toLowerCase().includes(q)) ||
        (c.rol && c.rol.toLowerCase().includes(q)) ||
        (c.oficio && c.oficio.toLowerCase().includes(q)) ||
        (c.ciudad && c.ciudad.toLowerCase().includes(q)) ||
        (c.numero && String(c.numero).includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q));

      // 2. Filtro rápido superior (.filter-btn: all, phone, email, company)
      let matchQuick = true;
      if (currentFilter === 'phone') {
        const cleanPhone = (c.numero || '').replace(/[^0-9]/g, '');
        matchQuick = cleanPhone.length >= 7;
      } else if (currentFilter === 'email') {
        matchQuick = Boolean(c.email && c.email.trim().length > 0 && c.email.includes('@'));
      } else if (currentFilter === 'company') {
        const emp = (c.empresa || '').trim();
        matchQuick = Boolean(emp.length > 0 && emp.toLowerCase() !== 'particular');
      }

      // 3. Filtro de Tipo de Persona (.persona-pill: all, b2c, b2b)
      const persona = getContactPersona(c);
      let matchPersona = true;
      if (currentPersonaFilter === 'b2c') {
        matchPersona = (persona === 'natural' || persona === 'b2c');
      } else if (currentPersonaFilter === 'b2b') {
        matchPersona = (persona === 'juridica' || persona === 'b2b');
      }

      // 4. Filtro de etiqueta de relación (Selección Múltiple)
      const tagKey = getContactTag(c).key;
      const matchTag = (selectedTagFilters.size === 0) || selectedTagFilters.has(tagKey);

      // 5. Filtro de canal
      const chan = getContactChannel(c);
      const matchChan = currentChannelFilter === 'all' || (chan && chan.key === currentChannelFilter);

      return matchSearch && matchQuick && matchPersona && matchTag && matchChan;
    });

    lastFiltered = filtered;

    if (clientCountEl) clientCountEl.textContent = filtered.length;
    if (activeTagCountEl) {
      if (selectedTagFilters.size === 0) {
        activeTagCountEl.textContent = `${filtered.length} visibles (Todos los tipos)`;
      } else if (selectedTagFilters.size === 1) {
        const onlyTag = Array.from(selectedTagFilters)[0];
        const tagName = TAG_MAP[onlyTag] || onlyTag;
        activeTagCountEl.textContent = `${filtered.length} con ${tagName}`;
      } else {
        activeTagCountEl.textContent = `${filtered.length} con ${selectedTagFilters.size} tipos seleccionados`;
      }
    }

    updateTagFilterCounts();
    updateChannelFilterCounts();

    // Paginación
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const paginated = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    if (paginationBar) {
      paginationBar.style.display = totalPages > 1 ? 'flex' : 'none';
    }
    if (paginationInfo) {
      paginationInfo.textContent = `Página ${currentPage} de ${totalPages} (${filtered.length} contactos)`;
    }
    if (btnPagePrev) btnPagePrev.disabled = (currentPage <= 1);
    if (btnPageNext) btnPageNext.disabled = (currentPage >= totalPages);

    if (filtered.length === 0) {
      clientGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-muted);">
          <h3>No se encontraron relaciones</h3>
          <p>Ajusta los filtros o términos de búsqueda para encontrar registros.</p>
        </div>
      `;
      return;
    }

    clientGrid.innerHTML = paginated.map(c => {
      const pulse = getContactPulse(c);
      const tag = getContactTag(c);
      const chan = getContactChannel(c) || { key: 'directo', name: 'Contacto Directo' };
      const siguienteAccion = c.siguiente_accion || c.next_action || c.proxima_accion || '';
      const isSelected = selectedIds.has(c.id);
      const cleanPhone = (c.numero || c.telefono || '').replace(/[^0-9]/g, '');
      const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : '#';
      const ubicacion = c.ciudad || c.pais || 'Colombia';

      return `
        <div class="client-card ${isSelected ? 'selected' : ''}" data-id="${c.id}">
          <div class="card-selection-checkbox">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleSelectContact(${c.id});">
          </div>
          <div class="card-pulse-indicator" style="background: ${pulse.color};" title="Pulso: ${pulse.name}"></div>
          <div class="card-header-row">
            <div class="card-avatar" style="border-color: ${pulse.color}; color: ${pulse.color};">
              ${getInitials(c.nome || c.nombre_completo)}
            </div>
            <div class="card-title-group">
              <h4 class="card-client-name" title="${escapeHtml(c.nome || c.nombre_completo)}">${escapeHtml(c.nome || c.nombre_completo)}</h4>
              <span class="card-company-name" title="${escapeHtml(c.rol ? c.rol + ' · ' + (c.empresa || 'Particular') : (c.empresa || 'Particular'))}">
                ${escapeHtml(c.rol ? c.rol + ' · ' + (c.empresa || 'Particular') : (c.empresa || 'Particular'))}
              </span>
            </div>
          </div>
          <div class="card-tags-row">
            <span class="card-tag-badge">${escapeHtml(tag.name || 'Lazo Activo')}</span>
            <span class="card-channel-badge" title="Canal de entrada: ${escapeHtml(chan.name)}"><span class="channel-dot dot-${chan.key}"></span> ${escapeHtml(chan.name)}</span>
          </div>
          <div class="card-location-item" title="Ubicación: ${escapeHtml(ubicacion)}">
            <span class="location-icon">📍</span>
            <span class="location-text">${escapeHtml(ubicacion)}</span>
          </div>
          <div class="card-phone-item" title="${(c.numero || c.telefono) ? 'Teléfono: ' + escapeHtml(c.numero || c.telefono) : 'Sin teléfono'}">
            ${(c.numero || c.telefono) ? `<span class="meta-item">📞 ${escapeHtml(c.numero || c.telefono)}</span>` : '<span class="meta-item sin-telefono" style="color: var(--text-dim);">📞 Sin teléfono</span>'}
          </div>
          <div class="card-next-action-box ${siguienteAccion ? '' : 'empty'}" title="Próxima Acción: ${escapeHtml(siguienteAccion || 'Sin acción programada')}">
            <span class="next-action-icon">🎯</span>
            <span class="next-action-text">${escapeHtml(siguienteAccion || 'Sin acción programada')}</span>
          </div>
          <div class="card-actions-quick">
            ${cleanPhone ? `
              <a href="${waUrl}" target="_blank" onclick="event.stopPropagation();" class="card-wa-link" title="Contactar vía WhatsApp">
                💬 WhatsApp
              </a>
            ` : '<span class="card-wa-placeholder"></span>'}
            <button type="button" class="btn-card-ficha" onclick="event.stopPropagation(); window.openClientDetailModal('${c.id}');" title="Ver y gestionar relación de ${escapeHtml(c.nome || c.nombre_completo)}">
              Ver Relación
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Sincronizar checkbox de selección total del encabezado
    const headerCb = document.getElementById('header-select-all');
    if (headerCb) {
      headerCb.checked = paginated.length > 0 && paginated.every(c => selectedIds.has(c.id));
    }

    // Listener para abrir detalle de la relación
    clientGrid.querySelectorAll('.client-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('input[type="checkbox"]') || e.target.closest('a')) return;
        const id = card.dataset.id;
        const target = contactsData.find(c => String(c.id) === String(id) || Number(c.id) === Number(id));
        if (target) openDetailModal(target);
      });
    });

    clientGrid.querySelectorAll('.btn-card-ficha').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.client-card');
        const id = card ? card.dataset.id : null;
        if (id) window.openClientDetailModal(id);
      });
    });
  }

  window.openClientDetailModal = function (id) {
    if (!contactsData || contactsData.length === 0) return;
    const target = contactsData.find(c => String(c.id) === String(id) || Number(c.id) === Number(id));
    if (target) {
      openDetailModal(target);
    } else {
      console.warn('Contacto no encontrado con ID:', id);
    }
  };

  function updateBulkSelectionUI() {
    const count = selectedIds.size;
    if (headerBulkCount) {
      if (count > 0) {
        headerBulkCount.textContent = count;
        headerBulkCount.style.display = 'inline-block';
      } else {
        headerBulkCount.style.display = 'none';
      }
    }
    if (headerBulkChannelCount) {
      if (count > 0) {
        headerBulkChannelCount.textContent = count;
        headerBulkChannelCount.style.display = 'inline-block';
      } else {
        headerBulkChannelCount.style.display = 'none';
      }
    }
    if (btnBulkTagHeader) {
      btnBulkTagHeader.classList.toggle('has-selection', count > 0);
    }
    if (btnBulkChannelHeader) {
      btnBulkChannelHeader.classList.toggle('has-selection', count > 0);
    }
    if (headerBulkSelHint) {
      headerBulkSelHint.textContent = count > 0 ? `Aplicar a ${count} seleccionados` : '0 seleccionados';
    }
    if (headerBulkChannelSelHint) {
      headerBulkChannelSelHint.textContent = count > 0 ? `Aplicar a ${count} seleccionados` : '0 seleccionados';
    }
    if (bulkActionBar && bulkSelectedCount) {
      bulkSelectedCount.textContent = `${count} seleccionados`;
      bulkActionBar.style.display = count > 0 ? 'flex' : 'none';
    }
  }

  window.toggleSelectContact = function (id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);

    updateBulkSelectionUI();
    renderDirectory();
  };

  window.toggleSelectAllContacts = function () {
    const headerCb = document.getElementById('header-select-all');
    if (!lastFiltered || lastFiltered.length === 0) return;
    const shouldSelectAll = headerCb ? headerCb.checked : (selectedIds.size < lastFiltered.length);

    if (shouldSelectAll) {
      lastFiltered.forEach(c => selectedIds.add(c.id));
    } else {
      selectedIds.clear();
    }

    updateBulkSelectionUI();
    renderDirectory();
  };

  // ═══════════════════════════════════════════════════════════════════
  // MODAL DE DETALLE & EDICIÓN DE CONTACTO
  // ═══════════════════════════════════════════════════════════════════
  function openDetailModal(contact) {
    if (!contact) return;
    selectedContact = contact;
    isEditMode = false;
    toggleEditView(false);

    selectedContactPendingTag = getContactTag(contact).key;
    const curChan = getContactChannel(contact);
    selectedContactPendingChannel = curChan ? curChan.key : (contact.canal_entrada || contact.channel || 'directo');
    selectedContactPendingPulse = (getContactPulse(contact)).level;
    selectedContactPendingPhase = contact.fase_red || 'R';

    let fname = contact.primer_nombre || '';
    let sname = contact.segundo_nombre || '';
    let lname = contact.apellidos || '';

    if (!fname && !sname && !lname) {
      const parts = (contact.nome || contact.nombre_completo || '').trim().split(/\s+/);
      if (parts.length === 1) {
        fname = parts[0] || '';
      } else if (parts.length === 2) {
        fname = parts[0] || '';
        lname = parts[1] || '';
      } else if (parts.length === 3) {
        fname = parts[0] || '';
        sname = parts[1] || '';
        lname = parts[2] || '';
      } else if (parts.length >= 4) {
        fname = parts[0] || '';
        sname = parts[1] || '';
        lname = parts.slice(2).join(' ') || '';
      }
    }

    if (modalName) modalName.textContent = contact.nome || contact.nombre_completo || 'Contacto sin nombre';
    if (modalAvatar) {
      const pulse = getContactPulse(contact);
      modalAvatar.textContent = getInitials(contact.nome || contact.nombre_completo);
      modalAvatar.style.borderColor = pulse.color;
      modalAvatar.style.color = pulse.color;
    }
    const modalCompany = document.getElementById('modal-company') || modalEmpresa;
    if (modalCompany) modalCompany.textContent = contact.empresa || 'Sin Empresa Registrada';
    if (modalOficio) modalOficio.textContent = contact.oficio || contact.rol || 'Cargo no especificado';
    if (modalCiudad) modalCiudad.textContent = contact.ciudad || contact.pais || 'Colombia';
    if (modalFname) modalFname.textContent = fname || '-';
    if (modalSname) modalSname.textContent = sname || '-';
    if (modalLname) modalLname.textContent = lname || '-';
    if (modalPhone) modalPhone.textContent = (contact.numero || contact.telefono) ? `+${contact.numero || contact.telefono}` : 'No disponible';
    if (modalEmail) modalEmail.textContent = contact.email || 'No disponible';
    if (modalPersonaDisplay) modalPersonaDisplay.textContent = getContactPersonaLabel(contact.tipo_persona);
    const modalChanDisplay = document.getElementById('modal-channel-display');
    if (modalChanDisplay) {
      modalChanDisplay.textContent = curChan ? curChan.name : 'Contacto Directo / Networking';
    }
    const modalNextActionDisplay = document.getElementById('modal-next-action-display');
    if (modalNextActionDisplay) {
      modalNextActionDisplay.textContent = contact.siguiente_accion || 'Sin acción programada';
    }
    const editInputNextAction = document.getElementById('edit-input-next-action');
    if (editInputNextAction) {
      editInputNextAction.value = contact.siguiente_accion || '';
    }
    if (modalNotesInput) modalNotesInput.value = contact.notas || '';

    if (modalMapsLink) {
      if (contact.ciudad) {
        modalMapsLink.style.display = 'inline-flex';
        modalMapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.ciudad)}`;
      } else {
        modalMapsLink.style.display = 'none';
      }
    }

    // Direct Action Links
    const cleanPhone = (contact.numero || contact.telefono || '').replace(/[^0-9]/g, '');
    const modalWa = document.getElementById('modal-wa-btn') || modalBtnWapp;
    if (modalWa) {
      modalWa.href = cleanPhone ? `https://wa.me/${cleanPhone}` : '#';
      modalWa.style.opacity = cleanPhone ? '1' : '0.5';
      modalWa.style.pointerEvents = cleanPhone ? 'auto' : 'none';
    }
    if (modalBtnCall) modalBtnCall.href = cleanPhone ? `tel:${cleanPhone}` : '#';
    if (modalBtnMail) modalBtnMail.href = contact.email ? `mailto:${contact.email}` : '#';

    renderModalTags(contact);
    renderModalPulse(contact);
    renderModalChannels(contact);

    if (modalOverlay) {
      modalOverlay.style.display = 'flex';
      void modalOverlay.offsetHeight;
      requestAnimationFrame(() => modalOverlay.classList.add('active'));
    }
  }

  function toggleEditView(enable) {
    isEditMode = enable;
    if (modalViewMode) modalViewMode.style.display = enable ? 'none' : 'grid';
    if (modalEditMode) modalEditMode.style.display = enable ? 'grid' : 'none';

    if (btnToggleEditMode) {
      btnToggleEditMode.classList.toggle('active-edit', enable);
      btnToggleEditMode.innerHTML = enable
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg> <span>Guardar Cambios</span>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> <span>Editar Datos</span>`;
    }

    // Restricción Solo Lectura: Habilitar/Deshabilitar selectores y notas según modo
    const selectTag = document.getElementById('modal-select-tag');
    if (selectTag) selectTag.disabled = !enable;

    const selectChan = document.getElementById('modal-select-channel');
    if (selectChan) selectChan.disabled = !enable;

    const pulseBtns = document.querySelectorAll('#modal-pulse-options .modal-pulse-btn');
    pulseBtns.forEach(btn => {
      btn.disabled = !enable;
      btn.style.pointerEvents = enable ? 'auto' : 'none';
      btn.style.opacity = enable ? '1' : '0.85';
    });

    if (modalNotesInput) {
      modalNotesInput.readOnly = !enable;
      modalNotesInput.style.opacity = enable ? '1' : '0.85';
    }

    if (enable && selectedContact) {
      populateEmpresaSelects();
      const fullName = selectedContact.nome || selectedContact.nombre_completo || '';
      
      let fname = selectedContact.primer_nombre || '';
      let sname = selectedContact.segundo_nombre || '';
      let lname = selectedContact.apellidos || '';

      if (!fname && !sname && !lname) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) {
          fname = parts[0] || '';
        } else if (parts.length === 2) {
          fname = parts[0] || '';
          lname = parts[1] || '';
        } else if (parts.length === 3) {
          fname = parts[0] || '';
          sname = parts[1] || '';
          lname = parts[2] || '';
        } else if (parts.length >= 4) {
          fname = parts[0] || '';
          sname = parts[1] || '';
          lname = parts.slice(2).join(' ') || '';
        }
      }

      if (editInputNome) editInputNome.value = fullName;
      if (editInputFname) editInputFname.value = fname;
      if (editInputSname) editInputSname.value = sname;
      if (editInputLname) editInputLname.value = lname;
      if (editSelectEmpresa) editSelectEmpresa.value = selectedContact.empresa || '';
      if (editInputOficio) editInputOficio.value = selectedContact.oficio || selectedContact.rol || '';
      if (editInputCiudad) editInputCiudad.value = selectedContact.ciudad || '';
      if (editInputPhone) editInputPhone.value = selectedContact.numero || selectedContact.telefono || '';
      if (editInputEmail) editInputEmail.value = selectedContact.email || '';

      setEditPersona(selectedContact.tipo_persona || 'natural');
    } else if (!enable && selectedContact) {
      // Refrescar datos en vista solo lectura
      const fullName = selectedContact.nome || selectedContact.nombre_completo || 'Contacto sin nombre';
      let fname = selectedContact.primer_nombre || '';
      let sname = selectedContact.segundo_nombre || '';
      let lname = selectedContact.apellidos || '';

      if (!fname && !sname && !lname) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length === 1) {
          fname = parts[0] || '';
        } else if (parts.length === 2) {
          fname = parts[0] || '';
          lname = parts[1] || '';
        } else if (parts.length === 3) {
          fname = parts[0] || '';
          sname = parts[1] || '';
          lname = parts[2] || '';
        } else if (parts.length >= 4) {
          fname = parts[0] || '';
          sname = parts[1] || '';
          lname = parts.slice(2).join(' ') || '';
        }
      }

      if (modalName) modalName.textContent = fullName;
      const modalCompany = document.getElementById('modal-company') || modalEmpresa;
      if (modalCompany) modalCompany.textContent = selectedContact.empresa || 'Sin Empresa Registrada';
      if (modalOficio) modalOficio.textContent = selectedContact.oficio || selectedContact.rol || 'Cargo no especificado';
      if (modalCiudad) modalCiudad.textContent = selectedContact.ciudad || selectedContact.pais || 'Colombia';
      if (modalFname) modalFname.textContent = fname || '-';
      if (modalSname) modalSname.textContent = sname || '-';
      if (modalLname) modalLname.textContent = lname || '-';
      if (modalPhone) modalPhone.textContent = (selectedContact.numero || selectedContact.telefono) ? `+${selectedContact.numero || selectedContact.telefono}` : 'No disponible';
      if (modalEmail) modalEmail.textContent = selectedContact.email || 'No disponible';
      if (modalPersonaDisplay) modalPersonaDisplay.textContent = getContactPersonaLabel(selectedContact.tipo_persona);
      if (modalNotesInput) modalNotesInput.value = selectedContact.notas || '';

      if (modalAvatar) {
        const pulse = getContactPulse(selectedContact);
        modalAvatar.textContent = getInitials(fullName);
        modalAvatar.style.borderColor = pulse.color;
        modalAvatar.style.color = pulse.color;
      }
    }
  }

  if (btnToggleEditMode) {
    btnToggleEditMode.addEventListener('click', () => {
      if (!isEditMode) {
        toggleEditView(true);
      } else {
        handleSaveContact();
      }
    });
  }

  let selectedContactPendingTag = null;
  let selectedContactPendingChannel = null;
  let selectedContactPendingPulse = null;
  let selectedContactPendingPhase = null;

  function renderModalTags(contact) {
    const currentTag = selectedContactPendingTag || getContactTag(contact).key;
    const selectEl = document.getElementById('modal-select-tag');
    if (selectEl) {
      selectEl.value = currentTag;
      selectEl.onchange = () => {
        selectedContactPendingTag = selectEl.value;
      };
    }
  }

  function renderModalPulse(contact) {
    const container = document.getElementById('modal-pulse-options') || document.getElementById('modal-pulse-container');
    if (!container) return;
    const currentLevel = selectedContactPendingPulse || (getContactPulse(contact)).level;
    container.querySelectorAll('[data-pulse-opt]').forEach(btn => {
      const lvl = parseInt(btn.dataset.pulseOpt, 10);
      if (lvl === currentLevel) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (!isEditMode) return; // Solo interactivo en modo edición
        container.querySelectorAll('[data-pulse-opt]').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        selectedContactPendingPulse = lvl;
        const pulseDef = PULSE_DEFINITIONS[lvl] || PULSE_DEFINITIONS[1];
        if (modalAvatar) {
          modalAvatar.style.borderColor = pulseDef.color;
          modalAvatar.style.color = pulseDef.color;
        }
      };
    });
  }

  function renderModalChannels(contact) {
    const current = getContactChannel(contact);
    const curKey = selectedContactPendingChannel || (current ? current.key : (contact.canal_entrada || contact.channel || 'directo'));
    const selectEl = document.getElementById('modal-select-channel');
    if (selectEl) {
      selectEl.value = curKey;
      selectEl.onchange = () => {
        selectedContactPendingChannel = selectEl.value;
      };
    }
  }

  window.updateContactTag = function (key) {
    selectedContactPendingTag = key;
    const selectEl = document.getElementById('modal-select-tag');
    if (selectEl) selectEl.value = key;
    if (selectedContact) renderModalTags(selectedContact);
  };
  window.updateContactPulseLevel = function (lvl) {
    selectedContactPendingPulse = lvl;
    if (selectedContact) renderModalPulse(selectedContact);
  };
  window.updateContactChannelKey = function (key) {
    selectedContactPendingChannel = key;
    const selectEl = document.getElementById('modal-select-channel');
    if (selectEl) selectEl.value = key;
    if (selectedContact) renderModalChannels(selectedContact);
  };

  // Helper to safely close detail modal
  function closeDetailModal() {
    if (isEditMode) toggleEditView(false);
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
      setTimeout(() => { modalOverlay.style.display = 'none'; }, 250);
    }
  }

  // Guardar Edición de Contacto a Django REST API y memoria (PATCH /api/contactos/{id}/)
  async function handleSaveContact() {
    if (!selectedContact) return;

    const fname = editInputFname ? editInputFname.value.trim() : (selectedContact.primer_nombre || '');
    const sname = editInputSname ? editInputSname.value.trim() : (selectedContact.segundo_nombre || '');
    const lname = editInputLname ? editInputLname.value.trim() : (selectedContact.apellidos || '');
    let fullName = editInputNome ? editInputNome.value.trim() : '';

    if (!fullName && (fname || sname || lname)) {
      fullName = [fname, sname, lname].filter(Boolean).join(' ').trim();
    }
    if (!fullName) fullName = selectedContact.nome || selectedContact.nombre_completo || '';

    const updatedCity = editInputCiudad ? editInputCiudad.value.trim() : (selectedContact.ciudad || '');

    // Normalizar tipo_persona
    let tipoPersona = currentEditPersona || selectedContact.tipo_persona || 'natural';
    if (tipoPersona === 'b2c') tipoPersona = 'natural';
    if (tipoPersona === 'b2b') tipoPersona = 'juridica';
    if (tipoPersona !== 'natural' && tipoPersona !== 'juridica') tipoPersona = 'natural';

    const modalSelectTag = document.getElementById('modal-select-tag');
    const modalSelectChannel = document.getElementById('modal-select-channel');
    const tipoRelacion = (modalSelectTag ? modalSelectTag.value : selectedContactPendingTag) || selectedContactPendingTag || selectedContact.tipo_relacion || selectedContact.tag || 'prospecto';
    const canalEntrada = (modalSelectChannel ? modalSelectChannel.value : selectedContactPendingChannel) || selectedContactPendingChannel || selectedContact.canal_entrada || selectedContact.channel || 'directo';
    const pulsoVital = selectedContactPendingPulse || selectedContact.pulso_vital || 1;
    const faseRed = (selectedContactPendingPhase || selectedContact.fase_red || 'R').toUpperCase();
    const notasText = modalNotesInput ? modalNotesInput.value : (selectedContact.notas || '');

    const editInputNextAction = document.getElementById('edit-input-next-action');
    const siguienteAccion = editInputNextAction ? editInputNextAction.value.trim() : (selectedContact.siguiente_accion || '');

    const selectedEmpresaName = editSelectEmpresa ? editSelectEmpresa.value.trim() : '';
    let empresaId = null;
    if (selectedEmpresaName) {
      const emp = masterEmpresas.find(e => (e.nome || e.nombre || '').toLowerCase() === selectedEmpresaName.toLowerCase());
      if (emp) empresaId = emp.id;
    } else if (selectedContact.empresa_id) {
      empresaId = selectedContact.empresa_id;
    }

    const updatedFields = {
      nombre_completo: fullName,
      primer_nombre: fname,
      segundo_nombre: sname,
      apellidos: lname,
      rol: editInputOficio ? editInputOficio.value.trim() : (selectedContact.rol || selectedContact.oficio || ''),
      ciudad: updatedCity,
      telefono: editInputPhone ? editInputPhone.value.replace(/[^0-9]/g, '') : (selectedContact.numero || selectedContact.telefono || ''),
      email: editInputEmail ? editInputEmail.value.trim() : (selectedContact.email || ''),
      tipo_persona: tipoPersona,
      tipo_relacion: tipoRelacion,
      canal_entrada: canalEntrada,
      pulso_vital: pulsoVital,
      fase_red: faseRed,
      siguiente_accion: siguienteAccion,
      notas: notasText,
      empresa: empresaId
    };

    // 1. Actualización Inmediata en Memoria & UI
    selectedContact.nome = fullName;
    selectedContact.nombre_completo = fullName;
    selectedContact.primer_nombre = fname;
    selectedContact.segundo_nombre = sname;
    selectedContact.apellidos = lname;
    selectedContact.rol = updatedFields.rol;
    selectedContact.oficio = updatedFields.rol;
    selectedContact.ciudad = updatedCity;
    selectedContact.numero = updatedFields.telefono;
    selectedContact.telefono = updatedFields.telefono;
    selectedContact.email = updatedFields.email;
    selectedContact.tipo_persona = updatedFields.tipo_persona;
    selectedContact.tipo_relacion = updatedFields.tipo_relacion;
    selectedContact.tag = updatedFields.tipo_relacion;
    selectedContact.canal_entrada = updatedFields.canal_entrada;
    selectedContact.channel = updatedFields.canal_entrada;
    selectedContact.pulso_vital = pulsoVital;
    selectedContact.fase_red = faseRed;
    selectedContact.siguiente_accion = siguienteAccion;
    selectedContact.notas = notasText;
    if (selectedEmpresaName) {
      selectedContact.empresa = selectedEmpresaName;
    } else if (editSelectEmpresa && !selectedEmpresaName) {
      selectedContact.empresa = '';
    }
    if (empresaId) selectedContact.empresa_id = empresaId;

    const idx = contactsData.findIndex(c => String(c.id) === String(selectedContact.id) || Number(c.id) === Number(selectedContact.id));
    if (idx !== -1) {
      contactsData[idx] = { ...contactsData[idx], ...selectedContact };
    }

    // Cambiar de inmediato a vista solo lectura con datos actualizados (permaneciendo en la ficha)
    toggleEditView(false);

    // Refrescar vistas del directorio y paneles
    renderDirectory();
    updateMetrics();
    if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();
    if (typeof renderPulsePanel === 'function' && activeTab === 'pulsos') renderPulsePanel();

    showAgentToast('✅ Contacto Guardado', `"${selectedContact.nome}" actualizado correctamente.`);

    // 2. Persistir en Django API / Base de Datos
    updateSyncStatusIndicator('saving');
    try {
      const res = await ApiService.updateContacto(selectedContact.id, updatedFields);
      if (res && res.empresa_nombre) {
        selectedContact.empresa = res.empresa_nombre;
      }
      updateSyncStatusIndicator('synced');
    } catch (err) {
      updateSyncStatusIndicator('offline');
      console.warn('Persistencia local confirmada (Django API offline o en espera):', err);
    }
  }

  if (modalClose) {
    modalClose.addEventListener('click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      closeDetailModal();
    });
  }

  // Click on overlay backdrop (outside card) also closes
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeDetailModal();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CREACIÓN DE NUEVA RELACIÓN (POST /api/contactos/)
  // ═══════════════════════════════════════════════════════════════════
  const btnCancelAddContact = document.getElementById('btn-cancel-add-contact');
  const addMapsPreviewBtn = document.getElementById('add-maps-preview-btn');

  function openCreateNewRelationModal() {
    if (addInputNome) addInputNome.value = '';
    if (addInputFname) addInputFname.value = '';
    if (addInputSname) addInputSname.value = '';
    if (addInputLname) addInputLname.value = '';
    if (addInputOficio) addInputOficio.value = '';
    if (addInputCiudad) addInputCiudad.value = '';
    if (addInputPhone) addInputPhone.value = '';
    if (addInputEmail) addInputEmail.value = '';

    populateEmpresaSelects();
    if (addSelectEmpresa) addSelectEmpresa.value = '';

    // Resetear selector de persona
    newContactPersona = 'natural';
    document.querySelectorAll('#add-persona-toggle .persona-toggle-btn').forEach(b => {
      if (b.id === 'add-persona-none' || b.dataset.personaVal === '') {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    // Resetear selector de tipo de relación
    selectedNewContactTag = 'cliente_gold';
    if (addSelectTag) addSelectTag.value = 'cliente_gold';

    if (addModalOverlay) {
      addModalOverlay.style.display = 'flex';
      addModalOverlay.classList.add('active');
    }
  }

  function closeCreateNewRelationModal() {
    if (addModalOverlay) {
      addModalOverlay.style.display = 'none';
      addModalOverlay.classList.remove('active');
    }
  }

  if (btnOpenAddModal) {
    btnOpenAddModal.addEventListener('click', openCreateNewRelationModal);
  }

  if (addModalClose) {
    addModalClose.addEventListener('click', closeCreateNewRelationModal);
  }

  if (btnCancelAddContact) {
    btnCancelAddContact.addEventListener('click', closeCreateNewRelationModal);
  }

  if (addModalOverlay) {
    addModalOverlay.addEventListener('click', (e) => {
      if (e.target === addModalOverlay) {
        closeCreateNewRelationModal();
      }
    });
  }

  // Previsualizar mapa en Google Maps
  if (addMapsPreviewBtn && addInputCiudad) {
    addMapsPreviewBtn.addEventListener('click', () => {
      const query = addInputCiudad.value.trim();
      if (query) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
      } else {
        showAgentToast('📍 Ubicación', 'Ingresa una ciudad o país para verla en el mapa.');
      }
    });
  }

  // Sincronización automática entre Nombre Completo y Nombres/Apellidos
  if (addInputNome) {
    addInputNome.addEventListener('input', () => {
      const parts = addInputNome.value.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        if (addInputFname) addInputFname.value = '';
        if (addInputSname) addInputSname.value = '';
        if (addInputLname) addInputLname.value = '';
      } else if (parts.length === 1) {
        if (addInputFname) addInputFname.value = parts[0];
        if (addInputSname) addInputSname.value = '';
        if (addInputLname) addInputLname.value = '';
      } else if (parts.length === 2) {
        if (addInputFname) addInputFname.value = parts[0];
        if (addInputSname) addInputSname.value = '';
        if (addInputLname) addInputLname.value = parts[1];
      } else if (parts.length === 3) {
        if (addInputFname) addInputFname.value = parts[0];
        if (addInputSname) addInputSname.value = parts[1];
        if (addInputLname) addInputLname.value = parts[2];
      } else {
        if (addInputFname) addInputFname.value = parts[0];
        if (addInputSname) addInputSname.value = parts[1];
        if (addInputLname) addInputLname.value = parts.slice(2).join(' ');
      }
    });
  }

  const syncFullNameFromParts = () => {
    const fn = addInputFname ? addInputFname.value.trim() : '';
    const sn = addInputSname ? addInputSname.value.trim() : '';
    const ln = addInputLname ? addInputLname.value.trim() : '';
    const combined = [fn, sn, ln].filter(Boolean).join(' ');
    if (addInputNome && combined) {
      addInputNome.value = combined;
    }
  };

  if (addInputFname) addInputFname.addEventListener('input', syncFullNameFromParts);
  if (addInputSname) addInputSname.addEventListener('input', syncFullNameFromParts);
  if (addInputLname) addInputLname.addEventListener('input', syncFullNameFromParts);

  // Selector de Tipo de Persona en el Modal de Agregar
  document.querySelectorAll('#add-persona-toggle .persona-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#add-persona-toggle .persona-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.personaVal;
      if (val === 'b2c') newContactPersona = 'natural';
      else if (val === 'b2b') newContactPersona = 'juridica';
      else newContactPersona = 'natural';
    });
  });

  // Selector de Tipo de Relación en el Modal de Agregar
  if (addSelectTag) {
    addSelectTag.addEventListener('change', () => {
      selectedNewContactTag = addSelectTag.value || 'cliente_gold';
    });
  }

  // Guardado de la Nueva Relación
  if (btnSaveNewContact) {
    btnSaveNewContact.addEventListener('click', async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      const fname = addInputFname ? addInputFname.value.trim() : '';
      const sname = addInputSname ? addInputSname.value.trim() : '';
      const lname = addInputLname ? addInputLname.value.trim() : '';
      let nome = addInputNome ? addInputNome.value.trim() : '';
      if (!nome && (fname || sname || lname)) {
        nome = [fname, sname, lname].filter(Boolean).join(' ').trim();
      }

      if (!nome) {
        showAgentToast('⚠️ Campo Requerido', 'Por favor ingresa el Nombre Completo o Primer Nombre de la relación.');
        if (addInputNome) addInputNome.focus();
        return;
      }

      const rawPhone = addInputPhone ? addInputPhone.value.trim() : '';
      const cleanPhone = rawPhone.replace(/[^0-9+]/g, '');
      const emailVal = addInputEmail ? addInputEmail.value.trim() : '';
      const oficioVal = addInputOficio ? addInputOficio.value.trim() : '';
      const selectedEmpresaName = addSelectEmpresa ? addSelectEmpresa.value.trim() : '';

      let empresaId = null;
      if (selectedEmpresaName) {
        const emp = masterEmpresas.find(e => (e.nome || e.nombre || '').toLowerCase() === selectedEmpresaName.toLowerCase());
        if (emp) empresaId = emp.id;
      }

      // Descomponer Ciudad y País
      const rawCiudad = addInputCiudad ? addInputCiudad.value.trim() : '';
      let cleanCiudad = rawCiudad;
      let cleanPais = 'Colombia';
      if (rawCiudad.includes(',')) {
        const parts = rawCiudad.split(',').map(s => s.trim());
        cleanCiudad = parts[0] || '';
        cleanPais = parts.slice(1).join(', ') || 'Colombia';
      }

      const addSelectChannel = document.getElementById('add-select-channel');
      const addInputNextAction = document.getElementById('add-input-next-action');
      const canalEntradaVal = addSelectChannel ? addSelectChannel.value : 'directo';
      const siguienteAccionVal = addInputNextAction ? addInputNextAction.value.trim() : '';
      const tagVal = (addSelectTag ? addSelectTag.value : selectedNewContactTag) || 'cliente_gold';

      const payload = {
        nombre_completo: nome,
        primer_nombre: fname,
        segundo_nombre: sname,
        apellidos: lname,
        telefono: cleanPhone,
        email: emailVal,
        ciudad: cleanCiudad,
        pais: cleanPais,
        rol: oficioVal,
        empresa: empresaId,
        tipo_relacion: tagVal,
        tipo_persona: newContactPersona || 'natural',
        canal_entrada: canalEntradaVal,
        siguiente_accion: siguienteAccionVal,
        pulso_vital: 1,
        fase_red: 'R'
      };

      updateSyncStatusIndicator('saving');

      try {
        let created;
        try {
          created = await ApiService.createContacto(payload);
        } catch (apiErr) {
          console.warn('API save fallback, persistiendo localmente:', apiErr);
          created = {
            id: Date.now(),
            ...payload,
            empresa_nombre: selectedEmpresaName
          };
        }

        const newContactObj = {
          id: created.id,
          nome: created.nombre_completo || nome,
          nombre_completo: created.nombre_completo || nome,
          primer_nombre: created.primer_nombre || fname,
          segundo_nombre: created.segundo_nombre || sname,
          apellidos: created.apellidos || lname,
          numero: created.telefono || cleanPhone,
          telefono: created.telefono || cleanPhone,
          email: created.email || emailVal,
          ciudad: created.ciudad || cleanCiudad,
          pais: created.pais || cleanPais,
          rol: created.rol || oficioVal,
          oficio: created.rol || oficioVal,
          empresa: created.empresa_nombre || selectedEmpresaName,
          empresa_id: empresaId,
          pulso_vital: created.pulso_vital || 1,
          fase_red: created.fase_red || 'R',
          tipo_relacion: created.tipo_relacion || selectedNewContactTag || 'cliente_gold',
          tag: created.tipo_relacion || selectedNewContactTag || 'cliente_gold',
          tipo_persona: created.tipo_persona || newContactPersona || 'natural',
          canal_entrada: created.canal_entrada || canalEntradaVal || 'directo',
          channel: created.canal_entrada || canalEntradaVal || 'directo',
          siguiente_accion: created.siguiente_accion || siguienteAccionVal || '',
          notas: created.notas || '',
          created_at: created.created_at || new Date().toISOString()
        };

        contactsData.unshift(newContactObj);

        updateSyncStatusIndicator('synced');
        closeCreateNewRelationModal();

        currentPage = 1;
        renderDirectory();
        updateMetrics();
        if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();
        if (typeof updateTagFilterCounts === 'function') updateTagFilterCounts();

        const tagLabel = TAG_MAP[newContactObj.tipo_relacion] || newContactObj.tipo_relacion;
        showAgentToast('✨ Nueva Relación Creada', `"${nome}" (${tagLabel}) se ha registrado exitosamente.`);
      } catch (err) {
        updateSyncStatusIndicator('offline');
        console.error('Error al guardar relación:', err);
        showAgentToast('⚠️ Error al Guardar', 'No se pudo guardar la relación. Revisa los datos.');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // GESTIÓN DE EMPRESAS (POST/PATCH /api/empresas/) & SUBTABS
  // ═══════════════════════════════════════════════════════════════════
  let currentEmpresaSector = 'all';
  let currentEmpresaSearch = '';
  const companyCountBadge = document.getElementById('company-count');

  function populateEmpresaSelects() {
    const sorted = [...masterEmpresas].sort((a, b) => (a.nome || a.nombre || '').localeCompare(b.nome || b.nombre || ''));
    let html = `<option value="">(Sin Empresa Especificada / Particular)</option>`;
    sorted.forEach(emp => {
      const empName = emp.nome || emp.nombre || '';
      html += `<option value="${escapeHtml(empName)}">${escapeHtml(empName)}${emp.sector ? ' — ' + escapeHtml(emp.sector) : ''}</option>`;
    });

    if (editSelectEmpresa) editSelectEmpresa.innerHTML = html;
    if (addSelectEmpresa) addSelectEmpresa.innerHTML = html;
  }

  function renderEmpresaSectorPills() {
    const container = document.getElementById('empresa-sector-pills');
    if (!container) return;
    const sectors = ['all', ...new Set(masterEmpresas.map(e => e.sector || 'General / Comercial'))];
    container.innerHTML = sectors.map(s => {
      let label = '';
      if (s === 'all') {
        label = `Todos los Sectores (${masterEmpresas.length})`;
      } else {
        const count = masterEmpresas.filter(e => (e.sector || 'General / Comercial') === s).length;
        label = `${escapeHtml(s)} (${count})`;
      }
      const isActive = (s === currentEmpresaSector);
      return `
        <button type="button" class="empresa-sector-pill pill-btn ${isActive ? 'active' : ''}" onclick="window.filterEmpresasBySector('${escapeHtml(s)}')">
          ${label}
        </button>
      `;
    }).join('');
  }

  window.filterEmpresasBySector = function (sector) {
    currentEmpresaSector = sector;
    renderEmpresaSectorPills();
    renderEmpresasCards();
  };

  function getPersonNombre(c) {
    return c.nome || c.nombre_completo || [c.primer_nombre, c.apellidos].filter(Boolean).join(' ') || 'Contacto sin nombre';
  }

  function getPersonOficio(c) {
    if (c.oficio && String(c.oficio).trim()) return String(c.oficio).trim();
    if (c.profesion && String(c.profesion).trim()) return String(c.profesion).trim();
    if (c.rol && String(c.rol).trim()) {
      const parts = String(c.rol).split(/[\/·|-]/);
      if (parts.length > 1 && parts[0].trim()) return parts[0].trim();
      return String(c.rol).trim();
    }
    const nameLower = (c.nome || c.nombre_completo || '').toLowerCase();
    if (nameLower.includes('ing.') || nameLower.includes('ingenier')) return 'Ingeniería';
    if (nameLower.includes('arq.') || nameLower.includes('arquitect')) return 'Arquitectura';
    if (nameLower.includes('admin') || nameLower.includes('gerente')) return 'Administración';
    if (nameLower.includes('lito') || nameLower.includes('diseñ')) return 'Diseño & Litografía';
    if (nameLower.includes('const') || nameLower.includes('obra')) return 'Construcción';
    if (nameLower.includes('asesor') || nameLower.includes('comercial')) return 'Gestión Comercial';
    const tagKey = (getContactTag(c).key || c.tipo_relacion || '').toLowerCase();
    const oficioMap = {
      equipo: 'Arquitectura / Gestión',
      aliados: 'Aliado Estratégico',
      mentores: 'Consultoría & Estrategia',
      growth: 'Desarrollo de Negocios',
      embajador: 'Relaciones Públicas',
      servicios_claves: 'Servicios Técnicos Especializados',
      servicios_aux: 'Operaciones & Logística',
      cliente_black: 'Inversión & Negocios',
      cliente_gold: 'Desarrollo Comercial',
      cliente_silver: 'Comercial',
      prospecto: 'Contacto Comercial',
      lead: 'Lead Cualificado'
    };
    return oficioMap[tagKey] || 'Profesional / Especialista';
  }

  function getPersonCargo(c) {
    if (c.cargo && String(c.cargo).trim()) return String(c.cargo).trim();
    if (c.rol && String(c.rol).trim()) {
      const parts = String(c.rol).split(/[\/·|-]/);
      if (parts.length > 1 && parts[1].trim()) return parts[1].trim();
      return String(c.rol).trim();
    }
    const nameLower = (c.nome || c.nombre_completo || '').toLowerCase();
    if (nameLower.includes('gerente') || nameLower.includes('director')) return 'Director / Gerente';
    if (nameLower.includes('lider') || nameLower.includes('jefe')) return 'Líder de Área';
    if (nameLower.includes('admin')) return 'Administrador';
    if (nameLower.includes('socio')) return 'Socio Estratégico';
    const tagKey = (getContactTag(c).key || c.tipo_relacion || '').toLowerCase();
    const cargoMap = {
      equipo: 'Miembro de Equipo',
      aliados: 'Representante de Alianza',
      mentores: 'Mentor Principal',
      growth: 'Growth Partner',
      embajador: 'Embajador Clave',
      servicios_claves: 'Ingeniero / Consultor',
      servicios_aux: 'Coordinador Operativo',
      cliente_black: 'Titular / Inversionista Black',
      cliente_gold: 'Titular / Inversionista Gold',
      cliente_silver: 'Titular / Contacto Directo',
      prospecto: 'Decisor Comercial',
      lead: 'Contacto Clave'
    };
    return cargoMap[tagKey] || 'Líder / Contacto';
  }

  window.openEditEmpresaById = function (empId) {
    const target = masterEmpresas.find(emp => String(emp.id) === String(empId));
    if (target) openEditEmpresaModal(target);
  };

  window.openClientDetailModal = function (contactId) {
    const target = contactsData.find(c => String(c.id) === String(contactId) || Number(c.id) === Number(contactId));
    if (target) {
      openDetailModal(target);
    }
  };

  function cleanForMatch(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(s\.a\.s\.?|sas|s\.a\.?|ltda\.?|inc\.?)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  window.clearEmpresaFilters = function () {
    currentEmpresaSector = 'all';
    currentEmpresaSearch = '';
    const input = document.getElementById('search-empresa-input');
    if (input) input.value = '';
    renderEmpresaSectorPills();
    renderEmpresasCards();
  };

  function renderEmpresasCards() {
    const grid = document.getElementById('empresa-cards-grid') || document.getElementById('empresas-grid');
    if (companyCountBadge) {
      companyCountBadge.textContent = masterEmpresas.length;
    }

    if (!grid) return;

    let filtered = masterEmpresas;
    if (currentEmpresaSector !== 'all') {
      filtered = filtered.filter(e => (e.sector || 'General / Comercial').trim() === currentEmpresaSector.trim());
    }
    if (currentEmpresaSearch) {
      const q = currentEmpresaSearch.toLowerCase();
      filtered = filtered.filter(e =>
        (e.nome || e.nombre || '').toLowerCase().includes(q) ||
        (e.sector || '').toLowerCase().includes(q) ||
        (e.ciudad || '').toLowerCase().includes(q) ||
        (e.nit || '').toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 24px; color: var(--text-muted); background: rgba(14, 9, 18, 0.55); border-radius: var(--radius-lg); border: 1px dashed rgba(255, 255, 255, 0.12);">
          <div style="font-size: 32px; margin-bottom: 12px;">🏢</div>
          <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">No se encontraron empresas con el filtro actual</div>
          <div style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 20px;">Hay un total de ${masterEmpresas.length} organizaciones registradas en el sistema.</div>
          <button type="button" class="btn-save-edit" onclick="window.clearEmpresaFilters()" style="padding: 10px 24px; font-size: 12px; margin: 0 auto; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
            <span>🔄</span> Ver Todas las Empresas (${masterEmpresas.length})
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(emp => {
      const empName = emp.nome || emp.nombre || 'Empresa';
      const initial = empName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 2).toUpperCase() || 'EM';
      const empClean = cleanForMatch(empName);

      const relatedContacts = contactsData.filter(c => {
        if (c.empresa_id && emp.id && String(c.empresa_id) === String(emp.id)) return true;
        const cEmp = (c.empresa || '').trim();
        if (!cEmp) return false;
        if (cEmp.toLowerCase() === empName.toLowerCase()) return true;
        const cClean = cleanForMatch(cEmp);
        if (cClean && empClean && (cClean === empClean || (cClean.length > 4 && empClean.length > 4 && (cClean.includes(empClean) || empClean.includes(cClean))))) return true;
        return false;
      });

      const contactsHtml = relatedContacts.length > 0 ? relatedContacts.map(c => {
        const pulse = getContactPulse(c);
        const pName = getPersonNombre(c);
        const pOficio = getPersonOficio(c);
        const pCargo = getPersonCargo(c);
        const pInitials = getInitials(pName);

        return `
          <div class="empresa-person-card" onclick="event.stopPropagation(); window.openClientDetailModal('${c.id}');" title="Ver relación detallada de ${escapeHtml(pName)}">
            <div class="empresa-person-avatar" style="border-color: ${pulse.color}; color: ${pulse.color};">
              ${pInitials}
            </div>
            <div class="empresa-person-body">
              <div class="empresa-person-name">
                <span class="p-name-text">${escapeHtml(pName)}</span>
                <span class="empresa-person-pulse-dot" style="background: ${pulse.color};" title="Pulso: ${pulse.name}"></span>
              </div>
              <div class="empresa-person-meta-row">
                <span class="empresa-meta-tag" title="Oficio: ${escapeHtml(pOficio)}">
                  <span class="empresa-meta-label">Oficio:</span>
                  <span class="empresa-meta-value">${escapeHtml(pOficio)}</span>
                </span>
                <span class="empresa-meta-sep">·</span>
                <span class="empresa-meta-tag" title="Cargo: ${escapeHtml(pCargo)}">
                  <span class="empresa-meta-label">Cargo:</span>
                  <span class="empresa-meta-value">${escapeHtml(pCargo)}</span>
                </span>
              </div>
            </div>
            <span class="empresa-person-arrow" title="Ver ficha">→</span>
          </div>
        `;
      }).join('') : `
        <div class="empresa-no-contacts">
          <span>👥 Sin personas vinculadas registradas aún</span>
        </div>
      `;

      return `
        <div class="empresa-card-slot">
          <div class="empresa-card" data-id="${emp.id}">
            <div class="empresa-card-header">
              <div class="empresa-avatar">${initial}</div>
              <div class="empresa-info-main">
                <div class="empresa-name-title" title="${escapeHtml(empName)}">${escapeHtml(empName)}</div>
                <div class="empresa-sector-tag">${escapeHtml(emp.sector || 'General / Comercial')}</div>
              </div>
            </div>
            <div class="empresa-card-body">
              ${emp.ciudad ? `<div class="empresa-detail-row"><span>📍</span> <span>${escapeHtml(emp.ciudad)}</span></div>` : ''}
              ${emp.nit ? `<div class="empresa-detail-row"><span>📄</span> <span>NIT: ${escapeHtml(emp.nit)}</span></div>` : ''}
              ${emp.web || emp.sitio_web ? `<div class="empresa-detail-row"><span>🌐</span> <a href="${escapeHtml(emp.web || emp.sitio_web)}" target="_blank" onclick="event.stopPropagation();">${escapeHtml(emp.web || emp.sitio_web)}</a></div>` : ''}
              <div class="empresa-footer-row">
                <span class="empresa-linked-count">👥 ${relatedContacts.length} relación${relatedContacts.length === 1 ? '' : 'es'} vinculada${relatedContacts.length === 1 ? '' : 's'}</span>
                <span class="empresa-edit-btn" onclick="event.stopPropagation(); window.openEditEmpresaById('${emp.id}');" title="Editar datos de la empresa">✏️ Editar</span>
              </div>
            </div>

            <!-- Panel desplegable con las personas relacionadas (Nombre, Oficio y Cargo) -->
            <div class="empresa-contacts-expanded">
              <div class="empresa-contacts-exp-header">
                <span class="exp-title">👥 Personas Vinculadas (${relatedContacts.length})</span>
                <span class="exp-badge">${relatedContacts.length} ${relatedContacts.length === 1 ? 'persona' : 'personas'}</span>
              </div>
              <div class="empresa-contacts-exp-list">
                ${contactsHtml}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Control de apertura y hover sin opacar el resto del directorio
    const slots = grid.querySelectorAll('.empresa-card-slot');
    let hoverCloseTimer = null;
    let activeHoveredCard = null;

    function activateCard(card, slot) {
      if (hoverCloseTimer) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
      }
      if (activeHoveredCard && activeHoveredCard !== card && !activeHoveredCard.classList.contains('is-expanded')) {
        activeHoveredCard.classList.remove('is-hovered');
        const prevSlot = activeHoveredCard.closest('.empresa-card-slot');
        if (prevSlot) prevSlot.classList.remove('is-hovered-slot');
      }
      activeHoveredCard = card;
      slot.classList.add('is-hovered-slot');
      card.classList.add('is-hovered');
    }

    function deactivateCard(card, slot, e) {
      if (!card) return;
      if (card.classList.contains('is-expanded')) return; // Permanece fijada si el usuario la expandió con clic

      if (e && e.relatedTarget) {
        if (card.contains(e.relatedTarget) || (slot && slot.contains(e.relatedTarget))) {
          return;
        }
      }
      if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
      hoverCloseTimer = setTimeout(() => {
        if (card && !card.classList.contains('is-expanded')) {
          card.classList.remove('is-hovered');
          if (slot) slot.classList.remove('is-hovered-slot');
        }
        if (activeHoveredCard === card && (!card || !card.classList.contains('is-expanded'))) {
          activeHoveredCard = null;
        }
      }, 200);
    }

    function closeAllSpotlights() {
      if (hoverCloseTimer) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
      }
      grid.querySelectorAll('.empresa-card-slot.is-hovered-slot').forEach(s => s.classList.remove('is-hovered-slot'));
      grid.querySelectorAll('.empresa-card.is-hovered, .empresa-card.is-expanded').forEach(c => {
        c.classList.remove('is-hovered');
        c.classList.remove('is-expanded');
      });
      activeHoveredCard = null;
    }

    slots.forEach(slot => {
      const card = slot.querySelector('.empresa-card');
      if (!card) return;

      slot.addEventListener('mouseenter', () => activateCard(card, slot));
      card.addEventListener('mouseenter', () => activateCard(card, slot));

      slot.addEventListener('mouseleave', (e) => deactivateCard(card, slot, e));
      card.addEventListener('mouseleave', (e) => deactivateCard(card, slot, e));

      card.addEventListener('click', (e) => {
        // Acciones específicas prioritarias: persona vinculada, enlace web o botón editar
        if (e.target.closest('.empresa-person-card') || e.target.closest('a') || e.target.closest('.empresa-edit-btn')) {
          return;
        }

        // Toggle de apertura de la tarjeta de empresa
        const isAlreadyExpanded = card.classList.contains('is-expanded');
        // Cerrar otras tarjetas abiertas previamente
        grid.querySelectorAll('.empresa-card.is-expanded').forEach(c => {
          if (c !== card) {
            c.classList.remove('is-expanded');
            c.classList.remove('is-hovered');
            const otherSlot = c.closest('.empresa-card-slot');
            if (otherSlot) otherSlot.classList.remove('is-hovered-slot');
          }
        });

        if (isAlreadyExpanded) {
          card.classList.remove('is-expanded');
          card.classList.remove('is-hovered');
          slot.classList.remove('is-hovered-slot');
        } else {
          card.classList.add('is-expanded');
          card.classList.add('is-hovered');
          slot.classList.add('is-hovered-slot');
        }
      });
    });

    if (!grid._hoverSpotlightInit) {
      grid._hoverSpotlightInit = true;

      grid.addEventListener('mouseleave', (e) => {
        if (activeHoveredCard && e.relatedTarget && activeHoveredCard.contains(e.relatedTarget)) {
          return;
        }
        if (activeHoveredCard && !activeHoveredCard.classList.contains('is-expanded')) {
          deactivateCard(activeHoveredCard, activeHoveredCard.closest('.empresa-card-slot'), e);
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.empresa-card-slot')) {
          grid.querySelectorAll('.empresa-card.is-expanded').forEach(c => {
            c.classList.remove('is-expanded');
            c.classList.remove('is-hovered');
            const s = c.closest('.empresa-card-slot');
            if (s) s.classList.remove('is-hovered-slot');
          });
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllSpotlights();
      });
    }
  }

  // Subtabs Switcher Logic (Personas vs Empresas)
  const btnSubtabPersonas = document.getElementById('btn-subtab-personas');
  const btnSubtabEmpresas = document.getElementById('btn-subtab-empresas');
  const dirPersonasView = document.getElementById('dir-personas-view');
  const dirEmpresasView = document.getElementById('dir-empresas-view');
  const personasHeaderActions = document.getElementById('personas-header-actions');
  const empresasHeaderActions = document.getElementById('empresas-header-actions');
  const searchEmpresaInput = document.getElementById('search-empresa-input');

  function switchDirSubtab(mode) {
    if (mode === 'empresas') {
      if (btnSubtabEmpresas) btnSubtabEmpresas.classList.add('active');
      if (btnSubtabPersonas) btnSubtabPersonas.classList.remove('active');
      if (dirPersonasView) dirPersonasView.style.display = 'none';
      if (dirEmpresasView) dirEmpresasView.style.display = 'block';
      if (personasHeaderActions) personasHeaderActions.style.display = 'none';
      if (empresasHeaderActions) empresasHeaderActions.style.display = 'flex';
      renderEmpresasCards();
    } else {
      if (btnSubtabPersonas) btnSubtabPersonas.classList.add('active');
      if (btnSubtabEmpresas) btnSubtabEmpresas.classList.remove('active');
      if (dirPersonasView) dirPersonasView.style.display = 'block';
      if (dirEmpresasView) dirEmpresasView.style.display = 'none';
      if (personasHeaderActions) personasHeaderActions.style.display = 'flex';
      if (empresasHeaderActions) empresasHeaderActions.style.display = 'none';
      renderDirectory();
    }
  }

  window.switchDirSubtab = switchDirSubtab;

  if (btnSubtabPersonas) btnSubtabPersonas.addEventListener('click', () => switchDirSubtab('personas'));
  if (btnSubtabEmpresas) btnSubtabEmpresas.addEventListener('click', () => switchDirSubtab('empresas'));

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('subtab') === 'empresas') {
      setTimeout(() => switchDirSubtab('empresas'), 50);
    }
    if (urlParams.get('tab') === 'pulsos') {
      setTimeout(() => {
        const btnPulsos = document.querySelector('.tab-btn[data-tab="pulsos"]');
        if (btnPulsos) btnPulsos.click();
      }, 100);
    }
  } catch (e) {}

  if (searchEmpresaInput) {
    searchEmpresaInput.addEventListener('input', (e) => {
      currentEmpresaSearch = e.target.value.toLowerCase().trim();
      renderEmpresasCards();
    });
  }

  // Modal Nueva / Editar Empresa
  const btnOpenAddEmpresaModal = document.getElementById('btn-open-add-empresa-modal');
  const empresaModalOverlay = document.getElementById('empresa-modal-overlay');
  const empresaModalClose = document.getElementById('empresa-modal-close');
  const btnCancelEmpresa = document.getElementById('btn-cancel-empresa');
  const btnSaveEmpresa = document.getElementById('btn-save-empresa');
  const empresaModalTitle = document.getElementById('empresa-modal-title');
  const empresaEditIdInput = document.getElementById('empresa-edit-id');
  const empresaInputNome = document.getElementById('empresa-input-nome');
  const empresaInputSector = document.getElementById('empresa-input-sector');
  const empresaInputNit = document.getElementById('empresa-input-nit');
  const empresaInputCiudad = document.getElementById('empresa-input-ciudad');
  const empresaInputWeb = document.getElementById('empresa-input-web');
  const empresaInputNotes = document.getElementById('empresa-input-notes');

  function openEmpresaModal() {
    if (empresaEditIdInput) empresaEditIdInput.value = '';
    if (empresaModalTitle) empresaModalTitle.textContent = '🏢 Nueva Relación Empresarial';
    if (empresaInputNome) empresaInputNome.value = '';
    if (empresaInputSector) empresaInputSector.value = '';
    if (empresaInputNit) empresaInputNit.value = '';
    if (empresaInputCiudad) empresaInputCiudad.value = '';
    if (empresaInputWeb) empresaInputWeb.value = '';
    if (empresaInputNotes) empresaInputNotes.value = '';
    if (empresaModalOverlay) {
      empresaModalOverlay.style.display = 'flex';
      empresaModalOverlay.classList.add('active');
    }
  }

  function openEditEmpresaModal(emp) {
    if (!emp) return;
    if (empresaEditIdInput) empresaEditIdInput.value = emp.id;
    if (empresaModalTitle) empresaModalTitle.textContent = '🏢 Editar Empresa / Organización';
    if (empresaInputNome) empresaInputNome.value = emp.nome || emp.nombre || '';
    if (empresaInputSector) empresaInputSector.value = emp.sector || '';
    if (empresaInputNit) empresaInputNit.value = emp.nit || '';
    if (empresaInputCiudad) empresaInputCiudad.value = emp.ciudad || '';
    if (empresaInputWeb) empresaInputWeb.value = emp.web || emp.sitio_web || '';
    if (empresaInputNotes) empresaInputNotes.value = emp.notas || emp.notes || '';
    if (empresaModalOverlay) {
      empresaModalOverlay.style.display = 'flex';
      empresaModalOverlay.classList.add('active');
    }
  }

  function closeEmpresaModal() {
    if (empresaModalOverlay) {
      empresaModalOverlay.style.display = 'none';
      empresaModalOverlay.classList.remove('active');
    }
  }

  if (btnOpenAddEmpresaModal) btnOpenAddEmpresaModal.addEventListener('click', openEmpresaModal);
  if (empresaModalClose) empresaModalClose.addEventListener('click', closeEmpresaModal);
  if (btnCancelEmpresa) btnCancelEmpresa.addEventListener('click', closeEmpresaModal);

  if (btnSaveEmpresa) {
    btnSaveEmpresa.addEventListener('click', async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const nombre = empresaInputNome ? empresaInputNome.value.trim() : '';
      if (!nombre) {
        alert('Por favor ingresa el nombre de la empresa u organización.');
        return;
      }

      const payload = {
        nombre: nombre,
        sector: empresaInputSector ? empresaInputSector.value.trim() || 'General / Comercial' : 'General / Comercial',
        nit: empresaInputNit ? empresaInputNit.value.trim() : '',
        ciudad: empresaInputCiudad ? empresaInputCiudad.value.trim() : '',
        sitio_web: empresaInputWeb ? empresaInputWeb.value.trim() : '',
        notas: empresaInputNotes ? empresaInputNotes.value.trim() : ''
      };

      const editId = empresaEditIdInput ? empresaEditIdInput.value.trim() : '';

      updateSyncStatusIndicator('saving');
      try {
        if (editId) {
          // PATCH /api/empresas/{id}/
          const updated = await ApiService.updateEmpresa(editId, payload);
          const idx = masterEmpresas.findIndex(e => e.id == editId);
          if (idx !== -1) {
            masterEmpresas[idx] = {
              ...masterEmpresas[idx],
              nome: updated.nombre,
              nombre: updated.nombre,
              sector: updated.sector,
              nit: updated.nit,
              ciudad: updated.ciudad,
              web: updated.sitio_web,
              sitio_web: updated.sitio_web,
              notas: updated.notas
            };
          }
          showAgentToast('🏢 Empresa Actualizada', `"${nombre}" fue actualizada exitosamente.`);
        } else {
          // POST /api/empresas/
          const created = await ApiService.createEmpresa(payload);
          masterEmpresas.unshift({
            id: created.id,
            nome: created.nombre,
            nombre: created.nombre,
            sector: created.sector,
            nit: created.nit,
            ciudad: created.ciudad,
            web: created.sitio_web,
            sitio_web: created.sitio_web,
            notas: created.notas
          });
          showAgentToast('🏢 Empresa Creada', `"${nombre}" fue registrada exitosamente.`);
        }

        updateSyncStatusIndicator('synced');
        populateEmpresaSelects();
        renderEmpresaSectorPills();
        renderEmpresasCards();
        updateMetrics();
        closeEmpresaModal();
      } catch (err) {
        updateSyncStatusIndicator('offline');
        showAgentToast('❌ Error', 'No se pudieron guardar los cambios de la empresa en Django API.', '⚠️');
        console.error('Error saving empresa:', err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // GLÓBULOS ROJOS — TORRENTE DE PROYECTOS (CRUD /api/proyectos/)
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // GLÓBULOS ROJOS — 4 FLUJOS DE PROYECTOS (B2B, B2C, SELECT, SHOWROOM)
  // ═══════════════════════════════════════════════════════════════════
  const PROJECT_FLOWS = {
    b2b: {
      id: 'b2b',
      title: 'Flujo de Proyectos MADE B2B',
      shortTitle: 'MADE B2B',
      icon: '',
      badge: 'B2B Inmobiliario',
      heroSubtitle: 'Embudo Principal de Servicios Corporativos e Inmobiliarios (Empresas y Desarrolladores)',
      canvasTitle: 'FLUJO DE PROYECTOS ACTIVOS MADE B2B',
      description: 'Proyectos inmobiliarios y empresariales de estructuración, diseño, visualización y gerencia.',
      stages: {
        mql:          { name: "MQL | Plasma (10%)",          short: "MQL (10%)",         prob: 0.10, icon: '', desc: "Contacto cualificado por marketing. Interés inicial identificado (10%)." },
        conversacion: { name: "1ra Conversación (20%)",       short: "1ra Conv. (20%)",   prob: 0.20, icon: '', desc: "Diástole comercial. Escucha activa y diagnóstico preliminar (20%)." },
        sql:          { name: "SQL | Válvula (40%)",           short: "SQL (40%)",         prob: 0.40, icon: '', desc: "Contacto cualificado para ventas. Presupuesto y decisión validados (40%)." },
        propuesta:    { name: "Propuesta Presentada (60%)",    short: "Propuesta (60%)",   prob: 0.60, icon: '', desc: "Oferta co-creada y entregada. Evaluación de valor en curso (60%)." },
        negociacion:  { name: "En Negociación (80%)",          short: "Negociación (80%)", prob: 0.80, icon: '', desc: "Ajuste de términos y condiciones. Impulso previo al cierre (80%)." },
        ejecucion:    { name: "Tejido Consolidado (100%)",     short: "Consolidado (100%)",prob: 1.00, icon: '', desc: "Proyecto cerrado y activo. Integración total en el ecosistema (100%)." },
        pausa:        { name: "Estasis / Pausa (0%)",          short: "Pausa (0%)",        prob: 0.00, icon: '', desc: "Proyecto en estasis o pausa temporal (0%)." }
      }
    },
    b2c: {
      id: 'b2c',
      title: 'Proyectos MADE B2C',
      shortTitle: 'MADE B2C',
      icon: '',
      badge: 'B2C Familias & Hogar',
      heroSubtitle: 'Embudo de Vivienda Campestre, Reformas y Espacios Personales',
      canvasTitle: 'FLUJO DE PROYECTOS MADE B2C (VIVIENDA CAMPESTRE & REFORMAS)',
      description: 'Proyectos dirigidos a familias y personas particulares: diseño campestre, remodelaciones y reformas integrales.',
      stages: {
        b2c_sueno:        { name: "Sueño Familiar | MQL (10%)",       short: "Sueño (10%)",       prob: 0.10, icon: '', desc: "Idea de lote o remodelación, contacto inicial calificado (10%)." },
        b2c_visita:       { name: "Visita a Lote / Entrevista (20%)",  short: "Visita Lote (20%)", prob: 0.20, icon: '', desc: "Recorrido en terreno, conexión familiar y diagnóstico de lote (20%)." },
        b2c_anteproyecto: { name: "Diagnóstico & Concepto (40%)",     short: "Concepto (40%)",    prob: 0.40, icon: '', desc: "Validación de presupuesto familiar, normas y concepto arquitectónico (40%)." },
        b2c_propuesta:    { name: "Propuesta de Diseño (60%)",        short: "Diseño (60%)",      prob: 0.60, icon: '', desc: "Presentación del anteproyecto 3D y presupuesto estimado (60%)." },
        b2c_acuerdo:      { name: "Decisión Familiar (80%)",          short: "Acuerdo (80%)",     prob: 0.80, icon: '', desc: "Alineación familiar final, plan de pagos y contrato (80%)." },
        b2c_obra:         { name: "Hogar en Construcción (100%)",     short: "En Obra (100%)",    prob: 1.00, icon: '', desc: "Contrato firmado, licenciamiento e inicio de obra (100%)." },
        b2c_pausa:        { name: "Proyecto en Pausa (0%)",           short: "Pausa (0%)",        prob: 0.00, icon: '', desc: "Espera de compra de lote, crédito o pausa familiar (0%)." }
      }
    },
    select: {
      id: 'select',
      title: 'Proyectos SELECT',
      shortTitle: 'SELECT Catálogo',
      icon: '',
      badge: 'Catálogo Ágil ≤15 Días',
      heroSubtitle: 'Embudo Rápido de Viviendas por Catálogo (Tickets 5M, 7M y 10M COP)',
      canvasTitle: 'FLUJO DE PROYECTOS SELECT (CATÁLOGO RÁPIDO ≤ 15 DÍAS)',
      description: 'Viviendas pre-diseñadas por catálogo: ciclo ágil de máximo 15 días con tickets de 5M, 7M y 10M COP.',
      stages: {
        sel_lead:       { name: "Lead Catálogo (15%)",      short: "Lead Catálogo (15%)", prob: 0.15, icon: '', desc: "Descarga o solicitud de catálogo SELECT (5M, 7M, 10M COP)." },
        sel_seleccion:  { name: "Selección Modelo (35%)",   short: "Modelo (35%)",        prob: 0.35, icon: '', desc: "Elección de tipología de catálogo y personalización básica (Día 1-5)." },
        sel_cotizacion: { name: "Orden & Paquete (60%)",    short: "Orden (60%)",         prob: 0.60, icon: '', desc: "Emisión de orden con paquete de planos técnicos 5M/7M/10M (Día 6-10)." },
        sel_cierre:     { name: "Compra & Entrega (100%)",  short: "Entrega (100%)",      prob: 1.00, icon: '', desc: "Pago liquidado y entrega de paquete ejecutivo SELECT (Día 11-15)." },
        sel_pausa:      { name: "Descartado / Pausa (0%)",  short: "Pausa (0%)",          prob: 0.00, icon: '', desc: "Lead inactivo o compra pospuesta (0%)." }
      }
    },
    showroom: {
      id: 'showroom',
      title: 'ShowRoom CNTXT',
      shortTitle: 'ShowRoom Inmobiliario',
      icon: '',
      badge: 'Propiedades Inmobiliarias',
      heroSubtitle: 'Embudo de Comercialización y Venta de Activos Inmobiliarios',
      canvasTitle: 'FLUJO SHOWROOM CNTXT (VENTA DE PROPIEDADES INMOBILIARIAS)',
      description: 'Comercialización de inmuebles, lotes campestres, casas y unidades en proyectos del portafolio CNTXT.',
      stages: {
        shw_prospecto:   { name: "Prospecto Interesado (10%)",   short: "Prospecto (10%)",   prob: 0.10, icon: '', desc: "Lead calificado interesado en propiedades del portafolio ShowRoom." },
        shw_experiencia: { name: "Visita / Recorrido (25%)",     short: "Experiencia (25%)", prob: 0.25, icon: '', desc: "Experiencia figital en sala de ventas o visita al inmueble." },
        shw_separacion:  { name: "Separación de Unidad (50%)",   short: "Separación (50%)",  prob: 0.50, icon: '', desc: "Firma de carta de intención y abono de separación del inmueble." },
        shw_promesa:     { name: "Promesa Compraventa (75%)",    short: "Promesa (75%)",     prob: 0.75, icon: '', desc: "Trámite fiduciario, crédito y legalización de promesa." },
        shw_escritura:   { name: "Escrituración & Entrega (100%)", short: "Escrituración (100%)", prob: 1.00, icon: '', desc: "Pago final, firma en notaría y entrega de llaves." },
        shw_desistido:   { name: "Desistido / Pausa (0%)",       short: "Desistido (0%)",    prob: 0.00, icon: '', desc: "Unidad liberada o desistimiento del comprador." }
      }
    }
  };

  let activeProjectFlow = 'b2b';
  let currentProjectSearch = '';
  let currentProjectStage = 'all';

  function getActiveFlowObj() {
    return PROJECT_FLOWS[activeProjectFlow] || PROJECT_FLOWS.b2b;
  }

  function getActiveFlowStages() {
    return getActiveFlowObj().stages;
  }

  function getStageObj(status, flujo = activeProjectFlow) {
    const flowObj = PROJECT_FLOWS[flujo] || PROJECT_FLOWS.b2b;
    if (flowObj.stages[status]) return flowObj.stages[status];
    // Fallback: check other flows
    for (const fKey in PROJECT_FLOWS) {
      if (PROJECT_FLOWS[fKey].stages[status]) return PROJECT_FLOWS[fKey].stages[status];
    }
    const firstKey = Object.keys(flowObj.stages)[0];
    return flowObj.stages[firstKey] || { name: status, prob: 0.10, icon: '🩸', desc: '' };
  }

  function getStageXPositions(flujo = activeProjectFlow) {
    const flowObj = PROJECT_FLOWS[flujo] || PROJECT_FLOWS.b2b;
    const keys = Object.keys(flowObj.stages);
    const count = keys.length;
    const positions = {};
    keys.forEach((key, idx) => {
      positions[key] = Math.round(((idx + 0.5) / count) * 100);
    });
    return positions;
  }

  function detectStageFromX(pct, flujo = activeProjectFlow) {
    const flowObj = PROJECT_FLOWS[flujo] || PROJECT_FLOWS.b2b;
    const keys = Object.keys(flowObj.stages);
    const count = keys.length;
    const idx = Math.max(0, Math.min(count - 1, Math.floor((pct / 100) * count)));
    return keys[idx] || keys[0];
  }

  function formatCOP(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount || 0);
  }

  function renderGlobulosPanel() {
    const activeFlowObj = getActiveFlowObj();
    const activeStages = activeFlowObj.stages;
    const activeStageKeys = Object.keys(activeStages);
    const numStages = activeStageKeys.length;

    // ── 1. Update summaries for the 4 Top Flow Switcher Cards ──
    Object.keys(PROJECT_FLOWS).forEach(fKey => {
      const fObj = PROJECT_FLOWS[fKey];
      const fProjects = savedProjects.filter(p => (p.flujo || 'b2b') === fKey);
      let fWeighted = 0;
      fProjects.forEach(p => {
        const sObj = getStageObj(p.status, fKey);
        fWeighted += (p.amount || 0) * (sObj.prob !== undefined ? sObj.prob : 0.10);
      });

      const badgeEl = document.getElementById(`flow-badge-${fKey}`);
      const finEl = document.getElementById(`flow-financial-${fKey}`);
      const cardEl = document.getElementById(`btn-flow-${fKey}`);

      if (badgeEl) badgeEl.textContent = `${fProjects.length} Proyectos`;
      if (finEl) finEl.textContent = formatCOP(fWeighted);
      if (cardEl) {
        if (fKey === activeProjectFlow) cardEl.classList.add('active');
        else cardEl.classList.remove('active');
      }
    });

    // ── 2. Update ECG Canvas Flow Header Title ──
    const canvasTitleEl = document.getElementById('ecg-canvas-flow-title');
    if (canvasTitleEl) canvasTitleEl.textContent = activeFlowObj.canvasTitle;

    // ── 3. Calculate Financial KPIs for Active Flow ──
    const flowProjects = savedProjects.filter(p => (p.flujo || 'b2b') === activeProjectFlow);
    let totalNominal = 0;
    let totalWeighted = 0;
    const stageAmounts = { all: 0 };
    activeStageKeys.forEach(k => { stageAmounts[k] = 0; });

    flowProjects.forEach(p => {
      const amt = p.amount || 0;
      const stageObj = getStageObj(p.status, activeProjectFlow);
      const weighted = amt * stageObj.prob;
      totalNominal += amt;
      totalWeighted += weighted;
      const st = p.status;
      if (stageAmounts[st] !== undefined) stageAmounts[st] += weighted;
      else {
        // Fallback to first stage if status not in this flow
        stageAmounts[activeStageKeys[0]] += weighted;
      }
      stageAmounts.all += weighted;
    });

    // Pipeline metric cards
    const elTotal = document.getElementById('metric-pipeline-total');
    const elSub   = document.getElementById('metric-pipeline-sub');
    const elCount = document.getElementById('metric-pipeline-count');
    const elAvg   = document.getElementById('metric-pipeline-avg');
    if (elTotal) elTotal.textContent = formatCOP(totalWeighted);
    if (elSub)   elSub.innerHTML = `Ponderado: <strong>${formatCOP(totalWeighted)}</strong> | Nominal: <strong>${formatCOP(totalNominal)}</strong>`;
    if (elCount) elCount.textContent = flowProjects.length;
    if (elAvg) {
      const avg = flowProjects.length > 0 ? totalNominal / flowProjects.length : 0;
      elAvg.textContent = formatCOP(avg);
    }

    // ── 4. Dynamically Render ECG Stage Zones Header (NO EMOJIS) ──
    const zonesHeader = document.getElementById('ecg-stage-zones-header');
    if (zonesHeader) {
      zonesHeader.innerHTML = activeStageKeys.map(stKey => {
        const st = activeStages[stKey];
        const isActive = currentProjectStage === stKey;
        const amt = stageAmounts[stKey] || 0;
        return `
          <div class="ecg-zone ${isActive ? 'active' : ''}" data-stage="${stKey}" data-tooltip="${escapeHtml(st.desc || '')}">
            <span class="ecg-zone-title">${escapeHtml(st.name)}</span>
            <span class="ecg-zone-amount" id="ecg-amount-${stKey}">${formatCOP(amt)}</span>
          </div>
        `;
      }).join('');

      // Attach click listeners to dynamically created ECG zones
      zonesHeader.querySelectorAll('.ecg-zone').forEach(zone => {
        zone.addEventListener('click', () => {
          const stage = zone.dataset.stage;
          if (currentProjectStage === stage) {
            currentProjectStage = 'all';
          } else {
            currentProjectStage = stage;
          }
          renderGlobulosPanel();
        });
      });
    }

    // ── 5. Dynamically Render Vertical Separators Grid ──
    const separatorsContainer = document.getElementById('ecg-vertical-separators');
    if (separatorsContainer) {
      separatorsContainer.innerHTML = '';
      for (let i = 1; i < numStages; i++) {
        const sep = document.createElement('div');
        sep.className = 'ecg-v-sep';
        sep.style.position = 'absolute';
        sep.style.left = `${(i * (100 / numStages)).toFixed(2)}%`;
        sep.style.top = '0';
        sep.style.bottom = '0';
        separatorsContainer.appendChild(sep);
      }
    }

    // ── 6. Dynamically Render Project Filter Pill Buttons (NO EMOJIS) ──
    const pillsContainer = document.getElementById('project-status-pills');
    if (pillsContainer) {
      const isAllActive = currentProjectStage === 'all';
      let pillsHtml = `
        <button class="project-pill-btn ${isAllActive ? 'active' : ''}" data-project-filter="all" data-tooltip="Ver todos los proyectos de ${escapeHtml(activeFlowObj.title)}">
          <span>Todos</span>
          <span class="pill-amount-badge" id="pill-amount-all">${formatCOP(stageAmounts.all)}</span>
        </button>
      `;

      activeStageKeys.forEach(stKey => {
        const st = activeStages[stKey];
        const isActive = currentProjectStage === stKey;
        const amt = stageAmounts[stKey] || 0;
        pillsHtml += `
          <button class="project-pill-btn ${isActive ? 'active' : ''}" data-project-filter="${stKey}" data-tooltip="${escapeHtml(st.desc || '')}">
            <span>${escapeHtml(st.short || st.name)}</span>
            <span class="pill-amount-badge" id="pill-amount-${stKey}">${formatCOP(amt)}</span>
          </button>
        `;
      });

      pillsContainer.innerHTML = pillsHtml;

      // Attach click listeners to pill buttons
      pillsContainer.querySelectorAll('.project-pill-btn').forEach(pill => {
        pill.addEventListener('click', () => {
          const filter = pill.dataset.projectFilter;
          if (currentProjectStage === filter) {
            currentProjectStage = 'all';
          } else {
            currentProjectStage = filter;
          }
          renderGlobulosPanel();
        });
      });
    }

    // ── 7. Render Interactive Red Blood Cell Nodes in Stream (ALWAYS BELOW STAGE NAMES) ──
    const nodesLayer = document.getElementById('globulo-nodes-layer');
    if (nodesLayer) {
      nodesLayer.innerHTML = '';
      const stagePositions = getStageXPositions(activeProjectFlow);

      // Group projects by effective stage to position them strictly in the column under their stage name
      const projectsByStage = {};
      activeStageKeys.forEach(k => { projectsByStage[k] = []; });
      flowProjects.forEach(proj => {
        const effectiveStatus = activeStages[proj.status] ? proj.status : activeStageKeys[0];
        projectsByStage[effectiveStatus].push(proj);
      });

      flowProjects.forEach((proj) => {
        const effectiveStatus = activeStages[proj.status] ? proj.status : activeStageKeys[0];
        const stageIdx = activeStageKeys.indexOf(effectiveStatus);
        const colCenter = stagePositions[effectiveStatus] !== undefined
          ? stagePositions[effectiveStatus]
          : (((stageIdx + 0.5) / numStages) * 100);
        const colWidth = 100 / numStages;

        const siblings = projectsByStage[effectiveStatus] || [];
        const sCount = siblings.length;
        const pIdx = siblings.indexOf(proj);

        // Calculate clean coordinates strictly inside the column beneath the stage name box
        let posX, posY;
        if (sCount <= 1) {
          posX = colCenter;
          posY = 50;
        } else if (sCount === 2) {
          posX = colCenter + (pIdx === 0 ? -colWidth * 0.12 : colWidth * 0.12);
          posY = pIdx === 0 ? 36 : 64;
        } else if (sCount === 3) {
          if (pIdx === 0) { posX = colCenter; posY = 28; }
          else if (pIdx === 1) { posX = colCenter - colWidth * 0.14; posY = 52; }
          else { posX = colCenter + colWidth * 0.14; posY = 74; }
        } else {
          // 4 or more projects: distribute neatly in vertical waves inside column
          const staggerX = (pIdx % 2 === 0 ? -colWidth * 0.12 : colWidth * 0.12);
          posX = colCenter + staggerX;
          posY = 24 + ((pIdx % 4) / 3) * 52;
        }

        posX = Math.max(colCenter - colWidth * 0.38, Math.min(colCenter + colWidth * 0.38, posX));
        posY = Math.max(22, Math.min(78, posY));

        const node = document.createElement('div');
        node.className = `globulo-node stage-${effectiveStatus}`;
        node.style.left = `${posX.toFixed(1)}%`;
        node.style.top  = `${posY.toFixed(1)}%`;
        node.dataset.projectId = String(proj.id);

        node.innerHTML = `
          <div class="globulo-disc"></div>
          <div class="globulo-node-info">
            <span>${escapeHtml(proj.title)}</span>
            <span class="globulo-node-amount">${formatCOP(proj.amount)}</span>
          </div>
        `;

        // Drag & Drop Engine with active flow stage detection constrained to stream channel
        let isDragging = false;
        let startPX, startPY;

        const onPointerDown = (e) => {
          e.preventDefault();
          isDragging = false;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          startPX = clientX; startPY = clientY;

          const streamEl = document.getElementById('globulos-stream-area') || document.getElementById('globulos-ecg-canvas');
          if (!streamEl) return;
          const rect = streamEl.getBoundingClientRect();

          const onPointerMove = (mv) => {
            const cx = mv.touches ? mv.touches[0].clientX : mv.clientX;
            const cy = mv.touches ? mv.touches[0].clientY : mv.clientY;
            if (Math.hypot(cx - startPX, cy - startPY) > 4) {
              isDragging = true;
              node.classList.add('dragging');
              // X spans horizontally across the stage columns
              let relX = Math.max(2, Math.min(98, ((cx - rect.left) / rect.width) * 100));
              // Y is clamped strictly below the stage name headers (20% to 80% of stream area)
              let relY = Math.max(20, Math.min(80, ((cy - rect.top) / rect.height) * 100));
              node.style.left = `${relX}%`;
              node.style.top  = `${relY}%`;

              // Highlight hovered stage name zone in active flow
              const hoveredStage = detectStageFromX(relX, activeProjectFlow);
              document.querySelectorAll('.ecg-zone').forEach(z => z.classList.remove('drag-over'));
              const hz = document.querySelector(`.ecg-zone[data-stage="${hoveredStage}"]`);
              if (hz) hz.classList.add('drag-over');
            }
          };

          const onPointerUp = async (up) => {
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup',   onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend',  onPointerUp);
            document.querySelectorAll('.ecg-zone').forEach(z => z.classList.remove('drag-over'));
            node.classList.remove('dragging');

            if (isDragging) {
              const ux = up.changedTouches ? up.changedTouches[0].clientX : up.clientX;
              let finalX = Math.max(2, Math.min(98, ((ux - rect.left) / rect.width) * 100));

              const newStatus  = detectStageFromX(finalX, activeProjectFlow);
              const prevStatus = proj.status;
              if (newStatus && proj.status !== newStatus) {
                proj.status = newStatus;
                proj.stageEnteredAt = new Date().toISOString();
                node.className = `globulo-node stage-${newStatus}`;
                try {
                  await ApiService.updateProyecto(proj.id, { estado: newStatus });
                  const stName = activeStages[newStatus]?.name || newStatus;
                  showAgentToast('🩸 Etapa Actualizada', `"${proj.title}" → <strong>${stName}</strong>`, '✅');
                } catch (err) {
                  proj.status = prevStatus;
                  node.className = `globulo-node stage-${prevStatus}`;
                  console.error('Error updating stage:', err);
                  showAgentToast('❌ Error', 'No se pudo actualizar la etapa en la base de datos.', '⚠️');
                }
              }
              // Snap immediately into clean column layout under the stage name
              renderGlobulosPanel();
            } else {
              // Click: filter grid to this project
              const searchInput = document.getElementById('project-search-input');
              if (currentProjectSearch === proj.title.toLowerCase().trim()) {
                currentProjectSearch = ''; if (searchInput) searchInput.value = '';
              } else {
                currentProjectSearch = proj.title.toLowerCase().trim(); if (searchInput) searchInput.value = proj.title;
              }
              renderGlobulosPanel();
            }
          };

          document.addEventListener('mousemove', onPointerMove);
          document.addEventListener('mouseup',   onPointerUp);
          document.addEventListener('touchmove', onPointerMove, { passive: false });
          document.addEventListener('touchend',  onPointerUp);
        };

        node.addEventListener('mousedown',  onPointerDown);
        node.addEventListener('touchstart', onPointerDown, { passive: false });
        nodesLayer.appendChild(node);
      });
    }

    // ── 8. Render Project Grid Cards ──
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    let filteredProjects = flowProjects;
    if (currentProjectStage !== 'all') {
      filteredProjects = filteredProjects.filter(p => p.status === currentProjectStage);
    }
    if (currentProjectSearch) {
      filteredProjects = filteredProjects.filter(p =>
        (p.title || '').toLowerCase().includes(currentProjectSearch) ||
        (p.client || '').toLowerCase().includes(currentProjectSearch)
      );
    }

    if (filteredProjects.length === 0) {
      grid.innerHTML = `
        <div class="empty-projects-state" style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-muted); background: rgba(0,0,0,0.3); border-radius: var(--radius-lg);">
          <h3 style="color: #fff; margin-bottom: 8px;">No hay proyectos en "${escapeHtml(activeFlowObj.title)}" con los criterios seleccionados</h3>
          <p>Ajusta la búsqueda, selecciona otra fase del embudo o crea un nuevo proyecto en este flujo.</p>
        </div>
      `;
      return;
    }

    const currentUser = (window.AuthManager && window.AuthManager.getUser && window.AuthManager.getUser()) || null;
    const isSuperUser = !!(currentUser && (currentUser.is_superuser || currentUser.rol === 'superadmin' || currentUser.username === 'admin.cntxt'));

    grid.innerHTML = filteredProjects.map(p => {
      const pFlujo = p.flujo || 'b2b';
      const flowObj = PROJECT_FLOWS[pFlujo] || activeFlowObj;
      const stage = getStageObj(p.status, pFlujo);
      const weighted = (p.amount || 0) * (stage.prob !== undefined ? stage.prob : 0.10);

      const deleteBtnHtml = isSuperUser
        ? `<button class="btn-delete-proj" onclick="window.openDeleteProjectModal(${p.id}, '${escapeHtml(p.title || '').replace(/'/g, "\\'")}')" title="Eliminar proyecto permanentemente (Solo Superusuario)">🗑️ Eliminar</button>`
        : '';

      const flowOptionsHtml = Object.keys(PROJECT_FLOWS).map(fKey => {
        const fo = PROJECT_FLOWS[fKey];
        const isSel = fKey === pFlujo ? 'selected' : '';
        return `<option value="${fKey}" ${isSel}>${fo.icon} ${fo.shortTitle}</option>`;
      }).join('');

      return `
        <div class="project-card stage-${p.status}" data-id="${p.id}" data-flow="${pFlujo}">
          <div class="project-card-header">
            <div class="project-card-badges">
              <span class="project-flow-badge flow-${pFlujo}">${flowObj.icon} ${flowObj.shortTitle}</span>
              <span class="project-stage-badge">${stage.icon} ${escapeHtml(stage.name)}</span>
            </div>
            <h4 class="project-title">${escapeHtml(p.title)}</h4>
            <span class="project-client-name">👤 ${escapeHtml(p.client || 'Sin Asignar')}</span>
          </div>
          <div class="project-financial-row">
            <div class="fin-col">
              <span class="fin-lbl">Monto Proyectado</span>
              <span class="fin-val">${formatCOP(p.amount)}</span>
            </div>
            <div class="fin-col">
              <span class="fin-lbl">Ponderado (${Math.round((stage.prob !== undefined ? stage.prob : 0.10) * 100)}%)</span>
              <span class="fin-val highlight">${formatCOP(weighted)}</span>
            </div>
          </div>
          <div class="project-flow-row-action">
            <span>Mover de Embudo:</span>
            <select class="project-flow-select-inline" onchange="window.changeProjectFlow(${p.id}, this.value)" title="Cambiar el flujo de este proyecto">
              ${flowOptionsHtml}
            </select>
          </div>
          <div class="project-actions-row">
            <button class="btn-edit-proj" onclick="window.editProjectItem(${p.id})">✏️ Editar Proyecto</button>
            ${deleteBtnHtml}
          </div>
        </div>
      `;
    }).join('');

    window.renderGlobulosPanel = renderGlobulosPanel;
  }

  // ── Listener para los 4 Botones Superiores de Flujos de Proyecto ──
  document.querySelectorAll('#globulos-flow-buttons .flow-tab-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const flow = btn.dataset.flow;
      if (flow && activeProjectFlow !== flow) {
        activeProjectFlow = flow;
        currentProjectStage = 'all';
        renderGlobulosPanel();
        const fObj = PROJECT_FLOWS[flow];
        showAgentToast(
          `${fObj.icon} Flujo Seleccionado`,
          `Visualizando <strong>${fObj.title}</strong>`,
          '🩸'
        );
      }
    });
  });

  // ── Función para cambiar el flujo de un proyecto desde la tarjeta ──
  window.changeProjectFlow = async function(id, newFlow) {
    const proj = savedProjects.find(p => p.id == id);
    if (!proj) return;
    const prevFlow = proj.flujo || 'b2b';
    const prevStatus = proj.status;
    const targetFlowObj = PROJECT_FLOWS[newFlow] || PROJECT_FLOWS.b2b;
    const firstStageKey = Object.keys(targetFlowObj.stages)[0];

    proj.flujo = newFlow;
    proj.status = firstStageKey;
    updateSyncStatusIndicator('saving');

    try {
      await ApiService.updateProyecto(id, { flujo: newFlow, estado: firstStageKey });
      updateSyncStatusIndicator('synced');
      showAgentToast(
        `${targetFlowObj.icon} Embudo Actualizado`,
        `"${proj.title}" trasladado a <strong>${targetFlowObj.title}</strong> (${targetFlowObj.stages[firstStageKey].name}).`,
        '✅'
      );
      renderGlobulosPanel();
    } catch (err) {
      proj.flujo = prevFlow;
      proj.status = prevStatus;
      updateSyncStatusIndicator('offline');
      console.error('Error changing project flow:', err);
      showAgentToast('❌ Error', 'No se pudo trasladar el proyecto en el servidor Django.', '⚠️');
      renderGlobulosPanel();
    }
  };

  // ── Listener de búsqueda en proyectos ──
  const projectSearchInput = document.getElementById('project-search-input');
  if (projectSearchInput) {
    projectSearchInput.addEventListener('input', (e) => {
      currentProjectSearch = e.target.value.toLowerCase().trim();
      renderGlobulosPanel();
    });
  }

  // Modal de Crear / Editar Proyecto
  const projectModalOverlay = document.getElementById('project-modal-overlay');
  const btnSaveProject = document.getElementById('btn-save-project');
  const btnCancelProject = document.getElementById('btn-cancel-project');
  const projectModalClose = document.getElementById('project-modal-close');
  const btnCrearProyectoHero = document.getElementById('btn-crear-proyecto-hero');
  const btnOpenProjectModal = document.getElementById('btn-open-project-modal');
  const searchRelacionInput = document.getElementById('project-search-relacion');
  const clearRelacionBtn = document.getElementById('project-search-relacion-clear');
  const dropdownRelacion = document.getElementById('project-relacion-dropdown');

  function populateProjectContactFields(contact) {
    const hiddenId = document.getElementById('project-select-relacion');
    const hiddenEmpresaId = document.getElementById('project-selected-empresa-id');
    const roleInput = document.getElementById('project-input-contact-role');
    const companyInput = document.getElementById('project-input-company-name');
    const relTypeSelect = document.getElementById('project-input-relationship-type');
    const personTypeSelect = document.getElementById('project-input-person-type');

    const roleBadge = document.getElementById('project-role-sync-badge');
    const companyBadge = document.getElementById('project-company-sync-badge');
    const typeBadge = document.getElementById('project-type-sync-badge');
    const personTypeBadge = document.getElementById('project-person-type-sync-badge');

    if (!contact) {
      if (hiddenId) hiddenId.value = '';
      if (hiddenEmpresaId) hiddenEmpresaId.value = '';
      if (roleInput) roleInput.value = '';
      if (companyInput) companyInput.value = '';
      if (relTypeSelect) relTypeSelect.value = '';
      if (personTypeSelect) personTypeSelect.value = 'natural';
      if (roleBadge) roleBadge.style.display = 'none';
      if (companyBadge) companyBadge.style.display = 'none';
      if (typeBadge) typeBadge.style.display = 'none';
      if (personTypeBadge) personTypeBadge.style.display = 'none';
      if (clearRelacionBtn) clearRelacionBtn.style.display = 'none';
      return;
    }

    if (hiddenId) hiddenId.value = contact.id;
    if (hiddenEmpresaId) hiddenEmpresaId.value = contact.empresa_id || '';
    if (searchRelacionInput) {
      searchRelacionInput.value = `${contact.nome || contact.nombre_completo} (${contact.empresa || 'Particular'})`;
    }
    if (roleInput) roleInput.value = contact.rol || contact.oficio || 'Sin cargo definido';
    if (companyInput) companyInput.value = contact.empresa || 'Particular / Sin Empresa';

    const REL_LABELS = {
      cliente_black: 'Cliente Black',
      cliente_gold: 'Cliente Gold',
      cliente_silver: 'Cliente Silver',
      cliente_bronze: 'Cliente Bronze',
      embajador: 'Embajador de Marca',
      growth: 'Growth Partner',
      lead: 'Lead',
      prospecto: 'Prospecto',
      media: 'Media & Influencers',
      aliado: 'Aliado Estratégico',
      aliados: 'Aliados Estratégicos',
      servicios_claves: 'Servicios Claves',
      servicios_aux: 'Servicios Auxiliares',
      proveedor: 'Proveedor',
      interno: 'Equipo Interno / CNTXT',
      equipo: 'Equipo CNTXT',
      candidatos: 'Candidatos y Talento',
      mentores: 'Mentores y Asesores',
      otro: 'Otro'
    };

    const PERSON_LABELS = {
      natural: 'Persona Natural',
      juridica: 'Persona Jurídica'
    };

    if (relTypeSelect) {
      const relKey = (contact.tipo_relacion || 'prospecto').toLowerCase();
      relTypeSelect.value = REL_LABELS[relKey] || (relKey.charAt(0).toUpperCase() + relKey.slice(1).replace(/_/g, ' '));
    }

    if (personTypeSelect) {
      const pKey = (contact.tipo_persona || 'natural').toLowerCase();
      personTypeSelect.value = PERSON_LABELS[pKey] || 'Persona Natural';
    }

    if (roleBadge) roleBadge.style.display = 'inline-block';
    if (companyBadge) companyBadge.style.display = 'inline-block';
    if (typeBadge) typeBadge.style.display = 'inline-block';
    if (personTypeBadge) personTypeBadge.style.display = 'inline-block';
    if (clearRelacionBtn) clearRelacionBtn.style.display = 'flex';
    if (dropdownRelacion) dropdownRelacion.style.display = 'none';
  }

  function renderProjectRelacionDropdown(filterText = '') {
    if (!dropdownRelacion) return;

    const query = filterText.toLowerCase().trim();
    let matches = contactsData;
    if (query) {
      matches = contactsData.filter(c => {
        const nome = (c.nome || c.nombre_completo || '').toLowerCase();
        const emp = (c.empresa || '').toLowerCase();
        const rol = (c.rol || c.oficio || '').toLowerCase();
        const rel = (c.tipo_relacion || '').toLowerCase();
        return nome.includes(query) || emp.includes(query) || rol.includes(query) || rel.includes(query);
      });
    }

    if (matches.length === 0) {
      dropdownRelacion.innerHTML = `
        <div class="combobox-empty">
          <span>No se encontraron relaciones para "<strong>${escapeHtml(filterText)}</strong>"</span>
        </div>
      `;
      dropdownRelacion.style.display = 'block';
      return;
    }

    const currentSelectedId = document.getElementById('project-select-relacion')?.value;

    dropdownRelacion.innerHTML = matches.slice(0, 30).map(c => {
      const isSelected = String(c.id) === String(currentSelectedId);
      const badgeClasif = c.tipo_relacion ? `<span class="combobox-badge badge-red">${escapeHtml(c.tipo_relacion.replace(/_/g, ' '))}</span>` : '';
      return `
        <div class="combobox-item ${isSelected ? 'is-selected' : ''}" data-contact-id="${c.id}">
          <div class="combobox-item-main">
            <span class="combobox-item-name">${escapeHtml(c.nome || c.nombre_completo)}</span>
            <span class="combobox-item-sub">
              <span>🏢 ${escapeHtml(c.empresa || 'Particular')}</span>
              ${c.rol || c.oficio ? `<span>• 💼 ${escapeHtml(c.rol || c.oficio)}</span>` : ''}
            </span>
          </div>
          ${badgeClasif}
        </div>
      `;
    }).join('');

    dropdownRelacion.querySelectorAll('.combobox-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const contactId = item.dataset.contactId;
        const targetContact = contactsData.find(c => String(c.id) === String(contactId));
        if (targetContact) {
          populateProjectContactFields(targetContact);
        }
      });
    });

    dropdownRelacion.style.display = 'block';
  }

  if (searchRelacionInput) {
    searchRelacionInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (clearRelacionBtn) clearRelacionBtn.style.display = val.trim() ? 'flex' : 'none';
      renderProjectRelacionDropdown(val);
    });

    searchRelacionInput.addEventListener('focus', (e) => {
      renderProjectRelacionDropdown(e.target.value);
    });
  }

  if (clearRelacionBtn) {
    clearRelacionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      populateProjectContactFields(null);
      if (searchRelacionInput) {
        searchRelacionInput.value = '';
        searchRelacionInput.focus();
      }
      renderProjectRelacionDropdown('');
    });
  }

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('project-relacion-combobox-wrap');
    if (wrap && !wrap.contains(e.target)) {
      if (dropdownRelacion) dropdownRelacion.style.display = 'none';
    }
  });

  // ── Helper para poblar etapas en el modal de proyecto según el flujo ──
  function populateProjectModalStages(flowKey, selectedStatus = null) {
    const statusSelect = document.getElementById('project-input-status');
    if (!statusSelect) return;
    const flowObj = PROJECT_FLOWS[flowKey] || PROJECT_FLOWS.b2b;
    const stages = flowObj.stages;
    const stageKeys = Object.keys(stages);

    statusSelect.innerHTML = stageKeys.map(key => {
      const st = stages[key];
      const isSelected = (selectedStatus && selectedStatus === key) || (!selectedStatus && key === stageKeys[0]) ? 'selected' : '';
      return `<option value="${key}" ${isSelected}>${st.icon} ${st.name}</option>`;
    }).join('');
  }

  // Listener para los radio pills de selección de flujo en el modal
  document.querySelectorAll('.project-flujo-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const radio = pill.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        document.querySelectorAll('.project-flujo-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        populateProjectModalStages(radio.value, null);
      }
    });
  });

  function openProjectModal(project = null) {
    const titleEl = document.getElementById('project-modal-title');
    const editIdEl = document.getElementById('project-edit-id');
    const inputTitle = document.getElementById('project-input-title');
    const inputAmount = document.getElementById('project-input-amount');
    const inputStatus = document.getElementById('project-input-status');
    const inputNextStep = document.getElementById('project-input-next-step');
    const inputLinea = document.getElementById('project-input-linea-operativa');
    const inputCat = document.getElementById('project-input-categoria');
    const inputBrief = document.getElementById('project-input-brief-url');
    const inputProposal = document.getElementById('project-input-proposal-url');
    const inputDueDate = document.getElementById('project-input-due-date');

    if (dropdownRelacion) dropdownRelacion.style.display = 'none';

    // Determinar flujo inicial del modal
    const targetFlow = project ? (project.flujo || 'b2b') : activeProjectFlow;
    document.querySelectorAll('input[name="project_flujo"]').forEach(r => {
      const isMatch = r.value === targetFlow;
      r.checked = isMatch;
      const pill = r.closest('.project-flujo-pill');
      if (pill) {
        if (isMatch) pill.classList.add('active');
        else pill.classList.remove('active');
      }
    });

    populateProjectModalStages(targetFlow, project ? project.status : null);

    if (project) {
      if (titleEl) titleEl.textContent = '🩸 Editar Proyecto';
      if (editIdEl) editIdEl.value = project.id;
      if (inputTitle) inputTitle.value = project.title || '';
      if (inputAmount) inputAmount.value = project.amount || 0;
      if (inputNextStep) inputNextStep.value = project.nextStep || '';
      if (inputLinea) inputLinea.value = project.lineaOperativa || '';
      if (inputCat) inputCat.value = project.categoria || '';
      if (inputBrief) inputBrief.value = project.briefUrl || '';
      if (inputProposal) inputProposal.value = project.proposalUrl || '';
      if (inputDueDate) inputDueDate.value = project.dueDate || '';

      const targetContact = project.contacto_id
        ? contactsData.find(c => String(c.id) === String(project.contacto_id))
        : null;

      if (targetContact) {
        populateProjectContactFields(targetContact);
      } else {
        populateProjectContactFields(null);
        if (searchRelacionInput) searchRelacionInput.value = project.client || '';
        if (document.getElementById('project-select-relacion')) {
          document.getElementById('project-select-relacion').value = project.contacto_id || '';
        }
        if (document.getElementById('project-selected-empresa-id')) {
          document.getElementById('project-selected-empresa-id').value = project.empresa_id || '';
        }
        if (clearRelacionBtn && project.client) clearRelacionBtn.style.display = 'flex';
      }
    } else {
      if (titleEl) titleEl.textContent = '🩸 Nuevo Proyecto en el Torrente';
      if (editIdEl) editIdEl.value = '';
      if (inputTitle) inputTitle.value = '';
      if (inputAmount) inputAmount.value = 0;
      if (inputNextStep) inputNextStep.value = '';
      if (inputLinea) inputLinea.value = '';
      if (inputCat) inputCat.value = '';
      if (inputBrief) inputBrief.value = '';
      if (inputProposal) inputProposal.value = '';
      if (inputDueDate) inputDueDate.value = '';

      populateProjectContactFields(null);
      if (searchRelacionInput) searchRelacionInput.value = '';
    }

    if (projectModalOverlay) {
      projectModalOverlay.style.display = 'flex';
      projectModalOverlay.classList.add('active');
    }
  }

  if (btnCrearProyectoHero) btnCrearProyectoHero.addEventListener('click', () => openProjectModal());
  if (btnOpenProjectModal) btnOpenProjectModal.addEventListener('click', () => openProjectModal());
  if (btnCancelProject) btnCancelProject.addEventListener('click', () => {
    if (projectModalOverlay) {
      projectModalOverlay.style.display = 'none';
      projectModalOverlay.classList.remove('active');
    }
  });

  window.editProjectItem = function (id) {
    const proj = savedProjects.find(p => p.id == id);
    if (proj) openProjectModal(proj);
  };

  if (btnSaveProject) {
    btnSaveProject.addEventListener('click', async () => {
      const editId = document.getElementById('project-edit-id')?.value;
      const title = document.getElementById('project-input-title')?.value.trim();
      const selectedFlujo = document.querySelector('input[name="project_flujo"]:checked')?.value || activeProjectFlow;
      let contactoId = document.getElementById('project-select-relacion')?.value;
      const empresaId = document.getElementById('project-selected-empresa-id')?.value;
      const amount = parseFloat(document.getElementById('project-input-amount')?.value) || 0;
      const status = document.getElementById('project-input-status')?.value || 'mql';
      const nextStep = document.getElementById('project-input-next-step')?.value.trim() || '';
      const lineaOperativa = document.getElementById('project-input-linea-operativa')?.value || null;
      const categoria = document.getElementById('project-input-categoria')?.value || null;
      const briefUrl = document.getElementById('project-input-brief-url')?.value?.trim() || '';
      const proposalUrl = document.getElementById('project-input-proposal-url')?.value?.trim() || '';
      const dueDate = document.getElementById('project-input-due-date')?.value || null;

      if (!title) {
        alert('Por favor ingresa el Título del Proyecto.');
        return;
      }

      // Si el usuario escribió un nombre pero no hizo clic en el dropdown, buscar coincidencia
      const searchText = searchRelacionInput?.value?.trim()?.toLowerCase();
      if (!contactoId && searchText) {
        const found = contactsData.find(c => {
          const n = (c.nome || c.nombre_completo || '').toLowerCase();
          return n === searchText || `${n} (${(c.empresa || 'particular').toLowerCase()})` === searchText;
        });
        if (found) {
          contactoId = found.id;
        }
      }

      const payload = {
        titulo: title,
        flujo: selectedFlujo,
        monto_proyectado: amount,
        estado: status,
        proximo_paso: nextStep,
        contacto: contactoId ? parseInt(contactoId) : null,
        empresa: empresaId ? parseInt(empresaId) : null,
        linea_operativa: lineaOperativa,
        categoria: categoria,
        brief_url: briefUrl,
        proposal_url: proposalUrl,
        fecha_limite: dueDate
      };

      updateSyncStatusIndicator('saving');
      try {
        if (editId) {
          const updated = await ApiService.updateProyecto(editId, payload);
          const idx = savedProjects.findIndex(p => p.id == editId);
          if (idx !== -1) {
            savedProjects[idx] = {
              ...savedProjects[idx],
              title: updated.titulo,
              flujo: updated.flujo || selectedFlujo,
              amount: parseFloat(updated.monto_proyectado) || 0,
              status: updated.estado,
              client: updated.contacto_nombre || updated.empresa_nombre || '',
              contacto_id: updated.contacto,
              empresa_id: updated.empresa,
              lineaOperativa: updated.linea_operativa,
              categoria: updated.categoria,
              briefUrl: updated.brief_url,
              proposalUrl: updated.proposal_url,
              dueDate: updated.fecha_limite,
              nextStep: updated.proximo_paso
            };
          }
          showAgentToast('🩸 Proyecto Actualizado', `"${title}" se actualizó en PostgreSQL.`);
        } else {
          const created = await ApiService.createProyecto(payload);
          savedProjects.unshift({
            id: created.id,
            title: created.titulo,
            flujo: created.flujo || selectedFlujo,
            amount: parseFloat(created.monto_proyectado) || 0,
            status: created.estado,
            client: created.contacto_nombre || created.empresa_nombre || '',
            contacto_id: created.contacto,
            empresa_id: created.empresa,
            lineaOperativa: created.linea_operativa,
            categoria: created.categoria,
            briefUrl: created.brief_url,
            proposalUrl: created.proposal_url,
            dueDate: created.fecha_limite,
            nextStep: created.proximo_paso
          });
          showAgentToast('🩸 Proyecto Creado', `"${title}" fue agregado al torrente en PostgreSQL.`);
        }

        updateSyncStatusIndicator('synced');
        if (projectModalOverlay) {
          projectModalOverlay.style.display = 'none';
          projectModalOverlay.classList.remove('active');
        }
        renderGlobulosPanel();
      } catch (err) {
        updateSyncStatusIndicator('offline');
        console.error('Error saving project:', err);
        alert('Error al guardar proyecto en el servidor Django.');
      }
    });
  }

  // ── Exportación CSV de Proyectos (con soporte de Flujo) ──
  const btnExportCSV = document.getElementById('btn-export-projects-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      if (!savedProjects || savedProjects.length === 0) {
        showAgentToast('⚠️ Sin Datos', 'No hay proyectos para exportar.', '⚠️');
        return;
      }

      const headers = [
        'ID',
        'Título del Proyecto',
        'Flujo de Proyecto',
        'Estado / Etapa',
        'Cliente / Empresa',
        'Monto Proyectado (COP)',
        'Probabilidad (%)',
        'Valor Ponderado (COP)',
        'Línea Operativa (C.O.R.)',
        'Categoría (C.O.R.)',
        'Próximo Paso',
        'Fecha Límite'
      ];

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      };

      const rows = savedProjects.map(p => {
        const pFlujo = p.flujo || 'b2b';
        const flowObj = PROJECT_FLOWS[pFlujo] || PROJECT_FLOWS.b2b;
        const stObj = getStageObj(p.status, pFlujo);
        const probPct = Math.round((stObj.prob !== undefined ? stObj.prob : 0.10) * 100);
        const weighted = (p.amount || 0) * (stObj.prob !== undefined ? stObj.prob : 0.10);

        return [
          escapeCSV(p.id),
          escapeCSV(p.title),
          escapeCSV(flowObj.title),
          escapeCSV(stObj.name),
          escapeCSV(p.client || 'Sin asignar'),
          p.amount || 0,
          `${probPct}%`,
          weighted,
          escapeCSV(p.lineaOperativa || ''),
          escapeCSV(p.categoria || ''),
          escapeCSV(p.nextStep || ''),
          escapeCSV(p.dueDate || '')
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Flujo_Proyectos_CNTXT_RED_${activeProjectFlow}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showAgentToast('📥 CSV Descargado', `Se descargaron ${savedProjects.length} proyectos con éxito.`, '✅');
    });
  }

  if (projectModalClose) {
    projectModalClose.addEventListener('click', () => {
      if (projectModalOverlay) {
        projectModalOverlay.style.display = 'none';
        projectModalOverlay.classList.remove('active');
      }
    });
  }

  // ─── Modal de Confirmación de Eliminación de Proyecto (Solo Superusuario) ───
  const deleteProjectModalOverlay = document.getElementById('project-delete-modal-overlay');
  const btnCancelDeleteProject = document.getElementById('btn-cancel-delete-project');
  const btnConfirmDeleteProject = document.getElementById('btn-confirm-delete-project');
  const projectDeleteModalClose = document.getElementById('project-delete-modal-close');

  window.openDeleteProjectModal = function (id, title) {
    const user = (window.AuthManager && window.AuthManager.getUser && window.AuthManager.getUser()) || null;
    const isSuper = !!(user && (user.is_superuser || user.rol === 'superadmin' || user.username === 'admin.cntxt'));

    if (!isSuper) {
      alert('Esta opción solo puede ser ejecutada por el superusuario.');
      return;
    }

    const targetIdEl = document.getElementById('delete-project-target-id');
    const titlePreviewEl = document.getElementById('delete-project-title-preview');

    if (targetIdEl) targetIdEl.value = id;
    if (titlePreviewEl) titlePreviewEl.textContent = `"${title || 'este proyecto'}"`;

    if (deleteProjectModalOverlay) {
      deleteProjectModalOverlay.style.display = 'flex';
      deleteProjectModalOverlay.classList.add('active');
    }
  };

  window.closeDeleteProjectModal = function () {
    if (deleteProjectModalOverlay) {
      deleteProjectModalOverlay.style.display = 'none';
      deleteProjectModalOverlay.classList.remove('active');
    }
    const targetIdEl = document.getElementById('delete-project-target-id');
    if (targetIdEl) targetIdEl.value = '';
  };

  if (btnCancelDeleteProject) {
    btnCancelDeleteProject.addEventListener('click', window.closeDeleteProjectModal);
  }
  if (projectDeleteModalClose) {
    projectDeleteModalClose.addEventListener('click', window.closeDeleteProjectModal);
  }

  if (btnConfirmDeleteProject) {
    btnConfirmDeleteProject.addEventListener('click', async () => {
      const targetId = document.getElementById('delete-project-target-id')?.value;
      if (!targetId) return;

      const user = (window.AuthManager && window.AuthManager.getUser && window.AuthManager.getUser()) || null;
      const isSuper = !!(user && (user.is_superuser || user.rol === 'superadmin' || user.username === 'admin.cntxt'));
      if (!isSuper) {
        alert('Acceso restringido: solo el superusuario puede eliminar proyectos.');
        window.closeDeleteProjectModal();
        return;
      }

      const proj = savedProjects.find(p => p.id == targetId);
      const projTitle = proj ? proj.title : `ID ${targetId}`;

      try {
        btnConfirmDeleteProject.disabled = true;
        btnConfirmDeleteProject.textContent = 'Eliminando...';
        updateSyncStatusIndicator('saving');

        await ApiService.deleteProyecto(targetId);

        // Remove from savedProjects
        const pIdx = savedProjects.findIndex(p => p.id == targetId);
        if (pIdx !== -1) {
          savedProjects.splice(pIdx, 1);
        }

        updateSyncStatusIndicator('synced');
        showAgentToast('🗑️ Proyecto Eliminado', `"${projTitle}" ha sido eliminado exitosamente por el superusuario.`);
        window.closeDeleteProjectModal();
        renderGlobulosPanel();
      } catch (err) {
        updateSyncStatusIndicator('offline');
        console.error('Error al eliminar proyecto:', err);
        alert('Error al eliminar el proyecto: ' + (err.message || 'Error de comunicación con el servidor.'));
      } finally {
        btnConfirmDeleteProject.disabled = false;
        btnConfirmDeleteProject.textContent = 'Sí, eliminar proyecto';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // THE PULSE SCALE & BIOTOPO (Pulsos Reales LIVE)
  // ═══════════════════════════════════════════════════════════════════
  let currentPulseFilter = 'all';

  function getECGPathSVG(pulseLevel) {
    if (pulseLevel === 1) {
      return `
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p1" d="M0,30 L100,30 L105,28 L110,32 L115,30 L200,30 L205,29 L210,31 L300,30" fill="none" />
        </svg>
      `;
    } else if (pulseLevel === 2) {
      return `
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p2" d="M0,30 L50,30 L55,25 L60,40 L65,15 L70,35 L75,30 L180,30 L185,26 L190,38 L195,18 L200,33 L205,30 L300,30" fill="none" />
        </svg>
      `;
    } else if (pulseLevel === 3) {
      return `
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p3" d="M0,30 L30,30 L35,28 L40,35 L45,5 L52,55 L58,10 L64,38 L70,30 L130,30 L135,28 L140,35 L145,5 L152,55 L158,10 L164,38 L170,30 L230,30 L235,28 L240,35 L245,5 L252,55 L258,10 L264,38 L270,30 L300,30" fill="none" />
        </svg>
      `;
    } else {
      return `
        <div class="tissue-mesh"></div>
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p4" d="M0,30 C30,10 60,50 90,30 C120,10 150,50 180,30 C210,10 240,50 270,30 L300,30" fill="none" />
        </svg>
      `;
    }
  }

  function renderPulsePanel() {
    const pulseGrid = document.getElementById('pulse-grid');
    if (!pulseGrid) return;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const pCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const filteredList = [];

    contactsData.forEach(c => {
      const pulse = getContactPulse(c);
      pCounts[pulse.level] = (pCounts[pulse.level] || 0) + 1;

      const matchesSearch =
        (c.nome || '').toLowerCase().includes(query) ||
        (c.empresa || '').toLowerCase().includes(query) ||
        (c.numero || '').includes(query) ||
        (c.email || '').toLowerCase().includes(query);

      if (!matchesSearch) return;

      if (currentPulseFilter !== 'all' && String(pulse.level) !== String(currentPulseFilter)) {
        return;
      }

      filteredList.push({ client: c, pulse });
    });

    // Update Counter Badges for 4 Pulsation States (Top Metric Cards & Lower Pills)
    for (let i = 1; i <= 4; i++) {
      const topCountEl = document.getElementById(`stat-pulse-count-${i}`);
      if (topCountEl) topCountEl.textContent = pCounts[i] || 0;
      const pillCountEl = document.getElementById(`count-p${i}`);
      if (pillCountEl) pillCountEl.textContent = pCounts[i] || 0;
    }

    // Sync active state on the 4 top pulsation filter cards
    const biotopoStatCards = document.querySelectorAll('.biotopo-stats-grid .biotopo-stat-card');
    biotopoStatCards.forEach(card => {
      const cardFilter = card.dataset.pulseFilter;
      const isCardActive = (String(currentPulseFilter) === String(cardFilter));
      card.classList.toggle('active', isCardActive);
      const hint = card.querySelector('.biotopo-stat-filter-hint');
      if (hint) hint.textContent = isCardActive ? 'Activo ✓' : 'Filtro';
    });

    // Sync active state on lower pulse scale pill buttons
    const pulsePillBtns = document.querySelectorAll('.pulse-pill-btn');
    pulsePillBtns.forEach(btn => {
      const btnFilter = btn.dataset.pulseFilter || 'all';
      btn.classList.toggle('active', String(btnFilter) === String(currentPulseFilter));
    });

    const pulseActiveCountEl = document.getElementById('pulse-active-count');
    if (pulseActiveCountEl) {
      if (currentPulseFilter === 'all') {
        pulseActiveCountEl.textContent = `Mostrando todos los entes (${filteredList.length} relaciones en el Biotopo)`;
      } else {
        const pDef = PULSE_DEFINITIONS[currentPulseFilter] || { name: `Pulso ${currentPulseFilter}` };
        pulseActiveCountEl.textContent = `Filtrado por Pulso ${currentPulseFilter}: ${pDef.name} (${filteredList.length} relaciones)`;
      }
    }

    pulseGrid.innerHTML = '';

    if (filteredList.length === 0) {
      pulseGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted); background: rgba(0,0,0,0.3); border-radius: var(--radius-lg);">
          No se encontraron entes energéticos en este nivel de pulso.
        </div>
      `;
      return;
    }

    // Render pulse cards
    filteredList.slice(0, 60).forEach(({ client, pulse }) => {
      const tag = getContactTag(client);
      const siguienteAccion = client.siguiente_accion || client.next_action || client.proxima_accion || '';
      const cleanPulseName = pulse.shortName || pulse.name.replace(/\(.*?\)/, '').trim();
      const card = document.createElement('div');
      card.className = `pulse-card ${pulse.cardClass || ''}`;
      card.dataset.id = client.id;

      card.innerHTML = `
        <div class="pulse-card-header">
          <div class="pulse-card-user">
            <div class="pulse-avatar">${getInitials(client.nome)}</div>
            <div class="pulse-user-info">
              <div class="pulse-user-name">${escapeHtml(client.nome)}</div>
              <div class="pulse-user-company">${escapeHtml(client.empresa || 'Particular')} · ${escapeHtml(tag.name)}</div>
            </div>
          </div>
          <div class="pulse-state-badge ${pulse.badgeClass || ''}">
            <span class="pulse-dot dot-${pulse.code || 'p1'}"></span>
            <span>P${pulse.level}: ${escapeHtml(cleanPulseName)}</span>
          </div>
        </div>

        <div class="ecg-container">
          <div class="ecg-grid-overlay"></div>
          ${getECGPathSVG(pulse.level)}
        </div>

        <div class="pulse-current-action-wrap ${siguienteAccion ? 'has-action' : 'empty'}">
          <div class="pulse-current-action-label">
            <span class="action-target-icon">🎯</span>
            <span>Acción Relacional</span>
          </div>
          <div class="pulse-current-action-text" title="${escapeHtml(siguienteAccion || 'Sin acción programada')}">
            ${escapeHtml(siguienteAccion || 'Sin acción programada')}
          </div>
        </div>

        <button type="button" class="btn-intensificar-pulso" data-client-id="${client.id}">
          Intensificar Pulso
        </button>

        <div class="pulse-actions-dropdown" id="pulse-actions-dropdown-${client.id}" style="display: none;"></div>
      `;

      // Evento del botón Intensificar Pulso
      const btnIntensificar = card.querySelector('.btn-intensificar-pulso');
      const actionsDropdown = card.querySelector(`#pulse-actions-dropdown-${client.id}`);

      if (btnIntensificar && actionsDropdown) {
        btnIntensificar.addEventListener('click', (e) => {
          e.stopPropagation();
          const isCurrentlyOpen = actionsDropdown.style.display !== 'none';

          // Cerrar otros desplegables abiertos
          document.querySelectorAll('.pulse-actions-dropdown').forEach(dd => {
            if (dd !== actionsDropdown) dd.style.display = 'none';
          });
          document.querySelectorAll('.btn-intensificar-pulso').forEach(b => {
            if (b !== btnIntensificar) b.classList.remove('active');
          });

          if (isCurrentlyOpen) {
            actionsDropdown.style.display = 'none';
            btnIntensificar.classList.remove('active');
          } else {
            renderPulseActionsDropdownContent(actionsDropdown, client, pulse.level);
            actionsDropdown.style.display = 'flex';
            btnIntensificar.classList.add('active');
          }
        });

        actionsDropdown.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      card.addEventListener('click', () => openModal(client));
      pulseGrid.appendChild(card);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // DESPLEGABLE SELECCIONABLE DE ACCIONES COMUNICACIONALES POR CRITERIO
  // ─────────────────────────────────────────────────────────────────
  function renderPulseActionsDropdownContent(container, client, pulseLevel) {
    const strat = PULSE_CRITERIA_STRATEGIES[pulseLevel] || PULSE_CRITERIA_STRATEGIES[1];
    let activeCriterionId = strat.criteria[0].id;

    function buildHtml() {
      const optionsHtml = strat.criteria.map(crit => `
        <option value="${crit.id}" ${crit.id === activeCriterionId ? 'selected' : ''}>
          ${escapeHtml(crit.name)}
        </option>
      `).join('');

      const activeCriterion = strat.criteria.find(c => c.id === activeCriterionId) || strat.criteria[0];
      const currentAction = client.siguiente_accion || client.next_action || '';

      const actionsHtml = activeCriterion.actions.map((act, idx) => {
        const isSelected = (currentAction.trim() === act.trim());
        return `
          <div class="pulse-action-option-card ${isSelected ? 'is-selected' : ''}" data-action="${escapeHtml(act)}">
            <div class="pulse-action-option-body">
              <span class="pulse-action-num">${idx + 1}</span>
              <span class="pulse-action-text">${escapeHtml(act)}</span>
            </div>
            <button type="button" class="btn-select-action ${isSelected ? 'active' : ''}" data-action="${escapeHtml(act)}">
              ${isSelected ? 'Seleccionada ✓' : 'Elegir Acción'}
            </button>
          </div>
        `;
      }).join('');

      container.innerHTML = `
        <div class="pulse-actions-head">
          <div class="pulse-actions-title-wrap">
            <span class="pulse-actions-kicker">${escapeHtml(strat.name)} · Estrategia Comunicacional</span>
            <h5 class="pulse-actions-heading">${escapeHtml(strat.goal)}</h5>
          </div>
          <button type="button" class="btn-close-pulse-actions" title="Cerrar panel">&times;</button>
        </div>

        <div class="pulse-criterion-picker">
          <label class="pulse-picker-label">Criterio de la Matriz Relacional:</label>
          <select class="pulse-criterion-select" data-client-id="${client.id}">
            ${optionsHtml}
          </select>
        </div>

        <div class="pulse-options-container">
          ${actionsHtml}
        </div>
      `;

      // Listener para cambiar de criterio
      const selectEl = container.querySelector('.pulse-criterion-select');
      if (selectEl) {
        selectEl.addEventListener('change', (e) => {
          activeCriterionId = e.target.value;
          buildHtml();
        });
      }

      // Listener para cerrar
      const btnClose = container.querySelector('.btn-close-pulse-actions');
      if (btnClose) {
        btnClose.addEventListener('click', (e) => {
          e.stopPropagation();
          container.style.display = 'none';
          const trigger = container.closest('.pulse-card')?.querySelector('.btn-intensificar-pulso');
          if (trigger) trigger.classList.remove('active');
        });
      }

      // Listeners para seleccionar acción
      container.querySelectorAll('.btn-select-action, .pulse-action-option-card').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const actionText = el.dataset.action || el.querySelector('.btn-select-action')?.dataset.action;
          if (actionText) {
            applyPulseActionToContact(client.id, actionText);
          }
        });
      });
    }

    buildHtml();
  }

  // ─────────────────────────────────────────────────────────────────
  // APLICACIÓN DE ACCIÓN: IMPACTA TARJETA DE PULSO Y PESTAÑA RELACIONES
  // ─────────────────────────────────────────────────────────────────
  async function applyPulseActionToContact(clientId, actionText) {
    const target = contactsData.find(c => String(c.id) === String(clientId) || Number(c.id) === Number(clientId));
    if (!target) return;

    target.siguiente_accion = actionText;
    target.next_action = actionText;

    // 1. Actualizar visualmente la tarjeta en el panel de Pulso Relacional
    const pulseCard = document.querySelector(`.pulse-card[data-id="${clientId}"]`);
    if (pulseCard) {
      const actionWrap = pulseCard.querySelector('.pulse-current-action-wrap');
      const actionTextEl = pulseCard.querySelector('.pulse-current-action-text');
      if (actionWrap && actionTextEl) {
        actionWrap.classList.remove('empty');
        actionWrap.classList.add('has-action');
        actionTextEl.textContent = actionText;
        actionTextEl.setAttribute('title', actionText);
      }

      pulseCard.querySelectorAll('.pulse-action-option-card').forEach(card => {
        const isSel = card.dataset.action === actionText;
        card.classList.toggle('is-selected', isSel);
        const btn = card.querySelector('.btn-select-action');
        if (btn) {
          btn.classList.toggle('active', isSel);
          btn.textContent = isSel ? 'Seleccionada ✓' : 'Elegir Acción';
        }
      });

      // Cerrar desplegable tras confirmación
      setTimeout(() => {
        const dropdown = pulseCard.querySelector('.pulse-actions-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        const trigger = pulseCard.querySelector('.btn-intensificar-pulso');
        if (trigger) trigger.classList.remove('active');
      }, 350);
    }

    // 2. Refrescar de inmediato la vista del Directorio en la pestaña de Relaciones
    renderDirectory();

    // 3. Feedback toast al usuario
    showAgentToast(
      '🎯 Acción Programada',
      `"${actionText}" asignada a ${target.nome || target.nombre_completo}. Reflejada en la pestaña de Relaciones.`
    );

    // 4. Persistir en Django API
    try {
      updateSyncStatusIndicator('saving');
      await ApiService.updateContacto(target.id, { siguiente_accion: actionText });
      updateSyncStatusIndicator('synced');
    } catch (err) {
      updateSyncStatusIndicator('offline');
      console.warn('Persistencia local confirmada (Django API offline):', err);
    }
  }

  // Handle 4 Top Biotopo Pulse Filter Metric Cards click (Filtros de Salud Relacional)
  const biotopoFilterCards = document.querySelectorAll('.biotopo-stats-grid .biotopo-stat-card');
  biotopoFilterCards.forEach(card => {
    card.addEventListener('click', () => {
      const filterVal = card.dataset.pulseFilter;
      // Si se hace clic en el filtro ya activo, desactivar y volver a 'all'
      if (String(currentPulseFilter) === String(filterVal)) {
        currentPulseFilter = 'all';
      } else {
        currentPulseFilter = filterVal;
      }
      renderPulsePanel();
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  // Handle Pulse Scale Pill Filters click
  const pulsePillBtns = document.querySelectorAll('.pulse-pill-btn');
  pulsePillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentPulseFilter = btn.dataset.pulseFilter || 'all';
      renderPulsePanel();
    });
  });

  // Toggle Desplegable de Metodología Completa
  let _lastMethodologyToggle = 0;
  window.toggleMethodology = function(btn) {
    const now = Date.now();
    if (now - _lastMethodologyToggle < 200) return;
    _lastMethodologyToggle = now;

    const methodologyCollapsible = document.getElementById('matriz-methodology-collapsible');
    const button = btn || document.getElementById('btn-toggle-methodology');
    if (!methodologyCollapsible) return;

    const isCurrentlyHidden = methodologyCollapsible.style.display === 'none' || getComputedStyle(methodologyCollapsible).display === 'none';

    if (isCurrentlyHidden) {
      methodologyCollapsible.style.display = 'flex';
      if (button) {
        button.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
        button.innerHTML = `
          <span>✕ Ocultar Metodología</span>
          <svg class="icon-chevron" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="transform: rotate(180deg);">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
          </svg>
        `;
      }
    } else {
      methodologyCollapsible.style.display = 'none';
      if (button) {
        button.classList.remove('active');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = `
          <span>📖 Ver Metodología</span>
          <svg class="icon-chevron" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
          </svg>
        `;
      }
    }
  };

  window.toggleAllCriteriaRubrics = function() {
    const grid = document.getElementById('matriz-criteria-grid');
    const btn = document.getElementById('btn-toggle-all-rubrics');
    if (!grid) return;
    const isAllExpanded = grid.classList.contains('all-expanded');
    if (isAllExpanded) {
      grid.classList.remove('all-expanded');
      document.querySelectorAll('.matriz-crit-card').forEach(c => c.classList.remove('is-expanded'));
      if (btn) btn.innerHTML = '<span>Expandir todas las rúbricas</span>';
    } else {
      grid.classList.add('all-expanded');
      document.querySelectorAll('.matriz-crit-card').forEach(c => c.classList.add('is-expanded'));
      if (btn) btn.innerHTML = '<span>Compactar rúbricas</span>';
    }
  };

  const btnToggleMethodology = document.getElementById('btn-toggle-methodology');
  if (btnToggleMethodology) {
    btnToggleMethodology.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      window.toggleMethodology(this);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CALCULADORA & SIMULADOR DE MATRIZ DE INTENSIDAD RELACIONAL
  // ─────────────────────────────────────────────────────────────────
  const btnToggleMatrizCalc = document.getElementById('btn-toggle-matriz-calc');
  const matrizCalcDrawer = document.getElementById('matriz-calculator-drawer');
  
  if (btnToggleMatrizCalc && matrizCalcDrawer) {
    btnToggleMatrizCalc.addEventListener('click', () => {
      const isHidden = matrizCalcDrawer.style.display === 'none';
      matrizCalcDrawer.style.display = isHidden ? 'flex' : 'none';
      btnToggleMatrizCalc.innerHTML = isHidden 
        ? '<span>✕ Ocultar Evaluador</span>'
        : '<span>🔬 Abrir Evaluador &amp; Simulador</span>';
      if (isHidden) updateMatrizCalculation();
    });
  }

  function updateMatrizCalculation() {
    const rangeDna = document.getElementById('range-calc-dna');
    const rangeAmb = document.getElementById('range-calc-ambassador');
    const rangeBi = document.getElementById('range-calc-bi');
    const rangeSandler = document.getElementById('range-calc-sandler');
    const rangeCialdini = document.getElementById('range-calc-cialdini');
    const rangeMap = document.getElementById('range-calc-map');

    if (!rangeDna) return;

    const valDna = parseInt(rangeDna.value, 10) || 0;
    const valAmb = parseInt(rangeAmb.value, 10) || 0;
    const valBi = parseInt(rangeBi.value, 10) || 0;
    const valSandler = parseInt(rangeSandler.value, 10) || 0;
    const valCialdini = parseInt(rangeCialdini.value, 10) || 0;
    const valMap = parseInt(rangeMap.value, 10) || 0;

    const elValDna = document.getElementById('val-calc-dna'); if (elValDna) elValDna.textContent = `${valDna} pts`;
    const elValAmb = document.getElementById('val-calc-ambassador'); if (elValAmb) elValAmb.textContent = `${valAmb} pts`;
    const elValBi = document.getElementById('val-calc-bi'); if (elValBi) elValBi.textContent = `${valBi} pts`;
    const elValSandler = document.getElementById('val-calc-sandler'); if (elValSandler) elValSandler.textContent = `${valSandler} pts`;
    const elValCialdini = document.getElementById('val-calc-cialdini'); if (elValCialdini) elValCialdini.textContent = `${valCialdini} pts`;
    const elValMap = document.getElementById('val-calc-map'); if (elValMap) elValMap.textContent = `${valMap} pts`;

    const totalPts = Math.min(100, Math.max(0, valDna + valAmb + valBi + valSandler + valCialdini + valMap));
    const totalEl = document.getElementById('calc-total-pts'); if (totalEl) totalEl.textContent = totalPts;

    let pDef = PULSE_DEFINITIONS[1];
    if (totalPts >= 81) pDef = PULSE_DEFINITIONS[4];
    else if (totalPts >= 51) pDef = PULSE_DEFINITIONS[3];
    else if (totalPts >= 26) pDef = PULSE_DEFINITIONS[2];

    const levelTag = document.getElementById('calc-level-tag');
    const stateTag = document.getElementById('calc-state-tag');
    const actionTag = document.getElementById('calc-action-tag');

    if (levelTag) {
      levelTag.textContent = `${pDef.shortName || pDef.name} (${pDef.points})`;
      levelTag.style.color = pDef.color;
    }
    if (stateTag) stateTag.textContent = pDef.state;
    if (actionTag) actionTag.textContent = pDef.desc;
  }

  ['range-calc-dna', 'range-calc-ambassador', 'range-calc-bi', 'range-calc-sandler', 'range-calc-cialdini', 'range-calc-map'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateMatrizCalculation);
  });

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS & TOAST SYSTEM
  // ═══════════════════════════════════════════════════════════════════
  function showAgentToast(title, message, icon = '🩸') {
    const container = document.getElementById('agent-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'agent-toast';
    toast.innerHTML = `
      <div class="agent-toast-icon">${icon}</div>
      <div class="agent-toast-body">
        <div class="agent-toast-title">${escapeHtml(title)}</div>
        <div class="agent-toast-msg">${escapeHtml(message)}</div>
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SYNCHRONIZATION OF HEADER & GLOBAL METRICS (6 KPIs: Total, Embajadores, Growth, Black, Gold, Silver)
  // ═══════════════════════════════════════════════════════════════════
  function updateMetrics() {
    const totalContacts = contactsData.length;
    let embajadorCount = 0;
    let growthCount = 0;
    let blackCount = 0;
    let goldCount = 0;
    let silverCount = 0;

    contactsData.forEach(c => {
      const tagKey = (getContactTag(c).key || c.tipo_relacion || '').toLowerCase();
      if (tagKey === 'embajador') {
        embajadorCount++;
      } else if (tagKey === 'growth') {
        growthCount++;
      } else if (tagKey === 'cliente_black') {
        blackCount++;
      } else if (tagKey === 'cliente_gold') {
        goldCount++;
      } else if (tagKey === 'cliente_silver') {
        silverCount++;
      }
    });

    const metricTotal = document.getElementById('metric-total');
    const metricEmbajador = document.getElementById('metric-embajador');
    const metricGrowth = document.getElementById('metric-growth');
    const metricBlack = document.getElementById('metric-black');
    const metricGold = document.getElementById('metric-gold');
    const metricSilver = document.getElementById('metric-silver');
    const clientCountEl = document.getElementById('client-count');
    const companyCountBadge = document.getElementById('company-count');

    if (metricTotal) metricTotal.textContent = totalContacts;
    if (metricEmbajador) metricEmbajador.textContent = embajadorCount;
    if (metricGrowth) metricGrowth.textContent = growthCount;
    if (metricBlack) metricBlack.textContent = blackCount;
    if (metricGold) metricGold.textContent = goldCount;
    if (metricSilver) metricSilver.textContent = silverCount;
    if (clientCountEl) clientCountEl.textContent = totalContacts;
    if (companyCountBadge) companyCountBadge.textContent = masterEmpresas.length;

    // Calcular y actualizar contadores de los 4 estados de pulsación en el biotopo
    const pCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    contactsData.forEach(c => {
      const pulse = getContactPulse(c);
      pCounts[pulse.level] = (pCounts[pulse.level] || 0) + 1;
    });
    for (let i = 1; i <= 4; i++) {
      const topCountEl = document.getElementById(`stat-pulse-count-${i}`);
      if (topCountEl) topCountEl.textContent = pCounts[i] || 0;
      const pillCountEl = document.getElementById(`count-p${i}`);
      if (pillCountEl) pillCountEl.textContent = pCounts[i] || 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // MAIN TAB NAVIGATION ENGINE (Directorio, Pulsos Reales, Glóbulos Rojos)
  // ═══════════════════════════════════════════════════════════════════
  function showTab(tab) {
    activeTab = tab;
    const dashboardGrid = document.querySelector('.dashboard-grid');
    const mainMetricsRow = document.getElementById('main-metrics-row');
    const pulsosRealesPanel = document.getElementById('pulsos-reales-panel');
    const globulosPanel = document.getElementById('globulos-panel');
    const globulosBgLayer = document.getElementById('globulos-bg-layer');

    // Show header key metrics row ONLY for Directorio tab
    if (mainMetricsRow) {
      mainMetricsRow.style.display = (tab === 'all') ? '' : 'none';
    }

    // Toggle Glóbulos dynamic background parallax layer vs Giant CNTXT Hero Background
    const cntxtHeroBgLayer = document.getElementById('cntxt-hero-bg-layer');
    if (cntxtHeroBgLayer) {
      if (tab === 'globulos') {
        cntxtHeroBgLayer.classList.add('hide-cntxt-bg');
      } else {
        cntxtHeroBgLayer.classList.remove('hide-cntxt-bg');
      }
    }

    if (globulosBgLayer) {
      if (tab === 'globulos') {
        globulosBgLayer.classList.add('active');
      } else {
        globulosBgLayer.classList.remove('active');
      }
    }

    if (tab === 'pulsos') {
      if (dashboardGrid) dashboardGrid.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'none';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'flex';
      renderPulsePanel();
    } else if (tab === 'globulos') {
      if (dashboardGrid) dashboardGrid.style.display = 'none';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'flex';
      renderGlobulosPanel();
    } else {
      // 'all' (Directorio)
      if (dashboardGrid) dashboardGrid.style.display = '';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'none';
      renderDirectory();
    }
  }

  // Tabs Navigation Event Listeners
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetTab = btn.dataset.tab;
      showTab(targetTab);
    });
  });

  // Search input listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      renderDirectory();
      if (activeTab === 'pulsos') renderPulsePanel();
    });
  }

  // ── Filtros Rápidos Superiores (Todos, Con WhatsApp, Con Email, Con Empresa) ──
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all';
      currentPage = 1;
      renderDirectory();
    });
  });

  // ── Filtro Tipo de Persona (Todos, B2C Persona Natural, B2B Persona Jurídica) ──
  const personaFilterBtns = document.querySelectorAll('#persona-filter-group .persona-pill, .persona-pill');
  personaFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      personaFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPersonaFilter = btn.dataset.persona || 'all';
      currentPage = 1;
      renderDirectory();
    });
  });

  // ── Sincronización de Estado Activo en Botones KPI Superiores ──
  const kpiMetricCards = document.querySelectorAll('.metrics-row .metric-card');
  function syncKpiActiveState(filterKey) {
    kpiMetricCards.forEach(card => {
      const cardFilter = card.dataset.kpiFilter || '';
      if (cardFilter === filterKey) {
        card.classList.add('active-kpi');
      } else {
        card.classList.remove('active-kpi');
      }
    });
  }

  // ── Botones KPI Superiores Interactivos (6 Botones: Relaciones, Embajadores, Growth, Black, Gold, Silver) ──
  kpiMetricCards.forEach(card => {
    card.addEventListener('click', () => {
      const targetFilter = card.dataset.kpiFilter || 'all';
      selectedTagFilters.clear();
      if (targetFilter !== 'all') {
        selectedTagFilters.add(targetFilter);
      }
      currentPage = 1;
      syncTagFilterDropdownUI();
      syncKpiActiveState(targetFilter);
      renderDirectory();
    });
  });

  // ── Filtro Tipo de Relación (Dropdown Multi-selección Glassmorphism) ──
  function updateTagFilterCounts() {
    const tagCounts = {};
    TAG_KEYS.forEach(k => { tagCounts[k] = 0; });
    contactsData.forEach(c => {
      const tag = getContactTag(c).key;
      if (tagCounts[tag] !== undefined) tagCounts[tag]++;
    });
    TAG_KEYS.forEach(k => {
      const el = document.getElementById(`count-tag-${k}`);
      if (el) el.textContent = `(${tagCounts[k] || 0})`;
    });
  }

  function syncTagFilterDropdownUI() {
    const triggerLabel = document.getElementById('rel-filter-trigger-label');
    const triggerBadge = document.getElementById('rel-filter-badge');
    const triggerBtn = document.getElementById('rel-filter-trigger');

    const checkboxes = document.querySelectorAll('.rel-dropdown-cb');
    checkboxes.forEach(cb => {
      const tag = cb.value;
      const isChecked = selectedTagFilters.has(tag);
      cb.checked = isChecked;
      const parentOption = cb.closest('.rel-dropdown-option');
      if (parentOption) {
        parentOption.classList.toggle('selected', isChecked);
      }
    });

    if (selectedTagFilters.size === 0) {
      if (triggerLabel) triggerLabel.textContent = 'Todos los Tipos de Relación';
      if (triggerBadge) triggerBadge.textContent = 'Todos';
      if (triggerBtn) triggerBtn.classList.remove('active-filter');
    } else if (selectedTagFilters.size === 1) {
      const onlyTag = Array.from(selectedTagFilters)[0];
      const tagName = TAG_MAP[onlyTag] || onlyTag;
      if (triggerLabel) triggerLabel.textContent = tagName;
      if (triggerBadge) triggerBadge.textContent = '1 tipo';
      if (triggerBtn) triggerBtn.classList.add('active-filter');
    } else {
      if (triggerLabel) triggerLabel.textContent = `${selectedTagFilters.size} Tipos Seleccionados`;
      if (triggerBadge) triggerBadge.textContent = `${selectedTagFilters.size} activos`;
      if (triggerBtn) triggerBtn.classList.add('active-filter');
    }
  }

  const relFilterTrigger = document.getElementById('rel-filter-trigger');
  const relFilterDropdown = document.getElementById('rel-filter-dropdown');
  const relFilterBackdrop = document.getElementById('rel-filter-backdrop');
  const tagFiltersContainer = document.querySelector('.tag-filters-container');
  const btnRelSelectAll = document.getElementById('btn-rel-select-all');
  const btnRelClearAll = document.getElementById('btn-rel-clear-all');

  function openRelFilterDropdown() {
    if (!relFilterDropdown) return;
    relFilterDropdown.classList.add('is-open');
    if (relFilterTrigger) {
      relFilterTrigger.classList.add('active-dropdown');
      relFilterTrigger.setAttribute('aria-expanded', 'true');
    }
    if (tagFiltersContainer) tagFiltersContainer.classList.add('is-focused');
    if (relFilterBackdrop) {
      relFilterBackdrop.classList.add('active');
    }
  }

  function closeRelFilterDropdown() {
    if (!relFilterDropdown) return;
    relFilterDropdown.classList.remove('is-open');
    if (relFilterTrigger) {
      relFilterTrigger.classList.remove('active-dropdown');
      relFilterTrigger.setAttribute('aria-expanded', 'false');
    }
    if (tagFiltersContainer) tagFiltersContainer.classList.remove('is-focused');
    if (relFilterBackdrop) {
      relFilterBackdrop.classList.remove('active');
    }
  }

  if (relFilterTrigger && relFilterDropdown) {
    relFilterTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = relFilterDropdown.classList.contains('is-open');
      if (isOpen) {
        closeRelFilterDropdown();
      } else {
        openRelFilterDropdown();
      }
    });

    if (relFilterBackdrop) {
      relFilterBackdrop.addEventListener('click', () => {
        closeRelFilterDropdown();
      });
    }

    // Cerrar al dar clic afuera
    document.addEventListener('click', (e) => {
      if (!relFilterDropdown.contains(e.target) && !relFilterTrigger.contains(e.target)) {
        closeRelFilterDropdown();
      }
    });

    // Interacción con opciones de la lista
    document.querySelectorAll('.rel-dropdown-option').forEach(option => {
      option.addEventListener('click', (e) => {
        if (e.target.tagName.toLowerCase() !== 'input') {
          const cb = option.querySelector('.rel-dropdown-cb');
          if (cb) {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
          }
        }
      });
    });

    document.querySelectorAll('.rel-dropdown-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const tag = cb.value;
        if (cb.checked) {
          selectedTagFilters.add(tag);
        } else {
          selectedTagFilters.delete(tag);
        }
        currentPage = 1;
        syncTagFilterDropdownUI();
        renderDirectory();
      });
    });

    if (btnRelSelectAll) {
      btnRelSelectAll.addEventListener('click', (e) => {
        e.stopPropagation();
        TAG_KEYS.forEach(k => selectedTagFilters.add(k));
        currentPage = 1;
        syncTagFilterDropdownUI();
        renderDirectory();
      });
    }

    if (btnRelClearAll) {
      btnRelClearAll.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedTagFilters.clear();
        currentPage = 1;
        syncTagFilterDropdownUI();
        renderDirectory();
      });
    }
  }

  // ── Cambio Masivo de Relación en Encabezado (Header Bulk Tag Action) ──
  if (btnBulkTagHeader && headerBulkDropdown) {
    btnBulkTagHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedIds.size === 0) {
        showAgentToast('⚠️ Selección Vacía', 'Marca al menos una casilla en las relaciones para aplicar un cambio masivo.');
        return;
      }
      const isHidden = headerBulkDropdown.style.display === 'none';
      headerBulkDropdown.style.display = isHidden ? 'block' : 'none';
      updateBulkSelectionUI();
    });

    document.addEventListener('click', (e) => {
      if (!headerBulkDropdown.contains(e.target) && !btnBulkTagHeader.contains(e.target)) {
        headerBulkDropdown.style.display = 'none';
      }
    });

    document.querySelectorAll('.bulk-apply-tag-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tagKey = btn.dataset.bulkTag;
        if (!tagKey || selectedIds.size === 0) return;

        const count = selectedIds.size;
        const tagName = TAG_MAP[tagKey] || tagKey;
        const idsToUpdate = Array.from(selectedIds);

        // 1. Actualización inmediata en memoria y UI
        idsToUpdate.forEach(id => {
          const target = contactsData.find(c => String(c.id) === String(id) || Number(c.id) === Number(id));
          if (target) {
            target.tipo_relacion = tagKey;
            target.tag = tagKey;
          }
        });

        headerBulkDropdown.style.display = 'none';
        selectedIds.clear();
        updateBulkSelectionUI();
        renderDirectory();
        updateMetrics();
        if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();
        showAgentToast('🎉 Cambio Masivo Aplicado', `${count} relaciones actualizadas a "${tagName}".`);

        // 2. Persistir en Django API
        updateSyncStatusIndicator('saving');
        try {
          await Promise.all(idsToUpdate.map(id => ApiService.updateContacto(id, { tipo_relacion: tagKey })));
          updateSyncStatusIndicator('synced');
        } catch (err) {
          updateSyncStatusIndicator('offline');
          console.warn('Persistencia masiva completada localmente:', err);
        }
      });
    });
  }

  // ── Cambio Masivo de Canal de Prospección ──
  if (btnBulkChannelHeader && headerBulkChannelDropdown) {
    btnBulkChannelHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedIds.size === 0) {
        showAgentToast('⚠️ Selección Vacía', 'Marca al menos una casilla en las relaciones para aplicar un cambio masivo de canal.');
        return;
      }
      if (headerBulkDropdown) headerBulkDropdown.style.display = 'none';
      const isHidden = headerBulkChannelDropdown.style.display === 'none';
      headerBulkChannelDropdown.style.display = isHidden ? 'block' : 'none';
      updateBulkSelectionUI();
    });

    document.addEventListener('click', (e) => {
      if (!headerBulkChannelDropdown.contains(e.target) && !btnBulkChannelHeader.contains(e.target)) {
        headerBulkChannelDropdown.style.display = 'none';
      }
    });

    document.querySelectorAll('.bulk-apply-channel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const chanKey = btn.dataset.bulkChannel;
        if (!chanKey || selectedIds.size === 0) return;

        const count = selectedIds.size;
        const chanName = CHANNEL_MAP[chanKey] || chanKey;
        const idsToUpdate = Array.from(selectedIds);

        // 1. Actualización inmediata en memoria y UI
        idsToUpdate.forEach(id => {
          const target = contactsData.find(c => String(c.id) === String(id) || Number(c.id) === Number(id));
          if (target) {
            target.canal_entrada = chanKey;
            target.channel = chanKey;
          }
        });

        headerBulkChannelDropdown.style.display = 'none';
        selectedIds.clear();
        updateBulkSelectionUI();
        renderDirectory();
        updateMetrics();
        updateChannelFilterCounts();
        if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();
        showAgentToast('🩸 Canal Masivo Aplicado', `${count} relaciones actualizadas al canal "${chanName}".`);

        // 2. Persistir en Django API
        updateSyncStatusIndicator('saving');
        try {
          await Promise.all(idsToUpdate.map(id => ApiService.updateContacto(id, { canal_entrada: chanKey })));
          updateSyncStatusIndicator('synced');
        } catch (err) {
          updateSyncStatusIndicator('offline');
          console.warn('Persistencia masiva de canal completada localmente:', err);
        }
      });
    });
  }

  // ── Filtro de Canales de Prospección (Arterial Dock Dropdown & Backdrop Focus) ──
  const prospectingPulseTrigger = document.getElementById('prospecting-pulse-trigger');
  const prospectingMenu = document.getElementById('prospecting-menu');
  const channelFilterBackdrop = document.getElementById('channel-filter-backdrop');
  const prospectingSideDock = document.getElementById('prospecting-side-dock');
  const activeChannelBadge = document.getElementById('active-channel-badge');

  function openChannelFilterDropdown() {
    if (!prospectingMenu) return;
    prospectingMenu.classList.add('is-open');
    if (prospectingPulseTrigger) {
      prospectingPulseTrigger.classList.add('active-dropdown');
      prospectingPulseTrigger.setAttribute('aria-expanded', 'true');
    }
    if (prospectingSideDock) prospectingSideDock.classList.add('is-focused');
    if (channelFilterBackdrop) channelFilterBackdrop.classList.add('active');
  }

  function closeChannelFilterDropdown() {
    if (!prospectingMenu) return;
    prospectingMenu.classList.remove('is-open');
    if (prospectingPulseTrigger) {
      prospectingPulseTrigger.classList.remove('active-dropdown');
      prospectingPulseTrigger.setAttribute('aria-expanded', 'false');
    }
    if (prospectingSideDock) prospectingSideDock.classList.remove('is-focused');
    if (channelFilterBackdrop) channelFilterBackdrop.classList.remove('active');
  }

  function updateChannelFilterCounts() {
    const chanCounts = { all: contactsData.length };
    ['fb', 'ig', 'gg', 'gmaps', 'referidos', 'prospeccion', 'ferias', 'oficinas', 'capital'].forEach(k => {
      chanCounts[k] = 0;
    });

    contactsData.forEach(c => {
      const chan = getContactChannel(c);
      if (chan && chanCounts[chan.key] !== undefined) {
        chanCounts[chan.key]++;
      }
    });

    const allEl = document.getElementById('count-chan-all');
    if (allEl) allEl.textContent = `(${contactsData.length})`;

    ['fb', 'ig', 'gg', 'gmaps', 'referidos', 'prospeccion', 'ferias', 'oficinas', 'capital'].forEach(k => {
      const el = document.getElementById(`count-chan-${k}`);
      if (el) el.textContent = `(${chanCounts[k] || 0})`;
    });
  }

  if (prospectingPulseTrigger && prospectingMenu) {
    prospectingPulseTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = prospectingMenu.classList.contains('is-open');
      if (isOpen) {
        closeChannelFilterDropdown();
      } else {
        openChannelFilterDropdown();
      }
    });

    if (channelFilterBackdrop) {
      channelFilterBackdrop.addEventListener('click', closeChannelFilterDropdown);
    }

    document.addEventListener('click', (e) => {
      if (!prospectingMenu.contains(e.target) && !prospectingPulseTrigger.contains(e.target)) {
        closeChannelFilterDropdown();
      }
    });

    document.querySelectorAll('.channel-item-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chanKey = btn.dataset.channel || 'all';
        currentChannelFilter = chanKey;

        document.querySelectorAll('.channel-item-row').forEach(b => {
          b.classList.toggle('active', (b.dataset.channel || 'all') === chanKey);
        });

        if (activeChannelBadge) {
          if (chanKey === 'all') {
            activeChannelBadge.style.display = 'none';
          } else {
            const chanName = CHANNEL_MAP[chanKey] || chanKey;
            activeChannelBadge.textContent = chanName;
            activeChannelBadge.style.display = 'inline-block';
          }
        }

        closeChannelFilterDropdown();
        currentPage = 1;
        renderDirectory();
      });
    });
  }

  // ── Paginación ──
  if (btnPagePrev) {
    btnPagePrev.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderDirectory();
      }
    });
  }
  if (btnPageNext) {
    btnPageNext.addEventListener('click', () => {
      currentPage++;
      renderDirectory();
    });
  }

  // ── View Mode Toggle — Grid / Lista (Personas) ──────────────────────
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewList = document.getElementById('btn-view-list');

  function setViewMode(mode) {
    viewMode = mode;
    if (!clientGrid) return;

    const viewBtns = [btnViewGrid, btnViewList].filter(Boolean);
    viewBtns.forEach(b => b.classList.remove('active'));

    const listHeader = document.getElementById('client-list-header');

    if (mode === 'list') {
      clientGrid.classList.add('list-view');
      if (listHeader) listHeader.style.display = 'grid';
      if (btnViewList) btnViewList.classList.add('active');
    } else {
      clientGrid.classList.remove('list-view');
      if (listHeader) listHeader.style.display = 'none';
      if (btnViewGrid) btnViewGrid.classList.add('active');
    }
    renderDirectory();
  }

  if (btnViewGrid) btnViewGrid.addEventListener('click', () => setViewMode('grid'));
  if (btnViewList) btnViewList.addEventListener('click', () => setViewMode('list'));

  // ── View Mode Toggle — Grid / Lista (Empresas) ──────────────────────
  const btnEmpresaViewGrid = document.getElementById('btn-empresa-view-grid');
  const btnEmpresaViewList = document.getElementById('btn-empresa-view-list');
  let empresaViewMode = 'grid';

  function setEmpresaViewMode(mode) {
    empresaViewMode = mode;
    const empGrid = document.getElementById('empresa-cards-grid') || document.getElementById('empresas-grid');
    if (!empGrid) return;

    const viewBtns = [btnEmpresaViewGrid, btnEmpresaViewList].filter(Boolean);
    viewBtns.forEach(b => b.classList.remove('active'));

    if (mode === 'list') {
      empGrid.classList.add('list-view');
      if (btnEmpresaViewList) btnEmpresaViewList.classList.add('active');
    } else {
      empGrid.classList.remove('list-view');
      if (btnEmpresaViewGrid) btnEmpresaViewGrid.classList.add('active');
    }
  }

  if (btnEmpresaViewGrid) btnEmpresaViewGrid.addEventListener('click', () => setEmpresaViewMode('grid'));
  if (btnEmpresaViewList) btnEmpresaViewList.addEventListener('click', () => setEmpresaViewMode('list'));

  // Iniciar la carga de datos conectando a PostgreSQL / Django API
  loadInitialData();


  // ═══════════════════════════════════════════════════════════════════
  // CINEMATIC INTRO SPLASH OVERLAY — 4-COLOR HEARTBEAT
  // ═══════════════════════════════════════════════════════════════════
  const splashOverlay = document.getElementById('splash-overlay');
  const splashSkipBtn = document.getElementById('splash-skip-btn');
  const brandPill = document.querySelector('.brand-pill');
  const splashFullscreenBtn = document.getElementById('splash-fullscreen-btn');
  let splashDismissTimer = null;

  // Rotating quote catalog — Pulse & Relationships
  const SPLASH_QUOTES = [
    { text: 'Las personas no compran lo que haces, compran por qué lo haces; y si no confían en ti, la transacción jamás ocurrirá.', author: '— Inspirado en Simon Sinek' },
    { text: 'Si le gustas a la gente, te escucharán; pero si confían en ti, harán negocios contigo.', author: '— Zig Ziglar' },
    { text: 'Las redes de contactos no son para coleccionar nombres, sino para cultivar relaciones.', author: '— Tim Sanders' },
    { text: 'Los negocios se hacen con personas, no con empresas. Cuando entiendes la mente y el corazón de las personas, el éxito comercial es solo una consecuencia.', author: '— Jürgen Klaric' },
    { text: 'La moneda más valiosa en los negocios no es el dinero, es la confianza; y la confianza solo se construye a través de relaciones genuinas.', author: '— Principio de Influencia y Reciprocidad' },
    { text: 'No busques clientes para tus productos; busca los productos y experiencias correctas para tus clientes.', author: '— Seth Godin' },
    { text: 'El activo más valioso de una empresa no es su edificio, sus planos o su marca, sino la red de personas que creen en su visión.', author: '— Filosofía R.E.D.' },
    { text: 'Las transacciones crean clientes de una sola vez; las relaciones profundas crean embajadores para toda la vida.', author: '— David Sandler' },
    { text: 'La calidad de tu vida y de tu negocio es directamente proporcional a la calidad de las relaciones que decides cultivar.', author: '— Tony Robbins' },
    { text: 'El diseño crea cultura. La cultura moldea valores. Los valores determinan el futuro. Pero son las relaciones las que mantienen viva la estructura.', author: '— Adaptación al Manifiesto CNTXT' }
  ];

  function setSplashQuote() {
    const quoteTextEl = document.getElementById('splash-quote-text');
    const quoteAuthorEl = document.getElementById('splash-quote-author');
    if (!quoteTextEl || !quoteAuthorEl) return;
    const idx = Math.floor(Math.random() * SPLASH_QUOTES.length);
    const q = SPLASH_QUOTES[idx];
    quoteTextEl.style.opacity = '0';
    quoteAuthorEl.style.opacity = '0';
    setTimeout(() => {
      quoteTextEl.textContent = `"${q.text}"`;
      quoteAuthorEl.textContent = q.author;
      quoteTextEl.style.transition = 'opacity 0.6s ease';
      quoteAuthorEl.style.transition = 'opacity 0.6s ease 0.15s';
      quoteTextEl.style.opacity = '1';
      quoteAuthorEl.style.opacity = '1';
    }, 220);
  }

  // Splash energy cursor
  const splashCursorDot = document.getElementById('splash-cursor-dot');
  const splashCursorHalo = document.getElementById('splash-cursor-halo');
  let splashCursorRafId = null;
  let splashMouseX = -500, splashMouseY = -500;
  let splashHaloX = -500, splashHaloY = -500;

  function onSplashMouseMove(e) { splashMouseX = e.clientX; splashMouseY = e.clientY; }

  function animateSplashCursor() {
    if (splashCursorDot) splashCursorDot.style.transform = `translate(calc(${splashMouseX}px - 50%), calc(${splashMouseY}px - 50%))`;
    splashHaloX += (splashMouseX - splashHaloX) * 0.12;
    splashHaloY += (splashMouseY - splashHaloY) * 0.12;
    if (splashCursorHalo) splashCursorHalo.style.transform = `translate(calc(${splashHaloX}px - 50%), calc(${splashHaloY}px - 50%))`;
    splashCursorRafId = requestAnimationFrame(animateSplashCursor);
  }

  function startSplashEnergyCursor() {
    if (splashCursorDot) splashCursorDot.style.display = 'block';
    if (splashCursorHalo) splashCursorHalo.style.display = 'block';
    if (splashOverlay) splashOverlay.addEventListener('mousemove', onSplashMouseMove);
    splashCursorRafId = requestAnimationFrame(animateSplashCursor);
  }

  function stopSplashEnergyCursor() {
    if (splashOverlay) splashOverlay.removeEventListener('mousemove', onSplashMouseMove);
    if (splashCursorRafId) { cancelAnimationFrame(splashCursorRafId); splashCursorRafId = null; }
    if (splashCursorDot) splashCursorDot.style.display = 'none';
    if (splashCursorHalo) splashCursorHalo.style.display = 'none';
  }

  function dismissSplash(force = false) {
    if (!splashOverlay) return;

    // Si el usuario no está autenticado y no es un descarte forzado (tras login),
    // desplegar el recuadro de login interactivo:
    if (!force && window.AuthManager && !window.AuthManager.isAuthenticated()) {
      window.AuthManager.showLoginOverlay();
      return;
    }

    try {
      sessionStorage.setItem('cntxt_red_intro_dismissed', '1');
    } catch (e) {}
    splashOverlay.classList.add('dismissed');
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
    stopSplashEnergyCursor();
    setTimeout(() => { splashOverlay.style.display = 'none'; }, 850);
  }

  function playSplashIntro(force = false) {
    if (!splashOverlay) return;
    let alreadyDismissed = false;
    const isAuthed = window.AuthManager && window.AuthManager.isAuthenticated();
    if (!isAuthed) {
      try { sessionStorage.removeItem('cntxt_red_intro_dismissed'); } catch (e) {}
    } else {
      try {
        alreadyDismissed = sessionStorage.getItem('cntxt_red_intro_dismissed') === '1';
      } catch (e) {}
    }

    if (!force && alreadyDismissed) {
      splashOverlay.classList.add('dismissed');
      splashOverlay.style.display = 'none';
      stopSplashEnergyCursor();
      return;
    }

    splashOverlay.style.display = 'flex';
    splashOverlay.classList.remove('dismissed');
    const ecgPulseLine = document.querySelector('.splash-ecg-pulse-line');
    if (ecgPulseLine) {
      ecgPulseLine.style.animation = 'none';
      ecgPulseLine.offsetHeight;
      ecgPulseLine.style.animation = 'splash-ecg-flow 3s cubic-bezier(0.25, 0.1, 0.25, 1) infinite';
    }
    setSplashQuote();
    startSplashEnergyCursor();
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
  }

  // Exponer para AuthManager y llamadas externas
  window.dismissSplash = dismissSplash;
  window.playSplashIntro = playSplashIntro;

  // Wire up button events
  if (splashSkipBtn) splashSkipBtn.addEventListener('click', () => dismissSplash(false));
  if (brandPill) {
    brandPill.style.cursor = 'pointer';
    brandPill.title = 'Hacer clic para ver la animación del ritmo cardíaco R.E.D.';
    brandPill.addEventListener('click', () => playSplashIntro(true));
  }

  // ═══════════════════════════════════════════════════════════════════
  // FULLSCREEN TOGGLE (Header Button & Splash Overlay Button)
  // ═══════════════════════════════════════════════════════════════════
  const headerFullscreenBtn = document.getElementById('fullscreen-btn');

  function isFullscreenActive() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  function toggleFullscreen() {
    const docEl = document.documentElement;
    if (!isFullscreenActive()) {
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(() => {});
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  function updateFullscreenIcon() {
    const isFs = isFullscreenActive();
    [headerFullscreenBtn, splashFullscreenBtn].filter(Boolean).forEach(btn => {
      const expand = btn.querySelector('.icon-expand');
      const collapse = btn.querySelector('.icon-collapse');
      if (expand) expand.style.display = isFs ? 'none' : 'block';
      if (collapse) collapse.style.display = isFs ? 'block' : 'none';
      btn.classList.toggle('is-fullscreen', isFs);
      btn.title = isFs ? 'Salir de Pantalla Completa' : 'Pantalla Completa';
    });
  }

  if (headerFullscreenBtn) headerFullscreenBtn.addEventListener('click', toggleFullscreen);
  if (splashFullscreenBtn) splashFullscreenBtn.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', updateFullscreenIcon);
  document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
  document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
  document.addEventListener('MSFullscreenChange', updateFullscreenIcon);

  // Matriz de Intensidad Relacional: Click/Touch toggle support for criteria cards & pulse levels
  const matrizCards = document.querySelectorAll('.matriz-crit-card');
  matrizCards.forEach(card => {
    card.addEventListener('click', (e) => {
      const wasExpanded = card.classList.contains('is-expanded');
      matrizCards.forEach(c => c.classList.remove('is-expanded'));
      if (!wasExpanded) {
        card.classList.add('is-expanded');
      }
    });
  });

  const levelBoxes = document.querySelectorAll('.matriz-level-box');
  levelBoxes.forEach(box => {
    box.addEventListener('click', (e) => {
      const wasExpanded = box.classList.contains('is-expanded');
      levelBoxes.forEach(b => b.classList.remove('is-expanded'));
      if (!wasExpanded) {
        box.classList.add('is-expanded');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.matriz-crit-card')) {
      matrizCards.forEach(c => c.classList.remove('is-expanded'));
    }
    if (!e.target.closest('.matriz-level-box')) {
      levelBoxes.forEach(b => b.classList.remove('is-expanded'));
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD STATS LOADER — Conecta KPIs del panel con el backend
  // ═══════════════════════════════════════════════════════════════════

  async function loadDashboardStats() {
    if (!window.AuthManager || !window.AuthManager.isAuthenticated()) return;

    try {
      const stats = await ApiService.getDashboardStats();
      if (!stats || stats.status !== 'success') return;

      const { kpis, pulsos, fases_red, proyectos_por_estado, actividad_reciente } = stats;

      // Actualizar contadores del header / dashboard KPIs
      const _set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.textContent = typeof val === 'number' ? val.toLocaleString('es-CO') : val;
      };

      _set('kpi-total-contactos', kpis?.total_contactos);
      _set('kpi-total-empresas', kpis?.total_empresas);
      _set('kpi-total-proyectos', kpis?.total_proyectos);
      _set('kpi-pulsos-calientes', kpis?.pulsos_calientes);
      _set('kpi-monto-pipeline', kpis?.monto_total_pipeline
        ? `$${Number(kpis.monto_total_pipeline).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : '$0');

      // Pulsos por clasificación
      if (pulsos) {
        _set('kpi-pulso-p1', pulsos.P1);
        _set('kpi-pulso-p2', pulsos.P2);
        _set('kpi-pulso-p3', pulsos.P3);
        _set('kpi-pulso-p4', pulsos.P4);
      }

      // Feed de actividad reciente
      if (actividad_reciente && actividad_reciente.length > 0) {
        const feedEl = document.getElementById('activity-feed-list');
        if (feedEl) {
          const icons = {
            contacto_creado: '👤', contacto_editado: '✏️', contacto_eliminado: '🗑️',
            empresa_creada: '🏢', empresa_editada: '✏️', empresa_eliminada: '🗑️',
            proyecto_creado: '🩸', proyecto_editado: '✏️', proyecto_eliminado: '🗑️',
            pulso_evaluado: '💓', estado_cambiado: '🔄', login: '🔐', otro: '📌'
          };
          feedEl.innerHTML = actividad_reciente.slice(0, 8).map(a => `
            <li class="activity-feed-item">
              <span class="activity-icon">${icons[a.tipo] || '📌'}</span>
              <div class="activity-content">
                <span class="activity-desc">${a.descripcion || a.tipo_display}</span>
                <span class="activity-meta">${a.usuario_nombre || 'Sistema'} · ${new Date(a.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            </li>
          `).join('');
        }
      }

      updateSyncStatusIndicator('synced');
    } catch (err) {
      console.warn('[Dashboard Stats] Error al cargar KPIs:', err);
    }
  }

  // ─── Exponer funciones globales para AuthManager ───
  window.loadDashboardStats = loadDashboardStats;
  window.loadAllDataFromAPI = async function() {
    try {
      if (!window.AuthManager || !window.AuthManager.isAuthenticated()) return;
      await loadInitialData();
      await loadDashboardStats();
    } catch (err) {
      console.warn('[loadAllDataFromAPI] Error:', err);
    }
  };

  // Carga inicial de datos si el usuario ya está autenticado
  if (window.AuthManager && window.AuthManager.isAuthenticated()) {
    loadInitialData();
    loadDashboardStats();
  }

  // Play intro on page load
  playSplashIntro();
});
