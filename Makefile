# =============================================================================
# E-commerce Microservices - Makefile
# =============================================================================
# Comprehensive Docker and development automation commands
# =============================================================================

# Default shell
SHELL := /bin/bash

# Project configuration
PROJECT_NAME := ecommerce
DOCKER_DIR := docker
COMPOSE_DEV := $(DOCKER_DIR)/compose.development.yaml
COMPOSE_PROD := $(DOCKER_DIR)/compose.production.yaml

# Default mode is development
MODE ?= dev

# Service defaults
SERVICE ?= backend

# Extra arguments
ARGS ?=

# Determine which compose file to use based on MODE
ifeq ($(MODE),prod)
    COMPOSE_FILE := $(COMPOSE_PROD)
    ENV_FILE := .env
else
    COMPOSE_FILE := $(COMPOSE_DEV)
    ENV_FILE := .env
endif

# Docker compose command with proper file and env
DOCKER_COMPOSE := docker compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) -p $(PROJECT_NAME)-$(MODE)

# =============================================================================
# Docker Services:
#   up - Start services (use: make up [service...] or make up MODE=prod, ARGS="--build" for options)
#   down - Stop services (use: make down [service...] or make down MODE=prod, ARGS="--volumes" for options)
#   build - Build containers (use: make build [service...] or make build MODE=prod)
#   logs - View logs (use: make logs [service] or make logs SERVICE=backend, MODE=prod for production)
#   restart - Restart services (use: make restart [service...] or make restart MODE=prod)
#   shell - Open shell in container (use: make shell [service] or make shell SERVICE=gateway, MODE=prod, default: backend)
#   ps - Show running containers (use MODE=prod for production)
# =============================================================================

.PHONY: up down build logs restart shell ps

## Start services
up:
    @echo "🚀 Starting $(MODE) environment..."
    @if [ ! -f .env ]; then \
        echo "⚠️  No .env file found. Creating from .env.example..."; \
        cp .env.example .env 2>/dev/null || echo "❌ No .env.example found. Please create .env file."; \
    fi
    $(DOCKER_COMPOSE) up -d $(ARGS)
    @echo "✅ Services started successfully!"

## Stop services
down:
    @echo "🛑 Stopping $(MODE) environment..."
    $(DOCKER_COMPOSE) down $(ARGS)
    @echo "✅ Services stopped successfully!"

## Build containers
build:
    @echo "🔨 Building $(MODE) containers..."
    $(DOCKER_COMPOSE) build $(ARGS)
    @echo "✅ Build completed successfully!"

## View logs
logs:
    @echo "📋 Showing logs for $(MODE) environment..."
    $(DOCKER_COMPOSE) logs -f $(SERVICE) $(ARGS)

## Restart services
restart:
    @echo "🔄 Restarting $(MODE) environment..."
    $(DOCKER_COMPOSE) restart $(ARGS)
    @echo "✅ Services restarted successfully!"

## Open shell in container
shell:
    @echo "🐚 Opening shell in $(SERVICE) container..."
    $(DOCKER_COMPOSE) exec $(SERVICE) /bin/sh

## Show running containers
ps:
    @echo "📊 Running containers ($(MODE)):"
    $(DOCKER_COMPOSE) ps

# =============================================================================
# Convenience Aliases (Development):
#   dev-up - Alias: Start development environment
#   dev-down - Alias: Stop development environment
#   dev-build - Alias: Build development containers
#   dev-logs - Alias: View development logs
#   dev-restart - Alias: Restart development services
#   dev-shell - Alias: Open shell in backend container
#   dev-ps - Alias: Show running development containers
#   backend-shell - Alias: Open shell in backend container
#   gateway-shell - Alias: Open shell in gateway container
#   mongo-shell - Open MongoDB shell
# =============================================================================

.PHONY: dev-up dev-down dev-build dev-logs dev-restart dev-shell dev-ps
.PHONY: backend-shell gateway-shell mongo-shell

