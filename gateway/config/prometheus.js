const promClient = require("prom-client");

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

const httpRequestCounter = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const backendCallCounter = new promClient.Counter({
  name: "backend_calls_total",
  help: "Total number of backend service calls",
  labelNames: ["method", "endpoint", "status"],
  registers: [register],
});

const backendCallDuration = new promClient.Histogram({
  name: "backend_call_duration_seconds",
  help: "Backend service call latency in seconds",
  labelNames: ["method", "endpoint"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

module.exports = {
  register,
  httpRequestCounter,
  httpRequestDuration,
  backendCallCounter,
  backendCallDuration,
  getMetrics: () => register.metrics(),
};
