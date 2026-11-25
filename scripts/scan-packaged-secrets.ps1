$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$workspace = Join-Path $env:RUNNER_TEMP ("ao-package-scan-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $workspace | Out-Null
try {
    $zip = Join-Path $workspace 'gitleaks.zip'
    Invoke-WebRequest -Uri 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_windows_x64.zip' -OutFile $zip
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant() -ne 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e') { throw 'Gitleaks checksum mismatch.' }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $workspace 'cli')
    $gitleaks = Join-Path $workspace 'cli/gitleaks.exe'
    $resources = Join-Path $root 'app/release/win-unpacked/resources'
    $asar = Join-Path $resources 'app.asar'
    $extracted = Join-Path $workspace 'extracted'
    Push-Location (Join-Path $root 'app')
    try {
        node -e "require('@electron/asar').extractAll(process.argv[1], process.argv[2])" $asar $extracted
        if ($LASTEXITCODE -ne 0) { throw 'Cannot extract packaged app.asar.' }
    } finally { Pop-Location }
    if (!(Test-Path (Join-Path $extracted 'electron/main.cjs')) -or !(Test-Path (Join-Path $extracted 'dist/index.html'))) { throw 'Packaged source inventory incomplete.' }
    $config = Join-Path $root '.github/security/gitleaks.toml'
    foreach ($target in @($extracted,$resources,(Join-Path $root 'app/dist'))) {
        Push-Location $target
        try {
            & $gitleaks dir --config $config --redact=100 --no-banner --max-archive-depth=2 --max-decode-depth=1 --timeout=180 .
            if ($LASTEXITCODE -ne 0) { throw 'Packaged secret scan failed; investigate redacted findings.' }
        } finally { Pop-Location }
    }
    Write-Host 'Packaged app.asar, loose resources and Vite output passed secret scanning.'
} finally { Remove-Item -LiteralPath $workspace -Recurse -Force }
