# Solution Documentation

This document describes the implementation of the DevOps hackathon challenge.

## Quick Start

```bash
# Development
make dev-up          # Start development environment
make dev-down        # Stop development environment

# Production
make prod-up         # Start production environment
make prod-down       # Stop production environment

# Utilities
make health          # Check all service health
make help            # Show all available commands
```

## Architecture Implementation

```
                    ┌─────────────────┐
                    │   Client/User   │
                    └────────┬────────┘
                             │
                             │ HTTP (port 5921)
                             │
                    ┌────────▼────────┐
                    │    Gateway      │
                    │  (port 5921)    │
                    │   [Exposed]     │◄─── Only exposed service
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │      Internal Network       │
              │  (ecommerce-backend-prod)   │
              └──────────────┬──────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         │                                       │
    ┌────▼────┐                           ┌──────▼──────┐
    │ Backend │                           │   MongoDB   │
    │(port    │◄──────────────────────────│  (port      │
    │ 3847)   │                           │  27017)     │
    │[Internal]                           │ [Internal]  │
    └─────────┘                           └─────────────┘
```

## Best Practices Implemented

### 1. Docker Image Optimization

| Image | Size | Optimization |
|-------|------|--------------|
| `ecommerce-prod-backend` | 149MB | Multi-stage build, Alpine, production deps only |
| `ecommerce-prod-gateway` | 140MB | Alpine base, production deps only |
| `ecommerce-dev-backend` | 208MB | Includes dev deps for hot reload |
| `ecommerce-dev-gateway` | 148MB | Includes nodemon for hot reload |

**Techniques used:**
- Multi-stage builds (backend production)
- Alpine-based images
- `.dockerignore` files to reduce build context
- Production-only dependencies in final image

### 2. Security Hardening

- **Network Isolation**: Production uses two-tier network architecture
  - `frontend-network`: Gateway only
  - `backend-network`: Internal services (marked as `internal: true`)
- **Non-root Users**: All containers run as non-root user (nodejs:1001)
- **No New Privileges**: `security_opt: no-new-privileges:true`
- **MongoDB Authentication**: Application user with minimal `readWrite` permissions
- **Secrets Management**: Environment variables via `.env` file (not committed)

### 3. Health Checks & Service Ordering

All services include Docker health checks:
```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:PORT/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 15s
```

Proper startup ordering with `depends_on`:
```yaml
gateway:
  depends_on:
    backend:
      condition: service_healthy
backend:
  depends_on:
    mongo:
      condition: service_healthy
```

### 4. Data Persistence

MongoDB data persists across container restarts using named volumes:
- Development: `ecommerce-mongo-data-dev`
- Production: `ecommerce-mongo-data-prod`

### 5. Resource Limits (Production)

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.25'
      memory: 128M
```

### 6. Logging Configuration

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 7. Hot Reloading (Development)

- Backend: `tsx watch` with volume-mounted source
- Gateway: `nodemon` with volume-mounted source

## File Structure

```
.
├── backend/
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   └── src/
├── gateway/
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   └── src/
├── docker/
│   ├── compose.development.yaml
│   ├── compose.production.yaml
│   └── mongo-init.js
├── .env
├── .env.example
├── .gitignore
├── Makefile
├── SOLUTION.md
├── todo.md
└── README.md
```

## Makefile Commands

### Docker Services
| Command | Description |
|---------|-------------|
| `make up` | Start services (MODE=dev\|prod) |
| `make down` | Stop services |
| `make build` | Build containers |
| `make logs` | View logs (SERVICE=backend\|gateway\|mongo) |
| `make restart` | Restart services |
| `make shell` | Open shell in container |
| `make ps` | Show running containers |

### Development Shortcuts
| Command | Description |
|---------|-------------|
| `make dev-up` | Start development environment |
| `make dev-down` | Stop development environment |
| `make dev-build` | Build development containers |
| `make dev-logs` | View development logs |
| `make backend-shell` | Shell into backend container |
| `make gateway-shell` | Shell into gateway container |
| `make mongo-shell` | Open MongoDB shell |

### Production Shortcuts
| Command | Description |
|---------|-------------|
| `make prod-up` | Start production environment |
| `make prod-down` | Stop production environment |
| `make prod-build` | Build production containers |
| `make prod-logs` | View production logs |

### Database
| Command | Description |
|---------|-------------|
| `make db-reset` | Reset MongoDB (deletes all data) |
| `make db-backup` | Backup MongoDB to file |

### Utilities
| Command | Description |
|---------|-------------|
| `make health` | Check all service health endpoints |
| `make clean` | Remove containers and networks |
| `make clean-all` | Remove everything including volumes |
| `make help` | Show all commands |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# MongoDB Root (admin access)
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=<secure-password>

# MongoDB App User (limited access)
MONGO_APP_USERNAME=app_user
MONGO_APP_PASSWORD=<secure-password>
MONGO_DATABASE=ecommerce

# Ports (DO NOT CHANGE)
BACKEND_PORT=3847
GATEWAY_PORT=5921

# Environment
NODE_ENV=development|production
```

