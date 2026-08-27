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

document.addEventListener('DOMContentLoaded', () => {

  // ═══════════════════════════════════════════════════════════════════
  // DJANGO REST API CLIENT & DATA ADAPTER LAYER
  // ═══════════════════════════════════════════════════════════════════
  const API_BASE = (window.CNTXT_CONFIG && window.CNTXT_CONFIG.SYNC && window.CNTXT_CONFIG.SYNC.API_BASE_URL)
    ? window.CNTXT_CONFIG.SYNC.API_BASE_URL.replace(/\/+$/, '')
    : 'http://127.0.0.1:8000/api';

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

  async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'X-CSRFToken': CSRF_TOKEN
    };
    options.headers = { ...defaultHeaders, ...(options.headers || {}) };

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const targetUrl = `${API_BASE}${cleanEndpoint}`;

    try {
      const res = await fetch(targetUrl, options);
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }
      if (res.status === 204) return true;
      return await res.json();
    } catch (err) {
      console.warn(`[Django API Error] ${targetUrl}:`, err);
      throw err;
    }
  }

  const ApiService = {
    async getInitialData() {
      try {
        return await apiFetch('/initial-data/');
      } catch (err) {
        console.warn('Endpoint /initial-data/ no disponible o con error, consultando endpoints individuales...', err);
        const [contactosRes, empresasRes, proyectosRes] = await Promise.all([
          apiFetch('/contactos/').catch(() => apiFetch('/contacto/')).catch(() => []),
          apiFetch('/empresas/').catch(() => apiFetch('/empresa/')).catch(() => []),
          apiFetch('/proyectos/').catch(() => apiFetch('/proyecto/')).catch(() => [])
        ]);

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
    async getProyectos() {
      return await apiFetch('/proyectos/');
    },
    async createProyecto(data) {
      return await apiFetch('/proyectos/', { method: 'POST', body: JSON.stringify(data) });
    },
    async updateProyecto(id, data) {
      return await apiFetch(`/proyectos/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
    },
    async deleteProyecto(id) {
      return await apiFetch(`/proyectos/${id}/`, { method: 'DELETE' });
    }
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

  // Pulse Vital Definitions (1 - 4)
  const PULSE_DEFINITIONS = {
    1: {
      level: 1,
      key: 'sin_pulso',
      name: 'Sin Pulso',
      color: '#545b6b',
      border: 'rgba(84, 91, 107, 0.4)',
      bg: 'rgba(84, 91, 107, 0.1)',
      desc: 'Contacto frío o inactivo. Requiere reactivación inicial.'
    },
    2: {
      level: 2,
      key: 'pulso_debil',
      name: 'Pulso Débil',
      color: '#00e5ff',
      border: 'rgba(0, 229, 255, 0.4)',
      bg: 'rgba(0, 229, 255, 0.1)',
      desc: 'Primer contacto o interés preliminar registrado.'
    },
    3: {
      level: 3,
      key: 'pulso_intenso',
      name: 'Pulso Intenso',
      color: '#ff2a4b',
      border: 'rgba(255, 42, 75, 0.5)',
      bg: 'rgba(255, 42, 75, 0.12)',
      desc: 'Interacción constante, negociación activa o aliado cercano.'
    },
    4: {
      level: 4,
      key: 'tejido_integrado',
      name: 'Tejido Integrado',
      color: '#00e676',
      border: 'rgba(0, 230, 118, 0.5)',
      bg: 'rgba(0, 230, 118, 0.12)',
      desc: 'Cliente consolidado o miembro integral del ecosistema CNTXT.'
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

  function getContactPhase(client) {
    return (client.fase_red || client.phase || 'R').toUpperCase();
  }

  async function setContactPhase(clientId, phase) {
    updateSyncStatusIndicator('saving');
    try {
      await ApiService.updateContacto(clientId, { fase_red: phase });
      const target = contactsData.find(c => c.id === clientId);
      if (target) target.fase_red = phase;
      updateSyncStatusIndicator('synced');
      updatePhaseCounts();
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
      if (selectedContact && selectedContact.id === clientId) {
        updateModalFields();
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
        setSpotlight(selectedContact);
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
  const selectedIds = new Set();

  // Detail Modal DOM
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalAvatar = document.getElementById('modal-avatar');
  const modalName = document.getElementById('modal-name');
  const modalEmpresa = document.getElementById('modal-empresa');
  const modalOficio = document.getElementById('modal-oficio');
  const modalCiudad = document.getElementById('modal-ciudad');
  const modalPhone = document.getElementById('modal-phone');
  const modalEmail = document.getElementById('modal-email');
  const modalBtnWapp = document.getElementById('modal-btn-wapp');
  const modalBtnCall = document.getElementById('modal-btn-call');
  const modalBtnMail = document.getElementById('modal-btn-mail');
  const modalTagContainer = document.getElementById('modal-tag-container');
  const modalPulseContainer = document.getElementById('modal-pulse-container');
  const modalChannelContainer = document.getElementById('modal-channel-container');
  const modalPhaseContainer = document.getElementById('modal-phase-container');
  const modalNotesInput = document.getElementById('modal-notes-input');
  const modalSaveNotes = document.getElementById('modal-save-notes');

  // Edit Mode DOM
  const btnToggleEditMode = document.getElementById('btn-toggle-edit-mode');
  const modalViewMode = document.getElementById('modal-view-mode');
  const modalEditMode = document.getElementById('modal-edit-mode');
  const btnSaveContactEdit = document.getElementById('btn-save-contact-edit');
  const btnCancelContactEdit = document.getElementById('btn-cancel-contact-edit');
  const editInputNome = document.getElementById('edit-input-nome');
  const editSelectEmpresa = document.getElementById('edit-select-empresa');
  const editInputOficio = document.getElementById('edit-input-oficio');
  const editInputCiudad = document.getElementById('edit-input-ciudad');
  const editInputFname = document.getElementById('edit-input-fname');
  const editInputLname = document.getElementById('edit-input-lname');
  const editInputPhone = document.getElementById('edit-input-phone');
  const editInputEmail = document.getElementById('edit-input-email');

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
  const addInputLname = document.getElementById('add-input-lname');
  const addInputPhone = document.getElementById('add-input-phone');
  const addInputEmail = document.getElementById('add-input-email');
  const addTagContainer = document.getElementById('add-tag-container');
  let selectedNewContactTag = 'lead';
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
        numero: c.telefono || '',
        email: c.email || '',
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

    } catch (err) {
      console.warn('Fallo al conectar con Django REST API, cargando fallback...', err);
      updateSyncStatusIndicator('offline');

      // Respaldo de contingencia desde CSV si la API no está disponible
      if (window.CNTXT_CONTACTS_CSV) {
        parseCSV(window.CNTXT_CONTACTS_CSV);
      }
    }

    populateEmpresaSelects();
    renderEmpresaSectorPills();
    renderEmpresasCards();
    updatePhaseCounts();
    updateMetrics();
    renderDirectory();
    renderGlobulosPanel();
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
        parsed.push({
          id: i,
          nome: cols[0] || 'Contacto sin nombre',
          numero: cols[1] || '',
          email: cols[2] || '',
          empresa: cols[7] || '',
          pulso_vital: 1,
          fase_red: 'R',
          tipo_relacion: 'prospecto',
          tipo_persona: 'natural',
          canal_entrada: 'directo'
        });
      }
    }
    contactsData = parsed;
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
      // Búsqueda por texto
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const matchSearch = !q ||
        (c.nome && c.nome.toLowerCase().includes(q)) ||
        (c.empresa && c.empresa.toLowerCase().includes(q)) ||
        (c.numero && c.numero.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q));

      // Filtro de fase / tab
      let matchTab = true;
      if (activeTab === 'fase_r') matchTab = getContactPhase(c) === 'R';
      else if (activeTab === 'fase_d') matchTab = getContactPhase(c) === 'D';
      else if (activeTab === 'fase_e') matchTab = getContactPhase(c) === 'E';

      // Filtro de etiqueta
      const tagKey = getContactTag(c).key;
      const matchTag = currentTagFilter === 'all' || tagKey === currentTagFilter;

      // Filtro de canal
      const chan = getContactChannel(c);
      const matchChan = currentChannelFilter === 'all' || (chan && chan.key === currentChannelFilter);

      // Filtro de persona
      const persona = getContactPersona(c);
      const matchPersona = currentPersonaFilter === 'all' || persona === currentPersonaFilter;

      return matchSearch && matchTab && matchTag && matchChan && matchPersona;
    });

    lastFiltered = filtered;

    if (clientCountEl) clientCountEl.textContent = filtered.length;
    if (activeTagCountEl) activeTagCountEl.textContent = `${filtered.length} visibles`;

    // Paginación
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const paginated = filtered.slice(startIdx, startIdx + PAGE_SIZE);

    if (paginationInfo) {
      paginationInfo.textContent = `Página ${currentPage} de ${totalPages} (${filtered.length} contactos)`;
    }

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
      const phase = getContactPhase(c);
      const isSelected = selectedIds.has(c.id);

      return `
        <div class="client-card ${isSelected ? 'selected' : ''}" data-id="${c.id}">
          <div class="card-selection-checkbox">
            <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); window.toggleSelectContact(${c.id});">
          </div>
          <div class="card-pulse-indicator" style="background: ${pulse.color};" title="Pulso: ${pulse.name}"></div>
          <div class="card-header-row">
            <div class="card-avatar" style="border-color: ${pulse.color}; color: ${pulse.color};">
              ${getInitials(c.nome)}
            </div>
            <div class="card-title-group">
              <h4 class="card-client-name">${escapeHtml(c.nome)}</h4>
              <span class="card-company-name">${escapeHtml(c.empresa || 'Particular')}</span>
            </div>
          </div>
          <div class="card-tags-row">
            <span class="card-tag-badge">${escapeHtml(tag.name)}</span>
            <span class="card-phase-badge phase-${phase}">Fase ${phase}</span>
          </div>
          <div class="card-contact-meta">
            ${c.numero ? `<span class="meta-item">📞 ${escapeHtml(c.numero)}</span>` : ''}
            ${c.email ? `<span class="meta-item">✉️ ${escapeHtml(c.email)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Listener para abrir detalle
    clientGrid.querySelectorAll('.client-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id) || card.dataset.id;
        const target = contactsData.find(c => c.id == id);
        if (target) openDetailModal(target);
      });
    });
  }

  window.toggleSelectContact = function (id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);

    if (bulkActionBar && bulkSelectedCount) {
      bulkSelectedCount.textContent = `${selectedIds.size} seleccionados`;
      bulkActionBar.style.display = selectedIds.size > 0 ? 'flex' : 'none';
    }
    renderDirectory();
  };

  // ═══════════════════════════════════════════════════════════════════
  // MODAL DE DETALLE & EDICIÓN DE CONTACTO
  // ═══════════════════════════════════════════════════════════════════
  function openDetailModal(contact) {
    selectedContact = contact;
    isEditMode = false;
    toggleEditView(false);

    if (modalName) modalName.textContent = contact.nome;
    if (modalEmpresa) modalEmpresa.textContent = contact.empresa || 'Sin Empresa Registrada';
    if (modalOficio) modalOficio.textContent = contact.oficio || contact.rol || 'Cargo no especificado';
    if (modalCiudad) modalCiudad.textContent = contact.ciudad || 'Colombia';
    if (modalPhone) modalPhone.textContent = contact.numero || 'No disponible';
    if (modalEmail) modalEmail.textContent = contact.email || 'No disponible';
    if (modalNotesInput) modalNotesInput.value = contact.notas || '';

    // Direct Action Links
    if (modalBtnWapp) modalBtnWapp.href = contact.numero ? `https://wa.me/${contact.numero.replace(/[^0-9]/g, '')}` : '#';
    if (modalBtnCall) modalBtnCall.href = contact.numero ? `tel:${contact.numero}` : '#';
    if (modalBtnMail) modalBtnMail.href = contact.email ? `mailto:${contact.email}` : '#';

    renderModalTags(contact);
    renderModalPulse(contact);
    renderModalChannels(contact);
    renderModalPhase(contact);

    if (modalOverlay) {
      modalOverlay.style.display = 'flex';
      modalOverlay.classList.add('active');
    }
  }

  function toggleEditView(enable) {
    isEditMode = enable;
    if (modalViewMode) modalViewMode.style.display = enable ? 'none' : 'block';
    if (modalEditMode) modalEditMode.style.display = enable ? 'block' : 'none';
    if (btnToggleEditMode) btnToggleEditMode.textContent = enable ? '👁️ Ver Detalle' : '✏️ Editar Datos';

    if (enable && selectedContact) {
      if (editInputNome) editInputNome.value = selectedContact.nome || '';
      if (editSelectEmpresa) editSelectEmpresa.value = selectedContact.empresa || '';
      if (editInputOficio) editInputOficio.value = selectedContact.oficio || selectedContact.rol || '';
      if (editInputPhone) editInputPhone.value = selectedContact.numero || '';
      if (editInputEmail) editInputEmail.value = selectedContact.email || '';
    }
  }

  function renderModalTags(contact) {
    if (!modalTagContainer) return;
    const currentTag = getContactTag(contact).key;
    modalTagContainer.innerHTML = TAG_KEYS.map(k => `
      <button class="modal-tag-pill ${k === currentTag ? 'active' : ''}" onclick="window.updateContactTag('${k}')">
        ${escapeHtml(TAG_MAP[k])}
      </button>
    `).join('');
  }

  function renderModalPulse(contact) {
    if (!modalPulseContainer) return;
    const currentLevel = (getContactPulse(contact)).level;
    modalPulseContainer.innerHTML = Object.values(PULSE_DEFINITIONS).map(p => `
      <button class="modal-pulse-pill ${p.level === currentLevel ? 'active' : ''}" 
              style="--pulse-color: ${p.color};" 
              onclick="window.updateContactPulseLevel(${p.level})">
        <span class="pulse-dot" style="background: ${p.color};"></span>
        ${escapeHtml(p.name)}
      </button>
    `).join('');
  }

  function renderModalChannels(contact) {
    if (!modalChannelContainer) return;
    const current = getContactChannel(contact);
    const curKey = current ? current.key : '';
    modalChannelContainer.innerHTML = Object.keys(CHANNEL_MAP).map(k => `
      <button class="modal-channel-pill ${k === curKey ? 'active' : ''}" onclick="window.updateContactChannelKey('${k}')">
        ${escapeHtml(CHANNEL_MAP[k])}
      </button>
    `).join('');
  }

  function renderModalPhase(contact) {
    if (!modalPhaseContainer) return;
    const curPhase = getContactPhase(contact);
    modalPhaseContainer.innerHTML = ['R', 'D', 'E'].map(p => `
      <button class="modal-phase-btn ${p === curPhase ? 'active' : ''}" onclick="window.updateContactPhaseValue('${p}')">
        Fase ${p}
      </button>
    `).join('');
  }

  window.updateContactTag = function (key) {
    if (selectedContact) setContactTag(selectedContact.id, key);
  };
  window.updateContactPulseLevel = function (lvl) {
    if (selectedContact) setContactPulse(selectedContact.id, lvl);
  };
  window.updateContactChannelKey = function (key) {
    if (selectedContact) setContactChannel(selectedContact.id, key);
  };
  window.updateContactPhaseValue = function (val) {
    if (selectedContact) setContactPhase(selectedContact.id, val);
  };

  // Guardar Edición de Contacto a PostgreSQL
  if (btnSaveContactEdit) {
    btnSaveContactEdit.addEventListener('click', async () => {
      if (!selectedContact) return;

      const updatedFields = {
        nombre_completo: editInputNome.value.trim() || selectedContact.nome,
        rol: editInputOficio.value.trim(),
        telefono: editInputPhone.value.replace(/[^0-9]/g, ''),
        email: editInputEmail.value.trim()
      };

      const selectedEmpresaName = editSelectEmpresa ? editSelectEmpresa.value.trim() : '';
      if (selectedEmpresaName) {
        const emp = masterEmpresas.find(e => e.nome.toLowerCase() === selectedEmpresaName.toLowerCase());
        if (emp) updatedFields.empresa = emp.id;
      }

      updateSyncStatusIndicator('saving');
      try {
        await ApiService.updateContacto(selectedContact.id, updatedFields);

        // Actualizar en memoria
        selectedContact.nome = updatedFields.nombre_completo;
        selectedContact.rol = updatedFields.rol;
        selectedContact.oficio = updatedFields.rol;
        selectedContact.numero = updatedFields.telefono;
        selectedContact.email = updatedFields.email;
        selectedContact.empresa = selectedEmpresaName;

        updateSyncStatusIndicator('synced');
        toggleEditView(false);
        openDetailModal(selectedContact);
        renderDirectory();
        showAgentToast('✅ Contacto Actualizado', `Los cambios para "${selectedContact.nome}" se guardaron en PostgreSQL.`);
      } catch (err) {
        updateSyncStatusIndicator('offline');
        alert('Error al guardar cambios en el servidor Django. Por favor revisa la consola.');
      }
    });
  }

  // Guardar Notas de Relacionamiento
  if (modalSaveNotes) {
    modalSaveNotes.addEventListener('click', async () => {
      if (!selectedContact) return;
      const noteText = modalNotesInput.value;
      updateSyncStatusIndicator('saving');
      try {
        await ApiService.updateContacto(selectedContact.id, { notas: noteText });
        selectedContact.notas = noteText;
        updateSyncStatusIndicator('synced');
        showAgentToast('📝 Nota Guardada', 'La nota de relacionamiento se sincronizó en la base de datos.');
      } catch (err) {
        updateSyncStatusIndicator('offline');
      }
    });
  }

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      if (modalOverlay) {
        modalOverlay.style.display = 'none';
        modalOverlay.classList.remove('active');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CREACIÓN DE NUEVO CONTACTO (POST /api/contactos/)
  // ═══════════════════════════════════════════════════════════════════
  if (btnOpenAddModal) {
    btnOpenAddModal.addEventListener('click', () => {
      if (addInputNome) addInputNome.value = '';
      if (addInputOficio) addInputOficio.value = '';
      if (addInputPhone) addInputPhone.value = '';
      if (addInputEmail) addInputEmail.value = '';
      if (addModalOverlay) {
        addModalOverlay.style.display = 'flex';
        addModalOverlay.classList.add('active');
      }
    });
  }

  if (addModalClose) {
    addModalClose.addEventListener('click', () => {
      if (addModalOverlay) {
        addModalOverlay.style.display = 'none';
        addModalOverlay.classList.remove('active');
      }
    });
  }

  if (btnSaveNewContact) {
    btnSaveNewContact.addEventListener('click', async () => {
      const nome = addInputNome.value.trim();
      if (!nome) {
        alert('Por favor ingresa al menos el Nombre Completo.');
        return;
      }

      const cleanPhone = addInputPhone.value.replace(/[^0-9]/g, '');
      const selectedEmpresaName = addSelectEmpresa ? addSelectEmpresa.value.trim() : '';
      let empresaId = null;
      if (selectedEmpresaName) {
        const emp = masterEmpresas.find(e => e.nome.toLowerCase() === selectedEmpresaName.toLowerCase());
        if (emp) empresaId = emp.id;
      }

      const payload = {
        nombre_completo: nome,
        telefono: cleanPhone,
        email: addInputEmail.value.trim(),
        rol: addInputOficio.value.trim(),
        empresa: empresaId,
        tipo_relacion: selectedNewContactTag || 'prospecto',
        tipo_persona: newContactPersona || 'natural',
        pulso_vital: 1,
        fase_red: 'R'
      };

      updateSyncStatusIndicator('saving');
      try {
        const created = await ApiService.createContacto(payload);
        contactsData.unshift({
          id: created.id,
          nome: created.nombre_completo,
          numero: created.telefono || '',
          email: created.email || '',
          rol: created.rol || '',
          oficio: created.rol || '',
          empresa: created.empresa_nombre || selectedEmpresaName,
          pulso_vital: created.pulso_vital || 1,
          fase_red: created.fase_red || 'R',
          tipo_relacion: created.tipo_relacion || 'prospecto',
          tipo_persona: created.tipo_persona || 'natural',
          canal_entrada: created.canal_entrada || 'directo',
          notas: created.notas || ''
        });

        updateSyncStatusIndicator('synced');
        if (addModalOverlay) {
          addModalOverlay.style.display = 'none';
          addModalOverlay.classList.remove('active');
        }
        renderDirectory();
        updateMetrics();
        showAgentToast('🎉 Contacto Registrado', `"${nome}" fue creado exitosamente en PostgreSQL.`);
      } catch (err) {
        updateSyncStatusIndicator('offline');
        alert('Error al registrar nuevo contacto en el backend.');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // GESTIÓN DE EMPRESAS (POST/PATCH /api/empresas/)
  // ═══════════════════════════════════════════════════════════════════
  function populateEmpresaSelects() {
    const sorted = [...masterEmpresas].sort((a, b) => a.nome.localeCompare(b.nome));
    let html = `<option value="">(Sin Empresa Especificada / Particular)</option>`;
    sorted.forEach(emp => {
      html += `<option value="${escapeHtml(emp.nome)}">${escapeHtml(emp.nome)}${emp.sector ? ' — ' + escapeHtml(emp.sector) : ''}</option>`;
    });

    if (editSelectEmpresa) editSelectEmpresa.innerHTML = html;
    if (addSelectEmpresa) addSelectEmpresa.innerHTML = html;
  }

  function renderEmpresaSectorPills() {
    const container = document.getElementById('empresa-sector-pills');
    if (!container) return;
    const sectors = ['all', ...new Set(masterEmpresas.map(e => e.sector || 'General / Comercial'))];
    container.innerHTML = sectors.map(s => `
      <button class="pill-btn ${s === 'all' ? 'active' : ''}" onclick="window.filterEmpresasBySector('${s}')">
        ${s === 'all' ? 'Todos los Sectores' : escapeHtml(s)}
      </button>
    `).join('');
  }

  function renderEmpresasCards() {
    const grid = document.getElementById('empresas-grid');
    if (!grid) return;
    grid.innerHTML = masterEmpresas.map(emp => `
      <div class="empresa-card" data-id="${emp.id}">
        <div class="empresa-card-header">
          <div class="empresa-avatar">🏢</div>
          <div class="empresa-meta">
            <h4>${escapeHtml(emp.nome)}</h4>
            <span class="empresa-sector">${escapeHtml(emp.sector)}</span>
          </div>
        </div>
        <div class="empresa-details">
          ${emp.ciudad ? `<div>📍 ${escapeHtml(emp.ciudad)}</div>` : ''}
          ${emp.nit ? `<div>📄 NIT: ${escapeHtml(emp.nit)}</div>` : ''}
          ${emp.web ? `<div>🌐 <a href="${escapeHtml(emp.web)}" target="_blank">${escapeHtml(emp.web)}</a></div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════════════
  // GLÓBULOS ROJOS — TORRENTE DE PROYECTOS (CRUD /api/proyectos/)
  // ═══════════════════════════════════════════════════════════════════
  const FUNNEL_STAGES = {
    mql: { name: "MQL | Plasma (10%)", prob: 0.10, desc: "Contacto cualificado por marketing (10%)." },
    conversacion: { name: "1ra Conversación (20%)", prob: 0.20, desc: "Diástole comercial y diagnóstico (20%)." },
    sql: { name: "SQL | Válvula (40%)", prob: 0.40, desc: "Contacto cualificado para ventas (40%)." },
    propuesta: { name: "Propuesta Presentada (60%)", prob: 0.60, desc: "Oferta co-creada y entregada (60%)." },
    negociacion: { name: "En Negociación (80%)", prob: 0.80, desc: "Ajuste de términos y condiciones (80%)." },
    ejecucion: { name: "Tejido Consolidado (100%)", prob: 1.00, desc: "Proyecto activo y cerrado (100%)." },
    pausa: { name: "Estasis / Pausa (0%)", prob: 0.00, desc: "Proyecto en estasis temporal (0%)." }
  };

  function formatCOP(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount || 0);
  }

  function renderGlobulosPanel() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    if (savedProjects.length === 0) {
      grid.innerHTML = `
        <div class="empty-projects-state" style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-muted);">
          <h3>No hay proyectos en el torrente</h3>
          <p>Crea un nuevo proyecto para comenzar a proyectar el flujo comercial.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = savedProjects.map(p => {
      const stage = FUNNEL_STAGES[p.status] || { name: p.status, prob: 0.10 };
      const weighted = p.amount * stage.prob;

      return `
        <div class="project-card stage-${p.status}" data-id="${p.id}">
          <div class="project-card-header">
            <span class="project-stage-badge">${stage.name}</span>
            <h4 class="project-title">${escapeHtml(p.title)}</h4>
            <span class="project-client-name">👤 ${escapeHtml(p.client || 'Sin Asignar')}</span>
          </div>
          <div class="project-financial-row">
            <div class="fin-col">
              <span class="fin-lbl">Monto Proyectado</span>
              <span class="fin-val">${formatCOP(p.amount)}</span>
            </div>
            <div class="fin-col">
              <span class="fin-lbl">Ponderado (${Math.round(stage.prob * 100)}%)</span>
              <span class="fin-val highlight">${formatCOP(weighted)}</span>
            </div>
          </div>
          <div class="project-actions-row">
            <button class="btn-edit-proj" onclick="window.editProjectItem(${p.id})">✏️ Editar Proyecto</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Modal de Crear / Editar Proyecto
  const projectModalOverlay = document.getElementById('project-modal-overlay');
  const btnSaveProject = document.getElementById('btn-save-project');
  const btnCancelProject = document.getElementById('btn-cancel-project');
  const projectModalClose = document.getElementById('project-modal-close');

  function openProjectModal(project = null) {
    const titleEl = document.getElementById('project-modal-title');
    const editIdEl = document.getElementById('project-edit-id');
    const inputTitle = document.getElementById('project-input-title');
    const selectRelacion = document.getElementById('project-select-relacion');
    const inputAmount = document.getElementById('project-input-amount');
    const inputStatus = document.getElementById('project-input-status');
    const inputNextStep = document.getElementById('project-input-next-step');

    // Llenar select de relaciones desde contactosData
    if (selectRelacion) {
      selectRelacion.innerHTML = `<option value="">Selecciona una relación...</option>` +
        contactsData.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} (${escapeHtml(c.empresa || 'Particular')})</option>`).join('');
    }

    if (project) {
      if (titleEl) titleEl.textContent = '🩸 Editar Proyecto';
      if (editIdEl) editIdEl.value = project.id;
      if (inputTitle) inputTitle.value = project.title || '';
      if (selectRelacion) selectRelacion.value = project.contacto_id || '';
      if (inputAmount) inputAmount.value = project.amount || 0;
      if (inputStatus) inputStatus.value = project.status || 'mql';
      if (inputNextStep) inputNextStep.value = project.nextStep || '';
    } else {
      if (titleEl) titleEl.textContent = '🩸 Nuevo Proyecto en el Torrente';
      if (editIdEl) editIdEl.value = '';
      if (inputTitle) inputTitle.value = '';
      if (inputAmount) inputAmount.value = 0;
      if (inputStatus) inputStatus.value = 'mql';
      if (inputNextStep) inputNextStep.value = '';
    }

    if (projectModalOverlay) {
      projectModalOverlay.style.display = 'flex';
      projectModalOverlay.classList.add('active');
    }
  }

  window.editProjectItem = function (id) {
    const proj = savedProjects.find(p => p.id == id);
    if (proj) openProjectModal(proj);
  };

  if (btnSaveProject) {
    btnSaveProject.addEventListener('click', async () => {
      const editId = document.getElementById('project-edit-id')?.value;
      const title = document.getElementById('project-input-title')?.value.trim();
      const contactoId = document.getElementById('project-select-relacion')?.value;
      const amount = parseFloat(document.getElementById('project-input-amount')?.value) || 0;
      const status = document.getElementById('project-input-status')?.value || 'mql';
      const nextStep = document.getElementById('project-input-next-step')?.value.trim() || '';

      if (!title) {
        alert('Por favor ingresa el Título del Proyecto.');
        return;
      }

      const payload = {
        titulo: title,
        monto_proyectado: amount,
        estado: status,
        proximo_paso: nextStep,
        contacto: contactoId ? parseInt(contactoId) : null
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
              amount: parseFloat(updated.monto_proyectado) || 0,
              status: updated.estado,
              client: updated.contacto_nombre || updated.empresa_nombre || '',
              nextStep: updated.proximo_paso
            };
          }
          showAgentToast('🩸 Proyecto Actualizado', `"${title}" se actualizó en PostgreSQL.`);
        } else {
          const created = await ApiService.createProyecto(payload);
          savedProjects.unshift({
            id: created.id,
            title: created.titulo,
            amount: parseFloat(created.monto_proyectado) || 0,
            status: created.estado,
            client: created.contacto_nombre || created.empresa_nombre || '',
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
        alert('Error al guardar proyecto en el servidor Django.');
      }
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

  function updateMetrics() {
    const countTotal = contactsData.length;
    const countActive = contactsData.filter(c => getContactPulse(c).level >= 2).length;
    const countClients = contactsData.filter(c => ['cliente_gold', 'cliente_silver', 'cliente_black'].includes(getContactTag(c).key)).length;

    const elTotal = document.getElementById('stat-total-contacts');
    const elActive = document.getElementById('stat-active-contacts');
    const elClients = document.getElementById('stat-clients-count');

    if (elTotal) elTotal.textContent = countTotal;
    if (elActive) elActive.textContent = countActive;
    if (elClients) elClients.textContent = countClients;
  }

  function updatePhaseCounts() {
    const counts = { R: 0, D: 0, E: 0 };
    contactsData.forEach(c => {
      const p = getContactPhase(c);
      if (counts[p] !== undefined) counts[p]++;
    });
    const elR = document.getElementById('phase-r-count');
    const elD = document.getElementById('phase-d-count');
    const elE = document.getElementById('phase-e-count');
    if (elR) elR.textContent = counts.R;
    if (elD) elD.textContent = counts.D;
    if (elE) elE.textContent = counts.E;
  }

  // Tabs Navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      renderDirectory();
    });
  });

  // Search input listener
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      renderDirectory();
    });
  }

  // Iniciar la carga de datos conectando a PostgreSQL
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

  function dismissSplash() {
    if (!splashOverlay) return;
    splashOverlay.classList.add('dismissed');
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
    stopSplashEnergyCursor();
    setTimeout(() => { splashOverlay.style.display = 'none'; }, 850);
  }

  function playSplashIntro() {
    if (!splashOverlay) return;
    splashOverlay.style.display = 'flex';
    splashOverlay.classList.remove('dismissed');
    const ecgPulseLine = document.querySelector('.splash-ecg-pulse-line');
    if (ecgPulseLine) {
      ecgPulseLine.style.animation = 'none';
      ecgPulseLine.offsetHeight;
      ecgPulseLine.style.animation = 'splash-ecg-flow 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite';
    }
    setSplashQuote();
    startSplashEnergyCursor();
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
  }

  // Wire up button events
  if (splashSkipBtn) splashSkipBtn.addEventListener('click', dismissSplash);
  if (brandPill) {
    brandPill.style.cursor = 'pointer';
    brandPill.title = 'Hacer clic para ver la animación del ritmo cardíaco R.E.D.';
    brandPill.addEventListener('click', playSplashIntro);
  }

  // Fullscreen toggle for splash
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }
  function updateFullscreenIcon() {
    const isFs = !!document.fullscreenElement;
    if (splashFullscreenBtn) {
      const expand = splashFullscreenBtn.querySelector('.icon-expand');
      const collapse = splashFullscreenBtn.querySelector('.icon-collapse');
      if (expand) expand.style.display = isFs ? 'none' : 'block';
      if (collapse) collapse.style.display = isFs ? 'block' : 'none';
      splashFullscreenBtn.classList.toggle('is-fullscreen', isFs);
      splashFullscreenBtn.title = isFs ? 'Salir de Pantalla Completa' : 'Pantalla Completa';
    }
  }
  if (splashFullscreenBtn) splashFullscreenBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', updateFullscreenIcon);

  // Play intro on page load
  playSplashIntro();
});
