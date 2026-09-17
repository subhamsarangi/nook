# Start both Nook backend and frontend together
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Starting Nook (Backend + Frontend)...   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Backend:  http://localhost:3001" -ForegroundColor Yellow
Write-Host " Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host " Press Ctrl+C anytime to stop both." -ForegroundColor Gray
Write-Host ""

npm run dev
