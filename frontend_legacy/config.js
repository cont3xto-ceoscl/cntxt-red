/**
 * CNTXT | R.E.D. System - Archivo de Configuración Centralizada
 * 
 * Configuración de conexión al backend Django 5.1 & PostgreSQL / SQLite
 */

window.CNTXT_CONFIG = {
  // Versión del esquema de configuración
  VERSION: '2.0.26',

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
