import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import productsRouter from './routes/products';
import { envConfig } from './config/envConfig';
import { connectDB } from './config/db';
import { metricsMiddleware, metricsHandler } from './config/metrics';
import {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  errorHandler,
} from './config/sentry';
import { initElasticsearch, logger } from './config/elasticsearch';
import { initMinIO } from './config/minio';

// =============================================================================
// E-commerce Backend Service
// =============================================================================
// Critical Infrastructure - Express API with full observability
// =============================================================================

const app = express();

// Initialize Sentry first (must be before other middleware)
initSentry(app);

// Sentry request and tracing handlers (must be first)
app.use(sentryRequestHandler);
app.use(sentryTracingHandler);

// CORS configuration
app.use(cors());

// JSON parsing
app.use(express.json({ limit: '10mb' }));

// Prometheus metrics middleware
app.use(metricsMiddleware);

// Request logger middleware with structured logging
app.use((req, res, next) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Log request
  console.log(`[${timestamp}] ${req.method} ${req.path}`);

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
});

// MongoDB strictQuery setting
mongoose.set('strictQuery', false);

// =============================================================================
// Startup Function
// =============================================================================
async function start(): Promise<void> {
  console.log('🚀 Starting Backend Service...');
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize external services (non-blocking)
  const initPromises = [
    initElasticsearch().catch((err) => {
      console.warn('⚠️  Elasticsearch initialization failed:', err.message);
      return null;
    }),
    initMinIO().catch((err) => {
      console.warn('⚠️  MinIO initialization failed:', err.message);
      return null;
    }),
  ];

  // Connect to database (required)
  await connectDB();

  // Wait for optional services
  await Promise.all(initPromises);

  // ==========================================================================
  // Routes
  // ==========================================================================

  // Prometheus metrics endpoint
  app.get('/api/metrics', metricsHandler);

  // Health check endpoint with database status
  app.get('/api/health', async (_req, res) => {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const healthy = mongoStatus === 'connected';

    res.status(healthy ? 200 : 503).json({
      ok: healthy,
      timestamp: new Date().toISOString(),
      service: 'backend',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      database: {
        status: mongoStatus,
      },
    });
  });

  // Readiness probe
  app.get('/api/ready', async (_req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    res.status(mongoReady ? 200 : 503).json({ ready: mongoReady });
  });

  // Liveness probe
  app.get('/api/live', (_req, res) => {
    res.json({ alive: true });
  });

  // Product routes
  app.use('/api/products', productsRouter);

  // ==========================================================================
  // Error Handlers (must be after routes)
  // ==========================================================================

  // Sentry error handler
  app.use(sentryErrorHandler);

  // Custom error handler
  app.use(errorHandler);

  // ==========================================================================
  // Start Server
  // ==========================================================================
  const server = app.listen(envConfig.port, () => {
    console.log(`✅ Backend listening on port ${envConfig.port}`);
    console.log(`📊 Metrics available at /api/metrics`);
    console.log(`💓 Health check at /api/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);

    server.close(async () => {
      console.log('🔌 HTTP server closed');

      try {
        await mongoose.connection.close();
        console.log('🍃 MongoDB connection closed');
      } catch (err) {
        console.error('Error closing MongoDB:', err);
      }

      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the application
start().catch((err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});

