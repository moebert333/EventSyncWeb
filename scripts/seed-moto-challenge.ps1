<#
.SYNOPSIS
  Generate the Moto Challenge 2027 sample seed and apply it to Supabase Postgres.

.DESCRIPTION
  1) Runs scripts/generate_moto_challenge_seed.py
  2) Applies supabase/seed_moto_challenge_2027.sql to your Supabase database

  The anon/publishable key and service_role key cannot run this SQL file.
  You need a Postgres connection string (or the database password).

  Supabase → Project Settings → Database → Connection string → URI
  Example:
    postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-....pooler.supabase.com:6543/postgres
  Or direct:
    postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

.PARAMETER DatabaseUrl
  Full Postgres URI. Overrides env SUPABASE_DB_URL / DATABASE_URL.

.PARAMETER DbPassword
  Database password only. Combined with VITE_SUPABASE_URL (or -ProjectRef)
  into postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres

.PARAMETER ProjectRef
  Supabase project ref (the subdomain of *.supabase.co). Optional if
  VITE_SUPABASE_URL is set in .env.local.

.PARAMETER SkipInstall
  Do not auto-install psycopg[binary] when missing.

.PARAMETER Seed
  Optional RNG seed forwarded to the Python generator for reproducible data.

.EXAMPLE
  .\scripts\seed-moto-challenge.ps1 -DatabaseUrl "postgresql://postgres.xxxx:PASSWORD@aws-0-us-west-1.pooler.supabase.com:6543/postgres"

.EXAMPLE
  .\scripts\seed-moto-challenge.ps1 -DbPassword "YOUR_DB_PASSWORD"
#>

[CmdletBinding()]
param(
  [string]$DatabaseUrl = "",
  [string]$DbPassword = "",
  [string]$ProjectRef = "",
  [switch]$SkipInstall,
  [int]$Seed = 0
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $idx = $line.IndexOf("=")
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim("'").Trim('"')
    if (-not $key) { return }
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($key, "Process"))) {
      return
    }
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

Import-DotEnv (Join-Path $RepoRoot ".env.local")
Import-DotEnv (Join-Path $RepoRoot ".env")

if ($DatabaseUrl) {
  $env:SUPABASE_DB_URL = $DatabaseUrl
}
if ($DbPassword) {
  $env:SUPABASE_DB_PASSWORD = $DbPassword
}
if ($ProjectRef) {
  $env:SUPABASE_PROJECT_REF = $ProjectRef
}

$py = Get-Command py -ErrorAction SilentlyContinue
if (-not $py) {
  throw "Python launcher 'py' not found. Install Python 3 and ensure 'py' is on PATH."
}

Write-Host "==> Ensuring psycopg is available"
$check = & py -3 -c "import importlib.util; import sys; sys.exit(0 if importlib.util.find_spec('psycopg') else 1)"
if ($LASTEXITCODE -ne 0) {
  if ($SkipInstall) {
    throw "psycopg is not installed. Run: py -3 -m pip install `"psycopg[binary]`""
  }
  Write-Host "Installing psycopg[binary]..."
  & py -3 -m pip install --disable-pip-version-check "psycopg[binary]"
  if ($LASTEXITCODE -ne 0) { throw "Failed to install psycopg[binary]" }
}

$sqlOut = Join-Path $RepoRoot "supabase\seed_moto_challenge_2027.sql"
Write-Host "==> Generating seed SQL"
$genArgs = @(
  "-3",
  (Join-Path $RepoRoot "scripts\generate_moto_challenge_seed.py"),
  "--out", $sqlOut
)
if ($Seed -gt 0) {
  $genArgs += @("--seed", "$Seed")
}
& py @genArgs
if ($LASTEXITCODE -ne 0) { throw "Seed generator failed (exit $LASTEXITCODE)" }

$hasUrl = -not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL) -or
  -not [string]::IsNullOrWhiteSpace($env:SUPABASE_DIRECT_CONNECT_STRING) -or
  -not [string]::IsNullOrWhiteSpace($env:DATABASE_URL) -or
  -not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_CONNECTION_STRING)
$hasPassword = -not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)

if (-not $hasUrl -and -not $hasPassword) {
  Write-Host ""
  Write-Host "Missing database credentials." -ForegroundColor Yellow
  Write-Host "Provide one of:"
  Write-Host "  -DatabaseUrl `"postgresql://postgres.[ref]:[password]@...`""
  Write-Host "  -DbPassword `"your-database-password`""
  Write-Host "  or set SUPABASE_DB_URL / SUPABASE_DB_PASSWORD in .env.local"
  Write-Host ""
  Write-Host "Do NOT use the service_role / publishable API key for this script."
  Write-Host "Use the Database password from Supabase → Project Settings → Database."
  throw "No SUPABASE_DB_URL or SUPABASE_DB_PASSWORD configured."
}

Write-Host "==> Applying SQL to Supabase"
$applyArgs = @(
  "-3",
  (Join-Path $RepoRoot "scripts\apply_sql_to_supabase.py"),
  "--sql", $sqlOut,
  "--repo-root", $RepoRoot
)
if ($DatabaseUrl) {
  $applyArgs += @("--database-url", $DatabaseUrl)
}
& py @applyArgs
if ($LASTEXITCODE -ne 0) { throw "SQL apply failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "Done. Event codes: MX-2027-1 .. MX-2027-5 (live timing on MX-2027-4)." -ForegroundColor Green
