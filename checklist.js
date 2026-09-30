/**
 * CNTXT® | Casa de Diseño — Checklist & Tasks Engine
 * Versión 3.0.0 — Sin fases, Amarres con alerta de 24h y Calendario Colombiano con semanas ISO
 */

(function () {
  'use strict';

  // ─── Estado Global de la Aplicación ───────────────────────────
  const AppState = {
    currentUser: null,
    projects: [],
    activeProjectId: null,
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

  // ─── Proyectos y Tareas Semilla Directas (Sin Fases) ───────────
  const DEFAULT_PROJECTS = [
    {
      id: 'proj-central-tech',
      name: 'Integración Central CNTXT® Tech',
      desc: 'Consolidación de suite de aplicaciones y módulo de tareas bajo el dominio centralcntxt.tech',
      category: 'OPERACIONES',
      color: '#C8A87A',
      objectives: [
        'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
        'Orquestar arquitectura modular para apps hijas del Admin Hub',
        'Asegurar experiencia gráfica y tipográfica premium CNTXT® Casa de Diseño'
      ],
      tasks: [
        {
          id: 'task-101',
          title: 'Revisión de configuración DNS y certificados SSL en EasyPanel',
          desc: 'Comprobar certificados Let\'s Encrypt y puertos 80/443 en el VPS 2.25.68.160.',
          priority: 'importante-no-urgente',
          assignee: 'admin@cntxt.co',
          dueDate: '2026-10-02',
          dueTime: '15:00',
          estimatedHours: 4,
          strategicObjective: 'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
          completed: true,
          predecessorId: null,
          subtasks: [
            { id: 'st-1', text: 'Validar registro A en Hostinger DNS', done: true },
            { id: 'st-2', text: 'Comprobar auto-renovación en Traefik', done: true }
          ]
        },
        {
          id: 'task-102',
          title: 'Mapeo de rutas para aplicaciones hijas del Admin Hub',
          desc: 'Definir si se orquestan como subdominios o rutas de proxy inverso para Creador de Propuestas y ProjectBriefs.',
          priority: 'urgente-importante',
          assignee: 'ceo@cntxt.co',
          dueDate: '2026-10-06',
          dueTime: '18:00',
          estimatedHours: 6,
          strategicObjective: 'Orquestar arquitectura modular para apps hijas del Admin Hub',
          completed: false,
          predecessorId: 'task-101', // Amarrada a la 101
          subtasks: [
            { id: 'st-3', text: 'Reunión de alineación de arquitectura', done: true },
            { id: 'st-4', text: 'Aprobar estructura de URLs', done: false }
          ]
        },
        {
          id: 'task-103',
          title: 'Diseño de interfaz de checklist con estética CNTXT® Casa de Diseño',
          desc: 'Implementar fondos puros #000000, paleta arena #C8A87A y tipografías Space Grotesk + Manrope.',
          priority: 'importante-no-urgente',
          assignee: 'coordinadora@cntxt.co',
          dueDate: '2026-10-09',
          dueTime: '17:00',
          estimatedHours: 8,
          strategicObjective: 'Asegurar experiencia gráfica y tipográfica premium CNTXT® Casa de Diseño',
          completed: true,
          predecessorId: null,
          subtasks: [
            { id: 'st-5', text: 'Maquetación HTML5 y CSS3 glassmorphism', done: true },
            { id: 'st-6', text: 'Componentes de filtros y buscador rápido', done: true }
          ]
        },
        {
          id: 'task-104',
          title: 'Persistencia reactiva y sincronización de datos con Django REST',
          desc: 'CRUD completo de tareas, subtareas y amarres de predecesoras en tiempo real.',
          priority: 'importante-no-urgente',
          assignee: 'admin@cntxt.co',
          dueDate: '2026-10-14',
          dueTime: '19:00',
          estimatedHours: 12,
          strategicObjective: 'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
          completed: false,
          predecessorId: 'task-103', // Amarrada a la 103
          subtasks: [
            { id: 'st-7', text: 'Validación de estructura de modelos', done: true },
            { id: 'st-8', text: 'Conector de endpoints Django REST', done: false }
          ]
        },
        {
          id: 'task-105',
          title: 'Calendario dinámico colombiano con conector visual de dependencias',
          desc: 'Visualizar tareas por persona con festivos de Colombia y líneas sutiles entre predecesoras.',
          priority: 'urgente-importante',
          assignee: 'director@cntxt.co',
          dueDate: '2026-10-19',
          dueTime: '16:00',
          estimatedHours: 10,
          strategicObjective: 'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
          completed: false,
          predecessorId: 'task-104', // Amarrada a la 104
          subtasks: [
            { id: 'st-9', text: 'Cálculo algorítmico de festivos Emiliani', done: true },
            { id: 'st-10', text: 'Capa SVG con curvas Bézier interactivas', done: true }
          ]
        },
        {
          id: 'task-106',
          title: 'Despliegue y verificación en vivo en centralcntxt.tech',
          desc: 'Subir cambios a GitHub rama main e implementar en EasyPanel.',
          priority: 'urgente-importante',
          assignee: 'admin@cntxt.co',
          dueDate: '2026-10-23',
          dueTime: '14:00',
          estimatedHours: 5,
          strategicObjective: 'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
          completed: false,
          predecessorId: 'task-105', // Amarrada a la 105
          subtasks: []
        }
      ]
    },
    {
      id: 'proj-made-b2b',
      name: 'Flujo Inmobiliario MADE B2B',
      desc: 'Pipeline operativo para prospección y estructuración corporativa de metros cuadrados',
      category: 'MADE B2B',
      color: '#d97736',
      objectives: [
        'Estructurar pipeline de 10.000 m² corporativos en MADE B2B',
        'Optimizar viabilidad normativa POT y aprovechamiento m²',
        'Comité de inversión y propuesta de valor comercial'
      ],
      tasks: [
        {
          id: 'b2b-task-1',
          title: 'Evaluación de viabilidad normativa del lote',
          desc: 'Verificar POT y usos del suelo con el equipo de arquitectura.',
          priority: 'importante-no-urgente',
          assignee: 'growth@cntxt.co',
          dueDate: '2026-10-07',
          dueTime: '12:00',
          estimatedHours: 16,
          strategicObjective: 'Optimizar viabilidad normativa POT y aprovechamiento m²',
          completed: false,
          predecessorId: null,
          subtasks: [
            { id: 'b2b-st-1', text: 'Solicitar certificado de tradición y libertad', done: true },
            { id: 'b2b-st-2', text: 'Emitir concepto de aprovechamiento m²', done: false }
          ]
        },
        {
          id: 'b2b-task-2',
          title: 'Comité de inversión y estructuración de la propuesta de valor',
          desc: 'Revisión con directiva de márgenes comerciales y plazos de obra.',
          priority: 'urgente-importante',
          assignee: 'ceo@cntxt.co',
          dueDate: '2026-10-15',
          dueTime: '10:00',
          estimatedHours: 8,
          strategicObjective: 'Comité de inversión y propuesta de valor comercial',
          completed: false,
          predecessorId: 'b2b-task-1', // Amarrada a viabilidad
          subtasks: []
        }
      ]
    }
  ];

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

  // ─── Módulo de Persistencia y Migración ───────────────────────
  const Storage = {
    STORAGE_KEY: 'cntxt_tasks_ecosystem_data_v3',

    loadProjects() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Migrador transparente: aplanar phases si existen y normalizar prioridades a Eisenhower
            parsed.forEach(proj => {
              if (proj.phases && !proj.tasks) {
                proj.tasks = [];
                proj.phases.forEach(ph => {
                  if (ph.tasks) proj.tasks.push(...ph.tasks);
                });
                delete proj.phases;
              }
              if (!proj.objectives || proj.objectives.length === 0) {
                proj.objectives = proj.id === 'proj-made-b2b' ? [
                  'Estructurar pipeline de 10.000 m² corporativos en MADE B2B',
                  'Optimizar viabilidad normativa POT y aprovechamiento m²',
                  'Comité de inversión y propuesta de valor comercial'
                ] : [
                  'Consolidar centralcntxt.tech con latencia <100ms y 100% uptime',
                  'Orquestar arquitectura modular para apps hijas del Admin Hub',
                  'Asegurar experiencia gráfica y tipográfica premium CNTXT® Casa de Diseño'
                ];
              }
              if (proj.tasks) {
                proj.tasks.forEach(t => {
                  if (t.priority) t.priority = normalizePriority(t.priority);
                  if (!t.estimatedHours) t.estimatedHours = 2;
                });
              }
            });
            return parsed;
          }
        }
      } catch (e) {
        console.error('Error al leer proyectos de localStorage', e);
      }
      return JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
    },

    saveProjects(projects) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
      } catch (e) {
        console.error('Error al guardar proyectos en localStorage', e);
      }
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
    return AppState.projects.find(p => p.id === AppState.activeProjectId) || AppState.projects[0];
  }

  // ─── Renderizado de Sidebar y Métricas ─────────────────────────
  function renderProjectsSidebar() {
    const listEl = document.getElementById('projects-nav-list');
    const badgeEl = document.getElementById('projects-total-badge');
    if (!listEl) return;

    listEl.innerHTML = '';
    badgeEl.textContent = AppState.projects.length;

    AppState.projects.forEach(proj => {
      const item = document.createElement('div');
      item.className = `project-nav-item ${proj.id === AppState.activeProjectId ? 'active' : ''}`;
      
      const tasks = proj.tasks || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.completed).length;

      item.innerHTML = `
        <span class="project-nav-dot" style="background-color: ${proj.color || 'var(--color-primary)'};"></span>
        <div class="project-nav-info">
          <div class="project-nav-name">${proj.name}</div>
          <div class="project-nav-meta">
            <span>${proj.category || 'General'}</span>
            <span>·</span>
            <span>${completedTasks}/${totalTasks}</span>
          </div>
        </div>
        <span class="project-nav-badge">${totalTasks}</span>
      `;

      item.addEventListener('click', () => {
        AppState.activeProjectId = proj.id;
        renderProjectsSidebar();
        renderMainView();
      });

      listEl.appendChild(item);
    });

    renderGlobalStats();
  }

  function renderGlobalStats() {
    let allTasks = 0;
    let allCompleted = 0;

    AppState.projects.forEach(p => {
      (p.tasks || []).forEach(t => {
        allTasks++;
        if (t.completed) allCompleted++;
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
    if (!proj) return;

    // Verificar políticas de 24h para predecesoras
    checkConditionalPolicies(proj);

    // Header
    const titleEl = document.getElementById('project-view-title');
    const descEl = document.getElementById('project-view-desc');
    const breadcrumbEl = document.getElementById('header-breadcrumb-project');

    if (titleEl) titleEl.textContent = proj.name;
    if (descEl) descEl.textContent = proj.desc || 'Gestión directa de tareas y checklist';
    if (breadcrumbEl) breadcrumbEl.textContent = proj.name;

    // Métricas del Proyecto
    const tasks = proj.tasks || [];
    const projTotal = tasks.length;
    const projDone = tasks.filter(t => t.completed).length;
    const pct = projTotal > 0 ? Math.round((projDone / projTotal) * 100) : 0;

    const progressFill = document.getElementById('project-progress-fill');
    const progressPercent = document.getElementById('project-progress-percent');
    const progressSubtext = document.getElementById('project-progress-subtext');

    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
    if (progressSubtext) progressSubtext.textContent = `${projDone} de ${projTotal} tareas completadas (${pct}%)`;

    // Conmutación de Vistas
    const listContainer = document.getElementById('checklist-hierarchical-container');
    const calContainer = document.getElementById('calendar-view-container');
    const emptyEl = document.getElementById('empty-state');

    if (projTotal === 0) {
      emptyEl.style.display = 'flex';
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

  // ─── 1. VISTA DE LISTA (DIRECTA SIN FASES) ────────────────────
  function renderListView(proj) {
    const container = document.getElementById('checklist-hierarchical-container');
    if (!container) return;

    container.innerHTML = '';
    const filteredTasks = (proj.tasks || []).filter(filterTask);

    if (filteredTasks.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px;">
          No se encontraron tareas con los filtros activos.
        </div>
      `;
      return;
    }

    const taskListWrap = document.createElement('div');
    taskListWrap.className = 'phase-task-list';
    taskListWrap.style.borderRadius = 'var(--radius-lg)';
    taskListWrap.style.overflow = 'hidden';
    taskListWrap.style.border = '1px solid var(--border-card)';

    filteredTasks.forEach(task => {
      const taskEl = createTaskElement(task, proj);
      taskListWrap.appendChild(taskEl);
    });

    container.appendChild(taskListWrap);
  }

  function createTaskElement(task, proj) {
    const taskItem = document.createElement('div');
    taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;
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
      <div class="task-item-main-row">
        <!-- Checkbox de estado con regla de 24h -->
        <div class="task-checkbox-wrap">
          <input type="checkbox" class="task-checkbox" id="chk-${task.id}" ${task.completed ? 'checked' : ''}>
        </div>

        <!-- Título, descripción, objetivo y chip de predecesora -->
        <div class="task-details" id="details-${task.id}">
          <div class="task-title">
            <span>${task.title}</span>
            ${predecessorHtml}
            ${objectiveHtml}
          </div>
          ${task.desc ? `<div class="task-desc">${task.desc}</div>` : ''}
        </div>

        <!-- Metadatos de la Tarea -->
        <div class="task-meta-group">
          <span class="priority-pill priority-${normPriority}" title="Prioridad Eisenhower: ${priorityLabel}">
            ${priorityLabel}
          </span>

          ${durationHtml}

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
          ` : ''}

          ${task.assignee ? `
            <div class="assignee-chip" title="${task.assignee}">
              <span class="assignee-mini-avatar">${getInitials(task.assignee)}</span>
              <span>${task.assignee.split('@')[0]}</span>
            </div>
          ` : ''}

          ${totalSubtasks > 0 ? `
            <button type="button" class="subtasks-pill ${doneSubtasks === totalSubtasks ? 'completed' : ''}" id="btn-toggle-subtasks-${task.id}" title="Ver checklist">
              <span>☑️ ${doneSubtasks}/${totalSubtasks}</span>
            </button>
          ` : ''}

          <div class="task-actions">
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

  // ─── Modal de Nuevo Proyecto ──────────────────────────────────
  function openProjectModal() {
    const modal = document.getElementById('modal-project');
    const form = document.getElementById('form-project');
    form.reset();
    modal.classList.add('open');
    document.getElementById('project-name-input').focus();
  }

  function closeProjectModal() {
    document.getElementById('modal-project').classList.remove('open');
  }

  function saveProjectFromModal(e) {
    e.preventDefault();
    const name = document.getElementById('project-name-input').value.trim();
    const desc = document.getElementById('project-desc-input').value.trim();
    const category = document.getElementById('project-category-select').value;
    const color = document.getElementById('project-color-input').value;

    if (!name) {
      showToast('Escribe un nombre para el proyecto', 'error');
      return;
    }

    const newProj = {
      id: 'proj-' + Date.now(),
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
        AppState.filters.assignee = e.target.value;
        renderMainView();
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
    document.getElementById('btn-open-new-project-modal').addEventListener('click', openProjectModal);
    document.getElementById('btn-close-project-modal').addEventListener('click', closeProjectModal);
    document.getElementById('btn-cancel-project-modal').addEventListener('click', closeProjectModal);
    document.getElementById('form-project').addEventListener('submit', saveProjectFromModal);

    // Botón Empty State
    document.getElementById('btn-empty-state-add-task').addEventListener('click', () => openTaskModal());

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

  function updateUserBadge() {
    const user = Auth.getUser();
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');

    if (user) {
      if (nameEl) nameEl.textContent = user.name || user.email;
      if (roleEl) roleEl.textContent = user.role || 'Miembro';
      if (avatarEl) avatarEl.textContent = getInitials(user.name || user.email);
    }
  }

  // ─── Arranque de la App ───────────────────────────────────────
  function initApp() {
    AppState.projects = Storage.loadProjects();
    AppState.activeProjectId = AppState.projects[0] ? AppState.projects[0].id : null;

    initEvents();

    const token = Auth.getToken();
    const authOverlay = document.getElementById('auth-login-overlay');

    if (!token) {
      authOverlay.classList.add('active');
    } else {
      updateUserBadge();
    }

    renderProjectsSidebar();
    renderMainView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
