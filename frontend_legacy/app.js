/* app.js - CNTXT Client Portal Logic & Data Processing with Editing, Custom Contacts & CSV Export */

/* ══════════════════════════════════════════════════════════════════
   GLOBAL ENERGY CURSOR ENGINE
   Replicates the splash-screen red pulsating dot + halo effect
   across all app pages. Runs independently of the DOMContentLoaded
   main block so it activates as soon as the DOM is ready.
══════════════════════════════════════════════════════════════════ */
(function initGlobalEnergyCursor() {
  'use strict';

  let appMouseX = -500, appMouseY = -500;
  let appHaloX  = -500, appHaloY  = -500;
  let appRafId  = null;
  let cursorReady = false;

  const dot  = document.getElementById('app-cursor-dot');
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
    dot.style.transform  = `translate(calc(${appMouseX}px - 50%), calc(${appMouseY}px - 50%))`;

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
  // STORAGE PERSISTENCE & DISK SYNC ENGINE (R.E.D. CORE DATABASE)
  // ═══════════════════════════════════════════════════════════════════
  
  // Request persistent browser storage to avoid auto-eviction by Chrome/Edge
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persistent => {
      if (persistent) console.log('🩸 R.E.D. | Almacenamiento local persistente concedido por el navegador.');
    }).catch(e => console.warn('Storage persist error:', e));
  }

  let syncDebounceTimer = null;

  function updateSyncStatusIndicator(status) {
    const dot = document.getElementById('header-sync-dot');
    const text = document.getElementById('header-sync-text');
    const btn = document.getElementById('btn-sync-status');
    if (!dot || !text) return;

    if (status === 'synced') {
      dot.className = 'sync-status-dot synced';
      text.textContent = 'Disco Sincronizado';
      if (btn) btn.title = 'Persistencia activa: Todos los datos están guardados en data_storage.json en la Unidad Compartida.';
    } else if (status === 'saving') {
      dot.className = 'sync-status-dot saving';
      text.textContent = 'Guardando en Disco...';
      if (btn) btn.title = 'Escribiendo cambios en data_storage.json...';
    } else {
      dot.className = 'sync-status-dot offline';
      text.textContent = 'Modo Local (Offline)';
      if (btn) btn.title = 'Servidor local no detectado. Los datos se guardan en el navegador. Inicia start_server.ps1 para sincronizar en disco.';
    }
  }

  function getAllAppState() {
    const state = {
      version: window.CNTXT_CONFIG?.VERSION || '2.0.26',
      updatedAt: new Date().toISOString(),
      custom_contacts: [],
      master_empresas: [],
      projects: [],
      slack: {
        webhook_url: (localStorage.getItem('cntxt_slack_webhook_url') || window.CNTXT_CONFIG?.SLACK?.DEFAULT_WEBHOOK_URL || '').trim(),
        channel_name: (localStorage.getItem('cntxt_slack_channel_name') || window.CNTXT_CONFIG?.SLACK?.DEFAULT_CHANNEL_NAME || '#notificaciones-red').trim()
      },
      edits: {},
      notes: {},
      tags: {},
      pulses: {},
      phases: {},
      channels: {},
      personas: {}
    };

    try {
      state.custom_contacts = JSON.parse(localStorage.getItem('cntxt_custom_contacts') || '[]');
    } catch(e){}
    try {
      state.master_empresas = JSON.parse(localStorage.getItem('cntxt_master_empresas') || '[]');
    } catch(e){}
    try {
      state.projects = JSON.parse(localStorage.getItem('cntxt_projects') || '[]');
    } catch(e){}

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('cntxt_edit_')) {
        const id = key.replace('cntxt_edit_', '');
        try { state.edits[id] = JSON.parse(localStorage.getItem(key)); } catch(e){}
      } else if (key.startsWith('cntxt_notes_')) {
        const id = key.replace('cntxt_notes_', '');
        state.notes[id] = localStorage.getItem(key);
      } else if (key.startsWith('cntxt_tag_')) {
        const id = key.replace('cntxt_tag_', '');
        state.tags[id] = localStorage.getItem(key);
      } else if (key.startsWith('cntxt_pulse_')) {
        const id = key.replace('cntxt_pulse_', '');
        state.pulses[id] = localStorage.getItem(key);
      } else if (key.startsWith('cntxt_phase_')) {
        const id = key.replace('cntxt_phase_', '');
        state.phases[id] = localStorage.getItem(key);
      } else if (key.startsWith('cntxt_channel_')) {
        const id = key.replace('cntxt_channel_', '');
        state.channels[id] = localStorage.getItem(key);
      } else if (key.startsWith('cntxt_persona_')) {
        const id = key.replace('cntxt_persona_', '');
        state.personas[id] = localStorage.getItem(key);
      }
    }

    return state;
  }

  function applyAppState(serverState) {
    if (!serverState || typeof serverState !== 'object') return;

    // 1. Slack Config
    if (serverState.slack) {
      if (serverState.slack.webhook_url) {
        localStorage.setItem('cntxt_slack_webhook_url', serverState.slack.webhook_url);
      }
      if (serverState.slack.channel_name) {
        localStorage.setItem('cntxt_slack_channel_name', serverState.slack.channel_name);
      }
    }

    // 2. Custom Contacts Merge
    if (Array.isArray(serverState.custom_contacts) && serverState.custom_contacts.length > 0) {
      let localCustom = [];
      try { localCustom = JSON.parse(localStorage.getItem('cntxt_custom_contacts')) || []; } catch(e){}
      const map = new Map();
      serverState.custom_contacts.forEach(c => { if (c && c.id) map.set(c.id, c); });
      localCustom.forEach(c => { if (c && c.id) map.set(c.id, c); });
      localStorage.setItem('cntxt_custom_contacts', JSON.stringify(Array.from(map.values())));
    }

    // 3. Master Empresas Merge
    if (Array.isArray(serverState.master_empresas) && serverState.master_empresas.length > 0) {
      let localEmpresas = [];
      try { localEmpresas = JSON.parse(localStorage.getItem('cntxt_master_empresas')) || []; } catch(e){}
      const map = new Map();
      serverState.master_empresas.forEach(e => { if (e && e.name) map.set(e.name, e); });
      localEmpresas.forEach(e => { if (e && e.name) map.set(e.name, e); });
      localStorage.setItem('cntxt_master_empresas', JSON.stringify(Array.from(map.values())));
    }

    // 4. Projects Merge
    if (Array.isArray(serverState.projects) && serverState.projects.length > 0) {
      let localProjects = [];
      try { localProjects = JSON.parse(localStorage.getItem('cntxt_projects')) || []; } catch(e){}
      const map = new Map();
      serverState.projects.forEach(p => { if (p && p.id) map.set(p.id, p); });
      localProjects.forEach(p => { if (p && p.id) map.set(p.id, p); });
      localStorage.setItem('cntxt_projects', JSON.stringify(Array.from(map.values())));
    }

    // 5. Edits
    if (serverState.edits && typeof serverState.edits === 'object') {
      Object.entries(serverState.edits).forEach(([id, val]) => {
        if (val) localStorage.setItem(`cntxt_edit_${id}`, JSON.stringify(val));
      });
    }

    // 6. Notes
    if (serverState.notes && typeof serverState.notes === 'object') {
      Object.entries(serverState.notes).forEach(([id, val]) => {
        if (val !== undefined && val !== null) localStorage.setItem(`cntxt_notes_${id}`, val);
      });
    }

    // 7. Tags
    if (serverState.tags && typeof serverState.tags === 'object') {
      Object.entries(serverState.tags).forEach(([id, val]) => {
        if (val) localStorage.setItem(`cntxt_tag_${id}`, val);
      });
    }

    // 8. Pulses
    if (serverState.pulses && typeof serverState.pulses === 'object') {
      Object.entries(serverState.pulses).forEach(([id, val]) => {
        if (val !== undefined && val !== null) localStorage.setItem(`cntxt_pulse_${id}`, val);
      });
    }

    // 9. Phases
    if (serverState.phases && typeof serverState.phases === 'object') {
      Object.entries(serverState.phases).forEach(([id, val]) => {
        if (val) localStorage.setItem(`cntxt_phase_${id}`, val);
      });
    }

    // 10. Channels
    if (serverState.channels && typeof serverState.channels === 'object') {
      Object.entries(serverState.channels).forEach(([id, val]) => {
        if (val) localStorage.setItem(`cntxt_channel_${id}`, val);
      });
    }

    // 11. Personas
    if (serverState.personas && typeof serverState.personas === 'object') {
      Object.entries(serverState.personas).forEach(([id, val]) => {
        if (val) localStorage.setItem(`cntxt_persona_${id}`, val);
      });
    }
  }

  async function loadPersistedStateFromServer() {
    const syncConfig = window.CNTXT_CONFIG?.SYNC || {};
    const apiUrls = [
      syncConfig.API_BASE_URL ? `${syncConfig.API_BASE_URL}/load-data` : '/api/load-data',
      syncConfig.FALLBACK_API_URL ? `${syncConfig.FALLBACK_API_URL}/load-data` : 'http://localhost:8085/api/load-data'
    ];

    for (const url of apiUrls) {
      try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object' && data.status !== 'empty') {
            applyAppState(data);
            updateSyncStatusIndicator('synced');
            console.log('🩸 R.E.D. | Datos persistidos cargados exitosamente desde data_storage.json.');
            return true;
          } else if (data && data.status === 'empty') {
            // El archivo no existe aún en disco, procedemos a guardar el estado actual inicial
            updateSyncStatusIndicator('synced');
            scheduleServerSync(true);
            return true;
          }
        }
      } catch(err) {
        // Continuar intentando con la URL de respaldo
      }
    }
    updateSyncStatusIndicator('offline');
    return false;
  }

  function scheduleServerSync(immediate = false) {
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    const debounceTime = immediate ? 0 : (window.CNTXT_CONFIG?.SYNC?.DEBOUNCE_SAVE_MS || 800);
    
    updateSyncStatusIndicator('saving');
    syncDebounceTimer = setTimeout(async () => {
      await persistStateToServer();
    }, debounceTime);
  }

  async function persistStateToServer() {
    const state = getAllAppState();
    const syncConfig = window.CNTXT_CONFIG?.SYNC || {};
    const apiUrls = [
      syncConfig.API_BASE_URL ? `${syncConfig.API_BASE_URL}/save-data` : '/api/save-data',
      syncConfig.FALLBACK_API_URL ? `${syncConfig.FALLBACK_API_URL}/save-data` : 'http://localhost:8085/api/save-data'
    ];

    for (const url of apiUrls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state, null, 2)
        });
        if (res.ok) {
          updateSyncStatusIndicator('synced');
          return true;
        }
      } catch(e) {
        // Continuar con fallback
      }
    }
    updateSyncStatusIndicator('offline');
    return false;
  }

  // Respaldo manual (Exportar / Importar)
  function exportCRMBackup() {
    const state = getAllAppState();
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CNTXT_RED_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showAgentToast === 'function') {
      showAgentToast('💾 Respaldo Exportado', `Copia de seguridad guardada como CNTXT_RED_Backup_${dateStr}.json`, '📥');
    } else {
      alert(`Copia de seguridad descargada exitosamente: CNTXT_RED_Backup_${dateStr}.json`);
    }
  }

  function importCRMBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        applyAppState(parsed);
        await persistStateToServer();
        if (typeof showAgentToast === 'function') {
          showAgentToast('✅ Respaldo Restaurado', 'Se han restaurado y sincronizado los datos en disco.', '⚡');
        } else {
          alert('¡Respaldo restaurado exitosamente!');
        }
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch(err) {
        alert('Error al leer el archivo de respaldo: formato JSON inválido.');
      }
    };
    reader.readAsText(file);
  }

  // Hook Backup & Sync Buttons
  const btnExportBackupJson = document.getElementById('btn-export-backup-json');
  const btnTriggerImportJson = document.getElementById('btn-trigger-import-json');
  const inputImportBackupFile = document.getElementById('input-import-backup-file');
  const btnForceSyncDisk = document.getElementById('btn-force-sync-disk');
  const btnSyncStatusHeader = document.getElementById('btn-sync-status');

  if (btnExportBackupJson) {
    btnExportBackupJson.addEventListener('click', (e) => {
      e.preventDefault();
      exportCRMBackup();
    });
  }
  if (btnTriggerImportJson && inputImportBackupFile) {
    btnTriggerImportJson.addEventListener('click', (e) => {
      e.preventDefault();
      inputImportBackupFile.click();
    });
    inputImportBackupFile.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        if (confirm('¿Deseas restaurar los datos de esta copia de seguridad? Se combinarán con la base de datos actual.')) {
          importCRMBackupFile(e.target.files[0]);
        }
      }
    });
  }
  if (btnForceSyncDisk) {
    btnForceSyncDisk.addEventListener('click', async (e) => {
      e.preventDefault();
      btnForceSyncDisk.textContent = '⏳ Guardando...';
      const success = await persistStateToServer();
      btnForceSyncDisk.innerHTML = success ? '<span>✅ ¡Guardado en Disco!</span>' : '<span>⚠️ Servidor Desconectado</span>';
      setTimeout(() => {
        btnForceSyncDisk.innerHTML = '<span>⚡ Forzar Guardado en Disco</span>';
      }, 2000);
    });
  }
  if (btnSyncStatusHeader) {
    btnSyncStatusHeader.addEventListener('click', (e) => {
      e.preventDefault();
      openSlackConfigModal();
    });
  }

  // Sincronización periódica en segundo plano
  setInterval(() => {
    persistStateToServer();
  }, window.CNTXT_CONFIG?.SYNC?.AUTO_SYNC_INTERVAL_MS || 30000);

  let contactsData = [];
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
    lead: 'Lead',
    media: 'Media & Influencers',
    aliados: 'Aliados Estratégicos',
    servicios_claves: 'Servicios Claves',
    servicios_aux: 'Servicios Auxiliares',
    equipo: 'Equipo CNTXT',
    candidatos: 'Candidatos y Talento',
    mentores: 'Mentores y Asesores'
  };

  const TAG_KEYS = Object.keys(TAG_MAP);

  // 9 Prospecting Channel Definitions
  const CHANNEL_MAP = {
    fb: 'Media | Facebook',
    ig: 'Media | Instagram',
    gg: 'Media | Google',
    gmaps: 'Media | Google Maps',
    referidos: 'Referidos',
    prospeccion: 'Prospección Activa',
    ferias: 'Ferias o Activaciones',
    oficinas: 'Oficinas CNTXT',
    capital: 'Capital Relacional'
  };

  function getContactChannel(client) {
    const saved = localStorage.getItem(`cntxt_channel_${client.id}`);
    if (saved && CHANNEL_MAP[saved]) {
      return { key: saved, name: CHANNEL_MAP[saved] };
    }
    return null; // Initially all contacts have no channel assigned
  }

  function setContactChannel(clientId, channelKey) {
    if (channelKey && CHANNEL_MAP[channelKey]) {
      localStorage.setItem(`cntxt_channel_${clientId}`, channelKey);
    } else {
      localStorage.removeItem(`cntxt_channel_${clientId}`);
    }
    scheduleServerSync();
    renderDirectory();
    if (selectedContact && selectedContact.id === clientId) {
      renderModalChannels(selectedContact);
    }
  }

  function getContactPersona(client) {
    return localStorage.getItem(`cntxt_persona_${client.id}`) || '';
  }

  function setContactPersona(clientId, personaVal) {
    if (personaVal) {
      localStorage.setItem(`cntxt_persona_${clientId}`, personaVal);
    } else {
      localStorage.removeItem(`cntxt_persona_${clientId}`);
    }
    scheduleServerSync();
    renderDirectory();
    if (selectedContact && selectedContact.id === clientId) {
      updateModalFields();
    }
  }

  function getContactPersonaLabel(personaKey) {
    if (personaKey === 'b2c') return 'B2C — Persona Natural';
    if (personaKey === 'b2b') return 'B2B — Persona Jurídica';
    return 'Sin asignar';
  }

  // DOM Elements
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
  const paginationBar  = document.getElementById('pagination-bar');
  const paginationInfo = document.getElementById('pagination-info');
  const btnPagePrev    = document.getElementById('btn-page-prev');
  const btnPageNext    = document.getElementById('btn-page-next');

  // View mode DOM
  const btnViewGrid = document.getElementById('btn-view-grid');
  const btnViewList = document.getElementById('btn-view-list');

  // Spotlight elements
  const spotlightAvatar = document.getElementById('spotlight-avatar');
  const spotlightName = document.getElementById('spotlight-name');
  const spotlightCompany = document.getElementById('spotlight-company');
  const spotlightPhone = document.getElementById('spotlight-phone');
  const spotlightWaBtn = document.getElementById('spotlight-wa-btn');
  const spotlightDetailBtn = document.getElementById('spotlight-detail-btn');
  const spotlightContainer = document.getElementById('spotlight-container');

  // Detail Modal elements
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalAvatar = document.getElementById('modal-avatar');
  const modalName = document.getElementById('modal-name');
  const modalCompany = document.getElementById('modal-company');
  const modalFname = document.getElementById('modal-fname');
  const modalLname = document.getElementById('modal-lname');
  const modalPhone = document.getElementById('modal-phone');
  const modalEmail = document.getElementById('modal-email');
  const modalOficio = document.getElementById('modal-oficio');
  const modalCiudad = document.getElementById('modal-ciudad');
  const modalMapsLink = document.getElementById('modal-maps-link');
  const modalNotesInput = document.getElementById('modal-notes-input');
  const modalSaveNotes = document.getElementById('modal-save-notes');
  const modalWaBtn = document.getElementById('modal-wa-btn');
  const modalTagContainer = document.getElementById('modal-tag-options-container');

  // Edit Mode elements
  const btnToggleEditMode = document.getElementById('btn-toggle-edit-mode');
  const editToggleLabel = document.getElementById('edit-toggle-label');
  const modalViewDetails = document.getElementById('modal-view-details');
  const modalEditDetails = document.getElementById('modal-edit-details');
  const editInputNome = document.getElementById('edit-input-nome');
  const editSelectEmpresa = document.getElementById('edit-select-empresa');
  const editInputOficio = document.getElementById('edit-input-oficio');
  const editInputCiudad = document.getElementById('edit-input-ciudad');
  const editInputFname = document.getElementById('edit-input-fname');
  const editInputLname = document.getElementById('edit-input-lname');
  const editInputPhone = document.getElementById('edit-input-phone');
  const editInputEmail = document.getElementById('edit-input-email');
  const btnSaveContactEdit = document.getElementById('btn-save-contact-edit');
  const btnCancelContactEdit = document.getElementById('btn-cancel-contact-edit');

  // Add Contact Modal elements
  const addModalOverlay = document.getElementById('add-modal-overlay');
  const addModalClose = document.getElementById('add-modal-close');
  const addInputNome = document.getElementById('add-input-nome');
  const addSelectEmpresa = document.getElementById('add-select-empresa');
  const addInputOficio = document.getElementById('add-input-oficio');
  const addInputCiudad = document.getElementById('add-input-ciudad');
  const addInputFname = document.getElementById('add-input-fname');
  const addInputLname = document.getElementById('add-input-lname');
  const addInputPhone = document.getElementById('add-input-phone');
  const addInputEmail = document.getElementById('add-input-email');

  // Maps preview buttons — open Google Maps search with the typed city/country
  document.getElementById('edit-maps-preview-btn').addEventListener('click', () => {
    const q = editInputCiudad.value.trim();
    if (q) window.open(`https://www.google.com/maps/search/${encodeURIComponent(q)}`, '_blank');
  });
  document.getElementById('add-maps-preview-btn').addEventListener('click', () => {
    const q = addInputCiudad.value.trim();
    if (q) window.open(`https://www.google.com/maps/search/${encodeURIComponent(q)}`, '_blank');
  });
  const addTagOptionsContainer = document.getElementById('add-tag-options-container');
  const btnSaveNewContact = document.getElementById('btn-save-new-contact');
  const btnCancelAddContact = document.getElementById('btn-cancel-add-contact');
  let selectedNewContactTag = 'cliente_gold';

  // Metrics elements
  const metricTotal = document.getElementById('metric-total');
  const metricActive = document.getElementById('metric-active');
  const metricTouchpoints = document.getElementById('metric-touchpoints');
  const metricScore = document.getElementById('metric-score');

  // Helper: Get & Set Contact Relationship Tag
  function getContactTag(client) {
    const savedTag = localStorage.getItem(`cntxt_tag_${client.id}`);
    // 'none' es el centinela que indica "sin etiqueta" (borrada manualmente)
    if (savedTag === 'none') {
      return { key: 'none', name: 'Sin Etiqueta' };
    }
    if (savedTag && TAG_MAP[savedTag]) {
      return { key: savedTag, name: TAG_MAP[savedTag] };
    }

    const comp = (client.empresa || '').toLowerCase();
    const name = (client.nome || '').toLowerCase();

    if (comp.includes('cntxt') || name.includes('cntxt')) return { key: 'equipo', name: TAG_MAP.equipo };
    if (comp.includes('partner') || comp.includes('growth')) return { key: 'growth', name: TAG_MAP.growth };
    if (comp.includes('asesor') || comp.includes('mentor') || comp.includes('consultor')) return { key: 'mentores', name: TAG_MAP.mentores };
    if (comp.includes('media') || comp.includes('prensa') || comp.includes('influencer')) return { key: 'media', name: TAG_MAP.media };
    if (comp.includes('servicio') || comp.includes('clave')) return { key: 'servicios_claves', name: TAG_MAP.servicios_claves };
    if (comp.includes('auxiliar') || comp.includes('logistica')) return { key: 'servicios_aux', name: TAG_MAP.servicios_aux };

    const hash = (client.id * 17 + name.length * 3) % TAG_KEYS.length;
    const key = TAG_KEYS[hash];
    return { key, name: TAG_MAP[key] };
  }

  function setContactTag(clientId, tagKey) {
    if (!TAG_MAP[tagKey]) return;
    localStorage.setItem(`cntxt_tag_${clientId}`, tagKey);
    scheduleServerSync();
    renderDirectory();
    if (selectedContact && selectedContact.id === clientId) {
      setSpotlight(selectedContact);
      renderModalTags(selectedContact);
    }
    if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();
  }

  // Apply Persisted Contact Edits
  function getMergedContactData(client) {
    const editSaved = localStorage.getItem(`cntxt_edit_${client.id}`);
    if (editSaved) {
      try {
        const edits = JSON.parse(editSaved);
        return { ...client, ...edits };
      } catch (e) {
        console.warn('Failed parsing edits:', e);
      }
    }
    return client;
  }

  // Load CSV Data & Merge Local Custom Contacts
  async function loadContactsData() {
    // 1. Intentar cargar el estado consolidado de la base de datos en disco
    await loadPersistedStateFromServer();
    updateSlackHeaderIndicator();

    if (window.CNTXT_CONTACTS_CSV) {
      parseCSV(window.CNTXT_CONTACTS_CSV);
      return;
    }

    try {
      const response = await fetch('Contactos_Procesados_CNTXT.csv');
      if (!response.ok) throw new Error('Network response was not ok');
      const csvText = await response.text();
      parseCSV(csvText);
    } catch (err) {
      console.warn('Fetch failed:', err);
    }
  }

  // Parse CSV
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return;

    const parsed = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = [];
      let insideQuote = false;
      let curVal = '';

      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          insideQuote = !insideQuote;
        } else if (char === ';' && !insideQuote) {
          cols.push(curVal.trim().replace(/^"|"$/g, ''));
          curVal = '';
        } else {
          curVal += char;
        }
      }
      cols.push(curVal.trim().replace(/^"|"$/g, ''));

      if (cols.length >= 2) {
        let baseContact = {
          id: i,
          nome: cols[0] || 'Contacto sin nombre',
          numero: cols[1] || '',
          email: cols[2] || '',
          cpf: cols[3] || '',
          dataNascimento: cols[4] || '',
          primeiroNome: cols[5] || '',
          ultimoNome: cols[6] || '',
          empresa: cols[7] || ''
        };
        parsed.push(getMergedContactData(baseContact));
      }
    }

    // Merge Newly Created Custom Contacts from LocalStorage
    const customSaved = localStorage.getItem('cntxt_custom_contacts');
    if (customSaved) {
      try {
        const customList = JSON.parse(customSaved);
        customList.forEach(c => {
          parsed.unshift(getMergedContactData(c));
        });
      } catch (e) {
        console.warn('Failed parsing custom contacts:', e);
      }
    }

    contactsData = parsed;
    initMasterEmpresas();
    updateMetrics();
    renderDirectory();
    setSpotlight(contactsData[Math.floor(Math.random() * Math.min(20, contactsData.length))] || contactsData[0]);
    // Sincronizar estado inicial consolidado con el servidor en disco
    scheduleServerSync();
  }

  // Update top metrics
  function updateMetrics() {
    metricTotal.textContent = contactsData.length;

    let p3Count = 0;
    let p4Count = 0;
    contactsData.forEach(c => {
      const p = getContactPulse(c);
      if (p.level === 3) p3Count++;
      if (p.level === 4) p4Count++;
    });

    metricActive.textContent = p3Count;
    metricScore.textContent = p4Count;
    metricTouchpoints.textContent = Math.round(contactsData.length * 0.18);
  }

  // Helper for contact initials
  function getInitials(name) {
    if (!name) return 'CN';
    const parts = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }

  // Render Spotlight Hero Card
  function setSpotlight(client) {
    if (!client) return;
    selectedContact = getMergedContactData(client);
    const tag = getContactTag(selectedContact);

    spotlightAvatar.textContent = getInitials(selectedContact.nome);
    spotlightName.textContent = selectedContact.nome;
    spotlightCompany.textContent = selectedContact.empresa || 'Cliente Particular';
    spotlightPhone.textContent = selectedContact.numero ? `+${selectedContact.numero}` : 'Sin teléfono';

    let tagPillEl = spotlightContainer.querySelector('.spotlight-rel-pill');
    if (!tagPillEl) {
      tagPillEl = document.createElement('div');
      tagPillEl.className = 'spotlight-rel-pill';
      tagPillEl.style.marginTop = '12px';
      spotlightContainer.querySelector('.spotlight-avatar-box').appendChild(tagPillEl);
    }
    tagPillEl.innerHTML = `<span class="rel-tag" data-tag="${tag.key}">${tag.name}</span>`;

    if (selectedContact.numero) {
      spotlightWaBtn.href = `https://wa.me/${selectedContact.numero}`;
      spotlightWaBtn.style.pointerEvents = 'auto';
      spotlightWaBtn.style.opacity = '1';
    } else {
      spotlightWaBtn.href = '#';
      spotlightWaBtn.style.pointerEvents = 'none';
      spotlightWaBtn.style.opacity = '0.5';
    }
  }

  // Render Directory Cards Grid
  function renderDirectory() {
    const query = searchInput.value.toLowerCase().trim();

    const filtered = contactsData.filter(item => {
      const mergedItem = getMergedContactData(item);
      const matchesSearch = 
        mergedItem.nome.toLowerCase().includes(query) ||
        mergedItem.empresa.toLowerCase().includes(query) ||
        mergedItem.numero.includes(query) ||
        mergedItem.email.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (currentFilter === 'phone' && !mergedItem.numero) return false;
      if (currentFilter === 'email' && !mergedItem.email) return false;
      if (currentFilter === 'company' && !mergedItem.empresa) return false;

      // B2C / B2B persona filter
      if (currentPersonaFilter !== 'all') {
        const itemPersona = getContactPersona(mergedItem);
        if (itemPersona !== currentPersonaFilter) return false;
      }

      if (currentTagFilter !== 'all') {
        const itemTag = getContactTag(mergedItem);
        if (itemTag.key !== currentTagFilter) return false;
      }

      if (currentChannelFilter !== 'all') {
        const itemChannel = getContactChannel(mergedItem);
        if (!itemChannel || itemChannel.key !== currentChannelFilter) return false;
      }

      return true;
    });

    clientCountEl.textContent = filtered.length;
    lastFiltered = filtered;

    if (currentTagFilter === 'all') {
      activeTagCountEl.textContent = 'Todos los tipos';
    } else {
      activeTagCountEl.textContent = `${TAG_MAP[currentTagFilter]} (${filtered.length})`;
    }

    // ── Pagination ──────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const displayList = filtered.slice(start, start + PAGE_SIZE);

    // Update pagination bar
    if (totalPages > 1) {
      paginationBar.style.display = 'flex';
      paginationInfo.textContent = `Página ${currentPage} de ${totalPages} — ${filtered.length} contactos`;
      btnPagePrev.disabled = currentPage === 1;
      btnPageNext.disabled = currentPage === totalPages;
    } else {
      paginationBar.style.display = 'none';
    }

    clientGrid.innerHTML = '';

    // Apply list/grid class
    clientGrid.classList.toggle('list-view', viewMode === 'list');

    if (filtered.length === 0) {
      clientGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
          No se encontraron contactos que coincidan con los criterios de búsqueda y etiqueta.
        </div>
      `;
      paginationBar.style.display = 'none';
      return;
    }

    // Track visible IDs for select-all-page functionality
    visibleFilteredIds = displayList.map(c => c.id);

    displayList.forEach(rawClient => {
      const client = getMergedContactData(rawClient);
      const tag = getContactTag(client);
      const card = document.createElement('div');
      card.className = 'client-card';
      card.dataset.contactId = client.id;
      if (selectionMode && selectedIds.has(client.id)) {
        card.classList.add('selected');
      }

      const personaKey = getContactPersona(client);
      const personaBadge = personaKey === 'b2c'
        ? `<span class="card-persona-badge card-persona-b2c">B2C</span>`
        : personaKey === 'b2b'
          ? `<span class="card-persona-badge card-persona-b2b">B2B</span>`
          : '';

      card.innerHTML = `
        <!-- Selection checkbox overlay -->
        <div class="card-select-checkbox">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>

        <div>
          <div class="client-card-header">
            <div class="client-avatar">${getInitials(client.nome)}</div>
            <div class="client-info-main">
              <div class="client-name-title" title="${client.nome}">${client.nome}</div>
              <div class="client-company-tag">${client.empresa || 'Cliente Directo'}</div>
            </div>
            ${personaBadge}
          </div>
          
          <div class="client-card-body">
            ${client.numero ? `
              <div class="contact-row-item">
                <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                +${client.numero}
              </div>
            ` : ''}
            ${client.email ? `
              <div class="contact-row-item">
                <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                ${client.email}
              </div>
            ` : ''}
          </div>
        </div>

        <div class="client-card-footer">
          <span class="rel-tag" data-tag="${tag.key}">${tag.name}</span>
          ${(() => {
            const channel = getContactChannel(client);
            return channel ? `<span class="channel-pill-btn channel-${channel.key}" style="font-size:10px; padding:3px 10px;">${channel.name}</span>` : '';
          })()}
          ${client.numero && !selectionMode ? `
            <a href="https://wa.me/${client.numero}" target="_blank" class="card-wa-link" onclick="event.stopPropagation()">WhatsApp</a>
          ` : ''}
        </div>
      `;

      // Click: selection toggle OR open modal
      card.addEventListener('click', (e) => {
        if (selectionMode) {
          toggleCardSelection(client.id);
        } else {
          openModal(client);
        }
      });

      clientGrid.appendChild(card);
    });

    // Keep selection counter & card states in sync when re-rendering
    if (selectionMode) updateBulkUI();
  }

  // Render Modal Relationship Tag Options
  function renderModalTags(client) {
    const currentTag = getContactTag(client);
    const options = modalTagContainer.querySelectorAll('.modal-tag-option');
    options.forEach(opt => {
      const tagKey = opt.dataset.assignTag;
      if (tagKey === currentTag.key) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }

      opt.onclick = () => {
        setContactTag(client.id, tagKey);
      };
    });
  }

  // Render Modal Prospecting Channel Options
  function renderModalChannels(client) {
    const currentChannel = getContactChannel(client);
    const options = document.querySelectorAll('.modal-channel-option');
    options.forEach(opt => {
      const channelKey = opt.dataset.assignChannel;
      if (currentChannel && channelKey === currentChannel.key) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }

      opt.onclick = () => {
        if (currentChannel && currentChannel.key === channelKey) {
          setContactChannel(client.id, null); // toggle off
        } else {
          setContactChannel(client.id, channelKey);
        }
      };
    });
  }

  // Open Client Detail Modal
  function openModal(rawClient) {
    selectedContact = getMergedContactData(rawClient);
    isEditMode = false;
    toggleEditView(false);

    updateModalFields();
    renderModalTags(selectedContact);
    renderModalChannels(selectedContact);
    renderModalPhase(selectedContact);
    renderModalPulse(selectedContact);

    const savedNotes = localStorage.getItem(`cntxt_notes_${selectedContact.id}`) || '';
    modalNotesInput.value = savedNotes;

    modalOverlay.classList.add('active');
  }

  function updateModalFields() {
    modalAvatar.textContent = getInitials(selectedContact.nome);
    modalName.textContent = selectedContact.nome;
    modalCompany.textContent = selectedContact.empresa || 'Sin Empresa Especificada';
    modalOficio.textContent = selectedContact.oficio || 'Sin oficio registrado';

    // Persona type
    const personaKey = getContactPersona(selectedContact);
    const personaDisplay = document.getElementById('modal-persona-display');
    if (personaDisplay) {
      personaDisplay.textContent = getContactPersonaLabel(personaKey);
      personaDisplay.style.color = personaKey === 'b2c'
        ? 'rgba(255,160,170,0.95)'
        : personaKey === 'b2b'
          ? 'rgba(200,120,130,0.9)'
          : 'var(--text-muted)';
    }

    // Ciudad / País + Google Maps link
    const ciudad = selectedContact.ciudad || '';
    modalCiudad.textContent = ciudad || 'Sin ubicación registrada';
    if (ciudad) {
      const mapsQuery = encodeURIComponent(ciudad);
      modalMapsLink.href = `https://www.google.com/maps/search/${mapsQuery}`;
      modalMapsLink.style.display = 'inline-flex';
    } else {
      modalMapsLink.style.display = 'none';
    }

    modalFname.textContent = selectedContact.primeiroNome || selectedContact.nome.split(' ')[0] || '-';
    modalLname.textContent = selectedContact.ultimoNome || '-';
    modalPhone.textContent = selectedContact.numero ? `+${selectedContact.numero}` : 'No registrado';
    modalEmail.textContent = selectedContact.email || 'No registrado';

    if (selectedContact.numero) {
      modalWaBtn.href = `https://wa.me/${selectedContact.numero}`;
      modalWaBtn.style.pointerEvents = 'auto';
      modalWaBtn.style.opacity = '1';
    } else {
      modalWaBtn.href = '#';
      modalWaBtn.style.pointerEvents = 'none';
      modalWaBtn.style.opacity = '0.5';
    }
  }

  function toggleEditView(enableEdit) {
    isEditMode = enableEdit;
    if (isEditMode) {
      modalViewDetails.style.display = 'none';
      modalEditDetails.style.display = 'grid';
      editToggleLabel.textContent = 'Viendo Datos';

      editInputNome.value = selectedContact.nome || '';
      if (editSelectEmpresa) editSelectEmpresa.value = selectedContact.empresa || '';
      editInputOficio.value = selectedContact.oficio || '';
      editInputCiudad.value = selectedContact.ciudad || '';
      editInputFname.value = selectedContact.primeiroNome || '';
      editInputLname.value = selectedContact.ultimoNome || '';
      editInputPhone.value = selectedContact.numero || '';
      editInputEmail.value = selectedContact.email || '';

      // Sync persona toggle in edit form
      const savedPersona = getContactPersona(selectedContact);
      const editToggleBtns = document.querySelectorAll('#edit-persona-toggle .persona-toggle-btn');
      editToggleBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.personaVal === savedPersona);
      });
    } else {
      modalViewDetails.style.display = 'grid';
      modalEditDetails.style.display = 'none';
      editToggleLabel.textContent = 'Editar Datos';
    }
  }

  // Save Contact Edit
  btnSaveContactEdit.addEventListener('click', () => {
    if (!selectedContact) return;

    const cleanPhone = editInputPhone.value.replace(/[^0-9]/g, '');

    const updatedData = {
      nome: editInputNome.value.trim() || selectedContact.nome,
      empresa: editSelectEmpresa ? editSelectEmpresa.value.trim() : selectedContact.empresa,
      oficio: editInputOficio.value.trim(),
      // Ciudad/País — stored as text + lat/lng placeholders ready for Google Maps Geocoding API
      ciudad: editInputCiudad.value.trim(),
      lat: selectedContact.lat || null,   // Future: fill with geocode result
      lng: selectedContact.lng || null,   // Future: fill with geocode result
      primeiroNome: editInputFname.value.trim(),
      ultimoNome: editInputLname.value.trim(),
      numero: cleanPhone,
      email: editInputEmail.value.trim()
    };

    // Save to LocalStorage
    localStorage.setItem(`cntxt_edit_${selectedContact.id}`, JSON.stringify(updatedData));
    scheduleServerSync();

    // Update memory array
    const idx = contactsData.findIndex(c => c.id === selectedContact.id);
    if (idx !== -1) {
      contactsData[idx] = { ...contactsData[idx], ...updatedData };
      selectedContact = contactsData[idx];
    }

    updateModalFields();
    toggleEditView(false);
    renderDirectory();
    setSpotlight(selectedContact);
    if (typeof renderGlobulosPanel === 'function') renderGlobulosPanel();

    alert('¡Datos del contacto actualizados correctamente!');
  });

  btnCancelContactEdit.addEventListener('click', () => {
    toggleEditView(false);
  });

  btnToggleEditMode.addEventListener('click', () => {
    toggleEditView(!isEditMode);
  });

  // Save Notes to LocalStorage
  modalSaveNotes.addEventListener('click', () => {
    if (!selectedContact) return;
    const noteText = modalNotesInput.value;
    localStorage.setItem(`cntxt_notes_${selectedContact.id}`, noteText);
    scheduleServerSync();
    alert('¡Nota de relacionamiento guardada exitosamente!');
  });

  // Detail Modal Close
  modalClose.addEventListener('click', () => {
    modalOverlay.classList.remove('active');
  });

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('active');
    }
  });

  // ── ADD NEW CONTACT MODAL ──────────────────────────────────────────────────
  function openAddContactModal() {
    if (addInputNome) addInputNome.value = '';
    if (addInputOficio) addInputOficio.value = '';
    if (addInputCiudad) addInputCiudad.value = '';
    if (addInputFname) addInputFname.value = '';
    if (addInputLname) addInputLname.value = '';
    if (addInputPhone) addInputPhone.value = '';
    if (addInputEmail) addInputEmail.value = '';

    // Refresh empresas select list so all master empresas are available
    populateEmpresaSelects();
    if (addSelectEmpresa) addSelectEmpresa.value = '';

    // Select default tag in add modal
    selectedNewContactTag = 'cliente_gold';
    if (addTagOptionsContainer) {
      const tagOpts = addTagOptionsContainer.querySelectorAll('.modal-tag-option');
      tagOpts.forEach(opt => {
        const tagKey = opt.dataset.addTag;
        if (tagKey === selectedNewContactTag) opt.classList.add('selected');
        else opt.classList.remove('selected');

        opt.onclick = () => {
          tagOpts.forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
          selectedNewContactTag = tagKey;
        };
      });
    }

    // Reset persona toggle
    newContactPersona = '';
    if (addPersonaToggle) {
      addPersonaToggle.querySelectorAll('.persona-toggle-btn').forEach(b => b.classList.remove('active'));
      const noneBtn = document.getElementById('add-persona-none');
      if (noneBtn) noneBtn.classList.add('active');
    }

    if (addModalOverlay) {
      addModalOverlay.style.display = 'flex';
      addModalOverlay.classList.add('active');
    }
  }

  if (btnOpenAddModal) {
    btnOpenAddModal.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddContactModal();
    });
  }

  function closeAddContactModal() {
    if (addModalOverlay) {
      addModalOverlay.style.display = 'none';
      addModalOverlay.classList.remove('active');
    }
  }

  if (addModalClose) addModalClose.addEventListener('click', closeAddContactModal);
  if (btnCancelAddContact) btnCancelAddContact.addEventListener('click', closeAddContactModal);
  if (addModalOverlay) {
    addModalOverlay.addEventListener('click', (e) => {
      if (e.target === addModalOverlay) closeAddContactModal();
    });
  }

  btnSaveNewContact.addEventListener('click', () => {
    const nome = addInputNome.value.trim();
    if (!nome) {
      alert('Por favor ingresa al menos el Nombre Completo del contacto.');
      return;
    }

    const cleanPhone = addInputPhone.value.replace(/[^0-9]/g, '');
    const newId = Date.now(); // Unique ID

    const newContact = {
      id: newId,
      nome: nome,
      empresa: addSelectEmpresa ? addSelectEmpresa.value.trim() : '',
      oficio: addInputOficio.value.trim(),
      // Ciudad/País — lat/lng vacíos, listos para Google Maps Geocoding API
      ciudad: addInputCiudad.value.trim(),
      lat: null,
      lng: null,
      primeiroNome: addInputFname.value.trim() || nome.split(' ')[0],
      ultimoNome: addInputLname.value.trim(),
      numero: cleanPhone,
      email: addInputEmail.value.trim(),
      cpf: '',
      dataNascimento: ''
    };

    // Save initial tag
    localStorage.setItem(`cntxt_tag_${newId}`, selectedNewContactTag);

    // Save initial persona type (B2C / B2B)
    if (newContactPersona) {
      localStorage.setItem(`cntxt_persona_${newId}`, newContactPersona);
    }

    // Save custom contacts array
    let customList = [];
    try {
      customList = JSON.parse(localStorage.getItem('cntxt_custom_contacts')) || [];
    } catch (e) {
      customList = [];
    }
    customList.push(newContact);
    localStorage.setItem('cntxt_custom_contacts', JSON.stringify(customList));
    scheduleServerSync(true);

    contactsData.unshift(newContact);
    updateMetrics();
    renderDirectory();
    setSpotlight(newContact);

    closeAddContactModal();
    alert('¡Nueva relación añadida exitosamente al directorio R.E.D.!');
  });

  // ── EMPRESAS MANAGEMENT ENGINE & DIRECTORY ──────────────────────────────────
  let masterEmpresas = [];
  let currentEmpresaSector = 'all';
  let currentDirMode = 'personas'; // 'personas' | 'empresas'

  const empresaModalOverlay = document.getElementById('empresa-modal-overlay');
  const empresaModalClose   = document.getElementById('empresa-modal-close');
  const btnCancelEmpresa    = document.getElementById('btn-cancel-empresa');
  const btnSaveEmpresa      = document.getElementById('btn-save-empresa');
  const btnOpenAddEmpresaModal = document.getElementById('btn-open-add-empresa-modal');
  const empresaModalTitle   = document.getElementById('empresa-modal-title');
  const empresaEditId       = document.getElementById('empresa-edit-id');

  const empresaInputNome    = document.getElementById('empresa-input-nome');
  const empresaInputSector  = document.getElementById('empresa-input-sector');
  const empresaInputNit     = document.getElementById('empresa-input-nit');
  const empresaInputCiudad  = document.getElementById('empresa-input-ciudad');
  const empresaInputWeb     = document.getElementById('empresa-input-web');
  const empresaInputNotes   = document.getElementById('empresa-input-notes');

  const searchEmpresaInput  = document.getElementById('search-empresa-input');
  const empresaSectorPills  = document.getElementById('empresa-sector-pills');
  const empresaCardsGrid    = document.getElementById('empresa-cards-grid');
  const companyCountBadge   = document.getElementById('company-count');
  const btnEmpresaViewGrid  = document.getElementById('btn-empresa-view-grid');
  const btnEmpresaViewList  = document.getElementById('btn-empresa-view-list');

  let empresaViewMode = 'grid'; // 'grid' | 'list'
  let activeTargetSelectForEmpresa = null;

  function initMasterEmpresas() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem('cntxt_master_empresas')) || [];
    } catch (e) {
      saved = [];
    }

    const map = new Map();
    // Pre-populate saved master empresas
    saved.forEach(emp => {
      if (emp && emp.nome) {
        if (!emp.id) emp.id = 'emp_' + Math.random().toString(36).substr(2, 9);
        map.set(emp.nome.trim().toLowerCase(), emp);
      }
    });

    // Auto-discover unique empresas from contactsData so existing data works seamlessly
    contactsData.forEach(c => {
      const empName = (c.empresa || '').trim();
      if (empName && !map.has(empName.toLowerCase())) {
        map.set(empName.toLowerCase(), {
          id: 'auto_' + Math.random().toString(36).substr(2, 9),
          nome: empName,
          sector: 'General / Comercial',
          nit: '',
          ciudad: c.ciudad || '',
          web: '',
          notes: 'Auto-registrada desde contactos R.E.D.'
        });
      }
    });

    masterEmpresas = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
    localStorage.setItem('cntxt_master_empresas', JSON.stringify(masterEmpresas));

    if (companyCountBadge) companyCountBadge.textContent = masterEmpresas.length;

    populateEmpresaSelects();
    renderEmpresaSectorPills();
    renderEmpresasCards();
  }

  function populateEmpresaSelects() {
    const sorted = [...masterEmpresas].sort((a, b) => a.nome.localeCompare(b.nome));

    let html = `<option value="">(Sin Empresa Especificada / Particular)</option>`;
    sorted.forEach(emp => {
      html += `<option value="${escapeHtml(emp.nome)}">${escapeHtml(emp.nome)}${emp.sector ? ' — ' + escapeHtml(emp.sector) : ''}</option>`;
    });

    if (editSelectEmpresa) editSelectEmpresa.innerHTML = html;
    if (addSelectEmpresa)  addSelectEmpresa.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function openAddEmpresaModal(targetSelectEl = null, prefillName = '') {
    activeTargetSelectForEmpresa = targetSelectEl;
    if (empresaEditId) empresaEditId.value = '';
    if (empresaModalTitle) empresaModalTitle.textContent = '🏢 Nueva Relación Empresarial';
    if (empresaInputNome) empresaInputNome.value = prefillName;
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

  function openEditEmpresaModal(targetEmp) {
    if (!targetEmp) return;
    activeTargetSelectForEmpresa = null;
    if (empresaEditId) empresaEditId.value = targetEmp.id || '';
    if (empresaModalTitle) empresaModalTitle.textContent = '✏️ Editar Empresa: ' + targetEmp.nome;
    if (empresaInputNome) empresaInputNome.value = targetEmp.nome || '';
    if (empresaInputSector) empresaInputSector.value = targetEmp.sector || '';
    if (empresaInputNit) empresaInputNit.value = targetEmp.nit || '';
    if (empresaInputCiudad) empresaInputCiudad.value = targetEmp.ciudad || '';
    if (empresaInputWeb) empresaInputWeb.value = targetEmp.web || '';
    if (empresaInputNotes) empresaInputNotes.value = targetEmp.notes || '';

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

  if (btnCancelEmpresa) btnCancelEmpresa.addEventListener('click', closeEmpresaModal);
  if (empresaModalClose) empresaModalClose.addEventListener('click', closeEmpresaModal);
  if (empresaModalOverlay) {
    empresaModalOverlay.addEventListener('click', (e) => {
      if (e.target === empresaModalOverlay) closeEmpresaModal();
    });
  }

  if (btnOpenAddEmpresaModal) {
    btnOpenAddEmpresaModal.addEventListener('click', () => openAddEmpresaModal());
  }

  if (btnSaveEmpresa) {
    btnSaveEmpresa.addEventListener('click', () => {
      const nome = empresaInputNome.value.trim();
      if (!nome) {
        alert('Por favor ingresa el Nombre de la Empresa.');
        return;
      }

      const editId = empresaEditId ? empresaEditId.value : '';
      let newEmpObj = null;

      if (editId) {
        const idx = masterEmpresas.findIndex(e => e.id === editId);
        if (idx !== -1) {
          const oldNome = masterEmpresas[idx].nome;
          
          masterEmpresas[idx] = {
            ...masterEmpresas[idx],
            nome: nome,
            sector: empresaInputSector.value.trim() || 'General',
            nit: empresaInputNit.value.trim(),
            ciudad: empresaInputCiudad.value.trim(),
            web: empresaInputWeb.value.trim(),
            notes: empresaInputNotes.value.trim()
          };
          newEmpObj = masterEmpresas[idx];

          // If company name changed, automatically update all linked contacts across the system!
          if (oldNome && oldNome !== nome) {
            contactsData.forEach(c => {
              const merged = getMergedContactData(c);
              if ((merged.empresa || '').trim().toLowerCase() === oldNome.trim().toLowerCase()) {
                merged.empresa = nome;
                // Save updated contact edit to LocalStorage
                localStorage.setItem(`cntxt_edit_${c.id}`, JSON.stringify(merged));
              }
            });
          }
        }
      } else {
        newEmpObj = {
          id: 'emp_' + Date.now(),
          nome: nome,
          sector: empresaInputSector.value.trim() || 'General',
          nit: empresaInputNit.value.trim(),
          ciudad: empresaInputCiudad.value.trim(),
          web: empresaInputWeb.value.trim(),
          notes: empresaInputNotes.value.trim()
        };
        masterEmpresas.push(newEmpObj);
      }

      masterEmpresas.sort((a, b) => a.nome.localeCompare(b.nome));
      localStorage.setItem('cntxt_master_empresas', JSON.stringify(masterEmpresas));
      scheduleServerSync();

      if (companyCountBadge) companyCountBadge.textContent = masterEmpresas.length;

      populateEmpresaSelects();

      if (activeTargetSelectForEmpresa && newEmpObj) {
        activeTargetSelectForEmpresa.value = newEmpObj.nome;
      }

      renderEmpresaSectorPills();
      renderEmpresasCards();
      renderDirectory();
      closeEmpresaModal();
      alert(`¡Empresa "${nome}" guardada y datos actualizados correctamente!`);
    });
  }

  // Render Empresas Directory View
  function renderEmpresaSectorPills() {
    if (!empresaSectorPills) return;
    const sectorsSet = new Set(['all']);
    masterEmpresas.forEach(e => { if (e.sector) sectorsSet.add(e.sector); });

    let pillsHtml = `<button class="empresa-sector-pill ${currentEmpresaSector === 'all' ? 'active' : ''}" data-sec="all">Todos los sectores (${masterEmpresas.length})</button>`;
    Array.from(sectorsSet).filter(s => s !== 'all').sort().forEach(sec => {
      const count = masterEmpresas.filter(e => e.sector === sec).length;
      pillsHtml += `<button class="empresa-sector-pill ${currentEmpresaSector === sec ? 'active' : ''}" data-sec="${escapeHtml(sec)}">${escapeHtml(sec)} (${count})</button>`;
    });
    empresaSectorPills.innerHTML = pillsHtml;

    empresaSectorPills.querySelectorAll('.empresa-sector-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        currentEmpresaSector = btn.dataset.sec;
        renderEmpresaSectorPills(); // re-render pills to update active state
        renderEmpresasCards();      // re-render cards only
      });
    });
  }

  function renderEmpresasCards() {
    if (!empresaCardsGrid) return;
    const query = (searchEmpresaInput ? searchEmpresaInput.value : '').toLowerCase().trim();

    const filteredEmpresas = masterEmpresas.filter(emp => {
      const matchSearch = emp.nome.toLowerCase().includes(query) ||
                          (emp.sector || '').toLowerCase().includes(query) ||
                          (emp.ciudad || '').toLowerCase().includes(query);
      if (!matchSearch) return false;
      if (currentEmpresaSector !== 'all' && emp.sector !== currentEmpresaSector) return false;
      return true;
    });

    empresaCardsGrid.innerHTML = '';

    // Apply list/grid class
    empresaCardsGrid.classList.toggle('list-view', empresaViewMode === 'list');

    if (filteredEmpresas.length === 0) {
      empresaCardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
          No se encontraron empresas que coincidan con la búsqueda o filtro de sector.
        </div>
      `;
      return;
    }

    filteredEmpresas.forEach(emp => {
      const linkedContacts = contactsData.filter(c => {
        const merged = getMergedContactData(c);
        return (merged.empresa || '').trim().toLowerCase() === emp.nome.trim().toLowerCase();
      });

      const initials = getInitials(emp.nome);

      const card = document.createElement('div');
      card.className = 'empresa-card';

      let contactsPreviewHtml = '';
      if (linkedContacts.length > 0) {
        const top3 = linkedContacts.slice(0, 3);
        let itemsHtml = '';
        top3.forEach(c => {
          const merged = getMergedContactData(c);
          itemsHtml += `
            <div class="empresa-contact-mini-item">
              <span class="empresa-contact-mini-dot"></span>
              <strong>${escapeHtml(merged.nome)}</strong>
              ${merged.oficio ? `<span style="color:var(--text-muted); font-size:10px;">(${escapeHtml(merged.oficio)})</span>` : ''}
            </div>
          `;
        });

        contactsPreviewHtml = `
          <div class="empresa-contacts-preview">
            <div class="empresa-contacts-preview-title">
              <span>👥 Contactos Vinculados</span>
              <span>${linkedContacts.length} total</span>
            </div>
            <div class="empresa-contacts-mini-list">
              ${itemsHtml}
              ${linkedContacts.length > 3 ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">+ ${linkedContacts.length - 3} contactos más...</div>` : ''}
            </div>
          </div>
        `;
      } else {
        contactsPreviewHtml = `
          <div class="empresa-contacts-preview" style="opacity:0.6;">
            <div class="empresa-contacts-preview-title">👥 Sin contactos vinculados aún</div>
          </div>
        `;
      }

      card.innerHTML = `
        <div>
          <div class="empresa-card-header">
            <div class="empresa-avatar">${initials}</div>
            <div class="empresa-info-main">
              <div class="empresa-name-title" title="${escapeHtml(emp.nome)}">${escapeHtml(emp.nome)}</div>
              <div class="empresa-sector-tag">🏢 ${escapeHtml(emp.sector || 'Organización')}</div>
            </div>
          </div>

          <div class="empresa-card-body">
            ${emp.ciudad ? `<div class="empresa-detail-row">📍 ${escapeHtml(emp.ciudad)}</div>` : ''}
            ${emp.nit ? `<div class="empresa-detail-row">📄 NIT: ${escapeHtml(emp.nit)}</div>` : ''}
            ${emp.web ? `<div class="empresa-detail-row">🌐 <a href="${emp.web.startsWith('http') ? emp.web : 'https://' + emp.web}" target="_blank" style="color:#C16A5F; text-decoration:none;">${escapeHtml(emp.web)}</a></div>` : ''}
            ${contactsPreviewHtml}
          </div>
        </div>

        <div class="empresa-card-footer">
          <button class="btn-view-empresa-contacts" data-emp-nome="${escapeHtml(emp.nome)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
            Ver Contactos (${linkedContacts.length})
          </button>
          <button class="btn-edit-empresa" data-emp-id="${escapeHtml(emp.id)}" data-emp-nome="${escapeHtml(emp.nome)}">
            ✏️ Editar
          </button>
        </div>
      `;

      // Click card (except "Ver Contactos" or links) to edit
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-view-empresa-contacts') || e.target.closest('a')) return;
        openEditEmpresaModal(emp);
      });

      const btnView = card.querySelector('.btn-view-empresa-contacts');
      if (btnView) {
        btnView.addEventListener('click', (e) => {
          e.stopPropagation();
          const empNome = btnView.dataset.empNome;
          switchDirSubtab('personas');
          if (searchInput) searchInput.value = empNome;
          renderDirectory();
        });
      }

      const btnEdit = card.querySelector('.btn-edit-empresa');
      if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
          e.stopPropagation();
          const empId = btnEdit.dataset.empId;
          const empNome = btnEdit.dataset.empNome;
          let targetEmp = masterEmpresas.find(item => empId && String(item.id) === String(empId));
          if (!targetEmp && empNome) {
            targetEmp = masterEmpresas.find(item => item.nome.trim().toLowerCase() === empNome.trim().toLowerCase());
          }
          if (targetEmp) {
            openEditEmpresaModal(targetEmp);
          } else {
            openEditEmpresaModal(emp);
          }
        });
      }

      empresaCardsGrid.appendChild(card);
    });
  }

  // Subtabs Switcher Logic (Personas vs Empresas)
  const btnSubtabPersonas = document.getElementById('btn-subtab-personas');
  const btnSubtabEmpresas = document.getElementById('btn-subtab-empresas');
  const dirPersonasView    = document.getElementById('dir-personas-view');
  const dirEmpresasView    = document.getElementById('dir-empresas-view');
  const personasHeaderActions = document.getElementById('personas-header-actions');
  const empresasHeaderActions = document.getElementById('empresas-header-actions');

  function switchDirSubtab(mode) {
    currentDirMode = mode;
    if (mode === 'personas') {
      if (btnSubtabPersonas) btnSubtabPersonas.classList.add('active');
      if (btnSubtabEmpresas) btnSubtabEmpresas.classList.remove('active');
      if (dirPersonasView) dirPersonasView.style.display = 'block';
      if (dirEmpresasView) dirEmpresasView.style.display = 'none';
      if (personasHeaderActions) personasHeaderActions.style.display = 'flex';
      if (empresasHeaderActions) empresasHeaderActions.style.display = 'none';
    } else {
      if (btnSubtabEmpresas) btnSubtabEmpresas.classList.add('active');
      if (btnSubtabPersonas) btnSubtabPersonas.classList.remove('active');
      if (dirPersonasView) dirPersonasView.style.display = 'none';
      if (dirEmpresasView) dirEmpresasView.style.display = 'block';
      if (personasHeaderActions) personasHeaderActions.style.display = 'none';
      if (empresasHeaderActions) empresasHeaderActions.style.display = 'flex';
      renderEmpresaSectorPills();
      renderEmpresasCards();
    }
  }

  if (btnSubtabPersonas) btnSubtabPersonas.addEventListener('click', () => switchDirSubtab('personas'));
  if (btnSubtabEmpresas) btnSubtabEmpresas.addEventListener('click', () => switchDirSubtab('empresas'));

  if (searchEmpresaInput) {
    // Solo re-renderizar las cards, NO las pills → el input no pierde el foco
    searchEmpresaInput.addEventListener('input', () => {
      // Sincronizar al buscador global para mantener el badge congruente
      if (searchInput) searchInput.value = searchEmpresaInput.value;
      renderDirectory();    // actualiza el badge del directorio
      renderEmpresasCards(); // actualiza las tarjetas (no pierde foco)
    });
  }

  // ── Empresa View Mode Toggle ──────────────────────────────────
  if (btnEmpresaViewGrid) {
    btnEmpresaViewGrid.addEventListener('click', () => {
      empresaViewMode = 'grid';
      btnEmpresaViewGrid.classList.add('active');
      btnEmpresaViewList.classList.remove('active');
      renderEmpresasCards();
    });
  }
  if (btnEmpresaViewList) {
    btnEmpresaViewList.addEventListener('click', () => {
      empresaViewMode = 'list';
      btnEmpresaViewList.classList.add('active');
      btnEmpresaViewGrid.classList.remove('active');
      renderEmpresasCards();
    });
  }

  // ── EXPORT CONSOLIDATED CSV ────────────────────────────────────────────────
  btnExportCsv.addEventListener('click', () => {
    if (contactsData.length === 0) return;

    let csvContent = '\uFEFFnome;numero;email;cpf;dataNascimento;primeiroNome;ultimoNome;oficio;ciudad;tipoPersona;Empresa;tipoRelacion;canalProspeccion;notasBitacora\n';

    contactsData.forEach(rawContact => {
      const c = getMergedContactData(rawContact);
      const tag = getContactTag(c);
      const channel = getContactChannel(c);
      const personaKey = getContactPersona(c);
      const personaLabel = personaKey === 'b2c' ? 'B2C Persona Natural' : personaKey === 'b2b' ? 'B2B Persona Juridica' : 'Sin asignar';
      const note = localStorage.getItem(`cntxt_notes_${c.id}`) || '';

      const escapeField = (val) => {
        if (!val) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const row = [
        escapeField(c.nome),
        escapeField(c.numero),
        escapeField(c.email),
        escapeField(c.cpf),
        escapeField(c.dataNascimento),
        escapeField(c.primeiroNome),
        escapeField(c.ultimoNome),
        escapeField(c.oficio),
        escapeField(c.ciudad),
        escapeField(personaLabel),
        escapeField(c.empresa),
        escapeField(tag.name),
        escapeField(channel ? channel.name : 'Sin canal asignado'),
        escapeField(note)
      ].join(';');

      csvContent += row + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Contactos_Consolidados_CNTXT_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`¡Base de datos consolidada exportada exitosamente! (${contactsData.length} contactos con notas y etiquetas).`);
  });

  // Spotlight detail click
  spotlightDetailBtn.addEventListener('click', () => {
    if (selectedContact) openModal(selectedContact);
  });

  // Search Listener
  searchInput.addEventListener('input', () => {
    currentPage = 1;
    if (activeTab === 'pulsos') {
      renderPulsePanel();
    } else {
      renderDirectory();
      // Si estamos en la vista de Empresas, sincronizar el término de búsqueda
      // para que las tarjetas coincidan con el contador del directorio
      if (currentDirMode === 'empresas' && searchEmpresaInput) {
        searchEmpresaInput.value = searchInput.value;
        renderEmpresasCards();
      }
    }
  });

  // Filter Buttons Listeners (Pills)
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      renderDirectory();
    });
  });

  // 13 Tag Filters Listeners
  tagFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tagFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTagFilter = btn.dataset.tagFilter;
      currentPage = 1;
      renderDirectory();
    });
  });

  // 🩸 9 Prospecting Channel Side Dock Listeners
  const sideDockChannelBtns = document.querySelectorAll('.prospecting-channels-list .channel-pill-btn');
  const activeChannelBadge  = document.getElementById('active-channel-badge');

  sideDockChannelBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sideDockChannelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const ch = btn.dataset.channel;
      currentChannelFilter = ch;
      currentPage = 1;

      if (ch === 'all') {
        activeChannelBadge.style.display = 'none';
      } else {
        activeChannelBadge.style.display = 'inline-block';
        activeChannelBadge.textContent = CHANNEL_MAP[ch] || 'Filtrado';
      }

      // If user was in Spotlight or Mapeo tab, switch to Directory view so they see the filtered list!
      if (activeTab !== 'all') {
        const dirTab = document.querySelector('.tab-btn[data-tab="all"]');
        if (dirTab) dirTab.click();
      }

      renderDirectory();
    });
  });

  // ── PERSONA FILTER (B2C / B2B) ───────────────────────────────────────────
  const personaPills = document.querySelectorAll('#persona-filter-group .persona-pill');
  personaPills.forEach(pill => {
    pill.addEventListener('click', () => {
      personaPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentPersonaFilter = pill.dataset.persona;
      currentPage = 1;
      renderDirectory();
    });
  });

  // Persona toggle in EDIT modal — saves immediately to localStorage
  const editPersonaToggle = document.getElementById('edit-persona-toggle');
  if (editPersonaToggle) {
    editPersonaToggle.querySelectorAll('.persona-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editPersonaToggle.querySelectorAll('.persona-toggle-btn')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (selectedContact) {
          setContactPersona(selectedContact.id, btn.dataset.personaVal);
        }
      });
    });
  }

  // Persona toggle in ADD modal — stores selection for use on save
  let newContactPersona = '';
  const addPersonaToggle = document.getElementById('add-persona-toggle');
  if (addPersonaToggle) {
    addPersonaToggle.querySelectorAll('.persona-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addPersonaToggle.querySelectorAll('.persona-toggle-btn')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        newContactPersona = btn.dataset.personaVal;
      });
    });
  }

  // Tab Buttons Listeners (including Mapeo R.E.D. & Pulsos Reales tabs)
  const dashboardGrid = document.querySelector('.dashboard-grid');
  const redMapPanel = document.getElementById('red-map-panel');
  const pulsosRealesPanel = document.getElementById('pulsos-reales-panel');
  const globulosPanel = document.getElementById('globulos-panel');
  const mainMetricsRow = document.getElementById('main-metrics-row') || document.querySelector('.metrics-row');
  const globulosBgLayer = document.getElementById('globulos-bg-layer');
  const globulosBgCells = document.getElementById('globulos-bg-cells');

  // ── Glóbulos Rojos Dynamic Scroll Parallax ──────────────────────────────
  let parallaxTicking = false;

  function updateGlobulosScrollParallax() {
    if (activeTab === 'globulos') {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      
      // Dynamic vertical drift of floating 3D red blood cells
      if (globulosBgCells) {
        const cellOffset = -scrollY * 0.35;
        globulosBgCells.style.transform = `translate3d(0, ${cellOffset}px, 0)`;
      }
    }
    parallaxTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!parallaxTicking) {
      window.requestAnimationFrame(updateGlobulosScrollParallax);
      parallaxTicking = true;
    }
  }, { passive: true });

  function showTab(tab) {
    // Show top metrics row ONLY for 'Directorio R.E.D.' (tab === 'all'), hide for all other tabs
    if (mainMetricsRow) {
      mainMetricsRow.style.display = (tab === 'all') ? '' : 'none';
    }

    // Toggle Glóbulos dynamic background layer
    if (globulosBgLayer) {
      if (tab === 'globulos') {
        globulosBgLayer.classList.add('active');
        updateGlobulosScrollParallax();
      } else {
        globulosBgLayer.classList.remove('active');
      }
    }

    if (tab === 'mapeo') {
      dashboardGrid.style.display = 'none';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'none';
      redMapPanel.style.display = 'block';
      updatePhaseCounts();
    } else if (tab === 'pulsos') {
      dashboardGrid.style.display = 'none';
      redMapPanel.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'none';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'flex';
      renderPulsePanel();
    } else if (tab === 'globulos') {
      dashboardGrid.style.display = 'none';
      redMapPanel.style.display = 'none';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'flex';
      renderGlobulosPanel();
    } else {
      dashboardGrid.style.display = '';
      redMapPanel.style.display = 'none';
      if (pulsosRealesPanel) pulsosRealesPanel.style.display = 'none';
      if (globulosPanel) globulosPanel.style.display = 'none';
      if (tab === 'spotlight') {
        const rand = contactsData[Math.floor(Math.random() * contactsData.length)];
        setSpotlight(rand);
      }
    }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      showTab(activeTab);
    });
  });

  // ── THE PULSE SCALE SYSTEM (Pulsos Reales & Resonancia) ──────────────────────
  let currentPulseFilter = 'all';

  const PULSE_DEFINITIONS = {
    1: {
      level: 1,
      code: 'p1',
      name: 'SIN PULSO',
      subtitle: 'Indifferent Stimulus',
      desc: 'El ente existe en el Biotopo, pero es materia inerte. No hay intercambio energético con CNTXT.',
      kpiName: 'Zero Resonance',
      kpiDesc: '0 aperturas, 0 respuestas',
      color: '#8e95a5',
      badgeClass: 'badge-p1',
      cardClass: 'card-p1',
      pathClass: 'ecg-path-p1',
      agentTag: '⚡ ACCIÓN DE CHOQUE',
      agentTagClass: 'agent-tag-p1',
      btnClass: 'btn-trigger-p1',
      agentActionText: 'Antigravity (Backend): Inerte > 30 días. Orquestar campaña de choque energético (Email Marketing IDI).',
      btnLabel: '⚡ Ejecutar Choque Energético IDI',
      toastIcon: '⚡',
      toastTitle: 'Choque Energético Detonado (Email IDI)',
      toastMessage: 'Antigravity ha orquestado una campaña de reputación de marca para detectar señal vital inicial en el ente.'
    },
    2: {
      level: 2,
      code: 'p2',
      name: 'PULSO DÉBIL',
      subtitle: 'Dissonant Frequency',
      desc: 'Hay interacción, pero la frecuencia es irregular e intermitente. La señal R.E.D. aún no resuena profundamente.',
      kpiName: 'Low Coherence',
      kpiDesc: 'Aperturas ocasionales, 1 visita web',
      color: '#00e5ff',
      badgeClass: 'badge-p2',
      cardClass: 'card-p2',
      pathClass: 'ecg-path-p2',
      agentTag: '🎛️ MODULACIÓN DE FRECUENCIA',
      agentTagClass: 'agent-tag-p2',
      btnClass: 'btn-trigger-p2',
      agentActionText: 'Antigravity (Backend): Interacción detectada. Sugerir al System Owner enviar caso de éxito ultra-específico diseñado por IDI.',
      btnLabel: '🎛️ Enviar Sugerencia de Modulación IDI',
      toastIcon: '🎛️',
      toastTitle: 'Sugerencia de Modulación R.E.D. Notificada',
      toastMessage: 'Notificación enviada al System Owner R.E.D. Caso de éxito ultra-específico generado por IDI listado para envío.'
    },
    3: {
      level: 3,
      code: 'p3',
      name: 'PULSO INTENSO',
      subtitle: 'Synchronous Pulse',
      desc: 'Sincronía total. Intercambio masivo de Energía (pasión/confianza) y datos. El organismo está listo para absorber materia (cash flow).',
      kpiName: 'High Resonance',
      kpiDesc: 'Reuniones agendadas, propuesta descargada',
      color: '#ff2a4b',
      badgeClass: 'badge-p3',
      cardClass: 'card-p3',
      pathClass: 'ecg-path-p3',
      agentTag: '🚀 PRIORIDAD MÁXIMA / C.O.R. & C.A.S.H.',
      agentTagClass: 'agent-tag-p3',
      btnClass: 'btn-trigger-p3',
      agentActionText: 'Antigravity (Backend): Marcado como "Crítico para Sostenibilidad". Detona C.O.R. (operación) y alerta C.A.S.H. para facturación.',
      btnLabel: '🚀 Detonar Alerta C.O.R. & C.A.S.H.',
      toastIcon: '🚀',
      toastTitle: 'Alerta Intersistémica C.O.R. & C.A.S.H. Activada',
      toastMessage: 'Preparación de operaciones (C.O.R.) en marcha y notificación prioritaria enviada a C.A.S.H. para facturación inminente.'
    },
    4: {
      level: 4,
      code: 'p4',
      name: 'TEJIDO INTEGRADO',
      subtitle: 'Joined Vital Tissue',
      desc: 'El lead ya no es un ente externo; se integró a la Biocenosis. Fortalece el organismo y genera Cash Flow continuo.',
      kpiName: 'LTV / NPS Elité',
      kpiDesc: 'Proyecto activo & reputación aportada',
      color: '#00e676',
      badgeClass: 'badge-p4',
      cardClass: 'card-p4',
      pathClass: 'ecg-path-p4',
      agentTag: '🌿 HOMEOSTASIS & RETROALIMENTACIÓN N.E.O.',
      agentTagClass: 'agent-tag-p4',
      btnClass: 'btn-trigger-p4',
      agentActionText: 'Antigravity (Backend): Movido a R.E.D. Fidelización / C.O.R. Ejecución. Orquesta retroalimentación continua hacia N.E.O.',
      btnLabel: '🌿 Retroalimentar Estrategia N.E.O.',
      toastIcon: '🌿',
      toastTitle: 'Homeostasis & Retroalimentación a N.E.O.',
      toastMessage: 'Ente en estado de Tejido Integrado. Métricas de retención y LTV incorporadas a la matriz estratégica N.E.O.'
    }
  };

  function getContactPulse(client) {
    const saved = localStorage.getItem(`cntxt_pulse_${client.id}`);
    if (saved && PULSE_DEFINITIONS[saved]) {
      return PULSE_DEFINITIONS[saved];
    }

    // Dynamic classification based on contact tags, phase & attributes
    const tag = getContactTag(client).key;
    const phase = getContactPhase(client);

    if (['cliente_black', 'cliente_gold', 'cliente_silver'].includes(tag) || phase === 'E') {
      return PULSE_DEFINITIONS[4]; // TEJIDO
    } else if (['growth', 'embajador', 'aliados'].includes(tag) || phase === 'D') {
      return PULSE_DEFINITIONS[3]; // PULSO INTENSO
    } else if (['lead', 'media', 'candidatos'].includes(tag) || phase === 'R') {
      return PULSE_DEFINITIONS[2]; // PULSO DÉBIL
    } else {
      // Deterministic fallback across 4 pulse levels
      const level = (client.id % 4) + 1;
      return PULSE_DEFINITIONS[level];
    }
  }

  function setContactPulse(clientId, level) {
    if (PULSE_DEFINITIONS[level]) {
      localStorage.setItem(`cntxt_pulse_${clientId}`, level);
    } else {
      localStorage.removeItem(`cntxt_pulse_${clientId}`);
    }
    scheduleServerSync();
    if (activeTab === 'pulsos') renderPulsePanel();
  }

  // Toast Notification System
  function showAgentToast(title, message, icon = '🧠') {
    const container = document.getElementById('agent-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'agent-toast';
    toast.innerHTML = `
      <div class="agent-toast-icon">${icon}</div>
      <div class="agent-toast-body">
        <div class="agent-toast-title">${title}</div>
        <div class="agent-toast-desc">${message}</div>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // Trigger Backend Action from Card
  function triggerAgentAction(client, pulse) {
    showAgentToast(
      `${pulse.toastTitle} — ${client.nome}`,
      pulse.toastMessage,
      pulse.toastIcon
    );
  }

  // SVG ECG Path Generators
  function getECGPathSVG(pulseLevel) {
    if (pulseLevel === 1) {
      // Flat line with micro noise
      return `
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p1" d="M0,30 L100,30 L105,28 L110,32 L115,30 L200,30 L205,29 L210,31 L300,30" fill="none" />
        </svg>
      `;
    } else if (pulseLevel === 2) {
      // Slow irregular pulse
      return `
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p2" d="M0,30 L50,30 L55,25 L60,40 L65,15 L70,35 L75,30 L180,30 L185,26 L190,38 L195,18 L200,33 L205,30 L300,30" fill="none" />
        </svg>
      `;
    } else if (pulseLevel === 3) {
      // Fast rhythmic sharp spikes
      return `
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p3" d="M0,30 L30,30 L35,28 L40,35 L45,5 L52,55 L58,10 L64,38 L70,30 L130,30 L135,28 L140,35 L145,5 L152,55 L158,10 L164,38 L170,30 L230,30 L235,28 L240,35 L245,5 L252,55 L258,10 L264,38 L270,30 L300,30" fill="none" />
        </svg>
      `;
    } else {
      // Integrated tissue harmonic sine wave & mesh
      return `
        <div class="tissue-mesh"></div>
        <svg class="ecg-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
          <path class="ecg-path-p4" d="M0,30 C30,10 60,50 90,30 C120,10 150,50 180,30 C210,10 240,50 270,30 L300,30" fill="none" />
        </svg>
      `;
    }
  }

  // Render Pulsos Reales Grid & Metrics
  function renderPulsePanel() {
    const pulseGrid = document.getElementById('pulse-grid');
    if (!pulseGrid) return;

    const query = searchInput.value.toLowerCase().trim();

    const pCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const filteredList = [];

    contactsData.forEach(rawClient => {
      const client = getMergedContactData(rawClient);
      const pulse = getContactPulse(client);
      pCounts[pulse.level]++;

      const matchesSearch = 
        client.nome.toLowerCase().includes(query) ||
        client.empresa.toLowerCase().includes(query) ||
        client.numero.includes(query) ||
        client.email.toLowerCase().includes(query);

      if (!matchesSearch) return;

      if (currentPulseFilter !== 'all' && String(pulse.level) !== String(currentPulseFilter)) {
        return;
      }

      filteredList.push({ client, pulse });
    });

    // Update Counter Badges
    const c1 = document.getElementById('count-p1'); if (c1) c1.textContent = pCounts[1];
    const c2 = document.getElementById('count-p2'); if (c2) c2.textContent = pCounts[2];
    const c3 = document.getElementById('count-p3'); if (c3) c3.textContent = pCounts[3];
    const c4 = document.getElementById('count-p4'); if (c4) c4.textContent = pCounts[4];

    // Update Biotopo Stats Bar
    const totalCount = contactsData.length;
    const coherenceAvg = totalCount > 0 ? (((pCounts[3] * 92 + pCounts[4] * 99 + pCounts[2] * 45 + pCounts[1] * 5) / totalCount)).toFixed(1) : '84.2';
    const bpmAvg = totalCount > 0 ? Math.round(55 + (pCounts[3] * 0.2) + (pCounts[4] * 0.1)) : 78;

    const statCoh = document.getElementById('stat-coherence-avg'); if (statCoh) statCoh.textContent = `${coherenceAvg}%`;
    const statBpm = document.getElementById('stat-pulse-bpm'); if (statBpm) statBpm.textContent = `${bpmAvg} BPM`;
    const statCrit = document.getElementById('stat-critical-count'); if (statCrit) statCrit.textContent = pCounts[3];
    const statTiss = document.getElementById('stat-tissue-count'); if (statTiss) statTiss.textContent = pCounts[4];

    const pulseActiveCountEl = document.getElementById('pulse-active-count');
    if (pulseActiveCountEl) {
      if (currentPulseFilter === 'all') {
        pulseActiveCountEl.textContent = `Mostrando ${filteredList.length} entes en el Biotopo`;
      } else {
        const pDef = PULSE_DEFINITIONS[currentPulseFilter];
        pulseActiveCountEl.textContent = `Filtrado por Pulso ${currentPulseFilter}: ${pDef.name} (${filteredList.length} entes)`;
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

    // Render cards
    filteredList.slice(0, 60).forEach(({ client, pulse }) => {
      const tag = getContactTag(client);
      const card = document.createElement('div');
      card.className = `pulse-card ${pulse.cardClass}`;

      card.innerHTML = `
        <div class="pulse-card-header">
          <div class="pulse-card-user">
            <div class="pulse-avatar">${getInitials(client.nome)}</div>
            <div class="pulse-user-info">
              <div class="pulse-user-name">${client.nome}</div>
              <div class="pulse-user-company">${client.empresa || 'Cliente Directo'} · ${tag.name}</div>
            </div>
          </div>
          <div class="pulse-state-badge ${pulse.badgeClass}">
            <span class="pulse-dot dot-${pulse.code}"></span>
            <span>P${pulse.level}: ${pulse.name}</span>
          </div>
        </div>

        <div class="ecg-container">
          <div class="ecg-grid-overlay"></div>
          ${getECGPathSVG(pulse.level)}
        </div>

        <div class="pulse-metrics-row">
          <div class="pulse-metric-item">
            <span class="pulse-m-lbl">KPI Vital</span>
            <span class="pulse-m-val" style="color: ${pulse.color};">${pulse.kpiName}</span>
          </div>
          <div class="pulse-metric-item">
            <span class="pulse-m-lbl">Coherencia</span>
            <span class="pulse-m-val">${pulse.kpiDesc}</span>
          </div>
          <div class="pulse-metric-item">
            <span class="pulse-m-lbl">Fase Biotopo</span>
            <span class="pulse-m-val">${pulse.subtitle}</span>
          </div>
        </div>

        <div class="agent-action-box">
          <div class="agent-action-header">
            <span class="${pulse.agentTagClass}">${pulse.agentTag}</span>
            <span style="color: var(--text-dim); font-size: 10px;">Antigravity Engine</span>
          </div>
          <div class="agent-action-text">${pulse.agentActionText}</div>
          <button class="btn-agent-trigger ${pulse.btnClass}">
            ${pulse.btnLabel}
          </button>
        </div>
      `;

      // Trigger button handler
      const triggerBtn = card.querySelector('.btn-agent-trigger');
      if (triggerBtn) {
        triggerBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerAgentAction(client, pulse);
        });
      }

      // Click card opens detail modal
      card.addEventListener('click', () => openModal(client));

      pulseGrid.appendChild(card);
    });
  }

  // Handle Pulse Scale Pill Filters click
  const pulsePillBtns = document.querySelectorAll('.pulse-pill-btn');
  pulsePillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pulsePillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPulseFilter = btn.dataset.pulseFilter;
      renderPulsePanel();
    });
  });

  // Render Pulse Selector in Contact Detail Modal
  function renderModalPulse(client) {
    const currentPulse = getContactPulse(client);
    const pulseOptBtns = document.querySelectorAll('#modal-pulse-options .modal-pulse-btn');
    pulseOptBtns.forEach(btn => {
      const pOpt = parseInt(btn.dataset.pulseOpt, 10);
      btn.classList.toggle('selected', pOpt === currentPulse.level);

      btn.onclick = () => {
        setContactPulse(client.id, pOpt);
        pulseOptBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const newPulse = PULSE_DEFINITIONS[pOpt];
        showAgentToast(
          `Estado de Pulso Actualizado — ${client.nome}`,
          `Entidad asignada a Pulso ${pOpt}: ${newPulse.name} (${newPulse.subtitle}).`,
          '🫀'
        );
      };
    });
  }

  // ── BULK MULTI-SELECTION SYSTEM ───────────────────────────────────────────
  let selectionMode = false;
  let selectedIds = new Set(); // stores contact IDs (numbers)
  let visibleFilteredIds = []; // tracks IDs currently shown in grid

  const btnToggleSelection = document.getElementById('btn-toggle-selection');
  const selectionModeLabel = document.getElementById('selection-mode-label');
  const bulkActionBar      = document.getElementById('bulk-action-bar');
  const bulkCountBadge     = document.getElementById('bulk-count-badge');
  const btnSelectAll       = document.getElementById('btn-select-all');
  const selectAllIcon      = document.getElementById('select-all-icon');
  const selectAllLabel     = document.getElementById('select-all-label');
  const btnBulkClearTags   = document.getElementById('btn-bulk-clear-tags');
  const btnCancelSelection = document.getElementById('btn-cancel-selection');
  const bulkTagTrigger     = document.getElementById('bulk-tag-trigger');
  const bulkTagDropdown    = document.getElementById('bulk-tag-dropdown');
  const bulkTagTriggerLabel= document.getElementById('bulk-tag-trigger-label');

  function enterSelectionMode() {
    selectionMode = true;
    document.body.classList.add('selection-mode');
    btnToggleSelection.classList.add('active');
    selectionModeLabel.textContent = 'Salir Selección';
    bulkActionBar.style.display = 'flex';
    selectedIds.clear();
    updateBulkUI();
    // Rebuild grid to inject checkboxes
    renderDirectory();
  }

  function exitSelectionMode() {
    selectionMode = false;
    document.body.classList.remove('selection-mode');
    btnToggleSelection.classList.remove('active');
    selectionModeLabel.textContent = 'Selección Múltiple';
    bulkActionBar.style.display = 'none';
    bulkTagDropdown.style.display = 'none';
    selectedIds.clear();
    // Rebuild grid without checkboxes
    renderDirectory();
  }

  function updateBulkUI() {
    const count = selectedIds.size;
    // Use ALL filtered contacts (across all pages) for the total
    const total = lastFiltered.length;

    bulkCountBadge.textContent = count === 0
      ? '0 seleccionados'
      : `${count} de ${total} seleccionado${count !== 1 ? 's' : ''}`;

    btnSelectAll.classList.remove('all-selected', 'some-selected');
    if (count === 0) {
      selectAllLabel.textContent = 'Seleccionar todo';
    } else if (count === total && total > 0) {
      btnSelectAll.classList.add('all-selected');
      selectAllLabel.textContent = 'Deseleccionar todo';
    } else {
      btnSelectAll.classList.add('some-selected');
      selectAllLabel.textContent = `Seleccionar todo (${total})`;
    }

    // Update each card's visual state
    document.querySelectorAll('.client-card').forEach(card => {
      const id = parseInt(card.dataset.contactId, 10);
      card.classList.toggle('selected', selectedIds.has(id));
    });
  }

  function toggleCardSelection(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    updateBulkUI();
  }

  // Toggle Selection Mode Button
  btnToggleSelection.addEventListener('click', () => {
    if (selectionMode) exitSelectionMode();
    else enterSelectionMode();
  });

  // Select All / Deselect All  — opera sobre TODOS los filtrados (todas las páginas)
  btnSelectAll.addEventListener('click', () => {
    const allFilteredIds = lastFiltered.map(c => c.id);
    const allSelected = allFilteredIds.every(id => selectedIds.has(id)) && allFilteredIds.length > 0;
    if (allSelected) {
      selectedIds.clear();
    } else {
      allFilteredIds.forEach(id => selectedIds.add(id));
    }
    updateBulkUI();
  });

  // Cancel Selection
  btnCancelSelection.addEventListener('click', exitSelectionMode);

  // ── Pagination listeners ──────────────────────────────────────────────────
  btnPagePrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderDirectory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  btnPageNext.addEventListener('click', () => {
    const totalPages = Math.ceil(lastFiltered.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      renderDirectory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  // ── View Mode Toggle ─────────────────────────────────────────────────────
  btnViewGrid.addEventListener('click', () => {
    viewMode = 'grid';
    btnViewGrid.classList.add('active');
    btnViewList.classList.remove('active');
    renderDirectory();
  });

  btnViewList.addEventListener('click', () => {
    viewMode = 'list';
    btnViewList.classList.add('active');
    btnViewGrid.classList.remove('active');
    renderDirectory();
  });

  // Bulk Tag Dropdown Toggle
  bulkTagTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    bulkTagDropdown.style.display = bulkTagDropdown.style.display === 'none' ? 'block' : 'none';
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!bulkTagDropdown.contains(e.target) && e.target !== bulkTagTrigger) {
      bulkTagDropdown.style.display = 'none';
    }
  });

  // Bulk Tag Option Click
  document.querySelectorAll('.bulk-tag-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const tagKey = opt.dataset.bulkTag;
      if (selectedIds.size === 0) {
        alert('Selecciona al menos un contacto para asignar la etiqueta.');
        return;
      }
      const tagName = TAG_MAP[tagKey] || tagKey;
      if (!confirm(`¿Asignar "${tagName}" a ${selectedIds.size} contacto(s)?`)) return;

      selectedIds.forEach(id => {
        localStorage.setItem(`cntxt_tag_${id}`, tagKey);
      });
      scheduleServerSync();

      bulkTagTriggerLabel.textContent = `✓ ${tagName}`;
      bulkTagDropdown.style.display = 'none';

      setTimeout(() => { bulkTagTriggerLabel.textContent = 'Asignar Etiqueta'; }, 2500);

      renderDirectory();
      alert(`¡Etiqueta "${tagName}" asignada a ${selectedIds.size} contacto(s) exitosamente!`);
    });
  });

  // Bulk Clear Tags
  btnBulkClearTags.addEventListener('click', () => {
    if (selectedIds.size === 0) {
      alert('Selecciona al menos un contacto para borrar sus etiquetas.');
      return;
    }
    if (!confirm(`¿Borrar las etiquetas de ${selectedIds.size} contacto(s)? Quedarán sin ninguna etiqueta asignada.`)) return;

    selectedIds.forEach(id => {
      // Guardamos 'none' como centinela para que getContactTag no les asigne
      // una etiqueta automática por inferencia de nombre/empresa.
      localStorage.setItem(`cntxt_tag_${id}`, 'none');
    });
    scheduleServerSync();

    renderDirectory();
    alert(`Etiquetas eliminadas de ${selectedIds.size} contacto(s). Ahora aparecen sin etiqueta.`);
  });

  // ── R.E.D. PHASE SYSTEM ───────────────────────────────────────────────────
  // Phase keys: 'R' | 'D' | 'E' (Relación, Diseño, Expansión)

  function getContactPhase(client) {
    return localStorage.getItem(`cntxt_phase_${client.id}`) || null;
  }

  function setContactPhase(clientId, phase) {
    localStorage.setItem(`cntxt_phase_${clientId}`, phase);
    scheduleServerSync();
  }

  function updatePhaseCounts() {
    const counts = { R: 0, D: 0, E: 0 };
    contactsData.forEach(c => {
      const p = getContactPhase(c);
      if (p && counts[p] !== undefined) counts[p]++;
    });
    document.getElementById('phase-r-count').textContent = counts.R;
    document.getElementById('phase-d-count').textContent = counts.D;
    document.getElementById('phase-e-count').textContent = counts.E;
  }

  function renderModalPhase(client) {
    const currentPhase = getContactPhase(client);
    const phaseBtns = document.querySelectorAll('#modal-phase-options .red-phase-btn');
    phaseBtns.forEach(btn => {
      const phase = btn.dataset.phase;
      btn.classList.toggle('active', phase === currentPhase);
      btn.onclick = () => {
        setContactPhase(client.id, phase);
        phaseBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Refresh counts live if Mapeo panel is visible
        if (activeTab === 'mapeo') updatePhaseCounts();
      };
    });
  }

  // ── Fullscreen Toggle ──────────────────────────────────────────────────────
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const splashFullscreenBtn = document.getElementById('splash-fullscreen-btn');
  const iconExpand   = fullscreenBtn.querySelector('.icon-expand');
  const iconCollapse = fullscreenBtn.querySelector('.icon-collapse');

  function updateFullscreenIcon() {
    const isFs = !!document.fullscreenElement;
    // Sync portal button
    iconExpand.style.display   = isFs ? 'none'  : 'block';
    iconCollapse.style.display = isFs ? 'block' : 'none';
    fullscreenBtn.classList.toggle('is-fullscreen', isFs);
    fullscreenBtn.title = isFs ? 'Salir de Pantalla Completa' : 'Pantalla Completa';
    // Sync splash button
    if (splashFullscreenBtn) {
      const splashExpand   = splashFullscreenBtn.querySelector('.icon-expand');
      const splashCollapse = splashFullscreenBtn.querySelector('.icon-collapse');
      if (splashExpand)   splashExpand.style.display   = isFs ? 'none'  : 'block';
      if (splashCollapse) splashCollapse.style.display = isFs ? 'block' : 'none';
      splashFullscreenBtn.classList.toggle('is-fullscreen', isFs);
      splashFullscreenBtn.title = isFs ? 'Salir de Pantalla Completa' : 'Pantalla Completa';
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  fullscreenBtn.addEventListener('click', toggleFullscreen);
  if (splashFullscreenBtn) {
    splashFullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  document.addEventListener('fullscreenchange', updateFullscreenIcon);

  // ── CINEMATIC INTRO SPLASH OVERLAY — 4-COLOR HEARTBEAT ────────────────────
  const splashOverlay = document.getElementById('splash-overlay');
  const splashSkipBtn = document.getElementById('splash-skip-btn');
  const brandPill     = document.querySelector('.brand-pill');
  let splashDismissTimer = null;

  // Rotating quote catalog — Pulse & Relationships
  const SPLASH_QUOTES = [
    {
      text: 'Las personas no compran lo que haces, compran por qué lo haces; y si no confían en ti, la transacción jamás ocurrirá.',
      author: '— Inspirado en Simon Sinek'
    },
    {
      text: 'Si le gustas a la gente, te escucharán; pero si confían en ti, harán negocios contigo.',
      author: '— Zig Ziglar'
    },
    {
      text: 'Las redes de contactos no son para coleccionar nombres, sino para cultivar relaciones.',
      author: '— Tim Sanders'
    },
    {
      text: 'Los negocios se hacen con personas, no con empresas. Cuando entiendes la mente y el corazón de las personas, el éxito comercial es solo una consecuencia.',
      author: '— Jürgen Klaric'
    },
    {
      text: 'La moneda más valiosa en los negocios no es el dinero, es la confianza; y la confianza solo se construye a través de relaciones genuinas.',
      author: '— Principio de Influencia y Reciprocidad'
    },
    {
      text: 'No busques clientes para tus productos; busca los productos y experiencias correctas para tus clientes.',
      author: '— Seth Godin'
    },
    {
      text: 'El activo más valioso de una empresa no es su edificio, sus planos o su marca, sino la red de personas que creen en su visión.',
      author: '— Filosofía R.E.D.'
    },
    {
      text: 'Las transacciones crean clientes de una sola vez; las relaciones profundas crean embajadores para toda la vida.',
      author: '— David Sandler'
    },
    {
      text: 'La calidad de tu vida y de tu negocio es directamente proporcional a la calidad de las relaciones que decides cultivar.',
      author: '— Tony Robbins'
    },
    {
      text: 'El diseño crea cultura. La cultura moldea valores. Los valores determinan el futuro. Pero son las relaciones las que mantienen viva la estructura.',
      author: '— Adaptación al Manifiesto CNTXT'
    }
  ];

  function setSplashQuote() {
    const quoteTextEl  = document.getElementById('splash-quote-text');
    const quoteAuthorEl = document.getElementById('splash-quote-author');
    if (!quoteTextEl || !quoteAuthorEl) return;

    const idx = Math.floor(Math.random() * SPLASH_QUOTES.length);
    const q   = SPLASH_QUOTES[idx];

    // Fade out → swap → fade in for smooth transitions on re-plays
    quoteTextEl.style.opacity   = '0';
    quoteAuthorEl.style.opacity = '0';
    setTimeout(() => {
      quoteTextEl.textContent   = `"${q.text}"`;
      quoteAuthorEl.textContent = q.author;
      quoteTextEl.style.transition   = 'opacity 0.6s ease';
      quoteAuthorEl.style.transition = 'opacity 0.6s ease 0.15s';
      quoteTextEl.style.opacity   = '1';
      quoteAuthorEl.style.opacity = '1';
    }, 220);
  }

  // ── ENERGY CURSOR — custom red cursor only during splash ──────────────────
  const cursorDot  = document.getElementById('splash-cursor-dot');
  const cursorHalo = document.getElementById('splash-cursor-halo');

  let cursorRafId = null;
  let mouseX = -500, mouseY = -500;
  let haloX  = -500, haloY  = -500;

  function onSplashMouseMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }

  function animateCursor() {
    // Dot follows cursor instantly
    if (cursorDot) {
      cursorDot.style.transform = `translate(calc(${mouseX}px - 50%), calc(${mouseY}px - 50%))`;
    }
    // Halo lags slightly for dreamy energy feel
    haloX += (mouseX - haloX) * 0.12;
    haloY += (mouseY - haloY) * 0.12;
    if (cursorHalo) {
      cursorHalo.style.transform = `translate(calc(${haloX}px - 50%), calc(${haloY}px - 50%))`;
    }
    cursorRafId = requestAnimationFrame(animateCursor);
  }

  function startEnergyCursor() {
    if (cursorDot)  cursorDot.style.display  = 'block';
    if (cursorHalo) cursorHalo.style.display = 'block';
    splashOverlay.addEventListener('mousemove', onSplashMouseMove);
    cursorRafId = requestAnimationFrame(animateCursor);
  }

  function stopEnergyCursor() {
    splashOverlay.removeEventListener('mousemove', onSplashMouseMove);
    if (cursorRafId) { cancelAnimationFrame(cursorRafId); cursorRafId = null; }
    if (cursorDot)  cursorDot.style.display  = 'none';
    if (cursorHalo) cursorHalo.style.display = 'none';
  }

  function dismissSplash() {
    if (!splashOverlay) return;
    splashOverlay.classList.add('dismissed');
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
    stopEnergyCursor();
    setTimeout(() => {
      splashOverlay.style.display = 'none';
    }, 850);
  }

  function playSplashIntro() {
    if (!splashOverlay) return;
    splashOverlay.style.display = 'flex';
    splashOverlay.classList.remove('dismissed');

    // Restart SVG ECG pulse line animation
    const ecgPulseLine = document.querySelector('.splash-ecg-pulse-line');
    if (ecgPulseLine) {
      ecgPulseLine.style.animation = 'none';
      ecgPulseLine.offsetHeight; // trigger reflow
      ecgPulseLine.style.animation = 'splash-ecg-flow 2.8s cubic-bezier(0.4, 0, 0.2, 1) infinite';
    }

    // Pick & display a random quote each time the intro plays
    setSplashQuote();

    // Start the energy cursor effect
    startEnergyCursor();

    // No auto-dismiss — portal only opens on button click
    if (splashDismissTimer) clearTimeout(splashDismissTimer);
  }

  if (splashSkipBtn) {
    splashSkipBtn.addEventListener('click', dismissSplash);
  }

  // Click on top brand pill replays the cardiac rhythm intro animation
  if (brandPill) {
    brandPill.style.cursor = 'pointer';
    brandPill.title = 'Hacer clic para ver la animación del ritmo cardíaco R.E.D.';
    brandPill.addEventListener('click', playSplashIntro);
  }

  // ── GLÓBULOS ROJOS — TORRENTE DE PROYECTOS MODULE ───────────────────────────
  let currentProjectFilter = 'all';
  let currentProjectSearch = '';

  const INITIAL_PROJECTS = [];

  // Version key to force reset when data structure changes
  const PROJECTS_SCHEMA_VERSION = 'v2_2026';

  function getSavedProjects() {
    const savedVersion = localStorage.getItem('cntxt_projects_version');
    if (savedVersion !== PROJECTS_SCHEMA_VERSION) {
      // Schema changed — wipe old data and start fresh
      localStorage.removeItem('cntxt_projects');
      localStorage.setItem('cntxt_projects_version', PROJECTS_SCHEMA_VERSION);
      return [];
    }
    const saved = localStorage.getItem('cntxt_projects');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.warn('Error parsing projects:', e); }
    }
    return [];
  }

  function saveProjectsList(list) {
    localStorage.setItem('cntxt_projects', JSON.stringify(list));
    scheduleServerSync();
  }

  function formatCOP(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
  }

  // Master map of funnel stages with probability and description
  const FUNNEL_STAGES = {
    mql: { 
      name: "MQL | Plasma (10%)", 
      prob: 0.10, 
      desc: "Contacto cualificado por marketing. Interés inicial identificado (10%)." 
    },
    conversacion: { 
      name: "1ra Conversación (20%)", 
      prob: 0.20, 
      desc: "Diástole comercial. Escucha activa y diagnóstico preliminar de necesidades (20%)." 
    },
    sql: { 
      name: "SQL | Válvula (40%)", 
      prob: 0.40, 
      desc: "Contacto cualificado para ventas. Presupuesto y decisión validados (40%)." 
    },
    propuesta: { 
      name: "Propuesta Presentada (60%)", 
      prob: 0.60, 
      desc: "Oferta co-creada y entregada. Evaluación de valor en curso (60%)." 
    },
    negociacion: { 
      name: "En Negociación (80%)", 
      prob: 0.80, 
      desc: "Ajuste de términos y condiciones. Impulso previo al cierre (80%)." 
    },
    ejecucion: { 
      name: "Tejido Consolidado (100%)", 
      prob: 1.00, 
      desc: "Proyecto cerrado y activo. Integración total en el ecosistema (100%)." 
    },
    pausa: { 
      name: "Estasis / Pausa (0%)", 
      prob: 0.00, 
      desc: "Proyecto en estasis o pausa temporal (0%)." 
    }
  };
  window.FUNNEL_STAGES = FUNNEL_STAGES;

  // Master map of C.O.R. Operational Lines (Líneas Operativas)
  const LINEAS_OPERATIVAS = {
    cor_lo_01: "C.O.R. | LO. 0.1. Estructuración y Gerencia",
    cor_lo_02: "C.O.R. | L.O. 02. Diseño Arquitectónico",
    cor_lo_03: "C.O.R. | L.O. 03. Visualización Arquitectónica",
    cor_lo_04: "C.O.R. | L.O. 04. Tecnología y Ux",
    cor_lo_05: "C.O.R. | L.O. 05. Gestión Urbana",
    cor_lo_06: "C.O.R. | L.O. 06. Construcción de Proyectos",
    cor_lo_07: "C.O.R. | L.O. 07. Educación y Formación"
  };
  window.LINEAS_OPERATIVAS = LINEAS_OPERATIVAS;

  // Master map of C.O.R. Project Categories (Categorías de Proyecto)
  const CATEGORIAS_PROYECTO = {
    cor_cat_01: "C.O.R. | 01. Parcelaciones y Condominios",
    cor_cat_02: "C.O.R. | 02. Edificación en Altura",
    cor_cat_03: "C.O.R. | 03. Vivienda Campestre",
    cor_cat_04: "C.O.R. | 04. Comercial",
    cor_cat_08: "C.O.R. | 08. Hotelería y Hospitality"
  };
  window.CATEGORIAS_PROYECTO = CATEGORIAS_PROYECTO;

  const projectStatusMap = {
    mql:          { label: '🩸 MQL | Plasma (10%)', class: 'mql' },
    conversacion: { label: '💓 1ra Conversación (20%)', class: 'conversacion' },
    sql:          { label: '🔬 SQL | Válvula (40%)', class: 'sql' },
    propuesta:    { label: '⚡ Propuesta Presentada (60%)', class: 'propuesta' },
    negociacion:  { label: '🫀 En Negociación (80%)', class: 'negociacion' },
    ejecucion:    { label: '🧬 Tejido Consolidado (100%)', class: 'ejecucion' },
    pausa:        { label: '⏸️ Estasis / Pausa (0%)', class: 'pausa' },
    finalizado:   { label: '🏆 Tejido Finalizado', class: 'finalizado' }
  };

  const stageXPositions = {
    mql:          7,
    conversacion: 21,
    sql:          36,
    propuesta:    50,
    negociacion:  64,
    ejecucion:    79,
    pausa:        93,
    finalizado:   96
  };

  const STAGE_ZONE_BOUNDS = [
    { maxPct: 14.28, status: 'mql' },
    { maxPct: 28.57, status: 'conversacion' },
    { maxPct: 42.85, status: 'sql' },
    { maxPct: 57.14, status: 'propuesta' },
    { maxPct: 71.42, status: 'negociacion' },
    { maxPct: 85.71, status: 'ejecucion' },
    { maxPct: 100.0, status: 'pausa' }
  ];

  function detectStageFromX(pct) {
    for (let zone of STAGE_ZONE_BOUNDS) {
      if (pct <= zone.maxPct) return zone.status;
    }
    return 'pausa';
  }

  function updateFunnelStagesUI() {
    Object.keys(FUNNEL_STAGES).forEach(key => {
      const stage = FUNNEL_STAGES[key];
      // Update ECG header zone text & tooltip
      const ecgZone = document.querySelector(`.ecg-zone[data-stage="${key}"]`);
      if (ecgZone) {
        ecgZone.setAttribute('data-tooltip', stage.desc);
        const nameSpan = ecgZone.querySelector('span:not(.ecg-zone-amount)');
        if (nameSpan) nameSpan.textContent = stage.name;
      }

      // Update project pill button text & tooltip
      const pillBtn = document.querySelector(`.project-pill-btn[data-project-filter="${key}"]`);
      if (pillBtn) {
        pillBtn.setAttribute('data-tooltip', stage.desc);
        const nameSpan = pillBtn.querySelector('span:not(.pill-amount-badge)');
        if (nameSpan) nameSpan.textContent = stage.name;
      }
    });
  }

  function renderGlobulosPanel() {
    updateFunnelStagesUI();

    const projects = getSavedProjects();

    // 1. Calculate Financial Pipeline KPIs & Stage Totals (Weighted & Nominal)
    let totalValNominal = 0;
    let totalValWeighted = 0;
    let activeCount = 0;
    const stageTotalsWeighted = {
      all: 0,
      mql: 0,
      conversacion: 0,
      sql: 0,
      propuesta: 0,
      negociacion: 0,
      ejecucion: 0,
      pausa: 0
    };

    projects.forEach(p => {
      const amt = (p.amount || 0);
      const prob = (FUNNEL_STAGES[p.status] && FUNNEL_STAGES[p.status].prob !== undefined) 
                    ? FUNNEL_STAGES[p.status].prob 
                    : (p.status === 'ejecucion' || p.status === 'finalizado' ? 1.0 : 0);
      
      // Calculate weighted amount per project (EXECUTION_RULE #2)
      p.weightedAmount = amt * prob;

      const st = p.status || 'mql';
      if (stageTotalsWeighted[st] !== undefined) {
        stageTotalsWeighted[st] += p.weightedAmount;
      }
      stageTotalsWeighted.all += p.weightedAmount;

      if (p.status !== 'pausa' && p.status !== 'finalizado') {
        activeCount++;
        totalValNominal += amt;
        totalValWeighted += p.weightedAmount;
      }
    });

    const avgVal = projects.length ? Math.round(totalValNominal / projects.length) : 0;

    const metricTotalEl  = document.getElementById('metric-pipeline-total');
    const metricSubEl    = document.getElementById('metric-pipeline-sub');
    const metricCountEl  = document.getElementById('metric-pipeline-count');
    const metricAvgEl    = document.getElementById('metric-pipeline-avg');

    if (metricTotalEl)  metricTotalEl.textContent  = formatCOP(totalValWeighted);
    if (metricSubEl) {
      metricSubEl.innerHTML = `Ponderado: <strong>${formatCOP(totalValWeighted)}</strong> | Nominal: <strong>${formatCOP(totalValNominal)}</strong>`;
    }
    if (metricCountEl)  metricCountEl.textContent  = projects.length;
    if (metricAvgEl)    metricAvgEl.textContent    = formatCOP(avgVal);

    // Update financial amount badges per stage with weighted totals (EXECUTION_RULE #3)
    Object.keys(stageTotalsWeighted).forEach(st => {
      const pillEl = document.getElementById(`pill-amount-${st}`);
      if (pillEl) {
        pillEl.textContent = formatCOP(stageTotalsWeighted[st]);
      }
      const ecgEl = document.getElementById(`ecg-amount-${st}`);
      if (ecgEl) {
        ecgEl.textContent = formatCOP(stageTotalsWeighted[st]);
      }
    });

    // 2. Render Interactive Red Blood Cell Nodes on ECG Canvas
    const nodesLayer = document.getElementById('globulo-nodes-layer');
    if (nodesLayer) {
      nodesLayer.innerHTML = '';
      projects.forEach((proj, idx) => {
        const defaultX = stageXPositions[proj.status] !== undefined ? stageXPositions[proj.status] + ((idx % 3) * 2 - 2) : (15 + (idx * 18) % 75);
        const posX = proj.ecgX !== undefined ? proj.ecgX : defaultX;
        const posY = proj.ecgY !== undefined ? proj.ecgY : (32 + (idx * 19) % 42);

        const node = document.createElement('div');
        node.className = `globulo-node stage-${proj.status || 'mql'}`;
        node.style.left = `${posX}%`;
        node.style.top  = `${posY}%`;
        node.title = `${proj.title} — ${formatCOP(proj.amount)}`;

        node.innerHTML = `
          <div class="globulo-disc"></div>
          <div class="globulo-node-info">
            <span>${proj.title}</span>
            <span class="globulo-node-amount">${formatCOP(proj.amount)}</span>
          </div>
        `;

        // Interactive Drag & Drop Engine
        let isDragging = false;
        let startX, startY;

        const onPointerDown = (e) => {
          isDragging = false;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          startX = clientX;
          startY = clientY;

          const canvasEl = document.getElementById('globulos-ecg-canvas');
          if (!canvasEl) return;
          const rect = canvasEl.getBoundingClientRect();

          const onPointerMove = (moveEvent) => {
            const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const currentY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
            const dist = Math.hypot(currentX - startX, currentY - startY);

            if (dist > 4) {
              isDragging = true;
              node.classList.add('dragging');
              let relX = ((currentX - rect.left) / rect.width) * 100;
              let relY = ((currentY - rect.top) / rect.height) * 100;

              relX = Math.max(3, Math.min(97, relX));
              relY = Math.max(25, Math.min(88, relY));

              node.style.left = `${relX}%`;
              node.style.top  = `${relY}%`;
            }
          };

          const onPointerUp = (upEvent) => {
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);

            node.classList.remove('dragging');

            if (isDragging) {
              const upX = upEvent.changedTouches ? upEvent.changedTouches[0].clientX : upEvent.clientX;
              const upY = upEvent.changedTouches ? upEvent.changedTouches[0].clientY : upEvent.clientY;

              let finalX = ((upX - rect.left) / rect.width) * 100;
              let finalY = ((upY - rect.top) / rect.height) * 100;

              finalX = Math.max(3, Math.min(97, finalX));
              finalY = Math.max(25, Math.min(88, finalY));

              proj.ecgX = finalX;
              proj.ecgY = finalY;

              const newStatus = detectStageFromX(finalX);
              if (newStatus && proj.status !== newStatus) {
                proj.status = newStatus;
              }

              saveProjectsList(projects);
              renderGlobulosPanel();
            } else {
              // Toggle filter: if already filtered to this project, clear; otherwise filter
              const searchInput = document.getElementById('project-search-input');
              if (currentProjectSearch === proj.title) {
                currentProjectSearch = '';
                if (searchInput) searchInput.value = '';
              } else {
                currentProjectSearch = proj.title;
                if (searchInput) searchInput.value = proj.title;
              }
              renderGlobulosPanel();
            }
          };

          document.addEventListener('mousemove', onPointerMove);
          document.addEventListener('mouseup', onPointerUp);
          document.addEventListener('touchmove', onPointerMove, { passive: false });
          document.addEventListener('touchend', onPointerUp);
        };

        node.addEventListener('mousedown', onPointerDown);
        node.addEventListener('touchstart', onPointerDown, { passive: false });

        nodesLayer.appendChild(node);
      });
    }

    // 3. Render Projects Grid Cards
    const grid = document.getElementById('projects-grid');
    if (!grid) return;

    let filtered = projects.filter(p => {
      const matchStatus = (currentProjectFilter === 'all') || (p.status === currentProjectFilter);
      const q = currentProjectSearch.toLowerCase().trim();
      const matchQuery = !q || (p.title.toLowerCase().includes(q) || (p.client && p.client.toLowerCase().includes(q)));
      return matchStatus && matchQuery;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">🩸</div>
          <div style="font-size: 15px; font-weight: 700; color: #fff;">No se encontraron Glóbulos Rojos (Proyectos)</div>
          <div style="font-size: 12px; margin-top: 4px;">Ajusta los filtros o crea un nuevo proyecto en el torrente.</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const st = projectStatusMap[p.status] || projectStatusMap.ejecucion;
      const stageObj = FUNNEL_STAGES[p.status] || { prob: 1.0 };
      const probPct = Math.round((stageObj.prob !== undefined ? stageObj.prob : 1.0) * 100);
      const weightedVal = (p.amount || 0) * (stageObj.prob !== undefined ? stageObj.prob : 1.0);

      // Tiempo en etapa (días transcurridos)
      const enteredDate = p.stageEnteredAt ? new Date(p.stageEnteredAt) : (p.createdAt ? new Date(p.createdAt) : new Date());
      const daysInStage = Math.floor(Math.abs(new Date() - enteredDate) / (1000 * 60 * 60 * 24));
      const isStale = daysInStage > 7;

      // Due Date / Fecha Límite check
      let dueDateHtml = '';
      if (p.dueDate) {
        const due = new Date(p.dueDate + 'T23:59:59');
        const isOverdue = due < new Date();
        dueDateHtml = `<span style="font-size: 10px; font-weight: 800; color: ${isOverdue ? '#ff4d6d' : 'rgba(255,255,255,0.7)'}; font-family: monospace;">📅 Límite: ${p.dueDate}${isOverdue ? ' (Vencida)' : ''}</span>`;
      }

      // Owner initials
      const getInitials = (name) => {
        if (!name) return 'CN';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0].substring(0, 2).toUpperCase();
      };

      // Sincronización en tiempo real con el Directorio R.E.D.
      const liveRel = getRelationDetails(p.client);
      const displayRole = (liveRel && liveRel.oficio) ? liveRel.oficio : (p.contactRole || '');
      const displayRelType = (liveRel && liveRel.relationshipType) ? liveRel.relationshipType : (p.relationshipType || '');
      const relTagName = TAG_MAP[displayRelType] || displayRelType || '';
      const displayClientName = (liveRel && liveRel.name) ? liveRel.name : (p.client || 'Sin Relación Asignada');
      const lineaOperativaLabel = LINEAS_OPERATIVAS[p.lineaOperativa] || p.lineaOperativa || '';
      const categoriaLabel = CATEGORIAS_PROYECTO[p.categoria] || p.categoria || '';

      return `
        <div class="project-card" data-project-id="${p.id}">
          <div class="project-card-body">
            <!-- 1. Encabezado e Identificación Glassforming (Sincronizado con Directorio) -->
            <div class="project-card-header">
              <div class="project-card-badges">
                <span class="project-status-badge ${st.class}">${st.label}</span>
                ${relTagName ? `<span class="rel-tag project-tag-badge" data-tag="${displayRelType}">${escapeHtml(relTagName)}</span>` : ''}
              </div>

              <!-- Componentes C.O.R. (Línea Operativa y Categoría de Proyecto) visibles exteriormente -->
              <div class="project-linea-row">
                <span class="project-linea-badge ${lineaOperativaLabel ? 'has-linea' : 'no-linea'}" title="Línea Operativa (C.O.R.)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                  <span>${escapeHtml(lineaOperativaLabel || 'C.O.R. | Sin Línea Operativa')}</span>
                </span>
                ${categoriaLabel ? `
                  <span class="project-category-badge" title="Categoría de Proyecto (C.O.R.)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    <span>${escapeHtml(categoriaLabel)}</span>
                  </span>
                ` : ''}
              </div>

              <h3 class="project-title">${escapeHtml(p.title)}</h3>
              <div class="project-client-name">
                <span>👤 <strong>${escapeHtml(displayClientName)}</strong></span>
                ${displayRole ? `<span class="project-contact-role">• ${escapeHtml(displayRole)}</span>` : ''}
              </div>
            </div>

            <!-- 2. Valor y Criterio de Decisión (Contenedor Glassforming) -->
            <div class="project-financial-box">
              <div class="financial-row-main">
                <div>
                  <div class="project-financial-lbl">Monto Proyectado</div>
                  <div class="project-financial-val">${formatCOP(p.amount || 0)}</div>
                </div>
                <div class="financial-prob-box">
                  <div class="project-financial-lbl">Probabilidad</div>
                  <div class="project-prob-val">${probPct}%</div>
                </div>
              </div>
              <div class="financial-row-weighted">
                <span>Ponderado: <strong class="weighted-val-highlight">${formatCOP(weightedVal)}</strong></span>
              </div>
            </div>

            <!-- 3. Ejecución Comercial y Gestión del Tiempo (Contenedor Glassforming) -->
            <div class="project-next-step-box">
              <div class="next-step-header">
                <span>▶️ Próxima Acción</span>
                ${dueDateHtml}
              </div>
              <div class="next-step-content">
                ${escapeHtml(p.nextStep || 'Pendiente por definir')}
              </div>
            </div>

            <!-- 4. Documentos Clave: Brief & Proposal -->
            <div class="project-docs-row">
              ${p.briefUrl 
                ? `<a href="${escapeHtml(p.briefUrl)}" target="_blank" rel="noopener noreferrer" class="project-doc-pill has-link" title="Abrir Brief del Cliente (${escapeHtml(p.briefUrl)})" onclick="event.stopPropagation();">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                    <span>Brief</span>
                    <span class="external-icon">↗</span>
                   </a>`
                : `<span class="project-doc-pill no-link" title="Sin enlace de Brief">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>Brief</span>
                   </span>`
              }
              ${p.proposalUrl 
                ? `<a href="${escapeHtml(p.proposalUrl)}" target="_blank" rel="noopener noreferrer" class="project-doc-pill has-link" title="Abrir Propuesta Comercial (${escapeHtml(p.proposalUrl)})" onclick="event.stopPropagation();">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    <span>Proposal</span>
                    <span class="external-icon">↗</span>
                   </a>`
                : `<span class="project-doc-pill no-link" title="Sin enlace de Proposal">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    <span>Proposal</span>
                   </span>`
              }
            </div>
          </div>

          <!-- 4. Asignación y Atributos (Pie de Tarjeta) -->
          <div class="project-card-footer">
            <div class="project-owner-info">
              <div class="project-owner-avatar">
                ${getInitials(p.owner || 'CN')}
              </div>
              <div class="project-owner-meta">
                <span class="project-owner-name">${escapeHtml(p.owner || 'Sin Asignar')}</span>
                <span class="project-stage-time ${isStale ? 'is-stale' : ''}">
                  ⏱️ ${daysInStage} días en etapa ${isStale ? '⚠️' : ''}
                </span>
              </div>
            </div>
            <button class="project-action-btn btn-edit-proj" data-id="${p.id}">✏️ Editar Proyecto</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach edit button listeners
    grid.querySelectorAll('.btn-edit-proj').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const target = projects.find(p => p.id === id);
        if (target) openProjectModal(target);
      });
    });
  }

  // Project Filters & Search listeners
  const projectSearchInput = document.getElementById('project-search-input');
  if (projectSearchInput) {
    projectSearchInput.addEventListener('input', (e) => {
      currentProjectSearch = e.target.value;
      renderGlobulosPanel();
    });
  }

  const projectStatusPills = document.querySelectorAll('.project-status-pills .project-pill-btn');
  projectStatusPills.forEach(btn => {
    btn.addEventListener('click', () => {
      projectStatusPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentProjectFilter = btn.dataset.projectFilter;
      renderGlobulosPanel();
    });
  });

  // Export CSV Listener (Flujo de proyectos)
  function exportProjectsCSV() {
    const projects = getSavedProjects();
    if (!projects || projects.length === 0) {
      showAgentToast(
        '⚠️ Base de Datos Vacía',
        'No hay proyectos creados para exportar. Crea un proyecto en el torrente primero.',
        '⚠️'
      );
      return;
    }

    const headers = [
      'ID',
      'Título del Proyecto',
      'Persona / Empresa Relacionada',
      'Cargo / Oficio',
      'Tipo de Relación R.E.D.',
      'Monto Proyectado (COP)',
      'Estado de Etapa',
      'Probabilidad (%)',
      'Valor Ponderado (COP)',
      'Próxima Acción',
      'Línea Operativa (C.O.R.)',
      'Link del Brief (Encargo)',
      'Link de la Propuesta (Proposal)',
      'Fecha Límite (Due Date)',
      'Días en Etapa',
      'Responsable / Owner',
      'Fecha de Registro'
    ];

    const rows = projects.map(p => {
      const stageObj = FUNNEL_STAGES[p.status] || { name: p.status, prob: 1.0 };
      const probPct = Math.round((stageObj.prob !== undefined ? stageObj.prob : 1.0) * 100);
      const weightedVal = (p.amount || 0) * (stageObj.prob !== undefined ? stageObj.prob : 1.0);
      const enteredDate = p.stageEnteredAt ? new Date(p.stageEnteredAt) : (p.createdAt ? new Date(p.createdAt) : new Date());
      const daysInStage = Math.floor(Math.abs(new Date() - enteredDate) / (1000 * 60 * 60 * 24));
      const relTagName = TAG_MAP[p.relationshipType] || p.relationshipType || '';
      const lineaName = LINEAS_OPERATIVAS[p.lineaOperativa] || p.lineaOperativa || '';

      const escapeCSV = (str) => {
        if (str === null || str === undefined) return '""';
        const stringified = String(str).replace(/"/g, '""');
        return `"${stringified}"`;
      };

      return [
        escapeCSV(p.id),
        escapeCSV(p.title),
        escapeCSV(p.client),
        escapeCSV(p.contactRole),
        escapeCSV(relTagName),
        p.amount || 0,
        escapeCSV(stageObj.name || p.status),
        `${probPct}%`,
        weightedVal,
        escapeCSV(p.nextStep),
        escapeCSV(lineaName),
        escapeCSV(p.briefUrl || ''),
        escapeCSV(p.proposalUrl || ''),
        escapeCSV(p.dueDate || 'Sin fecha'),
        daysInStage,
        escapeCSV(p.owner || 'Sin Asignar'),
        escapeCSV(p.createdAt ? p.createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10))
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Flujo de proyectos.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showAgentToast(
      '📥 Base de Datos Descargada',
      `Se ha descargado la base de datos "Flujo de proyectos.csv" con ${projects.length} registros.`
    );
  }

  const btnExportCSV = document.getElementById('btn-export-projects-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', exportProjectsCSV);
  }

  // Project Modal Handling (Create / Edit)
  const projectModalOverlay = document.getElementById('project-modal-overlay');
  const projectModalClose   = document.getElementById('project-modal-close');
  const btnCancelProject    = document.getElementById('btn-cancel-project');
  const btnSaveProject      = document.getElementById('btn-save-project');
  const btnOpenProjectModal  = document.getElementById('btn-open-project-modal');

  /**
   * getRelationDetails
   * ─────────────────────────────────────────────────────────────────────────
   * Resolves a relation query (contact name, label, company name, or ID)
   * against the canonical Directorio R.E.D. (contactsData + masterEmpresas).
   *
   * @param {string|number} query
   * @returns {Object|null}
   */
  function getRelationDetails(query) {
    if (!query) return null;
    const str = String(query).trim().toLowerCase();

    // 1. Search in contactsData
    if (contactsData && contactsData.length > 0) {
      for (const c of contactsData) {
        const merged = getMergedContactData(c);
        const name = (merged.nome || '').trim().toLowerCase();
        const fullLabel = (merged.nome + (merged.empresa ? ` (${merged.empresa})` : '')).trim().toLowerCase();
        const contactId = String(merged.id);

        if (name === str || fullLabel === str || contactId === str || (name && str.includes(name))) {
          const tagObj = getContactTag(merged);
          return {
            type: 'contact',
            id: merged.id,
            name: merged.nome,
            company: merged.empresa || '',
            oficio: (merged.oficio || '').trim(),
            relationshipType: tagObj ? tagObj.key : 'cliente_gold',
            relationshipTypeName: tagObj ? tagObj.name : 'Cliente Gold',
            raw: merged
          };
        }
      }
    }

    // 2. Search in masterEmpresas
    if (masterEmpresas && masterEmpresas.length > 0) {
      for (const e of masterEmpresas) {
        const name = (e.nome || '').trim().toLowerCase();
        const empId = String(e.id);

        if (name === str || empId === str || (name && str.includes(name))) {
          const relKey = e.relationshipType || 'aliados';
          return {
            type: 'empresa',
            id: e.id,
            name: e.nome,
            company: e.nome,
            oficio: (e.sector || 'Organización / Empresa').trim(),
            relationshipType: relKey,
            relationshipTypeName: TAG_MAP[relKey] || 'Aliados Estratégicos',
            raw: e
          };
        }
      }
    }

    return null;
  }

  /**
   * syncProjectModalWithDirectory
   * ─────────────────────────────────────────────────────────────────────────
   * Synchronizes Cargo/Oficio and Tipo de Relación fields in the Project Modal
   * directly from the selected contact/company in Directorio R.E.D.
   */
  function syncProjectModalWithDirectory(forcedRelValue = null) {
    const selectRelacion = document.getElementById('project-select-relacion');
    const inputContactRole = document.getElementById('project-input-contact-role');
    const inputRelType = document.getElementById('project-input-relationship-type');
    const roleSyncBadge = document.getElementById('project-role-sync-badge');
    const typeSyncBadge = document.getElementById('project-type-sync-badge');

    const relVal = forcedRelValue !== null ? forcedRelValue : (selectRelacion ? selectRelacion.value : '');
    if (!relVal) {
      if (roleSyncBadge) roleSyncBadge.style.display = 'none';
      if (typeSyncBadge) typeSyncBadge.style.display = 'none';
      return;
    }

    const details = getRelationDetails(relVal);
    if (details) {
      if (inputContactRole) {
        inputContactRole.value = details.oficio || (details.type === 'empresa' ? details.company : '');
      }
      if (inputRelType && details.relationshipType) {
        inputRelType.value = details.relationshipType;
      }
      if (roleSyncBadge) roleSyncBadge.style.display = 'inline-block';
      if (typeSyncBadge) typeSyncBadge.style.display = 'inline-block';
    } else {
      if (roleSyncBadge) roleSyncBadge.style.display = 'none';
      if (typeSyncBadge) typeSyncBadge.style.display = 'none';
    }
  }

  /**
   * populateRelacionDropdown
   * ─────────────────────────────────────────────────────────────────────────
   * Fuente de verdad canónica: contactsData (Directorio R.E.D.) + masterEmpresas.
   * REGLA ESTRICTA: NO se crean opciones de creación inline. El selector es
   * de selección exclusiva sobre la base de datos cargada.
   *
   * @param {string} selectedValue  - Nome o label del ítem a pre-seleccionar (edición).
   * @returns {number}              - Total de opciones de relación disponibles.
   */
  function populateRelacionDropdown(selectedValue = '') {
    const selectRelacion = document.getElementById('project-select-relacion');
    if (!selectRelacion) return 0;

    selectRelacion.innerHTML = '';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '— Seleccionar Relación del Directorio R.E.D. —';
    defaultOpt.disabled = true;
    if (!selectedValue) defaultOpt.selected = true;
    selectRelacion.appendChild(defaultOpt);

    // Fuente 1: contactsData
    const contactOptions = (contactsData || []).map(c => {
      const merged = typeof getMergedContactData === 'function' ? getMergedContactData(c) : c;
      return {
        id: `contact_${c.id}`,
        label: `${merged.nome}${merged.empresa ? ` (${merged.empresa})` : ''}`,
        value: merged.nome,
        type: 'contact'
      };
    });

    // Fuente 2: masterEmpresas
    const empresaOptions = (masterEmpresas || []).map(e => ({
      id: `empresa_${e.id}`,
      label: `🏢 ${e.nome}${e.sector ? ' — ' + e.sector : ''}`,
      value: e.nome,
      type: 'empresa'
    }));

    const allOptions = [...contactOptions, ...empresaOptions];

    if (allOptions.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'Sin relaciones creadas. Registre una en el Directorio R.E.D. primero.';
      emptyOpt.disabled = true;
      selectRelacion.appendChild(emptyOpt);
      return 0;
    }

    if (contactOptions.length > 0) {
      const grpContacts = document.createElement('optgroup');
      grpContacts.label = '👤 Contactos del Directorio R.E.D.';
      contactOptions.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (selectedValue && (opt.value === selectedValue || opt.label === selectedValue)) {
          el.selected = true;
        }
        grpContacts.appendChild(el);
      });
      selectRelacion.appendChild(grpContacts);
    }

    if (empresaOptions.length > 0) {
      const grpEmpresas = document.createElement('optgroup');
      grpEmpresas.label = '🏢 Empresas del Directorio R.E.D.';
      empresaOptions.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (selectedValue && (opt.value === selectedValue || opt.label === selectedValue)) {
          el.selected = true;
        }
        grpEmpresas.appendChild(el);
      });
      selectRelacion.appendChild(grpEmpresas);
    }

    return allOptions.length;
  }

  function openProjectModal(project = null) {
    if (!projectModalOverlay) return;

    const relationCount = project
      ? populateRelacionDropdown(project.client)
      : populateRelacionDropdown();

    if (!project && relationCount === 0) {
      showAgentToast(
        '⚠️ Sin Relaciones Registradas',
        'Para crear un Proyecto debes tener al menos una Relación en el Directorio R.E.D. Registra un Contacto o Empresa primero.',
        '⚠️'
      );
    }

    const titleEl = document.getElementById('project-modal-title');
    const editIdEl = document.getElementById('project-edit-id');
    const inputTitle = document.getElementById('project-input-title');
    const selectRelacion = document.getElementById('project-select-relacion');
    const inputContactRole = document.getElementById('project-input-contact-role');
    const inputRelType = document.getElementById('project-input-relationship-type');
    const inputAmount = document.getElementById('project-input-amount');
    const inputStatus = document.getElementById('project-input-status');
    const inputNextStep = document.getElementById('project-input-next-step');
    const inputDueDate = document.getElementById('project-input-due-date');
    const inputOwner = document.getElementById('project-input-owner');

    const inputBriefUrl = document.getElementById('project-input-brief-url');
    const inputProposalUrl = document.getElementById('project-input-proposal-url');
    const inputLineaOperativa = document.getElementById('project-input-linea-operativa');
    const inputCategoria = document.getElementById('project-input-categoria');

    if (project) {
      if (titleEl) titleEl.textContent = '🩸 Editar Proyecto';
      if (editIdEl) editIdEl.value = project.id;
      if (inputTitle) inputTitle.value = project.title || '';
      if (selectRelacion) selectRelacion.value = project.client || '';
      if (inputAmount) inputAmount.value = project.amount || 0;
      if (inputStatus) inputStatus.value = project.status || 'ejecucion';
      if (inputLineaOperativa) inputLineaOperativa.value = project.lineaOperativa || '';
      if (inputCategoria) inputCategoria.value = project.categoria || '';
      if (inputNextStep) inputNextStep.value = project.nextStep || '';
      if (inputBriefUrl) inputBriefUrl.value = project.briefUrl || '';
      if (inputProposalUrl) inputProposalUrl.value = project.proposalUrl || '';
      if (inputDueDate) inputDueDate.value = project.dueDate || '';
      if (inputOwner) inputOwner.value = project.owner || '';

      const details = getRelationDetails(project.client);
      if (details) {
        if (inputContactRole) inputContactRole.value = details.oficio || project.contactRole || '';
        if (inputRelType) inputRelType.value = details.relationshipType || project.relationshipType || '';
        if (document.getElementById('project-role-sync-badge')) document.getElementById('project-role-sync-badge').style.display = 'inline-block';
        if (document.getElementById('project-type-sync-badge')) document.getElementById('project-type-sync-badge').style.display = 'inline-block';
      } else {
        if (inputContactRole) inputContactRole.value = project.contactRole || '';
        if (inputRelType) inputRelType.value = project.relationshipType || '';
        if (document.getElementById('project-role-sync-badge')) document.getElementById('project-role-sync-badge').style.display = 'none';
        if (document.getElementById('project-type-sync-badge')) document.getElementById('project-type-sync-badge').style.display = 'none';
      }
    } else {
      if (titleEl) titleEl.textContent = '🩸 Registrar Nuevo Proyecto';
      if (editIdEl) editIdEl.value = '';
      if (inputTitle) inputTitle.value = '';
      if (selectRelacion) selectRelacion.value = '';
      if (inputContactRole) inputContactRole.value = '';
      if (inputRelType) inputRelType.value = '';
      if (inputAmount) inputAmount.value = '';
      if (inputStatus) inputStatus.value = 'ejecucion';
      if (inputLineaOperativa) inputLineaOperativa.value = '';
      if (inputCategoria) inputCategoria.value = '';
      if (inputNextStep) inputNextStep.value = '';
      if (inputBriefUrl) inputBriefUrl.value = '';
      if (inputProposalUrl) inputProposalUrl.value = '';
      if (inputDueDate) inputDueDate.value = '';
      if (inputOwner) inputOwner.value = '';
      if (document.getElementById('project-role-sync-badge')) document.getElementById('project-role-sync-badge').style.display = 'none';
      if (document.getElementById('project-type-sync-badge')) document.getElementById('project-type-sync-badge').style.display = 'none';

      if (selectRelacion && selectRelacion.value) {
        syncProjectModalWithDirectory();
      }
    }

    projectModalOverlay.style.display = 'flex';
    projectModalOverlay.classList.add('active');
  }

  function closeProjectModal() {
    if (projectModalOverlay) {
      projectModalOverlay.style.display = 'none';
      projectModalOverlay.classList.remove('active');
    }
  }

  const btnCrearProyectoHero = document.getElementById('btn-crear-proyecto-hero');
  if (btnCrearProyectoHero) btnCrearProyectoHero.addEventListener('click', (e) => { e.preventDefault(); openProjectModal(null); });
  if (btnOpenProjectModal) btnOpenProjectModal.addEventListener('click', (e) => { e.preventDefault(); openProjectModal(null); });
  if (projectModalClose)  projectModalClose.addEventListener('click', (e) => { e.preventDefault(); closeProjectModal(); });
  if (btnCancelProject)   btnCancelProject.addEventListener('click', (e) => { e.preventDefault(); closeProjectModal(); });

  if (projectModalOverlay) {
    projectModalOverlay.addEventListener('click', (e) => {
      if (e.target === projectModalOverlay) closeProjectModal();
    });
  }

  const projectSelectRelacionEl = document.getElementById('project-select-relacion');
  if (projectSelectRelacionEl) {
    projectSelectRelacionEl.addEventListener('change', () => {
      syncProjectModalWithDirectory();
    });
  }

  function populateProjectRelationships(selectedValue = '') {
    return populateRelacionDropdown(selectedValue);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-open-project-modal, #btn-crear-proyecto-hero, .btn-crear-proyecto-hero, .btn-add-project');
    if (btn) {
      e.preventDefault();
      openProjectModal(null);
    }
  });

  window.openProjectModal = openProjectModal;
  window.closeProjectModal = closeProjectModal;
  window.populateProjectRelationships = populateProjectRelationships;
  window.exportProjectsCSV = exportProjectsCSV;

  if (btnSaveProject) {
    btnSaveProject.addEventListener('click', () => {
      const editId = document.getElementById('project-edit-id').value;
      const title = document.getElementById('project-input-title').value.trim();
      const selectRelacion = document.getElementById('project-select-relacion');
      const client = selectRelacion ? selectRelacion.value.trim() : '';
      const contactRole = (document.getElementById('project-input-contact-role')?.value || '').trim();
      const relationshipType = document.getElementById('project-input-relationship-type')?.value || '';
      const amount = parseFloat(document.getElementById('project-input-amount').value) || 0;
      const status = document.getElementById('project-input-status').value;
      const lineaOperativa = document.getElementById('project-input-linea-operativa')?.value || '';
      const categoria = document.getElementById('project-input-categoria')?.value || '';
      const nextStep = (document.getElementById('project-input-next-step')?.value || '').trim();
      const briefUrl = (document.getElementById('project-input-brief-url')?.value || '').trim();
      const proposalUrl = (document.getElementById('project-input-proposal-url')?.value || '').trim();
      const dueDate = document.getElementById('project-input-due-date')?.value || '';
      const owner = (document.getElementById('project-input-owner')?.value || '').trim();

      if (!title) {
        showAgentToast(
          '🩸 Campo Requerido',
          'El campo Nombre del Proyecto es obligatorio para registrar el proyecto.',
          '🩸'
        );
        return;
      }

      if (!client) {
        showAgentToast(
          '⚠️ Relación Requerida',
          'Debes seleccionar una Relación del Directorio R.E.D. para aprobar el registro. Si no hay relaciones disponibles, créalas primero en el Directorio.',
          '⚠️'
        );
        return;
      }

      if (!nextStep) {
        showAgentToast(
          '🩸 Siguiente Paso Requerido',
          'Especifica el Siguiente Paso o Próxima Acción antes de guardar el proyecto.',
          '🩸'
        );
        return;
      }

      const projects = getSavedProjects();

      const nowIso = new Date().toISOString();

      if (editId) {
        const idx = projects.findIndex(p => p.id === editId);
        if (idx !== -1) {
          const oldStatus = projects[idx].status;
          const stageEnteredAt = oldStatus !== status ? nowIso : (projects[idx].stageEnteredAt || nowIso);
          projects[idx] = {
            ...projects[idx],
            title,
            client,
            contactRole,
            relationshipType,
            amount,
            status,
            lineaOperativa,
            categoria,
            nextStep,
            briefUrl,
            proposalUrl,
            dueDate,
            owner,
            stageEnteredAt,
            updatedAt: nowIso
          };
        }
        showAgentToast('🩸 Proyecto Actualizado', `El proyecto "${title}" fue actualizado en la base de datos.`);
      } else {
        // Create new project
        const newProj = {
          id: `proj_${Date.now()}`,
          title,
          client,
          contactRole,
          relationshipType,
          amount,
          status,
          lineaOperativa,
          categoria,
          nextStep,
          briefUrl,
          proposalUrl,
          dueDate,
          owner,
          stageEnteredAt: nowIso,
          createdAt: nowIso,
          ecgX: 10 + (projects.length * 16) % 80,
          ecgY: 20 + (projects.length * 24) % 60
        };
        projects.unshift(newProj);
        showAgentToast('🩸 Nuevo Proyecto Registrado', `El proyecto "${title}" (${formatCOP(amount)}) fue vinculado exitosamente a ${client}.`);
      }

      saveProjectsList(projects);
      closeProjectModal();
      renderGlobulosPanel();
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SLACK INTEGRATION MODULE ("NOTIFICAR EN R.E.D.")
  // ═══════════════════════════════════════════════════════════════════
  const SLACK_WEBHOOK_KEY = 'cntxt_slack_webhook_url';
  const SLACK_CHANNEL_KEY = 'cntxt_slack_channel_name';

  function getSlackWebhookUrl() {
    const saved = (localStorage.getItem(SLACK_WEBHOOK_KEY) || '').trim();
    if (saved) return saved;
    return (window.CNTXT_CONFIG?.SLACK?.DEFAULT_WEBHOOK_URL || '').trim();
  }

  function getSlackChannelName() {
    const saved = (localStorage.getItem(SLACK_CHANNEL_KEY) || '').trim();
    if (saved) return saved;
    return (window.CNTXT_CONFIG?.SLACK?.DEFAULT_CHANNEL_NAME || '#notificaciones-red').trim();
  }

  function updateSlackHeaderIndicator() {
    const indicator = document.getElementById('header-slack-indicator');
    const isConfigured = !!getSlackWebhookUrl();
    if (indicator) {
      indicator.classList.toggle('connected', isConfigured);
      indicator.title = isConfigured 
        ? `Slack conectado: ${getSlackChannelName() || 'Canal configurado'}`
        : 'Slack no configurado (Haz clic para conectar)';
    }
  }

  const slackModalOverlay = document.getElementById('slack-config-modal-overlay');
  const slackModalClose   = document.getElementById('slack-config-modal-close');
  const btnCancelSlack    = document.getElementById('btn-cancel-slack-config');
  const btnSaveSlack      = document.getElementById('btn-save-slack-config');
  const btnTestSlack      = document.getElementById('btn-test-slack-config');
  const btnHeaderSlack    = document.getElementById('btn-slack-settings');
  const inputSlackUrl     = document.getElementById('slack-input-webhook-url');
  const inputSlackChannel = document.getElementById('slack-input-channel-name');
  const slackBanner       = document.getElementById('slack-status-banner');
  const slackBannerIcon   = document.getElementById('slack-banner-icon');
  const slackBannerText   = document.getElementById('slack-banner-text');

  function openSlackConfigModal(highlightPrompt = false) {
    if (!slackModalOverlay) return;
    const currentUrl = getSlackWebhookUrl();
    const currentChan = getSlackChannelName();
    if (inputSlackUrl) inputSlackUrl.value = currentUrl;
    if (inputSlackChannel) inputSlackChannel.value = currentChan;

    if (slackBanner && slackBannerText && slackBannerIcon) {
      if (currentUrl) {
        slackBanner.className = 'slack-status-banner is-valid';
        slackBannerIcon.textContent = '✅';
        slackBannerText.innerHTML = `Webhook activo y listo para emitir al canal <strong>${currentChan || 'predeterminado'}</strong>.`;
      } else if (highlightPrompt) {
        slackBanner.className = 'slack-status-banner is-error';
        slackBannerIcon.textContent = '⚠️';
        slackBannerText.innerHTML = '<strong>Configuración requerida:</strong> Ingresa la URL del Webhook de Slack antes de emitir notificaciones.';
      } else {
        slackBanner.className = 'slack-status-banner';
        slackBannerIcon.textContent = '⚡';
        slackBannerText.innerHTML = 'Ingresa tu URL de Webhook y presiona <strong>Probar Conexión</strong> para validar el envío a Slack.';
      }
    }

    slackModalOverlay.style.display = 'flex';
    slackModalOverlay.classList.add('active');
  }

  function closeSlackConfigModal() {
    if (slackModalOverlay) {
      slackModalOverlay.style.display = 'none';
      slackModalOverlay.classList.remove('active');
    }
  }

  if (btnHeaderSlack) {
    btnHeaderSlack.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSlackConfigModal();
    });
  }
  if (slackModalClose) {
    slackModalClose.addEventListener('click', (e) => {
      e.preventDefault();
      closeSlackConfigModal();
    });
  }
  if (btnCancelSlack) {
    btnCancelSlack.addEventListener('click', (e) => {
      e.preventDefault();
      closeSlackConfigModal();
    });
  }
  if (slackModalOverlay) {
    slackModalOverlay.addEventListener('click', (e) => {
      if (e.target === slackModalOverlay) closeSlackConfigModal();
    });
  }

  if (btnSaveSlack) {
    btnSaveSlack.addEventListener('click', () => {
      const url = inputSlackUrl ? inputSlackUrl.value.trim() : '';
      const chan = inputSlackChannel ? inputSlackChannel.value.trim() : '';

      if (url && !url.startsWith('https://hooks.slack.com/')) {
        if (!confirm('La URL ingresada no parece ser un Webhook oficial de Slack (debe iniciar con https://hooks.slack.com/). ¿Deseas guardarla de todos modos?')) {
          return;
        }
      }

      if (url) {
        localStorage.setItem(SLACK_WEBHOOK_KEY, url);
        if (chan) localStorage.setItem(SLACK_CHANNEL_KEY, chan);
        else localStorage.removeItem(SLACK_CHANNEL_KEY);
        showAgentToast('🩸 Slack Configurado', 'URL del Webhook de Slack guardada exitosamente.', '⚡');
      } else {
        localStorage.removeItem(SLACK_WEBHOOK_KEY);
        localStorage.removeItem(SLACK_CHANNEL_KEY);
        showAgentToast('Slack Desconectado', 'Se ha eliminado la configuración de Slack.', 'ℹ️');
      }

      scheduleServerSync(true);
      updateSlackHeaderIndicator();
      closeSlackConfigModal();
    });
  }

  async function postToSlackWebhook(payload) {
    const webhookUrl = getSlackWebhookUrl();
    if (!webhookUrl) {
      openSlackConfigModal(true);
      return { success: false, reason: 'no_webhook' };
    }

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: JSON.stringify(payload),
        mode: 'no-cors'
      });
      return { success: true };
    } catch (err) {
      console.error('Error enviando a Slack:', err);
      return { success: false, error: err };
    }
  }

  if (btnTestSlack) {
    btnTestSlack.addEventListener('click', async () => {
      const testUrl = inputSlackUrl ? inputSlackUrl.value.trim() : '';
      if (!testUrl) {
        alert('Por favor ingresa primero la URL del Webhook de Slack.');
        return;
      }

      btnTestSlack.disabled = true;
      btnTestSlack.innerHTML = '<span>⏳ Probando...</span>';

      const testPayload = {
        text: "🩸 *[Prueba de Conexión] Portal R.E.D. CNTXT®*",
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🩸 Conexión Exitosa con Portal R.E.D.",
              emoji: true
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "¡El sistema de notificaciones del portal *CNTXT® R.E.D.* está sincronizado correctamente con este canal! Cada vez que presiones *Notificar en R.E.D.*, recibirás la ficha del contacto o proyecto en tiempo real."
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `🕒 *Verificado el:* ${new Date().toLocaleString('es-CO')} · CNTXT® System 2026`
              }
            ]
          }
        ]
      };

      try {
        await fetch(testUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: JSON.stringify(testPayload),
          mode: 'no-cors'
        });

        if (slackBanner && slackBannerText && slackBannerIcon) {
          slackBanner.className = 'slack-status-banner is-valid';
          slackBannerIcon.textContent = '✅';
          slackBannerText.innerHTML = '<strong>¡Mensaje de prueba enviado con éxito!</strong> Revisa tu canal en Slack.';
        }
        showAgentToast('✅ Prueba Enviada', 'Revisa tu canal de Slack para confirmar el mensaje de bienvenida.', '🚀');
      } catch (e) {
        if (slackBanner && slackBannerText && slackBannerIcon) {
          slackBanner.className = 'slack-status-banner is-error';
          slackBannerIcon.textContent = '❌';
          slackBannerText.innerHTML = '<strong>Error de envío:</strong> No se pudo conectar con la URL proporcionada.';
        }
        showAgentToast('❌ Error de Envío', 'Verifica que la URL del Webhook sea válida y esté activa.', '⚠️');
      } finally {
        btnTestSlack.disabled = false;
        btnTestSlack.innerHTML = '<span>🔔 Probar Conexión</span>';
      }
    });
  }

  function buildContactSlackPayload(client) {
    const tag = getContactTag(client);
    const channel = getContactChannel(client);
    const phase = getContactPhase(client);
    const pulse = getContactPulse(client);
    const persona = getContactPersona(client);
    const savedNotes = (localStorage.getItem(`cntxt_notes_${client.id}`) || '').trim();

    const phaseNames = {
      R: 'Relación (Diástole · Escucha Sandler)',
      D: 'Diseño (Oxigenación · Neuromarketing Klaric)',
      E: 'Expansión (Sístole · Reciprocidad Cialdini)'
    };
    const phaseLabel = phase ? (phaseNames[phase] || `Fase ${phase}`) : 'Sin Fase Asignada';
    const personaLabel = persona === 'b2c' ? 'B2C (Persona Natural)' : persona === 'b2b' ? 'B2B (Persona Jurídica)' : 'Sin Asignar';
    const phoneDisplay = client.numero ? `+${client.numero}` : 'No registrado';
    const waLink = client.numero ? `https://wa.me/${client.numero}` : null;

    const fields = [
      {
        type: "mrkdwn",
        text: `*👤 Contacto:*\n${client.nome}`
      },
      {
        type: "mrkdwn",
        text: `*🏢 Empresa:*\n${client.empresa || 'Cliente Directo'}`
      },
      {
        type: "mrkdwn",
        text: `*🏷️ Lazo R.E.D.:*\n\`${tag.name}\``
      },
      {
        type: "mrkdwn",
        text: `*🫀 Pulso Vital:*\n*P${pulse.level}* — ${pulse.name}`
      },
      {
        type: "mrkdwn",
        text: `*🩸 Canal de Entrada:*\n${channel ? channel.name : 'Sin canal'}`
      },
      {
        type: "mrkdwn",
        text: `*🧬 Tipo de Persona:*\n${personaLabel}`
      },
      {
        type: "mrkdwn",
        text: `*📍 Ciudad:*\n${client.ciudad || 'No especificada'}`
      },
      {
        type: "mrkdwn",
        text: `*🫀 Fase R.E.D.:*\n${phaseLabel}`
      },
      {
        type: "mrkdwn",
        text: `*📱 WhatsApp / Tel:*\n${waLink ? `<${waLink}|${phoneDisplay}>` : phoneDisplay}`
      },
      {
        type: "mrkdwn",
        text: `*✉️ Email:*\n${client.email ? `<mailto:${client.email}|${client.email}>` : 'No registrado'}`
      }
    ];

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🩸 ALERTA R.E.D. | Notificación de Contacto`,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `El equipo ha emitido una alerta de seguimiento para *${client.nome}* (${client.empresa || 'Cliente Directo'}):`
        }
      },
      {
        type: "section",
        fields: fields
      }
    ];

    if (savedNotes) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📝 Bitácora & Notas de Relacionamiento:*\n>${savedNotes.split('\n').join('\n>')}`
        }
      });
    }

    if (waLink) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "💬 Iniciar WhatsApp",
              emoji: true
            },
            url: waLink,
            style: "primary"
          }
        ]
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📡 *Emisor:* Portal R.E.D. CNTXT® · ${new Date().toLocaleString('es-CO')}`
        }
      ]
    });

    return {
      text: `🩸 [Alerta R.E.D.] ${client.nome} (${client.empresa || 'Cliente Directo'})`,
      blocks: blocks
    };
  }

  function buildProjectSlackPayload(project) {
    const stageObj = FUNNEL_STAGES[project.status] || { name: project.status, prob: 1.0 };
    const probPct = Math.round((stageObj.prob !== undefined ? stageObj.prob : 1.0) * 100);
    const weightedVal = (project.amount || 0) * (stageObj.prob !== undefined ? stageObj.prob : 1.0);
    const relTagName = TAG_MAP[project.relationshipType] || project.relationshipType || 'Sin clasificar';
    const lineaName = LINEAS_OPERATIVAS[project.lineaOperativa] || project.lineaOperativa || 'Sin línea asignada';
    const categoriaName = CATEGORIAS_PROYECTO[project.categoria] || project.categoria || 'Sin categoría';

    const fields = [
      {
        type: "mrkdwn",
        text: `*🩸 Proyecto (Glóbulo Rojo):*\n*${project.title}*`
      },
      {
        type: "mrkdwn",
        text: `*👤 Relación Vinculada:*\n${project.client || 'Sin relación'}`
      },
      {
        type: "mrkdwn",
        text: `*💰 Monto Proyectado:*\n${formatCOP(project.amount || 0)}`
      },
      {
        type: "mrkdwn",
        text: `*📊 Valor Ponderado (${probPct}%):*\n${formatCOP(weightedVal)}`
      },
      {
        type: "mrkdwn",
        text: `*🫀 Estado de Flujo:*\n\`${stageObj.name || project.status}\``
      },
      {
        type: "mrkdwn",
        text: `*🏷️ Tipo de Relación:*\n${relTagName}`
      },
      {
        type: "mrkdwn",
        text: `*🏛️ Línea Operativa (C.O.R.):*\n${lineaName}`
      },
      {
        type: "mrkdwn",
        text: `*🏗️ Tipología (C.O.R.):*\n${categoriaName}`
      },
      {
        type: "mrkdwn",
        text: `*👤 Responsable / Owner:*\n${project.owner || 'Sin asignar'}`
      },
      {
        type: "mrkdwn",
        text: `*📅 Fecha Límite:*\n${project.dueDate || 'Sin fecha'}`
      }
    ];

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🩸 ALERTA R.E.D. | Glóbulo Rojo (Proyecto)`,
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Se ha emitido una notificación para el proyecto *"${project.title}"*:`
        }
      },
      {
        type: "section",
        fields: fields
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*▶️ Próxima Acción / Siguiente Paso:*\n>${project.nextStep || 'Pendiente por definir'}`
        }
      }
    ];

    const actionElements = [];
    if (project.briefUrl) {
      actionElements.push({
        type: "button",
        text: { type: "plain_text", text: "📄 Ver Brief", emoji: true },
        url: project.briefUrl
      });
    }
    if (project.proposalUrl) {
      actionElements.push({
        type: "button",
        text: { type: "plain_text", text: "💼 Ver Propuesta", emoji: true },
        url: project.proposalUrl,
        style: "primary"
      });
    }
    if (actionElements.length > 0) {
      blocks.push({
        type: "actions",
        elements: actionElements
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📡 *Emisor:* Torrente de Glóbulos Rojos · Portal R.E.D. CNTXT® · ${new Date().toLocaleString('es-CO')}`
        }
      ]
    });

    return {
      text: `🩸 [Glóbulo Rojo] ${project.title} (${formatCOP(project.amount || 0)})`,
      blocks: blocks
    };
  }

  // Hook Contact Detail Modal "Notificar en R.E.D." Button
  const btnModalNotifyRed = document.getElementById('modal-notify-red-btn');
  if (btnModalNotifyRed) {
    btnModalNotifyRed.addEventListener('click', async () => {
      if (!selectedContact) return;
      btnModalNotifyRed.classList.add('sending');
      const textSpan = btnModalNotifyRed.querySelector('.btn-notify-text');
      if (textSpan) textSpan.textContent = 'Notificando...';

      const payload = buildContactSlackPayload(selectedContact);
      const res = await postToSlackWebhook(payload);

      btnModalNotifyRed.classList.remove('sending');
      if (textSpan) textSpan.textContent = 'Notificar en R.E.D.';

      if (res.success) {
        showAgentToast(
          '🚀 Notificación Enviada a Slack',
          `Se ha emitido la ficha de ${selectedContact.nome} al canal del equipo con éxito.`,
          '🩸'
        );
      } else if (res.reason !== 'no_webhook') {
        showAgentToast('❌ Error de Envío', 'No se pudo enviar la alerta a Slack. Verifica la conexión.', '⚠️');
      }
    });
  }

  // Hook Project Modal "Notificar en R.E.D." Button
  const btnProjectNotifyRed = document.getElementById('project-notify-red-btn');
  if (btnProjectNotifyRed) {
    btnProjectNotifyRed.addEventListener('click', async () => {
      const titleEl = document.getElementById('project-input-title');
      const title = titleEl ? titleEl.value.trim() : '';
      if (!title) {
        showAgentToast('⚠️ Proyecto Requerido', 'Ingresa el nombre del proyecto antes de notificar.', '⚠️');
        return;
      }

      const projectData = {
        title,
        client: document.getElementById('project-select-relacion')?.value || '',
        amount: parseFloat(document.getElementById('project-input-amount')?.value) || 0,
        status: document.getElementById('project-input-status')?.value || 'ejecucion',
        lineaOperativa: document.getElementById('project-input-linea-operativa')?.value || '',
        categoria: document.getElementById('project-input-categoria')?.value || '',
        nextStep: document.getElementById('project-input-next-step')?.value || '',
        briefUrl: document.getElementById('project-input-brief-url')?.value || '',
        proposalUrl: document.getElementById('project-input-proposal-url')?.value || '',
        dueDate: document.getElementById('project-input-due-date')?.value || '',
        owner: document.getElementById('project-input-owner')?.value || '',
        relationshipType: document.getElementById('project-input-relationship-type')?.value || ''
      };

      btnProjectNotifyRed.classList.add('sending');
      const textSpan = btnProjectNotifyRed.querySelector('.btn-notify-text');
      if (textSpan) textSpan.textContent = 'Notificando...';

      const payload = buildProjectSlackPayload(projectData);
      const res = await postToSlackWebhook(payload);

      btnProjectNotifyRed.classList.remove('sending');
      if (textSpan) textSpan.textContent = 'Notificar en R.E.D.';

      if (res.success) {
        showAgentToast(
          '🚀 Proyecto Notificado en Slack',
          `Se ha emitido el proyecto "${title}" (${formatCOP(projectData.amount)}) al equipo.`,
          '🩸'
        );
      } else if (res.reason !== 'no_webhook') {
        showAgentToast('❌ Error de Envío', 'No se pudo enviar la alerta a Slack.', '⚠️');
      }
    });
  }

  // Update Slack Header Indicator on load
  updateSlackHeaderIndicator();

  // Auto-play splash intro on app load
  playSplashIntro();

  // Initialize
  loadContactsData();
});


