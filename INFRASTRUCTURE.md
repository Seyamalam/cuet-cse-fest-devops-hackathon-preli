# Critical Infrastructure Setup Guide

Complete integration of enterprise-grade monitoring, logging, error tracking, and object storage infrastructure for the e-commerce microservices platform.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Components Summary](#components-summary)
3. [Setup Instructions](#setup-instructions)
4. [Configuration](#configuration)
5. [Verification & Testing](#verification--testing)
6. [AWS VM Deployment](#aws-vm-deployment)
7. [Monitoring & Alerting](#monitoring--alerting)
8. [Troubleshooting](#troubleshooting)
9. [Security Considerations](#security-considerations)

---

## Architecture Overview

### Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRODUCTION ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│      Internet/Client     │
│   (Public Access)        │
└────────────┬─────────────┘
             │
             │ HTTP:5921
             │
┌────────────▼──────────────────────────────────────────────────────┐
│                    Frontend Network (Public)                      │
│                                                                   │
│  ┌──────────────────┐                                           │
│  │   Gateway        │ (ONLY exposed service)                    │
│  │   Port: 5921     │                                           │
│  └────────┬─────────┘                                           │
│           │                                                     │
└───────────┼─────────────────────────────────────────────────────┘
            │
            │ Internal Network
            │
┌───────────▼──────────────────────────────────────────────────────┐
│          Backend Network (Internal - No External Access)         │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │   Backend        │  │   MongoDB        │                    │
│  │   Port: 3847     │  │   Port: 27017    │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         MONITORING & INFRASTRUCTURE STACK              │   │
│  │                                                         │   │
│  │  ┌──────────┐  ┌────────┐  ┌────────┐  ┌──────────┐  │   │
│  │  │Prometheus│  │Grafana │  │Sentry  │  │MinIO     │  │   │
│  │  │9090      │  │3000    │  │9000    │  │9000-9001 │  │   │
│  │  └──────────┘  └────────┘  └────────┘  └──────────┘  │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐  │   │
│  │  │   Elasticsearch + Kibana Log Aggregation        │  │   │
│  │  │   Elasticsearch: 9200-9300                       │  │   │
│  │  │   Kibana: 5601                                   │  │   │
│  │  └─────────────────────────────────────────────────┘  │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Components Summary

### Core Services
| Service | Port | Mode | Purpose |
|---------|------|------|---------|
| **Gateway** | 5921 | Public | API entry point - only exposed service |
| **Backend** | 3847 | Internal | Business logic, product management |
| **MongoDB** | 27017 | Internal | Primary data store |

### Monitoring Stack
| Component | Port | Purpose |
|-----------|------|---------|
| **Prometheus** | 9090 | Metrics collection & time-series database |
| **Grafana** | 3000 | Metrics visualization & dashboards |
| **Sentry** | 9000 | Error tracking & performance monitoring |

### Logging Stack
| Component | Port | Purpose |
|-----------|------|---------|
| **Elasticsearch** | 9200-9300 | Centralized log aggregation |
| **Kibana** | 5601 | Log search, analysis & visualization |

### Storage
| Component | Port | Purpose |
|-----------|------|---------|
| **MinIO** | 9000-9001 | S3-compatible object storage |

---

## Setup Instructions

### Prerequisites

```bash
# Required tools
- Docker (20.10+)
- Docker Compose (2.0+)
- Git
- curl/wget for testing
- openssl (for generating credentials)

# For AWS deployment
- AWS CLI (v2+)
- Terraform (optional, for IaC)
```

### Step 1: Clone & Initialize

```bash
git clone <repository-url>
cd <project-root>

# Create environment file from template
cp .env.example .env
```

### Step 2: Generate Secure Credentials

```bash
# Generate secure passwords for all services
MONGO_ADMIN=$(openssl rand -base64 32)
MONGO_APP=$(openssl rand -base64 32)
GRAFANA_PASS=$(openssl rand -base64 32)
SENTRY_SECRET=$(openssl rand -base64 32)
SENTRY_DB_PASS=$(openssl rand -base64 32)
MINIO_SECRET=$(openssl rand -base64 32)

echo "MongoDB Admin: $MONGO_ADMIN"
echo "MongoDB App: $MONGO_APP"
echo "Grafana: $GRAFANA_PASS"
echo "Sentry Secret: $SENTRY_SECRET"
echo "Sentry DB: $SENTRY_DB_PASS"
echo "MinIO Secret: $MINIO_SECRET"
```

### Step 3: Update .env File

Edit `.env` with your secure credentials:

```env
# Core Services
NODE_ENV=production
BACKEND_PORT=3847
GATEWAY_PORT=5921

# MongoDB
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=<your-secure-password>
MONGO_APP_USERNAME=app_user
MONGO_APP_PASSWORD=<your-secure-password>
MONGO_DATABASE=ecommerce

# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<your-secure-password>

# Sentry
SENTRY_SECRET_KEY=<your-secure-key>
SENTRY_DB_PASSWORD=<your-secure-password>

# MinIO
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=<your-secure-password>

# Logging
LOG_LEVEL=info
```

### Step 4: Start Development Environment

```bash
# Start all services (development mode with hot reload)
make dev-up

# Check service status
make dev-ps

# View logs
make dev-logs

# Health check
make health
```

### Step 5: Start Production Environment

```bash
# Build production images
make prod-build

# Start production stack
make prod-up

# Verify all services are healthy
docker compose -f docker/compose.production.yaml ps
```

---

## Configuration

### Prometheus Configuration

Location: `/docker/prometheus.yml`

Key features:
- 15-second default scrape interval
- 7-day data retention (development) / 30-day (production)
- Metrics scraped from:
  - Backend (`/metrics`)
  - Gateway (`/metrics`)
  - MinIO
  - Elasticsearch (if exporter available)

To add custom scrape jobs:

```yaml
scrape_configs:
  - job_name: 'custom-service'
    static_configs:
      - targets: ['host:port']
    scrape_interval: 30s
    scrape_timeout: 10s
```

### Grafana Configuration

Location: `/docker/grafana/provisioning/`

**Datasources:**
- Prometheus (primary metrics)
- Elasticsearch (logs)

**Default Login:**
- Username: admin
- Password: (from .env GRAFANA_ADMIN_PASSWORD)

**To add dashboards:**

1. Create dashboard JSON in `/docker/grafana/provisioning/dashboards/`
2. Restart Grafana container
3. Dashboards auto-load from provisioning directory

### Elasticsearch Configuration

Development settings:
```yaml
discovery.type: single-node
xpack.security.enabled: false
ES_JAVA_OPTS: -Xms512m -Xmx512m
```

Production settings (update in compose files):
```yaml
ES_JAVA_OPTS: -Xms1g -Xmx1g
cluster.name: ecommerce-prod
node.name: elasticsearch-prod
```

### Kibana Configuration

Access: `http://localhost:5601` (development) or `http://<server>:5601` (production)

To create index patterns:

1. Navigate to Stack Management → Index Patterns
2. Create index pattern: `backend-logs*` or `gateway-logs*`
3. Set `@timestamp` as time field
4. Use Discover tab to search logs

### Sentry Configuration

**Initial Setup:**

1. Container starts and initializes database
2. Access `http://localhost:9000` (dev) or `http://<server>:9000` (prod)
3. Create admin account during initial setup
4. Create projects for "backend" and "gateway"
5. Copy DSN from project settings

**Update .env with DSN:**

```env
SENTRY_DSN_BACKEND=https://key@sentry.example.com/123
SENTRY_DSN_GATEWAY=https://key@sentry.example.com/124
```

### MinIO Configuration

**Initial Access:**

1. Console URL: `http://localhost:9001` (dev) or `http://<server>:9001` (prod)
2. Default credentials: `minioadmin` / `minioadmin` (from MINIO_SECRET_KEY in .env)
3. **IMPORTANT**: Change credentials in production!

**Bucket Creation:**

Buckets are auto-created during `minio-init` container execution. To manually create:

```bash
# Access MinIO container shell
docker exec -it minio-dev /bin/sh

# Use mc (MinIO Client) alias
mc alias set myminio http://localhost:9000 minioadmin minioadmin

# Create bucket
mc mb myminio/ecommerce

# List buckets
mc ls myminio
```

---

## Verification & Testing

### Prerequisite: Start Stack

```bash
# Development
make dev-up

# Wait for all services to be healthy
docker compose -f docker/compose.development.yaml ps

# All services should show "healthy" status
```

### Test 1: Core API Functionality

```bash
# Gateway health
curl http://localhost:5921/health
# Expected: {"ok":true,"service":"gateway",...}

# Backend health via gateway
curl http://localhost:5921/api/health
# Expected: {"ok":true,"service":"backend",...}

# Create product
curl -X POST http://localhost:5921/api/products \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Product","price":99.99}'

# Get products
curl http://localhost:5921/api/products

# Verify backend is NOT directly accessible
curl http://localhost:3847/api/products
# Expected: Connection refused (good!)
```

### Test 2: Prometheus Metrics

```bash
# Gateway metrics
curl http://localhost:5921/metrics
# Should show Prometheus format metrics

# Backend metrics
curl http://localhost:3847/metrics
# Should show Prometheus format metrics

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=up'
```

### Test 3: Grafana Dashboards

1. Open `http://localhost:3000`
2. Login: admin / <your-password>
3. Home → Connections → Data sources
4. Verify Prometheus datasource connection
5. Create test dashboard:
   - Add panel
   - Data source: Prometheus
   - Query: `up`
   - Visualize metrics

### Test 4: Elasticsearch & Kibana

```bash
# Check Elasticsearch health
curl http://localhost:9200/_cluster/health
# Expected: "status":"green"

# View indices
curl http://localhost:9200/_cat/indices

# Search logs in Kibana
# Open http://localhost:5601
# Stack Management → Index Patterns
# Create pattern: backend-logs*
# Use Discover to search
```

### Test 5: Sentry Error Tracking

```bash
# Open Sentry dashboard
# http://localhost:9000

# Test error capture (requires DSN configuration)
# Backend will auto-capture unhandled errors
# Gateway will auto-capture proxy errors

# Simulate error in backend/gateway logs:
curl -X POST http://localhost:5921/api/invalid-route
# Should appear in Sentry Issues dashboard
```

### Test 6: MinIO Storage

```bash
# Access MinIO Console
# http://localhost:9001
# Login: minioadmin / <MINIO_SECRET_KEY>

# Upload file through console OR via CLI:
docker exec -it minio-dev /bin/sh

# Create test file
echo "test data" > /tmp/test.txt

# Upload
mc cp /tmp/test.txt myminio/ecommerce/test.txt

# List
mc ls myminio/ecommerce/

# Download
mc cp myminio/ecommerce/test.txt /tmp/downloaded.txt
```

### Test 7: Container Health Checks

```bash
# Check all health statuses
docker compose -f docker/compose.development.yaml ps

# Watch real-time status changes
watch -n 1 'docker compose -f docker/compose.development.yaml ps'

# View health check logs
docker inspect gateway-dev | grep -A 5 '"Health"'

# Manual health check
docker exec gateway-dev wget --spider http://localhost:5921/health
```

### Complete Test Automation Script

```bash
#!/bin/bash
# test-infrastructure.sh

set -e

echo "🚀 Starting Infrastructure Tests"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

test_endpoint() {
  local url=$1
  local expected=$2
  echo -n "Testing $url... "
  
  response=$(curl -s "$url" || echo "FAILED")
  
  if echo "$response" | grep -q "$expected"; then
    echo -e "${GREEN}✓${NC}"
    return 0
  else
    echo -e "${RED}✗${NC}"
    echo "  Response: $response"
    return 1
  fi
}

# Core API tests
echo "=== API Tests ==="
test_endpoint "http://localhost:5921/health" "ok"
test_endpoint "http://localhost:5921/api/health" "ok"
test_endpoint "http://localhost:3847/metrics" "process_cpu_usage_seconds"

# Monitoring tests
echo ""
echo "=== Monitoring Tests ==="
test_endpoint "http://localhost:9090/-/healthy" "Prometheus"
test_endpoint "http://localhost:3000/api/health" "ok"

# Logging tests
echo ""
echo "=== Logging Tests ==="
test_endpoint "http://localhost:9200/_cluster/health" "status"
test_endpoint "http://localhost:5601/api/status" "state"

# Sentry test
echo ""
echo "=== Sentry Tests ==="
test_endpoint "http://localhost:9000/_health/" "ok"

# MinIO test
echo ""
echo "=== MinIO Tests ==="
test_endpoint "http://localhost:9000/minio/health/live" ""

echo ""
echo -e "${GREEN}✅ Infrastructure tests complete!${NC}"
```

Run the test script:

```bash
chmod +x test-infrastructure.sh
./test-infrastructure.sh
```

---

## AWS VM Deployment

### Prerequisites

- AWS account with EC2 access
- Ubuntu 22.04 LTS instance (t3.xlarge recommended)
- Security groups configured for:
  - Inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS), 5921 (Gateway)
  - Outbound: All traffic

### Step 1: Instance Setup

```bash
# Connect to instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install other tools
sudo apt-get install -y git curl wget build-essential

# Log out and back in for Docker permissions
exit
ssh -i your-key.pem ubuntu@your-instance-ip
```

### Step 2: Deploy Application

```bash
# Clone repository
git clone <repository-url>
cd <project-root>

# Create .env from template
cp .env.example .env

# Edit .env with production values
nano .env

# Update for AWS:
# - Change MINIO_SERVER_URL to your instance IP/domain
# - Use strong credentials for all services
# - Set NODE_ENV=production
# - Configure proper DNS entries
```

### Step 3: SSL/HTTPS Setup (Recommended)

Option A: Using Let's Encrypt with Nginx reverse proxy

```bash
# Install Nginx
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure Nginx reverse proxy
sudo nano /etc/nginx/sites-available/default

# Add configuration:
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5921;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /grafana {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }

    location /kibana {
        proxy_pass http://localhost:5601;
        proxy_set_header Host $host;
    }
}

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Test and enable Nginx
sudo nginx -t
sudo systemctl enable nginx
```

Option B: Using AWS Certificate Manager + Load Balancer

```bash
# Create Application Load Balancer in AWS Console
# - Target: EC2 instance
# - Certificate: ACM certificate for your domain
# - Port 443 → Instance 5921
```

### Step 4: Start Production Stack

```bash
# Start services
make prod-up

# Monitor logs
make prod-logs

# Verify all services
docker compose -f docker/compose.production.yaml ps

# Run health checks
make health
```

### Step 5: Configure CloudWatch Monitoring (Optional)

```bash
# Install CloudWatch Agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

# Configure to send Docker metrics to CloudWatch
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

### Step 6: Backup Strategy

```bash
# Create backup script
cat > /home/ubuntu/backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
mkdir -p $BACKUP_DIR

# Backup MongoDB
docker compose -f docker/compose.production.yaml exec -T mongo \
  mongodump --authenticationDatabase admin \
  -u admin -p $MONGO_INITDB_ROOT_PASSWORD \
  --archive > $BACKUP_DIR/mongodb.archive

# Backup MinIO data
docker cp minio-prod:/data $BACKUP_DIR/minio

# Upload to S3
aws s3 sync $BACKUP_DIR s3://your-backup-bucket/$(date +%Y-%m-%d)/ --region us-east-1

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x /home/ubuntu/backup.sh

# Schedule daily backups at 2 AM
echo "0 2 * * * /home/ubuntu/backup.sh" | crontab -
```

---

## Monitoring & Alerting

### Prometheus Alerting Rules

Create `/docker/prometheus-rules.yml`:

```yaml
groups:
  - name: application
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors per second"

      - alert: ServiceDown
        expr: up{job="backend"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Backend service is down"

      - alert: HighLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High request latency"
```

### Grafana Alert Notifications

1. **Configure Notification Channels:**
   - Administration → Alerting Notification Channels
   - Add: Slack, Email, PagerDuty, Webhook

2. **Create Alerts:**
   - Dashboard → Panel → Create Alert
   - Set conditions and notification channel
   - Configure escalation policies

### Custom Dashboards

Example dashboard for system health:

```json
{
  "dashboard": {
    "title": "System Health",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])"
          }
        ]
      },
      {
        "title": "Backend Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, http_request_duration_seconds{job=\"backend\"})"
          }
        ]
      },
      {
        "title": "Active Connections",
        "targets": [
          {
            "expr": "active_connections"
          }
        ]
      }
    ]
  }
}
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker logs <service-name>

