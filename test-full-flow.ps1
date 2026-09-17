# Full flow test: setup → entity → sub-entity → schema → finalize
# Tests end-to-end data persistence

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001"
$password = "testpass123"

Write-Host "=== Nook Full Flow Test ===" -ForegroundColor Cyan

# 1. Setup
Write-Host "`n1. Setting up vault..." -ForegroundColor Yellow
$setupBody = @{ password = $password } | ConvertTo-Json
try {
  $setup = Invoke-WebRequest -Uri "$baseUrl/api/setup" -Method POST -Body $setupBody -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  Write-Host "   ✓ Vault initialized and unlocked" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Setup failed: $_" -ForegroundColor Red
  exit 1
}

# 2. Create Entity
Write-Host "`n2. Creating entity..." -ForegroundColor Yellow
$entityBody = @{
  name = "Contacts"
  description = "Test contact records"
} | ConvertTo-Json

try {
  $entityRes = Invoke-WebRequest -Uri "$baseUrl/api/entities" -Method POST -Body $entityBody -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  $entityId = $entityRes.id
  Write-Host "   ✓ Entity created: $entityId" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Entity create failed: $_" -ForegroundColor Red
  exit 1
}

# 3. Create Sub-Entity
Write-Host "`n3. Creating sub-entity..." -ForegroundColor Yellow
$subEntityBody = @{
  name = "Contact Records"
  description = "Individual contact entries"
} | ConvertTo-Json

try {
  $subRes = Invoke-WebRequest -Uri "$baseUrl/api/entities/$entityId/sub-entities" -Method POST -Body $subEntityBody -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  $subEntityId = $subRes.id
  Write-Host "   ✓ Sub-entity created: $subEntityId" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Sub-entity create failed: $_" -ForegroundColor Red
  exit 1
}

# 4. Create Schema (3 fields)
Write-Host "`n4. Creating schema..." -ForegroundColor Yellow
$schema = @(
  @{
    name = "First Name"
    type = "short_text"
    required = $true
  },
  @{
    name = "Email"
    type = "url"
    required = $true
  },
  @{
    name = "Notes"
    type = "long_text"
    required = $false
  }
)

$schemaBody = @{ schema = $schema } | ConvertTo-Json -Depth 10

try {
  $schemaRes = Invoke-WebRequest -Uri "$baseUrl/api/sub-entities/$subEntityId/schema" -Method PUT -Body $schemaBody -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  Write-Host "   ✓ Schema saved (3 fields)" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Schema save failed: $_" -ForegroundColor Red
  exit 1
}

# 5. Finalize Schema
Write-Host "`n5. Finalizing schema..." -ForegroundColor Yellow
try {
  $finalRes = Invoke-WebRequest -Uri "$baseUrl/api/sub-entities/$subEntityId/finalize-schema" -Method POST -ContentType "application/json" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  Write-Host "   ✓ Schema finalized" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Schema finalize failed: $_" -ForegroundColor Red
  exit 1
}

# 6. Verify Schema Finalized
Write-Host "`n6. Verifying finalized state..." -ForegroundColor Yellow
try {
  $verifyRes = Invoke-WebRequest -Uri "$baseUrl/api/sub-entities/$subEntityId" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  if ($verifyRes.schemaFinalized) {
    Write-Host "   ✓ Schema is finalized" -ForegroundColor Green
  } else {
    Write-Host "   ✗ Schema not finalized" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "   ✗ Verify failed: $_" -ForegroundColor Red
  exit 1
}

# 7. Lock and Unlock (persistence test)
Write-Host "`n7. Testing persistence (lock → unlock)..." -ForegroundColor Yellow
try {
  Invoke-WebRequest -Uri "$baseUrl/api/lock" -Method POST -ErrorAction Stop | Out-Null
  Write-Host "   ✓ Locked" -ForegroundColor Green
  
  Start-Sleep -Seconds 1
  
  $unlockBody = @{ password = $password } | ConvertTo-Json
  Invoke-WebRequest -Uri "$baseUrl/api/unlock" -Method POST -Body $unlockBody -ContentType "application/json" -ErrorAction Stop | Out-Null
  Write-Host "   ✓ Unlocked" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Lock/unlock failed: $_" -ForegroundColor Red
  exit 1
}

# 8. Verify Data Still Exists
Write-Host "`n8. Verifying data persisted..." -ForegroundColor Yellow
try {
  $entitiesRes = Invoke-WebRequest -Uri "$baseUrl/api/entities" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  if ($entitiesRes.Count -gt 0 -and $entitiesRes[0].id -eq $entityId) {
    Write-Host "   ✓ Entity exists after unlock" -ForegroundColor Green
  } else {
    Write-Host "   ✗ Entity missing after unlock" -ForegroundColor Red
    exit 1
  }
  
  $subRes = Invoke-WebRequest -Uri "$baseUrl/api/entities/$entityId/sub-entities" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  if ($subRes.Count -gt 0 -and $subRes[0].id -eq $subEntityId) {
    Write-Host "   ✓ Sub-entity persisted" -ForegroundColor Green
  } else {
    Write-Host "   ✗ Sub-entity missing" -ForegroundColor Red
    exit 1
  }
  
  $finalVerify = Invoke-WebRequest -Uri "$baseUrl/api/sub-entities/$subEntityId" -ErrorAction Stop | Select-Object -ExpandProperty Content | ConvertFrom-Json
  if ($finalVerify.schemaFinalized) {
    Write-Host "   ✓ Schema finalized flag persisted" -ForegroundColor Green
  } else {
    Write-Host "   ✗ Schema finalization lost" -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "   ✗ Persistence check failed: $_" -ForegroundColor Red
  exit 1
}

Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Green
Write-Host "Entity ID: $entityId" -ForegroundColor Cyan
Write-Host "Sub-Entity ID: $subEntityId" -ForegroundColor Cyan
