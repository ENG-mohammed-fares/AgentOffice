$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'verify-code-signing.ps1')
$destination = 'ENG-mohammed-fares/AgentOffice'
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

# A hash proves candidate identity, not publisher trust. Refuse unsigned or untrusted installers before any release API call.
Assert-AgentOfficeSignedFile -Path "candidate/$exe" -ExpectedPublisher $env:AGENTOFFICE_SIGNING_PUBLISHER -ExpectedThumbprint $env:AGENTOFFICE_SIGNING_THUMBPRINT

function Assert-SourceHead {
    $env:GH_TOKEN = $env:SOURCE_TOKEN
    try {
        $head = gh api "repos/$source/git/ref/heads/development" --jq '.object.sha'
        if ($LASTEXITCODE -ne 0 -or $head -ne $env:GITHUB_SHA) { throw 'Source changed; build a new candidate.' }
        $latest = gh api "repos/$source/releases/latest" | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $latest.tag_name -notmatch '^v\d+\.\d+\.\d+$' -or [version]$version -le [version]($latest.tag_name.Substring(1))) { throw 'Version must exceed the current stable release.' }
    } finally { $env:GH_TOKEN = $env:RELEASE_TOKEN }
}
function Get-PublicReleaseResponse {
    # Return status and parsed metadata together rather than using caller-scoped variables.
    $result = Invoke-WebRequest -Uri "https://api.github.com/repos/$destination/releases/latest" -Headers @{'Cache-Control'='no-cache'} -TimeoutSec 15 -SkipHttpErrorCheck
    $metadata = $null
    if ($result.StatusCode -eq 200) { $metadata = $result.Content | ConvertFrom-Json }
    return @{StatusCode=[int]$result.StatusCode; Metadata=$metadata}
}
function Assert-PublicVersion {
    $public = Get-PublicReleaseResponse
    $status = $public.StatusCode
    $response = $public.Metadata
    if ($status -eq 200) {
        if ($response.tag_name -notmatch '^v\d+\.\d+\.\d+$' -or [version]$version -le [version]($response.tag_name.Substring(1))) { throw 'Version must exceed the public stable release.' }
    } elseif ($status -ne 404) { throw "Cannot verify public stable version: HTTP $status" }
}
$env:GH_TOKEN = $env:RELEASE_TOKEN
Assert-SourceHead
$repo = Invoke-RestMethod -Uri "https://api.github.com/repos/$destination"
if ($repo.full_name -ne $destination -or $repo.private -ne $false) { throw 'Expected the public AgentOffice source repository.' }
$target = $env:GITHUB_SHA
Assert-PublicVersion
gh release view $tag --repo $destination *> $null
if ($LASTEXITCODE -eq 0) { throw 'Existing release or draft: never overwrite.' }
$files = @($names | ForEach-Object { "candidate/$_" })
gh release create $tag @files --repo $destination --target $target --title "AgentOffice $version" --notes "Official AgentOffice Windows installer (code signing not required) and update metadata. Windows may display an unknown publisher warning." --draft
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
    # The unauthenticated latest-release endpoint can lag after a draft is
    # published. Retry verification only, never creation or publication.
    $verified = $false
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $public = Get-PublicReleaseResponse
        $latest = $public.Metadata
        if ($public.StatusCode -eq 200 -and $latest.tag_name -eq $tag -and -not $latest.draft -and -not $latest.prerelease) {
            $missing = @($names | Where-Object {
                $name = $_
                @($latest.assets | Where-Object { $_.name -eq $name -and $_.browser_download_url -eq "https://github.com/$destination/releases/download/$tag/$name" -and $_.size -eq (Get-Item -LiteralPath "candidate/$name").Length }).Count -ne 1
            })
            if ($missing.Count -eq 0 -and $latest.assets.Count -eq $names.Count) {
                $verified = $true
                break
            }
        }
        if ($attempt -lt 11) { Start-Sleep -Seconds 5 }
    }
    if (-not $verified) { throw 'Public release verification failed after bounded retries; inspect existing release before retrying publication.' }
    Write-Host "Verified public distribution release: $($latest.html_url)"
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force }