# Check for port conflicts
lsof -i :<port>

# Restart service
docker restart <service-name>

# View detailed error
docker compose logs --follow <service-name>
```

### High Memory Usage

```bash
# Check memory limits in compose files
docker stats

# Adjust in compose files:
deploy:
  resources:
    limits:
      memory: 512M

# Rebuild and restart
docker compose down -v
docker compose up -d
```

### Elasticsearch Won't Connect

```bash
# Check cluster health
curl http://localhost:9200/_cluster/health

# Check logs
docker logs elasticsearch-dev

# Reset data (development only!)
docker volume rm ecommerce-elasticsearch-data-dev
docker compose up -d elasticsearch
```

### Sentry DB Issues

```bash
# Check PostgreSQL
docker logs sentry-postgres-dev

# Reset Sentry (development only!)
docker compose down -v sentry sentry-postgres sentry-redis
docker compose up -d sentry
```

### MinIO Access Issues

```bash
# Check if service is running
curl http://localhost:9000/minio/health/live

# Check logs
docker logs minio-dev

# Verify credentials in .env
echo $MINIO_ACCESS_KEY
echo $MINIO_SECRET_KEY

# Reset if needed (development only!)
docker volume rm ecommerce-minio-data-dev
docker compose up -d minio minio-init
```

### Network Issues

```bash
# Check network connectivity
docker exec gateway-dev wget -q -O- http://backend:3847/api/health

