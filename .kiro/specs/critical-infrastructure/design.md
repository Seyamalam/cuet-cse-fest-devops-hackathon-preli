# Critical Infrastructure Design Document

## Overview

This design document outlines the architecture and implementation details for integrating critical infrastructure components into the existing e-commerce microservices application. The infrastructure stack provides comprehensive monitoring, logging, error tracking, object storage, and CI/CD capabilities.

The existing application architecture consists of:
- **Gateway Service** (port 5921) - Express.js proxy routing external requests
- **Backend Service** (port 3847) - Express.js + TypeScript business logic
- **MongoDB** (port 27017) - Document database

The new infrastructure adds:
- **Prometheus** (port 9090) - Metrics collection and storage
- **Grafana** (port 3000) - Metrics visualization dashboards
- **Elasticsearch** (port 9200) - Centralized log storage
- **Kibana** (port 5601) - Log visualization and search
- **Sentry** - Error tracking (external SaaS or self-hosted)
- **MinIO** (port 9000/9001) - S3-compatible object storage
- **Jenkins** (port 8080) - CI/CD automation

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL ACCESS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Gateway:5921  │  Grafana:3000  │  Kibana:5601  │  Jenkins:8080  │  MinIO:9001│
└───────┬────────┴───────┬────────┴───────┬───────┴───────┬────────┴─────┬─────┘
        │                │                │               │              │
┌───────▼────────────────▼────────────────▼───────────────▼──────────────▼─────┐
│                           MONITORING NETWORK                                  │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌────────┐  ┌───────┐          │
│  │Prometheus│◄─┤ Grafana  │  │Elasticsearch│◄─┤ Kibana │  │Jenkins│          │
│  │  :9090   │  │  :3000   │  │   :9200     │  │ :5601  │  │ :8080 │          │
│  └────┬─────┘  └──────────┘  └──────┬──────┘  └────────┘  └───────┘          │
│       │                             │                                         │
│       │ scrape metrics              │ forward logs                            │
│       ▼                             ▼                                         │
├───────────────────────────────────────────────────────────────────────────────┤
│                           APPLICATION NETWORK                                 │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │ Gateway  │─────►│ Backend  │─────►│ MongoDB  │      │  MinIO   │          │
│  │  :5921   │      │  :3847   │      │  :27017  │      │:9000/9001│          │
│  └──────────┘      └────┬─────┘      └──────────┘      └────▲─────┘          │
│                         │                                    │                │
│                         │ S3 API calls                       │                │
│                         └────────────────────────────────────┘                │
│                                                                               │
│                         │ Sentry SDK                                          │
│                         ▼                                                     │
│                   ┌──────────┐                                                │
│                   │  Sentry  │ (External SaaS)                                │
│                   └──────────┘                                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Network Topology

| Network | Purpose | Services |
|---------|---------|----------|
| `monitoring-network` | Infrastructure communication | Prometheus, Grafana, Elasticsearch, Kibana, Jenkins |
| `app-network` | Application communication | Gateway, Backend, MongoDB, MinIO |
| Both networks | Cross-network access | Backend (for metrics/logs), Gateway |

## Components and Interfaces

### 1. Prometheus

**Purpose:** Collect and store time-series metrics from all services.

**Configuration:**
- Scrape interval: 15 seconds
- Retention: 15 days
- Storage: Docker volume `prometheus-data`

**Scrape Targets:**
| Target | Endpoint | Metrics |
|--------|----------|---------|
| Backend | `backend:3847/metrics` | HTTP requests, response times, errors |
| Gateway | `gateway:5921/metrics` | Proxy requests, latency |
| MongoDB | `mongo-exporter:9216/metrics` | Connections, operations |
| MinIO | `minio:9000/minio/v2/metrics/cluster` | Storage, requests |

**Interface:**
- Port 9090: Web UI and API
- `/api/v1/query`: PromQL queries
- `/api/v1/targets`: Scrape target status

