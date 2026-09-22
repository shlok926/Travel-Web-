import pino from 'pino';
import { loadWorkerEnv } from './config/workerEnv.js';
import { createSmokeWorker } from './queues/smokeQueue.js';

async function startWorker(): Promise<void> {
  const config = loadWorkerEnv();
  const logger = pino({ level: config.LOG_LEVEL });

  logger.info('⚙️ Starting Young Tours & Travels Asynchronous Worker...');

  const smokeWorker = createSmokeWorker(config, (job) => {
    logger.info({ jobId: job.id, testId: job.data.testId }, 'Processed smoke test job');
  });

  smokeWorker.on('completed', (job) => {
    logger.debug({ jobId: job?.id }, 'Job completed successfully');
  });

  smokeWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job processing failed');
  });

  smokeWorker.on('error', (err) => {
    logger.error({ err }, 'Worker internal error');
  });

  logger.info('🚀 Worker process initialized and listening for jobs.');

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully stopping worker...`);
    try {
      await smokeWorker.close();
      logger.info('Worker closed gracefully.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  void startWorker();
}

export { startWorker };
