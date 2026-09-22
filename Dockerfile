# Dockerfile para CNTXT R.E.D. — EasyPanel Deployment
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Instalar dependencias del sistema mínimas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias Python
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación
COPY . /app/

# Dar permisos de ejecución al script de arranque
RUN chmod +x /app/docker-entrypoint.sh

# Puerto expuesto
EXPOSE 8000

# Punto de entrada
ENTRYPOINT ["/app/docker-entrypoint.sh"]