dev-up:
    @$(MAKE) up MODE=dev

dev-down:
    @$(MAKE) down MODE=dev

dev-build:
    @$(MAKE) build MODE=dev

dev-logs:
    @$(MAKE) logs MODE=dev SERVICE=$(SERVICE)

dev-restart:
    @$(MAKE) restart MODE=dev

dev-shell:
    @$(MAKE) shell MODE=dev SERVICE=backend

dev-ps:
    @$(MAKE) ps MODE=dev

backend-shell:
    @$(MAKE) shell MODE=dev SERVICE=backend

gateway-shell:
    @$(MAKE) shell MODE=dev SERVICE=gateway

mongo-shell:
    @echo "🍃 Opening MongoDB shell..."
    @docker compose -f $(COMPOSE_DEV) --env-file .env -p $(PROJECT_NAME)-dev exec mongo mongosh -u admin -p admin_password --authenticationDatabase admin

# =============================================================================
# Convenience Aliases (Production):
#   prod-up - Alias: Start production environment
#   prod-down - Alias: Stop production environment
#   prod-build - Alias: Build production containers
#   prod-logs - Alias: View production logs
#   prod-restart - Alias: Restart production services
# =============================================================================

.PHONY: prod-up prod-down prod-build prod-logs prod-restart

prod-up:
    @$(MAKE) up MODE=prod

prod-down:
    @$(MAKE) down MODE=prod

prod-build:
    @$(MAKE) build MODE=prod

prod-logs:
    @$(MAKE) logs MODE=prod SERVICE=$(SERVICE)

prod-restart:
    @$(MAKE) restart MODE=prod

# =============================================================================
# Backend:
#   backend-build - Build backend TypeScript
#   backend-install - Install backend dependencies
#   backend-type-check - Type check backend code
#   backend-dev - Run backend in development mode (local, not Docker)
# =============================================================================

.PHONY: backend-build backend-install backend-type-check backend-dev

backend-build:
    @echo "🔨 Building backend TypeScript..."
    @cd backend && npm run build
    @echo "✅ Backend build completed!"

backend-install:
    @echo "📦 Installing backend dependencies..."
    @cd backend && npm ci
    @echo "✅ Backend dependencies installed!"

backend-type-check:
    @echo "🔍 Type checking backend code..."
    @cd backend && npm run type-check
    @echo "✅ Type check passed!"

backend-dev:
    @echo "🚀 Starting backend in local development mode..."
    @cd backend && npm run dev

# =============================================================================
# Database:
#   db-reset - Reset MongoDB database (WARNING: deletes all data)
#   db-backup - Backup MongoDB database
# =============================================================================

.PHONY: db-reset db-backup

db-reset:
    @echo "⚠️  WARNING: This will delete all data in the $(MODE) MongoDB database!"
    @read -p "Are you sure? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 1
    @echo "🗑️  Resetting MongoDB..."
    $(DOCKER_COMPOSE) down -v
    @echo "🚀 Restarting services..."
    $(DOCKER_COMPOSE) up -d
    @echo "✅ Database reset completed!"

db-backup:
    @echo "💾 Backing up MongoDB..."
    @mkdir -p backups
    @TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
    docker compose -f $(COMPOSE_FILE) --env-file .env -p $(PROJECT_NAME)-$(MODE) exec -T mongo mongodump --authenticationDatabase admin -u admin -p admin_password --archive > backups/mongodb_backup_$$TIMESTAMP.archive
    @echo "✅ Backup saved to backups/ directory!"

# =============================================================================
# Cleanup:
#   clean - Remove containers and networks (both dev and prod)
#   clean-all - Remove containers, networks, volumes, and images
#   clean-volumes - Remove all volumes
# =============================================================================

.PHONY: clean clean-all clean-volumes

