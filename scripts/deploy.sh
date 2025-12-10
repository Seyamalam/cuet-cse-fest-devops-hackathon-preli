#!/bin/bash
# =============================================================================
# AWS VM Deployment Script
# =============================================================================
# Critical Infrastructure Deployment
# =============================================================================
# Usage: ./deploy.sh [environment]
# Example: ./deploy.sh production
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
LOG_FILE="/var/log/ecommerce-deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message=$*
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() { log "INFO" "${GREEN}$*${NC}"; }
warn() { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    # Check if running as root or with docker group
    if ! docker info &> /dev/null; then
        error "Cannot connect to Docker. Please run as root or add user to docker group."
        exit 1
    }

    # Check .env file
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        warn ".env file not found. Creating from .env.example..."
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        warn "Please edit .env with your actual credentials before continuing."
        exit 1
    fi

    info "All prerequisites met ✓"
}

# Create necessary directories
setup_directories() {
    info "Setting up directories..."

    # Create data directories
    sudo mkdir -p /var/lib/ecommerce/{mongo,prometheus,grafana,elasticsearch,minio,alertmanager}
    sudo chown -R 1000:1000 /var/lib/ecommerce/grafana
    sudo chown -R 1000:1000 /var/lib/ecommerce/prometheus
    sudo chown -R 1000:1000 /var/lib/ecommerce/alertmanager

    # Create log directories
    sudo mkdir -p /var/log/ecommerce
    sudo chmod 755 /var/log/ecommerce

    info "Directories created ✓"
}

# Configure system settings
configure_system() {
    info "Configuring system settings..."

    # Increase virtual memory for Elasticsearch
    if [[ $(sysctl -n vm.max_map_count) -lt 262144 ]]; then
        warn "Increasing vm.max_map_count for Elasticsearch..."
        sudo sysctl -w vm.max_map_count=262144
        echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
    fi

    # Increase file descriptors
    if [[ $(ulimit -n) -lt 65536 ]]; then
        warn "Increasing file descriptor limits..."
        echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
        echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
    fi

    info "System configured ✓"
}

# Pull latest images
pull_images() {
    info "Pulling latest Docker images..."

    cd "$PROJECT_ROOT"
    docker compose -f docker/compose.infrastructure.yaml pull

    info "Images pulled ✓"
}

# Build application images
build_images() {
    info "Building application images..."

    cd "$PROJECT_ROOT"
    docker compose -f docker/compose.infrastructure.yaml build --no-cache

    info "Images built ✓"
}

# Deploy the stack
deploy_stack() {
    info "Deploying the infrastructure stack..."

    cd "$PROJECT_ROOT"

    # Stop existing containers if any
    docker compose -f docker/compose.infrastructure.yaml down --remove-orphans 2>/dev/null || true

    # Start the stack
    docker compose -f docker/compose.infrastructure.yaml up -d

    info "Stack deployed ✓"
}

# Wait for services to be healthy
wait_for_services() {
    info "Waiting for services to become healthy..."

    local max_attempts=60
    local attempt=1

    while [[ $attempt -le $max_attempts ]]; do
        local healthy_count=$(docker compose -f docker/compose.infrastructure.yaml ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || echo 0)
        local total_count=$(docker compose -f docker/compose.infrastructure.yaml ps -q 2>/dev/null | wc -l)

        if [[ $healthy_count -ge 3 ]]; then
            info "Services are healthy ($healthy_count services) ✓"
            return 0
        fi

        warn "Waiting for services to be healthy... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done

    error "Services did not become healthy within timeout"
    docker compose -f docker/compose.infrastructure.yaml logs --tail=50
    return 1
}

# Verify deployment
verify_deployment() {
    info "Verifying deployment..."

    local gateway_port=${GATEWAY_PORT:-5921}
    local grafana_port=${GRAFANA_PORT:-3000}
    local prometheus_port=${PROMETHEUS_PORT:-9090}

    # Check Gateway
    if curl -sf "http://localhost:$gateway_port/health" > /dev/null; then
        info "Gateway health check passed ✓"
    else
        error "Gateway health check failed"
        return 1
    fi

    # Check Backend via Gateway
    if curl -sf "http://localhost:$gateway_port/api/health" > /dev/null; then
        info "Backend health check passed ✓"
    else
        error "Backend health check failed"
        return 1
    fi

    # Check Prometheus
    if curl -sf "http://localhost:$prometheus_port/-/healthy" > /dev/null; then
        info "Prometheus health check passed ✓"
    else
        warn "Prometheus health check failed (may not be running)"
    fi

    # Check Grafana
    if curl -sf "http://localhost:$grafana_port/api/health" > /dev/null; then
        info "Grafana health check passed ✓"
    else
        warn "Grafana health check failed (may not be running)"
    fi

    info "Deployment verification complete ✓"
}

# Print access information
print_access_info() {
    local gateway_port=${GATEWAY_PORT:-5921}
    local grafana_port=${GRAFANA_PORT:-3000}
    local prometheus_port=${PROMETHEUS_PORT:-9090}
    local kibana_port=${KIBANA_PORT:-5601}
    local minio_console_port=${MINIO_CONSOLE_PORT:-9001}

    echo ""
    echo "============================================================================="
    echo "Deployment Complete!"
    echo "============================================================================="
    echo ""
    echo "Service Access URLs:"
    echo "  - Gateway API:      http://localhost:$gateway_port"
    echo "  - Gateway Health:   http://localhost:$gateway_port/health"
    echo "  - Backend Health:   http://localhost:$gateway_port/api/health"
    echo ""
    echo "Monitoring:"
    echo "  - Grafana:          http://localhost:$grafana_port (admin / ${GRAFANA_ADMIN_PASSWORD:-admin_password})"
    echo "  - Prometheus:       http://localhost:$prometheus_port"
    echo "  - Kibana:           http://localhost:$kibana_port"
    echo "  - Alertmanager:     http://localhost:9093"
    echo ""
    echo "Storage:"
    echo "  - MinIO Console:    http://localhost:$minio_console_port"
    echo ""
    echo "Useful Commands:"
    echo "  - View logs:        make logs MODE=prod"
    echo "  - Stop services:    make prod-down"
    echo "  - Restart:          make prod-restart"
    echo "  - Health check:     make health"
    echo ""
    echo "============================================================================="
}

# Main deployment function
main() {
    info "Starting deployment for environment: $ENVIRONMENT"

    check_prerequisites
    setup_directories
    configure_system
    pull_images
    build_images
    deploy_stack
    wait_for_services
    verify_deployment
    print_access_info

    info "Deployment completed successfully!"
}

# Run main function
main "$@"
