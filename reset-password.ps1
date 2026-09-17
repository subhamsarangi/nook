# Reset vault password script
# Current password: testpass123

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001"
$currentPassword = "testpass123"

Write-Host "=== Nook Vault Password Reset ===" -ForegroundColor Cyan

# Get new password from user
$newPassword = Read-Host "Enter new password (min 8 characters)" -AsSecureString
$newPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($newPassword))

# Validate
if ($newPasswordPlain.Length -lt 8) {
  Write-Host "Password must be at least 8 characters" -ForegroundColor Red
  exit 1
}

# Confirm
$confirm = Read-Host "Confirm new password" -AsSecureString
$confirmPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($confirm))

if ($newPasswordPlain -ne $confirmPlain) {
  Write-Host "Passwords don't match" -ForegroundColor Red
  exit 1
}

# 1. Unlock with current password
Write-Host "1. Unlocking vault with current password..."
$unlockBody = @{ password = $currentPassword } | ConvertTo-Json
try {
  Invoke-WebRequest -Uri "$baseUrl/api/unlock" -Method POST -Body $unlockBody -ContentType "application/json" -ErrorAction Stop | Out-Null
  Write-Host "   ✓ Unlocked" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Failed to unlock. Current password incorrect?" -ForegroundColor Red
  exit 1
}

# 2. Reset vault with new password
Write-Host "2. Resetting vault with new password..."
$resetBody = @{ password = $newPasswordPlain } | ConvertTo-Json
try {
  Invoke-WebRequest -Uri "$baseUrl/api/reset-vault" -Method POST -Body $resetBody -ContentType "application/json" -ErrorAction Stop | Out-Null
  Write-Host "   ✓ Password reset successful" -ForegroundColor Green
} catch {
  Write-Host "   ✗ Reset failed: $_" -ForegroundColor Red
  exit 1
}

Write-Host "`n✅ Password changed successfully!" -ForegroundColor Green
Write-Host "New password: $newPasswordPlain" -ForegroundColor Cyan
Write-Host "`nUpdate the script with the new password when ready." -ForegroundColor Yellow