clean:
    @echo "🧹 Cleaning up containers and networks..."
    @docker compose -f $(COMPOSE_DEV) --env-file .env -p $(PROJECT_NAME)-dev down --remove-orphans 2>/dev/null || true
    @docker compose -f $(COMPOSE_PROD) --env-file .env -p $(PROJECT_NAME)-prod down --remove-orphans 2>/dev/null || true
    @echo "✅ Cleanup completed!"

clean-all:
    @echo "🧹 Cleaning up everything (containers, networks, volumes, images)..."
    @docker compose -f $(COMPOSE_DEV) --env-file .env -p $(PROJECT_NAME)-dev down -v --rmi all --remove-orphans 2>/dev/null || true
    @docker compose -f $(COMPOSE_PROD) --env-file .env -p $(PROJECT_NAME)-prod down -v --rmi all --remove-orphans 2>/dev/null || true
    @echo "✅ Full cleanup completed!"

clean-volumes:
    @echo "🗑️  Removing all project volumes..."
    @docker volume rm $(PROJECT_NAME)-dev_mongo-data-dev 2>/dev/null || true
    @docker volume rm $(PROJECT_NAME)-prod_mongo-data-prod 2>/dev/null || true
    @docker volume rm ecommerce-mongo-data-dev 2>/dev/null || true
    @docker volume rm ecommerce-mongo-data-prod 2>/dev/null || true
    @echo "✅ Volumes removed!"

# =============================================================================
# Utilities:
#   status - Alias for ps
#   health - Check service health
# =============================================================================

.PHONY: status health

status:
    @$(MAKE) ps MODE=$(MODE)

health:
    @echo "🏥 Checking service health..."
    @echo ""
    @echo "Gateway Health:"
    @curl -s http://localhost:5921/health || echo "❌ Gateway not responding"
    @echo ""
    @echo ""
    @echo "Backend Health (via Gateway):"
    @curl -s http://localhost:5921/api/health || echo "❌ Backend not responding"
    @echo ""
    @echo ""
    @echo "Security Check (Backend should NOT be directly accessible):"
    @curl -s --connect-timeout 2 http://localhost:3847/api/health && echo "⚠️  WARNING: Backend is directly accessible!" || echo "✅ Backend is properly isolated"

# =============================================================================
# Monitoring Infrastructure:
#   prometheus-logs - View Prometheus logs
#   grafana-logs - View Grafana logs
#   elasticsearch-logs - View Elasticsearch logs
#   kibana-logs - View Kibana logs
#   sentry-logs - View Sentry logs
#   minio-logs - View MinIO logs
# =============================================================================

.PHONY: prometheus-logs grafana-logs elasticsearch-logs kibana-logs sentry-logs minio-logs

prometheus-logs:
    @$(MAKE) logs MODE=$(MODE) SERVICE=prometheus

grafana-logs:
    @$(MAKE) logs MODE=$(MODE) SERVICE=grafana

elasticsearch-logs:
    @$(MAKE) logs MODE=$(MODE) SERVICE=elasticsearch

kibana-logs:
    @$(MAKE) logs MODE=$(MODE) SERVICE=kibana

sentry-logs:
    @$(MAKE) logs MODE=$(MODE) SERVICE=sentry

minio-logs:
    @$(MAKE) logs MODE=$(MODE) SERVICE=minio

# =============================================================================
# Infrastructure Verification:
#   infrastructure-test - Test all infrastructure services
#   verify-endpoints - Verify all service endpoints
#   check-metrics - Check Prometheus metrics
#   check-logs - Check Elasticsearch logs
# =============================================================================

.PHONY: infrastructure-test verify-endpoints check-metrics check-logs

