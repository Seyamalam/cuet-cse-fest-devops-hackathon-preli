import * as Sentry from "@sentry/node";
import { envConfig } from "./envConfig";

export function initializeSentry() {
  if (envConfig.sentry.dsn) {
    Sentry.init({
      dsn: envConfig.sentry.dsn,
      environment: envConfig.sentry.environment,
      tracesSampleRate: envConfig.sentry.tracesSampleRate,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({
          request: true,
          serverName: true,
          transaction: true,
        }),
      ],
    });
  }
}

export function getSentryRequestHandler() {
  return Sentry.Handlers.requestHandler();
}

export function getSentryErrorHandler() {
  return Sentry.Handlers.errorHandler();
}

export function captureException(error: Error | unknown) {
  if (envConfig.sentry.dsn) {
    Sentry.captureException(error);
  }
}
