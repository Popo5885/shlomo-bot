# Kill any leftover Docker processes
Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3

# Start Docker Desktop
Write-Host "Launching Docker Desktop..."
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Wait for the backend process to appear
Write-Host "Waiting for Docker engine to start (this can take 1-2 minutes)..."
for ($i = 1; $i -le 40; $i++) {
    Start-Sleep -Seconds 5

    # Check if the Docker backend process exists
    $backend = Get-Process -Name "com.docker.backend" -ErrorAction SilentlyContinue
    if (-not $backend) {
        Write-Host "  Docker backend not running yet... ($i/40)"
        continue
    }

    # Try the Docker CLI
    $null = docker version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nDocker engine is running!"

        # Remove old containers
        docker rm -f saas-postgres 2>$null
        docker rm -f saas-redis 2>$null

        # Start PostgreSQL 16
        Write-Host "Starting PostgreSQL 16..."
        $pgId = docker run -d --name saas-postgres -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=saas_community -p 5432:5432 postgres:16
        Write-Host "  Container: $pgId"

        # Start Redis 7
        Write-Host "Starting Redis 7..."
        $redisId = docker run -d --name saas-redis -p 6379:6379 redis:7-alpine
        Write-Host "  Container: $redisId"

        # Wait for PG to accept connections
        Write-Host "Waiting for PostgreSQL to accept connections..."
        for ($j = 1; $j -le 15; $j++) {
            Start-Sleep -Seconds 2
            docker exec saas-postgres pg_isready -U user 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "PostgreSQL ready!"
                break
            }
        }

        Write-Host "`nRunning containers:"
        docker ps
        Write-Host "`nSUCCESS"
        exit 0
    }

    Write-Host "  Docker API not ready yet... ($i/40)"
}

Write-Host "TIMEOUT: Docker Desktop did not start"
exit 1
