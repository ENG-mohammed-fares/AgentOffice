# The existing real Windows tests and real packaged scan run under Pester.
# Publication tests below use only local fixtures and fake credentials; no
# actual network call, real signing identity or release is permitted.
BeforeAll {
    $script:root = Split-Path -Parent $PSScriptRoot
}
Describe 'Authenticode production policy' {
    It 'runs the existing Windows policy and signature tests' {
        & (Join-Path $PSScriptRoot 'test-code-signing.ps1')
    }
    It 'rejects a directory and a real unsigned executable' {
        . (Join-Path $PSScriptRoot 'verify-code-signing.ps1')
        $file = Join-Path $TestDrive 'unsigned.exe'
        [IO.File]::WriteAllBytes($file, [byte[]](1,2,3,4))
        { Assert-AgentOfficeSignedFile -Path $TestDrive -ExpectedPublisher 'CN=Fixture' } | Should -Throw '*Expected a Windows executable*'
        { Assert-AgentOfficeSignedFile -Path $file -ExpectedPublisher 'CN=Fixture' } | Should -Throw
        $cert = [pscustomobject]@{ Subject='CN=Fixture'; Thumbprint=('a'*40) }
        $signature = [pscustomobject]@{ Status='Valid'; SignatureType='Authenticode'; SignerCertificate=$null; TimeStamperCertificate=$cert }
        { Assert-AgentOfficeSignature -Signature $signature -ExpectedPublisher 'CN=Fixture' } | Should -Throw '*Missing signer certificate*'
        $signature.SignerCertificate = $cert
        { Assert-AgentOfficeSignature -Signature $signature -ExpectedPublisher ' ' } | Should -Throw '*trusted publisher*'
    }
}
Describe 'Real packaged secret scan' {
    It 'scans the actual ASAR, loose resources and Vite output' {
        & (Join-Path $PSScriptRoot 'scan-packaged-secrets.ps1')
    }
}
Describe 'Public release orchestration (isolated; no external writes)' {
    BeforeEach {
        $script:previousEnv = @{}
        foreach ($key in @('GITHUB_REPOSITORY','GITHUB_REF','RELEASE_TOKEN','SOURCE_TOKEN','GH_TOKEN','EXPECTED_VERSION','GITHUB_SHA','EXPECTED_RUN_ID','AGENTOFFICE_SIGNING_PUBLISHER','AGENTOFFICE_SIGNING_THUMBPRINT','RUNNER_TEMP')) {
            $script:previousEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        }
        $env:GITHUB_REPOSITORY='ENG-mohammed-fares/AgentOffice'
        $env:GITHUB_REF='refs/heads/development'
        $env:RELEASE_TOKEN='fixture-only'
        $env:SOURCE_TOKEN='fixture-only'
        $env:EXPECTED_VERSION='1.6.16'
        $env:GITHUB_SHA='fixture-sha'
        $env:EXPECTED_RUN_ID='42'
        $env:AGENTOFFICE_SIGNING_PUBLISHER='CN=Fixture'
        $env:AGENTOFFICE_SIGNING_THUMBPRINT=''
        $env:RUNNER_TEMP=$TestDrive
        $script:exe='AgentOffice-Setup-1.6.16-x64.exe'
        $script:names=@($script:exe, "$script:exe.blockmap", 'latest.yml')
        $script:fixtureRoot=Join-Path $TestDrive ([guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path (Join-Path $script:fixtureRoot 'candidate') -Force | Out-Null
        Push-Location $script:fixtureRoot
        $hashes=@{}
        foreach ($name in $script:names) {
            Set-Content -LiteralPath "candidate/$name" -Value "fixture $name" -Encoding utf8
            $hashes[$name]=(Get-FileHash -Algorithm SHA256 -LiteralPath "candidate/$name").Hash.ToLowerInvariant()
        }
        @{commit='fixture-sha';version='1.6.16';run_id='42';ref='refs/heads/development';locked=$true;sha256=$hashes} |
            ConvertTo-Json -Depth 5 | Set-Content -LiteralPath candidate/manifest.json
        # Fail closed if the production script ever attempts an unmocked network
        # operation. Only the narrowly matched fixture operations are allowed.
        Mock Invoke-RestMethod { throw 'Unexpected network call in release fixture' }
        Mock Get-AuthenticodeSignature {
            $cert=[pscustomobject]@{Subject='CN=Fixture';Thumbprint=('a'*40)}
            [pscustomobject]@{Status='Valid';SignatureType='Authenticode';SignerCertificate=$cert;TimeStamperCertificate=$cert}
        }
        Mock Get-AuthenticodeSignature { throw 'Unexpected signing operation in early-rejection test' }
    }
    AfterEach {
        Pop-Location
        foreach ($key in $script:previousEnv.Keys) {
            [Environment]::SetEnvironmentVariable($key, $script:previousEnv[$key], 'Process')
        }
    }
    It 'rejects an unexpected source before using any credential' {
        $env:GITHUB_REF='refs/heads/main'
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Unexpected release source*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
    It 'rejects a missing token or invalid release version' {
        $env:RELEASE_TOKEN=''
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Configure the public distribution repository token*'
        $env:RELEASE_TOKEN='fixture-only'
        $env:EXPECTED_VERSION='not-a-version'
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Invalid version*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
    It 'rejects tampered candidate bytes before publication' {
        Add-Content -LiteralPath "candidate/$script:exe" -Value 'tampered'
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Candidate hash mismatch*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
    It 'accepts an unsigned candidate through the local checks without signing credentials' {
        $env:AGENTOFFICE_SIGNING_PUBLISHER=''
        $env:AGENTOFFICE_SIGNING_THUMBPRINT=''
        Mock gh { throw 'Fixture source head reached' }
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Fixture source head reached*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
    It 'retries stale public metadata without recreating or republishing the release' {
        $script:published = $false
        $script:created = $false
        $script:publicChecks = 0
        $script:assets = @($script:names | ForEach-Object {
            @{name=$_;size=(Get-Item -LiteralPath "candidate/$_").Length;browser_download_url="https://github.com/ENG-mohammed-fares/AgentOffice/releases/download/v1.6.16/$_"}
        })
        Mock Start-Sleep {}
        Mock gh {
            $global:LASTEXITCODE = 0
            $command = $args -join ' '
            switch -Regex ($command) {
                '^api .*git/ref/heads/development' { return 'fixture-sha' }
                '^api .*releases/latest' { return '{"tag_name":"v1.6.15"}' }
                '^release view.*--json' { return (@{isDraft=$true;tagName='v1.6.16';assets=$script:assets} | ConvertTo-Json -Depth 5) }
                '^release view' { $global:LASTEXITCODE = 1; return }
                '^release create' { $script:created = $true; return }
                '^release download' {
                    $directory = $args[-1]
                    foreach ($name in $script:names) { Copy-Item -LiteralPath "candidate/$name" -Destination $directory }
                    return
                }
                '^release edit' {
                    if (-not $script:created) { throw 'Fixture publication without creation' }
                    $script:published = $true
                    return
                }
                default { throw 'Unexpected gh fixture operation' }
            }
        }
        Mock Invoke-RestMethod {
            $status = 200
            Set-Variable -Name $StatusCodeVariable -Value $status -Scope 1
            if (-not $script:published) { return @{tag_name='v1.6.15'} }
            $script:publicChecks++
            if ($script:publicChecks -eq 1) { return @{tag_name='v1.6.15'} }
            return @{tag_name='v1.6.16';draft=$false;prerelease=$false;assets=$script:assets;html_url='https://github.com/ENG-mohammed-fares/AgentOffice/releases/tag/v1.6.16'}
        } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice/releases/latest' }
        Mock Invoke-RestMethod { return @{full_name='ENG-mohammed-fares/AgentOffice';private=$false} } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice' }
        & (Join-Path $PSScriptRoot 'publish-public-update.ps1')
        $script:publicChecks | Should -Be 2
        Should -Invoke Start-Sleep -Times 1 -Exactly
    }
    It 'rejects a mismatched provenance manifest before publication' {
        $env:EXPECTED_RUN_ID='different'
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Candidate manifest mismatch*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
}
