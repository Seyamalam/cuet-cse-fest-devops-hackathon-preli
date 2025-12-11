/**
 * Prometheus Metrics Configuration
 * Requirements: 1.2 - Expose metrics endpoint with HTTP request counts, response times, and error rates
 */

import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Create a custom registry
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// HTTP request counter
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register]
});

// Metrics middleware to track HTTP requests
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint itself
  if (req.path === '/metrics') {
    next();
    return;
  }

  const startTime = Date.now();

  // Override res.end to capture response
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, callback?: any): Response {
    const duration = (Date.now() - startTime) / 1000;
    const path = normalizePath(req.path);
    
    httpRequestsTotal.inc({
      method: req.method,
      path: path,
      status: res.statusCode.toString()
    });

    httpRequestDuration.observe(
      { method: req.method, path: path },
      duration
    );

    return originalEnd(chunk, encoding, callback);
  };

  next();
}

// Normalize path to avoid high cardinality (e.g., /api/products/123 -> /api/products/:id)
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-fA-F]{24}/g, '/:id') // MongoDB ObjectId
    .replace(/\/\d+/g, '/:id'); // Numeric IDs
}
