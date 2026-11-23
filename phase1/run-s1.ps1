$ErrorActionPreference = "Stop"

$phaseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner = Join-Path $phaseRoot "runner\agent.py"
$brief = Join-Path $phaseRoot "brief.txt"
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
