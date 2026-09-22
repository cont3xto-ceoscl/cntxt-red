/**
 * CNTXT | R.E.D. System - Archivo de Configuración Centralizada
 * 
 * Configuración de conexión al backend Django 5.1 & PostgreSQL / SQLite
 */

window.CNTXT_CONFIG = {
  // Versión del esquema de configuración
  VERSION: '2.1.0',

  // Configuración de sincronización y API Django Backend
  SYNC: {
    ENABLED: true,
    
    // URL base dinámica del backend Django
    API_BASE_URL: (typeof window !== 'undefined' && (window.location.origin.includes('127.0.0.1') || window.location.origin.includes('localhost')))
      ? 'http://127.0.0.1:8000/api'
      : '/api',
    
    // URL alternativa de respaldo
    FALLBACK_API_URL: 'http://localhost:8000/api',
    
    // Intervalo de sincronización periódica en segundo plano (en milisegundos)
    AUTO_SYNC_INTERVAL_MS: 30000,
    
    // Retardo para agrupar cambios (Debounce)
    DEBOUNCE_SAVE_MS: 800
  },

  // ─── Autenticación JWT ───────────────────────────────────
  AUTH: {
    // Endpoints (relativos a API_BASE_URL)
    LOGIN_ENDPOINT:   '/auth/login/',
    LOGOUT_ENDPOINT:  '/auth/logout/',
    REFRESH_ENDPOINT: '/auth/refresh/',
    ME_ENDPOINT:      '/auth/me/',

    // Claves en localStorage
    ACCESS_TOKEN_KEY:  'cntxt_access_token',
    REFRESH_TOKEN_KEY: 'cntxt_refresh_token',
    USER_KEY:          'cntxt_user_data',

    // Margen para refrescar token (5 minutos antes de expirar)
    REFRESH_MARGIN_MS: 5 * 60 * 1000,
  },

  // Configuración de Slack para el espacio de trabajo CNTXT
  SLACK: {
    DEFAULT_WEBHOOK_URL: '',
    DEFAULT_CHANNEL_NAME: '#notificaciones-red',
    BOT_ICON: '🩸',
    BOT_NAME: 'R.E.D. Bot | CNTXT®'
  },

  // Metadatos de la empresa y sistema
  ORGANIZATION: {
    NAME: 'CNTXT',
    SYSTEM: 'R.E.D. System',
    YEAR: 2026
  }
};

