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
        foreach ($key in @('GITHUB_REPOSITORY','GITHUB_REF','RELEASE_TOKEN','SOURCE_TOKEN','GH_TOKEN','EXPECTED_VERSION','GITHUB_SHA','EXPECTED_RUN_ID','AGENTOFFICE_SIGNING_PUBLISHER','AGENTOFFICE_SIGNING_THUMBPRINT','RUNNER_TEMP','PATH')) {
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
        Mock Invoke-WebRequest { throw 'Unexpected public HTTP call in release fixture' }
        # Use an actual native command shim so PowerShell receives real exit codes.
        # The shim is local-only and rejects every unrecognised command.
        $shim = Join-Path $script:fixtureRoot 'bin'
        New-Item -ItemType Directory -Path $shim | Out-Null
        $python = (Get-Command python -CommandType Application | Select-Object -First 1).Source
        $fixture = Join-Path $PSScriptRoot 'test_release_cli_fixture.py'
        $launcher = Join-Path $shim 'gh.cmd'
        Set-Content -LiteralPath $launcher -Encoding ascii -Value ('@"{0}" "{1}" %*' -f $python, $fixture)
        $env:PATH = "$shim;$env:PATH"
        if ((Get-Command gh -CommandType Application | Select-Object -First 1).Source -ne $launcher) {
            throw 'Local release CLI shim must take precedence over the real CLI.'
        }
        Mock Get-AuthenticodeSignature {
            $cert=[pscustomobject]@{Subject='CN=Fixture';Thumbprint=('a'*40)}
            [pscustomobject]@{Status='Valid';SignatureType='Authenticode';SignerCertificate=$cert;TimeStamperCertificate=$cert}
        }
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
    It 'rejects a missing trusted publisher before inspecting or publishing the candidate' {
        $env:AGENTOFFICE_SIGNING_PUBLISHER=''
        $env:AGENTOFFICE_SIGNING_THUMBPRINT=''
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*trusted publisher subject must be configured*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
    It 'rejects an unsigned or untrusted installer before any release API access' {
        Mock Get-AuthenticodeSignature {
            $cert=[pscustomobject]@{Subject='CN=AgentOffice test publisher';Thumbprint=('a'*40)}
            [pscustomobject]@{Status='NotSigned';SignatureType='Authenticode';SignerCertificate=$cert;TimeStamperCertificate=$cert}
        }
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*signature is not valid*'
        Should -Invoke Get-AuthenticodeSignature -Times 1 -Exactly
    }
    It 'accepts a trusted signed candidate through local checks before source verification' {
        Mock gh { throw 'Fixture source head reached' }
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Fixture source head reached*'
        Should -Invoke Get-AuthenticodeSignature -Times 1 -Exactly
    }
    It 'retries stale public metadata without recreating or republishing the release' {
        Set-Content -LiteralPath 'fixture-public-checks.txt' -Value '0' -Encoding ascii
        Mock Start-Sleep {}
        Mock Invoke-WebRequest {
            $body = @{tag_name='v1.6.15'}
            if (Test-Path 'fixture-cli-state.json') {
                $state = Get-Content 'fixture-cli-state.json' -Raw | ConvertFrom-Json
                if ($state.published) {
                    $checks = [int](Get-Content -LiteralPath 'fixture-public-checks.txt' -Raw)
                    $checks += 1
                    Set-Content -LiteralPath 'fixture-public-checks.txt' -Value $checks -Encoding ascii
                    if ($checks -gt 1) {
                        $body = @{tag_name='v1.6.16';draft=$false;prerelease=$false;assets=$state.assets;html_url='https://github.com/ENG-mohammed-fares/AgentOffice/releases/tag/v1.6.16'}
                    }
                }
            }
            return [pscustomobject]@{StatusCode=200;Content=($body | ConvertTo-Json -Depth 5)}
        } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice/releases/latest' }
        Mock Invoke-RestMethod { return @{full_name='ENG-mohammed-fares/AgentOffice';private=$false} } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice' }
        & (Join-Path $PSScriptRoot 'publish-public-update.ps1')
        $state = Get-Content 'fixture-cli-state.json' -Raw | ConvertFrom-Json
        $state.creates | Should -Be 1
        $state.edits | Should -Be 1
        $state.downloads | Should -Be 1
        [int](Get-Content -LiteralPath 'fixture-public-checks.txt' -Raw) | Should -Be 2
        Should -Invoke Start-Sleep -Times 1 -Exactly
    }
    It 'rejects an invalid draft without publishing it' {
        Set-Content -LiteralPath 'fixture-mode.txt' -Value 'bad-draft'
        Mock Invoke-WebRequest { [pscustomobject]@{StatusCode=200;Content='{"tag_name":"v1.6.15"}'} } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice/releases/latest' }
        Mock Invoke-RestMethod { @{full_name='ENG-mohammed-fares/AgentOffice';private=$false} } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice' }
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Distribution draft validation failed*'
        $state = Get-Content 'fixture-cli-state.json' -Raw | ConvertFrom-Json
        $state.creates | Should -Be 1
        $state.edits | Should -Be 0
    }
    It 'rejects tampered downloaded bytes without publishing them' {
        Set-Content -LiteralPath 'fixture-mode.txt' -Value 'bad-bytes'
        Mock Invoke-WebRequest { [pscustomobject]@{StatusCode=200;Content='{"tag_name":"v1.6.15"}'} } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice/releases/latest' }
        Mock Invoke-RestMethod { @{full_name='ENG-mohammed-fares/AgentOffice';private=$false} } -ParameterFilter { $Uri -eq 'https://api.github.com/repos/ENG-mohammed-fares/AgentOffice' }
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Uploaded hash mismatch*'
        $state = Get-Content 'fixture-cli-state.json' -Raw | ConvertFrom-Json
        $state.downloads | Should -Be 1
        $state.edits | Should -Be 0
    }
    It 'rejects a mismatched provenance manifest before publication' {
        $env:EXPECTED_RUN_ID='different'
        { & (Join-Path $PSScriptRoot 'publish-public-update.ps1') } | Should -Throw '*Candidate manifest mismatch*'
        Should -Invoke Get-AuthenticodeSignature -Times 0 -Exactly
    }
}
