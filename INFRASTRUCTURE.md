# Infrastructure Documentation

## Critical Infrastructure Setup Guide

This document provides comprehensive documentation for setting up and managing the complete infrastructure stack including monitoring, logging, storage, and deployment.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Services Stack](#services-stack)
3. [Quick Start](#quick-start)
4. [Service Details](#service-details)
5. [AWS Deployment](#aws-deployment)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Logging (ELK Stack)](#logging-elk-stack)
8. [Object Storage (MinIO)](#object-storage-minio)
9. [Security Considerations](#security-considerations)
10. [Backup & Recovery](#backup--recovery)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
                                    ┌─────────────────────────────────────┐
                                    │           EXTERNAL ACCESS            │
                                    └─────────────────┬───────────────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    │                                 │                                 │
              ┌─────▼─────┐                   ┌───────▼───────┐                ┌────────▼────────┐
              │  Gateway  │                   │    Grafana    │                │    Kibana       │
              │  :5921    │                   │    :3000      │                │    :5601        │
              └─────┬─────┘                   └───────┬───────┘                └────────┬────────┘
                    │                                 │                                 │
    ┌───────────────┼───────────────┐                 │                                 │
    │               │               │                 │                                 │
┌───▼───┐      ┌────▼────┐    ┌─────▼─────┐    ┌──────▼──────┐                ┌─────────▼─────────┐
│Backend│◄────►│ MongoDB │    │ Prometheus│    │ Alertmanager│                │   Elasticsearch   │
│ :3847 │      │ :27017  │    │   :9090   │    │    :9093    │                │      :9200        │
└───┬───┘      └─────────┘    └───────────┘    └─────────────┘                └───────────────────┘
    │
    │          ┌─────────────────────────────────────┐
    │          │            STORAGE LAYER            │
    │          └─────────────────┬───────────────────┘
    │                            │
    └──────────────────────┬─────┘
                           │
                    ┌──────▼──────┐
                    │    MinIO    │
                    │ :9000/:9001 │
                    └─────────────┘
```

---

## Services Stack

### Core Application Services

| Service | Port | Description |
|---------|------|-------------|
| Gateway | 5921 | API Gateway - Single entry point |
| Backend | 3847 | Business logic service |
| MongoDB | 27017 | Document database |

### Monitoring Services

| Service | Port | Description |
|---------|------|-------------|
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Metrics visualization |
| Alertmanager | 9093 | Alert management |
| Node Exporter | 9100 | Host metrics |
| cAdvisor | 8080 | Container metrics |
| MongoDB Exporter | 9216 | MongoDB metrics |

### Logging Services (ELK Stack)

| Service | Port | Description |
|---------|------|-------------|
| Elasticsearch | 9200 | Log storage & search |
| Kibana | 5601 | Log visualization |

### Storage Services

| Service | Port | Description |
|---------|------|-------------|
| MinIO API | 9000 | S3-compatible object storage |
| MinIO Console | 9001 | MinIO web interface |

---

## Quick Start

### Prerequisites

- Docker 24.0+
- Docker Compose 2.0+
- 8GB RAM minimum (16GB recommended)
- 20GB disk space minimum

### 1. Clone and Configure

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Create environment file
cp .env.example .env

# Edit with your credentials
vim .env
```

### 2. Start Full Infrastructure Stack

```bash
# Start all services
docker compose -f docker/compose.infrastructure.yaml up -d

# Check status
docker compose -f docker/compose.infrastructure.yaml ps

# View logs
docker compose -f docker/compose.infrastructure.yaml logs -f
```

### 3. Start Core Services Only

```bash
# Start only application services (without monitoring)
make prod-up
```

### 4. Verify Installation

```bash
# Run health checks
./scripts/health-check.sh

# Or use make command
make health
```

---

## Service Details

### Gateway Service

**Purpose:** Single entry point for all API requests. Handles request routing, metrics, and error tracking.

**Configuration:**
- Port: 5921 (fixed)
- Prometheus metrics: `/metrics`
- Health check: `/health`
- Readiness: `/ready`
- Liveness: `/live`

**Features:**
- Request proxying to backend
- Prometheus metrics collection
- Sentry error tracking
- Request/response logging
- Graceful shutdown

### Backend Service

**Purpose:** Core business logic, database operations, and API endpoints.

**Configuration:**
- Port: 3847 (fixed, internal only)
- Prometheus metrics: `/api/metrics`
- Health check: `/api/health`

**Features:**
- MongoDB integration
- Prometheus metrics
- Sentry error tracking
- Elasticsearch logging
- MinIO storage integration

### MongoDB

**Purpose:** Primary data store for application data.

**Configuration:**
- Port: 27017 (internal only)
- Authentication: Required
- Data persistence: Named volume

**Security:**
- Root admin user
- Application user with limited privileges
- Network isolation

---

## AWS Deployment

### Step 1: Launch EC2 Instance

**Recommended Specifications:**
- Instance Type: t3.large (minimum), t3.xlarge (recommended)
- AMI: Ubuntu 22.04 LTS or Amazon Linux 2023
- Storage: 50GB EBS (gp3)
- Security Groups: See below

**Security Group Rules:**

| Type | Port | Source | Description |
|------|------|--------|-------------|
| SSH | 22 | Your IP | SSH access |
| Custom TCP | 5921 | 0.0.0.0/0 | Gateway API |
| Custom TCP | 3000 | Your IP | Grafana |
| Custom TCP | 9090 | Your IP | Prometheus |
| Custom TCP | 5601 | Your IP | Kibana |
| Custom TCP | 9001 | Your IP | MinIO Console |

### Step 2: Setup VM

```bash
# SSH into your instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/scripts/setup-aws.sh | sudo bash
```

### Step 3: Deploy Application

```bash
# Clone repository
sudo git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /opt/ecommerce

# Configure
cd /opt/ecommerce
sudo cp .env.example .env
sudo vim .env  # Edit with production credentials

# Deploy
sudo ./scripts/deploy.sh production
```

### Step 4: Configure Domain (Optional)

```bash
# Install Nginx as reverse proxy
sudo apt install nginx -y

# Configure Nginx
sudo vim /etc/nginx/sites-available/ecommerce
# See Nginx configuration below

sudo ln -s /etc/nginx/sites-available/ecommerce /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5921;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Monitoring & Alerting

### Prometheus

**Access:** http://localhost:9090

**Pre-configured Targets:**
- Backend service (`backend:3847/api/metrics`)
- Gateway service (`gateway:5921/metrics`)
- MongoDB exporter (`mongodb-exporter:9216/metrics`)
- Node exporter (`node-exporter:9100/metrics`)
- MinIO (`minio:9000/minio/v2/metrics/cluster`)

**Useful Queries:**
```promql
# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Response time (95th percentile)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# MongoDB connections
mongodb_connections{state="current"}
```

### Grafana

**Access:** http://localhost:3000
**Default Login:** admin / admin_password (change in .env)

**Pre-configured Dashboards:**
- E-commerce Platform Overview
- Service Health
- MongoDB Metrics
- System Resources

**Adding Dashboards:**
1. Go to Dashboards → Import
2. Enter dashboard ID from grafana.com or upload JSON
3. Select Prometheus data source

### Alertmanager

**Access:** http://localhost:9093

**Pre-configured Alerts:**
- Service down
- High latency
- High error rate
- High resource usage
- MongoDB issues
- Disk space warnings

**Configure Notifications:**
Edit `monitoring/alertmanager/alertmanager.yml`:
```yaml
receivers:
  - name: 'critical-alerts'
    email_configs:
      - to: 'your-email@example.com'
    slack_configs:
      - channel: '#alerts'
```

---

## Logging (ELK Stack)

### Elasticsearch

**Access:** http://localhost:9200

**Index Pattern:** `logs-*`

**Query Examples:**
```bash
# Get cluster health
curl http://localhost:9200/_cluster/health?pretty

# List indices
curl http://localhost:9200/_cat/indices?v

# Search logs
curl -X GET "localhost:9200/logs-*/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
    "match": { "level": "error" }
  }
}'
```

### Kibana

**Access:** http://localhost:5601

**Setup:**
1. Go to Stack Management → Index Patterns
2. Create pattern: `logs-*`
3. Set time field: `@timestamp`
4. Go to Discover to view logs

---

## Object Storage (MinIO)

### MinIO Console

**Access:** http://localhost:9001
**Login:** minio_admin / minio_password (change in .env)

### Pre-configured Buckets
- `ecommerce` - Application files
- `backups` - Database backups
- `logs` - Log archives

### Using MinIO from Application

```typescript
import { uploadFile, downloadFile, getPresignedUrl } from './config/minio';

// Upload file
await uploadFile('ecommerce', 'images/product.jpg', fileBuffer);

// Download file
const data = await downloadFile('ecommerce', 'images/product.jpg');

// Get presigned URL
const url = await getPresignedUrl('ecommerce', 'images/product.jpg', 3600);
```

### Using MinIO CLI (mc)

```bash
# Configure alias
docker exec minio-setup mc alias set minio http://minio:9000 minio_admin minio_password

# List buckets
docker exec minio-setup mc ls minio/

# Upload file
docker exec minio-setup mc cp /path/to/file minio/ecommerce/
```

---

## Security Considerations

### Network Security

1. **Internal Networks:** Backend and database services are isolated
2. **Exposed Ports:** Only gateway (5921) is required for production
3. **Monitoring Access:** Restrict Grafana, Prometheus, Kibana to trusted IPs

### Authentication

1. **MongoDB:** Uses authentication with separate app user
2. **Grafana:** Change default admin password
3. **MinIO:** Change default credentials
4. **Sentry:** Configure your own DSN

### Best Practices

1. Use AWS Security Groups to restrict access
2. Enable SSL/TLS for all public endpoints
3. Regularly rotate credentials
4. Monitor security alerts
5. Keep services updated

---

## Backup & Recovery

### Automated Backup

```bash
# Run backup script
./scripts/backup.sh

# Schedule daily backups (add to crontab)
0 2 * * * /opt/ecommerce/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### Manual MongoDB Backup

```bash
# Backup
docker exec mongo mongodump --authenticationDatabase admin -u admin -p your_password --archive > backup.archive

# Restore
docker exec -i mongo mongorestore --authenticationDatabase admin -u admin -p your_password --archive < backup.archive
```

### Backup to MinIO

Set `MINIO_BACKUP_ENABLED=true` in your .env file to enable automatic backup uploads to MinIO.

---

## Troubleshooting

### Common Issues

#### Services Not Starting

```bash
# Check logs
docker compose -f docker/compose.infrastructure.yaml logs [service-name]

# Check resources
docker stats

# Restart specific service
docker compose -f docker/compose.infrastructure.yaml restart [service-name]
```

#### Elasticsearch Memory Error

```bash
# Increase vm.max_map_count
sudo sysctl -w vm.max_map_count=262144
```

#### MongoDB Connection Issues

```bash
# Check MongoDB logs
docker logs mongo

# Test connection
docker exec mongo mongosh -u admin -p your_password --authenticationDatabase admin --eval "db.adminCommand('ping')"
```

#### Port Already in Use

```bash
# Find process using port
sudo lsof -i :PORT

# Kill process or change port in .env
```

### Health Check Commands

```bash
# Gateway
curl http://localhost:5921/health

# Backend
curl http://localhost:5921/api/health

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3000/api/health

# Elasticsearch
curl http://localhost:9200/_cluster/health

# MinIO
curl http://localhost:9000/minio/health/live
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_INITDB_ROOT_USERNAME` | admin | MongoDB root username |
| `MONGO_INITDB_ROOT_PASSWORD` | - | MongoDB root password |
| `MONGO_APP_USERNAME` | app_user | MongoDB app username |
| `MONGO_APP_PASSWORD` | - | MongoDB app password |
| `MONGO_DATABASE` | ecommerce | Database name |
| `BACKEND_PORT` | 3847 | Backend port (fixed) |
| `GATEWAY_PORT` | 5921 | Gateway port (fixed) |
| `NODE_ENV` | development | Environment mode |
| `SENTRY_DSN` | - | Sentry DSN for error tracking |
| `GRAFANA_ADMIN_USER` | admin | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | - | Grafana admin password |
| `MINIO_ACCESS_KEY` | minio_admin | MinIO access key |
| `MINIO_SECRET_KEY` | - | MinIO secret key |
| `ELASTICSEARCH_URL` | http://elasticsearch:9200 | Elasticsearch URL |

---

## Support

For issues and feature requests, please create an issue in the repository.

## License

This project is licensed under the MIT License.
