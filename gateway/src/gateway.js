const express = require('express');
const axios = require('axios');
const Sentry = require('@sentry/node');
const promClient = require('prom-client');

// =============================================================================
// E-commerce Gateway Service
// =============================================================================
// Critical Infrastructure - API Gateway with full observability
// =============================================================================

const app = express();

// Gateway port - DO NOT CHANGE from 5921
const gatewayPort = process.env.GATEWAY_PORT || 5921;
// Backend URL - uses internal Docker network hostname
const backendUrl = process.env.BACKEND_URL || 'http://backend:3847';

// =============================================================================
// Sentry Initialization
// =============================================================================
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Express({ app }),
      new Sentry.Integrations.Http({ tracing: true }),
    ],
  });
  console.log('✅ Sentry error tracking initialized');
} else {
  console.warn('⚠️  SENTRY_DSN not configured - error tracking disabled');
}

// =============================================================================
// Prometheus Metrics
// =============================================================================
const metricsRegistry = new promClient.Registry();
promClient.collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'gateway_',
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

const proxyRequestsTotal = new promClient.Counter({
  name: 'proxy_requests_total',
  help: 'Total number of proxy requests',
  labelNames: ['target', 'status'],
  registers: [metricsRegistry],
});

const proxyRequestDuration = new promClient.Histogram({
  name: 'proxy_request_duration_seconds',
  help: 'Duration of proxy requests in seconds',
  labelNames: ['target'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// =============================================================================
// Middleware
// =============================================================================

// Sentry request handler (must be first)
if (sentryDsn) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// JSON parsing middleware
app.use(express.json({ limit: '10mb' }));

// Metrics middleware
app.use((req, res, next) => {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const status = res.statusCode.toString();

    httpRequestsTotal.inc({ method, route, status });
    httpRequestDuration.observe({ method, route, status }, durationSeconds);
  });

  next();
});

// =============================================================================
// Proxy Request Handler
// =============================================================================
async function proxyRequest(req, res, next) {
  const startTime = Date.now();
  const targetPath = req.url;
  const targetUrl = `${backendUrl}${targetPath}`;

  try {
    console.log(`[${req.method}] ${req.url} -> ${targetUrl}`);

    // Prepare headers
    const headers = {};

    // Only set Content-Type if there's a body
    if (req.body && Object.keys(req.body).length > 0) {
      headers['Content-Type'] = req.headers['content-type'] || 'application/json';
    }

    // Forward x-forwarded headers
    headers['X-Forwarded-For'] = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    headers['X-Forwarded-Proto'] = req.protocol;
    headers['X-Request-Id'] = req.headers['x-request-id'] || `gw-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Forward request to backend service
    const response = await axios({
      method: req.method,
      url: targetUrl,
      params: req.query,
      data: req.body,
      headers,
      timeout: 30000,
      validateStatus: () => true,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024,
    });

    // Log metrics
    const duration = Date.now() - startTime;
    console.log(`[${req.method}] ${req.url} <- ${response.status} (${duration}ms)`);

    // Record proxy metrics
    proxyRequestsTotal.inc({ target: 'backend', status: response.status.toString() });
    proxyRequestDuration.observe({ target: 'backend' }, duration / 1000);

    // Forward response with same status and headers
    res.status(response.status);

    // Forward response headers
    const headersToForward = ['content-type', 'content-length', 'x-request-id'];
    headersToForward.forEach((header) => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    // Send response data
    res.json(response.data);
  } catch (error) {
    // Error logging
    console.error('Proxy error:', {
      message: error.message,
      code: error.code,
      url: targetUrl,
    });

    // Record error metric
    proxyRequestsTotal.inc({ target: 'backend', status: 'error' });

    // Capture in Sentry
    if (sentryDsn) {
      Sentry.captureException(error, {
        extra: { targetUrl, method: req.method },
      });
    }

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`Connection refused to ${targetUrl}`);
        res.status(503).json({
          error: 'Backend service unavailable',
          message: 'The backend service is currently unavailable. Please try again later.',
        });
        return;
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error(`Timeout connecting to ${targetUrl}`);
        res.status(504).json({
          error: 'Backend service timeout',
          message: 'The backend service did not respond in time. Please try again later.',
        });
        return;
      } else if (error.response) {
        res.status(error.response.status).json(error.response.data);
        return;
      }
    }

    // Generic error
    if (!res.headersSent) {
      res.status(502).json({ error: 'bad gateway' });
    } else {
      next(error);
    }
  }
}

// =============================================================================
// Routes
// =============================================================================

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end('Error generating metrics');
  }
});

// Health check endpoint with backend check
app.get('/health', async (req, res) => {
  let backendHealthy = false;
  let backendError = null;

  try {
    const response = await axios.get(`${backendUrl}/api/health`, { timeout: 5000 });
    backendHealthy = response.status === 200 && response.data?.ok;
  } catch (error) {
    backendError = error.message;
  }

  const healthy = backendHealthy;

  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    timestamp: new Date().toISOString(),
    service: 'gateway',
    uptime: process.uptime(),
    backend: {
      healthy: backendHealthy,
      error: backendError,
    },
  });
});

// Readiness probe
app.get('/ready', async (req, res) => {
  try {
    const response = await axios.get(`${backendUrl}/api/health`, { timeout: 5000 });
    const ready = response.status === 200;
    res.status(ready ? 200 : 503).json({ ready });
  } catch (error) {
    res.status(503).json({ ready: false, error: error.message });
  }
});

// Liveness probe
app.get('/live', (req, res) => {
  res.json({ alive: true });
});

// Proxy all /api requests to backend
app.all('/api/*', proxyRequest);

// =============================================================================
// Error Handlers
// =============================================================================
if (sentryDsn) {
  app.use(Sentry.Handlers.errorHandler());
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Start Server
// =============================================================================
const server = app.listen(gatewayPort, () => {
  console.log(`✅ Gateway listening on port ${gatewayPort}, forwarding to ${backendUrl}`);
  console.log(`📊 Metrics available at /metrics`);
  console.log(`💓 Health check at /health`);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  server.close(() => {
    console.log('🔌 HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
