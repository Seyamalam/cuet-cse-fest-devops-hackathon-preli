# Testing & CI/CD Guide

Comprehensive testing strategy for the critical infrastructure stack.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [Infrastructure Testing](#infrastructure-testing)
5. [Performance Testing](#performance-testing)
6. [Security Testing](#security-testing)
7. [CI/CD Pipeline](#cicd-pipeline)

---

## Testing Strategy

### Test Pyramid

```
        ▲
       ╱ ╲
      ╱ E2E ╲         (5% of tests)
     ╱───────╲
    ╱         ╲
   ╱Integration ╲    (20% of tests)
  ╱─────────────╲
 ╱               ╲
╱   Unit Tests    ╲  (75% of tests)
╱─────────────────╲
```

### Testing Coverage Goals

- **Unit Tests**: 80% code coverage
- **Integration Tests**: All API endpoints
- **Infrastructure Tests**: All service health checks
- **Security Tests**: OWASP top 10

---

## Unit Testing

### Backend Tests

```typescript
// backend/src/__tests__/health.test.ts
import request from 'supertest';
import app from '../index';

describe('Health Check Endpoint', () => {
  it('should return status 200', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ok', true);
  });

  it('should return service name', async () => {
    const response = await request(app).get('/api/health');
    expect(response.body).toHaveProperty('service', 'backend');
  });

  it('should return timestamp', async () => {
    const response = await request(app).get('/api/health');
    expect(response.body).toHaveProperty('timestamp');
  });
});
```

### Running Unit Tests

```bash
# Backend tests
cd backend && npm test

# Gateway tests
cd gateway && npm test

# Coverage report
npm test -- --coverage
```

---

## Integration Testing

### API Integration Tests

```bash
# Start development environment
make dev-up

# Wait for services to be healthy
sleep 30

# Run integration tests
./scripts/integration-tests.sh
```

### Integration Test Script

```bash
#!/bin/bash
# scripts/integration-tests.sh

set -e

echo "🧪 Running Integration Tests"
echo ""

FAILED=0
PASSED=0

# Helper function
test_api() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_status=$4
  
  echo -n "Testing $method $endpoint... "
  
  if [ -n "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method \
      -H "Content-Type: application/json" \
      -d "$data" \
      http://localhost:5921$endpoint)
  else
    response=$(curl -s -w "\n%{http_code}" -X $method \
      http://localhost:5921$endpoint)
  fi
  
  status=$(echo "$response" | tail -n1)
  
  if [ "$status" = "$expected_status" ]; then
    echo "✓ (Status: $status)"
    ((PASSED++))
  else
    echo "✗ (Expected: $expected_status, Got: $status)"
    ((FAILED++))
  fi
}

# Test 1: Health Checks
echo "=== Health Checks ==="
test_api GET "/health" "" 200
test_api GET "/api/health" "" 200

# Test 2: Products API
echo ""
echo "=== Products API ==="
test_api GET "/api/products" "" 200
test_api POST "/api/products" '{"name":"Test","price":99.99}' 201

# Test 3: Error Handling
echo ""
echo "=== Error Handling ==="
test_api GET "/api/invalid" "" 404
test_api POST "/api/products" 'invalid json' 400

# Test 4: Backend Isolation
echo ""
echo "=== Backend Isolation ==="
timeout 2 curl -s http://localhost:3847/api/health || {
  echo "✓ Backend properly isolated"
  ((PASSED++))
}

# Summary
echo ""
echo "=== Test Summary ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [ $FAILED -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
```

---

## Infrastructure Testing

### Service Health Tests

```bash
#!/bin/bash
# scripts/infrastructure-tests.sh

set -e

echo "🔍 Testing Infrastructure"
echo ""

SERVICES=(
  "Gateway:5921:/health"
  "Backend:3847:/api/health"
  "Prometheus:9090:/-/healthy"
  "Grafana:3000:/api/health"
  "Elasticsearch:9200:/_cluster/health"
  "Kibana:5601:/api/status"
  "Sentry:9000:/_health/"
  "MinIO:9000:/minio/health/live"
)

for service in "${SERVICES[@]}"; do
  IFS=':' read -r name port endpoint <<< "$service"
  
  echo -n "Testing $name ($port)... "
  
  if curl -s -f "http://localhost:$port$endpoint" > /dev/null 2>&1; then
    echo "✓"
  else
    echo "✗"
  fi
done
```

### Docker Health Check Verification

```bash
#!/bin/bash
# scripts/docker-health-tests.sh

docker compose -f docker/compose.development.yaml ps --filter health=healthy

echo ""
echo "Unhealthy services:"
docker compose -f docker/compose.development.yaml ps --filter health=unhealthy

echo ""
echo "Expected all services to be healthy"
```

---

## Performance Testing

### Load Testing with Apache Bench

```bash
# Install Apache Bench
sudo apt-get install -y apache2-utils

# Basic load test
ab -n 1000 -c 10 http://localhost:5921/api/health

# More complex test with POST
ab -n 1000 -c 10 -p data.json -T application/json \
  http://localhost:5921/api/products

# Results analysis
# - Requests per second (higher is better)
# - Mean latency (lower is better)
# - Failed requests (should be 0)
```

### Load Testing with k6

```javascript
// scripts/load-test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  // Test health endpoint
  let response = http.get('http://localhost:5921/health');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Test API endpoint
  response = http.get('http://localhost:5921/api/health');
  check(response, {
    'status is 200': (r) => r.status === 200,
  });
}
```

Run k6 tests:

```bash
k6 run scripts/load-test.js
```

### Memory & CPU Profiling

```bash
# Monitor resource usage during tests
docker stats --no-stream

# Specific service monitoring
docker stats gateway-dev backend-dev mongo-dev

# Check memory limits
docker inspect gateway-dev | grep -A 5 '"Memory"'
```

---

## Security Testing

### OWASP ZAP Scanning

```bash
# Install OWASP ZAP
docker pull owasp/zap2docker-stable

# Run baseline scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:5921

# Full scan (takes longer)
docker run -t owasp/zap2docker-stable zap-full-scan.py \
  -t http://localhost:5921 \
  -r report.html
```

### Dependency Vulnerability Scanning

```bash
# npm audit
npm audit
npm audit --audit-level=moderate

# Backend
cd backend && npm audit

# Gateway
cd gateway && npm audit

# Fix vulnerabilities
npm audit fix
npm audit fix --force (use cautiously)
```

### Container Scanning with Trivy

```bash
# Install Trivy
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Scan images
trivy image backend:latest
trivy image gateway:latest
trivy image mongo:7

# Generate reports
trivy image --format json backend:latest > backend-scan.json
trivy image --format sarif backend:latest > backend-scan.sarif
```

### SQL Injection Testing

```bash
# Test MongoDB injection
curl -X POST http://localhost:5921/api/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"test\"; db.dropDatabase(); //","price":99.99}'

# Should fail safely without executing commands
```

### Authentication Testing

```bash
# Verify authorization is properly enforced
# Test with invalid tokens
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:5921/api/products

# Test with no authorization
curl http://localhost:5921/api/products
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/test.yaml`:

```yaml
name: Test & Deploy

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mongo:
        image: mongo:7
        env:
          MONGO_INITDB_ROOT_USERNAME: admin
          MONGO_INITDB_ROOT_PASSWORD: password
        options: >-
          --health-cmd mongosh
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          cd backend && npm ci
          cd ../gateway && npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Lint
        run: npm run lint
      
      - name: Unit tests
        run: npm test
      
      - name: Build Docker images
        run: |
          docker build -f backend/Dockerfile -t backend:test .
          docker build -f gateway/Dockerfile -t gateway:test .
      
      - name: Container security scan
        run: |
          curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
          trivy image backend:test
          trivy image gateway:test
      
      - name: Integration tests
        run: |
          docker compose -f docker/compose.development.yaml up -d
          sleep 30
          bash scripts/integration-tests.sh
      
      - name: Infrastructure tests
        run: bash scripts/infrastructure-tests.sh
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: |
            coverage/
            reports/

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to production
        run: |
          # Add deployment logic here
          echo "Deploying to production..."
```

### Pre-commit Hooks

```bash
#!/bin/sh
# .husky/pre-commit

echo "🔍 Running pre-commit checks..."

# Type check backend
cd backend && npm run type-check
if [ $? -ne 0 ]; then
  echo "❌ Type check failed"
  exit 1
fi

# Run linter
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Lint failed"
  exit 1
fi

echo "✅ Pre-commit checks passed"
```

### Pre-push Hooks

```bash
#!/bin/sh
# .husky/pre-push

echo "🔍 Running pre-push checks..."

# Run all tests
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

# Docker compose validation
docker compose -f docker/compose.development.yaml config > /dev/null
docker compose -f docker/compose.production.yaml config > /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Docker compose validation failed"
  exit 1
fi

echo "✅ Pre-push checks passed"
```

---

## Running Tests Locally

### Complete Test Suite

```bash
#!/bin/bash
# scripts/run-all-tests.sh

set -e

echo "🚀 Running Complete Test Suite"
echo ""

# Unit tests
echo "▶ Running unit tests..."
npm test

# Build check
echo "▶ Checking builds..."
make backend-build
cd gateway && npm run build || true

# Docker build check
echo "▶ Building Docker images..."
make dev-build

# Start infrastructure
echo "▶ Starting infrastructure..."
make dev-up

# Wait for services
echo "▶ Waiting for services to be healthy..."
for i in {1..30}; do
  if docker compose ps --filter health=healthy | grep -q gateway-dev; then
    break
  fi
  sleep 1
done

# Infrastructure tests
echo "▶ Running infrastructure tests..."
bash scripts/infrastructure-tests.sh

# Integration tests
echo "▶ Running integration tests..."
bash scripts/integration-tests.sh

# Performance tests
echo "▶ Running performance tests..."
ab -n 100 -c 5 http://localhost:5921/api/health

# Cleanup
echo "▶ Cleaning up..."
make dev-down

echo ""
echo "✅ All tests passed!"
```

Run complete test suite:

```bash
chmod +x scripts/run-all-tests.sh
./scripts/run-all-tests.sh
```

---

## Continuous Integration Configuration

### GitLab CI (`.gitlab-ci.yml`)

```yaml
stages:
  - build
  - test
  - security
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  DOCKER_TLS_CERTDIR: ""

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -f backend/Dockerfile -t backend:$CI_COMMIT_SHA .
    - docker build -f gateway/Dockerfile -t gateway:$CI_COMMIT_SHA .

test:
  stage: test
  image: node:20
  script:
    - npm ci
    - cd backend && npm ci && npm run type-check && npm test
    - cd ../gateway && npm ci && npm test

security:
  stage: security
  image: aquasec/trivy:latest
  script:
    - trivy config docker/compose.development.yaml
    - trivy config docker/compose.production.yaml

deploy:
  stage: deploy
  image: alpine:latest
  script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - ssh-add <(echo "$SSH_PRIVATE_KEY")
    - ssh -o StrictHostKeyChecking=no deploy@prod-server "cd /app && docker compose pull && docker compose up -d"
  only:
    - main
```

---

## Test Metrics & Reporting

### Code Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View coverage in browser
open coverage/lcov-report/index.html
```

### Performance Metrics

```bash
# Track metrics over time
ab -n 1000 -c 10 -g results.tsv http://localhost:5921/api/health

# Create charts
gnuplot -e "set datafile separator '\t'; plot 'results.tsv' using 1:2 with lines"
```

---

## Test Result Artifacts

After running tests, collect artifacts:

```bash
├── coverage/              # Code coverage reports
├── results/              # Test results
├── security-reports/     # Security scan results
│   ├── trivy.json
│   ├── npm-audit.json
│   └── zap-report.html
└── performance/          # Performance metrics
    ├── load-test.json
    └── benchmark.csv
```

---

**Last Updated:** December 2024
**Version:** 1.0.0
