const winston = require("winston");
const ElasticsearchTransport = require("winston-elasticsearch");
const env = require("./env");

function createLogger() {
  const logger = winston.createLogger({
    level: env.logging.level,
    format: winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        return JSON.stringify({
          timestamp,
          level,
          message,
          service: "gateway",
          ...metadata,
        });
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ timestamp, level, message, ...metadata }) =>
              `${timestamp} [${level}] ${message} ${
                Object.keys(metadata).length ? JSON.stringify(metadata) : ""
              }`
          )
        ),
      }),
    ],
    defaultMeta: { service: "gateway" },
  });

  if (env.elasticsearch.enabled) {
    try {
      const esTransport = new ElasticsearchTransport({
        level: "info",
        clientOpts: { node: env.elasticsearch.url },
        index: "gateway-logs",
        dataStream: true,
      });
      logger.add(esTransport);
    } catch (error) {
      logger.warn("Failed to connect to Elasticsearch for logging", { error });
    }
  }

  return logger;
}

module.exports = {
  logger: createLogger(),
};