# Test from host
curl http://localhost:3847/api/health  # Should fail (internal only)
curl http://localhost:5921/api/health  # Should work

# Inspect networks
docker network inspect ecommerce-network-dev
```

### Logs Not Appearing in Kibana

```bash
# Check Elasticsearch indices
curl http://localhost:9200/_cat/indices

# Check if logs are being sent
curl http://localhost:9200/backend-logs/_search

# Reset indices (if needed)
curl -X DELETE http://localhost:9200/backend-logs*
curl -X DELETE http://localhost:9200/gateway-logs*
```

---

## Security Considerations

### Credential Management

✅ **Do:**
- Store all credentials in `.env` (not in git)
- Rotate credentials regularly
- Use strong passwords (16+ characters)
- Use AWS Secrets Manager for production
- Implement credential rotation policies

❌ **Don't:**
- Commit `.env` file with real values
- Use default credentials in production
- Share credentials via email/chat
- Hardcode secrets in code
- Store passwords in logs

### Network Security

✅ **Production Network Setup:**
- Gateway only exposed port (5921)
- Backend & database on internal network
- All other services on internal network
- Use security groups to restrict access
- Enable VPC Flow Logs for monitoring

```bash
# AWS Security Group Rules

Inbound:
- Port 22 (SSH): 0.0.0.0/0 or specific IP range
- Port 80 (HTTP): 0.0.0.0/0
- Port 443 (HTTPS): 0.0.0.0/0
- Port 5921 (Gateway): 0.0.0.0/0

