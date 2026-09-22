# ============================================================
#  R.E.D. -- Script de arranque del servidor Django
#  Uso: .\start_server.ps1
#
#  El entorno virtual se crea en la carpeta LOCAL del usuario
#  ($env:USERPROFILE\.venvs\cntxt_red_venv) para evitar
#  conflictos de bloqueo de archivos con Google Drive.
# ============================================================

$VenvPath   = Join-Path $env:USERPROFILE ".venvs\cntxt_red_venv"
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   R.E.D. -- Servidor Django            " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[i] Venv local: $VenvPath" -ForegroundColor DarkGray
Write-Host ""

# -- 1. Verificar venv y Django -----------------------------------------------
$NeedsRebuild = $false

if (-not (Test-Path $VenvPython)) {
    Write-Host "[!] Entorno virtual no encontrado." -ForegroundColor Yellow
    $NeedsRebuild = $true
} else {
    $TestDjango = & $VenvPython -c "import django; print('ok')" 2>&1
    if ($LASTEXITCODE -ne 0 -or ($TestDjango -notmatch "ok")) {
        Write-Host "[!] Django no responde correctamente. Reconstruyendo..." -ForegroundColor Yellow
        $NeedsRebuild = $true
    }
}

# -- 2. Crear venv y dependencias si es necesario -----------------------------
if ($NeedsRebuild) {
    Write-Host "[*] Creando entorno virtual local fuera de Google Drive..." -ForegroundColor Gray

    # Crear carpeta padre si no existe
    $VenvParent = Split-Path -Parent $VenvPath
    if (-not (Test-Path $VenvParent)) {
        New-Item -ItemType Directory -Path $VenvParent -Force | Out-Null
    }

    # Eliminar venv roto si existia
    if (Test-Path $VenvPath) {
        Write-Host "[*] Eliminando venv anterior..." -ForegroundColor Gray
        cmd /c rd /s /q "$VenvPath" 2>$null
    }

    # Crear nuevo venv
    python -m venv "$VenvPath"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] No se pudo crear el venv. Verifica que Python este instalado." -ForegroundColor Red
        exit 1
    }

    # Instalar dependencias
    Write-Host "[*] Instalando dependencias desde requirements.txt..." -ForegroundColor Gray
    & "$VenvPath\Scripts\python.exe" -m pip install -r "$PSScriptRoot\requirements.txt" --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la instalacion de dependencias." -ForegroundColor Red
        exit 1
    }

    Write-Host "[OK] Entorno virtual listo." -ForegroundColor Green
}

# -- 3. Validacion final -------------------------------------------------------
$DjangoVersion = & $VenvPython -m django --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Django no esta disponible en el venv." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Python : $(& $VenvPython --version)" -ForegroundColor Green
Write-Host "[OK] Django : $DjangoVersion"             -ForegroundColor Green
Write-Host ""

# -- 4. Iniciar servidor -------------------------------------------------------
Write-Host "Iniciando servidor en http://127.0.0.1:8000/" -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener." -ForegroundColor DarkGray
Write-Host ""

& "$VenvPath\Scripts\python.exe" "$PSScriptRoot\manage.py" runserver
