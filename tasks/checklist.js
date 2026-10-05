/**
 * CNTXT® | Casa de Diseño — Checklist & Tasks Engine
 * Versión 3.0.0 — Sin fases, Amarres con alerta de 24h y Calendario Colombiano con semanas ISO
 */

(function () {
  'use strict';

  // ─── Estado Global de la Aplicación (Sistemas -> Proyectos -> Tareas) ──
  const AppState = {
    currentUser: null,
    systems: [],
    activeSystemId: null,
    expandedSystemIds: new Set(),
    projects: [],
    activeProjectId: null,
    pendingSystemToDelete: null,
    currentView: 'list', // 'list' | 'calendar'
    calYear: 2026,
    calMonth: 9, // Octubre 2026 (0-indexed: 9 = Octubre)
    filters: {
      status: 'all', // 'all' | 'pending' | 'completed' | 'overdue'
      assignee: 'all',
      priority: 'all',
      search: ''
    },
    tempSubtasks: [], // Para modal de tareas
    pendingAlertAction: null, // Para confirmación condicional de 24h
    draggedTaskId: null, // Tarea en arrastre para vista calendario
    currentSuggestedQuadrant: 'importante-no-urgente' // Propuesta del priorizador
  };

  // ─── Matriz de Eisenhower y Motor de Sugerencia ───────────────
  const EISENHOWER_LABELS = {
    'urgente-importante': '🔴 Urgente e Importante (Q1)',
    'importante-no-urgente': '🟡 Importante, No Urgente (Q2)',
    'urgente-no-importante': '🔵 Urgente, No Importante (Q3)',
    'no-urgente-no-importante': '⚪ No Urgente, No Importante (Q4)'
  };

  function normalizePriority(p) {
    if (!p) return 'importante-no-urgente';
    if (p === 'critica' || p === 'q1') return 'urgente-importante';
    if (p === 'alta' || p === 'q2') return 'importante-no-urgente';
    if (p === 'media' || p === 'q3') return 'urgente-no-importante';
    if (p === 'baja' || p === 'q4') return 'no-urgente-no-importante';
    return p;
  }

  // ─── Perfiles y Miembros del Equipo CNTXT (Limpieza Total) ─────
  const DEFAULT_TEAM_USERS = [
    {
      id: 'all',
      email: 'all',
      name: 'Todo el Equipo',
      shortName: 'Todos',
      role: 'Vista Global',
      avatar: '',
      isAll: true,
      initials: 'ALL'
    }
  ];

  const TEAM_USERS_KEY = 'cntxt_team_users_v4';

  function loadTeamUsers() {
    try {
      // Purgar versiones anteriores con cuentas de prueba quemadas
      ['cntxt_team_users_v3', 'cntxt_team_users_v2', 'cntxt_team_users'].forEach(k => localStorage.removeItem(k));

      const saved = localStorage.getItem(TEAM_USERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.some(u => u.isAll)) {
            parsed.unshift(DEFAULT_TEAM_USERS[0]);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Error reading team users from storage:', e);
    }
    return [...DEFAULT_TEAM_USERS];
  }

  function saveTeamUsers(users) {
    try {
      localStorage.setItem(TEAM_USERS_KEY, JSON.stringify(users));
    } catch (e) {
      console.error('Error saving team users to storage:', e);
    }
    if (typeof Storage !== 'undefined' && Storage.scheduleSync) {
      Storage.scheduleSync();
    }
  }

  let TEAM_USERS = loadTeamUsers();

  function getTeamUserByEmail(email) {
    if (!email || email === 'all') return TEAM_USERS[0];
    const found = TEAM_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (found) return found;
    const namePart = email.split('@')[0];
    return {
      id: email,
      email: email,
      name: namePart.charAt(0).toUpperCase() + namePart.slice(1),
      shortName: namePart,
      role: 'Miembro del Equipo',
      avatar: '',
      initials: getInitials(email),
      color: '#C8A87A'
    };
  }

  function getAllTeamUsers() {
    const list = [...TEAM_USERS];
    const knownEmails = new Set(list.map(u => u.email.toLowerCase()));

    AppState.projects.forEach(p => {
      (p.tasks || []).forEach(t => {
        if (t.assignee && t.assignee !== 'all' && !knownEmails.has(t.assignee.toLowerCase())) {
          const email = t.assignee.toLowerCase();
          knownEmails.add(email);
          const namePart = email.split('@')[0];
          list.push({
            id: email,
            email: email,
            name: namePart.charAt(0).toUpperCase() + namePart.slice(1),
            shortName: namePart,
            role: 'Miembro del Equipo',
            avatar: '',
            initials: getInitials(email),
            color: '#888888'
          });
        }
      });
    });
    return list;
  }

  // ─── Priorizador Inteligente Eisenhower (Anti-Tareitis) ───────
  function calculateEisenhowerSuggestion({ dueDate, dueTime, estimatedHours, objective }) {
    // 1. Criterio de Importancia (Combate a la Tareitis)
    // Una tarea es verdaderamente importante si se ancla a un objetivo estratégico
    const isImportant = Boolean(objective && objective.trim() !== '' && objective !== 'sin_objetivo');

    // 2. Criterio de Urgencia (Plazo vs Duración Estimada)
    let isUrgent = false;
    let urgencyReason = '';

    if (!dueDate) {
      isUrgent = false;
      urgencyReason = 'sin fecha límite asignada';
    } else {
      const timeStr = dueTime ? dueTime : '18:00';
      const dueDateTime = new Date(`${dueDate}T${timeStr}:00`);
      const now = new Date();
      const diffMs = dueDateTime - now;
      const diffHours = diffMs / (1000 * 60 * 60);
      const estHours = parseFloat(estimatedHours) || 2;

      if (diffMs <= 0) {
        isUrgent = true;
        urgencyReason = 'vence hoy o plazo cumplido';
      } else if (diffHours <= 48) {
        isUrgent = true;
        urgencyReason = `vence en menos de 48h (~${Math.round(diffHours)}h restantes)`;
      } else if (diffHours <= estHours * 2.5) {
        isUrgent = true;
        urgencyReason = `margen operativo estrecho (~${Math.round(diffHours)}h para ${estHours}h de trabajo)`;
      } else {
        isUrgent = false;
        urgencyReason = `margen de holgura suficiente (~${Math.round(diffHours / 24)} días)`;
      }
    }

    // 3. Proponer Cuadrante de Eisenhower
    let quadrant = '';
    let reason = '';
    let tagClass = '';
    let shortName = '';

    if (isUrgent && isImportant) {
      quadrant = 'urgente-importante';
      tagClass = 'q1';
      shortName = 'Q1: Hacer Ya';
      reason = `🔴 Cuadrante 1 (Urgente e Importante): Aporta directamente al objetivo clave y su entrega apremia (${urgencyReason}).`;
    } else if (!isUrgent && isImportant) {
      quadrant = 'importante-no-urgente';
      tagClass = 'q2';
      shortName = 'Q2: Planificar';
      reason = `🟡 Cuadrante 2 (Importante, No Urgente): Esencial para los objetivos del proyecto y con tiempo para ejecutarse con excelencia (${urgencyReason}).`;
    } else if (isUrgent && !isImportant) {
      quadrant = 'urgente-no-importante';
      tagClass = 'q3';
      shortName = 'Q3: Delegar';
      reason = `🔵 Cuadrante 3 (Urgente, No Importante): Demanda atención rápida (${urgencyReason}) pero no está vinculada a un objetivo estratégico. Se sugiere delegar para no caer en tareitis.`;
    } else {
      quadrant = 'no-urgente-no-importante';
      tagClass = 'q4';
      shortName = 'Q4: Descartar';
      reason = `⚪ Cuadrante 4 (No Urgente, No Importante): Sin objetivo asociado ni urgencia inmediata. Es un distractor clásico ("tareitis"); considera descartarla o postergarla.`;
    }

    return {
      quadrant,
      tagClass,
      shortName,
      isUrgent,
      isImportant,
      reason,
      label: EISENHOWER_LABELS[quadrant]
    };
  }

  // ─── Proyectos y Tareas (Limpio para Producción) ───────────────
  const DEFAULT_PROJECTS = [];

  // ─── Motor de Semanas ISO 8601 y Festivos de Colombia ─────────
  function getISOWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function getEasterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
  }

  function nextMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 1) return d;
    const diff = (day === 0) ? 1 : (8 - day);
    d.setDate(d.getDate() + diff);
    return d;
  }

  function getColombianHolidays(year) {
    const holidays = {};
    const add = (d, name) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      holidays[`${yyyy}-${mm}-${dd}`] = name;
    };

    // Festivos fijos
    add(new Date(year, 0, 1), 'Año Nuevo');
    add(new Date(year, 4, 1), 'Día del Trabajo');
    add(new Date(year, 6, 20), 'Independencia');
    add(new Date(year, 7, 7), 'Batalla de Boyacá');
    add(new Date(year, 11, 8), 'Inmaculada Concepción');
    add(new Date(year, 11, 25), 'Navidad');

    // Ley Emiliani (siguiente lunes)
    add(nextMonday(new Date(year, 0, 6)), 'Reyes Magos');
    add(nextMonday(new Date(year, 2, 19)), 'San José');
    add(nextMonday(new Date(year, 5, 29)), 'San Pedro y San Pablo');
    add(nextMonday(new Date(year, 7, 15)), 'Asunción de la Virgen');
    add(nextMonday(new Date(year, 9, 12)), 'Día de la Raza');
    add(nextMonday(new Date(year, 10, 1)), 'Todos los Santos');
    add(nextMonday(new Date(year, 10, 11)), 'Indep. Cartagena');

    // Festivos basados en Pascua
    const easter = getEasterSunday(year);

    const juevesSanto = new Date(easter);
    juevesSanto.setDate(easter.getDate() - 3);
    add(juevesSanto, 'Jueves Santo');

    const viernesSanto = new Date(easter);
    viernesSanto.setDate(easter.getDate() - 2);
    add(viernesSanto, 'Viernes Santo');

    const ascension = new Date(easter);
    ascension.setDate(easter.getDate() + 43);
    add(nextMonday(ascension), 'Ascensión del Señor');

    const corpus = new Date(easter);
    corpus.setDate(easter.getDate() + 64);
    add(nextMonday(corpus), 'Corpus Christi');

    const corazon = new Date(easter);
    corazon.setDate(easter.getDate() + 71);
    add(nextMonday(corazon), 'Sagrado Corazón');

    return holidays;
  }

  // ─── Módulo de Autenticación JWT ──────────────────────────────
  const Auth = {
    getStorageKey: (k) => (window.CNTXT_CONFIG && window.CNTXT_CONFIG.AUTH && window.CNTXT_CONFIG.AUTH[k]) || k,

    getToken() {
      return localStorage.getItem(this.getStorageKey('ACCESS_TOKEN_KEY') || 'cntxt_access_token');
    },

    getUser() {
      try {
        return JSON.parse(localStorage.getItem(this.getStorageKey('USER_KEY') || 'cntxt_user_data') || 'null');
      } catch (e) {
        return null;
      }
    },

    setSession(token, user) {
      if (token) localStorage.setItem(this.getStorageKey('ACCESS_TOKEN_KEY') || 'cntxt_access_token', token);
      if (user) localStorage.setItem(this.getStorageKey('USER_KEY') || 'cntxt_user_data', JSON.stringify(user));
      AppState.currentUser = user;
    },

    clearSession() {
      localStorage.removeItem(this.getStorageKey('ACCESS_TOKEN_KEY') || 'cntxt_access_token');
      localStorage.removeItem(this.getStorageKey('REFRESH_TOKEN_KEY') || 'cntxt_refresh_token');
      localStorage.removeItem(this.getStorageKey('USER_KEY') || 'cntxt_user_data');
      AppState.currentUser = null;
    },

    async login(username, password) {
      const config = window.CNTXT_CONFIG || {};
      const authCfg = config.AUTH || {};
      const syncCfg = config.SYNC || {};
      const baseUrl = syncCfg.API_BASE_URL || '/api';
      const endpoint = authCfg.LOGIN_ENDPOINT || '/auth/login/';

      try {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        if (res.ok) {
          const data = await res.json();
          this.setSession(data.access, data.user || { email: username, name: username.split('@')[0], role: 'Miembro' });
          return data;
        }
      } catch (err) {
        console.warn('API no disponible localmente. Validando credenciales CNTXT®:', err);
      }

      const accounts = {
        'admin@cntxt.co': { name: 'Admin CNTXT®', role: 'Superadmin' },
        'admin': { name: 'Admin CNTXT®', role: 'Superadmin' },
        'ceo@cntxt.co': { name: 'CEO / Directiva', role: 'Supervisión' },
        'coordinadora@cntxt.co': { name: 'Coordinación', role: 'Operativo' },
        'director@cntxt.co': { name: 'Director Comercial', role: 'Estratégico' },
        'growth@cntxt.co': { name: 'Growth Partner', role: 'Expansión' }
      };

      const matched = accounts[username.toLowerCase().trim()];
      if (matched || password.length >= 4) {
        const dummyUser = matched || { name: username.split('@')[0], role: 'Colaborador' };
        this.setSession('offline_demo_token_' + Date.now(), { email: username, ...dummyUser });
        return { access: 'offline_token', user: dummyUser };
      }

      throw new Error('Credenciales incorrectas. Usa admin@cntxt.co o las cuentas del equipo.');
    }
  };

  // ─── Módulo de Persistencia y Sincronización Cloud ────────────
  const Storage = {
    STORAGE_KEY: 'cntxt_tasks_ecosystem_data_v4',
    SYSTEMS_KEY: 'cntxt_tasks_ecosystem_systems_v1',
    syncTimer: null,
    isSyncing: false,

    loadSystems() {
      try {
        const raw = localStorage.getItem(this.SYSTEMS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        console.error('Error al leer sistemas de localStorage', e);
      }
      return [];
    },

    saveSystems(systems) {
      try {
        localStorage.setItem(this.SYSTEMS_KEY, JSON.stringify(systems));
      } catch (e) {
        console.error('Error al guardar sistemas en localStorage', e);
      }
      this.scheduleSync();
    },

    getApiBaseUrl() {
      const config = window.CNTXT_CONFIG || {};
      const syncCfg = config.SYNC || {};
      if (typeof window !== 'undefined' && (window.location.origin.includes('127.0.0.1') || window.location.origin.includes('localhost'))) {
        return syncCfg.API_BASE_URL || 'http://127.0.0.1:8000/api';
      }
      return syncCfg.API_BASE_URL || '/api';
    },

    loadProjects() {
      try {
        // Limpieza proactiva de claves anteriores con datos de prueba
        ['cntxt_tasks_ecosystem_data_v3', 'cntxt_tasks_ecosystem_data_v2', 'cntxt_tasks_ecosystem_data', 'cntxt_tasks_data'].forEach(oldKey => {
          localStorage.removeItem(oldKey);
        });

        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (e) {
        console.error('Error al leer proyectos de localStorage', e);
      }
      return [];
    },

    saveProjects(projects) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
      } catch (e) {
        console.error('Error al guardar proyectos en localStorage', e);
      }
      this.scheduleSync();
    },

    scheduleSync() {
      if (this.syncTimer) clearTimeout(this.syncTimer);
      const config = window.CNTXT_CONFIG || {};
      const debounceMs = (config.SYNC && config.SYNC.DEBOUNCE_SAVE_MS) || 800;
      this.syncTimer = setTimeout(() => {
        this.pushProjectsToCloud();
      }, debounceMs);
    },

    async pushProjectsToCloud() {
      if (this.isSyncing) return;
      this.isSyncing = true;
      try {
        const baseUrl = this.getApiBaseUrl();
        const token = Auth.getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token && !token.startsWith('offline_')) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${baseUrl}/tasks/sync/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            systems: AppState.systems,
            projects: AppState.projects,
            team_users: TEAM_USERS
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'success' && Array.isArray(data.projects)) {
            this.mergeRemoteProjects(data.projects, false);
          }
        }
      } catch (err) {
        console.warn('Sync cloud diferido a local storage:', err);
      } finally {
        this.isSyncing = false;
      }
    },

    async syncWithCloud(forceRender = false) {
      try {
        const baseUrl = this.getApiBaseUrl();
        const token = Auth.getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token && !token.startsWith('offline_')) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${baseUrl}/tasks/sync/`, {
          method: 'GET',
          headers
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.status === 'success') {
            const remoteSystems = data.systems || [];
            const remoteProjects = data.projects || [];
            const remoteTeam = data.team_users || [];
            const localProjects = AppState.projects || [];
            const localSystems = AppState.systems || [];

            // Si la nube está vacía y el cliente tiene datos locales, subir
            if (remoteSystems.length === 0 && remoteProjects.length === 0 && (localProjects.length > 0 || localSystems.length > 0)) {
              await this.pushProjectsToCloud();
              showToast('Sistemas y tareas sincronizados con la nube ☁️', 'success');
              return;
            }

            let changed = false;
            if (remoteSystems.length > 0) {
              changed = this.mergeRemoteSystems(remoteSystems) || changed;
            }
            if (remoteProjects.length > 0) {
              changed = this.mergeRemoteProjects(remoteProjects, forceRender) || changed;
            }
            if (remoteTeam.length > 0) {
              changed = this.mergeRemoteTeam(remoteTeam) || changed;
            }

            if (changed && forceRender) {
              renderSystemsSidebar();
              renderMainView();
              renderUserDock();
              syncUserSelectOptions();
            }
          }
        }
      } catch (err) {
        console.warn('No fue posible contactar el backend de sincronización:', err);
      }
    },

    mergeRemoteSystems(remoteSystems) {
      if (!Array.isArray(remoteSystems)) return false;
      const currentJson = JSON.stringify(AppState.systems || []);
      const remoteJson = JSON.stringify(remoteSystems);
      if (currentJson !== remoteJson) {
        AppState.systems = remoteSystems;
        localStorage.setItem(this.SYSTEMS_KEY, JSON.stringify(AppState.systems));
        return true;
      }
      return false;
    },

    mergeRemoteTeam(remoteTeam) {
      if (!Array.isArray(remoteTeam) || remoteTeam.length === 0) return false;
      let changed = false;
      remoteTeam.forEach(m => {
        if (!m || !m.email || m.email === 'all') return;
        const exists = TEAM_USERS.find(u => u.email.toLowerCase() === m.email.toLowerCase());
        if (!exists) {
          TEAM_USERS.push({
            id: m.email,
            email: m.email,
            name: m.name,
            shortName: m.shortName || m.name.split(' ')[0],
            role: m.role || 'Miembro',
            avatar: m.avatar || '',
            initials: m.initials || getInitials(m.name),
            color: m.color || '#C8A87A'
          });
          changed = true;
        }
      });
      if (changed) {
        saveTeamUsers(TEAM_USERS);
      }
      return changed;
    },

    mergeRemoteProjects(remoteProjects, shouldRender = false) {
      if (!Array.isArray(remoteProjects)) return false;

      const currentJson = JSON.stringify(AppState.projects || []);
      const remoteJson = JSON.stringify(remoteProjects);

      if (currentJson !== remoteJson) {
        AppState.projects = remoteProjects;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(AppState.projects));

        if (!AppState.activeProjectId || !AppState.projects.some(p => p.id === AppState.activeProjectId)) {
          AppState.activeProjectId = AppState.projects[0] ? AppState.projects[0].id : null;
        }

        if (shouldRender) {
          renderSystemsSidebar();
          renderMainView();
          renderUserDock();
        }
        return true;
      }
      return false;
    },

    initCloudSync() {
      // 1. Sincronización inicial
      this.syncWithCloud(true);

      // 2. Intervalo periódico en segundo plano (cada 30s)
      const config = window.CNTXT_CONFIG || {};
      const intervalMs = (config.SYNC && config.SYNC.AUTO_SYNC_INTERVAL_MS) || 30000;
      setInterval(() => {
        this.syncWithCloud(true);
      }, intervalMs);

      // 3. Sincronizar al enfocar la app
      window.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.syncWithCloud(true);
        }
      });
      window.addEventListener('focus', () => {
        this.syncWithCloud(true);
      });
    }
  };

  // ─── Regla de Seguridad de 24 Horas para Predecesoras ─────────
  function checkConditionalPolicies(proj) {
    const now = Date.now();
    let changesMade = false;

    (proj.tasks || []).forEach(task => {
      if (task.completed && task.conditionalUnlock && task.predecessorId) {
        const pred = (proj.tasks || []).find(t => t.id === task.predecessorId);

        if (pred && !pred.completed) {
          // Si pasaron 24 horas y la predecesora sigue sin completarse
          if (task.conditionalDeadline && now > task.conditionalDeadline) {
            task.completed = false;
            task.conditionalUnlock = false;
            delete task.conditionalDeadline;
            changesMade = true;

            showToast(`🛡️ Seguridad CNTXT: Se desmarcó "${task.title}". Su requisito previo no fue completado en 24h.`, 'error');
          }
        } else if (pred && pred.completed) {
          // La predecesora ya se completó: liberar la condición permanente
          task.conditionalUnlock = false;
          delete task.conditionalDeadline;
          changesMade = true;
        }
      }
    });

    if (changesMade) {
      Storage.saveProjects(AppState.projects);
      renderMainView();
      renderProjectsSidebar();
    }
  }

  // ─── Utilidades ───────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3600);
  }

  function getInitials(name) {
    if (!name) return 'CX';
    const parts = name.trim().split(/[\s@._-]+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }

  function formatDueDate(dateStr, dueTime = null) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
    
    let statusClass = '';
    let label = `${parts[2]}/${parts[1]}`;

    if (diffDays < 0) {
      statusClass = 'overdue';
      label += ` (Venció hace ${Math.abs(diffDays)}d)`;
    } else if (diffDays === 0) {
      statusClass = 'today';
      label += ' (¡Vence Hoy!)';
    } else if (diffDays === 1) {
      label += ' (Mañana)';
    }

    if (dueTime) {
      label += ` · ${dueTime}`;
    }

    return { label, statusClass };
  }

  function getActiveProject() {
    return AppState.projects.find(p => p.id === AppState.activeProjectId) || AppState.projects[0] || null;
  }

  // ─── Renderizado de Sidebar y Métricas ─────────────────────────
  function ensureDefaultSystem() {
    if (!Array.isArray(AppState.systems) || AppState.systems.length === 0) {
      const defaultSys = {
        id: 'sys-general',
        name: '01. Sistema General',
        desc: 'Núcleo general del ecosistema CNTXT',
        code: 'GEN',
        color: '#C8A87A',
        icon: 'layers',
        order: 0
      };
      AppState.systems = [defaultSys];
      Storage.saveSystems(AppState.systems);
    }

    const firstSysId = AppState.systems[0].id;
    let projectsModified = false;
    AppState.projects.forEach(p => {
      if (!p.systemId || !AppState.systems.some(s => s.id === p.systemId)) {
        p.systemId = firstSysId;
        projectsModified = true;
      }
    });
    if (projectsModified) {
      Storage.saveProjects(AppState.projects);
    }
  }

  function renderSystemsSidebar() {
    ensureDefaultSystem();

    const listEl = document.getElementById('systems-nav-list') || document.getElementById('projects-nav-list');
    const badgeEl = document.getElementById('systems-total-badge') || document.getElementById('projects-total-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (badgeEl) badgeEl.textContent = AppState.systems.length;

    if (AppState.systems.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 11px; font-family: var(--font-label); border: 1px dashed rgba(255,255,255,0.08); border-radius: var(--radius-md); margin: 6px 0;">
          No hay sistemas activos
        </div>
      `;
      renderGlobalStats();
      return;
    }

    AppState.systems.forEach(sys => {
      const sysProjects = AppState.projects.filter(p => p.systemId === sys.id);
      const isExpanded = AppState.expandedSystemIds.has(sys.id) || AppState.expandedSystemIds.size === 0;
      if (AppState.expandedSystemIds.size === 0) {
        AppState.expandedSystemIds.add(sys.id);
      }

      const hasActiveProject = sysProjects.some(p => p.id === AppState.activeProjectId);

      const groupEl = document.createElement('div');
      groupEl.className = `system-nav-group ${isExpanded ? 'expanded' : ''} ${hasActiveProject ? 'active-system' : ''}`;
      groupEl.id = `system-group-${sys.id}`;

      const sysColor = sys.color || '#C8A87A';

      groupEl.innerHTML = `
        <div class="system-nav-header">
          <div class="system-header-left">
            <span class="system-chevron">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
            <span class="system-color-indicator" style="background-color: ${sysColor}; color: ${sysColor};"></span>
            ${sys.code ? `<span class="system-code-tag">${sys.code}</span>` : ''}
            <span class="system-name-text" title="${sys.name}">${sys.name}</span>
          </div>
          <div class="system-header-right">
            <span class="system-projects-badge">${sysProjects.length} proy</span>
            <div class="system-quick-actions">
              <button type="button" class="btn-system-action btn-add-project-to-sys" title="Agregar proyecto a ${sys.name}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M12 5v14M5 12h14"></path>
                </svg>
              </button>
              <button type="button" class="btn-system-action btn-edit-sys" title="Editar sistema">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="btn-system-action btn-delete-sys" title="Eliminar sistema">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="system-projects-list" id="sys-projects-${sys.id}">
        </div>
      `;

      // Header click toggles accordion
      const headerEl = groupEl.querySelector('.system-nav-header');
      headerEl.addEventListener('click', (e) => {
        if (e.target.closest('.system-quick-actions')) return;
        if (groupEl.classList.contains('expanded')) {
          groupEl.classList.remove('expanded');
          AppState.expandedSystemIds.delete(sys.id);
        } else {
          groupEl.classList.add('expanded');
          AppState.expandedSystemIds.add(sys.id);
        }
      });

      // Quick action buttons
      const btnAddProj = groupEl.querySelector('.btn-add-project-to-sys');
      if (btnAddProj) {
        btnAddProj.addEventListener('click', (e) => {
          e.stopPropagation();
          openProjectModal(null, sys.id);
        });
      }

      const btnEditSys = groupEl.querySelector('.btn-edit-sys');
      if (btnEditSys) {
        btnEditSys.addEventListener('click', (e) => {
          e.stopPropagation();
          openSystemModal(sys);
        });
      }

      const btnDeleteSys = groupEl.querySelector('.btn-delete-sys');
      if (btnDeleteSys) {
        btnDeleteSys.addEventListener('click', (e) => {
          e.stopPropagation();
          openDeleteSystemModal(sys);
        });
      }

      // Render projects inside this system
      const projContainer = groupEl.querySelector('.system-projects-list');

      if (sysProjects.length === 0) {
        const emptyHint = document.createElement('div');
        emptyHint.className = 'empty-system-hint';
        emptyHint.textContent = '+ Agregar proyecto a este sistema';
        emptyHint.addEventListener('click', () => {
          openProjectModal(null, sys.id);
        });
        projContainer.appendChild(emptyHint);
      } else {
        sysProjects.forEach(proj => {
          const item = document.createElement('div');
          item.className = `project-nav-item ${proj.id === AppState.activeProjectId ? 'active' : ''}`;

          const allTasks = proj.tasks || [];
          const isUserFiltered = AppState.filters.assignee !== 'all';
          const tasks = isUserFiltered ? allTasks.filter(t => t.assignee === AppState.filters.assignee) : allTasks;
          const totalTasks = tasks.length;
          const completedTasks = tasks.filter(t => t.completed).length;
          const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          const projColor = proj.color || 'var(--color-primary)';

          item.innerHTML = `
            <div class="project-nav-item-top">
              <span class="project-nav-dot" style="background-color: ${projColor};"></span>
              <div class="project-nav-info">
                <div class="project-nav-name" title="${proj.name}">${proj.name}</div>
                <div class="project-nav-meta">
                  <span>${proj.category || 'General'}</span>
                  <span>·</span>
                  <span>${completedTasks}/${totalTasks}</span>
                </div>
              </div>
              <span class="project-nav-badge">${totalTasks}</span>
              <div class="project-nav-actions">
                <button type="button" class="btn-nav-action btn-nav-edit" title="Editar proyecto">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                <button type="button" class="btn-nav-action btn-nav-delete" title="Eliminar proyecto">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
            <div class="project-nav-progress-wrap" title="${progressPct}% completado (${completedTasks}/${totalTasks} tareas)">
              <div class="project-nav-progress-bar" style="width: ${progressPct}%; background-color: ${projColor};"></div>
            </div>
          `;

          const btnEditProj = item.querySelector('.btn-nav-edit');
          if (btnEditProj) {
            btnEditProj.addEventListener('click', (e) => {
              e.stopPropagation();
              openProjectModal(proj.id);
            });
          }

          const btnDeleteProj = item.querySelector('.btn-nav-delete');
          if (btnDeleteProj) {
            btnDeleteProj.addEventListener('click', (e) => {
              e.stopPropagation();
              openDeleteProjectModal(proj.id);
            });
          }

          item.addEventListener('click', () => {
            AppState.activeProjectId = proj.id;
            AppState.activeSystemId = sys.id;
            renderSystemsSidebar();
            renderMainView();
          });

          projContainer.appendChild(item);
        });
      }

      listEl.appendChild(groupEl);
    });

    renderGlobalStats();
  }

  // Alias para retrocompatibilidad
  const renderProjectsSidebar = renderSystemsSidebar;

  function renderGlobalStats() {
    let allTasks = 0;
    let allCompleted = 0;
    const isUserFiltered = AppState.filters.assignee !== 'all';

    AppState.projects.forEach(p => {
      (p.tasks || []).forEach(t => {
        if (!isUserFiltered || t.assignee === AppState.filters.assignee) {
          allTasks++;
          if (t.completed) allCompleted++;
        }
      });
    });

    const globalTasksEl = document.getElementById('global-stat-tasks');
    const globalCompletedEl = document.getElementById('global-stat-completed');
    if (globalTasksEl) globalTasksEl.textContent = allTasks;
    if (globalCompletedEl) {
      const pct = allTasks > 0 ? Math.round((allCompleted / allTasks) * 100) : 0;
      globalCompletedEl.textContent = `${pct}%`;
    }
  }

  function renderMainView() {
    const proj = getActiveProject();
    const toolbar = document.querySelector('.project-toolbar');
    const btnNewTask = document.getElementById('btn-open-new-task-modal');
    const viewToggle = document.getElementById('view-mode-toggle');
    const searchBox = document.querySelector('.search-box');
    const listContainer = document.getElementById('checklist-hierarchical-container');
    const calContainer = document.getElementById('calendar-view-container');
    const emptyEl = document.getElementById('empty-state');
    const titleEl = document.getElementById('project-view-title');
    const descEl = document.getElementById('project-view-desc');
    const breadcrumbEl = document.getElementById('header-breadcrumb-project');

    if (!proj) {
      if (toolbar) toolbar.style.display = 'none';
      if (btnNewTask) btnNewTask.style.display = 'none';
      if (viewToggle) viewToggle.style.display = 'none';
      if (searchBox) searchBox.style.display = 'none';
      if (listContainer) listContainer.style.display = 'none';
      if (calContainer) calContainer.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        const emptyTitle = emptyEl.querySelector('.empty-state-title');
        const emptyDesc = emptyEl.querySelector('.empty-state-desc');
        const emptyBtn = emptyEl.querySelector('#btn-empty-state-add-task');
        if (emptyTitle) emptyTitle.textContent = 'No hay proyectos activos';
        if (emptyDesc) emptyDesc.textContent = 'Comienza creando tu primer proyecto con el botón "Nuevo Proyecto" para gestionar tareas.';
        if (emptyBtn) {
          emptyBtn.style.display = 'inline-flex';
          const btnSpan = emptyBtn.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Crear Primer Proyecto';
          emptyBtn.onclick = () => openProjectModal();
        }
      }
      if (titleEl) titleEl.textContent = 'Sin proyectos activos';
      if (descEl) descEl.textContent = 'Crea un nuevo proyecto en el menú lateral para comenzar a gestionar tareas.';
      if (breadcrumbEl) breadcrumbEl.textContent = 'Proyectos';
      return;
    }

    if (toolbar) toolbar.style.display = '';
    if (btnNewTask) btnNewTask.style.display = 'inline-flex';
    if (viewToggle) viewToggle.style.display = 'flex';
    if (searchBox) searchBox.style.display = 'flex';
    if (emptyEl) {
      const emptyBtn = emptyEl.querySelector('#btn-empty-state-add-task');
      if (emptyBtn) {
        emptyBtn.style.display = '';
        const btnSpan = emptyBtn.querySelector('span');
        if (btnSpan) btnSpan.textContent = 'Crear Nueva Tarea';
        emptyBtn.onclick = () => openTaskModal();
      }
    }

    // Verificar políticas de 24h para predecesoras
    checkConditionalPolicies(proj);

    // Header
    if (titleEl) titleEl.textContent = proj.name;
    if (descEl) descEl.textContent = proj.desc || 'Gestión directa de tareas y checklist';
    if (breadcrumbEl) breadcrumbEl.textContent = proj.name;

    // Métricas del Proyecto (adaptadas al usuario seleccionado si aplica)
    const allProjTasks = proj.tasks || [];
    const isUserFiltered = AppState.filters.assignee !== 'all';
    const selectedUser = isUserFiltered ? getTeamUserByEmail(AppState.filters.assignee) : null;
    const scopedTasks = isUserFiltered ? allProjTasks.filter(t => t.assignee === AppState.filters.assignee) : allProjTasks;

    const projTotal = scopedTasks.length;
    const projDone = scopedTasks.filter(t => t.completed).length;
    const pct = projTotal > 0 ? Math.round((projDone / projTotal) * 100) : 0;

    const progressFill = document.getElementById('project-progress-fill');
    const progressPercent = document.getElementById('project-progress-percent');
    const progressSubtext = document.getElementById('project-progress-subtext');

    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressSubtext) {
      if (isUserFiltered && selectedUser) {
        progressSubtext.textContent = `${projDone} de ${projTotal} tareas de ${selectedUser.shortName || selectedUser.name} completadas (${pct}%)`;
      } else {
        progressSubtext.textContent = `${projDone} de ${projTotal} tareas completadas (${pct}%)`;
      }
    }

    // Conteo de tareas activas (no completadas) por cuadrante Eisenhower para los 4 KPIs (adaptadas a usuario)
    const activeTasks = scopedTasks.filter(t => !t.completed);
    let q1Active = 0, q2Active = 0, q3Active = 0, q4Active = 0;
    activeTasks.forEach(t => {
      const p = normalizePriority(t.priority);
      if (p === 'urgente-importante') q1Active++;
      else if (p === 'importante-no-urgente') q2Active++;
      else if (p === 'urgente-no-importante') q3Active++;
      else if (p === 'no-urgente-no-importante') q4Active++;
    });

    const elQ1 = document.getElementById('kpi-val-q1');
    const elQ2 = document.getElementById('kpi-val-q2');
    const elQ3 = document.getElementById('kpi-val-q3');
    const elQ4 = document.getElementById('kpi-val-q4');
    if (elQ1) elQ1.textContent = q1Active;
    if (elQ2) elQ2.textContent = q2Active;
    if (elQ3) elQ3.textContent = q3Active;
    if (elQ4) elQ4.textContent = q4Active;

    // Sincronizar indicador de usuario y dock vertical
    updateActiveUserChip();
    renderUserDock();

    // Resaltar KPI activo si coincide con el filtro activo
    const kpiMap = [
      { id: 'kpi-card-q1', pri: 'urgente-importante' },
      { id: 'kpi-card-q2', pri: 'importante-no-urgente' },
      { id: 'kpi-card-q3', pri: 'urgente-no-importante' },
      { id: 'kpi-card-q4', pri: 'no-urgente-no-importante' }
    ];
    kpiMap.forEach(({ id, pri }) => {
      const card = document.getElementById(id);
      if (card) {
        if (AppState.filters.priority === pri) {
          card.classList.add('active-filter');
        } else {
          card.classList.remove('active-filter');
        }
      }
    });

    // Conmutación de Vistas
    if (projTotal === 0) {
      emptyEl.style.display = 'flex';
      const emptyTitle = emptyEl.querySelector('.empty-state-title');
      const emptyDesc = emptyEl.querySelector('.empty-state-desc');
      if (emptyTitle) emptyTitle.textContent = 'No hay tareas en este proyecto';
      if (emptyDesc) emptyDesc.textContent = 'Comienza agregando tu primera tarea y sus pasos de checklist.';
      listContainer.style.display = 'none';
      calContainer.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';

    if (AppState.currentView === 'calendar') {
      listContainer.style.display = 'none';
      calContainer.style.display = 'flex';
      renderCalendarView(proj);
    } else {
      listContainer.style.display = 'flex';
      calContainer.style.display = 'none';
      renderListView(proj);
    }
  }

  function filterTask(task) {
    const f = AppState.filters;

    // Búsqueda
    if (f.search) {
      const q = f.search.toLowerCase();
      const matchTitle = (task.title || '').toLowerCase().includes(q);
      const matchDesc = (task.desc || '').toLowerCase().includes(q);
      const matchAssignee = (task.assignee || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee) return false;
    }

    // Estado
    if (f.status === 'pending' && task.completed) return false;
    if (f.status === 'completed' && !task.completed) return false;
    if (f.status === 'overdue') {
      if (task.completed || !task.dueDate) return false;
      const today = new Date().toISOString().split('T')[0];
      if (task.dueDate >= today) return false;
    }

    // Responsable
    if (f.assignee !== 'all' && task.assignee !== f.assignee) return false;

    // Prioridad (Matriz de Eisenhower)
    if (f.priority !== 'all') {
      const taskPri = normalizePriority(task.priority);
      const filterPri = normalizePriority(f.priority);
      if (taskPri !== filterPri) return false;
    }

    return true;
  }

  // ─── 1. VISTA DE LISTA (MATRIZ ARQUITECTÓNICA CON RETÍCULA PUNTEADA) ────────
  function renderListView(proj) {
    const container = document.getElementById('checklist-hierarchical-container');
    if (!container) return;

    container.innerHTML = '';
    const filteredTasks = (proj.tasks || []).filter(filterTask);

    if (filteredTasks.length === 0) {
      const isUserFiltered = AppState.filters.assignee !== 'all';
      const user = isUserFiltered ? getTeamUserByEmail(AppState.filters.assignee) : null;
      const userName = user ? (user.shortName || user.name) : AppState.filters.assignee;

      container.innerHTML = `
        <div class="matrix-empty-notice" style="text-align: center; padding: 48px 20px;">
          <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 14px;">
            ${isUserFiltered ? `No hay tareas asignadas a <strong>${userName}</strong> en este proyecto.` : 'No se encontraron tareas con los filtros activos.'}
          </p>
          ${isUserFiltered ? `<button type="button" class="btn-secondary" id="btn-empty-clear-user" style="padding: 7px 16px; font-size: 11px; border-radius: var(--radius-full);">Ver tareas de todo el equipo</button>` : ''}
        </div>
      `;
      const btnClear = container.querySelector('#btn-empty-clear-user');
      if (btnClear) {
        btnClear.addEventListener('click', () => selectUserFilter('all'));
      }
      return;
    }

    const matrixBoard = document.createElement('div');
    matrixBoard.className = 'cntxt-matrix-board';

    // Encabezado con Retícula y Títulos de Columna
    const matrixHeader = document.createElement('div');
    matrixHeader.className = 'matrix-grid-header';
    matrixHeader.innerHTML = `
      <div class="matrix-col-head col-status" title="Estado de la tarea">ESTADO</div>
      <div class="matrix-col-head col-task">TAREA & ALINEACIÓN ESTRATÉGICA</div>
      <div class="matrix-col-head col-priority">PRIORIDAD EISENHOWER</div>
      <div class="matrix-col-head col-duration" title="Duración Estimada en Horas">TIEMPO</div>
      <div class="matrix-col-head col-due">ENTREGA</div>
      <div class="matrix-col-head col-assignee">RESPONSABLE</div>
      <div class="matrix-col-head col-subtasks">CHECKLIST</div>
      <div class="matrix-col-head col-actions">ACCIONES</div>
    `;
    matrixBoard.appendChild(matrixHeader);

    // Contenedor de Filas Alineadas
    const taskListWrap = document.createElement('div');
    taskListWrap.className = 'matrix-rows-container';

    filteredTasks.forEach(task => {
      const taskEl = createTaskElement(task, proj);
      taskListWrap.appendChild(taskEl);
    });

    matrixBoard.appendChild(taskListWrap);
    container.appendChild(matrixBoard);
  }

  function createTaskElement(task, proj) {
    const taskItem = document.createElement('div');
    taskItem.className = `task-item-matrix-node ${task.completed ? 'completed' : ''}`;
    taskItem.id = `task-node-${task.id}`;

    const totalSubtasks = (task.subtasks || []).length;
    const doneSubtasks = (task.subtasks || []).filter(st => st.done).length;
    const dueInfo = formatDueDate(task.dueDate, task.dueTime);

    // Prioridad Matriz de Eisenhower
    const normPriority = normalizePriority(task.priority);
    const priorityLabel = EISENHOWER_LABELS[normPriority] || '🟡 Importante, No Urgente (Q2)';

    // Predecesora (Amarre de Requisito)
    let predecessorHtml = '';
    if (task.predecessorId) {
      const predTask = (proj.tasks || []).find(t => t.id === task.predecessorId);
      if (predTask) {
        if (task.conditionalUnlock && !predTask.completed) {
          const remainingH = Math.max(1, Math.round((task.conditionalDeadline - Date.now()) / (1000 * 60 * 60)));
          predecessorHtml = `
            <span class="task-predecessor-chip status-conditional" title="Completada provisional. Se desmarcará en ~${remainingH}h si no se completa su requisito previo">
              <span>⏱️ Condicional (~${remainingH}h):</span>
              <strong>${predTask.title}</strong>
            </span>
          `;
        } else if (predTask.completed) {
          predecessorHtml = `
            <span class="task-predecessor-chip status-ready" title="Requisito cumplido: ${predTask.title}">
              <span>✓ Requisito cumplido:</span>
              <strong>${predTask.title}</strong>
            </span>
          `;
        } else {
          predecessorHtml = `
            <span class="task-predecessor-chip status-blocked" title="En espera de requisito previo: ${predTask.title}">
              <span>⏳ Espera requisito:</span>
              <strong>${predTask.title}</strong>
            </span>
          `;
        }
      }
    }

    // Objetivo Estratégico (Criterio de Importancia Anti-Tareitis)
    let objectiveHtml = '';
    if (task.strategicObjective) {
      objectiveHtml = `
        <span class="task-objective-chip" title="Alineada a Objetivo Estratégico: ${task.strategicObjective}">
          <span>🎯</span>
          <span>${task.strategicObjective}</span>
        </span>
      `;
    } else {
      objectiveHtml = `
        <span class="task-objective-chip tareitis-alert" title="Esta tarea no está vinculada a ningún objetivo estratégico. ¡Cuidado con la tareitis!">
          <span>⚠️ Sin objetivo mapeado</span>
        </span>
      `;
    }

    // Duración Estimada con Hover Informativo
    const estHours = task.estimatedHours || 2;
    const durationHtml = `
      <span class="est-duration-badge" title="Este valor no es estricto, es para mejorar tu capacidad de predecir la operación.">
        <span>⏱️ ${estHours}h</span>
      </span>
    `;

    taskItem.innerHTML = `
      <div class="matrix-task-row">
        <!-- 1. Checkbox de estado con regla de 24h -->
        <div class="matrix-cell cell-status">
          <input type="checkbox" class="task-checkbox" id="chk-${task.id}" ${task.completed ? 'checked' : ''}>
        </div>

        <!-- 2. Título, descripción, objetivo y chip de predecesora -->
        <div class="matrix-cell cell-details" id="details-${task.id}">
          <div class="matrix-task-title-line">
            <span class="matrix-task-title">${task.title}</span>
            ${predecessorHtml}
            ${objectiveHtml}
          </div>
          ${task.desc ? `<div class="matrix-task-desc">${task.desc}</div>` : ''}
        </div>

        <!-- 3. Prioridad Eisenhower -->
        <div class="matrix-cell cell-priority">
          <span class="priority-pill priority-${normPriority}" title="Prioridad Eisenhower: ${priorityLabel}">
            ${priorityLabel}
          </span>
        </div>

        <!-- 4. Duración Estimada -->
        <div class="matrix-cell cell-duration">
          ${durationHtml}
        </div>

        <!-- 5. Fecha Límite / Hora -->
        <div class="matrix-cell cell-due">
          ${dueInfo ? `
            <span class="due-date-badge ${dueInfo.statusClass}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${dueInfo.label}
            </span>
          ` : '<span class="cell-empty-dash">—</span>'}
        </div>

        <!-- 6. Responsable -->
        <div class="matrix-cell cell-assignee">
          ${task.assignee ? `
            <div class="assignee-chip" title="${task.assignee}">
              <span class="assignee-mini-avatar">${getInitials(task.assignee)}</span>
              <span class="assignee-name-label">${task.assignee.split('@')[0]}</span>
            </div>
          ` : '<span class="cell-empty-dash">—</span>'}
        </div>

        <!-- 7. Checklist / Subtareas -->
        <div class="matrix-cell cell-subtasks">
          ${totalSubtasks > 0 ? `
            <button type="button" class="subtasks-pill ${doneSubtasks === totalSubtasks ? 'completed' : ''}" id="btn-toggle-subtasks-${task.id}" title="Ver checklist">
              <span>☑️ ${doneSubtasks}/${totalSubtasks}</span>
            </button>
          ` : '<span class="cell-empty-dash">—</span>'}
        </div>

        <!-- 8. Acciones Rápidas -->
        <div class="matrix-cell cell-actions">
          <button type="button" class="btn-icon btn-edit-task" title="Editar tarea">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button type="button" class="btn-icon btn-delete-task" title="Eliminar tarea">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Drawer de Subtareas si existen -->
      ${totalSubtasks > 0 ? `
        <div class="task-subtasks-drawer" id="subtasks-drawer-${task.id}" style="display: none;">
          ${task.subtasks.map((st, idx) => `
            <div class="subtask-item-row">
              <input type="checkbox" class="subtask-checkbox" data-task-id="${task.id}" data-st-index="${idx}" ${st.done ? 'checked' : ''}>
              <span class="subtask-text ${st.done ? 'completed' : ''}">${st.text}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Checkbox Principal con Detección de Predecesora & Regla de 24h
    const chk = taskItem.querySelector(`#chk-${task.id}`);
    chk.addEventListener('change', (e) => {
      const isChecking = e.target.checked;

      if (isChecking && task.predecessorId) {
        const predTask = (proj.tasks || []).find(t => t.id === task.predecessorId);
        if (predTask && !predTask.completed) {
          // Revertir temporalmente el check visual hasta que confirme
          e.target.checked = false;
          openPredecessorAlertModal(task, predTask, proj);
          return;
        }
      }

      // Proceso normal
      task.completed = isChecking;
      if (!isChecking) {
        task.conditionalUnlock = false;
        delete task.conditionalDeadline;
      }

      // Si acabamos de completar una tarea, revisar si era predecesora de otra
      if (isChecking) {
        (proj.tasks || []).forEach(other => {
          if (other.predecessorId === task.id && other.conditionalUnlock) {
            other.conditionalUnlock = false;
            delete other.conditionalDeadline;
          }
        });
      }

      Storage.saveProjects(AppState.projects);
      taskItem.classList.toggle('completed', task.completed);
      showToast(task.completed ? `Tarea completada: "${task.title}"` : `Tarea reactivada`, 'success');
      renderMainView();
      renderProjectsSidebar();
    });

    // Subtasks Drawer Toggle
    const toggleStBtn = taskItem.querySelector(`#btn-toggle-subtasks-${task.id}`);
    if (toggleStBtn) {
      toggleStBtn.addEventListener('click', () => {
        const drawer = taskItem.querySelector(`#subtasks-drawer-${task.id}`);
        if (drawer) {
          const isShown = drawer.style.display !== 'none';
          drawer.style.display = isShown ? 'none' : 'flex';
        }
      });
    }

    // Checkbox de Subtareas
    taskItem.querySelectorAll('.subtask-checkbox').forEach(stChk => {
      stChk.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.stIndex, 10);
        task.subtasks[idx].done = e.target.checked;
        Storage.saveProjects(AppState.projects);
        
        const allDone = task.subtasks.every(s => s.done);
        if (allDone && !task.completed) {
          task.completed = true;
          showToast(`¡Completados todos los pasos de "${task.title}"!`, 'success');
        }

        renderMainView();
      });
    });

    // Editar Tarea
    taskItem.querySelector('.btn-edit-task').addEventListener('click', () => {
      openTaskModal(task);
    });

    // Eliminar Tarea
    taskItem.querySelector('.btn-delete-task').addEventListener('click', () => {
      if (confirm(`¿Eliminar la tarea "${task.title}"?`)) {
        proj.tasks.forEach(t => {
          if (t.predecessorId === task.id) t.predecessorId = null;
        });

        proj.tasks = proj.tasks.filter(t => t.id !== task.id);
        Storage.saveProjects(AppState.projects);
        showToast('Tarea eliminada', 'info');
        renderMainView();
        renderProjectsSidebar();
      }
    });

    return taskItem;
  }

  // ─── Modal de Alerta de Predecesora (24 Horas) ────────────────
  function openPredecessorAlertModal(task, predTask, proj) {
    const modal = document.getElementById('modal-predecessor-alert');
    const predNameEl = document.getElementById('modal-alert-pred-name');
    if (!modal) return;

    predNameEl.innerHTML = `🔗 <strong>${predTask.title}</strong> (${predTask.assignee ? predTask.assignee.split('@')[0] : 'Sin asignar'})`;
    AppState.pendingAlertAction = { task, predTask, proj };
    modal.classList.add('open');
  }

  function closePredecessorAlertModal() {
    const modal = document.getElementById('modal-predecessor-alert');
    if (modal) modal.classList.remove('open');
    AppState.pendingAlertAction = null;
  }

  // ─── 2. VISTA DE CALENDARIO COLOMBIANO CON SEMANAS ISO ────────
  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  function renderCalendarView(proj) {
    const monthTitle = document.getElementById('calendar-month-title');
    const daysGrid = document.getElementById('calendar-days-grid');
    if (!monthTitle || !daysGrid) return;

    const year = AppState.calYear;
    const month = AppState.calMonth;

    monthTitle.textContent = `${MONTH_NAMES[month]} ${year}`;
    daysGrid.innerHTML = '';

    const holidays = getColombianHolidays(year);

    // Primer día del mes (Lunes = 0, Domingo = 6)
    const firstDay = new Date(year, month, 1);
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const now = new Date();
    const isCurrentYearMonth = now.getFullYear() === year && now.getMonth() === month;
    const currentDay = now.getDate();

    // Construir la lista completa de todas las 35 o 42 celdas
    const allCellsData = [];

    // 1. Días del mes anterior
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      allCellsData.push({ dayNum, dateStr, isOtherMonth: true, isToday: false, holidayName: holidays[dateStr], fullDate: prevDate });
    }

    // 2. Días del mes actual
    for (let day = 1; day <= daysInMonth; day++) {
      const curDate = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      allCellsData.push({
        dayNum: day,
        dateStr,
        isOtherMonth: false,
        isToday: isCurrentYearMonth && day === currentDay,
        holidayName: holidays[dateStr],
        fullDate: curDate
      });
    }

    // 3. Días del mes siguiente
    const remainingCells = (7 - (allCellsData.length % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
      const nextDate = new Date(year, month + 1, day);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      allCellsData.push({ dayNum: day, dateStr, isOtherMonth: true, isToday: false, holidayName: holidays[dateStr], fullDate: nextDate });
    }

    const filteredTasks = (proj.tasks || []).filter(filterTask);

    // Renderizar por filas de semanas completas (1 celda de semana + 7 celdas de días)
    const numWeeks = allCellsData.length / 7;

    for (let w = 0; w < numWeeks; w++) {
      const weekDays = allCellsData.slice(w * 7, (w + 1) * 7);
      
      // Fecha representativa de la semana (el Jueves según ISO 8601 o el Miércoles)
      const midWeekDate = weekDays[3] ? weekDays[3].fullDate : weekDays[0].fullDate;
      const weekNumber = getISOWeekNumber(midWeekDate);

      // Celda de Semana (Columna izquierda)
      const weekCell = document.createElement('div');
      weekCell.className = 'cal-week-cell';
      weekCell.innerHTML = `<span class="cal-week-badge" title="Semana ${weekNumber} del año">S${weekNumber}</span>`;
      daysGrid.appendChild(weekCell);

      // 7 celdas de días
      weekDays.forEach(cellData => {
        const isSunday = cellData.fullDate.getDay() === 0;
        const cell = document.createElement('div');
        cell.className = `cal-day-cell ${cellData.isOtherMonth ? 'other-month' : ''} ${cellData.isToday ? 'today' : ''} ${cellData.holidayName ? 'is-holiday' : ''} ${isSunday ? 'cal-day-sunday' : ''}`;
        cell.dataset.date = cellData.dateStr;

        const dayTasks = filteredTasks.filter(t => t.dueDate === cellData.dateStr);

        let tasksHtml = '';
        dayTasks.forEach(task => {
          const normPri = normalizePriority(task.priority);
          const priLabel = EISENHOWER_LABELS[normPri] || 'Q2: Planificar';
          const priShortCode = normPri === 'urgente-importante' ? 'Q1' :
                               normPri === 'importante-no-urgente' ? 'Q2' :
                               normPri === 'urgente-no-importante' ? 'Q3' : 'Q4';

          const durationVal = task.estimatedHours ? `${task.estimatedHours}h` : '';
          const assigneeName = task.assignee ? task.assignee.split('@')[0] : 'Sin asignar';
          const fullTitle = `${task.title}${task.dueTime ? ' (' + task.dueTime + ')' : ''} | ${priLabel} | Objetivo: ${task.strategicObjective || 'Sin objetivo'} | Duración: ${task.estimatedHours || 2}h`;

          tasksHtml += `
            <div class="cal-task-card ${task.completed ? 'completed' : ''}" 
                 id="cal-task-${task.id}" 
                 data-task-id="${task.id}" 
                 draggable="true" 
                 title="${fullTitle}">
              
              <!-- Fila superior: Cuadrante Eisenhower + Hora + Duración + Predecesora -->
              <div class="cal-task-top-row">
                <span class="cal-task-priority-pill ${normPri}">
                  <span class="cal-task-priority-dot ${normPri}"></span>
                  <span>${priShortCode}</span>
                </span>

                <div class="cal-task-badges-group">
                  ${task.dueTime ? `<span class="cal-task-time-pill" title="Hora de entrega">🕒${task.dueTime}</span>` : ''}
                  ${durationVal ? `<span class="cal-task-duration-badge" title="Este valor no es estricto, es para mejorar tu capacidad de predecir la operación.">⏱️${durationVal}</span>` : ''}
                  ${task.predecessorId ? `<span class="cal-task-pred-badge" title="Amarrada a tarea previa">🔗</span>` : ''}
                </div>
              </div>

              <!-- Título de la tarea completo y visible -->
              <div class="cal-task-title-wrap">
                <span class="cal-task-title-text">${task.title}</span>
              </div>

              <!-- Fila inferior: Responsable y Objetivo Clave -->
              <div class="cal-task-bottom-row">
                <div class="cal-task-assignee" title="Asignado a: ${task.assignee || 'Sin asignar'}">
                  <span class="cal-task-avatar">${getInitials(task.assignee)}</span>
                  <span class="cal-task-assignee-text">${assigneeName}</span>
                </div>
                ${task.strategicObjective ? `
                  <span class="cal-task-obj-tag" title="Objetivo: ${task.strategicObjective}">
                    🎯 ${task.strategicObjective}
                  </span>
                ` : ''}
              </div>

            </div>
          `;
        });

        cell.innerHTML = `
          <div class="cal-day-header">
            <div class="cal-day-num-box">
              <span class="cal-day-number">${cellData.dayNum}</span>
              ${cellData.isToday ? '<span class="cal-today-badge">HOY</span>' : ''}
            </div>
            ${cellData.holidayName ? `<span class="cal-holiday-tag" title="Festivo Nacional: ${cellData.holidayName}">🇨🇴 ${cellData.holidayName}</span>` : ''}
          </div>
          <div class="cal-day-tasks">
            ${tasksHtml}
          </div>
        `;

        // Eventos en tarjetas de tareas
        cell.querySelectorAll('.cal-task-card').forEach(card => {
          card.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetTask = (proj.tasks || []).find(t => t.id === card.dataset.taskId);
            if (targetTask) openTaskModal(targetTask);
          });

          card.addEventListener('mouseenter', () => {
            highlightConnection(card.dataset.taskId, true);
          });
          card.addEventListener('mouseleave', () => {
            highlightConnection(card.dataset.taskId, false);
          });

          // Arrastrar Tarea (HTML5 Drag and Drop)
          card.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            AppState.draggedTaskId = card.dataset.taskId;
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
            e.dataTransfer.effectAllowed = 'move';
          });

          card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            AppState.draggedTaskId = null;
            document.querySelectorAll('.cal-day-cell.drag-over').forEach(el => el.classList.remove('drag-over'));
          });
        });

        // Eventos Drag and Drop en el recuadro del día
        cell.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (!cell.classList.contains('drag-over')) {
            cell.classList.add('drag-over');
          }
        });

        cell.addEventListener('dragleave', (e) => {
          if (!cell.contains(e.relatedTarget)) {
            cell.classList.remove('drag-over');
          }
        });

        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');

          const taskId = e.dataTransfer.getData('text/plain') || AppState.draggedTaskId;
          const targetDate = cell.dataset.date;

          if (taskId && targetDate) {
            const targetTask = (proj.tasks || []).find(t => t.id === taskId);
            if (targetTask && targetTask.dueDate !== targetDate) {
              const oldDate = targetTask.dueDate;
              targetTask.dueDate = targetDate;
              Storage.saveProjects(AppState.projects);

              const formattedDate = targetDate.split('-').reverse().join('/');
              showToast(`📅 "${targetTask.title}" reubicada al ${formattedDate}`, 'success');

              renderMainView();
              renderProjectsSidebar();
            }
          }
        });

        cell.addEventListener('click', () => {
          openTaskModal(null, cellData.dateStr);
        });

        daysGrid.appendChild(cell);
      });
    }

    // Dibujar curvas de predecesoras
    setTimeout(() => {
      drawCalendarConnections(proj);
    }, 60);
  }

  // ─── 3. LÍNEAS SVG DE CONEXIÓN CON PREDECESORAS ───────────────
  function drawCalendarConnections(proj) {
    const svg = document.getElementById('calendar-connections-svg');
    const wrapper = document.getElementById('calendar-grid-wrapper');
    if (!svg || !wrapper) return;

    const existingPaths = svg.querySelectorAll('path.cal-dep-line');
    existingPaths.forEach(p => p.remove());

    const scrollW = Math.max(wrapper.scrollWidth, wrapper.clientWidth);
    const scrollH = Math.max(wrapper.scrollHeight, wrapper.clientHeight);

    svg.style.width = `${scrollW}px`;
    svg.style.height = `${scrollH}px`;
    svg.setAttribute('width', scrollW);
    svg.setAttribute('height', scrollH);
    svg.setAttribute('viewBox', `0 0 ${scrollW} ${scrollH}`);

    const wrapperRect = wrapper.getBoundingClientRect();
    const tasks = proj.tasks || [];

    tasks.forEach(task => {
      if (!task.predecessorId) return;

      const targetEl = document.getElementById(`cal-task-${task.id}`);
      const sourceEl = document.getElementById(`cal-task-${task.predecessorId}`);

      if (!targetEl || !sourceEl) return;

      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const x1 = sourceRect.right - wrapperRect.left + wrapper.scrollLeft;
      const y1 = sourceRect.top + (sourceRect.height / 2) - wrapperRect.top + wrapper.scrollTop;

      const x2 = targetRect.left - wrapperRect.left + wrapper.scrollLeft;
      const y2 = targetRect.top + (targetRect.height / 2) - wrapperRect.top + wrapper.scrollTop;

      const dx = Math.max(30, Math.abs(x2 - x1) * 0.4);
      const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('class', 'cal-dep-line');
      path.setAttribute('marker-end', 'url(#arrowhead)');
      path.dataset.sourceId = task.predecessorId;
      path.dataset.targetId = task.id;

      svg.appendChild(path);
    });
  }

  function highlightConnection(taskId, isHighlight) {
    const svg = document.getElementById('calendar-connections-svg');
    if (!svg) return;

    svg.querySelectorAll('.cal-dep-line').forEach(line => {
      if (line.dataset.sourceId === taskId || line.dataset.targetId === taskId) {
        line.classList.toggle('highlighted', isHighlight);
      }
    });
  }

  // ─── Modal de Tareas (Crear / Editar) ──────────────────────────
  function updateAdvisorUI() {
    const dueDate = document.getElementById('task-due-date-input').value;
    const dueTime = document.getElementById('task-due-time-input').value;
    const estimatedHours = document.getElementById('task-est-duration-input').value;
    const objective = document.getElementById('task-objective-select').value;

    const suggestion = calculateEisenhowerSuggestion({ dueDate, dueTime, estimatedHours, objective });
    AppState.currentSuggestedQuadrant = suggestion.quadrant;

    const tagEl = document.getElementById('advisor-suggested-tag');
    const reasonEl = document.getElementById('advisor-reason-text');
    const feedbackNote = document.getElementById('objective-feedback-note');

    if (tagEl) {
      tagEl.className = `advisor-tag ${suggestion.tagClass}`;
      tagEl.textContent = suggestion.shortName;
    }

    if (reasonEl) {
      reasonEl.textContent = suggestion.reason;
    }

    if (feedbackNote) {
      if (!objective || objective.trim() === '') {
        feedbackNote.className = 'objective-feedback-note warning';
        feedbackNote.textContent = '⚠️ Alerta de Tareitis: Esta tarea no está vinculada a ningún objetivo estratégico. Considera descartarla (Q4) o delegarla (Q3).';
      } else {
        feedbackNote.className = 'objective-feedback-note success';
        feedbackNote.textContent = '✓ Tarea vinculada a objetivo estratégico clave. Califica con Alta Importancia.';
      }
    }
  }

  function openTaskModal(taskToEdit = null, defaultDueDate = null) {
    const modal = document.getElementById('modal-task');
    const modalTitle = document.getElementById('modal-task-title');
    const form = document.getElementById('form-task');
    const predSelect = document.getElementById('task-predecessor-select');
    const objSelect = document.getElementById('task-objective-select');
    const proj = getActiveProject();

    // Llenar Predecesoras
    predSelect.innerHTML = '<option value="">Ninguna (Sin requisitos previos)</option>';
    const currentTaskId = taskToEdit ? taskToEdit.id : null;

    (proj.tasks || []).forEach(t => {
      if (t.id !== currentTaskId) {
        const opt = document.createElement('option');
        opt.value = t.id;
        const assignee = t.assignee ? ` (${t.assignee.split('@')[0]})` : '';
        opt.textContent = `${t.title}${assignee}`;
        predSelect.appendChild(opt);
      }
    });

    // Llenar Objetivos Estratégicos (Enfoque Anti-Tareitis)
    objSelect.innerHTML = '<option value="">⚠️ Sin objetivo mapeado (Alerta de Tareitis)</option>';
    const objectivesList = (proj.objectives && proj.objectives.length > 0) ? proj.objectives : [
      'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
      'Orquestar arquitectura modular para apps hijas del Admin Hub',
      'Asegurar experiencia gráfica y tipográfica premium CNTXT® Casa de Diseño'
    ];

    objectivesList.forEach(obj => {
      const opt = document.createElement('option');
      opt.value = obj;
      opt.textContent = `🎯 ${obj}`;
      objSelect.appendChild(opt);
    });

    AppState.tempSubtasks = [];

    if (taskToEdit) {
      modalTitle.textContent = 'Editar Tarea';
      document.getElementById('task-id-field').value = taskToEdit.id;
      document.getElementById('task-title-input').value = taskToEdit.title;
      document.getElementById('task-desc-input').value = taskToEdit.desc || '';
      document.getElementById('task-priority-select').value = normalizePriority(taskToEdit.priority);
      document.getElementById('task-assignee-select').value = taskToEdit.assignee || 'coordinadora@cntxt.co';
      document.getElementById('task-due-date-input').value = taskToEdit.dueDate || '';
      document.getElementById('task-due-time-input').value = taskToEdit.dueTime || '';
      document.getElementById('task-est-duration-input').value = taskToEdit.estimatedHours || 2;
      objSelect.value = taskToEdit.strategicObjective || '';
      predSelect.value = taskToEdit.predecessorId || '';

      AppState.tempSubtasks = JSON.parse(JSON.stringify(taskToEdit.subtasks || []));
    } else {
      modalTitle.textContent = 'Nueva Tarea';
      form.reset();
      document.getElementById('task-id-field').value = '';
      document.getElementById('task-priority-select').value = 'importante-no-urgente';
      document.getElementById('task-due-time-input').value = '18:00';
      document.getElementById('task-est-duration-input').value = '2';
      objSelect.value = objectivesList[0] || '';
      if (defaultDueDate) {
        document.getElementById('task-due-date-input').value = defaultDueDate;
      }
      predSelect.value = '';
    }

    renderSubtasksEditor();
    updateAdvisorUI();
    modal.classList.add('open');
    document.getElementById('task-title-input').focus();
  }

  function closeTaskModal() {
    document.getElementById('modal-task').classList.remove('open');
  }

  function renderSubtasksEditor() {
    const listEl = document.getElementById('subtasks-editor-list');
    const countEl = document.getElementById('subtasks-editor-count');
    if (!listEl) return;

    listEl.innerHTML = '';
    countEl.textContent = `${AppState.tempSubtasks.length} pasos`;

    AppState.tempSubtasks.forEach((st, idx) => {
      const row = document.createElement('div');
      row.className = 'subtask-edit-item';
      row.innerHTML = `
        <span>${st.text}</span>
        <button type="button" class="btn-icon" data-idx="${idx}" title="Quitar paso" style="color:#d9534f; padding:2px;">✕</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        AppState.tempSubtasks.splice(idx, 1);
        renderSubtasksEditor();
      });
      listEl.appendChild(row);
    });
  }

  function saveTaskFromModal(e) {
    e.preventDefault();
    const proj = getActiveProject();
    if (!proj) return;

    const taskId = document.getElementById('task-id-field').value;
    const title = document.getElementById('task-title-input').value.trim();
    const desc = document.getElementById('task-desc-input').value.trim();
    const priority = document.getElementById('task-priority-select').value;
    const assignee = document.getElementById('task-assignee-select').value;
    const dueDate = document.getElementById('task-due-date-input').value;
    const dueTime = document.getElementById('task-due-time-input').value || null;
    const estimatedHours = parseFloat(document.getElementById('task-est-duration-input').value) || 2;
    const strategicObjective = document.getElementById('task-objective-select').value || null;
    const predecessorId = document.getElementById('task-predecessor-select').value || null;

    if (!title) {
      showToast('Por favor escribe un título para la tarea', 'error');
      return;
    }

    if (!proj.tasks) proj.tasks = [];

    if (taskId) {
      const idx = proj.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        proj.tasks[idx] = {
          ...proj.tasks[idx],
          title,
          desc,
          priority,
          assignee,
          dueDate,
          dueTime,
          estimatedHours,
          strategicObjective,
          predecessorId,
          subtasks: AppState.tempSubtasks
        };
      }
      showToast('Tarea actualizada con criterios de Eisenhower', 'success');
    } else {
      const newTask = {
        id: 'task-' + Date.now(),
        title,
        desc,
        priority,
        assignee,
        dueDate,
        dueTime,
        estimatedHours,
        strategicObjective,
        completed: false,
        predecessorId,
        subtasks: AppState.tempSubtasks
      };
      proj.tasks.push(newTask);
      showToast('Nueva tarea creada y vinculada', 'success');
    }

    Storage.saveProjects(AppState.projects);
    closeTaskModal();
    renderMainView();
    renderProjectsSidebar();
  }

  // ─── Modal de Proyecto (Crear / Editar) ────────────────────────
  // ─── Modal de Sistema (Crear / Editar / Eliminar) ─────────────
  function openSystemModal(system = null) {
    const modal = document.getElementById('modal-system');
    const titleEl = document.getElementById('modal-system-title');
    const idField = document.getElementById('system-id-field');
    const nameInput = document.getElementById('system-name-input');
    const codeInput = document.getElementById('system-code-input');
    const descInput = document.getElementById('system-desc-input');
    const colorInput = document.getElementById('system-color-input');
    if (!modal) return;

    if (system) {
      if (titleEl) titleEl.textContent = 'Editar Sistema';
      if (idField) idField.value = system.id;
      if (nameInput) nameInput.value = system.name || '';
      if (codeInput) codeInput.value = system.code || '';
      if (descInput) descInput.value = system.desc || '';
      if (colorInput) colorInput.value = system.color || '#C8A87A';
    } else {
      if (titleEl) titleEl.textContent = 'Crear Nuevo Sistema';
      if (idField) idField.value = '';
      if (nameInput) nameInput.value = '';
      if (codeInput) codeInput.value = '';
      if (descInput) descInput.value = '';
      if (colorInput) colorInput.value = '#C8A87A';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    if (nameInput) setTimeout(() => nameInput.focus(), 80);
  }

  function closeSystemModal() {
    const modal = document.getElementById('modal-system');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function saveSystemFromModal(e) {
    e.preventDefault();
    const idField = document.getElementById('system-id-field');
    const editingId = idField ? idField.value.trim() : '';

    const name = document.getElementById('system-name-input').value.trim();
    const code = document.getElementById('system-code-input').value.trim().toUpperCase();
    const desc = document.getElementById('system-desc-input').value.trim();
    const color = document.getElementById('system-color-input').value;

    if (!name) {
      showToast('Escribe un nombre para el sistema', 'error');
      return;
    }

    if (editingId) {
      const sys = AppState.systems.find(s => s.id === editingId);
      if (sys) {
        sys.name = name;
        sys.code = code;
        sys.desc = desc;
        sys.color = color;
      }
      showToast(`Sistema "${name}" actualizado`, 'success');
    } else {
      const newSys = {
        id: 'sys-' + Date.now(),
        name,
        code,
        desc,
        color,
        icon: 'layers',
        order: AppState.systems.length
      };
      AppState.systems.push(newSys);
      AppState.expandedSystemIds.add(newSys.id);
      AppState.activeSystemId = newSys.id;
      showToast(`Nuevo Sistema "${name}" creado`, 'success');
    }

    Storage.saveSystems(AppState.systems);
    closeSystemModal();
    renderSystemsSidebar();
    renderMainView();
  }

  function openDeleteSystemModal(system) {
    const modal = document.getElementById('modal-delete-system');
    const nameEl = document.getElementById('delete-system-name');
    if (!modal || !system) return;

    if (AppState.systems.length <= 1) {
      showToast('Debes mantener al menos un sistema activo en el ecosistema', 'error');
      return;
    }

    AppState.pendingSystemToDelete = system;
    if (nameEl) nameEl.textContent = `"${system.name}"`;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeDeleteSystemModal() {
    const modal = document.getElementById('modal-delete-system');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    AppState.pendingSystemToDelete = null;
  }

  function confirmDeleteSystem() {
    const sys = AppState.pendingSystemToDelete;
    if (!sys) return;

    AppState.systems = AppState.systems.filter(s => s.id !== sys.id);
    const fallbackSysId = AppState.systems[0].id;

    // Reasignar proyectos al sistema de respaldo
    AppState.projects.forEach(p => {
      if (p.systemId === sys.id) {
        p.systemId = fallbackSysId;
      }
    });

    Storage.saveSystems(AppState.systems);
    Storage.saveProjects(AppState.projects);

    closeDeleteSystemModal();
    renderSystemsSidebar();
    renderMainView();
    showToast(`Sistema "${sys.name}" eliminado. Sus proyectos fueron preservados.`, 'info');
  }

  function openProjectModal(projectId = null, defaultSystemId = null) {
    ensureDefaultSystem();
    const modal = document.getElementById('modal-project');
    const form = document.getElementById('form-project');
    const titleEl = document.getElementById('modal-project-title');
    const submitBtn = document.getElementById('btn-save-project');
    const idField = document.getElementById('project-id-field');
    const sysSelect = document.getElementById('project-system-select');

    form.reset();

    // Poblar selector de sistemas
    if (sysSelect) {
      sysSelect.innerHTML = '';
      AppState.systems.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.code ? '[' + s.code + '] ' : ''}${s.name}`;
        sysSelect.appendChild(opt);
      });
    }

    if (projectId) {
      const proj = AppState.projects.find(p => p.id === projectId);
      if (proj) {
        if (idField) idField.value = proj.id;
        if (sysSelect) sysSelect.value = proj.systemId || (AppState.systems[0] && AppState.systems[0].id);
        document.getElementById('project-name-input').value = proj.name || '';
        document.getElementById('project-desc-input').value = proj.desc || '';
        document.getElementById('project-category-select').value = proj.category || 'OPERACIONES';
        document.getElementById('project-color-input').value = proj.color || '#C8A87A';
        if (titleEl) titleEl.textContent = 'Editar Proyecto';
        if (submitBtn) submitBtn.textContent = 'Guardar Cambios';
      }
    } else {
      if (idField) idField.value = '';
      if (sysSelect) {
        sysSelect.value = defaultSystemId || (AppState.activeSystemId) || (AppState.systems[0] && AppState.systems[0].id);
      }
      if (titleEl) titleEl.textContent = 'Crear Nuevo Proyecto';
      if (submitBtn) submitBtn.textContent = 'Crear Proyecto';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const nameInput = document.getElementById('project-name-input');
    if (nameInput) setTimeout(() => nameInput.focus(), 80);
  }

  function closeProjectModal() {
    document.getElementById('modal-project').classList.remove('open');
  }

  function saveProjectFromModal(e) {
    e.preventDefault();
    const idField = document.getElementById('project-id-field');
    const editingId = idField ? idField.value.trim() : '';

    const sysSelect = document.getElementById('project-system-select');
    const systemId = sysSelect ? sysSelect.value : (AppState.systems[0] && AppState.systems[0].id);
    const name = document.getElementById('project-name-input').value.trim();
    const desc = document.getElementById('project-desc-input').value.trim();
    const category = document.getElementById('project-category-select').value;
    const color = document.getElementById('project-color-input').value;

    if (!name) {
      showToast('Escribe un nombre para el proyecto', 'error');
      return;
    }

    if (editingId) {
      // Modo Edición
      const proj = AppState.projects.find(p => p.id === editingId);
      if (!proj) {
        showToast('Proyecto no encontrado', 'error');
        return;
      }
      proj.systemId = systemId;
      proj.name = name;
      proj.desc = desc;
      proj.category = category;
      proj.color = color;

      Storage.saveProjects(AppState.projects);
      closeProjectModal();
      renderProjectsSidebar();
      renderMainView();
      showToast(`Proyecto "${name}" actualizado con éxito`, 'success');
    } else {
      // Modo Creación
      const newProj = {
        id: 'proj-' + Date.now(),
        systemId,
        name,
        desc,
        category,
        color,
        tasks: []
      };

      AppState.projects.push(newProj);
      AppState.activeProjectId = newProj.id;
      Storage.saveProjects(AppState.projects);

      closeProjectModal();
      renderProjectsSidebar();
      renderMainView();
      showToast(`Proyecto "${name}" creado exitosamente`, 'success');
    }
  }

  // ─── Modal de Eliminación de Proyecto ─────────────────────────
  let projectToDeleteId = null;

  function openDeleteProjectModal(projectId) {
    const proj = AppState.projects.find(p => p.id === projectId);
    if (!proj) return;

    projectToDeleteId = projectId;
    const nameEl = document.getElementById('delete-project-name');
    const warnEl = document.getElementById('delete-project-warning');
    if (nameEl) nameEl.textContent = `"${proj.name}"`;
    if (warnEl) {
      const taskCount = (proj.tasks || []).length;
      warnEl.innerHTML = `Se eliminarán permanentemente el proyecto y sus <strong>${taskCount} tarea(s)</strong> asociadas. Esta acción no se puede deshacer.`;
    }

    const modal = document.getElementById('modal-delete-project');
    if (modal) modal.classList.add('open');
  }

  function closeDeleteProjectModal() {
    const modal = document.getElementById('modal-delete-project');
    if (modal) modal.classList.remove('open');
    projectToDeleteId = null;
  }

  function confirmDeleteProject() {
    if (!projectToDeleteId) return;

    const projIndex = AppState.projects.findIndex(p => p.id === projectToDeleteId);
    if (projIndex === -1) {
      closeDeleteProjectModal();
      return;
    }

    const deletedName = AppState.projects[projIndex].name;
    AppState.projects.splice(projIndex, 1);

    if (AppState.activeProjectId === projectToDeleteId) {
      AppState.activeProjectId = AppState.projects.length > 0 ? AppState.projects[0].id : null;
    }

    Storage.saveProjects(AppState.projects);
    closeDeleteProjectModal();
    renderProjectsSidebar();
    renderMainView();
    showToast(`Proyecto "${deletedName}" eliminado`, 'info');
  }

  // ─── Eventos e Inicialización ─────────────────────────────────
  function initEvents() {
    // Conmutador de Vistas: Lista vs Calendario
    const btnViewList = document.getElementById('btn-view-list');
    const btnViewCal = document.getElementById('btn-view-calendar');

    if (btnViewList && btnViewCal) {
      btnViewList.addEventListener('click', () => {
        btnViewList.classList.add('active');
        btnViewCal.classList.remove('active');
        AppState.currentView = 'list';
        renderMainView();
      });

      btnViewCal.addEventListener('click', () => {
        btnViewCal.classList.add('active');
        btnViewList.classList.remove('active');
        AppState.currentView = 'calendar';
        renderMainView();
      });
    }

    // Botón de Pantalla Completa (Toggle Fullscreen)
    const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
    if (btnFullscreen) {
      const iconEnter = btnFullscreen.querySelector('.icon-fullscreen-enter');
      const iconExit = btnFullscreen.querySelector('.icon-fullscreen-exit');

      function updateFullscreenUI() {
        const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (isFull) {
          btnFullscreen.classList.add('is-fullscreen');
          btnFullscreen.title = 'Salir de pantalla completa';
          if (iconEnter) iconEnter.style.display = 'none';
          if (iconExit) iconExit.style.display = 'block';
        } else {
          btnFullscreen.classList.remove('is-fullscreen');
          btnFullscreen.title = 'Pantalla completa';
          if (iconEnter) iconEnter.style.display = 'block';
          if (iconExit) iconExit.style.display = 'none';
        }
      }

      btnFullscreen.addEventListener('click', () => {
        const isFull = Boolean(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (!isFull) {
          const docEl = document.documentElement;
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
      });

      document.addEventListener('fullscreenchange', updateFullscreenUI);
      document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
      document.addEventListener('mozfullscreenchange', updateFullscreenUI);
      document.addEventListener('MSFullscreenChange', updateFullscreenUI);
    }

    // Navegación del Calendario
    const btnCalPrev = document.getElementById('btn-cal-prev');
    const btnCalNext = document.getElementById('btn-cal-next');
    const btnCalToday = document.getElementById('btn-cal-today');

    if (btnCalPrev) {
      btnCalPrev.addEventListener('click', () => {
        AppState.calMonth--;
        if (AppState.calMonth < 0) {
          AppState.calMonth = 11;
          AppState.calYear--;
        }
        renderMainView();
      });
    }

    if (btnCalNext) {
      btnCalNext.addEventListener('click', () => {
        AppState.calMonth++;
        if (AppState.calMonth > 11) {
          AppState.calMonth = 0;
          AppState.calYear++;
        }
        renderMainView();
      });
    }

    if (btnCalToday) {
      btnCalToday.addEventListener('click', () => {
        const today = new Date();
        AppState.calYear = today.getFullYear();
        AppState.calMonth = today.getMonth();
        renderMainView();
      });
    }

    // Modal de Alerta de Predecesora (Confirmar / Cancelar)
    const btnCancelPredAlert = document.getElementById('btn-cancel-pred-alert');
    const btnConfirmPredAlert = document.getElementById('btn-confirm-pred-alert');

    if (btnCancelPredAlert) {
      btnCancelPredAlert.addEventListener('click', closePredecessorAlertModal);
    }

    if (btnConfirmPredAlert) {
      btnConfirmPredAlert.addEventListener('click', () => {
        if (AppState.pendingAlertAction) {
          const { task, predTask, proj } = AppState.pendingAlertAction;
          task.completed = true;
          task.conditionalUnlock = true;
          task.conditionalDeadline = Date.now() + 24 * 60 * 60 * 1000; // 24 horas

          Storage.saveProjects(AppState.projects);
          showToast(`⚠️ Marcada condicionalmente. Se desmarcará en 24h si "${predTask.title}" sigue sin completarse.`, 'info');
          closePredecessorAlertModal();
          renderMainView();
          renderProjectsSidebar();
        }
      });
    }

    // Redibujar líneas al redimensionar ventana o al scrollear el calendario
    window.addEventListener('resize', () => {
      if (AppState.currentView === 'calendar') {
        const proj = getActiveProject();
        if (proj) drawCalendarConnections(proj);
      }
    });

    const calWrapper = document.getElementById('calendar-grid-wrapper');
    if (calWrapper) {
      calWrapper.addEventListener('scroll', () => {
        if (AppState.currentView === 'calendar') {
          const proj = getActiveProject();
          if (proj) drawCalendarConnections(proj);
        }
      }, { passive: true });
    }

    // Filtros de Estado
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        AppState.filters.status = e.target.dataset.filter;
        renderMainView();
      });
    });

    // Filtro Responsable
    const filterUser = document.getElementById('filter-user-select');
    if (filterUser) {
      filterUser.addEventListener('change', (e) => {
        selectUserFilter(e.target.value);
      });
    }

    // Filtro Prioridad
    const filterPri = document.getElementById('filter-priority-select');
    if (filterPri) {
      filterPri.addEventListener('change', (e) => {
        AppState.filters.priority = e.target.value;
        renderMainView();
      });
    }

    // Búsqueda en vivo
    const searchInput = document.getElementById('task-search-input');
    const searchClear = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        AppState.filters.search = e.target.value.trim();
        searchClear.style.display = AppState.filters.search ? 'block' : 'none';
        renderMainView();
      });
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        AppState.filters.search = '';
        searchClear.style.display = 'none';
        renderMainView();
      });
    }

    // Modal Tareas
    document.getElementById('btn-open-new-task-modal').addEventListener('click', () => openTaskModal());
    document.getElementById('btn-close-task-modal').addEventListener('click', closeTaskModal);
    document.getElementById('btn-cancel-task-modal').addEventListener('click', closeTaskModal);
    document.getElementById('form-task').addEventListener('submit', saveTaskFromModal);

    // Eventos en vivo del Priorizador Inteligente Eisenhower
    const inputDueDate = document.getElementById('task-due-date-input');
    const inputDueTime = document.getElementById('task-due-time-input');
    const inputDuration = document.getElementById('task-est-duration-input');
    const selectObjective = document.getElementById('task-objective-select');
    const btnApplyAdvisor = document.getElementById('btn-advisor-apply');

    [inputDueDate, inputDueTime, inputDuration, selectObjective].forEach(el => {
      if (el) {
        el.addEventListener('input', updateAdvisorUI);
        el.addEventListener('change', updateAdvisorUI);
      }
    });

    if (btnApplyAdvisor) {
      btnApplyAdvisor.addEventListener('click', () => {
        if (AppState.currentSuggestedQuadrant) {
          const selectPri = document.getElementById('task-priority-select');
          selectPri.value = AppState.currentSuggestedQuadrant;
          selectPri.style.boxShadow = '0 0 10px rgba(200, 168, 122, 0.6)';
          setTimeout(() => { selectPri.style.boxShadow = ''; }, 600);
          showToast(`Criterio aplicado: ${EISENHOWER_LABELS[AppState.currentSuggestedQuadrant]}`, 'info');
        }
      });
    }

    // Subtareas en Modal
    const btnAddSubtask = document.getElementById('btn-add-subtask-item');
    const subtaskInput = document.getElementById('new-subtask-text-input');
    function addSubtaskAction() {
      const text = subtaskInput.value.trim();
      if (text) {
        AppState.tempSubtasks.push({ id: 'st-' + Date.now(), text, done: false });
        subtaskInput.value = '';
        renderSubtasksEditor();
      }
    }
    btnAddSubtask.addEventListener('click', addSubtaskAction);
    subtaskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSubtaskAction();
      }
    });

    // Modal Proyectos
    document.getElementById('btn-open-new-project-modal').addEventListener('click', () => openProjectModal());
    document.getElementById('btn-close-project-modal').addEventListener('click', closeProjectModal);
    document.getElementById('btn-cancel-project-modal').addEventListener('click', closeProjectModal);
    document.getElementById('form-project').addEventListener('submit', saveProjectFromModal);

    // Acciones de Proyecto en Header
    const btnEditActiveProj = document.getElementById('btn-edit-active-project');
    if (btnEditActiveProj) {
      btnEditActiveProj.addEventListener('click', () => {
        if (AppState.activeProjectId) openProjectModal(AppState.activeProjectId);
      });
    }

    const btnDeleteActiveProj = document.getElementById('btn-delete-active-project');
    if (btnDeleteActiveProj) {
      btnDeleteActiveProj.addEventListener('click', () => {
        if (AppState.activeProjectId) openDeleteProjectModal(AppState.activeProjectId);
      });
    }

    // Modal Eliminar Proyecto
    const btnCloseDeleteProj = document.getElementById('btn-close-delete-project-modal');
    if (btnCloseDeleteProj) btnCloseDeleteProj.addEventListener('click', closeDeleteProjectModal);

    const btnCancelDeleteProj = document.getElementById('btn-cancel-delete-project');
    if (btnCancelDeleteProj) btnCancelDeleteProj.addEventListener('click', closeDeleteProjectModal);

    const btnConfirmDeleteProj = document.getElementById('btn-confirm-delete-project');
    if (btnConfirmDeleteProj) btnConfirmDeleteProj.addEventListener('click', confirmDeleteProject);

    // Botón Empty State
    document.getElementById('btn-empty-state-add-task').addEventListener('click', () => openTaskModal());

    // Filtros interactivos al hacer click en los KPIs Eisenhower
    const kpiCards = document.querySelectorAll('.kpi-eisenhower-card');
    kpiCards.forEach(card => {
      card.addEventListener('click', () => {
        const priorityTarget = card.dataset.priority;
        const prioritySelect = document.getElementById('filter-priority-select');

        if (AppState.filters.priority === priorityTarget) {
          AppState.filters.priority = 'all';
          if (prioritySelect) prioritySelect.value = 'all';
        } else {
          AppState.filters.priority = priorityTarget;
          if (prioritySelect) prioritySelect.value = priorityTarget;
        }

        renderMainView();
      });
    });

    // Sidebar Collapse
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('collapsed');
      });
    }

    // Formulario de Login JWT
    const authOverlay = document.getElementById('auth-login-overlay');
    const authForm = document.getElementById('auth-login-form');
    const authErr = document.getElementById('auth-error-msg');
    const authSpinner = document.getElementById('auth-btn-spinner');

    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErr.style.display = 'none';
      authSpinner.style.display = 'inline-block';

      const user = document.getElementById('auth-input-email').value;
      const pass = document.getElementById('auth-input-password').value;

      try {
        await Auth.login(user, pass);
        authOverlay.classList.remove('active');
        updateUserBadge();
        showToast('Bienvenido a CNTXT® Tasks', 'success');
      } catch (err) {
        authErr.textContent = err.message || 'Error al iniciar sesión';
        authErr.style.display = 'block';
      } finally {
        authSpinner.style.display = 'none';
      }
    });

    // Botón Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('¿Deseas cerrar sesión en CNTXT® Tasks?')) {
        Auth.clearSession();
        authOverlay.classList.add('active');
      }
    });

    // Temporizador de verificación periódica de la política de 24h
    setInterval(() => {
      const proj = getActiveProject();
      if (proj) checkConditionalPolicies(proj);
    }, 30000); // Cada 30 segundos
  }

  // ─── Barra Vertical de Usuarios (Auto-collapsible on Hover / Dock) ───
  function updateActiveUserChip() {
    const chip = document.getElementById('active-user-filter-chip');
    const avatarEl = document.getElementById('active-user-chip-avatar');
    const textEl = document.getElementById('active-user-chip-text');
    if (!chip) return;

    if (AppState.filters.assignee === 'all') {
      chip.style.display = 'none';
    } else {
      const user = getTeamUserByEmail(AppState.filters.assignee);
      chip.style.display = 'inline-flex';
      if (user) {
        textEl.textContent = user.shortName || user.name;
        if (user.avatar) {
          avatarEl.innerHTML = `<img src="${user.avatar}" alt="${user.name}" onerror="this.parentElement.textContent='${user.initials}';">`;
        } else {
          avatarEl.textContent = user.initials;
        }
      } else {
        const initials = getInitials(AppState.filters.assignee);
        avatarEl.textContent = initials;
        textEl.textContent = AppState.filters.assignee.split('@')[0];
      }
    }
  }

  function renderUserDock() {
    const listEl = document.getElementById('user-dock-list');
    if (!listEl) return;

    const teamUsers = getAllTeamUsers();
    listEl.innerHTML = '';

    const activeProj = getActiveProject();
    const projTasks = activeProj ? (activeProj.tasks || []) : [];

    teamUsers.forEach(user => {
      const isAll = user.isAll;
      const isActive = isAll ? AppState.filters.assignee === 'all' : AppState.filters.assignee === user.email;

      let pendingCount = 0;
      if (isAll) {
        pendingCount = projTasks.filter(t => !t.completed).length;
      } else {
        pendingCount = projTasks.filter(t => !t.completed && t.assignee === user.email).length;
      }

      const item = document.createElement('div');
      item.className = `user-dock-item ${isActive ? 'active' : ''}`;
      item.dataset.userEmail = user.email;

      if (isAll) {
        item.innerHTML = `
          <div class="user-dock-avatar-ring">
            <div class="user-dock-avatar-all" title="Ver todo el equipo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            ${pendingCount > 0 ? `<span class="user-dock-badge">${pendingCount}</span>` : ''}
          </div>
          <div class="user-dock-tooltip">
            <div class="user-tooltip-name">Todo el Equipo</div>
            <div class="user-tooltip-role">Vista Global</div>
            <div class="user-tooltip-stats">${pendingCount} tareas activas totales</div>
          </div>
        `;
      } else {
        const bgCol = user.color || '#2c251c';
        item.innerHTML = `
          <div class="user-dock-avatar-ring">
            <div class="user-dock-avatar-circle" style="background: ${bgCol};">
              ${user.avatar ? `
                <img src="${user.avatar}" alt="${user.name}" class="user-dock-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span class="user-dock-initials" style="display:none;">${user.initials}</span>
              ` : `
                <span class="user-dock-initials">${user.initials}</span>
              `}
            </div>
            <span class="user-dock-online-dot"></span>
            ${pendingCount > 0 ? `<span class="user-dock-badge">${pendingCount}</span>` : ''}
          </div>
          <div class="user-dock-tooltip">
            <div class="user-tooltip-name">${user.name}</div>
            <div class="user-tooltip-role">${user.role || 'Miembro del Equipo'}</div>
            <div class="user-tooltip-stats">${pendingCount} tareas activas</div>
          </div>
        `;
      }

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectUserFilter(user.email);
      });

      listEl.appendChild(item);
    });
  }

  function selectUserFilter(email) {
    AppState.filters.assignee = email;

    // Sincronizar el dropdown de responsable
    const selectEl = document.getElementById('filter-user-select');
    if (selectEl) selectEl.value = email;

    // Actualizar chip indicador
    updateActiveUserChip();

    // Actualizar dock
    renderUserDock();

    // Actualizar sidebar (proyectos reflejan las métricas de este usuario)
    renderProjectsSidebar();

    // Actualizar vista principal (matriz, KPIs, barra de avance adaptadas al usuario)
    renderMainView();
  }

  function setupUserDockInteractions() {
    const dockContainer = document.getElementById('user-dock-container');
    if (!dockContainer) return;

    let hideTimeout = null;

    // Detectar movimiento del mouse cerca del borde izquierdo de la pantalla (menos de 32px)
    document.addEventListener('mousemove', (e) => {
      if (e.clientX <= 32) {
        if (hideTimeout) clearTimeout(hideTimeout);
        dockContainer.classList.add('is-hovered');
      } else if (e.clientX > 82 && !dockContainer.contains(e.target)) {
        if (!hideTimeout) {
          hideTimeout = setTimeout(() => {
            dockContainer.classList.remove('is-hovered');
            hideTimeout = null;
          }, 180);
        }
      }
    });

    // Mantener abierto mientras el cursor esté sobre el dock container
    dockContainer.addEventListener('mouseenter', () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      dockContainer.classList.add('is-hovered');
    });

    dockContainer.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(() => {
        dockContainer.classList.remove('is-hovered');
        hideTimeout = null;
      }, 250);
    });

    // Botón de limpiar filtro de usuario en toolbar
    const btnClearUser = document.getElementById('btn-clear-user-chip');
    if (btnClearUser) {
      btnClearUser.addEventListener('click', () => {
        selectUserFilter('all');
      });
    }
  }

  function updateUserBadge() {
    const user = Auth.getUser() || { name: 'Admin CNTXT®', email: 'admin@cntxt.co', role: 'Superadmin / Dirección Técnica' };
    const initialsEl = document.getElementById('sidebar-avatar-initials');
    const imgEl = document.getElementById('sidebar-avatar-img');
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');

    if (nameEl) nameEl.textContent = user.name || user.email;
    if (roleEl) roleEl.textContent = user.role || 'Superadmin';

    const initials = getInitials(user.name || user.email || 'Admin');
    if (initialsEl) initialsEl.textContent = initials;

    // Buscar foto en la sesión o en la lista de miembros
    let avatar = user.avatar;
    if (!avatar && user.email) {
      const match = TEAM_USERS.find(u => u.email && u.email.toLowerCase() === user.email.toLowerCase());
      if (match && match.avatar) avatar = match.avatar;
    }

    if (imgEl && initialsEl) {
      if (avatar) {
        imgEl.src = avatar;
        imgEl.style.display = 'block';
        initialsEl.style.display = 'none';
      } else {
        imgEl.src = '';
        imgEl.style.display = 'none';
        initialsEl.style.display = 'flex';
      }
    }
  }

  function syncUserSelectOptions() {
    // 1. Dropdown de filtrado en toolbar: #filter-user-select
    const filterSelect = document.getElementById('filter-user-select');
    if (filterSelect) {
      const currentVal = AppState.filters.assignee || 'all';
      filterSelect.innerHTML = '<option value="all">Todos los miembros</option>';
      TEAM_USERS.forEach(u => {
        if (!u.isAll) {
          const opt = document.createElement('option');
          opt.value = u.email;
          opt.textContent = `${u.name} (${u.shortName || u.role || 'Miembro'})`;
          filterSelect.appendChild(opt);
        }
      });
      filterSelect.value = currentVal;
    }

    // 2. Dropdown de asignación en modal de tareas: #task-assignee-select
    const taskAssigneeSelect = document.getElementById('task-assignee-select');
    if (taskAssigneeSelect) {
      const currentTaskAssignee = taskAssigneeSelect.value;
      taskAssigneeSelect.innerHTML = '';
      TEAM_USERS.forEach(u => {
        if (!u.isAll) {
          const opt = document.createElement('option');
          opt.value = u.email;
          opt.textContent = `${u.name} (${u.role || 'Operativo'})`;
          taskAssigneeSelect.appendChild(opt);
        }
      });
      if (currentTaskAssignee) {
        taskAssigneeSelect.value = currentTaskAssignee;
      }
    }
  }

  // ─── Modal: Mi Perfil (Foto, Datos, Contraseña) ───────────────
  let tempProfileAvatar = null;

  function initMyProfileModal() {
    const modal = document.getElementById('modal-my-profile');
    const btnOpen = document.getElementById('btn-open-my-profile');
    const btnClose = document.getElementById('btn-close-my-profile-modal');
    const btnCancel = document.getElementById('btn-cancel-my-profile');
    const form = document.getElementById('form-my-profile');
    const fileInput = document.getElementById('input-profile-file');
    const btnTriggerUpload = document.getElementById('btn-trigger-upload-photo');
    const btnSelectPhoto = document.getElementById('btn-select-photo');
    const btnRemovePhoto = document.getElementById('btn-remove-photo');
    const imgPreview = document.getElementById('profile-avatar-img');
    const initialsPreview = document.getElementById('profile-avatar-initials');

    if (!modal) return;

    function openModal() {
      const user = Auth.getUser() || { name: 'Admin CNTXT®', email: 'admin@cntxt.co', role: 'Superadmin / Dirección Técnica' };
      const match = TEAM_USERS.find(u => u.email && u.email.toLowerCase() === (user.email || '').toLowerCase());

      document.getElementById('profile-name-input').value = user.name || (match ? match.name : 'Admin CNTXT®');
      document.getElementById('profile-email-input').value = user.email || (match ? match.email : 'admin@cntxt.co');
      document.getElementById('profile-phone-input').value = user.phone || (match && match.phone) || '';
      document.getElementById('profile-role-input').value = user.role || (match ? match.role : 'Superadmin');

      document.getElementById('profile-new-pass').value = '';
      document.getElementById('profile-confirm-pass').value = '';

      tempProfileAvatar = user.avatar || (match ? match.avatar : null) || '';

      if (tempProfileAvatar) {
        imgPreview.src = tempProfileAvatar;
        imgPreview.style.display = 'block';
        initialsPreview.style.display = 'none';
        btnRemovePhoto.style.display = 'inline-block';
      } else {
        imgPreview.src = '';
        imgPreview.style.display = 'none';
        initialsPreview.textContent = getInitials(user.name || user.email || 'Admin');
        initialsPreview.style.display = 'flex';
        btnRemovePhoto.style.display = 'none';
      }

      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      if (fileInput) fileInput.value = '';
    }

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const triggerUpload = () => { if (fileInput) fileInput.click(); };
    if (btnTriggerUpload) btnTriggerUpload.addEventListener('click', triggerUpload);
    if (btnSelectPhoto) btnSelectPhoto.addEventListener('click', triggerUpload);

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 4 * 1024 * 1024) {
          showToast('La foto debe pesar menos de 4MB', 'error');
          return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
          tempProfileAvatar = evt.target.result;
          imgPreview.src = tempProfileAvatar;
          imgPreview.style.display = 'block';
          initialsPreview.style.display = 'none';
          btnRemovePhoto.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
      });
    }

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', () => {
        tempProfileAvatar = '';
        imgPreview.src = '';
        imgPreview.style.display = 'none';
        const nameVal = document.getElementById('profile-name-input').value;
        initialsPreview.textContent = getInitials(nameVal || 'Admin');
        initialsPreview.style.display = 'flex';
        btnRemovePhoto.style.display = 'none';
        if (fileInput) fileInput.value = '';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('profile-name-input').value.trim();
        const phone = document.getElementById('profile-phone-input').value.trim();
        const newPass = document.getElementById('profile-new-pass').value;
        const confirmPass = document.getElementById('profile-confirm-pass').value;

        if (!name) {
          showToast('El nombre no puede estar vacío', 'error');
          return;
        }

        if (newPass || confirmPass) {
          if (newPass.length < 6) {
            showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
            return;
          }
          if (newPass !== confirmPass) {
            showToast('Las contraseñas no coinciden', 'error');
            return;
          }
        }

        const currentUser = Auth.getUser() || { email: 'admin@cntxt.co', role: 'Superadmin' };
        currentUser.name = name;
        currentUser.phone = phone;
        currentUser.avatar = tempProfileAvatar;
        if (newPass) currentUser.password = newPass;

        Auth.setSession(Auth.getToken() || 'offline_token', currentUser);

        // Actualizar en TEAM_USERS
        const match = TEAM_USERS.find(u => u.email && u.email.toLowerCase() === (currentUser.email || '').toLowerCase());
        if (match) {
          match.name = name;
          match.shortName = name.split(' ')[0];
          match.avatar = tempProfileAvatar;
          match.initials = getInitials(name);
          match.phone = phone;
          saveTeamUsers(TEAM_USERS);
        }

        // Intento silencioso de sincronizar con API Django si existe
        try {
          const config = window.CNTXT_CONFIG || {};
          const baseUrl = (config.SYNC && config.SYNC.API_BASE_URL) || '/api';
          const token = Auth.getToken();
          if (token && !token.startsWith('offline_')) {
            await fetch(`${baseUrl}/auth/me/`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                first_name: name,
                avatar: tempProfileAvatar
              })
            });
          }
        } catch (err) {
          console.warn('API sync fallback to local storage:', err);
        }

        updateUserBadge();
        renderUserDock();
        syncUserSelectOptions();
        closeModal();
        showToast('Perfil actualizado exitosamente ✨', 'success');
      });
    }
  }

  // ─── Modal: Gestión de Equipo ─────────────────────────────────
  function initTeamManagementModal() {
    const modal = document.getElementById('modal-team-management');
    const btnOpen = document.getElementById('btn-open-team-modal');
    const btnClose = document.getElementById('btn-close-team-modal');
    const tabBtnList = document.getElementById('tab-btn-team-list');
    const tabBtnCreate = document.getElementById('tab-btn-team-create');
    const tabContentList = document.getElementById('team-tab-list');
    const tabContentCreate = document.getElementById('team-tab-create');
    const formMember = document.getElementById('form-team-member');
    const btnCancelForm = document.getElementById('btn-cancel-team-form');
    const colorInput = document.getElementById('member-color-input');
    const colorLabel = document.getElementById('member-color-val');
    const btnSaveMember = document.getElementById('btn-save-team-member');

    if (!modal) return;

    function switchTab(tab) {
      if (tab === 'list') {
        tabBtnList.classList.add('active');
        tabBtnCreate.classList.remove('active');
        tabContentList.classList.add('active');
        tabContentCreate.classList.remove('active');
        renderTeamManagementList();
      } else {
        tabBtnList.classList.remove('active');
        tabBtnCreate.classList.add('active');
        tabContentList.classList.remove('active');
        tabContentCreate.classList.add('active');
      }
    }

    if (tabBtnList) tabBtnList.addEventListener('click', () => switchTab('list'));
    if (tabBtnCreate) {
      tabBtnCreate.addEventListener('click', () => {
        resetMemberForm();
        switchTab('create');
      });
    }

    if (btnCancelForm) {
      btnCancelForm.addEventListener('click', () => {
        resetMemberForm();
        switchTab('list');
      });
    }

    if (colorInput && colorLabel) {
      colorInput.addEventListener('input', (e) => {
        colorLabel.textContent = e.target.value.toUpperCase();
      });
    }

    function openModal() {
      resetMemberForm();
      switchTab('list');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      resetMemberForm();
    }

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    function resetMemberForm() {
      if (!formMember) return;
      formMember.reset();
      document.getElementById('team-member-edit-id').value = '';
      if (colorInput) colorInput.value = '#C8A87A';
      if (colorLabel) colorLabel.textContent = '#C8A87A';
      if (btnSaveMember) btnSaveMember.textContent = 'Guardar Miembro';
      if (tabBtnCreate && tabBtnCreate.querySelector('span')) {
        tabBtnCreate.querySelector('span').textContent = '+ Agregar Miembro';
      }
    }

    function renderTeamManagementList() {
      const container = document.getElementById('team-members-list');
      const countBadge = document.getElementById('team-modal-count');
      if (!container) return;

      const members = TEAM_USERS.filter(u => !u.isAll);
      if (countBadge) countBadge.textContent = members.length;

      container.innerHTML = '';

      if (members.length === 0) {
        container.innerHTML = `
          <div style="padding: 30px; text-align: center; color: var(--text-muted); font-size: 13px;">
            No hay miembros registrados en el equipo.
          </div>
        `;
        return;
      }

      members.forEach(member => {
        let activeTasks = 0;
        AppState.projects.forEach(p => {
          (p.tasks || []).forEach(t => {
            if (!t.completed && t.assignee && t.assignee.toLowerCase() === member.email.toLowerCase()) {
              activeTasks++;
            }
          });
        });

        const row = document.createElement('div');
        row.className = 'team-member-row';

        const bgCol = member.color || '#C8A87A';
        const hasAvatar = Boolean(member.avatar);

        row.innerHTML = `
          <div class="team-member-cell-info">
            <div class="team-member-avatar-badge" style="border-color: ${bgCol};">
              ${hasAvatar ? `
                <img src="${member.avatar}" alt="${member.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <span style="display: none; color: ${bgCol};">${member.initials}</span>
              ` : `
                <span style="color: ${bgCol};">${member.initials}</span>
              `}
            </div>
            <div class="team-member-name-block">
              <span class="team-member-name">${member.name}</span>
              <span class="team-member-email">${member.email}</span>
            </div>
          </div>
          <div>
            <span class="team-member-role-tag" title="${member.role || 'Miembro'}">${member.role || 'Miembro'}</span>
          </div>
          <div>
            <span class="team-member-tasks-badge">${activeTasks} ${activeTasks === 1 ? 'tarea' : 'tareas'}</span>
          </div>
          <div class="team-member-actions">
            <button type="button" class="btn-team-row-action btn-edit-member" title="Editar miembro">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn-team-row-action delete btn-delete-member" title="Eliminar miembro">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;

        const btnEdit = row.querySelector('.btn-edit-member');
        btnEdit.addEventListener('click', () => {
          editMember(member);
        });

        const btnDelete = row.querySelector('.btn-delete-member');
        btnDelete.addEventListener('click', () => {
          deleteMember(member);
        });

        container.appendChild(row);
      });
    }

    function editMember(member) {
      document.getElementById('team-member-edit-id').value = member.email;
      document.getElementById('member-name-input').value = member.name;
      document.getElementById('member-email-input').value = member.email;
      document.getElementById('member-role-select').value = member.role || 'Superadmin / Dirección Técnica';
      document.getElementById('member-avatar-input').value = member.avatar || '';
      document.getElementById('member-password-input').value = '';

      const col = member.color || '#C8A87A';
      if (colorInput) colorInput.value = col;
      if (colorLabel) colorLabel.textContent = col.toUpperCase();

      if (btnSaveMember) btnSaveMember.textContent = 'Actualizar Miembro';
      if (tabBtnCreate && tabBtnCreate.querySelector('span')) {
        tabBtnCreate.querySelector('span').textContent = 'Editar Miembro';
      }

      switchTab('create');
    }

    function deleteMember(member) {
      const currentAuth = Auth.getUser();
      const isCurrent = currentAuth && currentAuth.email && currentAuth.email.toLowerCase() === member.email.toLowerCase();
      if (isCurrent) {
        showToast('No puedes eliminar al usuario con el que tienes la sesión activa', 'error');
        return;
      }

      if (confirm(`¿Estás seguro de eliminar a "${member.name}" (${member.email}) del equipo?`)) {
        TEAM_USERS = TEAM_USERS.filter(u => u.email.toLowerCase() !== member.email.toLowerCase());
        saveTeamUsers(TEAM_USERS);

        renderTeamManagementList();
        renderUserDock();
        syncUserSelectOptions();
        showToast(`Miembro ${member.name} eliminado`, 'info');
      }
    }

    if (formMember) {
      formMember.addEventListener('submit', (e) => {
        e.preventDefault();

        const editEmail = document.getElementById('team-member-edit-id').value.trim();
        const name = document.getElementById('member-name-input').value.trim();
        const email = document.getElementById('member-email-input').value.trim().toLowerCase();
        const role = document.getElementById('member-role-select').value;
        const color = colorInput ? colorInput.value : '#C8A87A';
        const avatar = document.getElementById('member-avatar-input').value.trim();
        const pass = document.getElementById('member-password-input').value;

        if (!name || !email) {
          showToast('Nombre y correo electrónico son requeridos', 'error');
          return;
        }

        if (!email.includes('@')) {
          showToast('Ingresa un correo electrónico válido', 'error');
          return;
        }

        if (editEmail) {
          const target = TEAM_USERS.find(u => u.email.toLowerCase() === editEmail.toLowerCase());
          if (target) {
            target.name = name;
            target.shortName = name.split(' ')[0];
            target.email = email;
            target.id = email;
            target.role = role;
            target.color = color;
            target.avatar = avatar;
            target.initials = getInitials(name);
            if (pass) target.password = pass;

            const currentAuth = Auth.getUser();
            if (currentAuth && currentAuth.email && currentAuth.email.toLowerCase() === editEmail.toLowerCase()) {
              currentAuth.name = name;
              currentAuth.email = email;
              currentAuth.role = role;
              if (avatar) currentAuth.avatar = avatar;
              Auth.setSession(Auth.getToken(), currentAuth);
              updateUserBadge();
            }

            saveTeamUsers(TEAM_USERS);
            showToast('Miembro actualizado exitosamente ✨', 'success');
          }
        } else {
          if (TEAM_USERS.some(u => u.email.toLowerCase() === email)) {
            showToast('Ya existe un miembro con este correo electrónico', 'error');
            return;
          }

          const newMember = {
            id: email,
            email: email,
            name: name,
            shortName: name.split(' ')[0],
            role: role,
            color: color,
            avatar: avatar,
            initials: getInitials(name),
            password: pass || undefined
          };

          TEAM_USERS.push(newMember);
          saveTeamUsers(TEAM_USERS);
          showToast('Nuevo miembro registrado en el equipo ✨', 'success');
        }

        resetMemberForm();
        renderUserDock();
        syncUserSelectOptions();
        switchTab('list');
      });
    }
  }

  // ─── PWA & Experiencia Táctil Móvil ───────────────────────────
  let deferredInstallPrompt = null;

  function setupMobileAndPWA() {
    // 1. Registro del Service Worker para PWA con scope explícito
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/tasks/sw.js', { scope: '/tasks/' })
          .then((reg) => console.log('[PWA Tasks] Service Worker activo en:', reg.scope))
          .catch((err) => console.warn('[PWA Tasks] Error en SW:', err));
      });
    }

    // Capturar evento de instalación nativo del navegador
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      console.log('[PWA Tasks] Instalación nativa disponible para el usuario');
    });

    // 2. Elementos del DOM móvil
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const mobNavTasks = document.getElementById('mob-nav-tasks');
    const mobNavProjects = document.getElementById('mob-nav-projects');
    const mobNavAddTask = document.getElementById('mob-nav-add-task');
    const mobNavCalendar = document.getElementById('mob-nav-calendar');
    const mobNavProfile = document.getElementById('mob-nav-profile');

    function openMobileSidebar() {
      if (sidebar) sidebar.classList.add('mobile-open');
      if (backdrop) backdrop.classList.add('active');
    }

    function closeMobileSidebar() {
      if (sidebar) sidebar.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('active');
    }

    // Menú Hamburguesa en cabecera
    if (btnMobileMenu) {
      btnMobileMenu.addEventListener('click', () => {
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      });
    }

    // Backdrop cierra el drawer
    if (backdrop) {
      backdrop.addEventListener('click', closeMobileSidebar);
    }

    // Cerrar sidebar móvil al seleccionar un proyecto
    const projectsList = document.getElementById('projects-nav-list');
    if (projectsList) {
      projectsList.addEventListener('click', (e) => {
        if (e.target.closest('.project-nav-item') || e.target.closest('.btn-new-project')) {
          if (window.innerWidth <= 768) {
            closeMobileSidebar();
          }
        }
      });
    }

    // Barra de Navegación Inferior (Bottom Nav)
    function setActiveMobNavItem(activeBtn) {
      document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));
      if (activeBtn) activeBtn.classList.add('active');
    }

    if (mobNavTasks) {
      mobNavTasks.addEventListener('click', () => {
        closeMobileSidebar();
        setActiveMobNavItem(mobNavTasks);
        const btnViewList = document.getElementById('btn-view-list');
        if (btnViewList && !btnViewList.classList.contains('active')) {
          btnViewList.click();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    if (mobNavProjects) {
      mobNavProjects.addEventListener('click', () => {
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          closeMobileSidebar();
        } else {
          openMobileSidebar();
        }
      });
    }

    if (mobNavAddTask) {
      mobNavAddTask.addEventListener('click', () => {
        closeMobileSidebar();
        const btnNewTask = document.getElementById('btn-open-new-task-modal');
        if (btnNewTask) btnNewTask.click();
      });
    }

    if (mobNavCalendar) {
      mobNavCalendar.addEventListener('click', () => {
        closeMobileSidebar();
        setActiveMobNavItem(mobNavCalendar);
        const btnViewCal = document.getElementById('btn-view-calendar');
        const btnViewList = document.getElementById('btn-view-list');
        if (AppState.currentView === 'calendar') {
          if (btnViewList) btnViewList.click();
          setActiveMobNavItem(mobNavTasks);
        } else {
          if (btnViewCal) btnViewCal.click();
        }
      });
    }

    if (mobNavProfile) {
      mobNavProfile.addEventListener('click', () => {
        closeMobileSidebar();
        const btnProfile = document.getElementById('btn-open-my-profile');
        if (btnProfile) btnProfile.click();
      });
    }
  }

  // ─── Arranque de la App ───────────────────────────────────────
  function initApp() {
    AppState.systems = Storage.loadSystems();
    AppState.projects = Storage.loadProjects();
    ensureDefaultSystem();
    AppState.activeProjectId = AppState.projects[0] ? AppState.projects[0].id : null;
    if (AppState.projects[0]) {
      AppState.activeSystemId = AppState.projects[0].systemId;
    }

    initEvents();
    setupUserDockInteractions();
    initMyProfileModal();
    initTeamManagementModal();
    syncUserSelectOptions();
    setupMobileAndPWA();

    const token = Auth.getToken();
    const authOverlay = document.getElementById('auth-login-overlay');

    if (!token) {
      authOverlay.classList.add('active');
    } else {
      updateUserBadge();
    }

    renderUserDock();
    updateActiveUserChip();
    renderProjectsSidebar();
    renderMainView();

    // Iniciar sincronización continua en la nube
    Storage.initCloudSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
