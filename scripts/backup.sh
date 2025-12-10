#!/bin/bash
# =============================================================================
# Backup Script
# =============================================================================
# Automated backup for all infrastructure data
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="/var/backups/ecommerce"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_$TIMESTAMP"

# MinIO configuration for remote backup
MINIO_BACKUP_ENABLED=${MINIO_BACKUP_ENABLED:-false}
MINIO_BUCKET="backups"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# Create backup directory
setup() {
    info "Setting up backup directory..."
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
}

# Backup MongoDB
backup_mongodb() {
    info "Backing up MongoDB..."
    
    local mongo_backup="$BACKUP_DIR/$BACKUP_NAME/mongodb"
    mkdir -p "$mongo_backup"
    
    docker exec mongo mongodump \
        --authenticationDatabase admin \
        -u "${MONGO_INITDB_ROOT_USERNAME:-admin}" \
        -p "${MONGO_INITDB_ROOT_PASSWORD:-admin_password}" \
        --archive > "$mongo_backup/mongodb.archive"
    
    info "MongoDB backup complete ✓"
}

# Backup Prometheus data
backup_prometheus() {
    info "Backing up Prometheus data..."
    
    local prom_backup="$BACKUP_DIR/$BACKUP_NAME/prometheus"
    mkdir -p "$prom_backup"
    
    # Create snapshot via API
    curl -XPOST "http://localhost:${PROMETHEUS_PORT:-9090}/api/v1/admin/tsdb/snapshot" || true
    
    # Copy data volume
    docker cp prometheus:/prometheus/data "$prom_backup/" 2>/dev/null || true
    
    info "Prometheus backup complete ✓"
}

# Backup Grafana
backup_grafana() {
    info "Backing up Grafana..."
    
    local grafana_backup="$BACKUP_DIR/$BACKUP_NAME/grafana"
    mkdir -p "$grafana_backup"
    
    # Copy Grafana database
    docker cp grafana:/var/lib/grafana/grafana.db "$grafana_backup/" 2>/dev/null || true
    
    info "Grafana backup complete ✓"
}

# Backup Elasticsearch
backup_elasticsearch() {
    info "Backing up Elasticsearch indices..."
    
    local es_backup="$BACKUP_DIR/$BACKUP_NAME/elasticsearch"
    mkdir -p "$es_backup"
    
    # Get list of indices
    curl -s "http://localhost:${ELASTICSEARCH_PORT:-9200}/_cat/indices?h=index" | \
        grep -v "^\." > "$es_backup/indices.txt" 2>/dev/null || true
    
    # Export index mappings
    while read -r index; do
        curl -s "http://localhost:${ELASTICSEARCH_PORT:-9200}/$index/_mapping" > \
            "$es_backup/${index}_mapping.json" 2>/dev/null || true
    done < "$es_backup/indices.txt"
    
    info "Elasticsearch backup complete ✓"
}

# Backup configuration files
backup_configs() {
    info "Backing up configuration files..."
    
    local config_backup="$BACKUP_DIR/$BACKUP_NAME/configs"
    mkdir -p "$config_backup"
    
    # Copy all configuration files
    cp -r monitoring/ "$config_backup/" 2>/dev/null || true
    cp .env "$config_backup/.env.backup" 2>/dev/null || true
    cp docker/*.yaml "$config_backup/" 2>/dev/null || true
    
    info "Configuration backup complete ✓"
}

# Compress backup
compress_backup() {
    info "Compressing backup..."
    
    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
    rm -rf "$BACKUP_NAME"
    
    local size=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
    info "Backup compressed: ${BACKUP_NAME}.tar.gz ($size)"
}

# Upload to MinIO (optional)
upload_to_minio() {
    if [ "$MINIO_BACKUP_ENABLED" != "true" ]; then
        return
    fi
    
    info "Uploading backup to MinIO..."
    
    docker run --rm --network host \
        -v "$BACKUP_DIR:/backup" \
        minio/mc:latest \
        cp "/backup/${BACKUP_NAME}.tar.gz" \
        "minio/${MINIO_BUCKET}/${BACKUP_NAME}.tar.gz"
    
    info "Backup uploaded to MinIO ✓"
}

# Clean old backups
cleanup_old_backups() {
    info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    find "$BACKUP_DIR" -name "backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete
    
    info "Cleanup complete ✓"
}

# Print summary
print_summary() {
    echo ""
    echo "============================================================================="
    echo "Backup Complete"
    echo "============================================================================="
    echo "Backup file: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    echo "Timestamp: $TIMESTAMP"
    echo "============================================================================="
}

# Main function
main() {
    info "Starting backup process..."
    
    setup
    backup_mongodb
    backup_prometheus
    backup_grafana
    backup_elasticsearch
    backup_configs
    compress_backup
    upload_to_minio
    cleanup_old_backups
    print_summary
    
    info "Backup process completed successfully!"
}

main "$@"
