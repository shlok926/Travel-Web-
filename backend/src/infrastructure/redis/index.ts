import { Redis } from 'ioredis';
import { EnvConfig } from '../../config/env.js';

export class RedisService {
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly config: EnvConfig) {}

  public get isReady(): boolean {
    return this.isConnected;
  }

  public getClient(): Redis {
    if (!this.client) {
      this.client = new Redis({
        host: this.config.REDIS_HOST,
        port: this.config.REDIS_PORT,
        password: this.config.REDIS_PASSWORD || undefined,
        db: this.config.REDIS_DB,
        maxRetriesPerRequest: null, // Required for BullMQ
        enableReadyCheck: true,
        lazyConnect: true,
        retryStrategy: (times: number) => {
          if (times > 5) {
            // Stop aggressive retrying in offline dev mode
            return 5000;
          }
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
      });

      this.client.on('error', () => {
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    }

    return this.client;
  }

  public async connect(): Promise<void> {
    const client = this.getClient();
    if (client.status === 'wait') {
      try {
        await client.connect();
        this.isConnected = true;
      } catch {
        this.isConnected = false;
      }
    }
  }

  public async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    latencyMs: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const client = this.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      const response = await client.ping();
      const healthy = response === 'PONG';
      this.isConnected = healthy;
      return {
        status: healthy ? 'healthy' : 'unhealthy',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      this.isConnected = false;
      const errorMessage = err instanceof Error ? err.message : 'Unknown Redis error';
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: errorMessage,
      };
    }
  }

  public async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      } finally {
        this.client = null;
        this.isConnected = false;
      }
    }
  }
}
