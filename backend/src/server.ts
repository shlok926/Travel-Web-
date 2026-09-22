import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

async function startServer(): Promise<void> {
  const config = loadEnv();
  const { app, db, redis } = await createApp({ config });

  // Graceful Shutdown Handler
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Initiating graceful shutdown...`);

    try {
      await app.close();
      app.log.info('HTTP server closed.');

      await db.close();
      app.log.info('Database pool closed.');

      await redis.close();
      app.log.info('Redis connection closed.');

      app.log.info('Graceful shutdown completed successfully.');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error occurred during graceful shutdown.');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    const address = await app.listen({
      port: config.PORT,
      host: config.HOST,
    });

    app.log.info(`🚀 Young Tours & Travels API server running at ${address}`);
    app.log.info(`👉 Health check endpoint: ${address}/api/v1/health`);
    app.log.info(`👉 Readiness check endpoint: ${address}/api/v1/ready`);
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start API server.');
    process.exit(1);
  }
}

// Start server if executed directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  void startServer();
}

export { startServer };