infrastructure-test:
    @echo "🔍 Testing Infrastructure Services"
    @echo ""
    @echo "Gateway:"
    @curl -s http://localhost:5921/health | jq . || echo "❌ Gateway not responding"
    @echo ""
    @echo "Backend (via Gateway):"
    @curl -s http://localhost:5921/api/health | jq . || echo "❌ Backend not responding"
    @echo ""
    @echo "Prometheus:"
    @curl -s http://localhost:9090/-/healthy && echo "✓ Prometheus healthy" || echo "❌ Prometheus not responding"
    @echo ""
    @echo "Grafana:"
    @curl -s http://localhost:3000/api/health | jq . || echo "❌ Grafana not responding"
    @echo ""
    @echo "Elasticsearch:"
    @curl -s http://localhost:9200/_cluster/health | jq . || echo "❌ Elasticsearch not responding"
    @echo ""
    @echo "Kibana:"
    @curl -s http://localhost:5601/api/status | jq . || echo "❌ Kibana not responding"
    @echo ""
    @echo "Sentry:"
    @curl -s http://localhost:9000/_health/ | jq . || echo "❌ Sentry not responding"
    @echo ""
    @echo "MinIO:"
    @curl -s http://localhost:9000/minio/health/live && echo "✓ MinIO healthy" || echo "❌ MinIO not responding"

verify-endpoints:
    @echo "🔗 Verifying All Endpoints"
    @echo ""
    @echo "API Endpoints:"
    @echo "  Gateway: http://localhost:5921"
    @echo "  Health: curl http://localhost:5921/health"
    @echo "  Metrics: curl http://localhost:5921/metrics"
    @echo ""
    @echo "Monitoring Dashboards:"
    @echo "  Grafana: http://localhost:3000 (admin/admin)"
    @echo "  Prometheus: http://localhost:9090"
    @echo "  Kibana: http://localhost:5601"
    @echo "  Sentry: http://localhost:9000"
    @echo "  MinIO: http://localhost:9001"
    @echo ""
    @echo "Backend Endpoints (internal only):"
    @echo "  Health: http://localhost:3847/api/health"
    @echo "  Metrics: http://localhost:3847/metrics"
    @echo "  Products: http://localhost:3847/api/products"

check-metrics:
    @echo "📊 Checking Prometheus Metrics"
    @curl -s 'http://localhost:9090/api/v1/query?query=up' | jq '.data.result[]' || echo "Failed to query metrics"

check-logs:
    @echo "📝 Checking Elasticsearch Indices"
    @curl -s http://localhost:9200/_cat/indices | grep -E 'backend-logs|gateway-logs' || echo "No logs found"

# =============================================================================
# Testing:
#   test - Run health checks (alias for health)
#   test-infrastructure - Run infrastructure tests
#   test-api - Test API endpoints
#   load-test - Run simple load test
# =============================================================================

.PHONY: test-infrastructure test-api load-test

test-infrastructure: infrastructure-test

test-api:
    @echo "🧪 Testing API Endpoints"
    @echo ""
    @echo "Testing GET /health"
    @curl -s http://localhost:5921/health
    @echo ""
    @echo ""
    @echo "Testing GET /api/health"
    @curl -s http://localhost:5921/api/health
    @echo ""
    @echo ""
    @echo "Testing GET /api/products"
    @curl -s http://localhost:5921/api/products
    @echo ""
    @echo ""
    @echo "Testing POST /api/products"
    @curl -s -X POST http://localhost:5921/api/products \
        -H 'Content-Type: application/json' \
        -d '{"name":"Test Product","price":99.99}'
    @echo ""
    @echo ""
    @echo "✅ API tests complete"

load-test:
    @echo "⚡ Running Load Test (100 requests, 10 concurrent)"
    @which ab > /dev/null || (echo "Apache Bench not found. Install with: sudo apt-get install apache2-utils" && exit 1)
    @ab -n 100 -c 10 http://localhost:5921/api/health

# =============================================================================
# Help:
#   help - Display this help message
# =============================================================================

.PHONY: help

