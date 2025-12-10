import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Express, Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';

// =============================================================================
// Sentry Error Tracking Configuration
// =============================================================================
// Critical Infrastructure Error Monitoring
// =============================================================================

/**
 * Initialize Sentry error tracking
 */
export const initSentry = (app: Express): void => {
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('⚠️  SENTRY_DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Profiling
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Integrations
    integrations: [
      // Express integration
      new Sentry.Integrations.Express({ app }),
      
      // HTTP integration
      new Sentry.Integrations.Http({ tracing: true }),
      
      // MongoDB integration
      new Sentry.Integrations.Mongo(),
      
      // Profiling integration
      new ProfilingIntegration(),
    ],
    
    // Filter sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
    
    // Ignore specific errors
    ignoreErrors: [
      'HealthCheckError',
      'ECONNRESET',
      'ECONNREFUSED',
    ],
  });

  console.log('✅ Sentry error tracking initialized');
};

/**
 * Sentry request handler - must be first middleware
 */
export const sentryRequestHandler: RequestHandler = Sentry.Handlers.requestHandler();

/**
 * Sentry tracing handler - after request handler
 */
export const sentryTracingHandler: RequestHandler = Sentry.Handlers.tracingHandler();

/**
 * Sentry error handler - must be before other error handlers
 */
export const sentryErrorHandler: ErrorRequestHandler = Sentry.Handlers.errorHandler();

/**
 * Custom error handler for logging and response
 */
export const errorHandler = (
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    status: err.status,
  });

  const status = err.status || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

/**
 * Capture a message in Sentry
 */
export const captureMessage = (message: string, level: Sentry.SeverityLevel = 'info'): void => {
  Sentry.captureMessage(message, level);
};

/**
 * Capture an exception in Sentry
 */
export const captureException = (error: Error, context?: Record<string, unknown>): void => {
  Sentry.captureException(error, {
    extra: context,
  });
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (
  message: string,
  category: string,
  data?: Record<string, unknown>
): void => {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
};