Outbound:
- All traffic to 0.0.0.0/0
```

### Container Security

✅ **Implemented:**
- All services run as non-root user
- `no-new-privileges` security option
- Resource limits to prevent DoS
- Read-only volumes where possible
- Health checks for service validation

✅ **Additional Measures:**
- Regular image scanning (Trivy)
- Minimal base images (Alpine)
- No privileged containers
- Temporary volumes cleaned up
- Logs rotated (10MB per file, 3 files max)

### Data Protection

✅ **MongoDB:**
- Password-protected access
- Dedicated app user with minimal permissions
- Encrypted connections (enable in production)
- Regular backups

✅ **MinIO:**
- Change default credentials immediately
- Enable versioning
- Set access policies per bucket
- Encrypt sensitive data
- Enable audit logging

✅ **Elasticsearch:**
- Enable authentication in production
- Use dedicated credentials
- Encrypt data in transit
- Regular snapshots

### Compliance

✅ **Audit Logging:**
- All requests logged to Elasticsearch
- 30-day retention in production
- Sentry error tracking
- Database query logging

✅ **Encryption:**
- SSL/TLS for all external communication
- Encrypted volumes for persistent data
- Encrypted backups

✅ **Access Control:**
- No default credentials exposed
- Role-based access in Grafana/Sentry
- API key rotation policies
- SSH key-based access to instances

---

## Makefile Commands Reference

### Infrastructure Management

```bash
# Development
make dev-up              # Start dev environment
make dev-down            # Stop dev environment
make dev-build           # Build dev images
make dev-logs            # View dev logs
make dev-ps              # Show dev containers

