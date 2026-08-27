# convert_contacts.ps1
# Script to convert Google Contacts HTML export to modelo-contatos.csv format

$htmlPath = "c:\CNTXT Antigravity\R.E.D\Contactos CNTXT_21.07.26_archivos\sheet001.htm"
$outputPath = "c:\CNTXT Antigravity\R.E.D\Contactos_Procesados_CNTXT.csv"

Write-Host "Reading HTML file..."
$rawHtml = [System.IO.File]::ReadAllText($htmlPath, [System.Text.Encoding]::GetEncoding("windows-1252"))

# Function to clean text
function Clean-Text($text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }
    # Remove HTML tags
    $clean = [System.Text.RegularExpressions.Regex]::Replace($text, '(?s)<[^>]+>', '')
    # Decode HTML entities
    $clean = [System.Net.WebUtility]::HtmlDecode($clean)
    # Replace newlines and extra spaces
    $clean = $clean -replace '[\r\n]+', ' ' -replace '\s+', ' '
    return $clean.Trim()
}

# Function to normalize phone numbers
function Normalize-Phone($phRaw) {
    if ([string]::IsNullOrWhiteSpace($phRaw)) { return "" }
    $cleanRaw = Clean-Text $phRaw
    if ([string]::IsNullOrWhiteSpace($cleanRaw)) { return "" }
    
    # If multiple numbers separated by ::: or commas/semicolons, take the first non-empty phone
    $firstPh = ($cleanRaw -split ':::|::|,|;|\n')[0].Trim()
    
    $hasPlus = $firstPh.StartsWith("+")
    $digits = $firstPh -replace '[^\d]', ''
    
    if ($digits.Length -eq 0) { return "" }
    
    if ($hasPlus) {
        return $digits
    }
    
    # Handle numbers without leading +
    if ($digits.StartsWith("00")) {
        $digits = $digits.Substring(2)
    }
    
    # If 10 digits starting with 3 (Colombian mobile) or 6 (Colombian landline area code 60x)
    if ($digits.Length -eq 10 -and ($digits.StartsWith("3") -or $digits.StartsWith("6"))) {
        return "57" + $digits
    }
    
    # If 7 digits (local number)
    if ($digits.Length -eq 7) {
        return "57" + $digits
    }

    return $digits
}

# Parse TR rows
Write-Host "Parsing contacts table..."
$trMatches = [regex]::Matches($rawHtml, '(?s)<tr[^>]*>(.*?)</tr>')

$rowsOutput = @()
$totalContactsProcessed = 0

# CSV Header
$headerRow = "nome;numero;email;cpf;dataNascimento;primeiroNome;ultimoNome;Empresa"
$rowsOutput += $headerRow

for ($i = 1; $i -lt $trMatches.Count; $i++) {
    $tr = $trMatches[$i].Groups[1].Value
    $tdMatches = [regex]::Matches($tr, '(?s)<td[^>]*>(.*?)</td>')
    
    $cols = @()
    foreach ($td in $tdMatches) {
        $cols += Clean-Text $td.Groups[1].Value
    }
    
    if ($cols.Count -lt 15) { continue }
    
    $firstName  = if ($cols.Count -gt 0)  { $cols[0] } else { "" }
    $middleName = if ($cols.Count -gt 1)  { $cols[1] } else { "" }
    $lastName   = if ($cols.Count -gt 2)  { $cols[2] } else { "" }
    $nickname   = if ($cols.Count -gt 8)  { $cols[8] } else { "" }
    $fileAs     = if ($cols.Count -gt 9)  { $cols[9] } else { "" }
    $orgName    = if ($cols.Count -gt 10) { $cols[10] } else { "" }
    $birthday   = if ($cols.Count -gt 13) { $cols[13] } else { "" }
    $email1     = if ($cols.Count -gt 18) { $cols[18] } else { "" }
    $email2     = if ($cols.Count -gt 20) { $cols[20] } else { "" }
    $phone1     = if ($cols.Count -gt 22) { $cols[22] } else { "" }
    $phone2     = if ($cols.Count -gt 24) { $cols[24] } else { "" }
    $phone3     = if ($cols.Count -gt 26) { $cols[26] } else { "" }

    # Determine email
    $email = if ($email1) { $email1 } else { $email2 }

    # Determine phone
    $phoneRaw = if ($phone1) { $phone1 } else { if ($phone2) { $phone2 } else { $phone3 } }
    $numero = Normalize-Phone $phoneRaw

    # Determine primeironome & ultimonome
    $primeiroNome = $firstName
    $ultimoNome = if ($middleName -and $lastName) { "$middleName $lastName" } else { if ($lastName) { $lastName } else { $middleName } }

    # Determine nome (Full Name)
    $nameParts = @($firstName, $middleName, $lastName) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $fullName = $nameParts -join " "

    if ([string]::IsNullOrWhiteSpace($fullName)) {
        if (-not [string]::IsNullOrWhiteSpace($fileAs)) {
            $fullName = $fileAs
        } elseif (-not [string]::IsNullOrWhiteSpace($nickname)) {
            $fullName = $nickname
        } elseif (-not [string]::IsNullOrWhiteSpace($orgName)) {
            $fullName = $orgName
        } elseif (-not [string]::IsNullOrWhiteSpace($email)) {
            $fullName = $email
        } else {
            $fullName = "Contacto Sin Nombre"
        }
    }

    $empresa = $orgName
    $cpf = ""
    $dataNascimento = $birthday

    # Format CSV fields with semicolon separator
    $csvCols = @($fullName, $numero, $email, $cpf, $dataNascimento, $primeiroNome, $ultimoNome, $empresa) | ForEach-Object {
        $val = $_ -replace ';', ' '
        $val = $val -replace '"', '""'
        if ($val -match '[\s;,"]') {
            "`"$val`""
        } else {
            $val
        }
    }

    $rowsOutput += ($csvCols -join ";")
    $totalContactsProcessed++
}

Write-Host "Saving $totalContactsProcessed contacts to $outputPath with UTF-8 BOM encoding..."
$utf8WithBom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllLines($outputPath, $rowsOutput, $utf8WithBom)
Write-Host "Done successfully!"
