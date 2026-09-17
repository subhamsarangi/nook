# Sanity check script for Nook Phase 2
# Tests: setup, lock, unlock, backoff

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001"
$password = "testpass123"
$wrongPassword = "wrongpass"

Write-Host "=== Nook Phase 2 Sanity Check ===" -ForegroundColor Cyan

# 1. Health check
Write-Host "`n1. Health check..." -ForegroundColor Yellow
$health = Invoke-WebRequest -Uri "$baseUrl/health" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
if ($health.status -eq "ok") {
  Write-Host "   ✓ Backend alive" -ForegroundColor Green
} else {
  Write-Host "   ✗ Health check failed" -ForegroundColor Red
  exit 1
}

# 2. Clean vault state
Write-Host "`n2. Cleaning old vault files..." -ForegroundColor Yellow
Remove-Item "$pwd\backend\vault.*" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   ✓ Cleaned" -ForegroundColor Green

# 3. Setup vault
Write-Host "`n3. Setting up vault..." -ForegroundColor Yellow
$setupBody = @{ password = $password } | ConvertTo-Json
try {
  $setup = Invoke-WebRequest -Uri "$baseUrl/api/setup" -Method POST -Body $setupBody -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  Write-Host "   ✓ Vault initialized and unlocked" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Setup failed: $_" -ForegroundColor Red
  exit 1
}

# 4. Check session status (should be unlocked)
Write-Host "`n4. Checking session status..." -ForegroundColor Yellow
$session = Invoke-WebRequest -Uri "$baseUrl/api/session/status" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
if ($session.locked -eq $false) {
  Write-Host "   ✓ Session unlocked, remaining time: $($session.remainingMs)ms" -ForegroundColor Green
} else {
  Write-Host "   ✗ Expected unlocked, got locked" -ForegroundColor Red
  exit 1
}

# 5. Lock vault
Write-Host "`n5. Locking vault..." -ForegroundColor Yellow
$lock = Invoke-WebRequest -Uri "$baseUrl/api/lock" -Method POST -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
Write-Host "   ✓ Vault locked" -ForegroundColor Green

# 6. Check session status (should be locked)
Write-Host "`n6. Verifying locked state..." -ForegroundColor Yellow
$session = Invoke-WebRequest -Uri "$baseUrl/api/session/status" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
if ($session.locked -eq $true) {
  Write-Host "   ✓ Session is locked" -ForegroundColor Green
} else {
  Write-Host "   ✗ Expected locked, got unlocked" -ForegroundColor Red
  exit 1
}

# 7. Try wrong password
Write-Host "`n7. Testing wrong password rejection..." -ForegroundColor Yellow
$wrongBody = @{ password = $wrongPassword } | ConvertTo-Json
try {
  Invoke-WebRequest -Uri "$baseUrl/api/unlock" -Method POST -Body $wrongBody -ContentType "application/json" -ErrorAction Stop | Out-Null
  Write-Host "   ✗ Should have rejected wrong password" -ForegroundColor Red
  exit 1
} catch {
  Write-Host "   ✓ Wrong password rejected" -ForegroundColor Green
}

# 8. Unlock with correct password
Write-Host "`n8. Unlocking with correct password..." -ForegroundColor Yellow
Start-Sleep -Seconds 2  # Wait for backoff to expire
$correctBody = @{ password = $password } | ConvertTo-Json
try {
  $unlock = Invoke-WebRequest -Uri "$baseUrl/api/unlock" -Method POST -Body $correctBody -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  Write-Host "   ✓ Vault unlocked" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Unlock failed: $_" -ForegroundColor Red
  exit 1
}

# 9. Verify unlocked
Write-Host "`n9. Verifying unlocked state..." -ForegroundColor Yellow
$session = Invoke-WebRequest -Uri "$baseUrl/api/session/status" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
if ($session.locked -eq $false) {
  Write-Host "   ✓ Session unlocked" -ForegroundColor Green
} else {
  Write-Host "   ✗ Expected unlocked, got locked" -ForegroundColor Red
  exit 1
}

# 10. Check vault files exist
Write-Host "`n10. Verifying vault files created..." -ForegroundColor Yellow
if ((Test-Path "$pwd\backend\vault.meta.json") -and (Test-Path "$pwd\backend\vault.db")) {
  Write-Host "   ✓ Both vault.meta.json and vault.db exist" -ForegroundColor Green
} else {
  Write-Host "   ✗ Vault files missing" -ForegroundColor Red
  exit 1
}

Write-Host "`n=== ALL CHECKS PASSED ===" -ForegroundColor Green