### 2. Grafana

**Purpose:** Visualize metrics through pre-configured dashboards.

**Configuration:**
- Admin credentials via environment variables
- Automatic datasource provisioning
- Dashboard provisioning from JSON files

**Pre-built Dashboards:**
1. **Application Overview** - Request rates, error rates, latency
2. **Infrastructure Health** - CPU, memory, disk usage
3. **MongoDB Metrics** - Connections, operations, replication
4. **MinIO Storage** - Bucket sizes, request rates

**Interface:**
- Port 3000: Web UI
- `/api/datasources`: Datasource management
- `/api/dashboards`: Dashboard management

### 3. Elasticsearch

**Purpose:** Store and index application logs for search and analysis.

**Configuration:**
- Single-node deployment (development)
- Memory: 512MB heap (configurable)
- Storage: Docker volume `elasticsearch-data`

**Index Pattern:**
- `logs-{service}-{date}` - Daily indices per service
- Fields: `@timestamp`, `service`, `level`, `message`, `trace_id`

**Interface:**
- Port 9200: REST API
- `/_search`: Log queries
- `/_bulk`: Bulk log ingestion

### 4. Kibana

**Purpose:** Provide web interface for log search and visualization.

**Configuration:**
- Elasticsearch connection via environment variable
- Default index pattern: `logs-*`

**Interface:**
- Port 5601: Web UI
- Discover: Log search
- Visualize: Chart creation
- Dashboard: Combined visualizations

### 5. Sentry Integration

**Purpose:** Capture and track application errors with context.

**Integration Points:**
- Backend Service: `@sentry/node` SDK
- Error boundaries for unhandled exceptions
- Request context middleware

**Configuration:**
- DSN via `SENTRY_DSN` environment variable
- Environment via `NODE_ENV`
- Release version via `npm_package_version`

**Captured Data:**
- Stack traces
- Request URL, method, headers
- User context (if available)
- Environment variables (filtered)

### 6. MinIO

**Purpose:** Provide S3-compatible object storage for file uploads.

**Configuration:**
- Root credentials via environment variables
- Default bucket: `uploads`
- Storage: Docker volume `minio-data`

**Interface:**
- Port 9000: S3 API
- Port 9001: Web Console

**Bucket Policy:**
- `uploads`: Private, authenticated access only

### 7. Backend S3 File API

