import { Queue, Worker, Job } from 'bullmq';
import { WorkerEnvConfig } from '../config/workerEnv.js';

export const SMOKE_QUEUE_NAME = 'infrastructure-smoke-queue';

export interface SmokeJobData {
  testId: string;
  timestamp: string;
}

export interface SmokeJobResult {
  processed: boolean;
  testId: string;
  completedAt: string;
}

export function createSmokeQueue(config: WorkerEnvConfig): Queue<SmokeJobData, SmokeJobResult> {
  return new Queue<SmokeJobData, SmokeJobResult>(SMOKE_QUEUE_NAME, {
    connection: {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB,
    },
  });
}

export function createSmokeWorker(
  config: WorkerEnvConfig,
  onProcessed?: (job: Job<SmokeJobData, SmokeJobResult>) => void,
): Worker<SmokeJobData, SmokeJobResult> {
  return new Worker<SmokeJobData, SmokeJobResult>(
    SMOKE_QUEUE_NAME,
    async (job: Job<SmokeJobData, SmokeJobResult>) => {
      // Infrastructure smoke test task execution
      const result: SmokeJobResult = {
        processed: true,
        testId: job.data.testId,
        completedAt: new Date().toISOString(),
      };

      if (onProcessed) {
        onProcessed(job);
      }

      return result;
    },
    {
      connection: {
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        db: config.REDIS_DB,
      },
      concurrency: config.WORKER_CONCURRENCY,
    },
  );
}
