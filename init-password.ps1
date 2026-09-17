# Initialize vault with first password
# Run this script once on first startup

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001"

Write-Host "=== Nook Vault First-Time Setup ===" -ForegroundColor Cyan

# Check if vault already initialized
Write-Host "`nChecking vault status..." -ForegroundColor Yellow
try {
  $status = Invoke-WebRequest -Uri "$baseUrl/api/unlock/status" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  if ($status.initialized) {
    Write-Host "✗ Vault already initialized. Use reset-password.ps1 to change password." -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "✗ Backend not running. Start it first with: npm run dev" -ForegroundColor Red
  exit 1
}

Write-Host "✓ Vault not initialized. Ready for setup." -ForegroundColor Green

# Get password from user
Write-Host "`nEnter your vault password (min 8 characters):" -ForegroundColor Yellow
$password = Read-Host "Password" -AsSecureString
$passwordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($password))

# Validate
if ($passwordPlain.Length -lt 8) {
  Write-Host "✗ Password must be at least 8 characters" -ForegroundColor Red
  exit 1
}

# Confirm
Write-Host "Confirm password:" -ForegroundColor Yellow
$confirm = Read-Host "Password" -AsSecureString
$confirmPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($confirm))

if ($passwordPlain -ne $confirmPlain) {
  Write-Host "✗ Passwords don't match" -ForegroundColor Red
  exit 1
}

# Setup vault
Write-Host "`nInitializing vault..." -ForegroundColor Yellow
$setupBody = @{ password = $passwordPlain } | ConvertTo-Json
try {
  Invoke-WebRequest -Uri "$baseUrl/api/setup" -Method POST -Body $setupBody -ContentType "application/json" -ErrorAction Stop | Out-Null
  Write-Host "✓ Vault initialized" -ForegroundColor Green
} catch {
  Write-Host "✗ Setup failed: $_" -ForegroundColor Red
  exit 1
}

Write-Host "`n✅ Vault ready!" -ForegroundColor Green
Write-Host "Your password: $passwordPlain" -ForegroundColor Cyan
Write-Host "`nSave this password somewhere safe. Update reset-password.ps1 with it." -ForegroundColor Yellow
