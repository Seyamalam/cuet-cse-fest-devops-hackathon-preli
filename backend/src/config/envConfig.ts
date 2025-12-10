import dotenv from "dotenv";

dotenv.config();

export const envConfig = {
  port: parseInt(process.env.BACKEND_PORT || "3847", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  
  mongo: {
    uri: process.env.MONGO_URI || "",
    dbName: process.env.MONGO_DATABASE || "ecommerce",
  },

  sentry: {
    dsn: process.env.SENTRY_DSN_BACKEND || "",
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  },

  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200",
    enabled: true,
  },

  prometheus: {
    port: parseInt(process.env.PROMETHEUS_PORT || "9090", 10),
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || "http://minio:9000",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    bucket: process.env.MINIO_BUCKET || "ecommerce",
    region: "us-east-1",
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
} as const;
