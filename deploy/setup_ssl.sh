#!/bin/bash
# ═════════════════════════════════════════════════════════════════════════════
# CNTXT | R.E.D. SYSTEM — CONFIGURACIÓN SSL & DOMINIO (centralcntxt.tech)
# Sistema Operativo: Ubuntu 22.04 / 24.04 LTS (Hostinger VPS)
# Ejecución: sudo bash /var/www/cntxt/deploy/setup_ssl.sh
# ═════════════════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN_PRIMARY="centralcntxt.tech"
DOMAIN_WWW="www.centralcntxt.tech"
EMAIL_ADMIN="admin@centralcntxt.tech"

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}  Configurando Dominio & SSL: ${DOMAIN_PRIMARY}        ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Comprobar permisos de root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Este script debe ejecutarse como root o con sudo.${NC}"
  exit 1
fi

# 2. Actualizar configuración de Nginx con el nombre de dominio
echo -e "\n${YELLOW}[1/4] Actualizando configuración de Nginx para ${DOMAIN_PRIMARY}...${NC}"
cp /var/www/cntxt/deploy/nginx_cntxt.conf /etc/nginx/sites-available/cntxt.conf
ln -sf /etc/nginx/sites-available/cntxt.conf /etc/nginx/sites-enabled/cntxt.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# 3. Instalar Certbot para Nginx si no está presente
echo -e "\n${YELLOW}[2/4] Verificando e instalando Certbot...${NC}"
apt-get update -y
apt-get install -y certbot python3-certbot-nginx

# 4. Obtener y configurar certificado SSL gratuito con Let's Encrypt
echo -e "\n${YELLOW}[3/4] Solicitando certificado SSL con Certbot para ${DOMAIN_PRIMARY} y ${DOMAIN_WWW}...${NC}"

certbot --nginx \
  -d "${DOMAIN_PRIMARY}" \
  -d "${DOMAIN_WWW}" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --redirect

# 5. Reiniciar y verificar servicios
echo -e "\n${YELLOW}[4/4] Recargando Nginx y verificando auto-renovación de SSL...${NC}"
systemctl reload nginx
systemctl restart cntxt.service

# Simular renovación para garantizar que funciona el cron/timer
certbot renew --dry-run

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}  ¡DOMINIO Y CERTIFICADO SSL CONFIGURADOS CON ÉXITO!   ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "${CYAN}Tu sistema ya es accesible de forma segura en:${NC}"
echo -e "  👉 https://${DOMAIN_PRIMARY}"
echo -e "  👉 https://${DOMAIN_WWW}\n"