**Purpose:** Expose file operations through REST API.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/files/upload` | Upload file (multipart/form-data) |
| GET | `/api/files/:id` | Download file by ID |
| GET | `/api/files` | List files (paginated) |
| DELETE | `/api/files/:id` | Delete file |

**File Metadata Schema:**
```typescript
interface FileMetadata {
  id: string;           // UUID
  originalName: string; // Original filename
  mimeType: string;     // Content type
  size: number;         // Bytes
  bucket: string;       // MinIO bucket
  key: string;          // Object key
  uploadedAt: Date;     // Timestamp
}
```

**Size Limits:**
- Maximum file size: 50MB (configurable)
- Allowed types: Configurable whitelist

### 8. Jenkins

**Purpose:** Automate build, test, and deployment pipelines.

**Configuration:**
- Admin credentials via environment variables
- Docker socket mounted for container builds
- Storage: Docker volume `jenkins-data`

**Pipeline Stages:**
1. Checkout
2. Install dependencies
3. Type check
4. Build
5. Test
6. Build Docker images
7. Push to registry (optional)

**Interface:**
- Port 8080: Web UI
- `/job/{name}/build`: Trigger builds
- `/api/json`: Jenkins API

## Data Models

### File Metadata (MongoDB)

```typescript
// backend/src/models/file.ts
interface IFile {
  _id: ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  bucket: string;
  key: string;
  uploadedAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<IFile>({
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  bucket: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  uploadedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
```

### Prometheus Metrics

```typescript
// backend/src/metrics/index.ts
// HTTP request counter
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status']
});

// HTTP request duration histogram
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
});
```

### Log Entry Structure

```json
{
  "@timestamp": "2024-01-15T10:30:00.000Z",
  "service": "backend",
  "level": "info",
  "message": "Request processed",
  "trace_id": "abc123",
  "request": {
    "method": "POST",
    "path": "/api/products",
    "duration_ms": 45
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File Upload Round-Trip Consistency

*For any* valid file content and metadata, uploading the file to the Backend_Service and then downloading it by the returned identifier SHALL return identical file content.

**Validates: Requirements 6.2, 6.3, 7.1, 7.2**

### Property 2: File Deletion Removes Access

*For any* file that has been successfully uploaded and then deleted, subsequent download requests for that file identifier SHALL return a 404 Not Found response.

**Validates: Requirements 7.4**

### Property 3: File Size Limit Enforcement

*For any* file upload request where the file size exceeds the configured maximum limit, the Backend_Service SHALL reject the request with a 413 Payload Too Large response without storing any data.

**Validates: Requirements 7.6**

### Property 4: Log Entry Field Completeness

*For any* log entry stored in Elasticsearch, the entry SHALL contain all required fields: `@timestamp`, `service`, `level`, and `message`.

**Validates: Requirements 3.5**

### Property 5: Sentry Error Capture Completeness

*For any* unhandled exception in Backend_Service, Sentry SHALL receive an error report containing the stack trace and request context within the configured timeout period.

**Validates: Requirements 5.1**

## Error Handling

### MinIO Unavailability

```typescript
// backend/src/services/storage.ts
async function uploadFile(file: Buffer, metadata: FileMetadata): Promise<FileMetadata> {
  try {
    await minioClient.putObject(bucket, key, file);
    return savedMetadata;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new ServiceUnavailableError('Storage service unavailable');
    }
    throw error;
  }
}
```

### Sentry Graceful Degradation

```typescript
// backend/src/config/sentry.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event) {
    // Filter sensitive data
    return event;
  },
  // Don't crash if Sentry is unavailable
  shutdownTimeout: 2000,
});
```

### Elasticsearch Connection Retry

```typescript
// Elasticsearch client with retry logic
const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL,
  maxRetries: 3,
  requestTimeout: 30000,
  sniffOnStart: false,
});
```

## Testing Strategy

### Dual Testing Approach

This infrastructure requires both unit tests and property-based tests:

1. **Unit Tests** - Verify specific configurations and integrations work correctly
2. **Property-Based Tests** - Verify universal properties hold across all inputs

### Property-Based Testing Framework

**Framework:** `fast-check` for TypeScript/JavaScript

**Configuration:**
- Minimum iterations: 100 per property
- Seed: Configurable for reproducibility

### Unit Test Coverage

| Component | Test Focus |
|-----------|------------|
| File API | Upload, download, delete, list operations |
| Metrics | Counter increments, histogram observations |
| Sentry | Error capture, context attachment |
| Storage | MinIO client operations |

### Property-Based Test Coverage

| Property | Test Description |
|----------|------------------|
| Property 1 | Generate random file content, upload, download, compare |
| Property 2 | Upload file, delete, verify 404 on download |
| Property 3 | Generate files exceeding limit, verify 413 response |
| Property 4 | Generate log entries, verify required fields |
| Property 5 | Trigger exceptions, verify Sentry capture |

### Integration Test Scenarios

1. **Full Stack Health** - All services start and pass health checks
2. **Metrics Pipeline** - Backend metrics appear in Prometheus and Grafana
3. **Logging Pipeline** - Backend logs appear in Elasticsearch and Kibana
4. **File Operations** - Complete file lifecycle through API

### Test Annotations

All property-based tests MUST include:
```typescript
/**
 * Feature: critical-infrastructure, Property 1: File Upload Round-Trip Consistency
 * Validates: Requirements 6.2, 6.3, 7.1, 7.2
 */
```
