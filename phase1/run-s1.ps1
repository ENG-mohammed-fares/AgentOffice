$ErrorActionPreference = "Stop"

$phaseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $phaseRoot
$runner = Join-Path $phaseRoot "runner\agent.py"
$brief = Join-Path $phaseRoot "brief.txt"
$fixtureManifest = Join-Path $phaseRoot "fixture.sha256"
$model = "qwen2.5-coder:7b"

$python = Get-Command py -ErrorAction SilentlyContinue
if ($python) {
    $pythonExe = "py"
    $pythonPrefix = @("-3")
} else {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        throw "Python 3 was not found. Install Python 3 and reopen PowerShell."
    }
    $pythonExe = "python"
    $pythonPrefix = @()
}

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw "Ollama was not found in PATH."
}

foreach ($line in Get-Content -LiteralPath $fixtureManifest) {
    if ($line -notmatch "^([0-9a-f]{64})  (.+)$") {
        throw "Malformed fixture hash line: $line"
    }
    $expectedHash = $Matches[1]
    $relativePath = $Matches[2]
    $fixturePath = Join-Path $repoRoot $relativePath
    $actualHash = (Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "Fixture hash mismatch: $relativePath"
    }
}
Write-Host "Fixture hashes verified."

$runnerTests = Join-Path $phaseRoot "runner"
$testArgs = @(
    "-m", "unittest", "discover",
    "-s", $runnerTests,
    "-v"
)
& $pythonExe @pythonPrefix @testArgs
if ($LASTEXITCODE -ne 0) {
    throw "Runner self-tests failed."
}

ollama show $model | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "The required model is not available: $model"
}

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$trialRoot = Join-Path $env:USERPROFILE "AgentOFF-Phase1\$runId"
$workspace = Join-Path $trialRoot "candidate"
$evidence = Join-Path $trialRoot "evidence"
New-Item -ItemType Directory -Path $workspace -Force | Out-Null
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

Write-Host "Trial: $runId"
Write-Host "Candidate: $workspace"
Write-Host "Evidence: $evidence"
Write-Host "Generated code will be written but will not be executed."

$runnerArgs = @(
    $runner,
    "--workspace", $workspace,
    "--evidence", $evidence,
    "--brief", $brief,
    "--model", $model
)
& $pythonExe @pythonPrefix @runnerArgs

if ($LASTEXITCODE -ne 0) {
    throw "The S1 generation trial failed. Preserve the displayed error and trial directory."
}

Write-Host "S1 candidate generation completed without executing generated code."
Write-Host "Keep this window open and run 'ollama ps' in a second PowerShell window."
