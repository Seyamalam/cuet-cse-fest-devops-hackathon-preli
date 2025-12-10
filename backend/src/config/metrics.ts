import { Request, Response, NextFunction } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

// =============================================================================
// Prometheus Metrics Configuration
// =============================================================================
// Critical Infrastructure Monitoring
// =============================================================================

// Create a custom registry
export const metricsRegistry = new Registry();

// Add default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'backend_',
});

// HTTP Request counter
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

// HTTP Request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

// Database operations counter
export const dbOperationsTotal = new Counter({
  name: 'db_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'collection', 'status'],
  registers: [metricsRegistry],
});

// Database operation duration
export const dbOperationDuration = new Histogram({
  name: 'db_operation_duration_seconds',
  help: 'Duration of database operations in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// Active connections gauge
export const activeConnections = new Counter({
  name: 'active_connections_total',
  help: 'Number of active connections',
  registers: [metricsRegistry],
});

// Error counter
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code'],
  registers: [metricsRegistry],
});

// =============================================================================
// Metrics Middleware
// =============================================================================

/**
 * Middleware to track HTTP request metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();

  // Track response finish
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    // Get route pattern (use path for now, could be improved with route matching)
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const status = res.statusCode.toString();

    // Record metrics
    httpRequestsTotal.inc({ method, route, status });
    httpRequestDuration.observe({ method, route, status }, durationSeconds);
  });

  next();
};

/**
 * Metrics endpoint handler
 */
export const metricsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).end('Error generating metrics');
  }
};
