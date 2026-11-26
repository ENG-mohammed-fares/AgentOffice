# Verify an existing Authenticode signature; does not install trust or sign.
Set-StrictMode -Version Latest

function Assert-AgentOfficeSignature {
    param(
        [Parameter(Mandatory)] $Signature,
        [Parameter(Mandatory)] [string] $ExpectedPublisher,
        [string] $ExpectedThumbprint = ''
    )
    if ([string]::IsNullOrWhiteSpace($ExpectedPublisher)) {
        throw 'A trusted publisher subject must be configured before publication.'
    }
    if ([string]$Signature.Status -ne 'Valid') {
        throw "Authenticode signature is not valid: $($Signature.Status)"
    }
    if ([string]$Signature.SignatureType -ne 'Authenticode') {
        throw 'An embedded Authenticode signature is required.'
    }
    if ($null -eq $Signature.SignerCertificate) {
        throw 'Missing signer certificate.'
    }
    if (-not [string]::Equals($Signature.SignerCertificate.Subject, $ExpectedPublisher, [System.StringComparison]::Ordinal)) {
        throw 'Unexpected publisher subject.'
    }
    if ($ExpectedThumbprint) {
        if ($ExpectedThumbprint -notmatch '^[0-9a-fA-F]{40}$') {
            throw 'Invalid configured certificate thumbprint.'
        }
        if (-not [string]::Equals($Signature.SignerCertificate.Thumbprint, $ExpectedThumbprint, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Unexpected signing certificate.'
        }
    }
    if ($null -eq $Signature.TimeStamperCertificate) {
        throw 'A trusted timestamp is required.'
    }
}

function Assert-AgentOfficeSignedFile {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $ExpectedPublisher,
        [string] $ExpectedThumbprint = ''
    )
    if ([string]::IsNullOrWhiteSpace($ExpectedPublisher)) { throw 'A trusted publisher subject must be configured before publication.' }
    $file = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($file.PSIsContainer -or $file.Extension -ine '.exe') {
        throw 'Expected a Windows executable.'
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName -ErrorAction Stop
    Assert-AgentOfficeSignature -Signature $signature -ExpectedPublisher $ExpectedPublisher -ExpectedThumbprint $ExpectedThumbprint
    Write-Host "Verified Authenticode signature and timestamp: $($file.Name)"
}
