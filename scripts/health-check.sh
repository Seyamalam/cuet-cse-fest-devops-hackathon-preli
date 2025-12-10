#!/bin/bash
# =============================================================================
# Health Check Script
# =============================================================================
# Comprehensive health check for all infrastructure services
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
GATEWAY_PORT=${GATEWAY_PORT:-5921}
PROMETHEUS_PORT=${PROMETHEUS_PORT:-9090}
GRAFANA_PORT=${GRAFANA_PORT:-3000}
ELASTICSEARCH_PORT=${ELASTICSEARCH_PORT:-9200}
KIBANA_PORT=${KIBANA_PORT:-5601}
MINIO_PORT=${MINIO_API_PORT:-9000}
ALERTMANAGER_PORT=${ALERTMANAGER_PORT:-9093}

# Health check results
declare -A RESULTS

check_service() {
    local name=$1
    local url=$2
    local timeout=${3:-5}
    
    if curl -sf --max-time "$timeout" "$url" > /dev/null 2>&1; then
        RESULTS[$name]="✅ Healthy"
        return 0
    else
        RESULTS[$name]="❌ Unhealthy"
        return 1
    fi
}

check_docker_container() {
    local name=$1
    
    if docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null | grep -q "healthy"; then
        RESULTS["$name (container)"]="✅ Healthy"
        return 0
    elif docker inspect --format='{{.State.Running}}' "$name" 2>/dev/null | grep -q "true"; then
        RESULTS["$name (container)"]="⚠️ Running (no health check)"
        return 0
    else
        RESULTS["$name (container)"]="❌ Not running"
        return 1
    fi
}

print_header() {
    echo ""
    echo "============================================================================="
    echo "Infrastructure Health Check"
    echo "============================================================================="
    echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    echo "============================================================================="
    echo ""
}

print_section() {
    echo ""
    echo "--- $1 ---"
}

print_results() {
    echo ""
    echo "============================================================================="
    echo "Health Check Summary"
    echo "============================================================================="
    
    local healthy=0
    local unhealthy=0
    
    for service in "${!RESULTS[@]}"; do
        printf "%-30s %s\n" "$service:" "${RESULTS[$service]}"
        if [[ "${RESULTS[$service]}" == *"Healthy"* ]] || [[ "${RESULTS[$service]}" == *"Running"* ]]; then
            ((healthy++))
        else
            ((unhealthy++))
        fi
    done
    
    echo ""
    echo "============================================================================="
    echo "Total: $((healthy + unhealthy)) services | ✅ Healthy: $healthy | ❌ Unhealthy: $unhealthy"
    echo "============================================================================="
    
    if [ $unhealthy -gt 0 ]; then
        echo ""
        echo -e "${RED}WARNING: Some services are unhealthy!${NC}"
        exit 1
    else
        echo ""
        echo -e "${GREEN}All services are healthy!${NC}"
        exit 0
    fi
}

main() {
    print_header
    
    print_section "Application Services"
    check_service "Gateway" "http://localhost:$GATEWAY_PORT/health" || true
    check_service "Backend (via Gateway)" "http://localhost:$GATEWAY_PORT/api/health" || true
    
    print_section "Monitoring Services"
    check_service "Prometheus" "http://localhost:$PROMETHEUS_PORT/-/healthy" || true
    check_service "Grafana" "http://localhost:$GRAFANA_PORT/api/health" || true
    check_service "Alertmanager" "http://localhost:$ALERTMANAGER_PORT/-/healthy" || true
    
    print_section "Logging Services"
    check_service "Elasticsearch" "http://localhost:$ELASTICSEARCH_PORT/_cluster/health" || true
    check_service "Kibana" "http://localhost:$KIBANA_PORT/api/status" || true
    
    print_section "Storage Services"
    check_service "MinIO" "http://localhost:$MINIO_PORT/minio/health/live" || true
    
    print_section "Docker Containers"
    check_docker_container "gateway" || true
    check_docker_container "backend" || true
    check_docker_container "mongo" || true
    check_docker_container "prometheus" || true
    check_docker_container "grafana" || true
    check_docker_container "elasticsearch" || true
    check_docker_container "kibana" || true
    check_docker_container "minio" || true
    
    print_results
}

main "$@"
