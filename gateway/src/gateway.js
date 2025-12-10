const express = require("express");
const axios = require("axios");
const env = require("../config/env");
const { initializeSentry, getSentryRequestHandler, getSentryErrorHandler, captureException } = require("../config/monitoring");
const { logger } = require("../config/logger");
const { httpRequestCounter, httpRequestDuration, backendCallCounter, backendCallDuration, getMetrics } = require("../config/prometheus");

const app = express();
const gatewayPort = env.port;
const backendUrl = env.backendUrl;

// Initialize Sentry
initializeSentry();

// Sentry request handler must be first
app.use(getSentryRequestHandler());

app.use(express.json());

// Middleware to track request metrics
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path;
    httpRequestCounter.labels(req.method, route, res.statusCode).inc();
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
  });
  next();
});

// Request logger middleware
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  logger.info(`${req.method} ${req.url}`, {
    timestamp,
    method: req.method,
    path: req.url,
  });
  next();
});

/**
 * Proxy request handler
 */
async function proxyRequest(req, res, next) {
  const startTime = Date.now();
  const targetPath = req.url;
  const targetUrl = `${backendUrl}${targetPath}`;

  try {
    logger.debug(`[${req.method}] ${req.url} -> ${targetUrl}`);

    const headers = {};

    if (req.body && Object.keys(req.body).length > 0) {
      headers["Content-Type"] = req.headers["content-type"] || "application/json";
    }

    headers["X-Forwarded-For"] = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    headers["X-Forwarded-Proto"] = req.protocol;

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

    const duration = (Date.now() - startTime) / 1000;
    const endpoint = req.path;
    
    backendCallCounter.labels(req.method, endpoint, response.status).inc();
    backendCallDuration.labels(req.method, endpoint).observe(duration);

    logger.debug(`[${req.method}] ${req.url} <- ${response.status} (${(duration * 1000).toFixed(2)}ms)`);

    res.status(response.status);

    const headersToForward = ["content-type", "content-length"];
    headersToForward.forEach((header) => {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    });

    res.json(response.data);
  } catch (error) {
    logger.error("Proxy error", {
      message: error.message,
      code: error.code,
      url: targetUrl,
    });

    captureException(error);

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNREFUSED") {
        logger.error(`Connection refused to ${targetUrl}`);
        res.status(503).json({
          error: "Backend service unavailable",
          message: "The backend service is currently unavailable. Please try again later.",
        });
        return;
      } else if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
        logger.error(`Timeout connecting to ${targetUrl}`);
        res.status(504).json({
          error: "Backend service timeout",
          message: "The backend service did not respond in time. Please try again later.",
        });
        return;
      } else if (error.response) {
        res.status(error.response.status).json(error.response.data);
        return;
      }
    }

    if (!res.headersSent) {
      res.status(502).json({ error: "bad gateway" });
    } else {
      next(error);
    }
  }
}

// Metrics endpoint
app.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain");
  res.end(getMetrics());
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "gateway",
    timestamp: new Date().toISOString(),
    backend: backendUrl,
  });
});

// Proxy all /api requests to backend
app.all("/api/*", proxyRequest);

// Sentry error handler must be after other middleware
app.use(getSentryErrorHandler());

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
  });

  captureException(err);

  if (!res.headersSent) {
    res.status(500).json({
      error: "Internal server error",
      message: env.nodeEnv === "production" ? "An error occurred" : err.message,
    });
  }
});

app.listen(gatewayPort, () => {
  logger.info(`Gateway listening on port ${gatewayPort}`, {
    port: gatewayPort,
    backendUrl: backendUrl,
    environment: env.nodeEnv,
  });
});
