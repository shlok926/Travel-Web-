import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { EnvConfig, loadEnv } from './config/env.js';
import { DatabaseService } from './infrastructure/database/index.js';
import { RedisService } from './infrastructure/redis/index.js';
import { StorageFactory, IStorageService } from './infrastructure/storage/index.js';
import { UserRepository } from './modules/auth/repositories/user.repository.js';
import { loggingPlugin } from './plugins/logging.js';
import { securityPlugin } from './plugins/security.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/errorHandler.js';
import { apiRoutes } from './routes/index.js';

export interface AppDependencies {
  config?: EnvConfig;
  db?: DatabaseService;
  redis?: RedisService;
  storage?: IStorageService;
  userRepo?: UserRepository;
}

export async function createApp(dependencies: AppDependencies = {}): Promise<{
  app: FastifyInstance;
  db: DatabaseService;
  redis: RedisService;
  storage: IStorageService;
  config: EnvConfig;
}> {
  const config = dependencies.config ?? loadEnv();

  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'body.password',
                'body.passwordConfirmation',
                'body.cardNumber',
                'body.cvv',
              ],
              censor: '[REDACTED]',
            },
          },
    requestTimeout: 15000,
  });

  // Instantiate Infrastructure Services
  const db = dependencies.db ?? new DatabaseService(config);
  const redis = dependencies.redis ?? new RedisService(config);
  const storage = dependencies.storage ?? StorageFactory.create(config);
  const userRepo = dependencies.userRepo ?? new UserRepository(db);

  // Register Core Middleware Plugins
  await app.register(loggingPlugin, { config });
  await app.register(securityPlugin, { config });
  await app.register(authPlugin, { userRepo, config });
  await app.register(errorHandlerPlugin);

  // Register Static File Serving for Frontend UI
  const frontendPath = path.resolve(process.cwd(), 'frontend');
  await app.register(fastifyStatic, {
    root: frontendPath,
    prefix: '/',
  });

  // Register API Routes under /api/v1
  await app.register(apiRoutes, {
    prefix: '/api/v1',
    db,
    redis,
    storage,
  });

  return { app, db, redis, storage, config };
}
