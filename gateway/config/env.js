require("dotenv").config();

module.exports = {
  port: parseInt(process.env.GATEWAY_PORT || "5921", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  backendUrl: process.env.BACKEND_URL || "http://backend:3847",

  sentry: {
    dsn: process.env.SENTRY_DSN_GATEWAY || "",
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  },

  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200",
    enabled: true,
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
};