# Production
make prod-up             # Start prod environment
make prod-down           # Stop prod environment
make prod-build          # Build prod images
make prod-logs           # View prod logs
make prod-ps             # Show prod containers

# Health & Testing
make health              # Run health checks
make test                # Run tests

# Database
make db-backup           # Backup MongoDB
make db-reset            # Reset MongoDB (DEV ONLY)

# Cleanup
make clean               # Remove containers/networks
make clean-all           # Remove everything
make clean-volumes       # Remove volumes

# Shells
make backend-shell       # Shell into backend
make gateway-shell       # Shell into gateway
make mongo-shell         # MongoDB shell
```

---

## Performance Tuning

### Prometheus Optimization

```yaml
# Reduce cardinality (limit unique label combinations)
metric_relabel_configs:
  - source_labels: [__name__]
    regex: 'container_.*'
    action: drop

# Increase storage for production
command:
  - '--storage.tsdb.retention.time=90d'
```

### Elasticsearch Optimization

```yaml
# Increase JVM memory for large datasets
environment:
  - ES_JAVA_OPTS=-Xms4g -Xmx4g

# Add index lifecycle management
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0d",
        "actions": {
          "rollover": {
            "max_primary_store_size": "50gb"
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### MinIO Optimization

```bash
# Enable caching for frequently accessed objects
docker exec minio-prod mc alias set myminio http://localhost:9000 minioadmin $MINIO_SECRET_KEY
docker exec minio-prod mc ilm import myminio/ecommerce < cache-policy.json
```

---

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Elasticsearch Guide](https://www.elastic.co/guide/en/elasticsearch/reference/)
- [Kibana Guide](https://www.elastic.co/guide/en/kibana/current/)
- [Sentry Documentation](https://docs.sentry.io/)
- [MinIO Documentation](https://docs.min.io/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)

---

## Support & Maintenance

### Regular Maintenance

- Weekly: Review logs for errors and anomalies
- Monthly: Rotate credentials and access keys
- Monthly: Review resource utilization and optimize
- Quarterly: Test backup/restore procedures
- Quarterly: Review security policies and updates

### Monitoring System Health

```bash
# Daily checks
curl http://localhost:5921/health
curl http://localhost:9090/-/healthy
curl http://localhost:9200/_cluster/health
docker compose ps

# Weekly review
# - Check Grafana dashboards for trends
# - Review Sentry for error patterns
# - Verify backup completeness
```

---

**Last Updated:** December 2024
**Version:** 1.0.0
