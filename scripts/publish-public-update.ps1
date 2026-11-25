$ErrorActionPreference = 'Stop'
$destination = 'ENG-mohammed-fares/AgentOffice-Releases'
$source = 'ENG-mohammed-fares/AgentOffice'
if ($env:GITHUB_REPOSITORY -ne $source -or $env:GITHUB_REF -ne 'refs/heads/development') { throw 'Unexpected release source.' }
if ([string]::IsNullOrWhiteSpace($env:RELEASE_TOKEN)) { throw 'Configure the public distribution repository token.' }
$version = $env:EXPECTED_VERSION
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version.' }
$tag = "v$version"
$exe = "AgentOffice-Setup-$version-x64.exe"
$names = @($exe, "$exe.blockmap", 'latest.yml')
$manifest = Get-Content candidate/manifest.json -Raw | ConvertFrom-Json
if ($manifest.commit -ne $env:GITHUB_SHA -or $manifest.version -ne $version -or "$($manifest.run_id)" -ne $env:EXPECTED_RUN_ID -or $manifest.ref -ne 'refs/heads/development' -or $manifest.locked -ne $true) { throw 'Candidate manifest mismatch.' }
foreach ($name in $names) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath "candidate/$name").Hash.ToLowerInvariant()
    if ($hash -ne $manifest.sha256.PSObject.Properties[$name].Value) { throw "Candidate hash mismatch: $name" }
}
. (Join-Path $PSScriptRoot 'verify-code-signing.ps1')
Assert-AgentOfficeSignedFile -Path "candidate/$exe" -ExpectedPublisher $env:AGENTOFFICE_SIGNING_PUBLISHER -ExpectedThumbprint $env:AGENTOFFICE_SIGNING_THUMBPRINT

function Assert-SourceHead {
    $env:GH_TOKEN = $env:SOURCE_TOKEN
    try {
        $head = gh api "repos/$source/git/ref/heads/development" --jq '.object.sha'
        if ($LASTEXITCODE -ne 0 -or $head -ne $env:GITHUB_SHA) { throw 'Source changed; build a new candidate.' }
        $latest = gh api "repos/$source/releases/latest" | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $latest.tag_name -notmatch '^v\d+\.\d+\.\d+$' -or [version]$version -le [version]($latest.tag_name.Substring(1))) { throw 'Version must exceed the legacy private stable release.' }
    } finally { $env:GH_TOKEN = $env:RELEASE_TOKEN }
}
function Assert-PublicVersion {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$destination/releases/latest" -SkipHttpErrorCheck -StatusCodeVariable status
    if ($status -eq 200) {
        if ($response.tag_name -notmatch '^v\d+\.\d+\.\d+$' -or [version]$version -le [version]($response.tag_name.Substring(1))) { throw 'Version must exceed the public stable release.' }
    } elseif ($status -ne 404) { throw "Cannot verify public stable version: HTTP $status" }
}
$env:GH_TOKEN = $env:RELEASE_TOKEN
Assert-SourceHead
$repo = Invoke-RestMethod -Uri "https://api.github.com/repos/$destination"
if ($repo.full_name -ne $destination -or $repo.private -ne $false -or $repo.default_branch -ne 'main') { throw 'Expected a separate public distribution repository initialized on main.' }
$target = gh api "repos/$destination/git/ref/heads/main" --jq '.object.sha'
if ($LASTEXITCODE -ne 0 -or $target -notmatch '^[0-9a-f]{40}$') { throw 'Missing distribution repository initial commit.' }
Assert-PublicVersion
gh release view $tag --repo $destination *> $null
if ($LASTEXITCODE -eq 0) { throw 'Existing release or draft: never overwrite.' }
$files = @($names | ForEach-Object { "candidate/$_" })
gh release create $tag @files --repo $destination --target $target --title "AgentOffice $version" --notes "Official AgentOffice Windows installer and update metadata." --draft
if ($LASTEXITCODE -ne 0) { throw 'Distribution draft creation failed.' }
$draft = gh release view $tag --repo $destination --json isDraft,assets,tagName | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $draft.isDraft -or $draft.tagName -ne $tag -or $draft.assets.Count -ne 3) { throw 'Distribution draft validation failed.' }
$tmp = Join-Path $env:RUNNER_TEMP ('agentoffice-dist-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    gh release download $tag --repo $destination --dir $tmp
    if ($LASTEXITCODE -ne 0) { throw 'Cannot verify uploaded draft bytes.' }
    foreach ($name in $names) {
        $asset = @($draft.assets | Where-Object { $_.name -eq $name })
        if ($asset.Count -ne 1 -or $asset[0].size -ne (Get-Item "candidate/$name").Length) { throw "Unexpected draft asset: $name" }
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $tmp $name)).Hash.ToLowerInvariant() -ne $manifest.sha256.PSObject.Properties[$name].Value) { throw "Uploaded hash mismatch: $name" }
    }
    Assert-SourceHead
    Assert-PublicVersion
    gh release edit $tag --repo $destination --draft=false --latest
    if ($LASTEXITCODE -ne 0) { throw 'Public release publication failed.' }
    $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$destination/releases/latest"
    if ($latest.tag_name -ne $tag -or $latest.draft -or $latest.prerelease) { throw 'Public release verification failed.' }
    foreach ($name in $names) {
        if (@($latest.assets | Where-Object { $_.name -eq $name -and $_.browser_download_url -like "https://github.com/$destination/releases/download/$tag/*" }).Count -ne 1) { throw "Public asset missing: $name" }
    }
    Write-Host "Verified public distribution release: $($latest.html_url)"
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force }
