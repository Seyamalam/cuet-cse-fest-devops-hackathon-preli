import { Client } from '@elastic/elasticsearch';

// =============================================================================
// Elasticsearch Client Configuration
// =============================================================================
// Critical Infrastructure Logging
// =============================================================================

const elasticsearchUrl = process.env.ELASTICSEARCH_URL || 'http://elasticsearch:9200';

let esClient: Client | null = null;

/**
 * Initialize Elasticsearch client
 */
export const initElasticsearch = async (): Promise<Client | null> => {
  if (!process.env.ELASTICSEARCH_URL) {
    console.warn('⚠️  ELASTICSEARCH_URL not configured - centralized logging disabled');
    return null;
  }

  try {
    esClient = new Client({
      node: elasticsearchUrl,
      maxRetries: 3,
      requestTimeout: 30000,
    });

    // Test connection
    const health = await esClient.cluster.health({});
    console.log(`✅ Elasticsearch connected - cluster status: ${health.status}`);

    // Create index template for logs
    await createLogIndexTemplate();

    return esClient;
  } catch (error) {
    console.error('❌ Failed to connect to Elasticsearch:', error);
    return null;
  }
};

/**
 * Create index template for application logs
 */
const createLogIndexTemplate = async (): Promise<void> => {
  if (!esClient) return;

  try {
    await esClient.indices.putIndexTemplate({
      name: 'app-logs-template',
      index_patterns: ['logs-*'],
      template: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          'index.lifecycle.name': 'logs-policy',
        },
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            level: { type: 'keyword' },
            message: { type: 'text' },
            service: { type: 'keyword' },
            environment: { type: 'keyword' },
            requestId: { type: 'keyword' },
            userId: { type: 'keyword' },
            method: { type: 'keyword' },
            path: { type: 'keyword' },
            statusCode: { type: 'integer' },
            duration: { type: 'float' },
            error: {
              properties: {
                message: { type: 'text' },
                stack: { type: 'text' },
                code: { type: 'keyword' },
              },
            },
            metadata: { type: 'object', enabled: false },
          },
        },
      },
    });
    console.log('✅ Elasticsearch log index template created');
  } catch (error) {
    // Template might already exist
    console.warn('ℹ️  Could not create index template:', (error as Error).message);
  }
};

/**
 * Log entry interface
 */
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service?: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Send log entry to Elasticsearch
 */
export const sendLog = async (entry: LogEntry): Promise<void> => {
  if (!esClient) return;

  const indexName = `logs-${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}`;

  try {
    await esClient.index({
      index: indexName,
      document: {
        '@timestamp': new Date().toISOString(),
        service: 'backend',
        environment: process.env.NODE_ENV || 'development',
        ...entry,
      },
    });
  } catch (error) {
    console.error('Failed to send log to Elasticsearch:', error);
  }
};

/**
 * Create a logger instance
 */
export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => {
    console.debug(message, metadata);
    sendLog({ level: 'debug', message, metadata });
  },
  info: (message: string, metadata?: Record<string, unknown>) => {
    console.info(message, metadata);
    sendLog({ level: 'info', message, metadata });
  },
  warn: (message: string, metadata?: Record<string, unknown>) => {
    console.warn(message, metadata);
    sendLog({ level: 'warn', message, metadata });
  },
  error: (message: string, error?: Error, metadata?: Record<string, unknown>) => {
    console.error(message, error);
    sendLog({
      level: 'error',
      message,
      error: error ? {
        message: error.message,
        stack: error.stack,
        code: (error as Error & { code?: string }).code,
      } : undefined,
      metadata,
    });
  },
};

/**
 * Get Elasticsearch client
 */
export const getEsClient = (): Client | null => esClient;
