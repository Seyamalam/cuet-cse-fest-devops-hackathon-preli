import winston, { Logger, format, transports } from "winston";
import ElasticsearchTransport from "winston-elasticsearch";
import { envConfig } from "./envConfig";

function createLogger(): Logger {
  const logger = winston.createLogger({
    level: envConfig.logging.level,
    format: format.combine(
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      format.errors({ stack: true }),
      format.json(),
      format.printf(({ timestamp, level, message, ...metadata }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          service: "backend",
          ...metadata,
        });
      })
    ),
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.printf(
            ({ timestamp, level, message, ...metadata }) =>
              `${timestamp} [${level}] ${message} ${
                Object.keys(metadata).length ? JSON.stringify(metadata) : ""
              }`
          )
        ),
      }),
    ],
    defaultMeta: { service: "backend" },
  });

  if (envConfig.elasticsearch.enabled) {
    try {
      const esTransport = new ElasticsearchTransport({
        level: "info",
        clientOpts: { node: envConfig.elasticsearch.url },
        index: "backend-logs",
        dataStream: true,
      });
      logger.add(esTransport);
    } catch (error) {
      logger.warn("Failed to connect to Elasticsearch for logging", { error });
    }
  }

  return logger;
}

export const logger = createLogger();
