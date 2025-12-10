import promClient from "prom-client";

// Create a Registry
const register = new promClient.Registry();

// Default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
export const httpRequestCounter = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const databaseOperations = new promClient.Counter({
  name: "database_operations_total",
  help: "Total number of database operations",
  labelNames: ["operation", "status"],
  registers: [register],
});

export const databaseOperationDuration = new promClient.Histogram({
  name: "database_operation_duration_seconds",
  help: "Database operation latency in seconds",
  labelNames: ["operation"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

export const activeConnections = new promClient.Gauge({
  name: "active_connections",
  help: "Number of active connections",
  labelNames: ["type"],
  registers: [register],
});

export function getMetrics() {
  return register.metrics();
}

export function getRegistry() {
  return register;
}
