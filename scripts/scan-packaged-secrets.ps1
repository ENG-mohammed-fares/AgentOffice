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
    # Scan ASAR entries in their decoded, named form above rather than
    # scanning the same container as an opaque binary without file context.
    # Every other resource, including app.asar.unpacked, stays in scope.
    $loose = Join-Path $workspace 'loose-resources'
    New-Item -ItemType Directory -Path $loose | Out-Null
    foreach ($resource in Get-ChildItem -LiteralPath $resources -Force) {
        if ($resource.FullName -eq $asar) { continue }
        Copy-Item -LiteralPath $resource.FullName -Destination $loose -Recurse -Force
    }
    if (Test-Path -LiteralPath (Join-Path $loose 'app.asar')) { throw 'Unexpected duplicate ASAR in loose resource scan.' }
    $scanFailed = $false
    $targets = [ordered]@{
        'extracted-asar' = $extracted
        'loose-resources' = $loose
        'vite-output' = (Join-Path $root 'app/dist')
    }
    foreach ($label in $targets.Keys) {
        $target = $targets[$label]
        $report = Join-Path $workspace "$label.json"
        Write-Host "Scanning $label"
        Push-Location $target
        try {
            & $gitleaks dir --config $config --redact=100 --no-banner --max-archive-depth=2 --max-decode-depth=1 --timeout=180 --report-format=json --report-path $report .
            $scanStatus = $LASTEXITCODE
            if (Test-Path -LiteralPath $report) {
                $findings = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
                foreach ($finding in $findings) {
                    if ($null -eq $finding) { continue }
                    [ordered]@{
                        scope = $label
                        rule = $finding.RuleID
                        file = $finding.File
                        line = $finding.StartLine
                    } | ConvertTo-Json -Compress | Write-Host
                }
                Remove-Item -LiteralPath $report -Force
            }
            if ($scanStatus -ne 0) {
                $scanFailed = $true
                Write-Host "Scan failed: $label (exit $scanStatus)"
            }
        } finally { Pop-Location }
    }
    if ($scanFailed) { throw 'Packaged secret scan failed; investigate redacted finding metadata.' }
    Write-Host 'Packaged app.asar, loose resources and Vite output passed secret scanning.'
} finally { Remove-Item -LiteralPath $workspace -Recurse -Force }
