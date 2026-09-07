cd $PSScriptRoot

# Kill any existing server on port 8080
$existing = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($existing) {
    Stop-Process -Id $existing.OwningProcess -ErrorAction SilentlyContinue
}

# Create sessions directory
$sessionsDir = Join-Path $PSScriptRoot "sessions"
if (-not (Test-Path $sessionsDir)) {
    New-Item -ItemType Directory -Path $sessionsDir | Out-Null
}

# Start Python server in a new window
Start-Process -FilePath "python" -ArgumentList @("server.py") -WorkingDirectory $PSScriptRoot

# Wait for server to be ready
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    if ((Test-NetConnection -ComputerName localhost -Port 8080 -WarningAction SilentlyContinue).TcpTestSucceeded) {
        break
    }
}

# Open the page
Start-Process "http://localhost:8080/test.html"

Write-Host "Server started on http://localhost:8080" -ForegroundColor Green
Write-Host "Sessions directory: $sessionsDir" -ForegroundColor Gray
Write-Host "Close the Python process in Task Manager to stop the server." -ForegroundColor Gray