help:
    @echo "============================================================================="
    @echo "E-commerce Microservices with Critical Infrastructure - Available Commands"
    @echo "============================================================================="
    @echo ""
    @echo "🐳 Docker Services:"
    @echo "  make up              - Start services (MODE=dev|prod, ARGS=--build)"
    @echo "  make down            - Stop services (MODE=dev|prod, ARGS=--volumes)"
    @echo "  make build           - Build containers (MODE=dev|prod)"
    @echo "  make logs            - View logs (SERVICE=backend|gateway|mongo)"
    @echo "  make restart         - Restart services"
    @echo "  make shell           - Open shell (SERVICE=backend|gateway|mongo)"
    @echo "  make ps              - Show running containers"
    @echo ""
    @echo "🔧 Development Shortcuts:"
    @echo "  make dev-up          - Start development environment"
    @echo "  make dev-down        - Stop development environment"
    @echo "  make dev-build       - Build development containers"
    @echo "  make dev-logs        - View development logs"
    @echo "  make dev-restart     - Restart development services"
    @echo "  make dev-shell       - Open shell in backend container"
    @echo "  make backend-shell   - Open shell in backend container"
    @echo "  make gateway-shell   - Open shell in gateway container"
    @echo "  make mongo-shell     - Open MongoDB shell"
    @echo ""
    @echo "🚀 Production Shortcuts:"
    @echo "  make prod-up         - Start production environment"
    @echo "  make prod-down       - Stop production environment"
    @echo "  make prod-build      - Build production containers"
    @echo "  make prod-logs       - View production logs"
    @echo "  make prod-restart    - Restart production services"
    @echo ""
    @echo "📦 Backend:"
    @echo "  make backend-build   - Build backend TypeScript"
    @echo "  make backend-install - Install backend dependencies"
    @echo "  make backend-type-check - Type check backend code"
    @echo "  make backend-dev     - Run backend locally (not Docker)"
    @echo ""
    @echo "🗄️  Database:"
    @echo "  make db-reset        - Reset MongoDB (WARNING: deletes data)"
    @echo "  make db-backup       - Backup MongoDB database"
    @echo ""
    @echo "📊 Monitoring & Infrastructure:"
    @echo "  make infrastructure-test - Test all infrastructure services"
    @echo "  make verify-endpoints    - Verify all service endpoints & URLs"
    @echo "  make check-metrics       - Check Prometheus metrics"
    @echo "  make check-logs          - Check Elasticsearch logs"
    @echo "  make prometheus-logs     - View Prometheus logs"
    @echo "  make grafana-logs        - View Grafana logs"
    @echo "  make elasticsearch-logs  - View Elasticsearch logs"
    @echo "  make kibana-logs         - View Kibana logs"
    @echo "  make sentry-logs         - View Sentry logs"
    @echo "  make minio-logs          - View MinIO logs"
    @echo ""
    @echo "🧪 Testing:"
    @echo "  make health              - Check all service health"
    @echo "  make test                - Run health checks"
    @echo "  make test-infrastructure - Run infrastructure tests"
    @echo "  make test-api            - Test API endpoints"
    @echo "  make load-test           - Run simple load test"
    @echo ""
    @echo "🧹 Cleanup:"
    @echo "  make clean           - Remove containers and networks"
    @echo "  make clean-all       - Remove everything (containers, volumes, images)"
    @echo "  make clean-volumes   - Remove all volumes"
    @echo ""
    @echo "🔍 Utilities:"
    @echo "  make status          - Show container status"
    @echo "  make help            - Show this help message"
    @echo ""
    @echo "============================================================================="
    @echo ""
    @echo "📚 Documentation:"
    @echo "  - README.md          - Project overview"
    @echo "  - SOLUTION.md        - Architecture & best practices"
    @echo "  - INFRASTRUCTURE.md  - Critical infrastructure setup guide"
    @echo "  - TESTING.md         - Testing & CI/CD guide"
    @echo "  - CI-CD-SETUP.md     - CI/CD pipeline configuration"
    @echo ""
    @echo "============================================================================="

# Default target
.DEFAULT_GOAL := help

