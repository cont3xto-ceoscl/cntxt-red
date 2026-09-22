#!/bin/bash
set -e

echo "==> Aplicando migraciones de base de datos..."
python manage.py migrate --noinput

echo "==> Inicializando usuarios base del sistema..."
python manage.py seed_usuarios

echo "==> Cargando contactos y datos iniciales en la base de datos..."
python manage.py migrar_datos || true

echo "==> Recolectando archivos estáticos..."
python manage.py collectstatic --noinput

echo "==> Iniciando Gunicorn en el puerto ${PORT:-8000}..."
exec gunicorn cntxt_system.wsgi:application \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers ${GUNICORN_WORKERS:-3} \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
