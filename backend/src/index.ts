import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import productsRouter from "./routes/products";
import { envConfig } from "./config/envConfig";
import { connectDB } from "./config/db";
import { initializeSentry, getSentryRequestHandler, getSentryErrorHandler } from "./config/monitoring";
import { logger } from "./config/logger";
import { getMetrics } from "./config/prometheus";

const app = express();

// Initialize Sentry
initializeSentry();

// Sentry request handler must be first
if (envConfig.sentry.dsn) {
  app.use(getSentryRequestHandler());
}

app.use(cors());
app.use(express.json());

// Request logger middleware
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  logger.info(`${req.method} ${req.path}`, { timestamp, method: req.method, path: req.path });
  next();
});

// MongoDB settings
mongoose.set("strictQuery", false);

// Metrics endpoint
app.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain");
  res.end(getMetrics());
});

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "backend", timestamp: new Date().toISOString() });
});

// Start application
async function start(): Promise<void> {
  try {
    await connectDB();
    logger.info("Connected to MongoDB");

    app.use("/api/products", productsRouter);

    app.listen(envConfig.port, () => {
      logger.info(`Backend listening on port ${envConfig.port}`);
    });
  } catch (error) {
    logger.error("Failed to start backend", { error });
    if (envConfig.sentry.dsn) {
      getSentryErrorHandler();
    }
    process.exit(1);
  }
}

// Sentry error handler must be after other middleware
if (envConfig.sentry.dsn) {
  app.use(getSentryErrorHandler());
}

start();
