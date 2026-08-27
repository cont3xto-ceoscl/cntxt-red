# embed_contacts.ps1
# Generates contacts_data.js embedding the processed CSV for instant offline loading

$csvPath = "c:\CNTXT Antigravity\R.E.D\Contactos_Procesados_CNTXT.csv"
$jsOutputPath = "c:\CNTXT Antigravity\R.E.D\contacts_data.js"

Write-Host "Reading CSV file..."
$csvContent = [System.IO.File]::ReadAllText($csvPath, [System.Text.Encoding]::UTF8)

# Escape backslashes and double quotes for JS string literal
$escapedCsv = $csvContent -replace '\\', '\\' -replace '"', '\"' -replace '\r?\n', "\n"

$jsContent = "window.CNTXT_CONTACTS_CSV = `"$escapedCsv`";`n"

Write-Host "Saving embedded contacts JS..."
[System.IO.File]::WriteAllText($jsOutputPath, $jsContent, [System.Text.Encoding]::UTF8)
Write-Host "Done! contacts_data.js created successfully."
