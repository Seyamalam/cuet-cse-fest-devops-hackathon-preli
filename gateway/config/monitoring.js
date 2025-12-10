const Sentry = require("@sentry/node");
const env = require("./env");

function initializeSentry() {
  if (env.sentry.dsn) {
    Sentry.init({
      dsn: env.sentry.dsn,
      environment: env.sentry.environment,
      tracesSampleRate: env.sentry.tracesSampleRate,
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

module.exports = {
  initializeSentry,
  getSentryRequestHandler: () =>
    env.sentry.dsn ? Sentry.Handlers.requestHandler() : (req, res, next) => next(),
  getSentryErrorHandler: () =>
    env.sentry.dsn ? Sentry.Handlers.errorHandler() : (err, req, res, next) => next(err),
  captureException: (error) => {
    if (env.sentry.dsn) {
      Sentry.captureException(error);
    }
  },
};
