#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════════
# CNTXT | R.E.D. SYSTEM — SCRIPT DE INSTALACIÓN Y DESPLIEGUE AUTOMATIZADO VPS
# Sistema Operativo: Ubuntu 22.04 / 24.04 LTS (Hostinger VPS)
# Ejecución: sudo bash deploy/setup_vps.sh
# ═════════════════════════════════════════════════════════════════════════════

set -e

# Colores para salida de terminal
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="/var/www/cntxt"
VENV_DIR="${PROJECT_DIR}/venv"

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}  Iniciando despliegue automatizado: CNTXT R.E.D.     ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Comprobar permisos de superusuario
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Este script debe ejecutarse como root o con sudo.${NC}"
  exit 1
fi

# 2. Actualizar repositorios e instalar paquetes del sistema
echo -e "\n${YELLOW}[1/6] Actualizando repositorios e instalando paquetes...${NC}"
apt-get update -y
apt-get install -y python3 python3-pip python3-venv nginx git curl ufw

# 3. Preparar directorio del proyecto si no existe
echo -e "\n${YELLOW}[2/6] Verificando directorio del proyecto en ${PROJECT_DIR}...${NC}"
if [ ! -d "${PROJECT_DIR}" ]; then
  echo -e "${CYAN}Creando directorio ${PROJECT_DIR}...${NC}"
  mkdir -p "${PROJECT_DIR}"
  # Si el script se ejecuta desde una copia local del repositorio, copiar contenido
  if [ -f "./manage.py" ]; then
    cp -r ./* "${PROJECT_DIR}/"
  fi
fi

cd "${PROJECT_DIR}"

# 4. Configurar Entorno Virtual de Python y Dependencias
echo -e "\n${YELLOW}[3/6] Configurando entorno virtual Python e instalando librerías...${NC}"
if [ ! -d "${VENV_DIR}" ]; then
  python3 -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/pip" install --upgrade pip setuptools wheel
"${VENV_DIR}/bin/pip" install -r "${PROJECT_DIR}/requirements.txt"

# 5. Ejecutar Migraciones y Archivos Estáticos de Django
echo -e "\n${YELLOW}[4/6] Ejecutando migraciones y collectstatic de Django...${NC}"
"${VENV_DIR}/bin/python" "${PROJECT_DIR}/manage.py" migrate --noinput
"${VENV_DIR}/bin/python" "${PROJECT_DIR}/manage.py" collectstatic --noinput

# 6. Ajustar permisos de usuario para el servidor web (www-data)
echo -e "\n${YELLOW}[5/6] Ajustando permisos de archivos para www-data...${NC}"
chown -R www-data:www-data "${PROJECT_DIR}"
chmod -R 755 "${PROJECT_DIR}"
# Asegurar permisos de escritura para la base de datos sqlite3 si aplica
if [ -f "${PROJECT_DIR}/db.sqlite3" ]; then
  chmod 664 "${PROJECT_DIR}/db.sqlite3"
fi

# 7. Configurar Servicios de Gunicorn y Nginx
echo -e "\n${YELLOW}[6/6] Configurando Systemd (Gunicorn) y Nginx...${NC}"

# Copiar servicio Systemd
cp "${PROJECT_DIR}/deploy/cntxt.service" /etc/systemd/system/cntxt.service
systemctl daemon-reload
systemctl enable cntxt.service
systemctl restart cntxt.service

# Copiar configuración Nginx
cp "${PROJECT_DIR}/deploy/nginx_cntxt.conf" /etc/nginx/sites-available/cntxt.conf
ln -sf /etc/nginx/sites-available/cntxt.conf /etc/nginx/sites-enabled/cntxt.conf

# Desactivar sitio por defecto de Nginx si existe
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

# Validar sintaxis de Nginx y reiniciar
nginx -t
systemctl enable nginx
systemctl restart nginx

# Configurar firewall básico si UFW está habilitado
if ufw status | grep -q "Status: active"; then
  echo -e "${CYAN}Permitiendo tráfico HTTP/HTTPS en UFW...${NC}"
  ufw allow 'Nginx Full'
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}  ¡DESPLIEGUE COMPLETADO CON ÉXITO!                   ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Estado de Gunicorn:"
systemctl status cntxt.service --no-pager -l || true
echo -e "\nEstado de Nginx:"
systemctl status nginx --no-pager -l || true
echo -e "\n${CYAN}Tu sistema CNTXT R.E.D. ya está operando en el puerto 80 del VPS.${NC}"