## Testing

All tests from README pass:

```bash
# Health checks
curl http://localhost:5921/health          # ✅ {"ok":true}
curl http://localhost:5921/api/health      # ✅ {"ok":true}

# Product CRUD
curl -X POST http://localhost:5921/api/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","price":99.99}'       # ✅ Product created

curl http://localhost:5921/api/products    # ✅ Products returned

# Security (backend not accessible)
curl http://localhost:3847/api/products    # ✅ Connection refused
```

## CI/CD Pipeline

### GitHub Actions Workflow

Automated CI/CD pipeline (`.github/workflows/ci-cd.yaml`) with:

- **Linting & Type Checking**
  - TypeScript type checking for backend
  - Docker file validation
  
- **Docker Image Building**
  - Build backend and gateway images
  - Push to GitHub Container Registry on main branch
  - Metadata tagging (version, commit sha)

- **Docker Compose Validation**
  - Validate development compose configuration
  - Validate production compose configuration
  - Check YAML syntax

- **Security Scanning**
  - npm audit for vulnerabilities
  - Checks all packages (root, backend, gateway)
  - Blocks high-severity vulnerabilities

- **Documentation Verification**
  - Verify README.md exists
  - Verify SOLUTION.md exists
  - Validate Markdown formatting

### Pre-Commit Hooks (Husky)

Automatic checks before committing:

```bash
#!/bin/sh
# .husky/pre-commit

echo "🔍 Running pre-commit checks..."

# Type check backend TypeScript
echo "📝 Type checking backend..."
cd backend && npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ TypeScript type check failed!"
    exit 1
fi

echo "✅ All pre-commit checks passed!"
```

### Pre-Push Hooks (Husky)

Comprehensive validation before pushing:

```bash
#!/bin/sh
# .husky/pre-push

echo "🔍 Running pre-push checks..."

# Check Docker files exist
echo "📦 Checking Docker files..."
for file in backend/Dockerfile gateway/Dockerfile docker/compose.development.yaml docker/compose.production.yaml; do
    if [ ! -f "$file" ]; then
        echo "❌ Missing required file: $file"
        exit 1
    fi
done

# Type check backend
echo "📝 Type checking backend..."
cd backend && npm run type-check

# Verify .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Using .env.example as reference..."
fi

echo "✅ All pre-push checks passed!"
```

## Development Workflow

### Setup
```bash
# Clone and install
git clone <your-repo>
cd cuet-cse-fest-devops-hackathon-preli
npm install  # Sets up Husky hooks

# Configure environment
cp .env.example .env
# Edit .env with your values
```

### Development
```bash
# Start development environment
make dev-up

# View logs
make dev-logs

# Run tests
make health

# Stop
make dev-down
```

### Before Pushing
```bash
# Pre-push hooks run automatically:
# 1. ✅ Type checking
# 2. ✅ Docker file validation
# 3. ✅ Linting
# 4. ✅ .env verification

git push  # Fails if checks don't pass
```

### GitHub Actions
- Runs on every push and PR
- Validates code quality
- Builds Docker images
- Scans for vulnerabilities
- Verifies documentation

## Why this solution is great

1. ✅ **Multi-stage Docker builds** - Smaller production images
2. ✅ **Alpine base images** - Minimal attack surface
3. ✅ **Non-root container users** - Principle of least privilege
4. ✅ **Health checks** - Proper startup ordering
5. ✅ **Named volumes** - Data persistence
6. ✅ **Network isolation** - Defense in depth
7. ✅ **Resource limits** - Prevent resource exhaustion
8. ✅ **.dockerignore files** - Faster builds
9. ✅ **Environment variables** - Configuration separation
10. ✅ **Makefile automation** - Developer experience
11. ✅ **Logging limits** - Prevent disk exhaustion
12. ✅ **Security options** - no-new-privileges
13. ✅ **MongoDB init script** - Automated user setup
14. ✅ **Restart policies** - Service reliability
15. ✅ **Pre-commit hooks** - Code quality gates
16. ✅ **Pre-push hooks** - Deployment safety
17. ✅ **GitHub Actions CI/CD** - Automated testing & security scanning
18. ✅ **Docker image registry** - Container versioning

## Tools & Technologies Used

### Development
- **Node.js** - Runtime
- **TypeScript** - Type safety
- **Docker** - Containerization
- **Docker Compose** - Orchestration

### DevOps & Automation
- **Husky** - Git hooks
- **lint-staged** - Pre-commit linting
- **GitHub Actions** - CI/CD pipeline
- **Makefile** - Task automation

### Databases & Services
- **MongoDB 7** - Document database
- **Express.js** - Web framework
- **Mongoose** - MongoDB ODM

### Quality & Security
- **TypeScript compiler** - Type checking
- **npm audit** - Vulnerability scanning
- **Docker best practices** - Security scanning

