# Wait for Docker daemon
for ($i = 1; $i -le 30; $i++) {
    $result = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker daemon is ready!"
        break
    }
    Write-Host "Waiting for Docker daemon... ($i/30)"
    Start-Sleep -Seconds 5
}

# Remove old containers if they exist
docker rm -f saas-postgres 2>$null
docker rm -f saas-redis 2>$null

# Start PostgreSQL
Write-Host "Starting PostgreSQL..."
docker run -d --name saas-postgres `
    -e POSTGRES_USER=user `
    -e POSTGRES_PASSWORD=password `
    -e POSTGRES_DB=saas_community `
    -p 5432:5432 `
    postgres:16

# Start Redis
Write-Host "Starting Redis..."
docker run -d --name saas-redis `
    -p 6379:6379 `
    redis:7-alpine

# Wait for PostgreSQL to be ready
Write-Host "Waiting for PostgreSQL to accept connections..."
for ($i = 1; $i -le 20; $i++) {
    $result = docker exec saas-postgres pg_isready -U user 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PostgreSQL is ready!"
        break
    }
    Start-Sleep -Seconds 2
}

# Show running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
