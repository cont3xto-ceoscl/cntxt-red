# start_server.ps1 - Servidor Local R.E.D. con Persistencia en Disco
$port = 8085
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "No se pudo iniciar el listener en el puerto $port." -ForegroundColor Yellow
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$baseDir = Get-Location
$storageFile = Join-Path $baseDir "data_storage.json"

Write-Host "=================================================================" -ForegroundColor DarkRed
Write-Host " CNTXT | R.E.D. SYSTEM - SERVIDOR LOCAL PERSISTENTE" -ForegroundColor Red
Write-Host "=================================================================" -ForegroundColor DarkRed
Write-Host "  Portal URL:          http://localhost:$port/" -ForegroundColor Cyan
Write-Host "  Archivo en Disco:    $storageFile" -ForegroundColor Yellow
Write-Host "  API de Persistencia: POST/GET /api/save-data | /api/load-data" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor DarkRed
Write-Host "Presiona Ctrl+C en esta consola para detener el servidor.`n" -ForegroundColor Gray

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Encabezados CORS universales
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Close()
            continue
        }

        $localPath = $request.Url.LocalPath

        # API ENDPOINT: CARGAR DATOS PERSISTIDOS
        if ($localPath -eq "/api/load-data" -or $localPath -eq "/api/load-data/") {
            $response.ContentType = "application/json; charset=utf-8"
            if (Test-Path $storageFile) {
                $content = [System.IO.File]::ReadAllText($storageFile, [System.Text.Encoding]::UTF8)
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
            } else {
                $emptyJson = '{"status":"empty","custom_contacts":[],"edits":{},"notes":{},"tags":{},"pulses":{},"phases":{},"channels":{},"personas":{},"master_empresas":[],"projects":[],"slack":{}}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($emptyJson)
            }
            $response.StatusCode = 200
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }

        # API ENDPOINT: GUARDAR DATOS EN DISCO
        if ($localPath -eq "/api/save-data" -or $localPath -eq "/api/save-data/") {
            $response.ContentType = "application/json; charset=utf-8"
            if ($request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    if (-not [string]::IsNullOrWhiteSpace($body)) {
                        [System.IO.File]::WriteAllText($storageFile, $body, [System.Text.Encoding]::UTF8)
                        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                        $byteCount = $body.Length
                        Write-Host "[$timestamp] Datos guardados en disco exitosamente ($byteCount caracteres)." -ForegroundColor DarkGreen
                        $resJson = '{"success":true,"message":"Datos sincronizados en disco","timestamp":"' + $timestamp + '"}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.StatusCode = 200
                    } else {
                        $resJson = '{"success":false,"error":"Cuerpo de solicitud vacio"}'
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                        $response.StatusCode = 400
                    }
                } catch {
                    $err = $_.Exception.Message.Replace('"', '\"')
                    $resJson = '{"success":false,"error":"' + $err + '"}'
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                    $response.StatusCode = 500
                }
            } else {
                $resJson = '{"success":false,"error":"Metodo no permitido. Use POST."}'
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($resJson)
                $response.StatusCode = 405
            }
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }

        # ARCHIVOS ESTATICOS
        if ($localPath -eq "/") { $localPath = "/index.html" }
        $filePath = Join-Path $baseDir $localPath.TrimStart('/')

        if (Test-Path $filePath -PathType Leaf) {
            try {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                switch ($ext) {
                    ".html" { $response.ContentType = "text/html; charset=utf-8" }
                    ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                    ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                    ".json" { $response.ContentType = "application/json; charset=utf-8" }
                    ".csv"  { $response.ContentType = "text/csv; charset=utf-8" }
                    ".png"  { $response.ContentType = "image/png" }
                    ".jpg"  { $response.ContentType = "image/jpeg" }
                    ".jpeg" { $response.ContentType = "image/jpeg" }
                    ".mp4"  { $response.ContentType = "video/mp4" }
                    ".svg"  { $response.ContentType = "image/svg+xml" }
                    ".ico"  { $response.ContentType = "image/x-icon" }
                    default { $response.ContentType = "application/octet-stream" }
                }

                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.StatusCode = 200
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {
                $response.StatusCode = 500
            }
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        Write-Host "Aviso de servidor: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}
