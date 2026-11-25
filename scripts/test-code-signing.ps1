$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'verify-code-signing.ps1')

function Assert-Rejected {
    param([scriptblock] $Check, [string] $Expected)
    try { & $Check }
    catch {
        if ($_.Exception.Message -notlike "*$Expected*") { throw }
        return
    }
    throw "Unexpected acceptance; expected: $Expected"
}

# Exercise the policy separately from Windows' trust engine.
$subject = 'CN=AgentOffice test publisher'
$thumb = '0123456789012345678901234567890123456789'
$cert = [pscustomobject]@{ Subject = $subject; Thumbprint = $thumb }
$good = [pscustomobject]@{
    Status = 'Valid'; SignatureType = 'Authenticode'
    SignerCertificate = $cert; TimeStamperCertificate = $cert
}
Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher $subject -ExpectedThumbprint $thumb
Assert-Rejected { Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher 'CN=Different' } 'Unexpected publisher'
Assert-Rejected { Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher $subject -ExpectedThumbprint ('a' * 40) } 'Unexpected signing certificate'
Assert-Rejected { Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher $subject -ExpectedThumbprint 'bad' } 'Invalid configured certificate'
$good.TimeStamperCertificate = $null
Assert-Rejected { Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher $subject } 'timestamp is required'
$good.TimeStamperCertificate = $cert
$good.SignatureType = 'Catalog'
Assert-Rejected { Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher $subject } 'embedded Authenticode'
$good.SignatureType = 'Authenticode'
foreach ($state in @('NotSigned','NotTrusted','HashMismatch','UnknownError')) {
    $good.Status = $state
    Assert-Rejected { Assert-AgentOfficeSignature -Signature $good -ExpectedPublisher $subject } 'signature is not valid'
}

# Real Windows signature test: use an ephemeral self-signed test certificate.
# Never add it to a trust store, export a private key, or publish this fixture.
$dir = Join-Path ([IO.Path]::GetTempPath()) ('agentoffice-sign-test-' + [guid]::NewGuid())
$testCert = $null
try {
    New-Item -ItemType Directory -Path $dir | Out-Null
    $fixture = Join-Path $dir 'fixture.ps1'
    Set-Content -LiteralPath $fixture -Value 'Write-Output "AgentOffice signing test only"' -Encoding utf8
    $unsigned = Get-AuthenticodeSignature -LiteralPath $fixture
    Assert-Rejected { Assert-AgentOfficeSignature -Signature $unsigned -ExpectedPublisher $subject } 'signature is not valid'
    $testCert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=AgentOffice CI TEST ONLY $([guid]::NewGuid())" -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(1)
    Set-AuthenticodeSignature -FilePath $fixture -Certificate $testCert -HashAlgorithm SHA256 | Out-Null
    $signed = Get-AuthenticodeSignature -LiteralPath $fixture
    if ($null -eq $signed.SignerCertificate -or $signed.SignerCertificate.Thumbprint -ne $testCert.Thumbprint) {
        throw 'Windows did not create the expected fixture signature.'
    }
    if ([string]$signed.Status -eq 'Valid') { throw 'Test certificate must not be publicly trusted.' }
    Assert-Rejected { Assert-AgentOfficeSignature -Signature $signed -ExpectedPublisher $testCert.Subject } 'signature is not valid'
}
finally {
    if ($null -ne $testCert) { Remove-Item -LiteralPath ("Cert:\CurrentUser\My\" + $testCert.Thumbprint) -DeleteKey -ErrorAction Stop }
    Remove-Item -LiteralPath $dir -Recurse -Force
}
Write-Host 'Code-signing policy and real Windows unsigned/self-signed rejection tests passed.'
