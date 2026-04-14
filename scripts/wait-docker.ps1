Write-Host "Waiting for Docker Desktop to fully initialize..."
for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 5
    $backend = Get-Process -Name "com.docker.backend" -ErrorAction SilentlyContinue
    if ($backend) {
        $result = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker is ready!"

            # Remove old containers
            docker rm -f saas-postgres 2>$null
            docker rm -f saas-redis 2>$null

            # Start PostgreSQL
            Write-Host "Starting PostgreSQL 16..."
            docker run -d --name saas-postgres `
                -e POSTGRES_USER=user `
                -e POSTGRES_PASSWORD=password `
                -e POSTGRES_DB=saas_community `
                -p 5432:5432 `
                postgres:16

            # Start Redis
            Write-Host "Starting Redis 7..."
            docker run -d --name saas-redis `
                -p 6379:6379 `
                redis:7-alpine

            # Wait for PostgreSQL to accept connections
            Write-Host "Waiting for PostgreSQL to be ready..."
            for ($j = 1; $j -le 30; $j++) {
                Start-Sleep -Seconds 2
                $pgReady = docker exec saas-postgres pg_isready -U user 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "PostgreSQL accepting connections!"
                    break
                }
                Write-Host "  PostgreSQL not ready yet ($j/30)..."
            }

            # Show status
            Write-Host ""
            docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
            exit 0
        }
    }
    Write-Host "  Still waiting... ($i/60)"
}
Write-Host "ERROR: Docker Desktop did not start in time"
exit 1
